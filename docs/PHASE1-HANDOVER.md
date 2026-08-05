# Phase 0 + Phase 1 handover

`DECISION_REQUIRED: NO` — no product, data, or scope decision blocks review.
Two product decisions are *surfaced* (below) but nothing awaits them.

## What was assigned and what was done

Architect assignment: Phase 0 (baseline and guardrails) and Phase 1 (modular
source, same behaviour), then stop. Both are complete. **Nothing is deployed**
— see the commit table below for the full unpushed set (the count is stated
there and re-verified at the final freeze, not repeated in prose that can go
stale); see Deployment note.

## Commits (in order)

| Commit | Content |
|---|---|
| `3044bf8` | Phase 0: frozen baseline, docs, test retirement (−12,760 lines of dead tests), c23 characterization suite |
| `b653540` | Coach Max avatars → `assets/max/*.jpg` (build-time generation, byte-identical artifact) |
| `398fb83` | Muscle Preservation engine → `src/mp-calc.js` (2,000 lines) |
| `5ae96b1` | Report generators → `src/report-progress.js` (482), `src/report-srview.js` (339) |
| `8524b39` | SVG icon table → `src/icons.js` (33) |
| `f287549` | Dead GitHub-era sync layer deleted (~370 lines, 36 functions) + boundary tests |
| `9af2527` | This handover package + the 7 offline/online/retention proofs |
| `eed9fec` | Review response: assertion-level ledger; accounting corrected |
| `ab82029` | Environment-separation design |
| `3fe7521` | Round-2 response: exact 328-row ledger, c24 suite, FIX-002 restored, --prove-source, module-map disposition, environments revision, platform contract |
| *(final freeze)* | Accounting + gate rerun at the review head — `git log origin/main..main` is authoritative for the count |

## Source-to-module map (after Phase 1)

```
index.html      14,084 lines (was 14,426) — shell, styles, and the app regions
                not yet extracted (M8/M10 sync blocks deliberately unmoved)
src/
  tdee-core.js        pure TDEE engine        (pre-existing)
  tdee-proposal.js    recommendation engine    (pre-existing)
  mp-calc.js          Muscle Preservation calc (extracted)
  report-progress.js  standalone progress card (extracted)
  report-srview.js    coach-report view block  (extracted)
  icons.js            SVG icon table           (extracted)
assets/max/*.jpg      13 avatar sources; build.mjs re-encodes at build time
```

All modules inline **in place** between `==BUILD:name==` markers —
concatenation order is inherently the original file order, because order is
semantics in this codebase (`docs/DUPLICATE-DECLARATIONS.md`).

## Artifact and checksums

| | |
|---|---|
| Baseline (deployed `.457`) | 14,426 lines / 1,289,069 B / sha `5c2fcc22…` |
| After Phase 1 (local) | 14,084 lines / 1,263,473 B |
| `node build.mjs --check` | green at every commit |
| APP_BUILD | still `2026-08-05.457-outliers` — **must be bumped before any push** |

Per-file checksums: `git show --stat` on each commit; the artifact is fully
reproducible from source via `node build.mjs`.

## Test results

Functional gates were green at `f287549` and RE-RUN at the final review head
(results identical; the intervening commits are documentation, the c24 suite,
and the FIX-002 charset restoration — the latter two being the only code
changes, both covered below):

| Suite | Result |
|---|---|
| Browser tier (21 suites incl. c23) | **all passed** (post-deletion full run) |
| `p1-handover-proofs` | 7/7 — online boot, offline logging, offline relaunch retention, data-loads-unchanged |
| `c24-status-export-photos` | 9/9 — UTF-8 export (ported), status display + blocked-recovery durability, the 500-photo boundary pin |
| `src` tier: tdee-core / integration / golden / parity / boundaries | 36/11/21-identical/6/16 — green |
| smoke / coach-sheet / avatar-cue | clean / 30 / 15 |
| String tier | 5/5 suites (post-retirement) |

Commands: `node build.mjs --check`, `node tests/browser/run-all.js`,
`node tests/run-all.js`, `for t in src/*.test.mjs …`, and the individual
suites named above.

## Duplicate declarations: removed vs retained

**Removed (36):** all GitHub-era losers (`cloudGet/cloudPush ×2/cloudPull/
cloudTest/autoSync/pushDataPromise/trainingPush ×2/trainingPull ×2/
scheduleTrainingPush/save/saveTraining/syncOn/syncCfg/setSyncCfg/myUid/isOwner/
myFile/connectionList/pullConnections/genSummary/genNightly/pollSummary/
pollNightly/ghPut/ghUrl/ghHeaders/ensureIdentity` + boot call), `openLightbox`
loser, the M8-era `pbPhoto*` transport wrappers and `pbPhotoUpload`/
`pbPhotoDelete`, and the dead `photoSync` declaration (now `var photoSync;`).

**Retained deliberately:**
- every assignment-chain wrapper (render/save gates/pbLogout/askConfirm/
  m10cBoot/m10cPull/m10cPush) — all layers live;
- `m10cState` base — **the analysis said full-replacement; it is a wrapper
  chain.** Deleting it broke the Overview tab and the c23/smoke pins caught it
  within seconds. Restored; `docs/DUPLICATE-DECLARATIONS.md` corrected.
- `randUid` — has a live caller (`invite:create`);
- the PB-era stubs (`syncCfg {}` etc.) — live UI still references them;
- `deviceSetupLink`/`deviceSheetHTML` and the invite/connections UI — product
  surfaces (see decisions below).

## Surfaced product decisions (not blocking)

1. **"Set up another device" is broken today**: the sheet builds its setup
   link from the permanently-empty GitHub config, so the copied link carries
   no credentials. Pre-existing. Options: remove the sheet, or re-point it at
   the PocketBase sign-in flow.
2. **The invite/connections UI** (`invite:create`) writes to retired
   plumbing; the connections feature is half-removed. Same choice.
3. The `sync:pull` confirmation still reads "Pull from GitHub…" while running
   the fenced protocol. One-line copy fix whenever behaviour changes are
   allowed again.

## Deployment note — read before pushing

`git push origin main` **is** the deploy. Everything since `a9ee0e1` is unpushed — `git log --oneline origin/main..main` is the authoritative list. Before any
push: bump `APP_BUILD` to a new value (never `.348`–`.353`), `node build.mjs`,
run the browser tier, then push — otherwise deployed devices will not
self-update onto the new artifact (same build string) and the served file
would silently diverge from what devices run. Rollback: `git revert` + a NEW
build bump (`docs/PHASE0-BASELINE.md` §rollback).

## Known limits carried forward

- `pbPhotoList` caps at 500 records with no pagination (adoption-side only;
  the deletion inference died with the M8-era photoSync) — Phase 4.
- Google Fonts `@import` is the one external reference — Phase 2 decision.
- The self-update contract (APP_BUILD greps the document) is load-bearing and
  pinned by c23 — the Phase-2 service-worker design must supersede it
  deliberately, never incidentally.
