#!/usr/bin/env bash
# Compound Fitness — disposable PRODUCTION probe account for the cutover gate.
#
# APPROVED BY THE PRODUCT ARCHITECT (production gate review, 2026-07-27):
#
#   "Use a disposable production probe account. Execute authenticated route
#    probes. Delete the account immediately afterward. Verify account and
#    ledger absence."
#
# Why an account is needed at all: `verify-deployment.sh` checks V11b and V11c
# prove the commit route EXECUTES OUR CODE rather than merely being registered.
# Round 2 shipped a route that was registered and threw `ReferenceError` on
# every request — a liveness check that only tells 401 from 404 would have
# passed it. Both probes need an authenticated `users` token, and production has
# no disposable account, so the runbook creates one for the length of the gate.
#
# This is the ONE production write in the whole runbook. It is a user row and
# nothing else: no appdata row, no health data, no snapshot. Both probes are
# rejected by our own validators before any database access, so the account
# never accumulates data. `teardown` then verifies real absence — of the user,
# any appdata row, and any ledger row — rather than trusting a 204.
#
# Sibling of `fixtures.sh`, which does the same job for staging and is guarded
# to loopback. This one may address production, so it is deliberately narrower:
# it touches exactly one hard-coded `cf_test_*` address and has no other powers.
#
# Usage:
#   BASE=<url> ADMIN_EMAIL=.. ADMIN_PASS=.. bash probe-account.sh create
#   BASE=<url> ADMIN_EMAIL=.. ADMIN_PASS=.. bash probe-account.sh teardown
#
#   Set PROBE_EXPECT_APPDATA=YES on teardown when the probe was used for
#   idempotency verification (I1-I8), which commits on purpose. Leave it unset
#   for read-only deployment probes, where an appdata row IS a finding.
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; . "$DIR/_lib.sh"
BASE="${BASE:?set BASE}"
ADMIN_EMAIL="${ADMIN_EMAIL:?set ADMIN_EMAIL}"; ADMIN_PASS="${ADMIN_PASS:?set ADMIN_PASS}"
MODE="${1:?usage: probe-account.sh create|teardown}"
trap 'rm -rf "$CF_TMP"' EXIT

# Hard-coded and disposable by construction. This script can never be pointed at
# a real athlete account, whatever it is handed.
PROBE="cf_test_prod@staging.invalid"

ATOK=$(cf_admin_token "$ADMIN_EMAIL" "$ADMIN_PASS")
[ -n "$ATOK" ] || { echo "FATAL: superuser auth failed"; exit 1; }

case "$MODE" in
create)
  ID=$(cf_user_id "$ATOK" "$PROBE")
  [ -z "$ID" ] || { echo "REFUSED: $PROBE already exists (id $ID). Run teardown first."; exit 2; }
  PW="cf-probe-$(python3 -c 'import secrets;print(secrets.token_urlsafe(18))')"
  ( umask 077
    CF_EM="$PROBE" CF_NEWPW="$PW" python3 -c \
      'import json,os;print(json.dumps({"email":os.environ["CF_EM"],"password":os.environ["CF_NEWPW"],"passwordConfirm":os.environ["CF_NEWPW"],"verified":True}))' \
      > "$CF_TMP/u.json" )
  cf_req POST /api/collections/users/records "$ATOK" "$CF_TMP/u.json"
  if [ "$CF_STATUS" != "200" ]; then
    echo "FAIL: create $PROBE -> HTTP $CF_STATUS: $(printf '%s' "$CF_BODY" | cf_redact | head -c 200)"; exit 1
  fi
  umask 077
  cat > "$DIR/.probe-creds.env" <<EOF
PROBE_EMAIL=$PROBE
PROBE_PASS=$PW
EOF
  echo "created  $PROBE"
  echo "Credentials written to tests/.probe-creds.env (mode 600, gitignored)."
  echo ""
  echo "Next:  set -a; . ./.probe-creds.env; set +a   then run verify-deployment.sh"
  echo "Then:  bash probe-account.sh teardown        — immediately afterwards, per the ruling"
  ;;

teardown)
  RC=0
  ID=$(cf_user_id "$ATOK" "$PROBE")
  if [ -z "$ID" ]; then
    echo "absent   $PROBE (nothing to delete)"
  else
    # appdata row first — the probes should never have created one, so say so
    # loudly if there is one rather than quietly cleaning it up.
    RID=$(cf_curl "$ATOK" -sS --max-time 30 -G "$BASE/api/collections/appdata/records" --data-urlencode "filter=user=\"$ID\"" \
      | python3 -c 'import sys,json;i=json.load(sys.stdin).get("items",[]);print(i[0]["id"] if i else "")')
    if [ -n "$RID" ]; then
      # Whether this row is expected depends on what the probe was used FOR, and
      # the old wording asserted the read-only case unconditionally — so an
      # idempotency run, which commits on purpose, printed a warning that read
      # like a defect. Say which situation this is (Architect production review,
      # 2026-07-29 §6).
      if [ "${PROBE_EXPECT_APPDATA:-}" = "YES" ]; then
        echo "NOTE     $PROBE has an appdata row ($RID) — EXPECTED for idempotency"
        echo "         verification (I1-I8 commit deliberately). Removing it now."
      else
        echo "NOTE     $PROBE has an appdata row ($RID) — NOT expected for a read-only"
        echo "         deployment probe, whose checks are rejected by our validators before"
        echo "         any database access. Record this: something reached the write path."
      fi
      cf_req DELETE "/api/collections/appdata/records/$RID" "$ATOK"
      case "$CF_STATUS" in 200|204) :;; *) echo "FAIL     appdata delete -> HTTP $CF_STATUS"; RC=1;; esac
    fi
    cf_req DELETE "/api/collections/users/records/$ID" "$ATOK"
    case "$CF_STATUS" in
      200|204) :;;
      *) echo "FAIL     user delete -> HTTP $CF_STATUS: $(printf '%s' "$CF_BODY" | cf_redact | head -c 200)"; RC=1;;
    esac
  fi

  # Verified absence — a 204 is not proof (Round 2 defect 4).
  if [ "$RC" = "0" ] && [ -n "$ID" ]; then
    STILL=$(cf_user_id "$ATOK" "$PROBE")
    LEFT_APPDATA=$(cf_appdata_rows "$ATOK" "$ID")
    LEFT_LEDGER=$(cf_ledger_rows "$ATOK" "$ID")
    if   [ -n "$STILL" ];            then echo "FAIL     $PROBE still present after delete"; RC=1
    elif [ "$LEFT_APPDATA" != "0" ]; then echo "FAIL     $LEFT_APPDATA appdata row(s) survive"; RC=1
    elif [ "$LEFT_LEDGER" != "0" ];  then echo "FAIL     $LEFT_LEDGER ledger row(s) survive (cascadeDelete not working)"; RC=1
    else echo "verified $PROBE removed (user + appdata + ledger all absent)"; fi
  fi

  rm -f "$DIR/.probe-creds.env"
  [ "$RC" = "0" ] && echo "PROBE TEARDOWN OK" || echo "PROBE TEARDOWN FAILED"
  exit $RC
  ;;

*) echo "usage: probe-account.sh create|teardown"; exit 2;;
esac
