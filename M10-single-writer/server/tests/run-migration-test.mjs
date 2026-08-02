#!/usr/bin/env node
/* T9 — migration lifecycle on a DISPOSABLE instance (design H3/H7/I8/I9):
   populate ledger → refused down (no marker) leaves schema+data identical →
   confirmed down removes ONLY M10 additions, rows preserved → re-up restores.
   Usage: node run-migration-test.mjs <instance-dir>   (dir must not exist) */
import { spawn, execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DIR = process.argv[2];
if (!DIR) { console.error("instance dir required"); process.exit(2); }
const PORT = 8123;
const BASE = `http://127.0.0.1:${PORT}`;
const HERE = path.dirname(new URL(import.meta.url).pathname);
const results = [];
let failures = 0;
const assert = (name, cond, detail) => {
  results.push({ name, pass: !!cond, detail });
  console.log(cond ? "ok  " : "FAIL", name, cond ? "" : JSON.stringify(detail).slice(0, 300));
  if (!cond) failures++;
};

let child = null;
async function serve() {
  child = spawn("bash", [path.join(HERE, "setup-instance.sh"), DIR], {
    env: { ...process.env, PB_PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  child.stdout.on("data", (d) => log += d); child.stderr.on("data", (d) => log += d);
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try { const h = await fetch(BASE + "/api/health"); if (h.ok) return log; } catch (_) {}
  }
  throw new Error("serve did not come up:\n" + log);
}
async function stop() {
  if (!child) return;
  child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 800));
  child = null;
}
function migrate(dirArgs, env = {}) {
  try {
    /* `migrate down` asks an interactive Y/N before running the down funcs —
       answer yes so the MIGRATION's own gate (the marker) is what's tested. */
    const out = execFileSync("./pocketbase", ["migrate", ...dirArgs, "--dir", "pb_data"],
      { cwd: DIR, env: { ...process.env, ...env }, encoding: "utf8", input: "y\n" });
    /* PB exits 0 even when a revert fails — detect by output, not exit code. */
    return { ok: !/failed to (revert|apply)/.test(out), out };
  } catch (e) {
    return { ok: false, out: String(e.stdout || "") + String(e.stderr || "") };
  }
}
async function api(p, opts = {}, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = token;
  const r = await fetch(BASE + p, { ...opts, headers });
  let j = null; try { j = await r.json(); } catch (_) {}
  return { status: r.status, body: j };
}
const post = (p, b, t) => api(p, { method: "POST", body: JSON.stringify(b) }, t);
const key = () => "t9-" + crypto.randomBytes(20).toString("hex");

(async () => {
  // ---- phase 1: boot + populate a ledger with CAS, photo, platform rows ----
  await serve();
  const su = (await post("/api/collections/_superusers/auth-with-password",
    { identity: "probe@local.test", password: "probe-password-1" })).body.token;
  const pw = "disposable-pw-123";
  const email = `t9-${crypto.randomBytes(4).toString("hex")}@disposable.test`;
  const uid = (await post("/api/collections/users/records", { email, password: pw, passwordConfirm: pw }, su)).body.id;
  const tok = (await post("/api/collections/users/auth-with-password", { identity: email, password: pw })).body.token;
  const acq = await post("/api/cf/writer/lease", { op: "acquire", deviceId: "t9dev", deviceName: "t9" }, tok);
  await post("/api/cf/appdata/commit", { subsystem: "core", expectedRev: 0, idempotencyKey: key(),
    payload: { seed: 1 }, fence: acq.body.fence, deviceId: "t9dev" }, tok);
  await post("/api/cf/appdata/commit", { subsystem: "training", expectedRev: 0, idempotencyKey: key(),
    payload: { t: 1 } }, tok);   // fence-less legacy-shaped row
  await post("/api/cf/platform/patch-data", { user: uid, fields: { scriptVer: 9 }, idempotencyKey: key() }, su);
  const bytes = crypto.randomBytes(512);
  const fd = new FormData();
  for (const [k, v] of Object.entries({ kind: "food", date: "2026-08-02", localId: "t9-l1", ts: "1",
    byteLength: bytes.length, idempotencyKey: key(), fence: acq.body.fence, deviceId: "t9dev" })) fd.append(k, String(v));
  fd.append("file", new Blob([bytes]), "t9.jpg");
  await fetch(BASE + "/api/cf/photos/upload", { method: "POST", body: fd, headers: { Authorization: tok } });

  const rowsBefore = (await api("/api/collections/cf_commit_log/records?perPage=500&sort=id", {}, su)).body.items;
  assert("T9 seeded 4 ledger rows", rowsBefore.length === 4, rowsBefore.length);
  const colBefore = (await api("/api/collections/cf_commit_log", {}, su)).body;
  const m10Fields = ["op", "writerFence", "holderDeviceHash", "resultRecordId", "resultIdentity", "fileSha256", "fileByteLength"];
  assert("T9 M10 columns present after up", m10Fields.every((f) => colBefore.fields.some((x) => x.name === f)), null);
  await stop();

  // ---- phase 2: refused down (no marker) ----
  let d = migrate(["down", "1"]);
  assert("T9 down without marker refused", !d.ok && /M10 down: refused/.test(d.out), d.out.slice(-300));
  await serve();
  const su2 = (await post("/api/collections/_superusers/auth-with-password",
    { identity: "probe@local.test", password: "probe-password-1" })).body.token;
  const colRefused = (await api("/api/collections/cf_commit_log", {}, su2)).body;
  const rowsRefused = (await api("/api/collections/cf_commit_log/records?perPage=500&sort=id", {}, su2)).body.items;
  assert("T9 refused down: schema identical", m10Fields.every((f) => colRefused.fields.some((x) => x.name === f)), null);
  const pre0 = ["user", "subsystem", "key", "requestHash", "expectedRev", "resultingRev", "responseStatus", "clientBuild", "deviceHash", "created"];
  const rowDiff = (as, bs) => {
    if (as.length !== bs.length) return `count ${as.length} vs ${bs.length}`;
    for (let i = 0; i < as.length; i++)
      for (const f of pre0)
        if (String(as[i][f]) !== String(bs[i][f])) return `row ${as[i].id} field ${f}: ${as[i][f]} vs ${bs[i][f]}`;
    return null;
  };
  assert("T9 refused down: rows identical", rowDiff(rowsRefused, rowsBefore) === null, rowDiff(rowsRefused, rowsBefore));
  const leaseCol = (await api("/api/collections/writer_lease", {}, su2));
  assert("T9 refused down: writer_lease intact", leaseCol.status === 200, leaseCol.status);
  await stop();

  // ---- phase 3: confirmed down ----
  d = migrate(["down", "1"], { M10_DOWN_CONFIRM: "yes" });
  assert("T9 confirmed down succeeds", d.ok && /Reverted/.test(d.out), d.out.slice(-300));
  /* serve() auto-applies pending JS migrations at boot — quarantine the M10
     migration file so the DOWNED state is what we actually inspect. */
  const migFile = path.join(DIR, "pb_migrations", "1754179200_m10_single_writer.js");
  fs.renameSync(migFile, migFile + ".quarantined");
  await serve();
  const su3 = (await post("/api/collections/_superusers/auth-with-password",
    { identity: "probe@local.test", password: "probe-password-1" })).body.token;
  const colDown = (await api("/api/collections/cf_commit_log", {}, su3)).body;
  assert("T9 down removed the seven columns", m10Fields.every((f) => !colDown.fields.some((x) => x.name === f)), colDown.fields.map((f) => f.name));
  const pre = ["user", "subsystem", "key", "requestHash", "expectedRev", "resultingRev", "responseStatus", "clientBuild", "deviceHash", "created"];
  assert("T9 down preserved pre-existing fields", pre.every((f) => colDown.fields.some((x) => x.name === f)), null);
  assert("T9 down preserved idx_cf_commit_key", colDown.indexes.some((i) => i.includes("idx_cf_commit_key")), colDown.indexes);
  const rowsDown = (await api("/api/collections/cf_commit_log/records?perPage=500&sort=id", {}, su3)).body.items;
  assert("T9 down preserved all rows + pre-existing values", rowsDown.length === 4 &&
    rowsDown.every((r, i) => pre.every((f) => String(r[f]) === String(rowsBefore[i][f]))), null);
  const leaseGone = (await api("/api/collections/writer_lease", {}, su3));
  assert("T9 down removed writer_lease", leaseGone.status === 404, leaseGone.status);
  await stop();

  // ---- phase 4: re-up on the populated ledger (sentinel must pass) ----
  fs.renameSync(migFile + ".quarantined", migFile);
  d = migrate(["up"]);
  assert("T9 re-up succeeds (sentinel passed on populated ledger)", d.ok, d.out.slice(-300));
  await serve();
  const su4 = (await post("/api/collections/_superusers/auth-with-password",
    { identity: "probe@local.test", password: "probe-password-1" })).body.token;
  const colUp = (await api("/api/collections/cf_commit_log", {}, su4)).body;
  assert("T9 re-up restored the seven columns", m10Fields.every((f) => colUp.fields.some((x) => x.name === f)), null);
  const rowsUp = (await api("/api/collections/cf_commit_log/records?perPage=500&sort=id", {}, su4)).body.items;
  const upDiff = (() => {
    if (rowsUp.length !== 4) return "count " + rowsUp.length;
    for (let i = 0; i < rowsUp.length; i++)
      for (const f of pre)
        if (String(rowsUp[i][f]) !== String(rowsBefore[i][f])) return `row ${rowsUp[i].id} ${f}`;
    /* down dropped the M10 columns, so re-up leaves them empty on every row */
    for (const r of rowsUp) if (r.op || r.writerFence || r.holderDeviceHash) return `residual M10 value on ${r.id}`;
    return null;
  })();
  assert("T9 re-up: pre-existing values unchanged, M10 columns empty", upDiff === null, upDiff);
  const leaseBack = (await api("/api/collections/writer_lease", {}, su4));
  assert("T9 re-up recreated writer_lease", leaseBack.status === 200, leaseBack.status);
  await stop();

  fs.mkdirSync(path.join(HERE, "../../artifacts/evidence-server"), { recursive: true });
  const out = path.join(HERE, "../../artifacts/evidence-server/migration-suite.json");
  fs.writeFileSync(out, JSON.stringify({ when: new Date().toISOString(), total: results.length, failures, results }, null, 1));
  console.log(`\nT9: ${results.length - failures}/${results.length} passed -> ${out}`);
  process.exit(failures ? 1 : 0);
})().catch(async (e) => { console.error("T9 ERROR", e); await stop(); process.exit(2); });
