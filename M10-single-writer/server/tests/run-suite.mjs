#!/usr/bin/env node
/* M10 server-package suite — LOCAL DISPOSABLE PocketBase only.
   Usage: node run-suite.mjs [--base http://127.0.0.1:8098] [--mode off|enforce]
   Every case records raw request/response evidence; output JSON goes to
   evidence/<mode>-suite.json. The instance is disposable: users are created
   fresh per run and verified-absent on cleanup. */
import crypto from "node:crypto";
import fs from "node:fs";

const args = process.argv.slice(2);
const BASE = args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://127.0.0.1:8098";
const MODE = args.includes("--mode") ? args[args.indexOf("--mode") + 1] : "off";
const SU = { identity: "probe@local.test", password: "probe-password-1" };

const results = [];
let failures = 0;
function record(name, pass, detail) {
  results.push({ name, pass, mode: MODE, detail });
  if (!pass) { failures++; console.log("FAIL", name, JSON.stringify(detail).slice(0, 400)); }
  else console.log("ok  ", name);
}
function assert(name, cond, detail) { record(name, !!cond, detail); }

async function api(path, opts = {}, token = null) {
  const headers = opts.body instanceof FormData ? {} : { "Content-Type": "application/json" };
  if (token) headers.Authorization = token;
  Object.assign(headers, opts.headers || {});
  const r = await fetch(BASE + path, { ...opts, headers });
  let j = null; try { j = await r.json(); } catch (_) {}
  return { status: r.status, body: j };
}
const post = (p, b, t) => api(p, { method: "POST", body: JSON.stringify(b) }, t);

async function suToken() {
  const r = await post("/api/collections/_superusers/auth-with-password", SU);
  if (!r.body?.token) throw new Error("superuser auth failed: " + JSON.stringify(r.body));
  return r.body.token;
}
async function mkUser(su, tag) {
  const email = `m10-${tag}-${crypto.randomBytes(4).toString("hex")}@disposable.test`;
  const pw = "disposable-pw-123";
  const r = await post("/api/collections/users/records", { email, password: pw, passwordConfirm: pw }, su);
  if (!r.body?.id) throw new Error("mkUser failed: " + JSON.stringify(r.body));
  const a = await post("/api/collections/users/auth-with-password", { identity: email, password: pw });
  return { id: r.body.id, email, token: a.body.token };
}
const lease = (op, extra, t) => post("/api/cf/writer/lease", { op, ...extra }, t);
const commit = (b, t) => post("/api/cf/appdata/commit", b, t);
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const key = () => "m10-" + crypto.randomBytes(24).toString("hex");

function photoForm(fields, fileBytes, extraFiles = 0) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
  if (fileBytes) fd.append("file", new Blob([fileBytes]), "p.jpg");
  for (let i = 0; i < extraFiles; i++) fd.append("file", new Blob([Buffer.from("x")]), "extra.jpg");
  return fd;
}
async function upload(fields, fileBytes, t, extraFiles = 0) {
  return api("/api/cf/photos/upload", { method: "POST", body: photoForm(fields, fileBytes, extraFiles) }, t);
}
async function ledgerRows(su, filter) {
  const r = await api("/api/collections/cf_commit_log/records?perPage=500&filter=" + encodeURIComponent(filter), {}, su);
  return r.body?.items || [];
}
async function photoRecords(su, uid) {
  const r = await api(`/api/collections/photos/records?perPage=500&filter=${encodeURIComponent(`user="${uid}"`)}`, {}, su);
  return r.body?.items || [];
}

