# M8 sync rework — round 12: R11 corrections, with authentic fault proof

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

## Your round-11 items, as landed (verify in the tree; hashes in
## artifacts/evidence/IDENTITIES.txt)

1/2. The control-flow concern: the `if(!ended){}` empty-body-comment
   idiom is gone. Every finisher ends with an explicit
   `cleanupVerified ? true : "cleanup-pending"` — the normal-path
   status update and the newer-generation reschedule run in BOTH
   branches, inside the finisher. `m8EstablishBase` no longer discards
   its journal on base-write failure: it delegates to
   `m8FinishBootstrapBase(j)`, which preserves the journal on every
   failed write.
3. `m8JournalEnd()` is itself the verified terminal phase: it confirms
   the key is gone and returns the result; every call site either
   surfaces `cleanup-pending` or leaves the journal for boot's
   completed-transition recognition (proven by fault case H below).
4. `m8FinishChooseServer` has distinct verified phases for the dirty
   removal (k3) and the conflict removal (k4); the crash between them
   is representable and tested.
5. Malformed dirty during ack completion blocks with the journal AND
   the malformed bytes preserved (fault case I drives the finisher
   directly; boot's copy-first healing path is covered in accounts).
6. Generic adoption recovery is gone: `m8FinishAdopt(j)` is the single
   implementation for adopt/adopt-fresh, live and in recovery, verifying
   the persisted local store against serverCanon.
7. A superseded conflict is a single verified overwrite — no
   delete-then-write absent interval.
8. The choose-server phase tests are authentic first-boot tests: a
   VALID canonical journal seeded before page load against a consistent
   server world, first boot only, page errors asserted — at intent, k1,
   k2, AND the k3/k4 boundary.
9. `getItem` faults are injected (wrapped Storage primitive): a read
   failure blocks — never absence, quarantine, bootstrap, or network
   (zero commits asserted). Quarantine's own read failure also blocks.
10. The remaining fault evidence: journal-removal failure after a
   completed ack (transition completes unblocked, journal survives,
   and after the fault lifts boot retries ONLY cleanup); base-write
   failure during adoption (blocked, journal preserved); the
   newer-generation ack rescheduling to a PROVEN second ack (rev 2,
   clean). Fault case H also exposed and fixed a real defect: a
   cleanup-pending journal plus a push retry produced synchronous
   infinite recursion — journal re-entry is now guarded.

## Evidence

88 cases, 8 suites, all green on candidate `518eeec4…8788f4e1`
(701-line diff over published `.414`); the recovery artifact is rebuilt
from THIS candidate (`a453eddf…abc1f66a`), 25/25 from five seeded
states. The authentic upgrade baseline still fails 1/4 (session
destroyed) against the M8-free build. Raw outputs in
artifacts/evidence/. All desktop Chromium, mocked endpoints: real
engine, modeled server.

## This round

Rule on the implementation. If it passes, name the next gate
(disposable-PocketBase). No commit, publication, or server-record
mutation is requested.
