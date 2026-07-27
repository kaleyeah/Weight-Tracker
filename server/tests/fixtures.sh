#!/usr/bin/env bash
# Compound Fitness — disposable staging fixtures. STAGING ONLY.
#
# Replaces legacy/setup-fixtures.sh, whose teardown printed "deleted <email>"
# without ever checking the DELETE status — it reported success while leaving
# accounts behind (Round 2 defect 4). Product Architect requirement:
#
#   "teardown must capture every DELETE status, print failure bodies, exit
#    nonzero on failure, and verify user/appdata/ledger absence before
#    reporting success."
#
# Usage:
#   BASE=http://127.0.0.1:8091 ADMIN_EMAIL=.. ADMIN_PASS=.. STAGING_CONFIRM=YES bash fixtures.sh [teardown]
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; . "$DIR/_lib.sh"
cf_guard
ADMIN_EMAIL="${ADMIN_EMAIL:?set ADMIN_EMAIL}"; ADMIN_PASS="${ADMIN_PASS:?set ADMIN_PASS}"
trap 'rm -rf "$CF_TMP"' EXIT

USERS="cf_test_1@staging.invalid cf_test_2@staging.invalid"
ATOK=$(cf_admin_token "$ADMIN_EMAIL" "$ADMIN_PASS")
[ -n "$ATOK" ] || { echo "FATAL: superuser auth failed"; exit 1; }

if [ "${1:-}" = "teardown" ]; then
  RC=0
  for em in $USERS; do
    ID=$(cf_user_id "$ATOK" "$em")
    if [ -z "$ID" ]; then echo "absent   $em (nothing to delete)"; continue; fi

    # appdata row first (no cascade from users -> appdata is assumed)
    RID=$(cf_curl "$ATOK" -sS --max-time 30 -G "$BASE/api/collections/appdata/records" --data-urlencode "filter=user=\"$ID\"" \
      | python3 -c 'import sys,json;i=json.load(sys.stdin).get("items",[]);print(i[0]["id"] if i else "")')
    if [ -n "$RID" ]; then
      cf_req DELETE "/api/collections/appdata/records/$RID" "$ATOK"
      if [ "$CF_STATUS" != "204" ] && [ "$CF_STATUS" != "200" ]; then
        echo "FAIL     appdata delete for $em -> HTTP $CF_STATUS"; echo "         $(printf '%s' "$CF_BODY" | cf_redact | head -c 300)"; RC=1
      fi
    fi

    # the user itself — cf_commit_log rows must cascade (Architect decision 3)
    cf_req DELETE "/api/collections/users/records/$ID" "$ATOK"
    if [ "$CF_STATUS" != "204" ] && [ "$CF_STATUS" != "200" ]; then
      echo "FAIL     user delete for $em -> HTTP $CF_STATUS"
      echo "         $(printf '%s' "$CF_BODY" | cf_redact | head -c 300)"
      RC=1; continue
    fi

    # verify ACTUAL absence — a 204 is not proof
    STILL=$(cf_user_id "$ATOK" "$em")
    LEFT_APPDATA=$(cf_appdata_rows "$ATOK" "$ID")
    LEFT_LEDGER=$(cf_ledger_rows "$ATOK" "$ID")
    if [ -n "$STILL" ]; then echo "FAIL     $em still present after delete"; RC=1
    elif [ "$LEFT_APPDATA" != "0" ]; then echo "FAIL     $em: $LEFT_APPDATA appdata row(s) survive"; RC=1
    elif [ "$LEFT_LEDGER" != "0" ]; then echo "FAIL     $em: $LEFT_LEDGER ledger row(s) survive (cascadeDelete not working)"; RC=1
    else echo "verified $em removed (user + appdata + ledger all absent)"; fi
  done
  [ "$RC" = "0" ] && echo "TEARDOWN OK" || echo "TEARDOWN FAILED"
  exit $RC
fi

# ---- create -----------------------------------------------------------------
PW="cf-test-$(python3 -c 'import secrets;print(secrets.token_urlsafe(18))')"
RC=0
for em in $USERS; do
  ( umask 077
    CF_EM="$em" CF_NEWPW="$PW" python3 -c \
      'import json,os;print(json.dumps({"email":os.environ["CF_EM"],"password":os.environ["CF_NEWPW"],"passwordConfirm":os.environ["CF_NEWPW"],"verified":True}))' \
      > "$CF_TMP/u.json" )
  cf_req POST /api/collections/users/records "$ATOK" "$CF_TMP/u.json"
  if [ "$CF_STATUS" = "200" ]; then echo "created  $em"
  else echo "FAIL     create $em -> HTTP $CF_STATUS: $(printf '%s' "$CF_BODY" | cf_redact | head -c 200)"; RC=1; fi
done
[ "$RC" = "0" ] || exit 1

# Emit credentials to a 600 file rather than stdout. legacy/setup-fixtures.sh
# printed the password in cleartext even though DEPLOYMENT.md step 6 claims the
# scripts redact credentials.
umask 077
cat > "$DIR/.fixture-creds.env" <<EOF
EMAIL=cf_test_1@staging.invalid
PASS=$PW
EMAIL2=cf_test_2@staging.invalid
PASS2=$PW
EOF
echo ""
echo "Fixtures ready. Credentials written to tests/.fixture-creds.env (mode 600, gitignored)."
echo "Run the suite with:  BASE=$BASE ADMIN_EMAIL=... ADMIN_PASS=... STAGING_CONFIRM=YES bash run-all.sh"
echo "Teardown afterwards: bash fixtures.sh teardown"
