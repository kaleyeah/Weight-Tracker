#!/usr/bin/env bash
# Compound Fitness — post-deployment verification for the CAS kit.
#
# WHY THIS EXISTS (Product Architect ruling, 2026-07-27):
#
#   "Production deployment scripts must never treat an exit status of 0 as
#    sufficient evidence that migrations succeeded. The deployment process
#    should instead verify success explicitly."
#
# PocketBase v0.39.8 exits 0 even when a migration FAILS — proven by
# migration.sh case M6c, where the duplicate-row guard refuses the migration,
# logs the refusal, and still returns rc=0 for both `migrate up` and `serve`.
# A deploy script trusting $? reads a refused migration as a successful one and
# proceeds to lock down API rules against schema that was never created.
#
# THIS SCRIPT IS THE TRUSTED SIGNAL. It ignores exit codes entirely and asserts
# the deployed state directly: fields, index shapes, the ledger collection, its
# locked rules, and that the commit route is live. Exit 0 here means verified.
#
# ---- THIS SCRIPT IS SAFE TO RUN AGAINST PRODUCTION -------------------------
# It is the ONE script in this directory that deliberately does NOT call
# cf_guard, because verifying production is its entire job. In exchange it is
# strictly READ-ONLY:
#   - every request is a GET, except superuser auth and the deliberately
#     invalid route probes, which are rejected before any database write;
#   - it creates no records, no users, no fixtures;
#   - it never mutates schema, rules or settings.
# Sourcing _lib.sh for assertion helpers does NOT make the rest of this
# directory production-safe — everything else here writes, and is guarded.
#
# Usage:
#   BASE=https://<host> ADMIN_EMAIL=.. ADMIN_PASS=.. bash verify-deployment.sh
#
# Optional:
#   SENTINEL_CAPTURE=<file>       capture the V15 integrity baseline and exit
#                                 (run this BEFORE deploying — runbook P0)
#   SENTINEL_VERIFY=<file>        verify against that baseline (runbook P3)
#   SENTINEL_WITH_HASH=YES        capture content hashes as well as byte lengths
#   ACCEPT_NO_SENTINEL=YES        proceed without V15, recording the caveat
#   PROBE_EMAIL/PROBE_PASS        disposable cf_test_* user for the handler probes (V11b/c)
#   ACCEPT_ROUTE_PROBE_ONLY=YES   proceed without V11b/c, recording the caveat
#   PB_LOG_FILE=/path/serve.log   also grep the console log for the boot line (V11d)
#   PB_DATA_DIR=/path/pb_data     also verify the _migrations ledger row (V12)
#   PB_BIN=/path/pocketbase       also record the binary version (V13)
#   EXPECT_LOCKDOWN=YES           additionally require the step-7 lockdown state (V14)
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; . "$DIR/_lib.sh"
BASE="${BASE:?set BASE}"
ADMIN_EMAIL="${ADMIN_EMAIL:?set ADMIN_EMAIL}"; ADMIN_PASS="${ADMIN_PASS:?set ADMIN_PASS}"
trap 'rm -rf "$CF_TMP"' EXIT

echo "== CAS post-deployment verification =="
echo "   target: $BASE"
echo "   mode:   READ-ONLY (safe against production)"
echo ""

# ---- V0 reachability --------------------------------------------------------
cf_req GET /api/health
cf_eq "V0  instance is reachable and healthy" 200 "$CF_STATUS" "$CF_BODY"
[ "$CF_STATUS" = "200" ] || { echo "ABORT: the instance did not answer /api/health — nothing below can be trusted."; cf_summary "verify-deployment"; exit 1; }

# ---- V1 superuser auth (needed to read schema) ------------------------------
ATOK=$(cf_admin_token "$ADMIN_EMAIL" "$ADMIN_PASS")
if [ -n "$ATOK" ]; then cf_ok "V1  superuser auth"; else
  cf_bad "V1  superuser auth failed — cannot read schema"
  echo "ABORT: without a superuser token the schema cannot be verified."
  cf_summary "verify-deployment"; exit 1
fi

