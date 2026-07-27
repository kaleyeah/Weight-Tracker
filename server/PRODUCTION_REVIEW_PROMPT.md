# Production Gate — RETURN for final confirmation (for ChatGPT / Product Architect)

**Last Updated:** 2026-07-27

**Status:** Active — the Architect returned **APPROVED WITH ONE REQUIRED CHANGE** (the V15 integrity sentinel) and asked for the updated package back before the cutover runs. This is that return. Companion to `STAGING_RESULTS.md` §13. Follows the `REVIEW_REQUEST.md` pattern.

> Copy the block below into ChatGPT and attach `cf-production-gate-v15-20260727.zip`.

---

## Prompt

```text
You are the Product Architect for Compound Fitness. I'm the Product Owner.
Claude Code is the Lead Engineer. Per our workflow you decide WHAT gets built
and review WHAT was built; Claude decides HOW.

You reviewed the production gate and returned APPROVED WITH ONE REQUIRED
CHANGE: add the V15 existing-appdata integrity sentinel, and do not execute the
cutover until it is added and verified. You asked for the updated package back
for final confirmation. Here it is. Nothing has been deployed to production.

Read in this order:

  1. STAGING_RESULTS.md §13   — the verdict as applied, what V15 closes, and
                                the four V15 scenarios including the one that
                                documents a limitation rather than a pass
  2. _sentinel.py             — the sentinel itself
  3. verify-deployment.sh     — V15 in the gate (capture mode, verify mode)
  4. DEPLOYMENT.md Step 7     — P0 capture, P3 probe-account + verify, P5, P6
  5. probe-account.sh         — the disposable production probe account
  6. evidence/                — the full rig transcript, generated at build time
  7. rig/verify-rig.sh        — the harness, if you want to audit the method

Every item you required or decided is implemented:

  - V15 IMPLEMENTED. For every existing appdata row the gate records id, user,
    coreRev, trainingRev, and the UTF-8 byte lengths of data and training
    before deployment, and requires all six unchanged afterwards. It also fails
    if a row vanished or appeared during the window. Non-destructive: payloads
    are fetched, measured in memory and discarded — never written to disk,
    never logged, never printed. The baseline file holds six scalars per row.
    It lives in its own module because _lib.sh writes every response body to a
    temp file, which is acceptable for synthetic staging responses and not for
    real health data.
  - PROBE ACCOUNT as you ruled: probe-account.sh creates exactly one hard-coded
    cf_test_prod@staging.invalid, the gate runs the authenticated probes, and
    teardown runs immediately afterwards and verifies user, appdata AND ledger
    absence rather than trusting a 204. ACCEPT_ROUTE_PROBE_ONLY is now
    explicitly not an approved production path.
  - ROLLBACK TRIGGERS now include duplicate-owner detection (check V10), plus
    V15 integrity failure, in a table in P5.
  - MONITORING now includes the HTTP 409 rate on the commit route during the
    bridge window, read from /api/logs, with a note on how to read a spike:
    conflicts are normal, a spike means a revision is advancing without the
    clients that are losing the race.
  - ROLLBACK ASYMMETRY: the "PENDING Architect confirmation" comment is removed
    from the migration and replaced with your confirmation. No PENDING comments
    referring to that decision remain anywhere in the repo.

Rig result: 46 assertions, 0 failures across ten instance states. The four new
ones seed two athlete-shaped rows on an unmigrated instance, capture the
baseline exactly as P0 does, then deploy for real. Mutations are applied to the
sqlite file with the server stopped, so no hook is involved — the point is to
catch a payload that changed without anything on the write path touching it.

  S7  clean deployment, rows untouched        -> V15 passes, both rows unchanged
  S8  one payload grows during the window     -> V15 FAILS, names dataBytes,
                                                 run refuses the cutover
  S9  a mutation that PRESERVES byte length   -> V15 PASSES (see below)
  S9b the same mutation, hash mode enabled    -> V15 FAILS, names dataHash

One thing I am flagging rather than quietly deciding:

  S9 IS A REAL LIMITATION OF THE CHECK YOU SPECIFIED. A byte-length sentinel
  cannot see a change that happens to preserve length — in the test, editing a
  weight from 81.5 to 91.5 is invisible to all six values. I implemented
  exactly the six you specified as the default, and added SENTINEL_WITH_HASH=YES
  as an OPTIONAL capture-time flag that also records a SHA-256 of each payload's
  canonical form, which catches it. It is off by default because the six values
  are what you ruled.

  Should the production cutover capture the baseline WITH hashes? The cost is
  that the baseline file then contains a hash of each athlete's health data
  (irreversible, but a stronger identifier than a byte count). The benefit is
  that V15 becomes an actual integrity check rather than a size check. My
  recommendation is yes, with the baseline treated as sensitive and deleted
  after the cutover — but this is your call, and it is the only open question.

Also worth your attention, unchanged from the last package: the gate has never
run against production. It has only run against throwaway instances built from
a synthetic production-shaped schema, so index adoption is exercised against
the real index NAME but not against real data volume, and the rig is
single-node. V15 is the first check that will read real athlete rows, and it
will do so for the first time during P0 of the actual cutover.

Two questions:

1. FINAL CONFIRMATION — is the gate now sufficient to execute the cutover?
2. THE HASH DECISION above — default byte lengths only, or capture with hashes?
```

---

## Package contents

| Path | What it is |
| --- | --- |
| `00-PROMPT.md` | The prompt above |
| `docs/STAGING_RESULTS.md` | §13 is this round; §12 the gate; §1–§11 Round 3 server evidence |
| `docs/DEPLOYMENT.md` | Step 7 runbook — P0 capture, P3 probe + verify, P5 triggers, P6 monitoring |
| `docs/CHECKLIST_RESULTS.md` | The client staging ruling as applied, and the Commit 10 gate |
| `docs/SERVER_NOTES.md`, `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/CHANGELOG.md` | Threat model; current state; ADR-015; product log |
| `code/verify-deployment.sh` | The gate, now with V15 |
| `code/_sentinel.py` | The integrity sentinel |
| `code/probe-account.sh` | The disposable production probe account |
| `code/rig/verify-rig.sh` | The self-checking harness — ten states, 46 assertions |
| `code/_lib.sh`, `code/pb_hooks/`, `code/pb_migrations/` | Shared assertions and the kit under verification |
| `evidence/00-rig-run.log` | Full rig transcript, generated when the archive was built |
| `evidence/s1…s9b*.log` | Per-scenario output, including the V15 capture and verify runs |
| `diff/production-gate.patch` | The complete diff since the last package |

No health data, credentials or tokens — schema, code and logs from synthetic loopback instances only.

## Reproducing the evidence

```bash
PB_BIN=/path/to/pocketbase-0.39.8 bash server/tests/rig/verify-rig.sh <evidence-dir>
```

Self-contained: it builds its own production-shaped schema (including production's `idx_88qok6ts7v` index name), seeds athlete-shaped rows for the V15 scenarios, runs ten states, and asserts the gate's verdict on each. Requires only the binary — no copy of production data.
