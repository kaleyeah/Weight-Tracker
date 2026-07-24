# Compound Fitness — Architectural Decision Log

**Version:** 1.0

A running log of every major architectural and product-shaping decision, and **why** it was made. The purpose is durability of context: future contributors — human or AI — should be able to read this before changing direction, so that good decisions are not silently undone because the reasoning behind them was lost.

## How to use this log

- **Append, don't rewrite.** Decisions are historical facts. If a decision is reversed, add a new entry that **supersedes** the old one and update the old entry's status — never delete it.
- **One decision per entry.** Keep each entry small and focused.
- **Status values:** `Accepted`, `Proposed`, `Superseded by ADR-NNN`, `Deprecated`.
- **Every entry answers:** what was decided, what the alternatives were, and what it costs us.

> **Provenance note (v1.0):** The entries below were reconstructed from the Product Bible documents (Vision, Product History, Technical Architecture) and the available git history. Dates are exact where git or the docs record them, and marked *approx.* where they were inferred from the product-planning period. Going forward, add entries at decision time.

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
