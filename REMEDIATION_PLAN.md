# M1–M4 Remediation — Implementation Plan (for review before coding)

**Last Updated:** 2026-07-25

**Status:** Proposed — awaiting Product Owner / Product Architect approval

> Required response to the *Milestones 1–4 Hardening Review* remediation brief. **No code has been changed.** This answers the ten items the brief requires before editing, in order.
>
> **Verdict up front: I accept the review in full.** I verified all twelve findings against the shipping source; every one reproduces. Two items are worse than described (§1.1, §1.9), and I found one hazard the review did not list (§1.13, duplicate `appdata` rows). One required fix — Fix 2, compare-and-swap — **cannot be delivered client-side at all** and needs PocketBase server work I cannot perform from this environment (§10).

---

## 1. Interpretation of each blocker

Each entry: what the defect actually is, verified at the cited line in `index.html`, and what "fixed" means.

### 1.1 Fix 1 — the `dirty && !localData → adopt` branch
`syncDecide()` (line **5412**) contains `if(!localData) return "adopt";`. `localData` comes from `localHasData()` (line **1225**), which tests only `weights`, `food`, `workouts`, and `settings.startingWeight`.

A user whose only unsynced change is a GLP-1 dose, symptom, note, step count, sleep entry, body-fat/waist reading, status, skip, preset, or settings change is reported as having *no local data* — and their dirty state is silently overwritten by the server.

**Worse than the review states:** this is not only a login/boot path. `cloudPull()` (line **5529**) shares the same predicate, so ordinary **pull-to-refresh** (line ~5015 touch handler) hits it too. A user who logs a dose and swipes down to refresh can lose it. This is the single most likely defect to fire in production today.

*Fixed means:* dirty ⇒ automatic adoption is unreachable. `localHasData()` is never permission to overwrite.

### 1.2 Fix 2 — no server-enforced CAS
`pbSave()` (line **4478**) issues an unconditional `PATCH`. Two devices sharing baseline X both pass the fingerprint check (each sees `serverFp === lastAgreedFp`), both `push`, and the second silently overwrites the first. The fingerprint is a *local* belief about a *remote* row; it cannot make a later write atomic.

*Fixed means:* the server rejects a write whose expected revision no longer matches, and the client treats that rejection as a conflict.

### 1.3 Fix 3 — conflict preserves the winner, not the loser
`syncEnterConflict()` (line **5507**), keep-local branch: `recSnapshot("keep-local-over-server", …)`. `recSnapshot()` (line **5440**) captures `core: payload()` — the **local** state. On keep-local the local copy wins *and* is the only thing snapshotted; the remote copy, the side actually destroyed, is never saved. The overlay's promise that "the other one is saved to recovery first" is true for use-server and false for keep-local.

*Fixed means:* the losing side is captured, from explicitly supplied state, before either side wins.

### 1.4 Fix 4 — recovery failures don't stop destruction
`recSnapshot()` reports success via `cb(true|false)`. Every caller ignores it:
- `applyCloudSafe()` (line **5490**): `if(needSnap) recSnapshot(reason, go); else go();` — `go` runs on failure.
- `syncEnterConflict()` keep-local: `recSnapshot(…, function(){cloudPush(true);})`.
- `pbLogout()` (line **5567**): `recSnapshot("before-logout", function(){pbForceLogout();location.reload();})` — **wipes the device even if the snapshot failed.**

*Fixed means:* destructive paths fail closed on unverified recovery.

### 1.5 Fix 5 — only photos are account-scoped
`KEY="wl_v1"`, `TKEY`, `WOKEY`, `REV_KEY`, and the baseline fingerprint (inside `revAll().serverFp`) are all device-global. Only the photo map is scoped (`phMapKey()`, line **5047**).

Critically, `pbClearSession()` (line **4443**) keeps `base`/`remember`/`email` but **drops `uid`**. After expiry the retained `wl_v1` blob has no owner. User B logs in, `isDirty()` is true from A's ledger, `localHasData()` sees A's weights — and A's data is offered as B's "device copy" and pushed into B's account.

*Fixed means:* every persisted domain carries an owner; a different account can never see, upload, or relabel another's data.

