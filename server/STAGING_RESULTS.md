# Staging Results — CAS Server Kit on PocketBase v0.39.8

**Date:** 2026-07-27 (round 3 — supersedes rounds 1 and 2; history in §11)
**Executed by:** local Claude Code session on the Product Owner's workstation (`gbclaude`)
**Branch:** `claude/compound-fitness-roles-workflow-aala7o`
**Outcome:** ✅ **PHASE 1 GREEN — 172 assertions, 11 suites, 0 failures, teardown verified.**

All four Round 2 defects are fixed and verified. Every Product Architect Round 2 decision is implemented. **This is server-kit evidence only** — Phase 2 (the 75-case client checklist) was deliberately not run this cycle, so nothing here is production approval.

---

## 1. Defect register (Round 2 → Round 3)

| # | Defect | Ruling | Status |
| --- | --- | --- | --- |
| **1** | Migration matched the unique index by **name**, colliding with production's `idx_88qok6ts7v` | Fixed and accepted (R2) | ✅ **FIXED & VERIFIED** — `migration.sh` M2 |
| **2** | Handler referenced file-scope constants → `ReferenceError`, every commit a generic 400 | Shared module `require()`d inside the handler | ✅ **FIXED & VERIFIED** — `route-smoke.sh` |
| **3** | Concurrency tests shared one request-body temp file | Rebuild the matrix; assert bodies, not status | ✅ **FIXED & VERIFIED** — suite rebuilt, `cas-concurrency.py` |
| **4** | Ledger relation `cascadeDelete:false` made users undeletable; teardown lied | `cascadeDelete: true`; teardown must verify | ✅ **FIXED & VERIFIED** — `deletion-and-retention.sh` |

### New findings this round

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| **5** | The index guard matched the word *"unique"* anywhere in the statement, so an index merely **named** `idx_user_unique_lookup` but declared **non-unique** satisfied it — the kit would skip creating real protection | Medium | ✅ Fixed — now matches `CREATE UNIQUE INDEX`; regression case M5d |
| **6** | **PocketBase v0.39.8 exits with code 0 even when a migration FAILS** — verified for both `migrate up` and `serve` | Medium — **operational, unfixed by design** | ⚠️ **OPEN — needs an Architect/ops decision (§7)** |

---

## 2. Results

```
route-smoke ............  7 passed, 0 failed
validation ............. 15 passed, 0 failed
cas-concurrency ........ 18 passed, 0 failed
idempotency ............ 24 passed, 0 failed
field-isolation ........ 12 passed, 0 failed
auth-and-ownership .....  9 passed, 0 failed
legacy-bridge ..........  7 passed, 0 failed
payload-boundary ....... 12 passed, 0 failed
deletion-and-retention . 24 passed, 0 failed
migration .............. 35 passed, 0 failed
fault-injection ........  9 passed, 0 failed
                        ─────────────────────
                        172 passed, 0 failed

teardown: verified cf_test_1 removed (user + appdata + ledger all absent)
          verified cf_test_2 removed (user + appdata + ledger all absent)
          TEARDOWN OK
```

Per-suite logs: `evidence/*.log`.

---

## 3. Architect decisions — implementation

### 3.1 Decision 1 — shared module inside the handler runtime ✅

`server/pb_hooks/cf_cas_shared.js` created; `cf_cas.pb.js` does `require(\`${__hooks}/cf_cas_shared.js\`)` **inside** the handler. It holds only deterministic, side-effect-free material — subsystem map, limits, minimum build, UTF-8 counting, validation helpers, response helpers — and no mutable request state, as required.

The `require()` syntax works on v0.39.8, proven in staging. The hook now logs `build=cas-3`.

**Required smoke test — all five cases:**

| Case | Result |
| --- | --- |
| 1 valid commit reaches CAS logic | ✅ 200, `newRev` advances |
| 2 invalid subsystem → exact JSON | ✅ 400 `"invalid subsystem"` |
| 3 negative revision → exact JSON | ✅ 400 `"expectedRev must be a non-negative integer"` |
| 4 payload limit → exact 413 JSON | ✅ 413 `"payload too large"`, `maxBytes: 262144` |
| 5 minimum build → exact 426 JSON | ⏸️ **Not exercised** — `CF_MIN_CLIENT_BUILD` is empty by design pre-lockdown (§7) |

`route-smoke.sh` aborts the entire run if the route returns a generic framework body, so the Round 2 failure mode cannot recur silently.

### 3.2 Decision 2 — rebuild the test evidence ✅

Both halves done.

**A. Hardened assertions.** No test asserts a status alone. Every check verifies JSON content type plus the semantic fields — `ok`, exact `error`, `subsystem`, revision, payload, `replay`, row counts, and revision side effects. Round 2's T8/T9 could pass against a dead route; the equivalent cases now assert the exact error string.

**B. Independently re-derived matrix.** The suite was rebuilt from `SERVER_NOTES.md`, the route contract, the migration contract, the bridge/lockdown contract and the idempotency threat model — not patched from the old script. `legacy/cas-server-tests.sh` and `legacy/setup-fixtures.sh` are retained as history and their results treated as non-evidence.

