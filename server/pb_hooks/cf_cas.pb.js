/// <reference path="../pb_data/types.d.ts" />
/* Compound Fitness — server-enforced compare-and-swap for appdata.
   PocketBase v0.39.8. Revised per the Product Architect server-kit addendum.

   Schema is created by pb_migrations/1753400000_cf_cas.js (reproducible);
   Admin-UI steps in DEPLOYMENT.md are a fallback only. */

const CF_MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;            // provisional until measured (DEPLOYMENT step 4)
const CF_REQUEST_LIMIT     = CF_MAX_PAYLOAD_BYTES + 64 * 1024;   // full JSON envelope headroom
const CF_MIN_CLIENT_BUILD  = "";                          // e.g. "2026-07-25.334" once the CAS client ships
const CF_SUBSYSTEMS = { core: { field: "data", rev: "coreRev" },
                        training: { field: "training", rev: "trainingRev" } };

/* UTF-8 byte length — JS .length counts UTF-16 units, not bytes */
function cfUtf8Bytes(s){ try { return unescape(encodeURIComponent(s)).length; } catch (e) { return s.length * 3; } }

routerAdd("POST", "/api/cf/appdata/commit", (e) => {
  const uid = e.auth.id;                                  // requireAuth middleware guarantees presence
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
  if (cfUtf8Bytes(payloadStr) > CF_MAX_PAYLOAD_BYTES) return e.json(413, { ok: false, error: "payload too large" });
  const clientBuild = String(body.clientBuild || "").slice(0, 64);
  if (CF_MIN_CLIENT_BUILD && clientBuild && clientBuild < CF_MIN_CLIENT_BUILD) {
    return e.json(426, { ok: false, error: "update-required", minBuild: CF_MIN_CLIENT_BUILD });
  }
  /* deviceId is diagnostics only — stored as a short hash, never raw (addendum #9) */
  const deviceHash = body.deviceId ? $security.sha256(String(body.deviceId)).slice(0, 16) : "";
  const requestHash = $security.sha256(body.subsystem + "|" + expectedRev + "|" + payloadStr);

  let out = null;
  const run = (allowCreate) => {
    $app.runInTransaction((txApp) => {
      let prior = null;
      try {
        prior = txApp.findFirstRecordByFilter("cf_commit_log",
          "user = {:u} && subsystem = {:s} && key = {:k}", { u: uid, s: body.subsystem, k: key });
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
      let rec = null;
      try { rec = txApp.findFirstRecordByFilter("appdata", "user = {:u}", { u: uid }); } catch (_) {}
      if (!rec) {
        if (expectedRev !== 0) { out = { status: 409, body: { ok: false, conflict: true, subsystem: body.subsystem, serverRev: null, payload: null, error: "no row; only expectedRev 0 may create" } }; return; }
        if (!allowCreate)      { out = { status: 409, body: { ok: false, conflict: true, subsystem: body.subsystem, serverRev: 0, payload: null } }; return; }
        const col = txApp.findCollectionByNameOrId("appdata");
        rec = new Record(col);
        rec.set("user", uid); rec.set("coreRev", 0); rec.set("trainingRev", 0);
      }
      const serverRev = rec.getInt(sub.rev);
      if (serverRev !== expectedRev) {
        out = { status: 409, body: { ok: false, conflict: true, subsystem: body.subsystem,
                                     serverRev: serverRev, payload: rec.get(sub.field) } };
        return;
      }
      rec.set(sub.field, body.payload);
      rec.set(sub.rev, serverRev + 1);
      txApp.save(rec);
      const logCol = txApp.findCollectionByNameOrId("cf_commit_log");
      const log = new Record(logCol);
      log.set("user", uid); log.set("subsystem", body.subsystem); log.set("key", key);
      log.set("requestHash", requestHash); log.set("expectedRev", expectedRev);
      log.set("resultingRev", serverRev + 1); log.set("responseStatus", 200);
      log.set("clientBuild", clientBuild); log.set("deviceHash", deviceHash);
      txApp.save(log);
      out = { status: 200, body: { ok: true, subsystem: body.subsystem, newRev: serverRev + 1 } };
    });
  };

  try {
    run(true);
  } catch (err) {
    /* Addendum #2: do NOT treat every failure as the create race. Retry only
       when the evidence matches one; addendum #7: a lost LEDGER race replays. */
    let ledgerNow = null, rowNow = null;
    try { ledgerNow = $app.findFirstRecordByFilter("cf_commit_log",
      "user = {:u} && subsystem = {:s} && key = {:k}", { u: uid, s: body.subsystem, k: key }); } catch (_) {}
    if (ledgerNow) {                                       // concurrent same-key commit won — idempotent replay
      if (ledgerNow.getString("requestHash") !== requestHash)
        return e.json(409, { ok: false, error: "idempotency key reused with a different request" });
      return e.json(ledgerNow.getInt("responseStatus"),
        { ok: ledgerNow.getInt("responseStatus") === 200, replay: true,
          subsystem: body.subsystem, newRev: ledgerNow.getInt("resultingRev") });
    }
    try { rowNow = $app.findFirstRecordByFilter("appdata", "user = {:u}", { u: uid }); } catch (_) {}
    const looksLikeCreateRace = (expectedRev === 0) && rowNow;
    if (!looksLikeCreateRace) {
      $app.logger().error("CF commit failed (not a create race)", "user", uid, "err", String(err).slice(0, 300));
      return e.json(500, { ok: false, error: "commit failed" });   // never a misleading 409
    }
    try { run(false); } catch (err2) {
      $app.logger().error("CF commit retry failed", "user", uid, "err", String(err2).slice(0, 300));
      return e.json(500, { ok: false, error: "commit failed" });
    }
  }
  return e.json(out.status, out.body);
}, $apis.requireAuth("users"), $apis.bodyLimit(CF_REQUEST_LIMIT));

/* ---- transitional legacy-write bridge (snapshot fields only) ----
   Scope (addendum #12): ONLY data/training move revisions. health/coachreq are
   operational fields OUTSIDE the CAS revisions, by design — after lockdown the
   field-conditional update rule keeps them writable while snapshot fields are
   route-only. The route saves programmatically inside its transaction, which
   fires no *RequestEvent hooks — never double-incremented. Remove at lockdown. */
onRecordUpdateRequest((e) => {
  const body = e.requestInfo().body || {};
  if ("coreRev" in body || "trainingRev" in body) throw new BadRequestError("revision fields are server-managed");
  if ("data" in body)     e.record.set("coreRev",     e.record.getInt("coreRev") + 1);
  if ("training" in body) e.record.set("trainingRev", e.record.getInt("trainingRev") + 1);
  if (("data" in body) || ("training" in body))
    $app.logger().info("CF legacy raw snapshot write", "user", e.auth ? e.auth.id : "?", "keys", Object.keys(body).join(","));
  e.next();
}, "appdata");

onRecordCreateRequest((e) => {
  const body = e.requestInfo().body || {};
  if ("coreRev" in body || "trainingRev" in body) throw new BadRequestError("revision fields are server-managed");
  /* raw create cannot forge another owner: pin to the authenticated user */
  if (e.auth && e.record.getString("user") !== e.auth.id) e.record.set("user", e.auth.id);
  e.record.set("coreRev",     ("data" in body) ? 1 : 0);
  e.record.set("trainingRev", ("training" in body) ? 1 : 0);
  $app.logger().info("CF legacy raw appdata create", "user", e.auth ? e.auth.id : "?");
  e.next();
}, "appdata");

/* ---- idempotency-log retention (addendum #9): 30 days, pruned daily.
   Long enough for any realistic retry window; the log stores hashes only,
   never payloads. Readable by superusers only (rules locked in migration). */
cronAdd("cf_ledger_prune", "0 4 * * *", () => {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().replace("T", " ");
    const stale = $app.findRecordsByFilter("cf_commit_log", "created < {:c}", "", 500, 0, { c: cutoff });
    stale.forEach((r) => { try { $app.delete(r); } catch (_) {} });
    if (stale.length) $app.logger().info("CF ledger pruned", "removed", stale.length);
  } catch (err) { $app.logger().error("CF ledger prune failed", "err", String(err).slice(0, 200)); }
});

$app.logger().info("CF CAS hook loaded", "build", "cas-2", "maxPayloadBytes", CF_MAX_PAYLOAD_BYTES, "minClientBuild", CF_MIN_CLIENT_BUILD || "(none)");
