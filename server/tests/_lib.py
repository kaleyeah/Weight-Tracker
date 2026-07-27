"""Compound Fitness — CAS test support (Python).

Product Architect Round 2, decision 2B:
    "Use a concurrency-capable runner with independent request objects and
     response captures. Do not share mutable request-body files."

Round 2 defect 3 was exactly that: two parallel commit() calls in bash wrote
their JSON bodies to the SAME temp file, so both curls transmitted an identical
body. The server correctly did one commit plus one idempotent replay, and the
suite scored it as a failure. Every request built here owns its own bytes.
"""

import json
import os
import sys
import threading
import urllib.error
import urllib.request

BASE = os.environ.get("BASE", "")
STAGING_CONFIRM = os.environ.get("STAGING_CONFIRM", "")


def guard():
    if STAGING_CONFIRM != "YES":
        sys.exit("REFUSED: set STAGING_CONFIRM=YES (staging only, never production)")
    if "rack.tail6fa16c.ts.net" in BASE:
        sys.exit("REFUSED: BASE points at the PRODUCTION host")
    if not BASE.startswith(("http://127.0.0.1:", "http://localhost:", "http://[::1]:")):
        sys.exit(f"REFUSED: BASE must be a loopback staging instance (got {BASE})")


class Result:
    __slots__ = ("status", "body", "ctype", "error")

    def __init__(self, status, body, ctype="", error=""):
        self.status, self.body, self.ctype, self.error = status, body, ctype, error

    def get(self, key, default="<missing>"):
        return self.body.get(key, default) if isinstance(self.body, dict) else default

    def __repr__(self):
        return f"<{self.status} {json.dumps(self.body)[:160]}>"


def request(method, path, token=None, payload=None, timeout=60):
    """One request, one independent body buffer. Never shared, never reused."""
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", token)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode("utf-8", "replace")
            ctype = r.headers.get("Content-Type", "")
            status = r.status
    except urllib.error.HTTPError as ex:
        raw = ex.read().decode("utf-8", "replace")
        ctype = ex.headers.get("Content-Type", "") if ex.headers else ""
        status = ex.code
    except Exception as ex:                                    # network/local failure
        return Result(0, {}, "", f"{type(ex).__name__}: {ex}")
    try:
        body = json.loads(raw)
    except Exception:
        body = {"_raw": raw[:400]}
    return Result(status, body, ctype)


def commit(token, subsystem, expected_rev, key, payload,
           client_build="cas-test", device_id="cas-test-device"):
    body = {
        "subsystem": subsystem,
        "expectedRev": expected_rev,
        "idempotencyKey": key,
        "payload": payload,
        "clientBuild": client_build,
        "deviceId": device_id,
    }
    return request("POST", "/api/cf/appdata/commit", token, body)


def parallel(calls):
    """Run thunks concurrently and return results in submission order."""
    out = [None] * len(calls)
    barrier = threading.Barrier(len(calls))

    def runner(i, fn):
        barrier.wait()                                        # maximise real overlap
        out[i] = fn()

    threads = [threading.Thread(target=runner, args=(i, fn)) for i, fn in enumerate(calls)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return out


def auth(identity, password, collection="users"):
    r = request("POST", f"/api/collections/{collection}/auth-with-password", None,
                {"identity": identity, "password": password})
    return r.get("token", "")


def admin_auth(email, password):
    return auth(email, password, "_superusers")


def creds():
    """Read tests/.fixture-creds.env written by fixtures.sh."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".fixture-creds.env")
    out = {}
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                out[k] = v
    return out


class Suite:
    def __init__(self, name):
        self.name, self.passed, self.failed = name, 0, []

    def ok(self, label):
        self.passed += 1
        print(f"PASS  {label}")

    def bad(self, label, got=None):
        self.failed.append(label)
        print(f"FAIL  {label}")
        if got is not None:
            print(f"      got: {str(got)[:400]}")

    def check(self, cond, label, got=None):
        self.ok(label) if cond else self.bad(label, got)

    def eq(self, expected, actual, label, got=None):
        self.check(expected == actual, f"{label} (expected {expected!r}, got {actual!r})", got)

    def commit_ok(self, r, subsystem, new_rev, label):
        good = (r.status == 200 and r.get("ok") is True
                and r.get("subsystem") == subsystem and r.get("newRev") == new_rev
                and "application/json" in r.ctype)
        self.check(good, f"{label} — 200 ok=true subsystem={subsystem} newRev={new_rev}", r)

    def conflict(self, r, server_rev, label, expect_payload=None):
        good = (r.status == 409 and r.get("ok") is False and r.get("conflict") is True
                and r.get("serverRev") == server_rev and "application/json" in r.ctype)
        if expect_payload is not None:
            good = good and r.get("payload") == expect_payload
        self.check(good, f"{label} — 409 conflict serverRev={server_rev}", r)

    def error(self, r, status, message, label):
        good = (r.status == status and r.get("ok") is False and r.get("error") == message
                and "application/json" in r.ctype)
        self.check(good, f'{label} — {status} error="{message}"', r)

    def done(self):
        print(f"\n---- {self.name}: {self.passed} passed, {len(self.failed)} failed ----")
        for f in self.failed:
            print(f"  - {f}")
        return 0 if not self.failed else 1
