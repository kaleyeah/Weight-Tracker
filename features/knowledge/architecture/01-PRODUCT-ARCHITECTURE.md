# 01 — Product Architecture

# Product purpose

The Compound Knowledge Module turns the Compound Codex into a usable product surface.

It should power:

- athlete questions,
- Codex search,
- video discovery,
- Coach Max explanations,
- onboarding guidance,
- contextual “Why?” panels,
- future coaching prompts.

The module is not merely a search page. It is the reusable knowledge layer for Compound Fitness.

---

# Product positioning

Visible product hierarchy:

```text
Coach Max
Ask Compound
Grounded in the Compound Codex
```

Use “Codex” in:

- source details,
- technical documentation,
- evidence explanations,
- internal architecture.

Do not force the athlete to understand the term before using the feature.

---

# Three user modes

The module has three clearly separated modes:

```text
Ask | Search | Library
```

## Ask

For natural-language questions.

Example:

> I have been stuck at 18% body fat for three weeks. What should I do?

Returns:

- one coherent recommendation,
- why it applies,
- clear next actions,
- athlete context used,
- supporting sources,
- related topics.

## Search

For terms, rules, and discovery.

Example:

> plateau

Returns grouped results:

- best answer,
- principles,
- prescriptions,
- videos,
- related topics.

Search returns concepts and documents rather than pretending every query is a coaching conversation.

## Library

For browsing the source material.

Organize by:

- phase,
- topic,
- content type,
- recently added or updated,
- relevance to the athlete’s plan.

---

# App integration

This module should enter the main app through one Compound destination.

Preferred future navigation:

```text
Overview
Diary
Training
Progress
Coach
```

The Coach area may contain:

- today’s coaching,
- Ask Compound,
- Codex search,
- video library.

Do not create a second full bottom-navigation system inside the main app.

For standalone development, use a simple module shell or internal tabs.

---

# Default experience

The default screen should be Ask mode, not an empty search page.

Suggested structure:

```text
Coach Max
Answers grounded in Compound

[ Ask ] [ Search ] [ Library ]

What can I help you work through?

[ Ask about your plan, progress, training, or nutrition… ]

Suggested
[ I’ve stopped losing weight ]
[ Am I eating enough protein? ]
[ Should I add cardio? ]
[ How should I reverse diet? ]

Using your current plan
Cut · Week 7 · Change context

Recommended for you
• Confirming a real plateau
• Steps before adding cardio
• When to adjust calories
```

---

# Personalization rule

Use athlete context when available.

Relevant context may include:

- active phase,
- phase week,
- weight trend,
- step trend,
- adherence signals,
- training status,
- current targets,
- active plan settings.

Never invent missing context.

The UI should disclose which athlete signals influenced the response.

Example:

```text
Why this applies to you

• Current phase: Cut
• Weight trend: flat for 18 days
• Steps: down 12% over two weeks
• Weekend adherence: incomplete
```

Provide a compact control such as:

```text
Used 4 items from your plan and logs
```

---

# Core product principles

1. **Data → action**
2. **No mystery scores**
3. **Trends over snapshots**
4. **One clear next move**
5. **Source transparency**
6. **Codex-grounded answers only**
7. **No generic AI filler**
8. **Athlete language, not retrieval jargon**
9. **One knowledge engine, many consumers**
10. **Reusable architecture**

---

# Knowledge-engine boundary

Implement the core as a reusable service rather than embedding logic directly in the page.

Suggested conceptual structure:

```text
Knowledge Engine
├── Codex index
├── keyword search
├── semantic search
├── filters
├── citations
├── related topics
├── athlete-context adapter
├── answer builder
└── result formatter
```

Consumers may later include:

- Ask Compound
- Coach Max
- Help
- Onboarding
- Feature tooltips
- “Why?” panels
- Coach dashboard
- Native app surfaces

---

# Evidence language

Internal evidence classifications may include:

```text
direct
recurring
inferred
```

Do not expose those raw terms as the primary athlete labels.

Use:

| Internal | Athlete-facing |
|---|---|
| direct | Directly supported |
| recurring | Repeated Codex pattern |
| inferred | Coach Max interpretation |

For inferred guidance, state:

> This recommendation is an interpretation based on several Compound principles.

Never imply direct Codex support where only inference exists.
