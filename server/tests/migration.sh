#!/usr/bin/env bash
# Migration portability and rollback — Product Architect Round 2, decision 4a.
#
# Required cases:
#   M1 fresh DB: creates and removes its own index
#   M2 pre-existing equivalent index: adopts it, and PRESERVES it on down
#   M3 rerun produces no duplicate
#   M4 up/down/up is clean
#   M5 composite / non-unique indexes do not satisfy the guard
#
# Rule being enforced (Architect): "Rollback may remove only schema protection
# installed by this migration."
#
# Each case runs against its own throwaway copy of a pristine pb_data — this
# suite never touches the shared staging instance.
#
# Usage: PB_BIN=... PRISTINE_DIR=... MIGRATIONS_DIR=... bash migration.sh
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; . "$DIR/_lib.sh"
PB_BIN="${PB_BIN:?set PB_BIN (path to the pocketbase binary)}"
PRISTINE_DIR="${PRISTINE_DIR:?set PRISTINE_DIR (a pb_data with production schema, CAS migration NOT applied)}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:?set MIGRATIONS_DIR}"
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT

KIT_INDEX="idx_cf_appdata_user"
PROD_INDEX="idx_88qok6ts7v"

# ---- helpers ---------------------------------------------------------------
fresh() { # scenario-name -> prints the new data dir
  local d="$WORK/$1"; rm -rf "$d"; cp -a "$PRISTINE_DIR" "$d"; chmod -R u+rwX "$d"; printf '%s' "$d"
}

set_indexes() { # datadir index-sql... (one statement per argument)
  local d="$1"; shift
  local jf="$WORK/idx.json"
  # NOTE: with `python3 -c`, sys.argv[0] is "-c" — the first real argument is
  # sys.argv[1]. Getting this wrong silently wrote to a file named "-c" and left
  # every index fixture unchanged, which faked six migration results.
  python3 -c 'import json,sys;json.dump(sys.argv[2:],open(sys.argv[1],"w"))' "$jf" "$@"
  python3 - "$d" "$jf" <<'PY'
import sqlite3, sys, json
db, idx = sys.argv[1] + "/data.db", json.load(open(sys.argv[2]))
c = sqlite3.connect(db)
# keep the collection model and the real sqlite indexes in agreement
for (name,) in c.execute("select name from sqlite_master where type='index' and tbl_name='appdata' and name not like 'sqlite_%'"):
    c.execute(f'DROP INDEX IF EXISTS "{name}"')
c.execute("update _collections set indexes=? where name='appdata'", (json.dumps(idx),))
for stmt in idx:
    c.execute(stmt)
c.commit()
PY
}

get_indexes() { # datadir -> one index definition per line
  python3 - "$1" <<'PY'
import sqlite3, sys, json
c = sqlite3.connect(sys.argv[1] + "/data.db")
print("\n".join(json.loads(c.execute("select indexes from _collections where name='appdata'").fetchone()[0])))
PY
}

has_col() { # datadir column -> yes/no
  python3 - "$1" "$2" <<'PY'
import sqlite3, sys
c = sqlite3.connect(sys.argv[1] + "/data.db")
print("yes" if sys.argv[2] in [r[1] for r in c.execute("PRAGMA table_info(appdata)")] else "no")
PY
}

has_ledger() { # datadir -> yes/no
  python3 - "$1" <<'PY'
import sqlite3, sys
c = sqlite3.connect(sys.argv[1] + "/data.db")
print("yes" if list(c.execute("select name from _collections where name='cf_commit_log'")) else "no")
PY
}

mig() { # datadir up|down  -> output in $MIG_OUT, status in $MIG_RC
  # `migrate down` asks "Do you really want to revert...? (y/N)" and EXITS 0
  # when cancelled, so rc alone is a false pass. Answer it, then verify the
  # output does not report a cancellation.
  MIG_OUT=$(printf 'y\n' | "$PB_BIN" migrate "$2" --dir="$1" --migrationsDir="$MIGRATIONS_DIR" 2>&1); MIG_RAW_RC=$?
  MIG_RC=$MIG_RAW_RC
  # PocketBase v0.39.8 exits 0 even when a migration FAILS (verified for both
  # `migrate up` and `serve`) — the log message is the only signal. Without
  # this translation every "succeeds" assertion below would be a false pass,
  # and a deploy script checking $? would treat a failed migration as success.
  case "$MIG_OUT" in
    *"has been cancelled"*) MIG_RC=99;;
    *"failed to apply migration"*|*"failed to revert migration"*) MIG_RC=98;;
  esac
}