### 1.6 Fix 6 — photo sync reads identity late
`phOwner()` (line **5046**) returns `pbUid()` — read live. `photoSync()` (line **5226**) calls it inside `.then()` continuations, and `idbAdd`/`idbAll`/`idbByDate`/`setPbPhotoMap` all re-resolve the owner at call time. An operation begun as A and completing after a switch finishes as B: downloaded blobs get stamped `ownerId: B`, and the map write lands in B's namespace.

*Fixed means:* owner, token, base URL, map key and generation are captured once at entry and are immutable for the operation's lifetime.

### 1.7 Fix 7 — the map is never rebuilt for already-matched photos
In `photoSync()`, `map[…]` is assigned only on upload (line ~5249) and download (line ~5260). A photo present **both** locally and remotely is excluded from `ups` (already in `byLocalId`) and from `missing` — so after the legacy map is discarded its entry is never restored. It stays permanently unmapped; deletion can't find its remote record.

*Fixed means:* the map is rebuilt from the complete authenticated listing before any deletion reconciliation.

### 1.8 Fix 8 — page-number pagination over a moving set
`pbPhotoListAll()` (line **5206**) walks `page=1..n`; `phPagesComplete()` (line **5198**) compares `collected.length` to `totalItems`. Raw length, no dedup, no stable sort. An insert between page fetches shifts records: one is returned twice and another skipped, `length` still equals `totalItems`, enumeration is declared complete, and the skipped photo is inferred deleted.

*Fixed means:* completeness is proven by unique-ID count under a stable total order, and anything anomalous marks the listing incomplete.

### 1.9 Fix 9 — absent legacy flag migrates as clean
`revAll()` (line **5309**) returns `{}` when `wl_rev` is missing; `revTrack()` defaults every counter to `0`; `revIsDirty()` is `0 > 0` → **false**. So every existing install upgrades as *clean* regardless of the legacy `wl_dirty` value.

**Worse than the review states:** the review says non-`"1"` values migrate clean. In fact `wl_dirty` is **never read at all** by the hardening block — there is no migration path, only a default. An install carrying genuinely unsynced data upgrades to "clean" and can be adopted over on the first boot.

*Fixed means:* absence of a trusted baseline triggers content comparison, never an assumption of cleanliness.

### 1.10 Fix 10 — init runs before the overrides
The original init (line **4983**: `load(); loadTraining(); … refreshWeekPhotos(); …`) executes at parse time, ~40 lines *above* the hardening block (line 5022+). Every unsafe implementation is live during first paint.

`refreshWeekPhotos()` (line **1903**) is the concrete leak: it opens `idb()` and cursors the `photos` store **directly**, bypassing the scoped `idbAll`/`idbByDate` overrides entirely. My M1 boot fix-up re-called it — which re-runs the *same unsafe function*. The review is right that this is not a fix.

*Fixed means:* nothing user-visible or storage-touching runs before the overrides are installed.

### 1.11 Fix 11 — detached photo views survive transitions
`openLightbox()` appends to `document.body`; its object URLs are not all tracked in `photoURLs`. A lightbox open across expiry/logout/switch keeps rendering A's image over B's session.

*Fixed means:* one operation tears down every detached photo view, revokes URLs, and invalidates the render generation.

### 1.12 Fix 12 — training and logout
- **Login:** `pbDoLogin()`'s `finish()` (line **5605**) calls `trainingPull()` unconditionally. `autoSync()` guards it with `if(!revIsDirty("training"))`; login does not. A dirty routine is pulled over on same-account reauth.
- **Logout:** `pbLogout()` uses `setTimeout(…, 1600)` then `if(!isDirty()) wipe()`. `isDirty()` is **core only**. Training-dirty or photo-pending state passes the check and is wiped. A slow upload also wipes on the timer.

*Fixed means:* a coordinator awaits explicit per-subsystem results; no timers, no core-only checks.

### 1.13 Additional hazard — duplicate `appdata` rows *(not in the review)*
`pbSave()` POSTs a new record when `pbRecId` is null and `pbGetRecord()` found none. Nothing enforces one row per user. Two devices coming online together can both create one; `pbGetRecord()` then does `perPage=1` and takes `items[0]` — nondeterministically. Devices can silently sync against **different rows**, which looks exactly like random data loss.

*Fixed means:* a unique index on `appdata.user`, and the create path handles the uniqueness rejection by re-reading.

---

## 2. Exact unsafe call sites

