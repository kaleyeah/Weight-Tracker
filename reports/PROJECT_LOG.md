# Compound — project log

The chronological record of what happened, who did it, and what came of it.
Roles: **Product Owner** (Griffin — final say on deployment, destructive change,
policy), **Architect** (ChatGPT via Codex CLI, read-only, reviews and rules),
**Engineer** (Claude Code, implements and reports with evidence).

This log was created 2026-08-01 at the Architect's requirement (round-1 ruling 9,
reaffirmed through round 15). Entries before that date are reconstructed from
the repository history, the engineering repo (`~/projects/Weight-Tracker`), and
the exchange transcripts, and are marked (r) where reconstructed.

## §1 Chronology

- **2026-07-21** (r) — CUTOVER: Compound moved to self-hosted PocketBase on the
  Synology NAS (`a8ef637`, build `2026-07-21.288-pb`). In that cutover the
  GitHub-era `trainingPush` retry logic was dropped and replaced with a
  fire-and-forget `pbSave`; nothing replaced the retry. This is the defect
  identified after the 2026-07-31 loss and capable of producing it. Engineer.
- **2026-07-21 → 2026-07-30** (r) — server CAS kit deployed on the NAS (commit
  route live, returns 401 unauthenticated); the CAS *client* (Commit 10 lineage)
  reviewed and published only as the /canary/ review artifact (final canary
  build `2026-07-30.353-pb-c10`), never promoted to the production root. The
  live root remained raw-PATCH (Lineage A) throughout. The
  Commit 10 branch was retired by Architect ruling; its head is preserved,
  no new commits permitted. Retirement marker created 2026-08-01: annotated tag
  `retired/commit10-lineage-a` (tag object `1d4bf365…`, dereferencing to head
  `e379783259cf9fecbd5d24b4374bf1f94f034ce0`), verified on the remote; the only Git ref mutation was the single
  engineering-repository tag — no branch ref, application file, commit, or
  deployment changed; branch-ref snapshot and working-tree status output were
  identical before and after.
- **2026-07-30** — Product Owner direction change: sync simplified, canary
  retired, iOS shell next; Architect review narrowed to server/data-integrity
  changes. Live app moved to build `2026-07-30.400-pb` (`e5f38c3`), the current
  production base.
- **2026-07-31** — **Data loss (observed).** The Owner's "Full Body Day 3"
  lift session, logged on his iPhone, was no longer present afterwards. What is
  **established by inspection**: the deployed client discards training push
  errors, sets no dirty flag, never retries, and its `trainingPull()`
  unconditionally overwrites local training — a defect fully capable of
  producing exactly this loss, and reproduced end-to-end against the shipping
  source in Chromium. What is **unproven**: the historical request sequence on
  the Owner's device that night. Privileged server logs were expressly declined
  by the Owner, so it stays unproven. Same-day core data (weight, food, steps,
  sleep, notes) was present on the server; the loss was training-specific.
  Recovery: **no recoverable copy was found in the locations inspected by the
  Engineer** — the exported server record (no 2026-07-31 lift session, no
  nightly recap to reconstruct from); the Owner did not report a surviving copy
  from the PWA/Safari storage-split checks suggested to him.
- **2026-08-01, round 1** — Engineer's diagnosis reviewed. Architect confirmed
  the defect by inspection, rejected parts of the causal-history claim as
  overreach, forbade reuse of core's dirty flag, and required evidence-first
  process (tests, rollback, no live mutation).
- **2026-08-01, round 2** — First sync-fix candidate **rejected**: the upgrade
  boundary (a device carrying unsynced old-client training) still lost data;
  containment-as-ancestry unsound; rollback unsafe. Candidate withdrawn.
- **2026-08-01, rounds 3–4** — Pivot, on Owner ruling: backup first. In the
  examined deployed lineage and its inspected history, `backupJSON()` has
  always been `payload()`, which has no training field — so **no examined
  version of the deployed app had a training export path**. Export-only change approved in shape; restore
  removed from the containment release; metadata envelope (`__backup`,
  format 2) added; delivered-file evidence required and produced in Chromium.
- **2026-08-01, round 5** — Owner delegated the containment-gate design to the
  Architect, who ruled: hardened write-once pre-sync recovery snapshot
  (verified byte-for-byte, fail-closed, account-keyed), and `wl_workout_v1`
  included in the backup.
- **2026-08-01, rounds 6–8** — Snapshot hardened through three rejections:
  corrupt-store preservation, envelope validation, bidirectional sync blocking,
  account quarantine widened from training-only to the whole app (core, photos,
  export, import, logout) after a demonstrated cross-account leak via
  `trainingHistory` and a tautological test.
