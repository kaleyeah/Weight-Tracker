/* Commit 1g — the two 1f blockers: complete workout identity in the
   destructive context, and exact-set manifest validation. */
const { loadTestable, test, group, eq, ok, notOk, report, defer } = require('./harness');
const { createEnv } = require('./integration-env');
const SESSION = JSON.stringify({ uid: 'userA', token: 'tokA', email: 'a@x.com', remember: true });
const C = loadTestable(['C1G']);

group('G0 — exact-set manifest validation (Blocker 2)', () => {
  const comps = { core: 'AAAA', training: 'BB', workout: '' };
  const man = (keys, sizes) => ({ stamp: '1', keys, sizes });
  const FULL = { core: 4, training: 2, workout: 0 };
  test('accepts exactly {core,training,workout} in order', () =>
    ok(C.cfManifestValid(man(['core','training','workout'], FULL), '1', comps)));
  test('accepts the same set in a DIFFERENT order', () =>
    ok(C.cfManifestValid(man(['workout','core','training'], FULL), '1', comps)));
  test('rejects subset ["core"]', () =>
    notOk(C.cfManifestValid(man(['core'], { core: 4 }), '1', comps)));
  test('rejects subset ["core","training"]', () =>
    notOk(C.cfManifestValid(man(['core','training'], { core: 4, training: 2 }), '1', comps)));
  test('rejects duplicate ["core","training","training"]', () =>
    notOk(C.cfManifestValid(man(['core','training','training'], FULL), '1', comps)));
  test('rejects unknown ["core","training","photo"]', () =>
    notOk(C.cfManifestValid(man(['core','training','photo'], FULL), '1', comps)));
  test('rejects missing sizes.workout', () =>
    notOk(C.cfManifestValid(man(['core','training','workout'], { core: 4, training: 2 }), '1', comps)));
  test('rejects an extra size key', () =>
    notOk(C.cfManifestValid(man(['core','training','workout'], { ...FULL, photo: 9 }), '1', comps)));
  test('rejects negative size', () =>
    notOk(C.cfManifestValid(man(['core','training','workout'], { ...FULL, workout: -1 }), '1', comps)));
  test('rejects non-integer size', () =>
    notOk(C.cfManifestValid(man(['core','training','workout'], { ...FULL, core: 4.5 }), '1', comps)));
  test('rejects a missing component even when sizes claim 0', () =>
    notOk(C.cfManifestValid(man(['core','training','workout'], FULL), '1', { core: 'AAAA', training: 'BB', workout: null })));
  test('rejects length mismatch', () =>
    notOk(C.cfManifestValid(man(['core','training','workout'], FULL), '1', { ...comps, core: 'AAA' })));
});

group('G0b — cleanup decisions are provable per stamp', () => {
  test('absent source ⇒ clean', () => eq(C.cfCleanupDecision(null, 'old'), 'clean'));
  test('exact match ⇒ delete authorized', () => eq(C.cfCleanupDecision('v1', 'v1'), 'delete'));
  test('newer value ⇒ superseded, never delete', () => eq(C.cfCleanupDecision('v2', 'v1'), 'superseded'));
  test('missing quarantined component ⇒ superseded (no comparison source)', () =>
    eq(C.cfCleanupDecision('v1', null), 'superseded'));
});

/* Two workout strings the OLD fingerprint (length + first 24 chars) could not
   tell apart: same length, same prefix, later value differs. */
const WO_A = JSON.stringify({ entries: [{ ex: 'bench press', sets: [{ w: 100, r: 8 }, { w: 90, r: 10 }] }] });
const WO_B = WO_A.replace('"r":10', '"r":12');   // same length, same first 24 chars

