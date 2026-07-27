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
RC=$(run_verifier "$EV/s1-unmigrated.log" ACCEPT_ROUTE_PROBE_ONLY=YES ACCEPT_NO_SENTINEL=YES)
eq "S1 verifier refuses an unmigrated instance" 1 "$RC"
grep -q 'RESULT: NOT VERIFIED' "$EV/s1-unmigrated.log" && ok "S1 verdict line is NOT VERIFIED" || bad "S1 missing NOT VERIFIED verdict"
stop_instance

# ---- S2: schema applied, hook missing (the dangerous partial deploy) --------
echo "== S2: migration applied but the hook is MISSING =="
D=$(prep nohook); start_instance "$D" "$WORK/hooks" "$WORK/migs" "$WORK/s2.serve.log"; wait_up
make_probe_user
RC=$(run_verifier "$EV/s2-hook-missing.log" PROBE_EMAIL="$PROBE_EMAIL" PROBE_PASS="$PROBE_PASS" ACCEPT_NO_SENTINEL=YES)
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
RC=$(run_verifier "$EV/s3-verifier.log" ACCEPT_ROUTE_PROBE_ONLY=YES ACCEPT_NO_SENTINEL=YES)
eq "S3 verifier catches the refused migration" 1 "$RC"
grep -q 'ABORT: the instance did not answer /api/health' "$EV/s3-verifier.log" \
  && ok "S3 verifier aborts before making any other claim" || bad "S3 verifier did not abort at V0"

# ---- S4: correct deploy, pre-lockdown ---------------------------------------
echo "== S4: correctly deployed (pre-lockdown) =="
D=$(prep migrated); start_instance "$D" "$WORK/hooks" "$WORK/migs" "$WORK/s4.serve.log"; wait_up
make_probe_user
RC=$(run_verifier "$EV/s4-verified.log" PROBE_EMAIL="$PROBE_EMAIL" PROBE_PASS="$PROBE_PASS" PB_DATA_DIR="$D" PB_BIN="$PB_BIN" PB_LOG_FILE="$WORK/s4.serve.log" ACCEPT_NO_SENTINEL=YES)
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
RC=$(run_verifier "$EV/s5-lockdown-negative.log" PROBE_EMAIL="$PROBE_EMAIL" PROBE_PASS="$PROBE_PASS" EXPECT_LOCKDOWN=YES ACCEPT_NO_SENTINEL=YES)
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
RC=$(run_verifier "$EV/s6-lockdown-verified.log" PROBE_EMAIL="$PROBE_EMAIL" PROBE_PASS="$PROBE_PASS" EXPECT_LOCKDOWN=YES PB_DATA_DIR="$D" PB_BIN="$PB_BIN" PB_LOG_FILE="$WORK/s6.serve.log" ACCEPT_NO_SENTINEL=YES)
eq "S6 verifier accepts a locked-down deployment" 0 "$RC"
grep -q 'V14d stale clientBuild is refused with 426 (CF_MIN_CLIENT_BUILD is set) (status 426' "$EV/s6-lockdown-verified.log" \
  && ok "S6 a stale client really is refused 426" || bad "S6 426 not observed"
grep -q 'V12 migration recorded in _migrations' "$EV/s6-lockdown-verified.log" \
  && ok "S6 migration ledger row confirmed" || bad "S6 migration ledger not confirmed"
stop_instance
assert_no_writes "$D" "S6"

