#!/usr/bin/env bash
# Compound Fitness — CAS server integration tests (run from an operator machine
# on the Tailnet, against STAGING ONLY). PocketBase v0.39.8.
# Usage: BASE=https://host:port EMAIL=u1@x PASS=pw1 EMAIL2=u2@x PASS2=pw2 bash cas-server-tests.sh
set -u
BASE="${BASE:?set BASE}"; EMAIL="${EMAIL:?set EMAIL}"; PASS="${PASS:?set PASS}"
EMAIL2="${EMAIL2:-}"; PASS2="${PASS2:-}"
PASSN=0; FAILN=0
say(){ printf '%s\n' "$*"; }
chk(){ local name="$1" want="$2" got="$3"; if [ "$want" = "$got" ]; then PASSN=$((PASSN+1)); say "PASS  $name"; else FAILN=$((FAILN+1)); say "FAIL  $name  (want $want, got $got)"; fi; }
auth(){ curl -s "$BASE/api/collections/users/auth-with-password" -H 'Content-Type: application/json' \
  -d "{\"identity\":\"$1\",\"password\":\"$2\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))'; }
commit(){ # token subsystem expectedRev key payloadjson -> "status body"
  curl -s -w '\n%{http_code}' "$BASE/api/cf/appdata/commit" -H "Authorization: $1" -H 'Content-Type: application/json' \
    -d "{\"subsystem\":\"$2\",\"expectedRev\":$3,\"idempotencyKey\":\"$4\",\"payload\":$5,\"clientBuild\":\"test\",\"deviceId\":\"test\"}"; }
status(){ echo "$1" | tail -1; }
bodyof(){ echo "$1" | sed '$d'; }
rev(){ bodyof "$1" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("newRev",d.get("serverRev","-")))' 2>/dev/null || echo "-"; }

say "== auth =="
T1=$(auth "$EMAIL" "$PASS"); [ -n "$T1" ] || { say "FATAL: user1 auth failed"; exit 1; }
NOW=$(date +%s)

say "== discover current coreRev =="
R=$(commit "$T1" core 999999 "probe-$NOW" '{"probe":true}'); chk "T-probe returns 409 (never writes at wrong rev)" 409 "$(status "$R")"
CUR=$(rev "$R"); say "      serverRev = $CUR"
if [ "$CUR" = "-" ] || [ "$CUR" = "None" ]; then say "FATAL: could not read serverRev"; exit 1; fi

say "== 5/8/9/10: validation =="
R=$(curl -s -w '\n%{http_code}' "$BASE/api/cf/appdata/commit" -H 'Content-Type: application/json' -d '{}'); chk "T5 unauthenticated -> 401" 401 "$(status "$R")"
R=$(commit "$T1" bogus 0 "k-$NOW-a" '{}');                        chk "T8 invalid subsystem -> 400" 400 "$(status "$R")"
R=$(commit "$T1" core -1 "k-$NOW-b" '{}');                        chk "T9 negative rev -> 400" 400 "$(status "$R")"
BIG=$(python3 -c 'print("{\"x\":\""+("a"*2200000)+"\"}")')
R=$(commit "$T1" core "$CUR" "k-$NOW-c" "$BIG");                  chk "T10 oversized -> 413" 413 "$(status "$R")"

say "== 1/2: concurrent same-expectedRev commits =="
K1="k-$NOW-c1"; K2="k-$NOW-c2"
commit "$T1" core "$CUR" "$K1" '{"writer":"A","t":'"$NOW"'}' > /tmp/cfA & commit "$T1" core "$CUR" "$K2" '{"writer":"B","t":'"$NOW"'}' > /tmp/cfB & wait
SA=$(status "$(cat /tmp/cfA)"); SB=$(status "$(cat /tmp/cfB)")
OKS=$(( (SA==200) + (SB==200) )); CONFS=$(( (SA==409) + (SB==409) ))
chk "T1 exactly one 200" 1 "$OKS"; chk "T2 exactly one 409" 1 "$CONFS"
NEWREV=$((CUR+1))

say "== 13: idempotent replay =="
if [ "$SA" = "200" ]; then RK="$K1"; RP='{"writer":"A","t":'"$NOW"'}'; else RK="$K2"; RP='{"writer":"B","t":'"$NOW"'}'; fi
R=$(commit "$T1" core "$CUR" "$RK" "$RP"); chk "T13a replay same key+body -> 200" 200 "$(status "$R")"
chk "T13b replay does not double-increment" "$NEWREV" "$(rev "$R")"
R=$(commit "$T1" core "$CUR" "$RK" '{"different":true}'); chk "T13c same key, different body -> 409" 409 "$(status "$R")"

say "== 14/15: field isolation =="
TR=$(commit "$T1" training 999999 "probe-t-$NOW" '{}'); TCUR=$(rev "$TR")
R=$(commit "$T1" training "$TCUR" "k-$NOW-t1" '{"sessions":{}}'); chk "T15a training commit -> 200" 200 "$(status "$R")"
R=$(commit "$T1" core 999998 "probe2-$NOW" '{}'); chk "T15b coreRev unchanged by training commit" "$NEWREV" "$(rev "$R")"

say "== 7: raw PATCH bridge / lockdown =="
REC=$(curl -s "$BASE/api/collections/appdata/records?perPage=1" -H "Authorization: $T1" | python3 -c 'import sys,json;i=json.load(sys.stdin)["items"];print(i[0]["id"] if i else "")')
R=$(curl -s -w '\n%{http_code}' -X PATCH "$BASE/api/collections/appdata/records/$REC" -H "Authorization: $T1" -H 'Content-Type: application/json' -d '{"coreRev":999}')
chk "T7a client cannot set revision fields directly" 400 "$(status "$R")"
R=$(curl -s -w '\n%{http_code}' -X PATCH "$BASE/api/collections/appdata/records/$REC" -H "Authorization: $T1" -H 'Content-Type: application/json' -d '{"data":{"legacy":true}}')
LS=$(status "$R")
if [ "$LS" = "200" ]; then
  say "      bridge phase: raw PATCH accepted — verifying it bumped coreRev"
  R=$(commit "$T1" core 999997 "probe3-$NOW" '{}'); chk "T7b bridge bumped coreRev" "$((NEWREV+1))" "$(rev "$R")"
else
  chk "T7b lockdown phase: raw PATCH rejected" 404 "$LS"   # PB returns 404/403 on rule-blocked update
fi

say "== 6: cross-user isolation =="
if [ -n "$EMAIL2" ]; then
  T2=$(auth "$EMAIL2" "$PASS2")
  R=$(curl -s -w '\n%{http_code}' -X PATCH "$BASE/api/collections/appdata/records/$REC" -H "Authorization: $T2" -H 'Content-Type: application/json' -d '{"data":{"steal":true}}')
  S2=$(status "$R"); [ "$S2" = "404" ] || [ "$S2" = "403" ]; chk "T6 user2 cannot touch user1 row" 0 "$?"
else
  say "SKIP  T6 (set EMAIL2/PASS2 to run)"
fi

say "== 4: unique index =="
R=$(curl -s -w '\n%{http_code}' "$BASE/api/collections/appdata/records" -H "Authorization: $T1" -H 'Content-Type: application/json' -d "{\"user\":\"IGNORED-BY-RULES-OR-DUP\",\"data\":{}}")
S4=$(status "$R"); [ "$S4" != "200" ]; chk "T4 duplicate/foreign row creation rejected" 0 "$?"

say ""
say "RESULT: $PASSN passed, $FAILN failed"
say "(T3 concurrent first-row creation and T11 forced rollback need a throwaway user / fault injection — run manually per DEPLOYMENT.md if required by the Architect.)"
[ "$FAILN" = "0" ]