# ---- V15 capture mode: run BEFORE deploying, then exit ----------------------
# Deliberately placed before every schema check, because at capture time the
# revision fields do not exist yet and those checks are all expected to fail.
if [ -n "${SENTINEL_CAPTURE:-}" ]; then
  echo ""
  echo "== V15 integrity sentinel — CAPTURE (pre-deployment baseline) =="
  HASHARG=""; [ "${SENTINEL_WITH_HASH:-}" = "YES" ] && HASHARG="--with-hash"
  if python3 "$DIR/_sentinel.py" capture "$BASE" "$ATOK" "$SENTINEL_CAPTURE" $HASHARG; then
    echo ""
    echo "RESULT: BASELINE CAPTURED — pass it back as SENTINEL_VERIFY=$SENTINEL_CAPTURE after deploying."
    echo "        The file holds six scalars per row and no payloads. Keep it local; delete it after the cutover."
    exit 0
  fi
  echo ""
  echo "RESULT: BASELINE NOT CAPTURED — do NOT deploy. Without it, V15 cannot prove the athletes' rows were untouched."
  exit 1
fi

# Fetch a collection's definition into $CF_TMP/col.json; prints "" on failure.
col_fetch() { # name -> writes $CF_TMP/col.json, echoes http status
  curl -sS --max-time 30 -o "$CF_TMP/col.json" -w '%{http_code}' \
    "$BASE/api/collections/$1" -H "Authorization: $ATOK"
}
# Query the fetched collection with a tiny python expression over `c`.
col_q() { python3 -c '
import sys,json
c=json.load(open(sys.argv[1]))
fields={f["name"]:f for f in c.get("fields",[])}
idx=c.get("indexes",[])
print(eval(sys.argv[2]))' "$CF_TMP/col.json" "$1" 2>/dev/null || printf '<error>'; }

# ---- V2-V4 appdata ----------------------------------------------------------
ST=$(col_fetch appdata)
cf_eq "V2  appdata collection readable" 200 "$ST"
if [ "$ST" = "200" ]; then
  cf_eq "V2a appdata.coreRev exists"          "number" "$(col_q 'fields.get("coreRev",{}).get("type","<absent>")')"
  cf_eq "V2b appdata.coreRev is integer-only" "True"   "$(col_q 'fields.get("coreRev",{}).get("onlyInt",False)')"
  cf_eq "V2c appdata.coreRev min is 0"        "0"      "$(col_q 'int(fields.get("coreRev",{}).get("min",-1) or 0)')"
  cf_eq "V3a appdata.trainingRev exists"          "number" "$(col_q 'fields.get("trainingRev",{}).get("type","<absent>")')"
  cf_eq "V3b appdata.trainingRev is integer-only" "True"   "$(col_q 'fields.get("trainingRev",{}).get("onlyInt",False)')"
  cf_eq "V3c appdata.trainingRev min is 0"        "0"      "$(col_q 'int(fields.get("trainingRev",{}).get("min",-1) or 0)')"
  # Shape match, not name match — production carries `idx_88qok6ts7v` and the
  # migration adopts it rather than pushing a second unique index. The same
  # regex pair the migration uses: UNIQUE specifically, on exactly (user).
  cf_eq "V4  exactly one UNIQUE index on appdata(user)" "1" \
    "$(col_q 'sum(1 for i in idx if __import__("re").search(r"create\s+unique\s+index",i,2) and __import__("re").search(r"\(\s*`?user`?\s*\)",i,2))')" \
    "$(col_q 'idx')"
fi

# ---- V5-V9 cf_commit_log ----------------------------------------------------
ST=$(col_fetch cf_commit_log)
cf_eq "V5  cf_commit_log collection exists" 200 "$ST"
if [ "$ST" = "200" ]; then
  MISSING=$(col_q '",".join(n for n in ["user","subsystem","key","requestHash","expectedRev","resultingRev","responseStatus","clientBuild","deviceHash","created"] if n not in fields) or "none"')
  cf_eq "V6  ledger has every required field" "none" "$MISSING"
  cf_eq "V7  ledger UNIQUE index on (user, subsystem, key)" "1" \
    "$(col_q 'sum(1 for i in idx if __import__("re").search(r"create\s+unique\s+index",i,2) and __import__("re").search(r"user.*subsystem.*key",i,2))')" \
    "$(col_q 'idx')"
  # The ledger references health-data commits: every rule must stay null so it
  # is superuser-only. A single non-null rule exposes it to clients.
  cf_eq "V8  ledger API rules all locked (superuser-only)" "locked" \
    "$(col_q '"locked" if all(c.get(r) is None for r in ["listRule","viewRule","createRule","updateRule","deleteRule"]) else "OPEN:"+",".join(r for r in ["listRule","viewRule","createRule","updateRule","deleteRule"] if c.get(r) is not None)')"
  # Round 2 decision 3: without cascadeDelete a user holding ledger rows cannot
  # be deleted for up to the 30-day retention window.
  cf_eq "V9  ledger user relation cascades on delete" "True" \
    "$(col_q 'fields.get("user",{}).get("cascadeDelete",False)')"
fi

# ---- V10 no duplicate owners (the condition the unique index must prevent) ---
DUPES=$(curl -sS --max-time 60 -G "$BASE/api/collections/appdata/records" \
  --data-urlencode "perPage=500" --data-urlencode "fields=user" -H "Authorization: $ATOK" \
  | python3 -c '
import sys,json,collections
try: items=json.load(sys.stdin).get("items",[])
except Exception: print("<error>"); raise SystemExit
c=collections.Counter(i.get("user") for i in items)
print(sum(1 for u,n in c.items() if n>1))')
cf_eq "V10 no user owns two appdata rows" "0" "$DUPES"

# ---- V15 existing-appdata integrity sentinel (Architect-required) -----------
# Everything above proves the schema and the route. Only this proves the
# athletes' own rows came through the deployment untouched. Read-only: it
# measures payloads in memory and never writes them anywhere.
if [ -n "${SENTINEL_VERIFY:-}" ]; then
  if [ ! -r "$SENTINEL_VERIFY" ]; then
    cf_bad "V15 baseline file is missing or unreadable: $SENTINEL_VERIFY"
  else
    SENTINEL_OUT=$(python3 "$DIR/_sentinel.py" verify "$BASE" "$ATOK" "$SENTINEL_VERIFY" 2>&1)
    SENTINEL_RC=$?
    printf '%s\n' "$SENTINEL_OUT" | sed 's/^/      /'
    if [ "$SENTINEL_RC" = "0" ]; then
      cf_ok "V15 existing appdata rows are byte-for-byte unchanged"
    else
      cf_bad "V15 EXISTING APPDATA CHANGED ACROSS THE DEPLOYMENT — roll back" "$(printf '%s' "$SENTINEL_OUT" | head -c 400)"
    fi
  fi
elif [ "${ACCEPT_NO_SENTINEL:-}" = "YES" ]; then
  cf_ok "V15 SKIPPED by ACCEPT_NO_SENTINEL=YES — no pre-deployment baseline was supplied, so nothing here proves the existing athlete rows survived the deployment. Not an approved path for production."
else
  cf_bad "V15 no integrity baseline supplied — capture one BEFORE deploying with SENTINEL_CAPTURE=<file> (runbook P0), or set ACCEPT_NO_SENTINEL=YES to proceed with the caveat recorded"
fi

# ---- V11 the commit route is live ------------------------------------------
# V11a: unauthenticated POST. A registered route answers 401 (requireAuth);
# a hook that never loaded answers 404. Rejected by middleware — writes nothing.
cf_req POST /api/cf/appdata/commit
if [ "$CF_STATUS" = "401" ]; then
  cf_ok "V11a commit route is registered (401 from requireAuth, not 404)"
elif [ "$CF_STATUS" = "404" ]; then
  cf_bad "V11a commit route is ABSENT (404) — the hook did not load" "$CF_BODY"
else
  cf_bad "V11a commit route probe returned an unexpected status $CF_STATUS" "$CF_BODY"
fi

# V11b/V11c: proof the handler RUNTIME executes our code, not just that a route
# is registered. Round 2's route WAS registered and threw ReferenceError on
# every single request — V11a would have passed against it. Both probes are
# rejected by our own validators before any database access, so they write
# nothing; both are safe against production.
UTOK=""
if [ -n "${PROBE_EMAIL:-}" ] && [ -n "${PROBE_PASS:-}" ]; then
  case "$PROBE_EMAIL" in
    cf_test_*) : ;;
    *) echo "REFUSED: PROBE_EMAIL must be a disposable cf_test_* account (got $PROBE_EMAIL)"; exit 2;;
  esac
  UTOK=$(cf_user_token "$PROBE_EMAIL" "$PROBE_PASS")
  [ -n "$UTOK" ] || cf_bad "V11b probe user auth failed — handler execution not verified"
