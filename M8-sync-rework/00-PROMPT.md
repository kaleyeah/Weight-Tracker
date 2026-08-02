# M8 sync rework — round 10: findings 1–13 fixed, revised diff + evidence

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

## Your 13 findings, as landed (verify in the tree; hashes in
## artifacts/evidence/IDENTITIES.txt)

1. `saveTraining()` marks dirty FIRST, then persists local — a crash
   between them now leaves data classified dirty, never clean.
2. The ack path persists and read-back verifies `net-done`, `k1` (base),
   `k2` (dirty) — every journal-write failure blocks, none ignored.
3. Choose Local IS transition 1: in-action export-freshness check,
   routed through the shared `m8AckOutcome`, transport ambiguity keeps
   the journal, conflict removal is a verified `k3` phase.
4. Choose Server IS transition 5: in-action freshness check, the A9
   export is awaited for delivery, a `choose-server` journal captures
   all inputs, the conflict is retained until local and base writes
   verify, clear is verified.
5. The export gate advances only on success-bearing evidence: a
   RESOLVED `navigator.share` (rejection/dismissal keeps the gate
   closed) or, on the download fallback, an explicit both-files-saved
   confirmation. Nothing marks delivered on an anchor click.
6. A localStorage read exception blocks sync distinctly from absence.
7. Quarantine verifies the original is gone after removal; failure
   retains both copies and the blocked state.
8. The recovery build performs zero training-related reads: the
   training pull path makes NO fetch (test forces `trainingPull()` +
   `m8Push()` and asserts zero network requests). Rebuilt artifact
   sha256 `bda745b8…61ca22a5`.
9. The recovery test asserts EVERY seeded key byte-identical BEFORE the
   deliberate edit — no exemptions. 15/15.
10. The replay suite models the real route: no ledger row → the replay
    executes fresh (F7-2) or revision-conflicts; not-applied is proven
    only via the expired-ledger fetch path (F7-2b, commit calls
    asserted 0). The impossible 200 `{replay,ok:false}` is gone. The
    mock is stateful: a successful commit updates what the record route
    serves — which round-9's static mock did not, and which is exactly
    what your finding exposed.
11. `m8NewRequestId()` uses `crypto.getRandomValues`, fails closed; a
    null id hard-stops before journal creation at both dispatch sites.
12. Fetch-proves-applied recovery and the ack path both run D8 tag
    derivation from the journaled/captured acknowledged copy, never the
    live generation.
13. The quota suite requires a VERIFIED dirty marker or an explicit
    block BEFORE any network action (captured pre-push).

## Evidence

54 cases, 7 suites, all green on candidate `bb2d8899…14dc08af`
(607-line diff over published `.414`, records preserved, nothing
committed to the app lineage): upgrade 4 (baseline run still destroys
the 2026-07-31 session — 1/4), matrix 9, replay 10, accounts 6,
quota 5, tags 5, recovery 15. Raw outputs in artifacts/evidence/.
All desktop Chromium against mocked endpoints (R10 wording): real
engine, modeled server. Disposable-PB remains its own later gate.

## This round

Rule on the revised implementation. If it passes, name the next gate
(disposable-PB round). No commit, publication, or server-record
mutation is requested.
