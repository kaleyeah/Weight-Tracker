# Product Architect Review — Commit 10 Progress Package 12

**Package:** `cf-commit10-progress-12-20260728.zip`  
**Review type:** Conflict workflow and status-model review  
**Verdict:** **CHANGES REQUIRED — PRODUCT CHOICES AND STATUS MODEL APPROVED; DESTRUCTIVE RESOLUTION OPERATIONS NEED THE SAME ASYNC SAFETY AS THE SCHEDULER**

This is a progress ruling only. It does not approve the rendered conflict center, interruption policy, real Chromium integration, real PocketBase integration, client deployment, bridge removal, or lockdown.

---

# Executive ruling

The package correctly implements the Product Architect’s intended athlete choices and ordinary-path outcomes for the five cases deferred from client staging:

- **A6** — neither valid version silently wins;
- **C4** — keep-local sends nothing and leaves the conflict unresolved;
- **C5** — failed recovery verification exposes no destructive choice;
- **F5** — the local copy is preserved before server adoption;
- **K1** — an edit during the safety-copy phase aborts adoption.

The wording model is also aligned:

- **Health & progress**
- **Training & workouts**
- **Keep this device’s changes** as the focused default
- **The online copy changed again. Review your choice.**
- no athlete-facing revisions, subsystem codes, CAS terminology, record IDs, or payload terminology.

The reported result is accepted as evidence for the included paths:

- 747 tests;
- 0 failures;
- 47 conflict-workflow tests;
- no prior-suite regression.

However, the destructive resolution functions bypass several asynchronous guarantees that were already established for the scheduler and recovery store. These gaps must be corrected before the rendered conflict center can safely call them.

---

# 1. Five deferred acceptance cases

## A6 — historical correction versus newer weigh-in

### Ruling: APPROVED IN THE TESTED PATH

The local correction remains active, the server copy is preserved, the subsystem remains pending, and no automatic winner is selected.

The other subsystem remains independent.

## C4 — Keep this device’s changes

### Ruling: APPROVED

The choice:

- sends no request;
- replaces nothing;
- leaves local state active;
- leaves the subsystem pending;
- leaves the conflict unresolved;
- preserves the verified online recovery artifact.

This is the correct safe default.

## C5 — recovery blocked

### Ruling: APPROVED

A recovery-blocked subsystem reports the safe failed state rather than advertising a conflict card whose destructive choices cannot safely run.

The wording does not claim that a copy was preserved.

## F5 — Use the online copy here

### Ruling: APPROVED IN THE ORDINARY PATH

The implementation captures the destructive context before asynchronous work, preserves the current device copy first, refreshes server state, and only then adopts.

This correctly addresses the earlier K1 context-capture defect.

## K1 — edit during safety copy

### Ruling: APPROVED IN THE TESTED PATH

An affected-subsystem edit during the safety copy aborts adoption, survives locally, and leaves the conflict unresolved.

---

# 2. Status model

## Ruling: APPROVED AS A MODEL

The per-subsystem mapping and compact priority are aligned with the specification:

1. Update required
2. Sync needs your choice
3. Sign in to sync
4. Couldn’t sync — changes are safe here
5. Saved on this device
6. Syncing…
7. Synced

Approved details:

- recovery-blocked is shown as failed, not actionable conflict;
- conflict outranks ordinary failure/pending states;
- core and training report independently;
- pending data is described as saved locally, never unsaved;
- the conflict state survives reload in the submitted model.

The actual rendered hierarchy, focus behavior, confirmations, notification cadence, and active-workout interruption policy remain unreviewed because the view is not built.

---

# 3. Required correction C10-P12-01 — one resolution operation per subsystem

## Defect

`cfCasUseThisDevice` and `cfCasUseOnlineCopy` do not reserve an operation token or resolution lock.

A double click, repeated keyboard activation, stale rendered card, or two same-origin contexts can start overlapping destructive resolutions for the same subsystem.

Possible consequences include:

- two CAS overwrite requests;
- two local safety artifacts;
- one callback resolving or clearing a newer conflict;
- one action adopting online data while another is attempting to publish local data;
- duplicated or contradictory success/failure messaging.

The unresolved conflict blocks the automatic scheduler, but it does not serialize explicit resolution actions.

