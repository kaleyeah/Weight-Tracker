# M8 release package — for Architect packaging review (round 22)

Assembled 2026-08-02. Nothing here is deployed, committed to the app
lineage, tagged, or pushed; `verifiedAgainstLiveURL: false` throughout.

## 1. Frozen candidate identity

- **Candidate**: the M8 sync rework as an uncommitted change in the
  `compound-app` working copy, sha256
  `b8f252b3dffd113f9929f70227e1c706b781d717e465fd385052df9e035de24b`
  — the exact bytes the Architect verified at rounds 19–21 and the
  disposable-PB gate exercised. FROZEN as of this package: any
  application change invalidates this identity and requires a scoped
  evidence rebuild.
- **Diff**: `artifacts/evidence/APP-DIFF-m8-over-414.txt` over the
  published base.
- **Build id at release**: to be stamped `2026-08-02.415-m8` in the
  release commit (the only permitted change beyond this freeze: the
  APP_BUILD string, re-hashed and recorded in the release records).

## 2. Committed release identity + tag plan

The established records-then-candidate pattern:
1. Release-records commit in `compound-app` (this package's identity
   section mirrored into `reports/`).
2. The frozen candidate committed as the release commit.
3. Annotated tag `v2026-08-02.415-m8` on the release commit.
4. Push only on the Owner's publish decision; the push IS deployment.
Nothing is created until the Architect passes this package AND the
Owner authorizes; the tag must dereference to the release commit.

## 3. Rollback base and the five-kind scan

- **The M8-free rollback base is `.414`** — commit `59653de` content,
  served-verified sha256
  `3b44f79c99a285619d53a8afd71a6b4cbff13bfaceadcf2c560066d73eb8b1e7`.
  The design's original `.407` references were HISTORICAL (the contract
  predates the `.408`–`.414` Owner-directed UI releases) and are
  corrected in DESIGN.md; rolling back to `.407` would discard those
  seven releases and is forbidden.
- The upgrade regression was RE-PROVEN against the exact `.414` bytes:
  `artifacts/evidence/OUT-upgrade-BASELINE-414-FAILS.txt` (1 passed /
  3 failed — the 2026-07-31 session is destroyed by `.414`, held as a
  conflict by the candidate).
- **Five-kind scan** (`rollback-scan.js`, evidence
  `artifacts/evidence/ROLLBACK-SCAN-EVIDENCE.json`): rollback to `.414`
  is legal ONLY when zero keys exist under ANY of
  `wl_training_{dirty,base,conflict,journal,corrupt}__*` for ANY
  account. Evidence shows a clean device eligible and each single kind,
  on any account, forcing ineligibility. Any match → recovery
  roll-forward, never old-build rollback.

## 4. Recovery artifact

- **Bytes**: `recovery/index-recovery-syncsafe.html`, sha256
  `b87120faa8b113c07c6f1810930cd4779e2f420c7574b6887c88a552a49fb95f`.
- **Derivation (reproducible)**: the frozen candidate + the delimited
  `M8 RECOVERY BUILD (SYNC_SAFE)` block appended at the
  `M8-END-OF-ALL-BLOCKS` marker + the APP_BUILD string set to
  `2026-08-02.414-RECOVERY-syncsafe`. The block's exact text is inside
  the artifact itself; re-derivation = re-run the documented insertion
  against the frozen candidate and compare hashes.
- **No-network proof + state matrix**:
  `artifacts/evidence/OUT-recovery.txt` — 25 cases across five seeded
  states (clean, dirty, conflict, journal-present, corrupt-key): zero
  training network activity (forced pull+push makes no request), every
  seeded key byte-identical before any edit, local editing functional
  with dirty accumulating, banner visible.
- **Operator procedure**: `RECOVERY-OPERATOR-PROCEDURE.md`.

## 5. Backup prerequisites (before the Owner may publish)

1. A fresh in-app export from the Owner's device (format-2, training
   included), delivered and confirmed.
2. DSM snapshot of `[docker]` (`/volume1/docker/pocketbase/pb_data`)
   taken same-day.
3. The nightly PB backup schedule confirmed active (Owner set daily
   18:00 on 2026-08-01).
Each is recorded with identity/timestamp in the release records before
the push.

## 6. Rollback / roll-forward decision procedure

A bad M8 build in production is handled as:
1. Run the five-kind scan (console paste, `rollback-scan.js`) on every
   device that has opened the app since publication (the Owner's iPhone;
   iPad if used).
2. ALL devices eligible (zero matches) → rollback permitted: revert the
   release commit, push, served-byte verify against the `.414` hash
   above.
3. ANY match anywhere → roll-forward ONLY: publish the recovery
   artifact (§4) as the served file, served-byte verify against its
   hash, and hold until a fixed candidate passes review. Never serve a
   raw-pull client to a device carrying M8 keys.

## 7. Storage-area inventory (what M8 touches on-device)

Per signed-in account uid: `wl_training_dirty__<uid>`,
`wl_training_base__<uid>`, `wl_training_conflict__<uid>`,
`wl_training_journal__<uid>`, and quarantine keys
`wl_training_corrupt__<uid>.<kind>.<ts>.<n>`. Existing stores
(`wl_v1`, `wl_training_v1`, `wl_pb`, `wl_last_owner`, containment
snapshot/journal keys, IndexedDB photos) are unchanged in shape.
Worst-case growth: one full canonical training copy in the base key
(29,805 bytes at the Owner's current data; §0/A6 of DESIGN), plus
bounded journal/conflict copies during transitions.

## 8. Device-check checklist (Owner, post-publish)

1. Settings shows build `2026-08-02.415-m8`.
2. First boot: expect the ONE-TIME "Training needs your review" card
   (bootstrap comparing phone vs server; migration-stamped fields make
   the copies differ by design). Tap Review → Export both copies →
   confirm files landed → "Keep this device's copy". State returns to
   normal; no data changes visible.
3. Log a throwaway lift set; watch the sync dot reach OK; delete it;
   dot OK again.
4. Airplane mode; log a set; the app must show unsynced-retry state,
   NOT an error page; disable airplane mode; dot returns to OK.
5. Attempt logout while airplane-moded with the unsynced set: it must
   refuse. Reconnect, let it sync, logout offer returns to normal
   (do NOT complete the logout).
6. Report each step; the release is accepted or the §6 procedure runs.

## 9. Served-byte verification procedure

After the authorized push: poll the live URL with cache-busting until
the served sha256 equals the RELEASE commit's index.html hash (recorded
at commit time; differs from the frozen candidate hash only by the
APP_BUILD stamp). Record UTC timestamps and both hashes in the release
records. Until that match is recorded: `verifiedAgainstLiveURL: false`
and no production claim is made.

## 10. Owner-facing risk summary (draft decision instrument:
## `decisions/DECISION-DRAFT-publish-m8.md`; delivered only after this
## package passes review)

- What ships: the sync engine that makes the July-31 loss class
  impossible; conflict review UI; logout protection. No visual changes
  beyond the one-time first-boot review and the conflict/blocked
  banners.
- Known trade-offs: strict-by-ruling one-time bootstrap conflict per
  device; sync pauses fail-closed (visible banner) rather than guessing
  on any storage damage; rollback becomes roll-forward-only the moment
  any device writes an M8 key.
- What stays off: raw-PATCH lockdown (a later, separately authorized
  server change).
