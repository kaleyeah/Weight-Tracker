/* Commit 10 — multi-tab, reload and account-switch evidence in real Chromium.
   Two release gates the string suites cannot reach:

   The unit suite models Web Locks with a process-wide Map. That stub is a
   faithful queue, but it is still my code standing in for the browser's, and
   the whole safety argument for the recovery writer rests on the real
   primitive. Here two genuine tabs contend for the real navigator.locks, over
   the real localStorage, on one origin.

   Reload and account switch are the other half: an artifact that verifies in
   the session that wrote it proves nothing about the session that has to read
   it back, which is precisely when an athlete needs it. */
const { boot, newTab, switchAccount, focused } = require('./driver');
const { section, test, ok, notOk, eq, summary } = require('./harness');

const SUB = 'core';

(async () => {
  const b = await boot();
  const A = b.page;

  /* Everything below drives the app's own store. Helpers, not reimplementations. */
  const write = (page, id, serverRev, payload) => page.evaluate((s) => new Promise((res) => {
    cfCasRecWrite(s.id, 'core', s.serverRev, JSON.stringify(s.payload),
      (okW, man) => res({ ok: okW, man: man || null }));
  }), { id, serverRev, payload });

  const read = (page, id, serverRev) => page.evaluate((s) => new Promise((res) => {
    cfCasRecRead(s.id, { account: pbUid(), sub: 'core', serverRev: s.serverRev, rec: s.id },
      (payload, why) => res({ payload, why: why || null }));
  }), { id, serverRev });

  const newId = (page) => page.evaluate(() => cfCasRecNewId('core'));

  /* ------------------------------------------------------- multi-tab */
  section('Two real tabs, one origin, the real Web Locks (MC-01..08)');

  const B = await newTab(b);

  await test('MC-01 the second tab is genuinely the same origin and storage partition', async () => {
    const seen = await A.evaluate(() => {
      localStorage.setItem('cf:mc-probe', 'from-A');
      return { origin: location.origin, locks: typeof navigator.locks };
    });
    const fromB = await B.evaluate(() => ({
      probe: localStorage.getItem('cf:mc-probe'),
      origin: location.origin,
      locks: typeof navigator.locks,
    }));
    eq(fromB.origin, seen.origin);
    eq(fromB.probe, 'from-A', 'separate storage partitions would make every later test vacuous');
    eq(seen.locks, 'object');
    eq(fromB.locks, 'object', 'and the real lock manager, not the unit stub');
    await A.evaluate(() => localStorage.removeItem('cf:mc-probe'));
  });

  await test('MC-02 two tabs racing for ONE record id: exactly one wins, cleanly', async () => {
    const id = await newId(A);
    /* Both tabs are released at once on the SAME id. I expected both to
       succeed with a last-writer-wins outcome; the store is stricter than that
       and refuses to overwrite a claimed id at all. That is the better
       property — a record id is claimed once and its bytes never change under
       a reader — so the assertion was wrong, not the code. */
    const [ra, rb] = await Promise.all([
      write(A, id, 5, { from: 'A', weights: [1, 2, 3] }),
      write(B, id, 5, { from: 'B', weights: [4, 5, 6] }),
    ]);
    const winners = [ra, rb].filter((r) => r.ok);
    const losers = [ra, rb].filter((r) => !r.ok);
    eq(winners.length, 1, 'exactly one writer may claim an id');
    eq(losers.length, 1);
    eq(losers[0].man, 'exists', 'and the loser is refused explicitly, not silently');

    const got = await read(A, id, 5);
    ok(got.payload !== null, 'the surviving artifact must verify: ' + got.why);
    const parsed = JSON.parse(got.payload);
    ok(parsed.from === 'A' || parsed.from === 'B', 'and be one whole writer, not a blend');
    eq(JSON.stringify(parsed.weights),
      parsed.from === 'A' ? JSON.stringify([1, 2, 3]) : JSON.stringify([4, 5, 6]),
      'payload and manifest must come from the SAME writer');
  });

  await test('MC-02b a claimed id stays claimed — no later write can replace those bytes', async () => {
    const id = await newId(A);
    ok((await write(A, id, 5, { original: true })).ok);
    const again = await write(B, id, 5, { original: false });
    notOk(again.ok);
    eq(again.man, 'exists');
    const got = await read(A, id, 5);
    eq(JSON.parse(got.payload).original, true, 'the first artifact must be untouched');
  });

  await test('MC-02c two tabs writing DIFFERENT ids at once both succeed and both verify', async () => {
    /* The realistic race: ids carry 128 bits of entropy, so real tabs never
       collide on one. What they do is contend for the lock manager while
       writing their own records. */
    const [idA, idB] = await Promise.all([newId(A), newId(B)]);
    notOk(idA === idB, 'independently generated ids must not collide');
    const [ra, rb] = await Promise.all([
      write(A, idA, 9, { tab: 'A' }),
      write(B, idB, 9, { tab: 'B' }),
    ]);
    ok(ra.ok && rb.ok, 'both should complete: ' + JSON.stringify([ra.man, rb.man]));
    const [gotA, gotB] = await Promise.all([read(B, idA, 9), read(A, idB, 9)]);
    eq(JSON.parse(gotA.payload).tab, 'A', 'tab B must be able to verify tab A\'s record');
    eq(JSON.parse(gotB.payload).tab, 'B', 'and vice versa');
  });

  await test('MC-03 a tab-A artifact verifies in tab B against the real digest', async () => {
    const id = await newId(A);
    const w = await write(A, id, 11, { weights: [{ date: '2026-07-01', weight: 80 }] });
    ok(w.ok);
    const inB = await read(B, id, 11);
    ok(inB.payload !== null, 'tab B could not verify tab A\'s artifact: ' + inB.why);
    eq(JSON.parse(inB.payload).weights[0].weight, 80);
  });

  await test('MC-04 tab B cannot verify it against the wrong revision', async () => {
    const id = await newId(A);
    ok((await write(A, id, 11, { x: 1 })).ok);
    const wrong = await read(B, id, 12);
    eq(wrong.payload, null, 'a manifest bound to rev 11 must not satisfy rev 12');
    ok(wrong.why, 'and it must say why: ' + wrong.why);
  });

  await test('MC-05 a purge in one tab does not leave the other reading a torn record', async () => {
    const id = await newId(A);
    ok((await write(A, id, 3, { keep: true })).ok);
    const [, after] = await Promise.all([
      A.evaluate((i) => new Promise((res) => cfCasRecPurge(i, res)), id),
      read(B, id, 3),
    ]);
    /* Either the whole artifact was still there, or it was wholly gone. What
       must never happen is a payload that verifies against a stale manifest. */
    ok(after.payload === null || JSON.parse(after.payload).keep === true,
      'a concurrent purge must not expose a partial artifact');
    const settled = await read(B, id, 3);
    eq(settled.payload, null, 'and once purged it stays purged in both tabs');
  });

  await test('MC-06 concurrent ledger updates from both tabs lose nothing', async () => {
    const ids = await A.evaluate(() => {
      const out = [];
      for (let i = 0; i < 6; i++) out.push(cfCasRecNewId('core'));
      return out;
    });
    const scope = await A.evaluate(() => cfCasRecScope());
    /* Six tracked purges, three from each tab, all racing on one ledger. A
       read-modify-write without a lock loses entries here. */
    await Promise.all([
      A.evaluate((s) => Promise.all(s.ids.slice(0, 3).map((id) =>
        new Promise((res) => cfCasRecPurgeTracked(s.scope, id, res)))), { ids, scope }),
      B.evaluate((s) => Promise.all(s.ids.slice(3).map((id) =>
        new Promise((res) => cfCasRecPurgeTracked(s.scope, id, res)))), { ids, scope }),
    ]);
    const pending = await A.evaluate(() => cfCasRecPendingCleanup());
    /* Every id either purged cleanly or is recorded for retry. None may vanish
       silently — that is the whole point of the ledger. */
    const listed = await A.evaluate(() => cfCasRecList());
    ids.forEach((id) => {
      const tracked = pending.indexOf(id) >= 0;
      const present = listed.indexOf(id) >= 0;
      ok(tracked || !present, id + ' was neither removed nor recorded for retry');
    });
  });

  await test('MC-07 the ledger never holds anything but well-formed record ids', async () => {
    const pending = await A.evaluate(() => cfCasRecPendingCleanup());
    pending.forEach((id) =>
      ok(/^casrec-(core|training)-[0-9a-f]{32}$/.test(id), 'malformed ledger entry: ' + id));
  });

  await test('MC-08 a conflict raised in one tab is visible to the other after reconcile', async () => {
    const id = await newId(A);
    ok((await write(A, id, 21, { shared: true })).ok);
    await A.evaluate((i) => { cfCasSetServerRev('core', 21); cfCasSetConflictId('core', i); }, id);
    /* Tab B re-reads its own persisted state the way a reload would. */
    const inB = await B.evaluate(() => ({
      conflictId: cfCasConflictId('core'),
      serverRev: cfCasServerRev('core'),
      hasWorkflow: cfCasCentreHasWorkflow(),
      severity: cfCasCentreSeverity(),
    }));
    eq(inB.conflictId, id, 'conflict state is storage-backed, so both tabs agree');
    eq(inB.serverRev, 21);
    ok(inB.hasWorkflow);
    eq(inB.severity, 'warn');
    const verified = await read(B, id, 21);
    ok(verified.payload !== null, 'and the artifact behind it verifies in tab B too');
  });

  await B.close();

  /* --------------------------------------------------------- reload */
  section('Reload (MC-09..13)');

  let reloadId = null;

  await test('MC-09 a conflict survives a real reload', async () => {
    reloadId = await newId(A);
    ok((await write(A, reloadId, 31, { weights: [{ date: '2026-06-01', weight: 79.5 }] })).ok);
    await A.evaluate((i) => { cfCasSetServerRev('core', 31); cfCasSetConflictId('core', i); }, reloadId);
    await A.reload({ waitUntil: 'load' });
    await A.waitForFunction(() => document.documentElement.style.visibility !== 'hidden');
    const after = await A.evaluate(() => ({
      conflictId: cfCasConflictId('core'),
      serverRev: cfCasServerRev('core'),
      status: cfCasCompactStatus(),
      hasWorkflow: cfCasCentreHasWorkflow(),
    }));
    eq(after.conflictId, reloadId, 'STATUS-05: conflict status persists across reload');
    eq(after.serverRev, 31);
    eq(after.status, 'conflict');
    ok(after.hasWorkflow);
  });

  await test('MC-10 the artifact still verifies in the new session', async () => {
    const got = await read(A, reloadId, 31);
    ok(got.payload !== null, 'an artifact that only verifies in its own session is useless: ' + got.why);
    eq(JSON.parse(got.payload).weights[0].weight, 79.5);
  });

  await test('MC-11 the centre is reachable from the header after a reload', async () => {
    const dot = await A.$('[data-act="syncdot"]');
    ok(dot, 'the header control must exist in the fresh session');
    await dot.click();
    const res = await A.evaluate(() => ({
      open: CF_CAS_OPEN,
      cards: [...document.querySelectorAll('.cf-conflict-card h3')].map((h) => h.textContent.trim()),
      label: document.querySelector('[data-act="syncdot"]').getAttribute('aria-label'),
    }));
    ok(res.open);
    eq(res.cards.join(','), 'Health & progress');
    eq(res.label, 'Sync needs your choice');
    const f = await focused(A);
    eq(f.id, 'cf-conflict-heading');
    await A.evaluate(() => cfCasCloseConflictCenter());
  });

  await test('MC-12 a recovery block does NOT survive reload as a phantom', async () => {
    /* The block is in-memory session state; the conflict id is storage-backed.
       After a reload the subsystem must be driven by what is actually stored,
       not by a stale failure from a session that no longer exists. */
    await A.evaluate(() => cfCasSetBlock('core', 'recovery', 'tok'));
    await A.reload({ waitUntil: 'load' });
    await A.waitForFunction(() => document.documentElement.style.visibility !== 'hidden');
    const after = await A.evaluate(() => ({
      block: CF_CAS_BLOCK.core,
      conflictId: cfCasConflictId('core'),
      severity: cfCasCentreSeverity(),
    }));
    eq(after.block, null, 'a session-local failure must not be resurrected as fact');
    eq(after.conflictId, reloadId, 'while the durable conflict is still there');
    eq(after.severity, 'warn', 'so the athlete sees a decision, not a phantom error');
  });

  await test('MC-13 the artifact remains verifiable across two reloads', async () => {
    const got = await read(A, reloadId, 31);
    ok(got.payload !== null, 'second reload lost verification: ' + got.why);
  });

  /* ------------------------------------------------ account switch */
  section('Account switch (MC-14..18)');

  await test('MC-14 another account cannot read this account\'s recovery artifact', async () => {
    await switchAccount(A, 'userB');
    const got = await read(A, reloadId, 31);
    eq(got.payload, null, 'health data must not cross accounts');
    ok(got.why, 'and the refusal must be explicit: ' + got.why);
  });

  await test('MC-15 the other account sees none of it listed', async () => {
    const listed = await A.evaluate(() => cfCasRecList());
    eq(listed.indexOf(reloadId), -1, 'userA\'s artifact must not appear in userB\'s list');
  });

  await test('MC-16 the other account writes into its own namespace', async () => {
    const id = await newId(A);
    ok((await write(A, id, 4, { owner: 'B' })).ok);
    const keys = await A.evaluate(() => Object.keys(localStorage).filter((k) => /casrec/.test(k)));
    const scopes = new Set(keys.map((k) => (k.split(':')[2] || '')));
    ok(scopes.has('userB'), 'userB should have written under its own scope: ' + [...scopes]);
    ok(scopes.has('userA'), 'and userA\'s artifact should still exist, untouched');
  });

  await test('MC-17 switching back restores the original account\'s conflict intact', async () => {
    await switchAccount(A, 'userA', 'a@x.com');
    const got = await read(A, reloadId, 31);
    ok(got.payload !== null, 'the athlete\'s own copy must come back: ' + got.why);
    eq(JSON.parse(got.payload).weights[0].weight, 79.5);
  });

  await test('MC-18 a purge as the wrong account removes nothing of the right one', async () => {
    await switchAccount(A, 'userB');
    await A.evaluate((i) => new Promise((res) => cfCasRecPurge(i, res)), reloadId);
    await switchAccount(A, 'userA', 'a@x.com');
    const got = await read(A, reloadId, 31);
    ok(got.payload !== null,
      'a purge issued by another account must not reach this one: ' + got.why);
  });

  section('Page health');

  await test('no uncaught error in any tab across the whole run', () => {
    const real = b.pageErrors.filter((e) =>
      !/ERR_(NAME_NOT_RESOLVED|FAILED|ABORTED|INTERNET_DISCONNECTED)/.test(e));
    eq(real.length, 0, real.join(' | '));
  });

  const failed = summary('multi-context.browser.test.js');
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAILURE', e); process.exit(1); });
