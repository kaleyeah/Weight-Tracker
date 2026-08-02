/* C11 — training durability, against the LIVE app's real integrated call graph.

   Run against the deployed lineage:

       CF_SRC=/home/griffin/projects/compound-app/index.html \
         node tests/c11-training-durability.test.js

   These cover the 2026-07-31 loss: a completed lift session was saved locally,
   its push failed silently, and the next trainingPull overwrote the only good
   copy from the stale server. Every case below asserts on what is actually on
   disk (localStorage) after the scenario, because "the only copy still exists"
   is the property that was violated -- not anything about in-memory state. */
const { test, eq, ok, notOk, report, defer, SRC } = require('./harness');

/* This suite targets the DEPLOYED lineage in ~/projects/compound-app, not this
   repo's parked Commit 10 candidate -- they are different sync implementations
   and these assertions only describe the former. run-all.js globs every
   *.test.js with no CF_SRC, so without this it would run against the wrong file
   and report a failure that means nothing. Skipping loudly beats a red result
   nobody can act on, and beats a silent pass even more. */
if (!process.env.CF_SRC) {
  console.log('\nC11 — training durability: SKIPPED (targets the live app, not this repo)');
  console.log('  run: CF_SRC=/home/griffin/projects/compound-app/index.html node tests/c11-training-durability.test.js');
  module.exports = Promise.resolve();
  return;
}
console.log('\nC11 — training durability\n  source: ' + SRC);

const { createEnv } = require('./integration-env');

/* A scenario that throws is recorded and the rest still run. On the UNFIXED
   source the data is already gone by the time later steps touch it, so an
   uncaught throw would hide every case after it -- exactly when the full
   picture matters most. */
const group = async (name, fn) => {
  console.log('\n' + name);
  try { await fn(); } catch (e) { test(name + ' — scenario threw', () => { throw e; }); }
};
const PB = { uid: 'userA', base: 'https://pb.test', token: 'tok', email: 'a@x.com' };
const settle = () => new Promise((r) => setTimeout(r, 5));
async function pump(env, n) { for (let i = 0; i < (n || 6); i++) { env.runTimers(); await settle(); } }

/* ---- fixtures ---------------------------------------------------------- */
/* liftSessions[date] is an ARRAY of exercises, each with its own sets. */
const SERVER_TRAINING = {
  cardioTypes: ['Peloton'],
  exercises: [{ id: 'e1', name: 'Squat', muscle: 'legs' }],
  routines: [{ id: 'r-1784875593790-csbt', name: 'Full Body Day 3', items: [] }],
  sessions: {},
  liftSessions: {
    '2026-07-27': [{ name: 'Squat', sets: [{ w: 100, r: 5 }] }],
    '2026-07-29': [{ name: 'Bench', sets: [{ w: 80, r: 5 }] }],
  },
};
const THE_WORKOUT = [
  { name: 'Deadlift', sets: [{ w: 140, r: 5 }, { w: 140, r: 5 }] },
  { name: 'Overhead press', sets: [{ w: 50, r: 8 }] },
];
const clone = (o) => JSON.parse(JSON.stringify(o));

const dump = (env) => Object.fromEntries(env.S.localStorage._map);
const storedTraining = (env) => { try { return JSON.parse(dump(env).wl_training_v1 || '{}'); } catch (e) { return {}; } };
const hasWorkout = (env) => !!(storedTraining(env).liftSessions || {})['2026-07-31'];
const isDirty = (env) => dump(env).wl_training_dirty === '1';

/* The last write whose body actually carried training, ignoring core saves. */
const trainingWriteBody = (env) => {
  for (let i = env.trainingWrites.length - 1; i >= 0; i--) {
    try { const b = JSON.parse(env.trainingWrites[i].body || '{}'); if ('training' in b) return b; } catch (e) {}
  }
  return null;
};
const recordBody = (training) => ({
  ok: true, status: 200, text: () => Promise.resolve(''),
  json: () => Promise.resolve({ items: [{ id: 'rec1', user: 'userA', training, trainingRev: 11 }] }),
});
const FAIL_5XX = { ok: false, status: 500, text: () => Promise.resolve(''), json: () => Promise.resolve({}) };

/* A signed-in device whose local training already matches the server.

   Every response is a FRESH clone of the fixture. normTraining() reuses the
   parsed response's sub-objects by reference, so a clean pull leaves
   state.training.liftSessions aliased to whatever object the fetch returned --
   harmless in a browser, where each fetch parses fresh JSON, but with a shared
   constant it lets one scenario's edits leak into every later one. */
