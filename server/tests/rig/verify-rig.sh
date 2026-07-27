#!/usr/bin/env bash
# Compound Fitness — self-checking rig for `verify-deployment.sh`.
#
# The deployment gate is only worth as much as the evidence that it FAILS when
# it should. This rig builds throwaway PocketBase instances in six known states
# and asserts the verifier's verdict on each — including the states that matter
# most: a migration PocketBase refused while still exiting 0, and a deploy where
# the schema landed but the hook did not.
#
# Everything here is loopback-only, synthetic-data-only, and self-contained: it
# builds its own production-shaped schema (including production's Admin-UI index
# name `idx_88qok6ts7v`) rather than needing a copy of real data.
#
# Usage:
#   PB_BIN=/path/to/pocketbase bash verify-rig.sh [evidence-dir]
#
# Optional: WORK=<dir> (default: a mktemp dir, removed on exit), PORT=<n>.
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$DIR/../../.." && pwd)"
PB_BIN="${PB_BIN:?set PB_BIN (path to a pocketbase v0.39.8 binary)}"
EV="${1:-$DIR/evidence}"; mkdir -p "$EV"
PORT="${PORT:-8093}"
KEEP_WORK=1
if [ -z "${WORK:-}" ]; then WORK=$(mktemp -d); KEEP_WORK=0; fi
mkdir -p "$WORK"
trap '[ "$KEEP_WORK" = "0" ] && rm -rf "$WORK"' EXIT

BASE="http://127.0.0.1:$PORT"
ADMIN_EMAIL="rig@staging.invalid"; ADMIN_PASS="rig-password-12345"
PROBE_EMAIL="cf_test_1@staging.invalid"; PROBE_PASS="probe-password-12345"

PASS=0; FAIL=0; FAILED=""
ok()  { PASS=$((PASS+1)); printf 'PASS  %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); FAILED="$FAILED
  - $1"; printf 'FAIL  %s\n' "$1"; }
eq()  { if [ "$2" = "$3" ]; then ok "$1 ($3)"; else bad "$1 — expected [$2], got [$3]"; fi; }

api() { curl -sS --max-time 30 "$@"; }
admin_token() {
  api "$BASE/api/collections/_superusers/auth-with-password" -H 'Content-Type: application/json' \
    -d "{\"identity\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" \
    | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))'
}
wait_up()   { for _ in $(seq 1 60); do curl -sf "$BASE/api/health" >/dev/null 2>&1 && return 0; sleep 0.2; done; return 1; }
wait_down() { for _ in $(seq 1 40); do curl -sf "$BASE/api/health" >/dev/null 2>&1 || return 0; sleep 0.2; done; return 1; }

