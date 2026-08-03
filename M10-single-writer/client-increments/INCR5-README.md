# M10 client increment 5 — the gate surface

## Package identity
- **Base**: `249fd0e` — the accepted increment-4 head.
- **Code head**: `3cd7311` — index.html sha256
  `12e839b01138169c37a2f49cc41ea5de7cce714fbe14a4c31ab07cc35eb9612f`.
- **Records head**: this commit and later — harness/artefacts only;
  `index.html` byte-identical (the manifest checks it).
- **Diffs**: `INCR5-DIFF.patch` = 249fd0e → 3cd7311 (`git diff --check`
  clean); `INCR5-DIFF-FROM-793e591.patch` = the round-30 corrections alone;
  `INCR5-TESTS-DIFF.patch` = the C19 suite plus the disclosed harness edits.

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
- `INCR5-C19-OUTPUT.txt` — C19 30/30: inventory membership; non-holder
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
