# Product Architect Review — Commit 10 Progress Package 13

**Package:** `cf-commit10-progress-13-20260728.zip`  
**Review type:** Verification of owned destructive-resolution operations  
**Verdict:** **CHANGES REQUIRED — OWNED RESOLUTION MODEL APPROVED; COMPLETE THE REQUIRED EVIDENCE AND REPLACEMENT CLEANUP CONTRACT**

This is a progress ruling only. It does not approve the rendered conflict center, interruption policy, real Chromium integration, real PocketBase integration, client deployment, bridge removal, or lockdown.

---

# Executive ruling

The structural correction requested in Progress 12 is substantially right:

- one resolution operation owns each affected subsystem;
- repeat or conflicting activation is refused while that operation is active;
- core and training remain independent;
- manual network responses are checked against the captured resolution context;
- resolution-created recovery artifacts retain captured cleanup capabilities;
- server refresh and local adoption belong to one guarded operation;
- a second 409 preserves and verifies the newer server copy before swapping references;
- operation-owned callbacks cannot clear a newer operation’s state.

The reported suite is green:

- **774 tests**
- **0 failures**
- **74 conflict-workflow tests**
- no prior-suite regressions

The ordinary paths for A6, C4, C5, F5, and K1 remain aligned with the approved product behavior.

Two matters remain before this boundary is complete:

1. ten required C10-P12 acceptance IDs are absent from the submitted test source and acceptance index;
2. old-artifact deletion after a verified second-409 swap is launched but not completion-checked, so repeated replacements can leave untracked artifacts while the workflow reports completion.

---

# 1. Per-subsystem resolution ownership

## Ruling: APPROVED

`CF_CAS_RES` now reserves one explicit decision operation per subsystem.

Approved behavior:

- a second activation is refused as busy, not queued;
- two different destructive choices cannot overlap for the same subsystem;
- Health & progress resolution does not prevent Training & workouts resolution;
- callbacks may act only while their operation still owns the subsystem;
- a late old callback cannot resolve or clear a newer conflict operation.

The action, owner/session context, revisions, conflict identity, token, and created artifacts are grouped into the operation.

This closes the architectural defect class identified in Progress 12.

---

# 2. Manual-response context checks

## Ruling: APPROVED IN THE IMPLEMENTATION DIRECTION

**Use this device everywhere** now validates the resolution context:

- before constructing the request;
- after hashing;
- before applying the response.

A late 200 cannot mark the current account clean when the response belongs to an older operation.

A late 409 cannot replace the current conflict after owner, session, local revision, server revision, conflict identity, or operation ownership has moved.

The implementation is consistent with the scheduler’s previously approved async context model.

---

# 3. Resolution-created recovery cleanup

## Ruling: APPROVED FOR ABORTED LOCAL-SAFETY OPERATIONS

The local safety artifact created by **Use the online copy here** is retained with its captured-owner purge capability.

On drift or abort:

- the operation cleanup invokes the captured capability;
- cleanup does not resolve scope from the currently active session;
- the original conflict remains unresolved;
- local data remains active.

On successful adoption, the device safety copy is intentionally retained as recovery material.

That is the correct product behavior.

---

# 4. Refresh and adoption

## Ruling: APPROVED IN THE IMPLEMENTATION DIRECTION

The server refresh and local adoption now belong to the same resolution operation.

Adoption requires the operation context still to match immediately before the destructive step.

This correctly protects against:

- affected-subsystem edits;
- account/session change;
- conflict replacement;
- operation supersession.

An unrelated subsystem edit remains independent.

---

# 5. Second-409 replacement

## What is approved

The ordering is correct:

1. preserve and verify the newer server artifact;
2. keep the original conflict actionable until verification succeeds;
3. check operation context;
4. swap the server revision and conflict reference;
5. only then attempt deletion of the old artifact;
6. require the athlete to review the choice again.

A failed candidate write leaves the original reference intact and enters a safe recovery-blocked state.

Drift before the swap purges the candidate through its captured capability.

## Required correction C10-P13-01 — old-artifact cleanup must be an owned, observable part of replacement

After swapping references, the current implementation calls:

```js
cfCasRecPurge(old, function(){});
```

and immediately reports replacement success.

The purge result is ignored.

A failed or delayed purge can therefore leave the old verified artifact behind. Repeated second-409 replacement cycles can accumulate artifacts even though the workflow reports each replacement as complete.

Progress 12 required:

> Repeated second 409s never loop automatically or accumulate orphan artifacts.

## Required behavior

Once the new verified reference is committed:

- initiate deletion of the old artifact through the approved locked API;
- observe completion and result;
- never roll back the new verified reference merely because old-artifact cleanup failed;
- record the old artifact for the approved account-scoped retention cleanup if immediate deletion fails;
- do not report that cleanup completed when it did not;
- do not expose payload information in diagnostics;
- repeated replacement cycles must not create unbounded untracked recovery artifacts.