# ---- build a pristine, production-shaped pb_data ----------------------------
build_pristine() {
  echo "== building pristine (production-shaped schema, CAS migration NOT applied) =="
  rm -rf "$WORK/boot" "$WORK/empty_hooks" "$WORK/empty_migrations"
  mkdir -p "$WORK/boot" "$WORK/empty_hooks" "$WORK/empty_migrations"
  "$PB_BIN" superuser upsert "$ADMIN_EMAIL" "$ADMIN_PASS" --dir="$WORK/boot" >/dev/null 2>&1 \
    || { echo "FATAL: superuser create failed"; exit 1; }
  "$PB_BIN" serve --http=127.0.0.1:$PORT --dir="$WORK/boot" \
    --hooksDir="$WORK/empty_hooks" --migrationsDir="$WORK/empty_migrations" > "$WORK/boot.log" 2>&1 &
  local pid=$!
  wait_up || { echo "FATAL: pristine instance did not start"; cat "$WORK/boot.log"; kill $pid; exit 1; }
  local tok users_id st
  tok=$(admin_token)
  [ -n "$tok" ] || { echo "FATAL: admin auth failed"; kill $pid; exit 1; }
  users_id=$(api "$BASE/api/collections/users" -H "Authorization: $tok" \
    | python3 -c 'import sys,json;print(json.load(sys.stdin).get("id",""))')
  cat > "$WORK/appdata.json" <<JSON
{ "name": "appdata", "type": "base",
  "listRule": "user = @request.auth.id", "viewRule": "user = @request.auth.id",
  "createRule": "user = @request.auth.id", "updateRule": "user = @request.auth.id", "deleteRule": null,
  "fields": [
    {"type":"relation","name":"user","required":true,"cascadeDelete":true,"collectionId":"$users_id","maxSelect":1},
    {"type":"json","name":"data","maxSize":5000000},
    {"type":"json","name":"training","maxSize":5000000},
    {"type":"json","name":"health","maxSize":5000000},
    {"type":"json","name":"coachreq","maxSize":2000000},
    {"type":"autodate","name":"created","onCreate":true},
    {"type":"autodate","name":"updated","onCreate":true,"onUpdate":true}
  ],
  "indexes": ["CREATE UNIQUE INDEX \`idx_88qok6ts7v\` ON \`appdata\` (\`user\`)"] }
JSON
  st=$(curl -sS -o "$WORK/appdata.out" -w '%{http_code}' -X POST "$BASE/api/collections" \
    -H "Authorization: $tok" -H 'Content-Type: application/json' --data-binary "@$WORK/appdata.json")
  [ "$st" = "200" ] || { echo "FATAL: appdata create -> $st"; cat "$WORK/appdata.out"; kill $pid; exit 1; }
  kill $pid 2>/dev/null; wait $pid 2>/dev/null; wait_down
  cp -a "$WORK/boot" "$WORK/pristine"
  echo "   pristine ready: $(python3 -c "
import sqlite3,json
c=sqlite3.connect('$WORK/pristine/data.db')
print([r[0] for r in c.execute(\"select name from _collections where name in ('users','appdata')\")],
      json.loads(c.execute(\"select indexes from _collections where name='appdata'\").fetchone()[0]))")"
}

# ---- scenario runner --------------------------------------------------------
# start_instance <datadir> <hooksdir> <migrationsdir> <logfile>  -> sets $PBPID
start_instance() {
  "$PB_BIN" serve --http=127.0.0.1:$PORT --dir="$1" --hooksDir="$2" --migrationsDir="$3" > "$4" 2>&1 &
  PBPID=$!
}
stop_instance() { kill "${PBPID:-0}" 2>/dev/null; wait "${PBPID:-0}" 2>/dev/null; wait_down; }

make_probe_user() {
  local tok; tok=$(admin_token)
  api -o /dev/null -X POST "$BASE/api/collections/users/records" -H "Authorization: $tok" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$PROBE_EMAIL\",\"password\":\"$PROBE_PASS\",\"passwordConfirm\":\"$PROBE_PASS\"}" >/dev/null
}

# assert the verifier wrote nothing — read the file, do not ask the server
assert_no_writes() { # datadir label
  local out
  out=$(python3 -c "
import sqlite3
c=sqlite3.connect('file:$1/data.db?mode=ro',uri=True)
rows=list(c.execute('select id,user,coreRev,trainingRev from appdata'))
try: led=c.execute('select count(*) from cf_commit_log').fetchone()[0]
except Exception: led='n/a'
print('appdata=%d ledger=%s' % (len(rows), led))")
  case "$out" in
    "appdata=0 ledger=0"|"appdata=0 ledger=n/a") ok "$2 — verifier wrote nothing ($out)";;
    *) bad "$2 — THE VERIFIER WROTE TO THE DATABASE ($out)";;
  esac
}

run_verifier() { # logfile [extra env assignments...]
  local log="$1"; shift
  env BASE="$BASE" ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASS="$ADMIN_PASS" "$@" \
    bash "$REPO/server/tests/verify-deployment.sh" > "$log" 2>&1
  echo $?
}

prep() { # scenario -> prints the data dir, sets up $WORK/hooks and $WORK/migs
  local s="$1" d="$WORK/run"
  rm -rf "$d" "$WORK/hooks" "$WORK/migs"; mkdir -p "$WORK/hooks" "$WORK/migs"
  cp -a "$WORK/pristine" "$d"; chmod -R u+rwX "$d"
  case "$s" in
    unmigrated) ;;
    nohook)   cp "$REPO/server/pb_migrations/"*.js "$WORK/migs/";;
    migrated|lockdown)
      cp "$REPO/server/pb_hooks/"*.js "$WORK/hooks/"
      cp "$REPO/server/pb_migrations/"*.js "$WORK/migs/";;
    refused)
      # a production that never had a unique index on (user) — otherwise these
      # rows could not exist. The migration must refuse them.
      python3 - "$d" <<'PY'
import sqlite3, sys
c = sqlite3.connect(sys.argv[1] + "/data.db")
for (n,) in c.execute("select name from sqlite_master where type='index' and tbl_name='appdata' and name not like 'sqlite_%'"):
    c.execute('DROP INDEX IF EXISTS "%s"' % n)
