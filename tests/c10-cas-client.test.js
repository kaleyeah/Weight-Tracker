/* Commit 10 — CAS client decision core.
   Every test names the acceptance ID it discharges, so a failure says which
   criterion broke rather than which function did. Blocks are sliced out of the
   shipping index.html, so these cannot drift from a copy of the logic. */
const { loadTestable, test, group, eq, ok, notOk, report } = require('./harness');
const crypto = require('crypto');
const C = loadTestable(['C10']);

const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

group('C10-PLAN-11 — canonical request identity produces stable SHA-256 keys', () => {
  const idA = C.cfCasIdentity('core', 4, '{"a":1}');
  test('identity is subsystem, expected revision and canonical payload', () =>
    eq(idA, 'core\n4\n{"a":1}'));
  test('identical canonical payloads produce an identical key', () =>
    eq(C.cfCasKeyFrom(sha(idA)), C.cfCasKeyFrom(sha(C.cfCasIdentity('core', 4, '{"a":1}')))));
  test('a payload byte change produces a different key', () =>
    notOk(C.cfCasKeyFrom(sha(idA)) === C.cfCasKeyFrom(sha(C.cfCasIdentity('core', 4, '{"a":2}')))));
  test('a subsystem change produces a different key', () =>
    notOk(C.cfCasKeyFrom(sha(idA)) === C.cfCasKeyFrom(sha(C.cfCasIdentity('training', 4, '{"a":1}')))));
  test('an expectedRev change produces a different key', () =>
    notOk(C.cfCasKeyFrom(sha(idA)) === C.cfCasKeyFrom(sha(C.cfCasIdentity('core', 5, '{"a":1}')))));
  test('key is a full 64-char digest, not truncated', () =>
    eq(C.cfCasKeyFrom(sha(idA)).length, 68));
  test('key fits the server 96-char limit', () =>
    ok(C.cfCasKeyFrom(sha(idA)).length <= 96));
  test('an over-length digest is REFUSED rather than truncated', () =>
    eq(C.cfCasKeyFrom('x'.repeat(200)), null));
  test('no raw payload content appears in the key', () =>
    notOk(C.cfCasKeyFrom(sha(C.cfCasIdentity('core', 1, '{"secretWeight":81.5}'))).includes('81.5')));
});

group('CAS-05 / CAS-06 — a 200 acknowledges only the revision it captured', () => {
  test('CAS-05 no edit in flight: the subsystem goes clean', () => {
    const r = C.cfCasAck({ local: 7, attempted: 7, success: 3 }, 7, 12);
    eq(r.success, 7); notOk(r.stillPending); eq(r.serverRev, 12);
  });
  test('CAS-06 edit during flight: newer revision stays PENDING', () => {
    const r = C.cfCasAck({ local: 9, attempted: 7, success: 3 }, 7, 12);
    eq(r.success, 7); ok(r.stillPending);
  });
  test('an older response can never lower the high-water mark', () =>
    eq(C.cfCasAck({ local: 9, attempted: 9, success: 8 }, 5, 12).success, 8));
  test('serverRev is retained when a response carries none', () =>
    eq(C.cfCasAck({ local: 1, attempted: 1, success: 0, serverRev: 4 }, 1, null).serverRev, 4));
});

group('CAS-11 — no automatic commit while a subsystem is not free to send', () => {
  const base = { local: 5, success: 3, blocked: null, conflictId: null };
  test('pending and unblocked may commit', () => ok(C.cfCasCanCommit(base)));
  test('clean does not commit', () => notOk(C.cfCasCanCommit({ ...base, local: 3 })));
  test('unresolved conflict blocks the subsystem', () =>
    notOk(C.cfCasCanCommit({ ...base, conflictId: 'k1' })));
  ['auth', 'update', 'oversize', 'invariant', 'recovery', 'ownership'].forEach((b) =>
    test(`blocked=${b} prevents automatic commit`, () =>
      notOk(C.cfCasCanCommit({ ...base, blocked: b }))));
});

