# TDEE V2 — the estimator's mathematics (revision 3)

Revision 3, after the Architect's round-2 review (2026-08-13). Rev2's
defects, corrected here: the fold leaked future information backward
(global intake stats and noise estimates computed at the final date, used
from day one); missing-intake handling was mean imputation calling itself
"no imputation"; the (1+ρ)/(1−ρ) inflation misapplied an aggregate
correction per observation over a broken ρ estimator; the initialization
weigh-in escaped the evidence counts; CUSUM fired ~4×/42 quiet days.
Implementation: `src/tdee-core-v2.js`. V1 unchanged, production primary.

## 1. What is estimated

`T` = **expenditure consistent with the athlete's logged intake**.
Systematic under-recording (DLW literature) lowers `T` one-for-one;
uncorrectable from this data, stated everywhere the number appears. It is
the operationally right quantity for setting logged-calorie targets.

## 2. The model — three states, incremental daily observations

```
state  x = [ m   true body mass (weight units)
             T   logged-intake-consistent expenditure (kcal/day)
             u   persistent fluctuation mass (water/glycogen/gut) ]

dyn    m ← m + (I − T)/ρ        ρ = 3,500 kcal/lb · 7,700/kg (audit
       T ← T + w_T,  w_T ~ (0, σ_T²)          convention; bias stated §7)
       u ← φ·u + w_u,  w_u ~ (0, σ_u²(1−φ²))  AR(1), stationary sd σ_u

meas   scale = m + u + ε,  ε ~ (0, ε_sd²) iid  (quantization, posture)
```

Standard Kalman predict/update on the 3×3 covariance. **Each weigh-in and
each logged day enters exactly once.** Sticky water noise is an explicit
colored STATE (round-2 ruling 3's preferred direction), not a variance
multiplier: a heavy morning loads `u`, which decays at φ per day instead of
being re-explained daily. The 14/21/28/42-day windows remain diagnostic-only
raw observations (V1's pipeline, parity-tested); never assimilated.

## 3. Prefix-causality (round-2 ruling 1)

Every quantity used on day `d` — initialization prior, missing-intake
substitution, intake variability, σ_u, transition state, CUSUM statistics —
is computed from records dated ≤ `d`:

- **running intake mean/sd** (Welford), updated only after a day is consumed;
- **σ_u**: robust residual sd (repeated-median fit, MAD×1.4826, ε_sd
  deducted in quadrature, floored) over weigh-ins ≤ `d`, refreshed weekly;
- **initialization**: first weigh-in with a prior — `formulaTdee` when the
  caller supplies it (the app always does), else the running intake mean
  once ≥ 3 logged days exist. The init weigh-in counts as assimilated.

Two executable controls enforce this: appending arbitrary FUTURE records
leaves every trail entry dated ≤ today byte-identical, and every
truncated-prefix run reproduces the full run's contemporaneous entries
exactly (the P5 property).

## 4. Missing data — named for what it is

- **Unlogged intake**: the state transition substitutes the running
  past-only intake mean — **model-based substitution**, not "no
  imputation" — and adds mass-process variance `(max(300, running sd)/ρ)²`.
  The 300-kcal floor survives zero-variance logging (mutation-tested).
  Non-random missingness (unlogged days that were feast days) biases `T`
  with no in-data remedy: demonstrated adversarially (weekend-omission
  scenario, ≈ −185 kcal), surfaced by the evidence label refusing its upper
  rungs on poor recent coverage.
- **No weigh-in**: no update; `P_TT` grows by exactly σ_T² per day
  (mutation-tested to the quantity).

## 5. Change detection

- **Intake transition** (prefix-causal, generic — no medication term
  anywhere, statically asserted): recent-7 vs prior-14 complete-day means;
  trigger at `max(300 kcal, 15%)`; for 14 days after: extra fluctuation
  drive (`u` noise 0.3 lb/day) and a one-time `P_TT += 75²` shock.
- **CUSUM on standardized innovations** for drift without an intake signal.
  Constants were selected against **predefined targets** on synthetic
  distributions (25 seeds × 9 quiet regimes × 2 detection regimes; targets:
  false-alarm median ≤ 1 and 90th-pct ≤ 2 per 56 quiet days in every
  regime; median detection of a 600-kcal step ≤ 28 days) — result
  **k = 0.125, h = 8**, achieving false-alarm median/90th-pct of 1/1 and
  worst-regime median detection of 11 days. Full grid and the disclosed
  tie-break: `docs/TDEE-V2-CUSUM-CALIBRATION.md`. Rev2's k=0.05/h=2 is
  disqualified by its own row (~9–10 false alarms), confirming the review.

## 6. Outputs

Estimate (+ display rounded to 10 kcal); `stability` = √P_TT, explicitly
model-relative — never an accuracy or probability claim (no confidence or
range field exists; asserted by test); `evidenceLevel` from countable
record-derived facts (history, weigh-ins assimilated, last-14-day calorie
and weigh-in coverage computed from the records independent of filter
control flow, transition, window discrepancy), the facts returned beside
the label as the authoritative output. **The movement contract binds to
the label**: while it reads early/developing the number is stated to be
forming (convergence-sized moves permitted, bounded at 100); from
"settling" on, unflagged day-over-day movement is held under 50 kcal, and
detector-trigger days are flagged in the trail and bounded.

## 7. Stated limitations

1. ρ's dynamic bias (Hall): transition machinery reduces, does not remove.
2. AR(1) with fixed φ=0.5 is a design constant (swept in sensitivity);
   per-user φ estimation is a possible refinement, not claimed.
3. Systematically biased logging biases `T`; labeled, not corrected.
4. `stability` and the ladder are heuristics; the prospective protocol
   (docs/TDEE-V2-VALIDATION-PLAN.md) is the only path to stronger claims,
   and can establish operational stability — not physiological accuracy,
   which would need an independent expenditure reference.
