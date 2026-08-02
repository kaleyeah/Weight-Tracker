# M10 single-writer — round 3: design v3 with the tree-derived matrix

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

## Your round-2 items 1–11, as landed (DESIGN.md v3 +
## WRITE-SURFACE-MATRIX.md; verify in the tree)

1. Fail closed: missing route == unreachable route; a 404 never
   unlocks; server rollback is sequenced (enforcement off → verified
   lease-free client on both devices → only then removal).
2. The invariant is named honestly: exactly one fence may authorize
   SERVER mutation; a partitioned former holder can still edit locally,
   preserved for explicit reconciliation.
3. One durable lease row per user, never deleted; fence increments on
   grant, steal, post-expiry acquisition, AND release; strictly-
   increasing evidence and a safe-integer overflow guard.
4. Atomicity is designed: `$app.runInTransaction` around fence
   validation + content mutation, serialized on the same row as the
   lease route's own transactions; a 100-iteration forced steal‖write
   race is in the evidence plan.
5. Displaced CORE work gets its own durable store and recovery: the
   `wl_core_displaced__<uid>` envelope (verified writes + a
   `core-displace` journal op), captured by fetch-without-adoption,
   per-class review sheet, export-both, and explicit Push-mine /
   Take-server after retaking the pen; core pushes pause until
   resolved. Photos and device-local bookkeeping are exempt with
   reasons in the matrix.
6. The training fenceStale transition is fully specified through the
   existing M8 persist-and-verify conflict machinery, with the
   fetch-failure and server-moved arms stated.
7. One mailbox contract: `coachreq` and `health` are fence-exempt AND
   the hook rejects any PATCH mixing a mailbox field with content —
   tested in both directions.
8. The write-path matrix is TREE-DERIVED: 266 dispatcher actions
   inspected, 94 mutating, each mapped to persistence path and gate
   class; all non-action writers (imports, Health apply, migrations,
   tag derivation, coach jobs, Shortcut, logout, M8 internals)
   individually specified.
9. Fence transport defined (body fields on the CAS route; headers on
   raw PATCH), bound to `@request.auth.id` via the lease row only;
   spoof/malformed cases fail closed; deviceName display-only.
10. Cached expiry uses a monotonic in-session deadline; persisted
    grants never authorize offline writes across reboot — online
    revalidation or read-only; TTL/cadence marked provisional pending
    lifecycle evidence.
11. The enforcement compatibility gate enumerates EVERY writer (both
    devices, NAS coach superuser context with its stated bypass rule,
    the health Shortcut, in-app imports) and re-verifies on the day of
    the Owner-authorized enforcement redeploy.

## This round

Rule on design v3 as the basis for the server package (collection
migration + hooks + route + tests). Nothing is implemented, deployed,
or mutated by this round.