- **2026-08-01, round 9** — Whole-app quarantine landed. Engineer found and
  removed a single-user trap in the Architect's own ruling (session expiry →
  anonymous capture → permanent quarantine) by not capturing while signed out.
- **2026-08-01, round 10** — Architect found the signed-out fix reintroduced the
  original loss on the same-page login path, and required an ownership marker.
  Halted for the Owner: may a legacy device auto-attribute its data to the first
  account that authenticates? **Owner ruling: ask once, then adopt.**
- **2026-08-01, rounds 11–12** — Verified owner marker (`wl_last_owner`),
  verified logout, photo read primitives guarded; then local photo mutation
  found escaping quarantine and logout found destructive-before-verified.
  Journalled logout introduced.
- **2026-08-01, round 13** — Halted for the Owner: interrupted-logout policy.
  **Owner ruling: stop and ask** — the app neither restores nor finishes on its
  own. (Delivered via the new Taildrop decision channel the Owner requested the
  same day.)
- **2026-08-01, round 14** — Blocking gates introduced (adoption and
  interrupted-logout screens own the page; ordinary app never initialises
  behind them). Halted for the Owner: unreadable journal. **Owner ruling: stay
  locked, no erase button.** Reload-based adoption transition approved; email
  ruled private session identity on full logout.
- **2026-08-01, round 15** — Gated boot made terminal (`checkForUpdate()` and
  the whole boot tail moved inside the clean branch); all-requests Chromium
  evidence; real adoption-reload test; universal finish postcondition.
  **The containment candidate passed technical review against all round 1–14
  findings.** Approved for release packaging and Owner diff review — not for
  commit, deployment, or live-data testing.
- **2026-08-01, rounds 16–32** — release packaging: governance records created
  and corrected; rollback procedure specified with release-state gates; served
  baseline evidenced; Commit 10 retirement tag created and verified; the M5
  local-only commit plan hardened through repeated review.
- **2026-08-01, rounds 32 onward** — the Owner approved the exact diff and
  accepted the rollback limitation. The release identity that this record rides
  in — the local records commit, the frozen-candidate commit it precedes, and
  annotated tag `v2026-08-01.401-bk` — was created under exchange-reviewed
  plans (M5, then the M5b record correction), with candidate bytes and the
  two-commit structure gate-verified throughout and nothing pushed. This entry
  describes the completed M5b identity and is valid only when the annotated
  release tag resolves to the frozen-candidate commit that follows this
  records commit. Raw evidence lives in the exchange record.

- **2026-08-01, rounds 39–43 — RELEASE.** Backup prerequisites verified
  (Engineer-verified fresh export; DSM `[docker]`-share snapshot 22:41:47Z
  covering `/volume1/docker/pocketbase/pb_data`; PB full-backup archive
  identified). The Owner authorized publication via his decision channel with
  the production-deployment warning explicit; `main` `e5f38c3..e4abbae` and tag
  `v2026-08-01.401-bk` pushed; the live URL served the candidate bytes
  (sha256 match — standing ruling 1 satisfied for this artifact); the Owner
  completed the Home-Screen device check (pre-sync notice confirmed in his
  screenshot, preserved and hashed) and **formally accepted the release**.
  One cosmetic defect found during the check (floating bottom nav; bug 7).
  Two overstated reassurances in the publication instrument corrected on the
  record (PB backup identified-not-verified; protection states
  unlikely-not-impossible). The Owner's session-date correction request is
  held pending its own reviewed package.

## §2 Owner actions on record

1. 2026-07-30 — direction change (sync simplification, review narrowing).
2. 2026-08-01 — chose backup-first sequencing over full-scope-first.
3. 2026-08-01 — authorized disposable-record PocketBase integration testing for
   the future sync rework; declined privileged server-log access.
4. 2026-08-01 — delegated containment-gate design and workout-inclusion to the
   Architect.
5. 2026-08-01 — chose to complete multi-account hardening before shipping.
6. 2026-08-01 — ruled adoption: ask once, then adopt.
7. 2026-08-01 — ruled interrupted logout: stop and ask.
8. 2026-08-01 — ruled unreadable journal: stay locked, no destructive escape.
9. 2026-08-01 — established the Taildrop decision channel (files to iPhone with
   options, scenarios, and the session resume id).
10. 2026-08-01 — **release model: production-origin validation.** The Owner
    ruled (Architect round 19, option 1): after backups and committed identity,
    authorize live publication, verify served bytes, then perform the iPhone
    check against every in-use storage area, then accept or roll back. He chose
    this knowing publishing-for-check is itself a production deployment and that
    rollback is unavailable from a gated/ambiguous/unresolved-journal state.
