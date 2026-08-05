# Retired tests — assertion-level ledger

Companion to `docs/RETIRED-TESTS.md`, at the granularity the review requires:
every test case in every deleted suite, the behaviour it protected, and its
disposition. Verdicts: **COVERED** (live suite asserts materially the same
behaviour — named), **OBSOLETE-CODE** (the implementation it drove has zero
occurrences in index.html — the `cf*` layer died at commit `a599efa`, replaced
by the m8/m10 lineage), **OBSOLETE-BEHAVIOUR** (the product behaviour itself
was retired — named), **PORTED** (moved to `c23-characterization`).

Notation: `c16 T13` = `tests/browser/c16m10-core.browser.test.js`, case T13.

## c1-emergency-hotfix (loadTestable C1)

| Case(s) | Protected | Disposition |
|---|---|---|
| key order does not matter; nested key order | canon key-order insensitivity | **PORTED** → c23 "canon: key order does not matter" (also exercised e2e by c11m8-matrix R4-1/R4-4) |
| array order DOES matter | array position significance | **PORTED** → c23 "canon: array order DOES matter" |
| different content differs; null/undefined safe | canon hygiene | COVERED — c16 T14/T16 (lossy-category matrix: cycles, class instances, null-proto) |
| 13 × "\<field\> is meaningful" | per-field meaningfulness of `coreHasMeaningfulState` | OBSOLETE-CODE — emptiness is now whole-store `m10cLocalEmpty`/`m8LocalTrainingEmpty`; COVERED at that level by c16 T1b/T1d |
| dirty + GLP-only + server moved ⇒ conflict, not adopt | dirty local never silently replaced | COVERED — c11m8-matrix R4-2/3/4; c16 T5/T7/T13 |
| dirty + no meaningful local ⇒ never adopt; delete-all while dirty ≠ nothing-to-lose | empty-but-dirty protected | COVERED — c16 T1e "absent data at positive rev: bootstrap-conflict (deletion evidence)" |
| dirty + no baseline + different ⇒ conflict / identical ⇒ agree / incomparable ⇒ conflict | baseline-absent decisions | COVERED — c16 T1a/T1c |
| hold-push / hold-seed / never "push"/"seed" | the Commit-1 write freeze (`CF_WRITE_GATE`) | OBSOLETE-BEHAVIOUR — the freeze was a temporary containment; writes now go through the fenced protocol, and c16 T2/T1d assert pushes LAND |
| absent/"0" dirty flag does not migrate clean; "1" migrates dirty | boolean-dirty legacy migration | OBSOLETE-CODE — no boolean-dirty path; `m10cRead('dirty')` is generation-based |
| same-account ok / mismatch blocks / unknown / unauthenticated never ok | cross-account verdicts | COVERED — c16 T8 (per-account namespaces), c19 T15a (adoption gate + verified owner) |

## c1b-write-freeze (C1, C1B)

| Case(s) | Protected | Disposition |
|---|---|---|
| 6 × defaults-normalisation equality (`cfNormalizeWith`) | symmetric defaults filling | OBSOLETE-CODE — M10 canon is byte-canonical, fail-closed; no defaults-filling comparator exists |
| 7 × snapshot capture fails closed (`cfCloneField` etc.) | capture failure blocks | COVERED — c11m8-faults F/F2/G/J (quarantine copy/read/adoption-base failures all block); c16 T9 |
| 5 × `CF_WRITE_GATE` gating | the freeze gate | OBSOLETE-BEHAVIOUR (as above) |
| 10 × source-text regex over the "COMMIT 1b" block | freeze-build source invariants | OBSOLETE-CODE — that source block does not exist; the surviving concept (render ownership gate) is `isOwner`/`ownershipAmbiguous`, exercised by every booting browser suite |

## c1d-coach-equality (C1, C1D)

| Case(s) | Protected | Disposition |
|---|---|---|
| D1: 6 × settings-equality participation (`startDateSet` etc.) | which settings count for equality | OBSOLETE-CODE — `startDateSet` has 0 occurrences; M10 compares the whole store byte-exactly |
| D2: recap/summaries extracted, athlete fields not (`cfCoachFieldsOf`) | narrow recap merge | OBSOLETE-BEHAVIOUR — reports moved to the coach service (`.445-reportfeed`); nothing merges recaps into appdata |
| D3: edit during coach poll survives; recap merged; athlete data not adopted | the poll-adoption race | Merge half OBSOLETE-BEHAVIOUR; the race half COVERED — c16 T13 "edit during pull GET: adoption refused, edit + dirty preserved"; c11m8-faults O |
| D4: set-aside incl. workout draft (quarantine, manifest, verified removal) | complete set-aside | OBSOLETE-CODE as written (`cfDisownLocal` gone); equivalents COVERED — c11m8-faults F/F2/S/T, c19 T15b (`lrec:restore` verified) |
| D5: no source key deleted on failure; partial copies cleaned | set-aside fails closed | COVERED — c11m8-faults F |
| D6: signed-out screen lists set-aside data, offers export+delete | signed-out recovery surface | OBSOLETE-BEHAVIOUR — `pbLoginHTML` no longer renders a quarantine list (surface removed with the cf* layer) |

