# 00-PROMPT.md — Commit 10, PROGRESS package 16

Copy the block below into ChatGPT and attach this package.

```text
You are the Product Architect for Compound Fitness. I'm the Product Owner.
Claude Code is the Lead Engineer. Per our workflow you decide WHAT gets built
and review WHAT was built; Claude decides HOW.

You returned CHANGES REQUIRED on progress 15: reconciliation proof and ID
validation. Both are done — and chasing them uncovered a harness defect that
makes this the most important package I have sent you. 825 tests pass, 0
failures, stable across eight consecutive full-suite runs.

Read in this order:

  1. code/harness.js                    — the defect and its fix
  2. evidence/required-id-locations.txt — every C10-P15 ID and where it lives
  3. evidence/c10-conflict-workflow.log
  4. evidence/flake-check.log
  5. evidence/00-full-suite.log

C10-P15-01 — you were right that my test would have passed against an empty
result. It asserted only that the ACTIVE artifact was absent, never that the
untracked one was present. It now proves the whole chain: the recording attempt
failed, the manifest is still in storage, the id is absent from the ledger,
reconciliation returns THAT EXACT ID, the active conflict is excluded, another
account cannot discover it, and cleanup afterwards verifies real absence.

C10-P15-02 — the ledger accepted any string, so "not-an-artifact",
"../../other-key" and "casrec-core-" survived a read and could be used to build
storage keys. One strict validator now matches exactly what newId produces —
casrec-(core|training)- plus 32 hex — and is applied at every entry point:
pendingList, pendingAdd, pendingDrop, purgeScoped and reconciliation. Invalid
entries consume no capacity, because an unusable string is not an obligation.

THE THING YOU SHOULD READ FIRST

While fixing those I pushed a commit with a failing suite: it passed standalone
and failed under the runner, and I had not checked. The cause turned out to be
systemic. test() caught synchronous throws, but an ASYNC callback's assertions
run after test() returns, so a failure inside one never reached that catch — the
test printed a tick and the rejection surfaced later as a process crash, or as
nothing at all. NINETEEN tests across three Commit 10 suites were written that
way. All nineteen were unverifiable, and they are in packages you have already
approved.

test() now refuses a promise-returning callback outright. All nineteen are
converted, and one of them had indeed been asserting the wrong value the whole
time — which in turn exposed a real wording defect: an unusable artifact id is
not an untracked OBLIGATION, so purgeTracked now reports "invalid-id" plainly
rather than describing a cleanup debt that does not exist.

This is the same failure mode as the swallowed timer errors: a harness that
cannot tell "nothing went wrong" from "we never looked". If you want to re-audit
any earlier approval in light of this, the converted suites are all included.

NEXT

The rendered conflict centre, per your ruling. Nothing is deployed; production
is untouched.
```