## Required behavior

Only one resolution operation may be active per subsystem.

The operation must own:

- the selected action;
- owner/session identity;
- subsystem local revision;
- conflict ID;
- captured server revision;
- operation token;
- any recovery artifact/capability it creates.

While active:

- all three choices for that subsystem are disabled;
- repeat activation is ignored or returns the existing operation state;
- the other subsystem remains independently actionable;
- only the owning callback may clear/replace/resolve the conflict or status.

Required tests:

- **C10-P12-01:** Double activation of **Use this device everywhere** sends one commit.
- **C10-P12-02:** Double activation of **Use the online copy here** writes one safety artifact and performs at most one adoption.
- **C10-P12-03:** Two different destructive choices cannot overlap for the same subsystem.
- **C10-P12-04:** Core resolution does not block Training resolution.
- **C10-P12-05:** A late old-resolution callback cannot resolve or clear a newer conflict.

---

# 4. Required correction C10-P12-02 — revalidate context before applying manual-resolution responses

## Defect

The scheduler’s ordinary CAS response path now rejects late owner/session/subsystem responses.

The manual **Use this device everywhere** path calls `cfCasSend` directly and applies its 200 or 409 without rechecking the captured resolution context inside the response callback.

A possible sequence is:

1. Account A confirms **Use this device everywhere**.
2. Request is sent.
3. The athlete logs out or switches to Account B.
4. Account A’s late 200 arrives.
5. The callback updates server revision, baseline, local cleanliness, conflict ID, and block state in the newly active session.

The same problem applies to a late 409 and its asynchronous `cfCasReplaceConflict` callback.

## Required behavior

Before applying any manual-resolution network response:

- validate owner;
- session identity/generation;
- subsystem operation token;
- local revision context;
- conflict identity.

If drifted:

- ignore the response for application state;
- do not mark clean;
- do not replace the conflict;
- do not mutate the new account;
- retain only safe operational diagnostics.

If the server may have accepted Account A’s request before drift, Account A must reconcile when its legitimate session resumes. Do not transfer that acknowledgement to Account B.

Required tests:

- **C10-P12-06:** Account switch while local-overwrite request is pending; late 200 is inert.
- **C10-P12-07:** Logout while local-overwrite request is pending; late 409 creates no new conflict.
- **C10-P12-08:** Affected-subsystem edit while request is pending prevents that response from cleaning the newer local revision.
- **C10-P12-09:** An unrelated-subsystem edit does not invalidate the resolution.
- **C10-P12-10:** A late response from an older resolution cannot alter a newer resolution operation.

---

# 5. Required correction C10-P12-03 — recovery artifacts created by a resolution must be cleaned on abort

## Defect A — local safety copy

`cfCasUseOnlineCopy` creates and verifies a local safety artifact, but its callback receives only `ok`.

If context drifts after successful publication:

```js
if(cfCasCtxDrifted(...)){cb(false,"drift");return;}
```

The verified safety artifact is left behind.

The approved recovery writer can return a captured-owner purge capability; this resolution path must preserve and use it.

## Defect B — replacement conflict copy

`cfCasReplaceConflict` writes a newer server artifact and then updates global conflict state without an operation-context check.

If owner/session/conflict state changes while that write is running, the callback can:

- publish the new artifact into stale workflow state;
- replace a newer conflict;
- purge the wrong old reference;
- leave an orphaned verified artifact.

## Required behavior

Every resolution-created recovery write must return and retain its captured cleanup capability.

On drift, cancellation, supersession, or failed final state transition:

- purge the artifact through that captured capability;
- do not publish its reference;
- do not mutate the newly active account/session;
- do not purge a newer workflow’s artifact;
- preserve only artifacts intentionally retained by the product recovery policy.

Required tests:

- **C10-P12-11:** Drift after successful local safety publication purges that artifact.
- **C10-P12-12:** The purge uses captured-owner locked cleanup, not the live session.
- **C10-P12-13:** Drift during newer-conflict preservation publishes no replacement conflict.
- **C10-P12-14:** A superseded replacement artifact is purged without deleting the current conflict artifact.
- **C10-P12-15:** Cleanup failure produces no payload-bearing diagnostic and no new-session exposure.

---