c.execute("update _collections set indexes='[]' where name='appdata'")
for rid in ("dupaaaaaaaaaaaa1", "dupaaaaaaaaaaaa2"):
    c.execute("insert into appdata (id,user,data,training,created,updated) "
              "values (?,?,'{}','{}',datetime('now'),datetime('now'))", (rid, "dupuser000000001"))
c.commit()
PY
      cp "$REPO/server/pb_hooks/"*.js "$WORK/hooks/"
      cp "$REPO/server/pb_migrations/"*.js "$WORK/migs/";;
  esac
  if [ "$s" = "lockdown" ]; then
    sed -i 's/^const MIN_CLIENT_BUILD    = "";/const MIN_CLIENT_BUILD    = "2026-07-27.342";/' \
      "$WORK/hooks/cf_cas_shared.js"
  fi
  printf '%s' "$d"
}

# =============================================================================
build_pristine
echo ""

# ---- S1: nothing applied ----------------------------------------------------
echo "== S1: neither migration nor hook applied =="
D=$(prep unmigrated); start_instance "$D" "$WORK/hooks" "$WORK/migs" "$WORK/s1.serve.log"; wait_up
RC=$(run_verifier "$EV/s1-unmigrated.log" ACCEPT_ROUTE_PROBE_ONLY=YES)
eq "S1 verifier refuses an unmigrated instance" 1 "$RC"
grep -q 'RESULT: NOT VERIFIED' "$EV/s1-unmigrated.log" && ok "S1 verdict line is NOT VERIFIED" || bad "S1 missing NOT VERIFIED verdict"
stop_instance

# ---- S2: schema applied, hook missing (the dangerous partial deploy) --------
echo "== S2: migration applied but the hook is MISSING =="
D=$(prep nohook); start_instance "$D" "$WORK/hooks" "$WORK/migs" "$WORK/s2.serve.log"; wait_up
make_probe_user
RC=$(run_verifier "$EV/s2-hook-missing.log" PROBE_EMAIL="$PROBE_EMAIL" PROBE_PASS="$PROBE_PASS")
eq "S2 verifier refuses a schema-only deploy" 1 "$RC"
grep -q 'V11a commit route is ABSENT' "$EV/s2-hook-missing.log" && ok "S2 identified the absent route" || bad "S2 did not identify the absent route"
grep -q 'V2a appdata.coreRev exists (number)' "$EV/s2-hook-missing.log" && ok "S2 schema checks still passed — the failure is specific, not blanket" || bad "S2 schema checks did not pass"
stop_instance

# ---- S3: migration REFUSED, PocketBase still exits 0 ------------------------
echo "== S3: duplicate rows — migration refused, exit code still 0 =="
D=$(prep refused)
"$PB_BIN" serve --http=127.0.0.1:$PORT --dir="$D" --hooksDir="$WORK/hooks" --migrationsDir="$WORK/migs" \
  > "$EV/s3-serve-exit-code.log" 2>&1
SERVE_RC=$?
eq "S3 HAZARD: \`serve\` exits 0 despite refusing the migration" 0 "$SERVE_RC"
grep -q 'failed to apply migration' "$EV/s3-serve-exit-code.log" \
  && ok "S3 the refusal appears only in the log output" || bad "S3 no refusal message in the log"
grep -q 'CF CAS hook loaded' "$EV/s3-serve-exit-code.log" \
  && ok "S3 the hook boot line is printed BEFORE the failure — it proves nothing" || bad "S3 no boot line"
"$PB_BIN" migrate up --dir="$D" --migrationsDir="$WORK/migs" > "$EV/s3-migrate-exit-code.log" 2>&1
eq "S3 HAZARD: \`migrate up\` exits 0 too" 0 "$?"
python3 -c "
import sqlite3
c=sqlite3.connect('file:$D/data.db?mode=ro',uri=True)
cols=[r[1] for r in c.execute('PRAGMA table_info(appdata)')]
print('coreRev' in cols)" | grep -q False \
  && ok "S3 nothing was applied when it refused" || bad "S3 a refused migration applied something"
# the server never came up, so the verifier's very first check catches it
RC=$(run_verifier "$EV/s3-verifier.log" ACCEPT_ROUTE_PROBE_ONLY=YES)
eq "S3 verifier catches the refused migration" 1 "$RC"
grep -q 'ABORT: the instance did not answer /api/health' "$EV/s3-verifier.log" \
  && ok "S3 verifier aborts before making any other claim" || bad "S3 verifier did not abort at V0"

