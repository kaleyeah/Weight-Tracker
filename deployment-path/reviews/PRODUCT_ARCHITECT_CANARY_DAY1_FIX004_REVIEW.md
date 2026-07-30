# Product Architect Review — Canary Day 1 / FIX-004

**Package:** `cf-canary-day1-fix004-20260730.zip`  
**Review type:** Day-one canary stop, sync-status honesty, and `.350` candidate  
**Verdict:** **FIX-004 NARROW DEFECT APPROVED — `.350` CANARY REPUBLISH NOT AUTHORIZED**

This review does not authorize production-root deployment, bridge removal, minimum-client-build enforcement, or P7 lockdown.

---

# Executive ruling

The package identifies and fixes a real defect:

> After a successful CAS commit, the client could remain visually red because the legacy `cfPending="push"` marker was never cleared.

The negative control proves that defect, and the proposed whole-surface guard correctly prevents one successful subsystem from hiding a genuinely pending or blocked sibling.

However, this fix does **not** establish the cause of the Product Owner’s actual iPhone canary stop.

At the time of the device report:

- the server row did not advance;
- `cf_commit_log` contained zero rows;
- no successful CAS commit was observed;
- the 12:22 AM timestamp represented a pull;
- the original device sequence was not reproduced by `day1-repro-probe.js`.

FIX-004 runs only from the successful CAS-commit path. It cannot, by itself, explain or correct a red status that appears when no commit occurred.

There is also a status-ownership defect in the proposed helper:

```js
cfCasSyncLegacyStatus()
```

unconditionally sets the shared legacy status to `ok` after the CAS surface settles. That can erase an unrelated error such as:

> photo list incomplete — nothing removed

The package itself reports that this photo condition can produce a red global status on a clean account.

Therefore:

- preserve the FIX-004 behavior;
- do not publish `.350` yet;
- make status clearing source-owned;
- handle pull/bootstrap convergence as well as commit convergence;
- separate photo reconciliation warnings from core/training upload failure;
- identify the actual canary condition before restarting Day 1.

---

# 1. FIX-004 — successful commit clears its own stale pending marker

## Ruling: APPROVED IN PRODUCT DIRECTION

Approved behavior:

- an edit raises the honest local-pending warning;
- a verified successful CAS commit may clear that warning once both core and training are settled;
- a blocked sibling keeps the warning;
- a dirty/unsent sibling keeps the warning;
- the athlete is not told an upload failed after it actually succeeded.

`STATUS-H-01` through `STATUS-H-05` are useful evidence for this narrow bug.

The negative control is meaningful:

- without the correction, the real commit succeeds;
- CAS is synced;
- local data is clean;
- the red legacy marker remains;
- the test exits nonzero.

Keep this regression permanently.

---

# 2. Actual canary stop — root cause remains open

## Ruling: NOT EXPLAINED BY THE CURRENT FIX

The package contains two different scenarios:

### Scenario A — actual Product Owner device

- red sync status;
- no commit ledger row;
- server revision unchanged;
- timestamp came from pull;
- exact sequence not reproduced.

### Scenario B — disposable reproduction

- local edit performed;
- real CAS commit returned 200;
- server revision advanced;
- CAS became synced;
- stale legacy pending marker remained.

Scenario B proves FIX-004 is needed.

It does not prove Scenario B caused Scenario A.

Do not describe the Product Owner’s canary stop as diagnosed until runtime evidence identifies the active status source and state on that device sequence.

---

# 3. Required correction FIX004-STATUS-01 — status causes must be owned

## Defect

The legacy status is one shared object:

```js
syncState = { s, msg }
```

Different systems can write to it:

- local CAS pending;
- offline/network state;
- authentication;
- photo reconciliation;
- legacy/manual upload paths;
- other operational failures.

The proposed `cfCasSyncLegacyStatus()` clears that shared state whenever the CAS surface is settled, regardless of which subsystem created the current message.

A later successful core commit could therefore erase a real photo-list warning or another unrelated status.

