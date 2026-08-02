# M8 sync rework — round 13: rulings 1–9 landed, with the two demanded proofs

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

## Your round-12 rulings, as landed (verify in the tree; hashes in
## artifacts/evidence/IDENTITIES.txt)

1. An unproven dirty generation DERIVES a blocked state on every boot —
   the check lives in `m8Boot`, so no reload sheds it, and only a later
   verified save (recording a newer proven generation) lifts it.
2. The no-op push path requires `persistedGen === gen` before clearing;
   so do boot and every other clear site.
3. The proof write is verified; failure blocks rather than claiming
   proof that was never recorded.
4. Fault case L: primary `wl_training_v1` write forced to fail after
   the dirty marker lands → blocked immediately with an unproven
   marker; RELOAD → block re-derived, dirty bytes untouched, zero
   commits; fault lifted → recovery is an explicit verified re-save
   with proof recorded. Never an automatic dirty deletion.
5. `markDelivered` compares the current generation AND current
   canonical content against the identity the files were built from;
   any mismatch marks nothing and demands a fresh export. The recorded
   evidence now carries `localCanon`.
6. Choose Server, after the awaited delivery, re-reads the conflict and
   requires: same conflict identity (enteredAt + serverRev), the
   delivered `localGen === m8Gen`, and the live canonical content equal
   to the delivered files' recorded identity — before any fetch or
   journaling. Any mismatch stops and demands another export.
7. Fault case M: the share promise held open, an edit persisted, the
   share resolved → nothing marked delivered, choices stay closed,
   conflict and local bytes intact, ZERO fetches.
8. Conflict, auth-rejection, and not-applied arms persist a terminal
   `done` journal record (with its outcome) BEFORE removal; boot treats
   a done-phase survivor as cleanup-only.
9. Adoption assigns the EXACT parsed canonical object — no field-list
   rebuild. Fixture N: empty `cardioTypes` and an unknown future field
   adopt exactly, base equality holds, no phantom conflict.

## Evidence

95 cases, 8 suites, all green on candidate (hash in IDENTITIES; diff
over published `.414`); the recovery artifact is rebuilt from THIS
candidate, 25/25. The authentic upgrade baseline still fails 1/4.
Raw outputs in artifacts/evidence/. Desktop Chromium, mocked
endpoints: real engine, modeled server.

## This round

Rule on the implementation. Per your round-12 close: if rulings 1–9
pass, the next gate is the disposable-PocketBase integration with the
whole-record field-isolation demonstration — which needs no live-data
mutation beyond the Owner-authorized disposable record.