count_user_unique() { # datadir -> number of unique indexes on exactly (user)
  get_indexes "$1" | grep -ciE 'create[[:space:]]+unique[[:space:]]+index' || true
}

# ---- M1 fresh DB ------------------------------------------------------------
echo "== M1: fresh DB with no unique index on (user) =="
D=$(fresh m1); set_indexes "$D"
mig "$D" up
cf_eq "M1a up-migration succeeds"           0     "$MIG_RC" "$MIG_OUT"
cf_eq "M1b coreRev created"                 yes   "$(has_col "$D" coreRev)"
cf_eq "M1c trainingRev created"             yes   "$(has_col "$D" trainingRev)"
cf_eq "M1d cf_commit_log created"           yes   "$(has_ledger "$D")"
get_indexes "$D" | grep -q "$KIT_INDEX" && cf_ok "M1e the kit's own index was created" \
  || cf_bad "M1e expected $KIT_INDEX to be created" "$(get_indexes "$D")"
mig "$D" down
cf_eq "M1f down-migration succeeds"         0     "$MIG_RC" "$MIG_OUT"
cf_eq "M1g coreRev removed"                 no    "$(has_col "$D" coreRev)"
cf_eq "M1h trainingRev removed"             no    "$(has_col "$D" trainingRev)"
cf_eq "M1i cf_commit_log removed"           no    "$(has_ledger "$D")"
get_indexes "$D" | grep -q "$KIT_INDEX" && cf_bad "M1j the kit's own index should be removed on down" "$(get_indexes "$D")" \
  || cf_ok "M1j the kit removed the index it created"

# ---- M2 pre-existing equivalent index (the production condition) ------------
echo "== M2: an equivalent unique index already exists under another name =="
D=$(fresh m2); set_indexes "$D" "CREATE UNIQUE INDEX \`$PROD_INDEX\` ON \`appdata\` (\`user\`)"
mig "$D" up
cf_eq "M2a up-migration succeeds against the production index" 0 "$MIG_RC" "$MIG_OUT"
cf_eq "M2b exactly one unique index on (user) — no duplicate pushed" 1 "$(count_user_unique "$D")" "$(get_indexes "$D")"
get_indexes "$D" | grep -q "$PROD_INDEX" && cf_ok "M2c the pre-existing index was adopted" \
  || cf_bad "M2c the pre-existing index disappeared" "$(get_indexes "$D")"
get_indexes "$D" | grep -q "$KIT_INDEX" && cf_bad "M2d the kit must NOT add its own index when an equivalent exists" "$(get_indexes "$D")" \
  || cf_ok "M2d the kit added no second index"
cf_eq "M2e coreRev still created" yes "$(has_col "$D" coreRev)"
mig "$D" down
cf_eq "M2f down-migration succeeds" 0 "$MIG_RC" "$MIG_OUT"
get_indexes "$D" | grep -q "$PROD_INDEX" \
  && cf_ok "M2g ROLLBACK PRESERVED the adopted pre-existing index (Architect rule)" \
  || cf_bad "M2g rollback destroyed an index this migration never created" "$(get_indexes "$D")"
cf_eq "M2h coreRev removed on down" no "$(has_col "$D" coreRev)"

# ---- M3 rerun / idempotency -------------------------------------------------
echo "== M3: re-running the up-migration produces no duplicate =="
D=$(fresh m3); set_indexes "$D"
mig "$D" up; cf_eq "M3a first up succeeds" 0 "$MIG_RC" "$MIG_OUT"
mig "$D" up; cf_eq "M3b second up is a no-op, not an error" 0 "$MIG_RC" "$MIG_OUT"
cf_eq "M3c still exactly one unique index on (user)" 1 "$(count_user_unique "$D")" "$(get_indexes "$D")"

