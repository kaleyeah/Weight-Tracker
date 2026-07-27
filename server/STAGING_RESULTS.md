# Staging Results — CAS Server Kit on PocketBase v0.39.8

**Date:** 2026-07-27 (round 2 — supersedes the round-1 report on this branch, history in §12)
**Executed by:** local Claude Code session on the Product Owner's workstation (`gbclaude`, Tailnet)
**Branch:** `claude/compound-fitness-roles-workflow-aala7o`
**Outcome:** ❌ **STILL BLOCKED — 3 further defects. 1 of 4 fixed. Do not deploy to production.**

**Headline:** the migration defect from round 1 is fixed and verified. Getting past it revealed that **the commit route had never executed successfully anywhere** — a JS scoping fault made every request fail. With that patched on staging, the CAS logic itself proved **correct** under manual testing, but the automated suite cannot demonstrate it: its concurrency cases are invalidated by a shared temp file, and its teardown silently fails.

---

## 1. Defect register

| # | Defect | Severity | Status |
| --- | --- | --- | --- |
| **1** | Migration unique-index guard matched by **name**, colliding with production's existing `idx_88qok6ts7v` | Blocker | ✅ **FIXED** — `0cc6029`, verified applied on staging |
| **2** | Commit-route handler cannot see file top-level scope → `ReferenceError`, **every commit returns a generic 400** | Blocker | ❌ Open — diagnosed, staging-patched only, repo untouched |
| **3** | `cas-server-tests.sh` concurrent cases share one request-body temp file → both requests send an identical body | High | ❌ Open — invalidates T1, T2, T3a, T13a |
| **4** | `cf_commit_log.user` is a **required, non-cascading** relation → users with ledger rows cannot be deleted; teardown reports success anyway | High | ❌ Open — staging + production impact |

---

## 2. Defect 1 — migration index guard (FIXED)

Round 1 root cause: the guard tested for the literal name `idx_cf_appdata_user`, but production carries an equivalent unique index named `` `idx_88qok6ts7v` ``. The guard passed, a duplicate definition was pushed, PocketBase rejected it, and the whole migration aborted.

**Fix (`0cc6029`):** match on index *shape* — any UNIQUE index whose column list is exactly `(user)`, quoted or not. Unit-verified against 7 cases: production's existing index, our own index on re-run, fresh instance, non-unique-only, composite `(user, sub)`, a different column, and unquoted/whitespace forms.

**Verified on staging** — migration applied cleanly against a fresh restore of production data:

```
appdata cols:    [... 'health', 'coachreq', 'coreRev', 'trainingRev']
appdata indexes: ['CREATE UNIQUE INDEX `idx_88qok6ts7v` ON `appdata` (`user`)']   ← adopted, not duplicated
cf_commit_log:   created
  indexes:       ['CREATE UNIQUE INDEX idx_cf_commit_key ON cf_commit_log (user, subsystem, key)']
  rules:         (None, None, None, None, None)   ← all five locked, superuser-only ✅
migration recorded: ['1753400000_cf_cas.js']
appdata rev values: coreRev=0, trainingRev=0 on both existing rows
```

Down-migration left deliberately asymmetric (drops only the index the kit created, never an adopted pre-existing one), now documented as intent. **Still pending Architect confirmation.**

---

## 3. Defect 2 — the commit route has never worked (BLOCKER)

### Evidence

```
ReferenceError: CF_SUBSYSTEMS is not defined at /home/griffin/staging-cas/pb.js:4:15(12)
```
— logged for **every** `POST /api/cf/appdata/commit`, HTTP status 0 → PocketBase returns a generic 400.

### Root cause

PocketBase serializes `routerAdd` handler functions and executes them in a **separate goja runtime**. The handler therefore cannot see its own file's top-level scope. Everything declared at `cf_cas.pb.js:8-15` is undefined inside the handler:

- `CF_SUBSYSTEMS` — first use at line 20, so the route dies immediately
- `CF_MAX_PAYLOAD_BYTES` — the hook's own 413 check never runs
- `CF_MIN_CLIENT_BUILD` — **the 426 update-required path is dead**, which matters directly for the lockdown plan in `SERVER_NOTES.md` §3
- `cfUtf8Bytes()` — the UTF-8 size helper

Only `$apis.bodyLimit(CF_REQUEST_LIMIT)` works, because it is evaluated at *registration* time in top-level scope.

