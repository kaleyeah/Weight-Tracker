# Compound Fitness — Code Architecture (How It Actually Works)

**Last Updated:** 2026-07-24

**Status:** Active

> This describes how the **current shipping code** is built — the athlete PWA as it exists today. It is distinct from `TECHNICAL_ARCHITECTURE.md` (the target platform architecture) and `NATIVE_BRIDGE_ARCHITECTURE.md` (the proposed native boundary). If you're handing the code to a reviewer, read this alongside `index.html`.

---

## TL;DR

- **One file.** The entire app is `index.html` (~5,000 lines, build `2026-07-23.331-pb`). It contains all markup, CSS, and a single `<script>` block of vanilla JavaScript.
- **No framework, no build step.** No React/Vue, no bundler, no npm. ~600 plain functions. You open the file and it runs.
- **No external JS dependencies.** The only external resource is a Google Fonts stylesheet. All logic is inline.
- **Local-first.** State lives in `localStorage`; progress photos live in `IndexedDB`. Everything works offline.
- **Backend is self-hosted PocketBase** for auth, cross-device data sync, and photo storage.
- **Self-updating.** The page checks its own build string and cache-busts to pull the latest version.

---

## 1. File & Runtime Shape

```
index.html
├── <head>         meta (PWA/apple-mobile-web-app), Google Fonts <link>, ~840 lines of inline CSS (theming via CSS vars)
└── <script>       one block, ~4,200 lines, vanilla JS  (starts ~line 844)
     ├── constants & state
     ├── persistence (localStorage + IndexedDB)
     ├── sync (PocketBase; legacy GitHub layer still present)
     ├── domain logic (weight/trend, macros, workouts/RPT, cardio/HR, GLP-1, coach)
     ├── view_* renderers (one per screen)
     └── render() router + boot
```

It's a **single-page app** with no router library: navigation is driven by `data-view="..."` attributes and a central `render()` function (line ~3726) that swaps screen content. Theming is via CSS custom properties with multiple themes (dark/light/etc.) selectable in settings.

---

## 2. State & Data Model

There is one in-memory `state` object. The persisted slice is produced by `payload()` and restored by `load()`:

| Field | Shape | What it holds |
| --- | --- | --- |
| `settings` | object | user prefs, goals, targets, theme, macro/calorie auto-calc flags |
| `weights` | array | weigh-ins (date + value), source of trend/pace/forecast |
| `food` | map by date | nutrition / macro entries, food diary |
| `workouts` | map by date | logged workouts |
| `steps`, `sleep`, `bodyfat`, `waist` | maps by date | imported/logged health metrics |
| `notes` | map by date | daily notes |
| `statuses` | array | check-in / completion states |
| `presets` | array | activity/exercise presets |
| `skips` | map | skipped days/items |
| `glp` | object | GLP-1 & Peptides: compounds, doses, symptoms, site rotation |
| `weeklySummary`, `nightlySummary`, `nightlyLog` | object/map | Coach Max AI recaps |
| `scriptVer` | map | per-record versioning used for sync conflict handling |

Workout/training detail also has its own persistence path (`saveTraining` / `loadTraining` / `trainingPush` / `trainingPull`).

---

## 3. Persistence Layers

Three layers, local-first:

1. **`localStorage`** — the primary store.
   - `wl_v1` (`KEY`) → the JSON `payload()` (all app data above).
   - `wl_sync`, `wl_dirty`, `wl_lastsync` → sync bookkeeping.
   - `wl_pb` → PocketBase session/config; `wl_photomap` → local↔remote photo id map.
   - misc UI prefs (`wl_sumopen`, `wl_calopen`, …).
2. **`IndexedDB`** (`wl_photos` DB, `photos` store, indexed by `date`) — binary **progress photos**. Kept out of `localStorage` because they're large. Helpers: `idbAdd`, `idbByDate`, `idbAll`, `idbDelete`, `idbClearAll`.
3. **PocketBase backend** (see §4) — the cloud copy for auth + multi-device sync.

**Save flow:** `save()` → `saveLocal()` (writes `localStorage`) → `scheduleCloudPush()` (debounced push to backend). Writes are marked dirty (`markDirty`) and reconciled on sync.

---

## 4. Backend & Sync (PocketBase)

- **Base URL:** `PB_DEFAULT_BASE = "https://rack.tail6fa16c.ts.net"` — a self-hosted PocketBase instance (Tailscale hostname; runs on the "rack"/Synology box). *Note: this is hardcoded in the client.*
- **Collections used (REST):**
  - `users` — auth (`/api/collections/users/auth-with-password`, records, password change).
  - `appdata` — the app-data records (`/api/collections/appdata/records`): the JSON blob synced per user.
  - `photos` + `files` — progress-photo records and file tokens (`/api/files/token`, `/api/files/photos/...`).
- **Model:** the client is the source of truth for a session; it pushes the local `payload()` up and pulls it down, using per-record `scriptVer` to avoid clobbering. Boot-time recency guards prevent a stale server push from overwriting newer local data, and an expired session must never destroy unsynced local data (see `DECISIONS.md` ADR-011).

