# Product Architect Review — Commit 10 Pre-Coding Plan

**Package:** `cf-commit10-precoding-plan-20260727.zip`  
**Role reviewed:** Lead Engineer pre-coding plan  
**Verdict:** **APPROVED TO IMPLEMENT WITH REQUIRED CLARIFICATIONS**

The plan is disciplined, narrow, and substantially aligned with the Product Architect specification. It correctly preserves the server contract, keeps raw snapshot writes frozen, separates core and training revisions, uses recovery-first conflict handling, and treats the independent manifest reader as a release gate.

Claude may begin implementation after incorporating the decisions below.

---

# 1. Conflict payload storage

## Decision: approved, subject to a recovery-contract requirement

Storing the 409 server payload through the verified recovery system, with only a reference in the conflict record, is approved.

This is preferable to creating another unmanaged health-data store.

The stored recovery artifact must be:

- immutable once referenced by a conflict,
- account-scoped,
- subsystem-labelled,
- self-contained enough to restore the affected subsystem,
- verified before the conflict is considered actionable,
- inaccessible to another account,
- retained while the conflict remains unresolved,
- never logged or embedded in diagnostics.

A conflict record must not point to a recovery entry that can later be overwritten in place.

If the existing recovery format cannot represent a self-contained subsystem recovery artifact without fabricating a mixed-version whole snapshot, Claude must extend the recovery format narrowly rather than saving a misleading hybrid snapshot.

---

# 2. Idempotency keys

## Decision: derived keys approved

Derived idempotency keys are approved. The behavior “same canonical request, same key, same result” is correct.

Required construction rule:

> Derive the key from a collision-resistant hash of the complete canonical request identity: subsystem, expected revision, and canonical payload bytes.

Use SHA-256 or an equivalently collision-resistant digest. Do not use a small ad-hoc or weak “short hash.”

The final key may be a fixed prefix plus the full hexadecimal digest and must remain within the server’s 96-character limit.

Acceptance criteria:

- semantically identical canonical payloads produce the same key,
- any payload-byte, subsystem, or expected-revision change produces a different key,
- retry after an unknown network result reproduces the original key,
- canonicalization is stable across reload,
- no raw health data appears in the key.

---

# 3. Reuse of approved machinery

## `revCommit`

Approved for reuse unchanged, provided tests prove that a response can acknowledge only the local revision captured by that request.

## `cfCtxDrifted`

Reuse the proven guard concept and predicates, but do **not** apply the existing whole-app context unchanged as the complete Commit 10 adoption guard.

The Commit 10 destructive decision is subsystem-specific. An unrelated edit to Training must not unnecessarily abort adoption of Health & progress, and vice versa.

The CAS resolution context must include at least:

- account owner,
- session/generation,
- affected subsystem,
- affected subsystem local revision,
- conflict identity,
- captured server revision,
- recovery-copy identity.

It must abort if any of those change before the destructive action.

An edit to the other subsystem may continue independently.

This is a narrow wrapper or specialized context around proven machinery, not a request to rewrite all prior hardening code.

---

# 4. Rulings on the three open questions

## A. Conflict-record lifetime and freshness

### Decision

Persist the captured conflict exactly as received. Do not silently replace it on every foreground event.

However, before a destructive resolution is executed, verify that the athlete is acting against the current online state.

### Required behavior

**Keep this device’s changes**

- requires no online refresh,
- sends no request,
- keeps the captured conflict and recovery copy,
- remains unresolved and pending.

**Use this device everywhere**

- may submit against the captured `serverRev`,
- CAS itself is the freshness check,
- if another 409 occurs, save and verify the newer server copy,
- replace the conflict record with the newer conflict,
- tell the athlete: **The online copy changed again. Review your choice.**
- require a new confirmation; never loop automatically.

**Use the online copy here**

Before adopting:

1. perform an authenticated, read-only refresh of the current server row/revision;
2. compare it with the captured conflict;
3. if unchanged, proceed with recovery-first adoption;
4. if changed, save and verify the newer server payload, update the conflict, and require a new explicit choice.

Do not adopt a weeks-old captured server payload merely because it was once valid.

The conflict does not expire solely because of age. It remains until explicitly resolved or legitimately removed with the account.

## B. Edits after “Keep this device’s changes”

### Decision

The existing conflict stands.

Subsequent edits:

- advance the local revision,
- remain local and pending,
- do not trigger an automatic commit for that subsystem,
- do not erase or silently refresh the conflict,
- do not affect the other subsystem’s ability to sync.

The next explicit resolution uses the latest local payload for **Use this device everywhere**, while preserving the referenced online recovery copy. A stale server revision is handled by CAS and the “online copy changed again” flow.

## C. First-ever push with no server row

### Decision

Yes, automatic creation at `expectedRev: 0` is allowed, but only when the client has positively established that this is a first-row state.

It is not enough that local revision metadata is missing.

Before automatic first creation, the client must have an authenticated bootstrap result proving:

- the current account owns no `appdata` row,
- there is no unresolved ownership/adoption condition,
- this device has not previously acknowledged a server row for that account,
- the local data belongs to the authenticated account.

If a client that previously knew a server row later receives a no-row condition, treat it as the unexpected no-row conflict already specified. Never silently recreate it.

---

# 5. Additional required clarifications

## Conflict recovery failure

A 409 whose server payload cannot be saved and verified must not create a normal actionable conflict card.

Instead:

- keep local data active and pending,
- set the subsystem to the recovery-blocked safe state,
- offer export,
- allow retrying recovery storage,
- do not offer either destructive choice,
- do not claim the online copy is safely preserved.

## Canonical payload comparison

The same canonicalization implementation may be used by the production CAS client for:

- payload fingerprints,
- baseline comparison,
- idempotency identity.

The independent manifest reader must remain independent; it must not import this canonicalization or production validation code.

## Append-and-override integration

The single appended Commit 10 block is acceptable for this release because it gives a clear rollback boundary.

Tests must prove:

- the old raw snapshot path remains frozen,
- only one active CAS scheduler exists per subsystem,
- prior overridden functions cannot still schedule a competing legacy push,
- rolling back to `.342-pb-c1h` requires only restoring the previous client file.

This approval is not a general endorsement of indefinite append-and-override growth beyond Commit 10.

---

# 6. Test additions required by this review

Add named tests for:

- C10-PLAN-01: current-server refresh before **Use online copy here**.
- C10-PLAN-02: changed server state requires a new confirmation.
- C10-PLAN-03: **Use this device everywhere** receives a second 409 and does not loop.
- C10-PLAN-04: edits after **Keep this device’s changes** do not auto-push.
- C10-PLAN-05: unrelated subsystem edit does not abort the selected subsystem’s adoption.
- C10-PLAN-06: affected-subsystem edit does abort adoption.
- C10-PLAN-07: first-row creation requires positive authenticated no-row proof.
- C10-PLAN-08: previously known row disappearing is never auto-recreated.
- C10-PLAN-09: recovery reference is immutable and account-scoped.
- C10-PLAN-10: recovery failure exposes no destructive actions.
- C10-PLAN-11: canonical request identity produces stable SHA-256 keys.
- C10-PLAN-12: no duplicate legacy/CAS scheduler or raw snapshot write path is active.

These are additional to, not replacements for, the existing CAS, STATUS, conflict, and manifest acceptance criteria.

---

# Final verdict

## **APPROVED TO IMPLEMENT WITH REQUIRED CLARIFICATIONS**

Claude Code may implement Commit 10 after updating the plan to reflect these rulings.

No server changes, lockdown, bridge removal, semantic merge, or record-level synchronization are authorized.
