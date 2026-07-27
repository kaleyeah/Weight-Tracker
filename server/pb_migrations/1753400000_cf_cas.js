/// <reference path="../pb_data/types.d.ts" />
/* Compound Fitness — reproducible CAS schema migration (PocketBase v0.39.8).
   Run on a DISPOSABLE COPY first (addendum #3). Fails loudly if duplicate
   appdata rows exist — resolve them (DEPLOYMENT step 2) before migrating. */
migrate((app) => {
  // ---- guard: the unique index cannot land on duplicated owners ----
  const rows = app.findRecordsByFilter("appdata", "id != ''", "", 0, 0);
  const seen = {};
  rows.forEach((r) => {
    const u = r.getString("user");
    if (seen[u]) throw new Error("duplicate appdata rows for user " + u + " — resolve before migrating (DEPLOYMENT.md step 2)");
    seen[u] = true;
  });

  // ---- appdata: revision fields + unique owner index + field-conditional rules ----
  const appdata = app.findCollectionByNameOrId("appdata");
  if (!appdata.fields.getByName("coreRev"))
    appdata.fields.add(new NumberField({ name: "coreRev", min: 0, onlyInt: true }));
  if (!appdata.fields.getByName("trainingRev"))
    appdata.fields.add(new NumberField({ name: "trainingRev", min: 0, onlyInt: true }));
  /* Match on index SHAPE, not on our chosen name. An equivalent unique index
     may already exist under an Admin-UI-generated name — production carries
     `idx_88qok6ts7v` on appdata(user). Guarding by name alone pushes a second
     unique index on the same column and PocketBase rejects the duplicate
     definition ("The index definition already exists"), aborting the whole
     migration. See server/STAGING_RESULTS.md §4. */
  /* Match "CREATE UNIQUE INDEX" specifically, not the word "unique" anywhere in
     the statement — an index merely NAMED e.g. `idx_user_unique_lookup` but
     declared non-unique must NOT satisfy this guard, or we would skip creating
     real protection. Caught by migration.sh case M5. */
  const hasUserUnique = appdata.indexes.some((i) =>
    /create\s+unique\s+index/i.test(i) && /\(\s*`?user`?\s*\)/i.test(i));
  if (!hasUserUnique)
    appdata.indexes.push("CREATE UNIQUE INDEX idx_cf_appdata_user ON appdata (user)");
  /* LOCKDOWN-READY rules (applied at cutover step 7, kept here as the record
     of intent — the migration itself does NOT change rules, so old clients
     keep working during the bridge window): see DEPLOYMENT.md step 7:
       createRule: null   (route-only)
       updateRule: user = @request.auth.id
                   && @request.body.data:isset = false
                   && @request.body.training:isset = false
                   && @request.body.coreRev:isset = false
                   && @request.body.trainingRev:isset = false
     This keeps operational fields (health, coachreq) writable after lockdown
     while snapshot fields become route-only. */
  app.save(appdata);

  // ---- cf_commit_log: idempotency ledger, superuser-only ----
  let log;
  try { log = app.findCollectionByNameOrId("cf_commit_log"); } catch (_) { log = null; }
  if (!log) {
    log = new Collection({
      type: "base", name: "cf_commit_log",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,  // superusers only
      fields: [
        /* cascadeDelete: true — Product Architect Round 2 decision 3. The ledger
           exists only to support short-lived idempotency for an ACTIVE account;
           once the account is gone the keys serve no product purpose. Without
           cascade, `required: true` makes any user with ledger rows undeletable
           ("not part of a required relation reference"), which with 30-day
           retention would block account deletion for up to 30 days — ruled
           unacceptable. Nullable orphans were rejected as weaker integrity and
           prune-on-delete as an extra failure path. */
        { type: "relation", name: "user", required: true, cascadeDelete: true,
          collectionId: app.findCollectionByNameOrId("users").id, maxSelect: 1 },
        { type: "text", name: "subsystem", required: true, max: 16 },
        { type: "text", name: "key", required: true, max: 96 },
        { type: "text", name: "requestHash", max: 64 },
        { type: "number", name: "expectedRev", min: 0, onlyInt: true },
        { type: "number", name: "resultingRev", min: 0, onlyInt: true },
        { type: "number", name: "responseStatus", min: 0, onlyInt: true },
        { type: "text", name: "clientBuild", max: 64 },
        { type: "text", name: "deviceHash", max: 16 },
        { type: "autodate", name: "created", onCreate: true },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_cf_commit_key ON cf_commit_log (user, subsystem, key)"],
    });
    app.save(log);
  }
}, (app) => {
  // ---- down migration / rollback ----
  try { const log = app.findCollectionByNameOrId("cf_commit_log"); app.delete(log); } catch (_) {}
  try {
    const appdata = app.findCollectionByNameOrId("appdata");
    /* Deliberate asymmetry with the up-migration: drop ONLY the index this kit
       created (by our name). A pre-existing unique index adopted above —
       production's `idx_88qok6ts7v` — is NOT dropped, because rollback must not
       remove protection the kit never installed. Previously this was the same
       behaviour by accident of naming; it is now intent. PENDING Product
       Architect confirmation (STAGING_REVIEW_PROMPT.md ask #2). */
    appdata.indexes = appdata.indexes.filter((i) => !i.includes("idx_cf_appdata_user"));
    const c = appdata.fields.getByName("coreRev"); if (c) appdata.fields.removeById(c.id);
    const t = appdata.fields.getByName("trainingRev"); if (t) appdata.fields.removeById(t.id);
    app.save(appdata);
  } catch (_) {}
});
