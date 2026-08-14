# Compound Fitness — Design

**Last Updated:** 2026-08-14

**Status:** Active

> This document consolidates the product, system, and interface design of
> Compound Fitness in one place. It synthesizes the authoritative sources —
> `VISION.md`, `PRODUCT_BIBLE.md`, `TECHNICAL_ARCHITECTURE.md`,
> `CODE_ARCHITECTURE.md`, and `DECISIONS.md` — and links to them rather than
> replacing them. Where this file and an ADR disagree, the ADR wins.

---

## 1. What We Are Designing

Compound Fitness is a **coaching platform, not a tracker** (ADR-001). It
connects tracking, human coaching, AI-assisted coaching, nutrition, workout
programming, and accountability into one experience, built as:

**One backend + one PWA + thin native wrappers** (ADR-002, ADR-003).

The north star for every design decision: **make the next best action clear** —
for the athlete and for the coach, every day.

---

## 2. Design Principles

These are the tests every screen, feature, and flow must pass
(from `PRODUCT_BIBLE.md` and `VISION.md`):

1. **Automate everything.** Users never enter data twice. Import from devices
   whenever possible; calculate whenever possible.
2. **Explain everything.** No mystery scores. Every recommendation shows *why*,
   and which data led to it (ADR-007).
3. **Trends beat snapshots.** Emphasize weekly averages and change over time;
   never encourage overreacting to a single day's reading.
4. **Coach first.** AI amplifies coaches; humans retain final authority
   (ADR-008). AI may summarize and draft, but the coach controls what is sent.
5. **Simplicity is a feature.** If a feature needs a tutorial, it is too
   complicated. Complexity may live inside the system, never in the experience.
6. **Respect context.** Medication, illness, travel, stress, and life events
   are displayed alongside progress data — the goal is to explain *why* things
   changed, not just *what* changed.
7. **Data must lead to action.** A metric that doesn't inform a decision
   should not dominate the experience.

### What the design must never become

A dashboard of meaningless numbers, an opaque readiness-score generator, a
notification firehose, a substitute for medical care, or a clone of another
fitness app.

---

## 3. Experience Design

### 3.1 The athlete experience

The athlete app is designed as a **clear daily plan**, not a collection of
tracking screens. Opening the app answers: what do I eat, what do I train,
what habits need attention, am I on track, and what changed since my last
check-in. Logging is fast; imported data appears automatically; consistency is
rewarded without guilt, fear, or obsession.

### 3.2 The coach experience

The coach dashboard is designed around **decisions and exceptions**. A coach
should never need to inspect every client daily — the dashboard surfaces
missed check-ins, declining adherence, unusual weight changes, low training
completion, and clients awaiting a response, with supporting data one tap away.

### 3.3 Product layers

| Layer | Name | Status |
| ----- | ---- | ------ |
| 1 | Athlete App (PWA) | Shipping (~90–95% complete) |
| 2 | Coach Dashboard | Planned |
| 3 | AI Coaching (Coach Max) | Partial — nightly/weekly recaps live |
| 4 | Business Platform | Vision |

---

## 4. System Design

```
Native App Shell        (HealthKit / Health Connect, push, Bluetooth,
      ↓                  camera, biometrics — nothing else; kept thin)
JavaScript Bridge       (single generic transport, self-describing
      ↓                  capabilities — ADR-004, Proposed)
     PWA                (UI, navigation, charts, logging, AI chat,
      ↓                  settings — the PWA owns the product)
 Backend API            (self-hosted PocketBase — ADR-010: auth,
      ↓                  sync, media, messaging, reports)
  Database
```

Key structural decisions:

- **The PWA owns the product.** Native shells exist only to expose device
  capabilities the web cannot reach (ADR-003).
- **Background health sync flows native → backend directly** (ADR-005,
  Proposed) — but must not be built against the current whole-snapshot data
  model until record-level sync is approved (see `STATUS.md`).
- **Raw imported data is kept separate from calculated metrics** (ADR-006),
  so calculations can improve over time without losing original information.

### 4.1 The shipping client

