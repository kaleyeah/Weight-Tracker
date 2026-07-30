#!/usr/bin/env python3
"""I5d — cross-USER idempotency-key independence. TWO disposable accounts.

The one check hotfix-verify.py could not run with a single probe account,
recorded there as NOTRUN rather than skipped. The Architect requires it before
cutover; the Product Owner authorized the two disposable production accounts
on 2026-07-30.

What must hold: an idempotency key is scoped per (user, subsystem). The SAME
key, even with the SAME payload bytes, used by two different users must be two
INDEPENDENT live commits — never a cross-user replay (which would hand user B
user A's commit result), and never a cross-user 409 (which would let one user
deny another's key). Each user's replay must return that user's own original
result, and each user's ledger must hold exactly one row for the key.

Usage:
  BASE=... ADMIN_EMAIL=... ADMIN_PASS=... \
  PROBE_A_EMAIL=... PROBE_A_PASS=... PROBE_B_EMAIL=... PROBE_B_PASS=... \
    python3 i5d-verify.py

Both probe accounts must be disposable cf_test_* accounts (enforced below —
this script refuses to run against anything else).
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ["BASE"].rstrip("/")
ADMIN_EMAIL, ADMIN_PASS = os.environ["ADMIN_EMAIL"], os.environ["ADMIN_PASS"]
A_EMAIL, A_PASS = os.environ["PROBE_A_EMAIL"], os.environ["PROBE_A_PASS"]
B_EMAIL, B_PASS = os.environ["PROBE_B_EMAIL"], os.environ["PROBE_B_PASS"]

for e in (A_EMAIL, B_EMAIL):
    if not e.startswith("cf_test_"):
        print("REFUSED: probe account %r is not a disposable cf_test_* account" % e)
        sys.exit(2)

passed, failed = [], []


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


def user(email, pw):
    tok = req("POST", "/api/collections/users/auth-with-password", None,
              {"identity": email, "password": pw})[1]["token"]
    uid = req("GET", '/api/collections/users/records?filter=email="%s"' % email, atok)[1]["items"][0]["id"]
    return {"email": email, "tok": tok, "id": uid}


A = user(A_EMAIL, A_PASS)
B = user(B_EMAIL, B_PASS)
N = int(time.time() * 1000)


def commit(who, sub, rev, key, payload):
    return req("POST", "/api/cf/appdata/commit", who["tok"], {
        "subsystem": sub, "expectedRev": rev, "idempotencyKey": key,
        "payload": payload, "clientBuild": "i5d-verify", "deviceId": "probe-" + who["email"]})


def cur(who, sub):
    s, b = commit(who, sub, 999999, "i5d-rev-%s-%d-%f" % (sub, N, time.time()), {})
    v = b.get("serverRev")
    return 0 if v in (None, "<missing>") else v


def ledger(who, key):
    q = '/api/collections/cf_commit_log/records?perPage=200&filter=user="%s"' % who["id"]
    rows = req("GET", q, atok)[1].get("items", [])
    return [r for r in rows if r.get("key") == key]


print("== I5d: the SAME key, two users, byte-identical payloads ==")
check("I5d-0 preconditions: two distinct disposable accounts", A["id"] != B["id"], (A["id"], B["id"]))
revA, revB = cur(A, "core"), cur(B, "core")

K = "i5d-%d-shared" % N
P = {"v": "identical-bytes", "z": 1, "a": 2}   # >1 key: the HOTFIX-001 lesson

sA, bA = commit(A, "core", revA, K, P)
check("I5d-1 user A commits key K live", sA == 200 and bA.get("newRev") == revA + 1
      and bA.get("replay", False) is not True, (sA, bA))

sB, bB = commit(B, "core", revB, K, P)
check("I5d-2 user B's SAME key + SAME payload is a LIVE commit, not a replay",
      sB == 200 and bB.get("replay", False) is not True, (sB, bB))
check("I5d-3 B received B's revision, not A's result", bB.get("newRev") == revB + 1, (bB, revA, revB))

sB2, bB2 = commit(B, "core", revB, K, P)
check("I5d-4 B's replay returns B's OWN original result",
      sB2 == 200 and bB2.get("replay") is True and bB2.get("newRev") == revB + 1, (sB2, bB2))

sA2, bA2 = commit(A, "core", revA, K, P)
check("I5d-5 A's replay is untouched by B's use of the key",
      sA2 == 200 and bA2.get("replay") is True and bA2.get("newRev") == revA + 1, (sA2, bA2))

sB3, bB3 = commit(B, "core", revB, K, {"v": "DIFFERENT"})
check("I5d-6 B reusing B's key with a different request is refused 409",
      sB3 == 409 and "reused" in str(bB3.get("error", "")), (sB3, bB3))

check("I5d-7 exactly one ledger row for K under A", len(ledger(A, K)) == 1)
check("I5d-8 exactly one ledger row for K under B", len(ledger(B, K)) == 1)
check("I5d-9 A's revision advanced exactly once throughout", cur(A, "core") == revA + 1)
check("I5d-10 B's revision advanced exactly once throughout", cur(B, "core") == revB + 1)

print()
print("I5d RESULT: %d passed, %d failed" % (len(passed), len(failed)))
if failed:
    for f in failed:
        print("  FAILED: " + f)
sys.exit(1 if failed else 0)