Layout follows the Architect's structure, with `_lib.sh` / `_lib.py` added for shared assertions and `payload-boundary.sh` split out to match the required evidence file:

```
tests/  _lib.sh  _lib.py  fixtures.sh  route-smoke.sh  validation.sh
        cas-concurrency.py  idempotency.py  field-isolation.sh
        auth-and-ownership.sh  legacy-bridge.sh  payload-boundary.sh
        deletion-and-retention.sh  migration.sh  fault-injection.sh
        run-all.sh  legacy/
```

Concurrency runs in Python with a `threading.Barrier` for genuine overlap; every request builds its own body buffer.

### 3.3 Decision 3 — `cascadeDelete: true` ✅

All seven required cases pass (`deletion-and-retention.sh`, 24 assertions):

| Required case | Result |
| --- | --- |
| 1 delete user with no ledger | ✅ 204 |
| 2 delete user with core ledger | ✅ 204 |
| 3 delete user with core + training ledger | ✅ 204 |
| 4 all that user's ledger rows gone | ✅ 0 remain |
| 5 another user's rows remain | ✅ untouched |
| 6 deleting a ledger row does not delete the user | ✅ user + appdata survive |
| 7 teardown verifies status and absence | ✅ `fixtures.sh` checks every DELETE status, prints failure bodies, exits nonzero, and confirms user/appdata/ledger absence |

### 3.4 Decision 4a — asymmetric rollback ✅

All five required cases pass (`migration.sh`, 35 assertions):

| Required case | Result |
| --- | --- |
| fresh DB creates and removes its own index | ✅ M1 |
| pre-existing equivalent index adopted and **preserved on down** | ✅ M2g — `idx_88qok6ts7v` survives rollback |
| rerun produces no duplicate | ✅ M3 |
| up/down/up clean | ✅ M4 |
| composite / non-unique do not satisfy the guard | ✅ M5 (incl. finding 5) |

Rule enforced: *rollback may remove only schema protection installed by this migration.*

`migrate down` prompts `(y/N)` and **exits 0 when cancelled** — an early version of this suite scored that as a passing rollback. The harness now answers the prompt and treats a cancellation as failure.

### 3.5 Decision 4b — 256 KiB / 320 KiB ✅

`MAX_PAYLOAD_BYTES = 256*1024`, `REQUEST_LIMIT_BYTES = MAX + 64*1024`. All six required boundary cases pass:

| Required case | Result |
| --- | --- |
| just below cap succeeds | ✅ 261,120 B accepted |
| exact boundary, documented inclusive | ✅ exactly 262,144 B accepted |
| one byte above → exact route 413 | ✅ 262,145 B → `"payload too large"`, `maxBytes: 262144` |
| multibyte UTF-8 counted in bytes | ✅ 131,069 `é` chars = 262,146 B rejected, though the character count alone is under the cap |
| oversized envelope rejected by middleware | ✅ 413 from `$apis.bodyLimit` |
| local/network failures cannot masquerade as 413 | ✅ bodies built on disk, non-emptiness asserted, transport errors checked |

The fixtures are byte-matched to `JSON.stringify` (compact separators, `ensure_ascii=False`) — Python's defaults differ from JS on both counts and would otherwise mis-target the boundary by a byte and mis-encode multibyte text.

### 3.6 Fault injection ✅

| Case | Result |
| --- | --- |
| Forced mid-transaction rollback | ✅ F1 — read-only store: server fails closed, revision unchanged, no ledger row |
| Missing-ledger fail-closed | ✅ F2 — **500**, never 200, never a false 409; revision unchanged, no ledger row |

`chmod` against a *running* server does nothing — SQLite holds writable descriptors and permissions are only consulted at `open()`. F1 therefore stops the server, revokes write permission, restarts, and attempts the commit. Normal commits still work afterwards (F3).

---

## 4. Environment

| Item | Value |
| --- | --- |
| PocketBase | v0.39.8 (`pocketbase_0.39.8_linux_amd64`) |
| Staging host | `127.0.0.1:8091`, loopback only |
| Staging form | Bare binary, clean disposable instance |
| Schema source | **Production collections export** (`Settings → Export collections`) — schema only, **zero records** |
| Hook build | `cas-3`, `maxPayloadBytes=262144 requestLimitBytes=327680 minClientBuild=(none)` |

**No production health data was used this round.** Rounds 1–2 restored a full production backup; this round used the schema export plus synthetic disposable users only, so no athlete record ever reached the workstation. The `idx_88qok6ts7v` production condition was reproduced from the exported schema, so migration portability is still tested against the real production shape.

**Production was never written to.** No production request at all this round.

---

## 5. Route contract — unchanged

The Architect's Phase 2 condition is that the public contract must not change. It has not:

