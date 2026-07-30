# Product Architect Review — Commit 10 Progress Package 2

**Package:** `cf-commit10-progress-2-20260728.zip`  
**Review type:** Verification of the three Progress 1 corrections  
**Verdict:** **CORRECTIONS APPROVED — CONTINUE IMPLEMENTATION**

This is a progress ruling only. It approves the corrected decision-core and independent-reader foundations. It does not approve the unbuilt scheduler, route adapter, persisted recovery integration, conflict center, status surface, browser behavior, client deployment, or lockdown.

---

# Evidence reviewed

The package reports:

- 401 tests passed;
- 0 failures;
- 108 Commit 10 decision-core tests;
- 50 independent-manifest tests;
- no regression in the prior hardening suites.

The supplied correction transcript demonstrates the UTF-8 distinction with one payload:

- JavaScript `String.length`: 31;
- production decision-core byte counter: 35;
- independent reader byte counter: 35;
- Node UTF-8 reference count: 35.

The full-suite log reports every included suite passing.

---

# C10-P1-01 — recovery sizes use UTF-8 bytes

## Ruling: APPROVED

`cfCasUtf8Bytes` now measures UTF-8 bytes rather than UTF-16 code units.

The tests cover:

- ASCII;
- accented characters;
- an em dash;
- surrogate-pair emoji;
- a lone surrogate;
- empty/null values;
- comparison against an independent platform reference.

`cfCasRecValid` compares the manifest’s declared payload size with the UTF-8 byte count of the exact stored payload string.

This closes C10-P1-01.

Implementation integration must use this same byte contract when writing the artifact manifest. The current approval applies to the completed pure rule and its tests.

---

# C10-P1-02 — “verified” means content and ownership checked

## Ruling: APPROVED

The separation is correct:

- `cfCasRecValid` checks structural validity;
- `cfCasRecVerified` checks content and conflict ownership.

An actionable recovery reference now requires:

- a valid full lowercase SHA-256 digest;
- a recomputed digest equal to the declared digest;
- the expected account;
- the expected subsystem;
- the expected server revision;
- the expected recovery artifact ID.

The negative tests include:

- payload altered while the manifest hash remains unchanged;
- manifest hash altered while payload remains unchanged;
- malformed/truncated digest;
- invalid computed digest;
- another account;
- another subsystem;
- another server revision;
- another artifact reference;
- missing expectations;
- multibyte content.

This closes C10-P1-02 at the decision-contract level.

The future storage integration must still prove that the digest supplied to `cfCasRecVerified` was computed from the exact bytes read back from the stored artifact. A caller-supplied digest must never be trusted merely because it has the correct shape.

---

# Recovery immutability boundary

## Ruling: correctly deferred to integration evidence

Keeping `cfCasRecMayWrite` as a pure decision primitive is acceptable.

The final integration must prove:

1. a fresh artifact ID is chosen;
2. an existing artifact ID is refused before any component write;
3. component bytes are written first;
4. those bytes are read back and verified;
5. the manifest is written last;
6. partial failure cannot create an actionable artifact;
7. no later caller can overwrite the artifact in place.

This remains a release-blocking integration obligation, not an open Product Architecture question.

---

# C10-P1-03 — independent reader counts UTF-8 bytes

## Ruling: APPROVED

The independent reader now derives UTF-8 byte length itself and does not import:

- the application byte helper;
- production canonicalization;
- production manifest validation;
- Node’s `Buffer.byteLength` in the reader implementation.

Its test suite independently cross-checks the result against the platform reference and rejects manifests that declare code-unit lengths for multibyte content.

This closes C10-P1-03.

The reader remains an acceptable second implementation. No source-similarity or paraphrase detector is required.

---

# Continued implementation authorization

Claude may proceed with:

- the CAS scheduler;
- route adapter;
- persistent recovery writer/reader;
- conflict-record integration;
- conflict center;
- compact and per-subsystem status surfaces;
- reload, account, offline, and browser integration;
- real PocketBase staging tests;
- real localStorage snapshots fed into the independent manifest reader.

The following remain mandatory in the next relevant evidence package:

- atomic manifest-last recovery creation;
- refusal to overwrite an existing recovery artifact ID;
- read-back hash/byte/account verification before a conflict becomes actionable;
- one active scheduler per subsystem;
- zero raw snapshot POST/PATCH;
- exact CAS route semantics;
- all previously specified CAS, STATUS, conflict, plan, and manifest acceptance criteria.

---

# Scope remains unchanged

Not authorized:

- server contract changes;
- P7 lockdown;
- bridge removal;
- semantic merge;
- record-level synchronization;
- service-worker/background queue;
- payload-cap changes;
- unrelated product work.

---

# Final verdict

## **CORRECTIONS APPROVED — CONTINUE IMPLEMENTATION**

All three Progress 1 corrections are accepted. No additional Product Architect decision is needed before Claude continues with the scheduler and route adapter.
