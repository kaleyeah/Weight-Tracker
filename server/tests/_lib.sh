#!/usr/bin/env bash
# Compound Fitness — CAS test support library. STAGING ONLY.
#
# Product Architect Round 2 decision 2A: "No validation test may assert only a
# status." Every assertion helper here checks semantic response content —
# status, JSON content type, ok, exact error, subsystem, revision, payload,
# replay flag — so that a crashed handler returning a generic framework error
# can never satisfy a test. That failure mode is exactly what let the Round 2
# suite report passes against a dead route.

# ---- guards: staging only, disposable users only ----------------------------
cf_guard() {
  [ "${STAGING_CONFIRM:-}" = "YES" ] || { echo "REFUSED: set STAGING_CONFIRM=YES (staging only, never production)"; exit 2; }
  case "${BASE:?set BASE}" in
    *rack.tail6fa16c.ts.net*) echo "REFUSED: BASE points at the PRODUCTION host"; exit 2;;
  esac
  case "${BASE}" in
    http://127.0.0.1:*|http://localhost:*|http://[::1]:*) :;;
    *) echo "REFUSED: BASE must be a loopback staging instance (got $BASE)"; exit 2;;
  esac
}

CF_PASS=0; CF_FAIL=0; CF_FAILED_NAMES=""

cf_redact() { sed -E 's/(token|password|Authorization)[":= ]+[^",}& ]+/\1=REDACTED/gi'; }

cf_ok()   { CF_PASS=$((CF_PASS+1)); printf 'PASS  %s\n' "$1"; }
cf_bad()  { CF_FAIL=$((CF_FAIL+1)); CF_FAILED_NAMES="$CF_FAILED_NAMES
  - $1"; printf 'FAIL  %s\n' "$1"; [ -n "${2:-}" ] && printf '      got: %s\n' "$(printf '%s' "$2" | cf_redact | head -c 400)"; return 0; }

cf_eq() { # name expected actual [context]
  if [ "$2" = "$3" ]; then cf_ok "$1 ($3)"; else cf_bad "$1 — expected [$2], got [$3]" "${4:-}"; fi
}

# ---- HTTP -------------------------------------------------------------------
# cf_req METHOD PATH TOKEN BODYFILE_OR_EMPTY  -> writes /tmp status+headers+body
CF_TMP="${CF_TMP:-$(mktemp -d)}"
cf_req() {
  local method="$1" path="$2" tok="${3:-}" bodyfile="${4:-}"
  local args=(-sS --max-time 60 -o "$CF_TMP/body" -D "$CF_TMP/hdr" -w '%{http_code}' -X "$method" "$BASE$path")
  [ -n "$tok" ] && args+=(-H "Authorization: $tok")
  if [ -n "$bodyfile" ]; then args+=(-H 'Content-Type: application/json' --data-binary "@$bodyfile"); fi
  CF_STATUS=$(curl "${args[@]}" 2>"$CF_TMP/err") || CF_STATUS="000"
  CF_BODY=$(cat "$CF_TMP/body" 2>/dev/null)
  CF_CTYPE=$(grep -i '^content-type:' "$CF_TMP/hdr" 2>/dev/null | head -1 | tr -d '\r' | cut -d' ' -f2-)
}

# Build a commit request body file. Each call gets its OWN file — Round 2
# defect 3 was two concurrent calls sharing one temp file, which made both
# requests transmit an identical body and silently destroyed every
# concurrency test.
cf_commit_body() { # subsystem expectedRev key payloadjson [clientBuild] [deviceId] -> prints path
  local f; f=$(mktemp "$CF_TMP/req.XXXXXXXX.json")
  python3 -c '
import json,sys
d={"subsystem":sys.argv[1],"expectedRev":int(sys.argv[2]),"idempotencyKey":sys.argv[3],"payload":json.loads(sys.argv[4])}
if len(sys.argv)>5 and sys.argv[5]: d["clientBuild"]=sys.argv[5]
if len(sys.argv)>6 and sys.argv[6]: d["deviceId"]=sys.argv[6]
print(json.dumps(d))' "$1" "$2" "$3" "$4" "${5:-cas-test}" "${6:-cas-test-device}" > "$f"
  printf '%s' "$f"
}

cf_commit() { # token subsystem expectedRev key payloadjson  -> sets CF_STATUS/CF_BODY/CF_CTYPE
  local f; f=$(cf_commit_body "$2" "$3" "$4" "$5")
  cf_req POST /api/cf/appdata/commit "$1" "$f"
}

# ---- JSON field extraction --------------------------------------------------
cf_json() { # jsonpath-ish key from CF_BODY; prints "<missing>" when absent
  printf '%s' "$CF_BODY" | python3 -c '
import sys,json
try: d=json.load(sys.stdin)
except Exception: print("<not-json>"); raise SystemExit
k=sys.argv[1]; v=d
for part in k.split("."):
    if isinstance(v,dict) and part in v: v=v[part]
    else: print("<missing>"); raise SystemExit
# render JSON-faithfully: null/true/false stay lowercase so shell comparisons
# match the wire format rather than Python repr
if v is None: print("null")
elif v is True: print("true")
elif v is False: print("false")
elif isinstance(v,(dict,list)): print(json.dumps(v))
else: print(v)' "$1"
}

# Current serverRev as an integer; a missing/null revision means "no row yet" = 0.
cf_server_rev() {
  local v; v=$(cf_json serverRev)
  case "$v" in ''|null|'<missing>'|None) printf '0';; *) printf '%s' "$v";; esac
}

