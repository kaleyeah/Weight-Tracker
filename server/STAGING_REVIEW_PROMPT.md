# Staging Review Request — CAS Server Kit, Round 3 (for ChatGPT / Product Architect)

**Last Updated:** 2026-07-27

**Status:** Active — Phase 1 green, seeking server approval and Phase 2 authorisation. Companion to `STAGING_RESULTS.md`. Follows the `REVIEW_REQUEST.md` pattern; see `ROLES_AND_WORKFLOW.md` Step 4.

> Copy the block below into ChatGPT and attach `cf-cas-staging-round3-20260727.zip`.

---

## Prompt

```text
You are the Product Architect for Compound Fitness. I'm the Product Owner.
Claude Code is the Lead Engineer. Per our workflow you decide WHAT gets built
and review WHAT was built; Claude decides HOW.

This is ROUND 3 of the CAS server kit. Your Round 2 verdict was CHANGES
REQUIRED — FIX SERVER KIT AND RERUN STAGING. All four defects are fixed and
every one of your decisions is implemented. Phase 1 is green: 11 suites,
172 assertions, 0 failures, teardown verified. Read in this order:

  1. STAGING_RESULTS.md          — §1 defect register, §3 your decisions
                                    one by one, §7 what still needs you
  2. evidence/route-smoke.log    — the route that never worked, now working
  3. evidence/migration.log      — index adoption + asymmetric rollback
  4. evidence/cas-concurrency.log, idempotency.log
  5. evidence/deletion-cascade.log, teardown.log
  6. evidence/payload-boundary.log, fault-injection.log
  7. kit/pb_hooks/cf_cas_shared.js + cf_cas.pb.js — the module split
  8. kit/tests/ — the rebuilt matrix; kit/tests/legacy/ is Round 2, non-evidence

What was done, so you can evaluate rather than rediscover:

  - Decision 1 (shared module): cf_cas_shared.js is require()d INSIDE the
    handler. require() works on v0.39.8, proven in staging. Four of your five
    smoke cases pass with exact validation bodies; the fifth (426) cannot run
    pre-lockdown because CF_MIN_CLIENT_BUILD is empty by design — see below.
    route-smoke.sh ABORTS the whole run if the route ever returns a generic
    framework body, so the Round 2 failure mode cannot recur silently.
  - Decision 2 (rebuild): both halves. No test asserts a status alone — every
    check verifies JSON content type plus ok/error/subsystem/revision/payload/
    replay/row counts. The matrix was re-derived from SERVER_NOTES.md and the
    contracts, not patched from the old script. Concurrency moved to Python
    with a barrier and per-request body buffers.
  - Decision 3 (cascadeDelete): implemented; all seven of your required cases
    pass. Teardown now captures every DELETE status, prints failure bodies,
    exits nonzero, and verifies user/appdata/ledger absence.
  - Decision 4a (rollback): confirmed asymmetric. Production's idx_88qok6ts7v
    survives a down-migration; only the kit's own index is removed.
  - Decision 4b (limits): 256 KiB payload / 320 KiB envelope. All six boundary
    cases pass, including exact-boundary-inclusive and multibyte-counted-in-
    bytes.
  - Fault injection: both cases pass. Note chmod against a RUNNING server does
    nothing (SQLite holds writable descriptors), so F1 stops the server,
    revokes write permission and restarts.
  - No production health data was used this round. Staging was built from a
    schema-only collections export plus synthetic disposable users, so no
    athlete record reached the workstation — while still reproducing the exact
    production index condition. Production was never contacted at all.

Two new findings, one fixed and one deliberately left for you:

  - FINDING 5 (fixed): my Round 2 index guard matched the word "unique"
    anywhere in the statement, so an index merely NAMED idx_user_unique_lookup
    but declared NON-unique satisfied it — the kit would have skipped creating
    real protection. Now matches "CREATE UNIQUE INDEX". Regression case M5d.
  - FINDING 6 (OPEN, needs your call): PocketBase v0.39.8 exits with code 0
    even when a migration FAILS — verified for both `migrate up` and `serve`.
    The guard works and fails loudly in the LOG, but the exit status says
    success. DEPLOYMENT.md step 3 says "copy the migration in and restart", so
    a supervisor or deploy script trusting $? would read a refused migration as
    a successful one. It fails safe (the server does not serve) but silently.

I want four things, in priority order:

1. SERVER APPROVAL OR REMAINING GAPS. Is Phase 1 sufficient to consider the
   server kit validated? If not, name precisely what is missing rather than a
   general concern — I would rather run another server cycle than carry an
   unearned green into production.

2. FINDING 6 — how should the production runbook detect a refused migration?
   Options: assert on the log line after restart; add an explicit pre-flight
   `migrate up` whose output is grepped and treated as authoritative; or accept
   it as a documented operational caveat. This changes DEPLOYMENT.md step 3 and
   the cutover checklist, so it is your call, not Claude's.

3. THE 426 PATH IS UNEXERCISED. CF_MIN_CLIENT_BUILD is empty pre-lockdown by
   design, so the update-required path has never been executed. SERVER_NOTES.md
   §3 depends on old clients getting an explicit 426 rather than a generic
   error. Do you want it exercised as a gated staging case before lockdown, and
   at what point in the cutover should the value actually be set?

4. CONTRACT DELTA + PHASE 2. The route's public contract is unchanged except
   that the cap moved 2 MiB -> 256 KiB per your ruling and the 413 body now
   also carries maxBytes. Confirm that is acceptable and that your
   "VERDICT CARRIES OVER TO .342" therefore still stands, so I can run the
   75 client cases against this server. The checklist was skipped this cycle by
   my decision, not blocked.

Do not treat this as production approval. This is server-kit evidence only —
no client build has been exercised against it. §10 of STAGING_RESULTS.md lists
the limitations honestly, including that this suite is new, that it caught two
false-pass bugs in its own harness before going green, and that all payloads
were synthetic.
```

---

## Package contents

| Path | What it is |
| --- | --- |
| `STAGING_RESULTS.md` | Round-3 report — §1 register, §3 decisions, §7 open items, §10 limitations |
| `evidence/*.log` | All 11 suite logs plus verified teardown |
| `kit/pb_hooks/cf_cas_shared.js` | New shared module |
| `kit/pb_hooks/cf_cas.pb.js` | Hook, `cas-3` |
| `kit/pb_migrations/1753400000_cf_cas.js` | Migration — cascade + tightened guard |
| `kit/tests/` | Rebuilt suite; `legacy/` is Round 2, retained as non-evidence |
| `docs/` | `DEPLOYMENT.md`, `SERVER_NOTES.md`, `LOCAL_AGENT_BRIEF.md` |

No health data, credentials or tokens — schema, code and logs only.
