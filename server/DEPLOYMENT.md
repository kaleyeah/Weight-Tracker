# Server Deployment — CAS for `appdata` (PocketBase v0.39.8)

**Last Updated:** 2026-07-27

**Status:** **Production approved.** Both staging gates are green (`STAGING_RESULTS.md` Phase 1; `tests/CHECKLIST_RESULTS.md` Phase 2) and the Product Architect ruled **APPROVED FOR PRODUCTION DEPLOYMENT** on 2026-07-27, subject to the operational prerequisites in **Step 7**, which is now the production runbook. Companion: `SERVER_NOTES.md` (threat model, field mapping, cutover policy).

Everything below is done by the operator (Product Owner) — the dev environment cannot reach `rack.tail6fa16c.ts.net`. Estimated time: ~30 minutes on staging.

**Known state (from the Admin UI, 2026-07-25):** PocketBase **v0.39.8**; collections `users`, `appdata`, `photos`; **2 users total** — so the duplicate-row check is quick and duplicates are unlikely.

---

## Step 0 — Backup (do nothing before this)

Admin UI → **Settings → Backups → Create backup**. Download the backup file off the NAS too. Verify the file exists and has nonzero size.

**Rollback at any point:** Settings → Backups → Restore that backup. The hook file is removed by deleting `pb_hooks/cf_cas.pb.js` and restarting.

## Step 1 — Set up STAGING

Run a second PocketBase instance from a **copy** of the data (never the live one):

- **Docker:** duplicate the container with a copy of the `pb_data` volume, different port.
- **Bare binary:** copy the whole `pb_data` directory, then `./pocketbase serve --http=0.0.0.0:8091 --dir=./pb_data_staging`.

All remaining steps happen on staging first, then are repeated on production.

## Step 1b — Create disposable test users (NEVER real credentials)

```bash
BASE=https://<staging> ADMIN_EMAIL=<superuser> ADMIN_PASS=<superuser-pass> STAGING_CONFIRM=YES bash tests/fixtures.sh
```

Creates `cf_test_1@staging.invalid` / `cf_test_2@staging.invalid` and prints the exact test command. **Never supply a real athlete's password to any script.** Destructive tests run only against these users; `teardown` removes them. If the staging copy contains real data, it stays Tailnet-only, untouched by destructive tests, and is deleted after verification (`SERVER_NOTES.md` §2).

## Step 2 — Duplicate-row check (before the unique index)

Admin UI → `appdata` collection. With 2 users you can eyeball it: **each user id must appear at most once**. If any user has two rows:

1. Export both rows (open each record → copy JSON) to files — this is the archive.
2. Do **not** merge by hand if `data`/`training` differ — stop and send both JSON files back to Claude for a reconciliation plan.
3. If they are identical, delete the older one (`updated` timestamp).

## Step 3 — Schema changes (reproducible migration; Admin UI is the FALLBACK)

Copy `server/pb_migrations/1753400000_cf_cas.js` into the instance's `pb_migrations/` directory and restart — PocketBase applies it automatically (or run `./pocketbase migrate up`). It creates `coreRev`/`trainingRev`, the unique `appdata.user` index, and the superuser-only `cf_commit_log` with its unique ledger index. It **fails loudly if duplicate rows exist** (by design) and includes a down-migration for rollback. **Test it on a disposable copy first.**

> ⚠️ **"Fails loudly" means it logs — it does not mean it exits nonzero.** PocketBase v0.39.8 returns exit code 0 for a refused migration, and on `serve` it exits without starting the server at all. Read the output; never trust `$?`. Confirm the outcome with `tests/verify-deployment.sh` (Step 7 P3), which asserts the resulting schema directly.

<details><summary>Fallback: manual Admin UI steps (only if the migration cannot be used)</summary>

## Step 3-manual — Schema changes (Admin UI)

`appdata` collection → **Edit collection**:

1. **New field** `coreRev` — type **Number**, default `0`, min `0`, no decimals.
2. **New field** `trainingRev` — type **Number**, default `0`, min `0`, no decimals.
3. **Indexes** → add:
   ```sql
   CREATE UNIQUE INDEX idx_cf_appdata_user ON appdata (user)
   ```
   (If this fails, a duplicate slipped past Step 2 — go back.)

**New collection** `cf_commit_log` (Base):

