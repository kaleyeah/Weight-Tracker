# TDEE V2 — the estimator's mathematics (revision 2)

Revision 2, after the Architect's review of 2026-08-13. Revision 1's central
defect: it assimilated a rolling multi-day window every day as if each day
brought independent evidence, so its variance shrank illegitimately and its
"confidence" claimed unearned precision; several of its variance terms were
also invented (the coverage penalty) or rested on unestablished assumptions
(iid OLS residuals, independent-window disagreement). This revision replaces
the observation model and withdraws every calibrated-uncertainty claim.
Implementation: `src/tdee-core-v2.js`. V1 unchanged, production primary.

## 1. What is estimated, honestly stated

`T` = **expenditure consistent with the athlete's logged intake**. Systematic
intake under-recording (well documented in the doubly-labeled-water
literature) lowers `T` one-for-one; nothing here corrects that, because
nothing in the data can. Stated plainly: `T` is the number that makes the
logs and the scale agree — which is the operationally correct quantity for
setting logged-calorie targets, and NOT a laboratory TDEE.

## 2. The model — incremental daily observations, each used once

Two-state linear-Gaussian state space, one step per calendar day:

```
state       x = [ m  true body mass (weight units)
                  T  logged-intake-consistent expenditure (kcal/day) ]

dynamics    m ← m + (I − T)/ρ        I = that day's complete logged intake
            T ← T + w_T              w_T ~ (0, σ_T²)
ρ = 3,500 kcal/lb (7,700/kg)         the audit convention; its dynamic bias
                                     is a stated limitation (§7), not hidden

measurement scale weight = m + v     v = daily fluctuation (water, glycogen,
                                     gut content), autocorrelated
```

Standard Kalman prediction and update. **Each weigh-in and each logged day
enters the estimator exactly once** — the rev1 overlap defect is structurally
gone. The multi-day windows (14/21/28/42, V1's exact pipeline, parity-tested)
remain as *diagnostic raw observations* for the audit trail and detail view;
they are never assimilated.

There is no stored state: the filter is a deterministic fold over the whole
history (one update per day), so the recursion "new = previous + update" is
real while phone and coach can never desync and corrections replay cleanly.
Cost on the Owner's history: ~10 ms.

## 3. Measured-from-data quantities (measurements, not knobs)

- **Scale-noise sd**: 1.4826 × MAD of residuals against a repeated-median
  fit over all accepted daily weights (V1's own robust machinery), floored
  at 0.7 lb / 0.32 kg — below ordinary physiological fluctuation nothing is
  diagnostic (same argument as V1's outlier floor).
- **Lag-1 autocorrelation ρ₁** of date-adjacent residuals (clamped to
  [0, 0.8], defaulted to 0.3 when < 5 adjacent pairs exist). Water noise is
  sticky; an autocorrelated reading carries less information than an iid
  one, handled with the standard effective-information inflation:
  `R_w = sd² (1+ρ₁)/(1−ρ₁)`. This addresses the review's iid-residual
  objection at the measurement layer; it is an approximation (an AR(1)
  noise STATE would be exact) and is listed as an open refinement.
- **Intake mean and sd** over complete days — used only for missing-day
  uncertainty (§4) and the cold-start prior fallback.

## 4. Missing data

- **Unlogged intake day**: the dynamics use the intake mean as the best
  available value AND add mass-process variance
  `((intake_sd · mult) / ρ)² + (300/ρ)²` — the 300-kcal floor keeps the
  penalty alive when logged days have zero variance (the rev1 flaw the
  review named, now mutation-tested). What no variance term can fix:
  *systematically* biased missingness (unlogged days being feast days)
  biases `T` — demonstrated in the test suite with the weekend-omission
  adversary (estimate reads ~185 kcal low) and surfaced honestly: the
  evidence label refuses its top rungs when recent coverage is poor.
- **No weigh-in**: no measurement update; `T`-variance grows by `σ_T²` per
  day (mutation-tested to the exact quantity).

## 5. Tuning parameters — every one an explicit knob, all swept

The one-at-a-time sensitivity table (docs/TDEE-V2-SENSITIVITY.md) reports
spike response, 30-day adaptation, false-trigger rate, maintenance error and
abrupt-cut error for each knob at ±values around default. None is claimed
calibrated. Defaults and rationale:

| knob | default | rationale |
|---|---|---|
| σ_T | 5 kcal/day/day | ~2× the mass-driven drift of expenditure at aggressive loss rates (Mifflin weight coefficient × activity) |
| prior T sd | 400 kcal | weak prior around `formulaTdee` (already user-visible) or the intake mean |
| transition trigger | max(300 kcal, 15%) on 7-day vs prior-14-day complete-day means | ~2× a well-logged week's SEM; scales for small eaters |
| transition window | 14 days | the water/glycogen settling scale after an intake shift |
| transition mass noise | 0.3 lb/day | non-energy mass movement while active (glycogen ~3 lb over a week) |
| transition T shock | 75² kcal² | a phase change plausibly moves true expenditure by tens of kcal (NEAT, TEF) |
| CUSUM k | 0.05 | textbook k = δ/2 where δ ≈ 0.1σ is the innovation bias a 300-kcal T-error produces **through this model's own geometry** ((ΔT/ρ)/√S) |
| CUSUM h | 2 | detection in ~2 weeks on a 600-kcal step vs ~1 false trigger per 10 quiet days; a false trigger only widens variance briefly (maintenance error stays 0) — the sweep shows the whole trade |
| discrepancy flag | 250 kcal | heuristic label threshold; no σ interpretation claimed |

## 6. Outputs — no probabilistic claims

- `estimatedTdee` (+ display rounded to 10 kcal).
- `stability` = √P_TT — **model-relative settledness under the model's own
  assumptions**, exposed for audit and trend. It is NOT a calibrated
  uncertainty; no confidence percentage or range field exists (the test
  suite asserts their absence).
- `evidenceLevel` ∈ insufficient / early / developing / settling /
  established — built from countable facts only (history days, weigh-ins
  assimilated, 14-day calorie and weigh-in coverage, active transition,
  window discrepancy), each fact returned alongside the label. The upper
  rungs require current coverage, not just history length.
- Full per-day audit trail: intake, weigh-in, innovation, gain, adjustment,
  T, √P_TT, CUSUM level, transition triggers and shocks; per-window
  diagnostics with V1-parity raw observations; regime state; flags.

## 7. Stated limitations

1. **ρ = 3,500 kcal/lb is dynamically wrong** during composition change and
   early water shifts (Hall's work). Transition machinery reduces — does
   not remove — the resulting bias. A two-compartment mass model is the
   honest fix and is out of scope this round.
2. **Autocorrelation as R-inflation** is an approximation of an AR(1) noise
   state.
3. **Systematically biased logging** (missingness correlated with intake,
   day-level under-recording) biases `T` with no in-data remedy; labeled,
   demonstrated adversarially, not corrected.
4. `stability` and the evidence ladder are heuristics; prospective
   evaluation (docs/TDEE-V2-VALIDATION-PLAN.md) is the path to any
   stronger claim.
