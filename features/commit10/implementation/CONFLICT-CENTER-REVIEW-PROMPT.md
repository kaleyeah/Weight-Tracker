# 00-PROMPT.md — Commit 10: the RENDERED CONFLICT CENTRE, for product review

Copy the block below into ChatGPT and attach this package.

```text
You are the Product Architect for Compound Fitness. I'm the Product Owner.
Claude Code is the Lead Engineer. Per our workflow you decide WHAT gets built
and review WHAT was built; Claude decides HOW.

You ruled that the rendered conflict centre should come for review as soon as
the view exists, before the browser wiring, so wording and hierarchy can be
corrected first. Here it is. 869 tests pass, 0 failures (was 825).

This is a PRODUCT review, not an architecture one. What I most need from you is
whether an athlete opening this screen understands what happened to their data
and what each choice will do to it.

Look at these first:

  1. screenshots/01-both-cards-desktop.png and -mobile.png
  2. screenshots/05-recovery-blocked-*.png — the state where neither choice can
     be honoured
  3. screenshots/03-changed-again-*.png
  4. evidence/focus-order.json — the tab order read from the rendered DOM
  5. code/CONFLICT_CENTER_VIEW.js and code/c10-conflict-view.test.js

WHAT IS RENDERED

Seven states at 1280px and 390px: both cards, one card, changed-again,
preserving, recovery-blocked, nothing-pending, and the status indicator with its
per-section detail.

Your language is verbatim and asserted LITERALLY in tests — heading, body, all
three labels and their help text, both confirmations, the changed-again
sentence. If a string drifts the suite fails. I would rather product language be
under test than living in a screenshot nobody re-reads.

Hierarchy follows safety: keep-local is first, primary-styled and focused; the
two destructive choices are ghost-styled below it. No bulk resolve exists.

Recovery-blocked deliberately offers export and retry INSTEAD of a choice
between versions, and never says a copy was saved — because that is precisely
what failed.

The status indicator is a button that opens the centre, never a modal, so a
conflict discovered during a workout changes the status quietly rather than
taking the screen.

A DEFECT THE SCREENSHOT PASS FOUND THAT THE UNIT TESTS DID NOT

With two cards the markup emitted TWO autofocus attributes. Only the first takes
effect, so which section a keyboard or screen-reader user landed in was left to
the browser — an arbitrary half of their own data. My markup assertions were all
satisfied; reading the rendered DOM's focus order is what exposed it. That is an
argument for your ruling to see the view early, and I would not have found it
from the markup alone.

The screenshots are rendered from the SHIPPING functions through the integration
environment, so they cannot drift from the app.

WHAT I AM UNSURE ABOUT, IN YOUR TERMS

1. "Use this device everywhere" and "Use the online copy here" are correct but
   symmetrical, and under stress symmetry is where people misread. Does the
   help text carry enough of the difference, or should the labels themselves say
   which direction the replacement runs?
2. With both sections in conflict the athlete faces six buttons at once. Is that
   acceptable, or should the second card be collapsed until the first is
   resolved?
3. The preserving state is brief and may never be seen. Is showing it right, or
   is a flash of a transient state worse than showing nothing?

STILL UNBUILT

The browser wiring, real Chromium multi-context evidence, and real PocketBase
route evidence. Nothing is deployed; production is untouched.
```