fi

if [ -n "$UTOK" ]; then
  # V11b — our exact error string from validateSubsystem(), not a framework body.
  F=$(cf_commit_body "__verify__" 0 "verify-probe-never-stored" '{}')
  cf_req POST /api/cf/appdata/commit "$UTOK" "$F"
  cf_assert_error "V11b handler executes our code (invalid subsystem rejected by our own validator)" 400 "invalid subsystem"

  # V11c — the CONFIGURED payload cap, verified behaviourally and read back from
  # the response. This is what the "CF CAS hook loaded" boot line reports,
  # established by observation instead of by trusting a log line.
  #
  # WRITE-PROOF BY CONSTRUCTION, not by arithmetic. Two independent guards:
  #   1. expectedRev = 2^31-1. If the cap were larger than this payload, the
  #      handler falls through to the revision check and answers 409 — never a
  #      commit, and the assertion below fails loudly instead of writing.
  #   2. the payload overshoots the cap by 16 KiB rather than by one byte, so it
  #      is over the limit under any serialization. (An exact-boundary probe was
  #      tried first and COMMITTED 256 KiB to the probe account: JS
  #      JSON.stringify emits `{"v":"…"}` while python's json.dumps emits
  #      `{"v": "…"}`, one byte wider, so "cap+1" measured in python was exactly
  #      the cap on the wire. Boundary behaviour is payload-boundary.sh's job
  #      against disposable staging users; this script must never depend on it.)
  # Still under the 320 KiB envelope limit, so it reaches our handler rather
  # than the framework's body-limit middleware.
  python3 -c '
