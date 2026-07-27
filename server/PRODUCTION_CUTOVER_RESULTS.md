# Production Cutover Results — CAS server kit on PocketBase v0.39.8

**Date:** 2026-07-27
**Target:** `https://rack.tail6fa16c.ts.net` (Synology RS1221+ "RACK", DSM, Container Manager)
**Executed by:** local Claude Code session on the Product Owner's workstation (`GBClaude`), over Tailscale
**Authorization:** Product Architect, 2026-07-27 — **APPROVED FOR PRODUCTION CUTOVER**; Product Owner go-ahead given in-session
**Outcome:** ✅ **VERIFIED — 20 checks passed, 0 failed.** The gate returned `RESULT: VERIFIED` and exit code 0.

> This is the archival evidence record the Architect required. It records what was done, what was found, and what deviated.

---

## 1. Outcome summary

| Item | Result |
| --- | --- |
| Backup taken and verified off-NAS | ✅ `cf_precutover_20260727.zip`, 31,674,675 B, SHA-256 verified after transfer |
| Pre-flight migration on a copy of **real production data** | ✅ `Applied 1753400000_cf_cas.js` |
| Migration applied to production | ✅ `coreRev`, `trainingRev`, `cf_commit_log` all present |
| Production's pre-existing unique index preserved | ✅ `idx_88qok6ts7v` adopted; exactly one unique index on `appdata(user)` |
| Commit route live and executing our code | ✅ V11a/b/c — 401 not 404, our exact validator error, cap read back as 262144 |
| **V15 existing-athlete-row integrity** | ✅ **both rows unchanged — id, user, coreRev, trainingRev, byte lengths AND content hashes** |
| Disposable probe account removed | ✅ verified absent: user + appdata + ledger |
| Integrity baseline destroyed | ✅ deletion confirmed |
| Ledger rows written by the gate | ✅ **0** — the probes wrote nothing |
| Lockdown (P7) | ⏸️ **not done, by design** — waits for the CAS client (Commit 10) |

---

## 2. Environment as found

Discovery was read-only. SSH access required creating a key for the real DSM account (`griffingoodman`); an earlier attempt against a nonexistent `griffin` Unix user failed and is recorded in §6.

```
image:        ghcr.io/muchobien/pocketbase:0.39.8
container:    pocketbase   (restart: unless-stopped, healthcheck on /api/health)
port:         8090:8090
host path:    /volume1/docker/pocketbase
volumes:      /volume1/docker/pocketbase/pb_data:/pb_data      <-- ONLY mount as found
entrypoint:   /usr/local/bin/entrypoint.sh
serve args:   serve --http=0.0.0.0:8090 --dir=/pb_data --publicDir=/pb_public --hooksDir=/pb_hooks
              (no --migrationsDir flag; PocketBase's default was in use)
container uid: 1026 (griffingoodman)
```

**Finding that changed the plan: there were no `pb_hooks` or `pb_migrations` bind mounts.** The CAS kit is a hook plus a migration, so there was nowhere to install it that would survive a container recreate. See §5.

## 3. Pre-deploy baseline (P0)

**Backup.** Created via `POST /api/backups` as superuser.

| | |
| --- | --- |
| Name | `cf_precutover_20260727.zip` |
| Size | 31,674,675 bytes |
| SHA-256 | `11ca78f08e3ca58ed737db290870d0bddf926733af30938bb68cb74e108a1c41` |
| On NAS | `/volume1/docker/pocketbase/pb_data/backups/` |
| Off-NAS copy | `~/cf-cutover/` on GBClaude — **hash verified identical after transfer**, `unzip -t` clean, `data.db` present |

`scp` failed (`No such file or directory`) despite the file being readable over SSH: modern `scp` defaults to the SFTP protocol and DSM does not enable the sftp-server subsystem. Transferred with `ssh 'cat file' >` instead.

**Schema and data baseline.**

```
collections:  users (auth, 10 fields), appdata (base, 8 fields), photos (base, 10 fields)
appdata:      id, user, data, training, created, updated, health, coachreq
indexes:      ['CREATE UNIQUE INDEX `idx_88qok6ts7v` ON `appdata` (`user`)']
all 5 rules:  '@request.auth.id != "" && user = @request.auth.id'
row counts:   users=2  appdata=2  photos=26
cf_commit_log: absent (expected)
duplicate owners: 0   <-- the migration's guard would not refuse
```

**V15 integrity sentinel** — captured with `SENTINEL_WITH_HASH=YES` (mandatory per the Architect), file mode 0600, containing six scalars plus content hashes per row and **no payload fields**:

