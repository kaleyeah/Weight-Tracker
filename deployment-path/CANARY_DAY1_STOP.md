# Canary day one — STOPPED on the first case, with the finding that stopped it

2026-07-30. The canary was published to `/canary/` under the Architect's
approval, all 12 pre-publication gates passed, and the Product Owner opened it
on a real iPhone. **The window never started: the athlete was trapped on the
ownership gate.** Per the ruling's §6, a failed day-one item stops the window
and triggers the diagnostic plan.

## What passed before the stop

| Gate / case | Result |
| --- | --- |
| Gates 1–4 build/lock/selector/hash | fresh authoritative build, exact `9e45a225…` |
| Gate 5 root backed up + hashed | live root = recorded `.347` `bb41dab4…`, copy off-NAS |
| Gate 6 HOTFIX-001 replay | green on production (the I5d run) |
| Gate 7 server health | `/api/health` 200; commit route registered and guarded |
| Gate 8 no duplicate appdata owner | 2 rows, 2 distinct owners |
| Gate 9 payload sizes | 23.8 KB / 29.1 KB, far under 256 KiB |
| Gate 10 rollback rehearsed | fixture: publish and remove, root byte-identical both times |
| Gate 11 root unaltered | only `canary/index.html` added |
| Gate 12 PO briefing | delivered |
| CANARY-01 canary serves the approved build/hash | PASS — `9e45a225…`, `2026-07-29.348-pb-c10` |
| root still `.347` after publication | PASS — `bb41dab4…`, unchanged |
| CANARY-24 (partial) export from the gate | the export control is the one that still worked |

## The finding — FIX-003

The athlete signed in and landed on **"Is this your data?"** — correct
behaviour: Safari held meaningful pre-sign-in data from the 2026-07-29 manual
set-aside testing. But **"No — set it aside" did nothing.** Repeated taps,
nothing. The only responsive control was the unsafe one.

`cfDisownLocal` runs behind `askConfirm`, which queues `state.pendingConfirm`
and calls `render()` to paint the dialog. The final render gate replaces `#app`
with `cfBlockedHTML(b)` and returns; `confirmOverlayHTML()` is otherwise only
appended by the main app render and the login render. So the dialog could never
be painted, and **every confirm-driven action reachable from that screen was
dead the same way**.

**Severity.** No data loss, and the gate failed *safe* — it refuses to merge.
But the athlete's only working path forward was the one that adopts unknown
data into a real account. On a shared or second-hand device that is exactly the
outcome the gate exists to prevent.

**Not a production defect.** The live `.347` client has no ownership gate at
all (zero `cf:disown`). New-code-only — caught precisely where a canary is
supposed to catch it, on real hardware, by the athlete.

**Why the existing suites missed it.** The set-aside suites drive
`cfDisownLocal()` and the recovery surfaces directly, never through the gate's
button; the string suites cannot observe paint. The gap was between "the
function works" and "the athlete can reach the function" — the same class as
the below-fold set-aside message the PO found on 2026-07-29.

## The fix and its evidence

- `index.html`: the gate render appends `confirmOverlayHTML()`. The
  `confirm:yes`/`confirm:no` handlers are document-bound, so painting is the
  whole fix.
- `tests/browser/ownership-gate.browser.test.js` — GATE-01..08, real clicks on
  the rendered gate in Chromium against a disposable PocketBase: gated verdict
  AND painted screen, tap paints a **visible** dialog, cancel changes nothing,
  confirm preserves the stranger data in a set-aside copy and clears the gate,
  the copy stays listed and reachable, no uncaught errors.
- **Negative control**: fix reverted → GATE-04..07 fail; restored
  byte-identical → 8/8.
- Second defect found while doing this: `tests/browser/harness.js` `summary()`
  set no exit code, so every browser suite exited **0** while printing FAILED
  (the new suite's first run failed 5 of 8 and exited 0). Now sets
  `process.exitCode`.
- Full regression on the fixed tree: `run-all` all suites passed; `deploy-rc`
  46/46; all ten browser suites green (226 assertions), every one exit 0.

## New candidate — for review, not substitution

`2026-07-30.349-pb-c10`, sha256
`30336aee546331a25862169f9dd85301a050e4032afbd9f7135f5637c6a02514`,
1,188,029 bytes. The build stamp was deliberately bumped: two different
artifacts must never claim one version, or the client's own update check cannot
tell them apart. The injection was regenerated mechanically (8 ops,
reconstruct-verified); `build-release.mjs` + `select-artifact.mjs` reproduce the
candidate by construction.

Per pre-publication gate 5 — *"if the artifact hash/build changes because of a
new commit, stop and return the new candidate for review rather than
substituting it silently"* — **nothing has been republished.** `/canary/` still
serves `.348-pb-c10` and is halted; the root is untouched and still `.347`.

## Requested

1. Accept FIX-003 and the new candidate `2026-07-30.349-pb-c10`.
2. Authorize republishing `/canary/` with it, restarting day one from
   CANARY-01 (the 48-hour clock never started).
3. Rule on whether the gate's other confirm-driven paths need any case beyond
   GATE-01..08.

Standing state: root `.347` untouched; both athletes unaffected; ledger 0 rows;
no synthetic data anywhere; the PO's pre-sign-in Safari data still intact and
un-adopted on the device.
