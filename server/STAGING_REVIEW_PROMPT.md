# Staging Review Request — CAS Server Kit (for ChatGPT / Product Architect)

**Last Updated:** 2026-07-27

**Status:** Active — blocking. Companion to `STAGING_RESULTS.md`. Follows the `REVIEW_REQUEST.md` pattern; see `ROLES_AND_WORKFLOW.md` Step 4.

> Copy the block below into ChatGPT and attach `cf-cas-staging-20260727.zip`.

---

## Prompt

```text
You are the Product Architect for Compound Fitness. I'm the Product Owner.
Claude Code is the Lead Engineer. Per our workflow you decide WHAT gets built
and review WHAT was built; Claude decides HOW.

Attached is the staging evidence package for the CAS server kit (compare-and-
swap for appdata on PocketBase v0.39.8). Read in this order:

  1. STAGING_RESULTS.md              — what happened; §4 is the blocker
  2. evidence/migration-failure.log  — the verbatim failure
  3. kit/pb_migrations/1753400000_cf_cas.js — the artifact that fails
  4. docs/DEPLOYMENT.md              — the procedure the results are keyed to
  5. docs/SERVER_NOTES.md            — threat model, field mapping, cutover
  6. kit/pb_hooks/cf_cas.pb.js + kit/tests/*.sh — unexercised; context only

Context so you evaluate rather than rediscover:

  - STAGING FAILED. The migration aborts before applying anything. The hook,
    the ledger, all 13 integration tests and both fault-injection cases are
    UNVERIFIED — not passing, not failing. Unrun.
  - Root cause: the migration guards its unique-index creation by index NAME
    (`idx_cf_appdata_user`). Production already carries an equivalent unique
    index on appdata(user) under an Admin-UI-generated name, `idx_88qok6ts7v`.
    The guard passes, a duplicate definition is pushed, PocketBase rejects it,
    the migration aborts atomically. This reproduces identically on production
    — it is not a staging artifact.
  - The invariant you wanted (one appdata row per user, unique-indexed) is
    ALREADY TRUE in production. The migration fails while adding protection
    that exists.
  - Staging was a local bare-binary PocketBase v0.39.8 on my workstation,
    restored from a fresh production backup, bound to 127.0.0.1 only. SSH to
    the NAS was unavailable. Production was never written to — the only
    production request all session was an unauthenticated GET /api/health.
  - No real credentials were used; a disposable staging superuser was minted
    offline. No destructive test ran against the two real athlete rows. The
    staging restore has been destroyed.
  - Claude diagnosed the defect and proposed a fix but did NOT apply it, on my
    instruction. The kit in this zip is byte-identical to what you hold.

I want four things, in priority order:

1. VERDICT ON THE MIGRATION FIX (this blocks everything — staging and
   production both). §4 of STAGING_RESULTS.md proposes matching on index SHAPE
   (any unique index on (user)) rather than on our chosen name. Accept, revise,
   or reject with an alternative. Consider explicitly: is silently adopting a
   pre-existing index of unknown provenance the right call, or should the
   migration fail loudly and make me reconcile the naming first? I care more
   about which is safer at production cutover than which is less work.

2. ROLLBACK SEMANTICS. The down-migration filters `idx_cf_appdata_user` out of
   appdata.indexes — a no-op against production, where the index is named
   `idx_88qok6ts7v`. Arguably correct (rollback should not drop an index the
   kit never created), but right now it's an accident of naming rather than a
   decision. Tell me what the down-migration SHOULD do, and I'll have it
   written down as intent either way.

3. PAYLOAD CAP RULING (DEPLOYMENT.md step 4 reserves this for you). Measured on
   staging: max data = 18,954 B, max training = 18,900 B; the other athlete's
   records are empty. The step-4 formula (max x ~4) gives ~74 KiB against the
   2 MiB provisional cap now in the hook. Claude's concern: 4x headroom derived
   from a single 19 KB sample is thin for data that grows with training
   history, and the 413 path is itself untested. Give me a number and the
   reasoning, or tell me to keep 2 MiB until there's a real growth curve.

4. RE-RUN SCOPE. Once the migration is fixed, does your 2026-07-27 confirmation
   ("VERDICT CARRIES OVER TO .342 — STAGING MAY PROCEED (75 CASES)") still
   stand for the client checklist, or does a changed server kit require
   re-confirmation before the 75 cases run? I don't want to burn a staging
   cycle producing evidence you'd reject on artifact grounds.

Two smaller items Claude flagged in the test scripts but did not touch — rule on
whether they get fixed before the suite is trusted as evidence:
  - cas-server-tests.sh: the raw-create-forge case asserts nothing (it only
    logs its status), so the ownership-forgery scenario cannot fail the suite.
  - setup-fixtures.sh: its production-host guard is weaker than the equivalent
    guard in cas-server-tests.sh — and the weaker one is in the script that
    CREATES users.

Do not treat anything here as production-readiness evidence. Nothing in the kit
has been exercised end to end.
```

---

## Package contents

| Path | What it is |
| --- | --- |
| `STAGING_RESULTS.md` | The report — §4 is the blocker, §10 the deviations |
| `evidence/migration-failure.log` | Verbatim boot + failure output |
| `kit/pb_migrations/1753400000_cf_cas.js` | The failing migration, as shipped |
| `kit/pb_hooks/cf_cas.pb.js` | The hook — loads, otherwise unexercised |
| `kit/tests/*.sh` | Fixture + integration suite, never invoked |
| `docs/` | `DEPLOYMENT.md`, `SERVER_NOTES.md`, `LOCAL_AGENT_BRIEF.md` |

No health data, credentials, or tokens are in the package — schema, code and logs only.
