#!/usr/bin/env bash
# Field isolation — SERVER_NOTES.md §1 pbSave field mapping.
#   data     -> core CAS,     moves coreRev only
#   training -> training CAS, moves trainingRev only
#   health / coachreq -> operational, OUTSIDE CAS, move no revision
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; . "$DIR/_lib.sh"
cf_guard
. "$DIR/.fixture-creds.env"
ADMIN_EMAIL="${ADMIN_EMAIL:?}"; ADMIN_PASS="${ADMIN_PASS:?}"
trap 'rm -rf "$CF_TMP"' EXIT
T1=$(cf_user_token "$EMAIL" "$PASS"); ATOK=$(cf_admin_token "$ADMIN_EMAIL" "$ADMIN_PASS")
UID1=$(cf_user_id "$ATOK" "$EMAIL")
N=$(date +%s%N)

probe() { cf_commit "$T1" "$1" 999999 "fi-probe-$1-$N-$2" '{}'; cf_server_rev; }

CORE0=$(probe core a); TRAIN0=$(probe training a)
echo "baseline: coreRev=$CORE0 trainingRev=$TRAIN0"

echo "== a core commit moves coreRev only =="
cf_commit "$T1" core "$CORE0" "fi-$N-core" '{"marker":"core-only"}'
cf_assert_commit_ok "FI1 core commit succeeds" core "$((CORE0+1))"
cf_eq "FI2 trainingRev unchanged by a core commit" "$TRAIN0" "$(probe training b)"

echo "== a training commit moves trainingRev only =="
cf_commit "$T1" training "$TRAIN0" "fi-$N-train" '{"marker":"training-only"}'
cf_assert_commit_ok "FI3 training commit succeeds" training "$((TRAIN0+1))"
cf_eq "FI4 coreRev unchanged by a training commit" "$((CORE0+1))" "$(probe core c)"

echo "== each subsystem's conflict carries its OWN payload (no cross-bleed) =="
cf_commit "$T1" core 999998 "fi-$N-pc" '{}'
CP=$(cf_json payload)
printf '%s' "$CP" | grep -q 'core-only' && cf_ok "FI5 core conflict returns the core payload" \
  || cf_bad "FI5 core conflict should carry the core payload" "$CP"
cf_commit "$T1" training 999998 "fi-$N-pt" '{}'
TP=$(cf_json payload)
printf '%s' "$TP" | grep -q 'training-only' && cf_ok "FI6 training conflict returns the training payload" \
  || cf_bad "FI6 training conflict should carry the training payload" "$TP"

echo "== operational fields move no revision (SERVER_NOTES §1) =="
RID=$(cf_curl "$ATOK" -sS --max-time 30 -G "$BASE/api/collections/appdata/records" --data-urlencode "filter=user=\"$UID1\"" \
      | python3 -c 'import sys,json;i=json.load(sys.stdin).get("items",[]);print(i[0]["id"] if i else "")')
C_BEFORE=$(cf_rev "$ATOK" "$UID1" coreRev); T_BEFORE=$(cf_rev "$ATOK" "$UID1" trainingRev)
printf '{"health":null}' > "$CF_TMP/h.json"
cf_req PATCH "/api/collections/appdata/records/$RID" "$T1" "$CF_TMP/h.json"
cf_eq "FI7 health write accepted" 200 "$CF_STATUS" "$CF_BODY"
cf_eq "FI8 health write does not move coreRev"     "$C_BEFORE" "$(cf_rev "$ATOK" "$UID1" coreRev)"
cf_eq "FI9 health write does not move trainingRev" "$T_BEFORE" "$(cf_rev "$ATOK" "$UID1" trainingRev)"
printf '{"coachreq":null}' > "$CF_TMP/cq.json"
cf_req PATCH "/api/collections/appdata/records/$RID" "$T1" "$CF_TMP/cq.json"
cf_eq "FI10 coachreq write accepted" 200 "$CF_STATUS" "$CF_BODY"
cf_eq "FI11 coachreq write does not move coreRev"     "$C_BEFORE" "$(cf_rev "$ATOK" "$UID1" coreRev)"
cf_eq "FI12 coachreq write does not move trainingRev" "$T_BEFORE" "$(cf_rev "$ATOK" "$UID1" trainingRev)"

cf_summary "field-isolation"
