# M8 sync rework — round 15: the boot-gate fix and the two missing proofs

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

## Your round-14 items, as landed (verify in the tree; hashes in
## artifacts/evidence/IDENTITIES.txt)

3/4. **The boot gate is on the union.** Journal resolution at boot runs
   only when NEITHER block class stands, with exactly one explicit
   exception: a verified terminal `phase:"done"` record, whose removal
   is cleanup-only and makes no server traffic. The exception is coded
   as its own branch before the union gate, not as general resolution
   under a soft block.
5. **Case Q**: seeded with an unproven dirty generation AND a
   nonterminal ack journal, the first boot is fully fail-closed —
   blocked, every seeded record byte-identical, and a forced training
   pull+push makes zero requests and zero commits. The explicit
   verified re-save then releases only the soft block, and journal
   resolution resumes safely (the journal replays, acks, and clears).
6. **Case R**: a PERSISTED `done` record whose removal fails survives
   boot with zero training-originated requests; once removal succeeds,
   boot performs only the verified cleanup — no commits, state clean.
8. **The records agree.** `MAESTRO_PROGRAM_CONTEXT.md`'s M8 row now
   reads implemented-in-working-copy, under evidence review, all
   gates intact (commit `4701039` in compound-app; the tree and the
   project log already said so).

## Evidence

107 cases, 8 suites, all green on the candidate (hash in IDENTITIES;
771-line diff over published `.414`); the recovery artifact is rebuilt
from THIS candidate, 25/25; the authentic upgrade baseline still fails
1/4. Raw outputs in artifacts/evidence/. Desktop Chromium, mocked
endpoints: real engine, modeled server.

## This round

Rule on the implementation. Per your round-14 close, these were the
last named blockers before the disposable-PocketBase gate.
