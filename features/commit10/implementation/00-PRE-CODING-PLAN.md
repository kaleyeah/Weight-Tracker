# Commit 10 (CAS Client) — Pre-Coding Plan

**Last Updated:** 2026-07-27
**Status:** Awaiting Product Architect review. **No implementation code written.**
**Authority:** `features/commit10/spec/PRODUCT_ARCHITECT_COMMIT10_SPEC.md` — APPROVED TO BUILD. That document is the WHAT and wins any disagreement with this one. This is the HOW.

Required by the spec's `00-PROMPT.md`: map the per-subsystem sync state machine, conflict-state persistence, recovery-first choices, idempotency/retry handling, integration points, the independent manifest reader, tests against every acceptance ID, and rollout/rollback boundaries.

---

## 0. What already exists

Reconnaissance against build `2026-07-27.342-pb-c1h` (`index.html`, 8,030 lines, single file, vanilla JS). Commit 10 is not building on a blank slate — three of its foundations are already shipped and hardened:

| Need | Already present | Where |
| --- | --- | --- |
| Per-subsystem revisions | `revTrack(t)` → `{local, attempted, success}` for `"core"` / `"training"`, with `revBump`/`revAttempt`/`revCommit`/`revClean`/`revIsDirty` | ~5885–5908 |
| Write freeze | `pbSave` gated shut for snapshot fields; `cloudPush` inert | 5044, 5070, Commit 1b block ~6599 |
| Destructive-operation guard | `cfCtxDrifted(a,b)` — captures owner/session/revisions before an async safety copy and re-verifies before acting | ~7759 (Commit 1f) |
| Quarantine manifest validation | `cfManifestValid(man,stamp,comps)` — exact `{core,training,workout}` set | ~7907 (Commit 1g override) |
| Local entry points | `save()` → `scheduleCloudPush()`, `saveTraining()` → `scheduleTrainingPush()` | 1128, 1074 |

**The codebase's established pattern is append-and-override**: Commits 1, 1b–1h are each a trailing block that redefines earlier functions. Commit 10 follows it — a single `HARDENING — COMMIT 10: CAS CLIENT` block appended after 1h. This keeps the diff reviewable and the rollback trivial, and it is why seven prior review rounds could each be verified in isolation.

