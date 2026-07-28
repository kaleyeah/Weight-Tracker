# HOTFIX-001 — CAS idempotency hash is not stable across identical requests

**Status:** prepared, **NOT DEPLOYED**. Production runs the defective hook.
**Scope:** `server/pb_hooks` only. No schema change, no migration, no API-rule change.
**Relationship to Commit 10:** none. Per ADR-0012 this is an independent
production hotfix and must not be bundled with any client work.

---

## 1. Root cause analysis

### The mechanism

`server/pb_hooks/cf_cas.pb.js` derived the idempotency `requestHash` like this:

```js
const body = e.requestInfo().body || {};
const payloadStr = JSON.stringify(body.payload);
const requestHash = $security.sha256(body.subsystem + "|" + expectedRev + "|" + payloadStr);
```

`e.requestInfo().body` is a **Go map** surfaced into the Goja runtime. Go
randomises map iteration order deliberately — it is a language guarantee, not
an accident, introduced to stop code depending on an order that was never
specified.

`JSON.stringify` walks that map. Object keys therefore come out in a **different
order on each request**. The hash of a byte-identical request is different every
time.

### What that does to the ledger

On the first commit the route stores `requestHash` in `cf_commit_log`. On a
retry it recomputes the hash, compares, and — finding a mismatch that can only
mean "same key, different request" — returns:

```
409  {"ok": false, "error": "idempotency key reused with a different request"}
```

This is the idempotency layer refusing the precise case it exists to serve.
The check itself is correct and worth keeping; its input was unstable.

### Measured

Disposable instance, deployed kit, four-key payload, one fixed body string,
same idempotency key, raw HTTP, no client:

| | identical retries refused | reordered-key request |
| --- | --- | --- |
| deployed hook | **11–12 of 12** | 409 |
| hotfix | **0 of 12** | 200 (correctly the same request) |

`proof/reproduce-defect.js` reproduces this in about fifteen seconds against a
disposable instance. Nothing but the PocketBase binary is required.

### Why the failure rate varies

It is a function of how many keys the payload object has. One key has exactly
one possible ordering, so the bug is invisible. Two keys fail about half the
time. A real athlete `data` payload — weights, settings, food, steps, notes,
sleep, training — fails essentially always.

### Why it shipped

**`server/tests/idempotency.py` already tested this contract and passed.**

```python
payload = {"v": "original"}          # I1/I2 replay test
```

One key. The test asserting "replaying the same key + same request returns the
ORIGINAL result" used the only payload shape that cannot detect an unstable
serialisation. It passed on staging, passed at cutover, and would pass today
against the defective hook.

This is the part worth carrying forward: the suite tested the right *contract*
with the wrong *data*, and no amount of re-running it would have found this.

### Why the client did not mask it

The Commit 10 client derives its idempotency key from
`sha256(subsystem \n expectedRev \n canonicalPayload)` — its own canonical form,
which is stable. Client and server were canonicalising differently: the client
consistently, the server not at all. The client's key was right; the server's
hash of the same request was not.

---

## 2. The fix, and why canonical serialization

Hash a canonical serialisation instead of an incidental one:

```js
const requestHash = $security.sha256(
  body.subsystem + "|" + expectedRev + "|" + cf.canonicalJson(body.payload));
```

`canonicalJson` (in `cf_cas_shared.js`) sorts object keys recursively and
serialises. **Arrays keep their order** — array order is meaningful data, and
sorting it would make two genuinely different payloads hash alike.

Properties this gives:

- **Stable.** The same content always produces the same hash, regardless of how
  the runtime chose to iterate it.
- **Still discriminating.** Different content still produces a different hash,
  so the "key reused with a different request" protection is unweakened — I8d
  asserts exactly that.
- **Order-insensitive in the right way.** A client that sends the same content
  with keys in another order is now correctly treated as the same request
  (I8e). Previously it was refused, which was never intended.

### Blast radius

Only the hash input changes:

- the payload **stored** in `appdata` is untouched — `rec.set(sub.field, body.payload)` is unchanged;
- `payloadStr` remains what `validatePayloadSize` measures, so the 256 KiB cap
  is byte-for-byte what it was;
- no response shape changes;
- no schema, index, migration or API rule changes.

`git diff` is one helper function and one line.

---

## 3. Migration impact

**No schema migration. No data migration. No downtime.**

One behavioural note, and it is the only one:

> Ledger rows written **before** the changeover carry old-style hashes. If a
> client retries a request whose original commit predates the deployment, the
> new canonical hash will not match that stored row, and that one retry is
> refused exactly as it is today.

Characteristics:

- It affects **only** in-flight retries spanning the deployment moment.
- It is **no worse than current behaviour**, which refuses those retries
  ~always anyway.
- It self-heals: the athlete's next commit derives a fresh key.
- `cf_commit_log` is an idempotency ledger, not a source of truth. No athlete
  data lives in it.

**Two options, Architect's call:**

