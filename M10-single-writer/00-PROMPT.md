# M10 single-writer — round 22: increment 3, round-21 rulings landed

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

The narrow revision only. Head `b92d418` (index.html sha prefix
4e6b8fb9…); exact diff from `65e1d12`:
`client-increments/INCR3-DIFF-FROM-65e1d12.patch` (94 lines);
regenerated cumulative `INCR3-DIFF.patch` = 3056e8d → b92d418
(544 lines). README carries the ruling-by-ruling record (Q1–Q5).

1. **Post-boundary pen revalidation (ruling 3)** — both actions
   capture the entry fence and re-require the same account-bound,
   unexpired holder state AND the same fence after the fresh fetch
   (Take-server additionally after its confirmation pause),
   immediately before creating the resolution journal. On change:
   no journal, no dispatch, no replacement; envelope and export
   state retained. Tested for BOTH actions with a delayed fetch and
   a mid-fetch lease loss (T16 ×2: zero commits, envelope and local
   bytes byte-identical).
2. **Typed fenceStale (ruling 4)** — displacement requires a safe
   integer fence; a malformed fenceStale leaves the push-mine
   journal at intent as a recoverable request with the envelope
   untouched (tested).
3. **Validated conflict payloads (ruling 5)** — envelope replacement
   requires a safe serverRev AND a payload passing strict core
   canonicalization; missing-payload and invalid-payload responses
   leave journal + preserved server copy untouched (tested ×2).
4. **Verified auth cleanup (ruling 6)** — the 401/403 arm verifies
   the journal removal and hard-blocks on failure
   (removal-failure injection test).
5. **Validated fresh revisions (ruling 7)** — `coreRev` from a fresh
   fetch must be a safe nonnegative integer, never defaulted; a
   fractional revision refuses the action with the envelope
   untouched (tested).

Evidence, all fresh at `b92d418`: `INCR3-C17-OUTPUT.txt` 37/37;
`INCR3-C16-RERUN.txt` 49/49; `INCR3-C15-RERUN.txt` 35/35;
`INCR3-M8-REGRESSION.txt` 171/171 (+artifact-scope recovery 25/25).

Rulings 1–2 and 8–9 of round 21 (validated entry/G8, sequencing,
export policy, package identity) were accepted and are untouched
except where the five corrections apply.

Requested ruling: acceptance of increment 3 and authorization for
increment 4 (the photo operation queue + displaced-photo review on
the reviewed transactional photo routes).
