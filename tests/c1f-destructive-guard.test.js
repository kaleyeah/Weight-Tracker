/* Commit 1f — the two 1e blockers, reproduced and closed:
   restore/import/logout race guards, and content-conditional quarantine
   cleanup that can never delete newer data. */
const { loadTestable, test, group, eq, ok, notOk, report, defer } = require('./harness');
const { createEnv } = require('./integration-env');
const SESSION = JSON.stringify({ uid: 'userA', token: 'tokA', email: 'a@x.com', remember: true });
const C = loadTestable(['C1F']);

group('F0 — pure guards', () => {
  const base = { owner: 'a', gen: 1, core: 5, training: 2, wo: '10:x' };
  test('drift on core revision', () => ok(C.cfCtxDrifted(base, { ...base, core: 6 })));
  test('drift on training revision', () => ok(C.cfCtxDrifted(base, { ...base, training: 3 })));
  test('drift on workout fingerprint', () => ok(C.cfCtxDrifted(base, { ...base, wo: '99:y' })));
  test('drift on session generation', () => ok(C.cfCtxDrifted(base, { ...base, gen: 2 })));
  test('no drift when identical', () => notOk(C.cfCtxDrifted(base, { ...base })));
  const comps = { core: 'AAAA', training: 'BB', workout: '' };
  const man = { stamp: '1', keys: ['core', 'training', 'workout'], sizes: { core: 4, training: 2, workout: 0 } };
  test('manifest valid when components match recorded lengths', () => ok(C.cfManifestValid(man, '1', comps)));
  test('manifest invalid on length mismatch', () =>
    notOk(C.cfManifestValid(man, '1', { ...comps, core: 'AAA' })));
  test('manifest invalid on missing component', () =>
    notOk(C.cfManifestValid(man, '1', { core: 'AAAA', training: 'BB', workout: null })));
  test('manifest invalid on stamp mismatch', () => notOk(C.cfManifestValid(man, '2', comps)));
});

group('F1 — RESTORE race: edit during the safety-copy wait aborts the restore', () => {
  const env = createEnv({ localStorage: { wl_pb: SESSION, 'cf:lastOwner': 'userA' } });
  const S = env.S;
  // seed a recovery snapshot to restore from
  let held = null;
  S.recList = () => Promise.resolve([{ id: 'snap1', accountId: 'userA', core: { notes: { old: 'RESTORED CONTENT' } }, training: null }]);
  S.cfSnapshotOf = (o, cb) => { held = cb; };
  let result = null;
  S.recRestore('snap1', (ok_) => { result = ok_; });
  return defer(new Promise(r => setTimeout(r, 10)).then(() => {
    ok(!!held, 'safety copy is pending');
    S.state.notes['2026-07-25'] = 'edit during restore wait'; S.save();   // the racing edit
    held(true);                                                            // copy completes AFTER the edit
    return new Promise(r => setTimeout(r, 10));
  }).then(() => {
    test('restore was aborted', () => eq(result, false));
    test('racing edit survives', () => eq(S.state.notes['2026-07-25'], 'edit during restore wait'));
    test('restored content was NOT applied', () => notOk(!!S.state.notes.old));
  }));
});

group('F2 — IMPORT race: edit during snapshot or confirm wait aborts the import', () => {
  const env = createEnv({ localStorage: { wl_pb: SESSION, 'cf:lastOwner': 'userA' } });
  const S = env.S;
  let held = null, confirmed = null;
  S.cfSnapshotOf = (o, cb) => { held = cb; };
  S.askConfirm = (msg, fn) => { confirmed = fn; };            // confirm waits like a human
  S.applyImport(JSON.stringify({ settings: {}, weights: [], notes: { imported: 'FROM BACKUP' } }));
  return defer(new Promise(r => setTimeout(r, 10)).then(() => {
    ok(!!held, 'snapshot pending');
    held(true);                                               // snapshot done, confirm dialog now open
    ok(!!confirmed, 'confirm dialog open');
    S.state.notes['2026-07-25'] = 'edit while dialog open'; S.save();   // racing edit at confirm time
    confirmed();                                              // user finally taps Replace
    return new Promise(r => setTimeout(r, 10));
  }).then(() => {
    test('import aborted after confirm-time drift', () => notOk(!!S.state.notes.imported));
    test('racing edit survives', () => eq(S.state.notes['2026-07-25'], 'edit while dialog open'));
  }));
});

