# TDEE V2 — CUSUM calibration record (round-2 ruling 6)

## Targets, predefined before any run

- **False alarms** (quiet maintenance): median ≤ 1 AND 90th percentile ≤ 2
  shocks per 56 evaluated days, in EVERY quiet regime.
- **Detection**: median delay ≤ 28 days after a true sustained 600-kcal
  expenditure step at constant intake, in EVERY detection regime.
- **Selection rule**: among qualifying (k, h), minimize the worst-regime
  median delay; ties → larger h. (Addendum applied at selection, disclosed:
  the delay+h tie across k was broken by lowest 90th-percentile false-alarm
  rate — k=0.125 — decided from the synthetic table only.)

## Regimes and replication

Quiet: fluctuation sd {0.7, 1.0, 1.4} lb × AR(1) φ {0.3, 0.5, 0.7} = 9
regimes. Detection: sd 0.9/φ 0.5 with daily and 5-of-7 weigh-in coverage.
25 deterministic seeds per cell; grid k ∈ {0.05…0.2} × h ∈ {2,3,4,6,8,10};
the estimator run is the real rev3 filter with the real shock mechanism.
No Owner data anywhere.

## Frozen selection ordering (complete, stated before the holdout ran)

Total order among candidates: (1) qualify on both targets in every
calibration regime; (2) minimize worst-regime median detection delay;
(3) prefer larger h; (4) prefer lower worst-regime false-alarm 90th
percentile; (5) prefer smaller k. This yields a unique choice with no
discretionary step. Under this ordering the calibration table selects
**k = 0.125, h = 8** (delay 11 ties at h=8 across k; 90th-pct 1 beats 2;
smallest such k is 0.125 since 0.15 has delay 12).

## Holdout acceptance (criteria frozen before running)

Disjoint seeds (offset +5000, never used in calibration), evaluated at the
SELECTED pair only — calibration seeds are not acceptance evidence:

- H1 (false alarms): quiet median ≤ 1 AND 90th-pct ≤ 2 per 56 days in every
  quiet regime, now including 20%-missing-intake and 5-of-7-weigh-in
  variants of the 3×3 noise grid.
- H2 (detection): 600-kcal step median delay ≤ 28 days in every detection
  regime, now including an INTAKE-TRANSITION-OVERLAP regime (the intake
  drops 800 kcal at the same time expenditure steps).
- H3 (diagnostic only, no pass/fail): 300-kcal step and a gradual 600-kcal
  ramp over 30 days — small/slow changes are not required to be detected;
  their detection rates are reported for the record.

## Result (calibration set)

**k = 0.125, h = 8**: worst-regime false-alarm median 1, 90th-pct 1;
worst-regime median detection 11 days. The rev2 values (k=0.05, h=2) are
disqualified by their own row: median ~9–10 false alarms per 56 quiet days —
the review's objection, confirmed quantitatively. Full grid:

    k     h   FA-ok DET-ok worstFAmed worstFA90 worstDelay
    0.050  2   NO   yes      10       12         4
    0.050  3   NO   yes       6        8         5
    0.050  4   NO   yes       4        5         6
    0.050  6   NO   yes       2        4         9
    0.050  8   yes  yes       1        2        11
    0.050 10   yes  yes       1        1        12
    0.075  2   NO   yes      10       12         5
    0.075  3   NO   yes       6        7         5
    0.075  4   NO   yes       4        5         6
    0.075  6   NO   yes       2        3        10
    0.075  8   yes  yes       1        2        11
    0.075 10   yes  yes       1        1        12
    0.100  2   NO   yes       9       12         5
    0.100  3   NO   yes       5        7         5
    0.100  4   NO   yes       4        5         9
    0.100  6   NO   yes       2        3        10
    0.100  8   yes  yes       1        2        11
    0.100 10   yes  yes       0        1        13
    0.125  2   NO   yes       9       11         5
    0.125  3   NO   yes       5        7         6
    0.125  4   NO   yes       3        5         9
    0.125  6   NO   yes       2        3        10
    0.125  8   yes  yes       1        1        11
    0.125 10   yes  yes       0        1        16
    0.150  2   NO   yes       8       11         5
    0.150  3   NO   yes       5        6         6
    0.150  4   NO   yes       3        4         9
    0.150  6   NO   yes       1        3        10
    0.150  8   yes  yes       1        1        12
    0.150 10   yes  yes       0        1        16
    0.200  2   NO   yes       7       10         5
    0.200  3   NO   yes       4        6         6
    0.200  4   NO   yes       2        4         9
    0.200  6   NO   yes       1        3        11
    0.200  8   yes  yes       0        1        13
    0.200 10   yes  yes       0        1        16
    
    qualifying, by rule: k=0.05,h=8,delay=11  k=0.075,h=8,delay=11  k=0.1,h=8,delay=11  k=0.125,h=8,delay=11  k=0.05,h=10,delay=12

## Holdout result (disjoint seeds +5000, run after freezing the criteria above)

```
== H1 quiet false alarms (median / 90th per 56 evaluated days) ==
  sd=0.7 phi=0.3 full    median=0 p90=0 
  sd=0.7 phi=0.3 missCal median=0 p90=0 
  sd=0.7 phi=0.3 sparseW median=0 p90=0 
  sd=0.7 phi=0.5 full    median=0 p90=0 
  sd=0.7 phi=0.5 missCal median=0 p90=0 
  sd=0.7 phi=0.5 sparseW median=0 p90=0 
  sd=0.7 phi=0.7 full    median=0 p90=0 
  sd=0.7 phi=0.7 missCal median=0 p90=0 
  sd=0.7 phi=0.7 sparseW median=0 p90=0 
  sd=1 phi=0.3 full    median=0 p90=0 
  sd=1 phi=0.3 missCal median=0 p90=0 
  sd=1 phi=0.3 sparseW median=0 p90=0 
  sd=1 phi=0.5 full    median=0 p90=1 
  sd=1 phi=0.5 missCal median=0 p90=1 
  sd=1 phi=0.5 sparseW median=0 p90=1 
  sd=1 phi=0.7 full    median=0 p90=1 
  sd=1 phi=0.7 missCal median=0 p90=1 
  sd=1 phi=0.7 sparseW median=0 p90=1 
  sd=1.4 phi=0.3 full    median=0 p90=1 
  sd=1.4 phi=0.3 missCal median=0 p90=1 
  sd=1.4 phi=0.3 sparseW median=0 p90=1 
  sd=1.4 phi=0.5 full    median=1 p90=1 
  sd=1.4 phi=0.5 missCal median=1 p90=1 
  sd=1.4 phi=0.5 sparseW median=0 p90=1 
  sd=1.4 phi=0.7 full    median=1 p90=2 
  sd=1.4 phi=0.7 missCal median=1 p90=2 
  sd=1.4 phi=0.7 sparseW median=1 p90=1 
H1: PASS
== H2 600-kcal step detection (median delay days) ==
  cov=7: median delay 10
  cov=5: median delay 12
  cov=7 +intake-transition overlap: median delay 13
H2: PASS
== H3 diagnostics (not pass/fail) ==
  step300: detected in 25/25 runs within 60 days
  ramp600: detected in 25/25 runs within 60 days

HOLDOUT: ACCEPTED at k=0.125, h=8
```
