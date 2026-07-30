# Product Architect Review — Commit 10 Progress Package 3

**Package:** `cf-commit10-progress-3-20260728.zip`  
**Review type:** Recovery-artifact storage integration  
**Verdict:** **CHANGES REQUIRED — READ-BACK VERIFICATION APPROVED, STORAGE ISOLATION NOT YET PROVED**

This is a progress ruling only. It does not approve the scheduler, route adapter, conflict-record integration, conflict center, status surface, browser behavior, deployment, or lockdown.

The package correctly implements most of the seven-point recovery boundary, including the most important point: the digest is computed from the exact value read back from storage, not from the value the caller intended to write.

Two release-blocking gaps remain in the storage integration.

---

# 1. What is approved

## Read-back verification

Approved.

The writer:

1. writes the payload first;
2. reads the payload back;
3. rejects any read-back mismatch;
4. computes SHA-256 from the returned value;
5. records UTF-8 byte length;
6. writes the manifest last;
7. exposes the payload only after `cfCasRecVerified` succeeds.

This satisfies the Product Architect’s requirement that a caller-supplied or intention-derived digest is never treated as proof of stored content.

The truncating and Unicode-mangling storage cases are appropriate evidence.

## Partial-failure behavior

Approved for the tested single-context cases.

A failed write does not leave a manifest, and therefore does not leave an actionable artifact. Failure diagnostics do not expose payload contents.

## Test environment change

Approved.

Exposing browser-standard `crypto.webcrypto` and `TextEncoder` in the test sandbox makes the environment closer to the secure browser environment. It does not create a production-only test seam.

---

# 2. Required correction C10-P3-01 — storage must actually be account-scoped

The pre-coding plan and Product Architect contract require the artifact to be inaccessible to another account.

The implementation currently uses keys shaped like:

```text
cf:casrec:<artifact-id>:payload
cf:casrec:<artifact-id>:manifest
```

The account is stored inside the manifest, but it is not part of the storage namespace.

On the same browser origin, `localStorage` is shared across signed-in accounts. A manifest ownership check prevents a correctly written caller from accepting the artifact for the wrong account, but it does not make the stored health payload inaccessible or non-enumerable to that account.

The test titled “another account cannot overwrite it” proves immutability of an existing ID. It does **not** prove account isolation.

## Required behavior

The persisted namespace must be derived from the trusted authenticated owner, for example conceptually:

```text
cf:casrec:<account-scope>:<artifact-id>:payload
cf:casrec:<account-scope>:<artifact-id>:manifest
```

Claude decides the encoding and storage structure.

Acceptance requirements:

- Account B cannot enumerate Account A’s recovery artifacts through the Commit 10 storage API.
- Account B cannot read Account A’s payload even when given Account A’s artifact ID.
- Account B cannot purge, replace, or make Account A’s artifact appear absent.
- The account scope used for storage comes from trusted session/ownership context, not an arbitrary caller-provided string.
- Logout/account switch does not expose the prior account’s artifacts.
- Legitimate account deletion follows the approved recovery-retention policy.
- No raw payload or reversible health-data material appears in storage keys or diagnostics.

A manifest field saying `account: A` is necessary but not sufficient.

---

# 3. Required correction C10-P3-02 — artifact IDs must be unique across tabs and runtimes

The current ID is based on:

```text
subsystem + timestamp supplied by caller + process-local sequence
```

`CF_CASREC_SEQ` is local to one JavaScript runtime.

Two tabs, windows, or app instances can therefore generate the same candidate ID when they use the same subsystem and timestamp and each has the same local sequence value. Checking that the key is currently absent does not atomically reserve it across browser contexts.

The existing tests prove freshness only inside one test runtime.

## Required behavior

Artifact identity must have collision-resistant entropy that is independent across tabs and reloads. Prefer a browser-generated cryptographic UUID or equivalent random identifier.

Additionally:

- the writer must refuse an occupied ID before replacing any bytes;
- concurrent attempts using the same ID must never leave an actionable artifact whose payload and manifest came from different writers;
- a losing writer must not purge or damage a winning writer’s completed artifact;
- a partial losing writer must not make a completed artifact disappear;
- recovery references remain immutable after publication.

## Required cross-context evidence

Add tests or a browser integration harness for:

- two independent runtimes generating IDs at the same timestamp;
- two writers attempting the same ID with different payloads;
- one writer completing while the other fails;
- the losing writer being unable to delete the winner’s payload or manifest;
- final manifest and payload belonging to one internally consistent write;
- no actionable mixed artifact.

A single-threaded in-memory `localStorage` stub is insufficient evidence for this boundary.

---

# 4. Clarification — cleanup must be ownership-safe

`cfCasRecPurge(id)` currently deletes both keys unconditionally.

That is safe only when the caller can prove the keys still belong to the incomplete write it is cleaning up.

With multiple tabs, a failed writer must not purge an artifact that another writer completed after the failed writer began.

The corrected design must use an ownership/claim identity or equivalent compare-before-delete rule so cleanup removes only the partial state created by that write attempt.

Required acceptance criterion:

> Failure cleanup never deletes bytes or a manifest committed by another writer.

Claude decides the mechanism.

---

# 5. Seven-point status

| Point | Ruling |
|---|---|
| 1. Fresh artifact ID | **Not yet approved** — process-local uniqueness only |
| 2. Existing ID refused before write | Approved in one runtime; cross-context proof required |
| 3. Component bytes first | Approved |
| 4. Read back and hash stored value | **Approved** |
| 5. Manifest last | Approved |
| 6. Partial failure not actionable | Approved in one runtime; ownership-safe cleanup required |
| 7. No overwrite in place | Approved in one runtime; cross-context proof required |

---

# 6. Required tests

Add named tests:

- **C10-P3-01:** Account B cannot read Account A artifact by known ID.
- **C10-P3-02:** Account B cannot enumerate Account A artifacts through the storage API.
- **C10-P3-03:** Account B cannot purge or overwrite Account A artifact.
- **C10-P3-04:** Storage scope is derived from trusted authenticated ownership.
- **C10-P3-05:** Two independent runtimes generate different IDs at the same timestamp.
- **C10-P3-06:** Concurrent same-ID writers cannot create a mixed artifact.
- **C10-P3-07:** Losing-writer cleanup does not delete the winning artifact.
- **C10-P3-08:** Final actionable artifact has one consistent payload, manifest, hash, owner, subsystem, and revision.
- **C10-P3-09:** Account switching hides the previous account’s recovery inventory.
- **C10-P3-10:** No health content appears in storage keys or failure diagnostics.

These tests are additional to the existing 35 recovery-writer tests.

---

# 7. Continued implementation ruling

Correct C10-P3-01 and C10-P3-02 before the conflict-record integration depends on this writer.

Claude may continue unrelated scheduler and route-adapter work in parallel, but must not treat the recovery storage boundary as approved until the account-isolation and cross-context tests pass.

No server changes, client deployment, lockdown, bridge removal, semantic merge, or record-level synchronization are authorized.

---

# Final verdict

## **CHANGES REQUIRED — READ-BACK VERIFICATION APPROVED, STORAGE ISOLATION NOT YET PROVED**

The central read-back/hash design is correct. The remaining work is to make the artifact truly account-scoped and safe under multiple browser contexts.
