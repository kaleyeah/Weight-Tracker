# 00-PROMPT.md — Commit 10, PROGRESS package 7: two-phase publication

Copy the block below into ChatGPT and attach this package.

```text
You are the Product Architect for Compound Fitness. I'm the Product Owner.
Claude Code is the Lead Engineer. Per our workflow you decide WHAT gets built
and review WHAT was built; Claude decides HOW.

You returned CHANGES REQUIRED on progress 6: locked mutations approved, but
publication must remain non-actionable until verification completes. Done, with
all ten C10-P6 tests. 533 tests pass, 0 failures, no regressions (was 515).

Read in this order:

  1. code/c10-recovery-writer.test.js — 132 tests; the C10-P6 groups are last
  2. code/COMMIT10_BLOCK.js           — two-phase publication
  3. evidence/c10-recovery-writer.log
  4. evidence/00-full-suite.log

C10-P6-01 — YOU IDENTIFIED SOMETHING MY PREVIOUS FIX MADE WORSE-LOOKING RATHER
THAN BETTER. Progress 6 made the writer honest about its own success while
leaving the reader's view untouched, so during the final digest another context
could read the manifest and payload, verify them independently, and treat the
artifact as actionable — and if the writer then drifted, it purged an artifact a
conflict layer had already been handed. A passing suite did not close this
because no test ran the public reader during the window. That is the same class
of error as the sequential-await test: the evidence did not exercise the thing
being claimed.

The fix is simpler than the options you listed. The candidate manifest stays IN
MEMORY, is verified against the stored payload, and only then is the canonical
manifest written — last. No provisional key is written at all, so C10-P6-06 is
satisfied by construction rather than by filtering, and there is no provisional
state a public reader could trip over. After publishing, the manifest is read
back synchronously while the lock is held and compared to the exact serialized
value.

THREE OLDER ASSERTIONS CHANGED, DECLARED RATHER THAN QUIETLY EDITED

  - "final verification ran a SECOND digest" encoded the old sequence. There is
    now one digest, because verification precedes publication. Replaced by the
    property it existed to protect: the canonical manifest is written only after
    the digest resolves.
  - "a manifest altered before final verification fails the write" described a
    window that no longer exists. Rather than delete the case, it now asserts the
    absence of the window: while the writer hashes, NO canonical manifest exists
    to alter.
  - the payload-moved case accepts final-moved or final-unverified; both mean the
    stored bytes changed under the writer.

I flag these because "the tests changed with the code" is exactly how coverage
quietly evaporates, and you should be able to see that these are stronger claims
rather than weaker ones.

STILL OUTSTANDING, UNCHANGED

Real Chromium multi-context evidence remains a release blocker and ships with the
browser layer. Destructive conflict choices remain unintegrated with this store
until you approve the boundary.

No question — the scheduler and route adapter are next.
```
