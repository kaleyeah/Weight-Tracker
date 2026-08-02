/// <reference path="../pb_data/types.d.ts" />
/* Compound Fitness — M10 platform writer route (PocketBase v0.39.8).
   Contract: design v9 §2b, E1/E5/F11/I5 (Architect-approved round 9).

   The NAS coach jobs' revision-safe path: superuser middleware ONLY (its own
   binding, never a branch in the users-only commit route — I4), field-scoped
   to the platform-owned set, read-modify-write of the CURRENT snapshot inside
   ONE transaction, coreRev incremented, idempotent. Bypasses the device
   lease; NEVER revision safety or field ownership. */

routerAdd("POST", "/api/cf/platform/patch-data", (e) => {
  const cf = require(`${__hooks}/cf_cas_shared.js`);
  const m10 = require(`${__hooks}/cf_m10_shared.js`);
  const body = e.requestInfo().body || {};

  const targetUid = String(body.user || "");
  if (!targetUid) return e.json(400, { ok: false, error: "user required" });
  const key = String(body.idempotencyKey || "");
  let bad = cf.validateKey(key);                          if (bad) return e.json(bad.status, bad.body);
  if (typeof body.fields !== "object" || body.fields === null || Array.isArray(body.fields))
    return e.json(400, { ok: false, error: "fields must be an object" });
  const fieldKeys = Object.keys(body.fields);
  if (!fieldKeys.length) return e.json(400, { ok: false, error: "fields must not be empty" });
  for (let i = 0; i < fieldKeys.length; i++)
    if (!m10.PLATFORM_FIELDS[fieldKeys[i]])
      return e.json(400, { ok: false, error: "field not platform-owned: " + fieldKeys[i] });

  /* I5: identity = target user + canonical field patch — never a snapshot. */
  const requestHash = $security.sha256("platform-patch|" + targetUid + "|" + m10.canonicalJson(body.fields));

  let out = null;
  try {
    $app.runInTransaction((txApp) => {
      /* I5 same-key-different-target: the key is claimed subsystem-wide, so a
         reuse against ANY other target rejects (the per-user unique index
         alone would let two targets share a key silently). */
      let prior = null;
      try {
        prior = txApp.findFirstRecordByFilter("cf_commit_log",
          "subsystem = 'platform' && key = {:k}", { k: key });
      } catch (_) {}
      if (prior) {
        if (prior.getString("requestHash") !== requestHash ||
            prior.getString("user") !== targetUid) {
          out = { status: 409, body: { ok: false, error: "idempotency key reused with a different request" } };
          return;
        }
        /* replay: the stored outcome, coreRev NOT incremented again */
        out = { status: 200, body: { ok: true, replay: true, coreRev: prior.getInt("resultingRev") } };
        return;
      }
      let rec = null;
      try { rec = txApp.findFirstRecordByFilter("appdata", "user = {:u}", { u: targetUid }); } catch (_) {}
      if (!rec) { out = { status: 404, body: { ok: false, notFound: true } }; return; }

      /* read-modify-write of the TRANSACTION-CURRENT snapshot: only the named
         platform fields change; athlete fields ride through untouched. */
      let data = {};
      try { data = JSON.parse(rec.getString("data") || "{}") || {}; } catch (_) { data = {}; }
      for (let i = 0; i < fieldKeys.length; i++) data[fieldKeys[i]] = body.fields[fieldKeys[i]];
      const oldRev = rec.getInt("coreRev");
      rec.set("data", data);
      rec.set("coreRev", oldRev + 1);
      txApp.save(rec);

      const logCol = txApp.findCollectionByNameOrId("cf_commit_log");
      const log = new Record(logCol);
      log.set("user", targetUid); log.set("subsystem", "platform"); log.set("key", key);
      log.set("requestHash", requestHash); log.set("expectedRev", oldRev);
      log.set("resultingRev", oldRev + 1); log.set("responseStatus", 200);
      log.set("op", "platform-patch");
      txApp.save(log);
      /* payload-free log (design §2b): user id, field names, revision only */
      $app.logger().info("M10 platform patch", "user", targetUid, "fields", fieldKeys.join(","), "rev", oldRev + 1);
      out = { status: 200, body: { ok: true, coreRev: oldRev + 1 } };
    });
  } catch (err) {
    $app.logger().error("M10 platform patch failed", "user", targetUid, "err", String(err).slice(0, 300));
    return e.json(500, { ok: false, error: "platform patch failed" });
  }
  return e.json(out.status, out.body);
}, $apis.requireSuperuserAuth());
