# M8 release package — for Architect packaging review (round 22)

Assembled 2026-08-02. Nothing here is deployed, committed to the app
lineage, tagged, or pushed; `verifiedAgainstLiveURL: false` throughout.

## 1. Frozen candidate identity

- **FINAL candidate (stamped)**: sha256
  `5bda0da514c512ce1674aaff5cd78eb81f7fd0519388d78875a5f1bc1ba35ee3`,
  build id `2026-08-02.415-m8` — the exact bytes the Owner will approve
  and that would be published. FROZEN: any further change invalidates
  this identity.
- **Stamp-only proof**: `artifacts/evidence/STAMP-ONLY-DIFF.txt` — the
  4-line diff from the gate-era candidate `b8f252b3…de24b` is exactly
  the one APP_BUILD string literal, unreachable by any sync code path.
- **All client gates re-run against the FINAL bytes**: 129 cases green
  (upgrade 4, matrix 9, replay 10, accounts 6, quota 6, tags 5,
  faults 64, recovery 25 against the re-derived artifact), outputs in
  `artifacts/evidence/`. **Real-PB gate applicability**: the byte
  difference is the build-string literal only (proof above); further,
  the deterministic recovery derivation from the FINAL bytes reproduces
  the gate-era recovery artifact BYTE-IDENTICALLY (`b87120fa…fb95f`),
  because the recovery stamp overrides the only differing bytes — the
  sync logic the gate exercised is bit-for-bit present.
- **Diff**: `artifacts/evidence/APP-DIFF-m8-over-414.txt` over the
  published base.

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
- **Derivation (deterministic, executable)**:
  `recovery/derive-recovery.mjs` with the standalone block source
  `recovery/recovery-block.js` (sha256 `34a3b92b…7431cfc9`). Run:
  `node derive-recovery.mjs <candidate> <out>`. Executed against the
  FINAL candidate: input `5bda0da5…1ba35ee3` → output
  `b87120fa…a49fb95f`, byte-equal to the packaged artifact (the tool
  prints all three hashes; recorded in this package).
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
1. **Default: roll-forward.** On the Owner's iPhone Home Screen app
   there is no tested read-only way to execute the scan (no console;
   Safari Web Inspector requires a Mac the procedure cannot assume).
   Eligibility that cannot be OBSERVED is treated as failed: publish
   the recovery artifact (§4), served-byte verify against its hash,
   hold for a reviewed fix. Never serve a raw-pull client to a device
   that may carry M8 keys.
2. Rollback to `.414` is permitted ONLY in the narrow provable case:
   the release records show no device ever opened the M8 build (e.g.
   the defect is caught by served-byte verification before the Owner's
   first open) — evidenced from the records, not assumed — plus, where
   a desktop inspector IS available, an observed five-kind scan
   (`rollback-scan.js`, evidence ROLLBACK-SCAN-EVIDENCE.json) showing
   zero matches on every device that opened the app.

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

ONE identity end to end (round-23 item 1): the frozen final candidate
`5bda0da5…1ba35ee3` IS the committed `index.html`, IS the tag target's
`index.html`, and IS the byte content the live URL must serve. After
the authorized push: poll the live URL with cache-busting until the
served sha256 equals `5bda0da514c512ce1674aaff5cd78eb81f7fd0519388d788
75a5f1bc1ba35ee3` exactly. ANY difference at any of these four points —
candidate, commit, tag target, served — ABORTS the release. Record UTC
timestamps and the observed hashes in the release records. Until the
match is recorded: `verifiedAgainstLiveURL: false` and no production
claim is made.

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
