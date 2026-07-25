/* Milestone 4 — dirty local data is never silently replaced.
   The old logic compared only the newest weigh-in/day key, which cannot see an
   independent change (a GLP-1 dose, a symptom, a settings change, a historical
   note, a skip, a routine edit). Those are the cases below. */

const { loadTestable, test, group, eq, ok, notOk, report } = require('./harness');
const S = loadTestable(['M4']);

const fp = S.syncFingerprint;

group('M4 — fingerprint', () => {
  test('same content => same fingerprint', () => eq(fp({ a: 1 }), fp({ a: 1 })));
  test('different content => different fingerprint', () => notOk(fp({ a: 1 }) === fp({ a: 2 })));
  test('a GLP-1 dose added is visible to the fingerprint', () => {
    const before = { glp: { doses: [] }, weights: [{ date: '2026-07-01', v: 200 }] };
    const after = { glp: { doses: [{ id: 'd1' }] }, weights: [{ date: '2026-07-01', v: 200 }] };
    notOk(fp(before) === fp(after), 'date-based comparison misses this; fingerprint must not');
  });
  test('empty/missing input is safe', () => { ok(fp(null)); ok(fp(undefined)); });
});

group('M4 — decision table', () => {
  const base = { localDirty: false, localHasData: true, serverHasData: true, serverFp: 'x', lastAgreedFp: 'x' };
  const d = (o) => S.syncDecide(Object.assign({}, base, o));

  test('server empty + local data => seed', () => eq(d({ serverHasData: false }), 'seed'));
  test('server empty + no local data => idle', () => eq(d({ serverHasData: false, localHasData: false }), 'idle'));
  test('local clean => adopt server', () => eq(d({ localDirty: false }), 'adopt'));
  test('local dirty but server unchanged since agreement => push', () =>
    eq(d({ localDirty: true, serverFp: 'x', lastAgreedFp: 'x' }), 'push'));
  test('local dirty AND server moved => conflict (never guess)', () =>
    eq(d({ localDirty: true, serverFp: 'y', lastAgreedFp: 'x' }), 'conflict'));
  test('local dirty with no agreed baseline (fresh login) => conflict', () =>
    eq(d({ localDirty: true, lastAgreedFp: '' }), 'conflict'));
  test('dirty flag but no local data => adopt', () =>
    eq(d({ localDirty: true, localHasData: false }), 'adopt'));
  test('no branch ever returns "replace local" silently', () => {
    const outcomes = new Set();
    for (const localDirty of [true, false])
      for (const localHasData of [true, false])
        for (const serverHasData of [true, false])
          for (const agreed of ['x', 'y', ''])
            outcomes.add(S.syncDecide({ localDirty, localHasData, serverHasData, serverFp: 'x', lastAgreedFp: agreed }));
    // 'adopt' only ever reached when local is clean or has no data (asserted above)
    eq([...outcomes].sort(), ['adopt', 'conflict', 'idle', 'push', 'seed']);
  });
});

group('M4 — acceptance: local GLP-1 edit vs newer remote weight', () => {
  // Device A logged a GLP-1 dose offline; Device B logged a NEWER weight and synced.
  // Old logic: B's weight is newer by date => adopt server => the dose is destroyed.
  const agreed = fp({ weights: [{ date: '2026-07-01' }], glp: { doses: [] } });
  const server = fp({ weights: [{ date: '2026-07-20' }], glp: { doses: [] } });
  test('conflict is raised; the dose is not silently deleted', () =>
    eq(S.syncDecide({ localDirty: true, localHasData: true, serverHasData: true,
      serverFp: server, lastAgreedFp: agreed }), 'conflict'));
});

group('M4 — acceptance: historical correction vs newer daily record', () => {
  const agreed = fp({ food: { '2026-06-01': { kcal: 2000 } } });
  const server = fp({ food: { '2026-06-01': { kcal: 2000 }, '2026-07-24': { kcal: 2200 } } });
  test('older correction is not discarded by a newer remote day', () =>
    eq(S.syncDecide({ localDirty: true, localHasData: true, serverHasData: true,
      serverFp: server, lastAgreedFp: agreed }), 'conflict'));
});

group('M4 — acceptance: equal newest dates, different fields', () => {
  // Both devices edited different fields on the SAME latest date. Equal dates
  // must not be treated as proof that either whole snapshot should win.
  const agreed = fp({ notes: { '2026-07-24': 'a' } });
  const server = fp({ notes: { '2026-07-24': 'a' }, sleep: { '2026-07-24': 7 } });
  test('equal dates still conflict when content diverged', () =>
    eq(S.syncDecide({ localDirty: true, localHasData: true, serverHasData: true,
      serverFp: server, lastAgreedFp: agreed }), 'conflict'));
});

group('M4 — clean device still syncs normally', () => {
  test('no local edits => adopt server without prompting', () =>
    eq(S.syncDecide({ localDirty: false, localHasData: true, serverHasData: true,
      serverFp: 'new', lastAgreedFp: 'old' }), 'adopt'));
  test('first ever sync seeds the server', () =>
    eq(S.syncDecide({ localDirty: true, localHasData: true, serverHasData: false,
      serverFp: '', lastAgreedFp: '' }), 'seed'));
});

report();
