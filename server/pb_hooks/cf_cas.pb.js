/// <reference path="../pb_data/types.d.ts" />
/* Compound Fitness — server-enforced compare-and-swap for appdata.
   PocketBase v0.39.8 (modern JSVM API: RequestEvent, $app.runInTransaction).

   Whole-snapshot sync is last-writer-wins without this. The client sends the
   revision it read; the server writes only if that revision is still current,
   atomically, inside one transaction. See REMEDIATION_PLAN_V2.md §4.

   Collections this file expects (see DEPLOYMENT.md):
     appdata:        user (relation, UNIQUE index), data (json), training (json),
                     coreRev (number), trainingRev (number)
     cf_commit_log:  user (relation), subsystem (text), key (text),
                     requestHash (text), expectedRev (number), resultingRev (number),
                     responseStatus (number)  — UNIQUE index on (user,subsystem,key),
                     all API rules null (superuser-only)
*/

const CF_MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;   // provisional; confirm via measurement (DEPLOYMENT.md step 4)
const CF_SUBSYSTEMS = { core: { field: "data", rev: "coreRev" },
                        training: { field: "training", rev: "trainingRev" } };

routerAdd("POST", "/api/cf/appdata/commit", (e) => {
  // ---- authentication: identity comes ONLY from the auth context ----
  if (!e.auth || e.auth.collection().name !== "users") {
    return e.json(401, { ok: false, error: "auth required" });
  }
  const uid = e.auth.id;

  // ---- validation ----
  const body = e.requestInfo().body || {};
  const sub = CF_SUBSYSTEMS[body.subsystem];
  if (!sub) return e.json(400, { ok: false, error: "invalid subsystem" });

  const expectedRev = body.expectedRev;
  if (typeof expectedRev !== "number" || expectedRev < 0 || Math.floor(expectedRev) !== expectedRev) {
    return e.json(400, { ok: false, error: "expectedRev must be a non-negative integer" });
  }
  const key = String(body.idempotencyKey || "");
  if (!key || key.length > 96) return e.json(400, { ok: false, error: "idempotencyKey required (max 96 chars)" });
  if (typeof body.payload !== "object" || body.payload === null || Array.isArray(body.payload)) {
    return e.json(400, { ok: false, error: "payload must be a JSON object" });
  }
  const payloadStr = JSON.stringify(body.payload);
  if (payloadStr.length > CF_MAX_PAYLOAD_BYTES) return e.json(413, { ok: false, error: "payload too large" });
  const clientBuild = String(body.clientBuild || "").slice(0, 64);
  const deviceId = String(body.deviceId || "").slice(0, 64);
  const requestHash = $security.sha256(body.subsystem + "|" + expectedRev + "|" + payloadStr);

  // ---- the atomic part ----
  let out = null;           // { status, body } decided inside the transaction
  const run = (allowCreate) => {
    $app.runInTransaction((txApp) => {
      // idempotency ledger first: a replay returns the original result
      let prior = null;
      try {
        prior = txApp.findFirstRecordByFilter("cf_commit_log",
          "user = {:u} && subsystem = {:s} && key = {:k}",
          { u: uid, s: body.subsystem, k: key });
      } catch (_) {}
      if (prior) {
        if (prior.getString("requestHash") !== requestHash) {
          out = { status: 409, body: { ok: false, error: "idempotency key reused with a different request" } };
          return;
        }
        out = { status: prior.getInt("responseStatus"),
                body: { ok: prior.getInt("responseStatus") === 200, replay: true,
                        subsystem: body.subsystem, newRev: prior.getInt("resultingRev") } };
        return;
      }

      // find or (only at expectedRev 0) create the user's single row
      let rec = null;
      try { rec = txApp.findFirstRecordByFilter("appdata", "user = {:u}", { u: uid }); } catch (_) {}
      if (!rec) {
        if (expectedRev !== 0) { out = { status: 409, body: { ok: false, conflict: true, subsystem: body.subsystem, serverRev: null, payload: null, error: "no row; only expectedRev 0 may create" } }; return; }
        if (!allowCreate)      { out = { status: 409, body: { ok: false, conflict: true, subsystem: body.subsystem, serverRev: 0, payload: null } }; return; }
        const col = txApp.findCollectionByNameOrId("appdata");
        rec = new Record(col);
        rec.set("user", uid);
        rec.set("coreRev", 0);
        rec.set("trainingRev", 0);
      }

      // compare-and-swap on the subsystem's own revision only
      const serverRev = rec.getInt(sub.rev);
      if (serverRev !== expectedRev) {
        out = { status: 409, body: { ok: false, conflict: true, subsystem: body.subsystem,
                                     serverRev: serverRev, payload: rec.get(sub.field) } };
        return;
      }

      // strict field isolation: touch only this subsystem's payload + revision
      rec.set(sub.field, body.payload);
      rec.set(sub.rev, serverRev + 1);
      txApp.save(rec);          // create race lands here: unique index rejects a duplicate row

      // ledger row commits in the SAME transaction as the data
      const logCol = txApp.findCollectionByNameOrId("cf_commit_log");
      const log = new Record(logCol);
      log.set("user", uid); log.set("subsystem", body.subsystem); log.set("key", key);
      log.set("requestHash", requestHash); log.set("expectedRev", expectedRev);
      log.set("resultingRev", serverRev + 1); log.set("responseStatus", 200);
      log.set("clientBuild", clientBuild); log.set("deviceId", deviceId);
      txApp.save(log);

      out = { status: 200, body: { ok: true, subsystem: body.subsystem, newRev: serverRev + 1 } };
    });
  };

  try {
    run(true);
  } catch (err) {
    // A concurrent first-commit can lose the create race on the unique index.
    // Do NOT continue inside the failed transaction: retry the whole operation
    // once through the existing-row path (plan §4, per the Architect's ruling).
    try { run(false); } catch (err2) {
      return e.json(500, { ok: false, error: "commit failed", detail: String(err2).slice(0, 200) });
    }
  }
  return e.json(out.status, out.body);
});

