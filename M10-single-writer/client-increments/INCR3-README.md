# M10 client increment 3 — displaced-core review

## Package identity
- **Base**: `3056e8d` — the accepted increment-2 head.
- **Increment head**: `65e1d12` — index.html sha256 prefix `2b47374b…`.
- **Cumulative diff** `INCR3-DIFF.patch` = 3056e8d → 65e1d12 (516
  lines): the delimited `M10-BLOCK-3 … M10-BLOCK-3-END` (machinery +
  review UI + a wiring IIFE that only WRAPS increment-1/2 functions —
  no accepted code modified) and the delegated `m10cx:*` click
  listener.

## The state machine (round-20 ruling 7: validated terminals only)
Entry: `m10cxHandoff` consumes ONLY a validator-passing terminal
core-ack/bootstrap journal (outcome conflict / fence-displaced /
bootstrap-conflict). `auth` terminals are cleanup-only (dirty kept for
a fresh push under a live session — proven by test: the boot push then
lands the local copy). Never inferred from UI, toasts, untyped
responses, or intent-phase journals.

States (layered over increment 2 via a wrapped `m10cState`):
- `dx-recovery` — a dx journal is mid-flight; sync paused; boot
  resumes it (replay-first for push-mine).
- `displaced` — the envelope `wl_core_displaced__<uid>` holds BOTH
  copies ({reason, coreRevSeen, serverData, localData, exports});
  ordinary push AND pull are refused (wrapped, fail closed); local
  editing continues, journaled as `core-refresh` (the envelope's
  local copy follows the live store; a stale export gate closes
  automatically because it is bound to gen + both canonical
  identities).

The G8 handoff: dx intent (carrying the original requestId) verified
BEFORE the terminal ack is removed; a crash in the gap leaves the
terminal ack, and boot derives/continues deterministically (tested:
gap arm, net-done arm, envelope-written arm). `core-displace` fetches
the FRESH server copy at net-done (conflict/displacement terminals
carry no payload by design).

## User actions (ruling 8: journaled, crash-recoverable, account-bound)
- **Export both copies** — M8 Choose-Server standard: delivery-
  evidenced (share-resolution or explicit confirmation), bound to the
  current generation AND both canonical identities; any edit or
  server change closes the gate.
- **Keep this device's copy** (`core-push-mine`) — requires the pen +
  open gate; in-action fresh fetch first (drift → envelope
  re-captured, gate reset, NO action); journal intent
  {expectedRev(fresh), pushedCanon, gen, fence, requestId} → route
  dispatch (typed arms) → net-done → base(k1) → dirty(k2) →
  envelope(k3) → journal removal — every write verified. Mid-action
  conflict → envelope replaced with the newer server copy, gate
  reset, review stays open; mid-action fenceStale → envelope
  retained; lost response → replay-first on reload with the SAME
  requestId (single server commit, tested).
- **Take the server's copy** (`core-take-server`) — destructive:
  requires the pen + gate + an explicit whole-snapshot confirmation;
  fresh fetch inside the action; journal intent → wl_v1 replaced
  VERIFIED (k1) → base (k2) → envelope+dirty cleanup (k3) → journal
  removal; unknown fields survive adoption (tested).
- **Take over** — the lease steal flow (increment 1) offered inline
  when not the holder; resolution buttons stay disabled meanwhile.
- **Decide later** — closes the sheet only; state unresolved.

## No destructive default (ruling 9)
Reload keeps the review; logout is BLOCKED while
displaced/dx-recovery/review-pending/corrupt (wrapped pbLogout — M8's
own training logout gate still runs afterwards); account switch
leaves the envelope and dx journal byte-identical with zero writes
under the other account; lease expiry only disables the resolution
buttons. All tested.

## Evidence
- `INCR3-C17-OUTPUT.txt` — C17 30/30: handoff ×4 (conflict /
  fence-displaced / bootstrap-conflict / auth-cleanup-then-repush);
  G8 crash arms ×3; edit-during-review (envelope refresh + gate
  close); export gate; push-mine end-to-end + drift + mid-action
  conflict + fenceStale + lost-response replay (single commit, same
  requestId); take-server end-to-end (unknown fields intact) + crash
  arms ×4; push-mine crash arms ×4; reload/logout no-destructive-
  default; A→B→A mid-dispatch isolation (zero B keys, envelope +
  dx byte-identical); non-holder gating + takeover offer;
  storage-failure injection ×3 (envelope write, refresh write,
  cleanup removal — each fail-closed with nothing lost).
- `INCR3-C16-RERUN.txt` 49/49, `INCR3-C15-RERUN.txt` 35/35 — the
  accepted increments unchanged in behavior.
- `INCR3-M8-REGRESSION.txt` — full client matrix vs `65e1d12`:
  171/171 (+artifact-scope recovery 25/25).

## Fixes found by this increment's own tests
- The boot generation sync ran only on the no-journal path, so a
  resolution comparing against `m10cGen` could fail to clear the
  dirty marker — fixed in the boot wrapper (gen synced before ANY
  recovery path).
- The G8 crash-in-gap arm left the superseded terminal ack in place —
  the handoff now removes it (verified) once the dx intent validates.
