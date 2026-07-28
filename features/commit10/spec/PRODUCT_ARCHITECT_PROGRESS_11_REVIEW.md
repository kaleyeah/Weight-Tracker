# Product Architect Review — Commit 10 Progress Package 11

**Package:** `cf-commit10-progress-11-20260728.zip`  
**Review type:** Verification of Progress 10 recovery-drift cleanup corrections  
**Verdict:** **CORRECTIONS APPROVED — CONTINUE TO CONFLICT WORKFLOW AND STATUS SURFACE**

This is a progress ruling only. It does not approve the conflict-center UX, status surface, real Chromium integration, real PocketBase integration, client deployment, bridge removal, or lockdown.

---

# Executive ruling

Both Progress 10 corrections are implemented correctly:

1. the public recovery writer now forwards the captured-owner purge capability;
2. transient scheduler blocks are owned by the operation that created them.

The submitted token-only drift test exercises the previously unreachable path correctly:

- owner remains unchanged;
- session generation remains unchanged;
- full authentication token changes;
- recovery storage publishes successfully;
- the scheduler detects the stricter operation-context drift;
- the forwarded capability purges the verified artifact under the captured owner;
- no conflict reference is published;
- the active session’s namespace remains untouched;
- local athlete data remains pending.

The package reports:

- **700 tests passed**
- **0 failures**
- no prior hardening regressions
- **151 scheduler tests**

The evidence supports approval of these corrections.

---

# 1. C10-P10-01 — captured purge capability

## Ruling: APPROVED

The recovery store’s internal writer still creates a capability bound to:

- the captured account owner;
- the captured artifact ID;
- the approved locked purge implementation.

The public wrapper now preserves the complete callback contract:

```text
callback(ok, manifestOrReason, capturedCapability)
```

instead of truncating it to two arguments.

The scheduler can therefore remove a successfully published artifact after detecting a stricter session drift that the storage layer itself did not detect.

Approved properties:

- the capability is returned only on successful verified publication;
- a failed write returns no capability;
- the capability does not resolve its namespace from the currently active account;
- purge uses the artifact Web Lock;
- the current account cannot be selected by the caller;
- no payload content appears in keys or diagnostics.

This closes C10-P10-01.

---

# 2. Token-only drift path

## Ruling: APPROVED

The new test targets the exact interleaving identified in Progress 10:

1. storage captures owner and generation;
2. recovery writing begins;
3. the token rotates while owner and generation remain unchanged;
4. storage’s narrower drift check permits verified publication;
5. the scheduler’s full operation-context check rejects the result;
6. the scheduler invokes the captured purge capability;
7. the published artifact is removed;
8. no conflict becomes actionable.

This is materially different from the prior generation-drift test and is the correct proof.

The athlete’s local revision remains pending and is not discarded.

---

# 3. C10-P10-02 — operation-owned transient blocks

## Ruling: APPROVED

Transient block state now records the operation token that created it.

A late callback may clear the block only when:

```text
current block owner == callback operation token
```

This prevents an older recovery callback from clearing:

- a newer preserving state;
- a newer recovery-blocked state;
- a later conflict workflow.

The submitted matched test proves:

- the old operation cannot clear the newer block;
- the newer owning operation can clear its own block.

This closes C10-P10-02.

---

# 4. Test and evidence ruling

Accepted:

- 700 tests;
- 0 failures;
- full Commit 10 suites included;
- prior hardening suites remain green;
- acceptance-ID index included;
- the real public recovery wrapper is exercised;
- the capability is not manually injected by the test;
- the unreachable-code defect from Progress 10 is now directly covered.

The package correctly distinguishes the storage layer’s owner/generation drift rule from the scheduler’s stricter owner/generation/token operation rule.

---

# 5. Scheduler and recovery foundation status

The Product Architect now accepts the completed foundations for:

- immutable request capture;
- payload/idempotency/revision identity;
- one build-or-send operation per subsystem;
- session-scoped reruns;
- exact uncertain-request retry identity;
- response-context drift rejection;
- immediate conflict-preservation pause;
- exactly-once baseline retry;
- verified recovery publication;
- account-scoped recovery storage;
- Web-Locked publication and deletion;
- captured-owner cleanup after post-publication drift;
- operation-owned transient block cleanup.

This approval allows Claude to proceed with the user-facing conflict workflow and status model.

---

# 6. Next implementation boundary

Claude may now build and integrate:

- the conflict center;
- separate Health & progress and Training & workouts conflict cards;
- the three Product Architect choices;
- recovery-first destructive actions;
- current-server refresh before **Use the online copy here**;
- second-409 reconfirmation for **Use this device everywhere**;
- compact and per-subsystem sync status;
- reload persistence;
- account-switch behavior;
- browser integration tests.

The following remain mandatory:

- A6, C4, C5, F5, K1;
- CAS-01 through CAS-20;
- STATUS-01 through STATUS-08;
- C10-PLAN tests;
- independent-manifest tests;
- one manual set-aside confirmation;
- real Chromium multi-context evidence;
- real PocketBase route-contract evidence.

---

# 7. Scope remains unchanged

Not authorized:

- server route or migration changes;
- P7 lockdown;
- bridge removal;
- semantic snapshot merging;
- record-level synchronization;
- service-worker background queue;
- payload-cap changes;
- unrelated product work;
- production client deployment.

---

# Final verdict

## **CORRECTIONS APPROVED — CONTINUE TO CONFLICT WORKFLOW AND STATUS SURFACE**

Progress 10’s captured-capability and operation-owned-state defects are closed.

No further Product Architect decision is required before Claude proceeds with the conflict center, status surface, and browser integration.
