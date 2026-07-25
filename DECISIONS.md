# Compound Fitness — Architectural Decision Log

**Last Updated:** 2026-07-25

**Status:** Active

A running log of every major architectural and product-shaping decision, and **why** it was made. The purpose is durability of context: future contributors — human or AI — should be able to read this before changing direction, so that good decisions are not silently undone because the reasoning behind them was lost.

## How to use this log

- **Append, don't rewrite.** Decisions are historical facts. If a decision is reversed, add a new entry that **supersedes** the old one and update the old entry's status — never delete it.
- **One decision per entry.** Keep each entry small and focused.
- **Status values:** `Accepted`, `Proposed`, `Superseded by ADR-NNN`, `Deprecated`.
- **Every entry answers:** what was decided, what the alternatives were, and what it costs us.

> **Provenance note:** The entries below were reconstructed from the Product Bible documents (Vision, Product History, Technical Architecture) and the available git history. Dates are exact where git or the docs record them, and marked *approx.* where they were inferred from the product-planning period. Going forward, add entries at decision time.

---

## Entry Template

```
## ADR-NNN — <Short title>

- **Date:** YYYY-MM-DD
- **Status:** Accepted | Proposed | Superseded by ADR-NNN | Deprecated
- **Deciders:** Product Owner / ChatGPT (Product Architect) / Claude Code (Lead Engineer)

### Context
What problem or force prompted this decision?

### Decision
What we are doing.

### Alternatives considered
What else we weighed, and why we passed.

### Consequences
What this makes easy, what it costs, and what it commits us to.
```

---

## ADR-001 — Build a platform, not a tracker

- **Date:** 2026 (approx., product-planning period)
- **Status:** Accepted
- **Deciders:** Product Owner, ChatGPT

### Context
The project began as a personal fitness tracker. As it matured, it became clear the real opportunity was coaching — connecting tracking, human coaches, AI, and accountability — not another dashboard of numbers.

### Decision
Design Compound Fitness as a **coaching platform** serving athletes, clients, human coaches, AI coaches, and coaching businesses — not a single-purpose tracking app.

### Alternatives considered
- Stay a polished personal tracker. Rejected: data alone doesn't create behavior change; the differentiated value is coaching.

### Consequences
- Every feature is now judged by "does this improve coaching/outcomes?" (see `ROLES_AND_WORKFLOW.md` Golden Rule).
- Raises the long-term architectural bar (multi-tenant, coach tooling, billing) even while the athlete app is finished first.

---

## ADR-002 — One backend, one PWA, thin native wrappers, multiple experiences

- **Date:** 2026 (approx., product-planning period)
- **Status:** Accepted
- **Deciders:** Product Owner, ChatGPT, Claude Code

### Context
A platform serving athletes and coaches across web, iOS, and Android could easily fragment into several separate apps and codebases.

### Decision
Maintain **one backend, one primary web application (PWA)**, with **thin native wrappers**, delivering **multiple user experiences** (athlete app, coach portal, future AI systems) from the same platform.

### Alternatives considered
- Separate native apps per platform/persona. Rejected: multiplies build and maintenance cost, splits logic, slows iteration.

### Consequences
- Product logic ships continuously via the PWA without app-store review.
- Requires disciplined role/permission handling since one app serves many personas.
- Commits us to the native-shell boundary in ADR-003.

---

## ADR-003 — The native shell is thin; native only when necessary

- **Date:** 2026 (approx., product-planning period)
- **Status:** Accepted
- **Deciders:** Product Owner, ChatGPT, Claude Code

### Context
Rebuilding the working PWA as native apps would be a large effort for little product gain — most of the product needs nothing native.

### Decision
Keep the PWA as the primary interface. Native wrappers exist **only** to expose device capabilities the web cannot reach: HealthKit, Health Connect, Bluetooth, push, background sync, camera, biometrics, native permissions, and future Apple Watch / Wear OS. Everything else stays in the PWA.

### Alternatives considered
- Full native rewrite. Rejected: dramatically higher cost, no matching product benefit, loses continuous web deployment.