| Element | Status |
| --- | --- |
| Request fields (`subsystem`, `expectedRev`, `idempotencyKey`, `payload`, `clientBuild`, `deviceId`) | unchanged |
| 200 success `{ok, subsystem, newRev}` | unchanged |
| 409 conflict `{ok:false, conflict:true, serverRev, payload}` | unchanged |
| 400 validation meanings | unchanged (error strings now centralised, values identical) |
| 401 unauthorized | unchanged |
| 413 oversized | unchanged shape; **cap value changed 2 MiB → 256 KiB** per decision 4b, and the body now also carries `maxBytes` |
| 426 update required | unchanged |
| 500 internal commit failure | unchanged |

The only client-visible changes are the smaller cap and the additional `maxBytes` field — both additive/ruled. Client `2026-07-27.342-pb-c1h` should not require changes; confirmation requested (§7).

---

## 6. Data handling

- No real health data on the workstation this round; the schema export contains no records.
- Destructive tests ran only against disposable `cf_test_*` accounts; teardown verified.
- Staging instance, schema export, and disposable superuser credentials destroyed at session end.
- Rounds 1–2 backups were shredded then; copies may remain in the Product Owner's uploads/downloads and on the NAS.

---

## 7. Open items for the Product Architect

1. **Finding 6 — migration failure exits 0.** `migrate up` *and* `serve` return exit code 0 when a migration is refused; the only signal is the log line. `DEPLOYMENT.md` step 3 says "copy the migration in and restart", so a supervisor or deploy script trusting `$?` would read a refused migration as success. The server does not serve, so it fails safe — but it fails *silently*. Recommend the production runbook assert on the log line, or add an explicit pre-flight `migrate up` whose output is grepped. Recorded as `migration.sh` M6c rather than hidden.
2. **426 path unexercised.** `CF_MIN_CLIENT_BUILD` is empty pre-lockdown by design, so smoke case 5 cannot run. The path is covered by `route-smoke.sh` under `CF_MIN_BUILD_ENABLED=1`. It must be exercised **before** the lockdown step, since `SERVER_NOTES.md` §3 depends on old clients getting 426 rather than a generic error.
3. **Confirm the contract delta is acceptable** — 413 body gained `maxBytes`, cap is now 256 KiB — and that the `.342-pb-c1h` verdict therefore still carries into Phase 2.
4. **Phase 2 authorisation.** The 75-case checklist was skipped by Product Owner decision this cycle. Server Phase 1 is now green and no longer blocks it.

---

## 8. Round 3 changes

| File | Change |
| --- | --- |
| `pb_hooks/cf_cas_shared.js` | **New** — shared module, all request-time constants and helpers |
| `pb_hooks/cf_cas.pb.js` | Requires the module inside the handler; `cas-3`; 256 KiB/320 KiB |
| `pb_migrations/1753400000_cf_cas.js` | `cascadeDelete: true`; guard matches `CREATE UNIQUE INDEX` |
| `tests/` | Rebuilt — 13 new files, 11 suites, 172 assertions |
| `tests/legacy/` | Round 2 scripts retained as history, results treated as non-evidence |

---

## 9. Reproducing

```bash
cd server/tests
BASE=http://127.0.0.1:8091 ADMIN_EMAIL=<staging-superuser> ADMIN_PASS=<pw> \
  STAGING_CONFIRM=YES bash fixtures.sh

BASE=http://127.0.0.1:8091 ADMIN_EMAIL=<staging-superuser> ADMIN_PASS=<pw> \
  PB_BIN=<pocketbase> PB_DATA_DIR=<pb_data> PB_HOOKS_DIR=<pb_hooks> \
  PB_MIGRATIONS_DIR=<srv_migrations> PRISTINE_DIR=<pristine> \
  MIGRATIONS_DIR=<mig_migrations> STAGING_CONFIRM=YES bash run-all.sh
```

`PRISTINE_DIR` is a `pb_data` carrying the production schema with the CAS migration **not** applied. Keep the server's migrations directory separate from the migration suite's: the fault-injection rename makes PocketBase auto-generate migration files, which otherwise contaminate the migration fixtures.

---

## 10. Honest limitations

- **Phase 2 not run.** No client build was exercised against this server. Server-kit evidence only.
- **Smoke case 5 (426) not exercised** — see §7.2.
- **No production-scale data.** Synthetic payloads only; the largest real payload measured in Round 2 was 18,954 B against a 262,144 B cap.
- **Single-node.** SQLite/WAL on one host. Concurrency is genuine (threaded, barrier-synchronised) but not distributed.
- **The suite is new.** It found six defects including two of its own, and its own harness bugs produced false passes twice before being caught. It is more rigorous than Round 2's, not infallible.

---

## 11. Round history

| Round | Outcome |
| --- | --- |
| 1 | Migration aborted on the production index; nothing applied. Pushed as `a6482fe`. |
| 2 | Migration fixed; route found dead (defect 2); harness invalid (defect 3); ledger blocked deletion (defect 4). Architect returned **CHANGES REQUIRED**. |
| 3 | All four fixed and verified; two new findings (5 fixed, 6 open). **Phase 1 green.** |
