# Product Architect Specification — Commit 10: CAS Client

**Product:** Compound Fitness  
**Role:** Product Architect  
**Product Owner:** User  
**Lead Engineer:** Claude Code  
**Source package:** `cfcommit10specrequest20260727.zip`  
**Status:** **APPROVED TO BUILD — SPECIFICATION COMPLETE**

---

# Executive decision

Commit 10 safely unfreezes upward synchronization for the two whole-snapshot tracks:

- **Health & progress** (`core` → `appdata.data` / `coreRev`)
- **Training & workouts** (`training` → `appdata.training` / `trainingRev`)

The client must use the production CAS route for these two fields and must never resume raw snapshot POST/PATCH writes.

The release is narrow:

1. CAS request adapter and per-subsystem sync state.
2. Safe conflict UX.
3. Coalesced automatic synchronization.
4. Honest status and failure behavior.
5. Mandatory Commit-10 acceptance cases.
6. Independent quarantine-manifest reader and its regression cases.

Lockdown, bridge removal, semantic merge, record-level sync, and native background health ingestion remain outside this commit.

---

# 1. Conflict UX — Product decision

## 1.1 The athlete-facing model

A conflict is not described as a revision problem.

Use:

**Heading:**  
> Changes were made on another device

**Body:**  
> Your changes are safe on this device. Choose what should happen to **Health & progress**.

For training conflicts, substitute:

> **Training & workouts**

Never expose:

- `core`,
- `training`,
- `expectedRev`,
- `serverRev`,
- CAS,
- payload,
- record IDs.

## 1.2 Three choices

The three-way choice remains, with **keep-local as the safe default**.

### Choice 1 — default

**Keep this device’s changes**

Supporting text:

> Keep working here. Sync for this section stays paused until you choose whether to update the online copy.

Behavior:

- local state remains active,
- local state remains pending,
- no commit is sent,
- the server payload is saved as a verified previous/recovery copy first,
- the conflict remains unresolved,
- the athlete may close the screen and continue,
- the compact status remains **Sync needs your choice**.

This is the focused/recommended choice. It preserves the device without overwriting the online copy.

### Choice 2

**Use this device everywhere**

Supporting text:

> Replace the online copy with this device’s version. The current online copy will be saved first.

Behavior:

1. Save and verify the server payload as a recovery copy.
2. If recovery storage fails, refuse the action.
3. Submit the current local payload against the conflict response’s current server revision.
4. Use a new idempotency key because the expected revision has changed.
5. If another 409 occurs, do not loop or silently win. Refresh the conflict and require another decision.
6. On success, mark only the submitted local revision clean.

Confirmation text must say that the online copy will be replaced.

### Choice 3

**Use the online copy here**

Supporting text:

> Replace this device’s version. This device’s current version will be saved first.

Behavior:

1. Save and verify the current local payload as a recovery copy.
2. If recovery storage fails, refuse the action.
3. Adopt the server payload only if the account, session, subsystem generation, and local revision are unchanged from the start of the destructive operation.
4. If the athlete edits while the recovery copy or adoption is in progress, abort the adoption.
5. On success, mark the subsystem clean at the server revision returned by the conflict.

Confirmation text must say that this device’s current version will be replaced.

## 1.3 Core and training conflicts

Core and training have independent revisions and must remain independent decisions.

Present them in **one conflict center** so the athlete does not receive two unrelated modal conversations. Inside that surface:

- show one card for **Health & progress** when core conflicts,
- show one card for **Training & workouts** when training conflicts,
- resolve each card independently,
- resolving one must not alter, dismiss, retry, or adopt the other,
- do not provide a single “resolve all” destructive action.

## 1.4 When a prompt may be skipped

A genuine content conflict must never be resolved automatically.

The client may suppress the conflict screen only in these content-equivalent cases:

### Equivalent to the attempted payload

If the server payload is canonically identical to the payload sent by the client:

- accept the returned `serverRev` as the agreed revision,
- mark only the submitted local revision clean,
- do not replace local data,
- do not show a conflict.

### Server still equals the last agreed baseline

If the server revision advanced but its canonical payload still equals the client’s trusted last-agreed baseline:

- retry the local payload once against the newer server revision,
- use a new idempotency key,
- if that retry conflicts, stop and show the conflict center.

No other automatic conflict resolution is allowed.

In particular, do not automatically:

- choose the newest timestamp,
- choose the largest payload,
- choose the server,
- choose the device,
- merge differing snapshots,
- retry repeatedly until one side wins.