### Consequences
- Dramatically reduces development effort while preserving future flexibility.
- The web/native boundary must be well-defined and stable — addressed by ADR-004.

---

## ADR-004 — Native bridge is a single generic transport with self-describing capabilities

- **Date:** 2026-07-24
- **Status:** Proposed
- **Deciders:** Claude Code (design), pending ChatGPT review

### Context
ADR-003 requires a clean, stable web↔native boundary. Two goals pull against each other: a *small* bridge that's ergonomic to call, and a bridge that never needs editing when future native capabilities are added.

### Decision
Inject **one** primitive (`CompoundNative.invoke` / `on`) carrying versioned request/response/event envelopes. Capabilities are **string-addressed methods** discovered at runtime via `system.capabilities`, implemented on the native side as a registry of self-contained modules. See `NATIVE_BRIDGE_ARCHITECTURE.md`.

### Alternatives considered
- A hand-written method per capability (`getHeartRate()`, `schedule()`, …). Rejected: the injected surface grows with every capability and couples web to native at compile time.

### Consequences
- Adding a capability touches only new files (one native module + one thin web façade); transport, wrapper, and existing capabilities stay unchanged.
- The identical web build runs as a plain browser PWA (no bridge → native features hidden) and inside the wrapper.
- Requires runtime capability/version detection everywhere native is used (handles PWA-vs-shell drift).

---

## ADR-005 — Background health sync flows native → backend directly

- **Date:** 2026-07-24
- **Status:** Proposed
- **Deciders:** Claude Code (design), pending ChatGPT review

### Context
When the OS wakes the app in the background, the WebView is not running, so the web layer cannot perform the sync.

### Decision
The native health module reads new samples and **uploads raw data to the backend directly** using a narrowly-scoped background token, advances a per-type cursor, and later **emits an event** the PWA consumes when foregrounded. The web is notified, never depended upon.

### Alternatives considered
- native → web → backend. Rejected: the web may be suspended/killed; samples would be lost or delayed.

### Consequences
- No lost samples during background operation.
- Requires a secure background token separate from the web session and idempotent uploads (dedupe by device id + timestamp).

---

## ADR-006 — Raw imported data is kept separate from calculated metrics

- **Date:** 2026 (approx., product-planning period)
- **Status:** Accepted
- **Deciders:** Product Owner, ChatGPT

### Context
Derived metrics (HR zones, weekly volume, trends, recovery signals) will improve over time as algorithms mature.

### Decision
Always store **raw** imported device data separately from **calculated** metrics. Derivation happens in the web/backend layer, not the native shell.

### Alternatives considered
- Store only computed values. Rejected: recomputing/improving algorithms later would be impossible without the original data.

### Consequences
- Algorithms can be revised without re-importing history.
- Slightly more storage and a clear raw-vs-derived data contract across the bridge.

---

## ADR-007 — Transparency over mystery scores

- **Date:** 2026 (approx., product-planning period)
- **Status:** Accepted
- **Deciders:** Product Owner, ChatGPT

### Context
Competitors surface proprietary single-number scores (e.g. recovery/readiness) that users cannot interrogate.

### Decision
Do **not** reproduce opaque proprietary scores. Display transparent, explainable trends (HRV trend, resting HR trend, sleep trend, training load, zone minutes) and let AI and coaches interpret them. Every recommendation must be explainable.

### Alternatives considered
- Compute a Compound "readiness score." Rejected: contradicts the "explain everything" principle and erodes trust.

### Consequences
- Users and coaches can always trace which data led to a recommendation.
- We forgo the marketing simplicity of a single hero number.

---

## ADR-008 — AI amplifies coaches; humans retain final authority

- **Date:** 2026 (approx., product-planning period)
- **Status:** Accepted
- **Deciders:** Product Owner, ChatGPT

### Context
AI could be positioned to replace coaches; the product philosophy holds that coaching relationships and judgment are the core value.

### Decision
AI reduces friction — explains trends, drafts reports/messages, surfaces clients needing attention — but **never** sends or changes anything on its own. The human coach reviews and holds final authority.

