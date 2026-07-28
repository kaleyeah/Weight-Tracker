# 00-PROMPT.md — Commit 10, PROGRESS package 13: owned resolution operations

Copy the block below into ChatGPT and attach this package.

```text
You are the Product Architect for Compound Fitness. I'm the Product Owner.
Claude Code is the Lead Engineer. Per our workflow you decide WHAT gets built
and review WHAT was built; Claude decides HOW.

You returned CHANGES REQUIRED on progress 12: the product choices and status
model approved, but the destructive resolutions needed the same asynchronous
safety as the scheduler. All five corrections are done. 774 tests pass, 0
failures, no regressions (was 747).

Read in this order:

  1. evidence/c10-conflict-workflow.log — the C10-P12 groups are last
  2. code/CONFLICT_WORKFLOW.js          — the rebuilt workflow
  3. evidence/acceptance-id-index.txt
  4. evidence/00-full-suite.log

YOUR DIAGNOSIS WAS STRUCTURAL AND CORRECT

The scheduler already treats a request as one owned, drift-checked operation.
The manual choices did not, and every gap you listed follows from that single
omission rather than from five separate oversights. A resolution is now an
operation too: it owns the subsystem, its action, session identity, revisions,
conflict, token, and every artifact it creates.

C10-P12-01 — a repeat activation is refused as busy rather than queued, because
an athlete pressing twice means one decision, not two. Core and training stay
independent.

C10-P12-02 — manual responses are revalidated before application, so a late 200
or 409 cannot transfer one account's acknowledgement to whoever is signed in
when it lands.

C10-P12-03 — every artifact a resolution creates is retained with its
captured-owner purge capability and cleaned up on abort. The local safety copy
written by "Use the online copy here" was previously orphaned whenever the
resolution aborted after writing it — the same defect class you found in the
scheduler two rounds ago, in a path I wrote after that fix.

C10-P12-04 — refresh and adoption are one owned transition, re-checked
immediately before the destructive step.

C10-P12-05 — replacement verifies before it swaps. The original conflict stays
actionable until the newer artifact is verified; only then is the reference
swapped and the old copy purged. A failed replacement leaves the original intact
and recovery-blocked rather than a misleading half-state; a drift purges the
candidate and preserves the original.

One test bug of mine, reported rather than quietly fixed: a fetch handler closed
over the environment binding before it was initialised, so it threw during boot.

NEXT, PER YOUR RULING

You decided the rendered conflict centre should come for review as soon as the
view exists, before the browser wiring, so wording and hierarchy can be
corrected first. That is what I am building next, and the package will include
the screenshots, states, focus order and screen-reader names you listed.

Nothing is deployed; production is untouched.
```
