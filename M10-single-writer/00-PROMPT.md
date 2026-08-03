# M10 single-writer — round 18: increment 2 revised per round 17

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

The revised increment 2 only, per your closing list. Head `f78d2e0`
(index.html sha prefix 682714e7…); exact narrow diff from `5359060`:
`client-increments/INCR2-DIFF-FROM-5359060.patch` (389 lines);
cumulative `INCR2-DIFF.patch` = 3e7a0d0 → f78d2e0 (529 lines).
`INCR2-README.md` opens with the ruling-by-ruling landing (N1–N9).

The essentials:
- **Context threading (rulings 1–4)**: `m10cCtx()` = {uid, session
  generation} captured at the start of push, recovery, bootstrap,
  pull, and adoption; EVERY asynchronous continuation verifies both
  or touches nothing. Journal helpers (write/advance/terminalize/
  complete/quarantine and their reads) operate on the journal's
  validated owner or the captured uid — `m8Uid()` is never consulted
  after dispatch. Focused delayed-response tests: switch mid-push
  (A's intent journal byte-identical, ZERO `wl_core_*__userB` keys);
  A→B→A (original-session response discarded — the new same-UID
  session has a new generation); switch during the bootstrap GET and
  the clean-pull GET (zero adoption, zero B writes).
- **Pre-adoption revalidation (rulings 5–7)**: pull/bootstrap capture
  the local bytes before the GET and re-verify session, block state,
  dirty, and byte-identical local AFTER it; the adoption intent phase
  re-proves those immediately before the `wl_v1` replacement and
  annuls itself (journal removed, nothing written) if anything
  changed. The edit-during-pull race is a dedicated test: delayed
  GET, mid-flight verified edit → zero adoption, dirty + bytes +
  base preserved.
- **Strict canon (ruling 8)**: the ORIGINAL graph is validated before
  projection — `undefined` only as object-property omission; arrays
  reject undefined/holes; NaN, ±Infinity, functions, symbols, BigInt,
  cycles, and non-plain objects (Date tested) fail closed. Positive
  `auto: undefined` case + a negative case per lossy category + a
  push-path case (hard block, dirty preserved, zero commits).
- **Typed success (ruling 9)**: `newRev` must be a safe nonnegative
  integer EQUAL to expectedRev+1; fractional / missing / wrong-
  increment successes each block with the journal at intent, dirty
  preserved, and the base unmoved (three tests).

Evidence, all fresh at `f78d2e0`: `INCR2-C16-OUTPUT.txt` 39/39 (the
29 accepted paths + the 10 ruling cases above);
`INCR2-C15-RERUN.txt` 35/35; `INCR2-M8-REGRESSION.txt` 171/171
(+artifact-scope recovery 25/25).

Passed: rulings 1–9, locally. Deferred: unchanged (review flows → 3,
photo queue → 4, gate surface → 5; production actions behind Owner
gates).

Requested ruling: acceptance of increment 2 and authorization for
increment 3.
