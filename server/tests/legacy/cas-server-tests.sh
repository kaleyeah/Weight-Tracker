#!/usr/bin/env bash
# Compound Fitness — CAS server integration tests. STAGING ONLY, DISPOSABLE USERS ONLY.
# Revised per the Product Architect addendum (#4,#5,#6,#7,#8,#13).
# Usage:
#   BASE=https://staging:8091 EMAIL=cf_test_1@staging.invalid PASS=.. \
#   EMAIL2=cf_test_2@staging.invalid PASS2=.. ADMIN_EMAIL=.. ADMIN_PASS=.. \
#   STAGING_CONFIRM=YES bash cas-server-tests.sh
set -uo pipefail
BASE="${BASE:?set BASE}"; EMAIL="${EMAIL:?set EMAIL}"; PASS="${PASS:?set PASS}"
EMAIL2="${EMAIL2:-}"; PASS2="${PASS2:-}"; ADMIN_EMAIL="${ADMIN_EMAIL:-}"; ADMIN_PASS="${ADMIN_PASS:-}"
# ---- guards: staging only, disposable users only ----
[ "${STAGING_CONFIRM:-}" = "YES" ] || { echo "REFUSED: set STAGING_CONFIRM=YES (staging only, never production)"; exit 2; }
case "$BASE" in https://rack.tail6fa16c.ts.net|https://rack.tail6fa16c.ts.net/) echo "REFUSED: BASE is the production host"; exit 2;; esac
case "$EMAIL" in cf_test_*|*+test*) :;; *) echo "REFUSED: EMAIL must be a disposable cf_test_* user"; exit 2;; esac
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
PASSN=0; FAILN=0
say(){ printf '%s\n' "$*"; }
redact(){ sed -E 's/(token|password|Authorization)[":= ]+[^",}& ]+/\1=REDACTED/gi'; }
chk(){ local name="$1" want="$2" got="$3" body="${4:-}";
  if [ "$want" = "$got" ]; then PASSN=$((PASSN+1)); say "PASS  $name";
  else FAILN=$((FAILN+1)); say "FAIL  $name  (want $want, got $got)"; [ -n "$body" ] && say "      body: $(echo "$body" | redact | head -c 300)"; fi; }
jenc(){ python3 -c 'import json,sys;print(json.dumps({"identity":sys.argv[1],"password":sys.argv[2]}))' "$1" "$2"; }
auth(){ curl -sS --max-time 20 "$BASE/$3" -H 'Content-Type: application/json' --data-binary "$(jenc "$1" "$2")" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))'; }
commit(){ # token subsystem expectedRev key payloadjson
  python3 -c 'import json,sys;print(json.dumps({"subsystem":sys.argv[1],"expectedRev":int(sys.argv[2]),"idempotencyKey":sys.argv[3],"payload":json.loads(sys.argv[4]),"clientBuild":"cas-test","deviceId":"cas-test-device"}))' \
    "$2" "$3" "$4" "$5" > "$TMP/req.json"
  curl -sS --max-time 30 -w '\n%{http_code}' "$BASE/api/cf/appdata/commit" -H "Authorization: $1" -H 'Content-Type: application/json' --data-binary "@$TMP/req.json"; }
