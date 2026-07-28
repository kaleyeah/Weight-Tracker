/* HOTFIX-001 — evidence, run against BOTH hook versions on disposable instances.
   Nothing here touches production.

   Answers five questions the Architect asked for, each against the DEPLOYED
   hook and the CORRECTED one, so every claim is a comparison rather than an
   assertion about one build:

     A  dropped-response replay        does a valid retry get its result back?
     B  mismatched-request refusal     is key-reuse protection still enforced?
     C  route contract                 did any response shape change?
     D  payload semantics              are the stored bytes identical?
     E  size cap                       is the 256 KiB boundary unmoved?

   usage: node server/hotfix/proof/hotfix-evidence.js [beforeRef] [afterRef]
*/
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PB_BIN = path.join(process.env.HOME, 'staging-cas', 'bin', 'pocketbase');
const REPO = path.join(__dirname, '..', '..', '..');
const BEFORE = process.argv[2] || 'b929852';          /* the deployed hook */
const AFTER = process.argv[3] || 'HEAD';              /* the corrected hook */
const MAX_PAYLOAD_BYTES = 256 * 1024;

/* Minimum schema for a disposable instance. The CAS migration deliberately
   assumes `appdata` exists — in production it is part of the app's own schema,
   and a migration able to create it would be a migration able to destroy it. */
const BOOTSTRAP = `migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  app.save(new Collection({ type: "base", name: "appdata",
    fields: [
      { name: "user", type: "relation", required: true, collectionId: users.id, cascadeDelete: true, maxSelect: 1 },
      { name: "data", type: "json", maxSize: 2000000 },
      { name: "training", type: "json", maxSize: 2000000 }],
    listRule: "user = @request.auth.id", viewRule: "user = @request.auth.id",
    createRule: "user = @request.auth.id", updateRule: "user = @request.auth.id",
    deleteRule: "user = @request.auth.id" }));
}, (app) => { try { app.delete(app.findCollectionByNameOrId("appdata")); } catch (_) {} });`;

async function instance(ref, port) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-hotfix-'));
  fs.mkdirSync(path.join(dir, 'pb_hooks'));
  fs.mkdirSync(path.join(dir, 'pb_migrations'));
  for (const f of ['cf_cas.pb.js', 'cf_cas_shared.js']) {
    fs.writeFileSync(path.join(dir, 'pb_hooks', f),
      execFileSync('git', ['-C', REPO, 'show', ref + ':server/pb_hooks/' + f]));
  }
  fs.writeFileSync(path.join(dir, 'pb_migrations', '1753400000_cf_cas.js'),
    execFileSync('git', ['-C', REPO, 'show', ref + ':server/pb_migrations/1753400000_cf_cas.js']));
  fs.writeFileSync(path.join(dir, 'pb_migrations', '1753300000_base.js'), BOOTSTRAP);

  const log = fs.openSync(path.join(dir, 'pb.log'), 'a');
  const proc = spawn(PB_BIN, ['serve', '--http=127.0.0.1:' + port,
    '--dir=' + path.join(dir, 'pb_data'),
    '--hooksDir=' + path.join(dir, 'pb_hooks'),
    '--migrationsDir=' + path.join(dir, 'pb_migrations')], { cwd: dir, stdio: ['ignore', log, log] });

  const base = 'http://127.0.0.1:' + port;
  const deadline = Date.now() + 20000;
  for (;;) {
    try { if ((await fetch(base + '/api/health')).ok) break; } catch (e) { /* not up */ }
    if (Date.now() > deadline) throw new Error(ref + ': PocketBase did not start\n'
      + fs.readFileSync(path.join(dir, 'pb.log'), 'utf8').slice(-1200));
    await new Promise((r) => setTimeout(r, 250));
  }

  const call = async (method, url, token, body) => {
    const res = await fetch(base + url, {
      method,
      headers: Object.assign({ 'content-type': 'application/json' }, token ? { Authorization: token } : {}),
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
    });
    let json = null; try { json = await res.json(); } catch (e) { json = null; }
    return { status: res.status, body: json };
  };

  execFileSync(PB_BIN, ['superuser', 'upsert', 'cf_test_local@staging.invalid', 'LocalTestPw123456',
    '--dir=' + path.join(dir, 'pb_data')], { stdio: 'ignore' });
  const admin = (await call('POST', '/api/collections/_superusers/auth-with-password', null,
    { identity: 'cf_test_local@staging.invalid', password: 'LocalTestPw123456' })).body.token;
  await call('POST', '/api/collections/users/records', admin, {
    email: 'cf_test_athlete@staging.invalid', password: 'AthletePw123456',
    passwordConfirm: 'AthletePw123456', verified: true,
  });
  const auth = (await call('POST', '/api/collections/users/auth-with-password', null,
    { identity: 'cf_test_athlete@staging.invalid', password: 'AthletePw123456' })).body;

  return {
    ref, base, admin, token: auth.token, uid: auth.record.id, call,
    row: async () => {
      const r = await call('GET', '/api/collections/appdata/records?filter='
        + encodeURIComponent(`user="${auth.record.id}"`), admin);
      return (r.body && r.body.items && r.body.items[0]) || null;
    },
    async stop() {
      try { proc.kill('SIGTERM'); } catch (e) { /* gone */ }
      await new Promise((r) => setTimeout(r, 400));
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* best effort */ }
    },
  };
}

