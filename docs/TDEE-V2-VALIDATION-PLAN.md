# TDEE V2 — prospective validation plan (revision 2, per round-2 ruling 8)

Promotion evidence cannot come from replaying a past the parameters have
seen. Frozen-parameter, predefined-criteria protocol; this revision
incorporates the Architect's round-2 corrections.

## Protocol

1. **Freeze**: algorithm + every PARAMS value frozen at a named commit
   before the period begins. Any behavioral change restarts the clock; bug
   fixes (crash, NaN, date handling) are permitted and logged.
2. **Observe**: **56 consecutive days minimum for promotion** (28 days may
   be an interim review only). V2 runs headless; its daily audit trail and
   V1's daily output are recorded contemporaneously from the same data.
3. **No retuning** during the period.

## Predefined criteria

| # | criterion | bar |
|---|---|---|
| P1 | isolated weigh-in noise | on days whose weigh-in deviates ≥ 1.5 lb from the 7-day median without adjacent-day corroboration: displayed move < 50 kcal once the evidence label reads settling/established; < 100 while it reads early/developing |
| P2a | intake-transition false alarms | at most one trigger not corresponding to a real, athlete-confirmable intake change in 56 days |
| P2b | CUSUM false alarms | ≤ 2 shocks in any 56-day stretch without a sustained real change (the calibrated synthetic rate is median 1); every shock flagged in the trail |
| P3 | missing data | on days with NEITHER intake nor weigh-in: displayed estimate unchanged and spread non-decreasing. Days with exactly one input may update from it — that is the model working, not a violation — and are evaluated under P1/P4 |
| P4 | movement bound | unflagged day-over-day displayed movement < 50 kcal at settling/established; detector-trigger days must be flagged in the trail, bounded (< 100), and number ≤ 3 per 56 days combined (this second bound closes the trigger-exemption loophole) |
| P5 | causality + reproducibility | (a) each day's recorded output equals a fresh run over THAT day's data prefix (contemporaneous match); (b) the final-data fold reproduces every recorded prior day byte-identically — proving later data never rewrote earlier outputs |
| P6 | prediction sanity (weak, stated as such) | at each of days 14, 28, 42: freeze (estimate, planned intake) AT THAT ORIGIN and predict the weight median 14 days ahead; the realized 14-day median must land within 2× the then-current fluctuation sd. Origin-frozen — no final estimate predicts an earlier endpoint |

Explicitly NOT criteria: V1 agreement (shared assumptions — ruling 11),
formula agreement, or the Owner liking the number. A clean period
establishes **operational stability and consistency only** — physiological
accuracy would require an independent expenditure reference this protocol
does not have.

## Failure handling

Any failed criterion returns V2 to engineering with the trail as the
defect report; the clock restarts after the fix.

## Blocked until after promotion

UI (would have to say "experimental estimate"; no confidence-like language
exists to show), proposal-engine consumption (separate Owner decision with
floors/cooldowns/rollback), durable storage.
