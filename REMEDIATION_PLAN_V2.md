# M1–M4 Remediation — Authorized Implementation Plan (v2)

**Last Updated:** 2026-07-25

**Status:** Amended after two Architect reviews. **Commit 1 returned CHANGES REQUIRED; Commit 1b implements all 15 required changes** (build `2026-07-25.333-pb-c1b`, coded, not shipped, not staging-validated). Commits 2–11 not started.

> Supersedes `REMEDIATION_PLAN.md` (v1) — packaged in review archives as `02-v1-superseded.md`. Every amendment from both review rounds is incorporated. This answers the fifteen items required before coding. **Commit 1 has since been implemented** at build `2026-07-25.332-pb-c1`; it is coded and tested but **not shipped** pending staging browser validation.
>
> **One item cannot be delivered from this environment: §3, the PocketBase version.** The host is unreachable here. Items 4, 5, 6 and 14 are version-dependent, so they are specified as designs with the version-sensitive parts explicitly marked rather than written as final code.

---

## 1. Corrected legacy dirty-state description

**My v1 claim was wrong. The Product Architect is right.** The legacy flag *is* read — a migration IIFE at `index.html` line **5326**:

```js
var legacyDirty=false;try{legacyDirty=localStorage.getItem(DIRTY_KEY)==="1";}catch(e){}
a.core={local:legacyDirty?1:0,attempted:0,success:0};
a.training={local:legacyDirty?1:0,attempted:0,success:0};
```

I grepped `revAll()`, saw its `{}` default, and concluded no migration existed. I did not look further. The corrected statement, now used everywhere:

> The legacy dirty flag is read, but only exact `"1"` is preserved as dirty. Missing, unknown, malformed, or previously incorrectly cleared state is treated as clean, which is unsafe.

Two additions:

- The prior in-flight bug (Fix 3) could already have cleared the flag while edits were pending, so a `"0"` is **not** evidence of a clean device.
- The IIFE's own comment says *"an unknown state is treated as dirty, because the failure mode of 'wrongly clean' is data loss."* **The code does the opposite of its comment.** The comment is corrected alongside the code, so the next reader is not misled the way I was.

**Correction applied (documentation, done):** `REMEDIATION_PLAN.md` §1.9 and §2, `STATUS.md`, `DECISIONS.md` (ADR-013), `CHANGELOG.md`.
**Correction applied (code, Commit 1 — done):** the source comment at the original migration now states what the code actually does and points at the corrective re-migration. The M4 assertions that encoded the unsafe branches are inverted. The no-baseline canonical comparison is implemented.

---

## 2. Emergency hotfix design

Narrow, client-only, shippable before CAS. **Goal: stop live data loss. Nothing else.** Reduced automatic sync is accepted; silent loss is not.

**Removed:** the `dirty && !localData → adopt` branch. `syncDecide()` becomes:

```
!serverHas && !localDirty                → "idle"
!serverHas && localDirty                 → "hold-seed"    ← NOT an automatic POST
!localDirty                              → serverDiffers ? "adopt" : "agree"
localDirty && no trusted baseline        → canonical compare:
        byte-identical → "agree"    (establish baseline silently)
        otherwise      → "conflict" (includes "cannot compare")
localDirty && baseline trusted && server === baseline → "hold-push"  ← NOT an automatic PATCH
localDirty && server moved               → "conflict"
```

**`hold-push` / `hold-seed` never write.** They set a visible pending state. Before server CAS exists there is **no automatic whole-snapshot write of any kind** — a fingerprint match cannot prevent a concurrent write landing after our read, and duplicate rows cannot be prevented without the unique index. This removes the contradiction the Architect identified between the old `push` branch and "no auto-upload without CAS".

**SUPERSEDED by the Commit 1 review:** the four-condition user-confirmed upload was rejected — *"a user-confirmed blind overwrite is still last-writer-wins; confirmation changes intent, not concurrency safety."* Before CAS, **replacing a non-empty canonical server snapshot is not possible at all.** Identical content may mark agreed; everything else holds pending with an honest explanation and a **file export** so device-failure risk stays visible and manageable. Every backend write is gated shut at `pbSave` itself, so call sites the hardening never names cannot write either.

Comparison is **exact canonical equality** (recursive key-sorted serialization), never the 32-bit fingerprint. SHA-256 arrives in Commit 8.