| # | Site | Line | Defect |
|---|---|---|---|
| 1 | `syncDecide()` `if(!localData) return "adopt"` | 5412 | Fix 1 — silent adoption |
| 2 | `localHasData()` | 1225 | Fix 1 — incomplete predicate |
| 3 | `autoSync()` → `syncDecide` | 5521 | Fix 1 — boot |
| 4 | `cloudPull()` → `syncDecide` | 5535 | Fix 1 — **pull-to-refresh** |
| 5 | `pbDoLogin()` → `syncDecide` | 5615 | Fix 1 — login |
| 6 | `pbSave()` unconditional PATCH | 4478 | Fix 2 — no CAS |
| 7 | `pbSave()` POST create path | 4489 | §1.13 — duplicate rows |
| 8 | `syncEnterConflict()` keep-local snapshot | 5508 | Fix 3 — saves winner |
| 9 | `applyCloudSafe()` ignores snapshot result | 5490 | Fix 4 — fail-open |
| 10 | `pbLogout()` wipe-after-snapshot | 5567 | Fix 4 — wipes on failure |
| 11 | `recRestore()` pre-snapshot ignored | 5455 | Fix 4 — fail-open |
| 12 | `KEY` / `TKEY` / `WOKEY` / `REV_KEY` / `serverFp` | 911, 5307, 5466 | Fix 5 — device-global |
| 13 | `pbClearSession()` drops `uid` | 4443 | Fix 5 — data loses its owner |
| 14 | `phOwner()` inside async continuations | 5046 | Fix 6 — late identity |
| 15 | `photoSync()` continuations | 5226–5287 | Fix 6 — mid-flight switch |
| 16 | `pbPhotoUpload` / `Delete` / `FetchBlob` / `pbFileToken` | 4747–4785 | Fix 6 — live token/uid |
| 17 | `photoSync()` map assignment | 5249, 5260 | Fix 7 — no rebuild |
| 18 | `pbPhotoListAll()` / `phPagesComplete()` | 5198, 5206 | Fix 8 — unstable pagination |
| 19 | `revAll()` default `{}` | 5309 | Fix 9 — false clean |
| 20 | init block | 4983 | Fix 10 — pre-override |
| 21 | `refreshWeekPhotos()` direct IDB | 1903 | Fix 10 — bypasses scoping |
| 22 | `openLightbox()` body-level | 2611, 4890 | Fix 11 — survives transition |
| 23 | `pbDoLogin()` → `trainingPull()` | 5606 | Fix 12 — unconditional pull |
| 24 | `pbLogout()` `setTimeout` + `isDirty()` | 5577 | Fix 12 — timer, core-only |

---

## 3. Proposed PocketBase CAS mechanism

**This requires server-side work. It cannot be done from the client.** See §10.

### Schema (`appdata` collection)
Add two integers, defaulting to `0`:

```
coreRev      integer
trainingRev  integer
```

Plus a **unique index on `user`** (fixes §1.13).

**Why two revisions, not one:** core (`pbSave({data})`) and training (`pbSave({training})`) PATCH the **same row**. A single row-level revision would make every training write invalidate an in-flight core write and vice versa — permanent false conflicts. Per-field revisions keep the subsystems independent, matching the brief's "separate revision tracks."

### Primary: custom transactional route (recommended)
`pb_hooks/cf_cas.pb.js` — one endpoint doing read-check-write inside a single transaction:

```
POST /api/cf/appdata/commit
  { subsystem: "core" | "training",
    expectedRev: <int>,
    payload: {...} }

200 { ok:true,  newRev }                     // written; rev incremented
409 { ok:false, conflict:true, serverRev, data }   // stale — caller re-reconciles
401/403                                      // unauthenticated / not owner
```

Implemented with `$app.runInTransaction(...)`: re-read the row inside the transaction, compare `expectedRev`, write and increment only on match. This is genuinely atomic — no TOCTOU window.

### Defence in depth: collection update rule
So a raw `PATCH` can't bypass the route:

```
@request.auth.id != "" && user = @request.auth.id
&& (@request.body.coreRev:isset = false     || @request.body.coreRev = coreRev + 1)
&& (@request.body.trainingRev:isset = false || @request.body.trainingRev = trainingRev + 1)
```

This alone is *nearly* CAS, and is the fallback if hooks are unavailable — but PocketBase evaluates the rule when loading the record for update, leaving a small window before the write. **I recommend the route as primary and the rule as a guard**, and will note the residual risk if the Product Owner prefers rule-only.