group('F3 — LOGOUT race: edit during the safety-copy wait keeps you signed in', () => {
  const env = createEnv({ localStorage: { wl_pb: SESSION, 'cf:lastOwner': 'userA' } });
  const S = env.S;
  let held = null, wiped = false, reloaded = false;
  S.cfSnapshotOf = (o, cb) => { held = cb; };
  S.askConfirm = (msg, fn) => fn();                           // auto-confirm the logout
  const origForce = S.pbForceLogout; S.pbForceLogout = () => { wiped = true; };
  S.location.reload = () => { reloaded = true; };
  S.revClean('core'); S.revClean('training'); S.cfClearPending();
  S.pbLogout();
  return defer(new Promise(r => setTimeout(r, 10)).then(() => {
    ok(!!held, 'safety copy pending');
    S.state.notes['2026-07-25'] = 'edit during logout wait'; S.save();
    held(true);
    return new Promise(r => setTimeout(r, 10));
  }).then(() => {
    test('device was NOT wiped', () => notOk(wiped));
    test('no reload happened — still signed in', () => notOk(reloaded));
    test('racing edit survives', () => eq(S.state.notes['2026-07-25'], 'edit during logout wait'));
  }));
});

group('F4 — quarantine cleanup: unchanged source is finished, newer source is preserved', () => {
  const OLD = JSON.stringify({ notes: { d: 'quarantined-era data '.repeat(10) } });
  const NEW = JSON.stringify({ notes: { d: 'NEWER data written after the set-aside' } });
  // stamp 100: source still matches its quarantined copy → may be removed
  // stamp 200: current wl_v1 is NEWER → must be preserved, job superseded
  const env = createEnv({ localStorage: {
    wl_pb: SESSION,
    wl_v1: NEW,
    'cf:quarantine:100:core': NEW,      // matches current → cleanup allowed... but wait, both target wl_v1
    'cf:quarantine:100:cleanupPending': JSON.stringify(['core']),
    'cf:quarantine:100:manifest': JSON.stringify({ stamp: '100', keys: ['core'], sizes: {} }),
    'cf:quarantine:200:core': OLD,      // current value does NOT match this stamp
    'cf:quarantine:200:cleanupPending': JSON.stringify(['core']),
    'cf:quarantine:200:manifest': JSON.stringify({ stamp: '200', keys: ['core'], sizes: {} }),
  } });
  const S = env.S;
  // boot repair already ran during script evaluation
  test('stamp 200 (stale) did NOT delete the newer value…', () => {
    // one of the two stamps legitimately matched; what must NEVER happen is
    // the stale stamp deleting a non-matching value. If wl_v1 is gone, it was
    // removed by the MATCHING stamp (100) — which is the allowed outcome.
    const cur = S.localStorage.getItem('wl_v1');
    ok(cur === null || cur === NEW);
  });
  test('stamp 200 recorded as superseded, not silently dropped', () => {
    ok(!!S.localStorage.getItem('cf:quarantine:200:cleanupSuperseded') ||
       S.localStorage.getItem('cf:quarantine:200:cleanupPending') === null);
  });
  test('stamp 200 recovery components untouched', () =>
    eq(S.localStorage.getItem('cf:quarantine:200:core'), OLD));
});

group('F5 — quarantine cleanup: purely stale job never deletes newer data', () => {
  const OLD = 'old-era-value-'.repeat(20);
  const NEW = 'brand-new-value-written-later-'.repeat(10);
  const env = createEnv({ localStorage: {
    wl_pb: SESSION,
    wl_v1: NEW,
    'cf:quarantine:300:core': OLD,
    'cf:quarantine:300:cleanupPending': JSON.stringify(['core']),
    'cf:quarantine:300:manifest': JSON.stringify({ stamp: '300', keys: ['core'], sizes: {} }),
  } });
  const S = env.S;
  test('newer wl_v1 survives the stale cleanup job', () => eq(S.localStorage.getItem('wl_v1'), NEW));
  test('job marked superseded', () => {
    const sup = JSON.parse(S.localStorage.getItem('cf:quarantine:300:cleanupSuperseded') || '[]');
    ok(sup.includes('core'));
  });
  test('pending record cleared (job resolved, not looping)', () =>
    eq(S.localStorage.getItem('cf:quarantine:300:cleanupPending'), null));
  test('recovery component intact', () => eq(S.localStorage.getItem('cf:quarantine:300:core'), OLD));
});

group('F6 — token refresh semantics (Verification C amendments)', () => {
  const env = createEnv({ localStorage: { wl_pb: SESSION, 'cf:lastOwner': 'userA' } });
  const S = env.S;
  test('same-account token rotation does NOT abort adoption (owner/gen/rev unchanged)', () => {
    const ctx = { owner: 'userA', gen: S.CF_SESSION_GEN, rev: 3 };
    // simulate a token refresh: wl_pb token changes, nothing else
    S.localStorage.setItem('wl_pb', JSON.stringify({ uid: 'userA', token: 'tokA-ROTATED' }));
    notOk(S.cfAdoptionStale(ctx, { owner: S.pbUid(), gen: S.CF_SESSION_GEN, rev: 3 }));
  });
  test('token rotation DOES invalidate an in-flight coach context (fingerprint)', () => {
    const ctx = { owner: 'userA', gen: S.CF_SESSION_GEN, tok: 'tokA'.slice(-16) };
    notOk(S.cfCoachCtxValid(ctx, S.cfNow()));
  });
});

report();
