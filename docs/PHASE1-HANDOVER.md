# Phase 0 + Phase 1 handover — regenerated at the freeze

`DECISION_REQUIRED: NO`. Generated from the tree this document is committed
in; the numbers below are measured, not remembered.

## What Phase 1 produced

The **entire application script** now lives in **23 authoritative
source modules** (plus 13 avatar image assets), inlined at their original
positions between build markers into ONE atomic `index.html` — the amended
Architect contract. Wrapper/capture execution order is preserved by
construction (in-place inlining).

## Artifact accounting (ruling 5's split — artifact size is NOT modularity)

| Measure | UTF-8 bytes (`wc -c`-equivalent) | Lines |
|---|---|---|
| Template (HTML shell + CSS + markup + markers) | 87,373 | 1,022 (approx: artifact minus module lines) |
| Generated from `src/` + `assets/` | 1,177,314 (93.1%) | 13,087 |
| Final atomic artifact | 1,264,687 | 14,109 |

The artifact remains ~14k lines BECAUSE it contains the inlined modules; the
source of truth for every one of those lines is a `src/` file. CSS remains
template per the accepted styles ruling (bundling arrives with Phase 2).

## Authoritative source modules (23)

- src/app-core.js
- src/icons.js
- src/lifting-model.js
- src/lightbox-boot.js
- src/m10-displaced.js
- src/m10-gate-wiring.js
- src/m10-lease-core.js
- src/m10-photoq.js
- src/m8-sync.js
- src/mp-calc.js
- src/pb-adapter.js
- src/pb-health-login.js
- src/photos-workout.js
- src/ratings-checkin-coach.js
- src/recovery-update.js
- src/render-events.js
- src/report-progress.js
- src/report-srview.js
- src/sr-photos.js
- src/state-glp-calc.js
- src/tdee-core.js
- src/tdee-proposal.js
- src/views-weight-summary.js
- assets/max/*.jpg (13, generated into `max-avatars.js` at build time)

Classification and boundary enforcement: `src/boundaries.test.mjs` — every
module carries a pinned permission set (dom/net/storage), the manifest must
equal both the directory listing and `build.mjs` MODULES, and any module
exceeding its set fails the tier.

## Commit accounting (explicit, per round-5 ruling 6)

- behaviour head `59a1457`: 16 commits ahead of `origin/main` — the head every
  functional gate ran against; `docs/freeze/COMMITS-AT-FREEZE.txt` lists them;
- record head `e347989`: 17 ahead — the documentation-only wrapper commit
  (`git diff --stat 59a1457..e347989` = 3 files under docs/freeze/);
- this evidence-correction commit sits on top; `git log origin/main..main`
  remains authoritative and no prose count elsewhere restates it.

## Commits (regenerated at the acceptance head; authoritative command:
`git log --oneline origin/main..66d0f85`)

```
66d0f85 Evidence-only correction (round-5): honest bytes, honest counts, honest skip
e347989 Freeze record: bound gates at 59a1457 (documentation-only commit)
59a1457 Round-4 corrections: handover regenerated from the tree; boundary gate covers all 23; a11y contract honest
bec477f Round-3 response: a11y baseline RUN and pinned, environments sequencing, disposition superseded
29d2c84 P1 complete extraction: the ENTIRE script is now 23 position-preserving modules
9031f85 Freeze hygiene: commit the evidence that was accidentally outside the freeze
9df8d0b c12: the shared-file type assertion follows FIX-002 (charset included)
0a8282f Handover: final-head accounting; the commit table + git log are authoritative
3fe7521 Review round 2 response: exact ledger, three coverage suites in one, FIX-002 restored
ab82029 Environment-separation design (addendum gap 3) — staging on the NAS, gated before Phase 3
eed9fec Review response: assertion-level retirement ledger; commit accounting corrected
9af2527 P1: handover package — proofs, map, disposition, deployment note
f287549 P1: dead GitHub-era sync layer deleted (~370 lines, 36 functions)
8524b39 P1: SVG icon table extracted to src/icons.js
5ae96b1 P1: report generators extracted (report-progress.js, report-srview.js)
398fb83 P1: Muscle Preservation engine extracted to src/mp-calc.js
b653540 P1: Coach Max avatars extracted to real asset files
3044bf8 Phase 0: baseline, guardrails, and the honest test ledger
```

## Test gates

The complete bound gate record (hash, clean-status output, commands, exit
codes, totals) lives in `docs/freeze/FREEZE-GATES.txt`, regenerated at every
freeze. Suites: browser tier — **24 discovered, 23 passed, 1 skipped**
(`cache-sw` needs the historical `.347` live artifact as input; it
characterizes the PRE-service-worker cache behaviour for Phase-2 design work
and does not gate a Phase-1 refactor whose artifact shape is unchanged) —
incl. c23 characterization, c24 status/export/photos, p1-handover-proofs,
the a11y top-level baseline, src tier
(tdee-core 36, integration 11, golden 21-identical, parity 6, boundaries 37),
smoke, string tier 5/5, `build.mjs --check`, `build.mjs --prove-source`
(narrowed claim: marker bodies regenerate byte-identically; template bytes
are template by definition).

## Retirement ledger

`docs/RETIRED-TESTS-LEDGER.csv` — 328 rows, exact, audited by protected
property: 159 COVERED / 129 OBS-CODE / 26 OBS-BEHAV (each citing the retiring
release or ruling) / 14 PORTED. The Markdown summary is generated from the CSV.

## Product decisions surfaced (Owner, non-blocking)

1. "Set up another device" builds its link from the retired GitHub config —
   broken; re-point at PocketBase sign-in or remove.
2. The invite/connections UI writes to retired plumbing — retire or define
   supported behaviour.
3. Stale copy: the `sync:pull` confirm says "Pull from GitHub"; the signed-out
   status line says "Add your repo and token". One-line fixes in the next
   authorized behaviour-change release.
4. The 18 unnamed inputs (a11y inventory): aria-labels in the next authorized
   behaviour-change release — the remediation milestone per ruling 11.

## Deployment note

`git push origin main` IS the deploy and is NOT authorized. Before any push:
bump `APP_BUILD` (in `src/app-core.js` now — the constant moved with the
extraction; the artifact still carries it inline so self-update works), run
`node build.mjs`, full tier, then push. Deployment additionally requires the
gates in the Architect's rulings: candidate build identity, physical-device
behaviour checklist, device performance, physical accessibility, and a
non-production rollback rehearsal.

## Known limits carried forward

- `pbPhotoList` 500-record cap (adoption-side; pinned by c24) — Phase 4.
- Google Fonts `@import` — the one external reference; Phase 2 decision.
- The self-update contract (APP_BUILD greps the served document) is pinned by
  c23 and must be superseded deliberately by Phase 2's service worker.