## 1.5 A6 — historical correction versus newer weigh-in

The correct product outcome is:

- neither version silently wins,
- the historical correction stays active on Device A,
- the newer server version is preserved as a recovery copy,
- sync for Health & progress pauses,
- the athlete sees the three choices,
- defaulting/closing keeps Device A unchanged and pending.

Commit 10 does **not** attempt a semantic merge of the historical correction and newer weigh-in. Both versions remain recoverable; record-level merge is a later architecture.

## 1.6 Interruption policy

Do not throw a blocking conflict modal into an active workout, active text entry, or completion flow.

When a background/debounced push discovers a conflict:

- show the persistent compact state **Sync needs your choice**,
- show one non-repeating notification,
- open the conflict center when the athlete taps the status or reaches a safe transition.

When the athlete explicitly presses **Sync now**, the conflict center may open immediately.

---

# 2. When the client pushes

## 2.1 Default policy

Use automatic, coalesced CAS synchronization.

For each subsystem independently:

- mark local state pending immediately after a meaningful local mutation,
- wait for **3 seconds of inactivity**,
- send one snapshot containing all edits made during that interval,
- reset the debounce when another edit occurs,
- never send on every keystroke or every field mutation,
- allow at most one in-flight request per subsystem.

Core and training may each have one in-flight request because their revisions are independent.

## 2.2 High-intent sync points

Attempt a non-blocking sync without waiting for the ordinary debounce after:

- completing a day,
- saving/ending a workout,
- completing an import,
- completing a restore,
- pressing **Sync now**.

The local operation completes first. Network completion must not block the athlete from continuing.

## 2.3 Lifecycle opportunities

Attempt or resume pending sync when:

- the app enters the foreground,
- connectivity returns,
- authentication is restored,
- the app is about to move to the background and a best-effort request can be started.

A background/visibility transition is an opportunity, not a promise. Never mark data synced unless the route response proves success.

Do not add a service-worker background queue in Commit 10.

## 2.4 In-flight edit rule

Every request captures:

- subsystem,
- local revision,
- expected server revision,
- canonical payload/fingerprint,
- idempotency key,
- account/session/generation context.

A 200 may acknowledge only the local revision represented by that request.

If the athlete edited while the request was in flight:

- the response may advance the known server revision,
- it must not mark the newer local revision clean,
- the newer state remains pending and is scheduled as the next coalesced commit.

## 2.5 Idempotency behavior

- A retry of the exact same request after an unknown network outcome reuses the same idempotency key.
- Any change to subsystem, expected revision, or payload creates a new idempotency key.
- A server response saying the key was reused with a different request is a client invariant failure, not a user conflict. Stop automatic retries, keep data pending, and surface the ordinary safe failure state.

## 2.6 Retry policy

For network failure or HTTP 500:

- keep the data pending,
- reuse the same idempotency key when the request is identical,
- retry at approximately 5 seconds and 30 seconds while foreground, authenticated, and online,
- after those attempts, stop unattended retrying until the next foreground, connectivity restoration, meaningful edit, or explicit **Retry/Sync now**.

Do not create a rapid or indefinite retry loop.

For 400, 401, 409, 413, or 426, follow the status-specific behavior below; do not use the generic automatic retry loop.

## 2.7 When synchronization is paused

No automatic commit may run for a subsystem while any of these are true:

- unresolved conflict,
- recovery storage required for a destructive choice has failed,
- account ownership is unknown or mismatched,
- authentication is unavailable,
- update is required,
- payload is over the server cap,
- a client-contract/invariant error is active.

The other subsystem may continue syncing if it is safe.

---

# 3. What the athlete sees

## 3.1 Compact combined status

Use one compact sync indicator in the existing app shell. It reflects the highest-priority state across core and training.

Priority:

1. **Update required**
2. **Sync needs your choice**
3. **Sign in to sync**
4. **Couldn’t sync — changes are safe here**
5. **Saved on this device**
6. **Syncing…**
7. **Synced**

Tapping it opens per-subsystem detail.

## 3.2 Meaning of each state

### Synced

> Synced

Meaning: both subsystems have no local revision newer than their acknowledged server revision.

This may fade to a quiet neutral state after a short period.

### Syncing

> Syncing…

Meaning: at least one safe CAS request is in flight.

### Saved locally / pending / offline

> Saved on this device

Supporting text in detail:

> We’ll sync when the connection is available.

