# M10 client increment 5 — the gate surface

## Package identity
- **Base**: `249fd0e` — the accepted increment-4 head.
- **Code head**: `793e591` — the last commit touching `index.html`;
  index.html sha256
  `c49166fee14c787a568f35f687beacefcb4a562ada554a6ff0e86154d90e5788`.
- **Records head**: `9e3f87b` and later — test-harness and package
  artifacts only; `index.html` is byte-identical (the manifest checks it).
- **Diffs**: `INCR5-DIFF.patch` = 249fd0e → 793e591 (index.html, `git
  diff --check` clean); `INCR5-DIFF-FROM-48e966a.patch` = the round-29
  corrections alone; `INCR5-TESTS-DIFF.patch` = the C19 suite plus the
  disclosed harness edits.

## Round-29 rulings, as landed
- **1/7 (the real choke points)**: the click interceptor was NOT
  sufficient — the application persists directly from its global
  `input`/`change` handlers (sleep, goals, lift-session fields, workout
  sets, routines, notes/food/steps/weight/bodyfat/waist/leanmass, sync
  config). Those events are now intercepted at capture as well, with the
  field's prior value restored, so a non-holder produces NO in-memory and
  NO durable change (tested three ways, including that sign-in/server
  fields stay usable and a holder is unaffected).
- **2 (inventory correctness)**: classification now follows CALLEES
  transitively rather than branch text. That moved the count from 104 to
  129 and caught every family the Architect named — `wo:start`,
  `wo:startroutine`, `wo:endrest`, `wu:yes`, `wo:finishlater`,
  `day:reopendo`, `sync:pasteapply` — each now gated and tested (T9).
  The render/view layer is excluded from the walk, documented, because
  its persistence is lazy migration, not user-initiated mutation.
- **3 (HealthKit)**: `hkTryFetch` captures authority at start and
  revalidates before the local mutation AND before each mailbox clear;
  pen loss during the wait imports nothing (T10).
- **4 (file flows)**: authority is threaded through the async chains and
  revalidated immediately before every mutation — after
  `FileReader.onload` for both imports, and after `processImage`/`idbAll`
  before each delete/add (T11 proves a pen loss after `change` mutates
  nothing).
- **5 (malformed queue)**: logout inspects the TYPED queue read; a
  malformed/unreadable photo queue blocks sign-out and preserves the
  evidence instead of reading as empty (T12).
- **6 (identity)**: code head and records head are now stated separately
  and precisely above.

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
