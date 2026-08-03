# M10 client increment 5 — the gate surface

## Package identity
- **Base**: `249fd0e` — the accepted increment-4 head.
- **Previous code head**: `87e9d84` — index.html sha256
  `d2c8ed29cb9258c2c277350e0cb94eddcd9b8ad31c179fb2797c4589694b0a3b`
  (round-31 corrections).
- **Code head**: ROUND 34 — see `INCR5-MANIFEST.txt` for the current
  `index.html` sha256; narrow diff `INCR5-DIFF-FROM-ce2d892.patch`.
- **Suite counts at this head**: taken from `INCR5-MATRIX/TOTALS.txt`, which
  is generated mechanically by `tests/browser/run-client-matrix.sh` after
  checking every suite's exit status. No count in this package was typed by
  hand or anticipated.
- **Diffs**: `INCR5-DIFF.patch` = 249fd0e → 3cd7311 (`git diff --check`
  clean); `INCR5-DIFF-FROM-3cd7311.patch` = the round-31 corrections;
  `INCR5-DIFF-FROM-87e9d84.patch` = the round-33 corrections (product +
  suites); `INCR5-TESTS-DIFF.patch` = the C19 suite plus the disclosed
  harness edits.
- **Green**: the two failures round 33 reported as unfixed
  (`c11m8-faults` L/Q, `c11m8-quota` B6/13) are fixed in round 34 — see
  "The two pre-existing failures are FIXED" below. The full matrix, with exit
  statuses, is `INCR5-MATRIX/TOTALS.txt` with raw per-suite output in
  `INCR5-MATRIX/raw/`.

## Round-34 rejections, as answered

- **1/2 (the storage-block lockout)** The Architect's ruling is implemented as
  written. The real flags are `m8HardBlocked` and `m8UnprovenBlocked`
  (`index.html` line ~8908); `window.m8StorageBlocked` is a read-only getter
  over the union `m8HardBlocked || m8UnprovenBlocked || m10cHardBlocked ||
  m10cUnprovenBlocked`, so the soft/hard distinction the ruling names does
  exist in the code under exactly those names. `m8SoftRecoveryAuth()` permits
  the bypass only when `m8UnprovenBlocked === true`, `m8HardBlocked === false`,
  neither M10 core block is raised, identity is not corrupt, an account is
  present, this device holds the pen for THAT account, the lease is unexpired,
  the fence is a valid safe integer >= 1, local writes are not frozen, training
  is not quarantined, no corrupt M8 journal is preserved and the dirty record
  reads back typed. `m8SoftBlockRecoverySave()` carries the whole contract:
  snapshot + dirty-generation proof only; the block cleared only after both are
  read back and verified, and only via M8's own re-read-and-validate release;
  `scheduleTrainingPush()` last, reached only after the release took; any
  failure retains or escalates the block and returns `false`.
- **3 (four decisive tests)** C19 **T17a** (a valid holder under only the soft
  block re-saves, verifies and clears it, and exactly one training commit
  follows), **T17b × 10 arms** (non-holder, changed account, changed session,
  invalid fence, expired lease, hard M8 block, additional core hard block,
  additional core soft block, corrupt identity, frozen local writes — each its
  own arm, each proving the refusal reason, byte-identical stores, still
  blocked, zero training network writes, and the refusal counted), **T17c × 2**
  (snapshot-write failure and dirty-proof-write failure: no recovery claimed,
  escalated to a hard block, ZERO network writes), **T17d × 2** (the ordinary
  holder path takes the original code path and the ordinary non-holder refusal
  is unchanged, counter included).
- **4 (export tests)** C19 **T18a/b/c** for `m10cx:export` and **T19a/b/c** for
  `m8:cx:export`, each driven through the real `data-act` control as a
  NON-HOLDER: delivered (only the intended export evidence, every other store
  byte-identical, zero route calls), cancelled (no evidence, no false success
  claim, and the destructive choice it guards still refuses at the export
  gate), and stale context (a session change for the core export, an account
  change for the M8 export — no evidence recorded on either account).
- **5 (the shipping fault hook)** Removed — see "No test seam in the product".
- **6** Round-33's other work is untouched.
- **7 (evidence process)** `tests/browser/run-client-matrix.sh` runs the whole
  required client matrix against one `index.html`, captures raw stdout+stderr
  per suite, checks each **exit status**, and emits `TOTALS.txt`
  mechanically. Every number in this package comes from that file. The
  round-31/32 "171/171" artifacts are explicitly marked invalid in place.
