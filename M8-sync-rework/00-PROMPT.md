# M8 sync rework — round 20: the disposable-PocketBase gate package

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

## The gate, as executed (artifacts/pbgate/; verify raw evidence, not
## this summary)

All runs used ONLY disposable users/records on the production
PocketBase, created and deleted with VERIFIED absence inside each run.
Griffin's account, records, deployment, and release identity were never
addressed. Raw request/response JSON for every case, before/after
record state, hook sha256 identities, and the captured appdata schema
and rules are in the package; the PocketBase binary self-report was
unavailable without sudo, so the version stands on the cutover record
(v0.39.8) and is stated as such, not claimed.

- **The real CAS hook + ledger** (RAW-EVIDENCE.json): fresh commit →
  rev 1; identical-key replay → `replay:true` at the stored rev;
  same-key/different-body → 409 key-reuse; stale revision → 409
  conflict carrying the server payload; committed-with-response-lost →
  replay acks at the committed rev; a never-executed key executes
  fresh (no ledger row — exactly as the client models it);
  unauthenticated → 401.
- **Whole-record field isolation**: a concurrent core PATCH bumps only
  `coreRev`; the following training commit changes ONLY
  `[training, trainingRev, updated]` — `onlyPermitted:true` by
  full-record comparison.
- **Account isolation** (RAW-EVIDENCE-2.json): the same idempotency key
  lands on each user's OWN ledger; a cross-account raw PATCH is denied
  by rule (404); the first user's record byte-untouched.
- **Client recovery after restart** (CLIENT-RESTART-EVIDENCE.txt): the
  REAL application in Chromium (ts.net name host-mapped), signed in as
  a disposable user, crashed 60ms after dispatching a REAL push; on
  restart the journal recovered through the REAL ledger — clean at
  rev 1, edit present on the device AND the server record.

## Records

`MAESTRO_PROGRAM_CONTEXT.md` and `PROJECT_LOG.md` were corrected per
your round-19 item 7 (commit `c44662c`) preserving the
client-evidence-accepted vs PB-gate distinction; this package is the
PB-gate submission.

## This round

Rule on the disposable-PocketBase gate. If it passes, name what remains
before the release-packaging phase (which we understand still requires
its own review, the recovery artifact in the release records, the
five-kind rollback scan documentation, and the Owner's publish
decision — none of which is requested now).
