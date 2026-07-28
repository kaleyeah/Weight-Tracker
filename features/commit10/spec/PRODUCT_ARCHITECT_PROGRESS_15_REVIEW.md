# Product Architect Review — Commit 10 Progress Package 15

**Package:** `cf-commit10-progress-15-20260728.zip`  
**Review type:** Verification of cleanup-ledger serialization and capacity behavior  
**Verdict:** **CHANGES REQUIRED — LEDGER SERIALIZATION AND CAPACITY HANDLING APPROVED; RECONCILIATION PROOF AND ID VALIDATION REMAIN**

This is a progress ruling only. It does not approve the rendered conflict center, real Chromium integration, real PocketBase integration, client deployment, bridge removal, or lockdown.

---

# Executive ruling

The two central Progress 14 corrections are implemented correctly:

- every cleanup-ledger mutation now executes under one account-scoped exclusive Web Lock;
- the ledger re-reads within the lock, merges, writes, and reads back before reporting success;
- without Web Locks it fails closed;
- a sweep does not drop an obligation until artifact deletion is verified;
- the 200-entry bound no longer silently truncates;
- an over-capacity obligation is reported as untracked rather than falsely recorded;
- replacement keeps the newer valid conflict even when cleanup tracking fails;
- deterministic account-scoped reconciliation exists as a fallback concept;
- the concurrency test now creates real artifacts before forcing deletion failure.

The package reports:

- **815 tests**
- **0 failures**
- **115 conflict-workflow tests**
- eight consecutive full-suite passes

Two final issues remain in the submitted C10-P14 evidence and implementation.

---

# 1. C10-P14-01 through C10-P14-07 and C10-P14-10

## Ruling: APPROVED

The implementation now uses one lock per account cleanup ledger:

```text
cf-cas-recovery-cleanup:<account-scope>
```

Inside the lock, mutation:

- reads the latest stored list;
- applies the intended add/drop;
- refuses a result over the bound;
- persists the complete list;
- reads it back;
- reports success only when storage matches.

The overlapping two-context test starts both failed deletions together and proves both obligations remain recorded.

The sweep preserves an obligation when deletion cannot be verified.

No-lock and non-persisting-storage paths report failure honestly.

Account A and Account B remain isolated.

The test-author disclosure is important and accepted: using nonexistent IDs would only prove the valid `absent` path, not failed deletion tracking. Replacing those fixtures with real artifacts makes the evidence meaningful.

---

# 2. Capacity behavior

## Ruling: APPROVED

Silent:

```js
slice(0, 200)
```

behavior is removed.

At capacity:

- existing obligations remain intact;
- the new obligation is not falsely claimed as recorded;
- the newer conflict remains valid;
- the result identifies an untracked cleanup obligation;
- no health payload, hash, revision, or account content is added to the ledger.

This is the correct bounded-failure behavior.

---

# 3. Required correction C10-P15-01 — reconciliation test must prove rediscovery

## Evidence defect

The C10-P14-08 test is named:

> an untracked artifact is still discoverable by reconciliation

But the assertion only proves that the active conflict artifact is **not** returned:

```js
notOk(orphans.indexOf(cfCasConflictId("core")) >= 0)
```

It never asserts that the actual untracked artifact (`idF`) **is present** in the reconciliation result.

A reconciliation implementation that returns an empty array would pass this test.

That means C10-P14-08 is not yet evidence for the property it names.

## Required test behavior

The test must assert all of the following:

- the cleanup-recording attempt for `idF` failed;
- `idF` still has a valid canonical manifest in Account A’s namespace;
- `idF` is absent from the pending-cleanup ledger;
- `idF` is returned by reconciliation;
- the currently active conflict artifact is not returned;
- Account B cannot discover Account A’s orphan;
- after reconciliation-driven locked cleanup, `idF` is absent.

Add:

- **C10-P15-01:** The exact untracked artifact ID is returned by reconciliation.
- **C10-P15-02:** Active conflict and ledger-tracked artifacts are excluded.
- **C10-P15-03:** Reconciliation is account-scoped.
- **C10-P15-04:** Reconciled cleanup verifies actual absence.

