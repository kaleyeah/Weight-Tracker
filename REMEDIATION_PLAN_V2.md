# M1–M4 Remediation — Authorized Implementation Plan (v2)

**Last Updated:** 2026-07-25

**Status:** Proposed — response to *Implementation Authorization: Remediation Plan Amendments*

> Supersedes `REMEDIATION_PLAN.md` (v1). Every amendment is incorporated. **No application code has been changed.** This answers the fifteen items required before coding.
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

**Correction applied to:** `REMEDIATION_PLAN.md` §1.9 and §2, `STATUS.md`, `DECISIONS.md` (ADR-013), `CHANGELOG.md`, the M3 test descriptions, and the source comment at line 5325. The no-baseline canonical comparison remains required regardless.

---

## 2. Emergency hotfix design

Narrow, client-only, shippable before CAS. **Goal: stop live data loss. Nothing else.** Reduced automatic sync is accepted; silent loss is not.

**Removed:** the `dirty && !localData → adopt` branch. `syncDecide()` becomes:

```
!serverHas          → localMeaningful ? "seed" : "idle"
!localDirty         → serverDiffers ? "adopt" : "agree"
localDirty && baseline trusted && serverFp === baseline → "push"
localDirty && no trusted baseline → compare canonical content:
        identical  → "agree"        (establish baseline silently)
        different  → "conflict"
        uncertain  → "conflict"     (preserve local)
localDirty && server moved → "conflict"
```

`localData` is never permission to overwrite; dirty ⇒ `adopt` is unreachable on every path (boot, login, **pull-to-refresh**).

**`coreHasMeaningfulState()`** replaces `localHasData()` for empty-detection only, and covers **every** field in `payload()`: `settings` (beyond defaults), `weights`, `food`, `workouts`, `steps`, `notes`, `sleep`, `bodyfat`, `waist`, `statuses`, `presets` (beyond defaults), `skips`, `glp` (compounds/doses/symptoms), `weeklySummary`, `nightlySummary`, `nightlyLog`, `scriptVer`.

**Also in the hotfix** (small, and each closes a live loss path):
- Fix 4 fail-closed on the three destructive callers — an unverified snapshot cannot precede a wipe.
- The line-5326 migration: unknown/malformed/absent ⇒ **dirty**, matching its comment.
- No whole-snapshot auto-upload without CAS: `seed`/`push` from a dirty state require either a trusted baseline or explicit user action; otherwise the app holds in a pending-reconciliation state.

