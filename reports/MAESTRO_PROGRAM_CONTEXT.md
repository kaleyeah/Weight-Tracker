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
| M3 | Release packaging of M2 | **Done** (2026-08-01) — records, rollback procedure, served baseline, tag marker and execution evidence all persisted, hashed, and carried in the release-records commit (published with the release at M6) |
| M4 | Owner exact-diff and rollback-risk review of M2 | **Done** (2026-08-01) — the Owner approved the exact diff (candidate sha256 `7d865ff8…9d5743`, review diff `fd0b46ac…ea755b`) and accepted the rollback limitation, via his decision channel |
| M5 | Committed release identity | **Done** (2026-08-01) — this document rides the release-records commit; the following commit carries the frozen candidate (sha256 `7d865ff8…9d5743`); annotated tag `v2026-08-01.401-bk` marks that commit (published at M6; `origin/main` at the accepted commit) |
| M6 | Owner authorizes live publication (= the deployment decision) → publish → served-artifact byte verification → manual iPhone check on every in-use storage area | **Done** (2026-08-01) — Owner authorized via his decision channel with the production-deployment warning explicit; `main` and tag `v2026-08-01.401-bk` pushed; the live URL served sha256 `7d865ff8…9d5743`, **byte-identical to the accepted commit `e4abbae…`** (standing ruling 1 satisfied for THIS artifact only); Home-Screen device check passed, pre-sync notice confirmed on-screen |
| M7 | Owner accepts the release, or the rollback procedure executes | **Done** (2026-08-01) — Owner formally ACCEPTED after the checklist, with the floating-nav cosmetic defect disclosed (bug 7, engineering repo) |
| M7b | Reviewed HealthKit storage-migration package (schema, migration, backup, rollback, tests) per standing ruling | Required before M10 implementation; independent of M8 ordering |
| M8 | Sync rework (design v7 contract) | **COMPLETE.** 129 final-byte client cases; real-PocketBase gate passed (round 21); release commit `425f70e`, tag `v2026-08-02.415-m8`, sha256 `5bda0da5…1ba35ee3`, served-byte verified 2026-08-02 17:20:02Z; **Owner accepted** same day after a production check (bootstrap review resolved via the live workflow; online sync; offline hold + relaunch retry — a subset of the packaged checklist; the logout-refusal and deletion-cycle steps rest on the automated evidence). Raw-PATCH lockdown remains separately gated. Local records HEAD is ahead of `origin/main` (=`425f70e`) by the post-release records commits, unpushed pending Owner authorization |
| M9 | Conflict/recovery resolution UI; snapshot reconciliation | Follows M8 |
| M10 | "One active writing device"; then HealthKit import | SPLIT by Owner direction 2026-08-02: the single-writer half is IN DESIGN (STRICT ruled; Architect rounds 1–3; after-M8 prerequisite met); the HealthKit-import half still requires the reviewed M7b package (parked for Maestro) |

## Current gate

**M10 single-writer — server-package design review** (Architect rounds
1–4 complete; STRICT Owner ruling on record; design v5 + consolidated
matrix required before the server package may be implemented against
disposable infrastructure). M9 is deferred behind M10 by Owner
direction; M7b remains parked for Maestro and gates only M10's
HealthKit-import half.

**The accepted release:** build `2026-08-02.415-m8` (release commit
`425f70e`, tag `v2026-08-02.415-m8`, sha256 `5bda0da5…1ba35ee3`) is
**published, four-point byte-verified (17:20:02Z), and Owner-accepted**
— the sync rework is live and the 2026-07-31 loss class is closed. The
prior accepted releases (`.401-bk` containment, `.402`–`.414`
correctness/UX) are historical; `origin/main` stands at `425f70e` with
post-release records commits local pending an authorized push.

**Standing state:** raw-PATCH lockdown and M10 fence enforcement are
OFF, awaiting one combined Owner-authorized server change after the M10
client reaches both devices. Client-only UX changes remain outside the
Architect loop by Owner ruling; server/data-integrity work goes through
it.

## Standing risks

- The deployed app does NOT prevent the failed-push-then-pull overwrite of
  visible training; what it adds is a verified pre-sync recovery snapshot
  (captured before any load or sync, carried in every export), the pre-sync
  notice, the blocking ownership/logout gates, and a training-inclusive
  backup. Visible training may still be overwritten until M8 fixes the
  underlying sync defect.
- All automated evidence is desktop Chromium. The defined Home-Screen
  checklist passed once on the Owner's iPhone (M6); broader iOS lifecycle
  behaviour remains unproven by automation or extended use.
- Rollback: only the LOCAL base-artifact round-trip is byte-verified. The
  gated commit/push/Pages rollback path is specified but unexecuted. And it is
  *policy-constrained*: never from a gate, ambiguity, or an unresolved journal
  (the old build enforces none of the protections).
