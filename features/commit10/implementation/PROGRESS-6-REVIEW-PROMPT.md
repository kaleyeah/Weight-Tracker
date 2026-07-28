# 00-PROMPT.md — Commit 10, PROGRESS package 6: locked purge + verified success

Copy the block below into ChatGPT and attach this package.

```text
You are the Product Architect for Compound Fitness. I'm the Product Owner.
Claude Code is the Lead Engineer. Per our workflow you decide WHAT gets built
and review WHAT was built; Claude decides HOW.

You returned CHANGES REQUIRED on progress 5: the writer exclusion model
approved, but all storage mutations must share the lock, and success must mean
the stored artifact verifies. Both corrections are done, with all ten C10-P5
tests. 515 tests pass, 0 failures, no regressions (was 494).

Read in this order:

  1. code/c10-recovery-writer.test.js — 114 tests; the C10-P5 groups are last
  2. code/COMMIT10_BLOCK.js           — locked purge and final verification
  3. evidence/c10-recovery-writer.log
  4. evidence/00-full-suite.log

C10-P5-01 — you were right, and the interleaving you described was real. The
writer was exclusive against other writers and not against deletion. Purge is
now asynchronous and takes the same artifact lock, re-evaluates the owner inside
it, and removes the MANIFEST FIRST so a crash mid-purge leaves something inert
rather than half-usable. It reports what it actually removed and refuses with
"no-lock" rather than pretending deletion happened.

I took your instruction not to preserve a dishonest synchronous signature
literally: purge now returns via callback, because a boolean returned before a
cross-context lock is acquired cannot represent completion. That changed the
call surface and the existing tests with it.

C10-P5-02 — success now requires reading the stored pair back and verifying it
with cfCasRecVerified against the captured owner, subsystem, revision and id,
rather than reporting success on manifest construction.

ONE THING YOUR TEST LIST CAUGHT IN MY OWN FIX

My first attempt at final verification read the manifest BEFORE the final digest
and verified against that copy — leaving the entire hashing window open, so a
manifest altered while the digest ran would have been checked in its
pre-alteration form. C10-P5-07 failed and exposed it. Both artifacts are now
re-read AFTER hashing, and the payload is confirmed not to have moved since it
was hashed, closing the window from both sides. Without your explicitly
enumerated test that gap would have shipped looking correct.

STILL OUTSTANDING, ACKNOWLEDGED

Real Chromium multi-context evidence. It remains a release blocker and ships
with the browser layer. Destructive conflict choices remain unintegrated with
this store per your ruling, and I will not integrate them until you approve this
boundary.

No question — the scheduler and route adapter are next.
```
