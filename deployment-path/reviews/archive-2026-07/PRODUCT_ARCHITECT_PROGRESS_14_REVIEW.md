# Product Architect Review — Commit 10 Progress Package 14

**Package:** `cf-commit10-progress-14-20260728.zip`  
**Review type:** Verification of missing conflict evidence and replacement-cleanup ledger  
**Verdict:** **CHANGES REQUIRED — REQUIRED RACE EVIDENCE IS COMPLETE; CLEANUP LEDGER MUST NOT LOSE OBLIGATIONS**

This is a progress ruling only. It does not approve the rendered conflict center, real Chromium integration, real PocketBase integration, client deployment, bridge removal, or lockdown.

---

# Executive ruling

Progress 13’s evidence gaps are closed.

The package now contains behavioral tests for all ten previously omitted C10-P12 IDs and all six C10-P13 cleanup IDs. The supplied location index matches the test source and the conflict suite reports 100 passes.

The replacement-cleanup behavior is also materially improved:

- the new verified conflict reference remains valid even if deletion of the old artifact fails;
- purge verifies actual absence rather than reporting intent;
- failed deletion is recorded for retry;
- cleanup obligations are account-scoped and contain artifact IDs only;
- a later sweep can remove the retained old artifact;
- another account cannot consume the obligation;
- ten consecutive full-suite runs pass;
- the full result is 800 tests, 0 failures.

One concrete reliability defect remains in the pending-cleanup ledger itself:

1. ledger updates are uncoordinated localStorage read-modify-write operations across browser contexts;
2. `pendingSave` silently truncates the ledger to 200 entries, which can discard newly created deletion obligations.

The ledger exists specifically to ensure failed cleanup is not forgotten. It cannot itself silently forget cleanup work.

---

# 1. Missing C10-P12 evidence

## Ruling: APPROVED

The following required behavioral tests now exist:

- C10-P12-05
- C10-P12-07
- C10-P12-08
- C10-P12-09
- C10-P12-13
- C10-P12-14
- C10-P12-15
- C10-P12-17
- C10-P12-19
- C10-P12-23

The evidence covers:

- late old callbacks preserving newer conflicts;
- logout during overwrite;
- affected versus unrelated subsystem edits;
- drift during candidate replacement;
- candidate cleanup without deleting the active artifact;
- payload-free cleanup diagnostics;
- conflict movement during refresh;
- operation-owned resolution;
- original-conflict preservation during drift.

This closes the Progress 13 evidence gap.

---

# 2. C10-P13 replacement cleanup

## Ruling: APPROVED IN THE ORDINARY AND SINGLE-CONTEXT FAILURE PATHS

The replacement workflow now correctly separates:

- **the product state transition** — the new verified conflict reference becomes current;
- **the retention obligation** — deletion of the superseded artifact.

Approved behavior:

- old-artifact deletion is observed rather than assumed;
- failure does not roll back the valid newer conflict;
- failed deletion is recorded for later cleanup;
- cleanup records artifact IDs only;
- later sweep removes the old artifact;
- another account cannot run the obligation;
- purge verifies that keys are actually absent;
- a silently ignored `removeItem` is reported as `not-removed`.

The defect found by Claude’s new test—returning intended deletion rather than observed deletion—was real and is correctly fixed.

---

# 3. Required correction C10-P14-01 — cleanup-ledger mutations must be cross-context safe

## Defect

The ledger uses localStorage read-modify-write:

```js
var l = pendingList(scope);
l.push(id);
pendingSave(scope, l);
```

without an exclusive account-level ledger lock.

Two tabs can concurrently record different failed deletion obligations:

1. both read the same old ledger;
2. Tab A adds artifact A;
3. Tab B adds artifact B;
4. each writes its own list;
5. the last writer wins;
6. one obligation disappears.

The same race exists between:

- `pendingAdd`;
- `pendingDrop`;
- cleanup sweeps;
- multiple failed purges.

This violates the purpose of the ledger.

## Required behavior

Every mutation of an account’s cleanup ledger must use one shared exclusive Web Lock, conceptually:

```text
cf-cas-recovery-cleanup:<account-scope>
```

Under that lock:

- re-read the current ledger;
- add/drop the intended artifact ID;
- write back the merged result;
- read back and verify the stored ledger;
- report failure honestly if persistence did not occur.

A cleanup sweep must not remove an obligation from the ledger until the artifact purge has been verified as removed or absent.

