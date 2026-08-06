# Measurement trend chart — implementation handoff (Owner package 2026-08-06)

## Required first step — audit answers

- **Existing chart**: the "Body composition" card in `view_weight`
  (`src/views-weight-summary.js`), four tabs (Weight / Body fat / Waist / LBM)
  rendered by `prepChart`+`buildChart` (`src/state-glp-calc.js`) against the
  page-level `trendCtx()` calendar windows.
- **Canonical records**: `state.weights` (array, ONE entry per date — all three
  writers filter-then-push by date), `state.bodyfat|waist|leanmass` (maps
  date→value). Import (HealthKit Shortcut) replaces same-date entries through
  the same rule, so canonical resolution is unambiguous: the stored value IS
  the canonical value for its date. No per-record exclusion flags exist at the
  store level (TDEE's outlier machinery is internal to that computation).
- **Consumption confirmed**: the component reads ONLY those stores, adds no
  persistence, no API, no collection, and no rewrite of history.

## What changed and why

| File | Change |
|---|---|
| `src/trend-core.js` (NEW, +unit tests) | pure period/aggregation/copy/SVG logic; UMD so node tests run the exact browser bytes. 31 unit tests, independent arithmetic |
| `src/views-weight-summary.js` | the Body composition card's interior replaced by the component (`t2InnerHTML`); metric tabs kept; page-level `trendCtx()` control untouched and still drives steps/calories/sleep/training history |
| `src/render-events.js` | five view-state handlers (`t2:mode/prev/next/tocur/pt`) — read-only interactions, deliberately NOT in `M10_GATED` |
| `index.html` template | new build marker + ~14 CSS rules (`wl-t2-*`), incl. a reduced-motion guard |
| `build.mjs` | `trend-core.js` registered after `state-glp-calc.js` |
| `tests/browser/c26-trend.browser.test.js` (NEW) | 21 assertions in real Chromium at iPhone width |

## Product deviations — flagged, not silently resolved

1. **Units follow the app, not the spec table.** The spec lists lb/in; Compound
   supports kg/cm via `settings.units` and the component respects that setting
   (the spec's own "preserve Compound's data model" rule wins).
2. **No per-record source/time metadata exists.** Measurement records are
   `{date, value}` — no source, no time-of-day, no created-at. Point details
   therefore show value+unit+date+"logged entry"; the source line reads
   "Manual & imported entries" with the latest-entry date, and never fabricates
   a provider name (the spec's own no-hard-coding rule). **Product option, your
   call later:** start stamping `src:"manual"|"health"` on NEW records — small,
   additive, sync-safe — and details/source lines get richer from that day on.
3. **Strong-comparison threshold.** `PACE_MIN_WEIGHINS` (7) gates the M/6M
   comparison claims; W uses 3 because 7-of-7 daily weigh-ins would silence
   the weekly comparison for nearly everyone. Below threshold: "Keep recording
   to unlock a reliable comparison." — the spec's own copy.
4. **The goal line** stays on the Forecast card and is not drawn in the new
   component (the spec's visual hierarchy has no goal overlay).
5. **6M month labels**: adjacent-month average labels use collision avoidance
   (drop below the segment when crowded) per acceptance item I.

## Evidence

- `src/trend-core.test.mjs` — **31/31** (windows across month/year boundaries,
  calendar-6M with Feb clamping incl. leap year, LBM per-pair vs the wrong
  avg×avg number proven different, pp wording, NaN guards, SVG structure per
  mode).
- `tests/browser/c26-trend.browser.test.js` — **21/21**: one component powers
  all four metrics; W/M/6M switch updates average+copy+chart in one update;
  prev/next with future disabled; metric switch preserves the period; point
  details; LBM derivation live; empty state; page-level control and More
  stats untouched; zero page errors.
- Screenshots: Weight W/M/6M, Body fat 6M, Waist empty (test-data seeds).
- Full browser tier: run after this commit (result recorded in the release
  notes when this ships).

No production data was migrated, rewritten, or touched — the component is
read-only over the existing stores.

---

# Progress-photo package — Milestone 1 record (same night)

Delivered per the implementation plan's gate: the non-destructive transform
foundation, NO camera, NO UI change (legacy rendering deliberately untouched).

- `src/photo-frame.js` (NEW, UMD) — pure geometry + metadata: normalization
  validation (schema 1, 3:4 only, crop in [0,1], rotation capped at ±7° —
  leveling, not art), deterministic centered auto-suggestion, pixel-rect
  computation with clamping and ratio re-truing, pan/zoom adjustment math for
  the M2 crop editor, and the derivative cache key (photoId+algorithm+exact
  transform; confidence/mode deliberately excluded — they describe, they
  don't transform). 21/21 unit tests.
- `pfDerivative` in `src/photos-workout.js` — renders the standardized 3:4
  view from the AUTHORITATIVE blob + validated normalization; session cache
  keyed by pfDerivKey (edited normalization ⇒ new key, stale derivative
  unreachable); source never re-encoded or written back.
- `tests/browser/c27-photo-frame.browser.test.js` — 10/10: quadrant-colored
  fixture proves WHICH source window the derivative shows by pixel probe;
  exact 3:4; deterministic + cached; invalidation on edit; source blob
  BYTE-IDENTICAL afterward; invalid metadata degrades to legacy; legacy
  records untouched; fixtures cleaned from IDB.

Incident during the build, recorded honestly: the generator was first
inserted mid-`processImage` (a text-anchor slice), which broke photo
preprocessing and left the new function scoped. c27's first run caught it
(ReferenceError), the block was relocated to top level, and c24 re-proved the
photo paths. Landmark-based insertion needs brace-awareness — the same lesson
as the .460 invite-handler cut.

---

# Progress-photo package — Milestone 2 record

The upload standardization review, per the plan's gate ("delivers value even
if live-camera work encounters device-specific issues").

- The pose-slot picker no longer saves directly: processImage → automatic
  suggestion (pfAutoSuggest) → review sheet with ORIGINAL and STANDARDIZED 3:4
  previews side by side, a status line, and four adjustment controls (zoom,
  up/down, left/right, ±7° level). Accept is explicit; Cancel saves nothing.
- The save is the UNCHANGED X2 add-then-delete chain, extracted verbatim to
  pfSaveProgress(); the W4 authority capture from the picker is revalidated at
  accept — c28 proves a stale capture refuses the save.
- Records carry `normalization` (validated) only when accepted; the source
  blob is stored exactly as before.
- Backup export bumped to version 2 (per-photo normalization); import accepts
  v2 AND v1 (legacy, no metadata) — both round-trip proven.
- Meal/daily photos and every other path untouched.

**Sync note (flagged, not smuggled):** the server `photos` collection has no
normalization column, so metadata is device-local + backup-carried for now. A
cross-device copy re-standardizes via the M5 queue, or we add ONE optional
text field to the collection — a tiny additive migration, but it is a server
schema change and therefore its own Owner/Architect-gated step. Decision
deferred deliberately.

Evidence: c28-photo-review.browser.test.js 12/12, driven through the real
change-listener flow with an in-page generated fixture; includes the
URL-lifecycle regression found by screenshot (the pose card's async refresh
revoked the open review's original preview — now review-owned, revoked at
close, pinned by the "actually DISPLAYS" arm).

---

# Progress-photo package — Milestone 3 record

The guided four-pose camera. One explicit chooser (Take guided photo / Upload
existing) before any permission ask; ONE getUserMedia grant and ONE stream for
the whole Front→Left→Right→Back session; fixed 3:4 viewport with head/foot/
center guides and device-orientation level feedback when the sensor speaks;
previous same-pose photo ghosted (default on, 48%, 10–75% live slider with
numeric value, remembered in wl_pf_overlay on this device only); the shutter
is the only capture and feeds the SAME M2 review (Retake returns to the live
camera; accept saves through pfSaveProgress and advances the sequence). The
ghost is a DOM layer the capture canvas never draws — c29 pixel-proves it is
absent from the captured bytes. Close, save-of-last-pose, permission denial,
and page-hide all stop every track; denial falls back to the upload picker.

Evidence: c29-guided-camera 16/16 under Chromium's fake camera device.
REMAINING for the M3 definition of done: the Owner's real-device iPhone
installed-PWA session (rear camera, portrait, all four poses) — scheduled
with him.
