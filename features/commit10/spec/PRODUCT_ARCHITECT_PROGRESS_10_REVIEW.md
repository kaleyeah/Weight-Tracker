# Product Architect Review — Commit 10 Progress Package 10

**Package:** `cf-commit10-progress-10-20260728.zip`  
**Review type:** Verification of Progress 9 session-boundary corrections and missing evidence  
**Verdict:** **CHANGES REQUIRED — QUEUED-WORK AND RESPONSE-CONTRACT CORRECTIONS APPROVED; CAPTURED PURGE CAPABILITY IS DROPPED**

This is a progress ruling only. It does not approve the conflict center, status surface, browser integration, real PocketBase evidence, client deployment, or lockdown.

---

# Executive ruling

The package correctly addresses most of Progress 9:

- queued reruns now carry owner, generation, and full in-memory token identity;
- old-session queued work is discarded rather than translated into a new-account run;
- the full token is compared rather than a 16-character suffix;
- the missing C10-P8-11, C10-P8-12, and C10-P8-13 behavioral tests are now included;
- all Commit 10 suites are shipped;
- the acceptance-ID index materially improves evidence auditability;
- the reported suite is green: 684 tests, 0 failures.

One concrete implementation defect remains in the recovery-drift cleanup path:

> The recovery writer creates a captured-owner purge capability as its third callback argument, but the public `write` wrapper discards that third argument.

The scheduler callback therefore never receives the capability it intends to use.

---

# 1. C10-P9-01 — session-scoped queued reruns

## Ruling: APPROVED

`CF_CAS_RERUN[sub]` is no longer a bare boolean. It records the session that requested the rerun.

`cfCasFinishOp`:

- consumes the queued item once;
- compares it with the current owner, generation, and full token;
- refuses to schedule old-session work in the new session;
- allows a new session to schedule its own work independently.

The submitted tests cover:

- account/session change with queued work;
- logout with queued work;
- a new session scheduling its own edit;
- independent core/training queues.

This closes C10-P9-01.

---

# 2. C10-P9-03 — exact session identity

## Ruling: APPROVED

The operation and queued-session context use the complete token in memory, together with owner and session generation.

The test using two different tokens with the same final 16 characters proves that the previous suffix comparison is gone.

Approved constraints:

- the token is not logged;
- the operation object is not serialized or persisted;
- the token is used only for in-memory equality/drift detection.

This closes C10-P9-03.

---

# 3. Missing C10-P8-11, C10-P8-12, and C10-P8-13 evidence

## Ruling: APPROVED

The package now includes explicit behavioral tests for:

- missing or wrong subsystem on HTTP 200;
- missing, string, negative, and fractional `newRev`;
- malformed HTTP 409 bodies;
- malformed 409 creating no recovery artifact;
- malformed 409 publishing no conflict reference;
- local data remaining pending.

The acceptance-ID index includes all three IDs, and the full scheduler suite is shipped.

This closes the evidence gap identified in Progress 9.

The Product Architect accepts the package’s correction of the earlier inaccurate evidence claim. Recording the discrepancy and changing the package format is the correct response.

---

# 4. Required correction C10-P10-01 — preserve the recovery purge capability through the public wrapper

## Defect

Inside `writeLocked`, successful publication creates:

```js
var cap = {
  purge: function (cb) {
    purgeScoped(ctx.owner, ctx.id, cb || function () {});
  }
};

done(true, candidate, cap);
```

But the public writer wrapper invokes `writeLocked` through:

```js
writeLocked(ctx, sub, serverRev, payloadStr, function (ok, out) {
  release();
  cb(ok, out);
});
```

The wrapper receives and forwards only two arguments.

The third `cap` argument is discarded.

The scheduler expects:

```js
function (ok, manOrReason, cap) {
  if (cfCasOpDrifted(op)) {
    if (ok && cap && cap.purge) cap.purge(...);
    ...
  }
}
```

In the shipping code, `cap` is always `undefined` on writer success.

## Why the current green test does not catch it

The submitted recovery-drift test increments `CF_SESSION_GEN` while the recovery digest is parked.

The recovery store itself checks owner/generation drift, purges its partial state, and returns failure before publication. That is a valid case, but it does not exercise the scheduler’s post-success purge capability.

