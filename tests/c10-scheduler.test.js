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
    test('CAS-02 training likewise', async () => {
      const e2 = signedIn();
      e2.S.state.training = { sessions: [1] };
      e2.S.saveTraining();
      await pump(e2);
      eq(rawWrites(e2).length, 0);
      ok(commits(e2).length >= 1);
    });
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
    test('CAS-07 a replayed 200 is treated as success', async () => {
      const e2 = signedIn({ fetchResponses: (x) => (/commit/.test(x.url)
        ? { ok: true, status: 200, json: () => Promise.resolve({ ok: true, replay: true, subsystem: 'core', newRev: 3 }), text: () => Promise.resolve('') } : null) });
      e2.S.state.weights.push({ d: '2026-07-07', kg: 87 });
      e2.S.save();
      await pump(e2);
      notOk(e2.S.revIsDirty('core'));
      eq(e2.S.cfCasServerRev('core'), 3);
    });
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
    test('at most one request is in flight per subsystem', () => {
      eq(env.S.CF_CAS_INFLIGHT.core, null);
      eq(env.S.CF_CAS_INFLIGHT.training, null);
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

  report();
})());
