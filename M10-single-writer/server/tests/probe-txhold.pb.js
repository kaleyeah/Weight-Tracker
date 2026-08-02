/// DISPOSABLE PROBE ONLY — race barriers + lease aging for tests.
/// /api/probe/txhold: open a WRITE transaction touching the caller's lease
/// row, hold it for {ms}, then commit — the serialization barrier for
/// both-orders race evidence (probe Q1 pattern).
routerAdd("POST", "/api/probe/txhold", (e) => {
  const body = e.requestInfo().body || {};
  const ms = Math.min(parseInt(String(body.ms || "300"), 10) || 300, 3000);
  const uid = e.auth.id;
  const t0 = Date.now();
  let held = false;
  $app.runInTransaction((txApp) => {
    const rec = txApp.findFirstRecordByFilter("writer_lease", "user = {:u}", { u: uid });
    rec.set("deviceName", rec.getString("deviceName"));   // dirty write → write lock
    txApp.save(rec);
    held = true;
    const until = Date.now() + ms;
    while (Date.now() < until) { /* hold the tx open */ }
  });
  return e.json(200, { ok: true, held: held, totalMs: Date.now() - t0 });
}, $apis.requireAuth("users"));

/// /api/probe/age-lease: superuser-only — backdate renewedAt via raw SQL so
/// TTL expiry is testable without waiting 24h. autodate would stamp "now" on
/// any API update, hence SQL.
routerAdd("POST", "/api/probe/age-lease", (e) => {
  const body = e.requestInfo().body || {};
  const uid = String(body.user || "");
  const hours = parseInt(String(body.hours || "25"), 10) || 25;
  const when = new Date(Date.now() - hours * 3600 * 1000).toISOString().replace("T", " ");
  $app.db().newQuery("UPDATE writer_lease SET renewedAt = {:w} WHERE user = {:u}")
    .bind({ w: when, u: uid }).execute();
  return e.json(200, { ok: true, renewedAt: when });
}, $apis.requireSuperuserAuth());