## Required behavior

Give status transitions an explicit source/owner, conceptually:

```text
cas-pending
cas-network
photo-reconcile
auth
legacy-manual
```

Claude decides the implementation.

Required rules:

- the CAS convergence helper may clear only a status it owns;
- it must not clear photo, auth, offline, recovery, or unrelated operational status;
- clearing an owned status reveals the next valid status rather than forcing global `ok` blindly;
- status ownership is not inferred by matching localized message text;
- no raw internal status-source name appears in athlete-facing UI.

A small status-channel/priority model is acceptable. Avoid another broad global setter that recreates the same ambiguity.

---

# 4. Required correction FIX004-STATUS-02 — convergence is not limited to a successful upload

The actual canary state had no CAS commit.

A stale local pending-upload marker must also be reconciled when an authenticated bootstrap/pull proves:

- local and server canonical payloads agree;
- local revisions are not dirty;
- no operation is in flight;
- no conflict or recovery block exists;
- both subsystems are settled.

Required product behavior:

> If the device and server are already in agreement, the athlete must not be told that device changes still need uploading merely because no new commit occurred in that session.

Use one source-owned convergence function from both:

- successful CAS acknowledgement;
- successful bootstrap/pull/adoption reconciliation.

Do not clear pending merely because a pull completed. Clear it only after the equality and revision conditions above are proven.

---

# 5. Photo-list incomplete status

## Product Architect decision

`photo list incomplete — nothing removed` must not present as the same global red **Sync error** used for failed core/training upload.

This condition means:

- the app could not fully enumerate photo metadata;
- therefore it conservatively refused to infer deletion;
- no photo was removed;
- core/training sync may still be healthy.

Approved presentation:

- section-specific or settings-level warning;
- warning/amber severity, not red upload failure;
- wording such as:
  > Photo sync couldn’t be fully checked. Nothing was removed.
- a retry opportunity where appropriate;
- no claim that core/training changes failed to upload.

If photo enumeration completed successfully and the account simply has zero photos, show no warning.

This condition must remain visible until a later complete photo enumeration succeeds or the user dismisses it under an approved lifecycle. A successful CAS commit must not erase it.

---

# 6. Required tests

Add:

## CAS pending ownership

- **STATUS-H-06:** A successful CAS commit clears the `cas-pending` source it owns.
- **STATUS-H-07:** A successful CAS commit does not clear a photo-reconciliation warning.
- **STATUS-H-08:** A successful CAS commit does not clear an auth/offline/unrelated failure source.
- **STATUS-H-09:** A blocked sibling prevents CAS pending from clearing.
- **STATUS-H-10:** A dirty sibling prevents CAS pending from clearing.

## Pull/bootstrap convergence

- **STATUS-H-11:** A stale CAS-pending marker clears when bootstrap proves local/server equality and both subsystems clean.
- **STATUS-H-12:** Pull completion alone does not clear pending when canonical payloads differ.
- **STATUS-H-13:** Pull completion does not clear pending while either subsystem is dirty.
- **STATUS-H-14:** Pull completion does not clear conflict/recovery state.
- **STATUS-H-15:** The no-commit convergence path performs no raw snapshot mutation.

## Photo warning

- **PHOTO-STATUS-01:** Successful complete enumeration with zero photos produces no warning.
- **PHOTO-STATUS-02:** Incomplete enumeration produces the approved photo-specific warning.
- **PHOTO-STATUS-03:** The warning uses warning severity, not global red upload failure.
- **PHOTO-STATUS-04:** Nothing is deleted when enumeration is incomplete.
- **PHOTO-STATUS-05:** A successful CAS commit does not clear the photo warning.
- **PHOTO-STATUS-06:** A later complete photo enumeration clears the photo warning.
- **PHOTO-STATUS-07:** Core/training status remains independently accurate while the photo warning exists.
- **PHOTO-STATUS-08:** The athlete-facing message contains no internal collection/API terminology.

## Actual-sequence diagnostics

