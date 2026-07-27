/// <reference path="../pb_data/types.d.ts" />
/* Compound Fitness — server-enforced compare-and-swap for appdata.
   PocketBase v0.39.8.

   Schema is created by pb_migrations/1753400000_cf_cas.js (reproducible);
   Admin-UI steps in DEPLOYMENT.md are a fallback only.

   ROUND 3 (Product Architect Round 2 review):
     - All request-time constants and helpers now come from cf_cas_shared.js,
       required INSIDE each handler. PocketBase runs handlers in a separate
       goja runtime with no access to this file's lexical scope; relying on it
       made every commit throw ReferenceError (STAGING_RESULTS.md §3).
     - Payload cap 256 KiB, request envelope 320 KiB (Architect ruling).
   The route's public contract is UNCHANGED — request fields and the
   200/400/401/409/413/426/500 semantics are exactly as the approved client
   build 2026-07-27.342-pb-c1h expects. */

/* Top-level require is fine — this scope DOES exist at registration time, and
   bodyLimit must be resolved when the route is registered. The handler below
   still requires the module itself; it cannot see this binding. */
const cfBoot = require(`${__hooks}/cf_cas_shared.js`);

routerAdd("POST", "/api/cf/appdata/commit", (e) => {
  /* Handler runtime: load everything we need here, never from file scope. */
  const cf = require(`${__hooks}/cf_cas_shared.js`);

  const uid = e.auth.id;                                  // requireAuth middleware guarantees presence
  const body = e.requestInfo().body || {};

  let bad = cf.validateSubsystem(body.subsystem);         if (bad) return e.json(bad.status, bad.body);
  bad = cf.validateExpectedRev(body.expectedRev);         if (bad) return e.json(bad.status, bad.body);
  const key = String(body.idempotencyKey || "");
  bad = cf.validateKey(key);                              if (bad) return e.json(bad.status, bad.body);
  bad = cf.validatePayload(body.payload);                 if (bad) return e.json(bad.status, bad.body);

  const sub = cf.SUBSYSTEMS[body.subsystem];
  const expectedRev = body.expectedRev;
  const payloadStr = JSON.stringify(body.payload);
  bad = cf.validatePayloadSize(payloadStr);               if (bad) return e.json(bad.status, bad.body);

  const clientBuild = String(body.clientBuild || "").slice(0, 64);
  bad = cf.validateClientBuild(clientBuild);              if (bad) return e.json(bad.status, bad.body);

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
          out = { status: 409, body: cf.keyReused() };
          return;
        }
        const st = prior.getInt("responseStatus");
        out = { status: st, body: cf.okReplay(body.subsystem, prior.getInt("resultingRev"), st) };
        return;
      }
      let rec = null;
      try { rec = txApp.findFirstRecordByFilter("appdata", "user = {:u}", { u: uid }); } catch (_) {}
      if (!rec) {
        if (expectedRev !== 0) {
          out = { status: 409, body: { ok: false, conflict: true, subsystem: body.subsystem,
                                       serverRev: null, payload: null,
                                       error: "no row; only expectedRev 0 may create" } };
          return;
        }
        if (!allowCreate) { out = { status: 409, body: cf.conflict(body.subsystem, 0, null) }; return; }
        const col = txApp.findCollectionByNameOrId("appdata");
        rec = new Record(col);
        rec.set("user", uid); rec.set("coreRev", 0); rec.set("trainingRev", 0);
      }
      const serverRev = rec.getInt(sub.rev);
      if (serverRev !== expectedRev) {
        out = { status: 409, body: cf.conflict(body.subsystem, serverRev, rec.get(sub.field)) };
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
      out = { status: 200, body: cf.okCommit(body.subsystem, serverRev + 1) };
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
        return e.json(409, cf.keyReused());
      const st = ledgerNow.getInt("responseStatus");
      return e.json(st, cf.okReplay(body.subsystem, ledgerNow.getInt("resultingRev"), st));
    }
    try { rowNow = $app.findFirstRecordByFilter("appdata", "user = {:u}", { u: uid }); } catch (_) {}
    const looksLikeCreateRace = (expectedRev === 0) && rowNow;
    if (!looksLikeCreateRace) {
      $app.logger().error("CF commit failed (not a create race)", "user", uid, "err", String(err).slice(0, 300));
      return e.json(500, cf.commitFailed());               // never a misleading 409
    }
    try { run(false); } catch (err2) {
      $app.logger().error("CF commit retry failed", "user", uid, "err", String(err2).slice(0, 300));
      return e.json(500, cf.commitFailed());
    }
  }
  return e.json(out.status, out.body);
}, $apis.requireAuth("users"), $apis.bodyLimit(cfBoot.REQUEST_LIMIT_BYTES));

/* ---- transitional legacy-write bridge (snapshot fields only) ----
   Scope (addendum #12): ONLY data/training move revisions. health/coachreq are
   operational fields OUTSIDE the CAS revisions, by design — after lockdown the
   field-conditional update rule keeps them writable while snapshot fields are
   route-only. The route saves programmatically inside its transaction, which
   fires no *RequestEvent hooks — never double-incremented. Remove at lockdown.
   These handlers use only globals (e, $app, BadRequestError), so they are
   unaffected by the handler-runtime scoping rule. */
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
   never payloads. Readable by superusers only (rules locked in migration).
   Rows for DELETED users are removed immediately by the relation's
   cascadeDelete, not by this job (Architect Round 2 decision 3). */
cronAdd("cf_ledger_prune", "0 4 * * *", () => {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().replace("T", " ");
    const stale = $app.findRecordsByFilter("cf_commit_log", "created < {:c}", "", 500, 0, { c: cutoff });
    stale.forEach((r) => { try { $app.delete(r); } catch (_) {} });
    if (stale.length) $app.logger().info("CF ledger pruned", "removed", stale.length);
  } catch (err) { $app.logger().error("CF ledger prune failed", "err", String(err).slice(0, 200)); }
});

$app.logger().info("CF CAS hook loaded", "build", "cas-3", "maxPayloadBytes", cfBoot.MAX_PAYLOAD_BYTES,
  "requestLimitBytes", cfBoot.REQUEST_LIMIT_BYTES, "minClientBuild", cfBoot.MIN_CLIENT_BUILD || "(none)");
