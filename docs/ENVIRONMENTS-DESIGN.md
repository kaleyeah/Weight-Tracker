# Environment separation — design (addendum gap 3)

Design only, per the addendum's own prompt ("incorporate the required-now
items into Phase 0 documentation and tests. Do not implement…"). Implementation
is its own authorized step.

## Current honest state

One production (PocketBase on the NAS, GitHub Pages at the repo root).
Disposable local PocketBase instances for server tests
(`M10-single-writer/server/tests/setup-instance.sh`, fresh `pb_data`, never
pointed at production). Browser tests run against local HTTP with all API
routes stubbed. **No staging. Client development verifies against production
data behind the protocol's own gates.** The risk is not volume; it is that a
client defect corrupts the athlete's history — the M8/M10 protocol is the
mitigation, not a substitute for separation.

## Target design

| Environment | Server | Client | Data |
|---|---|---|---|
| dev | disposable local PB (exists) | local HTTP serve of the worktree | synthetic fixtures only |
| test | disposable local PB, enforce + off modes (exists) | Playwright tiers | synthetic; created and deleted per run |
| **staging** | **second PocketBase instance on the NAS** (own port, own `pb_data`, own hooks copy, own superuser) | **Pages preview: serve a `staging/` subdirectory or a second Pages repo** — the app's `pbBase()` is already overridable in the advanced login form | a restored copy of a production backup (which doubles as the restore-test the addendum requires) |
| prod | the existing NAS instance | Pages root | the athlete's real data |

Non-shared by construction: ports, `pb_data` directories, credentials
(separate `pb.env` per instance), file storage, and — once Phase 2 exists —
service-worker cache scopes (distinct origins/paths give this for free).

Staging serves two addendum requirements at once: environment separation and
**restore-tested backups** (the staging refresh IS the restore rehearsal).

## Sequencing

Standing up staging is NAS work (new container/port, Owner-authorized) and
belongs before Phase 3 (the local-database migration), which is the first
phase whose failure mode is data-shape corruption. Phases 1–2 change no data
shapes, so the exposure until then is unchanged from today. Proposed gate:
**staging exists and has passed one backup-restore cycle before any Phase 3
work begins.**
