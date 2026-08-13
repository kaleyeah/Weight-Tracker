# TDEE V2 — engineering review summary (public repo copy)

This repository is public (it serves the GitHub Pages build), so this copy
carries NO logged personal data. The full review report, the owner-history
replay tables, and the V1 implementation review live outside the repository
in the Owner's private observation directory (`docs-private/`), alongside
the 56-day validation records.

State (2026-08-13): the V2 estimator (src/tdee-core-v2.js, revision 3 — a
prefix-causal three-state daily filter with a colored fluctuation state,
model-based missing-intake substitution, record-derived evidence labels,
and CUSUM change detection calibrated against predefined synthetic targets
with disjoint-seed holdout) passed Architect technical review after four
rounds. It is NOT production primary, has no UI, and feeds nothing. V1
(src/tdee-core.js) remains the Metabolism card's estimator. A 56-day
frozen-parameter prospective observation period governs any future
promotion decision; its protocol is docs/TDEE-V2-VALIDATION-PLAN.md and
its parameter-selection record is docs/TDEE-V2-CUSUM-CALIBRATION.md, both
free of personal data. The mathematics: src/TDEE-V2-MATH.md.

The current-day calorie completeness fix (a logged-but-unfinalized today no
longer counts as a complete day) ships with this build; its tests are
src/tdee-today-inprogress.test.mjs.
