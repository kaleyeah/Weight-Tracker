# Product Architect Review — Commit 10 Progress Package 9

**Package:** `cf-commit10-progress-9-20260728.zip`  
**Review type:** Verification of asynchronous scheduler/request-context corrections  
**Verdict:** **CHANGES REQUIRED — REQUEST SNAPSHOT AND RESPONSE SAFETY APPROVED; SESSION-SCOPED QUEUING AND CONFLICT CLEANUP REMAIN**

This is a progress ruling only. It does not approve the conflict center, status surface, browser integration, real PocketBase evidence, client deployment, or lockdown.

---

# Executive ruling

The Progress 8 corrections are substantially implemented correctly:

- one immutable operation is captured before asynchronous hashing;
- the wire payload is reconstructed from the canonical bytes used for the idempotency identity;
- the subsystem is reserved during both request construction and network flight;
- retries reuse the captured request rather than absorbing newer edits;
- owner/session drift is checked before send and before response application;
- a genuine conflict blocks the subsystem before recovery preservation;
- 200 and 409 bodies are semantically validated;
- the dead retry-once guard was correctly replaced with a separate conflict-sequence flag;
- the reported suite is green: 634 tests, 0 failures.

These changes close the principal split-request and late-response defects identified in Progress 8.

Three corrections/evidence gaps remain.

---

# 1. Immutable captured request

## Ruling: APPROVED

`cfCasCapture` now captures:

- subsystem;
- local revision;
- expected server revision;
- canonical payload bytes;
- a payload object parsed from those canonical bytes;
- owner;
- session generation;
- authentication context;
- build and device identifiers.

The idempotency key and body therefore describe the same captured payload.

The test that parks SHA-256, edits the app, and verifies that the first request remains unchanged is appropriate evidence.

The later edit correctly remains pending and receives its own request identity.

---

# 2. Build/send reservation and uncertain retry

## Ruling: APPROVED

`CF_CAS_OP[sub]` now reserves the subsystem before hashing, covering both:

- request construction;
- send/wait/retry.

A second trigger records a rerun rather than starting another hash/fetch.

The uncertain retry correctly reuses:

- expected revision;
- payload;
- idempotency key.

A newer edit waits behind the uncertain request rather than taking over its identity.

Core and training remain independently schedulable.

---

# 3. Response and conflict-sequence handling

## Ruling: APPROVED IN DIRECTION

The success contract correctly requires:

- `ok === true`;
- exact subsystem match;
- non-negative integer `newRev`.

The conflict validator distinguishes:

- a valid existing-row conflict;
- the documented null/null no-row conflict;
- malformed conflict bodies;
- idempotency-key reuse/invariant failures.

The separate `CF_CAS_SEQ[sub].retried` flag correctly fixes the dead-code defect where the network attempt counter was reset before the conflict rule read it.

The baseline-equivalent path now retries once and then enters the athlete conflict path.

---

# 4. Required correction C10-P9-01 — queued reruns must be scoped to the captured session

## Defect

`CF_CAS_RERUN[sub]` is a bare boolean.

When an operation finishes—including because `cfCasOpDrifted(op)` detected logout/account switch—`cfCasFinishOp` may consume that old boolean and schedule a new run using the newly active session.

A possible sequence is:

1. Account A starts building or sending.
2. Another Account A edit/trigger sets `CF_CAS_RERUN.core = true`.
3. The user logs out or switches to Account B.
4. The old operation detects drift and calls `cfCasFinishOp`.
5. `cfCasFinishOp` schedules a run because the boolean is still true.
6. The scheduled run captures Account B’s live state even though the queued trigger belonged to Account A.

This does not necessarily overwrite data, but it violates the standing rule that queued work is account/session scoped and must not cross ownership boundaries.

## Required behavior

A queued rerun must carry or be validated against:

- owner;
- session generation;
- affected subsystem generation/revision intent.

On operation drift:

- clear/discard reruns belonging to the old owner/session;
- do not translate an old-account trigger into a new-account sync;
- allow the new session to schedule its own work from its own pending state.

Required tests:

- **C10-P9-01:** Account A queues a rerun during hashing, then switches to Account B; no Account B request is caused by Account A’s queued rerun.
- **C10-P9-02:** Logout with a queued rerun sends nothing and clears the old queue safely.
- **C10-P9-03:** A new Account B edit after switching schedules normally under Account B’s own context.
- **C10-P9-04:** Core and Training rerun ownership remains independent.

---

# 5. Required correction C10-P9-02 — conflict-preservation drift must clean the verified artifact

## Defect

After a genuine 409, the subsystem enters `preserving` and `cfCasRecWrite` begins.

Its callback currently does:

```js
if (cfCasOpDrifted(op)) { return; }
```

