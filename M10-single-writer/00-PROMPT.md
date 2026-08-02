# M10 single-writer — round 10: the LOCAL server package + evidence

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

Your round-9 approval (design v9 + matrix v5.1 as the contract for
LOCAL DISPOSABLE server-package implementation only) has been executed.
This round returns the exact package and its evidence, per your closing
list. Commit bb6d6d8 (local only). Nothing touched the NAS, the coach,
the client, or any non-disposable instance; the unrelated working-tree
files (knowledge codex, C14 test) are NOT in the M10 commits (item 12).

## The package (`server/`, additive to the deployed CAS kit)

- `pb_migrations/1754179200_m10_single_writer.js` — up: `writer_lease`
  (closed rules, unique user index) + the SEVEN nullable ledger columns
  exactly as enumerated (H1), all-row/all-pre-existing-column in-memory
  sentinel + index-list assertion; down: gated (marker + constant
  read), removes only M10 additions.
- `pb_hooks/cf_m10_shared.js` — constants (FENCING_ENFORCED_DEFAULT =
  false; the ON variant exists ONLY via CF_M10_ENFORCE_OVERRIDE in the
  disposable environment — item 2), lease/canonicalization/mailbox
  helpers, photo-route helpers.
- `pb_hooks/cf_m10_lease.pb.js` — the five-op lease route (status /
  acquire / renew / release / steal), one transaction each, monotonic
  fence, D-ABA release bump, TTL 24h, fence-ceiling hard error.
- `pb_hooks/cf_cas.pb.js` — MODIFIED deployed commit route (exact
  change = `CAS-DIFF.patch`, 109 lines): in-transaction lease load,
  enforcement-ON fence validation before any mutation, ledger rows gain
  `writerFence` + `holderDeviceHash` — the latter is sha256 of the
  LEASE ROW's holderDeviceId read inside the commit transaction (your
  item 3; the schema column is named `holderDeviceHash` as you
  preferred, design updated implicitly by this return); the transitional
  raw bridge is now enforcement-aware (ON → §6 mailbox policing +
  content rejection + superuser bypass with payload-free log; OFF →
  unchanged `.415-m8` behavior). No superuser path exists in this
  users-only route (item 4, tested).
- `pb_hooks/cf_m10_photos.pb.js` — the three transactional photo
  routes. Upload hashes the RECEIVED bytes before any replay decision
  (item 6): runtime basis proven and recorded in
  `artifacts/evidence-server/probe-bytes.json` — `readerToString` is
  byte-faithful on 0.39.8 (server sha256 == Node sha256 of the raw
  bytes for an all-byte-values buffer, a JPEG-magic+multibyte+invalid
  mix, and 2 MB random), while string length is NOT byte count, so
  byte length comes from `file.size` (server-derived). H4 malformed
  matrix implemented (no file / two files / oversize 413 / length
  mismatch / bad kind / unreadable) — each rolls back with no record,
  no managed file, no ledger row (tested). Ownership resolves inside
  the transaction BEFORE lease-state exposure; foreign and nonexistent
  ids return byte-identical 404 bodies (item 7, tested by string
  comparison of full responses).
- `pb_hooks/cf_m10_platform.pb.js` — superuser-middleware platform
  route: field-scope validation, requestHash = target user + canonical
  field patch, subsystem-wide key claim (same key + different target
  OR different patch → 409 — item 5, tested), read-modify-write of the
  transaction-current snapshot, replay returns the stored outcome
  without re-incrementing coreRev (tested), user tokens rejected
  (item 11: superuser-positive + user-negative on THIS route;
  superuser-negative on the users-only commit route).
- `pb_hooks/cf_m10_enforce.pb.js` — raw photos-collection writes
  reject under enforcement (user), pass when OFF.
- `MANIFEST.txt` — sha256 of every file; `cf_cas_shared.js` is
  byte-identical to deployed (7bc856cf…); `ROLLBACK.md` — the
  sequenced rollback + the down gate stated honestly (mechanical
  marker/constant vs procedural no-M10-client precondition), plus two
  test-proven operator cautions: `pocketbase serve` AUTO-APPLIES
  pending JS migrations at boot, and `migrate` exits 0 on failed
  reverts (output is the only truth). T9 works around both and they
  are recorded for the eventual NAS runbook.

## Evidence (`artifacts/evidence-server/`, raw JSON, mode-tagged)

- `off-suite.json` — 70/70 on a fresh disposable instance, enforcement
  OFF: full lease op set incl. TTL expiry (SQL-aged via disposable
  probe), closed-rule rejections, `.415`-shape fence-less commit passes,
  fenced commit records writerFence + server-derived holderDeviceHash,
  op NULL on CAS rows, photo happy/replay/reuse/malformed/cross-account,
  platform suite, races (60-iteration ‖ classification, zero anomalies;
  committed-state + ledger oracle — item 10), serialization barrier
  (steal blocked >400ms by an open write transaction), verified-absence
  cleanup for every disposable user.
- `enforce-suite.json` — 87/87 on a second disposable instance with the
  ON override: everything above PLUS fence-less commit → 409 fenceStale;
  stale fence rejected before mutation (rev proven unchanged); stale
  photo upload → fenceStale; raw photo create rejected; the §6 mailbox
  matrix (health passes, coachreq passes, content/mixed/two-family/
  null-content/unknown/revision rejected, raw create rejected,
  superuser bypass passes, fenceless-rev not bumped); both-orders race
  classification with fence evidence per landed commit.
- `migration-suite.json` — 16/16 lifecycle: populated 4-row ledger
  (CAS fenced + legacy fence-less + platform + photo rows) → up
  columns present → refused down (no marker) leaves schema AND rows
  identical → confirmed down removes exactly the seven columns +
  writer_lease, preserves all rows/fields/idx_cf_commit_key → re-up
  passes the sentinel on the populated ledger, M10 columns empty.
- `probe-bytes.json` — the byte-fidelity probe (item 6 basis).

## Passed vs deferred

PASSED (local disposable): everything listed above.
DEFERRED to client rounds: core client durability protocol (dirty/base/
ack-dx journals, bootstrap, state model), photo queue ordering +
displaced review UI, m10Gate surface, takeover UX — all client-side by
design. DEFERRED to NAS rounds (after Owner authorization): NAS
deployment of this exact package, NAS disposable probes, coach-job
migration to the platform route, enforcement-day gate. Item 9
contingency not needed: $os.getenv and $os.readFile both work in the
migration runtime (refusal tested end-to-end).

Requested ruling: whether this server package + evidence satisfy §9
step 3, i.e. whether I may proceed to the CLIENT implementation
(LOCAL, delimited blocks, M8 discipline) while the server package
awaits the Owner's enforcement-OFF NAS authorization. Nothing else is
requested.