| Field | Type | Notes |
| --- | --- | --- |
| `user` | Relation → users | required |
| `subsystem` | Plain text | required |
| `key` | Plain text | required |
| `requestHash` | Plain text | |
| `expectedRev` | Number | |
| `resultingRev` | Number | |
| `responseStatus` | Number | |
| `clientBuild` | Plain text | |
| `deviceId` | Plain text | |

- Index: `CREATE UNIQUE INDEX idx_cf_commit_key ON cf_commit_log (user, subsystem, key)`
- **API rules: leave every rule LOCKED (null)** — superuser-only. This ledger references health-data commits and must not be client-readable.

</details>

## Step 4 — Measure the payload cap (2 minutes)

**Settled — kept for the record.** The cap is **256 KiB** (`MAX_PAYLOAD_BYTES` in `pb_hooks/cf_cas_shared.js`), with a 320 KiB whole-envelope limit, ruled by the Product Architect in Round 2 (decision 4b). The largest real payload measured was 18,954 B, so the cap carries ~13× headroom. Nothing to do at deploy time; `verify-deployment.sh` check V11c confirms the deployed cap behaviourally.

## Step 5 — Install the hook

1. Copy **both** `server/pb_hooks/cf_cas.pb.js` **and** `server/pb_hooks/cf_cas_shared.js` into the instance's `pb_hooks/` directory (create it next to `pb_data` if it doesn't exist; Docker images expose it as `/pb_hooks` or `/pb/pb_hooks` depending on image). The shared module is required at request time — without it the route registers and then throws `ReferenceError` on every commit (Round 2 defect 2).
2. Restart PocketBase.
3. **Verify it loaded — from the server console, not the Admin UI.** The `CF CAS hook loaded` line is emitted at hook-registration time and does **not** appear in Admin UI → Logs or `/api/logs` on v0.39.8, which hold request logs only (verified 2026-07-27, `STAGING_RESULTS.md` §12.6). Read it with `docker logs <container> | grep 'CF CAS hook loaded'`.
4. **The boot line is not proof the kit works** — it is printed before migrations are applied, and a registered route can still throw on every request. Run `tests/verify-deployment.sh` for that.

## Step 6 — Run the integration tests (staging only)

From your Mac, on the Tailnet:

```bash
cd server/tests
BASE=http://<staging-host:port> \
ADMIN_EMAIL=<superuser> ADMIN_PASS=<superuser-pass> \
PB_BIN=<pocketbase> PRISTINE_DIR=<pb_data-without-the-migration> \
MIGRATIONS_DIR=<a-migrations-dir-for-the-suite> \
STAGING_CONFIRM=YES bash run-all.sh
```

`run-all.sh` runs all 11 suites in the Architect's required order — route smoke first, and it aborts the rest if smoke fails, because a non-executing handler produces false passes. Every script here refuses to run against the production hostname, without `STAGING_CONFIRM=YES`, or with non-disposable users. (`tests/legacy/cas-server-tests.sh` is the superseded Round 2 runner, kept as history; its results are not evidence.) Fault injection runs as part of the suite; the appendix below describes the two cases.

All tests must pass. Send the full output back to Claude — it goes into the review package. **Do not proceed to production on any failure.**

## Step 7 — PRODUCTION RUNBOOK

**Authorisation:** Product Architect, 2026-07-27 — **APPROVED FOR PRODUCTION CUTOVER**. Architecture, server gate, client staging and operational hardening all approved. Staging is green on both gates (`STAGING_RESULTS.md` Phase 1, `tests/CHECKLIST_RESULTS.md` Phase 2); the gate itself was reviewed twice more and the required V15 sentinel and security hardenings are in place.

> **Execute exactly as documented. The Architect's conditions:** use this runbook; use the verified gate; run the sentinel with `SENTINEL_WITH_HASH=YES`; use the approved disposable probe-account workflow; **if the gate reports `NOT VERIFIED` at any point, abort immediately and execute the rollback in P5**; record all production verification evidence for archival. *No further architecture changes are authorized as part of this release.*

**Still required before anything runs: the Product Owner's explicit go-ahead in the session.** Architect authorization is not an instruction to deploy.

