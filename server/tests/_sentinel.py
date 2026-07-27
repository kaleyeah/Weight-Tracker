#!/usr/bin/env python3
"""Compound Fitness — V15 existing-appdata integrity sentinel.

REQUIRED BY THE PRODUCT ARCHITECT (production gate review, 2026-07-27):

    "Existing appdata integrity sentinel: before deployment record for every
     existing appdata row: record id, user id, coreRev, trainingRev, UTF-8 byte
     length of data, UTF-8 byte length of training. After deployment verify all
     six values are unchanged. This is a non-destructive integrity check only."

The rest of `verify-deployment.sh` proves the SCHEMA is right and the ROUTE
works. Nothing in it looks at the athletes' actual rows, so it would not notice
a migration that disturbed a real payload. This closes that gap.

HEALTH DATA HANDLING — the reason this is a separate module rather than another
curl in the shell script:

  * `data` and `training` hold real health data. They are fetched, measured in
    memory, and discarded. They are NEVER written to disk, never logged, never
    printed. The baseline file contains six scalars per row and nothing else.
  * The shell library's `cf_req` writes every response body to a temp file. That
    is fine for synthetic staging responses and NOT fine here, so this module
    does its own HTTP and never routes payloads through the filesystem.
  * The baseline file still carries record and user IDs. Keep it local, off
    shared storage, and delete it after the cutover.

Byte length is measured over a CANONICAL serialization — sorted keys, no
whitespace — so that a re-serialization by the server cannot produce a spurious
mismatch. A field that is absent or null measures 0.

PRE-MIGRATION ROWS HAVE NO REVISION FIELDS. `coreRev`/`trainingRev` do not exist
on `appdata` until the migration adds them, so a baseline captured before
deployment records them as 0, and the migration must leave them at 0. A row that
comes back with a nonzero revision after deployment therefore FAILS this check —
the migration is required to add the fields, not to set them.

Usage:
    _sentinel.py capture <base> <token> <outfile> [--with-hash]
    _sentinel.py verify  <base> <token> <baseline-file>

Exit 0 on success; 1 on any mismatch or fetch failure.
"""
import json
import sys
import urllib.error
import urllib.request

PER_PAGE = 500
FIELDS = ("id", "user", "coreRev", "trainingRev", "dataBytes", "trainingBytes")


def canonical_bytes(value):
    """UTF-8 byte length of a stable serialization of a PocketBase json field."""
    if value is None or value == "":
        return 0
    if isinstance(value, str):
        # some deployments store the snapshot as text rather than json
        return len(value.encode("utf-8"))
    return len(json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8"))


def fetch_rows(base, token, with_hash=False):
    """Every appdata row, reduced to the six sentinel values. Payloads are
    measured and dropped inside this function and never leave it."""
    rows, page = {}, 1
    while True:
        url = "%s/api/collections/appdata/records?perPage=%d&page=%d&sort=id" % (
            base.rstrip("/"), PER_PAGE, page)
        req = urllib.request.Request(url, headers={"Authorization": token})
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        for item in body.get("items", []):
            entry = {
                "id": item.get("id"),
                "user": item.get("user"),
                # absent (pre-migration) normalizes to 0 — see module docstring
                "coreRev": int(item.get("coreRev") or 0),
                "trainingRev": int(item.get("trainingRev") or 0),
                "dataBytes": canonical_bytes(item.get("data")),
                "trainingBytes": canonical_bytes(item.get("training")),
            }
            if with_hash:
                import hashlib
                for field, key in (("data", "dataHash"), ("training", "trainingHash")):
                    v = item.get(field)
                    if v is None or v == "":
                        entry[key] = "empty"
                    else:
                        s = v if isinstance(v, str) else json.dumps(v, sort_keys=True, separators=(",", ":"))
                        entry[key] = hashlib.sha256(s.encode("utf-8")).hexdigest()
            rows[entry["id"]] = entry
        if page >= int(body.get("totalPages", 1)):
            break
        page += 1
    return rows


def cmd_capture(base, token, outfile, with_hash):
    rows = fetch_rows(base, token, with_hash)
    doc = {
        "sentinelVersion": 1,
        "withHash": bool(with_hash),
        "rowCount": len(rows),
        "rows": [rows[k] for k in sorted(rows)],
    }
    with open(outfile, "w") as fh:
        json.dump(doc, fh, indent=2, sort_keys=True)
        fh.write("\n")
    print("SENTINEL CAPTURED  rows=%d  file=%s%s"
          % (len(rows), outfile, "  (with content hashes)" if with_hash else ""))
    for r in doc["rows"]:
        print("  row %s user=%s coreRev=%s trainingRev=%s dataBytes=%s trainingBytes=%s"
              % (r["id"], r["user"], r["coreRev"], r["trainingRev"], r["dataBytes"], r["trainingBytes"]))
    return 0


def cmd_verify(base, token, baseline_file):
    with open(baseline_file) as fh:
        doc = json.load(fh)
    before = {r["id"]: r for r in doc.get("rows", [])}
    with_hash = bool(doc.get("withHash"))
    after = fetch_rows(base, token, with_hash)

    problems = []
    for rid in sorted(before):
        b = before[rid]
        a = after.get(rid)
        if a is None:
            problems.append("row %s (user %s) is GONE after deployment" % (rid, b.get("user")))
            continue
        keys = list(FIELDS) + (["dataHash", "trainingHash"] if with_hash else [])
        for k in keys:
            if b.get(k) != a.get(k):
                problems.append("row %s: %s changed %r -> %r" % (rid, k, b.get(k), a.get(k)))
    for rid in sorted(set(after) - set(before)):
        problems.append("row %s (user %s) APPEARED during the deployment window"
                        % (rid, after[rid].get("user")))

    checked = len(before)
    if problems:
        print("V15 INTEGRITY SENTINEL: FAILED (%d row(s) checked, %d problem(s))"
              % (checked, len(problems)))
        for p in problems:
            print("  ! " + p)
        return 1
    print("V15 INTEGRITY SENTINEL: all %d existing row(s) unchanged "
          "(id, user, coreRev, trainingRev, dataBytes, trainingBytes%s)"
          % (checked, ", content hashes" if with_hash else ""))
    for rid in sorted(before):
        b = before[rid]
        print("  row %s user=%s coreRev=%s trainingRev=%s dataBytes=%s trainingBytes=%s"
              % (rid, b.get("user"), b["coreRev"], b["trainingRev"], b["dataBytes"], b["trainingBytes"]))
    return 0


def main(argv):
    if len(argv) < 5:
        print(__doc__.strip().splitlines()[-4], file=sys.stderr)
        print("usage: _sentinel.py capture|verify <base> <token> <file> [--with-hash]", file=sys.stderr)
        return 2
    mode, base, token, path = argv[1], argv[2], argv[3], argv[4]
    with_hash = "--with-hash" in argv[5:]
    try:
        if mode == "capture":
            return cmd_capture(base, token, path, with_hash)
        if mode == "verify":
            return cmd_verify(base, token, path)
    except urllib.error.HTTPError as e:
        print("V15 SENTINEL ERROR: HTTP %s fetching appdata — cannot verify integrity" % e.code)
        return 1
    except Exception as e:                                     # noqa: BLE001
        print("V15 SENTINEL ERROR: %s: %s" % (type(e).__name__, e))
        return 1
    print("unknown mode %r" % mode, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