/* ---- compatibility revision bridge (transitional; see DEPLOYMENT.md step 7) ----
   Old cached PWA clients still PATCH appdata directly. If those writes don't
   move the revision, a CAS client would overwrite them WITHOUT detecting it —
   which would make CAS unsound. So every legacy raw write bumps the matching
   revision and is audit-stamped. The commit route saves programmatically
   inside its transaction, which does not fire *RequestEvent hooks, so it is
   never double-incremented by this bridge. Remove the bridge at lockdown. */
onRecordUpdateRequest((e) => {
  const body = e.requestInfo().body || {};
  // clients may never set revisions directly
  if ("coreRev" in body || "trainingRev" in body) {
    throw new BadRequestError("revision fields are server-managed");
  }
  if ("data" in body)     e.record.set("coreRev",     e.record.getInt("coreRev") + 1);
  if ("training" in body) e.record.set("trainingRev", e.record.getInt("trainingRev") + 1);
  $app.logger().info("CF legacy raw appdata write", "user", e.auth ? e.auth.id : "?", "keys", Object.keys(body).join(","));
  e.next();
}, "appdata");

onRecordCreateRequest((e) => {
  const body = e.requestInfo().body || {};
  if ("coreRev" in body || "trainingRev" in body) {
    throw new BadRequestError("revision fields are server-managed");
  }
  e.record.set("coreRev",     ("data" in body) ? 1 : 0);
  e.record.set("trainingRev", ("training" in body) ? 1 : 0);
  $app.logger().info("CF legacy raw appdata create", "user", e.auth ? e.auth.id : "?");
  e.next();
}, "appdata");

/* Load confirmation — check the server log after restart (DEPLOYMENT.md step 5). */
$app.logger().info("CF CAS hook loaded", "build", "cas-1", "maxPayloadBytes", CF_MAX_PAYLOAD_BYTES);
