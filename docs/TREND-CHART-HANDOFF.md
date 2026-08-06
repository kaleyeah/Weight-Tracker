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
