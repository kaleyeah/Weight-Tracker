# TDEE V2 — prospective validation plan (B-round ruling 12)

The promotion decision requires evidence that cannot come from replaying the
past through a model whose parameters could have been (however carefully)
influenced by having seen that past. This is the frozen-parameter,
predefined-criteria protocol.

## Protocol

1. **Freeze**: the algorithm and every PARAMS value are frozen at a named
   commit before the observation period begins. Any change during the
   period restarts the clock.
2. **Observe**: ≥ 28 consecutive days of ordinary use. V2 runs headless
   (no UI, no proposal consumption); its daily audit trail is recorded
   alongside V1's daily output — both computed from the same data at the
   same time each day.
3. **No retuning**: the recorded trail is not inspected for parameter
   adjustment during the period. Bugs (crashes, NaNs, wrong dates) may be
   fixed; behavioral constants may not move.

## Predefined pass criteria (all measured on the recorded trail)

| # | criterion | bar |
|---|---|---|
| P1 | stability under isolated weigh-in noise | on every day whose weigh-in deviates ≥ 1.5 lb from the 7-day median with no adjacent-day corroboration, the displayed estimate moves < 50 kcal |
| P2 | response to sustained change | if a ≥ 300 kcal sustained intake change occurs, the transition detector fires within 7 days; if none occurs, it fires at most once spuriously in the period |
| P3 | robustness to missingness | on every unlogged/unweighed day the displayed estimate moves 0 and spread does not shrink |
| P4 | no discontinuities | max day-over-day displayed movement < 50 kcal except on a transition/CUSUM trigger day, each of which is flagged in the trail |
| P5 | audit reproducibility | re-running the fold offline over the period's final data reproduces every recorded daily estimate exactly (determinism check) |
| P6 | prediction sanity (weak, stated as such) | the 14-day-ahead weight predicted from (final estimate, planned intake) lands within 2× the estimated scale-noise sd of the actual 14-day weight median — a coarse consistency check, not calibration |

Explicitly NOT criteria: agreement with V1 (shared assumptions — ruling 11),
agreement with a formula estimate, or the Owner liking the number.

## What failure means

Any failed criterion returns V2 to engineering with the trail as the defect
report. Two clean periods (56 days total) are the recommended evidence for
the Owner's promotion decision, alongside the standing caveats: uncalibrated
spread, logged-intake-consistent semantics, transition bias.

## Out of scope until after promotion

UI presentation (must say "experimental estimate" if shown at all during
the period — B-round ruling 13), proposal-engine consumption (separate Owner
decision with floors/cooldowns/rollback — ruling 14), any durable storage.
