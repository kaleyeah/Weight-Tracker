#!/usr/bin/env bash
# Validation contract — re-derived from SERVER_NOTES.md and the route contract.
# Every case asserts status + JSON content type + ok + the exact error string.
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; . "$DIR/_lib.sh"
cf_guard
. "$DIR/.fixture-creds.env"
trap 'rm -rf "$CF_TMP"' EXIT
T1=$(cf_user_token "$EMAIL" "$PASS"); [ -n "$T1" ] || { echo "FATAL: user auth failed"; exit 1; }
N=$(date +%s%N)

echo "== authentication =="
printf '{}' > "$CF_TMP/empty.json"
cf_req POST /api/cf/appdata/commit "" "$CF_TMP/empty.json"
case "$CF_STATUS" in 401|403) cf_ok "V1 unauthenticated request rejected ($CF_STATUS)";;
  *) cf_bad "V1 unauthenticated request — expected 401/403, got $CF_STATUS" "$CF_BODY";; esac

echo "== subsystem =="
cf_commit "$T1" bogus   0 "v-$N-1" '{}'; cf_assert_error "V2 unknown subsystem"  400 "invalid subsystem"
cf_commit "$T1" ""      0 "v-$N-2" '{}'; cf_assert_error "V3 empty subsystem"    400 "invalid subsystem"
cf_commit "$T1" CORE    0 "v-$N-3" '{}'; cf_assert_error "V4 subsystem is case-sensitive" 400 "invalid subsystem"

echo "== expectedRev =="
cf_commit "$T1" core -1 "v-$N-4" '{}'; cf_assert_error "V5 negative expectedRev" 400 "expectedRev must be a non-negative integer"
F=$(mktemp "$CF_TMP/req.XXXX.json")
printf '{"subsystem":"core","expectedRev":1.5,"idempotencyKey":"v-%s-5","payload":{}}' "$N" > "$F"
cf_req POST /api/cf/appdata/commit "$T1" "$F"; cf_assert_error "V6 fractional expectedRev" 400 "expectedRev must be a non-negative integer"
printf '{"subsystem":"core","expectedRev":"0","idempotencyKey":"v-%s-6","payload":{}}' "$N" > "$F"
cf_req POST /api/cf/appdata/commit "$T1" "$F"; cf_assert_error "V7 string expectedRev" 400 "expectedRev must be a non-negative integer"
printf '{"subsystem":"core","idempotencyKey":"v-%s-7","payload":{}}' "$N" > "$F"
cf_req POST /api/cf/appdata/commit "$T1" "$F"; cf_assert_error "V8 missing expectedRev" 400 "expectedRev must be a non-negative integer"

echo "== idempotencyKey =="
cf_commit "$T1" core 0 "" '{}'; cf_assert_error "V9 empty idempotencyKey" 400 "idempotencyKey required (max 96 chars)"
LONGKEY=$(python3 -c 'print("k"*97)')
cf_commit "$T1" core 0 "$LONGKEY" '{}'; cf_assert_error "V10 over-long idempotencyKey (97 chars)" 400 "idempotencyKey required (max 96 chars)"
MAXKEY=$(python3 -c 'print("k"*96)')
cf_commit "$T1" core 999999 "$MAXKEY" '{}'
[ "$CF_STATUS" = "409" ] && cf_ok "V11 96-char idempotencyKey accepted (reaches CAS, returns 409)" \
  || cf_bad "V11 96-char key should be accepted and reach CAS logic; got $CF_STATUS" "$CF_BODY"

echo "== payload shape =="
printf '{"subsystem":"core","expectedRev":0,"idempotencyKey":"v-%s-8","payload":[]}' "$N" > "$F"
cf_req POST /api/cf/appdata/commit "$T1" "$F"; cf_assert_error "V12 array payload" 400 "payload must be a JSON object"
printf '{"subsystem":"core","expectedRev":0,"idempotencyKey":"v-%s-9","payload":null}' "$N" > "$F"
cf_req POST /api/cf/appdata/commit "$T1" "$F"; cf_assert_error "V13 null payload" 400 "payload must be a JSON object"
printf '{"subsystem":"core","expectedRev":0,"idempotencyKey":"v-%s-10","payload":"str"}' "$N" > "$F"
cf_req POST /api/cf/appdata/commit "$T1" "$F"; cf_assert_error "V14 string payload" 400 "payload must be a JSON object"
printf '{"subsystem":"core","expectedRev":0,"idempotencyKey":"v-%s-11"}' "$N" > "$F"
cf_req POST /api/cf/appdata/commit "$T1" "$F"; cf_assert_error "V15 missing payload" 400 "payload must be a JSON object"

cf_summary "validation"
