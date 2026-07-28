# 00-PROMPT.md — Commit 10, PROGRESS package 15: the ledger cannot lose an obligation

Copy the block below into ChatGPT and attach this package.

```text
You are the Product Architect for Compound Fitness. I'm the Product Owner.
Claude Code is the Lead Engineer. Per our workflow you decide WHAT gets built
and review WHAT was built; Claude decides HOW.

You returned CHANGES REQUIRED on progress 14: the race evidence was complete but
the cleanup ledger could lose obligations. Both corrections are done, with all
ten C10-P14 tests. 815 tests pass, 0 failures, stable across eight consecutive
full-suite runs (evidence/flake-check.log).

Read in this order:

  1. evidence/required-id-locations.txt — every C10-P14 ID and where it lives
  2. evidence/c10-conflict-workflow.log — the C10-P14 groups are last
  3. code/COMMIT10_BLOCK.js             — the locked, bounded ledger
  4. evidence/flake-check.log
  5. evidence/00-full-suite.log

C10-P14-01 — THE LEDGER HAD EXACTLY THE DEFECT IT WAS BUILT TO PREVENT. Its own
read-modify-write was unlocked, so two tabs recording different failed deletions
would each write their own list and the last writer would erase the other's
obligation. That is the untracked-artifact problem again, one level up, in the
mechanism introduced to solve it. Every mutation now runs under one exclusive
account-level Web Lock, re-reads inside it, merges, writes and reads back to
confirm; without Web Locks it reports failure rather than claiming the
obligation was recorded. A sweep no longer drops an obligation until the
artifact is verifiably gone.

C10-P14-02 — it also truncated at 200 silently. It now refuses at the bound and
says so. Since replacement has already committed the newer conflict by then,
that must not roll back, so purgeTracked reports two separate facts: whether the
deletion happened, and whether the obligation was recorded — "untracked:<reason>"
when it was not.

I also added the deterministic account-scoped reconciliation you asked for: an
untracked artifact remains discoverable as a manifest in this account's
namespace that no live reference and no ledger entry accounts for. Recovery no
longer depends on the ledger having succeeded, which matters precisely because
the ledger can fail.

MY FIRST VERSION OF THESE TESTS PROVED NOTHING

They blocked deletion but used artifact ids that had never been written, so
purge correctly reported "absent" — which needs no cleanup and is a success.
Green, and worthless. The tests now create real artifacts first. An id that does
not exist and an id that cannot be deleted are different situations, and only
one of them tests anything.

That is the second time in three rounds that a test of mine passed for a reason
unrelated to the property it named. I am now checking, for each new test, what
would have to break for it to fail — and if the answer is "nothing reachable",
it is not evidence.

NEXT, PER YOUR RULING

The rendered conflict centre, for review before the browser wiring.

Nothing is deployed; production is untouched.
```
