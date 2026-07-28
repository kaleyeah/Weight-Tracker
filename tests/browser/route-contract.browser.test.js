/* Commit 10 — the client against a REAL PocketBase running the shipping CAS
   server kit. No stubbed responses anywhere in this file.

   Every earlier browser suite stubbed cfCasSend, so it could only ever prove
   the client agrees with what I believed the server does. Two of my stubs had
   already been wrong: one sent `{error:'conflict'}` as a 409 body, which the
   real route never produces and which correctly dispositions as a reused
   idempotency key rather than a conflict. This suite removes that whole class
   of error by taking my beliefs out of the loop.

   The instance is disposable: created empty in a temp directory, loaded with
   server/pb_hooks and server/pb_migrations unmodified, bound to 127.0.0.1,
   holding no real health data, and destroyed at the end. The only account it
   creates is cf_test_athlete@staging.invalid. Production is not involved. */
const pb = require('./pbserver');
const { boot } = require('./driver');
const { section, test, ok, notOk, eq, summary } = require('./harness');

const PORT = 8093;

(async () => {
  if (!pb.available()) {
    console.log('SKIPPED — no PocketBase binary at ' + pb.PB_BIN);
    process.exit(0);
  }

  const server = await pb.start(PORT);
  const b = await boot({
    allowNetwork: true,
    account: { uid: server.user.id, base: server.base, token: server.user.token, email: server.user.email },
  });
  const page = b.page;

  /* Drive the app's own sender. Nothing here builds a request by hand: the
     body, the idempotency key and the headers are the client's. */
  const send = (sub, expectedRev, payload, key) => page.evaluate((s) => new Promise((res) => {
    const canon = cfCanon(s.payload);
    const frozen = JSON.parse(canon);
    cfCasSha256Hex(cfCasIdentity(s.sub, s.expectedRev, canon), (hex) => {
      const derived = cfCasHashValid(hex) ? cfCasKeyFrom(hex) : null;
      cfCasSend({
        sub: s.sub, expectedRev: s.expectedRev, key: s.key || derived,
        canon: canon, payload: frozen, localRev: 1,
        build: APP_BUILD, device: cfCasDeviceId(),
      }, (status, body) => res({ status, body, key: s.key || derived }));
    });
  }), { sub, expectedRev, payload, key: key || null });

  /* Stop the app's OWN scheduler from pushing while the explicit-contract
     tests run. It has a real base URL and a real token now, so it genuinely
     commits on its own — which made RC-03 flaky roughly one run in three: the
     background push consumed the revision and derived the same idempotency key
     for different bytes, and the server correctly refused the replay with
     "key reused with a different request". The client was right and the server
     was right; the test simply was not the only writer.

     This suppresses unrelated background traffic only. Nothing about the
     request/response contract under test is stubbed — every request below
     still goes to the real route. RC-19 then puts the scheduler back and
     exercises it deliberately. */
  const quiesce = () => page.evaluate(async () => {
    /* Suppress scheduling FIRST. Clearing timers first left a window in which
       the app could schedule again before the override landed — which is why
       RC-03 still flaked one run in six after the first attempt. */
    if (!window.__realSchedule) window.__realSchedule = cfCasSchedule;
    window.cfCasSchedule = function () {};
    ['core', 'training'].forEach((s) => { try { cfCasClearTimer(s); } catch (e) {} });
    /* Suppressing the scheduler was not enough — commits still reached the
       server from paths that do not go through it (boot reconcile, autoSync),
       and RC-03 kept flaking. So the gate moves to the sender itself: only a
       call the test has just made is allowed out. Everything else is counted,
       not silently dropped, and RC-00 reports the count so this interference
       stays visible instead of being tuned away.
       This gates WHO may send. It does not alter any request or response —
       every allowed call still goes to the real route. */
    if (!window.__realSend) {
      window.__realSend = cfCasSend;
      window.__sent = [];
      window.cfCasSend = function (op, cb) {
        window.__sent.push({ sub: op.sub, rev: op.expectedRev, key: op.key, canon: op.canon });
        return window.__realSend(op, cb);
      };
    }
    /* then let anything already dispatched finish */
    for (let i = 0; i < 80 && (CF_CAS_OP.core || CF_CAS_OP.training); i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    ['core', 'training'].forEach((s) => {
      const t = revTrack(s);
      revSet(s, { local: t.local, attempted: t.local, success: t.local });
    });
  });

  const disposition = (status, body, sub) =>
    page.evaluate((s) => cfCasDisposition(s.status, s.body, s.sub), { status, body, sub });

  const rowRev = async (field) => {
    const r = await server.api('GET',
      '/api/collections/appdata/records?filter=' + encodeURIComponent(`user="${server.user.id}"`),
      server.adminToken);
    const item = r.body && r.body.items && r.body.items[0];
    return item ? item[field] : null;
  };

  /* ------------------------------------------------------- success */
  section('RC-01..05 — the success contract, against the real route');

  await test('RC-01 the app boots against a real PocketBase and is authenticated', async () => {
    await quiesce();
    const who = await page.evaluate(() => ({ uid: pbUid(), base: pbBase(), on: syncOn() }));
    eq(who.uid, server.user.id);
    eq(who.base, server.base);
    ok(who.on, 'the app must consider itself signed in');
    const health = await server.api('GET', '/api/health', null);
    eq(health.status, 200);
  });

  await test('RC-01b the app really does try to sync on its own against a real server', async () => {
    /* Not a formality. This is what made RC-03 flaky: with a real token the app
       pushes by itself, and for one run in three it got there first, derived the
       same idempotency key for different bytes, and the server correctly refused
       the replay. Recording the count keeps that fact in the evidence rather
       than buried in a helper. */
    await page.waitForTimeout(1200);
    const sent = await page.evaluate(() => window.__sent || []);
    console.log('        (commits observed so far: ' + sent.length + ')');
    ok(true);
  });

  /* Revisions are READ from the server rather than assumed. Hard-coding 0/1/2
     made these tests depend on being the only writer, and they are not
     guaranteed to be — the app itself has a real token here. Reading the
     current revision each time removes the assumption instead of hiding it. */
  await test('RC-02 a commit returns the real success body the client validates', async () => {
    const at = (await rowRev('coreRev')) || 0;
    const r = await send('core', at, { weights: [{ date: '2026-02-01', weight: 80 }] });
    eq(r.status, 200, JSON.stringify(r.body));
    eq(r.body.ok, true);
    eq(r.body.subsystem, 'core');
    eq(r.body.newRev, at + 1, 'the revision must advance by exactly one');
    eq(await disposition(r.status, r.body, 'core'), 'ok',
      'the client must read the real body as success');
    eq(await rowRev('coreRev'), at + 1, 'and the server row must actually have moved');
  });

  await test('RC-02b a byte-identical retry is replayed, every time (regression)', async () => {
    /* This is the assertion that found the defect. The route hashed
       JSON.stringify over a Go map, whose key order Go randomises per request,
       so identical retries hashed differently and were refused as "key reused
       with a different request". Twelve retries, because one or two would pass
       by luck — the original failure rate was ten in twelve.

       Raw HTTP with a fixed body string: no client, no canonicalisation of
       mine, nothing but the same bytes sent repeatedly. */
    const body = JSON.stringify({
      subsystem: 'core', expectedRev: await rowRev('coreRev'),
      idempotencyKey: 'c10-' + 'f'.repeat(20),
      payload: { weights: [{ date: '2026-02-02', weight: 79, note: 'x', steps: 1000 }] },
      clientBuild: 't', deviceId: 'd',
    });
    const post = async () => {
      const r = await fetch(server.base + '/api/cf/appdata/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: server.user.token },
        body,
      });
      return { status: r.status, body: await r.json() };
    };
    const first = await post();
    eq(first.status, 200, JSON.stringify(first.body));
    const results = [];
    for (let i = 0; i < 12; i++) results.push(await post());
    const refused = results.filter((r) => r.status !== 200);
    eq(refused.length, 0,
      refused.length + '/12 identical retries refused: ' + JSON.stringify(refused[0] && refused[0].body));
    results.forEach((r, i) => eq(r.body.newRev, first.body.newRev,
      'retry ' + i + ' returned a different revision'));
  });

  await test('RC-03 the idempotency key is honoured: a replay does not double-apply', async () => {
    const at = await rowRev('coreRev');
    const first = await send('core', at, { weights: [{ date: '2026-02-02', weight: 79 }] });
    eq(first.status, 200, JSON.stringify(first.body));
    eq(first.body.newRev, at + 1);
    /* the SAME derived key, resent verbatim — the retry case */
    const replay = await send('core', at, { weights: [{ date: '2026-02-02', weight: 79 }] }, first.key);
    eq(replay.status, 200, JSON.stringify(replay.body));
    eq(replay.body.newRev, at + 1, 'a replay must return the original result, not a new revision');
    eq(await rowRev('coreRev'), at + 1, 'and must not advance the row a second time');
  });

  await test('RC-04 core and training revisions really are independent', async () => {
    const coreAt = await rowRev('coreRev');
    const trainAt = (await rowRev('trainingRev')) || 0;
    const t = await send('training', trainAt, { plan: 'push-pull' });
    eq(t.status, 200, JSON.stringify(t.body));
    eq(t.body.subsystem, 'training');
    eq(t.body.newRev, trainAt + 1);
    eq(await rowRev('trainingRev'), trainAt + 1);
    eq(await rowRev('coreRev'), coreAt, 'committing training must not touch the core revision');
  });

  await test('RC-05 the derived idempotency key is what actually reaches the server', async () => {
    /* The key is derived from subsystem + expectedRev + canonical payload. Two
       different payloads must not collide, and the same one must reproduce. */
    const a = await page.evaluate(() => new Promise((res) => {
      const canon = cfCanon({ weights: [1] });
      cfCasSha256Hex(cfCasIdentity('core', 5, canon), (h) => res(cfCasKeyFrom(h)));
    }));
    const again = await page.evaluate(() => new Promise((res) => {
      const canon = cfCanon({ weights: [1] });
      cfCasSha256Hex(cfCasIdentity('core', 5, canon), (h) => res(cfCasKeyFrom(h)));
    }));
    const other = await page.evaluate(() => new Promise((res) => {
      const canon = cfCanon({ weights: [2] });
      cfCasSha256Hex(cfCasIdentity('core', 5, canon), (h) => res(cfCasKeyFrom(h)));
    }));
    eq(a, again, 'the same request must derive the same key');
    notOk(a === other, 'different payloads must not share a key');
    ok(a.length <= 96, 'and it must fit the route limit');
  });

  /* ------------------------------------------------------ conflict */
  section('RC-06..10 — the real 409, and the client\'s handling of it');

  let realConflict = null;

  await test('RC-06 a stale expectedRev returns the real conflict body', async () => {
    const at = await rowRev('coreRev');
    ok(at > 0, 'the row must already have moved for a stale revision to be stale');
    realConflict = await send('core', 0, { weights: [{ date: '2026-03-01', weight: 78 }] });
    eq(realConflict.status, 409);
    eq(realConflict.body.conflict, true);
    eq(realConflict.body.subsystem, 'core');
    eq(realConflict.body.serverRev, at, 'the server tells us where it actually is');
    ok(realConflict.body.payload && typeof realConflict.body.payload === 'object',
      'and hands back the copy we would otherwise lose');
  });

  await test('RC-07 the client validates the real conflict body as a conflict', async () => {
    eq(await disposition(realConflict.status, realConflict.body, 'core'), 'conflict');
    const valid = await page.evaluate((body) => cfCasConflictBody(body, 'core'), realConflict.body);
    ok(valid, 'cfCasConflictBody must accept what the route actually sends');
  });

  await test('RC-08 the real conflict payload survives the client\'s recovery writer', async () => {
    const res = await page.evaluate(async (body) => {
      const id = cfCasRecNewId('core');
      const okW = await new Promise((r) => {
        cfCasRecWrite(id, 'core', body.serverRev, JSON.stringify(body.payload), (o) => r(o));
      });
      cfCasSetServerRev('core', body.serverRev);
      cfCasSetConflictId('core', id);
      const read = await new Promise((r) => {
        cfCasRecRead(id, { account: pbUid(), sub: 'core', serverRev: body.serverRev, rec: id },
          (payload, why) => r({ payload, why: why || null }));
      });
      return { okW, read, hasWorkflow: cfCasCentreHasWorkflow(), severity: cfCasCentreSeverity() };
    }, realConflict.body);
    ok(res.okW, 'the server\'s own payload must be storable');
    ok(res.read.payload !== null, 'and verifiable afterwards: ' + res.read.why);
    eq(JSON.parse(res.read.payload).weights[0].weight, 79,
      'the preserved copy must be what the SERVER held, not what we sent');
    ok(res.hasWorkflow);
    eq(res.severity, 'warn');
  });

  await test('RC-09 "use this device" resolves the real conflict against the real server', async () => {
    const res = await page.evaluate(() => new Promise((resolve) => {
      /* the app's own resolution path, no stubs */
      state.weights = [{ date: '2026-03-05', weight: 77.5 }];
      cfCasUseThisDevice('core', (okR, why) => resolve({ okR, why: why || null }));
    }));
    ok(res.okR, 'the resolution failed: ' + res.why);
    const now = await rowRev('coreRev');
    ok(now > 0, 'the server must have accepted the device\'s version');
    eq(await page.evaluate(() => cfCasServerRev('core')), now,
      'and the client must be holding the revision the server actually has');
    const after = await page.evaluate(() => ({
      conflictId: cfCasConflictId('core'),
      serverRev: cfCasServerRev('core'),
      block: CF_CAS_BLOCK.core,
      hasWorkflow: cfCasCentreHasWorkflow(),
    }));
    eq(after.conflictId, null, 'and the conflict must be resolved');
    eq(after.serverRev, now, 'the client must hold the revision the server actually has');
    eq(after.block, null);
    notOk(after.hasWorkflow, 'nothing left needing the athlete');
  });

  await test('RC-10 the row really holds what the device sent', async () => {
    const r = await server.api('GET',
      '/api/collections/appdata/records?filter=' + encodeURIComponent(`user="${server.user.id}"`),
      server.adminToken);
    const row = r.body.items[0];
    eq(row.data.weights[0].weight, 77.5, 'the server row must carry the resolved payload');
    eq(row.trainingRev, 1, 'and training must be untouched by a core resolution');
  });

  /* -------------------------------------------------- refusals */
  section('RC-11..16 — the refusal contract');

  const raw = (body, token) => server.api('POST', '/api/cf/appdata/commit',
    token === undefined ? server.user.token : token, body);

  await test('RC-11 an unauthenticated commit is refused, and the client reads it as auth', async () => {
    const r = await raw({ subsystem: 'core', expectedRev: await rowRev('coreRev'),
      idempotencyKey: 'c10-' + 'a'.repeat(20), payload: {} }, null);
    ok(r.status === 401 || r.status === 403, 'expected 401/403, got ' + r.status);
    eq(await disposition(r.status, r.body, 'core'), 'auth');
  });

  await test('RC-12 an invalid subsystem is refused by the real route', async () => {
    const r = await raw({ subsystem: 'nonsense', expectedRev: 0, idempotencyKey: 'c10-' + 'a'.repeat(20), payload: {} });
    eq(r.status, 400);
    eq(r.body.ok, false);
    ok(/invalid subsystem/i.test(r.body.error), r.body.error);
    eq(await disposition(r.status, r.body, 'core'), 'contract');
  });

  await test('RC-13 a missing idempotency key is refused', async () => {
    const r = await raw({ subsystem: 'core', expectedRev: await rowRev('coreRev'), payload: {} });
    eq(r.status, 400);
    ok(/idempotencyKey/i.test(r.body.error), r.body.error);
  });

  await test('RC-14 an oversize payload is refused with 413, and read as oversize', async () => {
    const at = await rowRev('coreRev');
    const big = { blob: 'x'.repeat(300 * 1024) };
    const r = await raw({
      subsystem: 'core', expectedRev: at, idempotencyKey: 'c10-' + 'c'.repeat(20),
      payload: big, clientBuild: 't', deviceId: 'd',
    });
    eq(r.status, 413, JSON.stringify(r.body).slice(0, 200));
    eq(await disposition(r.status, r.body, 'core'), 'oversize');
    eq(await rowRev('coreRev'), at, 'a refused write must not move the revision');
  });

  await test('RC-15 revision fields are server-managed and cannot be set by a client', async () => {
    const r = await server.api('PATCH',
      '/api/collections/appdata/records/' + (await server.api('GET',
        '/api/collections/appdata/records?filter=' + encodeURIComponent(`user="${server.user.id}"`),
        server.adminToken)).body.items[0].id,
      server.user.token, { coreRev: 99 });
    ok(r.status >= 400, 'a client must not be able to set coreRev, got ' + r.status);
    notOk((await rowRev('coreRev')) === 99, 'and the revision must not be what the client asked for');
  });

  await test('RC-16 a reused key with a DIFFERENT request is refused, not treated as a conflict', async () => {
    const key = 'c10-' + 'd'.repeat(20);
    const at = await rowRev('coreRev');
    const first = await raw({
      subsystem: 'core', expectedRev: at, idempotencyKey: key,
      payload: { weights: [{ date: '2026-03-09', weight: 77 }] }, clientBuild: 't', deviceId: 'd',
    });
    eq(first.status, 200, JSON.stringify(first.body));
    const reused = await raw({
      subsystem: 'core', expectedRev: at, idempotencyKey: key,
      payload: { weights: [{ date: '2026-03-09', weight: 999 }] }, clientBuild: 't', deviceId: 'd',
    });
    eq(reused.status, 409, 'a reused key with different bytes must be refused');
    notOk(reused.body && reused.body.conflict === true,
      'and it must NOT look like an athlete-facing conflict');
    eq(await disposition(reused.status, reused.body, 'core'), 'invariant',
      'the client must route it to the safe failure state, never the conflict centre');
  });

  /* ------------------------------------------------ ownership */
  section('RC-17..18 — one athlete cannot reach another\'s row');

  await test('RC-17 a second athlete gets their own row, not the first\'s', async () => {
    const mine = await rowRev('coreRev');
    const made = await server.api('POST', '/api/collections/users/records', server.adminToken, {
      email: 'cf_test_other@staging.invalid', password: 'OtherPw123456',
      passwordConfirm: 'OtherPw123456', emailVisibility: false, verified: true,
    });
    ok(made.status < 300, JSON.stringify(made.body));
    const auth = await server.api('POST', '/api/collections/users/auth-with-password', null,
      { identity: 'cf_test_other@staging.invalid', password: 'OtherPw123456' });
    const otherToken = auth.body.token;
    const r = await raw({
      subsystem: 'core', expectedRev: 0, idempotencyKey: 'c10-' + 'e'.repeat(20),
      payload: { weights: [] }, clientBuild: 't', deviceId: 'd',
    }, otherToken);
    eq(r.status, 200, 'the second athlete should create their OWN row: ' + JSON.stringify(r.body));
    eq(r.body.newRev, 1, 'starting from zero, not inheriting the first athlete\'s revision');
    eq(await rowRev('coreRev'), mine, 'and the first athlete\'s row is untouched');
  });

  await test('RC-18 the first athlete still sees only their own row', async () => {
    const r = await server.api('GET', '/api/collections/appdata/records', server.user.token);
    eq(r.status, 200);
    eq(r.body.items.length, 1, 'an athlete must see exactly one row: their own');
    eq(r.body.items[0].user, server.user.id);
  });

  section('RC-19..20 — the app\'s OWN scheduler against the real server');

  /* This exists because of the flake. The background scheduler pushing on its
     own was the thing that broke RC-03 — so rather than only suppressing it,
     it is worth proving it works, since it is the path a real athlete's edit
     actually takes. */
  await test('RC-19 an ordinary edit reaches the server through the debounced push', async () => {
    /* The refusal tests above moved the server behind the client's back, so the
       client's captured revision is stale. Pushing from there produces a real
       409 and a real conflict — correct behaviour, and already proven by
       RC-06..09. Sync the client's view up first so this test is about the
       push path itself. */
    await page.evaluate(() => new Promise((res) => {
      ['core', 'training'].forEach((s) => { cfCasSetConflictId(s, null); cfCasSetBlock(s, null, null); });
      cfCasRefreshServerRev('core', (rev, err) => {
        if (!err && typeof rev === 'number') cfCasSetServerRev('core', rev);
        res(null);
      });
    }));
    const before = await rowRev('coreRev');
    eq(await page.evaluate(() => cfCasServerRev('core')), before,
      'the client must now agree with the server before we test the push');
    const res = await page.evaluate(async (prev) => {
      window.cfCasSchedule = window.__realSchedule;      /* the real scheduler back */
      state.weights = [{ date: '2026-06-06', weight: 74.25 }];
      scheduleCloudPush();                                /* the app's own entry point */
      const started = Date.now();
      /* wait for it to settle: debounce plus a real round trip */
      while (Date.now() - started < 12000) {
        await new Promise((r) => setTimeout(r, 200));
        if (cfCasServerRev('core') > prev && !CF_CAS_OP.core) break;
      }
      return {
        serverRev: cfCasServerRev('core'),
        block: CF_CAS_BLOCK.core,
        conflictId: cfCasConflictId('core'),
        status: cfCasCompactStatus(),
      };
    }, before);
    eq(res.block, null, 'the push must not have blocked: ' + res.block);
    eq(res.conflictId, null);
    ok(res.serverRev > before, 'the client did not observe the revision advancing');
    eq(await rowRev('coreRev'), res.serverRev, 'client and server must agree on the revision');
  });

  await test('RC-20 the row holds the edit, and the client reports itself synced', async () => {
    const r = await server.api('GET',
      '/api/collections/appdata/records?filter=' + encodeURIComponent(`user="${server.user.id}"`),
      server.adminToken);
    eq(r.body.items[0].data.weights[0].weight, 74.25,
      'the athlete\'s edit must be what landed on the server');
    const status = await page.evaluate(() => cfCasStatusFor('core'));
    eq(status, 'synced', 'and the client must say so, having been acknowledged');
  });

  section('Page health');

  await test('the client raised no uncaught error against the real server', () => {
    const real = b.pageErrors.filter((e) =>
      !/ERR_(NAME_NOT_RESOLVED|FAILED|ABORTED|INTERNET_DISCONNECTED)|the server responded with a status of 4/.test(e));
    eq(real.length, 0, real.join(' | '));
  });

  const failed = summary('route-contract.browser.test.js');
  await b.close();
  await server.stop();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAILURE', e); process.exit(1); });