# ---- M4 up/down/up ----------------------------------------------------------
echo "== M4: up / down / up is clean =="
D=$(fresh m4); set_indexes "$D" "CREATE UNIQUE INDEX \`$PROD_INDEX\` ON \`appdata\` (\`user\`)"
mig "$D" up;   cf_eq "M4a up"   0 "$MIG_RC" "$MIG_OUT"
mig "$D" down; cf_eq "M4b down" 0 "$MIG_RC" "$MIG_OUT"
mig "$D" up;   cf_eq "M4c up again" 0 "$MIG_RC" "$MIG_OUT"
cf_eq "M4d no duplicate index after the cycle" 1 "$(count_user_unique "$D")" "$(get_indexes "$D")"
cf_eq "M4e schema restored on the second up" yes "$(has_col "$D" coreRev)"
cf_eq "M4f ledger restored on the second up" yes "$(has_ledger "$D")"

# ---- M5 near-miss indexes must NOT satisfy the guard ------------------------
echo "== M5: composite and non-unique indexes do not satisfy the guard =="
D=$(fresh m5a); set_indexes "$D" 'CREATE UNIQUE INDEX `idx_composite` ON `appdata` (`user`, `coachreq`)'
mig "$D" up
cf_eq "M5a up succeeds with a composite unique index present" 0 "$MIG_RC" "$MIG_OUT"
get_indexes "$D" | grep -q "$KIT_INDEX" \
  && cf_ok "M5b a composite (user, …) index does NOT count — the kit still created its own" \
  || cf_bad "M5b a composite index wrongly satisfied the guard" "$(get_indexes "$D")"

D=$(fresh m5b); set_indexes "$D" 'CREATE INDEX `idx_user_unique_lookup` ON `appdata` (`user`)'
mig "$D" up
cf_eq "M5c up succeeds with a non-unique index present" 0 "$MIG_RC" "$MIG_OUT"
get_indexes "$D" | grep -q "$KIT_INDEX" \
  && cf_ok "M5d a NON-UNIQUE index whose NAME contains \"unique\" does NOT satisfy the guard" \
  || cf_bad "M5d a non-unique index named *unique* wrongly satisfied the guard" "$(get_indexes "$D")"

# ---- M6 duplicate-row guard -------------------------------------------------
echo "== M6: the migration refuses to run while duplicate owners exist =="
D=$(fresh m6); set_indexes "$D"
python3 - "$D" <<'PYSEED'
import sqlite3, sys
c = sqlite3.connect(sys.argv[1] + "/data.db")
# two appdata rows owned by the same user — the condition the migration must refuse
for rid in ("dupaaaaaaaaaaaa1", "dupaaaaaaaaaaaa2"):
    c.execute("insert into appdata (id,user,data,training,created,updated) "
              "values (?,?,'{}','{}',datetime('now'),datetime('now'))", (rid, "dupuser000000001"))
c.commit()
n = c.execute("select count(*) from appdata where user='dupuser000000001'").fetchone()[0]
print(f"seeded {n} rows for one owner")
sys.exit(0 if n == 2 else 1)
PYSEED
cf_eq "M6-pre the duplicate rows were actually seeded" 0 "$?"
mig "$D" up
if [ "$MIG_RC" = "98" ] && printf '%s' "$MIG_OUT" | grep -qi 'duplicate'; then
  cf_ok "M6a duplicates make the migration fail loudly with a duplicate-specific message"
else
  cf_bad "M6a expected a loud duplicate-row failure; rc=$MIG_RC" "$MIG_OUT"
fi
# Operational hazard, recorded deliberately rather than hidden: the failure is
# only visible in the LOG. Any supervisor or deploy script that trusts the exit
# code will read a refused migration as a successful one.
cf_eq "M6c HAZARD: PocketBase exits 0 even though the migration was refused" 0 "$MIG_RAW_RC" "$MIG_OUT"
cf_eq "M6b nothing was applied when it refused" no "$(has_col "$D" coreRev)"

cf_summary "migration"
