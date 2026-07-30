# Product Architect Review — Commit 10 Progress Package 1

**Package:** `cf-commit10-progress-1-20260728.zip`  
**Review type:** Early progress review of two self-contained release blockers  
**Verdict:** **CHANGES REQUIRED IN THE COMPLETED PIECES — OVERALL DIRECTION APPROVED**

This is not a rejection of the Commit 10 plan. The decision core and independent manifest reader are well structured, the acceptance-ID discipline is strong, and the 385-test green suite is useful regression evidence.

Two verification contracts are currently weaker than the Product Architect specification. They must be corrected before the scheduler, recovery workflow, or browser layer relies on them.

---

# 1. Conflict decision core

## What is approved

The following match the Product Architect intent:

- `cfCasAutoResolve` permits exactly the two silent cases:
  1. the server already contains the attempted payload;
  2. the server still equals the last agreed baseline, allowing one retry.
- Genuine divergence always becomes an athlete decision.
- Full SHA-256 request identity is used without truncation.
- A reused idempotency key is classified as a client invariant, not an athlete conflict.
- Affected-subsystem drift aborts adoption while unrelated-subsystem edits do not.
- First-row creation requires positive authenticated proof.
- Whole-snapshot recovery hybrids are explicitly rejected.
- Retry behavior is bounded and status-specific.
- A 200 can acknowledge only the revision represented by its request.

## Required correction C10-P1-01 — recovery size must mean UTF-8 bytes

`cfCasRecValid` currently compares:

```js
man.sizes.payload !== comps.payload.length
```

JavaScript string length counts UTF-16 code units, not UTF-8 bytes.

The recovery contract and server payload policy both use bytes. A payload containing non-ASCII text can therefore validate against the wrong size.

Required behavior:

- record the UTF-8 byte length of the exact stored payload string;
- recompute the UTF-8 byte length when validating;
- reject any mismatch;
- add fixtures containing accented characters, emoji, and mixed ASCII/non-ASCII content.

Do not relabel code-unit length as bytes.

## Required correction C10-P1-02 — recovery verification must prove hash and account identity

`cfCasRecValid` currently proves only that:

- `man.hash` is a non-empty string;
- `man.account` is truthy.

That does not prove the stored payload matches the declared hash, nor that the artifact belongs to the expected authenticated account.

Before a recovery reference can become actionable, validation must prove:

- the declared hash is a valid full SHA-256 digest;
- the digest recomputed from the exact canonical/stored payload equals the declared digest;
- the manifest account equals the expected account for the operation;
- the artifact ID, subsystem, and server revision match the conflict record that references it.

Claude decides whether this is one async verifier wrapped around the pure shape validator or a revised validator API. The product requirement is that “verified” means content and ownership were actually checked, not merely declared.

Required tests:

- changed payload with unchanged manifest hash is rejected;
- changed hash with unchanged payload is rejected;
- malformed/short hash is rejected;
- artifact from another account is rejected;
- multibyte payload hashes and byte lengths validate correctly;
- no actionable conflict card appears until all checks pass.

## Clarification on immutability

`cfCasRecMayWrite(existingManifest)` is acceptable as a pure decision primitive, but the completed integration must prove atomic/manifest-last creation and refusal to overwrite any existing artifact ID.

A helper returning `false` is not, by itself, evidence that storage callers cannot overwrite the component first.

---

# 2. Independent manifest reader

## What is approved

The reader is structurally independent:

- it imports no production source or harness;
- it uses its own parser and exact-set logic;
- it treats missing-manifest components as incomplete, not exportable;
- it detects missing, duplicate, unknown, stale, and altered component sets;
- it automates all nine required checklist cases at the fixture level.

The reported initial false failure caused by function names in comments is not a product concern. Stripping comments while proving the remaining source is non-empty is a reasonable test correction.

## Required correction C10-P1-03 — independent reader must count UTF-8 bytes

The reader currently reports and compares `stored.length` as “bytes.”

That repeats the same code-unit/byte mismatch independently. The Commit 10 contract explicitly requires valid byte sizes and stored bytes matching declared sizes.

Required behavior:

- calculate UTF-8 byte length independently of production code;
- compare that count with the manifest;
- report the actual UTF-8 byte count;
- add non-ASCII fixtures where string length and UTF-8 byte length differ.

The independent reader must not import the app’s byte-count helper. Its calculation remains a second implementation.

## Independence ruling

The current “no imports/no named production helpers” tests are useful guardrails but are not a mathematical proof that logic was not paraphrased. That is acceptable: independence is established by separate source, separate implementation, no shared runtime code, contract-derived tests, and Product Architect review.

Do not add brittle source-similarity machinery.

---

# 3. Test and evidence ruling

The reported result:

- 277 prior tests,
- 108 new tests,
- 385 total,
- 0 failures,

is accepted as evidence for the rules currently exercised.

It is not yet approval of:

- scheduler behavior,
- real CAS requests,
- persisted conflict recovery,
- conflict-center UX,
- browser status behavior,
- reload/account boundaries,
- real localStorage manifests.

Those remain correctly marked unbuilt.

After the three corrections above, rerun:

1. the two Commit 10 suites;
2. the complete pre-existing hardening suite;
3. new Unicode/UTF-8 and hash/account negative cases.

---

# 4. Answers to Claude’s two questions

## Does `cfCasAutoResolve` match the intended product behavior?

**Yes.**

The only silent outcomes remain:

- server equals attempted payload → agree;
- server equals trusted baseline → retry exactly once.

Everything else requires the athlete’s choice.

This approval assumes the future integration compares canonical payloads whose provenance and baseline ownership have been validated.

## Is the `cas-conflict` artifact shape the intended self-contained contract?

**The single-subsystem shape is correct, but verification is incomplete.**

The artifact must remain:

- single-subsystem;
- immutable;
- account-scoped;
- exact-byte-sized;
- content-hash verified;
- tied to the conflict ID/revision;
- independently restorable.

Once C10-P1-01 and C10-P1-02 are implemented, the contract matches the Product Architect intent.

---

# 5. Required next step

Correct:

- C10-P1-01: UTF-8 byte validation for CAS recovery artifacts;
- C10-P1-02: actual SHA-256 content and expected-account verification;
- C10-P1-03: independent UTF-8 byte counting.

Then continue with the scheduler, route adapter, conflict center, status surface, and browser/integration layers.

These corrections may be included in the next progress package; a separate micro-review is not required unless Claude needs a product decision.

---

# Final verdict

## **CHANGES REQUIRED IN THE COMPLETED PIECES — CONTINUE AFTER CORRECTION**

The overall implementation direction remains approved. No server change, lockdown, bridge removal, semantic merge, or record-level synchronization is authorized.