### Client changes
- `cloudGet` returns `{data, training, coreRev, trainingRev}`; revisions stored in the account-scoped ledger as `serverCoreRev` / `serverTrainingRev`.
- `cloudPush` sends `expectedRev = serverCoreRev`; `409` → `syncEnterConflict` with the returned server copy. Never a blind retry.
- The existing local revision ledger is unchanged — it answers "did the user edit during the flight?"; CAS answers "did the server move under us?". Both are needed; neither replaces the other.

### Fingerprint upgrade (secondary mechanism)
Recursive key-sorted canonical JSON → **SHA-256** via `crypto.subtle.digest` (async; available in all target browsers on HTTPS). Stored per account, per subsystem. The current 32-bit DJB2 + length (line 5397) is retained only as a synchronous fast path for equality *hints*, never as authority.

---

## 4. Account-scoped storage key design

```
cf:owner                     → last authenticated uid  (survives expiry; NOT cleared by pbClearSession)
cf:v                         → migration schema version
cf:{uid}:core                → was wl_v1
cf:{uid}:training            → was TKEY
cf:{uid}:workout             → was WOKEY
cf:{uid}:rev                 → was wl_rev  (local + server revs, per subsystem)
cf:{uid}:baseline            → was revAll().serverFp  (per-subsystem SHA-256)
cf:{uid}:photomap            → was wl_photomap:{uid}
cf:local:*                   → pre-authentication namespace (never auto-claimed)
```

IndexedDB: `photos` records already carry `ownerId`. Recovery snapshots already carry `accountId`; both become **enforced filters**, not labels.

**Pre-auth namespace.** The app is usable logged-out, so `cf:local:*` is a legitimate home for data created before any login. On first login it is **never** auto-adopted: if it holds meaningful state and the account's server copy is empty, the user is asked to claim it — the same quarantine pattern already approved for legacy photos.

**Legacy migration** (idempotent, gated on `cf:v`):
1. Read `cf:owner`; if absent, fall back to `pbCfg().uid` while a session still exists.
2. **Copy** (not move) `wl_v1`/`TKEY`/`WOKEY` into `cf:{owner}:*`; if no owner is determinable, into `cf:legacy-unclaimed:*` (quarantined, claimable only by `legacyCandidateOwnerId`, per the brief).
3. Write `cf:v`. Legacy keys are **retained** until the migration is verified in staging (brief: "do not remove legacy fields immediately if rollback still depends on them").
4. Snapshot before transforming; abort the migration on snapshot failure.

**Login rule.** `authenticatedUserId !== cf:owner` ⇒ the previous namespace is left untouched, in-memory views are cleared, and only the new user's namespace is loaded and reconciled. No cross-account upload candidate ever exists.

**Expiry rule.** `cf:owner` is retained (this is the fix for §1.5). Same-account reauth reconnects to the namespace; a different login cannot reach it.

---

## 5. Photo sync context design

```js
PhotoSyncContext {
  ownerId, authToken, baseUrl, mapKey,
  generationId   // monotonic; bumped by phInvalidateGeneration()
}
```

- Captured once at operation entry; **passed explicitly** to every helper. No helper reads `pbUid()`/`pbTok()` after entry.
- Every continuation begins with `ctxValid(ctx)` → `pbUid() === ctx.ownerId && ctx.generationId === phGeneration`. On failure: abort — no IDB write, no map write, no local delete, no UI success.
- Downloaded records are constructed with `ownerId: ctx.ownerId` literally, never via `phStamp()`.
- Map API becomes `getPhotoMap(ownerId)` / `setPhotoMap(ownerId, map)`.
- `phInvalidateGeneration()` is called on logout, expiry, other-account login, and explicit switch.
- Photo REST helpers gain an explicit `ctx` parameter so the token used is the one captured at entry.

---

## 6. Revised startup sequence

Target order (brief §Fix 10):

```
1. all original definitions
2. PocketBase implementation (existing, ~4310–4790)
3. hardening implementation (5022+, extended by this remediation)
4. storage migration (cf:v)
5. application initialization
```

**Mechanism (smallest safe diff):** wrap the existing init statements at line 4983 in `function bootApp(){ … }` — body unchanged — and **call** `bootApp()` as the final statement of the hardening block. No logic moves; only invocation time. Deferred inside the wrapper: `load`, `loadTraining`, `loadWorkout`, `refreshWeekPhotos`, `ensureIdentity`, the setup-link branch, first `render()`, and `autoSync`.

