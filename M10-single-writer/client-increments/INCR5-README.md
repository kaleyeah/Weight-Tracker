# M10 client increment 5 — the gate surface

## Package identity
- **Base**: `249fd0e` — the accepted increment-4 head.
- **Code head**: `f482eb2` (hash in `INCR5-MANIFEST.txt`).
- **Cumulative diff**: `INCR5-DIFF.patch` = 249fd0e → f482eb2. One
  delimited block `M10-BLOCK-5 … M10-BLOCK-5-END`, plus two updated
  assertions in accepted suites (below) — no accepted M10 code changed.

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
- `INCR5-ACTION-INVENTORY.md` — the required mapping: all 104 gated
  actions with their mutation classes and the tests covering them, plus
  the 170 deliberately ungated (view/selection/navigation) actions and
  the reason. Generated from the shipping dispatcher.
- `INCR5-C19-OUTPUT.txt` — C19 17/17: inventory membership; non-holder
  interception; holder pass-through; four fail-closed arms; two
  delayed-picker arms (pen lost, fence replaced); three confirmation
  arms (expired, valid, A→B→A); four logout-coupling arms + the clean
  case.
- `INCR5-C18/C17/C16/C15-RERUN.txt` — the accepted suites at 52/52,
  37/37, 49/49, 35/35.
- `INCR5-M8-REGRESSION.txt` — the full client matrix.

## Two updated assertions in accepted suites (deliberate, by design)
- C15 case K asserted "a real dispatcher action executes for a
  NON-holder (gate not yet wired)" — increment 1's documented limit.
  Increment 5 wires the gate, so it is now the INVERSE assertion: the
  action is refused and the dispatcher never runs.
- C17 T10 matched the increment-3 logout wording; increment 5's
  coupling owns that prompt now, so the assertion accepts either
  wording. The property tested (sign-out refused while unresolved) is
  unchanged.
