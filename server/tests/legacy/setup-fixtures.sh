#!/usr/bin/env bash
# Create DISPOSABLE staging test users (addendum #4). STAGING ONLY.
# Usage: BASE=https://staging:8091 ADMIN_EMAIL=.. ADMIN_PASS=.. bash setup-fixtures.sh [teardown]
set -euo pipefail
BASE="${BASE:?set BASE}"; ADMIN_EMAIL="${ADMIN_EMAIL:?set ADMIN_EMAIL}"; ADMIN_PASS="${ADMIN_PASS:?set ADMIN_PASS}"
case "$BASE" in *rack.tail6fa16c.ts.net*) [ "${BASE##*:}" != "${BASE#https://rack.tail6fa16c.ts.net}" ] || { echo "REFUSED: BASE looks like PRODUCTION. Point at the staging instance/port."; exit 2; };; esac
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
J(){ python3 -c 'import json,sys;print(json.dumps({sys.argv[1]:sys.argv[2],sys.argv[3]:sys.argv[4]}))' "$@"; }
ATOK=$(curl -sS --max-time 20 "$BASE/api/collections/_superusers/auth-with-password" -H 'Content-Type: application/json' \
  -d "$(J identity "$ADMIN_EMAIL" password "$ADMIN_PASS")" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))')
[ -n "$ATOK" ] || { echo "FATAL: superuser auth failed"; exit 1; }
PW="cf-test-$(date +%s)-pw"
if [ "${1:-}" = "teardown" ]; then
  for em in cf_test_1@staging.invalid cf_test_2@staging.invalid; do
    ID=$(curl -sS --max-time 20 "$BASE/api/collections/users/records?filter=$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(f"email=\"{sys.argv[1]}\""))' "$em")" -H "Authorization: $ATOK" | python3 -c 'import sys,json;i=json.load(sys.stdin).get("items",[]);print(i[0]["id"] if i else "")')
    if [ -n "$ID" ]; then
      RID=$(curl -sS --max-time 20 "$BASE/api/collections/appdata/records?filter=$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(f"user=\"{sys.argv[1]}\""))' "$ID")" -H "Authorization: $ATOK" | python3 -c 'import sys,json;i=json.load(sys.stdin).get("items",[]);print(i[0]["id"] if i else "")')
      [ -n "$RID" ] && curl -sS --max-time 20 -X DELETE "$BASE/api/collections/appdata/records/$RID" -H "Authorization: $ATOK" >/dev/null
      curl -sS --max-time 20 -X DELETE "$BASE/api/collections/users/records/$ID" -H "Authorization: $ATOK" >/dev/null
      echo "deleted $em"
    fi
  done
  exit 0
fi
for em in cf_test_1@staging.invalid cf_test_2@staging.invalid; do
  python3 -c 'import json,sys;print(json.dumps({"email":sys.argv[1],"password":sys.argv[2],"passwordConfirm":sys.argv[2],"verified":True}))' "$em" "$PW" > "$TMP/u.json"
  curl -sS --max-time 20 "$BASE/api/collections/users/records" -H "Authorization: $ATOK" -H 'Content-Type: application/json' --data-binary "@$TMP/u.json" >/dev/null && echo "created $em"
done
echo ""
echo "Fixtures ready. Run the suite with:"
echo "  BASE=$BASE EMAIL=cf_test_1@staging.invalid PASS=$PW EMAIL2=cf_test_2@staging.invalid PASS2=$PW \\"
echo "  ADMIN_EMAIL=... ADMIN_PASS=... STAGING_CONFIRM=YES bash cas-server-tests.sh"
echo "Teardown afterwards: bash setup-fixtures.sh teardown"