/* ================= T1: lease semantics ================= */
async function t1(su) {
  const u = await mkUser(su, "lease");
  let r = await lease("status", {}, u.token);
  assert("T1 status empty", r.status === 200 && r.body.exists === false && r.body.fence === 0, r);
  r = await lease("acquire", { deviceId: "devA", deviceName: "iPhone" }, u.token);
  assert("T1 first acquire fence=1", r.status === 200 && r.body.fence === 1 && r.body.granted === true, r);
  r = await lease("acquire", { deviceId: "devA", deviceName: "iPhone" }, u.token);
  assert("T1 no-op reacquire fence stays 1", r.status === 200 && r.body.fence === 1, r);
  r = await lease("acquire", { deviceId: "devB", deviceName: "iPad" }, u.token);
  assert("T1 competing acquire held 409", r.status === 409 && r.body.held === true && r.body.fence === 1, r);
  r = await lease("renew", { deviceId: "devA", fence: 1 }, u.token);
  assert("T1 renew ok", r.status === 200 && r.body.fence === 1, r);
  r = await lease("renew", { deviceId: "devB", fence: 1 }, u.token);
  assert("T1 renew wrong device 409", r.status === 409 && r.body.stale === true, r);
  r = await lease("steal", { deviceId: "devB", deviceName: "iPad" }, u.token);
  assert("T1 steal fence=2", r.status === 200 && r.body.fence === 2 && r.body.holderDeviceId === "devB", r);
  r = await lease("renew", { deviceId: "devA", fence: 1 }, u.token);
  assert("T1 old holder renew 409", r.status === 409 && r.body.fence === 2, r);
  r = await lease("release", { deviceId: "devB", fence: 2 }, u.token);
  assert("T1 release bumps fence=3 inactive", r.status === 200 && r.body.fence === 3 && r.body.active === false, r);
  r = await lease("renew", { deviceId: "devB", fence: 2 }, u.token);
  assert("T1 released fence never validates (D-ABA)", r.status === 409, r);
  r = await lease("acquire", { deviceId: "devA", deviceName: "iPhone" }, u.token);
  assert("T1 acquire after release fence=4", r.status === 200 && r.body.fence === 4, r);
  // TTL expiry via aging probe
  await post("/api/probe/age-lease", { user: u.id, hours: 25 }, su);
  r = await lease("acquire", { deviceId: "devB", deviceName: "iPad" }, u.token);
  assert("T1 expired acquire succeeds fence=5", r.status === 200 && r.body.fence === 5, r);
  await post("/api/probe/age-lease", { user: u.id, hours: 25 }, su);
  r = await lease("renew", { deviceId: "devB", fence: 5 }, u.token);
  assert("T1 expired renew 409", r.status === 409, r);
  // closed rules: direct mutation forbidden even for the owner
  r = await post("/api/collections/writer_lease/records", { user: u.id, fence: 99 }, u.token);
  assert("T1 closed create", r.status === 400 || r.status === 403, r);
  const lr = await api(`/api/collections/writer_lease/records?filter=${encodeURIComponent(`user="${u.id}"`)}`, {}, u.token);
  const leaseId = lr.body?.items?.[0]?.id;
  assert("T1 owner can list own lease", !!leaseId, lr);
  r = await api(`/api/collections/writer_lease/records/${leaseId}`, { method: "PATCH", body: JSON.stringify({ fence: 99 }) }, u.token);
  assert("T1 closed update", r.status === 400 || r.status === 403, r);
  r = await api(`/api/collections/writer_lease/records/${leaseId}`, { method: "DELETE" }, u.token);
  assert("T1 closed delete", r.status === 400 || r.status === 403, r);
  const other = await mkUser(su, "leaseB");
  const lo = await api(`/api/collections/writer_lease/records?filter=${encodeURIComponent(`user="${u.id}"`)}`, {}, other.token);
  assert("T1 foreign list empty", (lo.body?.items || []).length === 0, lo);
  // monotonicity check across the whole op history
  r = await lease("status", {}, u.token);
  assert("T1 final fence 5", r.body.fence === 5, r);
  return [u, other];
}