# ---- V15 integrity sentinel -------------------------------------------------
# The scenarios above never look at anyone's rows. These do: they seed two
# athlete-shaped rows on an UNMIGRATED instance, capture the baseline exactly as
# runbook P0 does, then deploy for real and verify. `mutate` is applied to the
# sqlite file while the server is stopped, so the change is invisible to the
# hooks — which is the point: V15 must catch a payload that changed without
# anything on the write path being involved.
seed_rows() { # two rows with athlete-shaped payloads, via the API
  local tok uid
  tok=$(admin_token)
  for n in 1 2; do
    uid=$(api -X POST "$BASE/api/collections/users/records" -H "Authorization: $tok" \
      -H 'Content-Type: application/json' \
      -d "{\"email\":\"cf_seed_$n@staging.invalid\",\"password\":\"seed-password-12345\",\"passwordConfirm\":\"seed-password-12345\"}" \
      | python3 -c 'import sys,json;print(json.load(sys.stdin).get("id",""))')
    api -o /dev/null -X POST "$BASE/api/collections/appdata/records" -H "Authorization: $tok" \
      -H 'Content-Type: application/json' \
      -d "{\"user\":\"$uid\",\"data\":{\"weights\":[{\"date\":\"2026-07-0$n\",\"kg\":8$n.5}],\"note\":\"seed $n\"},\"training\":{\"sessions\":[{\"day\":$n}]}}" >/dev/null
  done
}
sentinel_scenario() { # label mutate-mode expect-rc expect-grep [nohash]
  local label="$1" mutate="$2" want_rc="$3" want_grep="$4" hashmode="${5:-hash}"
  local D base_file="$WORK/$label.sentinel.json"
  D=$(prep unmigrated); start_instance "$D" "$WORK/hooks" "$WORK/migs" "$WORK/$label.pre.log"; wait_up
  seed_rows
  local caprc
  if [ "$hashmode" = "nohash" ]; then
    caprc=$(run_verifier "$EV/$label-capture.log" SENTINEL_CAPTURE="$base_file" SENTINEL_NO_HASH=YES)
  else
    caprc=$(run_verifier "$EV/$label-capture.log" SENTINEL_CAPTURE="$base_file")
  fi
  eq "$label baseline captured before deployment" 0 "$caprc"
  grep -q 'coreRev=0 trainingRev=0' "$EV/$label-capture.log" \
    && ok "$label pre-migration rows have no revisions — recorded as 0" \
    || bad "$label baseline did not normalize the absent revision fields"
  stop_instance

  case "$mutate" in
    none) ;;
    grow) python3 - "$D" <<'PY'
import sqlite3, sys, json
c = sqlite3.connect(sys.argv[1] + "/data.db")
rid, raw = c.execute("select id,data from appdata order by id limit 1").fetchone()
d = json.loads(raw); d["note"] = d.get("note", "") + " EXTRA"
c.execute("update appdata set data=? where id=?", (json.dumps(d), rid)); c.commit()
print("mutated (longer):", rid)
PY
      ;;
    samelen) python3 - "$D" <<'PY'
import sqlite3, sys, json
c = sqlite3.connect(sys.argv[1] + "/data.db")
rid, raw = c.execute("select id,data from appdata order by id limit 1").fetchone()
d = json.loads(raw)
# same number of bytes, different content: 81.5 -> 91.5
d["weights"][0]["kg"] = float(str(d["weights"][0]["kg"]).replace("8", "9", 1))
new = json.dumps(d)
assert len(new.encode()) == len(json.dumps(json.loads(raw)).encode()), "not the same length"
c.execute("update appdata set data=? where id=?", (new, rid)); c.commit()
print("mutated (identical length):", rid)
PY
      ;;
  esac

  # now deploy for real: migration + hook against the same data directory
  cp "$REPO/server/pb_hooks/"*.js "$WORK/hooks/"
  cp "$REPO/server/pb_migrations/"*.js "$WORK/migs/"
  start_instance "$D" "$WORK/hooks" "$WORK/migs" "$WORK/$label.post.log"; wait_up
  make_probe_user
  local rc
  if [ "$hashmode" = "nohash" ]; then
    rc=$(run_verifier "$EV/$label-verify.log" SENTINEL_VERIFY="$base_file" ACCEPT_NO_HASH=YES \
           PROBE_EMAIL="$PROBE_EMAIL" PROBE_PASS="$PROBE_PASS")
  else
    rc=$(run_verifier "$EV/$label-verify.log" SENTINEL_VERIFY="$base_file" \
           PROBE_EMAIL="$PROBE_EMAIL" PROBE_PASS="$PROBE_PASS")
  fi
  SENTINEL_BASE_FILE="$base_file"
  eq "$label verifier verdict after deployment" "$want_rc" "$rc"
  grep -q "$want_grep" "$EV/$label-verify.log" \
    && ok "$label reported: $want_grep" || bad "$label expected output matching: $want_grep"
  stop_instance
  # NOT printed to stdout: capturing this function with $( ) would run it in a
  # subshell, discarding every assertion it made and its pass/fail counts.
  SENTINEL_DIR="$D"
}

