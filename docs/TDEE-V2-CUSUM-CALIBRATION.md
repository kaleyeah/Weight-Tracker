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

## Result

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
