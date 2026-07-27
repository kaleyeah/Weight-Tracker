# Compound Fitness — Project Status

**Last Updated:** 2026-07-25

**Status:** Active

> **Standing instruction (Product Owner, 2026-07-25):** every completed task ends with a ChatGPT (Product Architect) review package — built and delivered automatically, without being asked. A package = zip with `00-PROMPT.md` (copy-paste prompt), the diff/artifacts, reproducible test output generated inside the archive, and current docs.

> **Read this first.** This is the single source of truth for where the project stands right now. Both humans and AI should read it at the start of every session before doing anything else. Update it whenever a major milestone completes or the current focus shifts — keep it short and current, not a history log (that's `CHANGELOG.md`).

---

## Snapshot

Compound Fitness is a coaching platform (not a tracker) built as **one backend + one PWA + thin native wrappers**. The **athlete app is ~90–95% complete** and running on a self-hosted PocketBase backend. Current focus is **live-app safety & architecture hardening** — making the athlete app safe enough to be the foundation for Phase 2. No coach-facing features exist yet.

- **Current phase:** Phase 1 (Athlete App) + **hardening brief (M1–M10)** → Phase 2 (Native Shell).
- **Hardening progress:** the emergency client hardening is at **Commit 1e** (five review rounds, each verdict fully implemented). 1d's verdict found four remaining races/defects — all fixed in 1e: revision- and session-conditional adoption (the recovery-wait overwrite race), coach preflight outcome enforcement, an immutable coach request context (the A→B→A hole), and phase-aware quarantine cleanup that can never roll back a committed recovery set. The 1e verdict passed all four 1d fixes and found two final blockers — both closed in **1f**: the destructive-operation guard is generalized (restore, import and logout-wipe now capture owner/session/revisions before the async safety copy and re-verify before acting — the same protection server adoption got in 1e), and quarantine boot-cleanup is content-conditional and stamp-isolated (a pending job deletes a value only while it still byte-matches that stamp's own quarantined copy, so newer data can never be erased; manifests are read back, parsed and length-verified before they count). The 1g verdict: **READY-FOR-STAGING** — both final blockers verified closed; the three non-blocking hardening notes (read-failure fails closed, defensive comps check, checklist count sentence) are already applied in build `.339-pb-c1g2`; dead superseded declarations are deferred to M7 as the Architect directed. The Architect confirmed the verdict carried over to `.339-pb-c1g2`; after the feature merges, the `.341` review found one integration defect (reopen vs. in-flight recap), closed in **Commit 1h** (per-day recap generation token; 277 tests; checklist grown to 75 cases) — awaiting the focused confirmation of `.342-pb-c1h`. Previously: the 1f verdict approved the destructive-guard architecture and both cleanup contracts, leaving two precise blockers — closed in **1g**: the destructive context now carries the COMPLETE raw workout string (the length+prefix "fingerprint" could miss same-length edits; exact comparison per the Architect's preferred option), and manifest validation enforces the exact {core, training, workout} component set (no subsets/duplicates/unknown keys/invalid sizes) at both phase-2 commit and export. M5–M10 + record-level sync design not started.
- **Backend:** self-hosted PocketBase (cutover 2026-07-21).
- **Latest internal build:** `2026-07-27.342-pb-c1h` (Commits 1→1h + the Product Owner's merged feature builds `.332`–`.339`: fiber, CSV export rework + BOM + totals, reopen completed day, Weekly Macros card, Progress Card). **277 tests pass.** The `.341` merge review verified the features don't reopen the write freeze but found ONE deterministic defect — reopening a completed day while a Coach recap regeneration was in flight let the late result silently restore the deleted recap. **Commit 1h closes it**: a per-day recap generation token is captured in the Coach request context and bumped first thing by `reopenDay()`, so every existing ctxOk() checkpoint invalidates the late result (ordinary mid-poll edits still merge — explicitly preserved and tested). Staging checklist expanded 67 → **75 cases** (new N section for the merged features). Awaiting the Architect's focused confirmation review of `.342` — staging must not begin until it returns.
- **🎉 CLIENT VERDICT: READY-FOR-STAGING** (Product Architect, 2026-07-25, after 7 review rounds), **confirmed to carry over to build `.339-pb-c1g2`**. That authorization applied to the pre-merge artifact; after the Product Owner's feature merges, the `.341` review returned **CHANGES REQUIRED** (one feature-integration defect, fixed in Commit 1h). The **75-case** staging run now waits on the Architect's focused confirmation of build `.342-pb-c1h`, then executes via the local Claude Code session (`server/LOCAL_AGENT_BRIEF.md`). This is *not* production approval — the staging checklist must still be executed and the server-kit staging gate is separate.

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

- **Commit 1b review verdict: CHANGES REQUIRED** (16 items) — worst findings: my global pbSave gate silently broke Coach Max + Apple Health inbox clearing, and signed-out edits never advanced revisions (resurrecting adopt-over-dirty). **Commit 1c implements all 16**: narrowed write policy (snapshots frozen; health/coachreq allowlisted against an existing row), revisions advance regardless of auth, owner-stamping gated (unknown+meaningful ⇒ claim screen pauses reconciliation, no auto-claim), mismatch screen no longer exports, pre-init boot guard, snapshot ownership propagated to every caller, quarantine verified before deletion, normalization wired into cfInputs/baselines/emptiness and corrected to the real GLP shape + dynamic defaults, empty/empty cleans the migration dirty state, training has its own emptiness rule, export carries training, executable integration harness (42 tests running the full script).
- **Commit 1 review verdict: CHANGES REQUIRED** — the decision table was fixed but the runtime write path was still open (`save()` → blind `cloudPush()`), plus cross-account first paint, auto-claim, and snapshot validation gaps. **Commit 1b closes all 15 required changes**: `pbSave` gated shut until CAS, schedulers inert, timers cancelled, Save button rewired, render ownership-gated, quarantine screen for unowned data, symmetric normalization, per-field snapshot validation, import protected, dirty-training pull blocked. 116 tests pass.
- **M1–M4 remediation** — review verdict on the first pass: **do not ship**. All 12 findings verified. Plan **approved with amendments**; `REMEDIATION_PLAN_V2.md` is the authorized plan (15 pre-coding items) and supersedes v1. One v1 claim was wrong and is corrected: the legacy dirty flag **is** read (line 5326) — the defect is that only exact `"1"` survives as dirty, while missing/malformed/wrongly-cleared state becomes clean. New hazard confirmed: duplicate `appdata` rows. (Historical note — the remediation has since been implemented through Commit 1d.)
- **Native Bridge Architecture** — `NATIVE_BRIDGE_ARCHITECTURE.md` drafted; **Status: Proposed**, awaiting review before implementation.
- **Athlete app polish/automation** — remaining 5–10% is polish and automation, not new manual features.

---

## ⛔ Blocked / Awaiting Decision

- **Commits 1–1d coded but NOT SHIPPED.** The 53-case staging checklist has not been run — no staging PocketBase is reachable here. Shipping on automated tests alone is explicitly disallowed.
- **Upward sync is deliberately frozen in this build** until server CAS deploys — edits stay local with a visible pending state and an export path (now including training). Coach Max recaps run only when core is clean; while dirty they pause with an honest message. Apple Health import still clears its inbox (allowlisted operational write).
- **Compare-and-swap (Fix 2): server kit v2 written** (addendum's 13 corrections applied) but **not yet staging-validated and not yet re-approved by the Architect** — its addendum verdict (CHANGES REQUIRED BEFORE STAGING) stands until the corrected suite passes on staging. Deployment is delegated to a local Claude Code session (`server/LOCAL_AGENT_BRIEF.md`).
- **Browser validation blocked** — no staging PocketBase reachable from this environment.
- **Phase 2 native build** is gated on **architecture review of the bridge proposal** (ADR-004, ADR-005 are `Proposed`, not `Accepted`).
- **Native background health ingestion must not be built** against the current whole-snapshot `appdata.data` model — the record-level sync design (M-design) has to be approved first.

---

## ➡️ Next Up

1. ✅ **PocketBase version discovered: v0.39.8** (Admin UI footer). Server kit written — `server/pb_hooks/cf_cas.pb.js`, `server/DEPLOYMENT.md`, `server/tests/cas-server-tests.sh`. **Deployment is delegated to a LOCAL Claude Code session** (the cloud environment cannot reach the Tailscale-only NAS): the Product Owner starts Claude Code on their own computer and points it at `server/LOCAL_AGENT_BRIEF.md`; it deploys to staging, runs the tests, and pushes `server/STAGING_RESULTS.md` back to this branch.
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
