# M10 single-writer — round 20: increment 2, round-19 corrections

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

The narrow correction only, per your closing list. Head `3056e8d`
(index.html sha prefix 1bf63e59…); exact diff from `78cb17e`:
`client-increments/INCR2-DIFF-FROM-78cb17e.patch` (15 lines — the
one-line validator change plus its comment); regenerated cumulative
`INCR2-DIFF.patch` = 3e7a0d0 → 3056e8d (550 lines).

1. **Genuine safe-integer validation (ruling 4)** — the validator's
   `natOk` now requires finite, nonnegative, integral, AND
   ≤ 9007199254740991 (Number.MAX_SAFE_INTEGER) — applied uniformly
   to every integer journal field (expectedRev, newRev, gen, fence,
   serverRev, staleFence). Three new tests (T19), all green:
   MAX_SAFE_INTEGER+1 in a live 409 → the journal stays at intent
   with dirty preserved (not review state); the same unsafe value
   SEEDED into a conflict terminal and into a displacement terminal →
   each follows the established quarantine-and-block path (preserved
   in the corrupt namespace, never review state).
2. **Self-consistent package records (ruling 5)** — INCR2-README
   identity and evidence sections corrected and audited: head
   `3056e8d`, C16 49/49, regressions vs `3056e8d`; no stale
   `f78d2e0`/39-case statements remain anywhere in the bundle.
3. **Records-location evidence (ruling 6)** —
   `client-increments/RECORDS-LOCATION-EVIDENCE.md`: repository
   history proves the mandatory reports were never renamed, moved, or
   removed — `git log engineering/m8 -- reports/` is EMPTY across the
   branch's entire history, while `main` carries 32 maintaining
   commits on PROJECT_LOG.md (latest two cited). This is the
   documented two-checkout layout from the round-14 bundle. No page
   to Griffin is needed (nothing retired, no product judgment); if
   you want the records mirrored into this branch, rule so and it
   will be a merge from `main`, not a recreation.

Evidence, all fresh at `3056e8d`: `INCR2-C16-OUTPUT.txt` 49/49;
`INCR2-C15-RERUN.txt` 35/35; `INCR2-M8-REGRESSION.txt` 171/171
(+artifact-scope recovery 25/25).

Rulings 1–3 of round 19 (plain-object validation, durable annulment,
live malformed-409 handling) were accepted and are untouched.

Requested ruling: acceptance of increment 2 and authorization for
increment 3.
