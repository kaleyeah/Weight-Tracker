/// <reference path="../pb_data/types.d.ts" />
/* Compound Fitness — M10 writer-lease route (PocketBase v0.39.8).
   Contract: design v9 §3/§4 (Architect-approved round 9).

   One route, five ops, each ONE transaction. The fence is the authority
   (deviceId is a copyable label — D10/E-11): every ownership CHANGE strictly
   increases the fence; a released fence can never validate again (D-ABA).
   The row is NEVER deleted in normal operation. */

routerAdd("POST", "/api/cf/writer/lease", (e) => {
  const cf = require(`${__hooks}/cf_m10_shared.js`);
  const uid = e.auth.id;
  const body = e.requestInfo().body || {};
  const op = String(body.op || "");
  const deviceId = String(body.deviceId || "");
  const deviceName = String(body.deviceName || "").slice(0, 64);
  const reqFence = (typeof body.fence === "number" && Math.floor(body.fence) === body.fence) ? body.fence : null;
  const nowMs = Date.now();

  if (["status", "acquire", "renew", "release", "steal"].indexOf(op) < 0)
    return e.json(400, { ok: false, error: "invalid op" });
  if (op !== "status" && !deviceId)
    return e.json(400, { ok: false, error: "deviceId required" });

  let out = null;
  $app.runInTransaction((txApp) => {
    let rec = null;
    try { rec = txApp.findFirstRecordByFilter("writer_lease", "user = {:u}", { u: uid }); } catch (_) {}

    if (op === "status") { out = { status: 200, body: cf.leaseStatusBody(rec, nowMs) }; return; }

    const bumpGuard = (f) => {
      if (f >= cf.FENCE_MAX) throw new Error("fence ceiling reached — refuse rather than wrap");
    };

    if (!rec) {
      /* No row yet: acquire creates it at fence 1. renew/release/steal on a
         missing row: steal behaves as acquire (first writer); renew/release
         are stale by definition. */
      if (op === "renew" || op === "release") { out = { status: 409, body: cf.leaseStale(0) }; return; }
      const col = txApp.findCollectionByNameOrId("writer_lease");
      rec = new Record(col);
      rec.set("user", uid); rec.set("holderDeviceId", deviceId);
      rec.set("deviceName", deviceName); rec.set("fence", 1); rec.set("active", true);
      txApp.save(rec);
      out = { status: 200, body: Object.assign(cf.leaseStatusBody(rec, nowMs), { granted: true }) };
      return;
    }

    const fence = rec.getInt("fence");
    const holder = rec.getString("holderDeviceId");
    const active = !!rec.getBool("active");
    const renewedMs = cf.parsePbDate(rec.getString("renewedAt"));
    const expired = cf.leaseExpired(renewedMs, nowMs);

    if (op === "acquire") {
      if (active && holder === deviceId && !expired) {
        /* no-op refresh: same holder, fence unchanged */
        rec.set("deviceName", deviceName || rec.getString("deviceName"));
        txApp.save(rec);
        out = { status: 200, body: Object.assign(cf.leaseStatusBody(rec, nowMs), { granted: true }) };
        return;
      }
      if (active && !expired) {                                    // someone else holds it
        out = { status: 409, body: Object.assign(cf.leaseStatusBody(rec, nowMs), { ok: false, held: true }) };
        return;
      }
      bumpGuard(fence);                                            // inactive or expired → ownership change
      rec.set("holderDeviceId", deviceId); rec.set("deviceName", deviceName);
      rec.set("fence", fence + 1); rec.set("active", true);
      txApp.save(rec);
      out = { status: 200, body: Object.assign(cf.leaseStatusBody(rec, nowMs), { granted: true }) };
      return;
    }

    if (op === "renew") {
      if (!active || holder !== deviceId || reqFence !== fence || expired) {
        out = { status: 409, body: cf.leaseStale(fence) }; return;
      }
      rec.set("renewedAt", "");                                    // autodate onUpdate refreshes
      txApp.save(rec);
      out = { status: 200, body: cf.leaseStatusBody(rec, nowMs) };
      return;
    }

    if (op === "release") {
      if (holder !== deviceId || reqFence !== fence) {
        out = { status: 409, body: cf.leaseStale(fence) }; return;
      }
      bumpGuard(fence);
      rec.set("active", false); rec.set("holderDeviceId", "");
      rec.set("fence", fence + 1);                                 // released fence can NEVER validate again
      txApp.save(rec);
      out = { status: 200, body: cf.leaseStatusBody(rec, nowMs) };
      return;
    }

    /* steal — always succeeds online; displacement is discovered by the old
       holder via stale/fenceStale, never a handshake. */
    bumpGuard(fence);
    rec.set("holderDeviceId", deviceId); rec.set("deviceName", deviceName);
    rec.set("fence", fence + 1); rec.set("active", true);
    txApp.save(rec);
    out = { status: 200, body: Object.assign(cf.leaseStatusBody(rec, nowMs), { granted: true }) };
  });

  return e.json(out.status, out.body);
}, $apis.requireAuth("users"));