## c1e-adoption-race (C1E)

| Case(s) | Protected | Disposition |
|---|---|---|
| E0: staleness predicates (rev drift, gen drift, token drift A→B→A) | in-flight responses die on drift | COVERED — c16 T11/T12b (A→B→A response discarded), c19 T6 |
| E0/E5: 6 × `cfStartDateIncluded` | startDate equality | OBSOLETE-CODE |
| E1: adoption aborted, racing edit survives, dirty stays, safe re-route | edit during adoption wait | COVERED — c16 T13, c11m8-faults O |
| E2/E3: coach preflight/coach-poll races | coach preflight paths | OBSOLETE-BEHAVIOUR (recap sync retired); generic A→B→A COVERED — c16 T12b, c18 T11 |
| E4: deletion exception preserves recovery set; boot repairs idempotently | cleanup crash safety | COVERED — c11m8-faults F2 (both copies kept, blocked), H/R (boot retries ONLY cleanup) |
| E6: incomplete manifest cannot export; no confirm shown | export gating | OBSOLETE-CODE (`cfQuarExport`); modern export gates COVERED — c19 T18/T19 (delivery-evidenced exports) |

## c1f-destructive-guard (C1F, C1G)

| Case(s) | Protected | Disposition |
|---|---|---|
| F0: 5 × `cfCtxDrifted` + 4 × `cfManifestValid` | destructive-context drift | COVERED by the fence model — c15 (lease), c19 T5/T6/T13 |
| F1: restore race (`recRestore`) | restore aborted on drift | OBSOLETE-CODE — `recRestore`/`recList` 0 occurrences |
| F2: import aborted on confirm-time drift | import race | Fence dimension COVERED — c19 T6/T11; the edit-drift comparator no longer exists (OBSOLETE-CODE) |
| F3: logout race — not wiped, no reload, edit survives | logout fails closed | COVERED — c19 T7 (logout blocked by each state; clean ⇒ not blocked), T12; plus c23 "pbLogout is blocked while unsynced work exists" |
| F4/F5: stale cleanup job never deletes newer value; job superseded; no loop | content-conditional cleanup | COVERED — c11m8-faults H/R |
| F6: token rotation vs adoption/coach ctx | token-refresh semantics | OBSOLETE-CODE — the generation model no longer keys on token |

## c1g-identity-manifest (C1G)

| Case(s) | Protected | Disposition |
|---|---|---|
| G0: 12 × `cfManifestValid` exact-set shape | manifest validation | OBSOLETE-CODE |
| G0b: absent⇒clean / exact⇒delete / newer⇒superseded / missing⇒superseded | provable cleanup decisions | COVERED — c11m8-faults H/R |
| G1: restore aborted on same-length workout change | full-content identity | OBSOLETE-CODE (`recRestore`); guard is now the fence — c15, c19 T4 |
| G2: logout/import see workout create/delete during wait | destructive ops see workouts | COVERED — c19 T7 (wo:* gated), T11 |
| G3: subset set not complete; export refused | runtime export gate | OBSOLETE-CODE |
| G4: **storage read failure fails the guard CLOSED** | unreadable ⇒ refuse | COVERED — c11m8-faults G ("a READ failure blocks — no absence, no quarantine, no bootstrap"), c19 T15d/T12 |

## c1h-reopen-recap (C1H)

| Case(s) | Protected | Disposition |
|---|---|---|
| H0: per-day recap generation counter | `cfRecapGen` invalidation | OBSOLETE-CODE (recap sync path gone) |
| H1: late poll cannot restore a reopened recap | poll-undo race | OBSOLETE-BEHAVIOUR (no poll writes recaps into state) |
| **H2**: recap cleared; other dirty edits survive; core stays dirty; zero data/training writes | reopen local-only + non-destructive | **PORTED** → c23 "reopenDay never touches other dirty edits (H2)" |
| **H3**: older-day scoping; latest intact; latest clears summary slot | per-day scoping | **PORTED** → c23 two H3 cases |
| H4: recap merged despite dirty edit | anti-over-fix guard | OBSOLETE-BEHAVIOUR (no merge path left to guard) |

## c10-cas-client (C10) — 105 cases, grouped

