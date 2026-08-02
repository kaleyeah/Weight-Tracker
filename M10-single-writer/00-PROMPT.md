# M10 single-writer — round 7: consolidated design v7

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

## Your round-6 items, as landed (DESIGN.md v7 — one consolidated
## document; artifacts/PB-SEMANTICS-PROBE.md gains the file probe)

1/2. Photo request-hook fencing is gone. Three explicit transactional
   routes (upload multipart / metadata update / delete), each one
   `runInTransaction` validating the lease and mutating the record —
   and the file-in-transaction semantics are now PROVEN on local
   0.39.8 (probe2.pb.js, raw results appended): create-with-file
   commits and retrieves; forced rollback removes the record AND the
   managed file; a slow file transaction serialized against a steal
   (654 ms block); delete-rollback preserves both; committed delete
   removes both. Raw user photo mutation rejects under enforcement.
3. Displaced-photo durability: the account-keyed `wl_photo_ops__<uid>`
   intent/tombstone queue, written verified BEFORE any network
   attempt; fenceStale freezes the exact op as DISPLACED for explicit
   post-takeover review (Apply/Discard per entry); every currently
   unsafe behavior you enumerated (auto-retry, delete-regardless,
   swallowed PATCH, silent re-download) is replaced by explicit queue
   states.
4. Photo idempotency rides the SAME ledger (subsystem `photos`) with
   op+id+canonical-metadata identity: lost-response replay, same-key/
   different-op 409, retention-expiry fetch-and-compare, already-
   deleted-replays-success, transactional file cleanup.
5. photoSync adoption is holder-only, gated and revalidated per
   IndexedDB transaction; a non-holder's sync performs ZERO mutations
   on either side; both-changed → explicit review, never server-wins.
6. Clear is a journaled batch: member set captured at intent, per-item
   idempotent outcomes, local clear only after all acked-or-displaced,
   restart resumption, concurrent adds excluded and surviving.
7. The journal collision is resolved with separate validated keys —
   `wl_core_ack_journal__` and `wl_core_dx_journal__` — and a defined
   handoff: the ack journal terminalizes with outcome `displaced`
   (verified, preserving the original request identity) BEFORE the dx
   intent is written; boot order and the shared block union name the
   actual keys.
8. Core bootstrap is specified for all four `.416`→M10 cases, with the
   server-empty-first-push rule stated for your review (core has
   revision protection from day one) and the newest-date heuristic
   explicitly retired.
9. The complete core state model enumerates permitted
   edit/push/pull/logout/takeover behavior for all eight states.
10. Core adoption is journaled with ordered verified postconditions;
   dirty never adopts; field disappearance is never an empty
   authoritative copy.
11. Platform idempotency identity = hash(target user + canonical
   field patch), user-bound ledger row, replay/reuse/missing/
   concurrent semantics, and schema/retention/cascade fit checked in
   the local build.
12. Migration sentinels digest EVERY existing ledger row in memory
   (never logged), proving the column additions alter nothing.
13. The evidence plan adds the photo and core-client suites you
   enumerated, including both-order takeover races and the handoff
   crash boundaries.
14. Records: round counts rephrased as ongoing in both documents;
   DESIGN references the matrix generically.
15. Nothing is implemented, deployed, or mutated.

## This round

Rule on design v7 as the server-package contract for LOCAL disposable
implementation only.
