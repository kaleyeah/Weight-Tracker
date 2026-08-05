# Native Lite shell — provisional decisions (Owner sign-off at Phase-5 start)

Prepared 2026-08-05 per the Architect's DECISION-REGISTER (items 1–4). These
are recorded recommendations, not final rulings — each gets the Owner's
explicit yes/no when Phase 5 actually begins. Nothing here authorizes native
work.

## 1. Primary iPhone experience — RECOMMEND the Architect's default

The native Lite shell (WKWebView wrapping the PWA) becomes the primary iPhone
experience because only it can read HealthKit; the Safari-installed PWA stays
a fully supported second client with its own device identity. The alternative
(native app imports HealthKit to the server while the user lives in Safari)
splits the experience and needs a separate native auth UI — rejected by the
Architect's own analysis.

## 2. Minimum supported iOS — RECOMMEND iOS 16

Rationale: the Owner's devices are current-generation; the app's ES5 +
Promise/fetch/IndexedDB floor is far below iOS 16; WKWebView's app-managed
persistent data store and HealthKit APIs needed here are all comfortably
available at 16+. Setting the floor at 16 (rather than 17/18) costs nothing
today and keeps an older iPad viable as a second client. Revisit only if a
needed HealthKit type demands newer.

## 3. HealthKit read permissions — RECOMMEND the smallest launch list

Read-only, matching what the app already imports via the Shortcut today:

| Type | Why |
|---|---|
| Body mass | the weigh-in stream |
| Dietary energy | calorie totals |
| Dietary protein / carbohydrates / fat | macro totals |
| Step count | NEAT tracking (pillar 4) |
| Sleep analysis | sleep duration (pillar 5) |
| Body fat percentage | lean-mass context the coach already uses |

Explicitly NOT requested at launch: heart rate, workouts, HRV, resting HR,
active energy — the app computes its own training picture from logged lifts,
and every added type is added disclosure. Add later only with a product
reason and updated disclosure (register rule).

## 4. Account switching on one device — RECOMMEND the register's default

One active athlete per installation. Switching requires pending work to sync
or be explicitly preserved, then isolates the previous account's local cache
(the per-uid key families already implement most of this). Matches the
existing ownership gate and single-user reality.

## Register items 5–10 (coach expansion, public launch)

Deliberately untouched — they concern coach tenancy and paid-launch policy,
neither in scope for any current phase.