This is an evidence correction and end-to-end fallback proof, not a new product behavior.

---

# 4. Required correction C10-P15-02 — the ledger must reject malformed string IDs

## Defect

The Progress 14 requirement was:

> Cleanup ledger contains well-formed artifact IDs only.

`pendingList` currently filters only by JavaScript type:

```js
typeof x === "string"
```

An arbitrary string such as:

```text
not-an-artifact
../../other-key
casrec-core-
```

survives the ledger read.

The C10-P14-09 test supplies two valid strings plus non-string values. It proves non-strings are ignored, but it does not prove malformed strings are rejected.

## Required behavior

Define one strict artifact-ID validator for cleanup-ledger use.

It must accept only the shipping recovery ID contract, for example the actual generated shape:

```text
casrec-(core|training)-<required cryptographic hex length>
```

Use the exact length produced by `newId`, not a loose `+` expression.

Required:

- `pendingList` ignores invalid persisted entries;
- `pendingAdd` refuses an invalid ID;
- `pendingDrop` cannot be used to address arbitrary storage-shaped strings;
- reconciliation emits only IDs passing the same validator;
- invalid entries do not count toward the 200-entry capacity;
- no cleanup function constructs storage keys from an unvalidated ledger/reconciliation ID.

Add:

- **C10-P15-05:** Malformed string entries are rejected, not merely non-string entries.
- **C10-P15-06:** Too-short and too-long entropy sections are rejected.
- **C10-P15-07:** Unknown subsystem names are rejected.
- **C10-P15-08:** Invalid entries do not consume ledger capacity.
- **C10-P15-09:** `pendingAdd` reports invalid ID honestly.
- **C10-P15-10:** Reconciliation returns only valid artifact IDs.

This closes the semantic gap in C10-P14-09.

---

# 5. Real Chromium requirement

The deterministic lock-registry tests are accepted as unit/integration-model evidence.

Final approval still requires real Chromium multi-context evidence proving:

- two tabs share the account cleanup-ledger Web Lock;
- overlapping add/add preserves both obligations;
- add/drop and sweep operations serialize;
- real localStorage read-back matches;
- no-lock behavior fails closed where simulated;
- reconciliation is account-scoped against real browser storage.

This remains part of the final browser evidence package.

---

# 6. Test and evidence ruling

Accepted:

- 815 tests;
- 0 failures;
- all C10-P14 IDs present by name;
- eight consecutive full-suite passes;
- real-artifact fixtures for failed deletion;
- account-level ledger locking;
- read-back verification;
- honest capacity failure.

Not yet accepted:

- C10-P14-08 as proof of actual orphan rediscovery;
- C10-P14-09 as proof that malformed string IDs are rejected;
- real Chromium ledger concurrency.

---

# 7. Rendered conflict-center work

Claude remains authorized to continue building the rendered conflict center now.

The C10-P15 corrections may be completed in parallel and included with the rendered-view package.

The rendered package remains required to include:

- desktop and narrow/mobile screenshots;
- both subsystem cards and one-card state;
- focused **Keep this device’s changes** default;
- preserving, recovery-blocked, changed-again, and busy states;
- confirmations for both destructive choices;
- compact status and per-subsystem details;
- keyboard focus order;
- screen-reader names/descriptions;
- active-workout non-modal behavior;
- no raw revision, CAS, payload, record-ID, or subsystem-code terminology.

---

# 8. Continued implementation ruling

Correct C10-P15-01 and C10-P15-02 before final cleanup-ledger approval.

No separate correction-only package is required. Include:

- C10-P15-01 through C10-P15-10;
- updated acceptance-ID index;
- rendered conflict-center evidence;

in the next progress package.

No client deployment, server change, lockdown, bridge removal, semantic merge, or record-level synchronization is authorized.

---

# Final verdict

## **CHANGES REQUIRED — LEDGER SERIALIZATION AND CAPACITY HANDLING APPROVED; RECONCILIATION PROOF AND ID VALIDATION REMAIN**

The cleanup ledger no longer loses obligations through tab races or silent capacity truncation. The final correction is to prove the fallback actually rediscovers the specific untracked artifact and to enforce the promised well-formed artifact-ID contract.
