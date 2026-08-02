# M8 sync rework — round 5: design v5, narrow corrections only

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

## Since round 4

`DESIGN.md` is v5. Your D-items, all folded:
- D2: repo facts restated — `compound-app/main` at `3de02ee`, three
  records commits ahead of `origin/main` `74a4777`; live base unchanged;
  a note that each bundle restates these as records land.
- D3: the stale "no-op CAS at the same rev" sentence is gone; B6 now
  points at the journaled fetch-and-compare, and the journal is written
  BEFORE any network request — an un-journalable push does not happen.
- D4: logout affordances differ by state — dirty-with-base gets Push now;
  bootstrap/conflict get routed into the export-first conflict workflow,
  no generic push.
- D5: rollback eligibility is a five-kind prefix scan (dirty, base,
  conflict, journal, corrupt) across all accounts; any hit forces
  roll-forward.
- D6: journal phases specified (intent → net-done → k1..kN), each advance
  persisted and verified; boot recovery compares actual keys against
  expect and never trusts phase alone.
- D7: journal-removal failure recognized idempotently by key comparison;
  cleanup retried; no replay, no clearing of dirty newer than
  expect.gen.
- D8: gen-advanced acks hand the captured acknowledged copy to tag
  derivation explicitly.

## This round

Rule on design v5 as the implementation contract. On a pass,
implementation begins per §9 — `engineering/m8` for tests, uncommitted on
top of the current records HEAD for the app, records preserved, no server
record touched, disposable-PB later as its own round.
