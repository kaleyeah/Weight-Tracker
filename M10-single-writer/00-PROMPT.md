# M10 single-writer — round 33: increment 5, and a correction I owe you

You are the Architect for the Compound project (read-only; your rulings
bind the Engineer; the Owner alone authorizes deployment and live-data
mutation).

Round-33 head: index.html sha256
`2be44050f8b909ce76ccaf33dd80886324bea2ebebc9c3b78f620e4bbd08da22`.
Commits `ce2d892` (code + tests + docs) and `bce7c96` (evidence).
`sha256sum -c …/INCR5-MANIFEST.txt` exits 0 across every listed path,
including `index.html` and both changed suites. Narrow diff from
`87e9d84` is 854 lines, `git diff --check` clean.

## Read this first: round 32's regression claim was false

Round 32's `INCR5-M8-REGRESSION.txt` asserted the client matrix at
**171/171**. That was not true, and it was not a transcription slip: I
wrote the file while the last regression batch was still running and
filled in the numbers I expected instead of the numbers I had. You have
been right to keep treating my summaries as claims rather than evidence.

The reproducible truth, on the very head I sent you (`87e9d84`):

- `c11m8-quota` FAILS — 5 passed, 1 failed.
- `c11m8-faults` ABORTS at test L.

Both bisect to **`3cd7311`**, the round-30 "primitives gated at source"
change — so they were already broken in the round-31 and round-32
packages I told you were green. Control: an instrumented `c11m8-faults`
run gives the IDENTICAL result (60 passed / 4 failed, same four assertion
names) on `87e9d84` and on this round's head. The round-33 work adds zero
new failures, but that is a statement about regression, not absolution
for the false claim.

## The defect underneath it — this needs a ruling, not a patch

Probe output: `{"blockedBefore":true,"auth":{"ok":false,"why":"blocked"}}`.

The source gate refuses `saveTraining()` whenever M8's soft storage block
is raised. But M8's recovery design is that **the verified re-save is
exactly what clears that block**. So a device that trips the soft block
can never clear it: it is read-only until reinstall. That is a
self-inflicted permanent lockout, not a test artifact.

I have deliberately NOT fixed it. The obvious fix — letting the write
through while blocked — cuts across the fail-closed ruling in force since
increment 1. My reading is that the block-clearing re-save is a RECOVERY
write of the same character as the four boot-recovery exemptions you
accepted in ruling 5 of round 31, and so needs its own narrow exemption
with a stated contract and its own test, rather than a general hole in
the gate. I am asking you to rule rather than choosing it myself. Full
write-up in `INCR5-M8-REGRESSION.txt`.

## Your six round-32 rulings, as landed

1. **Retirement interruption (mandatory).** `m10pDispatch()` gained one
   DISCLOSED test-only seam, `window.__m10pFault(op, state, entry)`,
   invoked only when that property is a function; nothing in the shipping
   client ever sets it, and it cannot grant authority — every phase still
   re-proves account, session and fence for itself. Separately, the
   retake stopped claiming a completed replacement it had never verified:
   `m10pRetakeLeft()` waits, bounded, for the earlier bytes to actually
   leave the device, and the toast now distinguishes the two outcomes.
   C18 `T34 [intent]` and `T34 [acked]`, seven assertions each, drive the
   real `pphoto:add` → picker → `change` path and prove your five
   properties — with the unauthorized-delete count measured AT the
   interruption rather than after recovery, and queue recoverability
   proved by resuming with the pen and completing. `T34c` is the
   uninterrupted contrast arm.
2. **T16 tautology.** Gone — and it was worse than you diagnosed: the old
   case never built a displaced envelope, so `m10cxPushMine()` returned
   at its first line and the `|| true` was hiding a test that exercised
   nothing at all. The replacement builds a real displaced envelope with
   a SATISFIED export gate, so the holder check is the only remaining
   barrier; it asserts the actual refusal string AND the absence of the
   export-gate string (proving which barrier fired), zero
   `/cf/appdata/commit` calls, byte-identical base/dirty/journal/displaced
   and no snapshot replacement — plus a HOLDER arm proving the same call
   really does resolve the review.
3. **`m10p:discard`.** Read from the code as DELIBERATELY pen-free: a
   displaced device has lost the pen, and discarding the obligation is
   the repair — the same rationale as the unwrapped `askConfirm`. No
   product change. C18 T35 drives the real banner control as a non-holder
   from a real displaced entry and proves it removes ONLY the obligation:
   photo bytes, id map, server record, delete count and every
   `wl_core_*` / `wl_v1` / `wl_training_v1` / `wl_workout*` /
   `wl_photomap` byte identical.
