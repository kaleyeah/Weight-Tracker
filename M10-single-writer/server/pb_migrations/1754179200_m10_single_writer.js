/// <reference path="../pb_data/types.d.ts" />
/* Compound Fitness — M10 single-writer schema migration (PocketBase v0.39.8).
   Contract: design v9 §7 (Architect-approved round 9, 2026-08-02).

   UP: (1) create `writer_lease` (closed rules); (2) add SEVEN nullable columns
   to `cf_commit_log`; nothing else. No appdata transforms. No new or changed
   index on the existing ledger. An all-row, all-pre-existing-column sentinel
   proves existing data is untouched (H3/I8).

   DOWN: removes ONLY the M10 additions, preserving the CAS ledger, its rows,
   fields, and idx_cf_commit_key. Refuses without the explicit operator marker
   M10_DOWN_CONFIRM=yes, and refuses if the deployed M10 constant reads
   enforcement ON (H7/I9). The "no M10 client still deployed" precondition is
   an OPERATOR GATE in the runbook, not code — down is invoked only after the
   sequenced client rollback. */

const M10_LEDGER_FIELDS = [
  { type: "text",   name: "op",              max: 24 },
  { type: "number", name: "writerFence",     min: 0, onlyInt: true },
  { type: "text",   name: "holderDeviceHash", max: 64 },
  { type: "text",   name: "resultRecordId",  max: 15 },
  { type: "text",   name: "resultIdentity",  max: 1024 },
  { type: "text",   name: "fileSha256",      max: 64 },
  { type: "number", name: "fileByteLength",  min: 0, onlyInt: true },
];
const PRE_EXISTING = ["user", "subsystem", "key", "requestHash", "expectedRev",
                      "resultingRev", "responseStatus", "clientBuild", "deviceHash", "created"];

/* Deterministic per-row canonical string over the pre-existing columns.
   Held in memory for the sentinel comparison only — never logged (F12:
   health-adjacent content stays out of logs; these are hashes/ids anyway). */
function ledgerRowCanon(r) {
  const parts = [];
  for (let i = 0; i < PRE_EXISTING.length; i++) {
    const f = PRE_EXISTING[i];
    parts.push(f + "=" + String(r.get(f)));
  }
  return r.id + "|" + parts.join("|");
}
function ledgerSnapshot(app) {
  const rows = app.findRecordsByFilter("cf_commit_log", "id != ''", "id", 0, 0);
  const canons = [];
  rows.forEach((r) => canons.push(ledgerRowCanon(r)));
  return canons;
}
function assertSameSnapshot(before, after, when) {
  if (before.length !== after.length)
    throw new Error("M10 sentinel: ledger row count changed " + when + " (" + before.length + " -> " + after.length + ")");
  for (let i = 0; i < before.length; i++)
    if (before[i] !== after[i])
      throw new Error("M10 sentinel: ledger row content changed " + when + " at index " + i);
}

migrate((app) => {
  // ---- sentinel: capture every existing ledger row + the index list ----
  const before = ledgerSnapshot(app);
  const log = app.findCollectionByNameOrId("cf_commit_log");
  const indexesBefore = JSON.stringify(log.indexes.slice().sort());

  // ---- writer_lease (closed collection, design §3) ----
  let lease;
  try { lease = app.findCollectionByNameOrId("writer_lease"); } catch (_) { lease = null; }
  if (!lease) {
    lease = new Collection({
      type: "base", name: "writer_lease",
      /* list/view: the owner may observe the lease; create/update/delete null:
         mutation happens ONLY inside the lease route's transaction. */
      listRule: "user = @request.auth.id", viewRule: "user = @request.auth.id",
      createRule: null, updateRule: null, deleteRule: null,
      fields: [
        /* cascadeDelete — a deleted account's lease row has no purpose; same
           rationale as the ledger relation (CAS kit, Round 2 decision 3). */
        { type: "relation", name: "user", required: true, cascadeDelete: true,
          collectionId: app.findCollectionByNameOrId("users").id, maxSelect: 1 },
        { type: "text",     name: "holderDeviceId", max: 128 },
        { type: "text",     name: "deviceName",     max: 64 },   // display-only label, never authority (D10)
        { type: "number",   name: "fence", min: 0, onlyInt: true },
        { type: "bool",     name: "active" },
        { type: "autodate", name: "renewedAt", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_cf_writer_lease_user ON writer_lease (user)"],
    });
    app.save(lease);
  }

  // ---- cf_commit_log: the seven nullable M10 columns, nothing else ----
  M10_LEDGER_FIELDS.forEach((f) => {
    if (log.fields.getByName(f.name)) return;                      // idempotent re-run
    if (f.type === "number") log.fields.add(new NumberField({ name: f.name, min: f.min, onlyInt: true }));
    else                     log.fields.add(new TextField({ name: f.name, max: f.max }));
  });
  app.save(log);

  // ---- sentinel verification: rows and indexes byte-identical ----
  const logAfter = app.findCollectionByNameOrId("cf_commit_log");
  const indexesAfter = JSON.stringify(logAfter.indexes.slice().sort());
  if (indexesBefore !== indexesAfter)
    throw new Error("M10 sentinel: existing ledger indexes changed (" + indexesBefore + " -> " + indexesAfter + ")");
  assertSameSnapshot(before, ledgerSnapshot(app), "during up-migration");
  PRE_EXISTING.forEach((f) => {
    if (!logAfter.fields.getByName(f)) throw new Error("M10 sentinel: pre-existing ledger field lost: " + f);
  });
}, (app) => {
  // ---- down: gated, additive-only removal (H7/I8/I9) ----
  let confirm = "";
  try { confirm = $os.getenv("M10_DOWN_CONFIRM"); } catch (e) {
    throw new Error("M10 down: cannot read environment (" + e + ") — refusal stands; do not weaken (I9)");
  }
  if (confirm !== "yes")
    throw new Error("M10 down: refused. Set M10_DOWN_CONFIRM=yes only per the runbook, AFTER the sequenced client rollback.");
  try {
    const src = toString($os.readFile(__hooks + "/cf_m10_shared.js"));
    if (/FENCING_ENFORCED_DEFAULT\s*=\s*true/.test(src))
      throw new Error("M10 down: refused — deployed constant reads FENCING_ENFORCED_DEFAULT = true; disable enforcement first.");
  } catch (e) {
    if (String(e).indexOf("M10 down: refused") === 0) throw e;
    /* Hook file unreadable/absent (e.g. hooks already removed): the constant
       cannot read ON; the marker above remains the mechanical gate. */
  }

  const before = ledgerSnapshot(app);
  const log = app.findCollectionByNameOrId("cf_commit_log");
  M10_LEDGER_FIELDS.forEach((f) => {
    const fld = log.fields.getByName(f.name);
    if (fld) log.fields.removeById(fld.id);
  });
  app.save(log);

  const logAfter = app.findCollectionByNameOrId("cf_commit_log");
  PRE_EXISTING.forEach((f) => {
    if (!logAfter.fields.getByName(f)) throw new Error("M10 down sentinel: pre-existing ledger field lost: " + f);
  });
  if (!logAfter.indexes.some((i) => i.includes("idx_cf_commit_key")))
    throw new Error("M10 down sentinel: idx_cf_commit_key lost");
  assertSameSnapshot(before, ledgerSnapshot(app), "during down-migration");

  try { const lease = app.findCollectionByNameOrId("writer_lease"); app.delete(lease); } catch (_) {}
});