The two bridge hooks (`onRecordUpdateRequest` / `onRecordCreateRequest`) and the prune cron reference no top-level constants, so they are unaffected — consistent with T7a/T7b passing.

### Why this was not caught earlier

This is environment-independent. It would fail identically on the NAS. **It means the kit was never executed against a running PocketBase before this session.**

### It also produces false passes

T8 (`invalid subsystem -> 400`) and T9 (`negative rev -> 400`) **passed against a completely dead route**, because a crashed handler also returns 400. Any test asserting only a 4xx status cannot distinguish "validation worked" from "the handler threw". Recommend asserting on the response body (`error: "invalid subsystem"`), not just the status.

### Fix direction (NOT applied)

Declare the constants and helper **inside** the handler, or move them to a module loaded with `require(`${__hooks}/…`)` inside the handler. A staging-only patch doing the former is what produced §4's results; the repo hook is byte-identical to what the Architect holds.

---

## 4. Suite results (with defect 2 patched on staging only)

```
== auth (users + superuser) ==
== validation (5/8/9) ==
PASS  T5 unauthenticated rejected (401)
PASS  T8 invalid subsystem -> 400
PASS  T9 negative rev -> 400
== T10 oversized payload ==
PASS  T10 oversized -> 413
== T3 concurrent FIRST-ROW creation ==
FAIL  T3a exactly one first-commit succeeded  (want 1, got 2)      ← defect 3
PASS  T3b exactly one row exists
== discover current coreRev ==
PASS  probe wrong-rev -> 409        serverRev=1
== T1/T2 concurrent same-expectedRev ==
FAIL  T1 exactly one 200  (want 1, got 2)                          ← defect 3
FAIL  T2 exactly one 409  (want 1, got 0)                          ← defect 3
== T13 idempotent replay + concurrent same-key ==
FAIL  T13a replay -> 200  (want 200, got 409)                      ← defect 3 (knock-on)
PASS  T13b replay does not double-increment
PASS  T13c same key, different body -> 409
PASS  T-ledger-race both same-key commits end 200 (one live, one replay)
== T14/T15 field isolation, both directions ==
PASS  T15a training commit -> 200
PASS  T15b coreRev unchanged by training commit
PASS  T14a 409 returns the user's OWN core payload (ownership)
PASS  T14b trainingRev unchanged by core probe
== T7 raw writes: bridge or lockdown, exactly-once bump ==
PASS  T7a revision fields not client-settable -> 400
PASS  T7b bridge bumped coreRev EXACTLY once
== T6 cross-user isolation ==
PASS  T6a user2 cannot touch user1 row (404)
      raw-create-forge status 400 (hook pins owner to the authenticated user)
== T4 REAL unique-index test ==
PASS  T4 second VALID row for same user rejected by unique index (400)

RESULT: 17 passed, 4 failed
```

Unpatched (kit exactly as shipped) the same run dies at T3 with `FATAL: no serverRev` after 4 misleading passes.

---

## 5. Defect 3 — the concurrency tests cannot test concurrency

`cas-server-tests.sh:26-28`:

```bash
commit(){ # token subsystem expectedRev key payloadjson
  python3 -c '...' "$2" "$3" "$4" "$5" > "$TMP/req.json"
  curl ... --data-binary "@$TMP/req.json"; }
```

Every call writes the request body to the **same** `$TMP/req.json`. The concurrency cases invoke it twice in parallel (`commit ... & commit ... & wait`), so the second write clobbers the first before curl reads it and **both requests transmit an identical body** — same `idempotencyKey`, same payload. The server then correctly performs one live commit and one idempotent replay, and the suite scores that as "two 200s, expected one".

Proof from the ledger — one row per *successful* commit, none for the supposed losers:

```
key=k-1785135609-f1     sub=core     exp=0 -> res=1 status=200
key=k-1785135609-c2     sub=core     exp=1 -> res=2 status=200
key=k-1785135609-race   sub=core     exp=2 -> res=3 status=200
key=k-1785135609-t1     sub=training exp=0 -> res=1 status=200
```

Keys `…-f2` and `…-c1` have **no ledger row at all** — those requests were never sent under those keys. T13a then fails as a knock-on: the script assumes the `c1` branch won, replays `c1`, and gets a genuine 409 because `c2` was the key actually committed.