Two browser contexts recording different obligations must preserve both.

If Web Locks are unavailable:

- do not claim the obligation was recorded;
- return a safe operational failure;
- retain the current valid conflict/reference;
- never expose health payload content.

---

# 4. Required correction C10-P14-02 — no silent ledger truncation

## Defect

`pendingSave` currently writes:

```js
JSON.stringify(list.slice(0, 200))
```

If the ledger already contains 200 IDs, a new failed deletion is silently dropped.

That recreates the exact defect the ledger was introduced to prevent: a verified recovery artifact survives with no tracked cleanup obligation.

## Required behavior

Do not silently discard a cleanup obligation.

Approved options include:

- an honestly bounded ledger that refuses the new replacement transition before it creates an untrackable obligation;
- multiple bounded ledger pages;
- another compact, account-scoped queue structure.

The product requirements are:

- every failed deletion is either durably recorded or explicitly reported as unrecorded;
- no success result implies cleanup is safely tracked when it is not;
- the queue cannot grow without an explicit operational bound;
- reaching the bound produces a safe, visible diagnostic state, not silent loss;
- no payload, hash, revision, or health content enters the ledger.

Because replacement has already committed the newer conflict before old deletion runs, a ledger-capacity failure must:

- keep the newer conflict valid;
- report an operational cleanup failure;
- retain enough information to recover the untracked artifact through a deterministic account-scoped inventory/reconciliation process.

Claude decides the data structure.

---

# 5. Required tests

Add named tests:

- **C10-P14-01:** Two independent contexts add different cleanup IDs concurrently; both remain recorded.
- **C10-P14-02:** Concurrent add and drop preserve unrelated obligations.
- **C10-P14-03:** Two cleanup sweeps cannot lose an obligation through last-writer-wins.
- **C10-P14-04:** Ledger mutation fails closed without Web Locks.
- **C10-P14-05:** Ledger write is read back and verified before reporting recorded.
- **C10-P14-06:** A full ledger does not silently discard a new obligation.
- **C10-P14-07:** Capacity failure leaves the new conflict valid and reports cleanup tracking failure honestly.
- **C10-P14-08:** Reconciliation can rediscover a recovery artifact whose immediate ledger record failed.
- **C10-P14-09:** Cleanup ledger contains well-formed artifact IDs only.
- **C10-P14-10:** Account A and Account B ledger locks and obligations remain isolated.

Use deterministic overlapping operations and include real Chromium multi-context evidence in the final browser package.

---

# 6. Flake and full-suite evidence

## Ruling: ACCEPTED

The package reports:

- 800 total tests;
- 0 failures;
- 100 conflict-workflow tests;
- ten consecutive full-suite passes.

The flaky assertion based on forbidden numeric substrings in a random hexadecimal ID was correctly replaced with a positive key-shape assertion.

That replacement is stronger and deterministic.

Recording the flaky test and its cause is the correct engineering behavior.

---

# 7. Rendered conflict-center review

Claude is authorized to proceed with the rendered conflict center now.

The C10-P14 ledger corrections may be implemented in parallel and included in the rendered-view package.

The rendered package must include:

- desktop and narrow/mobile screenshots;
- both subsystem cards and a one-card state;
- focused **Keep this device’s changes** default;
- preserving state;
- recovery-blocked state;
- changed-again state;
- busy/disabled resolution state;
- confirmations for both destructive choices;
- compact status indicator and per-subsystem detail;
- keyboard focus order;
- screen-reader names/descriptions;
- active-workout non-modal notification behavior;
- no athlete-facing revision, CAS, subsystem-code, payload, or record-ID terminology.

---

# 8. Continued implementation ruling

Correct C10-P14-01 and C10-P14-02 before final conflict-workflow approval.

No separate ledger-only package is required. Include:

- the ten C10-P14 tests;
- updated acceptance-ID index;
- rendered conflict-center evidence;

in the next package.

No client deployment, server change, lockdown, bridge removal, semantic merge, or record-level synchronization is authorized.

---

# Final verdict

## **CHANGES REQUIRED — REQUIRED RACE EVIDENCE IS COMPLETE; CLEANUP LEDGER MUST NOT LOSE OBLIGATIONS**

Progress 13’s missing tests and replacement-cleanup outcome checks are accepted. The final correction for this storage workflow is to make the cleanup ledger cross-context safe and remove its silent capacity loss, while Claude proceeds to the rendered conflict-center review.