This is a cleanup/retention state, not a reason to restore the stale conflict.

Claude decides whether to use a small pending-cleanup ledger, retained manifest flag, or another implementation mechanism. The product requirement is observable, retryable, account-scoped cleanup.

Required tests:

- **C10-P13-01:** Successful swap waits for or records the old-artifact purge result.
- **C10-P13-02:** Old-artifact purge failure keeps the new conflict reference valid.
- **C10-P13-03:** Failed purge enters account-scoped pending cleanup without payload-bearing diagnostics.
- **C10-P13-04:** A later cleanup attempt removes the retained old artifact.
- **C10-P13-05:** Repeated second 409s do not create untracked or unbounded orphan artifacts.
- **C10-P13-06:** Cleanup belonging to Account A cannot run against Account B after a switch.

---

# 6. Missing C10-P12 evidence

The Progress 12 review required tests `C10-P12-01` through `C10-P12-24`.

The submitted test source and acceptance-ID index do not contain these required IDs:

- `C10-P12-05`
- `C10-P12-07`
- `C10-P12-08`
- `C10-P12-09`
- `C10-P12-13`
- `C10-P12-14`
- `C10-P12-15`
- `C10-P12-17`
- `C10-P12-19`
- `C10-P12-23`

The implementation appears to contain mechanisms intended to satisfy several of them, but the evidence package does not prove them.

Add explicit, named behavioral tests:

### C10-P12-05

A late callback from an older resolution cannot clear or resolve a newer conflict.

### C10-P12-07

Logout while **Use this device everywhere** is pending; a late 409 creates no replacement conflict.

### C10-P12-08

An affected-subsystem edit while the overwrite request is pending prevents the response from cleaning that newer local revision.

### C10-P12-09

An unrelated-subsystem edit does not invalidate the selected subsystem’s resolution.

### C10-P12-13

Drift during newer-conflict preservation publishes no replacement reference.

### C10-P12-14

The superseded candidate is purged without deleting the currently valid conflict artifact.

### C10-P12-15

Cleanup failure exposes no payload-bearing diagnostic and nothing to the newly active account.

### C10-P12-17

Conflict replacement during server refresh prevents online-copy adoption.

### C10-P12-19

Successful online-copy adoption clears only the conflict owned by that operation.

### C10-P12-23

Drift during second-409 replacement preserves the original conflict and purges or tracks the candidate safely.

These are evidence corrections, not new product behavior.

---

# 7. Test-bug disclosure

The reported test boot failure caused by closing over an environment binding before initialization is accepted as a harness defect.

Correcting the test setup and recording it is the appropriate response.

It does not alter the Product Architect verdict.

---

# 8. Rendered conflict-center review

The prior decision remains:

> Submit the rendered conflict center as soon as the view exists, before the full real-browser and real-PocketBase package.

The next visual package should include:

- desktop and narrow/mobile screenshots;
- both subsystem cards together;
- one-card-only state;
- focused keep-local default;
- preserving state;
- recovery-blocked state;
- changed-again state;
- confirmations for both destructive choices;
- disabled/busy state during an owned resolution;
- compact status indicator and detail view;
- keyboard focus order;
- screen-reader names/descriptions;
- active-workout non-modal notification behavior.

The view must use the owned resolution API reviewed here.

The missing tests and cleanup correction may be included in that same package.

---

# 9. Test and evidence ruling

Accepted:

- 774 total tests;
- 0 failures;
- 74 conflict-workflow tests;
- no prior-suite regression;
- structural conversion of destructive choices into owned operations;
- ordinary-path evidence for double activation, independent subsystems, late 200 rejection, local-safety cleanup, verified replacement ordering, and edit-during-adoption abort.

Not yet accepted:

- the ten omitted C10-P12 cases;
- bounded/observable cleanup after a completed second-409 reference swap;
- rendered UI behavior;
- real Chromium multi-context behavior;
- real PocketBase behavior.

---

# 10. Continued implementation ruling

Claude may build the rendered conflict center now.

Before treating the conflict workflow boundary as complete:

- implement C10-P13-01;
- add C10-P13-01 through C10-P13-06;
- add the ten omitted C10-P12 tests;
- update the acceptance-ID index.

No separate correction-only package is required. Include the corrections with the rendered conflict-center review package unless a new Product Owner decision is needed.

No client deployment, server change, lockdown, bridge removal, semantic merge, or record-level synchronization is authorized.

---

# Final verdict

## **CHANGES REQUIRED — OWNED RESOLUTION MODEL APPROVED; COMPLETE THE REQUIRED EVIDENCE AND REPLACEMENT CLEANUP CONTRACT**

The destructive-resolution architecture is now sound in direction. Complete the missing race evidence and make old-artifact cleanup observable and retryable, then submit the rendered conflict center for Product Architect review.