### Alternatives considered
- Fully autonomous AI coaching. Rejected: removes human judgment, accountability, and the relationship that drives adherence.

### Consequences
- Every AI action is a draft/suggestion behind a human confirmation step.
- Coach-facing AI must be designed around review workflows, not autonomy.

---

## ADR-009 — Three-role, spec-first development workflow

- **Date:** 2026 (approx., product-planning period)
- **Status:** Accepted
- **Deciders:** Product Owner

### Context
Product and engineering concerns were getting entangled, risking features built "because they're possible."

### Decision
Separate roles: **Product Owner** (what/why), **ChatGPT** as Product Architect (specs, UX, architecture review), **Claude Code** as Lead Engineer (how/implementation). Features follow a 5-step flow: discuss → spec → implement → review → merge. See `ROLES_AND_WORKFLOW.md` and `FEATURE_SPECIFICATION_TEMPLATE.md`.

### Alternatives considered
- Ad-hoc "build it and see." Rejected: leads to scope creep and inconsistency with the Product Bible.

### Consequences
- Every non-trivial feature gets a written spec and an architecture review before merge.
- Slightly more up-front process in exchange for consistency and fewer reversals.

---

## ADR-010 — Self-hosted PocketBase backend

- **Date:** 2026-07-21
- **Status:** Accepted
- **Deciders:** Product Owner, Claude Code

### Context
The app needed real accounts, photo sync, and a health-import path with a backend under our control.

### Decision
Cut over to a **self-hosted PocketBase** backend (build `2026-07-21.288-pb`). Retired the previous GitHub-PAT-based storage path and deleted the stored token.

### Alternatives considered
- Continue with the prior GitHub-backed storage. Rejected: not a real backend for auth/sync; the stored PAT was a security liability.

### Consequences
- Real logins, password change, "keep me signed in," and server-side photo/health sync.
- We own hosting/ops for the backend; migrations and availability are now our responsibility.

---

## ADR-011 — Never let session expiry destroy unsynced local data

- **Date:** 2026-07-21
- **Status:** Accepted
- **Deciders:** Claude Code

### Context
An expired session could clobber local data that hadn't yet synced, risking user data loss.

### Decision
An expired session must never destroy unsynced local data; boot-time recency guards protect local state against stale server pushes.

### Alternatives considered
- Treat the server as always authoritative on auth failure. Rejected: causes silent data loss, which is unacceptable for health logs.

### Consequences
- More careful local-vs-server reconciliation logic.
- User trust preserved; logging feels safe even across auth hiccups.

---

## ADR-012 — Documentation is living; no semantic versions; STATUS.md is the state of record

- **Date:** 2026-07-24
- **Status:** Accepted
- **Deciders:** Product Owner

### Context
The Bible docs were briefly given hand-maintained semantic version numbers (1.0, then 2.0). Maintaining independent document versions by hand is noisy, drifts from reality, and duplicates what Git already records.

### Decision
Treat all documentation as **living documents**. Remove semantic version numbers. Each doc carries a **Last Updated** date and a **Status** (`Active` / `Proposed` / `Deprecated`) at the top. **Git history is the authoritative version history.** In addition, maintain a single **`STATUS.md`** at the repo root as the current-state source of truth — updated at each major milestone and read first at the start of every session.

### Alternatives considered
- Per-doc semantic versions. Rejected: manual, noisy, and redundant with Git.

### Consequences
- Docs stay maintainable: "what changed" is answered by Git; "is this current" by the Last Updated date and Status.
- `STATUS.md` becomes the fastest way for a human or AI to sync on project state at the start of a session.
- Supersedes the brief experiment of numbering the docs (`Version: 1.0` → `2.0`).

---

## ADR-013 — Local-first sync safety: revisions, fingerprint baselines, no silent replacement

- **Date:** 2026-07-25
- **Status:** **Superseded in part** — see the Correction at the end of this entry
- **Deciders:** Product Owner (brief), ChatGPT (Product Architect), Claude Code (implementation)

