/* Commit 1 — emergency non-destructive reconciliation.
   Every case the Product Architect required before this may ship. */
const { loadTestable, test, group, eq, ok, notOk, report } = require('./harness');
const C = loadTestable(['C1']);
const { cfCanon, cfCanonEq, coreHasMeaningfulState, syncDecideV2, legacyDirtyToRevision, crossAccountVerdict } = C;

const base = {
  accountVerdict: 'ok', localDirty: true, localMeaningful: true, serverHasData: true,
  localCanon: 'L', serverCanon: 'S', baselineTrusted: true, serverMatchesBaseline: true,
};
const d = (o) => syncDecideV2(Object.assign({}, base, o));

group('C1 — canonical equality', () => {
  test('key order does not matter', () => eq(cfCanon({ a: 1, b: 2 }), cfCanon({ b: 2, a: 1 })));
  test('nested key order does not matter', () =>
    eq(cfCanon({ x: { p: 1, q: 2 } }), cfCanon({ x: { q: 2, p: 1 } })));
  test('array order DOES matter', () => notOk(cfCanonEq([1, 2], [2, 1])));
  test('different content differs', () => notOk(cfCanonEq({ a: 1 }, { a: 2 })));
  test('null/undefined are safe', () => { ok(cfCanon(null)); ok(cfCanon(undefined)); });
});

group('C1 — meaningful state covers every payload field', () => {
  test('empty is empty', () => notOk(coreHasMeaningfulState({})));
  test('null is empty', () => notOk(coreHasMeaningfulState(null)));
  for (const [name, obj] of [
    ['a GLP-1 dose', { glp: { doses: [{ id: 'd1' }] } }],
    ['a GLP-1 symptom', { glp: { symptoms: [{ id: 's1' }] } }],
    ['a note', { notes: { '2026-07-01': 'hi' } }],
    ['a settings change', { settings: { theme: 'light' } }],
    ['a skip', { skips: { '2026-07-01': 1 } }],
    ['sleep', { sleep: { '2026-07-01': 400 } }],
    ['body fat', { bodyfat: { '2026-07-01': 18 } }],
    ['waist', { waist: { '2026-07-01': 34 } }],
    ['steps', { steps: { '2026-07-01': 9000 } }],
    ['a status', { statuses: [{ d: '2026-07-01' }] }],
    ['a weigh-in', { weights: [{ date: '2026-07-01', v: 200 }] }],
  ]) test(name + ' is meaningful', () => ok(coreHasMeaningfulState(obj), name));
});

group('C1 — dirty state can never be silently replaced', () => {
  test('dirty + GLP-only + server moved => conflict, not adopt', () =>
    eq(d({ serverMatchesBaseline: false }), 'conflict'));
  test('dirty + no meaningful local => still never adopt', () =>
    notOk(d({ localMeaningful: false }) === 'adopt'));
  test('dirty + no trusted baseline + different content => conflict', () =>
    eq(d({ baselineTrusted: false }), 'conflict'));
  test('dirty + no baseline + IDENTICAL content => agree (no prompt)', () =>
    eq(d({ baselineTrusted: false, localCanon: 'X', serverCanon: 'X' }), 'agree'));
  test('dirty + cannot compare => conflict, never adopt', () =>
    eq(d({ baselineTrusted: false, localCanon: null }), 'conflict'));
  test('delete-all while dirty is not treated as "no data to lose"', () =>
    notOk(d({ localMeaningful: false, serverMatchesBaseline: false }) === 'adopt'));
});

group('C1 — no automatic whole-snapshot write before CAS', () => {
  test('dirty + server unchanged => hold-push, never push', () =>
    eq(d({ serverMatchesBaseline: true }), 'hold-push'));
  test('server row missing + local data => hold-seed, never an auto-POST', () =>
    eq(d({ serverHasData: false }), 'hold-seed'));
  test('no decision value is ever "push" or "seed"', () => {
    const seen = new Set();
    for (const dirty of [true, false]) for (const sh of [true, false])
      for (const bt of [true, false]) for (const smb of [true, false])
        for (const lm of [true, false]) for (const lc of ['A', 'B', null])
          seen.add(syncDecideV2({ accountVerdict: 'ok', localDirty: dirty, localMeaningful: lm,
            serverHasData: sh, localCanon: lc, serverCanon: 'A', baselineTrusted: bt, serverMatchesBaseline: smb }));
    notOk(seen.has('push') || seen.has('seed'), 'auto-write decisions must not exist');
  });
});

group('C1 — empty server never overwrites local data', () => {
  test('server empty + meaningful local (clean) => hold-seed, not adopt', () =>
    eq(d({ localDirty: false, serverHasData: false }), 'hold-seed'));
  test('server empty + genuinely empty local => idle', () =>
    eq(d({ localDirty: false, serverHasData: false, localMeaningful: false }), 'idle'));
});

group('C1 — legacy dirty migration is conservative', () => {
  test('an absent flag does NOT migrate as clean', () => ok(legacyDirtyToRevision()));
  test('a "0" flag does not migrate as clean either (may be bug-cleared)', () => ok(legacyDirtyToRevision('0')));
  test('"1" still migrates as dirty', () => ok(legacyDirtyToRevision('1')));
});

group('C1 — cross-account guard', () => {
  test('same account is ok', () => eq(crossAccountVerdict('u1', 'u1'), 'ok'));
  test('different account is a mismatch', () => eq(crossAccountVerdict('u1', 'u2'), 'mismatch'));
  test('mismatch blocks every sync decision', () => eq(d({ accountVerdict: 'mismatch' }), 'blocked'));
  test('no recorded owner is "unknown", claimable by a verified login', () =>
    eq(crossAccountVerdict('', 'u2'), 'unknown'));
  test('unauthenticated is never "ok"', () => eq(crossAccountVerdict('u1', ''), 'unauthenticated'));
});

report();
