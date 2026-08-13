# TDEE V2 rev3 — one-at-a-time parameter sensitivity (round-2 ruling 4 continued)

Deterministic synthetic harness, no Owner data. Metrics: spike = movement
from a one-day +2 lb reading (day 31, settled filter); adapt30 = movement 30
days after a true 2200→2800 step (600 is perfect); false triggers =
transition+CUSUM firings across 42 quiet days; maint err = |estimate−2500|
after 42 clean days; cut err = |estimate−truth| 14 days into an abrupt
1,000-kcal cut with −4 lb early water (the transition-bias scenario — this
column is where ρ's dynamic bias shows, and no knob removes it).

Defaults were frozen BEFORE this table was generated (CUSUM by the separate
predefined-target calibration; the rest by the documented rationale) and
were not adjusted afterward.

| knob | spike kcal | adapt30 kcal | false triggers/42d | maint err kcal | cut err kcal |
|---|---:|---:|---:|---:|---:|
| default | 24.1 | 408 | 0 | 11 | 200 |
| sigmaT=2.5 | 23.9 | 401 | 0 | 11 | 197 |
| sigmaT=10 | 24.7 | 416 | 0 | 12 | 208 |
| priorTsd=200 | 26.8 | 413 | 0 | 11 | 196 |
| priorTsd=800 | 24.6 | 390 | 0 | 12 | 201 |
| phiU=0.3 | 33.4 | 458 | 0 | 12 | 230 |
| phiU=0.7 | 19.1 | 352 | 0 | 11 | 166 |
| epsSd.lb=0.15 | 25.7 | 405 | 0 | 12 | 195 |
| epsSd.lb=0.6 | 27.2 | 385 | 0 | 12 | 203 |
| uSdFloor.lb=0.3 | 22.5 | 483 | 0 | 12 | 202 |
| uSdFloor.lb=1.2 | 23.4 | 328 | 0 | 11 | 170 |
| missingIntakeFloorKcal=150 | 24.1 | 408 | 0 | 11 | 200 |
| missingIntakeFloorKcal=600 | 24.1 | 408 | 0 | 11 | 200 |
| transition.absKcal=200 | 24.1 | 408 | 0 | 11 | 200 |
| transition.absKcal=450 | 24.1 | 408 | 0 | 11 | 193 |
| transition.activeDays=7 | 24.1 | 408 | 0 | 11 | 199 |
| transition.activeDays=21 | 24.1 | 408 | 0 | 11 | 200 |
| transition.uNoise.lb=0.15 | 24.1 | 408 | 0 | 11 | 211 |
| transition.uNoise.lb=0.6 | 24.1 | 408 | 0 | 11 | 159 |
| transition.tShock=0 | 24.1 | 408 | 0 | 11 | 168 |
| transition.tShock=22500 | 24.1 | 408 | 0 | 11 | 274 |
| cusum.k=0.0625 | 28.0 | 413 | 0 | 11 | 200 |
| cusum.k=0.25 | 24.1 | 378 | 0 | 11 | 195 |
| cusum.h=4 | 27.5 | 483 | 0 | 11 | 216 |
| cusum.h=12 | 24.1 | 366 | 0 | 11 | 187 |
| cusum.tShock=0 | 24.1 | 308 | 0 | 11 | 191 |
| cusum.tShock=22500 | 24.1 | 573 | 0 | 11 | 223 |
| discrepancy=150 | 24.1 | 408 | 0 | 11 | 200 |
| discrepancy=400 | 24.1 | 408 | 0 | 11 | 200 |