Add a payload-free diagnostic snapshot available to the engineer during the next canary attempt, recording:

- build;
- `cfPending`;
- legacy status state and source;
- core/training local, acknowledged, and server revisions;
- core/training block and operation phase;
- conflict/recovery state;
- photo-reconciliation warning state;
- auth/session state;
- last-sync timestamp;
- request status/ledger attribution.

Do not record raw athlete payloads.

---

# 7. `.350` artifact and pipeline evidence

## Ruling: PIPELINE PROVENANCE ACCEPTED; CLIENT RELEASE WITHHELD

The packaged artifact is internally consistent:

```text
build   2026-07-30.350-pb-c10
sha256  c3dc0321e9d60721d14f85be6f6535ec6b933d767a66d6ac90e571a16cbd034a
bytes   1,191,327
```

The packaged file independently matches the hash and byte count.

The manifest records the mandatory expectation identity and current builder commit.

The release pipeline reports 65 assertions, 0 failures, including mandatory `RELEASE.expected.json` tests.

The pipeline brittleness correction—reading the reviewed expectation rather than hard-coding `.349`—is approved.

`PUBLISHED.json` correctly distinguishes:

- what is live;
- what is intended next.

The release is withheld because the status behavior is not yet complete, not because of pipeline provenance.

---

# 8. On-device Cancel step

## Product Architect decision: YES, RE-RUN IT BEFORE THE 48-HOUR CLOCK STARTS

The Product Owner skipped Cancel during the real-device FIX-003 confirmation.

Chromium evidence is valuable but does not replace the specific real-iPhone step requested for Day 1.

On the next candidate:

1. open **No — set it aside**;
2. verify the confirmation is visible;
3. tap Cancel;
4. verify the gate and unknown data remain unchanged;
5. reopen the action;
6. confirm;
7. verify set-aside preservation and export.

This is required before CANARY-05 is considered complete and before the 48-hour clock begins.

Do not use the Product Owner’s real unknown data to exercise **Yes — this is mine**. That path remains covered by disposable browser evidence unless a safe disposable on-device scenario is prepared.

---

# 9. Canary state and restart

## Current status: KEEP `.349` HALTED

Keep:

```text
root     .347
/canary/ .349
```

unchanged.

Do not publish `.350`.

The next candidate requires a new build identifier because its bytes/status behavior will change beyond the reviewed `.350`.

After the corrected status package is approved:

- republish only `/canary/`;
- restart from `CANARY-01`;
- complete the on-device Cancel step;
- start the 48-hour clock only after all Day 1 cases pass.

---

# 10. Required next package

Return:

```text
cf-canary-day1-status-v2-YYYYMMDD.zip
├── 00-PROMPT.md
├── PROJECT_STATUS.md
├── STATUS_MODEL.md
├── artifact/
│   ├── index.html
│   ├── manifest.json
│   └── index.html.sha256
├── source/
│   ├── status ownership/convergence code
│   └── photo reconciliation status code
├── tests/
│   ├── sync-status.browser.test.js
│   └── photo-status.browser.test.js
└── evidence/
    ├── STATUS-H-06..15
    ├── PHOTO-STATUS-01..08
    ├── negative controls
    ├── actual-sequence diagnostic fixture
    ├── full regression
    ├── release-pipeline log
    └── served root/canary hashes
```

The package must explicitly state whether the actual iPhone red status has been reproduced or whether the candidate instead closes every identified source that could create it.

---

# Final verdict

## **FIX-004 NARROW DEFECT APPROVED**

## **STATUS OWNERSHIP AND PULL-CONVERGENCE CORRECTIONS REQUIRED**

## **PHOTO RECONCILIATION MUST NOT MASQUERADE AS CORE/TRAINING UPLOAD FAILURE**

## **`.350` CANARY REPUBLISH NOT AUTHORIZED**

The successful-commit stale-marker bug is real. Preserve its fix, but do not restart the canary until the status system can identify and clear only its own causes and the actual no-commit canary state is addressed.