function device(opts) {
  opts = opts || {};
  const server = clone(opts.server || SERVER_TRAINING);
  const writes = [];
  /* The mock server STORES what it acknowledges. A static one that always
     replays the seed would report a permanently stale copy even after a write
     it said succeeded, and the app would rightly adopt it -- proving nothing
     except that the mock lies. Read-after-write consistency is an assumption
     about PocketBase (single-node SQLite, and the GET already sends
     cache:"no-store"), stated here because the suite depends on it. */
  const state = { training: clone(server) };
  const applyWrite = (e) => {
    try { const b = JSON.parse(e.body || '{}'); if ('training' in b) state.training = clone(b.training); } catch (_) {}
  };
  const env = createEnv({
    localStorage: Object.assign({
      wl_pb: JSON.stringify(PB),
      wl_training_v1: JSON.stringify(server),
    }, opts.localStorage || {}),
    fetchResponses: (e) => {
      if (!/appdata\/records/.test(e.url)) return null;
      if (e.method === 'GET') return recordBody(clone(opts.serverNow ? opts.serverNow() : state.training));
      writes.push(e);
      const res = opts.onWrite ? opts.onWrite(e) : null;
      if (res === null || res === undefined) { applyWrite(e); return null; }   /* default 200 OK */
      return Promise.resolve(res).then((r) => { if (r && r.ok) applyWrite(e); return r; });
    },
  });
  env.trainingWrites = writes;
  env.serverTraining = () => clone(state.training);
  return env;
}
/* Carry storage across a "restart" the way a real reload does. */
const restart = (env, opts) => device(Object.assign({ localStorage: dump(env) }, opts || {}));

