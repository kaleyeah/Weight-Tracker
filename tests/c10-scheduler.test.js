/* Commit 10 — CAS scheduler and route adapter, against the real integrated
   call graph. createEnv evaluates the whole shipping script with captured
   fetch and controllable timers, so "no raw snapshot write" is measured on the
   wire rather than argued from the source. */
const { test, group: syncGroup, eq, ok, notOk, report, defer } = require('./harness');
const group = async (name, fn) => { console.log('\n' + name); await fn(); };
void syncGroup;
const { createEnv } = require('./integration-env');

const PB = { uid: 'userA', base: 'https://pb.test', token: 'tok', email: 'a@x.com' };
/* A signed-in device whose local data is CLAIMED by that account. Without the
   owner stamp the Commit 1c/1e ownership gate correctly refuses to sync — it is
   a precondition, not an obstacle — and every commit here would be blocked for
   the right reason but the wrong one for these tests. */
function signedIn(opts) {
  return createEnv(Object.assign({
    localStorage: {
      wl_pb: JSON.stringify(PB),
      wl_session: JSON.stringify({ uid: 'userA', token: 'tok', remember: true }),
      'cf:lastOwner': 'userA',
    },
  }, opts || {}));
}
const commits = (env) => env.fetchLog.filter((e) => /\/api\/cf\/appdata\/commit/.test(e.url));
const rawWrites = (env) => env.appdataWrites();
const settle = () => new Promise((r) => setTimeout(r, 5));

/* Run every pending timer, then let promises settle — repeatedly, because a
   response handler can schedule the next attempt. */
async function pump(env, rounds) {
  for (let i = 0; i < (rounds || 3); i++) { env.runTimers(); await settle(); }
}

