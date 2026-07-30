# Product Architect Review — Commit 10 Progress Package 6

**Package:** `cf-commit10-progress-6-20260728.zip`  
**Review type:** Locked purge and verified-success recovery storage  
**Verdict:** **CHANGES REQUIRED — LOCKED MUTATIONS APPROVED; PUBLICATION MUST REMAIN NON-ACTIONABLE UNTIL VERIFICATION COMPLETES**

This is a progress ruling only. It does not approve the scheduler, route adapter, conflict integration, conflict center, status surface, browser behavior, deployment, or lockdown.

---

# Executive ruling

The two corrections requested in Progress 5 are substantially implemented:

- public purge now acquires the same account-and-artifact Web Lock as publication;
- purge is honestly asynchronous and reports actual completion;
- deletion removes the manifest first;
- no-Web-Locks purge fails closed;
- writer success now includes a second digest and a complete manifest/payload verification;
- the final-verification tests correctly exercise payload and manifest mutation windows.

The package also correctly reports the implementation defect caught by C10-P5-07 rather than concealing it.

One release-blocking publication-order gap remains:

> The canonical manifest is written before final verification finishes, and the public reader does not acquire the artifact lock or distinguish a provisional manifest from an approved one.

During that window, another context can read and verify the manifest/payload pair and treat it as actionable before the writer has established final success.

---

# 1. C10-P5-01 — all storage mutations share the lock

## Ruling: APPROVED

Public purge now:

- acquires the same exclusive Web Lock;
- rechecks the authenticated owner after waiting;
- deletes the manifest first;
- then deletes payload and claim;
- reports actual removal;
- refuses safely without Web Locks.

This closes the write-versus-delete race identified in Progress 5.

The asynchronous callback API is the correct change. A synchronous boolean could not truthfully represent completion behind a cross-context lock.

Future retention cleanup and account cleanup must call this same locked deletion contract rather than deleting recovery keys directly.

---

# 2. C10-P5-02 — final stored-pair verification

## Ruling: THE VERIFICATION LOGIC IS APPROVED

The writer now:

1. reads the stored payload;
2. hashes that stored value;
3. writes the manifest;
4. reads the payload again;
5. hashes it again;
6. re-reads both payload and manifest after hashing;
7. confirms the payload did not move;
8. parses the stored manifest;
9. verifies owner, subsystem, revision, artifact ID, byte count, and hash;
10. reports success only after those checks.

The corrected placement of the manifest re-read after the asynchronous digest is important and accepted.

The tests that mutate payload and manifest during final verification are appropriate.

---

# 3. Required correction C10-P6-01 — no actionable manifest before final verification

## Defect

The canonical manifest key is written before final verification:

```js
localStorage.setItem(K.manifest, JSON.stringify(man));
```

The public reader does not take the artifact lock. It can therefore run while the writer is performing the final digest.

At that moment:

- the canonical manifest exists;
- the payload exists;
- `cfCasRecRead` can hash and validate both;
- a conflict layer could receive the payload and make destructive choices actionable;
- the writer may subsequently fail final verification, detect drift, and purge the artifact.

That violates the standing contract:

> No actionable conflict exists until the recovery artifact has been completely stored and verified.

The writer callback is not sufficient protection because the public reader can discover the artifact independently through its canonical manifest.

## Required behavior

Use a two-phase publication contract.

The canonical/actionable manifest must not exist until all verification is complete.

Acceptable product behavior:

1. write payload under the captured locked namespace;
2. create a provisional manifest or keep the candidate manifest only in memory;
3. read back and hash the stored payload;
4. verify the complete candidate artifact while still holding the lock;
5. publish the canonical verified manifest **last**;
6. public `read` and `list` recognize only that verified canonical publication;
7. any provisional metadata is inaccessible to public readers and removed on failure.

Claude decides the implementation structure. Possible mechanisms include:

- a separate private provisional-manifest key;
- a manifest with a non-actionable state that the public reader rejects, followed by a final verified publication;
- an internal candidate retained in memory, with the canonical manifest written only after payload verification.

The final canonical manifest remains the publication boundary.

## Post-publication requirement

After writing the final canonical manifest, synchronously read it back and confirm that the exact serialized value was stored.

Because localStorage writes are synchronous, this is sufficient for the application-controlled publication boundary while the Web Lock is held.

The system is not required to defend against arbitrary same-origin code that intentionally bypasses every Commit 10 storage API after the lock is released. It is required to ensure that all Compound-managed readers and writers obey the verified publication contract.

---

# 4. Required correction C10-P6-02 — reader/list publication rules

Public recovery APIs must never expose provisional state.

Required:

- `cfCasRecRead` rejects a provisional/unverified manifest;
- `cfCasRecList` lists only fully verified canonical artifacts;
- purge removes provisional state as well as canonical state while holding the lock;
- failure cleanup removes only the current attempt’s provisional state;
- account inventory never shows an artifact before publication completes.

If the design keeps only the candidate manifest in memory, these rules reduce to ensuring that no canonical manifest is written early.

---

# 5. Required tests

Add named tests:

- **C10-P6-01:** Reader runs while writer is parked in final digest and returns no actionable artifact.
- **C10-P6-02:** List runs during final verification and does not include the candidate artifact.
- **C10-P6-03:** A writer that later fails final verification was never externally actionable.
- **C10-P6-04:** Canonical manifest is written only after payload verification completes.
- **C10-P6-05:** Final canonical manifest is synchronously read back and exactly matches what was published.
- **C10-P6-06:** Provisional metadata, if used, is rejected by public read and list.
- **C10-P6-07:** Failed publication removes provisional metadata and leaves no canonical manifest.
- **C10-P6-08:** Purge during provisional publication waits for the lock and removes all candidate state.
- **C10-P6-09:** Successful publication becomes visible exactly once after final verification.
- **C10-P6-10:** Conflict integration cannot receive a recovery reference before the verified publication callback.

Use controlled interleavings, not timing assumptions.

---

# 6. Test evidence ruling

The reported suite result is accepted:

- 515 tests;
- 0 failures;
- 114 recovery-writer tests;
- no prior-suite regressions.

The ten C10-P5 groups exist and exercise the requested purge and final-verification behaviors.

This green result supports the behaviors tested. It does not close C10-P6-01 because the current tests do not run the public reader or list API during the final-verification window.

---

# 7. Real Chromium requirement

Real Chromium multi-context evidence remains acknowledged and pending.

Before final Commit 10 approval it must prove:

- shared Web Lock serialization across pages;
- overlapping same-ID writes;
- purge serialization with publication;
- no public read/list visibility before verified publication;
- account drift during real Web Crypto;
- verified artifact read from actual browser localStorage.

This remains a release blocker but does not require a separate review package immediately.

---

# 8. Continued implementation ruling

Claude may continue unrelated scheduler and route-adapter work in parallel.

Do not integrate destructive conflict choices with this recovery store until:

- canonical publication occurs only after verification;
- C10-P6-01 through C10-P6-10 pass;
- conflict integration can receive only verified, published recovery references.

No server changes, client deployment, lockdown, bridge removal, semantic merge, or record-level synchronization are authorized.

---

# Final verdict

## **CHANGES REQUIRED — LOCKED MUTATIONS APPROVED; PUBLICATION MUST REMAIN NON-ACTIONABLE UNTIL VERIFICATION COMPLETES**

Progress 5’s purge and final-verification requirements are accepted. The remaining correction is a two-phase publication boundary so no reader can discover or use the artifact before final verification succeeds.
