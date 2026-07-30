# Compound Fitness — Project Status

**Last Updated:** 2026-07-30

**Status:** Direction changed 2026-07-30 — canary retired, sync being simplified, next work is the iOS shell + HealthKit. See the banner in HANDOVER.md.

> **Standing instruction, AMENDED by the Product Owner 2026-07-30:** the
> Architect review package is required for changes that touch the server or can
> lose data. Client and UI changes no longer need one. The original blanket rule
> (every task, 2026-07-25) proved heavier than the product warranted. A package = zip with `00-PROMPT.md`
> (copy-paste prompt), the diff/artifacts, reproducible test output generated
> inside the archive, and current docs.

> **Read this first**, then `HANDOVER.md` for the architecture traps and the
> safety rules. This file is where the project stands *right now* — keep it short
> and current. History belongs in `CHANGELOG.md` and `PROJECT_HISTORY.md`.

---

## Snapshot

Compound Fitness is a coaching platform (not a tracker) built as **one backend +
one PWA + thin native wrappers**, holding real health data for two real athletes.
The athlete app is ~90–95% complete. Phase 1 hardening is done; **Commit 10 (the
CAS client) is in canary**, and the canary is stopped on day one pending a
ruling.

### What is actually running

| Where | Build | State |
| --- | --- | --- |
| Production PocketBase (`rack.tail6fa16c.ts.net`) | CAS server kit + HOTFIX-001 | **live** since 2026-07-29 |
| Root client — what both athletes use | `2026-07-28.347-pb` (Lineage A) | **frozen**, cutover not authorized |
| `/canary/` | `2026-07-30.349-pb-c10` | published, **halted** on day one |
| Release candidate | `2026-07-30.353-pb-c10`, sha `f8cd8352…`, 1,207,162 bytes | **awaiting Architect review**, not published |

**There are two client lineages** (see `RECONCILIATION.md`). Lineage A is
`origin/main` — what the athletes run, syncing by writing PocketBase records
directly, never calling the CAS route. Lineage B is the Commit 10 work on
`integration/commit10-lineage-a` and has never been deployed to anyone. HOTFIX-001
is therefore **latent, not live-costing**: the deployed client never touches the
defective route, but it becomes live the moment B ships.

**P7 lockdown has NOT run and must not** until the CAS client ships — the
legacy-write bridge is active by design.

### Current focus — the canary stop

The canary was authorized, published with all 12 pre-publication gates green, and
opened by the Product Owner on a real iPhone. **The 48-hour window never
started.** Two findings stopped it, and rounds FIX-003 through FIX-007 have been
spent on them:

1. **FIX-003 — the ownership gate could not paint its own confirm dialog.**
   "No — set it aside" did nothing; the only responsive control was the unsafe
   one. Fixed and covered by `ownership-gate.browser.test.js`. Caught exactly
   where a canary is supposed to catch it: real hardware, real athlete.
2. **The red status dot — CLOSED OFF, NOT REPRODUCED.** This is the honest
   position and it is stated plainly in `deployment-path/STATUS_MODEL.md`. Four
   review rounds have closed every path that could produce it, but the original
   cause was never reproduced on the device. FIX-004 (a successful upload
   reporting failure) was approved *narrowly* and explicitly refused as the
   explanation. FIX-005 gave statuses **owners**; FIX-006 made the real shipping
   producers use the registry rather than only the tests; FIX-007 made success
   clear only its own source and made the registry visually authoritative.
   `cfDiag()` — a payload-free snapshot — exists so the next canary session is
   diagnosed from data instead of guesswork.

### Test suites

- **971 assertions** across 22 string suites — `node tests/run-all.js`.
  `deploy-rc.test.js` reports 0 there because it is environment-gated; with
  `CF_COMPOUND` set it is **65 assertions**, and that is the authoritative
  pipeline evidence.
- **294 assertions** across **14 browser suites** in `tests/browser/`
  (Playwright at `~/staging-cas/node_modules`, not in `run-all.js`). Five need a
  real PocketBase, spun up disposable and empty by `tests/browser/pbserver.js`;
  suites skip cleanly if `~/staging-cas/bin/pocketbase` is absent.

---

## ✅ Complete

**Athlete app (~90–95%)** — weight/photos/trends/recaps; workout logging with RPT
intelligence; cardio; nutrition, macros and meal planning; weekly goals; Coach
Max; GLP-1 & peptides; Apple Health import.

**Platform** — self-hosted PocketBase (cutover 2026-07-21); real logins, password
change, photo + health sync; GitHub-PAT storage path retired; expired sessions
never destroy unsynced local data.

