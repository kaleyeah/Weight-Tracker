#!/usr/bin/env bash
# Route smoke — Product Architect Round 2, decision 1 ("Required route smoke test").
#
# Runs BEFORE the full suite. Its whole purpose is to prove the handler runtime
# is actually executing our code: in Round 2 the route threw ReferenceError on
# every request and returned a generic PocketBase error body, yet status-only
# tests scored passes. Per the Architect:
#
#   "A generic PocketBase framework error body is always a failure."
#
# Requirement traceability:
#   1 valid commit reaches CAS logic          -> SMOKE-1
#   2 invalid subsystem exact validation JSON -> SMOKE-2
#   3 negative revision exact validation JSON -> SMOKE-3
#   4 payload limit exact 413 JSON            -> SMOKE-4
#   5 minimum build exact 426 JSON when on    -> SMOKE-5 (skipped unless enabled)
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; . "$DIR/_lib.sh"
cf_guard
. "$DIR/.fixture-creds.env"
trap 'rm -rf "$CF_TMP"' EXIT

T1=$(cf_user_token "$EMAIL" "$PASS"); [ -n "$T1" ] || { echo "FATAL: user auth failed"; exit 1; }
N=$(date +%s%N)

echo "== SMOKE-1: a valid commit reaches CAS logic (not a framework error) =="
# Probe the live revision with a deliberately-wrong expectedRev.
cf_commit "$T1" core 999999 "smoke-probe-$N" '{}'
if [ "$CF_STATUS" = "400" ]; then
  echo "FATAL  the route returned a generic 400 — handler is not executing our code."
  echo "       body: $CF_BODY"
  echo "       This is the Round 2 defect-2 signature. Check cf_cas_shared.js is"
  echo "       required INSIDE the handler and that \$__hooks resolves."
  exit 1
fi
RAW_REV=$(cf_json serverRev)
CUR=$(cf_server_rev)
if [ "$RAW_REV" = "null" ]; then
  # No row yet: the contract is a 409 carrying serverRev null and this exact
  # message, NOT a fabricated rev 0 — only expectedRev 0 may create a row.
  cf_assert_error "SMOKE-1a no-row probe returns the documented no-row conflict" 409 "no row; only expectedRev 0 may create"
  cf_eq "SMOKE-1a2 no-row conflict carries a null serverRev" "null" "$RAW_REV" "$CF_BODY"
else
  cf_assert_conflict "SMOKE-1a wrong-rev probe returns a real CAS conflict" "$CUR" SKIP
fi
cf_commit "$T1" core "$CUR" "smoke-ok-$N" '{"smoke":true}'
cf_assert_commit_ok "SMOKE-1b valid commit succeeds and advances the revision" core "$((CUR+1))"

echo "== SMOKE-2: invalid subsystem -> exact validation JSON =="
cf_commit "$T1" bogus 0 "smoke-sub-$N" '{}'
cf_assert_error "SMOKE-2 invalid subsystem" 400 "invalid subsystem"

echo "== SMOKE-3: negative revision -> exact validation JSON =="
cf_commit "$T1" core -1 "smoke-neg-$N" '{}'
cf_assert_error "SMOKE-3 negative expectedRev" 400 "expectedRev must be a non-negative integer"

echo "== SMOKE-4: oversized payload -> exact route 413 JSON (not middleware) =="
# Just over the 256 KiB payload cap but well under the 320 KiB envelope limit,
# so this MUST be the route's own check, not $apis.bodyLimit.
python3 -c '
import json
print(json.dumps({"subsystem":"core","expectedRev":0,"idempotencyKey":"smoke-big",
                  "payload":{"x":"a"*(256*1024+64)},"clientBuild":"cas-test"}))' > "$CF_TMP/big.json"
cf_req POST /api/cf/appdata/commit "$T1" "$CF_TMP/big.json"
cf_assert_error "SMOKE-4 oversized payload" 413 "payload too large"
MB=$(cf_json maxBytes)
cf_eq "SMOKE-4b 413 body reports the configured cap" "262144" "$MB" "$CF_BODY"

echo "== SMOKE-5: minimum client build -> exact 426 JSON =="
if [ "${CF_MIN_BUILD_ENABLED:-}" = "1" ]; then
  cf_commit_body core 0 "smoke-build-$N" '{}' "0000-00-00.000" > /dev/null
  F=$(cf_commit_body core 0 "smoke-build-$N" '{}' "0000-00-00.000")
  cf_req POST /api/cf/appdata/commit "$T1" "$F"
  cf_assert_error "SMOKE-5 stale client build" 426 "update-required"
else
  echo "SKIP  SMOKE-5 — CF_MIN_CLIENT_BUILD is empty by design pre-lockdown."
  echo "      Set CF_MIN_CLIENT_BUILD in cf_cas_shared.js and rerun with"
  echo "      CF_MIN_BUILD_ENABLED=1 to exercise the 426 path before cutover."
fi

cf_summary "route-smoke"
