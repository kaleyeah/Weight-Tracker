# 03 — Data and Search Contracts

# Principle

Build the UI around reusable domain objects, not around video cards or chat messages.

---

# Query request

```ts
type KnowledgeQueryRequest = {
  query: string;
  mode: "ask" | "search";
  context?: AthleteKnowledgeContext;
  filters?: KnowledgeFilters;
  limit?: number;
};
```

---

# Athlete context

```ts
type AthleteKnowledgeContext = {
  athleteId?: string;
  phase?: "assess" | "cut" | "reverse" | "maintain" | "gain";
  phaseWeek?: number;
  weightTrend?: {
    direction: "up" | "flat" | "down";
    durationDays?: number;
    change?: number;
    unit?: "lb" | "kg";
  };
  stepTrend?: {
    direction: "up" | "flat" | "down";
    percentChange?: number;
  };
  adherenceSignals?: string[];
  trainingSignals?: string[];
  targetSummary?: string[];
};
```

Every field is optional.

Never infer a value merely because another value exists.

---

# Filters

```ts
type KnowledgeFilters = {
  phases?: Array<"assess" | "cut" | "reverse" | "maintain" | "gain">;
  topics?: string[];
  contentTypes?: Array<"principle" | "prescription" | "video" | "article">;
  evidenceLevels?: Array<"direct" | "recurring" | "inferred">;
};
```

---

# Answer response

```ts
type KnowledgeAnswer = {
  query: string;
  mode: "ask";
  contextUsed: KnowledgeContextUsage[];
  answer: {
    headline: string;
    summary: string;
    reasoning?: string;
    actions: KnowledgeAction[];
    limitations?: string[];
  };
  evidence: KnowledgeEvidence[];
  related: KnowledgeRelatedItem[];
  retrieval: {
    matched: boolean;
    sourceCount: number;
    generatedAt?: string;
    codexVersion?: string;
  };
};
```

---

# Search response

```ts
type KnowledgeSearchResponse = {
  query: string;
  mode: "search";
  bestAnswer?: KnowledgeSearchResult;
  groups: {
    principles: KnowledgeSearchResult[];
    prescriptions: KnowledgeSearchResult[];
    videos: KnowledgeSearchResult[];
    relatedTopics: KnowledgeRelatedItem[];
  };
  retrieval: {
    matched: boolean;
    resultCount: number;
    codexVersion?: string;
  };
};
```

---

# Context usage

```ts
type KnowledgeContextUsage = {
  key: string;
  label: string;
  value: string;
  source: "plan" | "trend" | "diary" | "training" | "user-selected";
};
```

Only return context that actually influenced the answer.

---

# Actions

```ts
type KnowledgeAction = {
  id: string;
  label: string;
  detail?: string;
  priority?: "primary" | "secondary";
  appTarget?: {
    feature: string;
    route?: string;
    params?: Record<string, string>;
  };
};
```

Actions must be specific enough to perform or review.

Avoid vague actions such as:

```text
Stay consistent
Keep working hard
Listen to your body
```

---

# Evidence

```ts
type KnowledgeEvidence = {
  id: string;
  evidenceLevel: "direct" | "recurring" | "inferred";
  athleteLabel:
    | "Directly supported"
    | "Repeated Codex pattern"
    | "Coach Max interpretation";
  title: string;
  contentType: "principle" | "prescription" | "video" | "article";
  sourceId: string;
  excerpt?: string;
  videoTimestampSeconds?: number;
  relevanceReason?: string;
  url?: string;
};
```

Every synthesized claim should be traceable to evidence.

For inferred items, the underlying direct/recurring evidence must also be included.

---

# Related items

```ts
type KnowledgeRelatedItem = {
  id: string;
  title: string;
  type: "topic" | "principle" | "video" | "question";
  query?: string;
  sourceId?: string;
};
```

---

# Search result

```ts
type KnowledgeSearchResult = {
  id: string;
  title: string;
  summary: string;
  contentType: "principle" | "prescription" | "video" | "article";
  phaseTags?: string[];
  topicTags?: string[];
  evidenceLevel?: "direct" | "recurring";
  sourceId: string;
  videoTimestampSeconds?: number;
};
```

---

# Codex document metadata

Preferred Codex metadata:

```yaml
id: nutrition.plateau.confirmation
version: 3.2
category: Nutrition
audience:
  - athlete
  - coach
platform:
  - mobile
  - coach
status: active
last_updated: 2026-07-25
related:
  - nutrition.adherence.audit
  - activity.steps.before_cardio
tags:
  - plateau
  - calories
  - adherence
phases:
  - cut
content_type: principle
```

Do not require a complete Codex migration for the initial UI build if the current source data cannot support it.

Instead:

1. map current data into a normalized adapter,
2. document missing metadata,
3. avoid inventing unsupported fields.

---

# Search architecture

Prefer hybrid retrieval:

1. exact/keyword matching,
2. tag/metadata filters,
3. semantic retrieval if already supported,
4. deterministic ranking,
5. optional answer synthesis.

Search must work without synthesis.

Ask mode may synthesize only from retrieved Codex evidence.

---

# No-result rule

If the Codex does not support an answer:

```ts
{
  matched: false
}
```

Display an honest no-result state.

Do not silently substitute general model knowledge.

---

# Citation rule

Every answer must preserve:

- source ID,
- source title,
- evidence level,
- excerpt or relevance reason where available.

Video results should preserve timestamp where available.

---

# Reusability

Expose the knowledge engine through a stable interface such as:

```ts
interface CompoundKnowledgeEngine {
  ask(request: KnowledgeQueryRequest): Promise<KnowledgeAnswer>;
  search(request: KnowledgeQueryRequest): Promise<KnowledgeSearchResponse>;
  browse(filters?: KnowledgeFilters): Promise<KnowledgeSearchResponse>;
}
```

Do not couple the engine to a single page component.