`refreshWeekPhotos()` is **rewritten** (not re-called) to query through the owner-scoped accessor and to check the render generation before its `render()`. Also audited for pre-override execution: the overview photo strip, diary/progress photo reads, lightbox restoration, account-card render, and login render.

Guard against regression: a test asserts no `idb()`, `render()`, or authenticated fetch is reachable before `bootApp()`.

---

## 7. Conflict recovery data structure

```js
createRecoverySnapshot({
  accountId,        // required; snapshot is rejected if it mismatches the live account
  reason,           // 'keep-local-over-server' | 'use-server-copy' | 'before-logout' | …
  source,           // 'local' | 'server'  ← which side this copy came from
  core, training,   // deep-cloned at call time, explicitly supplied (never read from `state`)
  localRevision, serverRevision, appBuild, createdAt
}) -> Promise<{ok:true, id} | {ok:false, error}>
```

Changes from today: state is **supplied and deep-cloned synchronously at entry** (no live `state` reference held across the IDB await); `source` records which side was preserved; the result is a promise callers must await; retention is bounded per account (`REC_KEEP = 3`).

**Keep-local:** snapshot `source:'server'` from the fetched remote → verify → CAS push → `409` re-enters conflict → success only after the write lands.
**Use-server:** snapshot `source:'local'` from current state → verify → adopt → record baseline + revisions.
**Cancel:** nothing written; local stays dirty; conflict context retained for later.

---

## 8. SyncCoordinator contract

```js
SyncCoordinator.state(sub)            // 'clean'|'pending'|'syncing'|'conflict'|'failed'|'unauthorized'
SyncCoordinator.syncAllPending({core:true, training:true, photos:true})
  -> Promise<{ core:Result, training:Result, photos:Result }>
Result = 'success'|'pending'|'conflict'|'failed'|'unauthorized'
```

Rules: subsystems progress independently; the aggregate never reports success unless every *selected* subsystem did; **no timers** anywhere in the completion path.

- **Logout** awaits `syncAllPending`. Any non-success ⇒ stay signed in, keep local data, name the failing subsystem, offer retry. Wipe only after every selected subsystem succeeds *and* a verified snapshot exists.
- **Login** reconciles each subsystem against its own account-scoped revision and CAS; training is never unconditionally pulled.
- **Status UI** becomes per-subsystem ("Core synced · Training 2 pending · Photos synced") behind a compact indicator opening a Data Safety sheet, per the brief's UX section.

---

## 9. Test plan

The current 60 tests exercise pure predicates. That is insufficient — every remaining defect is in **async orchestration**. I will add a Node simulation harness:

- **Fake environment:** in-memory `localStorage`, an IndexedDB stub, and a **mock PocketBase** implementing the CAS route (revisions, 409s, pagination with injectable instability, 401/403/500, latency and interruption).
- **Two-device simulator:** two isolated storage contexts against one mock server, so races and account switches are deterministic and automatable.

Coverage maps 1:1 to the brief's matrix:
- **Reconciliation** — GLP-only / note-only / settings-only / skip-only / delete-all dirty; no-baseline identical vs. different; two devices racing one baseline; server moves during resolution; recovery failure; cancel; keep-local preserves remote; use-server preserves local.
- **Account ownership** — different account after expiry and after logout, with old core / training / photos / recovery copies present.
- **Photos** — mixed-owner first paint; delayed pre-hardening callback; account switch during download/upload/delete/pagination/token fetch; lightbox open during expiry; legacy claim; map rebuild; 501 records; duplicate and shifted pagination; partial page failure.
- **Revisions** — edit during in-flight push; retry without bump; multiple retries; older response after newer edit; CAS mismatch; restart while dirty; legacy dirty migration.
- **Training/logout** — dirty routine at login; training-only dirty logout; core succeeds while training fails; photo pending at logout; assertion that no completion path uses a timer.

**Browser validation is mandatory before the next ship review** (brief). It needs a **staging PocketBase with the CAS route deployed**, two accounts, two profiles, throttling, forced expiry, IDB inspection, and a 501-photo fixture. **I cannot run this here** — no staging instance is reachable from this environment. I will deliver the checklist and the fixture generator; execution needs your machine, and the results table (test / expected / actual / browser / PB version) has to be filled in before I request review.