```
row asxx3sejhxjycgo user=4rqrai74jwdiyu2 coreRev=0 trainingRev=0 dataBytes=2     trainingBytes=2
row huhguz7atzdq546 user=93hpzp5s1exymd9 coreRev=0 trainingRev=0 dataBytes=19556 trainingBytes=22100
```

The larger payload is 19,556 B against a 256 KiB cap — ~13× headroom, consistent with the Round 2 measurement.

## 4. Pre-flight on a copy (P1)

Run against `data.db` extracted from the backup — i.e. **real production data**, on the workstation, never the live instance.

First attempt failed with `attempt to write a readonly database (8)` — `unzip` preserved the archive's read-only bits. **The exit code was 0.** A textbook demonstration of the hazard this runbook exists to handle: the process reported success while the migration had been refused.

After `chmod u+rwX`:

```
Applied 1753400000_cf_cas.js
```

Resulting schema, asserted directly rather than inferred:

```
appdata columns:  [... 'coreRev', 'trainingRev']
appdata indexes:  ['CREATE UNIQUE INDEX `idx_88qok6ts7v` ON `appdata` (`user`)']   <-- adopted, not duplicated
cf_commit_log:    created
_migrations:      ['1753400000_cf_cas.js']
rows:             both intact, coreRev=0 trainingRev=0
```

## 5. Apply (P2) — including the deviations

Files staged over SSH, checksums verified byte-identical against the repo:

| File | SHA-256 |
| --- | --- |
| `pb_hooks/cf_cas.pb.js` | `b60d86d7b053601d4636acf82797da98b59f37dbe41c2c6e5ad92dd44496c035` |
| `pb_hooks/cf_cas_shared.js` | `4d7296d1984cab6d9f0b4d987a85277ef706fe5547516daa9c73bed88d213568` |
| `pb_migrations/1753400000_cf_cas.js` | `efaf215ae1b70cc08de675ee00bb19b5f95bb7b3f38a7e82be5e45b5e3ec43ec` |

`compose.yaml` backed up as `compose.yaml.pre-cas-backup`, then changed:

```diff
      volumes:
        - /volume1/docker/pocketbase/pb_data:/pb_data
+       - /volume1/docker/pocketbase/pb_hooks:/pb_hooks
+       - /volume1/docker/pocketbase/pb_migrations:/pb_migrations
+     command: ["--migrationsDir=/pb_migrations"]
```

The container's seven pre-existing auto-generated migration files were `docker cp`'d out to the host directory **before** the mount hid them, so nothing was lost. They are already recorded in `_migrations` and did not re-run.

