/* A disposable, empty, localhost-only PocketBase running the SHIPPING CAS
   server kit — server/pb_hooks and server/pb_migrations, copied unmodified.

   This exists so the client can be tested against real route behaviour instead
   of an in-page stub. Two stubs of mine had already disagreed with the real
   contract: one sent `{error:'conflict'}` as a 409 body, which the real route
   never produces and which correctly dispositions as a reused idempotency key.
   A stub can only ever encode what I already believe.

   Nothing here touches production. The instance is created fresh in a temp
   directory, holds no real health data, listens only on 127.0.0.1, and is
   destroyed at the end of the run. The only account it ever creates is a
   cf_test_* one, per the standing rule. */
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PB_BIN = path.join(process.env.HOME, 'staging-cas', 'bin', 'pocketbase');
const KIT = path.join(__dirname, '..', '..', 'server');

const ADMIN = { email: 'cf_test_local@staging.invalid', pass: 'LocalTestPw123456' };
const ATHLETE = { email: 'cf_test_athlete@staging.invalid', pass: 'AthletePw123456' };

/* The CAS migration deliberately assumes `appdata` already exists — in
   production it is part of the app's own schema, and a migration able to create
   it would be a migration able to destroy it. An empty instance has no schema
   at all, so the test instance needs this much and no more. The revision
   fields, the unique owner index and cf_commit_log are still created by the
   REAL migration on top of it. */
const BOOTSTRAP = `/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  app.save(new Collection({
    type: "base", name: "appdata",
    fields: [
      { name: "user", type: "relation", required: true, collectionId: users.id,
        cascadeDelete: true, maxSelect: 1 },
      { name: "data", type: "json", maxSize: 2000000 },
      { name: "training", type: "json", maxSize: 2000000 },
      /* Operational, record-level fields. Not snapshot subsystems and
         deliberately outside the CAS tracks — the app writes them with a direct
         PATCH under cfWritePolicy, which is exactly what CAS-18 has to be able
         to exercise. Without them the operational write path cannot be driven
         here at all, and CAS-18 would have to substitute something else. */
      { name: "health", type: "json", maxSize: 200000 },
      { name: "coachreq", type: "json", maxSize: 200000 },
    ],
    listRule: "user = @request.auth.id", viewRule: "user = @request.auth.id",
    createRule: "user = @request.auth.id", updateRule: "user = @request.auth.id",
    deleteRule: "user = @request.auth.id",
  }));
}, (app) => { try { app.delete(app.findCollectionByNameOrId("appdata")); } catch (_) {} });
`;

function available() {
  try { return fs.existsSync(PB_BIN); } catch (e) { return false; }
}

async function api(base, method, url, token, body) {
  const res = await fetch(base + url, {
    method,
    headers: Object.assign({ 'content-type': 'application/json' },
      token ? { Authorization: token } : {}),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch (e) { json = null; }
  return { status: res.status, body: json };
}

async function start(port) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-pbtest-'));
  fs.mkdirSync(path.join(dir, 'pb_hooks'));
  fs.mkdirSync(path.join(dir, 'pb_migrations'));
  fs.readdirSync(path.join(KIT, 'pb_hooks')).forEach((f) =>
    fs.copyFileSync(path.join(KIT, 'pb_hooks', f), path.join(dir, 'pb_hooks', f)));
  fs.readdirSync(path.join(KIT, 'pb_migrations')).forEach((f) =>
    fs.copyFileSync(path.join(KIT, 'pb_migrations', f), path.join(dir, 'pb_migrations', f)));
  /* numbered BEFORE the CAS migration so `appdata` exists when it runs */
  fs.writeFileSync(path.join(dir, 'pb_migrations', '1753300000_test_base_appdata.js'), BOOTSTRAP);

  const logPath = path.join(dir, 'pb.log');
  const log = fs.openSync(logPath, 'a');
  const proc = spawn(PB_BIN, [
    'serve', '--http=127.0.0.1:' + port,
    '--dir=' + path.join(dir, 'pb_data'),
    '--hooksDir=' + path.join(dir, 'pb_hooks'),
    '--migrationsDir=' + path.join(dir, 'pb_migrations'),
  ], { cwd: dir, stdio: ['ignore', log, log] });

  const base = 'http://127.0.0.1:' + port;
  const deadline = Date.now() + 20000;
  for (;;) {
    try {
      const r = await fetch(base + '/api/health');
      if (r.ok) break;
    } catch (e) { /* not up yet */ }
    if (Date.now() > deadline) {
      const tail = fs.readFileSync(logPath, 'utf8').slice(-1500);
      throw new Error('PocketBase did not start.\n' + tail);
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  execFileSync(PB_BIN, ['superuser', 'upsert', ADMIN.email, ADMIN.pass,
    '--dir=' + path.join(dir, 'pb_data')], { stdio: 'ignore' });

  const adminAuth = await api(base, 'POST', '/api/collections/_superusers/auth-with-password',
    null, { identity: ADMIN.email, password: ADMIN.pass });
  if (!adminAuth.body || !adminAuth.body.token) throw new Error('superuser auth failed');
  const adminToken = adminAuth.body.token;

  const made = await api(base, 'POST', '/api/collections/users/records', adminToken, {
    email: ATHLETE.email, password: ATHLETE.pass, passwordConfirm: ATHLETE.pass,
    emailVisibility: false, verified: true,
  });
  if (made.status >= 300) throw new Error('test athlete creation failed: ' + JSON.stringify(made.body));

  const userAuth = await api(base, 'POST', '/api/collections/users/auth-with-password',
    null, { identity: ATHLETE.email, password: ATHLETE.pass });
  if (!userAuth.body || !userAuth.body.token) throw new Error('athlete auth failed');

  return {
    base, dir, adminToken, logPath,
    user: { token: userAuth.body.token, id: userAuth.body.record.id, email: ATHLETE.email },
    api: (method, url, token, body) => api(base, method, url, token, body),
    log: () => { try { return fs.readFileSync(logPath, 'utf8'); } catch (e) { return ''; } },
    async stop() {
      try { proc.kill('SIGTERM'); } catch (e) { /* already gone */ }
      await new Promise((r) => setTimeout(r, 400));
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* best effort */ }
    },
  };
}

module.exports = { start, available, PB_BIN, ATHLETE, ADMIN };
