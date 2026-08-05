# Measured TDEE — the formula, in full

What the app calculates, why each part is there, and what it deliberately
does not do. Implementation: `src/tdee-core.js`. Tests: `src/tdee-core.test.mjs`
(27 acceptance cases) and `src/tdee-integration.test.mjs` (the shipped path).

---

## 1. The idea in one line

Energy in, minus energy stored, equals energy burned.

```
TDEE  =  average calories eaten  +  calories released by losing weight
```

If you ate 2,000/day and lost weight, you burned more than 2,000. How much
more is exactly the energy that came out of storage.

## 2. The formula

```
measuredTdee = averageDailyCalories − (weeklyWeightChange × caloriesPerUnit / 7)
```

With pounds (3,500 kcal/lb) this simplifies to:

```
measuredTdee = averageDailyCalories − (weeklyWeightChangeLb × 500)
```

Weight loss is **negative**, so subtracting it *raises* the estimate.

| | |
|---|---|
| `caloriesPerUnit` | 3,500 per lb · 7,700 per kg |
| worked example | 1,780 kcal, −1.5 lb/wk → `1780 − (−1.5 × 500)` = **2,530** |
| stable weight | 2,300 kcal, 0.0 lb/wk → **2,300** — burn equals intake |
| gaining | 2,200 kcal, +0.5 lb/wk → **1,950** — burn is *below* intake |

3,500 kcal/lb is an approximation (real tissue is a fat/lean mix and water
shifts confound it). It is the standard energy-balance convention and is
accurate enough over weeks, which is why every guard below exists to make
the *inputs* trustworthy rather than to refine this constant.

## 3. The weight trend — least squares, not endpoints

**Never `lastWeight − firstWeight`.** A single water-heavy morning at either
end would swing the whole answer.

Instead, fit an ordinary least-squares line through **every** accepted
weigh-in, then take the slope:

```
for each accepted daily weight:
    x = whole days since the window began     (real date offsets, not
    y = the weight                             observation numbers)

slope = Σ(x − x̄)(y − ȳ) / Σ(x − x̄)²          ← units per day
weeklyWeightChange = slope × 7
```

Using real date offsets matters: if you weigh Mon, Tue, then skip to the
following Monday, that gap is 6 days, not 1. Treating them as consecutive
observations would read the trend as far steeper than it is.

### One honest limitation

Least squares is **not** outlier-proof. A reading at the *edge* of the window
carries high leverage — a +4 lb water spike on the oldest day pulled a
−0.70 lb/wk trend to about −0.34 in testing.

The spec's answer is to **flag and audit**, never to silently delete a real
reading. Outlier *detection* is specified but **not yet implemented** — a
known gap, not a solved problem.

## 4. The calorie average

```
averageDailyCalories = Σ(calories on complete days) / (number of complete days)
```

- Only **explicitly complete** days count.
- A missing day is **never** entered as zero, and never as your target.
  Both would silently drag the average and corrupt the answer.
- A partially logged day does not count as complete.
- The value is whatever the app's nutrition normalisation already produced —
  the TDEE code never recomputes calories from macros.

**Owner ruling, 2026-08-05:** a *logged* day counts as complete; an explicitly
skipped day and an absent day both do not. *"It's only as good as honest as
the input is."*

## 5. Confidence tiers

The same maths runs at every tier; only trust differs.

| Status | Window | Complete calorie days | Weigh-in days |
|---|---:|---:|---:|
| insufficient | under 14 days of history | — | — |
| provisional | 14 | 12 | 10 |
| reliable | 21 | 18 | 15 |
| high confidence | 28 | 24 | 20 |

Rules:

- **History span counts.** Thirteen perfect days cannot satisfy the 14-day
  tier, even though 13 ≥ 12. You must actually *have* the history.
- **No more than 2 consecutive** missing or incomplete calorie days inside a
  window. Three in a row disqualifies that tier.
- If a longer tier fails, the **next shorter** tier is tried — data is never
  manufactured to reach a tier.

## 6. Weigh-ins

- **One value per calendar date.** Multiple readings on a date collapse to the
  authoritative one if the app defines one, otherwise the **median** — which
  neutralises a single freak reading without deleting anything.
- Dates are the **athlete's local dates**. A 7pm Chicago weigh-in is that
  day's, not the next UTC day's.

## 7. Off-plan periods

Vacation, illness and similar are **visible context**, not hidden corrections.

**Owner ruling, 2026-08-05: visible.** They are flagged
(`off_plan_days_in_window`) and lower confidence — and they still count as
missing days, so a long break can legitimately block a tier. The previous
implementation silently dropped them from the average, which concealed a
coverage problem rather than reporting it.

## 8. What the engine will never do

- Change calories, macros, steps, cardio or phase. It returns a number and an
  explanation; applying anything requires the existing explicit approval flow.
- Call an AI model, touch the UI, or write to storage. It is a pure function.
- Claim laboratory accuracy, substitute BMR for TDEE, or use a wearable's
  calorie-burn figure as the answer.
- Trigger a calorie cut because a period was off-plan.

## 9. Output

Every calculation returns a full audit record: status, window start/end,
window length, complete-calorie-day count and requirement, weigh-in count and
requirement, average intake, weekly trend, **raw** TDEE (unrounded) and
**display** TDEE (rounded), the formula estimate for comparison, confidence
flags, the specific excluded or incomplete days, and a timestamp.

Rounding happens **only** at display. Internals keep full precision.

## 10. How to sanity-check a result

1. **Do the arithmetic yourself** — intake plus (weekly loss × 500) should land
   near the shown figure.
2. **Compare against the formula estimate**, shown beside it. A large gap is
   informative, not automatically wrong.
3. **Judge it as a prediction.** If it says 3,000, eating 2,500 should lose
   about 1 lb/week. Two weeks of holding that is the real test.

Most common cause of an inflated estimate: **under-logged food**. Calories you
ate but did not record get credited to your metabolism.

Second most common: **early-diet water loss** read as fat loss, which
overstates the trend and therefore the burn. Expect an early number to settle
downward as the window rolls forward.

---

## Appendix — what this replaced

`src/legacy/tdee-pre-spec-449.js` holds the previous implementation verbatim
(shipped as `2026-08-04.449-tdeewindow`).

It compared a **first-3 weigh-in average against a last-3 average** — a
two-point method the spec forbids — had a single pass/fail bar instead of
tiers, produced no audit record, and silently dropped off-plan days.

Before *that*, it used a fixed 21-day window with **7-day bands** at each end.
On any stretch shorter than ~24 days those bands nearly meet, so their centres
fell under the code's own 10-day minimum separation: it blocked itself using
data that satisfied it. Both the 21 and the bands arrived in one unexplained
commit with no recorded rationale.
