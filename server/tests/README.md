# CAS staging test suite

Rebuilt for Round 3 on the Product Architect's instruction (Round 2 review,
decision 2): *"Do not simply patch the existing script and call it validated."*
The Round 2 script is kept as history in `legacy/` and its results are treated
as non-evidence.

**STAGING ONLY.** Every entry point calls `cf_guard`, which refuses to run
without `STAGING_CONFIRM=YES`, refuses any URL containing the production host,
and refuses anything that is not a loopback address. Destructive cases run only
against disposable `cf_test_*` accounts.

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