---

## 10. Conflicts with the current PocketBase schema and deployment constraints

**These need Product Owner decisions. Item 1 blocks Fix 2 entirely.**

1. **CAS cannot be delivered client-side.** Fix 2 requires (a) two new fields, (b) a unique index on `user`, and (c) a transactional route or update rule — all on the PocketBase server at `rack.tail6fa16c.ts.net`. I have no access to that host, and it is outside the one-`index.html` artifact. The brief's "single self-contained `index.html`" constraint still holds for the *client*, but this remediation is **not client-only**. Either you apply the server changes (I'll supply the hook file, schema steps and index SQL), or Fix 2 stays open and the concurrent-overwrite race remains.
2. **PocketBase version unknown.** The JSVM hook API differs across releases (`onRecordBeforeUpdateRequest` pre-0.23 vs `onRecordUpdateRequest` after), and older builds may lack `pb_hooks` entirely. I need the version string before writing the hook.
3. **Core and training share one row.** Hence per-field revisions (§3). If you would rather split `training` into its own collection, that is cleaner long-term and simplifies M5 — but it is a data migration, so I have kept it out of this remediation. Flagging it as a decision.
4. **Existing rows have no revisions.** Backfill: fields default to `0`, and the first client write for each subsystem sends `expectedRev: 0`. Safe for one device; if two devices upgrade simultaneously the loser gets a 409 and reconciles — correct behavior, but expect a burst of conflict prompts right after rollout.
5. **Conflict frequency rises immediately post-upgrade** (no baselines recorded yet). The no-baseline content comparison in §1.9 keeps most of these silent — identical content establishes the baseline with no prompt. Genuinely divergent devices will prompt, which is the intended outcome.
6. **`crypto.subtle` requires a secure context.** Fine over HTTPS/Tailscale; if the app is ever opened over plain HTTP the SHA-256 path must degrade to the synchronous hash *and* refuse to treat a fingerprint match as authoritative. I will implement that fallback.
7. **Storage headroom.** Recovery snapshots hold full core+training payloads in IndexedDB, ×3 per account. Bounded and small relative to photos, but the fail-closed rule (Fix 4) means a full disk now *blocks* destructive actions rather than silently proceeding — the intended trade, worth stating plainly.

---

## Proposed commit sequence

Small, ordered, each with tests; no unrelated refactors. Fixes 1, 4, 9 and 10 are the ones that stop live data loss, so they land first.

| # | Content | Fixes |
|---|---|---|
| 1 | `coreHasMeaningfulState()`; remove the `!localData → adopt` branch; no-baseline content comparison | 1, 9 |
| 2 | Recovery API rewrite: explicit state, deep clone, `source`, verified result; all destructive paths fail closed | 3, 4 |
| 3 | `bootApp()` deferral + owner-scoped `refreshWeekPhotos()` + pre-override audit | 10 |
| 4 | Account-scoped keys, `cf:owner`, migration, login/expiry rules | 5 |
| 5 | `PhotoSyncContext`, generations, explicit map API, `closeAllPhotoViews()` | 6, 11 |
| 6 | Map rebuild from complete listing; stable sort + dedup + unique-count completeness | 7, 8 |
| 7 | SHA-256 canonical fingerprints (per account, per subsystem) | 2 (partial) |
| 8 | **Server:** schema fields, unique index, CAS route/hook — *requires your deployment* | 2, §1.13 |
| 9 | Client CAS wiring: `expectedRev`, 409 → conflict | 2 |
| 10 | `SyncCoordinator`; logout awaits results; login stops unconditional training pull | 12 |
| 11 | Conflict UX rewrite + Data Safety section; ADR/doc updates | UX, docs |

Commits 1–7 and 10–11 are client-only and can proceed on approval. **Commits 8–9 are blocked on §10.1.**

---

## What I need from you to start

1. **Approve or amend this plan.**
2. **A decision on §10.1** — will you apply the PocketBase server changes? If not, Fix 2 cannot be closed and I'll mark it explicitly open rather than implying it's fixed.
3. **The PocketBase version string** (§10.2).
4. **A decision on §10.3** — keep training in the shared row, or split it out?
5. **Staging access** for the browser checklist, or confirmation that you'll run it (§9).
