# Product Architect Review — Commit 10 Progress Package 8

**Package:** `cf-commit10-progress-8-20260728.zip`  
**Review type:** CAS scheduler and route-adapter progress review  
**Verdict:** **CHANGES REQUIRED — WIRE CONTRACT DIRECTION APPROVED; ASYNCHRONOUS REQUEST CONTEXT IS NOT YET SAFE**

This is a progress ruling only. It does not approve the conflict center, status surface, browser layer, client deployment, or lockdown.

---

# Executive ruling

The package correctly demonstrates several important behaviors:

- ordinary core and training edits no longer use raw appdata snapshot POST/PATCH;
- five edits coalesce into one commit request;
- core and training are scheduled independently;
- the request contains the intended six route fields;
- non-200 statuses remain pending and do not fall back to raw writes;
- an unrelated HTTP 200 body no longer marks data clean;
- signed-out edits still advance local revisions;
- timer exceptions are no longer silently interpreted as “no request.”

Those are meaningful corrections, and the reported 591-test green suite is useful regression evidence.

However, the adapter has four asynchronous safety gaps. Each can produce a request or response whose payload, idempotency identity, revision, or account context does not describe the same operation.

These must be corrected before conflict integration and browser status behavior rely on the scheduler.

---

# 1. Required correction C10-P8-01 — capture one immutable request snapshot before hashing

## Defect

`cfCasBuildRequest` currently:

1. canonicalizes `cfCasPayloadFor(sub)`;
2. starts asynchronous SHA-256;
3. after hashing, reads `revLocal(sub)` and calls `cfCasPayloadFor(sub)` again.

An edit can occur while hashing.

The resulting request may contain:

- an idempotency key derived from payload A;
- a body containing payload B;
- a local revision captured after payload B;
- a canonical baseline still describing payload A.

That breaks the core request identity contract and can cause the wrong local revision to be acknowledged.

## Required behavior

At request-build start, capture one immutable operation snapshot:

- subsystem;
- exact local revision;
- expected server revision;
- canonical payload string;
- deep-frozen or independently parsed payload object derived from that canonical string;
- authenticated owner/session generation;
- device/build context needed for the request.

Derive the idempotency key from that captured canonical snapshot.

The body sent on the wire must be the same payload represented by the canonical bytes and key. Do not reread mutable application state after hashing.

Required invariant:

> `subsystem + expectedRev + canonical payload bytes + localRev` describe one captured operation.

---

# 2. Required correction C10-P8-02 — reserve the subsystem before asynchronous request construction

## Defect

`CF_CAS_INFLIGHT[sub]` is set only after SHA-256 completes.

During hashing, another timer, foreground trigger, or **Sync now** call can enter `cfCasRun` and begin a second request build for the same subsystem.

The current “one in flight” test checks only the state after all timers and promises settle. It does not hold the digest open and attempt a second run.

## Required behavior

The per-subsystem scheduler must have a state that covers both:

- **building** the request;
- **sending/waiting** for the response.

Only one build-or-send operation may exist per subsystem.

A second trigger during build/send should:

- mark that another run is needed;
- not start another hash or fetch;
- run again after the current operation finishes only if the subsystem remains dirty and unblocked.

Core and training remain independent.

---

# 3. Required correction C10-P8-03 — capture and validate account/session context

## Defect

The scheduler checks authentication before starting the asynchronous hash, but `cfCasSend` later obtains headers from the live session.

If the athlete logs out or switches accounts while hashing:

- the captured payload may belong to Account A;
- the request may be sent with Account B’s token;
- or a late response from Account A may update Account B’s revisions, baseline, block state, or conflict reference.

No account/session/generation context is captured in the current request object, and no drift check is performed before send or before response application.

## Required behavior

Every request operation must capture:

- authenticated owner;
- session/auth generation;
- subsystem generation;
- local revision;
- expected server revision.

Before sending:

- verify the captured owner/session/subsystem context is still current;
- if drifted, cancel without sending and leave the correct local state pending.

Before applying any response:

- verify the response still belongs to the captured owner/session/subsystem operation;
- if drifted, ignore it completely;
- do not update revisions, baseline, blocks, conflicts, or status for the newly active account.

A late old-account 200 or 409 must be inert.

---

# 4. Required correction C10-P8-04 — pause immediately while preserving a conflict artifact

## Defect

On a genuine 409, the adapter starts asynchronous recovery storage but does not immediately block the subsystem.

The actionable `conflictId` is set only after storage succeeds, which is correct. But during the storage window, another local edit can schedule another commit because neither a conflict ID nor a recovery block exists yet.

The recovery callback also applies `conflictId` without checking account/session/subsystem drift.

## Required behavior

When a genuine conflict requires recovery storage:

1. enter a non-actionable **preserving conflict** state immediately;
2. prevent all automatic commits for that subsystem;
3. keep the other subsystem independent;
4. write and verify the server recovery artifact;
5. revalidate the captured operation context;
6. only then publish the conflict reference and transition to **needs choice**.

If storage fails:

- transition to recovery-blocked;
- offer safe export/retry later;
- never expose destructive choices.

If owner/session/subsystem context drifts while storage is running:

- do not publish the conflict reference;
- do not mutate the new account;
- clean up according to the approved recovery-store contract.

---

# 5. Required correction C10-P8-05 — enforce the exact semantic response contract

## 200 response

