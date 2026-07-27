# Repository Placement — Required

Install this package inside the target repository at:

```text
features/
└── knowledge/
    ├── architecture/
    │   ├── 00-PROMPT.md
    │   ├── 01-PRODUCT-ARCHITECTURE.md
    │   ├── 02-UX-AND-VISUAL-SPEC.md
    │   ├── 03-DATA-AND-SEARCH-CONTRACTS.md
    │   ├── 04-IMPLEMENTATION-AND-ACCEPTANCE.md
    │   ├── 05-COMPOUND-BRAND-STYLE-GUIDE.md
    │   └── CODEX/
    │       └── max-rogers-fitness-knowledge-codex.md
    ├── implementation/
    ├── reviews/
    ├── tests/
    └── README.md
```

## Codex authority

Before planning or coding:

1. Read every architecture file in numeric order.
2. Read `architecture/CODEX/max-rogers-fitness-knowledge-codex.md`.
3. Treat the Codex as the authoritative current knowledge source.
4. Preserve its evidence labels and uncertainty.
5. Do not transform `INFERRED`, `NEEDS_TRANSCRIPT`, or title/description-derived material into direct quotations.
6. Do not silently merge Max Rogers doctrine with general fitness knowledge.
7. Every synthesized answer must retain source traceability.
8. Build an adapter around the current Codex rather than rewriting its doctrine during the first implementation.
9. Place implementation review packages under `features/knowledge/reviews/`.

---

# 00-PROMPT — Compound Knowledge Module Build

You are Claude Code, acting as **Lead Engineer** for Compound Fitness.

## Roles

- **Product Owner:** the user
- **Product Architect:** ChatGPT
- **Lead Engineer:** Claude Code

The Product Owner decides priorities and approves scope.

The Product Architect decides **what the product should do**, how it should fit the Compound product, the required UX behavior, and the acceptance criteria.

You decide **how to implement it**.

Do not reinterpret the product into a generic chat app, documentation portal, or standalone microsite.

---

# Your assignment

Build a new **Compound Knowledge Module** that may later be integrated into the main Compound Fitness app.

The module searches and answers questions from the existing Compound Codex and video library.

It must feel like a native Compound feature—not a separate product.

The core visible experience is:

# **Coach Max**
## **Ask Compound**

The Codex is the internal knowledge source. Athletes should not need to understand the word “Codex” to use the feature.

---

# Read these files in order

1. `00-PROMPT.md`
2. `01-PRODUCT-ARCHITECTURE.md`
3. `02-UX-AND-VISUAL-SPEC.md`
4. `03-DATA-AND-SEARCH-CONTRACTS.md`
5. `04-IMPLEMENTATION-AND-ACCEPTANCE.md`
6. `05-COMPOUND-BRAND-STYLE-GUIDE.md`

Treat these files as the authoritative product requirements.

If an existing codebase conflicts with them, report the conflict before silently changing the product behavior.

---

# First response required before coding

Before modifying code, return:

1. Your understanding of the product.
2. The existing project structure you found.
3. The current search and Codex architecture.
4. The proposed component structure.
5. The proposed search/answer flow.
6. The proposed integration boundary with Compound Fitness.
7. The data contract you will implement.
8. Any assumptions.
9. Any blockers.
10. A commit plan.

Do not begin broad implementation until this plan is internally consistent.

---

# Primary product rule

This is not “ChatGPT with Compound colors.”

The product must be:

- grounded in Compound knowledge,
- action-oriented,
- source-transparent,
- calm,
- structured,
- athlete-facing,
- reusable by other Compound features.

Every synthesized answer should answer:

1. **What should I do?**
2. **Why does it apply?**
3. **What evidence supports it?**
4. **What should I look at next?**

---

# Scope

Build:

- Ask mode
- Search mode
- Library mode
- Compound visual integration
- reusable search/result services
- source citations
- evidence display
- athlete-context hooks
- related content
- clear empty/loading/error states
- responsive and accessible UI
- testable data contracts

Do not build unless already supported by the source project:

- open-ended internet search,
- generic AI answers without Codex grounding,
- social features,
- messaging,
- a new authentication system,
- a second bottom navigation shell,
- unrelated Compound Fitness features,
- production deployment.

---

# Build outcome

Return:

1. Updated source.
2. A clear file map.
3. Setup/run instructions.
4. Tests.
5. A product behavior walkthrough.
6. Screenshots or static previews if the environment supports them.
7. A list of assumptions and unresolved integration points.
8. A handoff package for Product Architect review.

Do not claim production readiness.

Request Product Architect review after implementation.
