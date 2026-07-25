# Commit 1d Notes — required explanations

**Last Updated:** 2026-07-26 · Build `2026-07-26.337-pb-c1f` · Companion to the 1c/1d re-review responses. **1e addendum at the end.**

## 1. The Coach Max result merge (required deliverable 9)

`genNightly()` no longer applies the server snapshot. The flow is now:

1. **Pre-flight:** fresh `cloudGet` → `cfReconcile` (Architect ruling B — a clean check is only meaningful against the server's *current* content), then `pushDataPromise()` which rejects honestly if core is dirty.
2. **Arrival re-checks:** the account uid captured at start must still be the authenticated uid and the verdict still `ok` — otherwise the result is dropped silently.
3. **Merge, never adopt:** `mergeCoachResultOnly(day, d)` copies **only** the server-owned recap fields — `nightlyLog[day]`, `nightlySummary`, `weeklySummary` — extracted by the pure `cfCoachFieldsOf()`. It calls `saveLocal()` (not `save()`): the recap is server-authored, not a new athlete edit, so it neither bumps the revision nor marks anything clean.
4. **Only if still clean** does the fetched state go through `cfReconcile(d, "coach-result")` — which re-checks dirty itself and can only agree/adopt/conflict safely. If the athlete edited during the poll, their edit stays, core stays dirty, and the recap still displays.

Executable proof: test D3 starts a recap, edits mid-poll, then lands a full server snapshot lacking that edit — the edit survives, core stays dirty, only the recap merged.

## 2. The startDate equality rule (required deliverable 10)

`startDate` is user-editable, but its *generated* default is `todayISO()` — a moving target that would create false divergence between fresh installs. The exclusion the 1c review rejected is replaced by intent tracking:

- **New flag `settings.startDateSet`** — stamped `true` the moment the athlete edits the start-date field (capture-phase `change` listener on `data-set="startDate"`). Synced like any setting; stable default `false`.
- **Equality:** `startDate` participates when `startDateSet === true`.
- **Deterministic legacy rule** (rows predating the flag, applied symmetrically inside normalization on both sides): the unflagged `startDate` counts as real intent **iff the payload contains weigh-ins** — an engaged athlete's start date is meaningful; a fresh install's generated date is noise. This makes fresh installs on different days equal (no false conflict) while historic divergence on active accounts surfaces as a real conflict once.
- **`macroAuto` / `calTargetAuto`:** user intent — now in equality with stable semantic defaults (`true` = automatic).
- **`onboarded` policy:** device/UI state — init *re-derives* it from data presence, so it carries no independent intent; excluded, documented here and test-covered. `seenNightly` (a read-marker) is treated the same way.

## 3. Quarantine manifest example (required deliverable 11)

`cfDisownLocal()` copies **core + training + workout draft**, verifies every copy byte-for-byte, writes the manifest **last** (its presence certifies a complete verified set), and only then deletes sources. Any failure removes the partial copies and keeps every source.

```json
// localStorage["cf:quarantine:1753490000000:manifest"]
{
  "stamp": "1753490000000",
  "createdAt": 1753490000000,
  "appBuild": "2026-07-25.335-pb-c1d",
  "keys": ["core", "training", "workout"],
  "sizes": { "core": 48211, "training": 9120, "workout": 3016 }
}
```

**Recovery:** the signed-out login screen lists set-aside sets ("Data set aside on this device") with per-set **Save a copy** / **Delete**. Export lives *only* there — a newly authenticated account can no longer export unknown-owner data (Architect ruling A); after an explicit claim the data is the account's own and exports normally.

---

## 1e addendum (responses to the Commit 1d review)

- **D3 is now enforced.** The review proved the coach test ran after the verdict: a broken assertion exited 0. The harness gained `defer()`; `report()` awaits every deferred scenario before printing and setting the exit code. The same broken assertion now fails `run-all` (verified both ways). Suite totals are real: **205**.
- **Adoption context.** `applyCloudSafe` captures `{owner, sessionGeneration, coreRevision}` before the recovery wait and re-verifies immediately before `applyCloudRaw`; drift aborts (`"stale"`), keeps the recovery copy, and `cfReconcile` re-runs once (depth-guarded) so the new dirty state routes to hold/conflict.
- **Reconciliation outcomes.** `cfReconcile` callbacks now receive `(decision, outcome)` with `completed / adopted / blocked / conflict / pending / recoveryFailed / stale`. Coach preflight proceeds only on `completed`.
- **Coach request context.** `{owner, sessionGeneration, tokenFingerprint, day, requestId}` — session generation bumps on login, session clear, and forced logout, so A→B→A cannot present a valid context to a stale poll.
- **Pairwise startDate rule.** Flag true → compare; flag absent → compare when the payload has any meaningful non-startDate state; ignore only when otherwise semantically empty. Documented residual: a legacy user whose *only* change was the start date is indistinguishable from a generated date.
- **Quarantine phases.** Copy+verify → manifest commit (point of no rollback) → per-key cleanup with `cleanupPending` retry at boot and stale-flag repair. Export validates completeness and confirms with a plain statement that the file contains private health data.

---

## 1f addendum (responses to the Commit 1e review)

- **Generalized destructive guard.** `cfDestructiveCtx()` = `{owner, sessionGeneration, coreRevision, trainingRevision, workoutFingerprint}`, captured before the async safety copy in **restore, import and logout-wipe**, re-verified immediately before the destructive commit (import verifies a second time after the confirm dialog, which waits at human speed). Drift ⇒ abort, keep the newer data and the safety copy, tell the athlete the device changed and to retry.
- **Content-conditional, stamp-isolated cleanup.** A `cleanupPending` job may delete a source key **only while its current value byte-matches that stamp's own quarantined component**; an absent source counts as clean; anything else marks the job `cleanupSuperseded` with the component names — newer data is never deleted, and no stamp can touch another stamp's data. (Fixed **in place** in the 1e boot-repair IIFE, since it executes at script-eval time before any appended block could replace it.)
- **Manifest integrity.** `cfManifestValid()` — parsed read-back, stamp match, expected component set, recorded lengths — required before the manifest counts as committed (phase 2) and before any export (`cfQuarComplete`).
- **Session-generation semantics (per Verification C):** *Session generation represents account/session-boundary events (login, session clear, forced logout). Routine same-account token rotation is detected by the Coach token fingerprint and does not invalidate ordinary same-owner adoption* — covered by tests F6.
