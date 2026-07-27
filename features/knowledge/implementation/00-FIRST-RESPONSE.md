# Compound Knowledge Module — Required First Response (pre-coding plan)

**Last Updated:** 2026-07-27
**Status:** Proposed — awaiting Product Architect approval before implementation
**Author:** Claude Code (Lead Engineer)

Per `architecture/00-PROMPT.md`, this is the required response before any code.
Items 1–10 in the order the prompt demands.

---

## 1. My understanding of the product

The module turns the Max Rogers Codex into Compound's reusable knowledge layer,
surfaced to athletes as **Coach Max — Ask Compound**. Three separated modes:
**Ask** (one coherent, personalized, evidence-backed recommendation answering
*what should I do / why does it apply / what evidence / what next*), **Search**
(grouped concept/document discovery — best answer, principles, prescriptions,
videos, related topics), **Library** (browse by category/phase/type). Every
answer is grounded ONLY in Codex evidence with visible, honest sourcing —
`matched:false` and an honest empty state when the Codex has no support, never
generic AI filler. "Codex" stays supporting vocabulary. The engine is a
reusable service (future consumers: Coach area, onboarding, "Why?" panels),
not page logic. It is NOT a chat app, a doc portal, or a standalone microsite.

## 2. The existing project structure I found

- **One production artifact:** `index.html` (~8,000 lines) — a single-file
  vanilla-JS PWA, no framework, no bundler, no npm. Views are render functions
  returning HTML strings; events flow through one delegated `data-act`
  dispatcher; styling is CSS custom properties (dark, amber accent) — the same
  idiom the brand guide (05) formalizes as `--cf-*` tokens.
- **Backend:** self-hosted PocketBase (users, appdata, photos).
- **Critical current state:** the app is mid **live-app safety hardening**
  (Commits 1→1h, build `2026-07-27.342-pb-c1h`). A pre-CAS **write freeze** is
  in force and the 75-case staging gate is about to run. The production file
  must not accumulate unrelated changes until that ships.
- **Tests:** a Node VM harness (`tests/`) evaluates the entire script with a
  stub DOM/storage/fetch; 277 tests. The knowledge module will reuse this
  harness pattern.
- **Docs:** Product Bible set + STATUS/DECISIONS/CHANGELOG; this module's
  authoritative requirements live in `features/knowledge/architecture/`.

## 3. The current search and Codex architecture

There is none in the app today — this is a green-field module:

- No search infrastructure of any kind (the only "library" is the workout
  exercise library, unrelated).
- No Codex artifacts in the app. The Codex arrives as one structured markdown
  doc (v0.1, 1,285 lines): doctrine sections (§3–§12) with per-claim evidence
  labels, dashboard answer templates (§13), a search taxonomy (§14), an
  indexed source catalog (§16: per-video URL/topics/thesis/status), and QC
  rules (§22).
- The existing **Coach Max recap** flow is a PocketBase-mediated operational
  loop (coachreq → poll) for daily recaps. It is architecturally separate;
  this module does not touch it. Shared branding is intentional; shared code
  is not (v1).
- No embeddings/semantic search exist anywhere, and 03 says semantic retrieval
  only "if already supported" — it is not, so v1 retrieval is deterministic.

## 4. Proposed component structure

**Standalone-first, same single-file discipline as the main app.** The module
is developed as its own self-contained artifact, NOT inside `index.html`:

```text
features/knowledge/implementation/
├── build-codex-index.js     dev-time Node script: Codex .md → codex-index.json
├── codex-index.json         generated, checked in, reviewed in diffs
├── knowledge-engine.js      the reusable engine (pure JS, zero DOM)
├── knowledge.html           standalone single-file module shell (dev host)
└── 00-FIRST-RESPONSE.md     this plan
features/knowledge/tests/    engine + contract + rendering tests (Node VM)
features/knowledge/reviews/  Architect handoff packages
```

