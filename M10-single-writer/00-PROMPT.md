# M10 single-writer — round 4: design v4, with real-0.39.8 semantics evidence

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

## Your round-3 items 1–13, as landed (DESIGN.md v4,
## WRITE-SURFACE-MATRIX.md v2, artifacts/PB-SEMANTICS-PROBE.md)

1. Every core write carries `expectedCoreRev`, validated in the same
   transaction as the fence; both displaced resolutions re-fetch
   without adoption IN the action and replace the envelope on any
   difference — stale evidence never pushes or adopts. M10 finishes
   for core what M8 did for training.
2. ONE primitive (`cfFencedWrite`) specified per path — CAS route, raw
   update hook, record CREATE, superuser bypass, hook ordering — and
   the PB v0.39.8 behavior is PROVEN on a local disposable instance
   (production untouched): route-handler transactions work; rollback
   verified; a steal racing a slow write transaction BLOCKED 652ms
   (serialization observed, not assumed); pre-write fencing in
   onRecordUpdateRequest works via headers; in-hook programmatic saves
   don't recurse; create-request hooks fire. Raw run + hook source in
   artifacts/. The NAS disposable gate re-proves each path before
   production reliance.
3. The race oracle is observational: per-iteration server tuples
   (fence, holder, revs, canonical content identity) against the
   logged strictly-increasing lease history, barriers in BOTH orders,
   across steal‖write, steal‖steal, renew‖steal, release‖write,
   expiry-acquire‖write, 100 iterations each.
4. The training claim is corrected: `m8EnterConflict` is one verified
   write; the fetch-ok/conflict-write-fails arm is specified (block;
   dirty + ack journal intact; zero adoption) and added to evidence.
5. `core-displace` is a full machine: its own account-keyed journal
   namespace with typed per-op validation, M8's phase grammar,
   quarantine into the shared corrupt namespace, boot recovery ordered
   after M8's journal, mutual non-interference asserted by
   postcondition bytes, shared fail-closed block union.
6. Post-displacement editing: the live store stays authoritative; the
   envelope is DERIVED and refreshed through a journaled two-key
   write; boot re-derives from live on any crash; quota tests under
   the full double-copy occupancy.
7. Take-server(core) is held to the M8 Choose-Server standard,
   including in-action freshness, delivery-evidenced exports, fresh
   fetch before adoption, and gate resets on any drift.
8. Photos are CONTENT: every IndexedDB content mutation is G-photos
   and gated; only object-URL caches/thumbnails/UI prefs are exempt.
   The v1 contradiction is gone.
9. Matrix v2 is multi-class: 92 gated actions, 7 composites each
   listing every touched class (`day:clear` = core+photos+training);
   handler-entry gating precludes pre-gate partial mutation (denied-
   gate byte-checks in evidence); split-across-steal recovery rides
   the per-subsystem protocols with both sides landing in review.
10. Mailbox rule from the PARSED body: null content fields reject;
    unknown fields reject; duplicated transport rejects; CREATE with
    content is fenced; superuser bypass is `_superusers`-only, logged
    without payloads, proven not to match user tokens.
11. Stated: the FENCE is the authority; deviceId is a copyable label;
    duplicate-id tests prove no double authority and truthful
    takeover UI.
12. Records reconciled (commit `f257c1d`, local-only).
13. Nothing implemented, deployed, or mutated.

## This round

Rule on design v4 as the server-package contract. If it passes, the
next step per your round-3 close is implementing the server package
against disposable infrastructure only (local instance first, then the
NAS disposable gate), with NAS deployment still requiring its own
authorization.
