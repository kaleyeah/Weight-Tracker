/* Commit 1b — the runtime write paths the Architect found open.
   These cover the INTEGRATED behaviors, not just extracted helpers:
   normalization symmetry, semantic emptiness, snapshot field validation,
   and the write gate that pbSave enforces. */
const { loadTestable, test, group, eq, ok, notOk, report } = require('./harness');
const C = loadTestable(['C1', 'C1B']);
const { cfCanon, cfNormalizeWith, cfIsMeaningfulNormalized, cfCloneField, cfSnapshotValid, cfWriteAllowed } = C;

const DEFS = { theme: 'dark', cardioMinGoal: 150, macroAuto: true };
const DPRE = [{ id: 'walk' }, { id: 'run' }];
const N = (d) => cfNormalizeWith(d, DEFS, DPRE, cfCanon);

group('C1B — symmetric normalization', () => {
  test('default-filled local equals sparse server', () => {
    const local = { settings: { theme: 'dark', cardioMinGoal: 150, macroAuto: true }, presets: DPRE.slice() };
    const server = {};                                     // old sparse row
    eq(cfCanon(N(local)), cfCanon(N(server)));
  });
  test('a real settings change survives normalization', () => {
    const local = { settings: { theme: 'light', cardioMinGoal: 150 } };
    notOk(cfCanon(N(local)) === cfCanon(N({})));
  });
  test('default presets carry no meaning; custom presets do', () => {
    notOk(cfIsMeaningfulNormalized(N({ presets: DPRE.slice() })));
    ok(cfIsMeaningfulNormalized(N({ presets: [{ id: 'swim' }] })));
  });
  test('scriptVer differences never create divergence', () =>
    eq(cfCanon(N({ scriptVer: { a: 9 } })), cfCanon(N({ scriptVer: { a: 1 } }))));
  test('a GLP dose is meaning; an empty glp shell is not', () => {
    ok(cfIsMeaningfulNormalized(N({ glp: { doses: [{ id: 'd1' }] } })));
    notOk(cfIsMeaningfulNormalized(N({ glp: { doses: [], compounds: [] } })));
  });
  test('fresh default install is NOT meaningful', () => {
    const fresh = { settings: Object.assign({}, DEFS), presets: DPRE.slice(), weights: [], food: {} };
    notOk(cfIsMeaningfulNormalized(N(fresh)));
  });
});

group('C1B — snapshot field validation fails closed', () => {
  const okF = { supplied: true, ok: true, value: {} };
  const badF = { supplied: true, ok: false, value: null };
  const noF = { supplied: false, ok: true, value: null };
  test('core clone failure fails the snapshot even if training cloned', () =>
    notOk(cfSnapshotValid(badF, okF, 'u1')));
  test('training clone failure fails the snapshot even if core cloned', () =>
    notOk(cfSnapshotValid(okF, badF, 'u1')));
  test('nothing supplied fails', () => notOk(cfSnapshotValid(noF, noF, 'u1')));
  test('missing accountId fails', () => notOk(cfSnapshotValid(okF, okF, '')));
  test('valid core-only snapshot passes', () => ok(cfSnapshotValid(okF, noF, 'u1')));
  test('cfCloneField reports failure on uncloneable input', () => {
    const cyc = {}; cyc.self = cyc;
    const r = cfCloneField(cyc); ok(r.supplied); notOk(r.ok);
  });
  test('cfCloneField distinguishes absent from failed', () => {
    const r = cfCloneField(null); notOk(r.supplied); ok(r.ok);
  });
});

group('C1B — the write gate never opens in this build', () => {
  test('closed gate blocks even a matching account', () => notOk(cfWriteAllowed(false, 'ok')));
  test('open gate still blocks a mismatched account', () => notOk(cfWriteAllowed(true, 'mismatch')));
  test('open gate blocks unknown ownership', () => notOk(cfWriteAllowed(true, 'unknown')));
  test('only gate===true AND verdict===ok writes', () => ok(cfWriteAllowed(true, 'ok')));
  test('truthy-but-not-true gate tokens are rejected', () => {
    notOk(cfWriteAllowed(1, 'ok')); notOk(cfWriteAllowed('true', 'ok'));
  });
});

/* Integrated: the SOURCE ITSELF must keep pbSave gated and the schedulers inert. */
group('C1B — integrated source assertions', () => {
  const fs = require('fs'); const { SRC } = require('./harness');
  const src = fs.readFileSync(SRC, 'utf8');
  const c1b = src.slice(src.indexOf('HARDENING — COMMIT 1b'));
  test('pbSave is wrapped by the write gate in the final block', () =>
    ok(/pbSave\s*=\s*function\s*\(fields,\s*cb\)\s*{\s*\n?\s*if\s*\(!cfWriteAllowed/.test(c1b)));
  test('scheduleCloudPush override contains no timer and no network call', () => {
    const m = c1b.match(/scheduleCloudPush\s*=\s*function[^;]*;/);
    ok(m); notOk(/setTimeout|fetch|pbSave/.test(m[0]));
  });
  test('scheduleTrainingPush override contains no timer and no network call', () => {
    const m = c1b.match(/scheduleTrainingPush\s*=\s*function[^;]*;/);
    ok(m); notOk(/setTimeout|fetch|pbSave/.test(m[0]));
  });
  test('pre-existing push timers are cleared when the block installs', () =>
    ok(c1b.includes('clearTimeout(pushTimer)') && c1b.includes('clearTimeout(trainingPushTimer)')));
  test('CF_WRITE_GATE is declared false and never set true anywhere', () => {
    ok(/var CF_WRITE_GATE\s*=\s*false/.test(c1b));
    notOk(/CF_WRITE_GATE\s*=\s*true/.test(src), 'nothing may open the gate in this build');
  });
  test('the legacy sync:push handler is intercepted before cloudPush', () =>
    ok(/a==="sync:push".*cfUploadNow/.test(c1b)));
  test('trainingPull refuses while training is dirty', () =>
    ok(/trainingPull\s*=\s*function\s*\(cb\)\s*{\s*\n?\s*if\s*\(revIsDirty\("training"\)\)/.test(c1b)));
  test('render is gated on account ownership', () =>
    ok(/render\s*=\s*function\s*\(\)\s*{\s*\n?\s*var b=cfAccountBlocked\(\)/.test(c1b)));
  test('pbForceLogout clears the owner marker', () =>
    ok(c1b.includes('localStorage.removeItem(CF_OWNER_KEY)')));
  test('applyImport snapshots before importing', () =>
    ok(/applyImport\s*=\s*function\s*\(text\)\s*{\s*\n?\s*cfSnapLocal\("before-import"/.test(c1b)));
});

report();
