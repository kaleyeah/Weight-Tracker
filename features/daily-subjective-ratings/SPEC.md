# Daily subjective ratings — approved design

Owner-approved 2026-08-03 from rendered mockups. Source brief:
`compound-daily-subjective-ratings/00-PROMPT.md` (supplied zip), with the
Owner decisions below overriding it where they differ. NOT YET BUILT.

## The four questions

| # | Question | Options (left → right) | Enum values |
|---|---|---|---|
| 1 | **Hunger** | Too low · Slightly low · Just right · Slightly high · Too high | `too_low`, `slightly_low`, `just_right`, `slightly_high`, `too_high` |
| 2 | **Recovery** | Very poor · Poor · Okay · Good · Excellent | `very_poor`, `poor`, `okay`, `good`, `excellent` |
| 3 | **Energy** | Very low · Low · Okay · Good · Excellent | `very_low`, `low`, `okay`, `good`, `excellent` |
| 4 | **Digestion** | Very poor · Poor · Okay · Good · Excellent | `very_poor`, `poor`, `okay`, `good`, `excellent` |

**Owner decision — Hunger, not Appetite.** The brief said "Appetite"; the
Owner replaced it with **Hunger**, which also matches the reference sheet.

**Owner decision — Digestion is balanced.** The brief's scale had three
"problems" options (midpoint = "Minor problems"). The Owner ruled it
balanced, so Digestion uses the same neutral-midpoint shape as Recovery.

Stored values are the stable enums above, never the visible label, so the
wording can change later without a data migration.

## Where it lives

A single collapsed row in the daily check-in card, **directly above
Notes**, behaving exactly like the existing Sleep/Weight/Calories/Steps
rows:

- **Label: "How you're feeling"** — the SAME wording on today and on any
  past day (Owner decision: no past-tense variant).
- Unanswered: `+` icon, value "Add".
- Partly answered: `+` icon, value **"2 of 4"** (count only — the Owner
  ruled against listing the chosen values).
- All four answered: green done dot, value **"4 of 4"**.
- Tapping expands the four questions in place; tapping again collapses.

## The question rows (expanded)

- Header line: question name on the left, the **full chosen label** on the
  right in accent (`Not answered` in faint when unset).
- Five tappable chips in one row (`repeat(5,1fr)` grid, 46px min height).
- Selected chip: accent fill + accent border + filled dot + bolder text —
  never colour alone (accessibility).
- Narrow screens (≤365px): chips switch to short labels ("Slightly low" →
  "Low", "Excellent" → "Great"); the header keeps the full wording, so the
  short form is never ambiguous. Verified at 320px.
- `role="group"` + `aria-labelledby` per question; `aria-pressed` per chip;
  existing focus treatment.

## Rules

- **Never blocks "Complete today"** (Owner decision). Unanswered is a
  legitimate final state, like a skipped Steps entry.
- A selection can be changed before saving; reopening a day restores the
  saved selections.
- An unset rating is `null` — never silently defaulted.
- Only the canonical enum values are accepted; anything else is ignored
  per existing validation conventions.
- Records without these fields keep loading unchanged (backward compatible).

## Storage

Four fields on the existing per-day record — reusing the current daily
model, sync, migration and conflict handling. No parallel store, no
combined "wellness score":

    hungerRating | recoveryRating | energyRating | digestionRating

## Trends — Progress tab (Owner decision)

A "How you've felt" card on the **Progress** tab:

- Per-question row of seven day cells for the current week, coloured
  worst→best with the value shown as a digit, and `–` for unanswered days
  (so a gap never reads as a bad day).
- Below it, a **compound-phase strip**: every day since the current dose
  step, so a trend across a titration is visible rather than just the week.

## Coach report — the trend block leads (Owner decision)

The trend goes at the TOP OF THE FOLD of the coach report, above training,
nutrition and steps. Its purpose is explicit: let the coach see whether the
athlete is accumulating fatigue and gauge them accordingly.

**Window: 14 days**, not 7 — a week cannot show accumulation across a
training block or a dose step.

Each of the four ratings gets one row: a per-day bar (tallest = best,
flat grey = not answered, oldest → today) and a per-question trend tag
(`improving` / `steady` / `falling`) derived from the trailing 7-day mean
versus the prior 7.

A **Watch** line follows in plain language, naming which ratings are low or
falling and for how long, cross-referenced with training volume and the
current dose step — e.g. "Recovery and Energy have both been ≤ Okay for 4
straight days, while training volume held."

Delivered to Max as plain text (the model reads text, and Griffin reads the
same block in the recap card):

    HOW HE'S FEELING — 14 days (1 worst … 5 best, "–" = not answered)
      Recovery   2 3 4 4 5 4 – 3 3 2 2 2 3 3   falling   (7d avg 2.6 vs prior 3.7)
      Energy     3 3 4 4 4 3 – 3 2 2 2 3 3 3   falling   (7d avg 2.6 vs prior 3.5)
      Hunger     3 3 3 4 3 3 – 3 3 2 3 3 3 3   steady    (7d avg 2.9 vs prior 3.2)
      Digestion  1 2 2 3 3 4 – 4 4 3 4 4 5 4   improving (7d avg 4.0 vs prior 2.5)

      WATCH: recovery ≤ okay 4 days running; energy tracking it. Training volume
             unchanged over the same window. Digestion improving since 5 mg (Jul 12).

    TRAINING / NUTRITION / STEPS follow below…

**Boundary kept:** every trend is per question. There is no combined
wellness/readiness score, per the brief. Fatigue is communicated by showing
the individual ratings' direction and duration, not by inventing a composite
number. If the Owner later wants a single fatigue flag, that is a separate
decision.

## Sequencing

This writes to the same daily record the M10 single-writer work currently
gates. Land it AFTER the M10 client is accepted, unless the Owner directs
otherwise, so the M10 review is not churned mid-flight.

## Mockups

Rendered from the live `.417-fx` stylesheet at 390px and 320px:
`scratchpad/subj/shot-{a,b,c,d,states,narrow}.png` (session scratch).