**Fix direction (NOT applied):** give each invocation its own body file (`$TMP/req.$BASHPID.$RANDOM.json`) or pass the body on stdin.

---

## 6. The CAS logic itself is correct (verified manually)

Because the suite cannot demonstrate the concurrency paths, they were driven by hand with genuinely distinct parallel requests. Full transcript in `evidence/manual-cas-repro.log`.

**A. Same expectedRev, different keys and payloads:**
```
alpha -> 200 {"newRev":5,"ok":true,"subsystem":"core"}
beta  -> 409 {"conflict":true,"ok":false,"payload":{"who":"alpha"},"serverRev":5,"subsystem":"core"}
verification probe -> serverRev 5, stored payload {"who":"alpha"}
```
Exactly one winner; the loser receives the winner's revision *and* payload — what the client needs to reconcile. This is what T1/T2 intended.

**B. Concurrent first-row creation, expectedRev 0, different keys:**
```
alpha -> 409 {"conflict":true,"ok":false,"payload":{"first":"beta"},"serverRev":1,"subsystem":"core"}
beta  -> 200 {"newRev":1,"ok":true,"subsystem":"core"}
row count after the race: 1
```
Exactly one first commit, exactly one row, and the loser gets a real 409 — not a 500, not a fake success. The unique index arbitrates inside the transaction exactly as `SERVER_NOTES.md` §2 describes. This is what T3a/T3b intended.

**Conclusion: no CAS correctness defect was found.** Defects 2–4 are a scoping fault, a harness fault and a schema-relation fault. But note this rests on manual reproduction of two paths, not on a green suite — it is not equivalent to full test coverage.

---

## 7. Defect 4 — the ledger pins user accounts, and teardown lies about it

`setup-fixtures.sh teardown` reported success:
```
deleted cf_test_1@staging.invalid
deleted cf_test_2@staging.invalid
```
`cf_test_1` was **still present afterwards**. The real response:
```
DELETE /api/collections/users/records/u1pbrtqaiurm5np
-> 400 {"message":"Failed to delete record. Make sure that the record is not part of a required relation reference."}
```

**Cause.** The migration declares the ledger's owner relation as `required: true, cascadeDelete: false`:
```json
{"name":"user","type":"relation","required":true,"cascadeDelete":false,"collectionId":"_pb_users_auth_","maxSelect":1}
```
So any user with `cf_commit_log` rows cannot be deleted. `cf_test_2` deleted cleanly only because it never committed anything.

**Two distinct problems:**
1. **Schema.** With 30-day ledger retention (`SERVER_NOTES.md` §2), a real athlete account becomes **undeletable for up to 30 days after their last write**. That is a product and data-protection question — account deletion would fail with an opaque relation error — and it deserves an explicit decision, not a default. Options: `cascadeDelete: true`; or make `user` optional and null it on delete; or have the prune job clear rows for deleted users.
2. **Harness.** `setup-fixtures.sh:20` echoes `deleted $em` without checking the DELETE status, so a failed cleanup is indistinguishable from a successful one. On a staging copy of production data, a teardown that silently leaves disposable accounts behind is a hygiene problem in its own right.

**Workaround confirmed:** purge the user's ledger rows first, then delete the user → `204`. Used to finish cleanup this session.

---

## 8. Environment

| Item | Value |
| --- | --- |
| PocketBase (staging binary) | `pocketbase version 0.39.8` — official `pocketbase_0.39.8_linux_amd64.zip` |
| Production version | v0.39.8 per `DEPLOYMENT.md` known state; not re-queried |
| Staging host | `127.0.0.1:8091` — loopback only, never exposed to Tailnet/LAN |
| Staging form | Bare binary (`DEPLOYMENT.md` step 1 permits it), **not** a container |
| Backup restored | `pb_backup_acme_20260727065658.zip`, **29,180,202 bytes**, sha256 `e752216997d42754032279e3a345157cf459fb756ff90212329a96bf0bebd128` |
| Restored state | users=2, appdata=2, photos=22; **no duplicate owners** (DEPLOYMENT step 2 PASS) |

**Production was never written to.** The only production request all session was an unauthenticated `GET /api/health`. The backup was created manually by the Product Owner in the Admin UI; the backup API was not called. No production superuser credentials were used or requested — a disposable staging superuser was minted offline with `pocketbase superuser upsert`.

