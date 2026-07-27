#!/usr/bin/env python3
"""CAS concurrency — the compare-and-swap invariants under genuine parallelism.

Re-derived from SERVER_NOTES.md §2 ("duplicate rows") and the route contract.
These are the cases the Round 2 harness could not test: it shared one request
body file between parallel calls, so both requests were identical and the
server's correct "one commit + one replay" looked like a failure.

Invariants under test:
  C1  two commits from the same serverRev  -> exactly one 200, exactly one 409
  C2  the loser's 409 carries the winner's serverRev AND payload
  C3  concurrent FIRST-ROW creation        -> exactly one 200, exactly one row
  C4  a create race never yields a fake 409 with no row, nor a 500
  C5  N-way pile-up on one revision        -> exactly one winner
  C6  independent subsystems do not block each other
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _lib as L                                              # noqa: E402

L.guard()
c = L.creds()
s = L.Suite("cas-concurrency")
ADMIN_EMAIL, ADMIN_PASS = os.environ["ADMIN_EMAIL"], os.environ["ADMIN_PASS"]

t1 = L.auth(c["EMAIL"], c["PASS"])
atok = L.admin_auth(ADMIN_EMAIL, ADMIN_PASS)
if not t1 or not atok:
    sys.exit("FATAL: authentication failed")

users = L.request("GET", f'/api/collections/users/records?filter=email="{c["EMAIL"]}"', atok)
uid1 = users.body["items"][0]["id"]
N = int(time.time() * 1000)


def current_rev(subsystem):
    r = L.commit(t1, subsystem, 999999, f"cc-probe-{subsystem}-{N}-{time.time()}", {})
    v = r.get("serverRev")
    return 0 if v in (None, "<missing>") else v


def delete_row():
    r = L.request("GET", f'/api/collections/appdata/records?filter=user="{uid1}"', atok)
    for item in r.body.get("items", []):
        L.request("DELETE", f'/api/collections/appdata/records/{item["id"]}', atok)


def row_count():
    r = L.request("GET", f'/api/collections/appdata/records?filter=user="{uid1}"', atok)
    return len(r.body.get("items", []))


# --- C1/C2: two writers from the same revision -------------------------------
print("== C1/C2: competing commits from the same serverRev ==")
rev = current_rev("core")
a, b = L.parallel([
    lambda: L.commit(t1, "core", rev, f"cc-{N}-alpha", {"who": "alpha"}),
    lambda: L.commit(t1, "core", rev, f"cc-{N}-beta",  {"who": "beta"}),
])
oks = [r for r in (a, b) if r.status == 200]
conflicts = [r for r in (a, b) if r.status == 409]
s.eq(1, len(oks), "C1a exactly one commit succeeded", (a, b))
s.eq(1, len(conflicts), "C1b exactly one commit conflicted", (a, b))

if len(oks) == 1 and len(conflicts) == 1:
    winner, loser = oks[0], conflicts[0]
    s.eq(rev + 1, winner.get("newRev"), "C1c winner advanced the revision by exactly one", winner)
    s.check(winner.get("replay", False) is not True,
            "C1d the winner is a live commit, not a replay", winner)
    s.eq(rev + 1, loser.get("serverRev"), "C2a loser's 409 carries the winner's serverRev", loser)
    s.eq(winner_payload := {"who": "alpha"} if winner is a else {"who": "beta"},
         loser.get("payload"), "C2b loser's 409 carries the winner's payload", loser)
    del winner_payload

# --- C5: N-way pile-up -------------------------------------------------------
print("== C5: five writers on one revision ==")
rev = current_rev("core")
results = L.parallel([
    (lambda i=i: L.commit(t1, "core", rev, f"cc-{N}-pile{i}", {"pile": i}))
    for i in range(5)
])
oks = [r for r in results if r.status == 200]
conflicts = [r for r in results if r.status == 409]
others = [r for r in results if r.status not in (200, 409)]
s.eq(1, len(oks), "C5a exactly one of five succeeded", results)
s.eq(4, len(conflicts), "C5b the other four conflicted", results)
s.eq(0, len(others), "C5c no request produced an unexpected status", others)
s.check(all(r.get("serverRev") == rev + 1 for r in conflicts),
        "C5d every loser reports the same post-commit serverRev", conflicts)

# --- C3/C4: concurrent first-row creation ------------------------------------
print("== C3/C4: concurrent FIRST-ROW creation ==")
delete_row()
s.eq(0, row_count(), "C3a precondition — user has no appdata row")
a, b = L.parallel([
    lambda: L.commit(t1, "core", 0, f"cc-{N}-first-a", {"first": "a"}),
    lambda: L.commit(t1, "core", 0, f"cc-{N}-first-b", {"first": "b"}),
])
oks = [r for r in (a, b) if r.status == 200]
conflicts = [r for r in (a, b) if r.status == 409]
fives = [r for r in (a, b) if r.status >= 500]
s.eq(1, len(oks), "C3b exactly one first commit succeeded", (a, b))
s.eq(1, row_count(), "C3c exactly one row exists after the race")
s.eq(0, len(fives), "C4a a create race never produces a 500", (a, b))
if oks:
    s.eq(1, oks[0].get("newRev"), "C3d the winning first commit lands at rev 1", oks[0])
if conflicts:
    s.check(conflicts[0].get("serverRev") in (0, 1),
            "C4b the losing first commit reports a coherent serverRev", conflicts[0])

# --- C6: subsystem independence ---------------------------------------------
print("== C6: core and training commit independently in parallel ==")
crev, trev = current_rev("core"), current_rev("training")
a, b = L.parallel([
    lambda: L.commit(t1, "core",     crev, f"cc-{N}-icore",  {"iso": "core"}),
    lambda: L.commit(t1, "training", trev, f"cc-{N}-itrain", {"iso": "training"}),
])
s.commit_ok(a, "core", crev + 1, "C6a parallel core commit succeeded")
s.commit_ok(b, "training", trev + 1, "C6b parallel training commit succeeded")

sys.exit(s.done())
