/// <reference path="../pb_data/types.d.ts" />
/* Compound Fitness — M10 transactional photo routes (PocketBase v0.39.8).
   Contract: design v9 §5b, G1–G6/H4/H5 (Architect-approved round 9).

   Three routes, each ONE runInTransaction (file-in-transaction semantics
   proven on 0.39.8 — probe2: rollback removes record AND managed file).
   Upload identity BINDS THE BYTES: the server derives exact byte length and
   sha256 from the received file BEFORE any ledger replay decision (H5); a
   prior key is never replayed from multipart metadata alone.

   Ownership before lease (G3/I7): update/delete resolve the target inside the
   transaction and require record.user === authenticated user BEFORE any
   lease-state information is exposed; foreign and nonexistent ids answer
   byte-identically. In-transaction order per H5:
     ledger lookup → (prior? full-identity compare → replay/409)
                   → ownership → lease/fence → mutation + ledger row. */

/* ---- POST /api/cf/photos/upload (multipart) --------------------------- */
routerAdd("POST", "/api/cf/photos/upload", (e) => {
  const cf = require(`${__hooks}/cf_cas_shared.js`);
  const m10 = require(`${__hooks}/cf_m10_shared.js`);
  const uid = e.auth.id;
  const info = e.requestInfo();
  const body = info.body || {};

  const key = String(body.idempotencyKey || "");
  let bad = cf.validateKey(key);                          if (bad) return e.json(bad.status, bad.body);
  const localId = String(body.localId || "");
  if (!localId || localId.length > 96) return e.json(400, { ok: false, error: "localId required (max 96)" });
  const kind = String(body.kind || "");
  if (kind !== "food" && kind !== "progress") return e.json(400, { ok: false, error: "kind must be food|progress" });
  const declaredLen = parseInt(String(body.byteLength || ""), 10);
  if (isNaN(declaredLen) || declaredLen < 0) return e.json(400, { ok: false, error: "byteLength required" });

  /* H4: exactly ONE file part named `file`. */
  let files = [];
  try { files = e.findUploadedFiles("file") || []; } catch (_) { files = []; }
  if (files.length === 0) return e.json(400, { ok: false, error: "exactly one file part required (none received)" });
  if (files.length > 1)  return e.json(400, { ok: false, error: "exactly one file part required (multiple received)" });
  const up = files[0];
  if (up.size > m10.PHOTO_MAX_BYTES)
    return e.json(413, { ok: false, error: "file too large", maxBytes: m10.PHOTO_MAX_BYTES });

  /* H5: derive byte length + digest from the RECEIVED bytes before any
     ledger decision. PROVEN on this runtime (tests/probe-bytes evidence):
     readerToString() is byte-faithful — $security.sha256 over it equals
     Node's sha256 over the raw bytes for all-byte-values AND multibyte-UTF-8
     payloads. Its .length is NOT the byte count (valid UTF-8 merges), so the
     byte length comes from up.size (server-derived). Any failure here is the
     H4 unreadable-upload case. */
  let actualLen = -1, digest = "";
  try {
    if (m10.testFault(e, "unreadable")) throw new Error("injected: unreadable temporary upload");
    const r = up.reader.open();
    try { digest = $security.sha256(readerToString(r)); } finally { try { r.close(); } catch (_) {} }
    actualLen = up.size;
  } catch (err) {
    return e.json(400, { ok: false, error: "uploaded file unreadable" });
  }
  if (m10.testFault(e, "digest")) digest = "";                  // forces the H4 digest-failure arm
  if (actualLen !== declaredLen)
    return e.json(400, { ok: false, error: "byteLength mismatch", declared: declaredLen, actual: actualLen });
  if (!digest || digest.length !== 64)
    return e.json(500, { ok: false, error: "digest computation failed" });

  const meta = { kind: kind, date: body.date, week: body.week, pose: body.pose, meal: body.meal, ts: body.ts };
  const metaCanon = m10.photoMetaCanonical(meta);
  const requestHash = $security.sha256(
    "photo-upload|" + uid + "|" + localId + "|" + metaCanon + "|" + actualLen + "|" + digest);

  const reqFence = (typeof body.fence === "number" && Math.floor(body.fence) === body.fence)
    ? body.fence : (body.fence ? parseInt(String(body.fence), 10) || null : null);
  const rawDeviceId = body.deviceId ? String(body.deviceId) : "";
  const clientBuild = String(body.clientBuild || "").slice(0, 64);
  const deviceHash = rawDeviceId ? $security.sha256(rawDeviceId).slice(0, 16) : "";

  let out = null;
  try {
    $app.runInTransaction((txApp) => {
      const prior = m10.photoLedgerLookup(txApp, uid, key);
      if (prior) {
        if (prior.getString("requestHash") !== requestHash) {
          out = { status: 409, body: { ok: false, error: "idempotency key reused with a different request" } };
          return;
        }
        out = { status: 200, body: { ok: true, replay: true, recordId: prior.getString("resultRecordId"),
                                     identity: JSON.parse(prior.getString("resultIdentity") || "null") } };
        return;
      }
      const lease = m10.photoLeaseCheck(m10, txApp, uid, rawDeviceId, reqFence);
      if (lease.reject) { out = lease.reject; return; }

      const col = txApp.findCollectionByNameOrId("photos");
      const rec = new Record(col);
      rec.set("user", uid); rec.set("kind", kind);
      rec.set("date", String(body.date || "").slice(0, 10));
      if (body.week) rec.set("week", String(body.week).slice(0, 10));
      if (body.pose) rec.set("pose", String(body.pose).slice(0, 20));
      if (body.meal) rec.set("meal", String(body.meal).slice(0, 20));
      rec.set("localId", localId); rec.set("ts", String(body.ts || ""));
      rec.set("file", up);
      txApp.save(rec);

      const identity = { localId: localId, byteLength: actualLen, sha256: digest, meta: JSON.parse(metaCanon) };
      m10.writePhotoLedger(txApp, uid, key, requestHash, "photo-upload", rec.id,
        JSON.stringify(identity), digest, actualLen, reqFence, lease.holderHash, clientBuild, deviceHash);
      out = { status: 200, body: { ok: true, recordId: rec.id, identity: identity } };
    });
  } catch (err) {
    $app.logger().error("M10 photo upload failed", "user", uid, "err", String(err).slice(0, 300));
    return e.json(500, { ok: false, error: "photo upload failed" });
  }
  return e.json(out.status, out.body);
}, $apis.requireAuth("users"), $apis.bodyLimit(16 * 1024 * 1024));

