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

group('M4 — decision table (SUPERSEDED by Commit 1)', () => {
  /* The original table returned "adopt" when a dirty device reported no local
     data, and "push" on a fingerprint match. Commit 1 removes both. These
     assertions are inverted against syncDecideV2 — the live decision function. */
  const C = require('./harness').loadTestable(['C1']);
  const base = {
    accountVerdict: 'ok', localDirty: true, localMeaningful: true, serverHasData: true,
    localCanon: 'L', serverCanon: 'S', baselineTrusted: true, serverMatchesBaseline: true,
  };
  const d = (o) => C.syncDecideV2(Object.assign({}, base, o));

  test('dirty + no meaningful local data can NEVER adopt', () =>
    notOk(d({ localMeaningful: false }) === 'adopt', 'this was the live data-loss branch'));
  test('dirty + server unchanged holds, it does not auto-push', () =>
    eq(d({ serverMatchesBaseline: true }), 'hold-push'));
  test('dirty + server moved => conflict', () =>
    eq(d({ serverMatchesBaseline: false }), 'conflict'));
  test('clean local + differing server => adopt is still allowed', () =>
    eq(d({ localDirty: false }), 'adopt'));
});

report();