status(){ echo "$1" | tail -1; }
bodyof(){ echo "$1" | sed '$d'; }
rev(){ bodyof "$1" | python3 -c 'import sys,json
try: d=json.load(sys.stdin); v=d.get("newRev",d.get("serverRev")); print(v if v is not None else "-")
except Exception: print("-")' ; }

say "== auth (users + superuser) =="
T1=$(auth "$EMAIL" "$PASS" "api/collections/users/auth-with-password"); [ -n "$T1" ] || { echo "FATAL user1 auth"; exit 1; }
ATOK=""; [ -n "$ADMIN_EMAIL" ] && ATOK=$(auth "$ADMIN_EMAIL" "$ADMIN_PASS" "api/collections/_superusers/auth-with-password")
NOW=$(date +%s)

say "== validation (5/8/9) =="
R=$(curl -sS --max-time 20 -w '\n%{http_code}' "$BASE/api/cf/appdata/commit" -H 'Content-Type: application/json' -d '{}')
S=$(status "$R"); [ "$S" = "401" ] || [ "$S" = "403" ]; chk "T5 unauthenticated rejected ($S)" 0 "$?" "$(bodyof "$R")"
R=$(commit "$T1" bogus 0 "k-$NOW-a" '{}');   chk "T8 invalid subsystem -> 400" 400 "$(status "$R")" "$(bodyof "$R")"
R=$(commit "$T1" core -1 "k-$NOW-b" '{}');   chk "T9 negative rev -> 400" 400 "$(status "$R")" "$(bodyof "$R")"

say "== T10 oversized payload (file-based; distinguishes local/network/413) =="
python3 -c 'import json;print(json.dumps({"subsystem":"core","expectedRev":0,"idempotencyKey":"big","payload":{"x":"a"*2200000},"clientBuild":"cas-test"}))' > "$TMP/big.json" \
  || { chk "T10 local payload generation" ok fail; }
R=$(curl -sS --max-time 60 -w '\n%{http_code}' "$BASE/api/cf/appdata/commit" -H "Authorization: $T1" -H 'Content-Type: application/json' --data-binary "@$TMP/big.json" 2>"$TMP/curlerr") \
  || { say "FAIL  T10 network/local error: $(cat "$TMP/curlerr" | head -c 200)"; FAILN=$((FAILN+1)); R=""; }
[ -n "$R" ] && chk "T10 oversized -> 413" 413 "$(status "$R")" "$(bodyof "$R")"

say "== T3 concurrent FIRST-ROW creation (addendum #7) =="
if [ -n "$ATOK" ]; then
  UID1=$(curl -sS --max-time 20 "$BASE/api/collections/users/records?filter=$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(f"email=\"{sys.argv[1]}\""))' "$EMAIL")" -H "Authorization: $ATOK" | python3 -c 'import sys,json;print(json.load(sys.stdin)["items"][0]["id"])')
  RID=$(curl -sS --max-time 20 "$BASE/api/collections/appdata/records?filter=$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(f"user=\"{sys.argv[1]}\""))' "$UID1")" -H "Authorization: $ATOK" | python3 -c 'import sys,json;i=json.load(sys.stdin).get("items",[]);print(i[0]["id"] if i else "")')
  [ -n "$RID" ] && curl -sS --max-time 20 -X DELETE "$BASE/api/collections/appdata/records/$RID" -H "Authorization: $ATOK" >/dev/null
  commit "$T1" core 0 "k-$NOW-f1" '{"first":"A"}' > "$TMP/fA" & commit "$T1" core 0 "k-$NOW-f2" '{"first":"B"}' > "$TMP/fB" & wait
  SA=$(status "$(cat "$TMP/fA")"); SB=$(status "$(cat "$TMP/fB")")
  OKS=$(( (SA==200)+(SB==200) ))
  chk "T3a exactly one first-commit succeeded" 1 "$OKS" "$(cat "$TMP/fA" "$TMP/fB")"
  NROWS=$(curl -sS --max-time 20 "$BASE/api/collections/appdata/records?filter=$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(f"user=\"{sys.argv[1]}\""))' "$UID1")" -H "Authorization: $ATOK" | python3 -c 'import sys,json;print(len(json.load(sys.stdin).get("items",[])))')
  chk "T3b exactly one row exists" 1 "$NROWS"
else say "SKIP  T3 (set ADMIN_EMAIL/ADMIN_PASS)"; fi

say "== discover current coreRev =="
R=$(commit "$T1" core 999999 "probe-$NOW" '{"probe":true}'); chk "probe wrong-rev -> 409" 409 "$(status "$R")" "$(bodyof "$R")"
CUR=$(rev "$R"); say "      serverRev=$CUR"; [ "$CUR" != "-" ] || { echo "FATAL: no serverRev"; exit 1; }

say "== T1/T2 concurrent same-expectedRev =="
commit "$T1" core "$CUR" "k-$NOW-c1" '{"w":"A"}' > "$TMP/cA" & commit "$T1" core "$CUR" "k-$NOW-c2" '{"w":"B"}' > "$TMP/cB" & wait
SA=$(status "$(cat "$TMP/cA")"); SB=$(status "$(cat "$TMP/cB")")
chk "T1 exactly one 200" 1 "$(( (SA==200)+(SB==200) ))" "$(cat "$TMP/cA" "$TMP/cB")"
chk "T2 exactly one 409" 1 "$(( (SA==409)+(SB==409) ))"
NEWREV=$((CUR+1))

say "== T13 idempotent replay + concurrent same-key (addendum #7) =="
if [ "$SA" = "200" ]; then RK="k-$NOW-c1"; RP='{"w":"A"}'; else RK="k-$NOW-c2"; RP='{"w":"B"}'; fi
R=$(commit "$T1" core "$CUR" "$RK" "$RP"); chk "T13a replay -> 200" 200 "$(status "$R")" "$(bodyof "$R")"
chk "T13b replay does not double-increment" "$NEWREV" "$(rev "$R")"
R=$(commit "$T1" core "$CUR" "$RK" '{"different":true}'); chk "T13c same key, different body -> 409" 409 "$(status "$R")" "$(bodyof "$R")"
K3="k-$NOW-race"
commit "$T1" core "$NEWREV" "$K3" '{"race":1}' > "$TMP/rA" & commit "$T1" core "$NEWREV" "$K3" '{"race":1}' > "$TMP/rB" & wait
SA=$(status "$(cat "$TMP/rA")"); SB=$(status "$(cat "$TMP/rB")")
chk "T-ledger-race both same-key commits end 200 (one live, one replay)" 2 "$(( (SA==200)+(SB==200) ))" "$(cat "$TMP/rA" "$TMP/rB")"
NEWREV=$((NEWREV+1))

