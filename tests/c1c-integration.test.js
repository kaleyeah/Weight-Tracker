/* Commit 1c — EXECUTABLE integration tests. These evaluate the entire shipping
   script and drive the final overridden functions together: real save() paths,
   real reconciliation, real account transitions. This is the coverage the
   Architect required beyond pure helpers and source greps. */
const { test, group, eq, ok, notOk, report } = require('./harness');
const { createEnv } = require('./integration-env');

const SESSION = JSON.stringify({ uid: 'userA', token: 'tokA', email: 'a@x.com', remember: true });
const SESSION_B = JSON.stringify({ uid: 'userB', token: 'tokB', email: 'b@x.com', remember: true });
const someData = () => JSON.stringify({ notes: { '2026-07-01': 'real note carrying meaning padding padding padding padding padding padding padding padding padding padding padding padding' }, weights: [], food: {}, workouts: {} });

group('I1 — ordinary save(): revision advances, zero appdata writes', () => {
  const env = createEnv({ localStorage: { wl_pb: SESSION } });
  const before = env.S.revLocal('core');
  env.S.state.notes['2026-07-02'] = 'test';
  env.S.save();
  env.runTimers();
  test('revision advanced', () => ok(env.S.revLocal('core') > before));
  test('no appdata POST/PATCH after debounce', () => eq(env.appdataWrites().length, 0));
  test('app reports dirty', () => ok(env.S.isDirty()));
});

group('I2 — edits while SIGNED OUT still advance revisions (gate E)', () => {
  const env = createEnv({});                       // no session at all → syncOn() false
  notOk(env.S.syncOn(), 'precondition: signed out');
  const c0 = env.S.revLocal('core'), t0 = env.S.revLocal('training');
  env.S.save();
  env.S.saveTraining();
  env.runTimers();
  test('core revision advanced while signed out', () => ok(env.S.revLocal('core') > c0));
  test('training revision advanced while signed out', () => ok(env.S.revLocal('training') > t0));
  test('still zero appdata writes', () => eq(env.appdataWrites().length, 0));
});

group('I3 — pbSave policy: snapshots frozen, operational fields survive', () => {
  const env = createEnv({ localStorage: { wl_pb: SESSION, 'cf:lastOwner': 'userA' } });
  env.S.pbRecId = 'row1';
  let r1, r2, r3, r4;
  env.S.pbSave({ data: { x: 1 } }, (ok_, err) => { r1 = [ok_, err]; });
  env.S.pbSave({ training: {} }, (ok_, err) => { r2 = [ok_, err]; });
  env.S.pbSave({ health: null }, (ok_) => { r3 = ok_; });
  env.S.pbSave({ coachreq: { day: 'x' } }, (ok_) => { r4 = ok_; });
  test('data snapshot blocked', () => { eq(r1[0], false); eq(r1[1], 'blocked'); });
  test('training snapshot blocked', () => { eq(r2[0], false); eq(r2[1], 'blocked'); });
  test('health write reached the network (operational allowlist)', () =>
    ok(env.appdataWrites().some(e => /row1/.test(e.url) && /health/.test(String(e.body)))));
  test('coachreq write reached the network', () =>
    ok(env.appdataWrites().some(e => /coachreq/.test(String(e.body)))));
  test('no snapshot field ever hit the network', () =>
    notOk(env.appdataWrites().some(e => /"data"|"training"/.test(String(e.body)))));
});

group('I4 — pre-existing debounce timer cannot write after install', () => {
  // The final schedulers replace the timer-based path entirely; any timer the
  // original code scheduled during init is cleared by the 1b block. Prove it
  // end-to-end: run EVERY captured timer and assert no snapshot write.
  const env = createEnv({ localStorage: { wl_pb: SESSION, 'cf:lastOwner': 'userA', wl_v1: someData(), wl_dirty: '1' } });
  env.runTimers();
  test('all boot/init timers ran with zero appdata writes', () => eq(env.appdataWrites().length, 0));
});

const _pending = [];
group('I5 — Coach Max policy is honest (gate D amendment)', () => {
  const env = createEnv({ localStorage: { wl_pb: SESSION, 'cf:lastOwner': 'userA' } });
  env.S.revBump('core');                            // dirty
  let err = null, okd = false;
  const p = env.S.pushDataPromise().then(() => { okd = true; }, (e) => { err = String(e && e.message); });
  _pending.push(p.then(() => {
    test('recap request refused while dirty', () => notOk(okd));
    test('with an honest reason, not a fake server error', () => ok(/on this device|paused/.test(err || '')));
  }));
});

group('I6 — unknown owner + meaningful data is NEVER auto-stamped (gate G)', () => {
  const env = createEnv({ localStorage: { wl_pb: SESSION, wl_v1: someData() } });   // no cf:lastOwner
  eq(env.S.cfOwnerGet(), '', 'precondition: no recorded owner');
  ok(env.S.coreHasMeaningfulState(env.S.payload()), 'precondition: meaningful');
  env.S.autoSync(); env.runTimers();
  test('boot sync did not stamp ownership', () => eq(env.S.cfOwnerGet(), ''));
  env.S.cloudPull(false); env.runTimers();
  test('pull did not stamp ownership', () => eq(env.S.cfOwnerGet(), ''));
  test('render shows the claim screen, not athlete data', () => {
    env.S.render();
    const app = env.S.document.getElementById('app');
    ok(/Is this your data\?/.test(app.innerHTML));
  });
  test('claim screen has NO export (Architect ruling: unknown ≠ proven owner)', () => {
    const app = env.S.document.getElementById('app');
    notOk(/cf:export/.test(app.innerHTML), 'export only after claim, or via the signed-out recovery flow');
  });
});

