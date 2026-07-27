#!/usr/bin/env bash
# Payload limits — Product Architect Round 2, decision 4b.
#   MAX_PAYLOAD_BYTES   = 256 KiB (262144)  — UTF-8 bytes of serialized payload
#   REQUEST_LIMIT_BYTES = 320 KiB (327680)  — whole JSON envelope, middleware
#
# Required cases:
#   P1 just below the cap succeeds
#   P2 the exact boundary follows documented inclusive behaviour
#   P3 one byte above returns the exact route 413 JSON
#   P4 multibyte UTF-8 is counted in BYTES, not characters
#   P5 an oversized envelope is rejected by the middleware
#   P6 local command-length / network failures cannot masquerade as 413
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; . "$DIR/_lib.sh"
cf_guard
. "$DIR/.fixture-creds.env"
trap 'rm -rf "$CF_TMP"' EXIT
T1=$(cf_user_token "$EMAIL" "$PASS"); [ -n "$T1" ] || { echo "FATAL: user auth failed"; exit 1; }
N=$(date +%s%N)
CAP=262144            # 256 KiB
ENVELOPE=327680       # 320 KiB

rev() { cf_commit "$T1" core 999999 "pb-probe-$N-$RANDOM" '{}'; cf_server_rev; }

# Build a request whose serialized `payload` is EXACTLY $1 UTF-8 bytes.
# {"p":"<filler>"} costs 10 bytes of structure, so filler = target - 10.
build() { # target_payload_bytes key outfile [fill_char]
  python3 - "$1" "$2" "$3" "${4:-a}" <<'PY'
import json, sys
target, key, out, ch = int(sys.argv[1]), sys.argv[2], sys.argv[3], sys.argv[4]
SEP = (",", ":")   # JS JSON.stringify emits no spaces — match it byte for byte
# ensure_ascii=False too: Python would escape "é" as \u00e9 (6 bytes) while
# JSON.stringify emits the raw 2-byte UTF-8 character. The hook measures the
# JS serialization, so the fixture must be built the same way.
DUMP = lambda o: json.dumps(o, separators=SEP, ensure_ascii=False)
overhead = len(DUMP({"p": ""}).encode())
n_bytes = target - overhead
per = len(ch.encode())
assert n_bytes % per == 0, "target not reachable with this fill char"
payload = {"p": ch * (n_bytes // per)}
actual = len(DUMP(payload).encode())
assert actual == target, f"built {actual}, wanted {target}"
open(out, "w", encoding="utf-8").write(DUMP({"subsystem": "core", "expectedRev": 0,
    "idempotencyKey": key, "payload": payload, "clientBuild": "cas-test"}))
print(actual)
PY
}

echo "== P1: just below the cap succeeds =="
R=$(rev)
SIZE=$(build $((CAP-1024)) "pb-$N-under" "$CF_TMP/under.json")
python3 -c 'import json,sys;f=sys.argv[1];d=json.load(open(f,encoding="utf-8"));d["expectedRev"]='"$R"';open(f,"w",encoding="utf-8").write(json.dumps(d,separators=(",",":"),ensure_ascii=False))' "$CF_TMP/under.json"
cf_req POST /api/cf/appdata/commit "$T1" "$CF_TMP/under.json"
cf_assert_commit_ok "P1 payload of $SIZE B (cap-1024) accepted" core "$((R+1))"

echo "== P2: the exact boundary is INCLUSIVE (cap bytes accepted) =="
R=$(rev)
SIZE=$(build $CAP "pb-$N-exact" "$CF_TMP/exact.json")
python3 -c 'import json,sys;f=sys.argv[1];d=json.load(open(f,encoding="utf-8"));d["expectedRev"]='"$R"';open(f,"w",encoding="utf-8").write(json.dumps(d,separators=(",",":"),ensure_ascii=False))' "$CF_TMP/exact.json"
cf_req POST /api/cf/appdata/commit "$T1" "$CF_TMP/exact.json"
cf_assert_commit_ok "P2 payload of exactly $SIZE B accepted (documented inclusive cap)" core "$((R+1))"

echo "== P3: one byte above the cap -> exact route 413 JSON =="
R=$(rev)
SIZE=$(build $((CAP+1)) "pb-$N-over" "$CF_TMP/over.json")
python3 -c 'import json,sys;f=sys.argv[1];d=json.load(open(f,encoding="utf-8"));d["expectedRev"]='"$R"';open(f,"w",encoding="utf-8").write(json.dumps(d,separators=(",",":"),ensure_ascii=False))' "$CF_TMP/over.json"
cf_req POST /api/cf/appdata/commit "$T1" "$CF_TMP/over.json"
cf_assert_error "P3a payload of $SIZE B (cap+1) rejected" 413 "payload too large"
cf_eq "P3b the 413 body reports the configured cap" "$CAP" "$(cf_json maxBytes)" "$CF_BODY"
cf_eq "P3c the rejected commit did not advance the revision" "$R" "$(rev)"

echo "== P4: multibyte UTF-8 is counted in BYTES, not characters =="
# 'é' is 2 UTF-8 bytes. A payload of (cap/2) characters is ~cap bytes and must
# be rejected once it crosses — proving .length (UTF-16 units) is not the metric.
R=$(rev)
SIZE=$(build $((CAP+2)) "pb-$N-utf8" "$CF_TMP/utf8.json" "é")
python3 -c 'import json,sys;f=sys.argv[1];d=json.load(open(f,encoding="utf-8"));d["expectedRev"]='"$R"';open(f,"w",encoding="utf-8").write(json.dumps(d,separators=(",",":"),ensure_ascii=False))' "$CF_TMP/utf8.json"
CHARS=$(python3 -c 'import json,sys;d=json.load(open(sys.argv[1]));print(len(d["payload"]["p"]))' "$CF_TMP/utf8.json")
cf_req POST /api/cf/appdata/commit "$T1" "$CF_TMP/utf8.json"
cf_assert_error "P4a $SIZE B of multibyte text ($CHARS chars) rejected on BYTES" 413 "payload too large"
cf_eq "P4b character count alone would have passed the cap" 1 "$([ "$CHARS" -lt "$CAP" ] && echo 1 || echo 0)"

echo "== P5: an oversized ENVELOPE is rejected by the middleware =="
R=$(rev)
python3 - "$CF_TMP/envelope.json" $ENVELOPE <<'PY'
import json, sys
out, envelope = sys.argv[1], int(sys.argv[2])
# payload stays under the route cap; the ENVELOPE is inflated past the limit
# using a large clientBuild-adjacent field so the middleware must be the one
# that rejects it.
body = {"subsystem": "core", "expectedRev": 0, "idempotencyKey": "pb-envelope",
        "payload": {"p": "a" * 1024}, "clientBuild": "cas-test", "pad": "z" * (envelope + 4096)}
json.dump(body, open(out, "w"), separators=(",", ":"))
print(len(json.dumps(body, separators=(",", ":")).encode()))
PY
cf_req POST /api/cf/appdata/commit "$T1" "$CF_TMP/envelope.json"
case "$CF_STATUS" in
  413) cf_ok "P5a oversized envelope rejected with 413 (middleware)";;
  *)   cf_bad "P5a expected 413 from \$apis.bodyLimit, got $CF_STATUS" "$CF_BODY";;
esac
cf_eq "P5b the oversized envelope did not advance the revision" "$R" "$(rev)"

echo "== P6: local/network failures cannot masquerade as 413 =="
# Every request above was sent from a FILE, never an argv-embedded body, so a
# shell argument-length limit can never be mistaken for a server rejection.
# Prove the transport is healthy and that curl itself reported no error.
if [ -s "$CF_TMP/err" ]; then
  cf_bad "P6a curl reported a transport error during the boundary run" "$(cat "$CF_TMP/err")"
else
  cf_ok "P6a no curl transport errors during the boundary run"
fi
cf_req GET /api/health ""
cf_eq "P6b the server is still healthy after the oversized requests" 200 "$CF_STATUS" "$CF_BODY"
for f in "$CF_TMP/under.json" "$CF_TMP/exact.json" "$CF_TMP/over.json" "$CF_TMP/utf8.json" "$CF_TMP/envelope.json"; do
  [ -s "$f" ] || cf_bad "P6c request body file $f was empty — a build failure could look like a 413"
done
cf_ok "P6c every boundary request body was built on disk and non-empty"

cf_summary "payload-boundary"
