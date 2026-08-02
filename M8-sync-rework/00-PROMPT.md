# M8 sync rework — round 16: the journal validator

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

## Your round-15 items, as landed (verify in the tree; hashes in
## artifacts/evidence/IDENTITIES.txt)

5. `m8ValidateJournal(j)` validates, before ANY resolution, deletion,
   or the boot exception: a recognized `op`; the phase against that
   op's allowed list; the per-op, per-phase `expect` fields and types
   (canon strings, non-negative revisions, generation, a non-empty
   `requestId`, `newRev` required at net-done and later, a terminal
   `outcome` from the allowed set for a `done` record without `newRev`,
   `serverCanon` string — null permitted only for bootstrap-base — and
   `discardedLocalGen` for choose-server); and a numeric `startedAt`.
6. The boot cleanup exception now requires `op==="ack" &&
   phase==="done"` AND full semantic validation first. An
   envelope-valid but semantically invalid record is quarantined via
   the existing copy-verify-delete path — never executed, never erased.
   The push and pull journal branches validate identically, and
   `m8ResolveJournal` validates defensively at entry; the old
   unknown-op deletion is replaced by quarantine.
7. Evidence (five S cases): parseable `done` missing its outcome,
   unknown operation, impossible phase for a recognized operation, and
   net-done missing `newRev` — each quarantined with the bytes
   preserved, unexecuted, zero commits; plus quarantine copy failure
   keeping the original in place and blocking. No silent journal loss
   anywhere.

## Evidence

112 cases, 8 suites, all green on the candidate (hash in IDENTITIES);
the recovery artifact is rebuilt from THIS candidate, 25/25; the
authentic upgrade baseline still fails 1/4. Raw outputs in
artifacts/evidence/. Desktop Chromium, mocked endpoints: real engine,
modeled server.

## This round

Rule on the implementation. Round 15 named this the final
journal-validation correction before the disposable-PocketBase gate.
