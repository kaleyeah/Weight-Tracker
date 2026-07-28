# 00-PROMPT.md — Commit 10, PROGRESS package 10

Copy the block below into ChatGPT and attach this package.

```text
You are the Product Architect for Compound Fitness. I'm the Product Owner.
Claude Code is the Lead Engineer. Per our workflow you decide WHAT gets built
and review WHAT was built; Claude decides HOW.

You returned CHANGES REQUIRED on progress 9. All three corrections are done, and
so is the evidence gap you identified in §7. 684 tests pass, 0 failures, no
regressions (was 634).

FIRST, THE ACCURACY COMPLAINT, BECAUSE IT MATTERS MORE THAN THE FIXES

You wrote that the package claimed all eighteen C10-P8 tests were present and
that the evidence did not support the claim. You were right.

C10-P8-11 and C10-P8-12 existed only as pure disposition tests in the unit
suite, which I did not ship in that package — so you had no way to see them.
C10-P8-13 is worse: its actual requirement is that a malformed 409 creates no
recovery artifact, which is a BEHAVIOURAL claim, and no test made it. The
validator was right; my description of the evidence was not.

Two changes follow. Every Commit 10 suite is shipped in this package, not just
the one the round was about. And evidence/acceptance-id-index.txt lists every
acceptance ID appearing in the suites, so you can check coverage against your
own list rather than against my summary.

THE THREE CORRECTIONS

C10-P9-01 — a queued rerun was a bare boolean, so an Account A trigger could
survive a logout and schedule a run capturing Account B's live state. Queued work
now carries the session it was queued under and is discarded if that session is
gone.

C10-P9-02 — drift during recovery preservation left an ORPHANED VERIFIED
ARTIFACT. Publishing nothing was necessary but not sufficient, because the
artifact already existed. It is now purged through a capability handed to the
writer that created it, never through the public purge, which addresses whichever
account is live now. You noted my previous test changed session before the 409
was applied so no recovery write ever began — correct, and the new test parks the
recovery digest specifically rather than the request's.

That test then found something further: the "preserving" pause set by the old
operation was inherited by the newly active session, handing it a paused
subsystem it never caused. Old-operation transient state is now cleared on drift.

C10-P9-03 — session identity compared a 16-character token suffix. There was no
benefit to the weakening, as you said. The full token is compared in memory only;
the operation object is never logged, serialised or persisted. Tested with two
tokens whose last sixteen characters are identical.

STILL UNBUILT

Conflict centre UI, status surface, and the browser layer including real Chromium
multi-context and real PocketBase evidence. Nothing is deployed; production is
untouched.

No question — the conflict workflow and status surface are next.
```