echo "== S7: sentinel round-trip across a REAL deployment, rows untouched =="
sentinel_scenario s7-sentinel-clean none 0 'V15 existing appdata rows are byte-for-byte unchanged'
grep -q 'V15 INTEGRITY SENTINEL: all 2 existing row(s) unchanged' "$EV/s7-sentinel-clean-verify.log" \
  && ok "S7 both seeded rows survived the migration unchanged" || bad "S7 sentinel did not confirm both rows"

echo "== S8: a payload changed during the window — V15 must catch it =="
sentinel_scenario s8-sentinel-tamper grow 1 'V15 EXISTING APPDATA CHANGED ACROSS THE DEPLOYMENT'
grep -q 'dataBytes changed' "$EV/s8-sentinel-tamper-verify.log" \
  && ok "S8 named the field that changed" || bad "S8 did not name the changed field"
grep -q 'RESULT: NOT VERIFIED' "$EV/s8-sentinel-tamper-verify.log" \
  && ok "S8 the run refuses the cutover" || bad "S8 did not refuse the cutover"

echo "== S9: LIMITATION — a same-length change is invisible to byte length alone =="
sentinel_scenario s9-sentinel-samelen samelen 0 'V15 existing appdata rows are byte-for-byte unchanged' nohash
ok "S9 DOCUMENTED LIMITATION: with SENTINEL_NO_HASH=YES, a mutation preserving byte length PASSES the six required values"
echo "== S9b: the DEFAULT hash mode catches the same mutation =="
sentinel_scenario s9b-sentinel-hash samelen 1 'V15 EXISTING APPDATA CHANGED ACROSS THE DEPLOYMENT'
grep -q 'dataHash changed' "$EV/s9b-sentinel-hash-verify.log" \
  && ok "S9b the default hash mode detects what byte length cannot" || bad "S9b hash did not detect the mutation"

# ---- S10: the two security hardenings ---------------------------------------
# Required by the Product Architect, 2026-07-27: no credentials in process
# arguments, and a sentinel baseline that is created safely and destroyed
# verifiably.
echo "== S10: credential exposure and sentinel file safety =="

