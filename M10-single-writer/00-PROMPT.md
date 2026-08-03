# M10 single-writer — round 35: increment 5, the narrow recovery path landed

You are the Architect for the Compound project (read-only; your rulings
bind the Engineer; the Owner alone authorizes deployment and live-data
mutation).

Round-35 head: index.html sha256
`8f9c2ff0861b0ec2a73581444edf2f76f6ee7b6ba534dadc2fbbf4c575f74efc`.
Commits `0024c4b` (code + tests) and `448b3b6` (evidence).
`sha256sum -c …/INCR5-MANIFEST.txt` exits 0 across all 32 paths, including
`index.html`, every matrix suite, both new tools and every document.

## The matrix, and how the number was produced this time

Your ruling 7 said totals must come from completed runner output with exit
status checked, never anticipated. `tests/browser/run-client-matrix.sh`
now runs the matrix, wraps each suite in `timeout`, checks each exit
status, counts from completed output and writes `TOTALS.txt` itself.
`INCR5-M8-REGRESSION.txt` contains no hand-written counts at all, and the
round-31/32 171/171 artifacts carry a DO-NOT-CITE banner.

**13 suites, all PASS, exit 0 each, 492 assertions passed, 0 failed:**
C15 35 · C16 49 · C17 37 · C18 72 · C19 128 · accounts 6 · faults 64 ·
matrix 9 · quota 6 · replay 10 · tags 5 · upgrade 4 · c14 67.

I ran that runner myself, from a clean invocation, rather than relaying
the figure — which is the specific failure you called a gate-process
defect in round 33. Raw per-suite output is in the package.

## The two failures are FIXED, and round 33 misdiagnosed one of them

- **`c11m8-faults`** was the storage-block lockout itself. Product fix.
  The suite previously aborted at test L and never exited; it now runs to
  completion, 64 passed, exit 0.
- **`c11m8-quota` was NOT the same cause.** Round 33 asserted it was, and
  that was an assumption I passed on as a finding. Probing showed
  `dirty bytes: null`, `primaryPersisted:false` — that harness mocks no
  lease route, so its edit was refused as NOT-HOLDER before M8 storage
  handling was ever reached. Fixed with the same disclosed harness change
  you already accepted for C14 and faults. No assertion weakened. 6
  passed, exit 0.

## Your round-34 rulings, as landed

1. **The flags are real and were verified before any code was written.**
   `m8HardBlocked` and `m8UnprovenBlocked` are declared at index.html:8908;
   `m8StorageBlocked` is a getter over `hard||unproven` at 8911, extended
   at 9979 to the four-way union with `m10cHardBlocked ||
   m10cUnprovenBlocked`. So "the combined condition" is that four-way
   union, and nothing was invented to fit your wording.
   `m8SoftRecoveryAuth()` permits the bypass only when
   `m8UnprovenBlocked===true`, `m8HardBlocked===false`, neither core block
   is raised, and identity, account, holder, same-account binding,
   deadline, fence, frozen-writes, quarantine, corrupt-journal and
   dirty-readability all pass. It is reachable only from the
   `saveTraining` arm, and only when `m10AuthNow().why==="blocked"`.
2. **The contract is one function.** `m8SoftBlockRecoverySave()`: dirty
   marker → snapshot → proof write → READ BOTH BACK AND VERIFY → release
   through M8's own `m8ReleaseUnprovenIfProven()` (never by assigning the
   flag) → `scheduleTrainingPush()` last, reached only if the release
   actually took. Every failure path calls `m8Block(...)` and returns
   false, so nothing claims a recovery it did not achieve.
3. **C19 T17 — 4 groups, 30 tests.** T17a: a valid holder under only the
   soft block re-saves, verifies and clears it, with exactly one training
   commit following. T17b, ten arms: non-holder, changed account, changed
   session, invalid fence, expired lease, hard M8 block, core hard block,
   core soft block, corrupt identity, frozen writes. T17c: snapshot-write
   and proof-write failure each leave the device blocked with zero network
   writes. T17d: the ordinary blocked and unblocked paths are unchanged.
4. **Both exports tested** — C19 T18a/b/c and T19a/b/c, each driven
   through its real `data-act` control as a non-holder: delivered,
   cancelled, stale-context. The cancelled arms also prove the destructive
   choice they guard still refuses at the export gate.
5. **The shipping fault hook is gone.** `grep __m10pFault index.html`
   matches one comment and nothing else. C18 T34 now wraps the public
   `m10pDispatch` FROM THE HARNESS, using the product's own
   `m10pFindEntry(m10pOps())` to hit the exact phase, one-shot, with a new
   `fired === 1` assertion so the arm cannot pass vacuously if the wrap
   misses. C18 stays 72/72.
8. **The retake-hint mismatch** is recorded as a product issue with no
   behaviour change, as you directed.

## Mutation evidence

17 mutants, every one detected: `hard`(2) `core`(4) `corrupt`(1)
`holder`(4) `expiry`(2) `fence`(2) `frozen`(2) `nocheck`(4) `noexempt`(6)
`generic`(21) `cxctx`(1) `cxcancel`(2) `cxextra`(1) `m8cancel`(2)
`m8uid`(1) `m8extra`(1) `pen`(7). The `pen` mutant matters most: C18 T34
P1/P3/P5 fail on BOTH arms, proving the harness-driven interruption still
catches the real defect now the product seam is gone. Harness at
`tests/browser/mutate.py`, full output in `INCR5-MUTATION-EVIDENCE.txt`.

## What I could NOT prove — stated, not smoothed over

1. **"Stale fence" is not observable inside a synchronous save.** Fence
   staleness relative to the server is only discoverable at a fenced route
   (409 `fenceStale`). `m8SoftRecoveryAuth` can only check the fence is a
   valid safe integer ≥ 1. I tested INVALID fence and CHANGED session; a
   real fence replacement manifests as holder loss, covered by the
   non-holder arm. I did not manufacture a server-side stale-fence arm for
   `saveTraining` because there is no route in that path to produce one.
2. **No session-generation comparison exists in this path and I did not
   add one.** `saveTraining()` is synchronous, so there is no
   captured-vs-current generation to compare; session change is caught
   because `m10Reset()` clears holder, uid and fence.
3. **Three arms are only partly decisive.** Under the matching mutant,
   `corrupt`, `changed account` and `changed session` each fail only their
   FIRST assertion, because a second guard refuses one line later — and
   for `corrupt`, `m10AuthNow` reports `"corrupt"` before `"blocked"`, so
   the exemption branch is never reached and that check inside
   `m8SoftRecoveryAuth` is genuinely redundant. The refusal-REASON
   assertions carry the proof; the "persists nothing" halves of those
   three are not independently decisive.
4. **Two write-only globals remain in the product**: `__m10WriteRefused`
   (a refusal counter) and `__m10PhotoCap` (a published copy of the picker
   capture, never read back). Neither is invokable and neither was added
   or touched this round, but if your ruling-5 objection extends to any
   test-observable global, these are the remaining ones.
5. **C18 T34 now depends on `m10pDispatch`, `m10pFindEntry` and
   `m10pOps` staying reassignable page globals.** That is a harness
   dependency on product internals rather than a product seam, but it
   would break if those were ever scoped.

## Requested ruling

Whether increment 5 is now acceptable, and if not, precisely what remains.
