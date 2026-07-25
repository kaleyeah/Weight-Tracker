# Compound Fitness — Project Status

**Last Updated:** 2026-07-25

**Status:** Active

> **Read this first.** This is the single source of truth for where the project stands right now. Both humans and AI should read it at the start of every session before doing anything else. Update it whenever a major milestone completes or the current focus shifts — keep it short and current, not a history log (that's `CHANGELOG.md`).

---

## Snapshot

Compound Fitness is a coaching platform (not a tracker) built as **one backend + one PWA + thin native wrappers**. The **athlete app is ~90–95% complete** and running on a self-hosted PocketBase backend. Current focus is **live-app safety & architecture hardening** — making the athlete app safe enough to be the foundation for Phase 2. No coach-facing features exist yet.

- **Current phase:** Phase 1 (Athlete App) + **hardening brief (M1–M10)** → Phase 2 (Native Shell).
- **Hardening progress:** M1–M4 implemented but **NOT SHIPPABLE** — Product Architect review returned *do not ship* with 12 required fixes. Remediation plan written (`REMEDIATION_PLAN.md`), awaiting approval before coding. M5–M10 + record-level sync design not started.
- **Backend:** self-hosted PocketBase (cutover 2026-07-21).
- **Latest internal build:** `2026-07-23.331`.

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

**Hardening — Blockers (M1–M4): first pass done, remediation required**
- M1: photos are account-scoped (ownerId gates display/upload/delete/reconcile); legacy photos quarantined, never auto-attributed
- M2: photo listing paginates; deletion is never inferred from an incomplete enumeration (the 501-record bug)
- M3: monotonic revisions replace the dirty boolean — an in-flight push can no longer mark a newer edit clean
- M4: dirty local data is never silently replaced on login/boot/pull; recovery snapshots + three-way conflict choice defaulting to keep-local
- Dev-only test harness: 60 tests run against the real shipping source (`node tests/run-all.js`) + browser checklist

**Foundation / docs**
- Product Bible set: Vision, Product History, Product Bible, Roles & Workflow, Technical Architecture, Roadmap, Feature Spec template
- Decision log (`DECISIONS.md`) and product changelog (`CHANGELOG.md`)
- Living-document policy adopted (Last Updated + Status; Git as version history)

---

## 🚧 In Progress

- **M1–M4 remediation** — review verdict: **do not ship**. All 12 findings verified against source; 2 are worse than reported and 1 new hazard found (duplicate `appdata` rows). `REMEDIATION_PLAN.md` answers the brief's 10 required pre-coding items and **awaits approval**. No code changed yet.
- **Native Bridge Architecture** — `NATIVE_BRIDGE_ARCHITECTURE.md` drafted; **Status: Proposed**, awaiting review before implementation.
- **Athlete app polish/automation** — remaining 5–10% is polish and automation, not new manual features.

---

## ⛔ Blocked / Awaiting Decision

- **M1–M4 must not ship as-is.** Live defect: a dirty GLP-1/note/settings-only change can still be silently replaced on pull-to-refresh (`syncDecide` line 5412).
- **Compare-and-swap (Fix 2) is blocked on PocketBase server work** — new fields, a unique index on `user`, and a transactional route/hook. Cannot be done client-side; needs Product Owner action.
- **Browser validation blocked** — no staging PocketBase reachable from this environment.
- **Phase 2 native build** is gated on **architecture review of the bridge proposal** (ADR-004, ADR-005 are `Proposed`, not `Accepted`).
- **Native background health ingestion must not be built** against the current whole-snapshot `appdata.data` model — the record-level sync design (M-design) has to be approved first.

---

## ➡️ Next Up

1. **Approve `REMEDIATION_PLAN.md`**, decide on the PocketBase server changes (§10.1), and supply the PB version (§10.2).
2. Implement remediation commits 1–7 (client-only, unblocked on approval); 8–9 need the server work.
3. **M5–M7**: training sync protection, Backup V2, remove the vestigial GitHub layer.
4. **M8–M10**: internal boundaries, product-logic defects (lean-bulk/maintenance forecasting, recent-pace window, test control disabled in production), config/security cleanup.
5. **Record-level synchronization design** for review — required before any native background health ingestion.
6. Then Phase 2 (Native Shell), once the bridge proposal is accepted.

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
| 11 | `REMEDIATION_PLAN.md` | M1–M4 remediation plan (proposed, blocks further hardening) |
| — | `FEATURE_SPECIFICATION_TEMPLATE.md` | Template for new feature specs |