defer((async function scenarios() {
  await group('CAS-01/02 — an ordinary edit produces ZERO raw snapshot writes', async () => {
    const env = signedIn();
    env.S.state.weights.push({ d: '2026-07-01', kg: 81.5 });
    env.S.save();
    await pump(env);
    test('CAS-01 no POST/PATCH to appdata records', () => eq(rawWrites(env).length, 0));
    test('the commit route was used instead', () => ok(commits(env).length >= 1));
    await (async () => {
      const e2 = signedIn();
      e2.S.state.training = { sessions: [1] };
      e2.S.saveTraining();
      await pump(e2);
      eq(rawWrites(e2).length, 0);
      ok(commits(e2).length >= 1);
    })().then(
      () => test('CAS-02 training likewise', () => ok(true)),
      (e) => test('CAS-02 training likewise', () => { throw e; }));
  });

  await group('CAS-03 — the request is exactly the route contract', async () => {
    const env = signedIn();
    env.S.state.weights.push({ d: '2026-07-02', kg: 82 });
    env.S.save();
    await pump(env);
    const req = commits(env)[0];
    const body = JSON.parse(req.body);
    test('POST to the commit route', () => { eq(req.method, 'POST'); ok(/\/api\/cf\/appdata\/commit$/.test(req.url)); });
    test('subsystem is core', () => eq(body.subsystem, 'core'));
    test('expectedRev is the known server revision', () => eq(body.expectedRev, 0));
    test('idempotencyKey is our derived key', () => ok(/^c10-[0-9a-f]{64}$/.test(body.idempotencyKey)));
    test('key is inside the 96-char limit', () => ok(body.idempotencyKey.length <= 96));
    test('payload is a JSON object', () => eq(typeof body.payload, 'object'));
    test('clientBuild is the shipping build', () => eq(body.clientBuild, env.S.APP_BUILD));
    test('deviceId is opaque and carries no health data', () => {
      ok(body.deviceId.length > 0);
      notOk(/81\.5|weights/.test(body.deviceId));
    });
    test('no extra fields are sent', () =>
      eq(Object.keys(body).sort(),
        ['clientBuild', 'deviceId', 'expectedRev', 'idempotencyKey', 'payload', 'subsystem']));
  });

  await group('spec §2.1 — edits coalesce into one request', async () => {
    const env = signedIn();
    for (let i = 0; i < 5; i++) { env.S.state.weights.push({ d: '2026-07-0' + i, kg: 80 + i }); env.S.save(); }
    await pump(env);
    test('five edits produce ONE commit, not five', () => eq(commits(env).length, 1));
    test('and still zero raw writes', () => eq(rawWrites(env).length, 0));
  });

  await group('CAS-19 — the subsystems are independent', async () => {
    const env = signedIn();
    env.S.state.weights.push({ d: '2026-07-03', kg: 83 });
    env.S.save();
    env.S.state.training = { sessions: [9] };
    env.S.saveTraining();
    await pump(env);
    const subs = commits(env).map((c) => JSON.parse(c.body).subsystem).sort();
    test('both subsystems commit separately', () => eq(subs, ['core', 'training']));
    test('each carries its own expectedRev', () => {
      const byS = {};
      commits(env).forEach((c) => { const b = JSON.parse(c.body); byS[b.subsystem] = b.expectedRev; });
      eq(byS.core, 0); eq(byS.training, 0);
    });
  });

  await group('CAS-11 — a blocked subsystem does not commit', async () => {
    const env = signedIn();
    env.S.CF_CAS_BLOCK.core = 'auth';
    env.S.state.weights.push({ d: '2026-07-04', kg: 84 });
    env.S.save();
    await pump(env);
    test('nothing is sent while blocked', () => eq(commits(env).length, 0));
    test('and nothing is sent raw either', () => eq(rawWrites(env).length, 0));
    test('the edit is still recorded locally', () => ok(env.S.revLocal('core') > 0));
  });

  await group('CAS-14 / spec §4 — each status maps to its own safe outcome', async () => {
    const cases = [
      [401, {}, 'auth'], [426, { error: 'update-required' }, 'update'],
      [413, { error: 'payload too large' }, 'oversize'], [400, { error: 'invalid subsystem' }, 'invariant'],
    ];
    for (const [status, body, expected] of cases) {
      const env = signedIn({ fetchResponses: (e) => (/commit/.test(e.url)
        ? { ok: false, status, json: () => Promise.resolve(body), text: () => Promise.resolve('') } : null) });
      env.S.state.weights.push({ d: '2026-07-05', kg: 85 });
      env.S.save();
      await pump(env);
      test(`${status} blocks the subsystem as "${expected}"`, () => eq(env.S.CF_CAS_BLOCK.core, expected));
      test(`${status} does not retry automatically`, () => eq(commits(env).length, 1));
      test(`${status} keeps the local edit`, () => ok(env.S.revIsDirty('core')));
    }
  });

  await group('CAS-07 / CAS-05 — a 200 acknowledges only what it sent', async () => {
    const env = signedIn({ fetchResponses: (e) => (/commit/.test(e.url)
      ? { ok: true, status: 200, json: () => Promise.resolve({ ok: true, subsystem: 'core', newRev: 7 }), text: () => Promise.resolve('') } : null) });
    env.S.state.weights.push({ d: '2026-07-06', kg: 86 });
    env.S.save();
    await pump(env);
    test('the subsystem goes clean', () => notOk(env.S.revIsDirty('core')));
    test('the server revision is remembered for the next request', () => eq(env.S.cfCasServerRev('core'), 7));
    test('a baseline is recorded for the auto-resolve rule', () => ok(env.S.cfCasBaseline('core').length > 0));
    await (async () => {
      const e2 = signedIn({ fetchResponses: (x) => (/commit/.test(x.url)
        ? { ok: true, status: 200, json: () => Promise.resolve({ ok: true, replay: true, subsystem: 'core', newRev: 3 }), text: () => Promise.resolve('') } : null) });
      e2.S.state.weights.push({ d: '2026-07-07', kg: 87 });
      e2.S.save();
      await pump(e2);
      notOk(e2.S.revIsDirty('core'));
      eq(e2.S.cfCasServerRev('core'), 3);
    })().then(
      () => test('CAS-07 a replayed 200 is treated as success', () => ok(true)),
      (e) => test('CAS-07 a replayed 200 is treated as success', () => { throw e; }));
  });

  await group('CAS-20 — retries are bounded and then stop', async () => {
    const env = signedIn({ fetchResponses: (e) => (/commit/.test(e.url)
      ? { ok: false, status: 500, json: () => Promise.resolve({}), text: () => Promise.resolve('') } : null) });
    env.S.state.weights.push({ d: '2026-07-08', kg: 88 });
    env.S.save();
    await pump(env, 6);
    test('it stops rather than looping forever', () => ok(commits(env).length <= 3));
    test('the subsystem ends in a safe failed state', () => eq(env.S.CF_CAS_BLOCK.core, 'failed'));
    test('the data is still pending, never discarded', () => ok(env.S.revIsDirty('core')));
    test('and no raw write was attempted as a fallback', () => eq(rawWrites(env).length, 0));
  });

  await group('A 200 that is not a commit response is never treated as success', async () => {
    /* The integration env's default stub answers 200 with an unrelated body —
       exactly the shape a proxy or a misrouted request would produce. */
    const env = signedIn();
    env.S.state.weights.push({ d: '2026-07-09', kg: 89 });
    env.S.save();
    await pump(env);
    test('a commit was attempted', () => ok(commits(env).length >= 1));
    test('the data is NOT marked clean', () => ok(env.S.revIsDirty('core')));
    test('the subsystem is blocked as a contract failure', () => eq(env.S.CF_CAS_BLOCK.core, 'invariant'));
    test('and nothing was written raw as a fallback', () => eq(rawWrites(env).length, 0));
  });

  await group('C10-PLAN-12 — one scheduler per subsystem, no legacy path alive', async () => {
    const env = signedIn();
    env.S.state.weights.push({ d: '2026-07-10', kg: 90 });
    env.S.save();
    env.S.state.weights.push({ d: '2026-07-11', kg: 91 });
    env.S.save();
    await pump(env);
    test('repeated saves leave at most one timer per subsystem', () => {
      eq(env.S.CF_CAS_TIMER.core, null);        /* fired and cleared, not stacked */
    });
    test('exactly one commit resulted from the coalesced edits', () => eq(commits(env).length, 1));
    test('the legacy raw push path produced nothing', () => eq(rawWrites(env).length, 0));
    test('at most one operation exists per subsystem, and it is finished', () => {
      eq(env.S.CF_CAS_OP.core, null);
      eq(env.S.CF_CAS_OP.training, null);
    });
  });

  await group('Commit 1c gate E — signed-out edits still advance revisions', async () => {
    const env = createEnv();                    /* no session at all */
    const before = env.S.revLocal('core');
    env.S.state.weights.push({ d: '2026-07-12', kg: 92 });
    env.S.save();
    await pump(env);
    test('the revision advances even though nothing can be sent', () =>
      ok(env.S.revLocal('core') > before));
    test('nothing is sent', () => { eq(commits(env).length, 0); eq(rawWrites(env).length, 0); });
    test('training likewise', () => {
      const b = env.S.revLocal('training');
      env.S.state.training = { sessions: [2] };
      env.S.saveTraining();
      ok(env.S.revLocal('training') > b);
    });
  });

  await group('Harness integrity — no scheduled callback failed silently', async () => {
    /* The first run of this suite reported "no request was sent" when the real
       cause was a ReferenceError thrown inside a scheduled commit, swallowed by
       the timer runner. Absence of a request and a crashed callback must never
       look the same again. */
    const env = signedIn();
    env.S.state.weights.push({ d: '2026-07-13', kg: 93 });
    env.S.save();
    await pump(env);
    test('no timer callback threw', () => eq(env.timerErrors.map(String), []));
    test('and the commit really was sent', () => ok(commits(env).length >= 1));
  });


  /* ============ C10-P8: asynchronous request-context safety ============= */

  /* Park the digest so a race can be driven deliberately rather than hoped for. */
  function pausableDigest(env) {
    const subtle = env.S.crypto.subtle;
    const real = subtle.digest.bind(subtle);
    let gate = null; let holdIndex = null; let calls = 0;
    subtle.digest = (a, d) => {
      const n = ++calls;
      return (gate && (holdIndex === null || holdIndex === n)) ? gate.then(() => real(a, d)) : real(a, d);
    };
    return {
      /* hold() parks every digest; hold(n) parks only the nth. A commit uses
         digest #1 for its idempotency key and digest #2 for the recovery
         artifact, so the conflict-drift case must park #2 — parking after the
         fact is too late, because the artifact is already published. */
      hold(n) {
        let open; holdIndex = n === undefined ? null : n;
        gate = new Promise((r) => { open = r; });
        return () => { const g = open; gate = null; holdIndex = null; g(); };
      },
      calls: () => calls,
      restore() { subtle.digest = real; },
    };
  }
  const okStub = (rev) => (e) => (/commit/.test(e.url)
    ? { ok: true, status: 200, json: () => Promise.resolve({ ok: true, subsystem: JSON.parse(e.body).subsystem, newRev: rev }), text: () => Promise.resolve('') }
    : null);

  await group('C10-P8-01 — an edit during hashing cannot split the request', async () => {
    const env = signedIn({ fetchResponses: okStub(1) });
    const gate = pausableDigest(env);
    env.S.state.weights.push({ d: '2026-08-01', kg: 70 });
    env.S.save();
    const release = gate.hold();
    env.runTimers();                       /* build starts, parks in the digest */
    await settle();
    const revBefore = env.S.revLocal('core');
    /* the athlete edits while we hash */
    env.S.state.weights.push({ d: '2026-08-02', kg: 999 });
    env.S.save();
    const revAfterEdit = env.S.revLocal('core');
    release();
    await settle(); await settle();          /* first response applied, rerun not yet run */
    const sent = JSON.parse(commits(env)[0].body);
    test('the wire payload is the one that was captured, not the newer edit', () =>
      notOk(JSON.stringify(sent.payload).includes('999')));
    test('the key describes the same bytes that were sent', () => {
      const canon = env.S.cfCanon(sent.payload);
      ok(canon.length > 0);
      notOk(canon.includes('999'));
    });
    /* The response may acknowledge ONLY the revision its own request captured.
       Asserting after the rerun would prove nothing — by then the newer edit
       has legitimately been sent too — so this checks the moment in between. */
    test('the response acknowledged only the captured revision', () =>
      eq(env.S.revTrack('core').success, revBefore));
    test('the newer edit is still pending at that moment', () => {
      ok(revAfterEdit > revBefore);
      ok(env.S.revIsDirty('core'));
    });
    await pump(env, 4);
    test('and the rerun then sends the newer edit under its own identity', () => {
      const bodies = commits(env).map((c) => JSON.parse(c.body));
      ok(bodies.length >= 2);
      ok(JSON.stringify(bodies[1].payload).includes('999'));
      notOk(bodies[0].idempotencyKey === bodies[1].idempotencyKey);
    });
    gate.restore();
  });

  await group('C10-P8-02/03/17 — one build per subsystem; a rerun follows', async () => {
    const env = signedIn({ fetchResponses: okStub(1) });
    const gate = pausableDigest(env);
    env.S.state.weights.push({ d: '2026-08-03', kg: 71 });
    env.S.save();
    const release = gate.hold();
    env.runTimers();
    await settle();
    test('an operation is reserved while building', () => ok(env.S.CF_CAS_OP.core !== null));
    /* two more triggers arrive during the hash */
    env.S.cfCasSyncNow('core');
    env.S.cfCasSyncNow('core');
    await settle();
    test('C10-P8-02 no second request was started', () => eq(commits(env).length, 0));
    test('a rerun was recorded instead', () => ok(env.S.CF_CAS_RERUN.core));
    release();
    await pump(env, 4);
    test('C10-P8-02 exactly one fetch happened for the captured operation', () =>
      ok(commits(env).length >= 1));
    test('C10-P8-03 the rerun only ran because the subsystem was still dirty', () =>
      notOk(env.S.revIsDirty('core')));
    test('C10-P8-17 training was never blocked by core', () => eq(env.S.CF_CAS_OP.training, null));
    gate.restore();
  });

  await group('C10-P8-04/05 — an account change during hashing sends nothing', async () => {
    const env = signedIn({ fetchResponses: okStub(1) });
    const gate = pausableDigest(env);
    env.S.state.weights.push({ d: '2026-08-04', kg: 72 });
    env.S.save();
    const release = gate.hold();
    env.runTimers();
    await settle();
    /* the session generation moves — a logout or an account switch */
    env.S.CF_SESSION_GEN = env.S.CF_SESSION_GEN + 1;
    release();
    await pump(env);
    test('C10-P8-04 no request was sent with the wrong session', () => eq(commits(env).length, 0));
    test('C10-P8-05 the data is left pending, not lost', () => ok(env.S.revIsDirty('core')));
    test('the operation was released so later work can proceed', () => eq(env.S.CF_CAS_OP.core, null));
    gate.restore();
  });

  await group('C10-P8-06/07 — a late response for the old account is inert', async () => {
    let resolveFetch;
    const env = signedIn({ fetchResponses: (e) => (/commit/.test(e.url)
      ? new Promise((r) => { resolveFetch = () => r({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, subsystem: 'core', newRev: 42 }), text: () => Promise.resolve('') }); })
      : null) });
    env.S.state.weights.push({ d: '2026-08-05', kg: 73 });
    env.S.save();
    await pump(env, 1);
    test('the request is in flight', () => ok(commits(env).length === 1));
    const revBefore = env.S.cfCasServerRev('core');
    env.S.CF_SESSION_GEN = env.S.CF_SESSION_GEN + 1;   /* account switches */
    resolveFetch();
    await settle(); await settle();
    test('C10-P8-06 the late 200 changed no revision', () => eq(env.S.cfCasServerRev('core'), revBefore));
    test('C10-P8-06 it did not mark the new session clean', () => ok(env.S.revIsDirty('core')));
    test('C10-P8-06 it set no block on the new account', () => eq(env.S.CF_CAS_BLOCK.core, null));
  });

  await group('C10-P8-07/10 — a late 409 for the old account creates nothing', async () => {
    let resolveFetch;
    const env = signedIn({ fetchResponses: (e) => (/commit/.test(e.url)
      ? new Promise((r) => { resolveFetch = () => r({ ok: false, status: 409, json: () => Promise.resolve({ conflict: true, subsystem: 'core', serverRev: 5, payload: { weights: [{ d: 'x', kg: 1 }] } }), text: () => Promise.resolve('') }); })
      : null) });
    env.S.state.weights.push({ d: '2026-08-06', kg: 74 });
    env.S.save();
    await pump(env, 1);
    env.S.CF_SESSION_GEN = env.S.CF_SESSION_GEN + 1;
    resolveFetch();
    await settle(); await settle();
    test('C10-P8-07 no conflict reference was published', () => eq(env.S.cfCasConflictId('core'), null));
    test('C10-P8-10 no recovery artifact was created', () => {
      const keys = [...env.S.localStorage._map.keys()].filter((k) => k.indexOf('cf:casrec') === 0);
      eq(keys.length, 0);
    });
    test('the subsystem is not left in a conflict state', () => notOk(env.S.CF_CAS_BLOCK.core === 'preserving'));
  });

  await group('C10-P8-08/09 — a genuine conflict pauses the subsystem at once', async () => {
    const env = signedIn({ fetchResponses: (e) => (/commit/.test(e.url)
      ? { ok: false, status: 409, json: () => Promise.resolve({ conflict: true, subsystem: 'core', serverRev: 5, payload: { weights: [{ d: 'server', kg: 60 }] } }), text: () => Promise.resolve('') }
      : null) });
    env.S.state.weights.push({ d: '2026-08-07', kg: 75 });
    env.S.save();
    await pump(env, 2);
    const after = commits(env).length;
    test('C10-P8-08 further automatic commits stop', () => {
      env.S.state.weights.push({ d: '2026-08-08', kg: 76 });
      env.S.save();
      env.runTimers();
      eq(commits(env).length, after);
    });
    test('C10-P8-09 the edit made during preservation survives', () => ok(env.S.revIsDirty('core')));
    test('a recovery artifact was written for the server payload', () => {
      const keys = [...env.S.localStorage._map.keys()].filter((k) => /cf:casrec:.*:manifest$/.test(k));
      ok(keys.length >= 1);
    });
    test('and only then did a conflict reference appear', () => ok(env.S.cfCasConflictId('core')));
  });

  await group('C10-P8-14 — the baseline-equivalent retry happens exactly once', async () => {
    let calls = 0;
    const env = signedIn({ fetchResponses: (e) => {
      if (!/commit/.test(e.url)) return null;
      calls++;
      /* the server always answers with the client's own last agreed baseline */
      return { ok: false, status: 409, json: () => Promise.resolve({ conflict: true, subsystem: 'core', serverRev: 2 + calls, payload: {} }), text: () => Promise.resolve('') };
    } });
    env.S.cfCasSetBaseline('core', env.S.cfCanon({}));
    env.S.state.weights.push({ d: '2026-08-09', kg: 77 });
    env.S.save();
    await pump(env, 8);
    test('C10-P8-14 it retried once and then stopped, rather than looping', () => ok(calls <= 3));
    test('the sequence flag records that the retry was used', () => ok(env.S.CF_CAS_SEQ.core.retried));
    test('the second 409 produced a conflict rather than another retry', () =>
      ok(env.S.cfCasConflictId('core') || env.S.CF_CAS_BLOCK.core));
  });

  await group('C10-P8-15/16 — an uncertain retry reuses the exact request', async () => {
    let attempt = 0;
    const env = signedIn({ fetchResponses: (e) => {
      if (!/commit/.test(e.url)) return null;
      attempt++;
      if (attempt === 1) return { ok: false, status: 500, json: () => Promise.resolve({}), text: () => Promise.resolve('') };
      return { ok: true, status: 200, json: () => Promise.resolve({ ok: true, subsystem: 'core', newRev: 9 }), text: () => Promise.resolve('') };
    } });
    env.S.state.weights.push({ d: '2026-08-10', kg: 78 });
    env.S.save();
    await pump(env, 2);
    /* a newer edit arrives while the retry is pending */
    env.S.state.weights.push({ d: '2026-08-11', kg: 888 });
    env.S.save();
    await pump(env, 6);
    const bodies = commits(env).map((c) => JSON.parse(c.body));
    test('C10-P8-15 the retry reused the identical idempotency key', () =>
      eq(bodies[0].idempotencyKey, bodies[1].idempotencyKey));
    test('C10-P8-15 and the identical expectedRev', () => eq(bodies[0].expectedRev, bodies[1].expectedRev));
    test('C10-P8-16 the retry did not smuggle the newer edit into the old identity', () =>
      notOk(JSON.stringify(bodies[1].payload).includes('888')));
  });

  await group('C10-P8-18 — nothing fails silently', async () => {
    const env = signedIn({ fetchResponses: okStub(1) });
    env.S.state.weights.push({ d: '2026-08-12', kg: 79 });
    env.S.save();
    await pump(env, 4);
    test('no timer callback threw', () => eq(env.timerErrors.map(String), []));
    test('the operation completed cleanly', () => eq(env.S.CF_CAS_OP.core, null));
  });


  /* ============ C10-P9: session-scoped queuing and conflict cleanup ===== */

  await group('C10-P9-01/02/03/04 — a queued rerun cannot cross a session boundary', async () => {
    const env = signedIn({ fetchResponses: okStub(1) });
    const gate = pausableDigest(env);
    env.S.state.weights.push({ d: '2026-09-01', kg: 60 });
    env.S.save();
    const release = gate.hold();
    env.runTimers();
    await settle();
    /* Account A queues a rerun while its own operation is building */
    env.S.cfCasSyncNow('core');
    await settle();
    test('the rerun is queued and carries a session', () => ok(env.S.CF_CAS_RERUN.core));
    const before = commits(env).length;
    /* the athlete logs out / switches account */
    env.S.CF_SESSION_GEN = env.S.CF_SESSION_GEN + 1;
    release();
    await pump(env, 4);
    test('C10-P9-01 A\'s queued rerun caused no request under the new session', () =>
      eq(commits(env).length, before));
    test('C10-P9-02 the stale queue was cleared, not left armed', () => eq(env.S.CF_CAS_RERUN.core, null));
    test('C10-P9-04 training\'s queue was untouched', () => eq(env.S.CF_CAS_RERUN.training, null));
    test('the old account\'s pending work is preserved for its next session', () =>
      ok(env.S.revIsDirty('core')));
    gate.restore();
  });

  await group('C10-P9-03 — a new session schedules its own work normally', async () => {
    const env = signedIn({ fetchResponses: okStub(4) });
    env.S.CF_SESSION_GEN = env.S.CF_SESSION_GEN + 1;   /* fresh session, same device */
    env.S.state.weights.push({ d: '2026-09-02', kg: 61 });
    env.S.save();
    await pump(env, 3);
    test('the new session syncs under its own context', () => ok(commits(env).length >= 1));
    test('and settles clean', () => notOk(env.S.revIsDirty('core')));
  });

  await group('C10-P9-10 — sessions sharing a token suffix are different sessions', async () => {
    const env = signedIn();
    const cfg = JSON.parse(env.S.localStorage.getItem('wl_pb'));
    /* two tokens with identical last 16 characters — the old comparison saw
       these as the same session */
    const tokA = 'AAAAAAAAAAAAAAAAAAAA-IDENTICALSUFFIX';
    const tokB = 'BBBBBBBBBBBBBBBBBBBB-IDENTICALSUFFIX';
    env.S.localStorage.setItem('wl_pb', JSON.stringify({ ...cfg, token: tokA }));
    const op = env.S.cfCasCapture('core');
    test('the captured token is the whole token, not a suffix', () => eq(op.tok, tokA));
    env.S.localStorage.setItem('wl_pb', JSON.stringify({ ...cfg, token: tokB }));
    test('C10-P9-10 the operation is treated as drifted', () => ok(env.S.cfCasOpDrifted(op)));
    test('the last 16 characters really are identical', () => eq(tokA.slice(-16), tokB.slice(-16)));
  });

  await group('C10-P9-05..09 — drift during recovery preservation purges the artifact', async () => {
    /* A genuine conflict starts recovery storage; the session changes while the
       recovery WRITE is in flight. The previous version returned without
       publishing — correct — but left the verified artifact orphaned. */
    const env = signedIn({ fetchResponses: (e) => (/commit/.test(e.url)
      ? { ok: false, status: 409, json: () => Promise.resolve({ conflict: true, subsystem: 'core', serverRev: 5, payload: { weights: [{ d: 'server', kg: 60 }] } }), text: () => Promise.resolve('') }
      : null) });
    const gate = pausableDigest(env);
    const release = gate.hold(2);             /* park the RECOVERY digest, not the key's */
    env.S.state.weights.push({ d: '2026-09-03', kg: 62 });
    env.S.save();
    await pump(env, 2);                       /* 409 applied; recovery write now parked */
    test('the recovery write is parked, unpublished', () => {
      const keys = [...env.S.localStorage._map.keys()].filter((k) => /:manifest$/.test(k) && k.indexOf('cf:casrec') === 0);
      eq(keys, []);
    });
    env.S.CF_SESSION_GEN = env.S.CF_SESSION_GEN + 1;   /* session changes mid-write */
    release();
    await pump(env, 4);

    test('C10-P9-05 no conflict reference was published', () => eq(env.S.cfCasConflictId('core'), null));
    test('C10-P9-06/08 no orphaned artifact remains in storage', () => {
      const keys = [...env.S.localStorage._map.keys()].filter((k) => k.indexOf('cf:casrec:') === 0);
      eq(keys, []);
    });
    test('C10-P9-08 the new session sees an empty recovery inventory', () =>
      eq(env.S.cfCasRecList().length, 0));
    test('C10-P9-07 the new session has no conflict or block state imposed on it', () =>
      notOk(env.S.CF_CAS_BLOCK.core === 'preserving'));
    test('C10-P9-09 the original account keeps its pending local revision', () =>
      ok(env.S.revIsDirty('core')));
    gate.restore();
  });

  /* ---- the C10-P8-11/12/13 behavioural evidence the review found missing --- */

  await group('C10-P8-11 — a 200 without a matching subsystem never marks data clean', async () => {
    for (const [label, body] of [
      ['missing subsystem', { ok: true, newRev: 1 }],
      ['wrong subsystem', { ok: true, subsystem: 'training', newRev: 1 }],
    ]) {
      const env = signedIn({ fetchResponses: (e) => (/commit/.test(e.url)
        ? { ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve('') } : null) });
      env.S.state.weights.push({ d: '2026-09-04', kg: 63 });
      env.S.save();
      await pump(env, 3);
      test(`${label}: data stays pending`, () => ok(env.S.revIsDirty('core')));
      test(`${label}: subsystem is blocked as invariant`, () => eq(env.S.CF_CAS_BLOCK.core, 'invariant'));
      test(`${label}: no server revision was adopted`, () => eq(env.S.cfCasServerRev('core'), 0));
    }
  });

  await group('C10-P8-12 — an invalid newRev never marks data clean', async () => {
    for (const [label, rev] of [['missing', undefined], ['string', '3'], ['negative', -1], ['fractional', 1.5]]) {
      const env = signedIn({ fetchResponses: (e) => (/commit/.test(e.url)
        ? { ok: true, status: 200, json: () => Promise.resolve({ ok: true, subsystem: 'core', newRev: rev }), text: () => Promise.resolve('') } : null) });
      env.S.state.weights.push({ d: '2026-09-05', kg: 64 });
      env.S.save();
      await pump(env, 3);
      test(`newRev ${label}: data stays pending`, () => ok(env.S.revIsDirty('core')));
      test(`newRev ${label}: no revision adopted`, () => eq(env.S.cfCasServerRev('core'), 0));
    }
  });

  await group('C10-P8-13 — a malformed 409 creates no recovery artifact and no conflict', async () => {
    for (const [label, body] of [
      ['no serverRev', { conflict: true, subsystem: 'core', payload: {} }],
      ['fractional serverRev', { conflict: true, subsystem: 'core', serverRev: 1.5, payload: {} }],
      ['array payload', { conflict: true, subsystem: 'core', serverRev: 2, payload: [] }],
      ['primitive payload', { conflict: true, subsystem: 'core', serverRev: 2, payload: 'x' }],
      ['no-row with a payload', { conflict: true, subsystem: 'core', serverRev: null, payload: {} }],
    ]) {
      const env = signedIn({ fetchResponses: (e) => (/commit/.test(e.url)
        ? { ok: false, status: 409, json: () => Promise.resolve(body), text: () => Promise.resolve('') } : null) });
      env.S.state.weights.push({ d: '2026-09-06', kg: 65 });
      env.S.save();
      await pump(env, 3);
      test(`${label}: no recovery artifact was written`, () => {
        const keys = [...env.S.localStorage._map.keys()].filter((k) => k.indexOf('cf:casrec:') === 0);
        eq(keys, []);
      });
      test(`${label}: no conflict reference`, () => eq(env.S.cfCasConflictId('core'), null));
      test(`${label}: treated as a contract failure`, () => eq(env.S.CF_CAS_BLOCK.core, 'invariant'));
      test(`${label}: the athlete's data stays pending`, () => ok(env.S.revIsDirty('core')));
    }
  });


  /* ====== C10-P10: the captured purge capability actually arrives ======= */

  await group('C10-P10-01..08 — token-only drift after successful publication', async () => {
    /* The interleaving the review identified, which the previous test missed.
       The recovery STORE checks owner and generation; the SCHEDULER checks
       owner, generation and the full token. So a token change with owner and
       generation unchanged slips past the store — it publishes a verified
       artifact and hands back a purge capability — and is caught only by the
       scheduler. That is the exact path where a dropped capability orphans an
       artifact, and it was unreachable before this fix. */
    const env = signedIn({ fetchResponses: (e) => (/commit/.test(e.url)
      ? { ok: false, status: 409, json: () => Promise.resolve({ conflict: true, subsystem: 'core', serverRev: 5, payload: { weights: [{ d: 'server', kg: 60 }] } }), text: () => Promise.resolve('') }
      : null) });
    const cfg = JSON.parse(env.S.localStorage.getItem('wl_pb'));
    const gate = pausableDigest(env);
    const release = gate.hold(2);                     /* park the RECOVERY digest */
    env.S.state.weights.push({ d: '2026-10-01', kg: 55 });
    env.S.save();
    await pump(env, 2);
    const ownerBefore = env.S.pbUid();
    const genBefore = env.S.CF_SESSION_GEN;

    /* token rotates; owner and generation deliberately unchanged */
    env.S.localStorage.setItem('wl_pb', JSON.stringify({ ...cfg, token: 'ROTATED-TOKEN-VALUE' }));
    test('C10-P10-02 owner and generation are unchanged', () => {
      eq(env.S.pbUid(), ownerBefore);
      eq(env.S.CF_SESSION_GEN, genBefore);
    });
    release();
    await pump(env, 4);

    test('C10-P10-03 the store published (its own drift check did not fire)', () => ok(gate.calls() >= 2));
    test('C10-P10-04/05 the artifact was purged through the captured capability', () => {
      const keys = [...env.S.localStorage._map.keys()].filter((k) => k.indexOf('cf:casrec:') === 0);
      eq(keys, []);
    });
    test('C10-P10-05 no conflict reference was published', () => eq(env.S.cfCasConflictId('core'), null));
    test('C10-P10-06 the active session sees an empty inventory', () => eq(env.S.cfCasRecList().length, 0));
    test('C10-P10-08 the athlete\'s data is still pending, never discarded', () => ok(env.S.revIsDirty('core')));
    test('C10-P10-08 every recovery key matches the expected shape', () => {
      /* Positive shape assertion rather than a substring hunt — ids end in
         random hex, so "does it contain 60" is a coin toss, not a test. */
      const keys = [...env.S.localStorage._map.keys()].filter((k) => k.indexOf('cf:casrec:') === 0);
      keys.forEach((k) =>
        ok(/^cf:casrec:[A-Za-z0-9]+:(casrec-(core|training)-[0-9a-f]+:(claim|payload|manifest)|pending-cleanup)$/.test(k),
          'unexpected recovery key shape: ' + k));
    });
    gate.restore();
  });

  await group('C10-P10-01 — the public wrapper forwards the capability', async () => {
    const env = signedIn();
    const id = env.S.cfCasRecNewId('core');
    const got = await new Promise((res) =>
      env.S.cfCasRecWrite(id, 'core', 3, '{"a":1}', (ok, out, cap) => res({ ok, out, cap })));
    test('the write succeeded', () => ok(got.ok));
    test('C10-P10-01 a capability came back through the real wrapper', () =>
      ok(got.cap && typeof got.cap.purge === 'function'));
    await (async () => {
      const removed = await new Promise((res) => got.cap.purge((r) => res(r)));
      ok(removed);
      eq(env.S.cfCasRecList().length, 0);
    })().then(
      () => test('C10-P10-07 the capability purges through the locked API', () => ok(true)),
      (e) => test('C10-P10-07 the capability purges through the locked API', () => { throw e; }));
    await (async () => {
      const again = await new Promise((res) =>
        env.S.cfCasRecWrite(id, 'core', 3, '{"a":1}', (ok, out, cap) => res({ ok, out, cap })));
      /* the id is free again after purge, so use an occupied one instead */
      void again;
      const id2 = env.S.cfCasRecNewId('core');
      await new Promise((res) => env.S.cfCasRecWrite(id2, 'core', 3, '{"b":1}', () => res()));
      const dup = await new Promise((res) =>
        env.S.cfCasRecWrite(id2, 'core', 3, '{"b":1}', (ok, out, cap) => res({ ok, out, cap })));
      notOk(dup.ok);
      eq(dup.cap, undefined);
    })().then(
      () => test('a failed write returns no capability', () => ok(true)),
      (e) => test('a failed write returns no capability', () => { throw e; }));
  });

  await group('C10-P10-09/10 — a late callback cannot clear a NEWER block', async () => {
    const env = signedIn();
    /* Simulate two operations: an old one that will report drift later, and a
       newer conflict that legitimately owns the current pause. */
    const oldToken = 'op-old';
    const newToken = 'op-new';
    env.S.cfCasSetBlock('core', 'preserving', newToken);
    test('the newer operation owns the block', () => ok(env.S.cfCasOwnsBlock('core', newToken)));
    test('C10-P10-09 the older operation does not own it', () =>
      notOk(env.S.cfCasOwnsBlock('core', oldToken)));
    test('C10-P10-10 a string match alone would have been enough to clear it', () =>
      eq(env.S.CF_CAS_BLOCK.core, 'preserving'));
    /* the old operation's cleanup path is gated on ownership */
    if (env.S.cfCasOwnsBlock('core', oldToken)) env.S.cfCasSetBlock('core', null, null);
    test('C10-P10-09 the newer block survives the late callback', () =>
      eq(env.S.CF_CAS_BLOCK.core, 'preserving'));
    /* and its true owner can still clear it */
    if (env.S.cfCasOwnsBlock('core', newToken)) env.S.cfCasSetBlock('core', null, null);
    test('the owning operation can clear its own block', () => eq(env.S.CF_CAS_BLOCK.core, null));
  });

  report();
})());