- **8 (retake hint)** Recorded below as a product issue. No behaviour changed.

### The two pre-existing failures are FIXED

- `c11m8-faults` L/Q were the storage-block lockout itself; the ruling-1
  exemption fixes them at the source. The suite now runs to completion:
  **64 passed, exit 0** (it previously aborted at L and never exited).
- `c11m8-quota` B6/13 had a DIFFERENT cause, found by probing rather than
  assumed: that harness mocks no lease route, so the edit under exhaustion was
  refused as "not the writer" before M8's storage handling was ever reached
  (`dirty bytes: null`, `primaryPersisted: false`). Fixed with the same
  disclosed HARNESS change already accepted for `c14-correctness-fixes` and
  `c11m8-faults` — answer the lease route as a granting server. No product
  change, no assertion changed: **6 passed, exit 0**.

## Known product issues — recorded, NOT changed in this increment

- **The progress-photo retake hint does not match what the slot renders**
  (round-34 ruling 8). `renderProgressPhotos()` emits a `pphoto:add` control
  only for an EMPTY pose slot, but the hint reads "Tap a slot to add or
  retake". A filled slot therefore offers no retake control at all, so the
  ADD-then-delete retirement path is reachable only via duplicates, imports or
  a stale slot — which is how C18 T34 constructs it. This is a product/UX
  defect, not a single-writer defect, and it is deliberately left alone here:
  changing what the photos view renders is outside increment 5's gate surface
  and would need its own review. Filed for the Architect's and Owner's eye.

## Round-33 rejections, as answered

- **1 (progress-retake interruption)** The retake's retirement rides the
  increment-4 queue, so an honest "authority lost DURING retirement" test
  needs a phase-exact seam, not a timer. `m10pDispatch` gained ONE disclosed
  test-only hook (below). C18 T34 drives the REAL `pphoto:add` → picker →
  change flow twice — losing the pen before the server delete (`intent`) and
  after the server acked it but before the local removal (`acked`) — and
  asserts all five required properties, plus a no-fault contrast arm.
- **2 (T16 tautology)** The old refusal check was
  `toasts.some(...)||true` — unconditionally true — and the test never built a
  displaced envelope, so `m10cxPushMine()` returned at its first line and
  exercised nothing. T16 now builds a real review with a satisfied export
  gate, so the holder check is the only remaining barrier, and asserts: the
  actual refusal string, NOT the export-gate string, zero core route calls,
  byte-identical base/dirty/journal/displaced, no snapshot replacement — plus
  a holder arm proving the same call really does resolve the review.
- **3 (`m10p:discard`)** Determined from the code: discard is DELIBERATELY
  reachable without the pen (a displaced device has, by definition, lost it,
  and discarding a pending obligation is the repair). No product change; C18
  T35 proves it removes ONLY the obligation — photo bytes, the id map, the
  server record and every other store are byte-identical.
- **4 (inventory contradiction)** `INCR5-ACTION-INVENTORY.md`'s single
  "Ungated actions" section is split into three: the 4 boot-recovery
  exemptions with their handler contracts, the 6 ungated MUTATIONS
  (`m10cx:mine`, `m10cx:export`, `m8:cx:export`, `m10p:discard`, `pb:logout`,
  `confirm:yes`) each with what it persists and its authorization contract,
  and the 136 genuinely read-only branches. The gated table is also corrected
  to 128 rows — it had listed the 4 exempt recovery actions as gated.
- **5 (T15 structural)** T15 kept, plus T15a–T15d which drive the actual
  terminal screens: adoption records the verified owner and reaches the
  reload; logout-restore restores every journalled value and clears the
  journal; logout-finish keeps its confirmation AND its postcondition check
  (a removal that silently does not stick is reported as a failure, the
  journal survives, no reload) with a working-store contrast arm; an
  unreadable journal renders zero `data-act` controls and both recovery
  functions refuse when called directly.
