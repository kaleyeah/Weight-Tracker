# M10 single-writer — round 12: strengthened race oracle (the narrow return)

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

Exactly the round-11 list, nothing else. Commit c8a2699;
`artifacts/evidence-server/DIFF-FROM-5703bf2.txt` = the changed paths
(run-races.mjs, the fresh evidence JSONs, MANIFEST.txt).

**The corrected `run-races.mjs`** (items 4–7):
- **Typed rejection (item 5)**: a rejected write counts ONLY as
  `status 409 && body.fenceStale === true && body.fence ===
  <authoritative post-transition fence>` — the steal's returned fence
  in steal‖write, the release's in release‖write, the expiry-acquire's
  in expiry-acquire‖write. Any other 409 (or any other shape) is an
  anomaly. renew‖steal's stale arm likewise requires the typed
  `stale === true` body.
- **Ledger + winner identity on EVERY landed ON commit (item 6)**:
  all three write-bearing pairs now assert `row.writerFence ===
  submitted pre-transition fence` AND fetch the appdata row to prove
  `coreRev === reported newRev` and the content marker equals the
  winning payload's; every typed rejection additionally proves the
  revision did NOT move (`mutatedDespiteStale` anomaly otherwise).
- **Both outcomes required per ON pair (items 4/7)**: steal‖write,
  renew‖steal, release‖write, and expiry-acquire‖write each require
  BOTH outcome kinds > 5 of 100 (a regression that never rejects — or
  never lands — now fails the gate); steal‖steal additionally asserts
  the final holder is the device whose steal returned the higher
  fence.

**Fresh evidence** (both instances rebuilt from scratch):
- `races-enforce.json`: allPass, 0 anomalies — stealWrite 50/50,
  renewSteal 50/50, releaseWrite 100 releases + 50 landed/50 typed
  rejections, expiryWrite 100 expiry-acquires + 50/50, stealSteal
  100/100 distinct with holder-of-highest-fence, txhold barrier
  584 ms.
- `races-off.json`: allPass, 0 anomalies (all writes land, as OFF
  requires).
- Ordinary suites RERUN on the same fresh instances, unchanged
  results: off-suite.json 71/71, enforce-suite.json 92/92.
  migration-suite.json unchanged from round 11 (16/16; no hook or
  migration file changed this round — MANIFEST confirms, only
  tests/run-races.mjs differs).
- MANIFEST.txt regenerated; `sha256sum -c` exits 0.

Fault instrumentation note recorded per your item 2: the
`x-cf-test-fault` mechanism is test instrumentation, gated on
CF_M10_TEST_ENABLE=1, and must remain disabled in every
non-disposable package and deployment (MANIFEST-NOTES.md +
tests/README.md + ROLLBACK.md).

Requested ruling: close of the server-package gate (§9 step 3) and
authorization for LOCAL client implementation (delimited blocks, M8
discipline). NAS deployment, coach migration, enforcement, and
publication remain with the Owner, unrequested.
