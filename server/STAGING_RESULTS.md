# Staging Results — CAS Server Kit on PocketBase v0.39.8

**Date:** 2026-07-27
**Executed by:** local Claude Code session on the Product Owner's workstation (`gbclaude`, Tailnet)
**Branch:** `claude/compound-fitness-roles-workflow-aala7o` @ `34ad542`
**Outcome:** ❌ **BLOCKED — migration fails against the production schema. Kit not validated. Do not deploy to production.**

---

## 1. Verdict summary

| Step (DEPLOYMENT.md) | Result |
| --- | --- |
| 0 — Production backup | ✅ Created manually by the Product Owner, downloaded, verified |
| 1 — Staging instance | ✅ Local PocketBase v0.39.8 from a restore of the production backup |
| 2 — Duplicate-row check | ✅ PASS — 2 users, 2 `appdata` rows, no duplicate owners |
| 3 — Schema migration | ❌ **FAIL — aborts, nothing applied** (§4) |
| 4 — Payload cap measurement | ✅ Measured (§6) |
| 5 — Install hook | ✅ Hook file loads (`CF CAS hook loaded`) — but its schema dependencies do not exist |
| 6 — Integration tests | ⛔ **NOT RUN** — unreachable, blocked by step 3 |
| Appendix — fault injection (2 cases) | ⛔ **NOT RUN** — blocked by step 3 |
| Brief step 8 — client checklist (75 cases) | ⛔ **NOT RUN** — needs a working staging server |

Per `LOCAL_AGENT_BRIEF.md` hard rule 4 ("if anything fails in a way not covered here, stop and report — do not improvise on the server"), this session stopped at the failure and made no corrective change to the kit. The Product Owner was offered a patch and explicitly chose **report-only**.

---

## 2. Environment

| Item | Value |
| --- | --- |
| PocketBase version (staging binary) | `pocketbase version 0.39.8` — official `pocketbase_0.39.8_linux_amd64.zip` |
| Production version | v0.39.8 (per `DEPLOYMENT.md` known state, 2026-07-25; not re-queried — would have required an authenticated production call) |
| Staging host | `127.0.0.1:8091` — loopback only, not bound to the Tailnet or LAN |
| Staging form | **Bare binary**, not a container (`DEPLOYMENT.md` step 1 permits either) |
| Data directory | `/home/griffin/staging-cas/pb_data` (mode 700), restored from the production backup |
| Hooks / migrations dirs | `--hooksDir=pb_hooks --migrationsDir=pb_migrations`, each containing only the kit file |
| Container / image details | **N/A** — no container was used; see deviation D1 |

**Production was never written to.** The only production request this session made was an unauthenticated `GET /api/health` (reachability check, returned `{"message":"API is healthy.","code":200}`). The backup API was **not** called, per the Product Owner's instruction.

---

## 3. Backup

| Field | Value |
| --- | --- |
| Filename | `pb_backup_acme_20260727063119.zip` |
| Size | **29,184,291 bytes** (27.8 MiB) |
| SHA-256 | `57f5125313977dc4f74c24cf90cae864a8ab671bd6cc23d51ad851243eb56770` |
| Created | 2026-07-27 06:31 UTC, manually via Admin UI → Settings → Backups |
| Contents | 93 files — `data.db` (274,432 B), `auxiliary.db` (133,099,520 B), `storage/` (22 photo records + thumbs), `types.d.ts` |
| Verified | Nonzero, opens cleanly, restores cleanly |

### Restored state (production schema, pre-migration)

- Collections: `users` (auth), `appdata` (base), `photos` (base), plus PocketBase system collections
- Row counts: **users = 2**, **appdata = 2**, **photos = 22**
- `appdata` columns: `created`, `data`, `id`, `training`, `updated`, `user`, `health`, `coachreq`
- **Duplicate-owner check (DEPLOYMENT step 2): PASS** — 2 distinct owners across 2 rows, no user appears twice

---

## 4. ❌ Migration failure (the blocker)

### Verbatim output

```
2026/07/27 06:35:05 INFO CF CAS hook loaded build=cas-2 maxPayloadBytes=2097152 minClientBuild=(none)
Error: failed to apply migration 1753400000_cf_cas.js: indexes: (1: The index definition already exists..).
```

The process then exits; the server never finishes starting and port 8091 stays closed.

### Root cause

`server/pb_migrations/1753400000_cf_cas.js:21-22` guards the unique-index creation **by index name only**:

```js
if (!appdata.indexes.find((i) => i.includes("idx_cf_appdata_user")))
  appdata.indexes.push("CREATE UNIQUE INDEX idx_cf_appdata_user ON appdata (user)");
```

The production `appdata` collection **already carries an equivalent unique index**, created earlier through the Admin UI under a generated name:

```sql
CREATE UNIQUE INDEX `idx_88qok6ts7v` ON `appdata` (`user`)
```

Confirmed in both the collection definition (`_collections.indexes`) and `sqlite_master`. Because no index string contains `idx_cf_appdata_user`, the guard passes, a **second** unique index on the same column is pushed, and PocketBase's collection validator rejects the duplicate definition — failing the whole migration.

### Blast radius

- **The failure is atomic — nothing was applied.** Verified after the failure: `appdata` columns unchanged (no `coreRev`, no `trainingRev`), `cf_commit_log` does not exist, and no `cf_cas` row in `_migrations`.
- **This is not a staging artifact.** The conflicting index is part of the production schema that was backed up, so the migration fails **identically on production**. Staging caught a defect that would otherwise have surfaced during the production cutover.
- **The whole kit is gated behind it.** The hook's route depends on `coreRev`/`trainingRev` and `cf_commit_log`; without the migration, no integration test can run.

### Mitigating fact

The invariant the migration wants — at most one `appdata` row per user, enforced by a unique index — **is already true in production**. The schema is not missing protection; the migration is failing while trying to add protection that already exists under a different name.

### Suggested fix (NOT applied — for Architect review)

Match on index *shape* rather than on the kit's chosen name, so the migration is idempotent against both a fresh instance and the existing production schema:

```js
// An equivalent unique index may already exist under an Admin-UI-generated
// name (production: `idx_88qok6ts7v`). Match on SHAPE, not on our name, or
// PocketBase rejects the duplicate definition and the migration aborts.
const hasUserUnique = appdata.indexes.some((i) =>
  /unique/i.test(i) && /\(\s*`?user`?\s*\)/i.test(i));
if (!hasUserUnique)
  appdata.indexes.push("CREATE UNIQUE INDEX idx_cf_appdata_user ON appdata (user)");
```

Note for whoever applies this: the **down-migration** at `1753400000_cf_cas.js:64` has the mirror-image problem — it filters `idx_cf_appdata_user` out of `appdata.indexes`, which is a no-op on production (the index is named `idx_88qok6ts7v`). That is arguably the correct behaviour, since rollback should *not* drop a pre-existing production index the kit never created — but it should be an explicit, commented decision rather than an accident of naming.

---

## 5. Hook status

The hook file itself is syntactically valid and loads into the JS VM — this line appears on every PocketBase invocation, including the failed boot above:

```
2026/07/27 06:35:05 INFO CF CAS hook loaded build=cas-2 maxPayloadBytes=2097152 minClientBuild=(none)
```

This confirms **only** that the file parses and its top-level logging runs. **It does not validate any hook behaviour** — the commit route, the CAS transaction, the ledger, the legacy-write bridge, and the prune cron are all unexercised, because the schema they depend on was never created.

---

## 6. Payload cap measurement (DEPLOYMENT step 4)

Measured on the staging restore as UTF-8 byte counts. **Sizes only — no health data was printed, copied, or transmitted anywhere.**

| Record | `data` | `training` | `health` | `coachreq` |
| --- | ---: | ---: | ---: | ---: |
| user 1 (`4rqrai74jwdiyu2`) | 2 B | 2 B | 0 B | 0 B |
| user 2 (`93hpzp5s1exymd9`) | **18,954 B** | **18,900 B** | 0 B | 0 B |

- **Max observed: 18,954 B** (~18.5 KiB). User 1's records are empty JSON objects (`{}`).
- `DEPLOYMENT.md` step 4 formula (max observed × ~4 headroom) gives **≈ 75,816 B (~74 KiB)**.
- The hook currently ships `CF_MAX_PAYLOAD_BYTES = 2,097,152` (2 MiB) — roughly **110× the largest real payload**.
- **Not changed.** `DEPLOYMENT.md` reserves this number for Product Architect approval. Recommendation for the Architect: a 4× headroom derived from a single 19 KB sample is a thin basis for a hard cap on a dataset that grows with training history — consider sizing against projected 12-month growth rather than today's max, or keeping the generous cap and relying on the 413 path (which is itself still untested).

---

## 7. Tests — NOT RUN

`server/tests/setup-fixtures.sh` and `server/tests/cas-server-tests.sh` were **never invoked**. No `cf_test_*` fixture users were created; no teardown was necessary. The full suite (T1–T15, ledger race, cross-user isolation, unique-index test) and both `DEPLOYMENT.md` appendix fault-injection cases (forced mid-transaction rollback; missing-ledger fail-closed) remain **unverified**.

Both scripts were read and reviewed. Two observations for whoever runs them next:

1. `cas-server-tests.sh:98` selects the record to raw-PATCH via `perPage=1` against the **user's own** token, which is correct, but `cas-server-tests.sh:120` then builds a forged-create body from `$(echo "$RID" | head -c 15)` — a truncated *record* id used as a *user* relation value. That case (`raw-create-forge`) only logs its status and asserts nothing, so it cannot fail the suite; it is diagnostic, not a test.
2. `setup-fixtures.sh:6`'s production guard uses a `case` pattern that will not match a bare `https://rack.tail6fa16c.ts.net` without a trailing port — but `cas-server-tests.sh:13` guards that exact form correctly. Not a live risk for this session (nothing was pointed at production), but the two guards are not equivalent and the weaker one is in the script that *creates* users.

Neither observation was acted on.

---

## 8. Client checklist (brief step 8) — NOT RUN

Blocked: the 75-case checklist requires a working staging PocketBase to point the client at.

The **precondition was verified** and holds: `tests/MANUAL_CHECKLIST_COMMIT1.md:3` names build `2026-07-27.342-pb-c1h`, and `index.html:2` is exactly that build — so the Architect's requirement that staging evidence be tied to the exact confirmed artifact is satisfiable as soon as the server is unblocked. `tests/CHECKLIST_RESULTS.md` was not created.

> **Doc inconsistency for the cloud session:** `LOCAL_AGENT_BRIEF.md:97` ("Do not run the browser checklist … yet — that happens after the Product Architect approves the client build") contradicts step 8 at `LOCAL_AGENT_BRIEF.md:88` ("now authorized"). Step 8 is the later, dated instruction and records the Architect's 2026-07-27 confirmation, so it governs; the stale bullet in *What NOT to do* should be struck to avoid a future session reading the brief the other way.

---

## 9. Data handling

- The staging copy contained **real health data** for 2 real users, restored from the production backup.
- It lived only at `/home/griffin/staging-cas` (mode 700) on the Product Owner's own workstation, bound to **127.0.0.1 only** — never exposed to the Tailnet, the LAN, or the internet.
- **No destructive test ever ran against the real user rows.** No fixture users were created. The real records were read for byte-size measurement and nothing else.
- **Deleted immediately after this commit**: `pb_data/` (the restore) and the local copy of the backup zip. Both were removed with `shred`/`rm -rf` at the end of the session.
- One further copy of the backup remains outside this session's control: the file the Product Owner uploaded, at `~/.claude/uploads/839b975e-.../5281b340-pb_backup_acme_20260727063119.zip`, plus whatever copy exists in their browser's download location and the backup entry still held on the NAS. **Recommend deleting the workstation copies.**
- Re-running staging after the migration is fixed will require a **fresh backup export** — the restore is gone by design.

---

## 10. Deviations from the brief

| # | Deviation | Reason |
| --- | --- | --- |
| D1 | Staging is a **local bare-binary instance on the workstation**, not a second container on the NAS (brief §3 "preferred") | SSH to `rack.tail6fa16c.ts.net` was refused (`Permission denied (publickey,password)`), and the workstation account cannot reach the Docker socket. The Product Owner chose the local path as the safest option: it touches neither the NAS nor the production container. `DEPLOYMENT.md` step 1 explicitly supports the bare-binary form. |
| D2 | The production backup was **created manually by the Product Owner**, not by this session (brief §2 has the agent drive the Admin UI) | Explicit instruction: "Do not call the production backup API or make any production writes." |
| D3 | **No production superuser credentials were used or requested** (brief §"What the Product Owner can tell you" anticipates them) | Unnecessary on a local restore: a disposable staging superuser (`cf_staging_admin@staging.invalid`) was minted offline with `pocketbase superuser upsert` against the staging data directory. No real credential entered a script, a file, or a command line. |
| D4 | Steps 5–6, the fault-injection appendix, and step 8 were **not executed** | Blocked by the §4 migration failure; hard rule 4 requires stop-and-report. |
| D5 | `CF_MAX_PAYLOAD_BYTES` **left at 2 MiB** despite the measurement suggesting ~74 KiB | `DEPLOYMENT.md` step 4 reserves the real cap for Product Architect approval. |
| D6 | The migration defect was **diagnosed but not fixed** | The Product Owner was offered a patch (§4) and chose report-only, so the kit source is byte-identical to what the Architect holds. |

---

## 11. What the next session needs to do

1. **Product Architect decision on the §4 fix** — the kit cannot deploy anywhere, staging or production, until the index guard is idempotent.
2. Re-run this whole procedure from a **fresh production backup** once the fix lands: migration → hook → fixtures → 13-case suite → 2 fault-injection cases.
3. Only then step 8's 75-case client checklist against build `2026-07-27.342-pb-c1h`.
4. Architect to rule on the payload cap (§6).
5. **Production remains untouched and unapproved.** Nothing in this document constitutes evidence for production readiness.