group('CAS-12 — only the two permitted automatic resolutions', () => {
  test('server already holds what we sent → agree, no prompt', () =>
    eq(C.cfCasAutoResolve('{"a":1}', '{"a":1}', '{"a":0}', false), 'agree'));
  test('server still equals our last agreed baseline → retry once', () =>
    eq(C.cfCasAutoResolve('{"a":0}', '{"a":1}', '{"a":0}', false), 'retry-once'));
  test('the retry may happen only once', () =>
    eq(C.cfCasAutoResolve('{"a":0}', '{"a":1}', '{"a":0}', true), 'conflict'));
  test('genuinely divergent content is ALWAYS a conflict', () =>
    eq(C.cfCasAutoResolve('{"a":9}', '{"a":1}', '{"a":0}', false), 'conflict'));
  test('no baseline known → conflict, never a guess', () =>
    eq(C.cfCasAutoResolve('{"a":9}', '{"a":1}', '', false), 'conflict'));
});

group('C10-PLAN-05 / C10-PLAN-06 — the resolution context is subsystem-specific', () => {
  const ctx = () => C.cfCasCtx('core', 'userA', 2, 5, 'cf1', 11, 'rec1');
  test('C10-PLAN-06 an edit to the AFFECTED subsystem aborts adoption', () =>
    ok(C.cfCasCtxDrifted(ctx(), C.cfCasCtx('core', 'userA', 2, 6, 'cf1', 11, 'rec1'))));
  test('C10-PLAN-05 an edit to the OTHER subsystem does not abort it', () =>
    notOk(C.cfCasCtxDrifted(ctx(), ctx())));
  test('a different account aborts', () =>
    ok(C.cfCasCtxDrifted(ctx(), C.cfCasCtx('core', 'userB', 2, 5, 'cf1', 11, 'rec1'))));
  test('a new session generation aborts', () =>
    ok(C.cfCasCtxDrifted(ctx(), C.cfCasCtx('core', 'userA', 3, 5, 'cf1', 11, 'rec1'))));
  test('a replaced conflict record aborts', () =>
    ok(C.cfCasCtxDrifted(ctx(), C.cfCasCtx('core', 'userA', 2, 5, 'cf2', 11, 'rec1'))));
  test('a moved server revision aborts', () =>
    ok(C.cfCasCtxDrifted(ctx(), C.cfCasCtx('core', 'userA', 2, 5, 'cf1', 12, 'rec1'))));
  test('a different recovery artifact aborts', () =>
    ok(C.cfCasCtxDrifted(ctx(), C.cfCasCtx('core', 'userA', 2, 5, 'cf1', 11, 'rec2'))));
  test('a missing context is treated as drifted', () => ok(C.cfCasCtxDrifted(null, ctx())));
});

group('C10-PLAN-09 — the cas-conflict artifact contract', () => {
  const comps = { payload: '{"w":[1,2]}' };
  const man = (o) => Object.assign({
    kind: 'cas-conflict', id: 'r1', sub: 'core', serverRev: 11,
    account: 'userA', keys: ['payload'], sizes: { payload: comps.payload.length },
    hash: 'abc',
  }, o || {});
  test('a well-formed single-subsystem artifact validates', () => ok(C.cfCasRecValid(man(), 'r1', comps)));
  test('rejects the whole-snapshot component set (no hybrids)', () =>
    notOk(C.cfCasRecValid(man({ keys: ['core', 'training', 'workout'] }), 'r1',
      { core: 'a', training: 'b', workout: 'c' })));
  test('rejects an extra component', () =>
    notOk(C.cfCasRecValid(man(), 'r1', { payload: comps.payload, training: 'x' })));
  test('rejects a size that disagrees with the stored bytes', () =>
    notOk(C.cfCasRecValid(man({ sizes: { payload: 999 } }), 'r1', comps)));
  test('rejects a mismatched id — no pointing at another artifact', () =>
    notOk(C.cfCasRecValid(man(), 'r2', comps)));
  test('rejects a missing account scope', () =>
    notOk(C.cfCasRecValid(man({ account: '' }), 'r1', comps)));
  test('rejects an unknown subsystem', () =>
    notOk(C.cfCasRecValid(man({ sub: 'photos' }), 'r1', comps)));
  test('rejects a non-integer server revision', () =>
    notOk(C.cfCasRecValid(man({ serverRev: 1.5 }), 'r1', comps)));
  test('rejects the wrong artifact kind', () =>
    notOk(C.cfCasRecValid(man({ kind: 'set-aside' }), 'r1', comps)));
  test('rejects a missing content hash', () =>
    notOk(C.cfCasRecValid(man({ hash: '' }), 'r1', comps)));
  test('an artifact is immutable once written', () => {
    ok(C.cfCasRecMayWrite(null));
    notOk(C.cfCasRecMayWrite(man()));
  });
});

