# Compound iOS shell + HealthKit — scope

Captured 2026-07-30 from the Product Owner. This is the requirements record,
not a design. Nothing here is built yet.

## What it is

A small native iOS app that displays the existing Compound PWA in a web view,
plus a **read-only** HealthKit bridge that hands Apple Health data to the web
app. The PWA stays exactly what it is today — one HTML file — and gains a data
source it cannot reach from a browser.

HealthKit is unavailable to web pages by design. That is the entire reason a
native shell exists here. It is not a rewrite.

## Read-only, and that is a hard requirement

> "I do not want to write back, so it's got to be read only."

The shell requests **read** permission only. It never writes to Apple Health.
Anything the athlete logs in Compound stays in Compound.

## What to read on day one

Everything Apple Health already holds that Compound cannot measure itself.

**Body**

| Data | HealthKit type |
| --- | --- |
| Scale weight | `HKQuantityTypeIdentifier.bodyMass` |
| Body fat percent | `bodyFatPercentage` |
| Lean body mass | `leanBodyMass` |

**Nutrition** — the calorie total and its breakdown

| Data | HealthKit type |
| --- | --- |
| Calories | `dietaryEnergyConsumed` |
| Protein | `dietaryProtein` |
| Carbohydrates | `dietaryCarbohydrates` |
| Fat | `dietaryFatTotal` |
| Fiber | `dietaryFiber` |
| Caffeine | `dietaryCaffeine` |

The Product Owner said "basically all kinds of nutrients", so the bridge should
be written as a **list of types**, not six hand-rolled queries — adding sugar,
sodium, saturated fat or water later must be a one-line change.

**Activity and rest**

| Data | HealthKit type |
| --- | --- |
| Steps | `stepCount` |
| Sleep duration | `HKCategoryTypeIdentifier.sleepAnalysis` (asleep intervals, summed) |

## Explicitly NOT wanted

- **Exercise minutes, workouts, active energy.** Compound tracks training
  itself and the athlete does not want Apple's version of it competing.
- **Any write to HealthKit.**

## Prerequisites, before a single line is useful

| Requirement | Status |
| --- | --- |
| Apple Developer Program ($99/year) | not yet — PO can obtain |
| A Mac with Xcode | UNKNOWN — must confirm |
| A physical iPhone for testing | yes |
| TestFlight | not set up; comes with the developer account |

HealthKit cannot be tested in the simulator in any meaningful way, and an app
using it cannot be built or signed without Xcode on a Mac. These are hard
gates, not preferences.

## Distribution

Undecided. Two athletes today, so the realistic options are TestFlight (needs
the paid account, easy re-installs, 90-day builds) or App Store proper (needs a
privacy policy and a HealthKit usage justification in review). The Product
Owner intends to architect the wider process with the Product Architect.

## Sync implications

The Product Owner is also simplifying the sync model — single-device sign-in
instead of conflict resolution — which fits a phone app exactly: one person,
one device, save locally, upload when connected. HealthKit data flows in
through the shell, is stored by the PWA like any other entry, and syncs the
same way.

Nothing in the shell requires the compare-and-swap machinery.

## Open questions for the Product Architect

1. Does HealthKit data enter as ordinary Compound entries, or stay distinguishable
   as "imported from Health" so the athlete can tell what they typed themselves?
2. What happens on a conflict of source — the athlete logged 182.4 by hand and
   the scale wrote 182.6 to Health on the same day?
3. How far back does the first import reach? All history, or a window?
4. Import cadence — on launch, on foreground, on a pull-to-refresh, or a
   background delivery observer?
5. What does the app do when permission is denied or partially granted? A
   partial grant is normal and invisible: HealthKit does not reveal which types
   were refused.