`localData` is never permission to overwrite; dirty ⇒ `adopt` is unreachable on every path (boot, login, **pull-to-refresh**).

**`coreHasMeaningfulState()`** replaces `localHasData()` for empty-detection only, and covers **every** field in `payload()`: `settings` (beyond defaults), `weights`, `food`, `workouts`, `steps`, `notes`, `sleep`, `bodyfat`, `waist`, `statuses`, `presets` (beyond defaults), `skips`, `glp` (compounds/doses/symptoms), `weeklySummary`, `nightlySummary`, `nightlyLog`, `scriptVer`.

**Also in the hotfix** (each closes a live loss path):
- **Fail-closed** on every still-enabled destructive caller — an unverified snapshot can never precede a wipe or replacement.
- **Line-5326 migration:** unknown / malformed / absent ⇒ **dirty**, and the misleading comment corrected with it.
- **Keep-local overwrite preserves the remote side first**, or is disabled. No wording may promise "the online version was saved" unless the write actually succeeded.
- **Minimal cross-account guard.** Commit 1 ships ahead of the full account scoping (Commit 4), so it must already prevent a newly authenticated user adopting, seeding, pushing or rendering a *previous* user's retained unscoped state. Identity is compared against owner metadata **recorded while authenticated** — never an unverified cached `pbCfg().uid`. On mismatch the legacy state is held for Commit 4 migration/export, not used.
  *Honest limitation:* installs upgrading from before this build have no recorded owner, so the guard becomes effective from their first verified authenticated session; it cannot retroactively attribute pre-upgrade data.

**Accepted trade-off:** automatic upward sync pauses until CAS lands. The Architect explicitly accepted reduced automation over silent loss. The pending state is made visible so a user is never misled into thinking data is backed up when it is not.

**Approved minimum scope (Architect §6):** (1) no dirty adoption on pull/boot/login; (2) no automatic dirty push or seed before CAS; (3) exact canonical no-baseline equality; (4) complete `coreHasMeaningfulState()` for empty-detection only; (5) unknown/absent legacy dirty ⇒ dirty; (6) correct the misleading source comment; (7) fail closed before any still-enabled destructive replacement; (8) keep-local overwrite disabled unless the remote side is genuinely preserved; (9) minimal verified-account mismatch guard; (10) regression tests + staging browser validation.

**Ships with:** pull-to-refresh, GLP-only, note-only, settings-only, delete-all, no-baseline-equal, no-baseline-divergent, no-auto-push and no-auto-seed regression tests, plus a **browser test on staging**. Code may be written now; **it cannot ship on test-pass alone.**

---

## 3. PocketBase version — DISCOVERED: v0.39.8

Confirmed by the Product Owner from the Admin UI footer (screenshot, 2026-07-25). Also confirmed from the same screenshot: collections are exactly `users`, `appdata`, `photos`, and there are **2 users total** — the duplicate-row migration is trivial at this scale.

