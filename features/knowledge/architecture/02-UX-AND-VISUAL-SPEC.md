# 02 — UX and Visual Specification

# Overall direction

The existing mockup is visually close to Compound.

Preserve:

- dark surfaces,
- amber accent,
- restrained borders,
- compact cards,
- native system typography,
- mono data styling,
- mobile-first width,
- calm tone.

Change the information architecture so the module feels native to Compound.

---

# Page hierarchy

Use:

```text
Coach Max
Answers grounded in Compound
```

Then:

```text
[ Ask ] [ Search ] [ Library ]
```

Only one primary input should be visible at a time.

Do not show the search bar and Coach Max textarea together.

---

# Ask mode

## Composer

Use a large, focused question composer.

Placeholder:

> Ask about your plan, progress, training, or nutrition…

Do not prefill a sample question as editable content.

Suggested UI:

```text
What can I help you work through?

[ textarea                                      ]
[                                              ]
[                                       Ask →  ]
```

Recommended minimum textarea height:

```css
min-height: 104px;
```

## Suggested questions

Show contextual starter prompts.

Examples:

- I’ve stopped losing weight
- Am I eating enough protein?
- Should I add cardio?
- How should I reverse diet?

## Plan context

Show the current phase as context, not as the main filter:

```text
Using your current plan
Cut · Week 7
Change context
```

Manual phase selection may exist behind “Change context.”

---

# Answer layout

The answer must be one coherent recommendation—not a flat pile of equal cards.

Recommended hierarchy:

```text
Your next move

Keep calories unchanged for seven more days.

Why

Your three-week scale stall may not be a confirmed plateau yet.
Verify adherence, weekend intake, steps, and the seven-day average first.

Do this now

1. Keep calories unchanged.
2. Hold steps at 9,000–10,000.
3. Review the last two weekends.
4. Reassess next Monday.

Why this applies to you

• Current phase: Cut
• Trend: flat for 18 days
• Steps: down 12%
• Weekend logs: incomplete

Evidence · 3 Codex sources
[ View evidence ]

Related
• Steps before cardio
• Confirming a true plateau
```

## Visual emphasis

Use one dominant answer card.

Related principles should appear as smaller rows or compact cards.

Do not give every result equal visual weight.

---

# Search mode

Search is for terms and discovery.

Input placeholder:

> Search principles, prescriptions, videos, and topics…

Group results:

```text
Best answer
Principles
Prescriptions
Videos
Related topics
```

Example:

```text
Search: plateau

Best answer
Confirm the plateau before changing calories

Principles
• Plateau confirmation
• Adherence audit
• Activity consistency

Prescriptions
• Hold calories for seven days
• Restore step target
• Change one variable at a time

Videos
• Why You’re Stuck at 18–20% Body Fat
• Steps Before More Cardio
```

Do not display a flat series of identical cards.

---

# Library mode

Allow browsing by:

- Nutrition
- Training
- Fat loss
- Muscle gain
- Recovery
- Mindset

Optional filters:

- Assess
- Cut
- Reverse
- Maintain
- Gain

The athlete’s active phase may be selected by default.

---

# Topic chips

Use chips for:

- recent searches,
- current-phase topics,
- category browsing.

Preferred athlete-facing labels:

- Cutting plateaus
- Protein target
- Steps
- Diet breaks
- Training performance
- Build muscle or cut?

Keep “skinny fat” as a search synonym if the Codex uses it, but prefer a calmer visible label.

---

# Sources and evidence

Sources are trust-critical.

Use expandable evidence:

```text
Evidence · 3 Codex sources

▸ Plateau confirmation rule
▸ Steps before cardio
▸ Why You’re Stuck at 18–20% Body Fat
```

Expanded source information may include:

- title,
- content type,
- relevant excerpt,
- video timestamp,
- reason it supports the answer.

Example:

```text
Why You’re Stuck at 18–20% Body Fat
Video · 08:42

Relevant principle:
Confirm adherence and activity before reducing calories.
```

Use `--cf-text-muted` rather than `--cf-text-faint` for meaningful source metadata.

---

# Evidence labels

Do not prominently label cards:

```text
Direct
Recurring
Inferred
```

Prefer:

```text
Based directly on 3 Codex sources
```

or:

```text
Repeated Codex pattern
```

or:

```text
Coach Max interpretation
```

---

# Header

Inside the main app, do not repeat a standalone Compound product shell unnecessarily.

Preferred:

```text
Coach Max
Compound knowledge
```

or:

```text
Knowledge
126 principles · 40 videos
```

Do not show athlete-facing build versions such as:

```text
v0.1
```

Put versions in diagnostics/settings.

---

# Navigation

For standalone development:

```text
Ask | Search | Library
```

For app integration, inherit Compound’s primary navigation.

Do not ship:

```text
Home | Search | Coach Max | Library
```

as a nested bottom navigation inside Compound.

---

# Amber usage

Amber should remain authoritative.

Use it for:

- primary action,
- active mode,
- key recommendation,
- important link,
- focus.

Do not use amber simultaneously for:

- every eyebrow,
- selected phase,
- all borders,
- all links,
- active bottom nav,
- every chip.

Neutral selected states may use:

```css
background: var(--cf-surface-raised);
color: var(--cf-text);
border: 1px solid var(--cf-border-strong);
```

---

# Empty states

## Ask

```text
Ask about your plan, progress, training, or nutrition.
Answers are grounded in Compound.
```

## Search

```text
Search for a principle, prescription, phase, or video.
```

## No results

```text
No Codex result matched that search.

Try:
• a broader topic
• a different phase
• a related term
```

Do not generate a generic answer when retrieval returns no support.

---

# Loading

Use calm, structured loading.

Example:

```text
Searching Compound knowledge…
```

For synthesis:

```text
Reviewing relevant principles…
```

Do not use theatrical “thinking” animations.

---

# Error

Example:

```text
We couldn’t search the Codex right now.
Nothing was submitted twice.

[ Retry ]
```

Preserve the query.

---

# Accessibility

Required:

- 42px minimum tap targets,
- persistent labels,
- keyboard operation,
- visible focus,
- reduced motion,
- semantic landmarks,
- correct tab/tabpanel semantics,
- no color-only evidence classification,
- expandable source controls with `aria-expanded`,
- loading announcements,
- accessible error text.