Do not call local data “unsaved.”

The export path remains available.

### Conflict

> Sync needs your choice

This persists until each conflicted subsystem is explicitly resolved or kept local.

### Authentication

> Sign in to sync

Local changes remain available and account-scoped. Reauthentication must not clear or replace them.

### Update required

> Update required — reload the app

The current build must stop commit attempts. Local data remains pending and exportable.

### Failure

> Couldn’t sync — changes are safe here

Actions:

- **Retry**
- **Save a copy**

Show one notification when the app first enters this state. Do not show a toast on every retry.

## 3.3 Per-subsystem details

The detail surface shows:

- Health & progress: Synced / Pending / Syncing / Needs your choice / Failed
- Training & workouts: the same independent states

Do not expose raw revisions in the athlete UI. Revisions and request identifiers may appear only in diagnostics.

---

# 4. Exact route semantics the client must implement

Request:

```json
{
  "subsystem": "core | training",
  "expectedRev": 0,
  "idempotencyKey": "non-empty, max 96 chars",
  "payload": {},
  "clientBuild": "current build identifier",
  "deviceId": "diagnostic device identifier"
}
```

## 200

Treat normal success and `replay: true` as success.

Required behavior:

- accept `newRev`,
- update the known server revision,
- mark only the submitted local revision acknowledged,
- preserve newer in-flight edits as pending.

## 400

Examples include invalid subsystem, expected revision, key, or payload.

Product behavior:

- stop automatic retry,
- keep local data pending,
- show **Couldn’t sync — changes are safe here**,
- retain export,
- record diagnostic details without payload contents.

## 401

- keep local data,
- stop commit attempts,
- show **Sign in to sync**,
- resume after successful authentication.

## 409 — `conflict: true`

Use the conflict behavior in §1.

Special no-row response (`serverRev: null`, `payload: null`) must not create automatically when the client believed a prior row existed.

Treat it as a conflict. **Use this device everywhere** may explicitly create a new online row using `expectedRev: 0`; no automatic reset is allowed.

## 409 — idempotency key reused

Do not show the normal conflict choice.

- stop retries,
- keep pending,
- show the safe failure state,
- record a client invariant diagnostic.

## 413

> This data is too large to sync. It is still safe on this device.

- no automatic retry,
- export remains available,
- do not truncate or split the payload in Commit 10.

## 426

> Update required — reload the app

- stop commit attempts,
- preserve pending data,
- offer reload/update,
- do not silently discard local changes.

## 500 / network failure

Use bounded retry policy in §2.6, then the safe failure state.

---

# 5. Mandatory acceptance criteria

## 5.1 Five deferred cases

### A6 — independent valid changes

Given:

- Device A makes a historical correction,
- Device B commits a newer weigh-in,
- Device A attempts to sync,

Then:

- Device A’s correction remains active,
- the server payload is preserved as a verified recovery copy,
- a Health & progress conflict is offered,
- no automatic winner is chosen,
- closing/defaulting leaves Device A pending.

### C4 — Keep this device’s changes

When the athlete chooses **Keep this device’s changes**:

- the online payload is saved as a verified previous copy,
- local state is unchanged,
- no commit is sent,
- the subsystem remains pending,
- status reads **Sync needs your choice**.

### C5 — recovery blocked

When recovery storage fails during C4 or before a destructive resolution:

- no server overwrite occurs,
- no local adoption occurs,
- local data remains active and pending,
- wording never claims a recovery copy was saved,
- the athlete is offered export.

### F5 — Use online copy here

When the athlete chooses **Use the online copy here**:

- explicit confirmation is required,
- current local state is saved and verified first,
- the online payload is adopted only after the recovery write succeeds,
- the subsystem becomes clean at `serverRev`,
- failure or an intervening edit aborts adoption.

### K1 — edit during server adoption

If the athlete edits while the local recovery snapshot for server adoption is in progress:

- adoption aborts,
- the edit survives,
- the device stays pending,
- the server payload remains available in the unresolved conflict,
- no success wording appears.

## 5.2 CAS behavior