# S10a is a static check by design: sampling `ps` during a request is racy, and
# what matters is that no code path can put a token on a command line at all.
LEAKS=$(grep -rn -- '-H "Authorization: \$' "$REPO/server/tests"/*.sh "$REPO/server/tests"/*.py 2>/dev/null | wc -l)
eq "S10a no script passes a token via a curl command-line header" 0 "$LEAKS"
PYLEAKS=$(grep -rn '_sentinel.py[^|]*\$ATOK' "$REPO/server/tests"/*.sh 2>/dev/null | wc -l)
eq "S10b no script passes the token to _sentinel.py as an argument" 0 "$PYLEAKS"
# credential-specific: cf_commit_body legitimately passes subsystem/rev/key
# through argv, and those are not secrets
PWLEAKS=$(grep -rln 'password.*sys\.argv\|sys\.argv.*password' "$REPO/server/tests"/*.sh "$REPO/server/tests"/*.py 2>/dev/null | wc -l)
eq "S10c no password reaches python through argv" 0 "$PWLEAKS"

# S10d: the baseline written by the last sentinel scenario is owner-only.
if [ -n "${SENTINEL_BASE_FILE:-}" ] && [ -f "$SENTINEL_BASE_FILE" ]; then
  eq "S10d baseline permissions are 0600" "600" "$(stat -c '%a' "$SENTINEL_BASE_FILE")"
  eq "S10e baseline is owned by this user" "$(id -u)" "$(stat -c '%u' "$SENTINEL_BASE_FILE")"
  grep -q '"withHash": true' "$SENTINEL_BASE_FILE" \
    && ok "S10f hash mode is the default at capture" || bad "S10f baseline was captured without hashes by default"
  python3 -c "
import json,sys
d=json.load(open(sys.argv[1]))
bad=[k for r in d['rows'] for k in r if k in ('data','training')]
print('LEAK' if bad else 'clean')" "$SENTINEL_BASE_FILE" | grep -q clean \
    && ok "S10g baseline contains no payload fields — only the recorded scalars" \
    || bad "S10g THE BASELINE CONTAINS PAYLOAD DATA"
else
  bad "S10d-g no baseline file to inspect"
fi

# S10h: capture refuses to write through a symlink.
SYMTARGET="$WORK/symlink-target.json"; SYMLINK="$WORK/evil.sentinel.json"
rm -f "$SYMTARGET" "$SYMLINK"; : > "$SYMTARGET"; ln -s "$SYMTARGET" "$SYMLINK"
SYMOUT=$(printf 'not-a-real-token\n' | python3 -c "
import sys, os
sys.path.insert(0, os.path.join('$REPO', 'server/tests'))
import importlib.util
spec = importlib.util.spec_from_file_location('s', os.path.join('$REPO','server/tests/_sentinel.py'))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
try:
    m.secure_write('$SYMLINK', {'rows': []})
    print('WROTE THROUGH SYMLINK')
except RuntimeError as e:
    print('refused:', e)" 2>&1)
case "$SYMOUT" in
  refused*symlink*) ok "S10h capture refuses to write through a symlink";;
  *) bad "S10h symlink not refused: $SYMOUT";;
esac
[ -s "$SYMTARGET" ] && bad "S10i the symlink target was written to" || ok "S10i the symlink target is untouched"

# S10j: destroy removes the baseline and confirms absence.
if [ -n "${SENTINEL_BASE_FILE:-}" ] && [ -f "$SENTINEL_BASE_FILE" ]; then
  DOUT=$(python3 "$REPO/server/tests/_sentinel.py" destroy "$SENTINEL_BASE_FILE" 2>&1)
  case "$DOUT" in
    *"deleted and absence confirmed"*) ok "S10j destroy deletes the baseline and confirms absence";;
    *) bad "S10j destroy did not confirm absence: $DOUT";;
  esac
  [ -e "$SENTINEL_BASE_FILE" ] && bad "S10k the baseline still exists after destroy" \
    || ok "S10k the baseline is really gone"
fi

# S10l: a hashless baseline is refused unless explicitly waived.
grep -q 'V15 the baseline was captured WITHOUT content hashes' "$EV/s9-sentinel-samelen-verify.log" \
  && bad "S10l the nohash run should have been waived by ACCEPT_NO_HASH, not refused" \
  || ok "S10l ACCEPT_NO_HASH=YES waives the hash requirement (and only then)"
# needs a live instance — every scenario above stopped its own
D=$(prep migrated); start_instance "$D" "$WORK/hooks" "$WORK/migs" "$WORK/s10.serve.log"; wait_up
run_verifier "$EV/s10-hashless-refused.log" \
  SENTINEL_VERIFY="$WORK/s9-sentinel-samelen.sentinel.json" ACCEPT_ROUTE_PROBE_ONLY=YES >/dev/null
stop_instance
grep -q 'V15 the baseline was captured WITHOUT content hashes' "$EV/s10-hashless-refused.log" \
  && ok "S10m without the waiver, a hashless baseline is refused" \
  || bad "S10m a hashless baseline was accepted without ACCEPT_NO_HASH"

# =============================================================================
printf '\n---- verify-rig: %d passed, %d failed ----\n' "$PASS" "$FAIL"
[ "$FAIL" != "0" ] && printf 'failed:%s\n' "$FAILED"
echo "evidence written to $EV"
[ "$FAIL" = "0" ]
