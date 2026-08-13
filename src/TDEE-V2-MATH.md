# TDEE V2 — the estimator's mathematics, stated before it was coded

Per the V2 spec and the handoff prompt: every consequential constant is
documented here with its rationale, none was chosen to make the output look
stable, and none was tuned toward a preferred value for the Owner's current
data. Implementation: `src/tdee-core-v2.js`. V1 (`src/tdee-core.js`) is
unchanged and remains production primary.

## 0. The three separated concepts (spec §2)

| concept | field | meaning |
|---|---|---|
| A. scale-weight trend | `weightTrendWeeklyByHorizon` | what the scale is doing (OLS slope × 7, V1's pipeline) |
| B. raw energy-balance observation | `rawEnergyBalanceTdee` (per horizon) | expenditure *implied* by intake + trend under 3,500 kcal/lb — an observation, not truth |
| C. estimated TDEE | `estimatedTdee` | the persistent best estimate the user sees |

## 1. Shape of the estimator: a one-dimensional Kalman filter

The spec's `newEstimate = previousEstimate + evidenceWeightedAdjustment`
with an *auditable, derived* weight is precisely a scalar Kalman filter, so
that is what V2 is — not because the name is impressive, but because it is
the standard answer to "estimate a slowly drifting hidden quantity from
noisy observations", and every term in it is inspectable:

- **State**: `T` (kcal/day), the estimated TDEE; `P` (kcal²), its variance.
- **Daily prediction**: true TDEE drifts, so `P ← P + Q` per elapsed day.
- **Daily update**, when an eligible observation `Z` with variance `R`
  exists:

  ```
  K  = P / (P + R)          the evidence weight — computed, never a constant
  T' = T + K (Z − T)
  P' = (1 − K) P
  ```

- **Cold start**: the first eligible observation sets `T = Z`, `P = R`.

The gain `K` **is** the spec §6 list, made quantitative: more valid history,
denser weigh-ins, steadier weight → smaller `R` → larger `K`; short history,
volatility, gaps, disagreement, transition → larger `R` → smaller `K`.
Every daily update is emitted in the audit trail with its `Z`, `R`, `K` and
the adjustment applied.

### No stored mutable state — the fold IS the persistence

The filter is **recomputed as a fold over the athlete's whole history** on
every calculation, one update per calendar day, deterministically. This
satisfies "retain the previous estimate" exactly (today's estimate is
yesterday's estimate plus one update — the recursion is real), while
avoiding a stored running value that could desync between phone and coach,
survive a data correction it should have reflected, or be double-updated by
a re-render. A backfilled or corrected old day changes the replay from that
day forward — the estimator always agrees with the data that exists, which
is the property this app's sync model actually needs. Measured cost on the
Owner's history is milliseconds (§8 of the review report).

## 2. The observation `Z` and its variance `R`

For each **horizon** `H ∈ {14, 21, 28, 42}` days ending on the update day,
compute with **V1's own accepted-weights pipeline** (daily median →
repeated-median outlier flag-and-exclude with all its guards → OLS on real
date offsets — spec §12 preserved by literal reuse, not reimplementation):

```
slope_H   OLS slope over accepted weigh-ins (units/day)
avg_H     mean calories over complete days
Z_H = avg_H − slope_H × calPerUnit          (kcal/day; 3,500/lb, 7,700/kg)
```

**Horizon eligibility** generalizes V1's tier ratios, which are exactly
6/7 (calorie days) and 5/7 (weigh-ins) of the window — 12/10 of 14, 18/15
of 21, 24/20 of 28 all reduce to those two fractions. So:

```
eligible(H): completeCalorieDays ≥ ceil(6H/7)
             acceptedWeighIns    ≥ ceil(5H/7)     (42-day: 36 and 30)
             longest missing-calorie run ≤ 2      (V1 rule, unchanged)
             history span ≥ H
```

**The primary observation is the longest eligible horizon** (spec §7:
longer windows carry more authority for absolute TDEE). Shorter eligible
horizons are computed for *disagreement detection* (§4 below), not
averaged in — overlapping windows are not independent evidence, and
inverse-variance pooling would overstate certainty.

**`R` is derived, not chosen** — three additive terms:

```
R = (SE_slope × calPerUnit)²      trend uncertainty: the OLS standard error
                                  of the slope, s/√Σ(x−x̄)², propagated
                                  through the energy conversion
  + (sd_cal / √m)²               intake uncertainty: standard error of the
                                  mean over the m complete days
  + (f × sd_cal)²                coverage penalty: f = fraction of window
                                  days with no complete calorie log; their
                                  intake is unknown, and treating the logged
                                  mean as the true mean on those days is an
                                  assumption that must cost variance
× inflation factors from §4       transition / disagreement, when active
```

Worked magnitude (28-day horizon, daily weigh-ins, ~1 lb residual noise,
sd_cal ≈ 400): SE_slope ≈ 0.023 lb/day → trend term ≈ 82 kcal; intake term
≈ 82 kcal; R ≈ 1.3×10⁴ kcal², i.e. an honest ±115 kcal on one window's
observation — which is why a raw window value should never be read as truth.

## 3. Process noise `Q` — how fast can true TDEE actually drift?

`Q = 25 kcal²/day` (σ ≈ **5 kcal/day per day**). Rationale: the
mass-driven component of expenditure falls with weight at roughly
15–20 kcal/day per kg (Mifflin's 10 kcal/kg BMR coefficient times an
activity factor of 1.5–1.7); at an aggressive 1 kg/week loss that is
2–3 kcal/day of drift per day. Doubling it to 5 covers adaptive
thermogenesis and NEAT variation without letting the estimate wander in
the absence of evidence. Consequences, stated: steady-state
`P_ss ≈ √(Q·R)` ≈ (24 kcal)² against the R above, giving a steady-state
gain `K ≈ 0.04` — a single weigh-in that moves the raw observation
100 kcal moves the estimate ~4 kcal (spec §3 satisfied by arithmetic, not
by rounding), and a genuine sustained 300-kcal change works in with a time
constant of roughly three weeks *unless* a transition is detected (§4),
which is the mechanism the spec provides for reacting faster when reacting
faster is justified.

## 4. Transitions and disagreement — when to trust the observation less, and when to adapt faster

Two detectors, both audit-visible, neither medication-aware (spec's
medication-neutrality rule: tirzepatide is context, never a term):

**Intake transition** (spec §8): mean intake over the last 7 complete days
vs the 14 complete days before that. Trigger when the difference exceeds
`max(300 kcal, 15%)` — 300 kcal ≈ 1.5–2× the day-to-day SEM of a
well-logged week, so ordinary variation cannot trip it; 15% scales it for
small eaters. For the **14 days** following a trigger (the physiological
window in which water/glycogen/gut-content dominate scale change after an
intake shift):

- observation variance is inflated: `R × 4` (doubles the claimed sd — the
  observation still counts, at a quarter of the weight);
- `P` gets a **one-time shock of +75² kcal²** at the trigger: a real phase
  change plausibly moves true TDEE by tens of kcal (NEAT, TEF of the new
  intake), so the filter is *allowed* to move faster while evidence
  accumulates — this is what keeps slow-reacting from becoming
  never-reacting (spec §13 check 5);
- the regime and its start date are flagged (`intake_transition`).

**Horizon disagreement** (spec §7): if any eligible shorter horizon differs
from the primary by more than `2·√(R_short + R_long)` — i.e., beyond what
their own claimed uncertainties explain — the observation's `R` is
inflated ×4 and `horizon_disagreement` is flagged. Confidence drops rather
than either window being declared right.

**Sustained innovation** (adaptive fallback): if the innovation `|Z − T|`
exceeds `2√(P+R)` on 5 consecutive update days, apply the same one-time
`P += 75²` shock and flag `sustained_innovation`. This catches a genuine
expenditure change that arrives *without* a detectable intake transition
(e.g. a new job on your feet), and is the standard adaptive-Kalman answer
to "smoothing must not permanently suppress real change".

All three constants (300 kcal / 15%, ×4, 75²) are design constants, not
fits: they were set from the magnitudes above before the Owner replay was
run, and the replay is reported with them untouched.

## 5. What a missing day does

No observation (no eligible horizon that day): `T` holds, `P` grows by
`Q` — the estimate does not move, the uncertainty honestly widens. No
imputation anywhere, same as V1. The in-progress current day is not a
complete day (the V1 fix, shared by V2 through the same adapter rule).

## 6. Confidence and the displayed number (spec §9, §11)

- **Numeric score**: `confidence = 1 / (1 + sd/80)` where `sd = √P` —
  a monotone map with no tuning; sd 40 → 0.67, sd 80 → 0.50, sd 160 → 0.33.
- **Level**: the *lower* of the sd-based level (sd ≤ 50 high · ≤ 90 good ·
  ≤ 140 moderate · else low) and the history cap from the spec §5 table
  (14–20 days → low, 21–27 → moderate, 28–41 → good, 42+ → high). History
  caps the label so a lucky-quiet fortnight cannot claim high confidence.
- **Estimated range**: `T ± 1.28·sd`, displayed as "estimated range" — the
  80% interval *if* the model's assumptions held; deliberately not called a
  confidence interval (spec §9's own wording).
- **Display**: `~` + `T` rounded to the nearest **10** kcal. Movement of a
  few kcal/day disappears into the rounding; movement worth seeing does not.

## 7. Audit output (spec §10)

Every calculation returns: the full per-day update trail (date, primary
horizon, `Z`, `R` and its three components, inflation factors and reasons,
`K`, innovation, adjustment applied, `T`, `P`), per-horizon trend / intake /
raw observation / eligibility, accepted and excluded weights with reasons
(V1's audit passed through), regime state and trigger dates, flags,
confidence score/level/range, and the equivalent V1 result for comparison.
Nothing is computed that is not returned.

## 8. Known limitations, stated

- Transition-period scale change is **biased**, not merely noisy (water
  loss is systematically downward); variance inflation lowers its weight
  but cannot remove the bias. The honest fix would be a two-compartment
  mass model; that is out of scope and flagged as an open question in the
  review report.
- `R`'s coverage term treats unlogged days as random-mean days; if
  unlogged days are systematically high-intake days (the classic failure
  mode), the observation is biased high and no variance term fixes that.
  V1 had the same property; the confidence machinery at least names it
  (`calorie_gaps_present`).
- The 3,500 kcal/lb convention is retained for the observation (spec §2B
  explicitly allows this initially); its error is largest exactly where
  the transition machinery already reduces trust.
