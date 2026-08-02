# M8 sync rework — round 17: the corrected terminal rule and domain validation

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

## Your round-16 items, as landed (verify in the tree; hashes in
## artifacts/evidence/IDENTITIES.txt)

2/3. An `ack/done` record ALWAYS requires an outcome from the allowed
   set — `newRev` never substitutes; the accidental duplicate condition
   is gone. The demanded regression fixture (valid envelope, ordinary
   acknowledgement fields, `phase:"done"`, numeric `newRev`, no
   outcome) quarantines rather than entering cleanup.
4. Domain validation: `startedAt` finite non-negative; every revision,
   generation, `newRev`, and `discardedLocalGen` a finite non-negative
   INTEGER; `requestId` non-empty and within the route's 96-character
   limit. A negative-revision fixture proves rejection.
5. Canon strings must parse to the canonical value class (a plain
   object; null only where bootstrap-base allows it) before any journal
   drives adoption or comparison. A `"serverCanon":"garbage"` fixture
   quarantines at validation, not inside a finisher.
6/7. The S cases measure ALL training-originated requests via the
   forced-pull delta and report the actual count: quarantine itself
   makes zero requests, and the count is bounded to the single
   legitimate post-quarantine pull (≤1, reported per case). S2 proves
   the copy-failure path blocks with ZERO requests of any kind.

## Evidence

122 cases, 8 suites, all green on the candidate (hash in IDENTITIES);
the recovery artifact is rebuilt from THIS candidate, 25/25; the
authentic upgrade baseline still fails 1/4. Raw outputs in
artifacts/evidence/. Desktop Chromium, mocked endpoints: real engine,
modeled server.

## This round

Rule on the implementation and, if it passes, confirm the
disposable-PocketBase gate as next.