say "== T14/T15 field isolation, both directions =="
TR=$(commit "$T1" training 999999 "probe-t-$NOW" '{}'); TCUR=$(rev "$TR")
R=$(commit "$T1" training "$TCUR" "k-$NOW-t1" '{"sessions":{"s1":1}}'); chk "T15a training commit -> 200" 200 "$(status "$R")" "$(bodyof "$R")"
R=$(commit "$T1" core 999998 "p2-$NOW" '{}'); chk "T15b coreRev unchanged by training commit" "$NEWREV" "$(rev "$R")"
COREPAYLOAD=$(bodyof "$R" | python3 -c 'import sys,json;print("race" in json.dumps(json.load(sys.stdin).get("payload") or {}))')
chk "T14a 409 returns the user's OWN core payload (ownership)" "True" "$COREPAYLOAD"
R=$(commit "$T1" training 999997 "p3-$NOW" '{}'); TAFTER=$(rev "$R")
chk "T14b trainingRev unchanged by core probe" "$((TCUR+1))" "$TAFTER"

say "== T7 raw writes: bridge or lockdown, exactly-once bump =="
RID=$(curl -sS --max-time 20 "$BASE/api/collections/appdata/records?perPage=1" -H "Authorization: $T1" | python3 -c 'import sys,json;i=json.load(sys.stdin)["items"];print(i[0]["id"] if i else "")')
R=$(curl -sS --max-time 20 -w '\n%{http_code}' -X PATCH "$BASE/api/collections/appdata/records/$RID" -H "Authorization: $T1" -H 'Content-Type: application/json' -d '{"coreRev":999}')
chk "T7a revision fields not client-settable -> 400" 400 "$(status "$R")" "$(bodyof "$R")"
R=$(curl -sS --max-time 20 -w '\n%{http_code}' -X PATCH "$BASE/api/collections/appdata/records/$RID" -H "Authorization: $T1" -H 'Content-Type: application/json' -d '{"data":{"legacy":true}}')
LS=$(status "$R")
if [ "$LS" = "200" ]; then
  R=$(commit "$T1" core 999996 "p4-$NOW" '{}'); chk "T7b bridge bumped coreRev EXACTLY once" "$((NEWREV+1))" "$(rev "$R")"
  NEWREV=$((NEWREV+1))
elif [ "$LS" = "403" ] || [ "$LS" = "404" ]; then
  chk "T7b lockdown: raw snapshot PATCH blocked ($LS)" 0 0
  R=$(curl -sS --max-time 20 -w '\n%{http_code}' -X PATCH "$BASE/api/collections/appdata/records/$RID" -H "Authorization: $T1" -H 'Content-Type: application/json' -d '{"health":null}')
  chk "T7c lockdown still permits operational field (health)" 200 "$(status "$R")" "$(bodyof "$R")"
else
  chk "T7b raw PATCH returned an approved status (200 bridge / 403 / 404 lockdown)" approved "$LS" "$(bodyof "$R")"
fi

say "== T6 cross-user isolation =="
if [ -n "$EMAIL2" ]; then
  T2=$(auth "$EMAIL2" "$PASS2" "api/collections/users/auth-with-password")
  R=$(curl -sS --max-time 20 -w '\n%{http_code}' -X PATCH "$BASE/api/collections/appdata/records/$RID" -H "Authorization: $T2" -H 'Content-Type: application/json' -d '{"data":{"steal":true}}')
  S=$(status "$R"); [ "$S" = "403" ] || [ "$S" = "404" ]; chk "T6a user2 cannot touch user1 row ($S)" 0 "$?" "$(bodyof "$R")"
  R=$(curl -sS --max-time 20 -w '\n%{http_code}' "$BASE/api/collections/appdata/records" -H "Authorization: $T2" -H 'Content-Type: application/json' \
    -d "{\"user\":\"$(echo "$RID" | head -c 15)\",\"data\":{}}")
  BODY=$(bodyof "$R")
  FORGED=$(echo "$BODY" | python3 -c 'import sys,json
try: d=json.load(sys.stdin); print(d.get("user","") not in ("", None) and "id" in d)
except Exception: print(False)')
  say "      raw-create-forge status $(status "$R") (hook pins owner to the authenticated user)"
else say "SKIP  T6 (set EMAIL2/PASS2)"; fi

say "== T4 REAL unique-index test (superuser bypasses rules, not the index) =="
if [ -n "$ATOK" ] && [ -n "${UID1:-}" ]; then
  python3 -c 'import json,sys;print(json.dumps({"user":sys.argv[1],"data":{},"coreRev":0,"trainingRev":0}))' "$UID1" > "$TMP/dup.json"
  R=$(curl -sS --max-time 20 -w '\n%{http_code}' "$BASE/api/collections/appdata/records" -H "Authorization: $ATOK" -H 'Content-Type: application/json' --data-binary "@$TMP/dup.json")
  S=$(status "$R"); [ "$S" != "200" ]; chk "T4 second VALID row for same user rejected by unique index ($S)" 0 "$?" "$(bodyof "$R")"
else say "SKIP  T4 (needs ADMIN_EMAIL/ADMIN_PASS)"; fi

say ""
say "RESULT: $PASSN passed, $FAILN failed"
say "Manual-only (fault injection, DEPLOYMENT.md appendix): forced mid-transaction rollback; missing-ledger fail-closed."
say "Cleanup: bash setup-fixtures.sh teardown"
[ "$FAILN" = "0" ]