- **6 (T13 vacuous + policy contradiction)** Resolved in favour of STRICT:
  `migrateProgressionTypes()` normalises in memory always and PERSISTS only
  with the pen; it is idempotent and is re-run after `m10Boot()` settles, so
  the holder still writes it. `INCR5-DURABLE-WRITERS.md` withdraws the
  "pure local normalization / substrate" classification. T13 now seeds a
  genuinely OLD-SHAPE record that forces `ch=true` and has five arms,
  including a HOLDER contrast proving the migration is not inert.

## No test seam in the product (round-34 ruling 5)

Round 33's `window.__m10pFault` hook is **removed from `index.html`**. The
release artifact contains no fault-injection hook of any kind; `grep -n
'__m10pFault' index.html` matches only the comment recording the removal.

C18 T34 drives the interruption entirely from the harness instead: the suite
wraps the public global `m10pDispatch` inside the page and, when the entry the
dispatcher is about to process — computed with the product's own
`m10pFindEntry(m10pOps())` — is this retirement at the chosen phase, it drops
the pen and restores the original wrapper. The dispatcher's internal recursion
resolves `m10pDispatch` through the global object, so the wrapper sees every
pass; this is the same phase-exactness the seam provided, with nothing in the
product. A new assertion, `T34 [phase] fired === 1`, proves the interruption
actually happened, so the arm cannot pass vacuously.

Verified against a mutant: with `m10pPen()` no longer requiring `M10.holder`,
T34 P1/P3/P5 fail on **both** arms and C18 T19 fails as well — the
harness-driven interruption still catches the real single-writer defect.

## Round-31 rulings, as landed
- **1** HealthKit captures at the `hk:import` CLICK, stored on
  `state.hkWait`, covering the initial mailbox clear; `hkTryFetch` never
  manufactures a missing capture (T14 ×3, incl. A→B→A before the first poll
  and a non-holder producing zero health writes).
- **2** `INCR5-DURABLE-WRITERS.md`: all 13 durable writers inventoried and
  classified — gated at source / substrate (journal, queue, quarantine —
  gating them would break recovery, authority proven at their call sites) /
  account-local infrastructure. The four-function claim is withdrawn.
- **3** `m10InternalWrite` REMOVED — it was declared and never set, so the
  claim it guarded anything was false. The real authorization path is
  documented instead.
- **4** T13: a non-holder navigating every view, plus `migrateProgressionTypes`
  and `resyncAllActivityTags` fired directly, leaves wl_v1, wl_training_v1
  and wl_workout byte-identical.
- **5** `adopt:ask`, `adopt:yes`, `lrec:restore`, `lrec:finish` are EXEMPT
  from the ordinary gate: they run on terminal boot screens before lease
  initialisation, so requiring the pen could make recovery impossible (T15).
- **6** `m10cx:mine` / `m10p:discard` reclassified as M10 review actions that
  persist and prove authority INSIDE their handlers (T16).
- **7** imported photos stage under a fresh unique id, so a reused incoming
  id can never overwrite the pre-image in place.

## Round-30 rulings, as landed
- **1 (HealthKit)**: ONE immutable capture is stored with `state.hkWait`
  when the import begins and revalidated on every poll, before the local
  mutation and before each mailbox clear — an A→B→A across polls can no
  longer import under replacement authority.
- **2 (photo replacement)**: the progress-photo retake is now
  ADD-then-delete, with authority revalidated before EVERY destructive
  step and each delete riding the increment-4 queue. The previous
  delete-then-add could remove the pre-image and then fail to add — data
  loss, not merely an unauthorized write.
- **3 (photo-backup import)**: the capture is threaded through the whole
  chain (confirmation → idbAll → per-item fetch → add → retire dupes) and
  revalidated before every mutation; add-then-delete there too.
- **4 (writes during rendering)**: the four persistence primitives are
  gated at the source with an `m10InternalWrite` guard for M10's own
  authorized transitions. Single-writer correctness is about writes, not
  intent — a read-only device performs zero durable writes even when a
  lazy migration fires during ordinary navigation.
- **5 (exemption narrowed)**: the `.wl-confirm` class exemption is gone; a
  CSS container is not an authority boundary. Only identified recovery
  controls (`#m10-cx`, `m10-*`, sign-in/server fields) are exempt.
- **6 (recovery actions)**: `lrec:restore`, `lrec:finish`, `adopt:yes`,
  `adopt:ask` are gated with explicit contracts rather than silently
  ungated.
