/* Commit 10 — PocketBase/CAS manifest verification.

   The last gate, and the one that decides whether preserving the online copy
   was worth doing. The chain proved here runs end to end with nothing invented
   along the way:

     a real PocketBase 409  ->  the server's own payload
     ->  the app's recovery writer  ->  real localStorage
     ->  a raw dump of that storage
     ->  an INDEPENDENT reader that shares no code with the app
     ->  the athlete's data, byte for byte

   The reader (tests/independent/cas-recovery-reader.js) requires nothing —
   not the app, not the project, not even Node's crypto. Its SHA-256 is its
   own, verified against Node's on multibyte vectors, so verification does not
   share a code path with the thing it is verifying. Someone holding a JSON
   dump of their browser storage and that one file can check their data.

   Disposable PocketBase, 127.0.0.1, cf_test_* accounts only, destroyed after
   the run. Production is not involved. */
const pb = require('./pbserver');
const { boot } = require('./driver');
const R = require('../independent/cas-recovery-reader');
const { section, test, ok, notOk, eq, summary } = require('./harness');
const fs = require('fs');
const path = require('path');

const PORT = 8099;

(async () => {
  if (!pb.available()) {
    console.log('SKIPPED — no PocketBase binary at ' + pb.PB_BIN);
    process.exit(0);
  }

  const server = await pb.start(PORT);
  const b = await boot({
    allowNetwork: true,
    account: { uid: server.user.id, base: server.base, token: server.user.token, email: server.user.email },
  });
  const page = b.page;

  /* A raw snapshot of what is actually in the browser's storage. No app code
     is consulted to produce it. */
  const dump = () => page.evaluate(() => {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      out[k] = localStorage.getItem(k);
    }
    return out;
  });

  section('Independence — the reader shares nothing with the app');

  await test('MV-01 the reader requires nothing at all', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'independent', 'cas-recovery-reader.js'), 'utf8');
    const code = src.replace(/\/\*[^]*?\*\//g, ' ').replace(/(^|\s)\/\/[^\n]*/g, '$1');
    const requires = [...code.matchAll(/require\((['"])(.*?)\1\)/g)].map((m) => m[2]);
    eq(requires.length, 0, 'it requires: ' + requires.join(', '));
    ['cfCasRecValid', 'cfCasRecVerified', 'cfCasUtf8Bytes', 'cfCasHashValid', 'cfCanon']
      .forEach((fn) => notOk(code.includes(fn), 'it references the app function ' + fn));
    ok(code.includes('function sha256Hex('), 'the comment stripper must not have emptied the file');
  });

  await test('MV-02 its digest agrees with a reference implementation, including multibyte', () => {
    const crypto = require('crypto');
    ['', 'abc', 'a'.repeat(1000), '{"weights":[]}', 'héllo wörld 日本語 🏋️'].forEach((s) => {
      eq(R.sha256Hex(s), crypto.createHash('sha256').update(s, 'utf8').digest('hex'),
        'digest mismatch for a ' + s.length + '-unit string');
    });
    /* and its byte counter counts BYTES, not UTF-16 code units */
    eq(R.utf8Bytes('héllo 🏋️').length, Buffer.byteLength('héllo 🏋️', 'utf8'));
  });

  section('MV-03..08 — a real server payload, recovered by the independent reader');

  let realPayload = null;
  let recId = null;

  await test('MV-03 a real PocketBase 409 yields the server\'s own copy', async () => {
    /* commit once so the row exists and a stale revision is genuinely stale */
    const seed = await server.api('POST', '/api/cf/appdata/commit', server.user.token, {
      subsystem: 'core', expectedRev: 0, idempotencyKey: 'c10-' + 'a'.repeat(20),
      payload: { weights: [{ date: '2026-08-01', weight: 76.4, note: 'from the server' }] },
      clientBuild: 't', deviceId: 'd',
    });
    eq(seed.status, 200, JSON.stringify(seed.body));
    const conflicted = await server.api('POST', '/api/cf/appdata/commit', server.user.token, {
      subsystem: 'core', expectedRev: 0, idempotencyKey: 'c10-' + 'b'.repeat(20),
      payload: { weights: [{ date: '2026-08-02', weight: 99 }] }, clientBuild: 't', deviceId: 'd',
    });
    eq(conflicted.status, 409);
    eq(conflicted.body.conflict, true);
    realPayload = conflicted.body.payload;
    eq(realPayload.weights[0].note, 'from the server',
      'the payload under test must be the SERVER\'s, not ours');
  });

  await test('MV-04 the app preserves it through its own recovery writer', async () => {
    recId = await page.evaluate(async (c) => {
      const id = cfCasRecNewId('core');
      const okW = await new Promise((r) => {
        cfCasRecWrite(id, 'core', c.serverRev, JSON.stringify(c.payload), (o) => r(o));
      });
      if (!okW) throw new Error('the recovery write failed');
      cfCasSetServerRev('core', c.serverRev);
      cfCasSetConflictId('core', id);
      return id;
    }, { serverRev: 1, payload: realPayload });
    ok(R.ID_RE.test(recId), 'the record id must be well formed: ' + recId);
  });

  await test('MV-05 the INDEPENDENT reader finds it in a raw storage dump', async () => {
    const snapshot = await dump();
    const found = R.inspectAll(snapshot);
    const mine = found.filter((r) => r.id === recId);
    eq(mine.length, 1, 'expected exactly one artifact, saw ' + found.length + ' overall');
    eq(mine[0].problems.length, 0, 'problems: ' + mine[0].problems.join(', '));
    ok(mine[0].recoverable, 'the athlete\'s copy must be recoverable');
    eq(mine[0].sub, 'core');
    eq(mine[0].serverRev, 1);
  });

  await test('MV-06 what it recovers is the server\'s data, byte for byte', async () => {
    const snapshot = await dump();
    const rec = R.inspect(snapshot, server.user.id, recId);
    ok(rec.recoverable, rec.problems.join(', '));
    eq(JSON.stringify(rec.payload), JSON.stringify(realPayload),
      'the recovered copy must equal what PocketBase actually returned');
    eq(rec.payload.weights[0].weight, 76.4);
    eq(rec.payload.weights[0].note, 'from the server');
  });

  await test('MV-07 the reader verifies rather than trusts: a tampered payload is caught', async () => {
    const snapshot = await dump();
    const key = 'cf:casrec:' + server.user.id + ':' + recId + ':payload';
    ok(snapshot[key], 'the payload key must exist to tamper with');
    /* Same byte length, different content — so only the hash can catch it. */
    const original = snapshot[key];
    const tampered = original.replace('76.4', '99.9');
    eq(tampered.length, original.length, 'the test needs an equal-length substitution');
    notOk(tampered === original, 'and it must actually differ');
    const rec = R.inspect(Object.assign({}, snapshot, { [key]: tampered }), server.user.id, recId);
    notOk(rec.recoverable, 'a tampered payload must not be reported recoverable');
    ok(rec.problems.indexOf('content-does-not-match-hash') >= 0,
      'and the reason must be the hash: ' + rec.problems.join(', '));
  });

  await test('MV-08 an unpublished candidate is not offered as the athlete\'s copy', async () => {
    const snapshot = await dump();
    const key = 'cf:casrec:' + server.user.id + ':' + recId + ':manifest';
    const without = Object.assign({}, snapshot);
    delete without[key];
    const rec = R.inspect(without, server.user.id, recId);
    notOk(rec.recoverable, 'no manifest means the writer never stood behind it');
    ok(rec.problems.indexOf('payload-without-manifest') >= 0
       || rec.problems.indexOf('not-published') >= 0, rec.problems.join(', '));
  });

  section('MV-09..11 — account isolation, proven from the dump');

  await test('MV-09 the artifact is namespaced to the account that owns it', async () => {
    const snapshot = await dump();
    const listed = R.listArtifacts(snapshot).filter((a) => a.id === recId);
    eq(listed.length, 1);
    eq(listed[0].account, server.user.id, 'the artifact must be scoped to its athlete');
  });

  await test('MV-10 another account recovers nothing of it', async () => {
    const snapshot = await dump();
    const theirs = R.recoverableFor(snapshot, 'someone-else');
    eq(theirs.filter((r) => r.id === recId).length, 0,
      'another account must not be able to recover this athlete\'s copy');
    const wrongScope = R.inspect(snapshot, 'someone-else', recId);
    notOk(wrongScope.recoverable);
  });

  await test('MV-11 a manifest moved into another account\'s namespace is rejected', async () => {
    /* The strongest form: copy every component verbatim under a different
       account. Only the account bound INSIDE the manifest can catch this —
       key naming alone would let it through. */
    const snapshot = await dump();
    const moved = Object.assign({}, snapshot);
    ['claim', 'payload', 'manifest'].forEach((part) => {
      const from = 'cf:casrec:' + server.user.id + ':' + recId + ':' + part;
      if (snapshot[from] !== undefined) {
        moved['cf:casrec:someone-else:' + recId + ':' + part] = snapshot[from];
      }
    });
    const rec = R.inspect(moved, 'someone-else', recId);
    notOk(rec.recoverable, 'a relocated artifact must not become another account\'s data');
    ok(rec.problems.indexOf('account-mismatch') >= 0,
      'and the reason must name the account: ' + rec.problems.join(', '));
  });

  section('MV-12..13 — it survives the round trip an athlete would actually make');

  await test('MV-12 the copy is still recoverable after a real reload', async () => {
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.style.visibility !== 'hidden');
    await page.waitForTimeout(300);
    const snapshot = await dump();
    const rec = R.inspect(snapshot, server.user.id, recId);
    ok(rec.recoverable, 'lost after reload: ' + rec.problems.join(', '));
    eq(JSON.stringify(rec.payload), JSON.stringify(realPayload));
  });

  await test('MV-13 the app and the independent reader agree on the same artifact', async () => {
    /* Two implementations, one artifact. Agreement is the evidence; if they
       disagreed, the disagreement would be the finding. */
    const fromApp = await page.evaluate((id) => new Promise((res) => {
      cfCasRecRead(id, { account: pbUid(), sub: 'core', serverRev: cfCasServerRev('core'), rec: id },
        (payload, why) => res({ payload, why: why || null }));
    }), recId);
    ok(fromApp.payload !== null, 'the app could not read it back: ' + fromApp.why);
    const snapshot = await dump();
    const fromReader = R.inspect(snapshot, server.user.id, recId);
    ok(fromReader.recoverable, fromReader.problems.join(', '));
    eq(JSON.stringify(JSON.parse(fromApp.payload)), JSON.stringify(fromReader.payload),
      'the app and an independent implementation must recover the same bytes');
  });

  section('Page health');

  await test('no uncaught error across the run', () => {
    const real = b.pageErrors.filter((e) =>
      !/ERR_(NAME_NOT_RESOLVED|FAILED|ABORTED|INTERNET_DISCONNECTED)|status of 4/.test(e));
    eq(real.length, 0, real.join(' | '));
  });

  const failed = summary('manifest-recovery.browser.test.js');
  await b.close();
  await server.stop();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAILURE', e); process.exit(1); });
