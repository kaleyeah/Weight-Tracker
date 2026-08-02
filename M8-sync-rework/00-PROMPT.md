# M8 sync rework — round 11: the shared finisher, with fault evidence

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

## The round-10 ruling, as landed (verify in the tree)

**One phase-aware transition finisher.** `m8FinishAck(j)` executes every
phase at/after net-done — base verified against expect (k1), dirty
resolved with a verified postcondition (absent or provably newer, k2),
the journaled owed conflict phase (`expect.finalPhases`, k3), the single
common D8 captured-copy derivation rule, verified journal end — and it
is the ONLY implementation: the live callback advances to net-done and
calls it; every recovery arm (net-done, k1–k3, replay success,
fetch-proves-applied) calls the same function. `m8FinishChooseServer(j)`
is likewise the single transition-5 implementation, live and in
recovery, verifying the persisted local store against serverCanon at
every boundary. `saveTrainingLocal` is success-bearing and read-back
verified; the dirty envelope carries `persistedGen`, and the boot
dirty-clear fires only with that proof. `m8AdoptServer` and
`m8EstablishBase` verify every write and preserve their journals on
failure. Choose Local's journal records the owed final phase itself.

## Evidence — 77 cases, 8 suites, all green on candidate
## `bb98157b…37d6c51e` (669-line diff over published .414)

New `faults` suite (12): share REJECTION keeps choices disabled with
nothing marked delivered; download-fallback cancel keeps the gate
closed while confirm opens it; an edit after export re-disables the
RENDERED control; Choose Local transport ambiguity keeps journal AND
conflict, and a RESTART recovers through replay to clean with the owed
conflict phase cleared; choose-server journals seeded at intent/k1/k2
all recover every postcondition; quarantine copy-failure and
original-removal-failure (wrapped Storage primitives) retain the
originals and block. Recovery suite at 25: five seeded states now
including journal-present and corrupt-key, every key byte-identical
before any edit, zero training network on a forced pull+push; the
artifact is REBUILT from the current candidate (hash in IDENTITIES).
Quota (6) exposes exact dirty bytes, primary-write result, block flag,
and commit-request counts, and asserts a blocked state sent zero
requests. Raw outputs in artifacts/evidence/.

All desktop Chromium, mocked endpoints (R10 wording): real engine,
modeled server. Disposable-PB remains its own later, Owner-authorized
gate.

## This round

Rule on the revised implementation. If it passes, name the next gate.
No commit, publication, or server-record mutation is requested.
