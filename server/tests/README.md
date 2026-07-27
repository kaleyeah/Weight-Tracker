# CAS staging test suite

Rebuilt for Round 3 on the Product Architect's instruction (Round 2 review,
decision 2): *"Do not simply patch the existing script and call it validated."*
The Round 2 script is kept as history in `legacy/` and its results are treated
as non-evidence.

**STAGING ONLY — with exactly one deliberate exception.** Every entry point
here calls `cf_guard`, which refuses to run without `STAGING_CONFIRM=YES`,
refuses any URL containing the production host, and refuses anything that is not
a loopback address. Destructive cases run only against disposable `cf_test_*`
accounts.

The exception is **`verify-deployment.sh`**, which does *not* call `cf_guard`
because verifying production is its entire purpose (`DEPLOYMENT.md` Step 7 P3).
In exchange it is strictly read-only: every request is a GET, a superuser auth,
or a probe rejected before any database access, and its probes are write-proof
by construction rather than by byte arithmetic — see `STAGING_RESULTS.md` §12.5
for the first version, which was not, and committed 256 KiB to a probe account.
Sourcing `_lib.sh` does not make any other script here production-safe.

## Design rules

1. **No status-only assertions.** Every check asserts semantic content — JSON
   content type, `ok`, the exact `error` string, `subsystem`, revision, payload,
   `replay`, row counts. In Round 2 two tests passed against a completely dead
   route because they only checked for a 400. A crashed handler must never
   satisfy a test.
2. **Independent request bodies.** Every request owns its own bytes. Round 2's
   concurrency cases shared one temp file between parallel calls, so both
   requests transmitted an identical body and the CAS invariants were never
   actually exercised. Concurrency lives in Python with a barrier for real
   overlap.
3. **Traceable to requirements.** Each file names the section of
   `SERVER_NOTES.md` / `DEPLOYMENT.md` / the Architect ruling it derives from.

## Files

| File | Covers |
| --- | --- |
| `_lib.sh` / `_lib.py` | Guards, HTTP, semantic assertions |
| `fixtures.sh` | Create / **verified** teardown of disposable users |
| `route-smoke.sh` | Architect's 5 required smoke cases — run first, aborts the run on failure |
| `validation.sh` | Request-contract validation, exact error strings |
| `cas-concurrency.py` | CAS invariants under genuine parallelism |
| `idempotency.py` | Ledger contract, replay, key scoping, hash-only storage |
| `field-isolation.sh` | `data`/`training` vs operational `health`/`coachreq` |
| `auth-and-ownership.sh` | Cross-user isolation, owner pinning, locked ledger rules |
| `legacy-bridge.sh` | Bridge bump-exactly-once, or lockdown behaviour |
| `payload-boundary.sh` | 256 KiB cap, 320 KiB envelope, UTF-8 byte counting |
| `deletion-and-retention.sh` | `cascadeDelete` behaviour, one-directional cascade |
| `migration.sh` | Portability, index adoption, asymmetric rollback |
| `fault-injection.sh` | Forced rollback; missing-ledger fail-closed |
| `run-all.sh` | Ordered runner, writes per-suite evidence logs |
| `verify-deployment.sh` | **Read-only post-deployment verification — the production cutover gate.** Asserts deployed state (fields, index shapes, ledger rules/cascade, route registration, handler execution, configured cap, optional lockdown state) instead of trusting an exit code |

## Running

```bash
cd server/tests
BASE=http://127.0.0.1:8091 ADMIN_EMAIL=<staging-superuser> ADMIN_PASS=<pw> \
  STAGING_CONFIRM=YES bash fixtures.sh

BASE=http://127.0.0.1:8091 ADMIN_EMAIL=<staging-superuser> ADMIN_PASS=<pw> \
  PB_BIN=/path/to/pocketbase PB_DATA_DIR=/path/to/pb_data \
  PRISTINE_DIR=/path/to/pristine_pb_data MIGRATIONS_DIR=../pb_migrations \
  STAGING_CONFIRM=YES bash run-all.sh
```

`run-all.sh` runs the teardown itself and fails the run if any disposable user,
`appdata` row or ledger row survives.

## Verifying a deployment (staging or production)

```bash
cd server/tests
BASE=<url> ADMIN_EMAIL=<superuser> ADMIN_PASS=<pw> \
  PROBE_EMAIL=cf_test_1@staging.invalid PROBE_PASS=<disposable> \
  bash verify-deployment.sh
```

Exit 0 and `RESULT: VERIFIED` is the only accepted evidence that a deployment
succeeded. PocketBase v0.39.8 exits 0 when a migration *fails* — and on `serve`
exits without starting the server at all — so exit status, "the container came
back", and the `CF CAS hook loaded` line all prove nothing (ADR-015).

Add `EXPECT_LOCKDOWN=YES` after the step-7 lockdown; V14d is the only way to
confirm `CF_MIN_CLIENT_BUILD` was really set, since it is a hook constant rather
than schema. Without `PROBE_EMAIL`/`PROBE_PASS` the handler-execution checks
cannot run and the script fails unless you waive them with
`ACCEPT_ROUTE_PROBE_ONLY=YES` — a registered route that throws on every request
would otherwise pass, which is exactly what Round 2 shipped.