- **7 (read-only viewing)**: `photo:view` is UNGATED again — opening the
  lightbox is reading, which STRICT allows; its own mutations are gated at
  their primitives.

## Design: one choke point, not 104 edits
A capture-phase `click` listener registered on `document` runs BEFORE
the application's own dispatcher. For any element carrying `data-act`
whose action is in the generated `M10_GATED` set, it calls
`m10GateAction`; on refusal it issues `stopImmediatePropagation()` +
`preventDefault()`, so the application handler never executes. This is
strictly stronger than editing each branch (no future branch can be
added un-gated by accident within the enumerated set) and it is one
reviewable primitive.

`m10AuthNow()` is the complete, FRESH authority check used everywhere:
account present, `M10.uid === pbUid()`, holder true, `performance.now()
< M10.deadline`, a valid safe-integer fence ≥ 1, no corrupt identity,
and no storage block. A local-only app (no sync account) passes — there
is no lease concept there.

## Delayed asynchronous boundaries
Entry gating proves nothing once an await intervenes, so:
- **File pickers** (`wl-photo-input`, `wl-import`, `wl-pbk-import`):
  authority is CAPTURED at the picker-opening click and REVALIDATED in
  a capture-phase `change` listener before any application handler
  reads the files; a mismatch clears the input and mutates nothing.
- **Confirmations**: `askConfirm` is wrapped so a sheet raised WHILE
  holding the pen revalidates at confirm time. A sheet raised WITHOUT
  the pen is deliberately NOT wrapped — take over, review a displaced
  change, discard a pending photo op and conflict resolution are the
  flows that repair the situation, and gating them would deadlock the
  device. (This exact defect was caught by the accepted increment-1
  and increment-3 suites when the wrapper was initially unconditional.)
- Comparison is identity-based, not boolean: same uid AND same fence
  AND same session generation, so an A→B→A round trip or a
  same-account fence replacement invalidates the capture.

## Logout coupling
`pbLogout` is wrapped once more (on top of M8's training gate and
increment 3's core-review gate): sign-out is refused while core sync is
dirty/unproven, while any core journal or dx recovery is open, while a
core review is pending or corrupt, and while ANY photo queue entry
exists — each with its own plain-language prompt and a repair action.
A clean device signs out normally.

## Fail-closed
Corrupt identity, a raised storage block, an expired deadline, a
missing/invalid fence, or an absent account all refuse mutation. The
gate never "assumes yes" when it cannot prove authority.

## Evidence
- `INCR5-ACTION-INVENTORY.md` — the required mapping, regenerated after
  round 29: the seven mutation BOUNDARIES (click, input/change, file
  pickers + their post-async continuations, confirmations, the HealthKit
  callback, transport, logout) each with its gate and tests; then all
  129 gated actions with WHY each is gated (direct primitive or the
  callee that reaches one) and its tests; then the 145 ungated
  view/selection/navigation actions and the reason.
- `INCR5-C19-OUTPUT.txt` — C19 36/36: inventory membership; non-holder
  interception; holder pass-through; four fail-closed arms; two
  delayed-picker arms (pen lost, fence replaced); three confirmation
  arms (expired, valid, A→B→A); four logout-coupling arms + the clean
  case.
- `INCR5-C18/C17/C16/C15-RERUN.txt` — the accepted suites at 52/52,
  37/37, 49/49, 35/35.
- `INCR5-M8-REGRESSION.txt` — the full client matrix.

## Harness changes in accepted suites (disclosed, property-preserving)
- C15 case K asserted "a real dispatcher action executes for a
  NON-holder (gate not yet wired)" — increment 1's documented limit.
  Increment 5 wires the gate, so it is now the INVERSE assertion: the
  action is refused and the dispatcher never runs.
- C17 T10 matched the increment-3 logout wording; increment 5's
  coupling owns that prompt now, so the assertion accepts either
  wording. The property tested (sign-out refused while unresolved) is
  unchanged.
- C14 and c11m8-faults each signed in with NO lease route mocked. Under
  the wired gate such a device is not the holder, so their mutating
  clicks were correctly refused (C14's GLP flow crashed; faults' M8
  conflict resolution stalled). Both harnesses now answer the lease
  route as a granting server — harness only, no product change, and
  both are green again (67/67 and 64/64). This is the intended M10
  behavior: resolving a conflict is a content write and needs the pen.
