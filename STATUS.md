# Compound Fitness — Project Status

**Last Updated:** 2026-07-25

**Status:** Active

> **Read this first.** This is the single source of truth for where the project stands right now. Both humans and AI should read it at the start of every session before doing anything else. Update it whenever a major milestone completes or the current focus shifts — keep it short and current, not a history log (that's `CHANGELOG.md`).

---

## Snapshot

Compound Fitness is a coaching platform (not a tracker) built as **one backend + one PWA + thin native wrappers**. The **athlete app is ~90–95% complete** and running on a self-hosted PocketBase backend. Current focus is **live-app safety & architecture hardening** — making the athlete app safe enough to be the foundation for Phase 2. No coach-facing features exist yet.

- **Current phase:** Phase 1 (Athlete App) + **hardening brief (M1–M10)** → Phase 2 (Native Shell).
- **Hardening progress:** M1–M4 implemented but **NOT SHIPPABLE** (*do not ship*, 12 required fixes). Plan **approved with amendments** — `REMEDIATION_PLAN_V2.md` is authorized; awaiting go-ahead to start commit 1. M5–M10 + record-level sync design not started.
- **Backend:** self-hosted PocketBase (cutover 2026-07-21).
- **Latest internal build:** `2026-07-25.333-pb-c1b` (Commit 1+1b — **coded, not shipped, not staging-validated**).

---

## ✅ Complete

**Athlete app (~90–95%)**
- Weight tracking, progress photos, trend charts, progress summaries, daily recaps
- Workout logging with RPT intelligence (next-set prediction, per-exercise progression, rest timer)
- Cardio logging, nutrition/macro tracking, meal planning, food photos
- Weekly goals
- AI coach ("Coach Max") with expressive check-ins
- GLP-1 & Peptides: dose/symptom logging, injection site rotation, overdue tracking, 3 progress charts
- Apple Health import (weight, body fat, waist, steps, sleep, calories)

**Platform / backend**
- Self-hosted PocketBase: real logins, password change, "keep me signed in", photo + health sync
- Retired GitHub-PAT storage path (security)
- Data-safety guard: expired sessions never destroy unsynced local data

**⚠️ NOT under Complete — see Blocked.** The M1–M4 first pass is written but **unshipped and incomplete**; it must not be read as delivered work. Listed here only to record what the v1 attempt covered:
- M1 (attempted): photos are account-scoped (ownerId gates display/upload/delete/reconcile); legacy photos quarantined, never auto-attributed
- M2: photo listing paginates; deletion is never inferred from an incomplete enumeration (the 501-record bug)
- M3: monotonic revisions replace the dirty boolean — an in-flight push can no longer mark a newer edit clean
- M4: dirty local data is never silently replaced on login/boot/pull; recovery snapshots + three-way conflict choice defaulting to keep-local
- Dev-only test harness: 60 **baseline** tests against the current unremediated source (`node tests/run-all.js`) + browser checklist. These validate today's behaviour — including one branch that must be removed — not the remediation.

**Foundation / docs**
- Product Bible set: Vision, Product History, Product Bible, Roles & Workflow, Technical Architecture, Roadmap, Feature Spec template
- Decision log (`DECISIONS.md`) and product changelog (`CHANGELOG.md`)
- Living-document policy adopted (Last Updated + Status; Git as version history)

---

## 🚧 In Progress

- **Commit 1 review verdict: CHANGES REQUIRED** — the decision table was fixed but the runtime write path was still open (`save()` → blind `cloudPush()`), plus cross-account first paint, auto-claim, and snapshot validation gaps. **Commit 1b closes all 15 required changes**: `pbSave` gated shut until CAS, schedulers inert, timers cancelled, Save button rewired, render ownership-gated, quarantine screen for unowned data, symmetric normalization, per-field snapshot validation, import protected, dirty-training pull blocked. 116 tests pass.
- **M1–M4 remediation** — review verdict on the first pass: **do not ship**. All 12 findings verified. Plan **approved with amendments**; `REMEDIATION_PLAN_V2.md` is the authorized plan (15 pre-coding items) and supersedes v1. One v1 claim was wrong and is corrected: the legacy dirty flag **is** read (line 5326) — the defect is that only exact `"1"` survives as dirty, while missing/malformed/wrongly-cleared state becomes clean. New hazard confirmed: duplicate `appdata` rows. No application code changed yet.
- **Native Bridge Architecture** — `NATIVE_BRIDGE_ARCHITECTURE.md` drafted; **Status: Proposed**, awaiting review before implementation.
- **Athlete app polish/automation** — remaining 5–10% is polish and automation, not new manual features.

---

## ⛔ Blocked / Awaiting Decision

- **Commit 1+1b coded but NOT SHIPPED.** The 33-case staging checklist has not been run — no staging PocketBase is reachable here. Shipping on automated tests alone is explicitly disallowed.
- **Upward sync is deliberately frozen in this build** until server CAS deploys — edits stay local with a visible pending state and an export path. This is the Architect's ruling: a user-confirmed blind overwrite is still last-writer-wins.
- **Compare-and-swap (Fix 2): server kit ready, deployment is the operator's.** The hook, schema steps, integration tests and rollback are in `server/`; staging must pass before production, and Commit 10 (client wiring) is written only after staging is green.
- **Browser validation blocked** — no staging PocketBase reachable from this environment.
- **Phase 2 native build** is gated on **architecture review of the bridge proposal** (ADR-004, ADR-005 are `Proposed`, not `Accepted`).
- **Native background health ingestion must not be built** against the current whole-snapshot `appdata.data` model — the record-level sync design (M-design) has to be approved first.

---

## ➡️ Next Up

1. ✅ **PocketBase version discovered: v0.39.8** (Admin UI footer). Server kit written — `server/pb_hooks/cf_cas.pb.js`, `server/DEPLOYMENT.md`, `server/tests/cas-server-tests.sh`. **Next operator action: deploy to STAGING per DEPLOYMENT.md and run the test script.**
2. **Run `tests/MANUAL_CHECKLIST_COMMIT1.md` on staging**, then ship Commit 1 ahead of the rest of the remediation.
3. Remediation commits 2–8, 11 (client-only); 9–10 need the server work and the version.
4. **M5–M7**: training sync protection, Backup V2, remove the vestigial GitHub layer.
5. **M8–M10**: internal boundaries, product-logic defects (lean-bulk/maintenance forecasting, recent-pace window, test control disabled in production), config/security cleanup.
6. **Record-level synchronization design** for review — required before any native background health ingestion.
7. Then Phase 2 (Native Shell), once the bridge proposal is accepted.

Full phase detail: see `ROADMAP.md`.

---

## Key Documents (reading order)

| Order | Doc | Purpose |
| ----- | --- | ------- |
| 1 | `STATUS.md` (this file) | Where the project is right now |
| 2 | `VISION.md` | Why the platform exists; north star |
| 3 | `PRODUCT_BIBLE.md` | Core principles & the feature litmus test |
| 4 | `PROJECT_HISTORY.md` | How we got here; key decisions in prose |
| 5 | `ROLES_AND_WORKFLOW.md` | Who does what; the 5-step feature process |
| 6 | `ROADMAP.md` | The five phases |
| 7 | `TECHNICAL_ARCHITECTURE.md` | System-level architecture |
| 8 | `NATIVE_BRIDGE_ARCHITECTURE.md` | PWA↔native boundary (proposed) |
| 9 | `DECISIONS.md` | Architectural decision log (read before reversing anything) |
| 10 | `CHANGELOG.md` | Product evolution over time |
| 11 | `REMEDIATION_PLAN_V2.md` | **Authorized** M1–M4 remediation plan (supersedes v1) |
| — | `REMEDIATION_PLAN.md` | v1, superseded — kept for the correction record |
| — | `FEATURE_SPECIFICATION_TEMPLATE.md` | Template for new feature specs |
