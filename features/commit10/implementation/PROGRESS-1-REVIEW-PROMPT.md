# 00-PROMPT.md — Commit 10 implementation, PROGRESS package 1 of n

**This is a progress package, not the final Commit 10 evidence package.** Two
self-contained pieces are complete; the scheduler, route adapter, conflict
centre, status surface and the integration/browser layers are not yet written.

Copy the block below into ChatGPT and attach this package.

```text
You are the Product Architect for Compound Fitness. I'm the Product Owner.
Claude Code is the Lead Engineer. Per our workflow you decide WHAT gets built
and review WHAT was built; Claude decides HOW.

You returned APPROVED TO IMPLEMENT WITH REQUIRED CLARIFICATIONS on the Commit 10
pre-coding plan. Implementation has started. THIS IS A PROGRESS PACKAGE, not the
final evidence package — I am sending it now because two release-blocking pieces
are complete and self-contained, and if either is wrong I would rather know
before the rest is built on top of them.

Read in this order:

  1. code/COMMIT10_BLOCK.js          — the decision core, sliced verbatim from
                                       the shipping index.html
  2. code/manifest-reader.js         — the independent manifest reader you
                                       required
  3. code/c10-cas-client.test.js     — 74 tests, each naming its acceptance ID
  4. code/c10-independent-manifest.test.js — 34 tests
  5. evidence/                       — full suite output, generated when this
                                       archive was built
  6. 00-PRE-CODING-PLAN.md           — Revision 2, with your six rulings folded in

State: 385 tests pass, 0 failures (277 before this commit, +108 new). No
regressions in any prior hardening suite.

WHAT IS COMPLETE

1. The decision core, appended to index.html as one @testable-start C10 block.
   Every guarantee Commit 10 makes is a rule about WHEN something may happen —
   when a response may mark data clean, when a destructive choice may proceed,
   when a conflict may be resolved without asking. Those rules are pure
   functions so they can be tested against the SHIPPING source rather than a
   copy; harness.js slices the block out of index.html itself.

   Your rulings are implemented and tested:
     - idempotency identity uses the full SHA-256 hex, and an over-length
       digest is REFUSED rather than truncated;
     - cfCasCtxDrifted is subsystem-specific, so an unrelated Training edit no
       longer aborts a Health & progress adoption — C10-PLAN-05 and
       C10-PLAN-06 are a matched pair proving it: same interruption, opposite
       outcomes, decided solely by which subsystem moved;
     - cfCasRecValid rejects the whole-snapshot component set outright, so the
       misleading hybrid artifact you forbade cannot be written by accident;
     - cfCasFirstRowAllowed requires all four positive conditions;
     - a reused idempotency key is dispositioned as an invariant and can never
       reach the conflict centre.

2. The independent manifest reader, written from the CONTRACT rather than from
   the shipping code. Independence is enforced by test, not asserted: it
   requires nothing at all, and tests assert the absence of cfManifestValid,
   cfSameStringSet and cfCanon. It automates H3, J6, K4, K5, L4 and M1-M4
   against fixtures; the browser layer will feed it real localStorage dumps.

ONE THING WORTH YOUR ATTENTION

The independence test FAILED on its first run — it was matching those three
function names inside the reader's own header comment, the one explaining what
it must not use. Documenting the rule looked like breaking it. The check now
strips comments before matching, and asserts the stripper did not simply empty
the file so it cannot pass vacuously. I am reporting this rather than quietly
fixing it because the alternative fix — deleting the explanation from the
header — would have made the file less honest to satisfy a test.

WHAT IS NOT BUILT YET

The scheduler and route adapter, the conflict centre view, the status surface,
and the integration and browser test layers. Nothing has been deployed; the
production server is untouched and this is all client-side.

Two questions, both optional — say nothing and I will carry on:

1. Does the decision core match your intent, particularly cfCasAutoResolve,
   where the only two silent paths are "the server already holds what we sent"
   and "the server still equals our last agreed baseline"?
2. Is the cas-conflict artifact contract in cfCasRecValid what you had in mind
   for "self-contained enough to restore the affected subsystem"?
```
