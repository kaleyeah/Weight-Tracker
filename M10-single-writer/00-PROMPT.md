# M10 single-writer — round 5: consolidated design v5

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

## Your round-4 items, as landed (verify in the tree)

- D1/D2 (the architectural core): raw-PATCH content fencing is
  ABANDONED. All user content writes move to the transactional commit
  route — training stays; CORE joins it via the kit's existing `core`
  subsystem, gaining the SAME ledger (which answers D5: Push-mine and
  every core write get journaled idempotency keys, replay-first
  recovery, retention, and same-key/different-body rejection with the
  semantics the M8 PB gate already proved live). Raw user PATCH/CREATE
  carrying content rejects once enforcement ships; request hooks only
  reject raws and police the mailbox.
- D3: the race oracle is observational with the route's
  strictly-increasing fence responses as the independent order.
- D4/D6: creation goes through the route (rev-0 commit provisions the
  row — gate-proven); the training fence-stale transition completes
  through a typed terminal journal outcome with all three crash arms
  specified.
- D7: the core machine is fully enumerated per op — core-displace,
  core-refresh (an explicit op now), core-push-mine, core-take-server —
  with intent contents, phased verified postconditions, ambiguity
  behavior, key-not-phase boot derivation, terminal outcomes, and
  quarantine into the shared corrupt namespace under the shared
  fail-closed union.
- D8: Push-mine's full-snapshot scope is explicit in the UI and
  exports; no per-class merge exists; the commit is idempotent via the
  ledger.
- D9: matrix v3 incorporates every non-action writer and every
  IndexedDB mutation with concrete names, stores, gate locations,
  endpoints, fence transport, and recovery/exemption rationale.
- D10: takeover wording says "another session" — never which physical
  device; the fence is stated as the sole authority.
- D11: the records sweep is COMPLETE this time: PROJECT_LOG §4
  rewritten to post-M8 state (numbering fixed), the current-gate
  section replaced (M10 design review is the gate; `.415-m8` is the
  accepted release; origin/main position stated), standing risks
  rewritten post-M8 incl. the honest core last-write-wins gap that M10
  closes. All local-only.
- D3(probe): the Q3 description is corrected in the artifact and no
  longer cited for request-hook behavior — which v5's architecture no
  longer needs.
- v5 is ONE consolidated authoritative document: lease schema and
  closed rules, all route ops with transaction boundaries, monotonic
  fence lifecycle incl. release-bumps and overflow, TTL/cached-grant
  clock rules, migration up/down, backup treatment, enforcement-off
  compatibility, sequenced rollback in both directions, the
  superuser/mailbox contract, client consequences, and the
  disposable-only evidence plan.

## This round

Rule on design v5 as the server-package contract. If it passes, the
next step is implementing the server package against disposable
infrastructure only (local instance first, then the NAS disposable
gate), NAS deployment still requiring its own authorization.