# ---- composite assertions ---------------------------------------------------
# The Architect requires JSON content type + semantic fields on every check.
cf_assert_json_ct() {
  case "$CF_CTYPE" in *application/json*) : ;; *) cf_bad "$1 — response content-type is not JSON" "$CF_CTYPE";; esac
}

cf_assert_error() { # name expected_status expected_error_string
  local name="$1" wstatus="$2" werr="$3"
  cf_assert_json_ct "$name"
  local ok err
  ok=$(cf_json ok); err=$(cf_json error)
  if [ "$CF_STATUS" = "$wstatus" ] && [ "$ok" = "false" ] && [ "$err" = "$werr" ]; then
    cf_ok "$name (status $CF_STATUS, error \"$err\")"
  else
    cf_bad "$name — expected status $wstatus + ok=false + error \"$werr\"; got status $CF_STATUS ok=$ok error=\"$err\"" "$CF_BODY"
  fi
}

cf_assert_commit_ok() { # name expected_subsystem expected_newRev
  local name="$1" wsub="$2" wrev="$3"
  cf_assert_json_ct "$name"
  local ok sub rev replay
  ok=$(cf_json ok); sub=$(cf_json subsystem); rev=$(cf_json newRev); replay=$(cf_json replay)
  if [ "$CF_STATUS" = "200" ] && [ "$ok" = "true" ] && [ "$sub" = "$wsub" ] && [ "$rev" = "$wrev" ]; then
    cf_ok "$name (200, subsystem=$sub, newRev=$rev, replay=$replay)"
  else
    cf_bad "$name — expected 200 + ok=true + subsystem=$wsub + newRev=$wrev; got status $CF_STATUS ok=$ok subsystem=$sub newRev=$rev" "$CF_BODY"
  fi
}