/* ---- POST /api/cf/photos/update (metadata, JSON) ---------------------- */
routerAdd("POST", "/api/cf/photos/update", (e) => {
  const cf = require(`${__hooks}/cf_cas_shared.js`);
  const m10 = require(`${__hooks}/cf_m10_shared.js`);
  const uid = e.auth.id;
  const body = e.requestInfo().body || {};

  const key = String(body.idempotencyKey || "");
  let bad = cf.validateKey(key);                          if (bad) return e.json(bad.status, bad.body);
  const serverId = String(body.serverId || "");
  if (!serverId) return e.json(400, { ok: false, error: "serverId required" });
  if (typeof body.oldMeta !== "object" || body.oldMeta === null ||
      typeof body.newMeta !== "object" || body.newMeta === null)
    return e.json(400, { ok: false, error: "oldMeta and newMeta required" });

  const oldCanon = m10.photoMetaCanonical(body.oldMeta);
  const newCanon = m10.photoMetaCanonical(body.newMeta);
  const requestHash = $security.sha256(
    "photo-update|" + uid + "|" + serverId + "|" + oldCanon + "|" + newCanon);
  const reqFence = (typeof body.fence === "number" && Math.floor(body.fence) === body.fence) ? body.fence : null;
  const rawDeviceId = body.deviceId ? String(body.deviceId) : "";
  const clientBuild = String(body.clientBuild || "").slice(0, 64);
  const deviceHash = rawDeviceId ? $security.sha256(rawDeviceId).slice(0, 16) : "";

  let out = null;
  try {
    $app.runInTransaction((txApp) => {
      const prior = m10.photoLedgerLookup(txApp, uid, key);
      if (prior) {
        if (prior.getString("requestHash") !== requestHash) {
          out = { status: 409, body: { ok: false, error: "idempotency key reused with a different request" } };
          return;
        }
        out = { status: 200, body: Object.assign({ replay: true },
                 JSON.parse(prior.getString("resultIdentity") || "{}")) };
        return;
      }
      /* G3/I7: resolve + prove ownership BEFORE lease-state is exposed;
         foreign and nonexistent ids answer byte-identically. */
      let rec = null;
      try { rec = txApp.findRecordById("photos", serverId); } catch (_) { rec = null; }
      if (!rec || rec.getString("user") !== uid) {
        out = { status: 404, body: { ok: false, notFound: true } };
        return;
      }
      const lease = m10.photoLeaseCheck(m10, txApp, uid, rawDeviceId, reqFence);
      if (lease.reject) { out = lease.reject; return; }

      const nm = body.newMeta;
      if ("date" in nm) rec.set("date", String(nm.date || "").slice(0, 10));
      if ("week" in nm) rec.set("week", String(nm.week || "").slice(0, 10));
      if ("pose" in nm) rec.set("pose", String(nm.pose || "").slice(0, 20));
      if ("meal" in nm) rec.set("meal", String(nm.meal || "").slice(0, 20));
      if ("kind" in nm && (nm.kind === "food" || nm.kind === "progress")) rec.set("kind", nm.kind);
      txApp.save(rec);

      const result = { ok: true, recordId: rec.id, applied: true, newMeta: JSON.parse(newCanon) };
      m10.writePhotoLedger(txApp, uid, key, requestHash, "photo-update", rec.id,
        JSON.stringify(result), "", null, reqFence, lease.holderHash, clientBuild, deviceHash);
      out = { status: 200, body: result };
    });
  } catch (err) {
    $app.logger().error("M10 photo update failed", "user", uid, "err", String(err).slice(0, 300));
    return e.json(500, { ok: false, error: "photo update failed" });
  }
  return e.json(out.status, out.body);
}, $apis.requireAuth("users"));

