# Server Deployment — CAS for `appdata` (PocketBase v0.39.8)

**Last Updated:** 2026-07-25

**Status:** Revised per the Product Architect server-kit addendum. STAGING first with DISPOSABLE users; production only after the corrected suite passes and the Architect approves. Companion: `SERVER_NOTES.md` (threat model, field mapping, cutover policy).

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
BASE=https://<staging> ADMIN_EMAIL=<superuser> ADMIN_PASS=<superuser-pass> bash tests/setup-fixtures.sh
```

Creates `cf_test_1@staging.invalid` / `cf_test_2@staging.invalid` and prints the exact test command. **Never supply a real athlete's password to any script.** Destructive tests run only against these users; `teardown` removes them. If the staging copy contains real data, it stays Tailnet-only, untouched by destructive tests, and is deleted after verification (`SERVER_NOTES.md` §2).

## Step 2 — Duplicate-row check (before the unique index)

Admin UI → `appdata` collection. With 2 users you can eyeball it: **each user id must appear at most once**. If any user has two rows:

1. Export both rows (open each record → copy JSON) to files — this is the archive.
2. Do **not** merge by hand if `data`/`training` differ — stop and send both JSON files back to Claude for a reconciliation plan.
3. If they are identical, delete the older one (`updated` timestamp).

## Step 3 — Schema changes (reproducible migration; Admin UI is the FALLBACK)

Copy `server/pb_migrations/1753400000_cf_cas.js` into the instance's `pb_migrations/` directory and restart — PocketBase applies it automatically (or run `./pocketbase migrate up`). It creates `coreRev`/`trainingRev`, the unique `appdata.user` index, and the superuser-only `cf_commit_log` with its unique ledger index. It **fails loudly if duplicate rows exist** (by design) and includes a down-migration for rollback. **Test it on a disposable copy first.**

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

Open each `appdata` record in the Admin UI and note the size of `data` (roughly: copy the JSON into a character counter, or run in the browser console of the record page: `JSON.stringify(recordData).length`). Report the two numbers back. The hook ships with a provisional **2 MB** cap (`CF_MAX_PAYLOAD_BYTES`); we'll set the real cap = max observed × ~4 headroom, and that number goes to the Product Architect for approval.

## Step 5 — Install the hook

1. Copy `server/pb_hooks/cf_cas.pb.js` into the instance's `pb_hooks/` directory (create it next to `pb_data` if it doesn't exist; Docker images expose it as `/pb_hooks` or `/pb/pb_hooks` depending on image).
2. Restart PocketBase.
3. **Verify it loaded:** Admin UI → Logs → look for `CF CAS hook loaded`. If it is not there, the hook did not load — stop and report the log error.

## Step 6 — Run the integration tests (staging only)

From your Mac, on the Tailnet:

```bash
cd server/tests
BASE=https://<staging-host:port> \
EMAIL=cf_test_1@staging.invalid PASS=<fixture-pw> \
EMAIL2=cf_test_2@staging.invalid PASS2=<fixture-pw> \
ADMIN_EMAIL=<superuser> ADMIN_PASS=<superuser-pass> \
STAGING_CONFIRM=YES bash cas-server-tests.sh
```

The script refuses to run against the production hostname, without `STAGING_CONFIRM=YES`, or with non-disposable users. Two cases need manual fault injection (appendix below): forced mid-transaction rollback, and missing-ledger fail-closed.

All tests must pass. Send the full output back to Claude — it goes into the review package. **Do not proceed to production on any failure.**

## Step 7 — Production order (only after staging is green AND the Architect approves)

1. Backup production (Step 0).
2. Steps 2–5 on production.
3. Deploy the CAS client build (Commit 10 — not yet written; Claude delivers it after staging passes).
4. **Bridge window:** old cached clients keep writing via raw PATCH; the bridge in the hook bumps revisions so CAS clients detect every legacy write. Hard deadline **24–48 h** after the client is broadly available (your approval recorded in the plan).
5. **Lockdown at the deadline:** Admin UI → `appdata` → API rules:
   - **Create:** locked (null) — only the commit route creates rows.
   - **Update:** `user = @request.auth.id && @request.body.data:isset = false && @request.body.training:isset = false && @request.body.coreRev:isset = false && @request.body.trainingRev:isset = false`
     — snapshot fields become route-only while **operational fields (`health`, `coachreq`) keep working**.
   - Set `CF_MIN_CLIENT_BUILD` in the hook and restart (old builds get an explicit `426 update-required`, not a generic error).
6. Watch Logs for `CF legacy raw appdata write` entries after lockdown — there should be none.

> **Superuser note:** superusers bypass collection rules entirely. After lockdown, any admin-tooling write to `appdata` must go through the commit route or knowingly accepts a revision bump via the bridge (if still installed) or none (if removed). Remove the bridge hooks (the two `onRecord*Request` blocks) at lockdown.


---

## Appendix — manual fault-injection cases (staging only)

1. **Forced mid-transaction rollback:** stop PocketBase mid-run or make `pb_data` read-only (`chmod -w`), issue a commit, restore, then verify via probe that the revision did **not** advance and no ledger row exists for that key.
2. **Missing-ledger fail-closed:** temporarily rename `cf_commit_log` (Admin UI), issue a commit — expect **500** (never 200, never a false 409), no revision advance; rename back.

Record both in the results table like every other case.