**What is missing and must be built:** a notion of *server* revision (today's `{local, attempted, success}` is device-only), conflict state at all, the commit-route adapter, and the conflict UI.

---

## 1. Per-subsystem sync state machine

One machine per subsystem, `core` and `training`, run independently (CAS-04, CAS-19). No shared state except the compact status roll-up.

### 1.1 State record

Extend the existing revision track rather than introducing a parallel store:

```
cfSync[subsystem] = {
  local,          // existing: bumps on every meaningful mutation
  attempted,      // existing
  success,        // existing: highest local rev acknowledged by the server
  serverRev,      // NEW: last known server revision (from 200 newRev or 409 serverRev)
  baselineHash,   // NEW: canonical hash of the payload last agreed with the server
  blocked,        // NEW: null | "auth" | "update" | "oversize" | "invariant" | "recovery" | "ownership"
  conflictId      // NEW: null | id of the persisted conflict record
}
```

`baselineHash` exists solely to implement the spec's §1.4 second exemption ("server still equals the last agreed baseline"). Without a remembered baseline that rule cannot be evaluated safely, and guessing it is how silent data loss happens.

### 1.2 States and transitions

| State | Condition | Leaves via |
| --- | --- | --- |
| `clean` | `local === success`, no conflict, not blocked | a meaningful mutation → `pending` |
| `pending` | `local > success` | debounce elapses and preconditions hold → `syncing`; conflict → `conflict`; block → `blocked` |
| `syncing` | exactly one request in flight | 200 → `clean` or back to `pending` (§1.3); 409 → `conflict`; 400/401/413/426/invariant → `blocked`; 500/network → `pending` with bounded retry |
| `conflict` | unresolved conflict record | explicit athlete resolution only |
| `blocked` | a reason above | the reason clearing (re-auth, reload, smaller payload, resolved invariant) |

**At most one in-flight request per subsystem** (spec §2.1). Both subsystems may be in flight simultaneously.

### 1.3 The in-flight edit rule (CAS-05, CAS-06)

Every request captures an immutable context at send time: `subsystem`, `localRev`, `expectedRev`, `payloadHash`, `idempotencyKey`, `accountId`, `sessionId`, `generation`. On 200:

- `serverRev := newRev`
- `success := max(success, capturedLocalRev)` — **only** the captured revision
- if `local > capturedLocalRev`, the subsystem returns to `pending` and the newer state is scheduled as the next coalesced commit

This is the same defect class Commit 1c fixed for the legacy path (an in-flight push marking a newer edit clean). Reusing `revCommit(t, sent)`, which already takes the sent revision rather than the current one, preserves that guarantee rather than reinventing it.

### 1.4 Preconditions (CAS-11, spec §2.7)

No automatic commit runs for a subsystem while: an unresolved conflict exists, required recovery storage has failed, ownership is unknown or mismatched, authentication is unavailable, an update is required, the payload exceeds the cap, or a client-invariant error is active. **The ownership gates from Commits 1c/1e are preconditions, not replacements** — the claim/mismatch screens still govern whether we may sync at all.

---

## 2. Conflict-state persistence

### 2.1 The server payload is stored as a recovery copy, not in the conflict record

A 409 carries the server's payload — real health data. Storing it in a new localStorage blob would create a second, unmanaged copy of an athlete's data outside the quarantine/recovery machinery that Commits 1e–1g exist to govern.

Instead: **on receiving a 409, immediately write the server payload through the existing verified-recovery path**, then persist a conflict record that *references* it:

```
cfConflicts[id] = {
  id, subsystem, accountId,
  serverRev,                 // from the 409
  serverCopyRef,             // recovery-copy handle — verified before use
  localRevAtCapture,
  capturedAt,
  resolved: false
}
```

Consequences, all of which the spec requires anyway:

- C4's "the online payload is saved as a verified previous copy" is the *same* write, not an extra one.
- C5 falls out structurally: if the recovery write fails, there is no `serverCopyRef`, so no destructive choice can proceed and the wording cannot claim a copy was saved.
- CAS-17 (payloads never logged) is easier to hold, because the payload never enters a general-purpose store.

### 2.2 Persistence and scoping

- Stored in `localStorage` under an account-scoped key, alongside the existing revision track.
- Survives reload (STATUS-05) and restores account-safely on restart (CAS-16): a conflict captured under account A is invisible to account B, and re-entering account A restores it.
- Cleared only by explicit resolution, or by the account's data being legitimately removed.

### 2.3 Conflict center

One surface, two independently resolvable cards (spec §1.3). Implemented as a view (`view_conflicts`) reachable from the status indicator, **not** a modal that can appear over an active workout (STATUS-08). Background discovery sets the compact state and one non-repeating notification; the center opens on tap or at a safe transition. Explicit **Sync now** may open it immediately.

No bulk resolve action exists, per the scope boundary.

---

## 3. Recovery-first destructive choices

Both destructive choices follow one shared sequence, so they cannot drift apart:

```
1. capture context      (account, session, subsystem generation, local rev)  — cfCtx*
2. write recovery copy  (server payload for Choice 3 / local payload for Choice 2)
3. VERIFY the copy      (read back, parse, length-check, manifest exact-set)
4. re-verify context    (cfCtxDrifted → abort if anything moved)
5. act                  (commit, or adopt)
6. re-verify + settle   (mark only the intended revision clean)
```

Steps 1 and 4 reuse `cfCtxDrifted` from Commit 1f unchanged. That guard already implements exactly what K1 demands — abort if the athlete edited while the safety copy was in flight — and it was verified across two review rounds. **Commit 10 must not reimplement it.**

| Choice | Recovery copy written | Then |
| --- | --- | --- |
| 1 — Keep this device's changes (default) | server payload | nothing is sent; subsystem stays `pending`; conflict stays unresolved; status stays *Sync needs your choice* |
| 2 — Use this device everywhere | server payload | commit local payload at the 409's `serverRev`, **new** idempotency key; a second 409 refreshes the conflict rather than looping (CAS-13) |
| 3 — Use the online copy here | **local** payload | adopt server payload only if context unchanged; mark clean at `serverRev` |

Choice 1 is the default and the focused action. Choices 2 and 3 require explicit confirmation whose wording names what is replaced.

---

## 4. Idempotency and retry

### 4.1 Keys are derived, not stored

```
idempotencyKey = "c10-" + shortHash(subsystem + "|" + expectedRev + "|" + payloadHash)   // ≤ 96 chars
```

Derivation gives CAS-08 and CAS-09 for free: an identical retry after an unknown network outcome reproduces the same key, and any change to subsystem, expected revision or payload produces a different one. It also removes a class of bug — a stored key surviving longer than the request it belonged to.

If the athlete edits back to identical content at the same expected revision, the key repeats and the server replays the original result. That is correct: same request, same outcome.

### 4.2 `409 idempotency key reused` is not a conflict

Per spec §4, this is a client invariant failure. Stop automatic retries, keep data pending, show the ordinary safe failure state, record a diagnostic. It must **not** reach the conflict center — an athlete cannot act on it and presenting it as a choice would be dishonest.

### 4.3 Retry policy

- **500 / network:** keep pending, same key, retry at ~5s and ~30s while foreground, authenticated and online; then stop until the next foreground, connectivity restoration, meaningful edit, or explicit Retry/Sync now.
- **400 / 413 / 426 / 401 / invariant:** no automatic retry at all.
- **409:** never retried automatically except the two exemptions in spec §1.4, each at most once.

CAS-20 (no indefinite loop) is enforced by a per-subsystem attempt counter that only resets on those explicit triggers.

### 4.4 Push scheduling

3 seconds of inactivity per subsystem, coalescing every edit in the interval into one snapshot; reset on further edits; never per keystroke. High-intent points (day complete, workout saved, import complete, restore complete, Sync now) attempt immediately without waiting, and never block the athlete. Foreground, reconnect and re-auth resume pending work. No service-worker queue.

---

## 5. Integration points in the current client

| # | Point | Change |
| --- | --- | --- |
| 1 | `save()` / `saveTraining()` | keep local write; re-point the (currently inert) schedulers at the CAS scheduler |
| 2 | Commit 1b write freeze | **stays** for raw snapshot POST/PATCH. Commit 10 adds a *route* path; it does not reopen the old one (CAS-01, CAS-02) |
| 3 | `pbSave` | unchanged — `health` and `coachreq` operational writes stay outside CAS (CAS-18) |
| 4 | `revCommit(t,sent)` | reused as-is for "acknowledge only the sent revision" |
| 5 | Ownership gates (1c/1e) | become sync preconditions |
| 6 | `cfCtxDrifted` (1f) | reused unchanged for both destructive choices and K1 |
| 7 | `cfManifestValid` (1g) | unchanged; the independent reader validates *against* it, never through it |
| 8 | Status indicator (`wl-sdot`) | extended to the seven-state priority list; tap opens per-subsystem detail |
| 9 | New `view_conflicts` | the conflict center |
| 10 | Recap/Coach guard (1h) | unchanged; recaps still gate on core being clean |

Everything lands in one appended `COMMIT 10` block. Existing functions are overridden there, not edited in place — the same technique the seven prior rounds used, which keeps this reviewable as a single contiguous diff.

---

## 6. Independent manifest reader

A **test-only second implementation** that shares no code with the app. Enforced structurally, not by intention:

- Lives in `tests/independent/manifest-reader.js`.
- Imports nothing from `index.html`; a test asserts the file contains no reference to the app's own reader.
- Reads persisted bytes from an IndexedDB dump captured by the Playwright harness, and re-derives validity from the *contract* — exact `{core, training, workout}` set, no missing/subset/duplicate/unknown component, valid byte sizes, stored bytes matching declared sizes, manifest present only after all components were written.

It automates H3, J6, K4, K5, L4, M1, M2, M3, M4 with the outcomes exactly as worded in `MANUAL_CHECKLIST_COMMIT1.md`. One manual production-readiness confirmation of the human-visible set-aside inventory/export/delete flow is performed in addition — automation does not replace it.

The reader and all nine cases are **release blockers**.

---

## 7. Test plan mapped to acceptance IDs

Three layers, because no single layer can cover the spec:

| Layer | Runner | Covers |
| --- | --- | --- |
| State-machine unit tests | `node tests/run-all.js` (existing harness, 277 tests today) | CAS-04, 05, 06, 08, 09, 12, 19, 20; STATUS-01, 02, 03 |
| Executable integration | real PocketBase staging carrying the **production** CAS kit | CAS-01, 02, 03, 07, 10, 11, 13, 14, 18; the 409 paths |
| Browser (Playwright, Chromium, real IndexedDB, two accounts, two profiles, offline) | `server/tests/e2e/` extended | A6, C4, C5, F5, K1; CAS-15, 16, 17; STATUS-04–08; H3 + eight dependents |

Every ID gets a named test whose failure message quotes the criterion. The Phase 2 harness already proved it can intercept the wire and count snapshot writes — that is how CAS-01/CAS-02 are proven by observation rather than inspection.

**Method note carried forward from Phase 2:** where a case needs a precondition the UI cannot reach, the setup is stated in the results rather than quietly performed. Four "failures" in Phase 2 were harness faults, and they were recorded as such.

---

## 8. Rollout and rollback boundaries

**Build:** `2026-07-2X.343-pb-c10`, appended block, no server change of any kind (contract, migration, index, cap and response shape are all frozen by the scope boundary).

**Rollout:** staging first against a PocketBase carrying the production kit → full acceptance run → evidence package for Architect review → deploy the client with the legacy bridge still active → 24–48 h bridge window → lockdown as a **separate** Product Owner authorization and Architect operational review.

**Rollback:** redeploy the previous `index.html`. The PWA self-update path already handles this, the server is untouched, and any data committed through the route in the interim stays valid because the bridge keeps legacy revisions truthful. **No rollback of the server is required or permitted for a client defect.**

**Rollback trigger:** any acceptance ID failing in production observation, or any evidence of an automatic conflict resolution occurring — the one behaviour the spec forbids outright.

---

## 9. Open questions for the Architect

Small, but each changes behaviour and I would rather ask than assume:

1. **Conflict record lifetime.** If a conflict sits unresolved for weeks and the athlete keeps editing, the recovery copy ages. Should an unresolved conflict expire (re-fetching on next sync so the athlete chooses against *current* server state), or persist indefinitely as captured? I lean toward re-fetching on next foreground sync, because choosing against a stale copy is a decision made on false information — but that means the presented choice can change under the athlete.
2. **Choice 1 and subsequent edits.** After "Keep this device's changes", the subsystem stays pending and unresolved. If the athlete then edits again, does the existing conflict stand, or is it re-evaluated on the next push attempt? I lean toward the existing conflict standing until explicitly resolved, per CAS-11.
3. **First-ever push with no server row.** `expectedRev: 0` creating the row is the normal path for a new account. The spec's no-row 409 handling covers the *unexpected* case. Confirm that a client which has never seen a server row may commit at `expectedRev: 0` automatically, without treating it as a conflict.

None of these block starting; they affect edge behaviour I would rather get right once.
