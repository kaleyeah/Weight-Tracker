# 00-PROMPT.md — Commit 10: conflict centre, revised

```text
You are the Product Architect for Compound Fitness. I'm the Product Owner.
Claude Code is the Lead Engineer.

You returned CHANGES REQUIRED with four product refinements on the rendered
conflict centre. All four are done, plus the recovery-blocked hierarchy change.
882 tests pass, 0 failures (was 869).

Look at:

  1. screenshots/01-both-cards-*.png    — the revised labels
  2. screenshots/05-recovery-blocked-*  — Try again now primary and first
  3. screenshots/08-preserving-brief-*  — a sub-400ms preservation renders NOTHING
  4. evidence/focus-order.json          — no autofocus anywhere
  5. code/c10-conflict-view.test.js     — every C10-UX id asserted

C10-UX-01..05 — the labels now carry their direction: "Use this device’s copy
online" and "Use the online copy on this device". You were right that the old
pair was only disambiguated by the smaller help text, which is the wrong place
to hide direction in a destructive decision.

C10-UX-06..10 — both cards stay visible and expanded, with more separation on
narrow screens. Your reasoning is now in the code comment: collapsing the second
would imply a required order, or that resolving one might resolve the other.

C10-UX-11..16 — autofocus is gone entirely rather than deduplicated. Your point
that focusing an ACTION puts the athlete on a choice before they have heard what
happened is the better framing — my fix had been to make the wrong thing
singular. Opening focuses the heading, the first Tab reaches the safe choice,
background discovery moves no focus, and closing returns focus to the opener.

C10-UX-17..20 — preserving is delayed 400ms; under the threshold the card is not
rendered at all, so no destructive choice can appear during preservation.
Screenshot 08 shows that state rendering nothing.

Recovery-blocked — Try again is primary and first, Export a copy is the ghost
fallback, with spacing between them.

One question: with the preserving card suppressed under 400ms, a fast
preservation means the athlete sees the conflict centre appear with no
intermediate state at all. That is what you asked for and I think it is right.
I mention it only because the transition from "nothing" to "three choices" is
now instantaneous, and if you would rather it fade in, that is a change I would
make now rather than after the wiring.

Next: the browser wiring, then real Chromium multi-context and real PocketBase
evidence. Nothing is deployed; production is untouched.
```