> **Legacy note (worth a reviewer's attention):** the code still contains an earlier **GitHub Contents API** sync layer (`ghPut`, `ghUrl`, `cloudPush/Pull`, `DEFAULT_REPO="kaleyeah/weight-data"`, calls to `api.github.com`). This predates the PocketBase cutover (ADR-010) and the stored token was removed for security. The **live** path is PocketBase; the GitHub functions are vestigial and a candidate for cleanup.

---

## 5. Health Import

- The app ingests a **Health payload** (weight, body fat, waist, steps, sleep, calories) via `applyImport()`. Input is tolerant — it accepts the payload as an object or a JSON string and trims stray whitespace/dates.
- References to `HealthKit` indicate the intended source is Apple Health, delivered today via an import action (e.g. a Shortcut/native hand-off posting JSON) rather than a live native bridge. This is exactly the seam that `NATIVE_BRIDGE_ARCHITECTURE.md` formalizes for Phase 2.
- Imported raw values are stored in their own maps (`steps`, `sleep`, `bodyfat`, `waist`, `weights`), keeping raw data separate from derived metrics (ADR-006).

---

## 6. Domain Logic Highlights

- **Weight & trend:** trend/pace/forecast are computed from `weights`, and suppressed below 7 weigh-ins to avoid noise. Maintenance calories / daily deficit / delta math (`maintenanceCals`, `dailyDeficit`, `dailyDelta`).
- **Nutrition/macros:** auto or manual macro/calorie targets (`applyAutoMacros`), food diary, and food photos (reassignable to meals) synced via the photo path.
- **Workouts / RPT:** exercise library (`view_exlib`), routines (`view_routine`/`view_rlaunch`), live workout logging (`view_workout`/`view_liftview`) with **reverse-pyramid-training** intelligence — per-exercise progression type, next-set prediction, rep ranges, and a rest timer that names the next exercise.
- **Cardio / HR:** cardio logging with heart-rate-zone math (`estMaxHR`, `effMaxHR`, `weekTrainingStats`) and weekly cardio goals.
- **GLP-1 & Peptides (`glp`):** compound editor, dose/symptom logging, rolling-overdue tracking, injection **site rotation**, and progress charts (severity, weight-by-dose, banded timeline).
- **Coach Max (AI):** nightly and weekly recaps (`nightlySummary`, `weeklySummary`, `nightlyLog`), expressive mood faces (`maxMoodHTML`, thirteen faces), and unread badges (`coachUnreadN/W`). Recaps are generated content presented in a coach "sheet"/message stream.

---

## 7. Views (Screens)

Rendered by dedicated `view_*` functions and dispatched through `render()`:

`overview` · `weight` · `summary` · `train` · `workout` · `liftview` · `routine` · `rlaunch` · `exlib` · `cardio` · `photos` · `diary` · `settings` · `glptimeline` (+ sub-flows: `wtadd`, `quicklog`, `actadd`).

Navigation is `data-view` / `data-tab` attributes handled by a delegated click handler; there is no URL routing.

---

## 8. PWA & Self-Update

- **Installable PWA:** apple-mobile-web-app meta tags, `manifest`, `standalone` detection, `beforeinstallprompt` handling.
- **Self-update:** `checkForUpdate()` fetches its own URL with `cache:"no-store"`, extracts the remote `APP_BUILD` string, and if it differs, `updateApp()` reloads with a `?v=<timestamp>` cache-buster. A `sessionStorage` guard (`wl_reloaded_for`) prevents reload loops when a CDN lags, falling back to an in-app "update available" banner (`showUpdateBanner`).
- **Build identifier:** `APP_BUILD = "2026-07-23.331-pb"` (`-pb` = PocketBase era).

---

## 9. What a Reviewer Should Know

- **It's intentionally dependency-free and single-file** — easy to deploy (drop one file), but large and dense; there's no module boundary, so search by function name.
- **Local-first with cloud reconciliation** — most complexity lives in sync (dirty tracking, `scriptVer`, recency guards). That's the riskiest area and the right place to focus review.
- **Two known cleanup items:** (1) the vestigial GitHub sync layer, and (2) the hardcoded PocketBase base URL.
- **The native story is not built yet.** Health import is a data hand-off today; the formal PWA↔native bridge is proposed, not implemented (Phase 2).

---

## Appendix — Where to Find Things in `index.html`

| Area | Approx. lines |
| --- | --- |
| Inline CSS / theming | ~12–843 |
| `<script>` start | 844 |
| State, `load`/`payload`/`save` | ~1099–1128 |
| Sync (PocketBase + legacy GitHub) | ~1128–1420, 4305–4500 |
| Coach Max / recaps | ~1791–2000 |
| Photos (IndexedDB) | ~2469–2540 |
| View renderers (`view_*`) | ~1723–3726 |
| `render()` router | ~3726 |
| Health import / update / PB config | ~4213–4500 |
| Photo files API | ~4736–4950 |
