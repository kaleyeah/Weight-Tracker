/* Milestone 3 — revisions replace boolean dirty tracking.
   The core defect: a push that succeeded marked the app clean even when the
   user had edited during the request, so that edit was never uploaded. */

const { loadTestable, test, group, eq, ok, notOk, report } = require('./harness');
const S = loadTestable(['M3']);

group('M3 — clean predicate', () => {
  test('request carrying the current revision may clean', () => ok(S.revShouldClean(5, 5)));
  test('older request may NOT clean newer state', () => notOk(S.revShouldClean(6, 5)));
  test('revision 0 (never edited) is consistent', () => ok(S.revShouldClean(0, 0)));
});

group('M3 — dirty predicate', () => {
  test('local ahead of success => dirty', () => ok(S.revIsDirtyFrom(3, 2)));
  test('local equals success => clean', () => notOk(S.revIsDirtyFrom(3, 3)));
  test('fresh install is clean', () => notOk(S.revIsDirtyFrom(0, 0)));
});

group('M3 — success high-water mark', () => {
  test('newer success advances the mark', () => eq(S.revMergeSuccess(2, 5), 5));
  test('an out-of-order older response cannot lower it', () => eq(S.revMergeSuccess(5, 2), 5));
  test('equal is idempotent', () => eq(S.revMergeSuccess(4, 4), 4));
});

group('M3 — acceptance: edit during an in-flight push', () => {
  // Models the brief's acceptance test with a tiny revision state machine
  // driven by the same pure predicates the app uses.
  function makeTrack() { return { local: 0, attempted: 0, success: 0 }; }
  const t = makeTrack();

  test('edit A, push A begins', () => {
    t.local += 1;                     // edit A
    var sent = (t.attempted = t.local); // push payload built at rev 1
    eq([t.local, sent], [1, 1]);
    t._sent = sent;
  });

  test('edit B lands while the request is in flight', () => {
    t.local += 1;                     // edit B
    eq(t.local, 2);
  });

  test('push A succeeds but must NOT mark clean', () => {
    t.success = S.revMergeSuccess(t.success, t._sent);
    const cleaned = S.revShouldClean(t.local, t._sent);
    notOk(cleaned, 'stale push wrongly marked the app clean');
    ok(S.revIsDirtyFrom(t.local, t.success), 'edit B must still be pending');
  });

  test('a second push is required, and only it may clean', () => {
    const sent2 = (t.attempted = t.local);   // rev 2, includes edit B
    t.success = S.revMergeSuccess(t.success, sent2);
    ok(S.revShouldClean(t.local, sent2));
    notOk(S.revIsDirtyFrom(t.local, t.success), 'app should now be clean');
  });
});

group('M3 — failed push leaves state dirty', () => {
  test('no success recorded => still dirty', () => {
    const local = 4, success = 2;      // push failed, success not advanced
    ok(S.revIsDirtyFrom(local, success));
  });
});

group('M3 — out-of-order responses', () => {
  test('slow rev-1 response landing after fast rev-2 cannot un-clean or clean wrongly', () => {
    let success = 0, local = 2;
    success = S.revMergeSuccess(success, 2);      // rev2 returns first
    notOk(S.revIsDirtyFrom(local, success), 'clean after rev2');
    success = S.revMergeSuccess(success, 1);      // rev1 straggles in
    eq(success, 2, 'high-water mark must not regress');
    notOk(S.revIsDirtyFrom(local, success));
  });
});

report();
