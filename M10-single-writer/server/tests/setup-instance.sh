#!/bin/bash
# Assemble a DISPOSABLE local PocketBase instance running the M10 package.
# Usage: setup-instance.sh <instance-dir> [enforce]
# Fresh pb_data every time — never pointed at anything non-disposable.
set -euo pipefail
DIR="$1"; MODE="${2:-off}"
PKG="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$HOME/.claude/jobs/1f705b64/tmp/pblocal/pocketbase"
# Assemble fresh ONLY when the instance does not exist yet — a re-serve of an
# existing dir must preserve pb_data (T9 inspects downed state across restarts).
if [ -d "$DIR/pb_data" ]; then cd "$DIR";
  export CF_M10_TEST_ENABLE=1
  if [ "$MODE" = "enforce" ]; then export CF_M10_ENFORCE_OVERRIDE=1; fi
  exec ./pocketbase serve --http 127.0.0.1:${PB_PORT:-8098} --dir pb_data
fi
rm -rf "$DIR"; mkdir -p "$DIR/pb_hooks" "$DIR/pb_migrations"
cp "$PKG/pb_hooks/"*.js "$DIR/pb_hooks/"
cp "$PKG/pb_migrations/"*.js "$DIR/pb_migrations/"
# Test fixtures: base collections a fresh disposable lacks + probes.
cp "$PKG/tests/fixture-base.js"   "$DIR/pb_migrations/1753300000_fixture_base.js"
cp "$PKG/tests/fixture-photos.js" "$DIR/pb_migrations/1753300001_fixture_photos.js"
if ls "$PKG/tests/"probe-*.pb.js >/dev/null 2>&1; then cp "$PKG/tests/"probe-*.pb.js "$DIR/pb_hooks/"; fi
cp "$BIN" "$DIR/pocketbase"
cd "$DIR"
./pocketbase superuser upsert probe@local.test probe-password-1 --dir pb_data >/dev/null 2>&1 || true
export CF_M10_TEST_ENABLE=1
if [ "$MODE" = "enforce" ]; then export CF_M10_ENFORCE_OVERRIDE=1; fi
exec ./pocketbase serve --http 127.0.0.1:${PB_PORT:-8098} --dir pb_data