**Ships with:** the pull-to-refresh, GLP-only, note-only, settings-only and delete-all regression tests, plus a **browser test on staging** (architect DoD #17). Not shipped on test-pass alone.

---

## 3. PocketBase version — NOT DISCOVERED (blocking items 4, 5, 6, 14)

**I could not retrieve it.** `https://rack.tail6fa16c.ts.net/api/health` fails from this environment:

```
curl: (56) CONNECT tunnel failed, response 403
```

The host is on your Tailscale network and the agent proxy denies it by policy. This is not a transient error and I cannot work around it. **I will not guess** — the brief forbids it, and guessing wrong produces hooks that fail to load on deploy.

**Please run one of these and paste the output:**

```bash
curl -s https://rack.tail6fa16c.ts.net/api/health
# or, on the server:
./pocketbase --version
```

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
4. Validate payload is an object and within the size cap (proposed **2 MB**; confirm against your row sizes).
5. Find the user's single `appdata` row, or create it (see create race below).
6. Read `coreRev` or `trainingRev` per `subsystem`.
7. Compare with `expectedRev`.
8. **Match** → write *only* that subsystem's payload field, increment *only* that revision, save.
9. **Mismatch** → write nothing, return 409 with `serverRev` and the current payload for that subsystem.
10. Return the committed revision.

**Strict field isolation** (architect decision 1): a `core` commit touches `data` + `coreRev` only; a `training` commit touches `training` + `trainingRev` only. Neither reads-modifies-writes the other, so the shared row cannot cross-conflict.

**Create race:** the unique index on `user` is the arbiter. Both devices may attempt creation inside their transactions; one wins, the loser's insert violates the constraint and is caught → re-read inside the same transaction and either commit against the found row (if `expectedRev` matches) or return 409. Never a second row.

**Idempotency:** `idempotencyKey` is stored with the last commit per subsystem. A repeat of the same key returns the original result rather than re-incrementing, so network retries can't double-advance a revision.

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
   c. **if the candidates' `data`/`training` differ materially, do not auto-merge** — mark the user `needs-manual-resolution`, leave the rows in place, exclude that user from the index step, and report them.
6. **Never silently discard divergent content** — (5c) is the escape hatch and is expected to be used.
7. **Archive or remove** non-canonical rows for auto-resolved users only.
8. **Verify** exactly one row per user among resolved users.
9. **Create the unique index** on `appdata.user`.
10. **Verify** the constraint (attempt a duplicate insert; expect rejection).

If any user remains unresolved, the index is created only after they are resolved by hand. **Rollback:** restore the backup; the archive collection is additive and safe to leave.

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

**Monitoring before step 9:** commit-route success/409 rates, raw-PATCH attempts by build, failed commits, old-client traffic share. Step 9 proceeds only when raw-PATCH traffic is effectively zero.

**Between steps 6 and 9 the raw path is open** — that is a deliberate, time-boxed window, not defence in depth, and it closes at step 9.

---

## 7. Exact account-scoped storage keys

Adopting the architect's namespace verbatim:

```
cf:{userId}:core            cf:{userId}:sync:core        cf:{userId}:photoMap
cf:{userId}:training        cf:{userId}:sync:training    cf:{userId}:lastSync
cf:{userId}:workout                                      cf:{userId}:conflict
                                                         cf:{userId}:errors
cf:local:core   cf:local:training          (pre-auth / unclaimed)
cf:owner        cf:v                       (ownership metadata; schema version)
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

**`cf:owner` is ownership metadata only.** It answers "whose data is retained here," never "who is authorized." `storedOwnerId` and `authenticatedUserId` are tracked independently, and **nothing is displayed or synchronized unless they match.**

---

## 8. Account-state model

Eight explicit states. No behaviour is inferred from `cf:owner` alone.

| State | Loaded | Visible | May sync | May claim | Stays on device | On logout |
|---|---|---|---|---|---|---|
| **Fresh unauthenticated** | `cf:local:*` | local only | no | n/a | yes | n/a |
| **Session expired, owner retained** | `cf:{owner}:*` | yes (read-only banner) | no — reauth required | n/a | yes | n/a |
| **Explicit logout** | none | none | no | n/a | per photo policy (§ below) | — |
| **Authenticated as retained owner** | `cf:{uid}:*` | yes | yes | n/a | yes | normal flow |
| **Authenticated as another owner** | `cf:{newUid}:*` only | new user only | new user only | never the old namespace | old namespace preserved, untouched | normal flow |
| **Legacy unclaimed local data** | quarantine index | not mixed into any account | no | only `legacyCandidateOwnerId` | yes | retained |
| **Migration failure** | nothing | recovery screen | no | no | yes | blocked |
| **Unresolved conflict** | account namespace | yes, with conflict banner | blocked until resolved | n/a | yes | must resolve or explicitly defer |

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

1. Detect legacy storage. 2. Determine the known owner (from `cf:owner`, else a live `pbCfg().uid`, else none → `cf:local:*` / quarantine).
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

Commit 1 ships as the **emergency hotfix** after browser validation, ahead of the rest. Commits 1–8 and 11 are client-only. **9–10 need §3.**

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

**Unblocked now:** commits 1–8 and 11 (client-only). I can begin with the emergency hotfix immediately on your go-ahead.

**Blocking:**
1. **PocketBase version** (§3) — one command, blocks commits 9–10.
2. **Who deploys the server changes** (§15.2) and when the cutover window opens.
3. **Staging access**, or your confirmation that you will run the browser checklists (§15.4).
4. **Payload size cap** confirmation (§4, proposed 2 MB).
