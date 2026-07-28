# 00-PROMPT.md — Commit 10, PROGRESS package 14

Copy the block below into ChatGPT and attach this package.

```text
You are the Product Architect for Compound Fitness. I'm the Product Owner.
Claude Code is the Lead Engineer. Per our workflow you decide WHAT gets built
and review WHAT was built; Claude decides HOW.

You returned CHANGES REQUIRED on progress 13: complete the missing evidence and
the replacement cleanup contract. Both are done. 800 tests pass, 0 failures, no
regressions (was 774).

Read in this order:

  1. evidence/required-id-locations.txt — every ID you named, and where it now is
  2. evidence/c10-conflict-workflow.log — the C10-P12 and C10-P13 groups
  3. code/COMMIT10_BLOCK.js             — the cleanup ledger
  4. evidence/flake-check.log           — ten consecutive full-suite runs
  5. evidence/00-full-suite.log

THE EVIDENCE GAP, WHICH IS THE SECOND TIME

You found ten required C10-P12 IDs absent: 05, 07, 08, 09, 13, 14, 15, 17, 19,
23. They were not missing labels — several of those races had no test at all.
Two rounds ago the same complaint led me to ship every suite and add an ID
index. That made the gap visible without closing it, which is a lesson about
the difference between auditability and coverage. All ten now exist as
behavioural tests, and required-id-locations.txt shows where each one lives.

C10-P13-01 — the old artifact's deletion after a verified swap was launched and
its result discarded, so a failed purge left a verified copy of the athlete's
data behind while the workflow reported the replacement complete. There is now
an account-scoped pending-cleanup ledger: failures are recorded and retried by a
sweep, the new reference is never rolled back because cleanup failed, the ledger
holds artifact ids only, and one account's obligations cannot run against
another's.

A DEFECT MY OWN NEW TEST FOUND

purge reported "removed" based on what EXISTED before the call rather than what
was actually gone. A storage layer that silently ignored removeItem was
therefore reported as a successful deletion — and the ledger, whose entire
purpose is retrying failures, had nothing to retry. Both purge paths now verify
absence and report "not-removed" otherwise.

That is the third time in this commit a function reported an intention instead
of an outcome: the migration exit code, the manifest published before
verification, and now this. I have started treating "does this return value
describe what happened, or what we tried to do?" as a specific thing to check.

AND A FLAKY TEST, CHASED RATHER THAN RE-RUN

While building this package the suite failed once in three runs. The cause was
mine: several assertions checked that a storage key did NOT contain substrings
like "90". Artifact ids end in random hex, so those matched about a third of the
time. Replaced with positive shape assertions, which are both deterministic and
strictly stronger — a key carrying payload content cannot match the pattern.
Verified with twenty consecutive runs of that suite and ten of the full suite,
included as evidence.

NEXT, PER YOUR RULING

The rendered conflict centre, for review before the browser wiring — with the
screenshots, states, focus order and screen-reader names you listed.

Nothing is deployed; production is untouched.
```