group('G1 — same-length workout edit during RESTORE wait aborts (Blocker 1)', () => {
  eq(WO_A.length, WO_B.length, 'fixture: identical length');
  eq(WO_A.slice(0, 24), WO_B.slice(0, 24), 'fixture: identical 24-char prefix');
  const env = createEnv({ localStorage: { wl_pb: SESSION, 'cf:lastOwner': 'userA' } });
  const S = env.S; const WOKEY = S.WOKEY;
  S.localStorage.setItem(WOKEY, WO_A);
  let held = null, result = null;
  S.recList = () => Promise.resolve([{ id: 's1', accountId: 'userA', core: { notes: { old: 'RESTORED' } }, training: null }]);
  S.cfSnapshotOf = (o, cb) => { held = cb; };
  S.recRestore('s1', (ok_) => { result = ok_; });
  return defer(new Promise(r => setTimeout(r, 10)).then(() => {
    ok(!!held);
    S.localStorage.setItem(WOKEY, WO_B);          // the edit the old fingerprint missed
    held(true);
    return new Promise(r => setTimeout(r, 10));
  }).then(() => {
    test('restore aborted on a same-length workout change', () => eq(result, false));
    test('newer workout draft intact', () => eq(S.localStorage.getItem(WOKEY), WO_B));
    test('nothing restored', () => notOk(!!S.state.notes.old));
  }));
});

group('G2 — workout created / deleted during the wait aborts LOGOUT and IMPORT', () => {
  const env = createEnv({ localStorage: { wl_pb: SESSION, 'cf:lastOwner': 'userA' } });
  const S = env.S; const WOKEY = S.WOKEY;
  let held = null, wiped = false;
  S.cfSnapshotOf = (o, cb) => { held = cb; };
  S.askConfirm = (m, fn) => fn();
  S.pbForceLogout = () => { wiped = true; };
  S.location.reload = () => {};
  S.revClean('core'); S.revClean('training'); S.cfClearPending();
  S.pbLogout();                                    // no workout at capture time
  return defer(new Promise(r => setTimeout(r, 10)).then(() => {
    S.localStorage.setItem(WOKEY, WO_A);           // workout CREATED during the wait
    held(true);
    return new Promise(r => setTimeout(r, 10));
  }).then(() => {
    test('logout aborted when a workout appeared during the wait', () => notOk(wiped));
    // now import with a workout DELETED during the confirm wait
    let held2 = null, confirmed = null;
    S.cfSnapshotOf = (o, cb) => { held2 = cb; };
    S.askConfirm = (m, fn) => { confirmed = fn; };
    S.applyImport(JSON.stringify({ settings: {}, notes: { imported: 'X' } }));
    return new Promise(r => setTimeout(r, 10)).then(() => {
      held2(true);
      S.localStorage.removeItem(WOKEY);            // deleted while dialog open
      confirmed();
      return new Promise(r => setTimeout(r, 10));
    });
  }).then(() => {
    test('import aborted when the workout was deleted during the confirm wait', () =>
      notOk(!!S.state.notes.imported));
  }));
});

group('G3 — runtime export gate uses the exact-set validator', () => {
  const stamp = '1753500000000';
  // subset recovery set: manifest claims only core
  const env = createEnv({ localStorage: {
    ['cf:quarantine:' + stamp + ':manifest']: JSON.stringify({ stamp, createdAt: 1, keys: ['core'], sizes: { core: 2 } }),
    ['cf:quarantine:' + stamp + ':core']: '{}',
  } });
  const S = env.S;
  test('subset manifest is NOT complete at runtime', () => notOk(S.cfQuarComplete(stamp)));
  let toasts = []; S.toast = (m) => toasts.push(m); S.askConfirm = () => { throw new Error('must not confirm'); };
  S.cfQuarExport(stamp);
  test('export refused for the subset set', () => ok(toasts.some(t => /incomplete/.test(t))));
});

group('G4 — post-verdict hardening (non-blocking notes 1+2)', () => {
  const env = createEnv({ localStorage: { wl_pb: SESSION, 'cf:lastOwner': 'userA' } });
  const S = env.S;
  test('manifest validator rejects a missing comps object', () =>
    notOk(C.cfManifestValid({ stamp: '1', keys: ['core','training','workout'], sizes: { core: 0, training: 0, workout: 0 } }, '1', null)));
  test('a storage read failure fails the destructive guard CLOSED', () => {
    const ctx = S.cfDestructiveCtx();
    const realGet = S.localStorage.getItem.bind(S.localStorage);
    S.localStorage.getItem = (k) => { if (k === S.WOKEY) throw new Error('storage'); return realGet(k); };
    ok(S.cfDestructiveStale(ctx), 'unreadable workout must never allow a destructive commit');
    S.localStorage.getItem = realGet;
  });
  test('normal path unaffected: identical context is not stale', () => {
    const ctx = S.cfDestructiveCtx();
    notOk(S.cfDestructiveStale(ctx));
  });
});

report();