The current athlete app is a **single-file, dependency-free PWA**
(`index.html`, ~6,500 lines): no framework, no build step, one `<script>`
block of vanilla JS with ~600 plain functions. Navigation is `data-view`
attributes dispatched through a central `render()` router — no URL routing.
Full detail: `CODE_ARCHITECTURE.md`.

### 4.2 Data design

Local-first (ADR-011, ADR-013):

- **`localStorage`** is the primary store — one JSON payload (`wl_v1`)
  holding settings, weights, food, workouts, health metrics, notes, GLP-1
  data, and Coach Max recaps.
- **`IndexedDB`** holds binary progress photos, keyed by date. Photos are
  owned by the account, not the device (ADR-014).
- **PocketBase** is the cloud copy for auth and multi-device sync. Sync is
  currently whole-snapshot and not concurrency-safe; the CAS
  (compare-and-swap) client is in canary. Session expiry must never destroy
  unsynced local data (ADR-011).

Everything works offline; the cloud is reconciliation, not the source of
truth for the session in front of the user.

---

## 5. Interface Design System

### 5.1 Typography

- **Manrope** (400/500/700/800) — primary sans (`SANS`), UI and headings.
- **Barlow** (400/500/600) — secondary/condensed contexts.
- A monospace stack (`MONO`) for numeric/tabular data.

Google Fonts is the app's only external resource.

### 5.2 Color and theming

Theming is driven by **CSS custom properties** applied at the root
(`applyTheme()`), with selectable themes in Settings. Core dark-theme tokens:

| Token | Value | Role |
| ----- | ----- | ---- |
| `--bg` | `#0F1218` | App background |
| `--card` / `--card2` | `#1A2029` / `#212836` | Surfaces |
| `--text` / `--muted` / `--faint` | `#EDF1F7` / `#8791A3` / `#5A6474` | Text hierarchy |
| `--accent` | `#F5B544` (amber) | Primary accent, weekly average |
| `--good` | `#5CD6A0` (green) | Positive states, goal line |
| `--bad` | `#F26D5B` (red) | Negative states |
| `--reg` | `#7C93F5` (blue) | Regression/trend line |
| `--mac-p` / `--mac-c` / `--mac-f` | blues `#A9C0DE`→`#566F92` | Protein / carbs / fat |

Charts carry their own token set (grid, axis, actual, average, regression,
goal) so trend visuals stay consistent across screens — the amber weekly
average and blue regression line are the visual embodiment of "trends beat
snapshots." Header modes (e.g. vacation, sick) tint the header gradient,
keeping life context visible in the chrome itself (§2, principle 6).

### 5.3 Screens

One `view_*` renderer per screen: `overview`, `weight`, `summary`, `train`,
`workout`, `liftview`, `routine`, `rlaunch`, `exlib`, `cardio`, `photos`,
`diary`, `settings`, `glptimeline`, plus quick-log sub-flows (`wtadd`,
`quicklog`, `actadd`). The overview is the "daily plan" surface; everything
else is one tap deep.

### 5.4 Voice and feedback

Coach Max (the AI coach) communicates through nightly and weekly recaps with
expressive mood faces and unread badges — feedback is conversational and
explanatory, never a bare score. Trend/pace/forecast displays are suppressed
below 7 weigh-ins rather than showing noisy, misleading early data.

---

## 6. Design Constraints and Open Questions

- **Two client lineages exist** (`RECONCILIATION.md`); design changes land on
  the Commit 10 line, and nothing republishes without Architect acceptance.
- **The native bridge is proposed, not built** (ADR-004/005 are `Proposed`).
  Health import today is a JSON hand-off, not a live bridge.
- **Record-level sync design** is required before native background health
  ingestion — the whole-snapshot model cannot support it safely.
- Known cleanup: the vestigial GitHub sync layer and the hardcoded PocketBase
  base URL.

---

## 7. How to Use This Document

- Designing a new feature? Start with the litmus test in §2 and
  `FEATURE_SPECIFICATION_TEMPLATE.md`, then follow the 5-step process in
  `ROLES_AND_WORKFLOW.md`.
- Changing structure or reversing a call? Read `DECISIONS.md` first, and log
  a superseding ADR — never silently reverse one.
- Checking what's actually live? `STATUS.md` is the state of record
  (ADR-012).
