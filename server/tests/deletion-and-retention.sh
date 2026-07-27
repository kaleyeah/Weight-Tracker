#!/usr/bin/env bash
# Deletion cascade and retention — Product Architect Round 2, decision 3.
#
# Required cases:
#   D1 delete a user with no ledger rows
#   D2 delete a user with core ledger rows
#   D3 delete a user with core + training ledger rows
#   D4 verify all of that user's ledger rows are gone
#   D5 verify another user's ledger rows remain
#   D6 deleting a ledger row does not delete the user
#   D7 teardown verifies status and actual absence
#
# Context: with cascadeDelete:false the ledger made accounts undeletable —
# "Failed to delete record. Make sure that the record is not part of a required
# relation reference." With 30-day retention that blocked account deletion for
# up to 30 days, which the Architect ruled unacceptable.
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; . "$DIR/_lib.sh"
cf_guard
ADMIN_EMAIL="${ADMIN_EMAIL:?}"; ADMIN_PASS="${ADMIN_PASS:?}"
trap 'rm -rf "$CF_TMP"' EXIT
ATOK=$(cf_admin_token "$ADMIN_EMAIL" "$ADMIN_PASS")
[ -n "$ATOK" ] || { echo "FATAL: superuser auth failed"; exit 1; }
N=$(date +%s%N)

mkuser() { # email -> prints "id token"
  local em="$1" pw="cf-del-$(python3 -c 'import secrets;print(secrets.token_urlsafe(12))')"
  python3 -c 'import json,sys;print(json.dumps({"email":sys.argv[1],"password":sys.argv[2],"passwordConfirm":sys.argv[2],"verified":True}))' \
    "$em" "$pw" > "$CF_TMP/mk.json"
  cf_req POST /api/collections/users/records "$ATOK" "$CF_TMP/mk.json"
  local id; id=$(cf_json id)
  local tok; tok=$(cf_user_token "$em" "$pw")
  printf '%s %s' "$id" "$tok"
}

del_user() { # id -> sets CF_STATUS
  cf_req DELETE "/api/collections/users/records/$1" "$ATOK"
}

# ---- D1: no ledger rows -----------------------------------------------------
echo "== D1: delete a user that never committed =="
read -r ID_A TOK_A <<< "$(mkuser "cf_test_del_a_$N@staging.invalid")"
cf_eq "D1a user created" 0 "$([ -n "$ID_A" ] && echo 0 || echo 1)"
cf_eq "D1b user has no ledger rows" 0 "$(cf_ledger_rows "$ATOK" "$ID_A")"
del_user "$ID_A"
cf_eq "D1c delete returns 204" 204 "$CF_STATUS" "$CF_BODY"
cf_eq "D1d user is actually gone" "" "$(cf_user_id "$ATOK" "cf_test_del_a_$N@staging.invalid")"

# ---- D2: core ledger rows ---------------------------------------------------
echo "== D2/D4: delete a user with core ledger rows =="
read -r ID_B TOK_B <<< "$(mkuser "cf_test_del_b_$N@staging.invalid")"
cf_commit "$TOK_B" core 0 "del-b-1-$N" '{"x":1}'; cf_assert_commit_ok "D2a core commit for user B" core 1
cf_commit "$TOK_B" core 1 "del-b-2-$N" '{"x":2}'; cf_assert_commit_ok "D2b second core commit"     core 2
LB=$(cf_ledger_rows "$ATOK" "$ID_B")
cf_eq "D2c user B has ledger rows" 2 "$LB"
del_user "$ID_B"
cf_eq "D2d delete returns 204 despite ledger rows (cascadeDelete works)" 204 "$CF_STATUS" "$CF_BODY"
cf_eq "D4a all of user B's ledger rows were cascaded away" 0 "$(cf_ledger_rows "$ATOK" "$ID_B")"
cf_eq "D4b user B's appdata row is gone too" 0 "$(cf_appdata_rows "$ATOK" "$ID_B")"

# ---- D3/D5: core + training, and another user's rows survive ----------------
echo "== D3/D5: mixed-subsystem ledger, and isolation from another user =="
read -r ID_C TOK_C <<< "$(mkuser "cf_test_del_c_$N@staging.invalid")"
read -r ID_D TOK_D <<< "$(mkuser "cf_test_del_d_$N@staging.invalid")"
cf_commit "$TOK_C" core     0 "del-c-core-$N"  '{"c":1}'; cf_assert_commit_ok "D3a user C core commit"     core     1
cf_commit "$TOK_C" training 0 "del-c-train-$N" '{"c":2}'; cf_assert_commit_ok "D3b user C training commit" training 1
cf_commit "$TOK_D" core     0 "del-d-core-$N"  '{"d":1}'; cf_assert_commit_ok "D3c user D core commit"     core     1
cf_eq "D3d user C has two ledger rows across subsystems" 2 "$(cf_ledger_rows "$ATOK" "$ID_C")"
D_BEFORE=$(cf_ledger_rows "$ATOK" "$ID_D")
del_user "$ID_C"
cf_eq "D3e delete returns 204 with mixed-subsystem ledger rows" 204 "$CF_STATUS" "$CF_BODY"
cf_eq "D4c all of user C's ledger rows are gone" 0 "$(cf_ledger_rows "$ATOK" "$ID_C")"
cf_eq "D5a user D's ledger rows are untouched" "$D_BEFORE" "$(cf_ledger_rows "$ATOK" "$ID_D")"
cf_eq "D5b user D still exists" "$ID_D" "$(cf_user_id "$ATOK" "cf_test_del_d_$N@staging.invalid")"

# ---- D6: deleting a ledger row does not delete the user ---------------------
echo "== D6: the cascade is one-directional =="
ROW=$(curl -sS --max-time 30 -G "$BASE/api/collections/cf_commit_log/records" --data-urlencode "filter=user=\"$ID_D\"" \
      -H "Authorization: $ATOK" | python3 -c 'import sys,json;i=json.load(sys.stdin).get("items",[]);print(i[0]["id"] if i else "")')
if [ -n "$ROW" ]; then
  cf_req DELETE "/api/collections/cf_commit_log/records/$ROW" "$ATOK"
  cf_eq "D6a ledger row deleted" 204 "$CF_STATUS" "$CF_BODY"
  cf_eq "D6b the owning user still exists" "$ID_D" "$(cf_user_id "$ATOK" "cf_test_del_d_$N@staging.invalid")"
  cf_eq "D6c the user's appdata row still exists" 1 "$(cf_appdata_rows "$ATOK" "$ID_D")"
else
  cf_bad "D6 could not find a ledger row for user D"
fi

# cleanup this suite's own users
del_user "$ID_D"; cf_eq "D6d cleanup: user D removed" 204 "$CF_STATUS" "$CF_BODY"

# ---- D7: the teardown script itself must verify -----------------------------
echo "== D7: fixtures.sh teardown reports honestly =="
echo "   (verified by run-all.sh, which fails the run if teardown exits nonzero"
echo "    or leaves any user/appdata/ledger row behind)"
GHOST="cf_test_del_ghost_$N@staging.invalid"
read -r ID_G TOK_G <<< "$(mkuser "$GHOST")"
cf_commit "$TOK_G" core 0 "del-ghost-$N" '{"g":1}' >/dev/null
del_user "$ID_G"
cf_eq "D7a a user with ledger rows deletes cleanly end-to-end" 204 "$CF_STATUS" "$CF_BODY"
cf_eq "D7b and leaves nothing behind" 0 "$(cf_ledger_rows "$ATOK" "$ID_G")"

cf_summary "deletion-and-retention"
