# M10 single-writer — round 14: increment 1 revised per round 13

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

The rebased and corrected increment 1 only, per your closing list.
Commits: 0389770 (base resynced byte-identical to live `.417-fx`,
dc2cd56f…, item 10) and 08e1280 (the revised block). Exact diff:
`client-increments/INCR1-DIFF.patch` (213 lines).
`client-increments/INCR1-README.md` maps every item to its landing.

Item-by-item (K1–K11 = round-13 items 1–11):

1. **Account-bound authority.** `M10.uid` is set only by a validated
   grant apply; `m10Gate`, `m10Renew`, and the takeover apply all
   require `M10.uid === pbUid()`; `m10Boot` synchronously revokes
   prior authority BEFORE any network; a response arriving for a
   switched-away account is discarded with a full reset
   ("account-changed"). C15 case F proves the A→B mid-acquire switch
   leaves no authority for B.
2. **One reset primitive.** `m10Reset(reason)` — holder, fence,
   deadline, known state, timer, uid, reason. Invoked: boot start;
   `pbClearSession` (one marked wiring line — this covers explicit
   logout AND the auth-refresh-death path, which routes through
   pbClearSession); 401/403 renew; detected UID change. Corruption
   persists separately (installation-wide storage evidence), as item 2
   allowed. C15 case G proves teardown clears holder+uid+timer.
3. **Boot ordering fixed as a contract.** The wiring is now
   `m10Boot().then(function(){autoSync();photoSync();})`. C15 case J
   delays the lease response 800 ms and proves the first appdata
   request lands only after it settles.
4. **Conservative deadline.** `deadline = sendT0 + ttlMs` — the full
   round trip is subtracted; grant bodies are validated (ok===true,
   safe integer fence in [1, 2^53−2], finite 0<ttl≤7d,
   holderDeviceId === our verified id) before any apply. C15 case H
   proves remaining authority ≤ ttl − delay under a 700 ms response
   delay.
5. **Device-id validation.** crypto.getRandomValues; exact grammar
   `dev-[a-z0-9]{24}`; verified write on creation; malformed or
   oversized EXISTING bytes → corrupt, never silently replaced (C15
   D2 ×2).
6. **Grant validation + honesty.** Strict shape (mark, owner uid,
   safe nonneg integer fence, deviceId === this verified
   installation, finite bounded ttl and server timestamp);
   foreign-uid, foreign-device, non-integer-fence, unbounded-ttl all
   rejected as corruption (C15 D3 ×4). The persisted copy never
   restores authority (case C). A failed grant write is recorded as
   `M10.grantWriteFailed` with authority retained — and no code or
   doc calls it a "verified apply" anymore (case I).
7. **Classified renewal.** Valid 200 (shape-checked, same fence)
   extends from its OWN send time; typed stale → "stale"; 401/403 →
   full reset "auth-failed"; malformed 200 → "malformed-response";
   other → "server-error"; transport failure retains authority only
   until the unchanged deadline. C15 case E distinguishes stale vs
   5xx vs 401 vs malformed in state.
8. **C15 expanded 14 → 28 cases**, covering every bullet of item 8
   (`INCR1-C15-OUTPUT.txt`, 28/28).
9. **Dispatcher evidence corrected.** Case K now drives the
   PRODUCTION dispatcher — a real `data-act` click through the
   document handler mutating state — and the direct-write check is
   renamed to what it is.
10. **Rebased.** The base commit is byte-identical to live `.417-fx`;
    both Owner-approved `.417` changes verified present in the
    increment bytes; diff regenerated against that base; C15 and the
    full client regressions rerun on the result.
11. **Records-path contract, stated explicitly**: the authoritative
    records live on the repo's `main` branch (the deployed-lineage
    checkout at `~/projects/compound-app`) — `engineering/m8` has
    never carried `reports/`. Documented in INCR1-README; if you want
    the records mirrored into this branch instead, rule so and they
    will be merged.

Evidence: `INCR1-C15-OUTPUT.txt` 28/28;
`INCR1-M8-REGRESSION.txt` — the full client regression matrix rerun
against the revised, rebased bytes (numbers inside; the
artifact-scope c11m8-recovery remains 25/25 against the unchanged
recovery artifact, as documented last round).

Passed: all of the above, locally. Deferred: increments 2–5;
NAS/coach/enforcement/publication behind their Owner gates,
unrequested.

Requested ruling: acceptance of revised increment 1 and authorization
for increment 2 (core durability protocol) on this `.417`-rebased
foundation.
