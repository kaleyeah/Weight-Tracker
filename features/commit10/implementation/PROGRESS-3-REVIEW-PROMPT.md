# 00-PROMPT.md — Commit 10, PROGRESS package 3: recovery artifact integration

Copy the block below into ChatGPT and attach this package.

```text
You are the Product Architect for Compound Fitness. I'm the Product Owner.
Claude Code is the Lead Engineer. Per our workflow you decide WHAT gets built
and review WHAT was built; Claude decides HOW.

You approved the progress-2 corrections and authorised continued implementation,
recording two obligations for the integration. This package discharges the first
of them: the recovery-artifact storage integration and its seven-point
immutability proof.

436 tests pass, 0 failures, no regressions (was 401).

Read in this order:

  1. code/c10-recovery-writer.test.js  — 35 tests, one named group per point
  2. code/COMMIT10_BLOCK.js            — the decision core plus the new writer
  3. evidence/c10-recovery-writer.log  — generated when this archive was built
  4. evidence/00-full-suite.log

YOUR SEVEN POINTS, EACH WITH A NAMED TEST

  1. a fresh artifact id is chosen — and verified free on disk before use
  2. an existing id is refused BEFORE any component write. Proved rather than
     asserted: the second write attempts different bytes, and the test checks
     the stored payload still does not contain them
  3. component bytes written first
  4. those bytes read back, and the digest computed from what storage returned
  5. manifest written last — its presence is what makes the artifact real
  6. partial failure leaves nothing actionable: the orphan is purged and a read
     reports "absent"
  7. no later caller can overwrite in place, including one authenticated as a
     different account

POINT 4 IS THE ONE I WANT YOU TO CHECK MOST CLOSELY

You wrote that a caller-supplied digest must never be trusted merely because it
has the correct shape. I read that as: the digest must be computed from the
bytes a future reader would actually find, not from the string we intended to
write. The test proves the difference by installing a storage layer that
silently truncates on read. A digest taken from the in-memory string sails
through it; the implementation refuses with reason "readback". Quota
truncation and a unicode-mangling storage shim fail the same way.

cfCasRecRead applies the same rule in reverse: it recomputes the digest from
the stored bytes and returns the payload only when cfCasRecVerified passes, so
a conflict card cannot become actionable on an unverified artifact.

ONE TEST-INFRASTRUCTURE CHANGE WORTH DECLARING

tests/integration-env.js now exposes crypto.webcrypto and TextEncoder to the
sandbox. Every modern browser provides both on a secure context and the app is
served over https, so this makes the stub more faithful to the real environment
rather than introducing a test seam into production code — the writer hashes
with the same crypto.subtle call it will use in the browser. I mention it
because changing a test environment to make code pass is exactly the move that
deserves scrutiny, and I would rather you judge it than not notice it.

Also reported rather than polished: two mistakes of mine were caught by the
tests during this work — the suite initially used a non-existent environment
accessor, and one case deleted the payload and then expected the
unparseable-manifest branch, when the reader correctly reports the missing
payload it encounters first.

STILL UNBUILT

The scheduler and route adapter, the conflict-record integration, the conflict
centre, the status surface, and the browser and real-PocketBase layers. Nothing
is deployed; production is untouched.

No decision needed unless something above reads wrong — the scheduler and route
adapter are next.
```
