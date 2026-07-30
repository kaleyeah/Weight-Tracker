# Canary republish record — 2026-07-30

Architect authorization: PRODUCT_ARCHITECT_CANARY_DAY1_FIX003_V3_REVIEW.md §8
("/canary/ REPUBLISH AUTHORIZED", "CANARY DAY 1 RESTART AUTHORIZED FROM CANARY-01").

| Step | Result |
| --- | --- |
| 1 authoritative single-flight build | OK, sha 0958b4e4… |
| 2 RELEASE.expected.json verified | build/sha/bytes all agree |
| 3-4 manifest-verifying selector | SELECTED, exact match |
| 5 halted .348 backed up | served copy hashed 9e45a225…, saved to ~/cf-cutover/canary-348-rollback-20260730.html |
| 6 publish .349 to /canary/ only | commit 8c33484 on origin/main, root blob byte-identical |
| 7 served /canary/ verified | 0958b4e4…, 1,189,661 B, APP_BUILD 2026-07-30.349-pb-c10 |
| 8 root still exactly .347 | bb41dab4…, 931,512 B, APP_BUILD 2026-07-28.347-pb |
| 9 no service worker / Cache API | 0 serviceWorker.register, 0 caches.open in served bytes |
| 10 HOTFIX-001 + server health | /api/health 200; commit route 401-guarded; ledger 0 rows |
| 11-12 open canary icon, restart CANARY-01 | Product Owner |

The approved three hunks are present in the SERVED bytes:
  - gate renders the confirmation overlay (FIX-003)
  - claim confirmation wording (FIX-003b)
  - build identifier .349-pb-c10

## Day-one baseline (server, immediately before the PO opens the canary)

    huhguz7atzdq546  coreRev=85 trainingRev=10  updated 2026-07-30 05:06:30.938Z
    asxx3sejhxjycgo  coreRev=0  trainingRev=0   updated 2026-07-21 20:39:25.681Z
    cf_commit_log:   0 rows

The PO's coreRev moved 64 -> 85 since the I5d baseline, with ZERO ledger rows.
The CAS route writes a ledger row on every commit, so those writes came through
the legacy PATCH bridge — i.e. his installed .347 app syncing normally, not the
canary (he never got past the ownership gate). Same attribution method the
HOTFIX-001 record established.

## Rollback

    git -C <worktree> revert 8c33484   # or restore canary/index.html from
    ~/cf-cutover/canary-348-rollback-20260730.html (sha 9e45a225…)

Root is never touched by a canary rollback.