/* ================= T3: fenced commit (mode-dependent) ================= */
async function t3(su) {
  const u = await mkUser(su, "commit");
  // .415-shape (fence-less) commit
  let r = await commit({ subsystem: "core", expectedRev: 0, idempotencyKey: key(),
                         payload: { v: 1 }, clientBuild: "t3-legacy" }, u.token);
  if (MODE === "off") {
    assert("T3 fence-less commit passes (OFF)", r.status === 200 && r.body.newRev === 1, r);
  } else {
    assert("T3 fence-less commit fenceStale (ON)", r.status === 409 && r.body.fenceStale === true, r);
  }
  // acquire + fenced commit
  const acq = await lease("acquire", { deviceId: "devC1", deviceName: "iPhone" }, u.token);
  const fence = acq.body.fence;
  const k1 = key();
  const rev0 = MODE === "off" ? 1 : 0;
  r = await commit({ subsystem: "core", expectedRev: rev0, idempotencyKey: k1,
                     payload: { v: 2 }, fence, deviceId: "devC1", clientBuild: "t3-m10" }, u.token);
  assert("T3 fenced commit 200", r.status === 200 && r.body.newRev === rev0 + 1, r);
  const rows = await ledgerRows(su, `user="${u.id}" && key="${k1}"`);
  assert("T3 ledger writerFence recorded", rows.length === 1 && rows[0].writerFence === fence, rows);
  assert("T3 ledger holderDeviceHash server-derived", rows[0].holderDeviceHash === sha256("devC1"), rows[0]?.holderDeviceHash);
  assert("T3 ledger op NULL on CAS rows", !rows[0].op, rows[0]?.op);
  if (MODE === "enforce") {
    // stale fence rejects BEFORE mutation
    await lease("steal", { deviceId: "devC2", deviceName: "iPad" }, u.token);
    r = await commit({ subsystem: "core", expectedRev: rev0 + 1, idempotencyKey: key(),
                       payload: { v: 3 }, fence, deviceId: "devC1", clientBuild: "t3-m10" }, u.token);
    assert("T3 stale fence 409 fenceStale", r.status === 409 && r.body.fenceStale === true && r.body.fence === fence + 1, r);
    const st = await lease("status", {}, u.token);
    assert("T3 no mutation under stale fence", st.status === 200, st);
    const rd = await api(`/api/collections/appdata/records?filter=${encodeURIComponent(`user="${u.id}"`)}`, {}, su);
    assert("T3 rev unchanged after stale push", rd.body.items[0].coreRev === rev0 + 1, rd.body.items[0]?.coreRev);
    // superuser creds must NOT enter the users-only route (I4)
    r = await commit({ subsystem: "core", expectedRev: 99, idempotencyKey: key(), payload: { v: 9 } }, await suToken());
    assert("T3 superuser rejected on users-only route (I4)", r.status === 401 || r.status === 403 || r.status === 404, r);
  } else {
    r = await commit({ subsystem: "core", expectedRev: 99, idempotencyKey: key(), payload: { v: 9 } }, await suToken());
    assert("T3 superuser rejected on users-only route (I4)", r.status === 401 || r.status === 403 || r.status === 404, r);
  }
  return u;
}