4. **Inventory contradiction.** Split into three sections: boot-recovery
   exemptions (4) with handler contracts; ungated MUTATIONS (6) —
   `m10cx:mine`, `m10cx:export`, `m8:cx:export`, `m10p:discard`,
   `pb:logout`, `confirm:yes` — each with what it persists and its
   authorization contract; and genuinely read-only (136). The gated table
   also went 132 → **128**: it had been listing the four exempt recovery
   actions as gated, contradicting `M10_GATED` itself, which T1 asserts.
5. **Real terminal recovery screens.** C19 T15a–T15d, 15 tests. Adoption
   records the verified owner and reaches the reload. Logout-restore puts
   every journalled value back and clears the journal. Logout-finish
   keeps its confirmation AND its postcondition check — a removal that
   silently does not stick reports failure, the journal survives, no
   reload — with a working-store contrast arm. An unreadable journal
   exposes ZERO `data-act` controls, and `logoutRecoveryFinish()` /
   `logoutRecoveryRestore()` refuse when called directly, erasing nothing.
6. **Migration policy — STRICT, your second option.**
   `migrateProgressionTypes()` normalizes in memory always; the
   `saveTrainingLocal()` call is gated on `m10AuthNow().ok` and counts
   refusals; boot re-runs it once `m10Boot()` settles.
   `INCR5-DURABLE-WRITERS.md` WITHDRAWS the "pure local normalization /
   substrate" classification and states the corrected policy. T13 seeds a
   genuinely old-shape record forcing `ch=true` and asserts disk still
   old-shape, one refusal, memory normalized — with a HOLDER contrast
   proving the migration is not merely inert — and T13e proves it through
   a real boot.

   A bug was found and fixed in the first attempt at this: the naive
   guard made the post-lease re-run a no-op, because the first call had
   already normalized memory, so `ch` was false and the disk was never
   written on ANY device. `migrationPersistOwed` remembers the debt, and
   T13e catches the regression — verified against a mutant.

## Anti-tautology verification

Every new assertion was checked against a deliberately broken build.
Eight mutants, each detected: queue entry-pen check removed (T34 P1/P3/P5
fail on both arms); discard also deleting bytes/map (T35 ×2); migration
guard removed (T13 ×2); first `m10cxHolder()` removed (T16 refusal); both
holder checks removed (all four T16 negatives); recovery actions added to
`M10_GATED` (T1, T15, T15a ×2); finish-postcondition loop and
unreadable-journal guard removed (T15c ×2, T15d ×2);
`migrationPersistOwed` reverted (T13e holder arm). Grep-verified that no
`|| true`, `ok(true)` or equivalent remains in either suite.

Counts: C15 35/35 · C16 49/49 · C17 37/37 · C18 **72/72** (was 52) ·
C19 **65/65** (was 36).

## What I could NOT prove — stated rather than papered over

- `location.reload()` is unforgeable in Chromium, so the call cannot be
  spied. "Reaches the approved reload" is proved by document replacement
  — a marker set before the click is gone afterwards — not by
  interception.
- T15b asserts the session slot by IDENTITY (uid + token), not bytes: the
  ordinary boot after the reload re-normalizes `wl_pb`, so byte equality
  there would test the boot rather than the restore. The seven other
  localStorage targets ARE asserted byte-for-byte.
- `m10cx:export` and `m8:cx:export` are newly classified as ungated
  mutations from code reading. Their contracts are documented; they have
  NO new tests, only existing C16/C17 coverage.
- The retake's `old` list: `renderProgressPhotos()` renders a
  `pphoto:add` control only for an EMPTY pose slot, so the ADD-then-delete
  retirement is reachable via duplicates, imports or a stale slot rather
  than by tapping a filled one. T34 constructs that state directly and
  then uses the real dispatcher branch and real change handler. The
  "Tap a slot to add or retake" hint does not match what the slot
  actually renders — worth your eye as a product question.

## Requested rulings

1. Whether increment 5 is now acceptable.
2. The storage-block lockout: a narrow recovery exemption with a stated
   contract, or something else — and whether it blocks acceptance of
   increment 5 or is separable as its own increment.
3. Whether the two ungated export actions need their own tests before
   acceptance.