group('C10-PLAN-07 / C10-PLAN-08 — first-row creation needs positive proof', () => {
  const full = {
    authenticated: true, serverRowAbsent: true, ownershipResolved: true,
    everAcknowledgedRow: false, localDataBelongsToAccount: true,
  };
  test('C10-PLAN-07 all four conditions proven → creation allowed', () =>
    ok(C.cfCasFirstRowAllowed(full)));
  test('absent metadata alone is not proof', () => notOk(C.cfCasFirstRowAllowed({})));
  test('unauthenticated is refused', () =>
    notOk(C.cfCasFirstRowAllowed({ ...full, authenticated: false })));
  test('C10-PLAN-08 a device that once knew a row never auto-creates', () =>
    notOk(C.cfCasFirstRowAllowed({ ...full, everAcknowledgedRow: true })));
  test('unresolved ownership is refused', () =>
    notOk(C.cfCasFirstRowAllowed({ ...full, ownershipResolved: false })));
  test('local data belonging to another account is refused', () =>
    notOk(C.cfCasFirstRowAllowed({ ...full, localDataBelongsToAccount: false })));
  test('a row the server reports as present is refused', () =>
    notOk(C.cfCasFirstRowAllowed({ ...full, serverRowAbsent: false })));
});

group('STATUS-01/02/03 — the compact indicator tells the truth', () => {
  test('update required outranks everything', () => eq(C.cfCasStatus('update', 'conflict'), 'update'));
  test('conflict outranks auth', () => eq(C.cfCasStatus('synced', 'conflict'), 'conflict'));
  test('auth outranks a failure', () => eq(C.cfCasStatus('failed', 'auth'), 'auth'));
  test('failure outranks pending', () => eq(C.cfCasStatus('pending', 'failed'), 'failed'));
  test('STATUS-01 a local edit shows pending, not synced', () =>
    eq(C.cfCasStatus('pending', 'synced'), 'pending'));
  test('STATUS-02 syncing only when a request is really active', () =>
    eq(C.cfCasStatus('syncing', 'synced'), 'syncing'));
  test('STATUS-03 synced only when both subsystems are settled', () =>
    eq(C.cfCasStatus('synced', 'synced'), 'synced'));
});

group('CAS-20 / spec §4 — bounded retry and per-status disposition', () => {
  test('network failure retries at 5s then 30s then stops', () => {
    eq(C.cfCasRetryDelay(0, 0), 5000);
    eq(C.cfCasRetryDelay(0, 1), 30000);
    eq(C.cfCasRetryDelay(0, 2), null);
  });
  test('500 uses the same bounded ladder', () => eq(C.cfCasRetryDelay(500, 0), 5000));
  ['409', '413', '426', '401', '400'].forEach((s) =>
    test(`${s} never enters the retry loop`, () => eq(C.cfCasRetryDelay(Number(s), 0), null)));
  test('409 with conflict:true is a conflict', () =>
    eq(C.cfCasDisposition(409, { conflict: true }), 'conflict'));
  test('409 reused-key is an INVARIANT, never a conflict card', () =>
    eq(C.cfCasDisposition(409, { ok: false, error: 'idempotency key reused with a different request' }), 'invariant'));
  test('413 is oversize', () => eq(C.cfCasDisposition(413, {}), 'oversize'));
  test('426 is update-required', () => eq(C.cfCasDisposition(426, {}), 'update'));
  test('401 is auth', () => eq(C.cfCasDisposition(401, {}), 'auth'));
  test('400 is a contract failure, not a retry', () => eq(C.cfCasDisposition(400, {}), 'contract'));
  test('an unexpected status fails closed as a contract failure', () =>
    eq(C.cfCasDisposition(418, {}), 'contract'));
});

report();