| Prerequisite | Where it is satisfied |
| --- | --- |
| Execute the production deployment runbook | this section |
| Verify migrations with explicit post-migration checks, **not** the process exit code | P3, `tests/verify-deployment.sh` |
| Keep the Commit 10 deferred cases as a separate release gate | `tests/CHECKLIST_RESULTS.md` §9 — does not block this deployment |
| Preserve the rollback procedure and monitoring plan | P5 and P6 |
| **Existing-appdata integrity sentinel (V15)** — required by the gate review, 2026-07-27 | P0 captures the baseline, **P3 verifies it** |

> ### The one rule that governs this whole section
> **PocketBase v0.39.8 exits 0 when a migration FAILS.** Both `migrate up` and `serve` print `Error: failed to apply migration …` and return **exit code 0**; on `serve` the process exits *without ever starting the server*. A step of the form `docker restart pocketbase && echo deployed` therefore reports success while PocketBase is **down**, and with a restart policy it will restart into the same refusal indefinitely.
>
> Never treat exit status, "the container came back", or the presence of the `CF CAS hook loaded` line as evidence — that line is printed *before* the migration failure. The only accepted evidence is **P3**. Measured and recorded in `STAGING_RESULTS.md` §12.2.

### P0 — Backup and baseline (do nothing before this)

1. Admin UI → **Settings → Backups → Create backup**; download it off the NAS. Verify nonzero size. **Record filename, size and SHA-256.**
2. Record the pre-deploy baseline for comparison after P3: PocketBase version, `appdata` row count, the `appdata` index list, and the current API rules.
3. **Capture the V15 integrity sentinel — before touching anything.**
   ```bash
   cd server/tests
   BASE=https://rack.tail6fa16c.ts.net ADMIN_EMAIL=<superuser> ADMIN_PASS=<ask-interactively> \
   SENTINEL_CAPTURE=/tmp/cf-preflight.sentinel.json \
   SENTINEL_WITH_HASH=YES \
     bash verify-deployment.sh
   ```
   This records `id`, `user`, `coreRev`, `trainingRev`, the UTF-8 byte lengths of `data` and `training`, and a SHA-256 of each payload's canonical form, for every existing row — then exits. It reads the payloads to measure them and **writes none of them anywhere**.

   **`SENTINEL_WITH_HASH=YES` is mandatory for production** (Product Architect, 2026-07-27) because byte length alone cannot detect a same-length payload change. It is on by default; the gate refuses a hashless baseline at P3 unless `ACCEPT_NO_HASH=YES` is set, which is not an approved production path.

   The file is created atomically, mode **0600**, refusing to follow a symlink, and its permissions are verified after writing. It carries record and user IDs, so keep it local — and delete it in P3.4. If the run does not print `BASELINE CAPTURED`, **stop**: without it, nothing in P3 can prove the athletes' rows survived.
4. Confirm the Product Owner is available for the whole window — P5 (rollback) needs a decision, not a script.

### P1 — Pre-flight on a copy (never on the live instance)

Copy production `pb_data` to a throwaway directory and run the migration there first:

```bash
cp -a /path/to/pb_data /tmp/pb_preflight
pocketbase migrate up --dir=/tmp/pb_preflight --migrationsDir=/path/to/server/pb_migrations
# READ THE OUTPUT. Exit code 0 means nothing.
```

Any line containing `failed to apply migration` is a **STOP**. The most likely cause is duplicate `appdata` rows (Step 2); resolve them on production first and start P1 again. Delete `/tmp/pb_preflight` when done — it holds real health data.

### P2 — Apply

1. Copy `server/pb_migrations/1753400000_cf_cas.js` into the production `pb_migrations/`.
2. Copy **both** `server/pb_hooks/cf_cas.pb.js` and `server/pb_hooks/cf_cas_shared.js` into the production `pb_hooks/`. The shared module is not optional — without it every commit throws `ReferenceError` while the route still answers (Round 2 defect 2).
3. Restart PocketBase. Capture the console log rather than watching it scroll:
   ```bash
   docker logs --since 5m <container> > /tmp/pb-deploy.log 2>&1
   ```

### P3 — VERIFY (this is the gate, and the only one)