If the session changes while recovery storage is running:

- no conflict reference is published, which is correct;
- but a verified recovery artifact may already have been created;
- the callback returns without purging it;
- the subsystem/session transition receives no explicit cleanup result.

The submitted test labelled C10-P8-10 changes session context **before the 409 is applied**, so no recovery write begins. It does not test drift during the recovery callback window.

## Required behavior

If context drifts after recovery writing starts:

1. do not publish the conflict reference;
2. invoke the approved locked purge for the newly created artifact using the captured owner/storage capability;
3. verify cleanup completion;
4. do not mutate the newly active account;
5. clear only old-operation transient scheduler state;
6. retain the old account’s unresolved local changes for its next legitimate session.

If cleanup fails, record only a non-payload operational diagnostic and leave the artifact governed by the approved account-scoped retention process. Do not expose it to the new account.

Required tests:

- **C10-P9-05:** Session changes while recovery writer is parked; callback publishes no conflict.
- **C10-P9-06:** The verified artifact created for the drifted operation is purged through the locked API.
- **C10-P9-07:** Purge completion/failure does not mutate the new account’s conflict or block state.
- **C10-P9-08:** No orphaned artifact appears in the new account’s inventory.
- **C10-P9-09:** Returning to the original account preserves its local pending revision and permits a fresh conflict attempt.

---

# 6. Required correction C10-P9-03 — exact session identity must not rely on a token suffix

## Defect

The operation captures only:

```js
String(pbTok() || "").slice(-16)
```

There is no product benefit to weakening the comparison to a suffix.

Session generation is the principal guard, but the token comparison should either:

- compare the complete in-memory token;
- compare a collision-resistant digest/session nonce;
- or use another exact, trusted session identity.

Do not log or persist the token. This is an in-memory operation-context comparison only.

Required test:

- **C10-P9-10:** Two different authentication contexts that share the same final token characters are still treated as different sessions.

---

# 7. Missing required evidence for C10-P8-11 through C10-P8-13

The Progress 8 review explicitly required named tests:

- C10-P8-11: 200 without subsystem is rejected.
- C10-P8-12: invalid `newRev` forms are rejected.
- C10-P8-13: malformed 409 never creates a recovery artifact.

The submitted scheduler suite contains no test groups or assertions carrying those IDs.

The implementation appears to contain the intended validators, but the package claims all eighteen C10-P8 tests are present. The evidence does not support that claim.

Add explicit tests covering:

### C10-P8-11

- missing subsystem;
- wrong subsystem.

### C10-P8-12

- missing `newRev`;
- string;
- negative;
- fractional;
- `NaN`/non-finite where representable in the unit layer.

### C10-P8-13

- conflict flag with missing revision;
- non-integer revision;
- array payload;
- primitive payload;
- invalid no-row combinations;
- malformed conflict creates no recovery keys and no conflict reference.

These can be added to the next package; no separate micro-review is required.

---

# 8. Clarification on conflict validation

The current validator permits an absent `subsystem` on a valid 409.

The Product Architect’s Progress 8 requirement did not explicitly require the conflict body to contain `subsystem`; it required the documented server shape. Therefore this is acceptable only if the shipping PocketBase route’s actual 409 contract omits or makes that field optional.

The real-server integration suite must assert the exact production response shape and keep the client validator aligned with that contract. Do not broaden the client contract merely to accommodate test stubs.

---

# 9. Test evidence ruling

Accepted:

- 634 total tests;
- 0 failures;
- 85 scheduler tests;
- no prior-suite regression;
- genuine parked-hash and late-response interleavings;
- transparent correction of the test that previously asserted after the legitimate rerun.

Not yet evidenced:

- old-session queued-rerun disposal;
- session drift during the recovery-write callback;
- locked purge of a drifted recovery artifact;
- exact session identity beyond token suffix;
- explicit C10-P8-11/12/13 cases;
- real PocketBase contract behavior;
- real Chromium behavior.

---

# 10. Continued implementation ruling

Correct C10-P9-01 through C10-P9-03 before the conflict center and status surface treat scheduler/account state as authoritative.

Claude may continue conflict-center visual scaffolding in parallel, but final integration must use:

- session-scoped queued work;
- cleanup-safe recovery preservation;
- exact session identity;
- explicit semantic-response tests.

No client deployment, server change, lockdown, bridge removal, semantic merge, or record-level synchronization is authorized.

---

# Final verdict

## **CHANGES REQUIRED — REQUEST SNAPSHOT AND RESPONSE SAFETY APPROVED; SESSION-SCOPED QUEUING AND CONFLICT CLEANUP REMAIN**

The core asynchronous request operation is now sound. The remaining corrections prevent queued work and verified recovery artifacts from leaking across account/session transitions and complete the required response-contract evidence.
