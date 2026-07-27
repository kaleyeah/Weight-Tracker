# Commit 10 Acceptance Criteria

This file is an execution index. The full behavior is authoritative in `PRODUCT_ARCHITECT_COMMIT10_SPEC.md`.

## Mandatory conflict cases

- A6: historical correction vs newer weigh-in → preserve local, preserve server recovery copy, offer conflict, no automatic winner.
- C4: Keep this device’s changes → online recovery copy verified, no commit, local pending.
- C5: recovery blocked → refuse overwrite/adoption, never claim copy saved.
- F5: Use online copy here → confirm, snapshot local, adopt only if context unchanged.
- K1: edit during adoption snapshot → abort adoption, edit survives, pending remains.

## Independent manifest gate

Automate with an implementation independent of the app reader:

- H3
- J6
- K4
- K5
- L4
- M1
- M2
- M3
- M4

One manual human-visible confirmation is also required.

## Sync contract IDs

CAS-01 through CAS-20 and STATUS-01 through STATUS-08 in the Product Architect spec are all release blockers.

## Required test environments

- unit/state-machine tests,
- executable integration tests against a real PocketBase staging instance,
- real Chromium with IndexedDB,
- two accounts,
- two profiles/devices,
- offline/network failure,
- forced token expiry,
- blocked/rejected recovery storage,
- throttled recovery/adoption timing windows,
- app reload during pending and conflict states.

## Evidence package

Return:

- `00-PROMPT.md`
- implementation diff/source
- exact build identifier
- automated test logs
- per-acceptance result matrix
- screenshots for conflict choices and statuses
- real-server request/response evidence
- independent manifest-reader evidence
- manual set-aside confirmation
- deviations and open issues
- updated STATUS.md and DECISIONS.md
