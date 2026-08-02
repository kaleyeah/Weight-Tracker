# M8 sync rework — round 18: the quarantine-success blocking model

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

## Your round-17 correction, as landed (verify in the tree; hashes in
## artifacts/evidence/IDENTITIES.txt)

4/6. An invalid transition journal now produces a persistent hard block
   on BOTH quarantine outcomes: success preserves the bytes (kind-tagged
   into the corrupt namespace) and removes the active key, failure keeps
   the original in place — and in either case push, pull, boot, and the
   defensive resolver STOP. `m8QuarantineInvalidJournal` always returns
   false; no call site converts the journal to absence and continues.
5. The block is unresolved transition ambiguity, not a storage failure:
   it re-derives on every boot from the presence of any
   `wl_training_corrupt__<uid>.journal.*` key, so no reload sheds it and
   no ordinary save clears it. Its release is an explicit reviewed
   recovery path (outside automatic sync), exactly as ruled.
7. Every S case now asserts: quarantined bytes byte-identical to the
   seeded journal; the active key absent only because quarantine
   succeeded; the blocked state present; ZERO record fetches and ZERO
   CAS commits on a forced pull+push; and local, base, dirty, and
   conflict bytes unchanged.
8. S2's failure-path assertions kept (original retained, blocked, zero
   requests), and the new reload case proves the block re-derives from
   the corrupt namespace with zero requests after a full page reload.

## Evidence

123 cases, 8 suites, all green on the candidate (hash in IDENTITIES);
the recovery artifact is rebuilt from THIS candidate, 25/25; the
authentic upgrade baseline still fails 1/4. Raw outputs in
artifacts/evidence/. Desktop Chromium, mocked endpoints: real engine,
modeled server.

## This round

Rule on the implementation and, if it passes, confirm the
disposable-PocketBase gate as next.
