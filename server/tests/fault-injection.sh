#!/usr/bin/env bash
# Fault injection — DEPLOYMENT.md appendix, both cases. STAGING ONLY.
#
#   F1 forced mid-transaction rollback: make the data directory read-only,
#      issue a commit, restore, then verify the revision did NOT advance and no
#      ledger row exists for that key.
#   F2 missing-ledger fail-closed: rename cf_commit_log, issue a commit, expect
#      500 — never 200, never a false 409 — with no revision advance; restore.
#
# Both cases must leave the instance healthy. F2 in particular proves the route
# fails CLOSED: a commit that cannot be journalled must not silently succeed.
#
# Usage: PB_DATA_DIR=... BASE=... ADMIN_EMAIL=... ADMIN_PASS=... STAGING_CONFIRM=YES bash fault-injection.sh
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; . "$DIR/_lib.sh"
cf_guard
. "$DIR/.fixture-creds.env"
ADMIN_EMAIL="${ADMIN_EMAIL:?}"; ADMIN_PASS="${ADMIN_PASS:?}"
PB_DATA_DIR="${PB_DATA_DIR:?set PB_DATA_DIR (the staging pb_data directory)}"
trap 'rm -rf "$CF_TMP"' EXIT
T1=$(cf_user_token "$EMAIL" "$PASS"); ATOK=$(cf_admin_token "$ADMIN_EMAIL" "$ADMIN_PASS")
UID1=$(cf_user_id "$ATOK" "$EMAIL")
N=$(date +%s%N)

rev() { cf_commit "$T1" core 999999 "fx-probe-$N-$RANDOM" '{}'; cf_server_rev; }
ledger_for() { curl -sS --max-time 30 -G "$BASE/api/collections/cf_commit_log/records" \
  --data-urlencode "filter=user=\"$UID1\" && key=\"$1\"" -H "Authorization: $ATOK" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("totalItems",0))'; }

# ---- F1 forced mid-transaction rollback ------------------------------------
# chmod alone does NOT work against a running server: SQLite already holds
# writable file descriptors, and permission bits are only consulted at open().
# The store must therefore be made read-only while the process is DOWN, so
# PocketBase reopens the database without write access.
echo "== F1: write failure mid-transaction must roll back completely =="
PB_BIN="${PB_BIN:?set PB_BIN for F1}"
PB_HOOKS_DIR="${PB_HOOKS_DIR:?set PB_HOOKS_DIR for F1}"
PB_MIGRATIONS_DIR="${PB_MIGRATIONS_DIR:?set PB_MIGRATIONS_DIR for F1}"
PB_ADDR="${PB_ADDR:-127.0.0.1:8091}"

