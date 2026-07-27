#!/usr/bin/env bash
# Auth and ownership — SERVER_NOTES.md §2 "raw-route bypass".
# Round 2 note: the legacy suite's forge case asserted NOTHING (it only printed
# a status), so ownership forgery could not fail the suite. Every case here
# asserts.
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; . "$DIR/_lib.sh"
cf_guard
. "$DIR/.fixture-creds.env"
ADMIN_EMAIL="${ADMIN_EMAIL:?}"; ADMIN_PASS="${ADMIN_PASS:?}"
trap 'rm -rf "$CF_TMP"' EXIT
T1=$(cf_user_token "$EMAIL"  "$PASS")
T2=$(cf_user_token "$EMAIL2" "$PASS2")
ATOK=$(cf_admin_token "$ADMIN_EMAIL" "$ADMIN_PASS")
UID1=$(cf_user_id "$ATOK" "$EMAIL"); UID2=$(cf_user_id "$ATOK" "$EMAIL2")
N=$(date +%s%N)
[ -n "$T2" ] || { echo "FATAL: user2 auth failed"; exit 1; }

# make sure user1 has a row
cf_commit "$T1" core 999999 "ao-probe-$N" '{}'; C1=$(cf_server_rev)
cf_commit "$T1" core "$C1" "ao-seed-$N" '{"owner":"user1"}' >/dev/null 2>&1
RID1=$(cf_curl "$ATOK" -sS --max-time 30 -G "$BASE/api/collections/appdata/records" --data-urlencode "filter=user=\"$UID1\"" \
      | python3 -c 'import sys,json;i=json.load(sys.stdin).get("items",[]);print(i[0]["id"] if i else "")')

echo "== cross-user access =="
printf '{"data":{"steal":true}}' > "$CF_TMP/steal.json"
cf_req PATCH "/api/collections/appdata/records/$RID1" "$T2" "$CF_TMP/steal.json"
case "$CF_STATUS" in 403|404) cf_ok "AO1 user2 cannot PATCH user1's row ($CF_STATUS)";;
  *) cf_bad "AO1 user2 must not reach user1's row — expected 403/404, got $CF_STATUS" "$CF_BODY";; esac

cf_req GET "/api/collections/appdata/records/$RID1" "$T2"
case "$CF_STATUS" in 403|404) cf_ok "AO2 user2 cannot READ user1's row ($CF_STATUS)";;
  *) cf_bad "AO2 user2 must not read user1's row — expected 403/404, got $CF_STATUS" "$CF_BODY";; esac

echo "== ownership forgery on raw create (hook pins owner) =="
python3 -c 'import json,sys;print(json.dumps({"user":sys.argv[1],"data":{"forged":True}}))' "$UID1" > "$CF_TMP/forge.json"
cf_req POST /api/collections/appdata/records "$T2" "$CF_TMP/forge.json"
FORGED_OWNER=$(cf_json user)
if [ "$CF_STATUS" = "200" ]; then
  # allowed to create, but the hook must have rewritten the owner to user2
  cf_eq "AO3 raw create pins owner to the authenticated user (not the forged id)" "$UID2" "$FORGED_OWNER" "$CF_BODY"
  NEWID=$(cf_json id)
  [ -n "$NEWID" ] && [ "$NEWID" != "<missing>" ] && cf_curl "$ATOK" -sS -o /dev/null -X DELETE "$BASE/api/collections/appdata/records/$NEWID"
else
  # rejected outright (e.g. unique index because user2 already owns a row) — also acceptable,
  # but it must NOT have created a row owned by user1
  ROWS=$(cf_appdata_rows "$ATOK" "$UID1")
  cf_eq "AO3 forged create rejected ($CF_STATUS) and user1 still owns exactly one row" 1 "$ROWS" "$CF_BODY"
fi

echo "== revision fields are never client-settable =="
printf '{"coreRev":999}' > "$CF_TMP/rev.json"
cf_req PATCH "/api/collections/appdata/records/$RID1" "$T1" "$CF_TMP/rev.json"
cf_eq "AO4 client-set coreRev rejected" 400 "$CF_STATUS" "$CF_BODY"
printf '{"trainingRev":999}' > "$CF_TMP/rev2.json"
cf_req PATCH "/api/collections/appdata/records/$RID1" "$T1" "$CF_TMP/rev2.json"
cf_eq "AO5 client-set trainingRev rejected" 400 "$CF_STATUS" "$CF_BODY"

echo "== ledger is superuser-only (SERVER_NOTES §2: rules locked) =="
cf_req GET "/api/collections/cf_commit_log/records" "$T1"
case "$CF_STATUS" in 400|403|404) cf_ok "AO6 authenticated user cannot list the ledger ($CF_STATUS)";;
  *) cf_bad "AO6 ledger must not be client-readable — got $CF_STATUS" "$CF_BODY";; esac
cf_req GET "/api/collections/cf_commit_log/records" ""
case "$CF_STATUS" in 400|401|403|404) cf_ok "AO7 anonymous cannot list the ledger ($CF_STATUS)";;
  *) cf_bad "AO7 ledger must not be anonymously readable — got $CF_STATUS" "$CF_BODY";; esac
cf_req GET "/api/collections/cf_commit_log/records" "$ATOK"
cf_eq "AO8 superuser CAN read the ledger" 200 "$CF_STATUS" "$CF_BODY"

echo "== conflict ownership: a 409 returns the caller's OWN payload =="
cf_commit "$T1" core 999997 "ao-own-$N" '{}'
P=$(cf_json payload)
printf '%s' "$P" | grep -q 'steal' && cf_bad "AO9 conflict payload leaked another user's data" "$P" \
  || cf_ok "AO9 conflict payload belongs to the caller"

cf_summary "auth-and-ownership"
