# Server Deployment — CAS for `appdata` (PocketBase v0.39.8)

**Last Updated:** 2026-07-25

**Status:** Ready to deploy on STAGING first. Production only after the staging integration tests pass.

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

## Step 2 — Duplicate-row check (before the unique index)

Admin UI → `appdata` collection. With 2 users you can eyeball it: **each user id must appear at most once**. If any user has two rows:

1. Export both rows (open each record → copy JSON) to files — this is the archive.
2. Do **not** merge by hand if `data`/`training` differ — stop and send both JSON files back to Claude for a reconciliation plan.
3. If they are identical, delete the older one (`updated` timestamp).

## Step 3 — Schema changes (Admin UI)

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
BASE=https://<staging-host:port> EMAIL=<test-user-email> PASS=<test-user-password> \
EMAIL2=<second-test-user-email> PASS2=<second-password> bash cas-server-tests.sh
```

All tests must pass. Send the full output back to Claude — it goes into the review package. **Do not proceed to production on any failure.**

## Step 7 — Production order (only after staging is green AND the Architect approves)

1. Backup production (Step 0).
2. Steps 2–5 on production.
3. Deploy the CAS client build (Commit 10 — not yet written; Claude delivers it after staging passes).
4. **Bridge window:** old cached clients keep writing via raw PATCH; the bridge in the hook bumps revisions so CAS clients detect every legacy write. Hard deadline **24–48 h** after the client is broadly available (your approval recorded in the plan).
5. **Lockdown at the deadline:** Admin UI → `appdata` → API rules → set **Create** and **Update** to locked (null). List/View stay `user = @request.auth.id`. Old clients now fail closed instead of writing blind.
6. Watch Logs for `CF legacy raw appdata write` entries after lockdown — there should be none.

> **Superuser note:** superusers bypass collection rules entirely. After lockdown, any admin-tooling write to `appdata` must go through the commit route or knowingly accepts a revision bump via the bridge (if still installed) or none (if removed). Remove the bridge hooks (the two `onRecord*Request` blocks) at lockdown.