1. **Deploy and leave the ledger alone.** Simplest. The window is one retry per
   affected in-flight request, and those retries fail today regardless.
2. **Clear `cf_commit_log` at changeover.** Removes the mismatch window
   entirely at the cost of losing replay protection for genuinely in-flight
   requests during the restart — which is a narrow but real widening of the
   double-apply window.

I recommend **option 1**. Option 2 trades a failure mode that is already
happening for one that currently is not.

---

## 4. Rollback plan

The hook is a file. Rollback is restoring it and restarting.

```bash
# on the NAS, as the deploy user
cd /volume1/docker/pocketbase                 # adjust to the real mount
cp pb_hooks/cf_cas.pb.js      pb_hooks/.rollback/cf_cas.pb.js.new
cp pb_hooks/cf_cas_shared.js  pb_hooks/.rollback/cf_cas_shared.js.new
cp pb_hooks/.rollback/cf_cas.pb.js.prev     pb_hooks/cf_cas.pb.js
cp pb_hooks/.rollback/cf_cas_shared.js.prev pb_hooks/cf_cas_shared.js
docker restart pocketbase
```

- **Trigger:** any of the post-deployment checks in §6 failing, or any 5xx on
  `/api/cf/appdata/commit`.
- **Time to roll back:** one file copy and a container restart, under a minute.
- **Data risk on rollback:** none. No schema or data was changed, so reverting
  the hook returns the system exactly to its present state.
- **Prerequisite:** step 2 of the checklist takes the `.prev` copies. Do not
  skip it.

---

## 5. Deployment checklist

Nothing here is destructive, and nothing touches athlete data.

- [ ] **H0.** Confirm authorisation from the Product Owner **and** the Product
      Architect. This document is not authorisation.
- [ ] **H1.** Back up production (`pb_data`) as per DEPLOYMENT.md, and verify
      the backup is readable before proceeding.
- [ ] **H2.** Take rollback copies:
      `mkdir -p pb_hooks/.rollback && cp pb_hooks/cf_cas.pb.js pb_hooks/.rollback/cf_cas.pb.js.prev`
      (and the same for `cf_cas_shared.js`). Verify both `.prev` files are
      non-empty.
- [ ] **H3.** Record the current state so §6 can be compared against it:
      `curl -s $BASE/api/health`, and the current `coreRev`/`trainingRev` for
      the probe account only.
- [ ] **H4.** Copy the two hook files from this branch into `pb_hooks/`.
      **These two files only.** No migration is to be run.
- [ ] **H5.** `docker restart pocketbase`.
- [ ] **H6.** Confirm the hook loaded — the log line
      `CF CAS hook loaded build=cas-3 ...` must appear, and there must be **no**
      `ReferenceError` (the Round-2 failure mode: a broken shared module makes
      every request throw).
- [ ] **H7.** Run §6 verification.
- [ ] **H8.** If any check fails, roll back per §4 immediately and report. Do
      not attempt a forward fix on production.
- [ ] **H9.** Record the outcome in `server/PRODUCTION_CUTOVER_RESULTS.md`.

**Not in scope for this deployment:** no API-rule change, no
`CF_MIN_CLIENT_BUILD`, no bridge-hook removal, no P7 lockdown, no client
deployment. Those remain separately authorised.

---

## 6. Post-deployment verification

Run against **production**, using only the disposable probe account. Never a
real athlete account, and never a real athlete password.

```bash
export BASE=https://<tailnet-host>
server/tests/probe-account.sh create           # creates cf_test_* only
ADMIN_EMAIL=... ADMIN_PASS=... python3 server/tests/idempotency.py
server/tests/probe-account.sh destroy          # verifies user+appdata+ledger absence
```

Must hold:

- **I8b** — twelve identical multi-key retries all replay. **This is the check
  that matters**; it fails 11–12 times out of 12 against the current hook.
- **I8c** — no replay advanced the stored revision.
- **I8d** — a genuinely different request with the same key is **still**
  rejected 409. The fix must not weaken key-reuse protection.
- **I8e** — the same content with reordered keys is treated as the same request.
- **I1–I7** — the pre-existing idempotency contract is unchanged.

Then, unchanged from the cutover gate:

```bash
server/tests/verify-deployment.sh              # read-only, V0–V15
```

- V0–V15 all pass, including the V15 integrity sentinel over existing appdata.
- No real athlete row's `coreRev`/`trainingRev` changed across the deployment.

**Rejection criteria — roll back if any of these occur:** any I8 failure, any
regression in I1–I7, any V0–V15 failure, any 5xx on the commit route, or the
hook failing to load cleanly.

---

## 7. What this hotfix does not do

- It does not change what is stored, only what is hashed.
- It does not alter the CAS guarantee, which was never at risk — the defect
  degraded retry handling, it did not permit a lost update or an overwrite.
- It does not touch the Commit 10 client, which behaved correctly throughout:
  it read the 409 without `conflict:true` as `invariant` and routed it to the
  safe failure state rather than showing the athlete a conflict that did not
  exist.
