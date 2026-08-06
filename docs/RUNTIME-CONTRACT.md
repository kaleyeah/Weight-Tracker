# Runtime contract — what a refactor must not change

Phase 0 deliverable. This is the app's externally-observable surface: storage
keys, database shapes, server routes, deployment, and the platform model the
Architect's addendum requires stated. Changing anything here requires a
migration and explicit tests (non-negotiable rule 6).

## 1. localStorage

**Global keys**

| Key | Holds |
|---|---|
| `wl_v1` | the whole core payload (weights, food, settings, notes, …) — `KEY` |
| `wl_training_v1` | training state — `TKEY` |
| `wl_workout_v1` | in-progress workout — `WOKEY` |
| `wl_training_recovery` | pre-recovery copy; sync blocks if unwritable |
| `wl_last_owner` | last uid owning local data; drives the ownership gate |
| `wl_pb` | PocketBase session (also in sessionStorage when remember=false) |
| `wl_photomap` | photo localId → serverId map |
| `wl_coach_reports` | cached coach reports `{weekly,nightly,tdee}` |
| `wl_logout_journal` | crash-safe logout journal |
| `wl_dirty` / `wl_lastsync` | legacy dirty flag / last-sync stamp |
| `wl_sync` | RETIRED GitHub config — deleted at every load (10051); keep the delete |
| `wl_sumopen`, `wl_calopen`, `wl_announced` | UI state / update-banner memory |
| `wl_pf_overlay` | guided-camera ghost-overlay prefs (on + 10–75% strength + facing rear/selfie) — DEVICE-LOCAL by design (addendum §1: per-installation state), never synced |
| `wl_pf_refs` | per-pose pinned camera-alignment reference — DEVICE-LOCAL, never synced. v2 value `{id,week}` (resolves by id, then by week if the record was re-keyed); bare-string v1 values still accepted. Unresolvable pin → ghost uses latest and SAYS so; absent pose keys fall back to newest week |
| `wl_max_read` | Max-inbox read map `{key:true}` (keys `nightly:<iso>`) for DAILY recaps — DEVICE-LOCAL; weekly/TDEE read state stays in the synced `settings.seenWeekly`/`seenTdee`. Marked on READING a message, not on opening the sheet |
| `wl_m10_deviceid` | this installation's device id (see §5) |

**Per-account families** — `wl_training_{dirty,base,journal,conflict}__<uid>`,
`wl_core_{dirty,base,ack_journal,displaced,dx_journal}__<uid>`,
`wl_photo_ops__<uid>`, `wl_m10_grant__<uid>`; quarantine prefixes
`wl_training_corrupt__<uid>.*` and `wl_core_corrupt__<uid>.*`.

**The logout wipe list is exactly `logoutTargets()`** (`KEY,TKEY,WOKEY,
DIRTY_KEY,LAST_KEY,LASTOWNER_KEY,TRECOVERY_KEY`) — deliberately NOT the
uid-scoped families. The journal restores only this fixed list.

## 2. IndexedDB

One DB `wl_photos`, one store `photos` (keyPath `id`, non-unique index `date`).
Progress records MAY carry an optional `normalization` object (schema 1:
3:4 crop in normalized coords, ±7° rotation, mode auto/manual/legacy) — added
2026-08-06 by the photo package. It is metadata DESCRIBING a view of the
authoritative blob; the blob itself is never rewritten. Absent on legacy
records (legacy display remains valid). Device-local + carried by the photo
backup (format version 2; v1 imports remain accepted); NOT yet synced — the
server column is a deliberately deferred Owner/Architect decision.
**Opened WITHOUT a version number, deliberately** — it adopts whatever version
the device holds and self-heals a v1-with-no-store device by reopening at
`version+1`. Do not "tidy" this to `open("wl_photos", 1)`; the comment at the
open call explains which devices that would permanently break.

## 3. PocketBase surface

Base: `pbBase()`, default `https://rack.tail6fa16c.ts.net`.

Collections: `users` (auth, refresh, password PATCH), `appdata` (read;
mailbox-only PATCH of `coachreq`/`health`), `coach_reports` (read),
`photos` (read + legacy write path that is dead code), `/api/files/token` + file GET.

Custom routes, all POST: `/api/cf/appdata/commit` (core AND training CAS),
`/api/cf/writer/lease` (status/acquire/renew/release/steal),
`/api/cf/photos/{upload,update,delete}`.
**Retired 2026-08-05, must stay retired:** `/api/cf/platform/patch-data`.

`APP_BUILD` is sent on every write and recorded in `cf_commit_log.clientBuild`;
the server's `MIN_CLIENT_BUILD` gate compares against it. Changing the build
string format is a server-visible change.

## 4. Deployment and self-update

- This checkout is a git worktree of `Weight-Tracker`; **`git push origin main`
  IS the deploy** (GitHub Pages serves the branch root; no CI, no CNAME).
- `index.html` at the repo root is the entire artifact. `build.mjs` inlines
  `src/` modules between `==BUILD:*==` markers; `--check` gates staleness.
- Builds `.348`–`.353` are burned; never reuse (HANDOVER.md).
- **Self-update contract:** `checkForUpdate()` fetches the app's own URL and
  greps the DOCUMENT TEXT for `APP_BUILD="…"`. Therefore `APP_BUILD` must live
  in `index.html` itself, and the app must remain one self-contained document
  until the Phase-2 service worker exists. Pinned by
  `c23-characterization` ("self-update contract").
- No service worker; the manifest and icons are generated at runtime
  (`makeIcon()`) as data URIs. The only external fetch is Google Fonts (CSS
  `@import`).

## 5. Client-container model (addendum gap 1)

**Every installation is its own client.** iOS `WKWebView` (future Lite shell),
Safari-installed PWA, an ordinary Safari tab, an iPad or desktop browser — each
has its own localStorage/IndexedDB, its own `wl_m10_deviceid`, its own lease and
fence state, and its own update cadence. A WKWebView's data store is
app-managed and **does not share** Safari's, even on the same phone. Clients
coordinate **only** through the fenced synchronization protocol — never by
assuming shared local storage. The per-installation device id already
implements this; treat it as a stated contract, not an accident.

## 6. Source-of-truth model (addendum gap 2)

- The **local store** (`wl_v1` + families) is the immediate working copy and the
  offline authority for uncommitted work.
- The **journals** (`wl_core_ack_journal__`, `wl_photo_ops__`, …) are the
  durable record of pending intent; an entry is removed only after the server
  confirms the matching idempotency key and resulting revision.
- The **server accepted revision** (`appdata.coreRev`/`trainingRev` + the
  `cf_commit_log` ledger) is the canonical shared state across devices.
- **Conflicts are visible states** (review sheets, the read-only bar), never
  silent last-write-wins. Displaced work never auto-applies.

## 7. Environments (addendum gap 3) — the honest current picture

One production (PocketBase on the NAS + GitHub Pages). Disposable local
PocketBase instances for tests (`M10-single-writer/server/tests/
setup-instance.sh`). **No staging.** Dev happens against production data guarded
by the protocol's own gates — acceptable at one athlete, recorded here so the
gap is a decision rather than an oversight. Full separation is later-phase work.
