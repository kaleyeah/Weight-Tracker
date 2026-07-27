# Production Gate Review Request — the cutover gate and runbook (for ChatGPT / Product Architect)

**Last Updated:** 2026-07-27

**Status:** Active — the Architect has already approved production. This package asks them to review the *operational* work their approval was conditioned on, **before** the cutover runs. Companion to `STAGING_RESULTS.md` §12 and `tests/CHECKLIST_RESULTS.md` §0. Follows the `REVIEW_REQUEST.md` pattern.

> Copy the block below into ChatGPT and attach `cf-production-gate-20260727.zip`.

---

## Prompt

```text
You are the Product Architect for Compound Fitness. I'm the Product Owner.
Claude Code is the Lead Engineer. Per our workflow you decide WHAT gets built
and review WHAT was built; Claude decides HOW.

You approved build 2026-07-27.342-pb-c1h for PRODUCTION DEPLOYMENT, subject to
four operational prerequisites. This package is that operational work, for
review BEFORE the cutover runs. Nothing has been deployed to production. Read
in this order:

  1. DEPLOYMENT.md              — Step 7 is the new production runbook (P0-P7)
  2. verify-deployment.sh       — the cutover gate itself
  3. STAGING_RESULTS.md §12     — the ruling, the re-measured hazard, the check
                                  list, the 6-scenario test evidence, and §12.5
                                  (a harness fault I am recording, not hiding)
  4. evidence/                  — the rig transcript and per-scenario logs
  5. rig/verify-rig.sh          — the harness, if you want to audit the method
  6. CHECKLIST_RESULTS.md §0,§9 — your ruling as applied, and the Commit 10 gate

Context so you evaluate rather than rediscover:

  - Your ruling is recorded and applied. A6, C4, C5, F5, K1 are reclassified
    DEFERRED TO COMMIT 10; the counts are now 39 verified / 5 deferred / 31 not
    automated / 0 failures out of 75. The independent manifest reader is
    specified but NOT built, tracked as a Commit 10 gate alongside those five.
  - Your migration-exit-code ruling was implemented as ADR-015: deployment
    success is established by asserting state, never by observing the deploying
    process. The hazard is worse than Round 3 recorded — on `serve`, v0.39.8
    prints the failure, NEVER STARTS THE SERVER, and still exits 0. A deploy
    step of the form `docker restart && echo deployed` reports success while
    the backend is down and restart-looping. Re-measured, in evidence/.
  - verify-deployment.sh is read-only and is the only script in the kit allowed
    to run against production. It asserts schema fields, unique-index SHAPE (so
    production's own idx_88qok6ts7v counts), ledger fields/locked rules/cascade,
    no duplicate owners, route registration, that the handler executes OUR code
    rather than merely being registered, and the configured 256 KiB cap read
    back from a 413. Optional checks cover the _migrations row, the binary
    version, and the post-lockdown state including a real 426.
  - It was tested against six deliberately broken and correct states. The two
    that matter: a migration PocketBase REFUSED while exiting 0 (caught at the
    first check, before any other claim is made), and a deploy where the schema
    landed but the hook did not — which passes every schema check and is caught
    only by the route checks. 25 rig assertions, 0 failures. Zero writes
    confirmed after every run by reading sqlite directly, not by asking the
    server.
  - Three documentation defects were found and fixed while writing the runbook:
    "verify the hook loaded via Admin UI -> Logs" was wrong (that line never
    reaches /api/logs on v0.39.8, and is printed BEFORE migrations run); Step 5
    copied only one of the two hook files, which reproduces Round 2's dead
    route; and the tests README claimed every entry point refuses production,
    which stopped being true when the verifier was added.

Four things I need from you:

1. IS THE GATE SUFFICIENT? Given the check list in STAGING_RESULTS.md §12.3 —
   what state could still be wrong on production after verify-deployment.sh
   reports VERIFIED? Name specific checks you want added rather than a general
   concern. I am particularly unsure about one thing: the verifier proves the
   SCHEMA is right and the ROUTE works, but it does not inspect existing
   athlete rows at all, so it would not notice if the migration were somehow
   to disturb the two real payloads. Do you want a data-integrity check
   (e.g. record data/training byte sizes and revisions before and after, and
   require them unchanged), or is that unnecessary given the migration only
   adds fields and an index?

2. THE PROBE DECISION — this one blocks the cutover and is yours to make.
   Checks V11b and V11c prove the handler EXECUTES, which is the exact failure
   Round 2 shipped: a registered route that threw on every request. They need
   an authenticated user, and production has no disposable account. Either:
     (a) create a temporary cf_test_prod@staging.invalid on production, run the
         gate, delete it and confirm absence — this writes one user row to
         production and no health data; or
     (b) waive them with ACCEPT_ROUTE_PROBE_ONLY=YES, which leaves only
         "the route is registered" verified, and record the caveat.
   I lean (a). Which do you want?

3. RUNBOOK REVIEW — P5 rollback and P6 monitoring specifically. The rollback
   decision criteria are: gate reports NOT VERIFIED, /api/health silent,
   `CF commit failed` for a real user, or appdata row count differing from the
   P0 baseline. Are those the right triggers, and is anything missing from the
   monitoring signals for the bridge window?

4. CONFIRM THE ROLLBACK ASYMMETRY EXPLICITLY. The down-migration deliberately
   drops only the index this kit created and PRESERVES production's pre-existing
   idx_88qok6ts7v (migration.sh M2g). Round 3 recorded this as implementing your
   decision 4a, but the migration source still carries a "PENDING Architect
   confirmation" comment. A one-line confirmation lets me remove it.

What I am NOT claiming: the verifier has never run against production, only
against throwaway instances built from a synthetic production-shaped schema —
so index adoption is exercised against the real index NAME but not against real
data volume. The rig is single-node. And the gate checks that a deployment is
correct, not that the product behaves correctly; that is what the two staging
phases were for.
```

---

## Package contents

| Path | What it is |
| --- | --- |
| `00-PROMPT.md` | The prompt above |
| `docs/DEPLOYMENT.md` | Step 7 = the production runbook (P0–P7) |
| `docs/STAGING_RESULTS.md` | §12 is this round; §1–§11 are the Round 3 server evidence |
| `docs/CHECKLIST_RESULTS.md` | §0 the ruling as applied, §9 the Commit 10 gate |
| `docs/SERVER_NOTES.md` | Threat model, field mapping, cutover policy |
| `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/CHANGELOG.md` | Current state; ADR-015; product log |
| `code/verify-deployment.sh` | The gate |
| `code/rig/verify-rig.sh` | The self-checking harness that tests the gate |
| `code/_lib.sh` | Assertion helpers shared with the staging suite |
| `code/pb_hooks/`, `code/pb_migrations/` | The kit under verification |
| `evidence/00-rig-run.log` | Full rig transcript, generated when the archive was built |
| `evidence/s1…s6*.log` | Per-scenario verifier output and the exit-code measurements |
| `diff/production-gate.patch` | The complete diff of this round |

No health data, credentials or tokens — schema, code and logs from synthetic loopback instances only.

## Reproducing the evidence

```bash
PB_BIN=/path/to/pocketbase-0.39.8 bash server/tests/rig/verify-rig.sh <evidence-dir>
```

Self-contained: it builds its own production-shaped schema (including production's `idx_88qok6ts7v` index name), runs six scenarios, and asserts the verifier's verdict on each. Requires only the binary — no copy of production data.