- CAS-01: ordinary core edit produces no raw appdata snapshot POST/PATCH.
- CAS-02: ordinary training edit produces no raw snapshot POST/PATCH.
- CAS-03: each subsystem sends the exact route request shape.
- CAS-04: expected revisions are independent.
- CAS-05: a 200 acknowledges only the captured local revision.
- CAS-06: an edit during a request remains pending.
- CAS-07: replayed 200 is treated as success.
- CAS-08: an unknown network outcome retries with the same key.
- CAS-09: a changed payload or expected revision uses a new key.
- CAS-10: conflicting subsystems are resolved independently.
- CAS-11: no unresolved conflict produces automatic commits for that subsystem.
- CAS-12: content-equivalent conflicts follow only the two allowed automatic paths.
- CAS-13: a second 409 after safe retry opens the conflict center.
- CAS-14: 401, 413, and 426 preserve local data.
- CAS-15: logout/session expiry never clears pending data.
- CAS-16: app restart restores pending/conflict state account-safely.
- CAS-17: payload and server conflict bodies are never logged.
- CAS-18: health and coachreq operational writes remain outside the CAS tracks.
- CAS-19: core success cannot clean training, and training success cannot clean core.
- CAS-20: no request loop continues indefinitely.

## 5.3 Status behavior

- STATUS-01: local edit immediately shows a safe local/pending state.
- STATUS-02: status changes to Syncing only when a request is actually active.
- STATUS-03: status changes to Synced only after acknowledged revisions are current.
- STATUS-04: first persistent failure notifies once; retries do not nag.
- STATUS-05: conflict status persists across reload.
- STATUS-06: detail view shows independent core/training states.
- STATUS-07: export remains available while pending, conflicted, oversized, unauthenticated, or failed.
- STATUS-08: active workout is not interrupted by a background conflict modal.

---

# 6. Independent manifest reader — Commit 10 ship gate

Build a test-only, second implementation that does not import, invoke, copy, or share parsing/validation code with the app’s manifest reader.

It must parse the persisted manifest and component bytes independently and validate:

- exact component set `{core, training, workout}`,
- no missing component,
- no subset,
- no duplicate component,
- no unknown component,
- valid byte sizes,
- stored bytes match declared sizes,
- manifest exists only after all components were written,
- incomplete or altered sets refuse export.

The independent reader is used to automate:

- H3,
- J6,
- K4,
- K5,
- L4,
- M1,
- M2,
- M3,
- M4.

Required outcomes remain exactly as issued in `MANUAL_CHECKLIST_COMMIT1.md`.

Also perform one manual production-readiness confirmation of the human-visible set-aside inventory/export/delete flow. Automation does not replace that manual confirmation.

The independent reader and all nine cases are release blockers for Commit 10.

---

# 7. Explicit scope boundary

## Included

- CAS route client for core and training.
- Per-subsystem server revision and pending state.
- Coalesced automatic pushes.
- Bounded retries and idempotency behavior.
- Conflict persistence and conflict center.
- Recovery-first destructive choices.
- Honest combined/per-subsystem status.
- 400/401/409/413/426/500 behavior.
- Five deferred conflict cases.
- Independent manifest reader and nine dependent cases.
- Regression coverage for all previously approved hardening behavior.
- Build identifier and diagnostic device identifier in route requests.

## Not included

- P7 lockdown or minimum-client-build activation.
- Removal of the legacy bridge.
- Any server route, migration, index, cap, or response-contract change.
- Field-level or record-level synchronization.
- Automatic semantic merging of two differing snapshots.
- Field-by-field conflict diff UI.
- Native background health ingestion.
- Service-worker/background sync queue.
- Payload chunking, compression, truncation, or cap changes.
- Moving photos into the CAS snapshot tracks.
- Reworking account ownership, quarantine, recovery retention, or export formats beyond what Commit 10 directly needs.
- Coach-facing functionality, Knowledge Module integration, or unrelated product polish.
- A bulk “resolve all conflicts” destructive action.

---

# 8. Release and rollout sequence

1. Build and test Commit 10 against a staging PocketBase with the production CAS kit.
2. Pass all Commit 10 criteria in this document.
3. Pass the independent manifest-reader suite.
4. Complete one manual production-readiness set-aside confirmation.
5. Return a prompt-first evidence package for Product Architect review.
6. After approval, deploy the CAS client while the legacy bridge remains active.
7. Observe the 24–48 hour bridge window.
8. P7 lockdown remains a separate Product Owner authorization and Product Architect operational review.
9. Remove bridge hooks only after the approved monitoring condition is met.

---

# Final verdict

## **APPROVED TO BUILD**

Claude Code may now design the implementation and submit the pre-coding plan or implementation package according to the standing workflow.

The conflict UX and behavioral acceptance criteria above are Product Architecture decisions. Implementation structure remains the Lead Engineer’s decision.