Inside `knowledge.html`, components follow 04's map as render functions in the
app's idiom (no framework): `KnowledgeHeader`, `KnowledgeModeTabs`, `AskPanel`
(`AskComposer`, `SuggestedQuestions`, `PlanContext`, `KnowledgeAnswerView`),
`SearchPanel` (`SearchInput`, `SearchFilters`, `GroupedSearchResults`),
`LibraryPanel` (`CategoryBrowser`, `PhaseFilter`, `LibraryResults`), plus
`AnswerHero`, `ActionList`, `ContextUsed`, `EvidenceDisclosure`,
`RelatedContent`, `EmptyState`, `LoadingState`, `ErrorState`. Navigation is
internal tabs `Ask | Search | Library` (standalone rule from 02); no bottom
nav shell is created.

## 5. Proposed search/answer flow

**Dev-time normalization (no runtime markdown parsing — 04 acceptance):**
`build-codex-index.js` parses the Codex ONCE into `codex-index.json`:
normalized entries `{id, title, summary, body, contentType
(principle|prescription|video|article), topicTags (from §14), phaseTags,
evidenceLevel, sourceRefs, url?, status?}`. IDs are stable
(`nutrition.protein.target`-style). The adapter maps what exists and
**documents missing metadata; it never invents fields** (03's rule). The
Codex doctrine text itself is not rewritten.

**Retrieval (mode-independent, in `knowledge-engine.js`):**
1. query normalization (lowercase, synonym map from §14 incl. "skinny fat");
2. exact/keyword scoring over title/summary/tags/body with field weights;
3. tag/metadata filters (phase, topic, contentType, evidenceLevel);
4. deterministic ranking (score → evidence strength → recency → stable id) —
   same input, same output, testable;
5. no semantic retrieval in v1 (none exists in the project).

**Search mode** returns `KnowledgeSearchResponse`: grouped
principles/prescriptions/videos/relatedTopics + optional bestAnswer. Works
with zero synthesis (03's rule).

**Ask mode** returns `KnowledgeAnswer` via a deterministic answer builder:
top-ranked prescription/principle entries fill the Codex's own §13 answer
templates → one dominant recommendation (headline, why, 3–5 specific actions,
limitations), athlete-context lines that actually influenced selection, full
evidence list, related items. Synthesis uses ONLY retrieved entries; below a
relevance floor → `{matched:false}` and the honest no-result state. **No LLM
call in v1** — 04 lists production AI infrastructure as out of scope unless
already available, and none is. This makes v1's Ask honest-by-construction:
composition, not generation. (Future: a server-proxied Claude call can slot
in behind the same `ask()` interface without UI changes.)

**Library mode** = `browse(filters)` over the same index: athlete-facing
categories (Nutrition, Training, Fat loss, Muscle gain, Recovery, Mindset)
mapped from §14 topics; phase filter defaults to the athlete's active phase
when context is supplied.

## 6. Proposed integration boundary with Compound Fitness

- The engine is exposed exactly as 03 specifies:
  `CompoundKnowledgeEngine { ask(), search(), browse() }` — pure functions
  over the index + request; zero DOM, zero storage access, zero network.
- **Athlete context enters ONLY as an `AthleteKnowledgeContext` argument.**
  In v1 the standalone shell supplies it manually ("Change context" control +
  a no-context state). The v2 app integration writes one adapter mapping app
  state (phase, week, weight/step trends, adherence signals) → this type. The
  engine never reads `wl_*` storage itself.
- **Read-only by design:** the module performs no PocketBase calls and no
  writes to athlete data — nothing touches the write freeze, revisions, or
  sync. `KnowledgeAction.appTarget` deep-links are inert descriptors in v1.
- App entry (v2, separate commit + review): one destination inside the Coach
  area of `index.html`, inheriting the app's navigation per 01. **Sequenced
  AFTER the hardening line ships** (staging → CAS → production) so the frozen
  production artifact takes no unrelated risk. Until then the module ships
  nothing athlete-facing.

## 7. The data contract I will implement

All of 03, verbatim in shape: `KnowledgeQueryRequest`,
`AthleteKnowledgeContext` (every field optional, never inferred),
`KnowledgeFilters`, `KnowledgeAnswer`, `KnowledgeSearchResponse`,
`KnowledgeContextUsage` (only context that influenced the answer),
`KnowledgeAction` (specific, never "stay consistent"), `KnowledgeEvidence`
(stable ids, excerpts, video timestamps where available, athlete labels),
`KnowledgeRelatedItem`, `KnowledgeSearchResult`. The project is vanilla JS —
contracts are enforced by **runtime validators + contract tests** (documented
in a CONTRACTS doc) rather than TypeScript types; the tests are the contract.

**Evidence label mapping** (01's table + the Codex's two extra labels):

| Codex | Contract level | Athlete-facing |
|---|---|---|
| `DIRECT` | direct | Directly supported |
| `RECURRING` | recurring | Repeated Codex pattern |
| `INFERRED` | inferred | Coach Max interpretation (+ required interpretation sentence) |
| `NEEDS_TRANSCRIPT` | video listed in results/evidence as a source; its claims are NOT used to build prescriptions; surfaced with a "full breakdown pending" note | — |
| `VERIFY_EXTERNALLY` | inferred + a limitation line ("compare with medical guidance") | Coach Max interpretation |

Inferred answers always also carry their underlying direct/recurring evidence
(03's rule); inference is never presented as direct support.

## 8. Assumptions

1. Codex v0.1 is the sole grounded source; its doctrine text is adapted, not
   rewritten (00-PROMPT #8). Daily-update merging (§19) is out of v1.
2. Many catalog videos are `NEEDS_TRANSCRIPT` with no timestamps yet — video
   evidence will often be title/topic-level; `videoTimestampSeconds` is
   carried where it exists (§16 rarely has it yet).
3. The module's athlete-facing name/labels come from 01/02 exactly; the brand
   tokens come from 05.
4. Standalone `knowledge.html` is a development host, not a shipped athlete
   surface; nothing in v1 reaches production.
5. The `phase` vocabulary (assess/cut/reverse/maintain/gain) maps the Codex's
   Phase 0–7 model onto 03's five contract values (0→assess, 1–3→cut,
   4–5→reverse, 6→maintain, 7→gain).
6. English only; system fonts; no external resources (matches both the brand
   guide and the app's self-contained discipline).

## 9. Blockers

**None for the standalone build** — it touches no production code, no
backend, no frozen write path, and does not interfere with the running
staging gate. Two sequencing constraints, not blockers:

1. Integration into `index.html` waits for the hardening line to ship
   (staging → CAS → production review) and gets its own review.
2. Real LLM-synthesized Ask answers need server-side AI infrastructure that
   does not exist yet; v1 ships deterministic template synthesis and says so
   in its limitations. If the Architect wants generative synthesis in v1,
   that is a scope decision to make now (it would add a server dependency).

## 10. Commit plan

Following 04's sequence, each commit with tests and per the Product Owner's
standing rule ending in an Architect package (placed in
`features/knowledge/reviews/`):

- **KM-1 — Codex adapter + contracts:** `build-codex-index.js`,
  `codex-index.json`, validators, missing-metadata report. Tests: parsing,
  id stability, evidence-label mapping, no-invented-fields.
- **KM-2 — Knowledge engine:** retrieval, filters, ranking, citations,
  related items, athlete-context inclusion/omission, no-result honesty.
  Tests: query normalization, grouped formatting, determinism, context rules.
- **KM-3 — Design primitives + module shell:** 05 tokens, tabs, empty/
  loading/error states, reduced motion. Standalone `knowledge.html` boots.
- **KM-4 — Ask mode** (composer, suggested questions, plan context, answer
  hierarchy, actions, context-used, limitations).
- **KM-5 — Search mode** (grouped results, filters, query preserved on error).
- **KM-6 — Library mode** (categories, phase filter, video metadata).
- **KM-7 — Evidence & related content** (expandable disclosure,
  `aria-expanded`, athlete labels, timestamps).
- **KM-8 — Accessibility + responsive polish** (04's full checklist), states
  demo covering every required state, docs (file map, contracts, walkthrough,
  known limitations), **handoff package** per 04's required ZIP layout.

KM-9 (app integration behind the Coach area) is explicitly out of this plan
and will be proposed separately after the hardening line ships.

---

*Response ends. No code has been written. Implementation begins only after
this plan is approved as internally consistent by the Product Architect.*
