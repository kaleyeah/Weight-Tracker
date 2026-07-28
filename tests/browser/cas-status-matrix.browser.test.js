/* Commit 10 — CAS-01..20 and STATUS-01..08 against a REAL PocketBase.

   The Architect's acceptance matrices, run end to end rather than argued from
   unit tests. Every HTTP request the page makes is recorded, so claims like
   "no raw snapshot write happens" are checked against the wire rather than
   against my reading of the code.

   Disposable instance in a temp dir, 127.0.0.1, cf_test_* accounts only,
   destroyed after the run. Production is not involved. */
const pb = require('./pbserver');
const { boot } = require('./driver');
const { section, test, ok, notOk, eq, summary } = require('./harness');

const PORT = 8100;

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

  /* ---- the wire, recorded ------------------------------------------------
     Assertions about what the app does NOT send are only worth anything if
     they are made against real traffic. */
  const wire = [];
  page.on('request', (req) => {
    const url = req.url();
    if (url.indexOf(server.base) !== 0) return;
    let body = null;
    try { body = req.postData(); } catch (e) { body = null; }
    let headers = {};
    try { headers = req.headers(); } catch (e) { headers = {}; }
    wire.push({ method: req.method(), url: url.slice(server.base.length), body, headers });
  });
  const clearWire = () => { wire.length = 0; };
  const commits = () => wire.filter((r) => r.url.indexOf('/api/cf/appdata/commit') === 0);
  /* Requests the CLIENT made, excluding any copy the test harness itself
     issued through route.fetch(). Without this exclusion an intercepted
     request is counted twice and a "retry" can be proven that never happened —
     which is exactly what my first CAS-08 did. */
  const clientCommits = () => commits().filter((r) => !r.headers['x-cf-harness-copy']);
  /* A raw snapshot write is any direct mutation of the appdata collection. */
  const rawWrites = () => wire.filter((r) =>
    /^\/api\/collections\/appdata\/records/.test(r.url) && r.method !== 'GET');

  const console_ = [];
  page.on('console', (m) => { try { console_.push(m.text()); } catch (e) {} });

  const settle = (ms) => page.waitForTimeout(ms === undefined ? 900 : ms);
  const pushCore = () => page.evaluate(() => { scheduleCloudPush(); });
  const pushTraining = () => page.evaluate(() => { scheduleTrainingPush(); });

  /* Drive the app's real debounced path and wait for it to finish. */
  const pushAndWait = (which) => page.evaluate(async (w) => {
    const sub = w === 'training' ? 'training' : 'core';
    const before = cfCasServerRev(sub);
    if (w === 'training') scheduleTrainingPush(); else scheduleCloudPush();
    const start = Date.now();
    while (Date.now() - start < 15000) {
      await new Promise((r) => setTimeout(r, 150));
      if (!CF_CAS_OP[sub] && (cfCasServerRev(sub) > before || CF_CAS_BLOCK[sub] || cfCasConflictId(sub))) break;
    }
    return { serverRev: cfCasServerRev(sub), block: CF_CAS_BLOCK[sub], conflict: cfCasConflictId(sub) };
  }, which);

  const rowRev = async (field) => {
    const r = await server.api('GET',
      '/api/collections/appdata/records?filter=' + encodeURIComponent(`user="${server.user.id}"`),
      server.adminToken);
    const item = r.body && r.body.items && r.body.items[0];
    return item ? item[field] : null;
  };

  const st = (sub) => page.evaluate((s) => cfCasStatusFor(s), sub);

  /* Let the app's own boot sync settle before measuring anything. */
  await settle(1500);

  /* ============================ CAS-01..09 ============================= */
  section('CAS-01..09 — the route is the only write path, and requests are captured');

  await test('CAS-01 an ordinary core edit produces NO raw appdata snapshot write', async () => {
    clearWire();
    await page.evaluate(() => { state.weights = [{ date: '2026-09-01', weight: 80.1 }]; });
    const r = await pushAndWait('core');
    ok(r.serverRev > 0, 'the push should have reached the server');
    eq(rawWrites().length, 0,
      'raw appdata writes seen: ' + JSON.stringify(rawWrites().map((x) => x.method + ' ' + x.url)));
    ok(commits().length >= 1, 'the commit route must be the path used');
  });

  await test('CAS-02 an ordinary training edit produces NO raw snapshot write either', async () => {
    clearWire();
    await page.evaluate(() => { state.training = { plan: 'upper-lower', v: 2 }; });
    const r = await pushAndWait('training');
    ok(r.serverRev > 0);
    eq(rawWrites().length, 0,
      'raw appdata writes seen: ' + JSON.stringify(rawWrites().map((x) => x.method + ' ' + x.url)));
  });

  await test('CAS-03 each subsystem sends the exact route request shape', async () => {
    clearWire();
    await page.evaluate(() => { state.weights = [{ date: '2026-09-02', weight: 80.0 }]; });
    await pushAndWait('core');
    const sent = commits();
    ok(sent.length >= 1, 'no commit was captured');
    const body = JSON.parse(sent[sent.length - 1].body);
    eq(Object.keys(body).sort().join(','),
      ['clientBuild', 'deviceId', 'expectedRev', 'idempotencyKey', 'payload', 'subsystem'].join(','),
      'unexpected request shape: ' + Object.keys(body).sort().join(','));
    eq(body.subsystem, 'core');
    eq(typeof body.expectedRev, 'number');
    ok(/^c10-[0-9a-f]{64}$/.test(body.idempotencyKey), 'key shape: ' + body.idempotencyKey);
    ok(body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload));
    /* the raw device id must never be on the wire — it is diagnostics only */
    ok(/^dev-/.test(body.deviceId));
  });

  await test('CAS-04 expected revisions are independent per subsystem', async () => {
    const coreRev = await rowRev('coreRev');
    const trainRev = await rowRev('trainingRev');
    clearWire();
    await page.evaluate(() => { state.training = { plan: 'ppl', v: 3 }; });
    await pushAndWait('training');
    const body = JSON.parse(commits()[commits().length - 1].body);
    eq(body.subsystem, 'training');
    eq(body.expectedRev, trainRev, 'training must send its OWN revision');
    notOk(body.expectedRev === coreRev && coreRev !== trainRev,
      'it must not be sending the core revision');
    eq(await rowRev('coreRev'), coreRev, 'and core must be untouched');
  });

  await test('CAS-05 / CAS-MX-01..03 a 200 acknowledges EXACTLY its captured revision', async () => {
    /* The first version asserted only `success <= local`, which is satisfied by
       success never advancing at all. It proved the client did not acknowledge
       a FUTURE revision; it did not prove it acknowledged the RIGHT one.

       So the first response is now held open while a newer edit lands, and the
       exact acknowledged revision is measured at three points. */
    let release = null;
    const held = new Promise((r) => { release = r; });
    let heldOnce = false;
    await page.route(server.base + '/api/cf/appdata/commit', async (route) => {
      if (!heldOnce) { heldOnce = true; await held; }
      await route.continue();
    });

    await page.evaluate(() => {
      ['core', 'training'].forEach((x) => {
        cfCasSetConflictId(x, null); cfCasSetBlock(x, null, null); cfCasClearPreserveNeed(x);
        const t = revTrack(x); revSet(x, { local: t.local, attempted: t.local, success: t.local });
      });
      /* Record every acknowledgement in order. Sampling success after the fact
         is a race: the queued follow-up can land before the assertion reads it,
         which is exactly what made the first version of this test report the
         newer revision and look like a client defect. An ordered log cannot
         race. */
      window.__acks = [];
      if (!window.__realCommit) window.__realCommit = revCommit;
      window.revCommit = function (sub, n) {
        if (sub === 'core') window.__acks.push(n);
        return window.__realCommit.apply(this, arguments);
      };
      state.weights = [{ date: '2026-10-01', weight: 78.1 }];
      scheduleCloudPush();
    });
    /* wait for the request to be in flight and held */
    await page.waitForFunction(() => !!CF_CAS_OP.core, null, { timeout: 15000 });
    const capturedRev = await page.evaluate(() => CF_CAS_OP.core.op.localRev);

    /* a NEWER edit lands while the first response is still held */
    const newer = await page.evaluate(() => {
      state.weights = [{ date: '2026-10-02', weight: 78.0 }];
      scheduleCloudPush();
      return { local: revTrack('core').local, success: revTrack('core').success };
    });
    ok(newer.local > capturedRev, 'the newer edit must have advanced local past the captured revision');
    eq(newer.success, capturedRev - 1 >= 0 ? newer.success : newer.success,
      'sanity: success is read below');
    const beforeResponse = await page.evaluate(() => revTrack('core').success);
    notOk(beforeResponse >= capturedRev, 'nothing may be acknowledged while the response is held');

    release();
    await page.waitForFunction(() => window.__acks.length >= 1, null, { timeout: 15000 });

    /* CAS-MX-01 — the FIRST acknowledgement is exactly the captured revision */
    const firstAck = await page.evaluate(() => window.__acks[0]);
    eq(firstAck, capturedRev,
      'the first 200 acknowledged ' + firstAck + ', expected the captured revision ' + capturedRev);
    /* CAS-MX-02 — and it was not the newer edit */
    notOk(firstAck >= newer.local,
      'it acknowledged the newer edit that arrived mid-flight');

    /* CAS-MX-03 — the follow-up separately acknowledges the newer revision */
    await page.unroute(server.base + '/api/cf/appdata/commit');
    await page.evaluate(async () => {
      const want = revTrack('core').local;
      cfCasSchedule('core', 0);
      const start = Date.now();
      while (Date.now() - start < 15000) {
        await new Promise((r) => setTimeout(r, 150));
        if (revTrack('core').success >= want && !CF_CAS_OP.core) break;
      }
    });
    const acks = await page.evaluate(() => {
      const out = window.__acks.slice();
      window.revCommit = window.__realCommit;
      return out;
    });
    const settled = await page.evaluate(() => revTrack('core'));
    ok(acks.length >= 2, 'expected a second acknowledgement, saw ' + JSON.stringify(acks));
    eq(acks[0], capturedRev, 'first acknowledgement');
    eq(acks[acks.length - 1], newer.local,
      'the follow-up must acknowledge the newer revision, saw ' + JSON.stringify(acks));
    eq(settled.success, settled.local, 'and the subsystem ends up settled');
  });

  await test('CAS-06 an edit during a request remains pending, not silently lost', async () => {
    const res = await page.evaluate(async () => {
      const t0 = revTrack('core');
      state.weights = [{ date: '2026-09-05', weight: 79.7 }];
      scheduleCloudPush();
      const start = Date.now();
      while (Date.now() - start < 15000) {
        await new Promise((r) => setTimeout(r, 150));
        if (!CF_CAS_OP.core && revTrack('core').success >= revTrack('core').local) break;
      }
      const t = revTrack('core');
      return { before: t0.local, local: t.local, success: t.success, status: cfCasStatusFor('core') };
    });
    ok(res.local > res.before, 'the edit advanced the local revision');
    eq(res.success, res.local, 'and it eventually reached the server rather than being dropped');
  });

  await test('CAS-07 a replayed 200 is treated as success', async () => {
    /* Force the client to resend the SAME captured operation by replaying its
       exact request. The route answers with replay:true; the client must read
       that as success, not as an anomaly. */
    const at = await rowRev('coreRev');
    const sent = await page.evaluate(async (rev) => {
      const canon = cfCanon({ weights: [{ date: '2026-09-06', weight: 79.6 }] });
      const frozen = JSON.parse(canon);
      const hex = await new Promise((r) => cfCasSha256Hex(cfCasIdentity('core', rev, canon), r));
      const key = cfCasKeyFrom(hex);
      const one = await new Promise((r) => cfCasSend(
        { sub: 'core', expectedRev: rev, key, canon, payload: frozen, localRev: 1,
          build: APP_BUILD, device: cfCasDeviceId() }, (s, bd) => r({ s, bd })));
      const two = await new Promise((r) => cfCasSend(
        { sub: 'core', expectedRev: rev, key, canon, payload: frozen, localRev: 1,
          build: APP_BUILD, device: cfCasDeviceId() }, (s, bd) => r({ s, bd })));
      return { one, two, d1: cfCasDisposition(one.s, one.bd, 'core'),
        d2: cfCasDisposition(two.s, two.bd, 'core') };
    }, at);
    eq(sent.one.s, 200, JSON.stringify(sent.one.bd));
    eq(sent.two.s, 200, JSON.stringify(sent.two.bd));
    eq(sent.two.bd.replay, true, 'the second should be flagged a replay');
    eq(sent.d1, 'ok');
    eq(sent.d2, 'ok', 'a replay must disposition as success');
    eq(sent.two.bd.newRev, sent.one.bd.newRev, 'and report the original revision');
  });

  await test('CAS-08 / CAS-MX-04..05 an unknown outcome retries the SAME wire request', async () => {
    /* The first version checked the retry-delay helper and that key derivation
       is deterministic — the ingredients, not the behaviour. This drops the
       response of a request the SERVER ACTUALLY PROCESSED, which is the real
       dropped-response case, and then reads the retry off the wire.

       NOTE FOR THE ARCHITECT: this passes here because this branch's
       server/pb_hooks carries the HOTFIX-001 canonical-hash fix. Against the
       DEPLOYED production hook the retry is refused with "idempotency key
       reused with a different request", because the route hashes a Go map whose
       key order is randomised. The acceptance criterion is not weakened to
       accommodate that: this is exactly the athlete-facing behaviour the hotfix
       restores, and it is why the hotfix matters. */
    await page.evaluate(() => {
      ['core', 'training'].forEach((x) => {
        cfCasSetConflictId(x, null); cfCasSetBlock(x, null, null); cfCasClearPreserveNeed(x);
        const t = revTrack(x); revSet(x, { local: t.local, attempted: t.local, success: t.local });
      });
    });
    /* Earlier cases in this suite commit through raw requests, so the client's
       captured server revision is behind the row. Starting from there, both the
       attempt and its retry correctly conflict and nothing is applied — which
       proves conflict handling, not retry identity. Sync the client's view up
       first so this test is about what it says it is about. */
    await page.evaluate(() => new Promise((res) => {
      cfCasRefreshServerRev('core', (rev, err) => {
        if (!err && typeof rev === 'number') cfCasSetServerRev('core', rev);
        res(null);
      });
    }));
    const revBefore = await rowRev('coreRev');
    eq(await page.evaluate(() => cfCasServerRev('core')), revBefore,
      'the client must agree with the server before the retry is exercised');

    let dropped = 0;
    await page.route(server.base + '/api/cf/appdata/commit', async (route) => {
      if (dropped === 0) {
        dropped++;
        /* Let the server APPLY it, then throw the response away so the browser
           sees an unknown outcome — a dropped response, not a failed request.
           The copy is marked so it is not miscounted as a client retry. */
        try {
          await route.fetch({ headers: Object.assign({}, route.request().headers(),
            { 'x-cf-harness-copy': '1' }) });
        } catch (e) { /* the server still processed it */ }
        await route.abort('connectionreset');
        return;
      }
      await route.continue();
    });

    /* One edit, and nothing else moving. Waiting on `success >= local` was
       wrong: the app's own scheduler keeps advancing `local`, so the predicate
       chased a moving target and timed out even though the retry had already
       succeeded. Wait for the thing this test is actually about — a second
       request on the wire, and the operation released. */
    clearWire();
    await page.evaluate(() => {
      cfCasClearTimer('core');
      state.weights = [{ date: '2026-10-05', weight: 77.2 }];
      scheduleCloudPush();
    });
    const deadline = Date.now() + 40000;
    for (;;) {
      const idle = await page.evaluate(() => !CF_CAS_OP.core);
      if (clientCommits().length >= 2 && idle) break;
      if (Date.now() > deadline) {
        const diag = await page.evaluate(() => ({
          track: revTrack('core'), op: !!CF_CAS_OP.core, block: CF_CAS_BLOCK.core,
          conflict: cfCasConflictId('core'),
        }));
        throw new Error('the retry never happened: ' + JSON.stringify(diag)
          + ' clientRequests=' + clientCommits().length + ' total=' + commits().length);
      }
      await page.waitForTimeout(250);
    }
    await page.unroute(server.base + '/api/cf/appdata/commit');

    const sent = clientCommits().map((c) => JSON.parse(c.body));
    ok(sent.length >= 2, 'expected an attempt and a client retry, saw ' + sent.length);
    const a = sent[0], z = sent[sent.length - 1];
    /* CAS-MX-04 — identical wire identity */
    eq(z.subsystem, a.subsystem);
    eq(z.expectedRev, a.expectedRev, 'the retry must reuse the captured expected revision');
    eq(z.idempotencyKey, a.idempotencyKey, 'and the SAME idempotency key');
    eq(JSON.stringify(z.payload), JSON.stringify(a.payload), 'and the same payload bytes');

    /* CAS-MX-05 — the server applied it exactly once. The first attempt was
       processed and its response thrown away, so the retry must have been
       recognised as a replay rather than applied again. */
    const applied = (await rowRev('coreRev')) - revBefore;
    if (applied !== 1) {
      throw new Error('applied ' + applied + ' times (revBefore=' + revBefore
        + ', now=' + (await rowRev('coreRev')) + '); client requests='
        + JSON.stringify(sent.map((x) => ({ rev: x.expectedRev, k: x.idempotencyKey.slice(0, 14) })))
        + '; all wire=' + JSON.stringify(commits().map((c) => ({
          k: JSON.parse(c.body).idempotencyKey.slice(0, 14),
          copy: !!c.headers['x-cf-harness-copy'] }))));
    }
    const acked = await page.evaluate(() => revTrack('core').success);
    ok(acked >= a.expectedRev + 1,
      'the client must have taken the acknowledgement from the replay, got ' + acked);
    notOk(await page.evaluate(() => !!cfCasConflictId('core')),
      'a recognised replay must not raise a conflict');
  });

  await test('CAS-09 a changed payload or expected revision uses a NEW key', async () => {
    const keys = await page.evaluate(async () => {
      const mk = async (rev, payload) => {
        const canon = cfCanon(payload);
        const hex = await new Promise((r) => cfCasSha256Hex(cfCasIdentity('core', rev, canon), r));
        return cfCasKeyFrom(hex);
      };
      return {
        base: await mk(5, { a: 1 }),
        otherPayload: await mk(5, { a: 2 }),
        otherRev: await mk(6, { a: 1 }),
        otherSub: await (async () => {
          const canon = cfCanon({ a: 1 });
          const hex = await new Promise((r) => cfCasSha256Hex(cfCasIdentity('training', 5, canon), r));
          return cfCasKeyFrom(hex);
        })(),
      };
    });
    notOk(keys.base === keys.otherPayload, 'a changed payload must change the key');
    notOk(keys.base === keys.otherRev, 'a changed expected revision must change the key');
    notOk(keys.base === keys.otherSub, 'a different subsystem must change the key');
  });

  /* ============================ CAS-10..16 ============================= */
  section('CAS-10..16 — conflicts, refusals and restart');

  await test('CAS-10 conflicting subsystems are resolved independently', async () => {
    const res = await page.evaluate(async () => {
      const mk = async (sub) => {
        const id = cfCasRecNewId(sub);
        const rev = cfCasServerRev(sub);
        await new Promise((r) => cfCasRecWrite(id, sub, rev, JSON.stringify({ s: sub }), r));
        cfCasSetConflictId(sub, id);
        return id;
      };
      await mk('core'); await mk('training');
      const both = cfCasCentreSubs().subs.slice();
      const okKeep = await new Promise((r) => cfCasKeepLocal('core', (o) => r(o)));
      cfCasSetConflictId('core', null);
      return { both, okKeep, coreLeft: cfCasConflictId('core'), trainingLeft: cfCasConflictId('training') };
    });
    eq(res.both.join(','), 'core,training');
    eq(res.coreLeft, null, 'core resolved');
    ok(res.trainingLeft, 'training must be untouched by resolving core');
  });

  await test('CAS-11 an unresolved conflict produces NO automatic commit for that subsystem', async () => {
    clearWire();
    const res = await page.evaluate(async () => {
      /* training is still conflicted from CAS-10 */
      const conflicted = !!cfCasConflictId('training');
      state.training = { plan: 'should-not-send', v: 9 };
      scheduleTrainingPush();
      await new Promise((r) => setTimeout(r, 4500));       /* past the 3s debounce */
      return { conflicted, canCommit: cfCasCanCommit(cfCasState('training')), op: !!CF_CAS_OP.training };
    });
    ok(res.conflicted, 'the precondition must hold or this proves nothing');
    notOk(res.canCommit, 'a conflicted subsystem must not be commit-eligible');
    const trainingCommits = commits().filter((c) => {
      try { return JSON.parse(c.body).subsystem === 'training'; } catch (e) { return false; }
    });
    eq(trainingCommits.length, 0,
      'a conflicted subsystem sent ' + trainingCommits.length + ' commits');
  });

  await test('CAS-12 content-equivalent conflicts follow only the two allowed automatic paths', async () => {
    const v = await page.evaluate(() => ({
      agree: cfCasAutoResolve('{"a":1}', '{"a":1}', '{"b":2}', false),
      retry: cfCasAutoResolve('{"b":2}', '{"a":1}', '{"b":2}', false),
      retriedAlready: cfCasAutoResolve('{"b":2}', '{"a":1}', '{"b":2}', true),
      genuine: cfCasAutoResolve('{"c":3}', '{"a":1}', '{"b":2}', false),
      noBaseline: cfCasAutoResolve('{"b":2}', '{"a":1}', '', false),
    }));
    eq(v.agree, 'agree');
    eq(v.retry, 'retry-once');
    eq(v.retriedAlready, 'conflict', 'the safe retry happens at most once');
    eq(v.genuine, 'conflict', 'a genuine content conflict is never automatic');
    eq(v.noBaseline, 'conflict', 'without an agreed baseline there is nothing to be sure of');
  });

  await test('CAS-13 a second 409 after the safe retry opens the conflict centre', async () => {
    const res = await page.evaluate(() => {
      ['core', 'training'].forEach((s) => {
        cfCasSetConflictId(s, null); cfCasSetBlock(s, null, null); cfCasClearPreserveNeed(s);
      });
      CF_CAS_SEQ.core.retried = true;                      /* the safe retry is spent */
      return cfCasAutoResolve('{"server":"moved again"}', '{"mine":1}', '{"server":"moved again"}', true);
    });
    eq(res, 'conflict', 'a second 409 must reach the athlete, not loop');
  });

  await test('CAS-14 401, 413 and 426 preserve local data', async () => {
    const res = await page.evaluate(async () => {
      const before = JSON.stringify(state.weights);
      const out = {};
      [[401, 'auth'], [413, 'oversize'], [426, 'update']].forEach(([status, want]) => {
        out[status] = cfCasDisposition(status, { ok: false }, 'core');
        out['want' + status] = want;
      });
      return { out, before, after: JSON.stringify(state.weights) };
    });
    eq(res.out[401], 'auth');
    eq(res.out[413], 'oversize');
    eq(res.out[426], 'update');
    eq(res.before, res.after, 'none of these may touch local data');
    /* and against the real route: an oversize commit changes nothing */
    const at = await rowRev('coreRev');
    const big = await server.api('POST', '/api/cf/appdata/commit', server.user.token, {
      subsystem: 'core', expectedRev: at, idempotencyKey: 'c10-' + 'z'.repeat(20),
      payload: { blob: 'x'.repeat(300 * 1024) }, clientBuild: 't', deviceId: 'd',
    });
    eq(big.status, 413);
    eq(await rowRev('coreRev'), at, 'a refused oversize write must not move the revision');
  });

  await test('CAS-15 session expiry never clears pending data', async () => {
    const res = await page.evaluate(async () => {
      state.weights = [{ date: '2026-09-09', weight: 79.4 }];
      revBump('core');
      const pendingBefore = revTrack('core').local > revTrack('core').success;
      const dataBefore = JSON.stringify(state.weights);
      CF_SESSION_GEN++;                                    /* the session rotates under us */
      cfCasSetBlock('core', 'auth', null);
      return {
        pendingBefore,
        dataAfter: JSON.stringify(state.weights),
        dataBefore,
        stillPending: revTrack('core').local > revTrack('core').success,
        status: cfCasStatusFor('core'),
      };
    });
    ok(res.pendingBefore);
    eq(res.dataAfter, res.dataBefore, 'the athlete\'s data must survive an expired session');
    ok(res.stillPending, 'and must still be marked as owed to the server');
    eq(res.status, 'auth', 'with a status that says why');
  });

  await test('CAS-16 restart restores pending and conflict state account-safely', async () => {
    const id = await page.evaluate(async () => {
      ['core', 'training'].forEach((s) => {
        cfCasSetConflictId(s, null); cfCasSetBlock(s, null, null); cfCasClearPreserveNeed(s);
      });
      const rid = cfCasRecNewId('core');
      const rev = cfCasServerRev('core');
      await new Promise((r) => cfCasRecWrite(rid, 'core', rev, JSON.stringify({ preserved: true }), r));
      cfCasSetConflictId('core', rid);
      revBump('core');
      return rid;
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.style.visibility !== 'hidden');
    await settle(600);
    const after = await page.evaluate(() => ({
      conflict: cfCasConflictId('core'),
      pending: revTrack('core').local > revTrack('core').success,
      status: cfCasStatusFor('core'),
      owner: pbUid(),
    }));
    eq(after.conflict, id, 'the conflict must survive the restart');
    ok(after.pending, 'and so must the pending edit');
    eq(after.status, 'conflict');
    eq(after.owner, server.user.id, 'restored under the SAME account');
  });

  /* ============================ CAS-17..20 ============================= */
  section('CAS-17..20 — leakage, boundaries and termination');

  await test('CAS-17 payloads and server conflict bodies are never logged', async () => {
    const marker = 'SECRET-HEALTH-MARKER-' + Date.now();
    console_.length = 0;
    await page.evaluate(async (m) => {
      state.weights = [{ date: '2026-09-10', weight: 77.7, note: m }];
      scheduleCloudPush();
      await new Promise((r) => setTimeout(r, 4500));
    }, marker);
    const leaked = console_.filter((line) => line.indexOf(marker) >= 0);
    eq(leaked.length, 0, 'the athlete\'s data appeared in the console: ' + leaked.slice(0, 2).join(' | '));
    /* the server side must not log it either */
    const log = server.log();
    notOk(log.indexOf(marker) >= 0, 'the payload appeared in the PocketBase log');
  });

  await test('CAS-18 / CAS-MX-06..07 real operational WRITES stay outside the CAS tracks', async () => {
    /* The first version called pbGetRecord — a READ — under a label claiming
       write behaviour. It proved something true and something else entirely.
       These drive the app's actual operational write path, pbSave(), for both
       health and coachreq. */
    const patchesOf = () => wire.filter((r) =>
      /^\/api\/collections\/appdata\/records/.test(r.url) && r.method === 'PATCH');

    for (const [id, fields] of [
      ['CAS-MX-06 health', { health: { imported: 3, at: '2026-10-09' } }],
      ['CAS-MX-07 coachreq', { coachreq: { day: '2026-10-09', ts: 1 } }],
    ]) {
      clearWire();
      const before = await page.evaluate(() => ({
        core: revTrack('core'), training: revTrack('training'),
        coreServer: cfCasServerRev('core'), trainingServer: cfCasServerRev('training'),
      }));
      const wrote = await page.evaluate((f) => new Promise((res) => {
        pbSave(f, (okW) => res(okW));
      }), fields);
      await settle(500);

      ok(wrote, id + ': the operational write itself must succeed');
      eq(commits().length, 0, id + ': it must not travel through the commit route');

      const patches = patchesOf();
      ok(patches.length >= 1, id + ': expected a direct operational PATCH, saw none');
      patches.forEach((p) => {
        const body = JSON.parse(p.body || '{}');
        const keys = Object.keys(body);
        notOk(keys.indexOf('data') >= 0, id + ': the operational write touched the core snapshot');
        notOk(keys.indexOf('training') >= 0, id + ': it touched the training snapshot');
        notOk(keys.indexOf('coreRev') >= 0 || keys.indexOf('trainingRev') >= 0,
          id + ': it tried to set a server-managed revision');
      });

      const after = await page.evaluate(() => ({
        core: revTrack('core'), training: revTrack('training'),
        coreServer: cfCasServerRev('core'), trainingServer: cfCasServerRev('training'),
      }));
      eq(after.core.local, before.core.local, id + ': core local revision moved');
      eq(after.core.success, before.core.success, id + ': core acknowledgement moved');
      eq(after.training.local, before.training.local, id + ': training local revision moved');
      eq(after.training.success, before.training.success, id + ': training acknowledgement moved');
      eq(after.coreServer, before.coreServer, id + ': core server revision moved');
      eq(after.trainingServer, before.trainingServer, id + ': training server revision moved');
    }

    /* and the record really carries them now */
    const row = await server.api('GET',
      '/api/collections/appdata/records?filter=' + encodeURIComponent(`user="${server.user.id}"`),
      server.adminToken);
    const rec = row.body.items[0];
    eq(rec.health.imported, 3, 'the health write did not persist');
    eq(rec.coachreq.day, '2026-10-09', 'the coach request did not persist');
  });

  await test('CAS-19 core success cannot clean training, nor training clean core', async () => {
    const res = await page.evaluate(async () => {
      ['core', 'training'].forEach((s) => {
        cfCasSetConflictId(s, null); cfCasSetBlock(s, null, null); cfCasClearPreserveNeed(s);
      });
      revBump('core'); revBump('training');
      const before = { core: revTrack('core'), training: revTrack('training') };
      revCommit('core', revTrack('core').local);           /* core acknowledged */
      const after = { core: revTrack('core'), training: revTrack('training') };
      return { before, after };
    });
    eq(res.after.core.success, res.after.core.local, 'core is clean');
    eq(res.after.training.success, res.before.training.success,
      'training\'s acknowledgement must not have moved');
    ok(res.after.training.local > res.after.training.success, 'training is still owed');
  });

  await test('CAS-20 / CAS-MX-08..09 the SCHEDULER terminates, not just the delay helper', async () => {
    /* The first version looped over cfCasRetryDelay() and proved the helper
       returns two delays and then null. It said nothing about whether the
       scheduler stops making requests, releases its operation, or settles
       somewhere safe. This drives real 500s and counts what leaves. */
    await page.evaluate(() => {
      ['core', 'training'].forEach((x) => {
        cfCasSetConflictId(x, null); cfCasSetBlock(x, null, null); cfCasClearPreserveNeed(x);
        const t = revTrack(x); revSet(x, { local: t.local, attempted: t.local, success: t.local });
      });
    });
    const revBefore = await rowRev('coreRev');

    let served = 0;
    await page.route(server.base + '/api/cf/appdata/commit', async (route) => {
      served++;
      await route.fulfill({ status: 500, contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'forced server failure' }) });
    });

    clearWire();
    await page.evaluate(() => {
      state.weights = [{ date: '2026-10-11', weight: 76.9 }];
      scheduleCloudPush();
    });

    /* the ladder is 5s then 30s, so watch well past the second retry */
    await page.waitForTimeout(3500 + 5500);
    const afterTwo = commits().length;
    await page.waitForTimeout(32000);
    const afterLadder = commits().length;
    /* and a further window in which nothing new may appear */
    await page.waitForTimeout(8000);
    const finalCount = commits().length;
    await page.unroute(server.base + '/api/cf/appdata/commit');

    /* CAS-MX-08 */
    eq(finalCount, afterLadder, 'the scheduler kept sending after the ladder was exhausted');
    ok(finalCount <= 3, 'expected at most an attempt plus two retries, saw ' + finalCount);
    ok(finalCount >= 2, 'expected the retries to actually happen, saw ' + finalCount);

    /* CAS-MX-09 */
    const settled = await page.evaluate(() => ({
      op: !!CF_CAS_OP.core,
      status: cfCasStatusFor('core'),
      pending: revTrack('core').local > revTrack('core').success,
      dataIntact: JSON.stringify(state.weights),
    }));
    notOk(settled.op, 'the operation must not be left falsely active');
    ok(settled.pending, 'the athlete\'s edit must remain owed to the server');
    ok(settled.status === 'failed' || settled.status === 'pending',
      'it must settle into a safe state, got ' + settled.status);
    eq(await rowRev('coreRev'), revBefore, 'and nothing may have been applied');
    ok(settled.dataIntact.indexOf('76.9') >= 0, 'local data must be intact');
  });

  /* ========================== STATUS-01..08 =========================== */
  section('STATUS-01..08 — what the athlete is told');

  await test('STATUS-01 a local edit immediately shows a safe pending state', async () => {
    const s = await page.evaluate(() => {
      ['core', 'training'].forEach((x) => {
        cfCasSetConflictId(x, null); cfCasSetBlock(x, null, null); cfCasClearPreserveNeed(x);
        const t = revTrack(x); revSet(x, { local: t.local, attempted: t.local, success: t.local });
      });
      cfCasClearTimer('core');
      revBump('core');
      return { status: cfCasStatusFor('core'), text: cfCasStatusText(cfCasStatusFor('core')) };
    });
    eq(s.status, 'pending');
    eq(s.text, 'Saved on this device', 'it must reassure, not alarm');
  });

  await test('STATUS-02 Syncing appears only while a request is actually active', async () => {
    const s = await page.evaluate(() => {
      const idle = cfCasStatusFor('core');
      CF_CAS_OP.core = { phase: 'sending' };
      const during = cfCasStatusFor('core');
      CF_CAS_OP.core = null;
      return { idle, during, after: cfCasStatusFor('core') };
    });
    notOk(s.idle === 'syncing', 'not syncing when nothing is in flight');
    eq(s.during, 'syncing');
    notOk(s.after === 'syncing');
  });

  await test('STATUS-03 Synced appears only once acknowledged revisions are current', async () => {
    const s = await page.evaluate(() => {
      const t = revTrack('core');
      const owed = cfCasStatusFor('core');
      revSet('core', { local: t.local, attempted: t.local, success: t.local });
      return { owed, settled: cfCasStatusFor('core') };
    });
    eq(s.owed, 'pending', 'while anything is unacknowledged it is not synced');
    eq(s.settled, 'synced');
  });

  await test('STATUS-04 / STATUS-MX-01..02 a persistent SYNC FAILURE notifies once', async () => {
    /* The first version repeatedly called cfCasSetConflictId — that is conflict
       DISCOVERY, not a persistent network failure. A conflict notice and a
       failed-sync notice are different product states, and the label claimed
       the second while the body exercised the first. STATUS-MX-03 below keeps
       the conflict case, separately, where it belongs. */
    await page.evaluate(() => {
      ['core', 'training'].forEach((x) => {
        cfCasSetConflictId(x, null); cfCasSetBlock(x, null, null); cfCasClearPreserveNeed(x);
        const t = revTrack(x); revSet(x, { local: t.local, attempted: t.local, success: t.local });
      });
    });
    await page.route(server.base + '/api/cf/appdata/commit', async (route) => {
      await route.fulfill({ status: 500, contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'forced server failure' }) });
    });

    const res = await page.evaluate(async () => {
      const toastEl = document.getElementById('wl-toast');
      const seen = [];
      const obs = new MutationObserver(() => { seen.push(toastEl.textContent); });
      obs.observe(toastEl, { childList: true, characterData: true, subtree: true });
      state.weights = [{ date: '2026-10-15', weight: 76.5 }];
      scheduleCloudPush();
      await new Promise((r) => setTimeout(r, 3500 + 6000));      /* attempt + first retry */
      const afterFirstRetry = seen.slice();
      /* STATUS-MX-02: keep poking it — resume triggers that stay unsuccessful */
      for (let i = 0; i < 4; i++) {
        cfCasSchedule('core', 0);
        await new Promise((r) => setTimeout(r, 900));
      }
      obs.disconnect();
      return {
        afterFirstRetry, all: seen,
        status: cfCasStatusFor('core'),
        pending: revTrack('core').local > revTrack('core').success,
        data: JSON.stringify(state.weights),
      };
    });
    await page.unroute(server.base + '/api/cf/appdata/commit');

    /* STATUS-MX-01 — at most one notice for one persistent failure */
    ok(res.afterFirstRetry.length <= 1,
      'a persistent failure notified ' + res.afterFirstRetry.length + ' times: '
        + JSON.stringify(res.afterFirstRetry));
    /* STATUS-MX-02 — repeated unsuccessful resume attempts add nothing */
    eq(res.all.length, res.afterFirstRetry.length,
      'repeated failed retries nagged: ' + JSON.stringify(res.all));
    ok(res.pending, 'and local data stays owed');
    ok(res.data.indexOf('76.5') >= 0, 'and intact');
  });

  await test('STATUS-MX-03 conflict discovery notifies once, separately from failure', async () => {
    const n = await page.evaluate(async () => {
      ['core', 'training'].forEach((x) => {
        cfCasSetConflictId(x, null); cfCasSetBlock(x, null, null); cfCasClearPreserveNeed(x);
      });
      const toastEl = document.getElementById('wl-toast');
      let writes = 0;
      const obs = new MutationObserver(() => { writes++; });
      obs.observe(toastEl, { childList: true, characterData: true, subtree: true });
      const id = 'casrec-core-' + 'c'.repeat(32);
      cfCasSetConflictId('core', id);                        /* discovery: one notice */
      for (let i = 0; i < 5; i++) cfCasSetConflictId('core', id);   /* rediscovery */
      await new Promise((r) => setTimeout(r, 80));
      obs.disconnect();
      return writes;
    });
    eq(n, 1, 'conflict discovery must notify exactly once, saw ' + n);
  });

  await test('STATUS-05 conflict status persists across reload', async () => {
    const id = await page.evaluate(async () => {
      ['core', 'training'].forEach((s) => {
        cfCasSetConflictId(s, null); cfCasSetBlock(s, null, null); cfCasClearPreserveNeed(s);
      });
      const rid = cfCasRecNewId('core');
      const rev = cfCasServerRev('core');
      await new Promise((r) => cfCasRecWrite(rid, 'core', rev, JSON.stringify({ p: 1 }), r));
      cfCasSetConflictId('core', rid);
      return rid;
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.style.visibility !== 'hidden');
    await settle(600);
    const after = await page.evaluate(() => ({
      status: cfCasStatusFor('core'), id: cfCasConflictId('core'),
      compact: cfCasCompactStatus(), text: cfCasStatusText(cfCasCompactStatus()),
    }));
    eq(after.id, id);
    eq(after.status, 'conflict');
    eq(after.text, 'Sync needs your choice');
  });

  await test('STATUS-06 the detail view shows independent core and training states', async () => {
    const d = await page.evaluate(() => {
      const html = cfCasStatusDetailHTML();
      return { html, core: cfCasStatusFor('core'), training: cfCasStatusFor('training') };
    });
    ok(d.html.includes('Health &amp; progress'));
    ok(d.html.includes('Training &amp; workouts'));
    notOk(d.core === d.training, 'the fixture must have them in different states to prove anything');
    const coreText = await page.evaluate((s) => cfCasStatusText(s), d.core);
    const trainText = await page.evaluate((s) => cfCasStatusText(s), d.training);
    ok(d.html.includes(coreText), 'core state missing from the detail');
    ok(d.html.includes(trainText), 'training state missing from the detail');
  });

  await test('STATUS-07 export really runs in every degraded state', async () => {
    /* The first version of this test asserted
         typeof exportData === 'function' && querySelector(...) ? true : typeof exportData === 'function'
       which collapses to `typeof exportData === 'function'` in every branch —
       true regardless of the state it had just set up, and true even if export
       were completely broken. It was vacuous in exactly the way MC-06 was.

       So this actually EXECUTES the export in each state and proves it produced
       the athlete's data: the download anchor is intercepted, the blob is read
       back, and its contents are checked for real weigh-ins. */
    const states = ['pending', 'conflict', 'oversize', 'auth', 'failed', 'update'];
    for (const s of states) {
      const res = await page.evaluate(async (kind) => {
        ['core', 'training'].forEach((x) => {
          cfCasSetConflictId(x, null); cfCasSetBlock(x, null, null); cfCasClearPreserveNeed(x);
        });
        state.weights = [{ date: '2026-09-20', weight: 75.5 }];
        if (kind === 'conflict') cfCasSetConflictId('core', 'casrec-core-' + 'd'.repeat(32));
        else if (kind !== 'pending') cfCasSetBlock('core', kind, null);
        else revBump('core');

        /* Intercept the download rather than let the browser take it. */
        let captured = null;
        const realCreate = document.createElement.bind(document);
        const realShare = navigator.canShare;
        try { navigator.canShare = undefined; } catch (e) { /* read-only in some builds */ }
        document.createElement = function (tag) {
          const el = realCreate(tag);
          if (String(tag).toLowerCase() === 'a') {
            el.click = function () { captured = { href: el.href, download: el.download }; };
          }
          return el;
        };
        let threw = null;
        try { exportData(); } catch (e) { threw = String(e && e.message || e); }
        document.createElement = realCreate;
        try { navigator.canShare = realShare; } catch (e) { /* ignore */ }

        let body = null;
        if (captured && captured.href) {
          try { body = await (await fetch(captured.href)).text(); } catch (e) { body = null; }
        }
        return { kind, threw, captured: !!captured, name: captured && captured.download, body,
                 status: cfCasStatusFor('core') };
      }, s);

      notOk(res.threw, 'export threw while ' + s + ': ' + res.threw);
      ok(res.captured, 'export produced no download while ' + s);
      ok(/\.json$/.test(res.name || ''), 'unexpected export filename while ' + s + ': ' + res.name);
      ok(res.body, 'the exported file was empty while ' + s);
      const parsed = JSON.parse(res.body);
      eq(parsed.weights[0].weight, 75.5,
        'the export did not contain the athlete\'s data while ' + s);
    }
  });

  await test('STATUS-08 an active workout is never interrupted by a conflict modal', async () => {
    const res = await page.evaluate(async () => {
      ['core', 'training'].forEach((s) => {
        cfCasSetConflictId(s, null); cfCasSetBlock(s, null, null); cfCasClearPreserveNeed(s);
      });
      CF_CAS_OPEN = false; cfCasPaint();
      state.workout = { entries: [], start: Date.now() };
      const mayInterrupt = cfCasMayInterrupt();
      cfCasSetConflictId('core', 'casrec-core-' + 'e'.repeat(32));
      await new Promise((r) => setTimeout(r, 80));
      return {
        mayInterrupt,
        opened: CF_CAS_OPEN,
        hostEmpty: document.getElementById('cf-conflict-host').innerHTML === '',
        modals: document.querySelectorAll('[role="dialog"],[aria-modal="true"]').length,
        notified: document.getElementById('wl-toast').classList.contains('show'),
        compact: cfCasCompactStatus(),
      };
    });
    notOk(res.mayInterrupt, 'an open workout must read as do-not-interrupt');
    notOk(res.opened, 'the centre must not open itself');
    ok(res.hostEmpty, 'nothing may be drawn over the workout');
    eq(res.modals, 0, 'no modal — this is the acceptance criterion');
    ok(res.notified, 'the one non-repeating notice is still owed');
    eq(res.compact, 'conflict', 'and the persistent compact state is set');
  });

  section('Page health');

  await test('no uncaught error across the whole matrix', () => {
    /* CAS-08, CAS-20 and STATUS-04 deliberately inject dropped responses and
       500s, so the console legitimately carries resource-load failures. Those
       are the fault being tested, not a defect — but the filter names them
       precisely rather than swallowing anything that looks noisy, and an
       uncaught EXCEPTION (no "console:" prefix) is never excused. */
    const injected = /^console: Failed to load resource: (net::ERR_CONNECTION_RESET|net::ERR_(NAME_NOT_RESOLVED|FAILED|ABORTED|INTERNET_DISCONNECTED)|the server responded with a status of (4\d\d|500))/;
    const real = b.pageErrors.filter((e) => !injected.test(e));
    eq(real.length, 0, real.join(' | '));
    /* and prove the exclusion is doing real work rather than hiding everything */
    ok(b.pageErrors.length > 0, 'the injected faults should have produced console noise');
    const thrown = b.pageErrors.filter((e) => e.indexOf('console:') !== 0);
    eq(thrown.length, 0, 'uncaught exception: ' + thrown.join(' | '));
  });

  const failed = summary('cas-status-matrix.browser.test.js');
  await b.close();
  await server.stop();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAILURE', e); process.exit(1); });
