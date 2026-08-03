# M10 single-writer — round 21: client increment 3 (displaced-core review)

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

Increment 3 per round-20's closing list, implemented narrowly on
accepted head `3056e8d`. `client-increments/INCR3-README.md` is the
package record (state machine, actions, guarantees, and the two
defects this increment's own tests caught and fixed).

Identity: base `3056e8d` → head `65e1d12` (index.html sha prefix
2b47374b…); cumulative diff `INCR3-DIFF.patch` (516 lines) — one
delimited block `M10-BLOCK-3` whose wiring only WRAPS increment-1/2
functions (no accepted code modified) plus a delegated `m10cx:*`
click listener.

Your eight return items, in order:
1. **State machine + actions** — README §state-machine/§actions:
   entry ONLY via validator-passing terminal journals (ruling 7; auth
   terminals are cleanup-only and the kept dirty re-pushes — tested);
   states dx-recovery/displaced layered via a wrapped m10cState; the
   G8 handoff (dx intent verified before terminal-ack removal, all
   three crash arms tested); actions: export (delivery-evidenced,
   gen+identity-bound), Keep-this-device's-copy, Take-the-server's-
   copy, Take-over, Decide-later.
2. **Preservation/export guarantees** — the envelope holds BOTH
   copies; ordinary push/pull are REFUSED while displaced (wrapped,
   fail closed); local editing continues via journaled core-refresh
   with the export gate closing automatically on any edit or server
   change; the destructive action demands an explicit whole-snapshot
   confirmation and an in-action fresh fetch.
3. **Journal phases + crash recovery** — core-displace
   (intent→net-done(fetch)→k1(envelope)→done), core-refresh, core-
   push-mine (intent→net-done→k1 base→k2 dirty→k3 envelope→done),
   core-take-server (intent→k1 wl_v1 verified→k2 base→k3 cleanup→
   done); crash arms seeded at EVERY phase of both resolution ops
   (8 arms) plus the 3 handoff arms — all recover to the correct
   terminal state with nothing lost.
4. **Account isolation** — A→B→A mid-push-mine dispatch: the
   response is discarded, the dx journal stays BYTE-IDENTICAL for
   replay under A's next session, zero `wl_core_*__userB` keys.
5. **Edit-during-review + lease-change** — the envelope's local copy
   follows the live store (journaled refresh) and the gate closes;
   a non-holder sees disabled resolution buttons + an inline
   take-over offer, and a push attempt refuses with zero commits.
6. **Storage-failure injection** — envelope write (block + dx journal
   survives for retry), refresh write (block; the edit itself is
   safe in wl_v1), resolution cleanup removal (block; the base
   already durable) — each fail-closed.
7. **Evidence** — `INCR3-C17-OUTPUT.txt` 30/30 (all arms above);
   `INCR3-C16-RERUN.txt` 49/49 and `INCR3-C15-RERUN.txt` 35/35
   (accepted increments unchanged); `INCR3-M8-REGRESSION.txt`
   171/171 + artifact-scope recovery 25/25 — all fresh at `65e1d12`.
8. **Artifacts** — the cumulative diff above; the README doubles as
   the narrow record since increment 3 is a single review round so
   far. Two defects found by this increment's own tests are recorded
   honestly in the README (boot gen-sync on the recovery path; the
   G8 gap arm's terminal-ack removal).

No destructive default exists (ruling 9): reload keeps the review,
logout is blocked while unresolved, account switches touch nothing,
lease expiry only disables buttons — all tested.

Deferred: photo queue (increment 4), gate surface + logout coupling
(5); NAS/coach/enforcement/publication behind their Owner gates,
unrequested.

Requested ruling: acceptance of increment 3 and authorization for
increment 4 (the photo operation queue + displaced-photo review on
the reviewed transactional photo routes).
