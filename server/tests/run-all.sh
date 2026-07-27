#!/usr/bin/env bash
# Compound Fitness — CAS staging suite runner. STAGING ONLY, DISPOSABLE USERS ONLY.
#
# Order matters and mirrors the Product Architect's required Phase 1 sequence:
#   route smoke first (prove the handler runtime executes our code at all),
#   then contract suites, then fault injection, then verified teardown.
#
# Usage:
#   BASE=http://127.0.0.1:8091 ADMIN_EMAIL=.. ADMIN_PASS=.. \
#   PB_BIN=.. PB_DATA_DIR=.. PRISTINE_DIR=.. MIGRATIONS_DIR=.. \
#   STAGING_CONFIRM=YES bash run-all.sh [evidence-dir]
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; . "$DIR/_lib.sh"
cf_guard
ADMIN_EMAIL="${ADMIN_EMAIL:?}"; ADMIN_PASS="${ADMIN_PASS:?}"
EV="${1:-$DIR/evidence}"; mkdir -p "$EV"

FAILED=""; RAN=0
run() { # logname command...
  local name="$1"; shift
  RAN=$((RAN+1))
  printf '\n═══ %s ═══\n' "$name"
  if "$@" 2>&1 | tee "$EV/$name.log"; then
    printf '   ✔ %s\n' "$name"
  else
    printf '   ✗ %s FAILED\n' "$name"
    FAILED="$FAILED $name"
  fi
}

export BASE ADMIN_EMAIL ADMIN_PASS STAGING_CONFIRM

# 1. Route smoke — everything else is meaningless if this fails.
run route-smoke bash "$DIR/route-smoke.sh"
if printf '%s' "$FAILED" | grep -q route-smoke; then
  echo ""
  echo "ABORTING: the route smoke test failed. Per the Product Architect, a generic"
  echo "PocketBase framework error body is always a failure — running the rest of the"
  echo "suite against a non-executing handler produces false passes (Round 2 defect 2)."
  exit 1
fi

# 2. Contract suites.
run validation          bash    "$DIR/validation.sh"
run cas-concurrency     python3 "$DIR/cas-concurrency.py"
run idempotency         python3 "$DIR/idempotency.py"
run field-isolation     bash    "$DIR/field-isolation.sh"
run auth-and-ownership  bash    "$DIR/auth-and-ownership.sh"
run legacy-bridge       bash    "$DIR/legacy-bridge.sh"
run payload-boundary    bash    "$DIR/payload-boundary.sh"
run deletion-cascade    bash    "$DIR/deletion-and-retention.sh"

# 3. Migration portability — needs the binary and a pristine data dir.
if [ -n "${PB_BIN:-}" ] && [ -n "${PRISTINE_DIR:-}" ] && [ -n "${MIGRATIONS_DIR:-}" ]; then
  run migration env PB_BIN="$PB_BIN" PRISTINE_DIR="$PRISTINE_DIR" MIGRATIONS_DIR="$MIGRATIONS_DIR" \
    bash "$DIR/migration.sh"
else
  echo ""
  echo "SKIP  migration — set PB_BIN, PRISTINE_DIR and MIGRATIONS_DIR to run it."
  FAILED="$FAILED migration(SKIPPED)"
fi

# 4. Fault injection last: it deliberately breaks the instance.
if [ -n "${PB_DATA_DIR:-}" ] && [ -n "${PB_BIN:-}" ] && [ -n "${PB_HOOKS_DIR:-}" ]; then
  run fault-injection env PB_DATA_DIR="$PB_DATA_DIR" PB_BIN="${PB_BIN:-}" \
    PB_HOOKS_DIR="${PB_HOOKS_DIR:-}" PB_MIGRATIONS_DIR="${PB_MIGRATIONS_DIR:-}" \
    PB_ADDR="${PB_ADDR:-127.0.0.1:8091}" bash "$DIR/fault-injection.sh"
else
  echo ""
  echo "SKIP  fault-injection — set PB_DATA_DIR, PB_BIN and PB_HOOKS_DIR to run it."
  FAILED="$FAILED fault-injection(SKIPPED)"
fi

# 5. Verified teardown — must exit nonzero if anything survives.
printf '\n═══ teardown ═══\n'
if bash "$DIR/fixtures.sh" teardown 2>&1 | tee "$EV/teardown.log"; then
  echo "   ✔ teardown verified"
else
  echo "   ✗ teardown FAILED — disposable fixtures survive"
  FAILED="$FAILED teardown"
fi

printf '\n════════════════════════════════════════\n'
if [ -z "$FAILED" ]; then
  echo "ALL SUITES PASSED ($RAN run). Evidence in $EV"
  exit 0
fi
echo "FAILED / SKIPPED:$FAILED"
echo "Evidence in $EV"
exit 1
