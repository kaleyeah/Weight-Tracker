# Compound Fitness — Project Status

**Last Updated:** 2026-07-24

**Status:** Active

> **Read this first.** This is the single source of truth for where the project stands right now. Both humans and AI should read it at the start of every session before doing anything else. Update it whenever a major milestone completes or the current focus shifts — keep it short and current, not a history log (that's `CHANGELOG.md`).

---

## Snapshot

Compound Fitness is a coaching platform (not a tracker) built as **one backend + one PWA + thin native wrappers**. The **athlete app is ~90–95% complete** and running on a self-hosted PocketBase backend. Current focus is **documentation/foundation** and preparing **Phase 2 (the native shell)**; no coach-facing features exist yet.

- **Current phase:** Phase 1 (Athlete App) wrapping up → Phase 2 (Native Shell) planning.
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

**Foundation / docs**
- Product Bible set: Vision, Product History, Product Bible, Roles & Workflow, Technical Architecture, Roadmap, Feature Spec template
- Decision log (`DECISIONS.md`) and product changelog (`CHANGELOG.md`)
- Living-document policy adopted (Last Updated + Status; Git as version history)

---

## 🚧 In Progress

- **Documentation foundation** — assembling and standardizing the Product Bible (this session).
- **Native Bridge Architecture** — `NATIVE_BRIDGE_ARCHITECTURE.md` drafted; **Status: Proposed**, awaiting ChatGPT (Product Architect) review before implementation.
- **Athlete app polish/automation** — remaining 5–10% is polish and automation, not new manual features.

---

## ⛔ Blocked / Awaiting Decision

- **Phase 2 native build** is gated on **architecture review of the bridge proposal** (ADR-004, ADR-005 are `Proposed`, not `Accepted`). Nothing should be built against the bridge contract until that review lands.
- No hard external blockers otherwise.

---

## ➡️ Next Up

1. ChatGPT reviews `NATIVE_BRIDGE_ARCHITECTURE.md`; move ADR-004/005 to `Accepted` (or revise).
2. Begin **Phase 2 — Native Shell**: HealthKit + Health Connect, push notifications, background sync, then App Store release.
3. Implement the bridge transport (`bridge.js`) + first native capability module (health) as a thin vertical slice.
4. Continue athlete-app polish/automation in parallel.

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
| — | `FEATURE_SPECIFICATION_TEMPLATE.md` | Template for new feature specs |
