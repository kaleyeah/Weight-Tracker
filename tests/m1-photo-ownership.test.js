/* Milestone 1 — account-scoped photo storage.
   Verifies the ownership predicates that gate display, upload, delete and
   reconciliation. Full two-user flows are in tests/MANUAL_CHECKLIST.md. */

const { loadTestable, test, group, eq, ok, notOk, report } = require('./harness');
const S = loadTestable(['M1']);

const A = 'user_aaa', B = 'user_bbb';
const photoA = { id: 'p1', ownerId: A, blob: {} };
const photoB = { id: 'p2', ownerId: B, blob: {} };
const legacy = { id: 'p3', blob: {} };              // pre-hardening, no owner

group('M1 — ownership predicate', () => {
  test('a photo belongs to its owner', () => ok(S.phIsMine(photoA, A)));
  test("User A's photo does NOT belong to User B", () => notOk(S.phIsMine(photoA, B)));
  test('signed out (no uid) owns nothing', () => notOk(S.phIsMine(photoA, '')));
  test('a legacy ownerless photo belongs to nobody', () => {
    notOk(S.phIsMine(legacy, A));
    notOk(S.phIsMine(legacy, B));
  });
  test('null/undefined records are not owned', () => {
    notOk(S.phIsMine(null, A));
    notOk(S.phIsMine(undefined, A));
  });
});

group('M1 — orphan detection', () => {
  test('ownerless record is an orphan', () => ok(S.phIsOrphan(legacy)));
  test('owned record is not an orphan', () => notOk(S.phIsOrphan(photoA)));
});

group('M1 — list scoping (the two-user privacy case)', () => {
  const all = [photoA, photoB, legacy];
  test('User A sees only their own photo', () => eq(S.phFilterMine(all, A).map(p => p.id), ['p1']));
  test('User B sees only their own photo', () => eq(S.phFilterMine(all, B).map(p => p.id), ['p2']));
  test("User B never sees User A's photo", () => notOk(S.phFilterMine(all, B).some(p => p.id === 'p1')));
  test('legacy photo is shown to nobody (quarantined)', () => {
    notOk(S.phFilterMine(all, A).some(p => p.id === 'p3'));
    notOk(S.phFilterMine(all, B).some(p => p.id === 'p3'));
  });
  test('signed out shows nothing', () => eq(S.phFilterMine(all, ''), []));
  test('empty/absent input is safe', () => {
    eq(S.phFilterMine([], A), []);
    eq(S.phFilterMine(null, A), []);
  });
});

group('M1 — upload gating (what would have leaked before)', () => {
  // The upload set is exactly "photos this account owns". Under the old
  // device-global model this list included every photo left on the device.
  const onDevice = [photoA, photoB, legacy];
  test("logging in as B uploads none of A's or the legacy photos", () => {
    eq(S.phFilterMine(onDevice, B).map(p => p.id), ['p2']);
  });
});

report();
