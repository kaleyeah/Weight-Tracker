# 01 — Ingestion Summary

**Change size:** 130 insertions, 4 deletions, one file modified, three files added.
**Files touched:**

| File | Status |
|---|---|
| `architecture/CODEX/max-rogers-fitness-knowledge-codex.md` | modified |
| `architecture/CODEX/transcripts/why-you-should-only-ever-have-to-get-lean-once.txt` | added (verbatim, 20,792 bytes) |
| `architecture/CODEX/transcripts/README.md` | added |
| `reviews/CODEX_TRANSCRIPT_INGESTION_R1_REVIEW_BUNDLE/` | added (this bundle) |

---

## Source identification

The file arrived as `get lean once transcript.txt` with no accompanying metadata — no URL, no
video ID, no publication date.

I checked the video against the existing section 16 catalog before creating anything. **It is
not in the catalog.** The opening line self-identifies it: *"In today's video, why you should
only ever have to get lean once."*

Three existing entries are thematically adjacent and were candidates for a merge:

- "If You Always Lose Fat & Gain It Back… Watch This" (`TN_utYhibPU`) — `NEEDS_TRANSCRIPT`
- "How To Get Lean & STAY Lean Forever (Using Science)" (`roHQ3F7d9YQ`) — `summarized`
- "Why Some Men Stay Lean Forever (And Others Rebound)" (`GHLY2GWKdic`) — `NEEDS_TRANSCRIPT`

**I did not merge into any of them.** Each has a distinct title that does not match, and
attaching this transcript to one of those entries would assert a video identity I cannot
verify — which would in turn attach a URL I cannot verify to a body of `DIRECT` claims. A new
entry was created and the three above are recorded as *related, not confirmed identical*.

One internal date marker exists: the speaker says *"I'm filming this June the 1."* No year
given. Not enough to date the entry, so I did not.

---

## Doctrine changes, section by section

### Header
Version 0.1 → 0.2. Added a `Last updated` line naming this ingestion. `Last researched`
deliberately left at 2026-07-25 — no new research pass was run, one source was ingested.

### §3.5 — One Fat-Loss Phase, Not an Annual Cycle *(new subsection)*
The video's central thesis, which the Codex did not previously state in this form. §3.3 covered
"fat loss is a phase, not a lifestyle" and §3.4 covered "getting lean and staying lean are
different skills," but neither said *the phase should only happen once*, nor named the annual
re-diet as evidence of a flawed plan. Includes the "messy middle" framing and one verbatim
quote on adherence duration.

### Phase 1 — Fat-Loss Setup *(three new blocks)*

**Rate of loss.** 0.5–1% of body weight per week, with faster loss called "a one-way ticket to
a rebound." **The Codex previously contained no rate-of-loss figure anywhere.** This is the
single largest gap the transcript closes. Also carries the 20-weeks-not-8 framing and a
verbatim quote contrasting 0.5 lb × 20 weeks against 3 lb × 10 weeks.

**Lever order.** The deficit is built from cardio and steps first, calories reduced slowly and
last, and primarily from carbohydrates. The existing Phase 1 list had calorie deficit as a
primary lever and cardio as secondary — directionally consistent, but it did not express the
*sequencing*, which is the actual mechanism. Also captures the 1,500-calorie opening intake
called out by name as unsustainable, and the training prescription (3–5 sessions, compounds
first, isolation last).

**Arriving in a reversible state.** Diet fatigue must be minimized on the way down because the
person's condition at the finish line determines whether the reverse diet is executable. This
reframes the endpoint: hitting goal weight while destroyed is a failed cut. Not previously in
the Codex.

### Phase 3 — Choosing a target *(new block)*
10–15% as the completed-phase definition; 10% as "really lean" and the speaker's own level;
15% as a good look for most; **12–15% explicitly recommended for unassisted, busy, 40s, or
father demographics**, with 10% named unnecessary for that group. The existing Phase 3 text
described what each body-fat band *feels* like but never issued a target recommendation tied to
who the athlete is. Given the Compound audience, this is the most product-relevant single
addition in the bundle.

The pre-existing `**Evidence:**` line for the stage descriptions was relabelled
`**Evidence (stages above):**` so the two blocks are not confused. This is the only
modification to pre-existing prose in the entire diff — everything else is additive.

### Phase 5 — Reverse Diet *(two new blocks)*

**Concrete increment protocol.** Rendered as a table. +400 kcal (~100 g carbohydrate, split
50 g pre- / 50 g post-workout), hold 2 weeks; +200 (~50 g), hold 2 weeks; +200 (~50 g), hold
2 weeks. Net +800 over six weeks, 3–5 lb scale gain attributed to water and muscle. Training,
cardio and steps held at end-of-cut levels throughout — only food moves.

Phase 5 previously had **no numbers at all**. Its framework was directional
("increase calories in controlled increments") and cited a different video as primary source.
That video is still cited; this one is added alongside.

The prose retains the worked-example framing (2,000 kcal starting point, 4 sessions/week,
3 × 30 min cardio, 10k steps) rather than presenting the increments as universal. See Q4 in
`00-PROMPT.md` — I am not confident this framing survives a search-driven UI.

**Reverse dieting before a cut.** A case the Codex did not cover: the chronic yo-yo dieter who
no longer responds to a deficit, prescribed a 12-week reverse *before* any fat-loss phase, even
at a body composition that appears not to warrant it. Labelled `DIRECT` for the protocol and
`VERIFY_EXTERNALLY` for the metabolic mechanism — see Q2.

### Phase 7 — The push–pullback cycle *(new block)*
Lean gain at ~1 lb/week; every 8–16 weeks a four-week mini cut pulling back 4–5 lb; repeat.
The existing framework said "use mini-cuts if body fat rises beyond the chosen guardrail" —
reactive and unquantified. The transcript describes it as a *scheduled* cycle with figures.
Also carries the speaker's stated personal endpoint of ~3,000 kcal maintenance, contrasted
against holding the same physique at 1,800.

Same relabelling treatment as Phase 3: the pre-existing evidence line became
`**Evidence (framework above):**`.

### §11 — Sustainability and Rebound Prevention
Two causes added to the existing list: arriving too depleted to execute the reverse, and timing
the end of the cut against a holiday or summer break.

New subsection **"The seasonal pattern"** — the April–June diet, July finish, August holiday,
September rebound cycle, with the stated figures (20 lb lost May–July, 25 lb regained
July–September) and the observation that September is the busiest month for coaching signups.
This is anecdotal coaching-practice data, not a study. It is labelled `DIRECT` because it is
directly stated, which is what the label means — but note the label attests to *what was said*,
not to the accuracy of the numbers.

### §12 — Myths table
Two rows added: the shorter-harder-cut myth, and the diet-again-next-year myth. Both are direct
targets of the video's thesis.

---

## Verification performed

- Transcript copied and **md5-verified** against the source file:
  `7c98e614b3bd55c86f7926791cedee14`. Byte-identical, unedited.
- Full catalog searched for the video before creating a new entry (see above).
- Existing `NEEDS_TRANSCRIPT` and `high-priority transcript target` statuses left untouched —
  no entry was marked resolved by this ingestion, because none of them is this video.
- Section 17 "High-Priority Transcript Queue" **not** modified. This video was never on the
  queue, so nothing on it has been satisfied. The queue's 14 items all remain outstanding.
