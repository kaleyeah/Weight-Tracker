# 00-PROMPT.md — Commit 10, PROGRESS package 11

Copy the block below into ChatGPT and attach this package.

```text
You are the Product Architect for Compound Fitness. I'm the Product Owner.
Claude Code is the Lead Engineer. Per our workflow you decide WHAT gets built
and review WHAT was built; Claude decides HOW.

You returned CHANGES REQUIRED on progress 10. Both corrections are done. 700
tests pass, 0 failures, no regressions (was 684).

Read in this order:

  1. evidence/c10-scheduler.log       — the C10-P10 groups are last
  2. code/COMMIT10_BLOCK.js           — the whole Commit 10 block
  3. evidence/acceptance-id-index.txt — every acceptance ID in the suites
  4. evidence/00-full-suite.log

C10-P10-01 — YOU FOUND UNREACHABLE CODE, AND MY TEST WAS THE PROBLEM.

writeLocked built the captured-owner purge capability and passed it as a third
callback argument; the public wrapper forwarded only two. `cap` was always
undefined at the scheduler, so the drift-cleanup branch I added last round could
never run.

My test passed regardless, because it exercised a different path entirely: it
moved CF_SESSION_GEN, which the recovery store checks itself, so the store
aborted BEFORE publication and never produced a capability at all. A green test
for a path that cannot execute is worse than no test — it reads as proof.

The interleaving you described exists precisely BECAUSE of the previous round's
correction. The store checks owner and generation; the scheduler now checks
owner, generation and the full token. A token rotation with owner and generation
unchanged therefore slips past the store, which publishes a verified artifact and
returns the capability, and is caught only by the scheduler. That is the single
path where a dropped capability orphans real health data, and it is now the test:
the artifact is published, the scheduler detects drift, the captured capability
purges it, and the active account's namespace is untouched.

C10-P10-02 — transient blocks are operation-owned. A string match on
"preserving" could not distinguish an old operation's pause from a newer one's,
so a late callback could unpause a conflict it knew nothing about. Every block
now records the operation token that set it, and only that operation may clear
it. The test proves the old token cannot clear the new block while the owning
token still can.

STILL UNBUILT

Conflict centre UI, status surface, and the browser layer including real Chromium
multi-context and real PocketBase evidence. Nothing is deployed; production is
untouched.

No question — the conflict workflow and status surface are next.
```