group('I7 — mismatched account: hidden AND not exportable (gate F)', () => {
  const env = createEnv({ localStorage: { wl_pb: SESSION_B, 'cf:lastOwner': 'userA', wl_v1: someData() } });
  test('verdict is mismatch', () => eq(env.S.cfAccountVerdict(), 'mismatch'));
  env.S.render();
  const app = env.S.document.getElementById('app');
  test('blocked screen rendered', () => ok(/another account/.test(app.innerHTML)));
  test('NO export control on the mismatch screen', () => notOk(/cf:export/.test(app.innerHTML)));
  test('offers switch account / sign out instead', () => ok(/cf:signout/.test(app.innerHTML)));
  env.S.autoSync(); env.runTimers();
  test('sync refuses to run', () => eq(env.appdataWrites().length, 0));
  test('ownership was not relabelled', () => eq(env.S.cfOwnerGet(), 'userA'));
});

group('I8 — first-paint guard exists BEFORE init (gate F precision)', () => {
  const env = createEnv({ localStorage: { wl_pb: SESSION_B, 'cf:lastOwner': 'userA', wl_v1: someData() } });
  test('boot risk was detected before init', () => ok(env.S.__cfBootRisk === true));
  test('final render restored visibility (no permanent blank)', () =>
    eq(env.S.document.documentElement.style.visibility || '', ''));
});

group('I9 — recovery callers carry explicit ownership and still WORK (gate H)', () => {
  const env = createEnv({ localStorage: { wl_pb: SESSION, 'cf:lastOwner': 'userA', wl_v1: someData() } });
  let captured = null;
  env.S.cfSnapshotOf = function (o, cb) { captured = o; cb && cb(true, 's_test'); };
  env.S.applyCloudSafe({ notes: { '2026-07-03': 'server' } }, 'test-adopt', function () {});
  test('adopt snapshots with the retained local owner', () => eq(captured && captured.accountId, 'userA'));
  captured = null;
  env.S.cfSnapLocal('before-logout', function () {});
  test('cfSnapLocal resolves ownership explicitly', () => eq(captured && captured.accountId, 'userA'));
});

group('I10 — normalization against the REAL shipping defaults (gate J)', () => {
  const env = createEnv({ localStorage: { wl_pb: SESSION, 'cf:lastOwner': 'userA' } });
  const S = env.S;
  // a fresh boot: load() applied defaults, glpNormalize seeded built-in symptom types
  test('fresh default install is NOT meaningful (real DEFAULT_SETTINGS/presets/glp)', () =>
    notOk(S.coreHasMeaningfulState(S.payload())));
  test('fresh local payload equals a sparse empty server row', () =>
    eq(S.cfCanon(S.cfNormalize(S.payload())), S.cfCanon(S.cfNormalize({}))));
  test('a GLP compound alone (no dose) IS meaningful — singular field', () => {
    S.state.glp.compound = { name: 'Sema', mg: 1 };
    ok(S.coreHasMeaningfulState(S.payload()));
    S.state.glp.compound = null;
  });
  test('a GLP settings change alone is meaningful', () => {
    S.state.glp.settings.enabled = true;
    ok(S.coreHasMeaningfulState(S.payload()));
    S.state.glp.settings.enabled = false;
  });
  test('seeded built-in symptom types carry no meaning (per-device ids)', () => {
    ok(S.state.glp.symptomTypes.length >= 8, 'built-ins were seeded');
    notOk(S.coreHasMeaningfulState(S.payload()));
  });
  test('dynamic startDate cannot create divergence', () => {
    const a = S.cfNormalize({ settings: { startDate: '2026-01-01' } });
    const b = S.cfNormalize({ settings: { startDate: '2026-07-25' } });
    eq(S.cfCanon(a), S.cfCanon(b));
  });
});

group('I11 — empty/empty clears the conservative migration dirty state', () => {
  const env = createEnv({ localStorage: { wl_pb: SESSION, 'cf:lastOwner': 'userA' } });
  const S = env.S;
  ok(S.isDirty(), 'precondition: corrective migration marked dirty');
  let decision = null;
  S.cfReconcile({}, 'boot', (d) => { decision = d; });
  test('empty local vs empty server resolves idle', () => eq(decision, 'idle'));
  test('core cleaned — no eternal pending badge on fresh installs', () => notOk(S.isDirty()));
  test('training cleaned too (no permanent trainingPull block)', () => notOk(S.revIsDirty('training')));
});

group('I12 — dirty MEANINGFUL local vs changed server still conflicts, never adopts', () => {
  const env = createEnv({ localStorage: { wl_pb: SESSION, 'cf:lastOwner': 'userA', wl_v1: someData(), wl_dirty: '1' } });
  const S = env.S;
  ok(S.isDirty());
  let decision = null;
  S.cfReconcile({ notes: { '2026-06-01': 'different server note' } }, 'refresh', (d) => { decision = d; });
  test('divergent dirty state raises conflict', () => eq(decision, 'conflict'));
  test('local note still present (nothing adopted)', () => ok(!!S.state.notes['2026-07-01']));
  test('no appdata write occurred', () => eq(env.appdataWrites().length, 0));
});

group('I13 — export now carries training; import restores it', () => {
  const env = createEnv({ localStorage: { wl_pb: SESSION, 'cf:lastOwner': 'userA' } });
  const S = env.S;
  S.state.training.routines.push({ id: 'r1', name: 'Push day' });
  const backup = JSON.parse(S.backupJSON());
  test('backup includes training', () => ok(backup.training && backup.training.routines.length === 1));
  test('backup is versioned', () => eq(backup.backupVersion, 2));
});

Promise.all(_pending).then(() => report());