defer((async function scenarios() {

  await group('C11-01 — killed before the debounce fires', async () => {
    const env = device();
    env.S.state.training.liftSessions['2026-07-31'] = clone(THE_WORKOUT);
    env.S.saveTraining();
    /* No pump: the process dies inside the 1600ms window. */
    test('the session is already on disk', () => ok(hasWorkout(env)));
    test('dirty was recorded BEFORE the debounce, so the restart knows', () => ok(isDirty(env)));
    test('no write was attempted yet', () => eq(env.trainingWrites.length, 0));

    const env2 = restart(env);
    await pump(env2);
    env2.S.autoSync();
    await pump(env2);
    test('after restart + autoSync the session still exists', () => ok(hasWorkout(env2)));
  });

  await group('C11-02 — the push fails (offline, then 5xx)', async () => {
    for (const [label, mode] of [['offline', 'offline'], ['5xx', '5xx']]) {
      const env = device({ onWrite: () => (mode === 'offline' ? Promise.reject(new Error('down')) : FAIL_5XX) });
      env.S.state.training.liftSessions['2026-07-31'] = clone(THE_WORKOUT);
      env.S.saveTraining();
      await pump(env);
      test(`${label}: a write was attempted`, () => ok(env.trainingWrites.length >= 1));
      test(`${label}: the session survives on disk`, () => ok(hasWorkout(env)));
      test(`${label}: still dirty, so it will be retried`, () => ok(isDirty(env)));
      test(`${label}: the failure is visible in the sync state`, () => ok(['error', 'offline'].includes(env.S.syncState.s)));
    }
  });

  await group('C11-03 — refresh with dirty local data (the 2026-07-31 loss)', async () => {
    const env = device({ onWrite: () => Promise.reject(new Error('down')) });
    env.S.state.training.liftSessions['2026-07-31'] = clone(THE_WORKOUT);
    env.S.saveTraining();
    await pump(env);
    const before = hasWorkout(env);

    const env2 = restart(env, { onWrite: () => Promise.reject(new Error('down')) });
    await pump(env2);
    env2.S.autoSync();
    await pump(env2);

    test('present before the refresh', () => ok(before));
    test('THE REGRESSION TEST: still present after the refresh', () => ok(hasWorkout(env2)));
    test('the stale server copy did not replace it', () => {
      const t = storedTraining(env2);
      eq(Object.keys(t.liftSessions).sort(), ['2026-07-27', '2026-07-29', '2026-07-31']);
    });
    test('the sets are intact, not just the date key', () => {
      eq(storedTraining(env2).liftSessions['2026-07-31'], THE_WORKOUT);
    });
  });

  await group('C11-04 — the retry succeeds once the network returns', async () => {
    const env = device({ onWrite: () => Promise.reject(new Error('down')) });
    /* A normal synced boot first, so an agreed base identity exists -- this is
       the ordinary case, distinct from the never-synced one in C11-10. */
    env.S.autoSync();
    await pump(env, 8);
    env.S.state.training.liftSessions['2026-07-31'] = clone(THE_WORKOUT);
    env.S.saveTraining();
    await pump(env);
    test('dirty after the failure', () => ok(isDirty(env)));

    /* Restart with the network back. autoSync -> trainingPull sees dirty +
       an unchanged server, and retries instead of adopting. */
    const env2 = restart(env, {});
    await pump(env2);
    env2.S.autoSync();
    await pump(env2, 10);
    /* Search every write: an ordinary core save lands too, and a single-slot
       capture would just record whichever happened to be last. */
    const sent = trainingWriteBody(env2);

    test('the lost write was retried', () => ok(sent && sent.training));
    test('it carried the missing session', () => eq(sent.training.liftSessions['2026-07-31'], THE_WORKOUT));
    test('dirty is cleared only after the server acknowledged', () => notOk(isDirty(env2)));
    test('the session is still on disk', () => ok(hasWorkout(env2)));
    test('an acknowledged base identity was recorded', () => ok((dump(env2).wl_training_base || '').length > 0));
  });

  await group('C11-05 — an edit made while the push is in flight is not marked saved', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const env = device({ onWrite: () => gate.then(() => ({ ok: true, status: 200, text: () => Promise.resolve(''), json: () => Promise.resolve({ id: 'rec1' }) })) });

    env.S.state.training.liftSessions['2026-07-31'] = clone(THE_WORKOUT);
    env.S.saveTraining();
    await pump(env, 2);                    /* push is now in flight, gated */

    /* A second exercise is added while the first request is still open. */
    env.S.state.training.liftSessions['2026-07-31'].push({ name: 'Curl', sets: [{ w: 20, r: 12 }] });
    env.S.saveTraining();
    release();
    await settle();                        /* the in-flight callback runs HERE */

    /* Asserted before any follow-up push can run, because the property under
       test is what the completing request did -- not where the app settles. */
    test('the in-flight success did NOT mark the newer edit as saved', () => ok(isDirty(env)));
    test('the newer edit is on disk', () => eq(storedTraining(env).liftSessions['2026-07-31'].length, 3));

    await pump(env, 4);                    /* now let the follow-up push run */
    test('a follow-up push carried the newer edit', () => {
      const last = JSON.parse(env.trainingWrites[env.trainingWrites.length - 1].body);
      eq(last.training.liftSessions['2026-07-31'].length, 3);
    });
    test('only then is it clean', () => notOk(isDirty(env)));
  });

  await group('C11-06 — a clean device still adopts the server copy', async () => {
    const env = device();
    test('starts clean', () => notOk(isDirty(env)));
    env.S.autoSync();
    await pump(env, 8);
    test('the server copy was adopted', () => {
      eq(Object.keys(storedTraining(env).liftSessions).sort(), ['2026-07-27', '2026-07-29']);
    });
    test('still clean afterwards', () => notOk(isDirty(env)));
    test('the adopted revision identity was persisted', () => ok((dump(env).wl_training_base || '').length > 0));
  });

  await group('C11-07 — both sides changed: keep both, resolve neither', async () => {
    /* Local has the unsynced workout; the server has meanwhile gained a
       session this device has never seen. */
    const serverMoved = clone(SERVER_TRAINING);
    serverMoved.liftSessions['2026-07-30'] = [{ name: 'Row', sets: [{ w: 60, r: 10 }] }];

    const env = device({ onWrite: () => Promise.reject(new Error('down')) });
    env.S.state.training.liftSessions['2026-07-31'] = clone(THE_WORKOUT);
    env.S.saveTraining();
    await pump(env);

    const env2 = restart(env, { server: serverMoved, onWrite: () => Promise.reject(new Error('down')) });
    await pump(env2);
    env2.S.autoSync();
    await pump(env2, 8);

    test('local work was NOT overwritten', () => ok(hasWorkout(env2)));
    test('the server copy was retained alongside it', () => {
      const c = JSON.parse(dump(env2).wl_training_conflict || 'null');
      ok(c && c.server, 'no conflict record');
      ok(c.server.liftSessions['2026-07-30'], 'retained copy is missing the server-only session');
    });
    test('nothing was auto-merged into the live copy', () => {
      notOk(storedTraining(env2).liftSessions['2026-07-30'], 'server-only session leaked into local');
    });
    test('the conflict is surfaced, not silent', () => {
      eq(env2.S.syncState.s, 'error');
      ok(/both copies kept/.test(env2.S.syncState.msg || ''));
    });
    test('it stays dirty until resolved', () => ok(isDirty(env2)));
  });

  await group('C11-08 — core and training dirty flags are independent', async () => {
    /* Training push fails; core push succeeds. Core clearing its own flag must
       not report training as saved. */
    const env = device({
      onWrite: (e) => {
        const b = JSON.parse(e.body || '{}');
        return ('training' in b) ? Promise.reject(new Error('down')) : null;   /* core writes succeed */
      },
    });
    env.S.state.training.liftSessions['2026-07-31'] = clone(THE_WORKOUT);
    env.S.saveTraining();
    await pump(env);
    test('training is dirty after its push failed', () => ok(isDirty(env)));

    env.S.state.weights.push({ date: '2026-07-31', w: 184.2 });
    env.S.save();
    await pump(env, 8);

    test('the successful core save cleared CORE dirty', () => eq(dump(env).wl_dirty, '0'));
    test('but training is STILL dirty', () => ok(isDirty(env)));
    test('and the session is still on disk', () => ok(hasWorkout(env)));
  });

  await group('C11-09 — no scenario leaves the session as the only lost copy', async () => {
    /* The whole-suite invariant, stated once explicitly: across every failure
       path above, the on-disk copy of 2026-07-31 is never removed by anything
       other than an acknowledged server write that contains it. */
    const paths = [
      ['push rejected', () => Promise.reject(new Error('down'))],
      ['push 5xx', () => FAIL_5XX],
      ['push 401', () => ({ ok: false, status: 401, text: () => Promise.resolve(''), json: () => Promise.resolve({}) })],
    ];
    for (const [label, onWrite] of paths) {
      const a = device({ onWrite });
      a.S.state.training.liftSessions['2026-07-31'] = clone(THE_WORKOUT);
      a.S.saveTraining();
      await pump(a);
      const b = restart(a, { onWrite });
      await pump(b);
      b.S.autoSync();
      await pump(b, 8);
      test(`${label}: survives save -> fail -> restart -> autoSync`, () => ok(hasWorkout(b)));
    }
  });

  await group('C11-10 — never synced before: the ancestor case is a retry, not a conflict', async () => {
    /* The first failure after an upgrade has no agreed base identity recorded.
       The server copy is nonetheless an ANCESTOR of local -- local is exactly it
       plus the new session -- so the safe direction is knowable without merging,
       and the lost write is retried rather than parked as a false conflict. */
    const env = device({ onWrite: () => Promise.reject(new Error('down')) });
    test('no base identity exists yet', () => eq(dump(env).wl_training_base, undefined));
    env.S.state.training.liftSessions['2026-07-31'] = clone(THE_WORKOUT);
    env.S.saveTraining();
    await pump(env);

    const env2 = restart(env, {});
    await pump(env2);
    env2.S.autoSync();
    await pump(env2, 10);
    const sent = trainingWriteBody(env2);

    test('it was NOT recorded as a conflict', () => eq(dump(env2).wl_training_conflict, undefined));
    test('the lost write was retried instead', () => ok(sent && sent.training));
    test('carrying the session', () => eq(sent.training.liftSessions['2026-07-31'], THE_WORKOUT));
    test('and it is now clean', () => notOk(isDirty(env2)));
  });

  await group('C11-11 — a stored conflict cannot be hidden by a later core save', async () => {
    const serverMoved = clone(SERVER_TRAINING);
    serverMoved.liftSessions['2026-07-30'] = [{ name: 'Row', sets: [{ w: 60, r: 10 }] }];

    const env = device({ onWrite: () => Promise.reject(new Error('down')) });
    env.S.state.training.liftSessions['2026-07-31'] = clone(THE_WORKOUT);
    env.S.saveTraining();
    await pump(env);

    /* Restart against the moved server, with CORE writes succeeding. */
    const env2 = restart(env, {
      server: serverMoved,
      onWrite: (e) => (('training' in JSON.parse(e.body || '{}')) ? Promise.reject(new Error('down')) : null),
    });
    await pump(env2);
    env2.S.autoSync();
    await pump(env2, 8);
    test('the conflict is recorded', () => ok(dump(env2).wl_training_conflict));

    /* A perfectly ordinary core save lands afterwards and reports success. */
    env2.S.state.weights.push({ date: '2026-08-01', w: 183.9 });
    env2.S.save();
    await pump(env2, 8);

    test('core reported its own success', () => eq(dump(env2).wl_dirty, '0'));
    test('but the conflict is still on screen', () => {
      eq(env2.S.syncState.s, 'error');
      ok(/both copies kept/.test(env2.S.syncState.msg || ''));
    });
    test('and local training is still intact', () => ok(hasWorkout(env2)));
  });

})());

module.exports = report();