| Group | Protected | Disposition |
|---|---|---|
| C10-PLAN-11 (9): request identity = subsystem+rev+canonical payload | idempotency identity | COVERED — c16 T3 (ledger replay answers rerun exactly once); c11m8-replay F7-5 (key-reuse hard stop). The 3 digest-shape cases (64-char, 96-limit, over-length refused) are OBSOLETE-CODE — m8/m10 keys are storage builders, not digests |
| CAS-05/06 (4) | commit lands / conflict typed | COVERED — c16 T2/T11, c11m8-faults K |
| CAS-11 (5) | replay semantics | COVERED — c16 T15, c11m8-faults Q |
| CAS-12 (5): agree / retry-once / always-conflict on divergence / no-baseline ⇒ conflict | echo resolution | COVERED — c11m8-replay F7-3/F7-4, c11m8-matrix R4-* |
| C10-PLAN-05/06 (8): context drift | in-flight drift | COVERED — c16 T6/T12, c17 |
| C10-P1-01 (5): UTF-8 byte counting | quota accounting | COVERED — `byteLength` survives; c11m8-quota |
| C10-P1-02 + "verified means checked" + PLAN-09 (35) | the `cas-conflict` artifact contract | OBSOLETE-CODE — that artifact format does not exist in the m8/m10 lineage |
| C10-PLAN-07/08 (7): first-row creation | rev-0 bootstrap | COVERED — c16 T1d/T8 |
| STATUS-01/02/03 (7) | `cfCasStatus` surface | OBSOLETE-CODE — live status is `setSync`/`syncStatusHTML` |
| CAS-20 (~28): retry ladder + dispositions | transport dispositions | Mostly COVERED — c11m8-replay F7-1..F7-7, c16 T19a. "426 update-required" and "413 oversize" dispositions are OBSOLETE-CODE (not implemented by the m8/m10 route; will return with MIN_CLIENT_BUILD at enforcement — noted in the M10 plan) |

## m1-photo-ownership (M1) — 15 cases

All drove `phIsMine`/`phIsOrphan`/`phFilterMine`; no per-record `ownerId`
exists. OBSOLETE-CODE. The property they protected (cross-account photo
isolation) is COVERED — server-side filter `user="<uid>"` in `pbPhotoList`
plus c18 T11 (A→B→A mid-upload: zero B keys), T16 (non-holder photoSync:
zero mutations), c19 T12.

## m2-photo-pagination (M2) — 14 cases

| Group | Disposition |
|---|---|
| 5 × `phPagesComplete` completeness | OBSOLETE-CODE as tests (`phPagesComplete` gone), and the **deletion inference they guarded no longer exists**: the live photoSync only ADOPTS; it never deletes from a listing (verified against the live function — see RETIRED-TESTS.md §finding) |
| 6 × `phMayInferDeletion` cases incl. "the 501-photo bug" | Same. The residual real gap — `pbPhotoList` truncates at 500 with no pagination, capping ADOPTION — is recorded as a known limit for Phase 4 in the handover |
| 3 × end-to-end deletion scenarios | Same |

## m3-revisions (M3) — 12 cases

High-water/ordering semantics (`older response cannot clean newer state`, the
4-step in-flight-edit walk, out-of-order responses). COVERED — the semantics
are now `m10cMarkDirty` + generation proofs: c16 T11 ("newer gen in flight:
base advanced, newer dirty SURVIVES"), c11m8-faults K, c11m8-replay F7-1/F7-2b.

## m4-reconciliation (M4) — 8 cases

`syncFingerprint` (4): 0 occurrences — OBSOLETE-CODE, superseded by full
canonical comparison (c11m8-matrix R4-*). The second group was self-declared
"SUPERSEDED by Commit 1" in the file itself — OBSOLETE twice over.

## Non-marker suites deleted in the same commit

| File | Disposition |
|---|---|
| c10-conflict-view / c10-conflict-workflow / c10-scheduler / c10-recovery-writer / c1c-integration | OBSOLETE-CODE — every one drives `cf*` symbols with 0 occurrences (21/15/13/7/7 missing refs respectively) |
| status-producers | OBSOLETE-CODE — greps index.html for `cfStatusSet(`/`cfPhotoStatusIncomplete(`: zero matches, fails at file-audit stage |
| c11-training-durability | Pre-M10 dirty semantics (41 of 51 failing); superseded by the browser `c11m8-*` family (7 suites, 125 assertions, all green) |
| c13-recovery-snapshot (string variant) | Crashed in its vm sandbox; superseded by the browser `c13-recovery-snapshot.browser.test.js` (42 green, incl. the corrected loss-fixed assertion) |

## Dead browser suites deleted (13)

Each drove `cf*` functions with zero occurrences (counts in RETIRED-TESTS.md).
Their subjects map: cas-status-matrix/route-contract/multi-context →
c16/c11m8-replay/c17; status-* and sync-status → the live `setSync` surface
has **no dedicated suite** (gap noted honestly — the status DISPLAY is
exercised incidentally by every booting suite, not asserted directly);
photo-status/manifest-recovery → c18; conflict-center → c17/c19;
ownership-gate → c19 T15a; export-utf8 → c19 T18/T19; setaside-ux/signin →
OBSOLETE-BEHAVIOUR (the signed-out set-aside surface was removed with the
cf* layer).

## Tally

| Disposition | Approx. assertions |
|---|---|
| COVERED by named live assertions | ~230 |
| OBSOLETE-CODE (implementation has 0 occurrences) | ~180 |
| OBSOLETE-BEHAVIOUR (product surface/path retired) | ~45 |
| PORTED into c23 | 7 |
| **Left without live coverage, knowingly** | 2 gaps, both recorded: the `setSync` status-display surface (no dedicated suite) and the >500-photo adoption cap (Phase 4) |
