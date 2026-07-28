# 00-PROMPT.md — Commit 10, PROGRESS package 9: asynchronous request-context safety

Copy the block below into ChatGPT and attach this package.

```text
You are the Product Architect for Compound Fitness. I'm the Product Owner.
Claude Code is the Lead Engineer. Per our workflow you decide WHAT gets built
and review WHAT was built; Claude decides HOW.

You returned CHANGES REQUIRED on progress 8: wire contract approved, but the
asynchronous request context was not safe. All six corrections are done, with
the eighteen C10-P8 tests. 634 tests pass, 0 failures, no regressions (was 591).

Read in this order:

  1. code/c10-scheduler.test.js — 85 tests; the C10-P8 groups are last
  2. code/SCHEDULER_ADAPTER.js  — the rebuilt adapter
  3. evidence/c10-scheduler.log
  4. evidence/00-full-suite.log

C10-P8-01 — one captured operation. Everything is captured before any async
work, and the payload sent on the wire is parsed back out of the canonical bytes
the idempotency key was derived from, so key and body cannot disagree by
construction rather than by discipline.

C10-P8-02/03 — the subsystem is reserved BEFORE the async build. A second
trigger during hashing records a rerun instead of starting a second hash and
fetch. Owner, session generation and token are captured and re-checked before
sending and before applying any response, so a late 200 or 409 for a signed-out
account is completely inert.

C10-P8-04 — a genuine 409 blocks the subsystem immediately, before the recovery
write, and the recovery callback re-checks drift before publishing the reference.

C10-P8-05 — the response contract is enforced. A 200 needs ok:true, a subsystem
equal to the one requested (absent is not valid), and a non-negative integer
newRev. A 409 needs the documented shape or the documented no-row shape.
Malformed bodies become contract failures instead of being canonicalised into a
fake conflict and a fake recovery artifact.

C10-P8-06 — YOU WERE RIGHT THAT THE GUARD WAS DEAD CODE. cfCasHandle reset the
attempt counter to zero before calling the conflict path, which then read that
same counter to ask "have I already retried?". The answer was always no, so a
server whose payload equalled the baseline could be retried after every 409
indefinitely. Retry-once now lives in a per-subsystem conflict-sequence flag,
outside the network retry counter, cleared on success or agreement. You flagged
this as "appears to be cleared before the rule reads it" and asked for
controlled evidence rather than assuming; the evidence now exists and the
suspicion was correct.

Review §7 — an uncertain retry re-sends the CAPTURED operation, so expected
revision, payload bytes and idempotency key are identical, and a newer edit
waits behind it rather than taking over an uncertain request's identity.

ONE TEST OF MINE WAS ASSERTING AT THE WRONG MOMENT

It checked that a newer edit was still pending AFTER the rerun had legitimately
sent it, so it failed for the right reason. It now asserts the moment in
between: the response acknowledged only the revision its own request captured.
Worth stating because "the test failed, so I loosened it" and "the test was
measuring the wrong instant" look identical in a diff.

STILL UNBUILT

Conflict centre UI, status surface, and the browser layer including the real
Chromium multi-context evidence and real PocketBase runs you require. Nothing is
deployed; production is untouched.

No question — the conflict workflow and status surface are next.
```
