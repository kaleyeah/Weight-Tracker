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

group('C10-P1-01 — recovery sizes are UTF-8 BYTES, not code units', () => {
  const cases = [
    ['ascii', 'abc', 3],
    ['accented', 'f\u00e9\u00e9', 5],
    ['em dash', '81.5 kg \u2014 ok', 14],   /* 8 ASCII + 3 (em dash) + 3 */
    ['emoji (surrogate pair)', 'a\ud83c\udfcbb', 6],
    ['lone high surrogate', 'a\ud83cb', 5],
    ['empty', '', 0],
  ];
  cases.forEach(([name, str, expected]) => {
    test(`${name}: counts ${expected} UTF-8 bytes`, () => eq(C.cfCasUtf8Bytes(str), expected));
    test(`${name}: agrees with Buffer.byteLength`, () =>
      eq(C.cfCasUtf8Bytes(str), Buffer.byteLength(str, 'utf8')));
  });
  test('a multibyte payload measures LONGER than String.length', () => {
    const p = '{"note":"f\u00e9\u00e9 \ud83c\udfcb"}';
    ok(C.cfCasUtf8Bytes(p) > p.length);
  });
  test('null and undefined measure 0 rather than throwing', () => {
    eq(C.cfCasUtf8Bytes(null), 0); eq(C.cfCasUtf8Bytes(undefined), 0);
  });
});

group('C10-P1-02 — a declared digest must look like a full SHA-256', () => {
  test('accepts a 64-char lowercase hex digest', () => ok(C.cfCasHashValid(sha('x'))));
  test('rejects a truncated digest', () => notOk(C.cfCasHashValid(sha('x').slice(0, 32))));
  test('rejects uppercase hex', () => notOk(C.cfCasHashValid(sha('x').toUpperCase())));
  test('rejects non-hex characters', () => notOk(C.cfCasHashValid('z'.repeat(64))));
  test('rejects an empty or absent digest', () => {
    notOk(C.cfCasHashValid('')); notOk(C.cfCasHashValid(undefined));
  });
});