# ---- S4: correct deploy, pre-lockdown ---------------------------------------
echo "== S4: correctly deployed (pre-lockdown) =="
D=$(prep migrated); start_instance "$D" "$WORK/hooks" "$WORK/migs" "$WORK/s4.serve.log"; wait_up
make_probe_user
RC=$(run_verifier "$EV/s4-verified.log" PROBE_EMAIL="$PROBE_EMAIL" PROBE_PASS="$PROBE_PASS" PB_DATA_DIR="$D" PB_BIN="$PB_BIN" PB_LOG_FILE="$WORK/s4.serve.log")
eq "S4 verifier accepts a correct deployment" 0 "$RC"
grep -q 'RESULT: VERIFIED' "$EV/s4-verified.log" && ok "S4 verdict line is VERIFIED" || bad "S4 missing VERIFIED verdict"
grep -q 'V11c configured payload cap is 256 KiB (262144)' "$EV/s4-verified.log" \
  && ok "S4 the configured cap was observed, not assumed" || bad "S4 cap not observed"
stop_instance
assert_no_writes "$D" "S4"

# ---- S5: negative control — lockdown expected but not applied ---------------
echo "== S5: negative control — EXPECT_LOCKDOWN against a NON-locked-down instance =="
D=$(prep migrated); start_instance "$D" "$WORK/hooks" "$WORK/migs" "$WORK/s5.serve.log"; wait_up
make_probe_user
RC=$(run_verifier "$EV/s5-lockdown-negative.log" PROBE_EMAIL="$PROBE_EMAIL" PROBE_PASS="$PROBE_PASS" EXPECT_LOCKDOWN=YES)
eq "S5 lockdown checks are not vacuous" 1 "$RC"
grep -q 'V14d stale clientBuild is refused with 426' "$EV/s5-lockdown-negative.log" \
  && ok "S5 V14d failed as it must when CF_MIN_CLIENT_BUILD is unset" || bad "S5 V14d did not report"
grep -q 'got status 409' "$EV/s5-lockdown-negative.log" \
  && ok "S5 the failing probe stopped at the revision check — no write path reached" || bad "S5 unexpected V14d failure mode"
stop_instance
assert_no_writes "$D" "S5"

# ---- S6: correct deploy, locked down ----------------------------------------
echo "== S6: correctly deployed AND locked down (step 7) =="
D=$(prep lockdown); start_instance "$D" "$WORK/hooks" "$WORK/migs" "$WORK/s6.serve.log"; wait_up
make_probe_user
ATOK=$(admin_token)
cat > "$WORK/lockrules.json" <<'JSON'
{"createRule": null,
 "updateRule": "user = @request.auth.id && @request.body.data:isset = false && @request.body.training:isset = false && @request.body.coreRev:isset = false && @request.body.trainingRev:isset = false"}
JSON
ST=$(curl -sS -o "$WORK/lockrules.out" -w '%{http_code}' -X PATCH "$BASE/api/collections/appdata" \
  -H "Authorization: $ATOK" -H 'Content-Type: application/json' --data-binary "@$WORK/lockrules.json")
eq "S6 lockdown rules applied" 200 "$ST"
RC=$(run_verifier "$EV/s6-lockdown-verified.log" PROBE_EMAIL="$PROBE_EMAIL" PROBE_PASS="$PROBE_PASS" EXPECT_LOCKDOWN=YES PB_DATA_DIR="$D" PB_BIN="$PB_BIN" PB_LOG_FILE="$WORK/s6.serve.log")
eq "S6 verifier accepts a locked-down deployment" 0 "$RC"
grep -q 'V14d stale clientBuild is refused with 426 (CF_MIN_CLIENT_BUILD is set) (status 426' "$EV/s6-lockdown-verified.log" \
  && ok "S6 a stale client really is refused 426" || bad "S6 426 not observed"
grep -q 'V12 migration recorded in _migrations' "$EV/s6-lockdown-verified.log" \
  && ok "S6 migration ledger row confirmed" || bad "S6 migration ledger not confirmed"
stop_instance
assert_no_writes "$D" "S6"

# =============================================================================
printf '\n---- verify-rig: %d passed, %d failed ----\n' "$PASS" "$FAIL"
[ "$FAIL" != "0" ] && printf 'failed:%s\n' "$FAILED"
echo "evidence written to $EV"
[ "$FAIL" = "0" ]