11. 2026-08-01 — **`SHOW_TESTBTN=true` ships in this release** (Owner ruling):
    the frozen candidate is unchanged; removal deferred to the sync-rework
    build.
12. 2026-08-01 — storage-area inventory: **Home-Screen app only** on the
    iPhone. Also stated: multi-device (iPad) use with login-based sync is the
    preferred future direction — recorded for M8/M10.
13. 2026-08-01 — reported six product bugs from the 2026-07-31 workout; triaged
    same day in the engineering repo (`Weight-Tracker/BUGS-2026-08-01.md`).
    Notable: the "no history on rope extensions" report is a routine/exercise
    identity issue, not data loss; the bodyweight-default defect is located in
    `buildWorkoutEntries()`. All deferred behind the frozen candidate.

14. 2026-08-01 — **approved the exact diff** (candidate sha256
    `7d865ff8…9d5743`, review diff `fd0b46ac…ea755b`) for commit under the
    reviewed local-only M5 plan, via his decision channel; the Architect
    recommended approval.
15. 2026-08-01 — **accepted the rollback limitation**: emergency rollback may
    be unavailable from the new protected failure states (gate, ownership
    ambiguity, unresolved logout journal); manual recovery applies there.

16. 2026-08-01 — **authorized M6 publication** ("Publish now") via the
    decision channel, and **formally accepted the release (M7)** after
    completing the device checklist.
17. 2026-08-01 — directed a session-date correction to his own record (move
    the reconstructed session to 2026-07-31 18:43 local, 60 min); held by the
    Architect pending a reviewed mutation package.

## §3 What the candidate is

One change to `index.html`, carried in the tagged candidate commit
`e4abbae…` on `main` of `~/projects/compound-app` — **published 2026-08-01 and
byte-verified against the live URL; accepted by the Owner** (the deployed
repo — `~/projects/Weight-Tracker` is engineering-only):

- The application-data JSON backup now carries training history, the active
  workout, and the pre-sync recovery snapshot, under a versioned `__backup`
  envelope. Export only; restore unchanged.
- A verified, write-once, account-keyed pre-sync recovery snapshot taken before
  any load, migration or sync; fail-closed in both sync directions.
- Whole-app quarantine under ownership ambiguity; adoption gate; interrupted-
  logout gate; journalled, verified, recoverable logout; terminal gated boot.

Candidate identity: base `e5f38c3` (build `2026-07-30.400-pb`, sha256
`4407050e…a004771`); candidate build `2026-08-01.401-bk`, sha256
`7d865ff8388dad5bc73f7a518bbc981676ca3caeb0723188c304043a029d5743`.

## §4 Open items

1. **The training sync defect is UNFIXED and live.** The deployed app still
   silently loses training on failed-push-then-pull. The containment candidate
   contains the loss (exportable snapshot); it does not cure it. The rework
   brief is the Architect's round-2 rulings 1–10 (own dirty flag; snapshot +
   generation push; no blind boot push; conflict retention without auto-merge;
   acknowledged-revision tracking; conflict UI with export-first resolution;
   CAS-protected writes; data-safe rollback; deterministic tests; disposable-
   record integration evidence — authorized by the Owner).
2. **Release sequencing** per the Owner's round-19 release-model ruling
   (production-origin validation): records → release package → Owner diff and
   risk review → committed release identity + finalized rollback hash → fresh
   PocketBase export + verified NAS snapshot + storage-area inventory → **Owner
   authorizes live publication (this IS the deployment decision)** → publish →
   byte-for-byte served-artifact verification → manual iPhone check against
   every in-use storage area → **Owner accepts the release or the rollback
   procedure executes**. No production record claims verification until the
   served candidate matches the committed candidate. In progress.
3. **`resyncAllActivityTags()` coupling** — a stale training read can delete
   previously published core activity tags. Recorded round 2, deferred to the
   sync rework.
4. **Restore** — `applyImport()` does not restore training; deferred until the
   sync durability work lands.
5. **"One active writing device"** — approved (pre-incident) but unimplemented;
   prerequisite for HealthKit import.
6. **Server lockdown must stay OFF** until the sync rework ships: rule-blocking
   raw PATCH with the current client would make every reopen destroy data.
7. **`SHOW_TESTBTN=true`** — Owner ruled 2026-08-01: ships in this release
   unchanged; removal rides the sync-rework build.
8. **Shared-device "clear this device" action** — deliberately excluded from the
   containment release; needs its own reviewed, Owner-authorized design.
9. **iOS/PWA lifecycle behaviour unproven** — all automated evidence is desktop
   Chromium; the manual iPhone check is the (Owner-authorized) gap-closer.
10. **Recovery-snapshot resolution workflow** — clearing a snapshot after its
    data is reconciled belongs to the sync rework, not containment.
