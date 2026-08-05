# .461-fence-stage1 canary — pre-deploy record (step 2+3)

Recorded 2026-08-05, before publishing. Meta only — no health values, no
tokens, user/device ids hashed.

## Step 2 — rollback anchor

| | |
|---|---|
| Live build | `2026-08-05.460-cleanup` (commit `9f95b7e`) |
| Live artifact sha256 (captured copy) | `7892fede4309be03c149fd…` (`live-460-artifact.html`) |
| Candidate | `2026-08-05.461-fence-stage1` (commit `6e39c1a`), index.html `ae908af343658c562a82ef…` |

**Exact rollback path** (rehearsed pattern; burned-build rule applies):
```
cd ~/projects/compound-app
git revert --no-edit 6e39c1a e0110a7          # or: git checkout 9f95b7e -- src/ && restore
#   then bump src/app-core.js APP_BUILD to a NEW id (.462-rollback — NEVER reuse .461)
node build.mjs && node build.mjs --check
git commit -am "Rollback canary" && git push origin main
#   verify: curl the live URL until APP_BUILD shows the rollback id
```
Client-only rollback is compatible because the server was never changed.

## Step 3 — production state (meta only)

Athlete record `huhguz7atzdq546` (userHash `6e93bf36a0dd`):
- coreRev **373**, core sha256/16 `69c6d3d3c7bdaf24`, 31554 bytes
- trainingRev **32**, training sha256/16 `ad1598c55586bb74`, 37864 bytes
- updated 2026-08-05 20:37:31Z

Second record `asxx3sejhxjycgo` (userHash `db44eb1e17de`): empty at rev 0/0 —
the known dormant test remnant, untouched.

Writer lease: fence **3**, active, holder `dad217514571…` = **iPhone** (the
primary device, as expected).

Server hooks (sha256/16, production `/volume1/docker/pocketbase/pb_hooks/`):
```
d2b6d1421361b69a  cf_cas.pb.js
7bc856cf3e1774aa  cf_cas_shared.js
c56314a6488bd2ba  cf_m10_enforce.pb.js
49d58b3618e0966f  cf_m10_lease.pb.js
d929b224cdd968e8  cf_m10_photos.pb.js
32ff89ad0af2c5d8  cf_m10_shared.js
```
None of these change in this canary. `FENCING_ENFORCED_DEFAULT=false`,
`MIN_CLIENT_BUILD` inert.

## Rollback triggers (Architect list, verbatim commitments)

Any unfenced core/training/photo request from `.461`; unexpected hard block or
repeated false review prompt; missing local entry after reload; a journal that
disappears without a definite outcome; the secondary device mutating without
the pen; unexpected revision/content change; an update/reload loop. On any of
these: preserve evidence first when safe, then client-only rollback to the
recorded `.460`.
