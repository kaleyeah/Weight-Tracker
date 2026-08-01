# Compound — program context

Roles, decisions on record, milestone state, and gates. Created 2026-08-01 at
the Architect's requirement; the name follows the convention the review
process specifies. `reports/PROJECT_LOG.md` is the chronological companion.

## Roles

| Role | Who | Authority |
|---|---|---|
| Product Owner | Griffin | Final say on deployment, destructive change, spending, policy. The only real user; his health history is the asset being protected. |
| Architect | ChatGPT (Codex CLI, read-only) | Reviews and rules on WHAT. Approval is never Owner approval. |
| Engineer | Claude Code | Implements and reports with evidence. Decides HOW within rulings. |

Decision channel: halts reach the Owner as Taildropped decision files to his
iPhone (options, example scenarios, recommendation, session resume id), mirrored
in-session. Established 2026-08-01 at the Owner's request.

## Repositories

- `~/projects/compound-app`, branch `main` — **the deployed app** (GitHub
  Pages). All release work happens here.
- `~/projects/Weight-Tracker` — engineering repo: tests
  (`tests/c11–c13*`, `tests/browser/*`), server kit, docs. Its `index.html` is
  the retired Commit 10 candidate (Lineage B) — published only as the /canary/
  review artifact, never promoted to the production root; that branch takes no
  new commits by standing ruling.

## Decisions on record (standing)

1. No production record may claim `verifiedAgainstLiveURL: true` until the
   served artifact is compared byte-for-byte with the committed artifact.
2. The Commit 10 branch is retired; no new commits. Marker in place
   (2026-08-01): annotated tag `retired/commit10-lineage-a` in the engineering
   repository, verified locally and on the remote, dereferencing to head
   `e379783259cf9fecbd5d24b4374bf1f94f034ce0`.
3. Review scope (Owner, 2026-07-30): server and data-integrity changes require
   the Architect loop; client/UI-only changes do not.
4. Server lockdown (rule-blocking raw PATCH) stays OFF until the sync rework
   ships.
5. Adoption policy (Owner): unmarked local data → ask once, then adopt; no
   destructive "not mine" path in the containment release.
6. Interrupted logout (Owner): stop and ask; the app neither restores nor
   finishes on its own.
7. Unreadable logout journal (Owner): stay locked, no erase offered; resolution
   only via a separately reviewed recovery procedure.
8. Reload is the approved adoption transition; `email` is private session
   identity on full logout.
9. Disposable-record PocketBase integration testing is authorized for the sync
   rework; privileged server-log access is declined.
10. Release model (Owner, 2026-08-01): production-origin validation. The Owner
    SELECTED this model — publish-for-check is a production deployment and will
    require its own explicit publication authorization once M6's prerequisites
    exist. Model selection is not deployment approval. Served-byte verification
    precedes the device check; accept-or-rollback follows it.
11. `SHOW_TESTBTN=true` ships in this release (Owner, 2026-08-01); removal
    deferred to the sync-rework build.

## Milestone plan and gate state

| # | Milestone | State |
|---|---|---|
| M1 | Diagnose the 2026-07-31 training loss | **Done** — loss observed; defect established by inspection and reproduced against the shipping source; the historical request sequence is unproven (privileged logs declined by Owner) |
| M2 | Containment build (backup + snapshot + quarantine + gates) | **Passed technical review** (round 15) against all round 1–14 findings |
| M3 | Release packaging of M2 | **Done** (2026-08-01) — records, rollback procedure, served baseline, tag marker and execution evidence all persisted, hashed, and carried in the local release-records commit; nothing pushed |
| M4 | Owner exact-diff and rollback-risk review of M2 | **Done** (2026-08-01) — the Owner approved the exact diff (candidate sha256 `7d865ff8…9d5743`, review diff `fd0b46ac…ea755b`) and accepted the rollback limitation, via his decision channel |
| M5 | Committed release identity | **Done** (2026-08-01) — this document rides the local release-records commit; the following commit carries the frozen candidate (sha256 `7d865ff8…9d5743`); annotated tag `v2026-08-01.401-bk` marks that commit; two commits ahead of `origin/main`, nothing pushed |
| M6 | Owner authorizes live publication (= the deployment decision) → publish → served-artifact byte verification → manual iPhone check on every in-use storage area | Blocked on the backup prerequisites and the separate Owner publication authorization; the check deliberately permits the known-broken pull after snapshot capture |
| M7 | Owner accepts the release, or the rollback procedure executes | Blocked on M6 evidence |
| M7b | Reviewed HealthKit storage-migration package (schema, migration, backup, rollback, tests) per standing ruling | Required before M10 implementation; independent of M8 ordering |
| M8 | Sync rework (Architect round-2 rulings 1–10) | Not started; brief agreed; kept separate from M2 by ruling |
| M9 | Conflict/recovery resolution UI; snapshot reconciliation | Follows M8 |
| M10 | "One active writing device"; then HealthKit import | Approved, unimplemented; after M8 AND the reviewed M7b package |

## Current gate

**Backup prerequisites, then the separate M6 publication decision.** The
candidate is committed locally on `main` (build `2026-08-01.401-bk`, sha256
`7d865ff8…9d5743`, on base `e5f38c3`, marked by tag `v2026-08-01.401-bk`, two
commits ahead of `origin/main`) and is **not pushed and not published** — the
live site serves base `e5f38c3` until M6. Next, in order: the Owner's fresh
same-day PocketBase export → verified NAS snapshot dated on/after it →
separate Owner publication authorization → publish and verify served bytes →
the Home-Screen iPhone check → Owner accepts or rolls back.

## Standing risks

- The deployed app loses training data on failed-push-then-pull, today. The
  defect remains in production until M6 publishes the byte-verified containment
  candidate; M8 later fixes the cause.
- All automated evidence is desktop Chromium; iOS PWA lifecycle is unproven
  until M6.
- Rollback: only the LOCAL base-artifact round-trip is byte-verified. The
  gated commit/push/Pages rollback path is specified but unexecuted. And it is
  *policy-constrained*: never from a gate, ambiguity, or an unresolved journal
  (the old build enforces none of the protections).
