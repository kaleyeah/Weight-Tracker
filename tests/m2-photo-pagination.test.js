/* Milestone 2 — photo pagination & deletion inference.
   The 501-record case: before this, a photo that fell off the single
   500-record page looked like a remote deletion and was wiped locally. */

const { loadTestable, test, group, eq, ok, notOk, report } = require('./harness');
const S = loadTestable(['M2']);

group('M2 — page-set completeness', () => {
  test('all pages fetched and counts agree => complete', () =>
    ok(S.phPagesComplete({ fetched: 3, total: 3 }, 501, 501)));
  test('missing a page => incomplete', () =>
    notOk(S.phPagesComplete({ fetched: 1, total: 3 }, 501, 200)));
  test('all pages but server reported more items => incomplete', () =>
    notOk(S.phPagesComplete({ fetched: 3, total: 3 }, 501, 500)));
  test('no page info at all => incomplete', () =>
    notOk(S.phPagesComplete(null, 10, 10)));
  test('unknown totalItems still complete if every page arrived', () =>
    ok(S.phPagesComplete({ fetched: 2, total: 2 }, null, 300)));
});

group('M2 — deletion inference', () => {
  const mapStart = { p1: 'srv1', p2: 'srv2' };
  const rec = { id: 'p1' };

  test('complete enumeration + previously synced + now absent => delete', () =>
    ok(S.phMayInferDeletion(true, mapStart, {}, rec)));

  test('INCOMPLETE enumeration never deletes (the 501-photo bug)', () =>
    notOk(S.phMayInferDeletion(false, mapStart, {}, rec)));

  test('still present on server => no delete', () =>
    notOk(S.phMayInferDeletion(true, mapStart, { p1: { id: 'srv1' } }, rec)));

  test('never synced (not in map) => no delete, it is a pending upload', () =>
    notOk(S.phMayInferDeletion(true, {}, {}, { id: 'p9' })));

  test('a photo uploaded moments ago is not deleted by a stale listing', () =>
    notOk(S.phMayInferDeletion(true, {}, {}, { id: 'justUploaded' })));

  test('missing/!id record is never deleted', () => {
    notOk(S.phMayInferDeletion(true, mapStart, {}, null));
    notOk(S.phMayInferDeletion(true, mapStart, {}, {}));
  });
});

group('M2 — interrupted pagination scenario', () => {
  // 501 server photos, pagination dies after page 1.
  const localPhotos = Array.from({ length: 501 }, (_, i) => ({ id: 'p' + i }));
  const mapStart = Object.fromEntries(localPhotos.map(p => [p.id, 'srv_' + p.id]));
  const partialServerById = Object.fromEntries(
    localPhotos.slice(0, 200).map(p => [p.id, { id: 'srv_' + p.id }]));

  test('no local photo is deleted when enumeration is partial', () => {
    const deleted = localPhotos.filter(p => S.phMayInferDeletion(false, mapStart, partialServerById, p));
    eq(deleted.length, 0);
  });

  test('with a COMPLETE enumeration of all 501, nothing is spuriously deleted', () => {
    const fullServerById = Object.fromEntries(
      localPhotos.map(p => [p.id, { id: 'srv_' + p.id }]));
    const deleted = localPhotos.filter(p => S.phMayInferDeletion(true, mapStart, fullServerById, p));
    eq(deleted.length, 0);
  });

  test('a genuinely deleted photo IS removed once enumeration is complete', () => {
    const fullServerById = Object.fromEntries(
      localPhotos.slice(1).map(p => [p.id, { id: 'srv_' + p.id }]));  // p0 really deleted
    const deleted = localPhotos.filter(p => S.phMayInferDeletion(true, mapStart, fullServerById, p));
    eq(deleted.map(p => p.id), ['p0']);
  });
});

report();