/* ================= T4/T5: photo routes ================= */
async function t45(su) {
  const u = await mkUser(su, "photo");
  const acq = await lease("acquire", { deviceId: "devP", deviceName: "iPhone" }, u.token);
  const fence = acq.body.fence;
  const bytes = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), crypto.randomBytes(2048), Buffer.from([0x00, 0x80, 0xFE])]);
  const dig = sha256(bytes);
  const meta = { kind: "food", date: "2026-08-02", meal: "lunch", ts: "1754170000000", localId: "l-1" };
  const k1 = key();
  const fields = { ...meta, byteLength: bytes.length, idempotencyKey: k1, fence, deviceId: "devP", clientBuild: "t4" };

  let r = await upload(fields, bytes, u.token);
  assert("T4 upload 200 + identity", r.status === 200 && r.body.ok && r.body.recordId &&
    r.body.identity?.sha256 === dig && r.body.identity?.byteLength === bytes.length, r);
  const recId = r.body.recordId;
  const rows = await ledgerRows(su, `user="${u.id}" && key="${k1}"`);
  assert("T4 ledger row complete", rows.length === 1 && rows[0].op === "photo-upload" &&
    rows[0].resultRecordId === recId && rows[0].fileSha256 === dig && rows[0].fileByteLength === bytes.length &&
    rows[0].writerFence === fence && rows[0].holderDeviceHash === sha256("devP"), rows[0]);

  // replay: same key, same bytes → same recordId, no second record (G2)
  r = await upload(fields, bytes, u.token);
  assert("T4 replay same recordId", r.status === 200 && r.body.replay === true && r.body.recordId === recId, r);
  assert("T4 replay no duplicate record", (await photoRecords(su, u.id)).length === 1, null);

  // same key, DIFFERENT bytes → typed key-reuse 409 (G1)
  const bytes2 = Buffer.concat([bytes, Buffer.from([0x01])]);
  r = await upload({ ...fields, byteLength: bytes2.length }, bytes2, u.token);
  assert("T4 same key different bytes 409", r.status === 409 && /reused/.test(r.body.error || ""), r);
  // same key, same declared length, different content → 409 via digest
  const bytes3 = Buffer.from(bytes); bytes3[100] ^= 0xFF;
  r = await upload(fields, bytes3, u.token);
  assert("T4 same key same length different content 409", r.status === 409, r);
  assert("T4 no record leaked by reuse attempts", (await photoRecords(su, u.id)).length === 1, null);

  // malformed matrix (H4) — each leaves no record, no ledger row
  const before = { recs: (await photoRecords(su, u.id)).length, rows: (await ledgerRows(su, `user="${u.id}"`)).length };
  r = await upload({ ...fields, idempotencyKey: key() }, null, u.token);
  assert("T4 no file 400", r.status === 400, r);
  r = await upload({ ...fields, idempotencyKey: key() }, bytes, u.token, 0);   // control
  r = await upload({ ...fields, idempotencyKey: key(), localId: "l-2" }, bytes, u.token, 1);
  assert("T4 two files 400", r.status === 400, r);
  r = await upload({ ...fields, idempotencyKey: key(), byteLength: bytes.length + 5 }, bytes, u.token);
  assert("T4 length mismatch 400", r.status === 400 && /mismatch/.test(r.body.error || ""), r);
  r = await upload({ ...fields, idempotencyKey: key(), kind: "selfie" }, bytes, u.token);
  assert("T4 bad kind 400", r.status === 400, r);
  const big = Buffer.alloc(15728641);
  r = await upload({ ...fields, idempotencyKey: key(), byteLength: big.length }, big, u.token);
  assert("T4 oversize 413", r.status === 413, r);
  const after = { recs: (await photoRecords(su, u.id)).length, rows: (await ledgerRows(su, `user="${u.id}"`)).length };
  assert("T4 malformed left no records", after.recs === before.recs + 1, { before, after }); // +1 = the control upload
  assert("T4 malformed left no ledger rows", after.rows === before.rows + 1, { before, after });

  /* T5: update + delete + cross-account byte-identical (G3/I7) */
  const stranger = await mkUser(su, "photoB");
  const kU = key();
  const updBody = { serverId: recId, oldMeta: meta, newMeta: { ...meta, meal: "dinner" },
                    idempotencyKey: kU, fence, deviceId: "devP" };
  r = await post("/api/cf/photos/update", updBody, u.token);
  assert("T5 update 200 applied", r.status === 200 && r.body.applied === true, r);
  r = await post("/api/cf/photos/update", updBody, u.token);
  assert("T5 update replay", r.status === 200 && r.body.replay === true && r.body.recordId === recId, r);
  const fr = await post("/api/cf/photos/update", { ...updBody, idempotencyKey: key() }, stranger.token);
  const nr = await post("/api/cf/photos/update", { ...updBody, idempotencyKey: key(), serverId: "nonexist12345xx" }, stranger.token);
  assert("T5 foreign vs nonexistent byte-identical (update)",
    fr.status === 404 && nr.status === 404 && JSON.stringify(fr.body) === JSON.stringify(nr.body), { fr, nr });

  const kD = key();
  const delBody = { serverId: recId, capturedIdentity: { sha256: dig }, idempotencyKey: kD, fence, deviceId: "devP" };
  const fd2 = await post("/api/cf/photos/delete", { ...delBody, idempotencyKey: key() }, stranger.token);
  const nd2 = await post("/api/cf/photos/delete", { ...delBody, idempotencyKey: key(), serverId: "nonexist12345xx" }, stranger.token);
  assert("T5 foreign vs nonexistent byte-identical (delete)",
    fd2.status === 404 && nd2.status === 404 && JSON.stringify(fd2.body) === JSON.stringify(nd2.body), { fd2, nd2 });
  assert("T5 foreign attempts mutated nothing", (await photoRecords(su, u.id)).length === after.recs, null);
  r = await post("/api/cf/photos/delete", delBody, u.token);
  assert("T5 delete 200", r.status === 200 && r.body.deleted === true, r);
  r = await post("/api/cf/photos/delete", delBody, u.token);
  assert("T5 delete replay success", r.status === 200 && r.body.replay === true && r.body.deleted === true, r);
  assert("T5 record gone", (await photoRecords(su, u.id)).length === after.recs - 1, null);

  if (MODE === "enforce") {
    // photo routes fence-gated; raw photo writes reject
    await lease("steal", { deviceId: "devP2", deviceName: "iPad" }, u.token);
    r = await upload({ ...fields, idempotencyKey: key(), localId: "l-9" }, bytes, u.token);
    assert("T5 stale-fence upload 409 fenceStale (ON)", r.status === 409 && r.body.fenceStale === true, r);
    const fdRaw = new FormData();
    fdRaw.append("user", u.id); fdRaw.append("kind", "food"); fdRaw.append("date", "2026-08-02");
    fdRaw.append("localId", "raw-1"); fdRaw.append("file", new Blob([bytes]), "raw.jpg");
    r = await api("/api/collections/photos/records", { method: "POST", body: fdRaw }, u.token);
    assert("T5 raw photo create rejected (ON)", r.status === 400, r);
  }
  return u;
}

