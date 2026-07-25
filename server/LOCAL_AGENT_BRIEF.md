# Local Agent Brief — Deploy the CAS Server Kit to STAGING

**Last Updated:** 2026-07-25

**Audience:** a Claude Code session running ON THE PRODUCT OWNER'S OWN COMPUTER (inside their Tailscale network). The cloud session that wrote this kit cannot reach the server; you can. **The Product Owner is not an operator — do the work for them.** Ask them for at most: the PocketBase superuser login when needed, and yes/no confirmations. Never ask them to run commands themselves.

## Mission

Deploy and validate the CAS server kit (`server/` in this repo, branch `claude/compound-fitness-roles-workflow-aala7o`) against a **STAGING** copy of the PocketBase instance at `https://rack.tail6fa16c.ts.net` (PocketBase v0.39.8, Synology NAS "RACK"). Then record the results and push them back to this branch.

## Hard rules — no exceptions

1. **NEVER modify the production PocketBase** (`rack.tail6fa16c.ts.net`, default port). No schema changes, no hook installs, no test writes against it. Production deployment is a separate, later, explicitly-approved step.
2. **Back up production first** (read-only step: Admin UI → Settings → Backups → Create backup; download a copy) before creating the staging copy from its data.
3. Destructive tests run **only** against disposable `cf_test_*` users created by `server/tests/setup-fixtures.sh`. Never against the two real user accounts. Never ask the Product Owner for a real athlete password for any script.
4. If anything is ambiguous or fails in a way not covered here, **stop and report** — do not improvise on the server.
5. The staging copy contains real health data: keep it Tailnet-only, don't expose it, and note in the results when it can be deleted.

## What the Product Owner can tell you (ask conversationally)

- The PocketBase **superuser (admin) login** — needed for the Admin UI backup, fixtures, and some tests. Use it interactively; never store it in a file.
- Whether they can give you **SSH access to the NAS** (`ssh <user>@rack.tail6fa16c.ts.net` or its LAN IP). If they don't know what that means, use the fallback discovery below.

## Step-by-step

### 0. Get the repo
```bash
git clone https://github.com/kaleyeah/Weight-Tracker.git && cd Weight-Tracker
git checkout claude/compound-fitness-roles-workflow-aala7o
```
Read `server/DEPLOYMENT.md` and `server/SERVER_NOTES.md` in full before acting.

### 1. Discover how PocketBase runs (read-only)
- Confirm reachability: `curl -s https://rack.tail6fa16c.ts.net/api/health`
- With SSH: `docker ps | grep -i pocket` (most likely a Container Manager/Docker container on the Synology) or `ps aux | grep pocketbase`. Locate the data directory (the volume mapped to `/pb_data` or a `pb_data` folder next to the binary).
- Without SSH: ask the Product Owner to open Synology **Container Manager** and read you the container name + volume paths, or grant SSH (Control Panel → Terminal & SNMP → Enable SSH). Guide them click-by-click; they should never have to figure anything out alone.

### 2. Production backup (read-only on prod)
Admin UI (superuser login) → Settings → Backups → Create backup → download it locally. Verify nonzero size. Record filename + size for the results.

### 3. Create the STAGING instance
Preferred (Docker on the NAS): copy the production data dir to a new folder, run a second container on another port, e.g.
```bash
sudo cp -a /path/to/pb_data /path/to/pb_data_staging
sudo docker run -d --name pocketbase-staging -p 8091:8090 \
  -v /path/to/pb_data_staging:/pb_data \
  -v /path/to/staging_pb_hooks:/pb_hooks \
  -v /path/to/staging_pb_migrations:/pb_migrations \
  <same image as the production container>
```
(Adapt paths/image to what discovery found; some images use `/pb/pb_data` etc. Match the production container's mounts.) Staging URL will be `http://<nas-lan-ip>:8091` — Tailnet/LAN only is fine and preferred.

### 4. Deploy the kit to STAGING
1. Copy `server/pb_migrations/1753400000_cf_cas.js` into the staging `pb_migrations/`.
2. Copy `server/pb_hooks/cf_cas.pb.js` into the staging `pb_hooks/`.
3. Restart the staging container. Check its logs for **`CF CAS hook loaded`** and for migration output. If the migration fails on duplicate rows, STOP and report (with only 2 users this is unlikely).

### 5. Fixtures + integration tests (staging only)
```bash
cd server/tests
BASE=http://<staging-host:port> ADMIN_EMAIL=<superuser> ADMIN_PASS=<ask-interactively> bash setup-fixtures.sh
# then run the exact command setup-fixtures.sh prints (it includes STAGING_CONFIRM=YES)
```
All automated tests must pass. Also run the two manual fault-injection cases in the DEPLOYMENT.md appendix if feasible.

### 6. Measure the payload cap
As superuser, fetch each real user's `appdata` record from **staging** and record the UTF-8 byte size of `data` and `training`. (E.g. `curl -s ... | python3 -c 'import sys,json; r=json.load(sys.stdin); ...'`.) Do not paste the health data anywhere — sizes only.

### 7. Record results and push
Write `server/STAGING_RESULTS.md` containing:
- date, PocketBase version output, container/image details
- backup filename + size
- migration output (verbatim)
- the `CF CAS hook loaded` log line
- full test output (tokens/passwords redacted — the script already redacts)
- payload size measurements (bytes, per user, per field)
- staging data-handling note (host, port, Tailnet-only, when the copy will be deleted)
- anything that deviated from this brief

Then:
```bash
git add server/STAGING_RESULTS.md
git commit -m "Staging deployment results: CAS kit on PocketBase v0.39.8"
git push origin claude/compound-fitness-roles-workflow-aala7o
```
Finally run `bash setup-fixtures.sh teardown`, and tell the Product Owner: "Done — the results are pushed. Give them to your cloud Claude session and the Product Architect."

### Step 8 — CLIENT staging phase (now authorized)

The client build (`index.html`, `2026-07-26.339-pb-c1g2`) is **READY-FOR-STAGING** per the Product Architect. After the server kit passes its integration tests on staging:

1. Serve the repo's `index.html` locally (e.g. `python3 -m http.server 8092` in the repo root) and point it at the STAGING PocketBase (login screen → Server settings → staging URL). Never production.
2. Work through `tests/MANUAL_CHECKLIST_COMMIT1.md` — **67 cases** — using the two disposable `cf_test_*` accounts and two browser profiles. Automate with Playwright where practical (Chromium is fine); flag the genuinely manual ones and walk the Product Owner through those interactively.
3. Record the staging evidence package the Architect requires: expected + actual per case, browser/build, exact PocketBase version, screenshots/logs for failures and conflict flows, deviations, disposable-fixtures confirmation, and whether the CAS kit was installed. Write it to `tests/CHECKLIST_RESULTS.md`, commit, and push to this branch.

### What NOT to do
- Do not deploy to production. Do not change production API rules. Do not set `CF_MIN_CLIENT_BUILD`. Do not remove the bridge hooks. Do not run the browser checklist (`tests/MANUAL_CHECKLIST_COMMIT1.md`) yet — that happens after the Product Architect approves the client build. All of that is later, explicitly-approved work.
