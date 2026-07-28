# 00-PROMPT.md — Commit 10, PROGRESS package 8: scheduler and route adapter

Copy the block below into ChatGPT and attach this package.

```text
You are the Product Architect for Compound Fitness. I'm the Product Owner.
Claude Code is the Lead Engineer. Per our workflow you decide WHAT gets built
and review WHAT was built; Claude decides HOW.

You approved the recovery storage boundary and authorised integration. This is
the next layer: the scheduler and route adapter, where the rules become network
behaviour. 591 tests pass, 0 failures, no regressions (was 533).

Read in this order:

  1. evidence/wire-evidence.log       — five edits, measured on the wire
  2. code/SCHEDULER_ADAPTER.js        — the adapter, sliced from index.html
  3. code/c10-scheduler.test.js       — 52 tests against the real call graph
  4. evidence/00-full-suite.log

WHAT IT DOES

3s per-subsystem debounce coalescing every edit in the window into one snapshot;
one request in flight per subsystem; core and training fully independent; the
exact route contract asserted field by field; derived SHA-256 keys; a 200
acknowledging only the revision its own request captured, with a mid-flight edit
staying pending; 409 auto-resolving only in your two permitted cases and
otherwise writing a VERIFIED recovery artifact before any conflict exists;
bounded retry on 500/network and none at all on 400/401/413/426. The Commit 1b
raw-snapshot freeze stays shut — the frozen path is not reopened, it is bypassed.

THREE DEFECTS FOUND WHILE BUILDING IT, EVERY ONE CAUGHT BY AN EXISTING TEST

1. My first override reinstated `if(!syncOn())return` before the revision bump,
   silently undoing the Commit 1c fix that keeps signed-out edits advancing the
   local revision. Without that, a later session sees a device that looks clean
   and adopts stale server data over newer local work. The c1c suite caught it —
   which is the argument for never deleting an old test because a newer commit
   now owns the code path.

2. I ACCEPTED ANY HTTP 200 AS A SUCCESSFUL COMMIT. The route's success contract
   is {ok:true, subsystem, newRev}. A proxy page or a misrouted request answering
   200 would have marked the athlete's data clean and stopped syncing it — a
   data-loss shape, not a cosmetic one. This is the Round 2 server lesson, "never
   assert on a status alone", reappearing on the client, and I reintroduced it
   despite having written the server tests that exist because of it. Caught by
   c1d/c1h, which expect an edit to stay pending and saw it go clean against a
   generic 200 stub. A 200 now requires the semantic contract, and a response
   about a different subsystem is a contract failure too.

3. A digest helper moved into a closure during the progress-5 rebuild, so the
   adapter's call threw a ReferenceError inside a scheduled timer — and the test
   environment swallowed timer exceptions, so the suite reported "no request was
   sent". The runner now records timer errors and a permanent test asserts that
   no scheduled callback failed silently. An absent request and a crashed
   callback must never look the same again.

I report these because the pattern matters more than the fixes: two of the three
were regressions of lessons this project had already learned and written down.

STILL UNBUILT

Conflict centre UI, status surface, and the browser/Chromium layer including the
real multi-context evidence you require. Nothing is deployed; production is
untouched.

No question — the conflict workflow and status surface are next.
```
