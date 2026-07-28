# Product Architect Review — Commit 10 Progress Package 5

**Package:** `cf-commit10-progress-5-20260728.zip`  
**Review type:** Exclusive publication and cross-context recovery storage  
**Verdict:** **CHANGES REQUIRED — WRITER EXCLUSION MODEL APPROVED; ALL STORAGE MUTATIONS MUST SHARE THE LOCK**

This is a progress ruling only. It does not approve the scheduler, route adapter, conflict integration, conflict center, status surface, browser behavior, deployment, or lockdown.

---

# Executive ruling

The Progress 4 corrections are substantially implemented correctly:

- publication now uses an exclusive Web Lock keyed by authenticated account and artifact ID;
- no-Web-Locks behavior fails closed;
- the claim token is correctly demoted to cleanup ownership rather than mutual exclusion;
- the owner, generation, keys, lock identity, and token are captured for the asynchronous operation;
- account drift prevents publication and cleanup targets the captured namespace;
- public callers cannot select another account scope;
- deterministic tests now create real overlap rather than sequential contention.

That is the correct cross-context writer architecture.

One remaining integration race prevents approval of the complete recovery-storage boundary:

> `cfCasRecPurge` mutates the same artifact keys without acquiring the artifact’s Web Lock.

The writer is exclusive only relative to other writers. It is not exclusive relative to deletion.

---

# 1. Web Locks publication model

## Ruling: APPROVED

Using an exclusive lock named conceptually as:

```text
cf-cas-recovery:<account>:<artifact-id>
```

is the correct browser-level primitive.

Approved behavior:

- the lock is derived from trusted captured ownership;
- write inspection, claim creation, payload write, digest, and manifest publication occur while the lock is held;
- no lock API produces `no-lock` and writes nothing;
- the claim token remains an ownership-safe cleanup marker;
- account/session drift prevents publication;
- cleanup uses captured keys and cannot target the newly active account.

The process-wide test registry is a reasonable deterministic model of origin-wide lock serialization.

The package is also correct to state that this model does not replace required real Chromium multi-context evidence.

---

# 2. Overlap evidence

## Ruling: APPROVED AS DETERMINISTIC MODEL EVIDENCE

The new tests genuinely begin both writes before either callback completes.

The pausable digest cases exercise:

- two active contenders;
- a writer held during asynchronous hashing;
- one successful publication;
- no mixed payload/manifest;
- losing-writer cleanup preserving the winner;
- account drift during hashing;
- no-lock refusal.

This corrects the evidence defect from Progress 4.

The earlier sequential test may remain as a contention regression, but it must not be described as concurrency evidence.

---

# 3. Required correction C10-P5-01 — purge must participate in exclusive publication

## Defect

The writer holds the artifact’s Web Lock, but public purge currently performs synchronous unconditional removals:

```js
localStorage.removeItem(K.manifest);
localStorage.removeItem(K.payload);
localStorage.removeItem(K.claim);
```

without acquiring the same lock.

A valid interleaving is:

1. Writer acquires the lock.
2. Writer writes and reads back the payload.
3. Writer waits for SHA-256.
4. Purge removes the payload and claim without taking the lock.
5. Writer’s digest completes.
6. Writer publishes the manifest and reports success.

The resulting artifact has a manifest but no payload. It is not valid on a later read, but the writer has reported a false successful publication. A conflict integration could therefore receive a success callback for an artifact that was never safely published.

## Required behavior

Every operation that mutates an artifact namespace must use the same exclusive lock:

- write;
- purge/delete;
- future retention cleanup;
- account-deletion cleanup;
- any recovery replacement operation, though in-place replacement remains forbidden.

Public purge therefore becomes an asynchronous locked operation, or an equivalent API that cannot mutate while publication is active.

Inside the lock, purge must:

- re-evaluate the current authenticated owner;
- inspect the current artifact;
- delete the manifest first so the artifact immediately becomes non-actionable;
- then delete payload and claim;
- report what it actually removed;
- never delete another operation’s keys outside the captured account/artifact capability.