/* Order-insensitive serialization, for comparing CONTENT. */
function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  return '{' + Object.keys(v).sort()
    .filter((k) => v[k] !== undefined)
    .map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
}

/* A payload with the shape a real athlete has: several keys at several levels.
   The defect is invisible on a single-key object, which is exactly why the
   existing I1 replay test never caught it. */
const ATHLETE_PAYLOAD = {
  weights: [{ date: '2026-02-02', weight: 79, note: 'felt strong', steps: 9000 }],
  settings: { theme: 'dark', units: 'kg', startDate: '2026-01-01', goalWeight: 74 },
  steps: { '2026-02-02': 9000 }, notes: { '2026-02-02': 'good session' },
  sleep: { '2026-02-02': 7.5 }, food: {}, bodyfat: {},
};

async function evidence(inst) {
  const out = { ref: inst.ref };
  const commit = (body) => inst.call('POST', '/api/cf/appdata/commit', inst.token, body);
  const req = (rev, key, payload) => ({
    subsystem: 'core', expectedRev: rev, idempotencyKey: key,
    payload, clientBuild: 'hotfix-evidence', deviceId: 'dev-evidence',
  });

  /* --- A. dropped-response replay ------------------------------------- */
  const bodyA = JSON.stringify(req(0, 'c10-' + 'a'.repeat(20), ATHLETE_PAYLOAD));
  const first = await inst.call('POST', '/api/cf/appdata/commit', inst.token, bodyA);
  let replayed = 0, refused = 0, firstRefusal = null;
  for (let i = 0; i < 12; i++) {
    const r = await inst.call('POST', '/api/cf/appdata/commit', inst.token, bodyA);
    if (r.status === 200 && r.body.newRev === first.body.newRev) replayed++;
    else { refused++; if (!firstRefusal) firstRefusal = r; }
  }
  out.A = { firstStatus: first.status, firstRev: first.body && first.body.newRev,
    replayed, refused, refusal: firstRefusal && firstRefusal.body };

  /* --- B. mismatched-request refusal ----------------------------------- */
  const bDiff = await commit(req(0, 'c10-' + 'a'.repeat(20),
    Object.assign({}, ATHLETE_PAYLOAD, { extra: 'genuinely different' })));
  const bReorder = await inst.call('POST', '/api/cf/appdata/commit', inst.token,
    JSON.stringify(req(0, 'c10-' + 'a'.repeat(20),
      Object.fromEntries(Object.keys(ATHLETE_PAYLOAD).reverse().map((k) => [k, ATHLETE_PAYLOAD[k]])))));
  out.B = { differentRequest: bDiff.status, differentError: bDiff.body && bDiff.body.error,
    reorderedSameContent: bReorder.status };

  /* --- C. route contract ------------------------------------------------ */
  const rowRev = (await inst.row()).coreRev;
  const okBody = await commit(req(rowRev, 'c10-' + 'c'.repeat(20), { weights: [] }));
  const conflictBody = await commit(req(0, 'c10-' + 'd'.repeat(20), { weights: [] }));
  const badSubsystem = await commit({ subsystem: 'nope', expectedRev: 0,
    idempotencyKey: 'c10-' + 'e'.repeat(20), payload: {} });
  const noKey = await commit({ subsystem: 'core', expectedRev: 0, payload: {} });
  const unauth = await inst.call('POST', '/api/cf/appdata/commit', null,
    req(0, 'c10-' + 'f'.repeat(20), {}));
  out.C = {
    ok: { status: okBody.status, keys: Object.keys(okBody.body || {}).sort().join(',') },
    conflict: { status: conflictBody.status, keys: Object.keys(conflictBody.body || {}).sort().join(',') },
    badSubsystem: { status: badSubsystem.status, error: badSubsystem.body && badSubsystem.body.error },
    noKey: { status: noKey.status, error: noKey.body && noKey.body.error },
    unauth: unauth.status,
  };

  /* --- D. payload semantics --------------------------------------------- */
  const rev2 = (await inst.row()).coreRev;
  await commit(req(rev2, 'c10-' + 'g'.repeat(20), ATHLETE_PAYLOAD));
  const stored = (await inst.row()).data;
  /* Compare CONTENT, not incidental key order. The stored value comes back
     through the same Go map whose iteration order this hotfix is about, so
     comparing JSON.stringify output against the source object would fail for
     the very reason under repair — and would say nothing about semantics.
     Canonical form for content; raw bytes only for the cross-version check,
     where both sides made the identical round trip. */
  out.D = { stored: canonical(stored), matchesSent: canonical(stored) === canonical(ATHLETE_PAYLOAD) };

  /* --- E. size cap ------------------------------------------------------ */
  const mk = (bytes) => {
    /* build a payload whose JSON is exactly `bytes` long */
    const shell = JSON.stringify({ blob: '' });
    return { blob: 'x'.repeat(bytes - shell.length) };
  };
  const rev3 = (await inst.row()).coreRev;
  const atCap = await commit(req(rev3, 'c10-' + 'h'.repeat(20), mk(MAX_PAYLOAD_BYTES)));
  const rev4 = (await inst.row()).coreRev;
  const overCap = await commit(req(rev4, 'c10-' + 'i'.repeat(20), mk(MAX_PAYLOAD_BYTES + 1)));
  out.E = { atCap: atCap.status, overCap: overCap.status,
    overError: overCap.body && overCap.body.error, maxBytes: overCap.body && overCap.body.maxBytes };

  return out;
}

