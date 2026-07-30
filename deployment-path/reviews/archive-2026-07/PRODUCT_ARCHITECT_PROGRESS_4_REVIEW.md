# Product Architect Review — Commit 10 Progress Package 4

**Package:** `cf-commit10-progress-4-20260728.zip`  
**Review type:** Verification of account-scoped recovery storage and cross-context safety  
**Verdict:** **CHANGES REQUIRED — ACCOUNT SCOPING AND ID ENTROPY APPROVED; MUTUAL EXCLUSION NOT YET PROVED**

This is a progress ruling only. It does not approve the scheduler, route adapter, conflict integration, conflict center, status surface, browser behavior, deployment, or lockdown.

---

# Executive ruling

The two main corrections from Progress 3 are directionally right:

- recovery keys are now scoped by the authenticated account;
- artifact IDs now use cryptographic entropy and fail closed without it.

Those changes close the accidental cross-account lookup defect and the process-local ID-generation defect.

However, the submitted evidence does not prove the same-ID cross-tab safety contract:

1. the test described as concurrent awaits Writer 1 to completion before starting Writer 2;
2. a localStorage write-then-reread claim is not an atomic lock;
3. the asynchronous writer can outlive an account switch, while cleanup currently resolves keys from the new live session rather than the captured owner.

The claim token is acceptable as an ownership marker and cleanup safeguard, but not as the sole mutual-exclusion primitive.

---

# 1. C10-P3-01 — account-scoped namespace

## Ruling: APPROVED AT THE APPLICATION STORAGE-API BOUNDARY

The key shape now includes the authenticated account scope:

```text
cf:casrec:<account>:<artifact-id>:*
```

The production read, list, write, and purge paths derive their default scope from the authenticated session. The tests show that switching to Account B yields an absent result and an empty recovery inventory while Account A’s artifact remains intact.

This closes the accidental cross-account access path that existed in Progress 3.

## Required implementation clarification

`cfCasRecKeys(id, scope)` still accepts an arbitrary explicit scope. The shipping public call surface must not allow ordinary application callers to select another account’s namespace.

Claude may solve this through closure/private helpers, an internal capability object, or another implementation mechanism. The required behavior is:

> External Commit 10 callers provide an artifact ID, never an account namespace. The namespace is captured from trusted authenticated context.

This is application-level account isolation. It is not a claim that same-origin JavaScript or browser developer tools provide cryptographic isolation.

---

# 2. C10-P3-02 — artifact ID entropy

## Ruling: APPROVED

Using `crypto.randomUUID()` with a `getRandomValues` fallback is an appropriate cross-runtime identity mechanism.

Failing closed when no secure entropy source exists is correct.

Required invariants remain:

- the ID contains no health content;
- it is not derived from timestamps, payloads, account identifiers, or process-local counters;
- generation failure prevents the recovery write;
- the writer still refuses an already occupied ID.

---

# 3. Claim-token mechanism

## Ruling: NOT SUFFICIENT AS THE SOLE MUTUAL-EXCLUSION PRIMITIVE

The submitted question asks whether write-then-reread of a localStorage claim is acceptable.

**No, not by itself.**

localStorage does not provide atomic compare-and-set. Two contexts can both:

1. observe an empty claim;
2. write their own token;
3. observe themselves as owner at different instants;
4. begin asynchronous payload/hash work.

The final claim check narrows the race, and hash verification prevents a mixed payload from becoming valid in many interleavings, but the claim check and manifest publication are not atomic. One writer can pass its final check, be paused, and publish after another writer has completed.

The submitted “concurrent writers” test does not exercise this. It performs:

```js
const r1 = await write(...);
const r2 = await write(...);
```

That is sequential contention, not overlapping execution.

## Product Architect decision

Use a real cross-context exclusive primitive for artifact publication.

Preferred requirement:

> Acquire an exclusive Web Lock keyed by the captured account scope and artifact ID before inspecting or writing claim, payload, or manifest state.

Conceptually:

```text
cf-cas-recovery:<account-scope>:<artifact-id>
```

The claim token may remain inside the locked operation as defense in depth and as an ownership-safe cleanup marker.

If the Web Locks API is unavailable:

- do not fall back to the localStorage claim as though it were equivalent;
- fail the recovery write safely;
- keep local data active and pending;
- expose export/retry;
- do not make destructive conflict choices actionable.

Claude decides the implementation structure. The product requirement is exclusive cross-context publication or fail-closed behavior.

---

# 4. Account switch during an asynchronous write

## Required correction C10-P4-01

The writer captures `scope` and `K` at the beginning, but failure cleanup calls:

```js
cfCasRecPurge(id, token)
```

and `cfCasRecPurge` derives keys from the **current** authenticated session.

If the account changes while `crypto.subtle.digest()` is pending:

- the write continues against Account A’s captured keys;
- cleanup may target Account B’s namespace;
- Account A may be left with orphaned claim/payload state;
- the callback may report against a session that no longer owns the operation.

## Required behavior

Every write attempt must capture an immutable operation context containing:

- authenticated owner,
- account/session generation,
- artifact ID,
- storage keys or an internal scoped capability,
- lock identity,
- claim token.

Every asynchronous continuation must verify that the session/owner context is still valid before publishing the manifest.

If context drifted:

- do not publish;
- clean only the partial state belonging to the captured operation;
- never address the newly active account’s namespace;
- return a safe drift/cancel result;
- do not create an actionable conflict.

Public purge remains current-account scoped. Internal failed-write cleanup may use the captured capability, not a caller-selectable account string.

---

# 5. True concurrency evidence required

Add named tests:

- **C10-P4-01:** Two writes overlap before either callback completes.
- **C10-P4-02:** Both contenders begin from no claim and only one publication succeeds.
- **C10-P4-03:** A writer paused after final verification cannot overwrite a later completed writer.
- **C10-P4-04:** The losing writer cannot remove the winner’s claim, payload, or manifest.
- **C10-P4-05:** No intermediate or final mixed artifact is actionable.
- **C10-P4-06:** Web Lock unavailable causes a safe refusal, not localStorage-only fallback.
- **C10-P4-07:** Account switches while digest is pending; no manifest is published.
- **C10-P4-08:** Account-switch cleanup removes only the original account’s partial write.
- **C10-P4-09:** Account B’s namespace is untouched by Account A’s cancelled continuation.
- **C10-P4-10:** External storage API cannot select an arbitrary account scope.

The concurrency harness must deliberately control interleaving. Starting Writer 2 only after awaiting Writer 1 is not sufficient.

A real Chromium multi-context test is required before final release evidence, even if deterministic unit tests also model the interleavings.

---

# 6. `cfCasRecPurge` return semantics

## Ruling: APPROVED

Returning `false` when nothing was accessible or removed is more honest than reporting successful deletion.

The final integration should distinguish internally between:

- absent,
- not owned/not addressable,
- removed,
- storage failure,

without exposing another account’s artifact existence to the athlete UI.

---

# 7. Status of Progress 3 requirements

| Requirement | Ruling |
|---|---|
| Account-scoped namespace | **Approved**, subject to non-caller-selectable scope |
| Trusted owner derivation | **Approved at operation start**; async drift guard required |
| Cryptographic cross-runtime IDs | **Approved** |
| Ownership-safe cleanup | Partially approved; must use captured operation context |
| Same-ID cross-context safety | **Not proved** |
| No mixed actionable artifact | Unit design promising; true-overlap proof still required |
| No payload in keys/diagnostics | Approved based on submitted tests |

---

# 8. Continued implementation ruling

Claude may continue scheduler and route-adapter work in parallel.

Do not integrate destructive conflict choices with this recovery writer until:

- exclusive cross-context publication is implemented;
- account-switch drift is handled;
- C10-P4-01 through C10-P4-10 pass;
- real Chromium multi-context evidence exists.

No server change, client deployment, lockdown, bridge removal, semantic merge, or record-level synchronization is authorized.

---

# Final verdict

## **CHANGES REQUIRED — ACCOUNT SCOPING AND ID ENTROPY APPROVED; MUTUAL EXCLUSION NOT YET PROVED**

The namespace and cryptographic-ID corrections are accepted. The localStorage claim remains useful as a marker, but a true exclusive primitive and captured-owner async cleanup are required before the recovery boundary is approved.
