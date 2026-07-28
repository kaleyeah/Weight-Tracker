# 00-PROMPT.md — Commit 10, PROGRESS package 5: exclusive publication

Copy the block below into ChatGPT and attach this package.

```text
You are the Product Architect for Compound Fitness. I'm the Product Owner.
Claude Code is the Lead Engineer. Per our workflow you decide WHAT gets built
and review WHAT was built; Claude decides HOW.

You returned CHANGES REQUIRED on progress 4: account scoping and ID entropy
approved, mutual exclusion not proved. Both corrections are done, with all ten
C10-P4 tests. 494 tests pass, 0 failures, no regressions (was 465).

Read in this order:

  1. code/c10-recovery-writer.test.js — 93 tests (was 64); the C10-P4 groups are
                                        at the end
  2. code/COMMIT10_BLOCK.js           — the rebuilt recovery store
  3. code/integration-env.js          — the Web Locks stub, declared below
  4. evidence/c10-recovery-writer.log
  5. evidence/00-full-suite.log

YOUR SHARPEST POINT WAS ABOUT MY EVIDENCE, NOT MY CODE, AND YOU WERE RIGHT

The previous "concurrent writers" test did `await write(1)` then `await
write(2)`. That is sequential contention wearing a concurrency label. It never
overlapped, so it proved nothing about the boundary it was named after — and I
presented it to you as proof that cross-tab safety held. That is the more
serious error of the two, because a wrong claim about what has been verified is
worse than a wrong line of code: it removes the reason to look again.

WHAT CHANGED

Publication is serialised by a real exclusive Web Lock keyed
cf-cas-recovery:<account>:<artifact-id>. The claim token stays, but only as an
ownership marker for cleanup, never as the exclusion primitive. With no Web
Locks available the write FAILS CLOSED with reason "no-lock" and writes nothing
at all — not even a claim — rather than falling back as if the claim were
equivalent.

C10-P4-01, the account switch during the async digest: every attempt captures an
immutable operation context (owner, session generation, id, keys, lock name,
token) and every continuation checks for drift before publishing. Cleanup uses
the CAPTURED keys, so a drifted write tidies the original account's partial
state and never addresses the newly active account's namespace. Tested in both
directions, including account A drifting while account B holds a genuine
artifact under the same id: B's artifact is untouched and still verifies.

The namespace is no longer caller-selectable — key construction is private to a
module closure and the public surface takes an artifact id and nothing else.

THE TESTS NOW GENUINELY OVERLAP

Both writers start before either callback runs, and a pausable digest parks one
writer at a chosen point while the other proceeds — including the case you named
specifically, a writer paused after its checks that must not clobber a later
completed writer.

ONE TEST-ENVIRONMENT CHANGE, DECLARED

integration-env.js gains a Web Locks stub whose queues live in a PROCESS-WIDE
registry, because locks are an origin-wide primitive and every sandbox models a
tab on one origin. Per-sandbox queues would have made these tests vacuous —
which is the same class of mistake as the sequential-await test, so I want it
visible rather than buried.

A HARNESS BUG WORTH RECORDING, BECAUSE PRODUCTION BEHAVED CORRECTLY

My first pausable-digest helper rebuilt the crypto object with Object.assign,
which copies own properties and therefore dropped getRandomValues and randomUUID
— they live on the prototype. The writer immediately refused with "entropy",
which is exactly right for a missing secure source. So a test-harness defect
briefly looked like a production defect, and the fail-closed design is what made
it legible. The helper now shadows only subtle.digest on the real object.

WHAT I HAVE NOT DONE

Real Chromium multi-context evidence. You required it before the recovery
boundary is approved and I agree it is not optional — a deterministic stub of
Web Locks is a model of the primitive, not the primitive. It belongs with the
browser layer, and I will bring it there rather than claim this round is
complete without it.

Per your ruling I have not integrated destructive conflict choices with this
writer, and will not until you approve this boundary.

No question this time — the scheduler and route adapter are next, which you
authorised in parallel.
```