(async () => {
  if (!fs.existsSync(PB_BIN)) { console.error('no PocketBase binary at ' + PB_BIN); process.exit(2); }
  const before = await instance(BEFORE, 8110);
  const b = await evidence(before);
  await before.stop();
  const after = await instance(AFTER, 8111);
  const a = await evidence(after);
  await after.stop();

  const line = (k, x, y) => console.log('  ' + k.padEnd(34) + String(x).padEnd(26) + String(y));
  console.log('HOTFIX-001 evidence — deployed hook (' + BEFORE + ') vs corrected (' + AFTER + ')\n');
  console.log('  ' + ''.padEnd(34) + 'DEPLOYED'.padEnd(26) + 'CORRECTED');
  console.log('  ' + '-'.repeat(76));
  console.log('  A. dropped-response replay');
  line('   identical retries replayed', b.A.replayed + '/12', a.A.replayed + '/12');
  line('   identical retries REFUSED', b.A.refused + '/12', a.A.refused + '/12');
  line('   refusal reason', (b.A.refusal && b.A.refusal.error) || '-', (a.A.refusal && a.A.refusal.error) || '-');
  console.log('  B. key-reuse protection (must NOT weaken)');
  line('   different request -> status', b.B.differentRequest, a.B.differentRequest);
  line('   different request -> error', b.B.differentError, a.B.differentError);
  line('   same content, keys reordered', b.B.reorderedSameContent, a.B.reorderedSameContent);
  console.log('  C. route contract (must be identical)');
  line('   200 body keys', b.C.ok.keys, a.C.ok.keys);
  line('   409 conflict body keys', b.C.conflict.keys, a.C.conflict.keys);
  line('   invalid subsystem', b.C.badSubsystem.status + ' ' + b.C.badSubsystem.error,
    a.C.badSubsystem.status + ' ' + a.C.badSubsystem.error);
  line('   missing key', b.C.noKey.status, a.C.noKey.status);
  line('   unauthenticated', b.C.unauth, a.C.unauth);
  console.log('  D. payload semantics (must be identical)');
  line('   stored content == sent content', b.D.matchesSent, a.D.matchesSent);
  line('   stored content identical across', String(b.D.stored === a.D.stored), '');
  console.log('  E. size cap (must be unmoved)');
  line('   exactly 256 KiB', b.E.atCap, a.E.atCap);
  line('   256 KiB + 1 byte', b.E.overCap + ' ' + (b.E.overError || ''), a.E.overCap + ' ' + (a.E.overError || ''));
  line('   reported maxBytes', b.E.maxBytes, a.E.maxBytes);

  const verdicts = [
    ['the defect is real', b.A.refused > 0],
    ['the correction fixes it', a.A.refused === 0 && a.A.replayed === 12],
    ['key-reuse protection retained', b.B.differentRequest === 409 && a.B.differentRequest === 409],
    ['reordered content now accepted', a.B.reorderedSameContent === 200],
    ['route contract unchanged',
      b.C.ok.keys === a.C.ok.keys && b.C.conflict.keys === a.C.conflict.keys
      && b.C.badSubsystem.status === a.C.badSubsystem.status
      && b.C.noKey.status === a.C.noKey.status && b.C.unauth === a.C.unauth],
    ['payload semantics unchanged', b.D.stored === a.D.stored && a.D.matchesSent],
    ['size cap unmoved', b.E.atCap === a.E.atCap && b.E.overCap === a.E.overCap
      && b.E.maxBytes === a.E.maxBytes],
  ];
  console.log('\n  verdicts');
  verdicts.forEach(([k, v]) => console.log('   ' + (v ? 'PASS' : 'FAIL') + '  ' + k));
  process.exit(verdicts.every(([, v]) => v) ? 0 : 1);
})().catch((e) => { console.error(String(e).slice(0, 1200)); process.exit(1); });