stop_server() { pkill -x pocketbase 2>/dev/null; for _ in $(seq 20); do pgrep -x pocketbase >/dev/null || break; sleep 0.3; done; }
start_server() {
  nohup "$PB_BIN" serve --http="$PB_ADDR" --dir="$PB_DATA_DIR" \
    --hooksDir="$PB_HOOKS_DIR" --migrationsDir="$PB_MIGRATIONS_DIR" >"$CF_TMP/pb.log" 2>&1 &
  for _ in $(seq 30); do
    curl -sf --max-time 2 "$BASE/api/health" >/dev/null 2>&1 && return 0
    sleep 0.5
  done
  return 1
}
restore_rw() { chmod u+w "$PB_DATA_DIR" "$PB_DATA_DIR"/*.db "$PB_DATA_DIR"/*-wal "$PB_DATA_DIR"/*-shm 2>/dev/null; }
# never leave the instance read-only or down, whatever happens below
trap 'restore_rw; pgrep -x pocketbase >/dev/null || start_server >/dev/null 2>&1; rm -rf "$CF_TMP"' EXIT

BEFORE=$(rev)
KEY="fx-$N-rollback"

echo "   stopping the server, revoking write permission, restarting..."
stop_server
chmod a-w "$PB_DATA_DIR"/*.db "$PB_DATA_DIR"/*-wal "$PB_DATA_DIR"/*-shm 2>/dev/null
chmod a-w "$PB_DATA_DIR" 2>/dev/null
if start_server; then
  F1_UP=1
  cf_commit "$T1" core "$BEFORE" "$KEY" '{"should":"not-persist"}'
  F1_STATUS="$CF_STATUS"; F1_BODY="$CF_BODY"
else
  F1_UP=0
  F1_STATUS="server-refused-to-start"; F1_BODY="$(tail -5 "$CF_TMP/pb.log" 2>/dev/null)"
fi

echo "   restoring write permission and restarting..."
stop_server; restore_rw; start_server || echo "WARNING: server did not come back up"
trap 'rm -rf "$CF_TMP"' EXIT

if [ "$F1_UP" = "0" ]; then
  cf_ok "F1a the server refuses to serve at all on a read-only store (fails closed before any write)"
  echo "      log: $(printf '%s' "$F1_BODY" | head -c 200)"
else
  case "$F1_STATUS" in
    500) cf_ok "F1a a failed write returns 500 (never a misleading 409)";;
    200) cf_bad "F1a the commit reported SUCCESS while the store was read-only" "$F1_BODY";;
    409) cf_bad "F1a the commit returned a FALSE 409 — SERVER_NOTES §2 forbids this" "$F1_BODY";;
    *)   cf_bad "F1a expected 500 on a read-only store, got $F1_STATUS" "$F1_BODY";;
  esac
fi

# Whichever way the injection landed, the durable state must be untouched.
AFTER=$(rev)
cf_eq "F1b the revision did not advance"            "$BEFORE" "$AFTER"
cf_eq "F1c no ledger row exists for the failed key" 0         "$(ledger_for "$KEY")"
cf_req GET /api/health ""
cf_eq "F1d the server is healthy again after the injection" 200 "$CF_STATUS" "$CF_BODY"

# ---- F2 missing-ledger fail-closed -----------------------------------------
echo "== F2: a missing ledger collection must fail CLOSED =="
BEFORE=$(rev)
KEY="fx-$N-noledger"
LEDGER_ID=$(curl -sS --max-time 30 "$BASE/api/collections/cf_commit_log" -H "Authorization: $ATOK" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("id",""))')
if [ -z "$LEDGER_ID" ]; then
  cf_bad "F2 could not resolve the cf_commit_log collection id"
else
  echo "   renaming cf_commit_log -> cf_commit_log_x ..."
  printf '{"name":"cf_commit_log_x"}' > "$CF_TMP/ren.json"
  cf_req PATCH "/api/collections/$LEDGER_ID" "$ATOK" "$CF_TMP/ren.json"
  REN="$CF_STATUS"
  if [ "$REN" != "200" ]; then
    cf_bad "F2 could not rename the ledger collection (HTTP $REN)" "$CF_BODY"
  else
    cf_commit "$T1" core "$BEFORE" "$KEY" '{"should":"fail-closed"}'
    F2_STATUS="$CF_STATUS"; F2_BODY="$CF_BODY"
    echo "   restoring the ledger name..."
    printf '{"name":"cf_commit_log"}' > "$CF_TMP/ren2.json"
    cf_req PATCH "/api/collections/$LEDGER_ID" "$ATOK" "$CF_TMP/ren2.json"
    cf_eq "F2d the ledger collection was restored" 200 "$CF_STATUS" "$CF_BODY"

    case "$F2_STATUS" in
      500) cf_ok "F2a a missing ledger yields 500 — fail closed";;
      200) cf_bad "F2a THE COMMIT SUCCEEDED WITHOUT A LEDGER — idempotency is unenforceable" "$F2_BODY";;
      409) cf_bad "F2a returned a FALSE 409 instead of failing closed" "$F2_BODY";;
      *)   cf_bad "F2a expected 500, got $F2_STATUS" "$F2_BODY";;
    esac
    AFTER=$(rev)
    cf_eq "F2b the revision did not advance while the ledger was missing" "$BEFORE" "$AFTER"
    cf_eq "F2c no ledger row exists for the failed key" 0 "$(ledger_for "$KEY")"
  fi
fi

echo "== post-conditions =="
R=$(rev)
cf_commit "$T1" core "$R" "fx-$N-after" '{"after":"injection"}'
cf_assert_commit_ok "F3 normal commits still work after both injections" core "$((R+1))"

cf_summary "fault-injection"
