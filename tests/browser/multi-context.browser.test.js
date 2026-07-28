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

  /* ---- Architect-required: C10-MC-01..05 ------------------------------
     My MC-06 was vacuous and they caught it. It generated six ids and purged
     them immediately — but never wrote artifacts, so every purge hit a
     nonexistent record, returned the valid "absent" result, and created no
     deletion obligation at all. `tracked || !present` was then trivially true
     for six ids that were never present. The test described concurrent ledger
     contention and exercised none of it.

     This version creates six REAL verified artifacts and then forces the
     deletion itself to fail, which is the only thing that produces a ledger
     obligation. */
  section('C10-MC-01..05 — the cleanup ledger under real concurrent failure');

  /* Make removeItem silently ignore recovery keys, in one tab. purgeScoped
     re-reads after removing and reports what is GONE, so a storage layer that
     quietly drops the removal is detected as "not-removed" — the real-world
     case (quota state, a wrapper, an extension) this ledger exists for. */
  const breakDeletion = (page) => page.evaluate(() => {
    if (window.__origRemove) return;
    window.__origRemove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (k) {
      if (/^cf:casrec:/.test(String(k))) return;      /* silently ignored */
      return window.__origRemove.call(this, k);
    };
  });
  const fixDeletion = (page) => page.evaluate(() => {
    if (!window.__origRemove) return;
    Storage.prototype.removeItem = window.__origRemove;
    window.__origRemove = null;
  });

  let sixIds = [];
  let sixScope = null;

  await test('C10-MC-01 six REAL verified artifacts exist before any purge', async () => {
    sixIds = [];
    for (let i = 0; i < 6; i++) {
      const id = await newId(A);
      const w = await write(A, id, 40 + i, { n: i, weights: [{ date: '2026-01-0' + (i + 1), weight: 70 + i }] });
      ok(w.ok, 'artifact ' + i + ' failed to write: ' + w.man);
      sixIds.push(id);
    }
    sixScope = await A.evaluate(() => cfCasRecScope());
    const listed = await A.evaluate(() => cfCasRecList());
    sixIds.forEach((id, i) => ok(listed.indexOf(id) >= 0, 'artifact ' + i + ' is not listed'));
    /* and each genuinely verifies — "written" is not "verified" */
    for (let i = 0; i < 6; i++) {
      const got = await read(A, sixIds[i], 40 + i);
      ok(got.payload !== null, 'artifact ' + i + ' does not verify: ' + got.why);
    }
  });

  await test('C10-MC-02 forced deletion failure creates six real ledger obligations', async () => {
    await A.evaluate(() => cfCasRecStore.pendingClearForTest && cfCasRecStore.pendingClearForTest());
    await Promise.all([breakDeletion(A), breakDeletion(B)]);
    const results = await Promise.all([
      A.evaluate((s) => Promise.all(s.ids.slice(0, 3).map((id) => new Promise((res) => {
        cfCasRecPurgeTracked(s.scope, id, (okP, why) => res({ okP, why: why || null }));
      }))), { ids: sixIds, scope: sixScope }),
      B.evaluate((s) => Promise.all(s.ids.slice(3).map((id) => new Promise((res) => {
        cfCasRecPurgeTracked(s.scope, id, (okP, why) => res({ okP, why: why || null }));
      }))), { ids: sixIds, scope: sixScope }),
    ]);
    const flat = results.flat();
    eq(flat.length, 6);
    flat.forEach((r, i) => notOk(r.okP, 'purge ' + i + ' unexpectedly succeeded'));
    /* self-check: if deletion did not actually fail, everything below is vacuous
       again — which is exactly how the previous version passed */
    const stillThere = await A.evaluate(() => cfCasRecList());
    sixIds.forEach((id, i) =>
      ok(stillThere.indexOf(id) >= 0, 'artifact ' + i + ' was removed — the failure was not forced'));
  });

  await test('C10-MC-03 concurrent additions from both tabs preserve all six, exactly once', async () => {
    const pending = await A.evaluate(() => cfCasRecPendingCleanup());
    sixIds.forEach((id, i) => {
      const hits = pending.filter((p) => p === id).length;
      eq(hits, 1, 'obligation ' + i + ' appears ' + hits + ' times, expected exactly once');
    });
    pending.forEach((id) =>
      ok(/^casrec-(core|training)-[0-9a-f]{32}$/.test(id), 'malformed ledger entry: ' + id));
    const fromB = await B.evaluate(() => cfCasRecPendingCleanup());
    eq(fromB.slice().sort().join(','), pending.slice().sort().join(','),
      'both tabs must see the same ledger');
  });

  await test('C10-MC-04 a later sweep removes every artifact and every obligation', async () => {
    await Promise.all([fixDeletion(A), fixDeletion(B)]);
    await A.evaluate(() => new Promise((res) => cfCasRecCleanupSweep(res)));
    const listed = await A.evaluate(() => cfCasRecList());
    sixIds.forEach((id, i) => eq(listed.indexOf(id), -1, 'artifact ' + i + ' survived the sweep'));
    const pending = await A.evaluate(() => cfCasRecPendingCleanup());
    sixIds.forEach((id, i) =>
      eq(pending.indexOf(id), -1, 'obligation ' + i + ' survived the sweep'));
  });

  await test('C10-MC-05 both tabs observe the same empty ledger and absent artifacts', async () => {
    const inB = await B.evaluate(() => ({
      pending: cfCasRecPendingCleanup(),
      listed: cfCasRecList(),
    }));
    sixIds.forEach((id, i) => {
      eq(inB.pending.indexOf(id), -1, 'tab B still holds obligation ' + i);
      eq(inB.listed.indexOf(id), -1, 'tab B still lists artifact ' + i);
    });
    /* absence proven by reading, not only by the list */
    for (let i = 0; i < 6; i++) {
      const got = await read(B, sixIds[i], 40 + i);
      eq(got.payload, null, 'artifact ' + i + ' is still readable in tab B');
    }
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

  /* ---- Architect-required: C10-MC-06..17 -------------------------------
     Promise.all is not an interleaving. The writer can finish before the purge
     begins meaningful work, so a green result proves nothing about ordering.
     These tests PAUSE the writer inside its locked publication window and hold
     it there while the other tab acts.

     The pause is a test-only patch of the real crypto.subtle.digest, applied
     from the page. No production code changes for testability: sha256Hex calls
     crypto.subtle.digest at call time, so patching it stops the writer exactly
     where the async publication window is — after the claim and payload are
     staged, before the canonical manifest is written. */
  section('C10-MC-06..09 — purge waits behind an active writer\'s real Web Lock');

  const armPause = (page) => page.evaluate(() => {
    window.__pause = { entered: false, release: null, gate: null };
    window.__pause.gate = new Promise((r) => { window.__pause.release = r; });
    if (!window.__origDigest) window.__origDigest = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = function (alg, data) {
      window.__pause.entered = true;
      return window.__pause.gate.then(() => window.__origDigest(alg, data));
    };
  });
  const releasePause = (page) => page.evaluate(async () => {
    window.__pause.release();
    crypto.subtle.digest = window.__origDigest;
    await new Promise((r) => setTimeout(r, 150));
  });

  let raceId = null;

  await test('C10-MC-06 a purge cannot complete while the writer holds the artifact lock', async () => {
    raceId = await newId(A);
    await armPause(A);
    /* Writer A starts and parks inside the locked operation. */
    await A.evaluate((id) => {
      window.__w = { done: false, ok: null, why: null };
      cfCasRecWrite(id, 'core', 55, JSON.stringify({ writer: 'A', weights: [1] }),
        (okW, man) => { window.__w = { done: true, ok: okW, why: okW ? null : man }; });
    }, raceId);
    await A.waitForFunction(() => window.__pause && window.__pause.entered, null, { timeout: 5000 });
    const parked = await A.evaluate(() => ({ entered: window.__pause.entered, done: window.__w.done }));
    ok(parked.entered, 'the writer must have reached the digest');
    notOk(parked.done, 'and must not have finished');

    /* Tab B now tries to purge the same id. It must block on the same real
       cross-tab Web Lock. */
    await B.evaluate((id) => {
      window.__p = { done: false, ok: null, why: null };
      cfCasRecPurge(id, (okP, why) => { window.__p = { done: true, ok: okP, why: why || null }; });
    }, raceId);
    await B.waitForTimeout(300);
    const held = await B.evaluate(() => window.__p.done);
    notOk(held, 'the purge completed while the writer still held the lock');
  });

  await test('C10-MC-07 releasing the writer yields one honest terminal ordering', async () => {
    await releasePause(A);
    await B.waitForFunction(() => window.__p.done, null, { timeout: 5000 });
    const w = await A.evaluate(() => window.__w);
    const p = await B.evaluate(() => window.__p);
    ok(w.done && p.done, 'both operations must terminate');
    /* Either the writer published and the purge then removed a complete
       artifact, or the writer failed safely and the purge found nothing. */
    if (w.ok) {
      ok(p.ok === true || p.why === 'absent',
        'writer succeeded, so purge must have removed it or found it already gone: ' + JSON.stringify(p));
    } else {
      ok(p.ok === false, 'writer failed, so there was nothing to remove: ' + JSON.stringify(p));
    }
  });

  await test('C10-MC-08 the final state is complete-or-absent, never torn', async () => {
    const keys = await A.evaluate((id) => Object.keys(localStorage)
      .filter((k) => k.indexOf(id) >= 0), raceId);
    const got = await read(A, raceId, 55);
    if (got.payload !== null) {
      const parsed = JSON.parse(got.payload);
      eq(parsed.writer, 'A', 'a verified artifact must be the writer\'s own bytes');
    } else {
      /* Absent is fine. A manifest with no payload is not. */
      const manifests = keys.filter((k) => /:manifest$/.test(k));
      const payloads = keys.filter((k) => /:payload$/.test(k));
      eq(manifests.length, 0,
        'a canonical manifest survived without a verifiable artifact: ' + keys.join(', '));
      eq(payloads.length, 0, 'orphaned payload left behind: ' + keys.join(', '));
    }
  });

  await test('C10-MC-09 both tabs agree on that final state', async () => {
    const inA = await read(A, raceId, 55);
    const inB = await read(B, raceId, 55);
    eq(inA.payload === null, inB.payload === null, 'tabs disagree on whether the artifact exists');
    if (inA.payload !== null) eq(inA.payload, inB.payload, 'and on its contents');
    const listA = await A.evaluate(() => cfCasRecList());
    const listB = await B.evaluate(() => cfCasRecList());
    eq(listA.indexOf(raceId) >= 0, listB.indexOf(raceId) >= 0, 'tabs disagree on the listing');
  });

  section('C10-MC-10..13 — nothing is publicly discoverable before publication');

  let pubId = null;

  await test('C10-MC-10 a public read is non-actionable before canonical publication', async () => {
    pubId = await newId(A);
    await armPause(A);
    await A.evaluate((id) => {
      window.__w2 = { done: false, ok: null };
      cfCasRecWrite(id, 'core', 66, JSON.stringify({ secret: 'not yet public' }),
        (okW) => { window.__w2 = { done: true, ok: okW }; });
    }, pubId);
    await A.waitForFunction(() => window.__pause && window.__pause.entered, null, { timeout: 5000 });
    const got = await read(B, pubId, 66);
    eq(got.payload, null, 'an unpublished candidate must not be readable');
    ok(got.why, 'and the refusal must be explicit: ' + got.why);
  });

  await test('C10-MC-11 a public list excludes the candidate before publication', async () => {
    const listB = await B.evaluate(() => cfCasRecList());
    eq(listB.indexOf(pubId), -1, 'the candidate appeared in the public list before publication');
    /* and no conflict reference could be built from storage discovery */
    const refs = await B.evaluate(() => [cfCasConflictId('core'), cfCasConflictId('training')]);
    notOk(refs.indexOf(pubId) >= 0, 'a conflict reference was constructed from an unpublished candidate');
  });

  await test('C10-MC-12 after release it verifies and is listed exactly once', async () => {
    await releasePause(A);
    await A.waitForFunction(() => window.__w2.done, null, { timeout: 5000 });
    ok(await A.evaluate(() => window.__w2.ok), 'the write should have succeeded once released');
    const got = await read(B, pubId, 66);
    ok(got.payload !== null, 'now it must verify in the other tab: ' + got.why);
    eq(JSON.parse(got.payload).secret, 'not yet public');
    const listB = await B.evaluate(() => cfCasRecList());
    eq(listB.filter((x) => x === pubId).length, 1, 'listed exactly once');
  });

  await test('C10-MC-13 a publication that fails never becomes publicly visible', async () => {
    const failId = await newId(A);
    const res = await A.evaluate((id) => new Promise((resolve) => {
      /* Break the canonical manifest write only. Everything up to publication
         succeeds, so this is the publication step failing, not an early exit. */
      const origSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (/^cf:casrec:.*:manifest$/.test(String(k))) throw new Error('forced publication failure');
        return origSet.call(this, k, v);
      };
      cfCasRecWrite(id, 'core', 77, JSON.stringify({ never: true }), (okW, why) => {
        Storage.prototype.setItem = origSet;
        resolve({ ok: okW, why: okW ? null : why });
      });
    }), failId);
    notOk(res.ok, 'the write must fail when publication fails');
    const listA = await A.evaluate(() => cfCasRecList());
    const listB = await B.evaluate(() => cfCasRecList());
    eq(listA.indexOf(failId), -1, 'a failed publication appeared in tab A\'s list');
    eq(listB.indexOf(failId), -1, 'a failed publication appeared in tab B\'s list');
    const got = await read(B, failId, 77);
    eq(got.payload, null, 'and it must not be readable');
    const leftovers = await A.evaluate((id) => Object.keys(localStorage).filter((k) => k.indexOf(id) >= 0), failId);
    eq(leftovers.length, 0, 'partial state was left behind: ' + leftovers.join(', '));
  });

  section('C10-MC-14..17 — account drift during the real Web Crypto window');

  await test('C10-MC-14 drift during the real digest prevents publication', async () => {
    const driftId = await newId(A);
    await armPause(A);
    const scopeA = await A.evaluate(() => cfCasRecScope());
    await A.evaluate((id) => {
      window.__w3 = { done: false, ok: null, why: null };
      cfCasRecWrite(id, 'core', 88, JSON.stringify({ owner: 'A', weights: [{ date: '2026-05-05', weight: 77 }] }),
        (okW, why) => { window.__w3 = { done: true, ok: okW, why: okW ? null : why }; });
    }, driftId);
    await A.waitForFunction(() => window.__pause && window.__pause.entered, null, { timeout: 5000 });
    /* The account changes mid-flight, exactly as a session rotation would. */
    await switchAccount(A, 'userC');
    await releasePause(A);
    await A.waitForFunction(() => window.__w3.done, null, { timeout: 5000 });
    const w = await A.evaluate(() => window.__w3);
    notOk(w.ok, 'a drifted continuation must not report success');
    /* nothing canonical under the ORIGINAL account */
    const leftA = await A.evaluate((s) => Object.keys(localStorage)
      .filter((k) => k.indexOf(s.scope) >= 0 && k.indexOf(s.id) >= 0), { scope: scopeA, id: driftId });
    eq(leftA.length, 0, 'account A state survived the drifted write: ' + leftA.join(', '));
    A.__driftId = driftId;
  });

  await test('C10-MC-15 captured-owner cleanup removed the partial state', async () => {
    /* Proven from the original account's own session, not from the drifted one. */
    await switchAccount(A, 'userA', 'a@x.com');
    const got = await read(A, A.__driftId, 88);
    eq(got.payload, null, 'a drifted write left a readable artifact behind: ' + got.why);
    const listed = await A.evaluate(() => cfCasRecList());
    eq(listed.indexOf(A.__driftId), -1, 'and it must not be listed');
  });

  await test('C10-MC-16 the account written INTO is untouched', async () => {
    await switchAccount(A, 'userC');
    const got = await read(A, A.__driftId, 88);
    eq(got.payload, null, 'account C must not have received account A\'s data');
    const keys = await A.evaluate((id) => Object.keys(localStorage)
      .filter((k) => /^cf:casrec:userC:/.test(k) && k.indexOf(id) >= 0), A.__driftId);
    eq(keys.length, 0, 'account C namespace was written into: ' + keys.join(', '));
    const listed = await A.evaluate(() => cfCasRecList());
    eq(listed.indexOf(A.__driftId), -1);
  });

  await test('C10-MC-17 no drifted conflict reference becomes actionable', async () => {
    const res = await A.evaluate((id) => {
      const refs = { core: cfCasConflictId('core'), training: cfCasConflictId('training') };
      return { refs, points: refs.core === id || refs.training === id };
    }, A.__driftId);
    notOk(res.points, 'a drifted artifact id was published as a conflict reference');
    await switchAccount(A, 'userA', 'a@x.com');
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

  /* ---- Architect-required: C10-MC-18..20 -------------------------------
     Their qualified approval of MC-12 named a real gap. Clearing a stale
     session error on reload is right ONLY when a verified artifact exists.
     Where preservation FAILED and no artifact was ever published, the in-memory
     block was the only record that a copy of the online version was still owed,
     and reload erased it — the subsystem came back looking merely pending.

     Commit 10b now carries a durable, account-scoped preservation obligation
     (cf:casneed:<account>) for exactly that case. */
  section('C10-MC-18..20 — reload cannot lose a failed preservation');

  const reloadPage = async () => {
    await A.reload({ waitUntil: 'load' });
    await A.waitForFunction(() => document.documentElement.style.visibility !== 'hidden');
    /* cfCasRestoreWorkflow verifies the artifact before deciding, so wait for
       that async reconstruction rather than sampling mid-flight. */
    await A.waitForFunction(() => window.__restored === true
      || (typeof cfCasCentreHasWorkflow === 'function'), null, { timeout: 5000 });
    await A.waitForTimeout(250);
  };

  const centreState = () => A.evaluate(() => {
    cfCasOpenConflictCenter(document.querySelector('[data-act="syncdot"]') || document.body);
    const host = document.getElementById('cf-conflict-host');
    const txt = host.textContent;
    const out = {
      block: CF_CAS_BLOCK.core,
      conflictId: cfCasConflictId('core'),
      need: cfCasPreserveNeed('core'),
      severity: cfCasCentreSeverity(),
      hasWorkflow: cfCasCentreHasWorkflow(),
      destructive: /Use this device’s copy online|Use the online copy on this device/.test(txt),
      retry: /Try again/.test(txt),
      exportable: /Export a copy/.test(txt),
      keep: /Keep this device’s changes/.test(txt),
      text: txt.slice(0, 200),
    };
    cfCasCloseConflictCenter();
    return out;
  });

  await test('C10-MC-18 a verified conflict plus a stale recovery error reloads as an ordinary conflict', async () => {
    const id = await newId(A);
    ok((await write(A, id, 91, { weights: [{ date: '2026-04-04', weight: 76 }] })).ok);
    await A.evaluate((i) => {
      cfCasSetServerRev('core', 91);
      cfCasSetConflictId('core', i);
      cfCasSetBlock('core', 'recovery', 'tok');     /* a session error, on top of durable truth */
    }, id);
    await reloadPage();
    const s = await centreState();
    eq(s.block, null, 'the stale session error must not be resurrected');
    eq(s.conflictId, id, 'the durable conflict is what survives');
    eq(s.need, null, 'and nothing is owed, because the copy is safe');
    eq(s.severity, 'warn', 'a decision, not a phantom error');
    ok(s.keep && s.destructive, 'the three choices are available: ' + s.text);
    notOk(s.retry, 'and it is not showing the blocked card');
  });

  await test('C10-MC-19 a failed initial preservation stays blocked and retryable across reload', async () => {
    /* No artifact was ever published — the only record is the obligation. */
    await A.evaluate(() => {
      cfCasSetConflictId('core', null);
      cfCasSetServerRev('core', 92);
      cfCasSetBlock('core', 'recovery', 'tok');
    });
    const before = await A.evaluate(() => cfCasPreserveNeed('core'));
    eq(before, 92, 'the failure must be recorded durably at the revision it failed on');
    await reloadPage();
    const s = await centreState();
    eq(s.conflictId, null, 'there is still no verified artifact');
    eq(s.need, 92, 'so the obligation survives the restart');
    eq(s.block, 'recovery', 'and the subsystem comes back blocked, not merely pending');
    ok(s.hasWorkflow, 'the athlete must still have a visible workflow');
    eq(s.severity, 'bad');
    ok(s.retry && s.exportable, 'with Try again and Export a copy: ' + s.text);
  });

  await test('C10-MC-20 no destructive choice appears until a verified artifact exists', async () => {
    const blocked = await centreState();
    notOk(blocked.destructive, 'destructive choices offered with nothing preserved: ' + blocked.text);
    notOk(blocked.keep, 'nor the ordinary conflict card');

    /* A reference whose artifact does NOT verify is the subtler case: the
       conflict id alone would render three choices against a copy that is not
       there. Restoration proves the artifact before offering anything. */
    await A.evaluate(() => {
      cfCasSetConflictId('core', 'casrec-core-' + 'b'.repeat(32));   /* nothing behind it */
      cfCasSetBlock('core', null, null);
    });
    await reloadPage();
    const phantom = await centreState();
    notOk(phantom.destructive,
      'a conflict reference with no verifiable artifact offered destructive choices: ' + phantom.text);
    eq(phantom.block, 'recovery', 'it must fall back to the blocked state');
    ok(phantom.need !== null, 'and record that a preservation is still owed');
    ok(phantom.retry, 'offering Try again: ' + phantom.text);

    /* clean slate for the account-switch section */
    await A.evaluate(() => {
      ['core', 'training'].forEach((s) => {
        cfCasSetConflictId(s, null); cfCasSetBlock(s, null, null); cfCasClearPreserveNeed(s);
      });
    });
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