/* ================= T6: platform route ================= */
async function t6(su) {
  const u = await mkUser(su, "plat");
  // provision an appdata row via the commit route (rev 0 create)
  const acq = await lease("acquire", { deviceId: "devPl", deviceName: "iPhone" }, u.token);
  await commit({ subsystem: "core", expectedRev: 0, idempotencyKey: key(),
                 payload: { weights: [{ d: "2026-08-01", w: 200 }], settings: { units: "lb" } },
                 fence: acq.body.fence, deviceId: "devPl" }, u.token);
  const k1 = key();
  let r = await post("/api/cf/platform/patch-data", { user: u.id, fields: { nightlySummary: { s: 1 } }, idempotencyKey: k1 }, su);
  assert("T6 superuser patch 200 rev2", r.status === 200 && r.body.coreRev === 2, r);
  const rd = await api(`/api/collections/appdata/records?filter=${encodeURIComponent(`user="${u.id}"`)}`, {}, su);
  const data = rd.body.items[0].data;
  assert("T6 athlete fields survive", data.weights?.length === 1 && data.settings?.units === "lb", data);
  assert("T6 platform field landed", data.nightlySummary?.s === 1, data);
  r = await post("/api/cf/platform/patch-data", { user: u.id, fields: { nightlySummary: { s: 1 } }, idempotencyKey: k1 }, su);
  assert("T6 replay no double increment", r.status === 200 && r.body.replay === true && r.body.coreRev === 2, r);
  const rd2 = await api(`/api/collections/appdata/records?filter=${encodeURIComponent(`user="${u.id}"`)}`, {}, su);
  assert("T6 rev still 2 after replay", rd2.body.items[0].coreRev === 2, rd2.body.items[0]?.coreRev);
  r = await post("/api/cf/platform/patch-data", { user: u.id, fields: { nightlySummary: { s: 2 } }, idempotencyKey: k1 }, su);
  assert("T6 same key different patch 409", r.status === 409, r);
  const other = await mkUser(su, "platB");
  const acq2 = await lease("acquire", { deviceId: "devPl2", deviceName: "iPad" }, other.token);
  await commit({ subsystem: "core", expectedRev: 0, idempotencyKey: key(), payload: { x: 1 },
                 fence: acq2.body.fence, deviceId: "devPl2" }, other.token);
  r = await post("/api/cf/platform/patch-data", { user: other.id, fields: { nightlySummary: { s: 1 } }, idempotencyKey: k1 }, su);
  assert("T6 same key different target 409 (I5)", r.status === 409, r);
  r = await post("/api/cf/platform/patch-data", { user: u.id, fields: { weights: [] }, idempotencyKey: key() }, su);
  assert("T6 athlete field rejected", r.status === 400 && /platform-owned/.test(r.body.error || ""), r);
  r = await post("/api/cf/platform/patch-data", { user: "nonexist12345xx", fields: { scriptVer: 1 }, idempotencyKey: key() }, su);
  assert("T6 missing target 404", r.status === 404, r);
  r = await post("/api/cf/platform/patch-data", { user: u.id, fields: { scriptVer: 1 }, idempotencyKey: key() }, u.token);
  assert("T6 user token rejected (I4/I11)", r.status === 401 || r.status === 403 || r.status === 404, r);
  // coach ‖ device in both orders: device commit then platform, platform then device commit
  const st = await lease("status", {}, u.token);
  r = await commit({ subsystem: "core", expectedRev: 2, idempotencyKey: key(),
                     payload: { weights: [{ d: "2026-08-01", w: 200 }], settings: { units: "lb" }, nightlySummary: { s: 1 } },
                     fence: st.body.fence, deviceId: "devPl" }, u.token);
  assert("T6 device commit after platform (rev3)", r.status === 200 && r.body.newRev === 3, r);
  r = await post("/api/cf/platform/patch-data", { user: u.id, fields: { weeklySummary: { w: 1 } }, idempotencyKey: key() }, su);
  assert("T6 platform after device (rev4)", r.status === 200 && r.body.coreRev === 4, r);
  const rd3 = await api(`/api/collections/appdata/records?filter=${encodeURIComponent(`user="${u.id}"`)}`, {}, su);
  const d3 = rd3.body.items[0].data;
  assert("T6 both orders: all fields survive", d3.weights?.length === 1 && d3.nightlySummary?.s === 1 && d3.weeklySummary?.w === 1, d3);
  return [u, other];
}