group('C10-PLAN-09 — the cas-conflict artifact contract', () => {
  const comps = { payload: '{"w":[1,2]}' };
  const man = (o) => Object.assign({
    kind: 'cas-conflict', id: 'r1', sub: 'core', serverRev: 11,
    account: 'userA', keys: ['payload'], sizes: { payload: C.cfCasUtf8Bytes(comps.payload) },
    hash: sha(comps.payload),
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
  test('a multibyte payload validates on BYTES, not code units', () => {
    const mb = { payload: '{"n":"f\u00e9\u00e9 \ud83c\udfcb"}' };
    ok(C.cfCasRecValid(
      man({ sizes: { payload: C.cfCasUtf8Bytes(mb.payload) }, hash: sha(mb.payload) }), 'r1', mb));
  });
  test('the OLD code-unit length is now REJECTED for a multibyte payload', () => {
    const mb = { payload: '{"n":"f\u00e9\u00e9 \ud83c\udfcb"}' };
    notOk(C.cfCasRecValid(
      man({ sizes: { payload: mb.payload.length }, hash: sha(mb.payload) }), 'r1', mb));
  });
  test('a non-digest hash is rejected by shape validation', () =>
    notOk(C.cfCasRecValid(man({ hash: 'abc' }), 'r1', comps)));
});

group('C10-P1-02 — "verified" means content and ownership were CHECKED', () => {
  const payload = '{"w":[1,2]}';
  const comps = { payload };
  const good = {
    kind: 'cas-conflict', id: 'r1', sub: 'core', serverRev: 11, account: 'userA',
    keys: ['payload'], sizes: { payload: C.cfCasUtf8Bytes(payload) }, hash: sha(payload),
  };
  const expect = { account: 'userA', sub: 'core', serverRev: 11, rec: 'r1' };
  const V = (m, c, e, h) => C.cfCasRecVerified(m, 'r1', c, e, h === undefined ? sha(c.payload) : h);

  test('a fully consistent artifact verifies', () => ok(V(good, comps, expect)));
  test('changed payload, unchanged manifest hash → REJECTED', () => {
    const tampered = { payload: '{"w":[9,9]}' };
    const m = { ...good, sizes: { payload: C.cfCasUtf8Bytes(tampered.payload) } };
    notOk(V(m, tampered, expect, sha(tampered.payload)));
  });
  test('changed hash, unchanged payload → REJECTED', () =>
    notOk(V({ ...good, hash: sha('something else') }, comps, expect)));
  test('malformed/short hash → REJECTED', () =>
    notOk(V({ ...good, hash: 'deadbeef' }, comps, expect)));
  test('a computed digest that is not a digest → REJECTED', () =>
    notOk(V(good, comps, expect, 'not-a-digest')));
  test('artifact from ANOTHER ACCOUNT → REJECTED', () =>
    notOk(V({ ...good, account: 'userB' }, comps, expect)));
  test('artifact for the other subsystem → REJECTED', () =>
    notOk(V({ ...good, sub: 'training' }, comps, expect)));
  test('artifact captured at a different server revision → REJECTED', () =>
    notOk(V(good, comps, { ...expect, serverRev: 12 })));
  test('conflict pointing at a different artifact id → REJECTED', () =>
    notOk(V(good, comps, { ...expect, rec: 'r2' })));
  test('no expectation supplied → REJECTED, never assumed', () =>
    notOk(V(good, comps, null)));
  test('a multibyte payload verifies end to end', () => {
    const mb = { payload: '{"n":"f\u00e9\u00e9 \ud83c\udfcb"}' };
    const m = { ...good, sizes: { payload: C.cfCasUtf8Bytes(mb.payload) }, hash: sha(mb.payload) };
    ok(V(m, mb, expect));
  });
  test('shape-valid but unverified is NOT actionable', () => {
    ok(C.cfCasRecValid(good, 'r1', comps));
    notOk(V({ ...good, account: 'userB' }, comps, expect));
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
  test('a 200 carrying the success contract is ok', () =>
    eq(C.cfCasDisposition(200, { ok: true, subsystem: 'core', newRev: 4 }, 'core'), 'ok'));
  test('a bare 200 is NOT success — status alone is never proof', () =>
    eq(C.cfCasDisposition(200, {}, 'core'), 'contract'));
  test('a 200 without newRev is not success', () =>
    eq(C.cfCasDisposition(200, { ok: true, subsystem: 'core' }, 'core'), 'contract'));
  test('a 200 with ok:false is not success', () =>
    eq(C.cfCasDisposition(200, { ok: false, newRev: 4 }, 'core'), 'contract'));
  test('a 200 with no body at all is not success', () =>
    eq(C.cfCasDisposition(200, null, 'core'), 'contract'));
  test('C10-P8-11 a 200 without subsystem is rejected', () =>
    eq(C.cfCasDisposition(200, { ok: true, newRev: 1 }, 'core'), 'contract'));
  test('a 200 about the OTHER subsystem is rejected', () =>
    eq(C.cfCasDisposition(200, { ok: true, subsystem: 'training', newRev: 1 }, 'core'), 'contract'));
  test('C10-P8-12 a fractional newRev is rejected', () =>
    eq(C.cfCasDisposition(200, { ok: true, subsystem: 'core', newRev: 1.5 }, 'core'), 'contract'));
  test('C10-P8-12 a negative newRev is rejected', () =>
    eq(C.cfCasDisposition(200, { ok: true, subsystem: 'core', newRev: -1 }, 'core'), 'contract'));
  test('C10-P8-12 a non-numeric newRev is rejected', () =>
    eq(C.cfCasDisposition(200, { ok: true, subsystem: 'core', newRev: '3' }, 'core'), 'contract'));
  test('C10-P8-13 a 409 with no serverRev is a contract failure, not a conflict', () =>
    eq(C.cfCasDisposition(409, { conflict: true, payload: {} }, 'core'), 'contract'));
  test('C10-P8-13 a 409 with a non-object payload is a contract failure', () =>
    eq(C.cfCasDisposition(409, { conflict: true, serverRev: 2, payload: 'nope' }, 'core'), 'contract'));
  test('C10-P8-13 a 409 with an array payload is a contract failure', () =>
    eq(C.cfCasDisposition(409, { conflict: true, serverRev: 2, payload: [] }, 'core'), 'contract'));
  test('the documented no-row 409 IS a valid conflict', () =>
    eq(C.cfCasDisposition(409, { conflict: true, serverRev: null, payload: null }, 'core'), 'conflict'));
  test('a no-row 409 with a payload is malformed', () =>
    eq(C.cfCasDisposition(409, { conflict: true, serverRev: null, payload: {} }, 'core'), 'contract'));
  test('409 with conflict:true is a conflict', () =>
    eq(C.cfCasDisposition(409, { conflict: true, serverRev: 3, payload: {} }, 'core'), 'conflict'));
  test('409 reused-key is an INVARIANT, never a conflict card', () =>
    eq(C.cfCasDisposition(409, { ok: false, error: 'idempotency key reused with a different request' }, 'core'), 'invariant'));
  test('413 is oversize', () => eq(C.cfCasDisposition(413, {}, 'core'), 'oversize'));
  test('426 is update-required', () => eq(C.cfCasDisposition(426, {}, 'core'), 'update'));
  test('401 is auth', () => eq(C.cfCasDisposition(401, {}, 'core'), 'auth'));
  test('400 is a contract failure, not a retry', () => eq(C.cfCasDisposition(400, {}, 'core'), 'contract'));
  test('an unexpected status fails closed as a contract failure', () =>
    eq(C.cfCasDisposition(418, {}, 'core'), 'contract'));
});

report();