v0.39.8 is the modern (≥0.23) API generation: `routerAdd` with a `RequestEvent` handler (`e.auth`, `e.requestInfo()`, `e.json(status, body)`), transactions via `$app.runInTransaction(txApp => …)` — verified against the live JSVM reference ([routerAdd](https://pocketbase.io/jsvm/functions/routerAdd.html), [core.RequestEvent](https://pocketbase.io/jsvm/interfaces/core.RequestEvent.html), [js-routing docs](https://pocketbase.io/docs/js-routing/)). The deployment includes a load-confirmation log line and a smoke test as the final guard against any residual API drift.

**Deliverables now written** (`server/`): `pb_hooks/cf_cas.pb.js` (CAS route + idempotency ledger + compatibility revision bridge), `DEPLOYMENT.md` (backup → staging → duplicate check → schema → hook → tests → cutover → lockdown, with rollback), and `tests/cas-server-tests.sh` (automated integration tests runnable from the operator's machine).

**What changes with the answer:**

| Version | Impact |
|---|---|
| ≥ 0.23 | JSVM hooks use `onRecordUpdateRequest` / `routerAdd`; `$app.runInTransaction(txApp => …)` — the design below applies as written |
| 0.20 – 0.22 | Hook names are `onRecordBeforeUpdateRequest`, router registration differs, transaction API is `$app.dao()`-based — same design, different bindings |
| < 0.20 | `pb_hooks` may be absent entirely ⇒ requires a Go build or an external proxy. **I would report this before implementing and propose the smallest safe alternative,** per the brief. |

Everything in §4–§6 and §14 is written as a **design**; the version-sensitive bindings are marked `‹version-dependent›` and will be finalised once you supply the version.

---

## 4. Transactional CAS route design

`pb_hooks/cf_cas.pb.js` ‹version-dependent bindings›

```
POST /api/cf/appdata/commit
Request:  { subsystem, expectedRev, payload, clientBuild, deviceId, idempotencyKey }
Success:  200 { ok:true, subsystem, newRev }
Conflict: 409 { ok:false, conflict:true, subsystem, serverRev, payload }
Errors:   400 invalid | 401 unauthenticated | 413 too large | 500 internal
```

**Identity comes only from the authenticated request context.** Any `user`/`userId` in the body is ignored — never trusted.

Inside **one** transaction, using the transaction-scoped app context for every read and write:

1. Require authentication; derive `userId` from context.
2. Validate `subsystem ∈ {core, training}` — anything else 400.
3. Validate `expectedRev` is a non-negative integer.
4. Validate payload is a plain object and within the size cap — **to be measured, not guessed** (see below).
5. Find the user's single `appdata` row, or create it (see create race below).
6. Read `coreRev` or `trainingRev` per `subsystem`.
7. Compare with `expectedRev`.
8. **Match** → write *only* that subsystem's payload field, increment *only* that revision, save.
9. **Mismatch** → write nothing, return 409 with `serverRev` and the current payload for that subsystem.
10. Return the committed revision.

**Strict field isolation** (architect decision 1): a `core` commit touches `data` + `coreRev` only; a `training` commit touches `training` + `trainingRev` only. Neither reads-modifies-writes the other, so the shared row cannot cross-conflict.

**Create race:** the unique index on `user` is the arbiter. Both devices may attempt creation inside their transactions; one wins, the loser's insert violates the constraint and is caught → re-read inside the same transaction and either commit against the found row (if `expectedRev` matches) or return 409. Never a second row.

**Idempotency ledger** (not a "last key" — that fails when a later key supersedes it and a delayed retry of the earlier key arrives). A dedicated server-side collection, unique on `user + subsystem + idempotencyKey`, storing `requestHash`, `expectedRev`, `resultingRev`, `responseStatus`, `createdAt`, `expiresAt`. The ledger write and the data commit occur **in the same transaction**. Same key + same `requestHash` replays the original result; same key + different request is **rejected**; keys are required, length-limited and validated; retention is bounded by policy.

**Create semantics:** only `expectedRev = 0` may create a missing row. If no row exists and `expectedRev > 0`, return conflict/not-found — never silently create. A successful first commit returns revision **1**.

**Unique-failure handling:** do **not** assume a failed insert can continue inside the same transaction — that is not safe to assume for the deployed PocketBase/SQLite behaviour. Instead: abort the transaction, retry the whole operation through the existing-row path, and re-check `expectedRev`. Proven by the concurrent-create integration test against the exact deployed version.

**Validation** (all required): allowed `subsystem`; non-negative integer `expectedRev`; required, length-limited `idempotencyKey`; payload is a plain JSON object; payload byte size; `clientBuild`/`deviceId` length and format; and **no authoritative user field is read from the body**.

**Access control:** the idempotency ledger and `appdata_archive` are **server/admin-only**. They contain health data and must not be readable by ordinary clients.

---

## 5. Duplicate-row migration strategy

Runs **before** the unique index. Nothing divergent is discarded.

1. **Back up PocketBase** (full data dir + DB file). No migration step runs first.
2. **Enumerate** users with more than one `appdata` row.
3. **Archive every row, unconditionally**, into `appdata_archive` (a dedicated collection) capturing `originalRecordId`, `user`, `data`, `training`, `created`, `updated`, and all remaining metadata. Also written to an off-server export file.
4. **Verify** the archive count equals the source count before anything is modified.
5. **Select a canonical row** by a documented rule, applied in order:
   a. the row referenced by the most recent successful client sync, if determinable;
   b. otherwise the row with the most recent `updated`;
   c. **if the candidates differ at all, do not auto-merge** — mark the user `needs-manual-resolution`, leave the rows in place, and report them. **"Materially different" means canonical deep inequality of `data` or `training`** after stripping only PocketBase system metadata. Age, emptiness or an older `updated` timestamp are **not** grounds for calling a difference immaterial.
   d. "most recent successful client sync" is used **only where real server-side evidence exists**; otherwise the deterministic rule for *canonically identical* rows is: most recently `updated`, with record ID as tie-breaker.
6. **Never silently discard divergent content** — (5c) is the escape hatch and is expected to be used.
7. **Archive or remove** non-canonical rows for auto-resolved users only.
8. **Verify** exactly one row per user among resolved users.
9. **Create the unique index** on `appdata.user`.
10. **Verify** the constraint (attempt a duplicate insert; expect rejection).

**Unresolved divergent duplicates are a hard block.** They cannot be "excluded" from a global unique index — such an index is all-or-nothing. While any remain unresolved they block: creation of the unique index, activation of the CAS route in production, and the raw-write lockdown. They do **not** block client-only Commits 1–8. Archiving and analysis continue meanwhile. **Rollback:** restore the backup; the archive collection is additive and safe to leave.

---

## 6. Raw API lockdown and old-client cutover

This is a PWA — cached old clients **will** keep running and will keep issuing raw `PATCH`. Locking down before adoption would break them silently.

**Ordered cutover:**

| # | Step | Gate |
|---|---|---|
| 1 | Back up PocketBase | verified restore |
| 2 | Duplicate-row resolution (§5) | one row per user |
| 3 | Add `coreRev` / `trainingRev` (default 0) | schema verified |
| 4 | Add unique index on `user` | constraint verified |
| 5 | Add the commit route | server tests (§14) pass |
| 6 | Deploy the new client | build announced |
| 7 | Monitor adoption + successful commits | telemetry below |
| 8 | Publish a minimum supported build | policy recorded |
| 9 | **Disable raw create/update** on `appdata` | commit route is the only write path |
| 10 | Reject stale-client writes rather than accepting blind writes | old clients get a clear "update required" |

Step 9 rules — ordinary authenticated users get **no** create and **no** update via the standard collection API:

```
listRule/viewRule:  user = @request.auth.id
createRule:         null      // route only
updateRule:         null      // route only
deleteRule:         null
```

**Superusers bypass collection rules entirely** — documented separately as an operational note; admin tooling must go through the route or knowingly accept the bypass.

**Monitoring** (raw-PATCH-by-build alone is insufficient — legacy clients may send no build metadata): raw create/update by endpoint **and authenticated user**; raw writes lacking build metadata; CAS commit success / 409 / 4xx / 5xx; commit p95 and p99 latency; unique-constraint failures; duplicate-row count; idempotency replay and mismatch rates; conflict rate by subsystem; minimum-build adoption; legacy writes after the announced deadline.

**The open raw-PATCH window is not acceptable on monitoring alone** — and the reason is revision integrity, not just adoption: an old client can change `data` by raw PATCH **without incrementing `coreRev`**, after which a new client commits against an unchanged revision and silently overwrites that update. CAS cannot be trusted while untracked raw writes are possible.

**Preferred — compatibility revision bridge.** Before the new client deploys, install a server-side hook so that legacy standard writes stay visible to CAS: a raw update to `data` atomically increments `coreRev`; a raw update to `training` atomically increments `trainingRev`; a raw create initializes revisions safely; the commit route is **not** double-incremented by the hook; every legacy write is audit-stamped as raw/legacy. Old clients can still overwrite each other during the window, but new clients **detect** every legacy write.

**Fallback — immediate fail-closed lockdown.** If the bridge cannot be implemented and tested safely, disable raw create/update at the same production cutover as the new client. Old clients then fail synchronization rather than writing blind, preserve their local state, and receive an update-required error where possible.

**Hard deadline, not a telemetry gate:** recommended maximum transitional window **24–48 hours** after the CAS client is broadly available, subject to Product Owner approval.

---

## 7. Exact account-scoped storage keys

Adopting the architect's namespace verbatim:

```
cf:{userId}:core            cf:{userId}:sync:core        cf:{userId}:photoMap
cf:{userId}:training        cf:{userId}:sync:training    cf:{userId}:lastSync
cf:{userId}:workout                                      cf:{userId}:conflict
                                                         cf:{userId}:errors
cf:local:core   cf:local:training   cf:local:workout      (pre-auth / unclaimed)
cf:lastOwner    cf:accounts         cf:v                  (last owner; retained-namespace registry; schema version)
```

Sync record shape, per subsystem:

```js
cf:{userId}:sync:core = {
  localRevision, lastSuccessfulLocalRevision,
  lastServerRevision, agreedFingerprint       // SHA-256, canonical
}
```

Every persisted blob carries an integrity header:

```json
{ "_meta": { "ownerId": "USER_ID", "schemaVersion": 2 }, "data": { } }
```

A blob whose `_meta.ownerId` disagrees with the namespace it was loaded from is **not** loaded — it is quarantined and reported. Ownership is checked, not assumed.

**Ownership metadata only.** `cf:lastOwner` answers "whose data was last active here," never "who is authorized." A device accumulates **more than one** retained namespace over time, so `cf:accounts` is the registry; a single owner key is not an inventory. `storedOwnerId` and `authenticatedUserId` are tracked independently.

**Display rule (clarified).** *Account-scoped* data requires `storedOwnerId === authenticatedUserId`. Deliberately unclaimed `cf:local:*` data **may** be displayed in local-only mode to an unauthenticated user — the one intended exception, and it is not account data. Authentication still selects only `cf:{authenticatedUserId}:*`. Legacy and quarantined photo records are part of this inventory and are never adopted by namespace selection.

---

## 8. Account-state model

Eight explicit states. No behaviour is inferred from `cf:owner` alone.

| State | Loaded | Visible | May sync | May claim | Stays on device | On logout |
|---|---|---|---|---|---|---|
| **Fresh unauthenticated** | `cf:local:*` | local only | no | n/a | yes | n/a |
| **Authenticated owner, network unavailable / token unverified** | `cf:{uid}:*` | yes | queued, not failed | n/a | yes | normal flow |
| **Confirmed session expiry (privacy-locked)** | retained securely, **not** loaded into active state | **no account data** — generic reauth screen | no | n/a | yes | n/a |
| **Explicit logout** | none | none | no | n/a | per photo policy (§ below) | — |
| **Authenticated as retained owner** | `cf:{uid}:*` | yes | yes | n/a | yes | normal flow |
| **Authenticated as another owner** | `cf:{newUid}:*` only | new user only | new user only | never the old namespace | old namespace preserved, untouched | normal flow |
| **Legacy unclaimed local data** | quarantine index | not mixed into any account | no | only `legacyCandidateOwnerId` | yes | retained |
| **Migration failure** | quarantined source, read-only | recovery screen + **export/retry/diagnostics** | no | no | yes | blocked |
| **Unresolved conflict** | account namespace | yes, with conflict banner | blocked until resolved | n/a | yes | must resolve or explicitly defer |

**Offline ≠ expired.** A failed refresh with no network is *not* confirmed expiry: keep the session, load and display the owner's data, permit local edits, queue sync. Only a server-confirmed 401 privacy-locks the device — data retained but **not displayed**, behind *"Your data is safe on this device. Sign in to continue."* Same-account reauthentication unlocks it. Local-first data stays intact without being exposed to the next person holding a shared device.

**Conflict scope is per subsystem**, matching `SyncCoordinator`: a core conflict blocks core, a training conflict blocks training, a photo error blocks photo operations; independent clean subsystems continue once authentication and ownership are established. The UI may hold the whole app during initial login until core ownership settles, but the underlying state stays subsystem-specific.

**Migration failure retains export access.** The recovery screen can read the quarantined legacy source for export, retry and diagnostics — never loaded into active athlete state, but never unreachable either.

**Cross-account login** (B ≠ retained A) enforces all nine architect rules: A's core/training/photos are not displayed, not offered as B's device copy, not uploaded, not relabelled; A's namespace is preserved untouched; B's is loaded or created; B reconciles only against B's server state.

**Reset on every identity change:** cached `pbRecId`, fingerprints, revisions, sync status, pending conflicts, photo maps, photo sync generation, object URLs, detached photo views.

**`cf:local:*` is never auto-claimed.** After authentication it is offered as an explicit import. If the account already has server data, no immediate replace-server action is offered — the local copy is preserved as an importable previous copy requiring explicit reconciliation.

---

## 9. Async migration and `bootApp()` sequence

Execution order:

```
original definitions → PocketBase impl → hardening impl → storage migration → initialization
```

```js
runMigrationSafely()
  .then(bootApp)
  .catch(showMigrationRecoveryState);
```

`bootApp()` is **one-shot and idempotent** (guarded by a `booted` flag; a second call is a no-op).

**Nothing before `bootApp()` may:** render account data, read account photos, read unscoped IndexedDB photos, start synchronization, fetch authenticated account data, or create body-level photo views.

**Migration** (idempotent, gated on `cf:v`) — copy-not-move, as a *temporary* strategy with a bounded rollback window:

1. Detect legacy storage. 2. Determine the known owner from **either** a currently *validated* authenticated identity **or** owner metadata previously persisted *while authenticated*. **Never** from an unverified cached `pbCfg().uid` — a stale cached UID could misattribute one person's data to another. If neither is available → `cf:local:*` / quarantine.
3. Create an immutable recovery snapshot. 4. **Verify** it — failure aborts the migration.
5. Copy into the new namespace. 6. Verify data equality, `_meta.ownerId`, `schemaVersion`.
7. Mark the new schema active (`cf:v`). 8. **From that point, read and write only the new namespace** — no dual-read, no dual-write.
9. Retain legacy keys for a bounded rollback window. 10. Remove/archive after production verification.

Documented plainly: **legacy keys go stale the moment a new write lands.** They are a short-window rollback aid, not an indefinite safety net.

**On migration failure:** no fallback to legacy unscoped behaviour, no proceeding as if it succeeded — a safe recovery state with export and retry.

`refreshWeekPhotos()` is **rewritten** to go through the owner-scoped accessor and to check the render generation before calling `render()`. A regression test asserts no `idb()`, `render()`, or authenticated fetch is reachable before `bootApp()`.

---

## 10. Immutable photo context design

```js
PhotoSyncContext { ownerId, token, baseUrl, mapKey, generationId }
```

Captured once at operation entry and **passed explicitly** to every helper — no helper re-reads `pbUid()`/`pbTok()` after entry. Every continuation first checks:

```
authenticatedUserId === ctx.ownerId  &&  ctx.generationId === activePhotoGeneration
```

On failure, abort with **no** IndexedDB write, upload, download, delete, map save, deletion inference, or UI success state.

Downloaded records are constructed with `ownerId: ctx.ownerId` literally — never via a helper that reads global auth. Map API is `getPhotoMap(ownerId)` / `setPhotoMap(ownerId, map)`.

**Map reconstruction** — after a *complete* account-scoped listing, for every server photo with a `localId`: `map[localId] = serverRecordId`, **including photos that already exist locally** (the v1 gap), written before any deletion reconciliation, and only for the captured context's account.

**Pagination completeness** requires all eight conditions: every page succeeded; auth unchanged; generation active; stable sort with a unique tiebreaker (`created,id`); dedup by record ID; duplicate `localId` detection; unique count matches `totalItems`; pagination metadata consistent. Any instability ⇒ listing incomplete ⇒ **deletion inference disabled**.

**`closeAllPhotoViews()`** removes body-level lightboxes and detached overlays, revokes local *and* global object URLs, clears photo caches and maps, and invalidates both render and sync generations. Called on session expiry, explicit logout, account change, login as another user, and before rendering a newly authenticated account.

---

## 11. Recovery Service contract

```js
createRecoverySnapshot({
  accountId, reason, source,           // source: 'local' | 'server' — which side this preserves
  core, training,
  localCoreRevision, localTrainingRevision,
  serverCoreRevision, serverTrainingRevision,
  appBuild, createdAt
}) -> Promise<{ok:true, id} | {ok:false, error}>
```

Deep-clones input **synchronously at entry** (no live `state` reference held across the IDB await). Stores **the actual losing side**. Verifies the write. **Fails closed** — no destructive action continues after a snapshot failure.

- **Keep device:** preserve fetched *server* state → confirm write → CAS commit local → 409 returns to conflict → complete only after a successful commit.
- **Use online:** preserve current *local* state → confirm write → adopt server → update local revision and agreed server revision → complete.
- **Cancel:** modify neither side; local stays dirty; conflict context persisted for later resolution.

Athlete-facing wording ("Previous copies", "Restore an earlier copy", "Saved before replacing your data"); "recovery snapshot" is reserved for diagnostics and docs.

---

## 12. SyncCoordinator contract

Moved earlier in the sequence, per the amendment (now commit 5).

```js
SyncCoordinator.syncAllPending({core:true, training:true, photos:true})
  -> Promise<{core:Result, training:Result, photos:Result}>

Result = 'success' | 'clean' | 'pending' | 'conflict' | 'failed' | 'unauthorized' | 'cancelled'
```

Subsystems progress independently; the aggregate never reports success unless every *selected* subsystem did. **No timers anywhere in the completion path.**

- **Login:** reconciles only the authenticated account's namespace; training is **never** unconditionally pulled while dirty.
- **Logout:** "Upload, then log out" proceeds only after every required dirty subsystem reports success. Any failure ⇒ stay signed in, preserve local data, name the failed subsystem, offer retry. A separate recovery-and-logout action exists only after recovery storage succeeds.
- **Login conflict continuations:** explicit `onKeepLocal` / `onUseServer` / `onCancel`. Keep-local preserves remote → CAS commit → login completes → training and photo sync start. Use-server preserves local → adopt → login completes → training and photo sync start. Cancel either signs the user back out or renders a dedicated unresolved-conflict screen — **never a valid session behind an obsolete login form.**
- **Status UI:** per-subsystem ("Core synced · Training 2 pending · Photos synced") behind a compact indicator opening the **Data Safety** section (default: status, last successful sync, pending changes, retry; advanced: previous copies, restore, replace device, remove local photos, legacy quarantine, diagnostics).

---

## 13. Amended commit sequence

Adopting the architect's eleven commits exactly. Each is small, reviewable, tested, and carries no unrelated refactors.

| # | Commit | Blocked by |
|---|---|---|
| 1 | **Emergency non-destructive reconciliation** — remove dirty adoption; no-baseline comparison; safe dirty pull/boot/login | — |
| 2 | **Recovery Service** — explicit inputs, deep clone, losing-side preservation, fail-closed | — |
| 3 | **Startup deferral** — `bootApp()`, await migration, no unsafe first paint, scoped `refreshWeekPhotos()` | — |
| 4 | **Account-scoped storage** — core, training, revisions, baselines, lastSync, conflict, recovery ownership, photo maps | — |
| 5 | **SyncCoordinator** — remove logout timer, coordinate subsystems, no dirty-training login pull, subsystem results | 4 |
| 6 | **Photo account context** — immutable context, generations, detached-view cleanup, explicit downloaded owner | 4 |
| 7 | **Photo map and pagination** — rebuild, stable sort, dedup, complete-list proof, safe deletion inference | 6 |
| 8 | **Canonical SHA-256** — canonical serialization, async reconciliation, account/subsystem scoping | 4 |
| 9 | **PocketBase migration** — backup, duplicate preservation, consolidation, unique index, revs, route, lockdown prep | **§3 version** |
| 10 | **Client CAS wiring** — route integration, 409 handling, conflict state, server revision persistence, idempotent retries | 9 |
| 11 | **UX and documentation** — athlete wording, Data Safety section, ADR corrections, status/changelog | 1–10 |

Commit 1 ships as the **emergency hotfix** after browser validation, ahead of the rest. Commits **1–8 can begin** (client-only). **Commit 11 is not unblocked** — documentation may be drafted, but final UX and docs cannot complete until 9–10 resolve. **9–10 need §3.** Commit 1 may be *coded* now but **cannot ship** until its updated tests and the staging browser checklist pass.

---

## 14. Server integration-test plan

Run against the **actually deployed** PocketBase version on staging ‹version-dependent›. All fifteen required cases:

| # | Test | Expected |
|---|---|---|
| 1 | Two concurrent commits, same `expectedRev` | exactly one 200 |
| 2 | The other of the pair | 409 + current `serverRev` |
| 3 | Concurrent first-row creation | one row total |
| 4 | Unique-index enforcement | duplicate insert rejected |
| 5 | Unauthenticated request | 401, no write |
| 6 | Authenticated user targeting another user's data | 403/404, no write |
| 7 | Raw PATCH after lockdown | rejected |
| 8 | Invalid `subsystem` | 400, no write |
| 9 | Invalid/negative/non-integer `expectedRev` | 400, no write |
| 10 | Oversized payload | 413, no write |
| 11 | Forced mid-transaction error | full rollback, revision unchanged |
| 12 | Duplicate-row migration on seeded duplicates | all rows archived, one canonical, divergent → manual |
| 13 | Idempotent retry (same key) | original result, revision not double-incremented |
| 14 | Core commit | `training` and `trainingRev` unchanged |
| 15 | Training commit | `data` and `coreRev` unchanged |

**Baseline vs. requirement.** The existing 60 tests are **baseline tests against the current, unremediated shipping source**, and `03-test-output.txt` is labelled as such. They are *not* validation of this plan — one of them (`m4-reconciliation.test.js`) currently asserts the unsafe `dirty + !localHasData → adopt` branch. Commit 1 **inverts** that assertion and adds: dirty delete-all, dirty GLP-only, dirty settings-only, no-baseline exact equality, no-baseline divergence, no automatic push before CAS, no automatic seed before safe create.

**Client tests** cover every case in the authorization brief (reconciliation, account boundaries, photos, revisions/CAS, login/logout) via a Node simulation harness: in-memory `localStorage`, IndexedDB stub, and a **mock PocketBase implementing the commit route** (revisions, 409s, injectable pagination instability, 401/403/500, latency, interruption), plus a two-device simulator for races and account switches.

**Reproducible test package** (architect complaint, valid): `tests/harness.js` and `run-all.js` resolve `path.join(__dirname,'..','index.html')`, which my archive layout broke by putting the source under `full-source/`. Fix: resolve the source via `CF_SRC` env var → `../index.html` → `./index.html` → `../full-source/index.html`, and ship the archive so `node tests/run-all.js` runs against the included source with no edits. No test output will be supplied that cannot be reproduced from the archive.

**Staging validation** is mandatory before any production request: two accounts, two profiles/devices, offline, throttling, forced expiry, IDB inspection, 501+ photo fixture, delayed requests, failed recovery storage, concurrent commits, old cached client. Recorded as: test · expected · actual · browser/device · client build · PocketBase version · pass/fail · notes.

---

## 15. Deployment constraints that prevent full CAS

1. **PocketBase version unknown and undiscoverable from here** (§3) — proxy denies the Tailscale host. **Blocks commits 9–10.** Needs one command from you.
2. **Server filesystem access required.** `pb_hooks/cf_cas.pb.js`, the schema change, and the index need access to the host plus a restart. Not reachable from this environment; someone with access must deploy.
3. **CAS is inherently not client-only.** The "one self-contained `index.html`" rule still holds for the client artifact, but this remediation cannot be completed inside it. That constraint is unchanged and I am not proposing to break it — only noting the scope boundary.
4. **No staging PocketBase reachable.** I can write the browser checklist and the 501-photo fixture generator; I cannot execute them. DoD #17 and #18 require your machine.
5. **Cutover window (§6 steps 6–9)** leaves raw PATCH open until old-client traffic drains. Bounded and monitored, but real.
6. **`crypto.subtle` needs a secure context.** Fine over HTTPS/Tailscale. If ever served over plain HTTP, the SHA-256 path is unavailable — the client then relies on **server revisions**, preserves local conservatively, and must **not** treat the 32-bit hash as proof of equality.
7. **Fail-closed recovery changes a failure mode:** with storage full, destructive actions are now *blocked* rather than proceeding silently. Correct, and worth stating.
8. **Post-cutover conflict burst** — first-run devices without baselines. The no-baseline canonical comparison keeps identical devices silent; genuinely divergent ones prompt, which is intended.

---

## What I need to start

**Unblocked now:** commits **1–8** (client-only). Commit 11 depends on 9–10 and can only be drafted. Starting with Commit 1 — coded now, shipped only after staging validation.

**Blocking:**
1. **PocketBase version** (§3) — one command, blocks commits 9–10.
2. **Who deploys the server changes** (§15.2) and when the cutover window opens.
3. **Staging access**, or your confirmation that you will run the browser checklists (§15.4).
4. **Approve the measured payload cap** when the measurement report lands (§4) — Commit 9 prep measures current max, p95, near-term growth and proxy/server limits, then proposes a cap with headroom. Not a guessed number.
