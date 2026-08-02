# M10 single-writer — round 6: consolidated design v6

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

## Your round-5 items, as landed (DESIGN.md v6 — still ONE consolidated
## document — and WRITE-SURFACE-MATRIX.md v4; verify in the tree)

1/2. **The platform writer path** (§2b): coach content writes move to
   `POST /api/cf/platform/patch-data` behind superuser-only middleware
   (its own binding, not a branch; user-token access tested-rejected).
   One transaction: load latest data+coreRev, apply ONLY the
   platform-owned field set, rev increment, its own ledger subsystem
   with idempotency. Never replaces athlete fields from a stale fetch.
   The NAS jobs migrate to it (reviewed, SSH channel). The invariant is
   restated as the three-part contract you specified, and coach‖device
   races in both orders are in the evidence plan.
3. **Ordinary core durability is explicit** (§2): core-specific keys
   (`wl_core_dirty/base/journal__<uid>`) with generation +
   persistence-proof, acknowledged canonical base + coreRev, intent
   journal persisted before dispatch with the full expect set incl.
   fence, all phases and arms (newer-gen, replay-first,
   ledger-expiry, transport/auth/conflict/fence-displaced/storage,
   cleanup-only), operation-aware validation + quarantine in core's
   namespace, and boot ordering across all three journals under the
   shared block union.
4. **The ledger is the durable oracle**: user content commits persist
   `writerFence` + a privacy-preserving `deviceLabelHash`; migration
   adds nullable columns with defaults and sentinels; down-migration
   is sequenced-refusal-first.
5. Platform route auth: separate superuser middleware; proofs that
   user tokens cannot invoke it nor select platform fields.
6. `sync:push`, `sync:pull` (a local-content REPLACEMENT), and boot
   pulls are inventoried BY EFFECT with gates and recovery.
7/8. The async rule: gate at entry AND revalidate immediately before
   every delayed mutation, with the ACTUAL sites named from the tree —
   the `wl-photo-input` change listener (both `photo:add` and
   `pphoto:add` funnels), both import listeners, every mutating
   askConfirm callback, the Health apply step, and the
   resolution/export callbacks. Discovery during this pass: photos
   ALSO sync server-side (`/api/collections/photos/records` via the
   wrapped idb primitives) — the photos collection's
   create/delete/update hooks now validate the fence under enforcement
   (per-row authorization; no revision protocol needed for independent
   rows), closing a writer that every earlier round missed.
9. Records: the remaining defects were fixed last round (M7b split
   row, rounds phrasing, §4/current-gate/standing-risks rewrites);
   local-only.
10. Migration scope fully enumerated (lease collection + ledger
   columns + photos hooks; sentinels; ordered, refusal-first down).
11. The sequence is corrected to your order: local-only implementation
   after approval → review with code and local evidence → Owner
   authorization → exact-package NAS deploy → disposable probes.

## This round

Rule on design v6 as the server-package contract for LOCAL disposable
implementation. Nothing is implemented, deployed, or mutated by this
round.
