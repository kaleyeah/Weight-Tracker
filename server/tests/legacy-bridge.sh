#!/usr/bin/env bash
# Legacy-write bridge — SERVER_NOTES.md §2 "stale cached clients" and §3.
# Pre-lockdown a raw PATCH must still succeed AND bump the matching revision
# exactly once, so CAS clients detect every legacy write. Post-lockdown the
# same write must be rule-blocked while operational fields keep working.
# This suite adapts to whichever state the instance is in and says which.
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; . "$DIR/_lib.sh"
cf_guard
. "$DIR/.fixture-creds.env"
ADMIN_EMAIL="${ADMIN_EMAIL:?}"; ADMIN_PASS="${ADMIN_PASS:?}"
trap 'rm -rf "$CF_TMP"' EXIT
T1=$(cf_user_token "$EMAIL" "$PASS"); ATOK=$(cf_admin_token "$ADMIN_EMAIL" "$ADMIN_PASS")
UID1=$(cf_user_id "$ATOK" "$EMAIL")
N=$(date +%s%N)

cf_commit "$T1" core 999999 "lb-probe-$N" '{}'; CUR=$(cf_server_rev)
if [ "$CUR" = "0" ]; then cf_commit "$T1" core 0 "lb-seed-$N" '{"seed":1}'; CUR=1; fi
RID=$(curl -sS --max-time 30 -G "$BASE/api/collections/appdata/records" --data-urlencode "filter=user=\"$UID1\"" \
      -H "Authorization: $ATOK" | python3 -c 'import sys,json;i=json.load(sys.stdin).get("items",[]);print(i[0]["id"] if i else "")')

echo "== raw snapshot PATCH: bridge (pre-lockdown) or blocked (post-lockdown) =="
BEFORE=$(cf_rev "$ATOK" "$UID1" coreRev)
printf '{"data":{"legacy":true}}' > "$CF_TMP/legacy.json"
cf_req PATCH "/api/collections/appdata/records/$RID" "$T1" "$CF_TMP/legacy.json"
LS="$CF_STATUS"
if [ "$LS" = "200" ]; then
  echo "   instance state: BRIDGE ACTIVE (pre-lockdown)"
  AFTER=$(cf_rev "$ATOK" "$UID1" coreRev)
  cf_eq "LB1 bridge bumps coreRev EXACTLY once" "$((BEFORE+1))" "$AFTER"
  T_BEFORE=$(cf_rev "$ATOK" "$UID1" trainingRev)
  printf '{"training":{"legacy":true}}' > "$CF_TMP/legacyt.json"
  cf_req PATCH "/api/collections/appdata/records/$RID" "$T1" "$CF_TMP/legacyt.json"
  cf_eq "LB2 raw training write accepted" 200 "$CF_STATUS" "$CF_BODY"
  cf_eq "LB3 bridge bumps trainingRev EXACTLY once" "$((T_BEFORE+1))" "$(cf_rev "$ATOK" "$UID1" trainingRev)"
  cf_eq "LB4 raw training write does not move coreRev" "$AFTER" "$(cf_rev "$ATOK" "$UID1" coreRev)"
  echo "   NOTE: the route saves programmatically inside its transaction, which fires no"
  echo "         *RequestEvent hooks — that is why a route commit is never double-bumped."
  C1=$(cf_rev "$ATOK" "$UID1" coreRev)
  cf_commit "$T1" core "$C1" "lb-route-$N" '{"viaRoute":true}'
  cf_assert_commit_ok "LB5 route commit after a legacy write" core "$((C1+1))"
  cf_eq "LB6 route commit advanced coreRev by exactly one (no bridge double-count)" "$((C1+1))" "$(cf_rev "$ATOK" "$UID1" coreRev)"
elif [ "$LS" = "403" ] || [ "$LS" = "404" ]; then
  echo "   instance state: LOCKED DOWN"
  cf_ok "LB1 raw snapshot PATCH blocked ($LS)"
  cf_eq "LB2 blocked write did not move coreRev" "$BEFORE" "$(cf_rev "$ATOK" "$UID1" coreRev)"
  printf '{"health":null}' > "$CF_TMP/h.json"
  cf_req PATCH "/api/collections/appdata/records/$RID" "$T1" "$CF_TMP/h.json"
  cf_eq "LB3 operational field (health) still writable after lockdown" 200 "$CF_STATUS" "$CF_BODY"
else
  cf_bad "LB1 raw PATCH returned an unapproved status (want 200 bridge / 403 / 404 lockdown), got $LS" "$CF_BODY"
fi

echo "== revision fields remain server-managed in both states =="
printf '{"data":{"x":1},"coreRev":5}' > "$CF_TMP/mixed.json"
cf_req PATCH "/api/collections/appdata/records/$RID" "$T1" "$CF_TMP/mixed.json"
cf_eq "LB7 a mixed body containing coreRev is rejected" 400 "$CF_STATUS" "$CF_BODY"

cf_summary "legacy-bridge"