Do not preserve a synchronous boolean API if that API cannot honestly represent completion after acquiring a cross-context lock.

---

# 4. Required correction C10-P5-02 — verify the published artifact before reporting success

The writer validates the read-back payload before manifest publication, but after writing the manifest it immediately calls:

```js
done(true, man)
```

For a verified recovery contract, success must mean the completed stored artifact can be read back and verified as a unit.

Before the success callback:

1. read back the stored manifest;
2. read back the stored payload;
3. parse the manifest;
4. recompute or confirm the digest from the final stored payload;
5. run `cfCasRecVerified` against the captured owner, subsystem, revision, and artifact ID;
6. report success only if all checks pass.

If final verification fails:

- remove only this attempt’s partial state while holding the lock;
- return a bare safe failure reason;
- leave no actionable artifact.

This protects against same-origin storage mutation, storage implementation anomalies, and future maintenance errors between the initial read-back and publication.

The conflict layer must never infer “verified recovery exists” from manifest construction alone.

---

# 5. Required tests

Add named tests:

- **C10-P5-01:** Purge starts while a writer is parked in digest and waits for the same lock.
- **C10-P5-02:** Purge cannot create a manifest-without-payload success.
- **C10-P5-03:** A completed purge removes manifest first, then payload and claim.
- **C10-P5-04:** Writer callback cannot report success after concurrent deletion.
- **C10-P5-05:** Final read-back verification occurs after manifest publication.
- **C10-P5-06:** Mutation of payload between initial digest and final verification causes failure.
- **C10-P5-07:** Mutation of manifest after publication but before final verification causes failure.
- **C10-P5-08:** Failed final verification leaves no actionable artifact.
- **C10-P5-09:** Retention/account cleanup uses the same artifact lock contract.
- **C10-P5-10:** No-lock purge fails safely and does not pretend deletion completed.

The deterministic harness must control these interleavings rather than relying on timing alone.

---

# 6. Real Chromium requirement

The Product Architect accepts the package’s explicit statement that real Chromium multi-context evidence is not included yet.

The recovery boundary cannot receive final approval until a real secure-context Chromium test proves:

- two pages/contexts share the same Web Lock namespace;
- overlapping same-artifact writes serialize;
- purge serializes with write;
- account drift during real `crypto.subtle.digest` does not publish;
- no-Web-Locks behavior fails closed where that condition can be simulated;
- the completed artifact verifies from actual browser `localStorage`.

This may be delivered with the browser layer as planned. It does not require a separate package immediately, but remains a release blocker.

---

# 7. Status of Progress 4 requirements

| Requirement | Ruling |
|---|---|
| Exclusive writer publication | **Approved** |
| Fail closed without Web Locks | **Approved** |
| Captured owner/session context | **Approved** |
| Account-drift cleanup | **Approved** |
| Non-caller-selectable scope | **Approved** |
| Genuine overlapping deterministic tests | **Approved** |
| Real Chromium multi-context proof | Pending, acknowledged |
| Purge/write mutual exclusion | **Not implemented** |
| Final whole-artifact verification before success | **Required** |

---

# 8. Continued implementation ruling

Claude may continue scheduler and route-adapter work in parallel.

Do not integrate destructive conflict choices with the recovery store until:

- C10-P5-01 and C10-P5-02 are corrected;
- C10-P5-01 through C10-P5-10 pass;
- the conflict layer receives success only after final stored-artifact verification.

No server changes, client deployment, lockdown, bridge removal, semantic merge, or record-level synchronization are authorized.

---

# Final verdict

## **CHANGES REQUIRED — WRITER EXCLUSION MODEL APPROVED; ALL STORAGE MUTATIONS MUST SHARE THE LOCK**

The core Web Locks design and the corrected overlap evidence are accepted. The remaining recovery-store correction is to serialize purge/cleanup with publication and verify the completed stored artifact before reporting success.