import json,sys
body={"subsystem":"core","expectedRev":2147483647,"idempotencyKey":"verify-cap-never-stored",
      "payload":{"v":"x"*(256*1024+16*1024)},"clientBuild":"verify-probe"}
json.dump(body,open(sys.argv[1],"w"))' "$CF_TMP/oversize.json"
  cf_req POST /api/cf/appdata/commit "$UTOK" "$CF_TMP/oversize.json"
  CAP=$(cf_json maxBytes)
  if [ "$CF_STATUS" = "413" ] && [ "$(cf_json error)" = "payload too large" ]; then
    cf_eq "V11c configured payload cap is 256 KiB" "262144" "$CAP" "$CF_BODY"
  elif [ "$CF_STATUS" = "409" ]; then
    cf_bad "V11c the cap did NOT reject a 272 KiB payload — it reached the revision check (409). CF_MAX_PAYLOAD_BYTES is larger than the approved 256 KiB" "status $CF_STATUS"
  else
    cf_bad "V11c expected 413 + \"payload too large\" for a 272 KiB payload; got status $CF_STATUS" "$CF_BODY"
  fi
elif [ "${ACCEPT_ROUTE_PROBE_ONLY:-}" = "YES" ]; then
  cf_ok "V11b/c SKIPPED by ACCEPT_ROUTE_PROBE_ONLY=YES — route registration (V11a) was verified; handler execution and the configured cap were NOT. A route can be registered and still throw on every request (Round 2). Record this caveat in the deployment log."
else
  cf_bad "V11b/c handler execution NOT verified — set PROBE_EMAIL/PROBE_PASS (disposable cf_test_* user), or ACCEPT_ROUTE_PROBE_ONLY=YES to proceed with the caveat recorded"
fi

# V11d: the hook's own boot line. It is emitted at registration time to the
# server console, NOT to the logs API — verified on v0.39.8, where /api/logs
# holds request logs only and never the boot line. So it can only be read from
# wherever the process writes stdout (`docker logs <container>` on the NAS).
# Optional, and never the primary evidence: V11b/V11c prove more than it does.
if [ -n "${PB_LOG_FILE:-}" ] && [ -r "${PB_LOG_FILE:-}" ]; then
  LINE=$(grep -a 'CF CAS hook loaded' "$PB_LOG_FILE" | tail -1)
  if [ -n "$LINE" ]; then cf_ok "V11d boot line found in $PB_LOG_FILE: $LINE"
  else cf_bad "V11d no \"CF CAS hook loaded\" line in $PB_LOG_FILE" "$(tail -3 "$PB_LOG_FILE")"; fi