```bash
cd server/tests

# 1. create the disposable probe account (Architect-approved: this is the only
#    production write in the runbook — one user row, no health data)
BASE=https://rack.tail6fa16c.ts.net ADMIN_EMAIL=<superuser> ADMIN_PASS=<pw> \
  bash probe-account.sh create
set -a; . ./.probe-creds.env; set +a

# 2. run the gate
BASE=https://rack.tail6fa16c.ts.net \
ADMIN_EMAIL=<superuser> ADMIN_PASS=<ask-interactively> \
PB_DATA_DIR=/path/to/pb_data \
PB_BIN=/path/to/pocketbase \
PB_LOG_FILE=/tmp/pb-deploy.log \
SENTINEL_VERIFY=/tmp/cf-preflight.sentinel.json \
  bash verify-deployment.sh

# 3. delete the probe account IMMEDIATELY afterwards, pass or fail, and
#    confirm the user, its appdata row and its ledger rows are all gone
BASE=https://rack.tail6fa16c.ts.net ADMIN_EMAIL=<superuser> ADMIN_PASS=<pw> \
  bash probe-account.sh teardown

# 4. destroy the integrity baseline and confirm it is gone — after a PASS, and
#    equally after a rollback. It carries record and user IDs.
python3 _sentinel.py destroy /tmp/cf-preflight.sentinel.json
```

**Credentials never appear in process arguments.** `/proc/<pid>/cmdline` is world-readable, so a superuser token passed as `curl -H "Authorization: …"` would be visible to every local user for the life of the request. The kit now puts the header in a 0600 curl config file read with `-K`, hands the sentinel its token on **stdin**, and passes passwords to helper processes through the environment. Verified by rig checks S10a–c (Product Architect requirement, 2026-07-27).

`verify-deployment.sh` is **read-only and safe against production** — every request is a GET, a superuser auth, or a probe rejected before any database access. It is the one script here that does not refuse to run against the production hostname, because verifying production is its job. It asserts schema, index shapes, ledger rules, and that the route actually executes our code; full check list in `STAGING_RESULTS.md` §12.3.

- `RESULT: VERIFIED` + exit 0 → proceed.
- Anything else → **do not proceed. Go to P5.**

**The probe account is settled.** The Product Architect ruled on 2026-07-27: *"Use a disposable production probe account. Execute authenticated route probes. Delete the account immediately afterward. Verify account and ledger absence."* Steps 1 and 3 above are that ruling; `probe-account.sh` addresses exactly one hard-coded `cf_test_*` address and cannot be pointed at a real athlete. **`ACCEPT_ROUTE_PROBE_ONLY=YES` is no longer an approved path for production** — it remains in the script for staging spot-checks only, and it leaves a route that throws on every request looking healthy, which is precisely what Round 2 shipped.

**V15 is the check that looks at the athletes' own rows.** Everything else in the gate proves the schema and the route. `SENTINEL_VERIFY` compares all six recorded values per row against the P0 baseline and fails the run if any of them moved — including a row that vanished, or one that appeared during the window. Note what it does *not* cover: byte length cannot see a change that happens to preserve length. `SENTINEL_WITH_HASH=YES` at capture time adds a SHA-256 of each payload's canonical form and closes that gap; it is off by default because the six values are what was specified. Both behaviours are demonstrated in `STAGING_RESULTS.md` §13.

### P4 — Client and bridge window

1. Deploy the CAS client build (**Commit 10** — not yet written; sequenced after this kit per `SERVER_NOTES.md` §4).
2. **Bridge window:** old cached clients keep writing via raw PATCH; the bridge in the hook bumps revisions so CAS clients detect every legacy write. Hard deadline **24–48 h** after the client is broadly available (Product Owner approval recorded in the plan).

### P5 — Rollback

**Decision criteria — roll back immediately if any of these hold** (approved by the Product Architect, 2026-07-27):

| Trigger | How you see it |
| --- | --- |
| P3 reports `NOT VERIFIED` | the gate's exit code and verdict line |
| `/api/health` unavailable | check V0, or any monitor — this is also how a refused migration presents |
| A real `CF commit failure` | `CF commit failed` / `CF commit retry failed` in the server console log |
| `appdata` row-count mismatch vs. the P0 baseline | check V15, which fails on a row that vanished or appeared |
| **Duplicate-owner detection** | check V10 — two rows for one user means the unique index is not protecting the table, and the CAS invariant is unenforceable |
| V15 integrity failure | any of the six sentinel values changed on an existing row |