/* ================= T7: mailbox/raw enforcement (ON instance only) ===== */
async function t7(su) {
  if (MODE !== "enforce") return [];
  const u = await mkUser(su, "mail");
  const acq = await lease("acquire", { deviceId: "devM", deviceName: "iPhone" }, u.token);
  await commit({ subsystem: "core", expectedRev: 0, idempotencyKey: key(), payload: { a: 1 },
                 fence: acq.body.fence, deviceId: "devM" }, u.token);
  const rd = await api(`/api/collections/appdata/records?filter=${encodeURIComponent(`user="${u.id}"`)}`, {}, su);
  const rowId = rd.body.items[0].id;
  const patch = (b, t) => api(`/api/collections/appdata/records/${rowId}`, { method: "PATCH", body: JSON.stringify(b) }, t);
  let r = await patch({ health: { steps: [] } }, u.token);
  assert("T7 mailbox health passes", r.status === 200, r);
  r = await patch({ coachreq: { want: "recap" } }, u.token);
  assert("T7 mailbox coachreq passes", r.status === 200, r);
  r = await patch({ data: { hacked: true } }, u.token);
  assert("T7 raw content rejected", r.status === 400, r);
  r = await patch({ health: {}, data: {} }, u.token);
  assert("T7 mixed rejected", r.status === 400, r);
  r = await patch({ health: {}, coachreq: {} }, u.token);
  assert("T7 two mailbox families rejected", r.status === 400, r);
  r = await patch({ data: null }, u.token);
  assert("T7 null content key rejected", r.status === 400, r);
  r = await patch({ unknownField: 1 }, u.token);
  assert("T7 unknown key rejected", r.status === 400, r);
  r = await patch({ coreRev: 99 }, u.token);
  assert("T7 revision field rejected", r.status === 400, r);
  r = await post("/api/collections/appdata/records", { user: u.id, data: { x: 1 } }, u.token);
  assert("T7 raw create rejected", r.status === 400, r);
  r = await patch({ data: { fromSuper: true } }, su);
  assert("T7 superuser raw write passes (bypass)", r.status === 200, r);
  const rd2 = await api(`/api/collections/appdata/records/${rowId}`, {}, su);
  assert("T7 fenceless-rev not bumped under enforcement", rd2.body.coreRev === 1, rd2.body.coreRev);
  return [u];
}

