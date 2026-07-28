/* Commit 10 — the independent manifest reader, and the checklist cases it
   automates. Cases run against storage snapshots shaped exactly like the
   localStorage dumps the browser harness captures; the browser layer supplies
   real dumps for H3/J6/K4/K5/L4/M1-M4 and calls the same reader.

   The first group is the one that matters most: it proves the reader is
   genuinely independent. If that fails, every result below it is worthless. */
const fs = require('fs');
const path = require('path');
const { test, group, eq, ok, notOk, report } = require('./harness');
const R = require('./independent/manifest-reader');

const READER = path.join(__dirname, 'independent', 'manifest-reader.js');
const src = fs.readFileSync(READER, 'utf8');
/* Independence is a property of the CODE, not the prose. The reader's header
   deliberately names the app functions it must not use, so the check runs
   against the file with comments removed — otherwise documenting the rule
   would look like breaking it. */
const code = src
  .replace(/\/\*[^]*?\*\//g, ' ')          /* block comments */
  .replace(/(^|\s)\/\/[^\n]*/g, '$1');     /* line comments (not regex literals) */

group('Independence — the reader shares no code with the app', () => {
  test('does not require index.html', () => notOk(/require\([^)]*index\.html/.test(code)));
  test('does not require the harness that slices the shipping source', () =>
    notOk(/require\(['"]\.\.?\/harness/.test(code)));
  test('does not call the app validator cfManifestValid', () => notOk(code.includes('cfManifestValid')));
  test('does not call the app set helper cfSameStringSet', () => notOk(code.includes('cfSameStringSet')));
  test('does not use the production canonicalization cfCanon', () => notOk(/\bcfCanon\b/.test(code)));
  test('the comment-stripper did not simply empty the file', () => ok(code.includes('function inspect(')));
  test('requires nothing from the project at all', () => {
    const requires = [...code.matchAll(/require\((['"])(.*?)\1\)/g)].map((m) => m[2]);
    eq(requires.length, 0);
  });
});

/* ---- fixtures -------------------------------------------------------- */
const CORE = '{"weights":[{"d":"2026-07-01","kg":81.5}]}';
const TRAIN = '{"sessions":[1,2]}';
const WO = '{"draft":true}';
const complete = (stamp = '100') => ({
  [`cf:quarantine:${stamp}:core`]: CORE,
  [`cf:quarantine:${stamp}:training`]: TRAIN,
  [`cf:quarantine:${stamp}:workout`]: WO,
  [`cf:quarantine:${stamp}:manifest`]: JSON.stringify({
    stamp, keys: ['core', 'training', 'workout'],
    sizes: { core: CORE.length, training: TRAIN.length, workout: WO.length },
  }),
});
const withManifest = (store, patch, stamp = '100') => {
  const m = JSON.parse(store[`cf:quarantine:${stamp}:manifest`]);
  return { ...store, [`cf:quarantine:${stamp}:manifest`]: JSON.stringify({ ...m, ...patch }) };
};

group('H3 — a complete set-aside is verified byte-for-byte', () => {
  const r = R.inspect(complete(), '100');
  test('validates', () => { ok(r.complete); eq(r.problems.length, 0); });
  test('is exportable', () => ok(R.mayExport(complete(), '100')));
  test('a single changed byte in a component is caught', () => {
    const s = complete();
    s['cf:quarantine:100:core'] = CORE + ' ';
    const bad = R.inspect(s, '100');
    notOk(bad.complete);
    ok(bad.problems.some((p) => /core.*bytes.*declares/.test(p)));
  });
  test('a truncated component is caught', () => {
    const s = complete();
    s['cf:quarantine:100:training'] = TRAIN.slice(0, 4);
    notOk(R.inspect(s, '100').complete);
  });
});

group('M3 — a component deleted but the manifest kept: incomplete, export refused', () => {
  const s = complete();
  delete s['cf:quarantine:100:workout'];
  const r = R.inspect(s, '100');
  test('reported incomplete', () => notOk(r.complete));
  test('names the missing component', () =>
    ok(r.problems.some((p) => p.includes('"workout" is missing'))));
  test('export refused', () => notOk(R.mayExport(s, '100')));
});

group('M4 — a manifest claiming only ["core"]: export refused', () => {
  const s = withManifest(complete(), { keys: ['core'], sizes: { core: CORE.length } });
  const r = R.inspect(s, '100');
  test('rejected by exact-set validation', () => notOk(r.complete));
  test('export refused', () => notOk(R.mayExport(s, '100')));
  test('duplicate members are rejected', () =>
    notOk(R.inspect(withManifest(complete(), { keys: ['core', 'training', 'training'] }), '100').complete));
  test('an unknown member is rejected', () =>
    notOk(R.inspect(withManifest(complete(), { keys: ['core', 'training', 'photos'] }), '100').complete));
  test('order does not matter', () =>
    ok(R.inspect(withManifest(complete(), { keys: ['workout', 'core', 'training'] }), '100').complete));
});

group('K4 — interrupted cleanup: components without a manifest', () => {
  const s = complete();
  delete s['cf:quarantine:100:manifest'];
  const r = R.inspect(s, '100');
  test('recognised as an incomplete write, not as corruption', () =>
    ok(r.problems.some((p) => p.includes('incomplete write'))));
  test('export refused while the manifest is absent', () => notOk(r.exportable));
  test('the manifest is written LAST — its presence is what completes the set', () => {
    ok(R.inspect(complete(), '100').complete);
  });
});

group('K5 — incomplete sets refuse export', () => {
  test('missing component → refused', () => {
    const s = complete(); delete s['cf:quarantine:100:core'];
    notOk(R.mayExport(s, '100'));
  });
  test('altered sizes → refused', () =>
    notOk(R.mayExport(withManifest(complete(), { sizes: { core: 1, training: 1, workout: 1 } }), '100')));
  test('non-integer size → refused', () =>
    notOk(R.mayExport(withManifest(complete(), {
      sizes: { core: 1.5, training: TRAIN.length, workout: WO.length } }), '100')));
  test('negative size → refused', () =>
    notOk(R.mayExport(withManifest(complete(), {
      sizes: { core: -1, training: TRAIN.length, workout: WO.length } }), '100')));
});

group('L4 — a newer set is never confused with a stale one', () => {
  const s = { ...complete('100'), ...complete('200') };
  test('both stamps are found', () => eq(R.listStamps(s).length, 2));
  test('each is inspected independently', () => {
    const all = R.inspectAll(s);
    ok(all.every((x) => x.complete));
  });
  test('damaging the older set does not invalidate the newer one', () => {
    const t = { ...s }; delete t['cf:quarantine:100:core'];
    const all = R.inspectAll(t);
    notOk(all.find((x) => x.stamp === '100').complete);
    ok(all.find((x) => x.stamp === '200').complete);
  });
});

group('J6 / M1 / M2 — inventory correctness for the signed-out screen', () => {
  test('J6 a complete set is listed and exportable', () => {
    const all = R.inspectAll(complete());
    eq(all.length, 1); ok(all[0].exportable);
  });
  test('M1/M2 an unknown extra component under the stamp is reported', () => {
    const s = complete();
    s['cf:quarantine:100:photos'] = 'x';
    const r = R.inspect(s, '100');
    notOk(r.complete);
    ok(r.problems.some((p) => p.includes('unknown component')));
  });
  test('a stamp mismatch between manifest and key is reported', () =>
    ok(R.inspect(withManifest(complete(), { stamp: '999' }), '100')
      .problems.some((p) => p.includes('does not match'))));
  test('an unparseable manifest is reported, not thrown', () => {
    const s = complete();
    s['cf:quarantine:100:manifest'] = '{not json';
    const r = R.inspect(s, '100');
    notOk(r.complete);
    ok(r.problems.some((p) => p.includes('unparseable')));
  });
  test('an empty snapshot yields no stamps and does not throw', () => eq(R.inspectAll({}).length, 0));
});

report();