# 6. Required correction C10-P12-04 — refresh and adoption must be one owned operation

The server revision refresh in **Use the online copy here** is correct in concept because a CAS revision makes an unchanged revision a valid freshness proof.

But the refresh callback and subsequent adoption must still be owned by the same resolution token.

Required:

- a late refresh cannot adopt into a changed account/session;
- a newer conflict cannot be cleared by an older refresh;
- adoption occurs only if the captured conflict artifact, server revision, local revision, and operation token still match;
- local adoption and clean-state transition are treated as one guarded destructive transition.

Add:

- **C10-P12-16:** Account switch during server refresh prevents adoption.
- **C10-P12-17:** Conflict replacement during refresh prevents adoption.
- **C10-P12-18:** A newer affected-subsystem edit immediately before adoption survives and adoption aborts.
- **C10-P12-19:** Successful adoption clears only the conflict owned by that operation.

---

# 7. Required correction C10-P12-05 — second-409 replacement must preserve context and cleanup

The product behavior is correct:

> The online copy changed again. Review your choice.

The implementation path must additionally prove:

- the second 409 body satisfies the exact conflict contract;
- the newer artifact is verified before replacing the old reference;
- the original conflict remains actionable until the new artifact is verified;
- a failed replacement leaves the original conflict intact rather than switching to a misleading half-state;
- only after verified replacement is the old artifact purged;
- session/operation drift cancels replacement and cleans the candidate.

Required tests:

- **C10-P12-20:** Failed newer-artifact write leaves the original conflict/reference intact.
- **C10-P12-21:** New conflict reference becomes visible only after verified publication.
- **C10-P12-22:** Old artifact is purged only after the new reference is committed.
- **C10-P12-23:** Drift during replacement preserves the old conflict and purges the candidate.
- **C10-P12-24:** Repeated second 409s never loop automatically or accumulate orphan artifacts.

---

# 8. Rendered conflict-center review timing

## Product Architect decision

**Send the rendered conflict center for review as soon as the view exists, before the full real-browser interaction package.**

Do not wait until all Chromium and PocketBase evidence is complete.

The rendered-view package should include:

- screenshots at desktop and narrow/mobile widths;
- both subsystem cards visible together;
- one-card-only state;
- focused default choice;
- all confirmation wording;
- preserving/recovery-blocked/changed-again states;
- keyboard focus order;
- screen-reader names and descriptions;
- active-workout non-modal notification state;
- status indicator and detail view;
- no raw revision/CAS/payload terminology.

This early visual review is intended to correct product wording and hierarchy before expensive browser wiring and evidence capture. It is not an additional architecture loop for the already approved storage/scheduler foundations.

---

# 9. Test and evidence ruling

Accepted:

- 747 tests;
- 0 failures;
- 47 conflict-workflow tests;
- explicit A6, C4, C5, F5, and K1 evidence;
- transparent correction of the context-capture and recovery-blocked-status defects;
- no prior-suite regression.

Not yet evidenced:

- resolution-action serialization;
- manual-resolution late-response drift;
- cleanup of resolution-created recovery artifacts;
- operation-owned refresh/adoption;
- context-safe second-409 replacement;
- rendered cards and confirmations;
- active-workout interruption behavior;
- real Chromium multi-context behavior;
- real PocketBase route behavior.

---

# 10. Continued implementation ruling

Correct C10-P12-01 through C10-P12-05 while building the rendered conflict center.

Claude may proceed with the view, but the view must call an operation-owned resolution API rather than directly invoking unguarded asynchronous functions.

Submit the rendered view for Product Architect review as soon as it exists. After that, continue to full browser/server integration evidence.

No client deployment, server change, lockdown, bridge removal, semantic merge, or record-level synchronization is authorized.

---

# Final verdict

## **CHANGES REQUIRED — PRODUCT CHOICES AND STATUS MODEL APPROVED; DESTRUCTIVE RESOLUTION OPERATIONS NEED THE SAME ASYNC SAFETY AS THE SCHEDULER**

The athlete-facing behavior and five deferred outcomes are correct in the tested ordinary paths. The remaining work is to serialize and context-guard explicit destructive resolutions, clean their recovery artifacts on abort, and then present the rendered conflict center for early UX review.
