# 00-PROMPT.md — Commit 10, PROGRESS package 12: conflict workflow and status

Copy the block below into ChatGPT and attach this package.

```text
You are the Product Architect for Compound Fitness. I'm the Product Owner.
Claude Code is the Lead Engineer. Per our workflow you decide WHAT gets built
and review WHAT was built; Claude decides HOW.

You approved the scheduler and recovery foundations and authorised the
user-facing layer. This is the conflict workflow and status model, and it
discharges the five cases deferred from client staging. 747 tests pass, 0
failures, no regressions (was 700).

Read in this order:

  1. evidence/c10-conflict-workflow.log — A6, C4, C5, F5, K1 by name
  2. code/CONFLICT_WORKFLOW.js          — the workflow, sliced from index.html
  3. code/c10-conflict-workflow.test.js — 47 tests
  4. evidence/acceptance-id-index.txt
  5. evidence/00-full-suite.log

THE FIVE DEFERRED CASES

  A6  the correction stays active, the server version is preserved as a
      verified copy, a choice is offered, no winner is chosen automatically
  C4  nothing sent, nothing replaced, still pending, still conflicted, the
      online copy still verifiable
  C5  neither destructive choice is reachable, the wording never claims a copy
      was saved, local data stays active and pending
  F5  this device's version preserved FIRST, the server re-read before adopting,
      clean at the server revision afterwards
  K1  an edit during the safety copy aborts adoption, the edit survives, the
      device stays pending, the conflict remains unresolved

Your language decisions are implemented: "Health & progress" and "Training &
workouts", keep-local as the focused default, and "The online copy changed
again. Review your choice." when a second 409 or a moved server revision
invalidates what the athlete was deciding against. A test asserts that no status
string mentions a revision, a subsystem code, CAS or a payload.

TWO DEFECTS THE TESTS FOUND, BOTH FIXED IN THE CODE RATHER THAN THE TESTS

1. The resolution context was captured too late. Both destructive choices read
   and verified the stored artifact first and captured the context afterwards.
   Reading is asynchronous, so an edit made during it was already folded into
   the "before" picture and could never register as drift — which is exactly the
   K1 case the context exists to catch. It is now captured before anything
   asynchronous begins and re-checked after the read and after the safety copy.

2. A recovery-blocked subsystem still advertised a conflict card. It holds a
   conflict id, but its stored copy could not be verified, so neither choice may
   be offered. Reporting "Sync needs your choice" would have invited the athlete
   into a screen whose options are all unavailable, and implied the online copy
   was safely preserved when that is precisely what failed. It now reports the
   safe failed state.

STILL UNBUILT

The conflict-centre view itself — the rendered cards and the interruption policy
that keeps a modal out of an active workout — and the browser layer with real
Chromium multi-context and real PocketBase evidence. Nothing is deployed;
production is untouched.

One question. The workflow is behaviourally complete and tested, but the visible
surface is not built. Would you rather review the rendered conflict centre
together with the browser evidence in one package, or see the view as soon as it
exists so the wording can be corrected before it is wired to real interactions?
```
