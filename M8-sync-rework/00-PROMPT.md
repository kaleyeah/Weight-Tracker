# M8 sync rework — round 6: design v6 — only the E-corrections

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

## Since round 5

`DESIGN.md` is v6, containing exactly your five corrections and nothing
else:
- E1: the ack journal's evolution is explicit — intent carries
  {oldBaseCanon, expectedRev, pushedCanon, gen, requestId} before the
  request; net-done adds newRev and the acknowledged identity.
- E2: ambiguous-outcome recovery specified with your three arms, and a
  transport error is defined as ambiguous — it never proves the request
  failed.
- E3: the blanket "never toward clean" is replaced: clean only on exact
  proof from actual persisted/server state; ambiguity or mismatch moves
  only toward dirty/conflict.
- E4: the stale "all three absent" parenthetical is deleted; the
  five-kind all-account prefix scan is the only rollback rule in the
  document.
- E5: the six crash points are named in the evidence plan, including
  server-commit-with-lost-response and gen advancing during each
  ambiguous outcome.

Repo facts are unchanged since round 5 (`compound-app/main` at `3de02ee`,
three ahead of `origin/main` `74a4777`; live base `74a4777:index.html`).

## This round

Rule on design v6 as the implementation contract.