Container recreated with `docker compose up -d` (root, via DSM Task Scheduler — the Product Owner's account cannot reach the Docker socket).

## 6. Deviations from the runbook

| # | Deviation | Why |
| --- | --- | --- |
| 1 | **Added two bind mounts and recreated the container** | No `pb_hooks`/`pb_migrations` mounts existed. Without them the kit has nowhere to live. Product Owner approved explicitly. Not an architecture change — the mechanical means of installing an already-approved hook. |
| 2 | **Added `command: ["--migrationsDir=/pb_migrations"]`** | The image passes `--hooksDir` explicitly but no `--migrationsDir`, relying on PocketBase's default. Evidence said the default landed on `/pb_migrations`, but a migration silently going somewhere unmounted is exactly the failure class this work exists to prevent, so it was made explicit. |
| 3 | `docker cp` of the container's existing migration files to the host before mounting | Preservation, not required by the runbook. |
| 4 | Docker operations run via DSM Task Scheduler as root | The operator account is not in a docker group and `sudo` needs a password. |
| 5 | Backup transferred with `ssh cat` rather than `scp` | DSM has no sftp-server subsystem; modern `scp` requires it. |
| 6 | SSH key installed for `griffingoodman`, not `griffin` | There is no `griffin` Unix account on the NAS. An earlier attempt created `/volume1/homes/griffin` as a root-owned decoy; it was removed. `/var/services/homes` is a symlink to `/volume1/homes`. |
| 7 | V11d, V12, V13 skipped | They need the server console log, the local `pb_data` path and the binary — none available remotely. V11b/c prove strictly more than V11d, and V2–V7 cover what V12 would have shown. |

## 7. The gate (P3)

```
PASS  V0   instance is reachable and healthy (200)
PASS  V1   superuser auth
PASS  V2   appdata collection readable (200)
PASS  V2a  appdata.coreRev exists (number)
PASS  V2b  appdata.coreRev is integer-only (True)
PASS  V2c  appdata.coreRev min is 0 (0)
PASS  V3a  appdata.trainingRev exists (number)
PASS  V3b  appdata.trainingRev is integer-only (True)
PASS  V3c  appdata.trainingRev min is 0 (0)
PASS  V4   exactly one UNIQUE index on appdata(user) (1)
PASS  V5   cf_commit_log collection exists (200)
PASS  V6   ledger has every required field (none)
PASS  V7   ledger UNIQUE index on (user, subsystem, key) (1)
PASS  V8   ledger API rules all locked (superuser-only) (locked)
PASS  V9   ledger user relation cascades on delete (True)
PASS  V10  no user owns two appdata rows (0)
      V15 INTEGRITY SENTINEL: all 2 existing row(s) unchanged
        row asxx3sejhxjycgo user=4rqrai74jwdiyu2 coreRev=0 trainingRev=0 dataBytes=2     trainingBytes=2
        row huhguz7atzdq546 user=93hpzp5s1exymd9 coreRev=0 trainingRev=0 dataBytes=19556 trainingBytes=22100
PASS  V15  existing appdata rows are byte-for-byte unchanged
PASS  V11a commit route is registered (401 from requireAuth, not 404)
PASS  V11b handler executes our code (invalid subsystem rejected by our own validator) (400, "invalid subsystem")
PASS  V11c configured payload cap is 256 KiB (262144)
SKIP  V11d boot line — no server console log available remotely
SKIP  V12  _migrations ledger — no local pb_data path
SKIP  V13  binary version — image tag is the record: 0.39.8
SKIP  V14  lockdown rules — not applicable until P7

---- verify-deployment: 20 passed, 0 failed ----
RESULT: VERIFIED — the CAS kit is correctly deployed at https://rack.tail6fa16c.ts.net
exit code 0
```

**Probe account** `cf_test_prod@staging.invalid` was created for V11b/c and deleted immediately afterwards per the ruling:

```
verified cf_test_prod@staging.invalid removed (user + appdata + ledger all absent)
PROBE TEARDOWN OK
```

Confirmed independently afterwards: `users` back to the two real accounts, `cf_commit_log` **0 rows**, `appdata` 2 rows at `coreRev=0 trainingRev=0`. The gate wrote nothing.

**Integrity baseline destroyed:** `V15 SENTINEL: baseline deleted and absence confirmed`.

## 8. Data handling

- The off-NAS backup copy and the extracted pre-flight `pb_data` on GBClaude **contain real health data**. They are the runbook's off-NAS backup copy plus its derivative. Location: `~/cf-cutover/` (mode 700). Delete the `preflight/` directory once the bridge window closes; keep or relocate the backup per the Product Owner's preference.
- The V15 baseline held no payloads and has been destroyed.
- `~/.cf-admin-pass` on GBClaude still holds the superuser password (mode 0600). Delete it when bridge-window monitoring is finished.
- No health data was written to this repo, to any log committed here, or to any review package.

## 9. What is NOT done

- **Lockdown (P7) has not run** and must not until the CAS client ships. `CF_MIN_CLIENT_BUILD` is unset, `appdata` API rules are unchanged, and the legacy-write bridge is active by design. Old clients keep working; the bridge keeps revisions truthful.
- **Commit 10 (CAS client) is not written.** Until it ships, no client uses the commit route — the server enforces CAS but nothing exercises it in anger yet.
- The five deferred checklist cases and the independent manifest reader remain Commit 10 gate items (`tests/CHECKLIST_RESULTS.md` §9).

## 10. Bridge-window monitoring

Per the Architect's approved plan, watch for:

| Signal | Where | Means |
| --- | --- | --- |
| `CF legacy raw snapshot write` | server console log (`docker logs pocketbase`) | old clients still writing — the signal that decides when lockdown is safe |
| `CF commit failed` / `CF commit retry failed` | server console log | a real commit hit a 500 |
| **HTTP 409 rate on `/api/cf/appdata/commit`** | `/api/logs`, filtered on the route | conflicts are normal; an unexpected *spike* means a revision is advancing without the clients losing the race |
| `cf_commit_log` row growth | Admin UI (superuser) | commits flowing once the CAS client ships |
| `CF ledger pruned` | server console log, daily ~04:00 | the 30-day retention cron is alive |
| `/api/health` | any monitor | catches the restart-loop failure mode |

## 11. Rollback position (unused, kept current)

- Backup `cf_precutover_20260727.zip` — on the NAS and verified off-NAS.
- `compose.yaml.pre-cas-backup` — the original single-mount container definition.
- `pocketbase migrate down` removes `coreRev`, `trainingRev`, `cf_commit_log` and **only** `idx_cf_appdata_user`; production's `idx_88qok6ts7v` is preserved by design (`migration.sh` M2g, confirmed by the Architect).
- Deleting the two files in `pb_hooks` and restarting renders the kit inert while leaving the schema in place.
