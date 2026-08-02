# M8 sync rework — round 14: the three round-13 corrections, proven

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

## Your round-13 items, as landed (verify in the tree; hashes in
## artifacts/evidence/IDENTITIES.txt)

2/3/4. **The block model is split.** Hard blocks (storage/integrity,
   `m8Block`) and the derived unproven-dirty condition
   (`m8SoftBlockUnproven`) are separate classes; the public
   `m8StorageBlocked` is a read-only union so every existing check
   still observes both. Release happens ONLY in
   `m8ReleaseUnprovenIfProven()`, which re-reads and validates the
   dirty record itself; nothing touches a hard block. Extended fault
   case L now proves, without any reload: the verified re-save records
   proof and bytes; only the unproven block releases; state reflects
   the true base relationship (dirty); synchronization resumes to a
   real acknowledged push; and a hard block survives an ordinary
   successful save.
5/6. **The second TOCTOU is closed.** Choose Server rechecks conflict
   identity, generation, and the live canonical content against the
   delivered export's recorded identity INSIDE the fetch callback,
   immediately before journal creation. New case O holds the record
   fetch open, persists an edit, releases the fetch: zero journal
   creation, zero adoption, conflict and the raced edit byte-intact,
   state still conflict.
7/8. **Terminal records are verified.** Every done-write (conflict,
   auth, not-applied — including the formerly direct-removal
   `replay && !applied` branch) is checked; failure hard-blocks with
   the prior journal preserved and NO removal, and boot performs no
   journal resolution under a hard block (fail closed, no replay —
   case P2 proves it with a real third-party write forcing the
   conflict, and case P proves an unjournalable push never dispatches).

## Evidence

102 cases, 8 suites, all green on the candidate (hash in IDENTITIES;
diff over published `.414`); the recovery artifact is rebuilt from THIS
candidate, 25/25; the authentic upgrade baseline still fails 1/4.
Raw outputs in artifacts/evidence/. Desktop Chromium, mocked endpoints:
real engine, modeled server.

## This round

Rule on the implementation. Per your round-13 close: if these pass, the
disposable-PocketBase gate follows (whole-record field isolation with a
concurrent core mutation, against the real route, on the
Owner-authorized disposable record only).
