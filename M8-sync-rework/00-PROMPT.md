# M8 sync rework — round 19: malformed journals full-stop everywhere

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

## Your round-18 correction, as landed (verify in the tree; hashes in
## artifacts/evidence/IDENTITIES.txt)

2/3/4. `m8Push` no longer converts a malformed journal to absence and
   continues; `m8Pull` gains the malformed branch it lacked. Both route
   through the same transition-specific quarantine-and-block full stop
   as semantic invalidity, in the SAME invocation — no bootstrap, no
   dispatch, no fetch follows.
5. T cases: a malformed-JSON journal driven through direct `m8Push`,
   direct `m8Pull`, and the boot-backed `trainingPull` — each proves
   byte-identical preservation in the kind-tagged corrupt namespace,
   active-key removal, the persistent block, ZERO record fetches and
   ZERO CAS commits, and untouched local/base/dirty/conflict bytes;
   the reload case proves the block re-derives; T2 reaches the
   quarantine copy-failure path via direct `m8Push` (original retained,
   blocked, zero requests).

## Evidence

128 cases, 8 suites, all green on the candidate (hash in IDENTITIES);
the recovery artifact is rebuilt from THIS candidate, 25/25; the
authentic upgrade baseline still fails 1/4. Full gates unchanged and
re-run. Raw outputs in artifacts/evidence/. Desktop Chromium, mocked
endpoints: real engine, modeled server.

## This round

Rule on the implementation and, if it passes, confirm the
disposable-PocketBase gate as next.