else
  echo "SKIP  V11d boot line — set PB_LOG_FILE to the server console log (e.g. \`docker logs pocketbase > /tmp/pb.log\`). Not in /api/logs on v0.39.8."
fi

# ---- V12 migration ledger (local data dir only) -----------------------------
if [ -n "${PB_DATA_DIR:-}" ]; then
  APPLIED=$(python3 - "$PB_DATA_DIR" <<'PY'
import sqlite3, sys
try:
    c = sqlite3.connect("file:" + sys.argv[1] + "/data.db?mode=ro", uri=True)
    rows = [r[0] for r in c.execute("select file from _migrations where file like '%cf_cas%'")]
    print(rows[0] if rows else "<absent>")
except Exception as e:
    print("<error:%s>" % type(e).__name__)
PY
)
  case "$APPLIED" in
    *cf_cas*) cf_ok "V12 migration recorded in _migrations: $APPLIED";;
    *) cf_bad "V12 no cf_cas row in _migrations — the migration never applied" "$APPLIED";;
  esac
else
  echo "SKIP  V12 _migrations ledger — set PB_DATA_DIR to check it (schema checks above already cover the outcome)"
fi

# ---- V13 binary version -----------------------------------------------------
if [ -n "${PB_BIN:-}" ]; then
  VER=$("$PB_BIN" --version 2>&1 | head -1)
  cf_ok "V13 binary version: $VER"
else
  echo "SKIP  V13 binary version — set PB_BIN to record it"
fi

# ---- V14 lockdown rules (only at step 7, not at first deploy) ---------------
if [ "${EXPECT_LOCKDOWN:-}" = "YES" ]; then
  ST=$(col_fetch appdata)
  if [ "$ST" = "200" ]; then
    cf_eq "V14a appdata createRule locked (route-only creates)" "None" "$(col_q 'c.get("createRule")')"
    cf_eq "V14b appdata updateRule blocks all four snapshot/revision fields" "4" \
      "$(col_q 'sum(1 for f in ["data","training","coreRev","trainingRev"] if "@request.body.%s:isset = false"%f in (c.get("updateRule") or ""))')" \
      "$(col_q 'c.get("updateRule")')"
    cf_eq "V14c appdata updateRule still scopes to the owner" "True" \
      "$(col_q '"user = @request.auth.id" in (c.get("updateRule") or "")')"
  fi
  # CF_MIN_CLIENT_BUILD is a hook constant, not schema — the only way to know it
  # was actually set is to be refused for being too old. Rejected before the
  # transaction, so this writes nothing.
  if [ -n "$UTOK" ]; then
    # expectedRev = 2^31-1 again: if CF_MIN_CLIENT_BUILD was NOT set, the stale
    # build passes validation and the request would otherwise reach the commit
    # path. It instead stops at the revision check (409) and this assertion
    # fails, which is the correct outcome — never a write.
    F=$(cf_commit_body core 2147483647 "verify-minbuild-never-stored" '{}' "0000-00-00.000")
    cf_req POST /api/cf/appdata/commit "$UTOK" "$F"
    cf_assert_error "V14d stale clientBuild is refused with 426 (CF_MIN_CLIENT_BUILD is set)" 426 "update-required"
  else
    cf_bad "V14d cannot verify CF_MIN_CLIENT_BUILD without PROBE_EMAIL/PROBE_PASS — lockdown is unverified"
  fi
else
  echo "SKIP  V14 lockdown rules — set EXPECT_LOCKDOWN=YES when verifying after step 7"
fi

echo ""
if cf_summary "verify-deployment"; then
  echo "RESULT: VERIFIED — the CAS kit is correctly deployed at $BASE"
  exit 0
else
  echo "RESULT: NOT VERIFIED — do NOT proceed with the cutover. Roll back per DEPLOYMENT.md step 0."
  exit 1
fi