A distinct valid interleaving is:

1. Recovery storage captures Account A owner/generation.
2. The authentication token changes while owner and `CF_SESSION_GEN` remain unchanged.
3. The recovery store’s owner/generation drift check does not detect that token-only session change.
4. The store publishes a verified artifact and calls `done(true, candidate, cap)`.
5. The scheduler’s stricter operation check detects the full-token drift.
6. The scheduler attempts `cap.purge(...)`.
7. The wrapper has discarded `cap`, so the verified Account A artifact remains orphaned.

The exact-session correction made this path more important, not less.

## Required behavior

The public recovery writer must preserve the complete callback contract:

```text
cb(ok, manifestOrReason, capturedCapability)
```

Required properties:

- the capability is returned only after successful verified publication;
- it remains bound to the captured owner and artifact ID;
- it does not resolve scope from the currently active session;
- the artifact lock is used during purge;
- the scheduler can purge a successfully published artifact after stricter operation-context drift;
- no account-selectable public purge surface is introduced.

Claude decides the precise signature or result-object structure. The WHAT requirement is that the scheduler receives a working captured-owner cleanup capability after successful publication.

---

# 5. Required correction C10-P10-02 — make the preserving-state cleanup operation-owned

The scheduler currently clears:

```js
if (CF_CAS_BLOCK[sub] === "preserving") CF_CAS_BLOCK[sub] = null;
```

after drift.

This is better than leaving the new session paused, but a string equality check does not prove that the current `preserving` state still belongs to the old operation.

Before final integration, transient scheduler blocks should carry or be checked against an operation/conflict identity.

Required behavior:

- the old operation may clear only the transient preserving state it created;
- it must not clear a newer operation’s preserving/recovery/conflict state;
- a new session or newer same-session conflict cannot have its block removed by a late old callback.

A narrow operation token on the transient state is sufficient. Claude decides the implementation.

---

# 6. Required tests

Add named tests:

- **C10-P10-01:** Recovery writer success forwards a captured purge capability through the public wrapper.
- **C10-P10-02:** Token changes during recovery digest while owner/generation stay constant.
- **C10-P10-03:** Storage publishes successfully in that token-only drift case, then scheduler detects operation drift.
- **C10-P10-04:** Scheduler invokes the captured purge capability.
- **C10-P10-05:** The verified artifact is absent after captured purge completes.
- **C10-P10-06:** The currently active account’s namespace is untouched.
- **C10-P10-07:** Captured purge still uses the artifact Web Lock.
- **C10-P10-08:** Failed captured purge produces no payload-bearing diagnostic and exposes nothing to the new session.
- **C10-P10-09:** A late old-operation callback cannot clear a newer preserving block.
- **C10-P10-10:** A late old-operation callback cannot clear a newer recovery/conflict state.

These tests must exercise the real public writer wrapper, not a stub that manually supplies a capability.

---

# 7. Test and evidence ruling

Accepted:

- 684 total tests;
- 0 failures;
- 123 CAS decision-core tests;
- 50 independent-manifest tests;
- 132 recovery-writer tests;
- 135 scheduler tests;
- all prior hardening suites green;
- every Commit 10 suite included;
- acceptance-ID index included.

The green suite supports the implemented paths it exercises.

It does not prove the captured-capability path because the shipping wrapper currently makes that path unreachable.

---

# 8. Continued implementation ruling

Correct C10-P10-01 and C10-P10-02 before the conflict center uses recovery-preservation completion as authoritative state.

Claude may continue conflict-center and status-surface scaffolding in parallel, but destructive conflict integration must use:

- a forwarded captured-owner purge capability;
- operation-owned transient block state.

Real PocketBase and real Chromium multi-context evidence remain mandatory for final Commit 10 approval.

No server change, client deployment, lockdown, bridge removal, semantic merge, or record-level synchronization is authorized.

---

# Final verdict

## **CHANGES REQUIRED — QUEUED-WORK AND RESPONSE-CONTRACT CORRECTIONS APPROVED; CAPTURED PURGE CAPABILITY IS DROPPED**

Progress 9’s queue, session identity, and missing evidence corrections are accepted. The remaining correction is a concrete callback-contract defect plus operation ownership of transient conflict-preservation state.
