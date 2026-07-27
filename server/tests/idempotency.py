#!/usr/bin/env python3
"""Idempotency ledger — re-derived from SERVER_NOTES.md §2 "idempotency misuse".

Contract under test:
  I1  replaying the same key + same request returns the ORIGINAL result
  I2  a replay never double-increments the revision
  I3  the same key with a DIFFERENT request is rejected (409, exact error)
  I4  a concurrent same-key race resolves to one live commit and one replay
  I5  keys are scoped per (user, subsystem) — the same key is reusable across
      subsystems and across users
  I6  the ledger stores hashes only, never payloads, and deviceId is stored as
      a short hash rather than raw (addendum #9)
  I7  a losing commit writes NO ledger row
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _lib as L                                              # noqa: E402

L.guard()
c = L.creds()
s = L.Suite("idempotency")
ADMIN_EMAIL, ADMIN_PASS = os.environ["ADMIN_EMAIL"], os.environ["ADMIN_PASS"]

t1 = L.auth(c["EMAIL"], c["PASS"])
t2 = L.auth(c["EMAIL2"], c["PASS2"])
atok = L.admin_auth(ADMIN_EMAIL, ADMIN_PASS)
if not (t1 and t2 and atok):
    sys.exit("FATAL: authentication failed")

uid1 = L.request("GET", f'/api/collections/users/records?filter=email="{c["EMAIL"]}"', atok).body["items"][0]["id"]
N = int(time.time() * 1000)


def current_rev(subsystem, token=t1):
    r = L.commit(token, subsystem, 999999, f"id-probe-{subsystem}-{N}-{time.time()}", {})
    v = r.get("serverRev")
    return 0 if v in (None, "<missing>") else v


def ledger(user_id):
    r = L.request("GET", f'/api/collections/cf_commit_log/records?perPage=200&filter=user="{user_id}"', atok)
    return r.body.get("items", [])


# --- I1/I2: replay -----------------------------------------------------------
print("== I1/I2: replaying the same key + same request ==")
rev = current_rev("core")
key = f"id-{N}-replay"
payload = {"v": "original"}
first = L.commit(t1, "core", rev, key, payload)
s.commit_ok(first, "core", rev + 1, "I1a first commit succeeded")

second = L.commit(t1, "core", rev, key, payload)
s.check(second.status == 200 and second.get("replay") is True,
        "I1b replay returns 200 with replay=true", second)
s.eq(rev + 1, second.get("newRev"), "I2a replay returns the ORIGINAL resulting revision", second)
s.eq(rev + 1, current_rev("core"), "I2b replay did not advance the stored revision")

third = L.commit(t1, "core", rev, key, payload)
s.eq(rev + 1, third.get("newRev"), "I2c a second replay is still idempotent", third)

# --- I3: key reuse with a different request ----------------------------------
print("== I3: same key, different request ==")
r = L.commit(t1, "core", rev, key, {"v": "DIFFERENT"})
s.error(r, 409, "idempotency key reused with a different request", "I3a differing payload rejected")
r = L.commit(t1, "core", rev + 99, key, payload)
s.error(r, 409, "idempotency key reused with a different request", "I3b differing expectedRev rejected")
s.eq(rev + 1, current_rev("core"), "I3c a rejected reuse did not change the revision")

# --- I4: concurrent same-key race --------------------------------------------
print("== I4: concurrent commits sharing one key ==")
rev = current_rev("core")
key = f"id-{N}-race"
same = {"race": True}
a, b = L.parallel([
    lambda: L.commit(t1, "core", rev, key, same),
    lambda: L.commit(t1, "core", rev, key, same),
])
s.eq(2, len([r for r in (a, b) if r.status == 200]),
     "I4a both same-key commits end 200 (one live, one replay)", (a, b))
s.check({r.get("newRev") for r in (a, b)} == {rev + 1},
        "I4b both report the same resulting revision", (a, b))
s.eq(1, len([r for r in (a, b) if r.get("replay") is True]),
     "I4c exactly one is flagged as a replay", (a, b))
s.eq(rev + 1, current_rev("core"), "I4d the revision advanced exactly once")
s.eq(1, len([x for x in ledger(uid1) if x["key"] == key]),
     "I4e exactly one ledger row exists for the shared key")

# --- I5: key scoping ---------------------------------------------------------
print("== I5: keys are scoped per (user, subsystem) ==")
shared_key = f"id-{N}-shared"
crev, trev = current_rev("core"), current_rev("training")
rc = L.commit(t1, "core", crev, shared_key, {"scope": "core"})
rt = L.commit(t1, "training", trev, shared_key, {"scope": "training"})
s.commit_ok(rc, "core", crev + 1, "I5a key used for core")
s.commit_ok(rt, "training", trev + 1, "I5b the SAME key is independently valid for training")
s.check(rt.get("replay", False) is not True,
        "I5c the training commit is live, not a cross-subsystem replay", rt)

trev2 = current_rev("training", t2)
r2 = L.commit(t2, "training", trev2, shared_key, {"scope": "user2"})
s.check(r2.status == 200 and r2.get("replay", False) is not True,
        "I5d the same key is independently valid for a different user", r2)

# --- I6: ledger content ------------------------------------------------------
print("== I6: the ledger stores hashes only ==")
rows = ledger(uid1)
s.check(bool(rows), "I6a ledger has rows for this user")
fields = set(rows[0].keys()) if rows else set()
s.check("payload" not in fields and "data" not in fields,
        "I6b no payload/data field exists on a ledger row", sorted(fields))
s.check(all(len(str(x.get("requestHash", ""))) == 64 for x in rows),
        "I6c requestHash is a full SHA-256 hex digest")
hashes = [x.get("deviceHash", "") for x in rows if x.get("deviceHash")]
s.check(all(len(h) == 16 for h in hashes) if hashes else True,
        "I6d deviceId is stored as a 16-char hash prefix, never raw", hashes[:3])
s.check(all("cas-test-device" != x.get("deviceHash") for x in rows),
        "I6e the raw deviceId never appears in the ledger")

# --- I7: losers write no ledger row ------------------------------------------
print("== I7: a losing commit writes no ledger row ==")
rev = current_rev("core")
loser_key = f"id-{N}-loser"
L.commit(t1, "core", rev, f"id-{N}-winner", {"w": 1})          # advance the revision
r = L.commit(t1, "core", rev, loser_key, {"l": 1})             # now stale -> must 409
s.check(r.status == 409, "I7a the stale commit conflicted", r)
s.eq(0, len([x for x in ledger(uid1) if x["key"] == loser_key]),
     "I7b no ledger row was written for the conflicted key")

sys.exit(s.done())
