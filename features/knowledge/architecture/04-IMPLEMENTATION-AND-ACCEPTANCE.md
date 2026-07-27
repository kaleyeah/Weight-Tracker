# 04 — Implementation and Acceptance

# Engineering approach

Use the existing project’s stack and conventions.

Do not introduce a framework rewrite merely to build this module.

Separate:

- retrieval,
- answer construction,
- source formatting,
- athlete context,
- UI components,
- app integration.

---

# Suggested component map

```text
CompoundKnowledgeModule
├── KnowledgeHeader
├── KnowledgeModeTabs
├── AskPanel
│   ├── AskComposer
│   ├── SuggestedQuestions
│   ├── PlanContext
│   └── KnowledgeAnswerView
├── SearchPanel
│   ├── SearchInput
│   ├── SearchFilters
│   └── GroupedSearchResults
├── LibraryPanel
│   ├── CategoryBrowser
│   ├── PhaseFilter
│   └── LibraryResults
├── AnswerHero
├── ActionList
├── ContextUsed
├── EvidenceDisclosure
├── RelatedContent
├── EmptyState
├── LoadingState
└── ErrorState
```

---

# Required states

Implement and demonstrate:

- default Ask state,
- Ask loading,
- Ask answer,
- Ask no-result,
- Ask error,
- Search default,
- Search loading,
- grouped Search results,
- Search no-result,
- Library browsing,
- evidence collapsed,
- evidence expanded,
- no athlete context,
- athlete context available,
- mobile width,
- desktop host width,
- reduced motion.

---

# Acceptance criteria

## Product structure

- [ ] Ask, Search, and Library are clearly distinct.
- [ ] Only one primary input is visible per mode.
- [ ] Default mode is Ask.
- [ ] The module does not create a nested app bottom navigation.
- [ ] “Codex” is supporting language, not required user vocabulary.

## Ask mode

- [ ] The answer has one dominant recommendation.
- [ ] The answer includes explicit next actions.
- [ ] Athlete context used is disclosed.
- [ ] Missing athlete context is not invented.
- [ ] Evidence is expandable.
- [ ] Related content is secondary.
- [ ] No generic answer appears when the Codex has no support.

## Search mode

- [ ] Results are grouped by type.
- [ ] Search works independently of answer synthesis.
- [ ] Search preserves the user’s query during errors.
- [ ] Filters do not override athlete context invisibly.

## Library mode

- [ ] Browse categories are understandable to athletes.
- [ ] Phase is contextual and changeable.
- [ ] Visible labels avoid internal jargon.
- [ ] Video metadata and timestamps are preserved when available.

## Evidence

- [ ] Direct, recurring, and inferred evidence remain distinguishable.
- [ ] Athlete-facing labels replace raw retrieval jargon.
- [ ] Every synthesized recommendation has supporting evidence.
- [ ] Inference is labeled honestly.
- [ ] Sources include stable IDs.

## Visual system

- [ ] Uses the provided Compound tokens.
- [ ] Dark mode is the default.
- [ ] Amber is used selectively.
- [ ] Main answer is visually dominant.
- [ ] Source metadata is readable.
- [ ] No generic chat bubbles.
- [ ] No excessive gradients, animation, or gamification.

## Accessibility

- [ ] Keyboard operation works.
- [ ] Focus is visible.
- [ ] Tabs use correct semantics.
- [ ] Expanders expose `aria-expanded`.
- [ ] Loading and error changes are announced.
- [ ] Tap targets are at least approximately 42px.
- [ ] Reduced motion is respected.

## Architecture

- [ ] Knowledge engine is reusable outside this page.
- [ ] Data contracts are documented.
- [ ] UI does not directly parse raw Codex files throughout the component tree.
- [ ] Retrieval and rendering are separated.
- [ ] App integration boundary is explicit.
- [ ] No unsupported Codex metadata is invented.

---

# Required tests

At minimum:

## Unit

- query normalization,
- evidence-label mapping,
- grouped result formatting,
- no-result handling,
- athlete-context inclusion,
- athlete-context omission,
- direct/recurring/inferred rendering,
- video timestamp formatting.

## Integration

- Ask query → grounded answer,
- Ask query with no evidence → honest no-result,
- Search query → grouped results,
- mode switching preserves appropriate state,
- evidence expand/collapse,
- context change updates request,
- errors preserve query,
- library filter behavior.

## Accessibility

- tabs,
- focus order,
- composer label,
- evidence expander,
- loading announcement,
- error announcement,
- keyboard activation.

---

# Implementation sequence

Suggested commits:

1. **Project audit and adapters**
2. **Domain contracts and retrieval service**
3. **Shared design-system primitives**
4. **Ask mode**
5. **Search mode**
6. **Library mode**
7. **Evidence and related content**
8. **Athlete-context adapter**
9. **Accessibility and responsive polish**
10. **Tests and documentation**
11. **Compound integration boundary**

---

# Out of scope for first implementation

Unless already available:

- generating embeddings,
- rebuilding the entire Codex,
- production AI infrastructure,
- direct writes into athlete plans,
- automatic calorie changes,
- native shell integration,
- coach dashboard integration,
- production analytics.

Actions may deep-link to an existing feature but must not silently change athlete data.

---

# Product Architect review package

Return a ZIP containing:

```text
00-PROMPT.md
01-IMPLEMENTATION-SUMMARY.md
02-FILE-MAP.md
03-DATA-CONTRACTS.md
04-TEST-OUTPUT.txt
05-KNOWN-LIMITATIONS.md
full-source/
tests/
screenshots-or-previews/
```

Include the exact source that should ship.

Do not request production approval.

Request Product Architect implementation review.