A successful 200 must require all of:

- `ok === true`;
- `subsystem` exactly equals the requested subsystem;
- `newRev` is a non-negative integer;
- response shape is otherwise consistent with the documented route contract.

The current code accepts `subsystem` being absent because it rejects only a defined mismatched value.

An absent subsystem is not a valid success response.

## 409 conflict response

Before treating a 409 as an athlete conflict, validate the documented shape.

For an existing server row:

- `conflict === true`;
- `serverRev` is a non-negative integer;
- `payload` is a valid snapshot object for the subsystem.

For the documented no-row case:

- `serverRev === null`;
- `payload === null`.

Malformed 409 bodies must enter a contract/invariant failure state. They must not be canonicalized into a fake conflict or recovery artifact.

The idempotency-key-reused 409 remains an invariant failure and never enters the conflict center.

---

# 6. Required correction C10-P8-06 — one safe retry must actually be bounded

## Defect to verify

`cfCasHandle` resets `CF_CAS_ATTEMPT[sub]` to zero before calling `cfCasOnConflict`.

`cfCasOnConflict` then passes:

```js
CF_CAS_ATTEMPT[sub] > 0
```

to the auto-resolution rule.

As written, the “already retried” signal appears to be cleared before the rule reads it. This can allow the “server still equals baseline” path to schedule another retry after every 409 instead of stopping after one.

## Required behavior

- the baseline-equivalent automatic retry occurs at most once for one conflict sequence;
- a second 409 opens/preserves the conflict flow;
- retry tracking is scoped to the captured request/conflict sequence;
- unrelated 500/network retry counts do not alter this decision;
- success or explicit resolution clears the sequence state.

If the surrounding shipping block already prevents the loop through another mechanism, demonstrate it with controlled evidence. The current package does not.

---

# 7. Retry request identity

For an unknown network outcome, retrying the exact captured request must reproduce:

- the same expected revision;
- the same payload bytes;
- the same idempotency key.

If a newer local edit exists, that newer edit remains pending behind the captured retry. It must not silently replace the uncertain request while reusing or abandoning its identity.

After the uncertain request receives a definitive outcome, the newer revision may run next.

For a definitive server 500, Claude may follow the approved bounded policy, but request identity and acknowledgement must remain internally consistent.

---

# 8. Required tests

Add named tests:

- **C10-P8-01:** Edit during SHA-256; wire payload, canonical bytes, key, and local revision remain one captured snapshot.
- **C10-P8-02:** Two triggers during hashing start only one build and one fetch.
- **C10-P8-03:** A queued rerun occurs after the first operation only when still dirty.
- **C10-P8-04:** Account switch during hashing sends no old payload with the new token.
- **C10-P8-05:** Logout during hashing cancels safely and leaves data pending.
- **C10-P8-06:** Late old-account 200 changes nothing in the new account.
- **C10-P8-07:** Late old-account 409 creates no recovery artifact or conflict in the new account.
- **C10-P8-08:** Genuine conflict immediately blocks further automatic commits while recovery storage is pending.
- **C10-P8-09:** Edit during conflict preservation survives and does not trigger another commit.
- **C10-P8-10:** Recovery callback after context drift publishes no conflict reference.
- **C10-P8-11:** 200 without subsystem is rejected.
- **C10-P8-12:** 200 with fractional, negative, missing, or nonnumeric `newRev` is rejected.
- **C10-P8-13:** Malformed 409 never creates a recovery artifact.
- **C10-P8-14:** Baseline-equivalent 409 retries exactly once; the second 409 requires athlete choice.
- **C10-P8-15:** Unknown-outcome retry reuses the exact captured request and idempotency key.
- **C10-P8-16:** Newer edits remain pending behind an uncertain captured request.
- **C10-P8-17:** Core build/send does not block Training build/send.
- **C10-P8-18:** No timer, promise, hash, fetch, or recovery callback exception is silently swallowed.

Use controllable async hash, fetch, recovery callbacks, and session-switch interleavings. End-state-only assertions are not sufficient for these races.

---

# 9. What is approved from Progress 8

- Raw appdata snapshot writes remain frozen.
- The CAS commit route is the intended upward-sync path.
- Three-second per-subsystem coalescing is the correct product behavior.
- Core and training remain independent.
- Signed-out edits continue advancing local revisions.
- Generic HTTP 200 is not accepted solely by status.
- Timer errors are captured by the harness.
- Bounded, non-nagging retry remains the approved product policy.
- The five-edits/one-wire-request evidence is accepted for the ordinary no-race case.

---

# 10. Continued implementation ruling

Correct C10-P8-01 through C10-P8-06 before the conflict center or status surface treats scheduler state as authoritative.

Claude may continue visual scaffolding in parallel, but must not claim conflict/status integration complete until the scheduler’s asynchronous context is safe.

Real PocketBase and real Chromium evidence remain mandatory for final Commit 10 approval.

No server changes, client deployment, lockdown, bridge removal, semantic merge, or record-level synchronization are authorized.

---

# Final verdict

## **CHANGES REQUIRED — WIRE CONTRACT DIRECTION APPROVED; ASYNCHRONOUS REQUEST CONTEXT IS NOT YET SAFE**

The ordinary-path wire behavior is correct. The next correction is to make request construction, account ownership, conflict preservation, response application, and single-retry behavior safe across asynchronous interleavings.
