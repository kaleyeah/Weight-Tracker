/* C12 — the application-data JSON backup must contain training. EXPORT ONLY.

       CF_SRC=/home/griffin/projects/compound-app/index.html \
         node tests/c12-backup-training.test.js

   backupJSON() originated as payload(), which has no `training` field, and the
   inspected history contains no training addition before this change. So backups
   produced by the current lineage carry no exercises, routines, cardio sessions
   or lift sessions -- the one category of data with no second copy anywhere once
   the server copy is wrong.

   Restore is deliberately NOT covered and deliberately NOT changed: applyImport()
   would push restored training through the known-broken sync path. Restore lands
   with the sync durability work, not here.

   Fixtures are seeded in their already-migrated shape (exercises carry
   `movement`, routine items carry `progression`) so boot-time normalisation does
   not rewrite them. That lets these assertions compare FULL values rather than
   just ids and names. */
const { test, eq, ok, notOk, report, SRC } = require('./harness');

if (!process.env.CF_SRC) {
  console.log('\nC12 — backup contains training: SKIPPED (targets the live app, not this repo)');
  console.log('  run: CF_SRC=/home/griffin/projects/compound-app/index.html node tests/c12-backup-training.test.js');
  module.exports = Promise.resolve();
  return;
}
console.log('\nC12 — backup contains training (export only)\n  source: ' + SRC);

const { createEnv } = require('./integration-env');

const TRAINING = {
  cardioTypes: ['Peloton', 'Rowing'],
  exercises: [{ id: 'e1', name: 'Squat', muscle: 'legs', movement: 'compound' }],
  routines: [{ id: 'r-1784875593790-csbt', name: 'Full Body Day 3',
               items: [{ exId: 'e1', sets: 3, progression: 'double' }] }],
  sessions: { '2026-07-30': [{ kind: 'cardio', type: 'Peloton', mins: 30, kcal: 320 }] },
  liftSessions: { '2026-07-31': [{ name: 'Deadlift', sets: [{ w: 140, r: 5 }, { w: 140, r: 5 }] }] },
};
const clone = (o) => JSON.parse(JSON.stringify(o));

const env = createEnv({ localStorage: { wl_training_v1: JSON.stringify(TRAINING) } });
const fetchesBefore = env.fetchLog.length;
const lsBefore = JSON.stringify(Object.fromEntries(env.S.localStorage._map));
const trainingBefore = clone(env.S.state.training);
const payloadBefore = clone(env.S.payload());

const raw = env.S.backupJSON();
const backup = JSON.parse(raw);

/* ---- contents ----------------------------------------------------------- */
test('the backup carries a training history block', () => ok(backup.trainingHistory));
test('lift sessions match in full, sets and all', () => eq(backup.trainingHistory.liftSessions, TRAINING.liftSessions));
test('cardio sessions match in full', () => eq(backup.trainingHistory.sessions, TRAINING.sessions));
test('routines match in full, including item progression', () => eq(backup.trainingHistory.routines, TRAINING.routines));
test('exercises match in full', () => eq(backup.trainingHistory.exercises, TRAINING.exercises));
test('cardio types are carried', () => eq(backup.trainingHistory.cardioTypes, TRAINING.cardioTypes));
test('every core field payload() produces is present', () => {
  Object.keys(payloadBefore).forEach((k) => ok(k in backup, 'missing core field: ' + k));
});

/* ---- the metadata envelope ---------------------------------------------- */
test('a format version is recorded', () => eq(backup.__backup.format, 2));
test('the app build is recorded', () => eq(backup.__backup.appBuild, env.S.APP_BUILD));
test('a creation timestamp is recorded', () => ok(/^\d{4}-\d{2}-\d{2}T/.test(backup.__backup.createdAt)));
test('metadata is namespaced so it cannot be mistaken for app data', () => {
  ok('__backup' in backup);
  notOk('format' in backup, 'bare `format` would collide with app data');
});

/* ---- isolation from the sync path --------------------------------------- */
/* payload() feeds saveLocal() AND the server's `data` field. If training leaked
   into it, every sync would start writing training into the core subsystem,
   which has its own field and its own revision counter. */
test('training did NOT leak into payload()', () => notOk('training' in env.S.payload()));
test('__backup did NOT leak into payload()', () => notOk('__backup' in env.S.payload()));
test('payload() is byte-identical to before the export', () => eq(env.S.payload(), payloadBefore));

/* ---- export is non-destructive and offline ------------------------------ */
test('exporting did not mutate in-memory training', () => eq(env.S.state.training, trainingBefore));
test('exporting did not mutate localStorage', () => {
  eq(JSON.stringify(Object.fromEntries(env.S.localStorage._map)), lsBefore);
});
test('exporting issued no network request', () => eq(env.fetchLog.length, fetchesBefore));
test('the serialized form is valid, re-parsable JSON', () => {
  eq(JSON.parse(raw).trainingHistory.liftSessions, TRAINING.liftSessions);
});

/* ---- restore is untouched by this change -------------------------------- */
/* applyImport() is NOT modified here. Restoring on this build applies core and
   leaves training exactly as it is -- it does not wipe it, and it does not
   restore it either. Both halves of that matter, so both are asserted. */
const env2 = createEnv({ localStorage: { wl_training_v1: JSON.stringify(TRAINING) } });
env2.S.askConfirm = (msg, fn) => fn();
env2.S.applyImport(JSON.stringify(Object.assign({}, env2.S.payload(), { training: { liftSessions: {}, exercises: [] } })));
test('restoring does not WIPE existing training on this build', () => {
  eq(env2.S.state.training.liftSessions, TRAINING.liftSessions);
  eq(env2.S.state.training.exercises, TRAINING.exercises);
});
test('and it does not silently half-restore it either', () => {
  const t = JSON.parse(env2.S.localStorage.getItem('wl_training_v1') || '{}');
  eq(t.liftSessions, TRAINING.liftSessions);
});

module.exports = report();
