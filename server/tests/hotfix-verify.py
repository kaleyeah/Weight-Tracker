#!/usr/bin/env python3
"""HOTFIX-001 production verification — single disposable probe account.

The full idempotency.py suite needs TWO accounts (I5 checks that an idempotency
key is scoped per user as well as per subsystem). fixtures.sh, which creates
that pair, is deliberately guarded against production, and probe-account.sh is
deliberately limited to one hard-coded cf_test_* address.

So this runs every case the single probe can cover honestly, and REPORTS the
one it cannot rather than skipping it silently or inventing a second production
account without authorisation.

Usage:
  BASE=... ADMIN_EMAIL=... ADMIN_PASS=... PROBE_EMAIL=... PROBE_PASS=... \
    python3 hotfix-verify.py
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ["BASE"].rstrip("/")
ADMIN_EMAIL, ADMIN_PASS = os.environ["ADMIN_EMAIL"], os.environ["ADMIN_PASS"]
PROBE_EMAIL, PROBE_PASS = os.environ["PROBE_EMAIL"], os.environ["PROBE_PASS"]

passed, failed, notrun = [], [], []


def req(method, path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    r.add_header("content-type", "application/json")
    if token:
        r.add_header("Authorization", token)
    try:
        with urllib.request.urlopen(r, timeout=30) as f:
            return f.status, json.loads(f.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw or "{}")
        except Exception:
            return e.code, {"raw": raw}


def check(label, cond, detail=""):
    (passed if cond else failed).append(label)
    print(("PASS  " if cond else "FAIL  ") + label + (("   " + str(detail)) if detail and not cond else ""))


atok = req("POST", "/api/collections/_superusers/auth-with-password", None,
           {"identity": ADMIN_EMAIL, "password": ADMIN_PASS})[1]["token"]
ptok = req("POST", "/api/collections/users/auth-with-password", None,
           {"identity": PROBE_EMAIL, "password": PROBE_PASS})[1]["token"]
uid = req("GET", '/api/collections/users/records?filter=email="%s"' % PROBE_EMAIL, atok)[1]["items"][0]["id"]
N = int(time.time() * 1000)

MULTI = {
    "weights": [{"date": "2026-02-02", "weight": 79, "note": "probe", "steps": 1000}],
    "settings": {"theme": "dark", "units": "kg", "startDate": "2026-01-01"},
    "steps": {"2026-02-02": 8000}, "notes": {"2026-02-02": "probe"},
    "sleep": {"2026-02-02": 7.5}, "food": {}, "bodyfat": {},
}


def commit(sub, rev, key, payload):
    return req("POST", "/api/cf/appdata/commit", ptok, {
        "subsystem": sub, "expectedRev": rev, "idempotencyKey": key,
        "payload": payload, "clientBuild": "hotfix-verify", "deviceId": "probe"})


def cur(sub):
    s, b = commit(sub, 999999, "probe-rev-%s-%d-%f" % (sub, N, time.time()), {})
    v = b.get("serverRev")
    return 0 if v in (None, "<missing>") else v


def ledger(key=None):
    q = '/api/collections/cf_commit_log/records?perPage=200&filter=user="%s"' % uid
    rows = req("GET", q, atok)[1].get("items", [])
    return [r for r in rows if key is None or r.get("key") == key]


print("== I1/I2: replay returns the ORIGINAL result ==")
rev = cur("core")
k = "hv-%d-replay" % N
s1, b1 = commit("core", rev, k, {"v": "original"})
check("I1a first commit succeeded", s1 == 200 and b1.get("newRev") == rev + 1, (s1, b1))
s2, b2 = commit("core", rev, k, {"v": "original"})
check("I1b replay returns 200 with replay=true", s2 == 200 and b2.get("replay") is True, (s2, b2))
check("I2a replay returns the ORIGINAL revision", b2.get("newRev") == rev + 1, b2)
check("I2b replay did not advance the stored revision", cur("core") == rev + 1)
s3, b3 = commit("core", rev, k, {"v": "original"})
check("I2c a second replay is still idempotent", b3.get("newRev") == rev + 1, b3)

print("== I3: same key, different request ==")
s, b = commit("core", rev, k, {"v": "DIFFERENT"})
check("I3a differing payload rejected 409", s == 409 and "reused" in str(b.get("error", "")), (s, b))
s, b = commit("core", rev + 99, k, {"v": "original"})
check("I3b differing expectedRev rejected 409", s == 409 and "reused" in str(b.get("error", "")), (s, b))
check("I3c a rejected reuse did not change the revision", cur("core") == rev + 1)

print("== I4: concurrent same-key race (sequential proxy on production) ==")
rev = cur("core")
k4 = "hv-%d-race" % N
r1 = commit("core", rev, k4, {"race": True})
r2 = commit("core", rev, k4, {"race": True})
check("I4a both same-key commits end 200", r1[0] == 200 and r2[0] == 200, (r1, r2))
check("I4b both report the same resulting revision",
      r1[1].get("newRev") == r2[1].get("newRev") == rev + 1, (r1[1], r2[1]))
check("I4c exactly one is flagged a replay",
      [r1[1].get("replay"), r2[1].get("replay")].count(True) == 1, (r1[1], r2[1]))
check("I4d the revision advanced exactly once", cur("core") == rev + 1)
check("I4e exactly one ledger row for the shared key", len(ledger(k4)) == 1)

print("== I5: key scoping ==")
shared = "hv-%d-shared" % N
crev, trev = cur("core"), cur("training")
rc = commit("core", crev, shared, {"scope": "core"})
rt = commit("training", trev, shared, {"scope": "training"})
check("I5a key used for core", rc[0] == 200 and rc[1].get("newRev") == crev + 1, rc)
check("I5b the SAME key is independently valid for training",
      rt[0] == 200 and rt[1].get("newRev") == trev + 1, rt)
check("I5c the training commit is live, not a cross-subsystem replay",
      rt[1].get("replay", False) is not True, rt[1])
notrun.append("I5d cross-USER key independence — needs a second disposable production "
              "account; probe-account.sh is limited to one address and fixtures.sh is "
              "guarded against production. NOT RUN, not assumed.")
print("NOTRUN I5d cross-user key independence (needs a second disposable account)")

print("== I6: the ledger stores hashes only ==")
rows = ledger()
check("I6a ledger has rows for the probe user", bool(rows))
fields = set(rows[0].keys()) if rows else set()
check("I6b no payload/data field on a ledger row",
      "payload" not in fields and "data" not in fields, sorted(fields))
check("I6c requestHash is a full SHA-256 hex digest",
      all(len(str(r.get("requestHash", ""))) == 64 for r in rows))
dh = [r.get("deviceHash", "") for r in rows if r.get("deviceHash")]
check("I6d deviceId stored as a 16-char hash prefix", all(len(h) == 16 for h in dh) if dh else True, dh[:3])
check("I6e the raw deviceId never appears", all(r.get("deviceHash") != "probe" for r in rows))

print("== I7: a losing commit writes no ledger row ==")
rev = cur("core")
loser = "hv-%d-loser" % N
commit("core", rev, "hv-%d-winner" % N, {"w": 1})
s, b = commit("core", rev, loser, {"l": 1})
check("I7a the stale commit conflicted", s == 409, (s, b))
check("I7b no ledger row for the conflicted key", len(ledger(loser)) == 0)

print("== I8: THE HOTFIX REGRESSION — multi-key payload replays every time ==")
rev = cur("core")
k8 = "hv-%d-multikey" % N
f = commit("core", rev, k8, MULTI)
check("I8a first multi-key commit succeeded", f[0] == 200 and f[1].get("newRev") == rev + 1, f)
refused = []
for i in range(12):
    s, b = commit("core", rev, k8, MULTI)
    if s != 200 or b.get("newRev") != rev + 1:
        refused.append((i, s, b.get("error")))
check("I8b twelve identical multi-key retries ALL replayed (%d refused)" % len(refused),
      not refused, refused[:3])
check("I8c no replay advanced the stored revision", cur("core") == rev + 1)
s, b = commit("core", rev, k8, dict(MULTI, extra="different"))
check("I8d a genuinely different request is STILL rejected",
      s == 409 and "reused" in str(b.get("error", "")), (s, b))
reordered = {k: MULTI[k] for k in reversed(list(MULTI.keys()))}
s, b = commit("core", rev, k8, reordered)
check("I8e reordered keys treated as the SAME request",
      s == 200 and b.get("newRev") == rev + 1, (s, b))

print("\n" + "-" * 60)
print("PASSED %d   FAILED %d   NOT RUN %d" % (len(passed), len(failed), len(notrun)))
for n in notrun:
    print("NOT RUN: " + n)
for f_ in failed:
    print("FAILED:  " + f_)
sys.exit(1 if failed else 0)