| Situation | Action |
| --- | --- |
| Migration refused (P1 or P3 caught it) | Nothing was applied — PocketBase does not partially apply this migration (`migration.sh` M6b). Remove the migration file, restart, confirm the service answers, then fix the duplicate rows. |
| Migration applied, kit misbehaving | `pocketbase migrate down --dir=… --migrationsDir=…` (answer the `y/N` prompt; **check the output, not `$?`** — a cancelled revert also exits 0). The down-migration removes `coreRev`, `trainingRev`, `cf_commit_log` and **only the index this kit created** — production's `idx_88qok6ts7v` is deliberately preserved (`migration.sh` M2g). |
| Hook misbehaving, schema fine | Delete `pb_hooks/cf_cas.pb.js` and `cf_cas_shared.js`, restart. The schema is inert without the hook; clients keep working via raw PATCH. |
| Anything worse | Settings → Backups → **Restore** the P0 backup. |

After a rollback, destroy the integrity baseline as well: `python3 _sentinel.py destroy /tmp/cf-preflight.sentinel.json` — it confirms absence rather than assuming the delete worked.

After any rollback, re-run P3 — it should now report `NOT VERIFIED` for the expected reasons (route absent, fields gone), which confirms the rollback actually took effect.

### P6 — Monitoring

For the whole bridge window, watch:

| Signal | Where | Means |
| --- | --- | --- |
| `CF legacy raw snapshot write` | server console log | old clients still writing — the traffic signal that decides when lockdown is safe |
| `CF commit failed` / `CF commit retry failed` | server console log | a real commit hit a 500 — investigate before lockdown |
| `cf_commit_log` row growth | Admin UI (superuser) | commits are flowing; a flat ledger with active clients means the route is not being used |
| `CF ledger pruned` | server console log, daily ~04:00 | the 30-day retention cron is alive |
| **HTTP 409 rate on `/api/cf/appdata/commit`** | `/api/logs` (superuser), filtered on the commit route | **Architect-required.** A conflict is normal and expected — it is how CAS refuses a stale write. An unexpected *spike* is not: it means clients are repeatedly losing the same race, which points at a revision that is advancing without them (a legacy write path still open, or a bridge double-bump). Establish the baseline rate in the first hour and watch for departures from it. |
| `/api/health` | any monitor | catches the restart-loop failure mode described above |

Confirm **zero** `CF legacy raw snapshot write` lines over a full day before removing the bridge hooks.

### P7 — Lockdown at the deadline

1. Admin UI → `appdata` → API rules:
   - **Create:** locked (null) — only the commit route creates rows.
   - **Update:** `user = @request.auth.id && @request.body.data:isset = false && @request.body.training:isset = false && @request.body.coreRev:isset = false && @request.body.trainingRev:isset = false`
     — snapshot fields become route-only while **operational fields (`health`, `coachreq`) keep working**.
2. Set `CF_MIN_CLIENT_BUILD` in `pb_hooks/cf_cas_shared.js` and restart (old builds get an explicit `426 update-required`, not a generic error).
3. Remove the bridge hooks (the two `onRecord*Request` blocks).
4. **Re-verify** — the lockdown checks are not covered by the P3 run:
   ```bash
   EXPECT_LOCKDOWN=YES BASE=… ADMIN_EMAIL=… ADMIN_PASS=… PROBE_EMAIL=… PROBE_PASS=… \
     bash verify-deployment.sh
   ```
   V14d is the one that matters: it confirms a stale `clientBuild` is really refused **426**. `CF_MIN_CLIENT_BUILD` is a hook constant, not schema, so being refused is the only way to know it was actually set.
5. Watch for `CF legacy raw appdata write` entries after lockdown — there should be none.

> **Superuser note:** superusers bypass collection rules entirely. After lockdown, any admin-tooling write to `appdata` must go through the commit route or knowingly accepts a revision bump via the bridge (if still installed) or none (if removed).


---

## Appendix — manual fault-injection cases (staging only)

1. **Forced mid-transaction rollback:** stop PocketBase mid-run or make `pb_data` read-only (`chmod -w`), issue a commit, restore, then verify via probe that the revision did **not** advance and no ledger row exists for that key.
2. **Missing-ledger fail-closed:** temporarily rename `cf_commit_log` (Admin UI), issue a commit — expect **500** (never 200, never a false 409), no revision advance; rename back.

Record both in the results table like every other case.
