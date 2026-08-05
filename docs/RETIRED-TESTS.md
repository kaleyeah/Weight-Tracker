# Retired tests — inventory and disposition (Phase 0)

Architect ruling 2026-08-05: *"Formally retire the dead marker-based test tier
after inventorying its intended assertions; migrate any unique valuable coverage
into working browser/unit tests, then remove the obsolete tests and markers. Do
not repair tests whose only purpose is checking deleted source comments."*

This document records the disposition of **every assertion** in the retired
suites. Nothing was deleted without being classified first.

## Why the tier died

`tests/harness.js#loadTestable` extracted `/* @testable-start NAME … */` blocks
from `index.html`. Commit `a599efa` ("Sync index.html to live .416-fx as the M10
client base") replaced the whole file with the production client — the markers
went, and so did the **code** they marked. The implementation lineage moved
`cf*` (Commit-1 era) → `m8*` (training sync rework) → `m10c*/m10p*`
(single-writer). The dead suites test the `cf*` layer, which has no successor
*by name* — its behaviours were re-implemented and re-tested in the browser
tier (`c11m8-*`, `c15m10-*` … `c19m10-*`).

## Disposition summary

| Class | Count | Meaning |
|---|---|---|
| COVERED | most | a live browser suite asserts materially the same behaviour |
| OBSOLETE | many | the code/behaviour no longer exists (GitHub sync, recap merge, `CF_WRITE_GATE`, `cfManifest*`, `syncFingerprint`, `cas-conflict` artifacts) |
| **UNIQUE — ported** | 2 clusters | now live in `tests/browser/c23-characterization.browser.test.js` |
| **Finding** | 1 | a guard the dead tier tested is absent from current code — see below |

## The unique coverage, ported

1. **`reopenDay` scoping and non-destructiveness** (c1h H2/H3): clears only the
   reopened day's recap; other dirty edits survive; reopening the latest day
   also clears the summary slot. → `c23` tests 4–6.
2. **Canonical serialization ordering** (c1 group 1): key order is
   insignificant, array order is significant. `m8CanonSerialize` sorts keys but
   no live test asserted the property directly. → `c23` tests 7–8.

## The finding: photo-listing completeness (m2-photo-pagination)

The dead M2 suite pinned "an INCOMPLETE enumeration never deletes (the
501-photo bug)". Investigated against HEAD:

- The **deletion inference no longer exists at all.** The M8-era `photoSync`
  (which deleted local photos absent from a server listing) was replaced by the
  M10-BLOCK-4 `photoSync`, which only **adopts** server photos missing locally
  and never deletes from a listing. The dangerous path died with the old code.
- What remains is a milder truncation limit: `pbPhotoList` fetches
  `perPage=500` and ignores `totalItems`/`totalPages`. Past 500 photos, the
  501st is invisible to adoption (a second device would not receive it) and to
  the displaced-identity capture (which fails **safe**, to `unverified`).
- Current scale: the owner has well under 500 photos. **Recorded as a known
  limit, not fixed here** — a pagination loop in `pbPhotoList` is the eventual
  fix and belongs with Phase 4 (server API formalization), not in a
  no-behaviour-change refactor.

## Deleted files

**Marker tier (12)** — all assertions dispositioned above:
`c1-emergency-hotfix`, `c1b-write-freeze`, `c1d-coach-equality`,
`c1e-adoption-race`, `c1f-destructive-guard`, `c1g-identity-manifest`,
`c1h-reopen-recap`, `c10-cas-client`, `m1-photo-ownership`,
`m2-photo-pagination`, `m3-revisions`, `m4-reconciliation`.

**Non-marker suites referencing deleted `cf*` code (7):**
`c10-conflict-view`, `c10-conflict-workflow`, `c10-scheduler`,
`c10-recovery-writer`, `c1c-integration`, `status-producers`,
plus `c11-training-durability` (pre-M10 dirty semantics, 41 failures;
superseded by the browser `c11m8-*` family) and `c13-recovery-snapshot`
(crashes in its vm sandbox; superseded by the browser
`c13-recovery-snapshot.browser.test.js`).

**Dead browser suites (cf-era, drive functions with zero occurrences in
`index.html`):** `cas-status-matrix`, `route-contract`, `multi-context`,
`status-sources`, `sync-status`, `photo-status`, `conflict-center`,
`manifest-recovery`, `status-render`, `ownership-gate`, `setaside-ux`,
`setaside-signin`, `export-utf8`, and `c11m8-upgrade` (references the removed
`m8Present`). Their *behavioural* subjects either died with the `cf*` layer or
are covered by the live `c1xm10-*` suites; two exceptions worth naming:
- the signed-out set-aside recovery surface (`setaside-*`) has **no live
  equivalent because the surface itself was removed** from `pbLoginHTML`;
- `export-utf8`'s charset assertion is superseded by the export path tested in
  `c19m10-gate` T18/T19.

**Harness machinery:** `loadTestable` and the `@testable` extraction in
`tests/harness.js`; the dead-file list in `tests/run-all.js`.

## Kept

`tests/harness-self.test.js`, `tests/browser-harness-self.test.js`,
`tests/c10-independent-manifest.test.js` (self-contained),
`tests/c12-backup-training.test.js` (passes, 20/20, m8-era code it tests is
live), `tests/deploy-rc.test.js` (gates the dormant deployment-path pipeline,
skips cleanly), and the entire live browser tier (19 suites + the new `c23`).