cf_assert_conflict() { # name expected_serverRev expected_payload_json_or_SKIP
  local name="$1" wrev="$2" wpayload="$3"
  cf_assert_json_ct "$name"
  local ok conflict rev payload
  ok=$(cf_json ok); conflict=$(cf_json conflict); rev=$(cf_json serverRev); payload=$(cf_json payload)
  local good=1
  [ "$CF_STATUS" = "409" ] || good=0
  [ "$ok" = "false" ] || good=0
  [ "$conflict" = "true" ] || good=0
  [ "$rev" = "$wrev" ] || good=0
  if [ "$wpayload" != "SKIP" ]; then
    [ "$(printf '%s' "$payload" | python3 -c 'import sys,json;print(json.dumps(json.loads(sys.stdin.read()),sort_keys=True))' 2>/dev/null)" \
      = "$(printf '%s' "$wpayload" | python3 -c 'import sys,json;print(json.dumps(json.loads(sys.stdin.read()),sort_keys=True))' 2>/dev/null)" ] || good=0
  fi
  if [ "$good" = "1" ]; then
    cf_ok "$name (409 conflict, serverRev=$rev, payload carried)"
  else
    cf_bad "$name — expected 409 + conflict=true + serverRev=$wrev + payload=$wpayload; got status $CF_STATUS ok=$ok conflict=$conflict serverRev=$rev payload=$payload" "$CF_BODY"
  fi
}

cf_assert_replay() { # name expected_newRev
  cf_assert_json_ct "$1"
  local ok replay rev
  ok=$(cf_json ok); replay=$(cf_json replay); rev=$(cf_json newRev)
  if [ "$CF_STATUS" = "200" ] && [ "$replay" = "true" ] && [ "$rev" = "$2" ]; then
    cf_ok "$1 (200 replay, newRev=$rev)"
  else
    cf_bad "$1 — expected 200 + replay=true + newRev=$2; got status $CF_STATUS replay=$replay newRev=$rev" "$CF_BODY"
  fi
}

# ---- auth / admin helpers ---------------------------------------------------
cf_auth() { # identity password collectionpath -> token on stdout
  python3 -c 'import json,sys;print(json.dumps({"identity":sys.argv[1],"password":sys.argv[2]}))' "$1" "$2" > "$CF_TMP/auth.json"
  curl -sS --max-time 30 "$BASE/$3" -H 'Content-Type: application/json' --data-binary "@$CF_TMP/auth.json" \
    | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))'
}
cf_user_token()  { cf_auth "$1" "$2" "api/collections/users/auth-with-password"; }
cf_admin_token() { cf_auth "$1" "$2" "api/collections/_superusers/auth-with-password"; }

cf_user_id() { # admintoken email
  curl -sS --max-time 30 -G "$BASE/api/collections/users/records" --data-urlencode "filter=email=\"$2\"" -H "Authorization: $1" \
    | python3 -c 'import sys,json;i=json.load(sys.stdin).get("items",[]);print(i[0]["id"] if i else "")'
}
cf_appdata_rows() { # admintoken userid -> count
  curl -sS --max-time 30 -G "$BASE/api/collections/appdata/records" --data-urlencode "filter=user=\"$2\"" -H "Authorization: $1" \
    | python3 -c 'import sys,json;print(len(json.load(sys.stdin).get("items",[])))'
}
cf_ledger_rows() { # admintoken userid -> count
  curl -sS --max-time 30 -G "$BASE/api/collections/cf_commit_log/records" --data-urlencode "filter=user=\"$2\"" -H "Authorization: $1" \
    | python3 -c 'import sys,json;print(json.load(sys.stdin).get("totalItems",0))'
}
cf_rev() { # admintoken userid field(coreRev|trainingRev)
  curl -sS --max-time 30 -G "$BASE/api/collections/appdata/records" --data-urlencode "filter=user=\"$2\"" -H "Authorization: $1" \
    | python3 -c 'import sys,json;i=json.load(sys.stdin).get("items",[]);print(i[0][sys.argv[1]] if i else "-")' "$3"
}

cf_summary() { # suite-name
  printf '\n---- %s: %d passed, %d failed ----\n' "$1" "$CF_PASS" "$CF_FAIL"
  [ "$CF_FAIL" != "0" ] && printf 'failed:%s\n' "$CF_FAILED_NAMES"
  [ "$CF_FAIL" = "0" ]
}