**Hardening line** — Commits 1 → 1h, seven Architect review rounds, verdict
**READY-FOR-STAGING**, then the 75-case staging checklist executed with 0
failures (`tests/CHECKLIST_RESULTS.md`).

**CAS server kit** — staging-validated (172 assertions), deployed to production
2026-07-27 with the gate verified (20 checks, 0 failures), both athlete rows
byte-identical (`server/PRODUCTION_CUTOVER_RESULTS.md`).

**HOTFIX-001** — unstable idempotency hash over a Go map; deployed and verified
2026-07-29. Measured 11–12 of 12 identical retries refused before, 0 after.

**Commit 10 evidence gates** — all closed and approved: matrices, manifest
recovery, route contract, multi-context, harness, manual set-aside, client UX
fixes, release pipeline, cache/service-worker, and the single-flight build lock.

**I5d** — executed on production 2026-07-30: 11 passed, 0 failed, disposable
accounts torn down with verified absence, athletes byte-identical
(`server/I5D_RESULTS.md`).

---

## ⛔ Blocked / Awaiting Decision

- **Architect ruling on `.353-pb-c10`** and on republishing `/canary/` to restart
  day one from CANARY-01. Package delivered:
  `cf-canary-day1-status-v4-20260730.zip`. **Nothing republishes until it is
  accepted** — per pre-publication gate 5, a changed artifact hash returns for
  review rather than being substituted silently.
- **Root deployment** needs Architect release authorization *and* the Product
  Owner's explicit go-ahead. Neither has been given.
- **Phase 2 native build** is gated on architecture review of the bridge proposal
  (ADR-004, ADR-005 are `Proposed`, not `Accepted`).
- **Native background health ingestion must not be built** against the current
  whole-snapshot `appdata.data` model — the record-level sync design needs
  approval first.
- **Compound Knowledge Module** — plan written
  (`features/knowledge/implementation/00-FIRST-RESPONSE.md`), awaiting Architect
  approval. No module code written.

---

## ➡️ Next Up

1. Architect ruling on `.353` → republish `/canary/`, restart day one from
   CANARY-01 including the on-device Cancel step.
2. Run the 48-hour canary window on a real iPhone.
3. Final cutover package → Architect release authorization → PO root-deployment
   authorization → root cutover.
4. Lockdown (P7) once the CAS client is live and the bridge can be removed.
5. Remediation commits 2–8, 11 (client-only); 9–10 need the server work.
6. **M5–M7**: training sync protection, Backup V2, remove the vestigial GitHub
   layer. **M8–M10**: internal boundaries, product-logic defects,
   config/security cleanup.
7. Record-level synchronization design for review.
8. Phase 2 (Native Shell), once the bridge proposal is accepted.

Full phase detail: `ROADMAP.md`.

---

## Key Documents (reading order)

| Order | Doc | Purpose |
| ----- | --- | ------- |
| 1 | `STATUS.md` (this file) | Where the project is right now |
| 2 | `HANDOVER.md` | Project brief: architecture traps, branch state, safety rules, recurring failure classes |
| 3 | `RECONCILIATION.md` | The two client lineages — read before reasoning about what is deployed |
| 4 | `VISION.md` | Why the platform exists; north star |
| 5 | `PRODUCT_BIBLE.md` | Core principles & the feature litmus test |
| 6 | `PROJECT_HISTORY.md` | How we got here; key decisions in prose |
| 7 | `ROLES_AND_WORKFLOW.md` | Who does what; the 5-step feature process |
| 8 | `ROADMAP.md` | The five phases |
| 9 | `TECHNICAL_ARCHITECTURE.md` | System-level architecture |
| 10 | `NATIVE_BRIDGE_ARCHITECTURE.md` | PWA↔native boundary (proposed) |
| 11 | `DECISIONS.md` | Architectural decision log (read before reversing anything) |
| 12 | `CHANGELOG.md` | Product evolution over time |
| — | `deployment-path/STATUS_MODEL.md` | The status ownership/projection model and the open question |
| — | `deployment-path/CANARY_DAY1_STOP.md` | Why the canary window never started |
| — | `deployment-path/PUBLISHED.json` | What is actually published, vs `RELEASE.expected.json` |
| — | `REMEDIATION_PLAN_V2.md` | **Authorized** M1–M4 remediation plan (supersedes v1) |
| — | `FEATURE_SPECIFICATION_TEMPLATE.md` | Template for new feature specs |
