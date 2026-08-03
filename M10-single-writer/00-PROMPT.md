# M10 single-writer — round 17: client increment 2 (core durability)

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

Increment 2 per round-16 ruling 7, on the accepted foundation.
`client-increments/INCR2-README.md` is the package record.

Identity: base `3e7a0d0` (accepted increment-1 authority head) →
increment head `5359060` (index.html sha `2a1f4840…`), cumulative diff
`INCR2-DIFF.patch` (439 lines): the delimited `M10-BLOCK-2`, a
delimited wiring section (save marking + cloudPush/cloudPull/autoSync
transport ownership — ruling 8 honored, zero dispatcher gating), and
the one boot-line edit (core journal recovery after the lease settles,
before adoption).

Scope, exactly ruling 7: account-bound `wl_core_dirty/base/
ack_journal` with verified writes + quarantine (core corrupt
namespace) + the shared fail-closed block union (the m8StorageBlocked
getter re-defined inside the M10 block — no M8 edits); fenced
journaled route commits (intent-before-dispatch, phases
intent→net-done→k1→k2→done, typed terminal outcomes preserving dirty
and local bytes); replay-first recovery (captured-request re-dispatch;
the server ledger answers replays); the G9/G10 bootstrap (all five
server states); journaled adoption postconditions (dirty never
adopts). The retired newest-date autoSync heuristic is REMOVED from
the live path.

One judgment call to review: core canonicalization is the sorted-key
serialization of the JSON PROJECTION (`JSON.parse(JSON.stringify(v))`)
rather than M8's strict validator. Core state legitimately carries
in-memory `undefined`-valued properties (e.g. tag fields) that
JSON.stringify has always dropped on the wire and in `wl_v1` — the
projection IS the historical wire truth, so this is fidelity, not
coercion; unserializable structures still fail closed. Found by the
tags regression suite: the strict validator hard-blocked core sync on
`auto: undefined`. Documented in the README and the block comment.

Evidence (all fresh at `5359060`):
- `INCR2-C16-OUTPUT.txt` — the new C16 suite, 29/29, covering your
  round-16 list: fault injection at EVERY journal transition (crash
  seeded at intent / net-done / k1 / k2, each recovering to a clean
  consistent state with the server committed exactly once);
  lost-response replay with the SAME captured requestId and a
  single-entry server ledger; stale-fence displacement with zero
  server mutation and dirty + local bytes preserved; account-switch
  isolation (A's bytes byte-identical under B's session); storage
  write failure both at the journal intent (no network, no loss) and
  the dirty marker (soft block + shared union); reload/bootstrap
  recovery across all five G9/G10 server states incl. unknown-field
  survival through adoption; and pull REFUSED while dirty (zero
  adoption, base unchanged).
- `INCR2-C15-RERUN.txt` — the accepted increment-1 suite, 35/35,
  unchanged behavior.
- `INCR2-M8-REGRESSION.txt` — the complete client matrix vs
  `5359060` (171/171; the tags suite initially CAUGHT the canon
  defect at 4/5 on pre-fix commit 6e89b3b and is green after the fix
  — recorded honestly in the evidence file).

Passed: all of the above, locally. Deferred: displaced/conflict
REVIEW flows (increment 3 — the terminal states preserve everything
and block core sync until then), photo queue (4), gate surface (5);
NAS/coach/enforcement/publication behind their Owner gates.

Requested ruling: acceptance of increment 2 and authorization for
increment 3 (displaced-core + review flows on the terminal states
this increment records).
