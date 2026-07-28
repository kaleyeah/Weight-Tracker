# 00-PROMPT.md — Commit 10, PROGRESS package 4: the two storage corrections

Copy the block below into ChatGPT and attach this package.

```text
You are the Product Architect for Compound Fitness. I'm the Product Owner.
Claude Code is the Lead Engineer. Per our workflow you decide WHAT gets built
and review WHAT was built; Claude decides HOW.

You returned CHANGES REQUIRED on progress 3: read-back verification approved,
storage isolation not yet proved. Both corrections are done, with all ten tests
you named. 465 tests pass, 0 failures, no regressions (was 436).

Read in this order:

  1. evidence/isolation-demonstrated.log — account scoping and id entropy shown
                                           working, generated at build time
  2. code/c10-recovery-writer.test.js    — 64 tests (was 35)
  3. code/COMMIT10_BLOCK.js              — the corrected writer
  4. evidence/00-full-suite.log

C10-P3-01 — YOU WERE RIGHT, AND THIS ONE MATTERED.

The account lived only inside the manifest, not in the storage namespace. On a
shared origin that meant account B could enumerate A's recovery artifacts, read
A's health payload straight out of localStorage while holding the id, and delete
it. The manifest check only stopped a well-behaved caller ACCEPTING the artifact;
it protected nothing at rest.

What makes this worth saying plainly: it is the same defect class M1 fixed for
photos — ownerless data on a shared device — and I reintroduced it for recovery
artifacts without carrying the lesson across. The prior fix was in the codebase
I had already read.

Keys are now cf:casrec:<account>:<id>:*, with the scope taken from the trusted
authenticated session and never from an argument, so no caller can address
another account's namespace by asking for it. B now gets "absent" — unreachable,
not filtered — and cfCasRecList shows nothing.

C10-P3-02 — ids now carry cryptographic entropy (crypto.randomUUID, falling back
to getRandomValues). With no entropy source available the function returns null
rather than a guessable id: refusing to write beats writing something
predictable. Two sandboxes sharing one storage — two tabs — now write the same
id with different payloads in test; exactly one wins, the loser damages nothing,
and the stored artifact is never a mix.

Your §4 cleanup clarification: a claim token is taken before any component
write and re-read afterwards, so exactly one writer proceeds, and purge compares
that token before deleting so a loser can only remove its own partial state.

ONE THING THE EVIDENCE ITSELF CAUGHT

Writing the demonstration log exposed a wording defect of my own. cfCasRecPurge
returned true for account B even though it had removed nothing — it never had
access. A caller could have read that as "the copy is gone" when the copy was
simply unreachable. It now reports whether anything was actually removed, and
the test asserts B is told false. That is a small thing, but "we deleted your
recovery copy" and "we could not see your recovery copy" must not be the same
return value.

Also updated rather than deleted: the test "the payload is written first" became
"the claim is taken first, and the payload is the first COMPONENT written",
because the claim is a lock and not a component.

STILL UNBUILT

The scheduler and route adapter, conflict-record integration, conflict centre,
status surface, and the browser and real-PocketBase layers. Nothing is deployed;
production is untouched.

One question: is the claim-token mechanism acceptable as the mutual-exclusion
primitive? It is honest about its limits — localStorage offers no atomic
compare-and-set, so this is write-then-reread, which resolves a race between two
tabs but is not a lock in the strict sense. It satisfies your stated criteria
(one winner, no mixed artifact, no cross-writer deletion). If you want something
stronger — the Web Locks API, say — that is a product-risk decision rather than
an implementation preference, so I would rather you make it.
```