### Context
The live athlete app used a single boolean dirty flag and reconciled by comparing the newest weigh-in/day key. Both are unsound for a local-first app syncing a whole-document snapshot: a push that succeeded marked the app clean even if the user edited during the request, and a date comparison cannot see an independent change (a GLP-1 dose, symptom, settings change, historical correction, skip, or routine edit).

### Decision
Until record-level sync exists:
1. **Monotonic revisions per sync track** (core, training) replace the dirty boolean. A response may mark a track clean only if the local revision has not advanced since that request's payload was built; success is a high-water mark so out-of-order responses cannot regress it.
2. **A content fingerprint of the last agreed state** is the conflict baseline, replacing date heuristics. Local dirty + server moved ⇒ **conflict**, never a silent winner. *(Superseded: the "server unchanged ⇒ push" half is unsafe — a fingerprint match cannot prevent a concurrent write landing after the read. No automatic whole-snapshot write occurs before server CAS.)*
3. **Nothing that can replace non-empty local data runs without a recovery snapshot first** (IndexedDB, account-scoped, newest 3).
4. Ordinary refresh means *reconcile*, not *replace*; the destructive path is a separate, explicitly labeled, confirmed action.

### Alternatives considered
- Keep date comparison, add more fields to it. Rejected: it is structurally blind to independent edits; enumerating fields is a losing race.
- Last-writer-wins on the whole snapshot. Rejected: guarantees silent data loss, the exact failure being fixed.
- Jump straight to record-level sync. Rejected: too large to land safely on a live app in one step; the design is being produced for review separately.

### Consequences
- Users can now be asked to resolve a genuine conflict; the default always preserves the device's data.
- Whole-snapshot sync remains **transitional and is not concurrency-safe** until server-enforced CAS is deployed. It must not be extended to native background health ingestion.
- Adds a revision ledger (`wl_rev`) and a recovery store to migrate later.

---

### Correction (2026-07-25)

Two claims made when this ADR was written are wrong and are corrected here rather than edited away:

1. **Fingerprints are not concurrency control.** They detect *known* divergence. They cannot prevent two devices that share a baseline from both believing the server is unchanged and overwriting each other. **Server-enforced revisions (CAS) are the concurrency mechanism**; fingerprints are a secondary detector only. See `REMEDIATION_PLAN_V2.md` §4.
2. **The legacy dirty flag migration is unsafe.** The migration at line 5326 reads the flag, but only exact `"1"` is preserved as dirty — missing, unknown, malformed, or previously incorrectly-cleared state is treated as clean. Its own comment claims the opposite ("an unknown state is treated as dirty"). The prior in-flight bug may already have cleared the flag, so "clean" is not trustworthy. Corrected by canonical content comparison when no trusted baseline exists.

Status of this ADR is therefore **superseded in part** by the M1–M4 remediation.

---

## ADR-014 — Photos are owned by an account, not by a device

- **Date:** 2026-07-25
- **Status:** Accepted
- **Deciders:** Product Owner (brief), Claude Code (implementation)

### Context
IndexedDB photo records and the photo→server map carried no owner. After a logout both survived, so the next account's first sync treated the previous user's photos as its own pending uploads — a privacy breach — and, because the stale map still listed them, mirrored bogus remote deletions back onto the device. Separately, the server listing fetched a single 500-record page and treated absence from it as proof of deletion.

### Decision
Every local photo carries an immutable `ownerId`; display, upload, delete, reconcile and mapping all require it to equal the authenticated user. The photo→server map is keyed per account. Legacy ownerless photos are **quarantined** — never auto-attributed to whoever logs in next — and are claimable only by an explicit user action. Remote deletion may be inferred **only** from a complete, successful enumeration of all pages.

### Alternatives considered
- Wipe photo blobs on logout. Rejected: destroys photos that may not have uploaded yet — data loss to fix a privacy bug.
- Auto-assign legacy photos to the current user. Rejected: on a shared device that is the leak, restated.

### Consequences
- Photos cannot cross account boundaries on a shared device.
- A partial or failed listing now surfaces a recoverable sync error instead of deleting.
- The discarded legacy map is re-established safely on the next sync via the server's UNIQUE (user, localId) index.
