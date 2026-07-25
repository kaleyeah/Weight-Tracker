# Compound Fitness — Changelog

**Last Updated:** 2026-07-25

**Status:** Active

A high-level, human- and AI-readable log of how the **product** has evolved — distinct from the Git commit history. Git records *every* change; this file records the changes that matter for understanding where the platform is and how it got here.

## Conventions

- Format loosely follows [Keep a Changelog](https://keepachangelog.com/) and Semantic-ish product versioning.
- Group entries under `Added`, `Changed`, `Fixed`, `Removed`, `Security`.
- Keep entries product-level. If a reader would need to open the diff to understand it, it's too granular for this file.
- Internal builds are tracked as `YYYY-MM-DD.NNN`; those numbers are referenced where useful.

> **Provenance note:** History before 2026-07-20 predates the current git clone and is summarized from the Product History doc and internal build numbers (the athlete app was already near build .270+ by then). Entries from 2026-07-20 onward are grounded in git history.

---

## [Unreleased]

### Fixed (coded, awaiting staging validation)
- **Dirty local data could be silently replaced — including on pull-to-refresh.** A device whose only unsynced change was a GLP-1 dose, note, settings change or skip was reported as having "no local data" and was overwritten by the server. Dirty state can no longer be adopted over on any path. Build `2026-07-25.332-pb-c1`.
- **No automatic whole-snapshot upload before server compare-and-swap.** A fingerprint match cannot prevent a concurrent write landing after the read, so automatic push/seed are replaced by a visible pending state and a user-confirmed upload that preserves the online copy first. Automatic upward sync pauses until CAS lands — a deliberate trade of automation for safety.
- **Destructive actions now fail closed.** Adopting the server copy, restoring a previous copy, replacing the device, and logging out all abort if the recovery copy cannot be verified. Logout no longer wipes on an unverified snapshot or completes on a timer.
- **Conflict resolution preserves the losing side.** "Use changes from this device" now saves the *online* copy first, rather than the copy that wins.

### Corrected
- **Documentation overstated sync safety.** Fingerprints were described as if they prevented concurrent overwrites; they only *detect* known divergence. Server-enforced revisions are the concurrency control. Also corrected: the legacy dirty-flag migration reads the flag but preserves only exact `"1"` as dirty — missing/malformed/wrongly-cleared state becomes clean, which is unsafe.

### Added
- **Product Bible documentation set** — Vision, Product History, Roles & Workflow, Technical Architecture, Roadmap, and the Feature Specification template, establishing the platform's mission, principles, and process of record.
- **Native Bridge Architecture** proposal — the PWA↔native boundary designed as a single generic transport with self-describing capabilities (`NATIVE_BRIDGE_ARCHITECTURE.md`). *Status: proposed, pending architecture review.*
- **Decision log & changelog** — `DECISIONS.md` (architectural decision record) and this file, to preserve context as the project scales.
- **`STATUS.md`** — a single, always-current snapshot of project state (complete / in progress / blocked / next), meant to be read first at the start of every session.
- **`README.md`** rewritten as the project entry point: points newcomers at `STATUS.md` first, indexes the docs with a reading order, and documents the "maintaining these docs" conventions.

### Planned / pending remediation (NOT shipped)
> The four items below describe the **unshipped v1 hardening attempt**. The Product Architect returned *do not ship*; the fixes are **incomplete** until server CAS, account scoping, photo context, safe coordination and staging validation are all finished. They are recorded here as intent, not as delivered fixes.

- **Photos could cross account boundaries.** Photo records and the photo→server map were device-global, so after a logout the next account's first sync uploaded the previous user's photos into their account and mirrored bogus deletions back to the device. Photos are now owned by an account; legacy ownerless photos are quarantined rather than auto-attributed.
- **Photo sync deleted photos past the first page.** The server listing fetched one 500-record page and treated absence as deletion, so at 501 records the oldest photos were removed locally. Listings now paginate fully and deletion is only inferred from a complete, successful enumeration.
- **An edit made during a sync could be lost.** A push that succeeded marked everything clean even if the user had edited while it was in flight. Monotonic revisions now mean only the request carrying the current revision can mark a track clean.
- **Server data could silently replace local edits.** Reconciliation compared only the newest date, which cannot see an independent change (a GLP-1 dose, symptom, settings change, historical correction, skip or routine edit). Divergence now raises an explicit conflict that defaults to keeping the device's data, and anything that can replace local data writes a recovery snapshot first.

- **Recovery snapshots** (attempted) — on-device, listed and restorable from the account card; currently preserve the *winning* side on keep-local, which the remediation corrects.
- **Dev-only test harness** — 60 **baseline** tests against the current unremediated source, plus a manual browser checklist.

### Changed
- Ordinary refresh (including pull-to-refresh) attempts to **reconcile** rather than replace — **still defective**: a dirty GLP-only/note-only/settings-only change can be silently replaced (the live defect Commit 1 fixes); replacing the device with the server copy is a separate, confirmed, snapshotted action.
- Logging out with unsynced changes offers to upload first, and snapshots before wiping.
- **Documentation switched to a living-document model.** Removed semantic version numbers from the Bible docs; each now carries a `Last Updated` date and a `Status` field, with Git history as the authoritative version history. (Supersedes the brief `Version: 2.0` numbering.)

---

## Phase 1 — Athlete App (near complete)

The athlete experience is approximately 90–95% complete. This phase focuses on polish and automation over new manual features.

### 2026-07-23 — GLP-1 & Peptides
#### Added
- **GLP-1 & Peptides** feature (build `.331`), replacing the earlier Supplements & Meds concept: settings + toggles, a compound editor, an Activity card with dose/symptom logging and rolling-overdue tracking, injection **site rotation**, extensible symptoms, and three Progress charts (severity, weight-by-dose, banded timeline). Per-user; no notifications yet.
#### Changed
- Moved the **Your Name** field to the top of the Profile page and removed it from Sync & Devices (build `.329`).
- Activity screen kept its gradient cards and gained a visible per-entry delete button (build `.327`).

### 2026-07-22 → 2026-07-23 — Apple Health import & workout coaching
#### Added
- **Apple Health import** rebuilt from scratch (build `.317`), covering weight and body fat, with a dedicated import icon and a completion state that keys off "Complete today" (recap generated) rather than a filled-field count (builds `.319`–`.323`).
- **RPT workout intelligence** — predict the next reverse-pyramid set from the one just logged, recompute targets on load, name the next exercise on the rest timer, show progression type/rep ranges/rest guidance, and detect a warm-up mistaken for a working set (builds `.308`–`.315`).
- **Coach Max** gained expressive check-ins — thirteen faces, face shown on check-ins (builds `.301`–`.302`).
#### Changed
- Progression type is now per-exercise; movement pattern became metadata (build `.294`).
- Food photos retain their meal label through the server and can be reassigned from the viewer (builds `.291`–`.292`).
#### Fixed
- Sync no longer drops skips; boot-time recency guard prevents stale-push clobber; removed dead health-fetch code (build `.320`).

### 2026-07-20 → 2026-07-21 — Daily recap & UI polish
#### Added
- **Daily recap** system — per-day recap history with browse arrows, dynamic placement (new recap surfaces at top with a glow; once read it moves under the check-in), and a gated Regenerate control (builds `.276`–`.282`).
- **Metabolism card** with a real "measuring" state (build `.285`).
#### Changed
- Settings hub rows switched from emoji to Lucide line icons (build `.284`).
- Trend, pace, and forecast are suppressed below 7 weigh-ins to avoid noise (build `.283`).
- Activity cards restyled with vibrant gradients, colored glow, and white icons (build `.279`).

---

## Backend & Platform

### 2026-07-21 — Backend cutover
#### Changed
- **Cutover to self-hosted PocketBase** (build `2026-07-21.288-pb`) — real logins, password change, and a "Keep me signed in" choice, plus server-side photo and Health-import sync. *(See ADR-010.)*
#### Security
- **Retired GitHub** as a storage path — deleted the stored personal access token and closed every code path that could transmit it.
#### Fixed
- An expired session can no longer destroy unsynced local data. *(See ADR-011.)*

---

## Earlier History (pre–2026-07-20, summarized)

The project began as a personal fitness tracker and grew, over many internal builds, into a near-complete athlete app: weight tracking, progress photos, workout and cardio logging, nutrition/macro tracking, meal planning, AI coaching (Coach Max), weekly goals, GLP-1 logging with injection-site rotation, trend charts, and progress summaries. During this period the product's identity shifted from "tracker" to "coaching platform," setting up the roadmap's later phases (native shell, coach dashboard, coach AI, and the broader platform).

---

## Roadmap Ahead (not yet delivered)

See `ROADMAP.md` for detail. In brief:

- **Phase 2 — Native Shell:** HealthKit, Health Connect, Bluetooth, push, background sync, App Store release.
- **Phase 3 — Coach Dashboard:** client management, workout builder, meal plans, messaging, weekly reviews, video feedback.
- **Phase 4 — Coach AI:** weekly summaries, suggested macro/workout changes, compliance monitoring, risk detection.
- **Phase 5 — Platform:** subscriptions, organizations, coach businesses, API, marketplace, enterprise features.
