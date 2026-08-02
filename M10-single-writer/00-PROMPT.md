# M10 single-writer — round 9: design v9 (schema-complete) + matrix v5.1

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

Your round-8 ruling (8 items) is addressed in full — the narrow scope
you requested, no broader redesign. Committed before this prompt
(commit 8de1705, local only). Disposition (H1–H8 = round-8 items 1–8):

- **H1 (complete ledger enumeration)** — DESIGN §7 now carries the
  full field table for `cf_commit_log`, against the actual deployed
  schema (user relation required/cascade, subsystem text 16, key
  text 96, requestHash text 64, expectedRev/resultingRev/
  responseStatus int ≥0, clientBuild text 64, deviceHash text 16,
  created autodate; unique `idx_cf_commit_key (user, subsystem,
  key)` — read from the shipped migration
  `server/pb_migrations/1753400000_cf_cas.js`). Seven new columns,
  each with PB type, bounds, nullability, and populating subsystem:
  `op` (text 24, discriminator, NULL = legacy CAS row), `writerFence`
  (int ≥0, fenced device commits, NULL on platform/legacy),
  `deviceLabelHash` (text 64, sha256 of the LEASE ROW's holder label
  read inside the commit transaction — server-derived, deliberately
  distinct from the client-supplied `deviceHash`), `resultRecordId`
  (text 15, photo routes), `resultIdentity` (text 1024, photo
  routes), `fileSha256` (text 64, upload), `fileByteLength` (int ≥0,
  upload). No new or changed index — asserted before/after.
- **H2 (request vs result identity)** — DESIGN §photo idempotency:
  `requestHash` binds the OPERATION (exact canonical composition per
  op stated); `resultRecordId` + `resultIdentity` carry the RESULT;
  the typed replay reconstruction for upload/update/delete is
  spelled out, including the retention-expired transactional
  fallback returning the same shapes.
- **H3 (migration/sentinel/down for the full set)** — sentinel:
  before/after row count + per-row in-memory digest over ALL ten
  pre-existing columns + index-list assertion; all seven new columns
  nullable, nothing written to existing rows. Down removes ONLY the
  seven M10 columns and preserves the CAS ledger, its rows, and
  `idx_cf_commit_key` (asserted). Migration test suite added
  (evidence §8.8): up on a populated disposable ledger, refused down,
  confirmed down.
- **H4 (upload edge handling)** — no file / two files / unreadable
  temp / oversize (`PHOTO_MAX_BYTES` constant) / declared-vs-actual
  length mismatch / digest failure — each a typed error rolling back
  with NO photo record, NO managed-file orphan, NO ledger row; all
  in evidence §8.6.
- **H5 (transaction order for an existing key)** — the route hashes
  the received bytes FIRST; the ledger lookup never short-circuits
  before the file is examined; prior-row path recomputes the full
  request identity from the fresh bytes and only a full match
  returns the stored result; mismatch → typed key-reuse 409.
- **H6 (platform matrix wording)** — matrix §2 corrected: no
  expectedRev conflict exists; concurrent platform/device calls
  SERIALIZE on the transaction and apply to the transaction-current
  snapshot; the only retry is a typed transaction failure (no ledger
  row) re-invoked with the SAME idempotency key.
- **H7 (honest down-refusal)** — mechanically enforced: down throws
  without `M10_DOWN_CONFIRM=yes` (tested, schema byte-identical) and
  when it can read `FENCING_ENFORCED=true` from the deployed
  constant. Honestly procedural: the "no M10 client still deployed"
  precondition is an OPERATOR GATE in the runbook (down only after
  the sequenced client rollback); no code enforcement is claimed for
  it.
- **H8 (approval boundary)** — acknowledged and preserved: approval
  authorizes ONLY server-package implementation + testing on local
  disposable PocketBase. Client, coach, NAS deploy/probes,
  enforcement, raw-PATCH lockdown, and live data remain unauthorized.

Files: DESIGN.md (v9, consolidated), WRITE-SURFACE-MATRIX.md (v5.1 —
sole change from v5 is the H6 platform wording + version refs),
artifacts/ (unchanged).

Requested ruling: whether design v9 + matrix v5.1 are the approved
contract for §9 step 2 — LOCAL-only implementation against disposable
PB. Nothing else is requested.
