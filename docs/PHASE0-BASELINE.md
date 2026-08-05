# Phase 0 baseline — frozen 2026-08-05

## The frozen artifact

| | |
|---|---|
| Build | `2026-08-05.457-outliers` |
| Commit | `a9ee0e1` (origin/main == local, verified) |
| `index.html` sha256 | `5c2fcc22082e9e76…` — byte-identical to the live URL |
| Size | 1,289,069 B raw · 435,546 B gzip |

## Performance (desktop Chromium, local HTTP, 3 runs)

| Metric | Value |
|---|---|
| domInteractive | ~148 ms |
| domLoading → domComplete (script eval) | ~134 ms |
| navigation → first rendered app | 128–180 ms |

These are lower bounds (localhost, desktop). Device numbers belong to the
manual checklist. Budget for Phase 1: **no regression beyond noise** — the
built artifact is the same bytes, so any change is a build defect.

## Test baseline

| Tier | Before Phase 0 | After test retirement |
|---|---|---|
| `src/*.test.mjs` + golden + smoke | all green (36/11/30/15/6/21-identical/clean) | unchanged |
| `tests/*.test.js` | **18 of 20 runnable failing** (marker tier dead since `a599efa`, plus cf-era suites) | **5 suites, all green** |
| `tests/browser/` | 19 of 33 green; **14 cf-era suites failing**; 1 genuine stale assertion in `c13` | **21 suites, all green** (incl. new `c23`; `cache-sw` skips without the .347 artifact) |

The `c13` failure was the documented data-loss defect being FIXED by M8/M10 —
the assertion said "loss reproduced" and the loss no longer happens. Rewritten
to pin the modern behaviour. Full disposition of everything deleted:
`docs/RETIRED-TESTS.md`.

## Behaviour checklist (manual gate, run on a real device before/after Phase 1)

1. **Boot** — cold-open the installed PWA: overview renders, correct data, no
   error toast, M avatar present.
2. **Login** — sign out (must be allowed only when clean), sign back in:
   data returns, lease acquired (no read-only bar on the holder).
3. **Offline logging** — airplane mode: log a weight and a meal; app stays
   usable; entries visible.
4. **Relaunch** — force-quit, reopen (still offline): the offline entries are
   still there.
5. **Sync** — back online: entries push (sync dot settles), `coreRev` advances
   by the number of pushes, no conflict sheet.
6. **Photos** — add a progress photo; appears in the photos view; after sync,
   visible in PocketBase.
7. **Health import** — run the shortcut / paste path: values land on the
   right dates, no duplicates on re-run.
8. **Workout logging** — start a routine, log sets, finish: session appears in
   training history; RPT targets advance correctly next time.
9. **Coach reports** — open the M avatar: latest reports render with
   timestamps; unread pill behaves; no stale "generating" state.
10. **Update** — bump `APP_BUILD` on the server copy: foregrounding the app
    triggers exactly one reload into the new build (no loop); `wl_announced`
    shows the banner once.
11. **Second device** — the non-holder shows the read-only bar naming the
    holder; take-over works; the old holder sees the displaced flow, not data
    loss.

## Rollback runbook (client release)

The deploy is a git push, so rollback is a git operation:

1. `git revert <bad-commit>` (or a branch reset to the last good commit —
   revert preferred, history stays true), bump `APP_BUILD` to a NEW value
   (never reuse; `.348`–`.353` are burned), `node build.mjs`, commit, push.
2. Devices self-update on next foreground via `checkForUpdate()` — this is
   why the APP_BUILD-in-document contract is load-bearing; the rollback
   mechanism IS the update mechanism.
3. If a device wedged mid-update: Safari → clear site data for the Pages
   origin, reopen (data lives in localStorage under the origin — clearing
   SITE data wipes it, so this is last resort; export first via Settings).
4. Local data is never part of a client rollback: storage keys are
   versioned independently (`wl_v1` schema has its own migration path) and
   Phase 1 changes no key and no shape.