/* ---- POST /api/cf/photos/delete (JSON) -------------------------------- */
routerAdd("POST", "/api/cf/photos/delete", (e) => {
  const cf = require(`${__hooks}/cf_cas_shared.js`);
  const m10 = require(`${__hooks}/cf_m10_shared.js`);
  const uid = e.auth.id;
  const body = e.requestInfo().body || {};

  const key = String(body.idempotencyKey || "");
  let bad = cf.validateKey(key);                          if (bad) return e.json(bad.status, bad.body);
  const serverId = String(body.serverId || "");
  if (!serverId) return e.json(400, { ok: false, error: "serverId required" });
  const captured = (typeof body.capturedIdentity === "object" && body.capturedIdentity !== null)
    ? body.capturedIdentity : {};

  const requestHash = $security.sha256(
    "photo-delete|" + uid + "|" + serverId + "|" + m10.canonicalJson(captured));
  const reqFence = (typeof body.fence === "number" && Math.floor(body.fence) === body.fence) ? body.fence : null;
  const rawDeviceId = body.deviceId ? String(body.deviceId) : "";
  const clientBuild = String(body.clientBuild || "").slice(0, 64);
  const deviceHash = rawDeviceId ? $security.sha256(rawDeviceId).slice(0, 16) : "";

  let out = null;
  try {
    $app.runInTransaction((txApp) => {
      const prior = m10.photoLedgerLookup(txApp, uid, key);
      if (prior) {
        if (prior.getString("requestHash") !== requestHash) {
          out = { status: 409, body: { ok: false, error: "idempotency key reused with a different request" } };
          return;
        }
        out = { status: 200, body: Object.assign({ replay: true },
                 JSON.parse(prior.getString("resultIdentity") || "{}")) };
        return;
      }
      let rec = null;
      try { rec = txApp.findRecordById("photos", serverId); } catch (_) { rec = null; }
      if (!rec || rec.getString("user") !== uid) {
        out = { status: 404, body: { ok: false, notFound: true } };
        return;
      }
      const lease = m10.photoLeaseCheck(m10, txApp, uid, rawDeviceId, reqFence);
      if (lease.reject) { out = lease.reject; return; }

      txApp.delete(rec);                                   // removes record AND managed file (proven)

      const result = { ok: true, recordId: serverId, deleted: true, alreadyGone: false };
      m10.writePhotoLedger(txApp, uid, key, requestHash, "photo-delete", serverId,
        JSON.stringify(result), "", null, reqFence, lease.holderHash, clientBuild, deviceHash);
      out = { status: 200, body: result };
    });
  } catch (err) {
    $app.logger().error("M10 photo delete failed", "user", uid, "err", String(err).slice(0, 300));
    return e.json(500, { ok: false, error: "photo delete failed" });
  }
  return e.json(out.status, out.body);
}, $apis.requireAuth("users"));