---

## 9. Payload cap measurement (DEPLOYMENT step 4)

Sizes only — no health data was printed, copied or transmitted.

| Record | `data` | `training` |
| --- | ---: | ---: |
| user 1 (`4rqrai74jwdiyu2`) | 2 B | 2 B |
| user 2 (`93hpzp5s1exymd9`) | **18,954 B** | **18,900 B** |

- Max observed **18,954 B**; step-4 formula (× ~4) → **≈ 75,816 B (~74 KiB)** vs the **2 MiB** provisional cap in the hook.
- **Unchanged** — `DEPLOYMENT.md` reserves this for Architect approval, and no ruling came back with the round-1 package.
- Caveat: the hook's own size check is inside the broken handler (defect 2), so the 413 observed in T10 came from `$apis.bodyLimit`, **not** from `CF_MAX_PAYLOAD_BYTES`. The cap as configured is currently untested at any value.

---

## 10. Not run

- **Fault-injection appendix** (forced mid-transaction rollback; missing-ledger fail-closed) — deferred, since the suite is not trustworthy until defect 3 is fixed.
- **Brief step 8, the 75-case client checklist** — skipped by Product Owner decision this cycle. `tests/CHECKLIST_RESULTS.md` not created. Precondition still verified: `tests/MANUAL_CHECKLIST_COMMIT1.md:3` and `index.html:2` both name `2026-07-27.342-pb-c1h`.

---

## 11. Deviations

| # | Deviation | Reason |
| --- | --- | --- |
| D1 | Local bare-binary staging, not a NAS container | SSH to `rack` refused (`publickey,password`); no Docker socket access. Product Owner chose the local path; touches neither NAS nor production. |
| D2 | Backup created manually by the Product Owner | Explicit instruction: no production writes, no backup API. |
| D3 | No production superuser credentials used | Disposable staging superuser minted offline instead. |
| D4 | **A staging-only patch was applied to the hook** to diagnose defect 2 | Without it the route is 100% dead and nothing downstream can be observed. The patch is clearly marked in the staging copy and was **never** committed; `server/pb_hooks/cf_cas.pb.js` in this branch is unchanged. §4's results are explicitly "with that patch applied". |
| D5 | Defects 2, 3, 4 diagnosed but **not fixed** | Product Owner chose report-only. |
| D6 | `CF_MAX_PAYLOAD_BYTES` left at 2 MiB | No Architect ruling received. |
| D7 | Ledger rows manually purged to complete teardown | Defect 4 blocked the scripted path; staging was destroyed immediately after regardless. |

---

## 12. Round-1 history

The first attempt (same day, earlier) failed at the migration with `indexes: (1: The index definition already exists..)` and nothing applied. That report was pushed as `a6482fe`; the Architect returned a status file directing "fix migration, rerun staging, then submit a new staging review package", which authorised the §2 fix. Round 2 is that rerun. The round-1 asks on **rollback semantics** and the **payload cap number** were never answered and remain open.

---

## 13. Data handling

- The staging copy contained **real health data** for 2 real users. It lived only at `/home/griffin/staging-cas` (mode 700), bound to 127.0.0.1.
- **No destructive test ever touched the real user rows** — all destructive work ran against `cf_test_*` disposables. Real records were read for byte-size measurement only.
- Fixtures torn down (with the §7 workaround); staging restore, backup copy and disposable credentials **shredded and deleted** at session end.
- Copies remaining outside this session: the Product Owner's uploaded file, their browser download, and the backup entry on the NAS. **Recommend deleting the workstation copies.**
- Any further staging cycle needs a **fresh backup export**.

---

## 14. What the next session needs

1. **Architect ruling on defect 2's fix shape** — constants inside the handler, or a `require()`d module. This blocks everything.
2. **Fix defect 3** before any suite output is treated as evidence; consider also asserting on response bodies so a dead handler cannot produce passes.
3. **Decision on defect 4** — cascade, nullable, or prune-on-delete — and fix the teardown's unchecked DELETE.
4. Then re-run: migration → hook → fixtures → full suite → both fault-injection cases, and only then the 75-case client checklist.
5. Still open from round 1: **rollback semantics** (§2) and the **payload cap number** (§9).
6. **Production remains untouched and unapproved.** Nothing here is production-readiness evidence.
