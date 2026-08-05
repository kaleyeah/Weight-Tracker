# Retired tests — assertion-level ledger (generated)

**Authoritative data: `docs/RETIRED-TESTS-LEDGER.csv`** — one row per test
case, generated from the deleted suites at `git show 3044bf8^:tests/…` and
audited by protected property (round-3 corrections: digest-grammar and
artifact/account-scope rows reclassified OBS-CODE; recap-merge assertions
OBS-BEHAV with citation). This file is a generated summary and carries no
information the CSV does not.

Verdicts: COVERED = a named live assertion protects the same property;
OBS-CODE = the symbol asserted has zero occurrences (named in the row);
OBS-BEHAV = the product behaviour was retired (release/ruling cited in the
row); PORTED = re-implemented in tests/browser/c23-characterization.

## Tally — exact
| Disposition | Cases |
|---|---|
| COVERED | 159 |
| OBS-CODE | 129 |
| OBS-BEHAV | 26 |
| PORTED | 14 |
| **Total** | **328** |

## Per suite

| Suite | COVERED | OBS-CODE | OBS-BEHAV | PORTED |
|---|---|---|---|---|
| c1-emergency-hotfix | 14 | 5 | 4 | 3 |
| c10-cas-client | 72 | 32 | 0 | 0 |
| c1b-write-freeze | 7 | 14 | 7 | 0 |
| c1d-coach-equality | 11 | 6 | 6 | 0 |
| c1e-adoption-race | 12 | 8 | 4 | 0 |
| c1f-destructive-guard | 19 | 7 | 0 | 0 |
| c1g-identity-manifest | 9 | 17 | 0 | 0 |
| c1h-reopen-recap | 0 | 4 | 5 | 11 |
| m1-photo-ownership | 0 | 14 | 0 | 0 |
| m2-photo-pagination | 0 | 14 | 0 | 0 |
| m3-revisions | 15 | 0 | 0 | 0 |
| m4-reconciliation | 0 | 8 | 0 | 0 |

## Formerly-open gaps, now closed

The two gaps the earlier summary acknowledged are closed by
`tests/browser/c24-status-export-photos.browser.test.js`: the
`setSync`/`syncStatusHTML` display surface (three cases, including
blocked-recovery durability — width stated honestly: these cover the
rendering surface, not every producer-to-status transition) and the
500-photo boundary (characterization width: the exercised adoption path
caps at the listing and deletes nothing; no broader claim is made).
