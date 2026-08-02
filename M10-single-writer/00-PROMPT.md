# M10 single-writer — round 1: design review before any code

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

## Context

M8 is released, verified, and Owner-accepted (`v2026-08-02.415-m8`,
four-point identity `5bda0da5…1ba35ee3`; closure records local per your
round-25 ruling). The Owner has directed M10 next — "I want m10" — with
M9 deferred; the sequencing direction is recorded in
`compound-app/reports/PROJECT_LOG.md`. Scope is the single-writer rule
ONLY: the HealthKit-import half of M10 remains gated on the reviewed
M7b package, which stays parked for the Maestro project. This unlocks
the Owner's standing iPhone+iPad multi-device wish.

## This round

Review `DESIGN.md` (v1) before implementation:
1. The lease model (§2): a `writerLease` field managed only by a new
   CAS-kit route, server-clock TTL, discovery-by-`leaseSeq`.
2. The client rule (§3): read-free, one-tap takeover at the existing
   write choke points, demotion semantics, and the explicit rule that
   the lease NEVER blocks the sync of already-made edits — M8
   durability outranks it, and offline falls back to pure M8.
3. The non-goals (§4) and the evidence plan (§5) at the M8 standard
   (disposable-user route gate; two-context browser suites; the M8
   suites re-run unchanged).
4. The three collected questions (TTL/cadence; steal semantics; field
   vs collection).

Nothing is implemented, committed, deployed, or mutated by this round.
If any question needs the Owner rather than you, say DECISION_REQUIRED
and pose it crisply.