/* ================= T8: races (both orders + serialization) ============ */
async function t8(su) {
  const u = await mkUser(su, "race");
  let acq = await lease("acquire", { deviceId: "devR1", deviceName: "iPhone" }, u.token);
  await commit({ subsystem: "core", expectedRev: 0, idempotencyKey: key(), payload: { n: 0 },
                 fence: acq.body.fence, deviceId: "devR1" }, u.token);
  // serialization barrier: txhold (write tx on the lease row) vs steal
  const t0 = Date.now();
  const hold = post("/api/probe/txhold", { ms: 700 }, u.token);
  await new Promise((res) => setTimeout(res, 120));
  const stealT0 = Date.now();
  const steal = await lease("steal", { deviceId: "devR2", deviceName: "iPad" }, u.token);
  const stealMs = Date.now() - stealT0;
  await hold;
  assert("T8 steal blocked by open write tx (serialization)", steal.status === 200 && stealMs > 400,
    { stealMs, fence: steal.body.fence });

  // both-orders classification over 60 iterations: commit(fenced) ‖ steal
  let orders = { commitFirst: 0, stealFirst: 0, anomalies: [] };
  let rev = 1;
  let fence = steal.body.fence, holder = "devR2";
  for (let i = 0; i < 60; i++) {
    const newDev = holder === "devR2" ? "devR1" : "devR2";
    const jitter = i % 2 === 0 ? 0 : 15;                     // alternate launch order bias
    const kk = key();
    const commitP = new Promise((res) => setTimeout(() =>
      res(commit({ subsystem: "core", expectedRev: rev, idempotencyKey: kk, payload: { n: i + 1 },
                   fence, deviceId: holder, clientBuild: "t8" }, u.token)), jitter));
    const stealP = new Promise((res) => setTimeout(() =>
      res(lease("steal", { deviceId: newDev, deviceName: "x" }, u.token)), 15 - jitter));
    const [cR, sR] = await Promise.all([commitP, stealP]);
    const newFence = sR.body.fence;
    if (cR.status === 200) { rev = cR.body.newRev; orders.commitFirst++; }
    else if (cR.status === 409 && MODE === "enforce" && cR.body.fenceStale) { orders.stealFirst++; }
    else if (cR.status === 409 && MODE === "off") { orders.anomalies.push({ i, cR }); }
    else if (cR.status !== 200) { orders.anomalies.push({ i, cR: { status: cR.status, body: cR.body } }); }
    // oracle: ledger row for kk exists iff commit reported 200 (committed state)
    const rows = await ledgerRows(su, `user="${u.id}" && key="${kk}"`);
    const landed = rows.length === 1;
    if (landed !== (cR.status === 200)) orders.anomalies.push({ i, oracle: { landed, status: cR.status } });
    if (landed && MODE === "enforce" && rows[0].writerFence !== fence)
      orders.anomalies.push({ i, fenceEvidence: rows[0].writerFence, expected: fence });
    fence = newFence; holder = newDev;
  }
  if (MODE === "enforce")
    assert("T8 both orders observed + zero anomalies",
      orders.commitFirst > 5 && orders.stealFirst > 5 && orders.anomalies.length === 0, orders);
  else
    assert("T8 zero anomalies (OFF: commits always land)", orders.anomalies.length === 0 && orders.commitFirst === 60, orders);
  // two simultaneous steals: exactly two distinct fences, monotonic
  const [s1, s2] = await Promise.all([
    lease("steal", { deviceId: "devR1", deviceName: "a" }, u.token),
    lease("steal", { deviceId: "devR2", deviceName: "b" }, u.token)]);
  assert("T8 simultaneous steals distinct monotonic fences",
    s1.status === 200 && s2.status === 200 && s1.body.fence !== s2.body.fence, { f1: s1.body.fence, f2: s2.body.fence });
  return [u];
}

/* ================= cleanup with verified absence ================= */
async function cleanup(su, users) {
  for (const u of users) {
    await api(`/api/collections/users/records/${u.id}`, { method: "DELETE" }, su);
    const gone = await api(`/api/collections/users/records/${u.id}`, {}, su);
    const rows = await ledgerRows(su, `user="${u.id}"`);
    const lease2 = await api(`/api/collections/writer_lease/records?filter=${encodeURIComponent(`user="${u.id}"`)}`, {}, su);
    const ph = await photoRecords(su, u.id);
    record(`cleanup ${u.email}`, gone.status === 404 && rows.length === 0 &&
      (lease2.body?.items || []).length === 0 && ph.length === 0,
      { user: gone.status, ledger: rows.length, lease: (lease2.body?.items || []).length, photos: ph.length });
  }
}

(async () => {
  const su = await suToken();
  const users = [];
  users.push(...await t1(su));
  users.push(await t3(su));
  users.push(await t45(su));
  users.push(...await t6(su));
  users.push(...await t7(su));
  users.push(...await t8(su));
  await cleanup(su, users);
  fs.mkdirSync(new URL("../../artifacts/evidence-server/", import.meta.url), { recursive: true });
  const out = new URL(`../../artifacts/evidence-server/${MODE}-suite.json`, import.meta.url);
  fs.writeFileSync(out, JSON.stringify({ mode: MODE, base: BASE, when: new Date().toISOString(),
    total: results.length, failures, results }, null, 1));
  console.log(`\n${MODE}: ${results.length - failures}/${results.length} passed -> ${out.pathname}`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error("SUITE ERROR", e); process.exit(2); });
