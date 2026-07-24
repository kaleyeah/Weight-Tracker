# Compound Fitness

A coaching platform (not a tracker) built as **one backend + one PWA + thin native wrappers**. The app currently ships as a PWA; native iOS/Android shells exist only to expose device capabilities the web can't reach.

> Repo/history note: this repository is historically named **Weight-Tracker**. The product is **Compound Fitness** — the app began as a personal weight tracker and grew into a coaching platform.

## Start here

**👉 Read [`STATUS.md`](STATUS.md) first.** It's the single source of truth for where the project stands right now — what's complete, in progress, blocked, and next. Every session (human or AI) should start there before doing anything else.

## Documentation

The Product Bible lives at the repo root. Suggested reading order:

| Order | Doc | Purpose |
| ----- | --- | ------- |
| 1 | [`STATUS.md`](STATUS.md) | Where the project is right now (read first) |
| 2 | [`VISION.md`](VISION.md) | Why the platform exists; north star |
| 3 | [`PRODUCT_BIBLE.md`](PRODUCT_BIBLE.md) | Core principles & the feature litmus test |
| 4 | [`PROJECT_HISTORY.md`](PROJECT_HISTORY.md) | How we got here |
| 5 | [`ROLES_AND_WORKFLOW.md`](ROLES_AND_WORKFLOW.md) | Who does what; the 5-step feature process |
| 6 | [`ROADMAP.md`](ROADMAP.md) | The five phases |
| 7 | [`TECHNICAL_ARCHITECTURE.md`](TECHNICAL_ARCHITECTURE.md) | System-level architecture |
| 8 | [`NATIVE_BRIDGE_ARCHITECTURE.md`](NATIVE_BRIDGE_ARCHITECTURE.md) | PWA↔native boundary (proposed) |
| 9 | [`DECISIONS.md`](DECISIONS.md) | Architectural decision log — read before reversing anything |
| 10 | [`CHANGELOG.md`](CHANGELOG.md) | Product evolution over time |
| — | [`FEATURE_SPECIFICATION_TEMPLATE.md`](FEATURE_SPECIFICATION_TEMPLATE.md) | Template for new feature specs |

## Maintaining these docs

Documentation is treated as **living documents**. A few rules keep them trustworthy:

- **No semantic version numbers on docs.** Each file carries a `Last Updated` date and a `Status` (`Active` / `Proposed` / `Deprecated`) at the top. **Git history is the authoritative version history** — use `git log` / `git blame` to see what changed and when.
- **Update [`STATUS.md`](STATUS.md) at every major milestone.** Keep it short and current (state, not history). It's the most-read file — stale status is worse than none.
- **Log decisions in [`DECISIONS.md`](DECISIONS.md).** Append a new ADR when you make a significant architectural or product call. Never rewrite or delete an entry — if a decision is reversed, add a new one that supersedes it and update the old entry's status. This is what stops good decisions from being undone later for lack of context.
- **Record product-level changes in [`CHANGELOG.md`](CHANGELOG.md).** High-level, human/AI-readable — not a commit dump.
- **Bump `Last Updated`** whenever you meaningfully edit a doc.

## Development workflow

Features follow a 5-step process (discuss → spec → implement → review → merge) across three roles — Product Owner (what/why), ChatGPT as Product Architect (specs & review), Claude Code as Lead Engineer (how). See [`ROLES_AND_WORKFLOW.md`](ROLES_AND_WORKFLOW.md) and start new specs from [`FEATURE_SPECIFICATION_TEMPLATE.md`](FEATURE_SPECIFICATION_TEMPLATE.md).

## Codebase

- `index.html` — the PWA (single-file app).
- Backend runs on a self-hosted PocketBase instance (see [`DECISIONS.md`](DECISIONS.md), ADR-010).
