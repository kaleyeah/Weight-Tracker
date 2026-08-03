# 02 — Open Questions

Four rulings needed. Q1–Q3 were surfaced to the Product Owner and deferred to you. Q4 is the
one I consider highest-risk.

---

## Q1 — The source contradicts itself on reverse-diet weight gain

**The conflict.** Within thirty seconds of transcript, the speaker gives two different figures
for total scale gain across the six-week reverse:

> `13:30` — "I guarantee you he'll be a 3 to four pounds up in those six weeks."

> `13:40` — "Those four or five pounds that have come on is water and muscle."

**What I did.** Recorded it as "3–5 lb," spanning both statements, rather than selecting one.

**Why this needs a ruling.** The two figures are not reconcilable and both are `DIRECT`. My
span is defensible as a faithful record, but it is also a number that was never actually
spoken — a synthesis presented inside a `DIRECT`-labelled block. That sits uncomfortably close
to the line the module prompt draws.

**Options:**

| | Approach | Cost |
|---|---|---|
| **A** | Keep "3–5 lb" | A figure nobody said, inside a `DIRECT` block |
| **B** | Quote both, note the contradiction inline | Honest; adds noise to a prescriptive section |
| **C** | Take the later figure (4–5 lb) as the speaker's settled view | Assumes intent not in evidence |
| **D** | Drop the figure; keep only "water and muscle, not fat" | Loses the reassurance that makes the protocol adherable |

**My recommendation: B.** The contradiction is itself useful information — it tells the reader
this is an approximation from coaching experience, not a measured constant. That framing is
more accurate than any single number, and it protects against a user treating 4 lb as a
threshold they have failed.

---

## Q2 — The metabolic mechanism collides with the existing myths table

**The conflict.** The transcript explains the non-responding yo-yo dieter as follows:

> `16:01` — "His metabolism has slowed down."

Section 12 of the Codex already lists, as a myth the channel pushes against:

> "My metabolism is broken." → *Adaptation and lower expenditure occur, but plateaus usually
> require a data and adherence audit.*

So the Codex simultaneously holds that metabolic slowdown is a real mechanism warranting a
12-week intervention, and that believing your metabolism is broken is a myth requiring an
adherence audit first.

**What I did.** Split the labels: the *protocol* (12-week reverse before cutting) is `DIRECT`;
the *mechanism* (slowed metabolism) is `VERIFY_EXTERNALLY`, with an inline note stating the
split explicitly.

**Why this needs a ruling.** The split is technically correct and preserves both. But an
answer engine reading both sections will produce inconsistent answers depending on which one
the search hits. This is a genuine doctrinal tension in the source material, not a labelling
error, and I do not think it is mine to resolve.

**Options:**

- **A.** Keep the split as-is, accept the tension, let both surface.
- **B.** Add a reconciling note to §12 — the myth is *"my metabolism is broken, therefore
  nothing works"*; the transcript's case is a specific, diagnosable state with a defined
  intervention. These are compatible if stated carefully.
- **C.** Escalate to `VERIFY_EXTERNALLY` on the whole block and hold it out of Coach Max
  answers until externally reviewed.

**My recommendation: B.** The two claims are reconcilable and the distinction is clinically
meaningful — "adaptation is real but is not your first explanation for a plateau" is a coherent
position. But it needs to be written down, or the answer engine will not find it.

---

## Q3 — Unresolved source URL

Every `DIRECT` claim added by this ingestion cites a title with no URL behind it. The module
prompt requires that "every synthesized answer must retain source traceability." A title alone
is weak traceability — it cannot be verified by a user and cannot be linked from the UI.

The transcript arrived without metadata and I declined to infer a URL from a similar catalog
title (rationale in `01_INGESTION_SUMMARY.md`).

**Ask:** can you resolve the video and supply the ID? It is a one-line fix that upgrades every
citation in this bundle. Search terms that should find it: *"only ever have to get lean once"*,
*"you only have to get lean once"*, Max Rogers / `@maxinomuscle`. Filmed June 1, year unknown.

**If it cannot be resolved:** ruling needed on whether `DIRECT` is appropriate for claims whose
source cannot be pointed at. My position is that it is — the transcript is on file in the repo
and is itself the evidence, independent of whether the video can be linked — but the
`transcript_path` field in the section 15 schema was clearly designed to *supplement* a
`video_id`, not replace it.

---

## Q4 — Does the Codex now issue prescriptions? *(highest risk)*

Before this change the Codex described a system. After it, the Codex contains a numeric
protocol a user can execute directly: specific calorie increments, specific hold durations,
specific carbohydrate splits, a specific rate-of-loss ceiling, a specific mini-cut cadence.

This is a change in kind, not degree, and it was not a decision I should have made alone —
I made it because the transcript contains the numbers and suppressing them would have been its
own distortion. But the consequences are yours to rule on.

**Three specific concerns:**

1. **Context stripping.** The increments derive from one worked example at 2,000 kcal. I kept
   that framing in prose, but Coach Max is a *search* interface. A query like "how much should
   I increase calories after a cut" can surface the table without the paragraph above it. A
   1,400 kcal finisher adding 400 kcal is a materially different intervention than a
   2,000 kcal finisher doing the same.

2. **Section 13 templates are not built for this.** The answer templates were written for
   directional guidance. They have no slot for "here is a number, here is the starting
   condition it assumes, here is how to scale it to you." That is an architecture question.

3. **Where the guardrail lives.** If the rule is "never surface a raw figure without its
   originating condition," that belongs in the data contract or the answer templates — not as
   prose in the Codex that a retrieval layer will not honour. Section 15's `claims` schema has
   an `evidence_label` but no field for *preconditions*. That may be the actual gap.

**My recommendation:** treat concern 3 as a schema change — add a `preconditions` or
`assumes` field to the claim record in section 15 — and route it through you as a contract
change before Coach Max surfaces any numeric prescription to an athlete. I have not made that
change; it alters the data contract, which is your call.
