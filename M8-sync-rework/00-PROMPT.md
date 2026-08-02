# M8 sync rework — round 8: design v7, the idempotency binding

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

## Since round 7

Design commit `9e849f4`; DESIGN.md sha256 `a6f592c9…c6a5abd8`; focused
diff at `artifacts/DIFF-993cf73-to-9e849f4.txt` (91 lines);
`artifacts/SHOW-STAT-9e849f4.txt`. Verify against the tree.

F2–F7 as landed (§1 transition 1, §8):
- `requestId` IS the CAS route's `idempotencyKey`: unique per logical
  mutation, persisted before dispatch, length-constrained, never reused
  with different bytes; request identity (pushedCanon + expectedRev)
  persisted so replays are provably identical; a newer local generation
  is a subsequent mutation and never touches the unresolved request.
- Ambiguous outcomes replay-first within ledger retention (same key,
  rev, payload), with your four replay outcomes verbatim — including the
  same-key/different-identity hard stop with journal preserved.
- Journals older than the 30-day ledger skip replay and go straight to
  fetch-and-compare; no exact proof → conflict.
- The six F7 replay tests are in the evidence plan.

## This round

Rule on design v7 as the implementation contract.
