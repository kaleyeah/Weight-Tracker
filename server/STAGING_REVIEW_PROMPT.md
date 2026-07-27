# Staging Review Request — CAS Server Kit, Round 2 (for ChatGPT / Product Architect)

**Last Updated:** 2026-07-27

**Status:** Active — blocking. Companion to `STAGING_RESULTS.md`. Follows the `REVIEW_REQUEST.md` pattern; see `ROLES_AND_WORKFLOW.md` Step 4.

> Copy the block below into ChatGPT and attach `cf-cas-staging-round2-20260727.zip`.

---

## Prompt

```text
You are the Product Architect for Compound Fitness. I'm the Product Owner.
Claude Code is the Lead Engineer. Per our workflow you decide WHAT gets built
and review WHAT was built; Claude decides HOW.

This is ROUND 2 of the CAS server kit staging attempt. You previously returned
a status file directing: "Fix migration, rerun staging, then submit a new
staging review package." The migration is fixed and verified. The rerun found
three further defects. Read in this order:

  1. STAGING_RESULTS.md              — §1 is the defect register; start there
  2. evidence/manual-cas-repro.log   — proof the CAS logic itself is correct
  3. evidence/cas-tests-patched.log  — 17 passed / 4 failed
  4. evidence/cas-tests-unpatched.log — the kit exactly as you hold it: route dead
  5. kit/pb_hooks/cf_cas.pb.js       — defect 2 lives at lines 8-15 vs line 20
  6. kit/tests/cas-server-tests.sh   — defect 3 lives at lines 26-28
  7. kit/pb_migrations/…cf_cas.js    — defect 1 FIXED here; defect 4 at the
                                       cf_commit_log user relation
  8. docs/                           — DEPLOYMENT, SERVER_NOTES, LOCAL_AGENT_BRIEF

Context so you evaluate rather than rediscover:

  - THE COMMIT ROUTE HAD NEVER WORKED. PocketBase runs routerAdd handlers in a
    separate goja runtime, so the handler cannot see its file's top-level
    scope. CF_SUBSYSTEMS, CF_MAX_PAYLOAD_BYTES, CF_MIN_CLIENT_BUILD and
    cfUtf8Bytes are all undefined inside the handler. Every commit threw
    ReferenceError and returned a generic 400. This is environment-independent
    — it would fail identically on the NAS. The kit had evidently never been
    executed against a running PocketBase before this session.
  - Two tests PASSED against that completely dead route (T8, T9 both assert
    only "expect 400", and a crashed handler returns 400). Status-only
    assertions cannot tell validation from a crash.
  - The suite's concurrency cases cannot test concurrency: both parallel
    commit() calls write the request body to the SAME temp file, so both curls
    send an identical body. The server correctly does one commit + one
    idempotent replay; the suite scores that as a failure. T1, T2, T3a and
    T13a are ALL harness artifacts, not server defects.
  - Driven by hand with genuinely distinct concurrent requests, the CAS logic
    is CORRECT on both critical paths — same-rev race and first-row create
    race. One winner, one real 409 carrying the winner's revision and payload,
    exactly one row. No CAS correctness defect was found.
  - The ledger's user relation is required + non-cascading, so a user with
    cf_commit_log rows CANNOT BE DELETED. Teardown reported success while
    leaving the account behind, because it never checks the DELETE status.
  - Claude fixed ONLY the migration (authorised by your status return). Defects
    2, 3 and 4 are diagnosed but NOT fixed, on my instruction. The hook and the
    test scripts in this zip are byte-identical to what you hold. The §4 suite
    results required a staging-only patch, clearly marked, never committed.
  - Production was never written to. One unauthenticated GET /api/health, and
    nothing else, all session. Staging was a loopback-only local instance from
    a fresh backup, destroyed afterwards.

I want five things, in priority order:

1. VERDICT ON THE DEFECT 2 FIX SHAPE (blocks everything). Constants and helper
   declared inside the handler, or moved to a module loaded with require()
   inside the handler? The second is the PocketBase-idiomatic way to share code
   across hooks and survives the kit growing; the first is a smaller diff. Pick
   one so this doesn't get re-litigated at production cutover.

2. HOW MUCH OF THIS KIT DO YOU NOW DISTRUST? A route that never ran means the
   integration suite never exercised it, and two tests passed against a corpse.
   Tell me whether you want (a) the suite hardened to assert on response bodies
   rather than status codes alone, (b) an independent re-derivation of the test
   matrix from SERVER_NOTES.md rather than patching the existing script, or
   (c) something else before any of this counts as evidence. I would rather
   spend a cycle on this than carry a false green into production.

3. RULING ON DEFECT 4 — the undeletable-user problem. With 30-day ledger
   retention, a real athlete account is undeletable for up to 30 days after
   their last write, failing with an opaque relation error. cascadeDelete:true,
   nullable owner, or prune-on-delete? This is a data-protection question as
   much as a schema one, so I want your call rather than Claude's default.

4. CARRIED OVER FROM ROUND 1, STILL UNANSWERED:
   a. Rollback semantics. The down-migration drops only the index the kit
      created and deliberately leaves an adopted pre-existing one alone
      (production's `idx_88qok6ts7v`). Confirm or correct — it is currently
      documented as intent on Claude's judgement, not yours.
   b. Payload cap. Measured max 18,954 B; the step-4 formula gives ~74 KiB
      against the 2 MiB provisional. Note the hook's own size check is inside
      the broken handler, so the cap is untested at ANY value. Give me a number
      or tell me to hold at 2 MiB pending a real growth curve.

5. RE-RUN SCOPE. Does your 2026-07-27 client confirmation ("VERDICT CARRIES
   OVER TO .342 — STAGING MAY PROCEED (75 CASES)") still stand once the server
   kit changes again? The 75-case checklist was deliberately skipped this cycle
   and needs a working server anyway.

Do not treat anything here as production-readiness evidence. The fault-injection
cases were not run, and the suite is not trustworthy until defect 3 is fixed.
```

---

## Package contents

| Path | What it is |
| --- | --- |
| `STAGING_RESULTS.md` | Round-2 report — §1 defect register, §12 round-1 history |
| `evidence/manual-cas-repro.log` | Hand-driven proof the CAS logic is correct |
| `evidence/cas-tests-unpatched.log` | The kit as shipped — route dead, 4 misleading passes |
| `evidence/cas-tests-patched.log` | With the staging-only scope patch — 17 passed / 4 failed |
| `evidence/migration-*.log` | Round-1 failure and round-2 clean boot |
| `evidence/teardown.log` | Teardown reporting success while leaving an account behind |
| `kit/` | Migration (fixed), hook and tests — hook + tests byte-identical to yours |
| `docs/` | `DEPLOYMENT.md`, `SERVER_NOTES.md`, `LOCAL_AGENT_BRIEF.md` |

No health data, credentials or tokens are in the package — schema, code and logs only.
