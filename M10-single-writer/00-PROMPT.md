# M10 single-writer — round 13: client increment 1 (writer-lease client)

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

Per your round-12 authorization and increment guidance: the FIRST
dependency-ordered client increment, small and reviewable, not an
opaque migration. Everything below is LOCAL (engineering checkout,
branch engineering/m8); nothing published.

## The increment

- Base: commit a599efa — `index.html` in the engineering checkout
  synced BYTE-IDENTICAL to the live `2026-08-02.416-fx` client
  (sha 08a3f6bd…), so diffs read against the real deployed code.
  (The live app separately advanced to `.417-fx` — two Owner-approved
  client-only wording/toast changes outside the M10 loop per the
  narrowed process; increment 2 will rebase the engineering copy.)
- Change: commit 1ea4078, exact diff
  `client-increments/INCR1-DIFF.patch` (150 lines).
  `client-increments/INCR1-README.md` is the increment record.

## Block boundaries
- ONE new delimited block `M10-BLOCK-1 … M10-BLOCK-1-END` inserted
  immediately after `M8-END-OF-ALL-BLOCKS` (M8 blocks untouched).
- ONE marked wiring line outside it: `m10Boot()` added to the existing
  `pbRefresh` boot callback.

## What it implements (design v9.1 §3/§4/§5)
- Stable per-install deviceId (verified write; failure → corrupt state,
  read-only, and NO acquire is attempted from a corrupt device).
- Lease client on the reviewed route contract: acquire on boot; renew
  every 5 min foregrounded + on visibility return; a typed-stale renew
  revokes holding immediately; a transport-failed renew NEVER extends
  the monotonic in-memory deadline.
- The persisted grant is informational only: an OFFLINE RELOAD IS NOT
  A HOLDER (fail closed, tested) — design §4's cached-grant rule.
- `m10Gate`: passes only for a local-only app (no sync account) or a
  current holder inside the deadline; otherwise fails closed and
  offers the takeover sheet — session wording with the copyable label,
  never a physical-device claim (D10).
- Takeover = steal → verified grant apply → toast + render.

## Deliberate limits (dependency order, all deferred)
- NO dispatcher action consults `m10Gate` yet — proven as suite case F
  (a non-holder's local write still works): live behavior is UNCHANGED
  by this increment. Gate wiring is the final increment, after the
  protocols it guards exist.
- Fence transport on commits → increment 2 (core durability protocol).
- Displaced flows → 3; photo queue/review → 4; full 92-action gate
  surface + async revalidation + logout coupling → 5.

## Evidence
- `client-increments/INCR1-C15-OUTPUT.txt` — the new C15-M10 suite,
  14/14 in real Chromium against a mock lease implementing the
  disposable-PB-proven semantics (monotonic fence, held 409, typed
  stale, D-ABA, expiry): fresh-boot acquire; held-by-other read-only +
  takeover naming the session label + steal agreed by both sides
  (fence 6→7); offline-reload fail-closed despite a valid persisted
  grant; corrupt-grant read-only WITHOUT takeover; typed-stale renew
  revocation; the no-behavior-change safety case; deviceId stability.
- `client-increments/INCR1-M8-REGRESSION.txt` — the complete existing
  M8 + C14 CLIENT suites rerun against the increment-1 bytes, all
  green (165 cases: accounts 6, faults 64, matrix 9, quota 6,
  replay 10, tags 5, upgrade 4, C14 67): M8 preserved outside the
  block. The c11m8-recovery suite is ARTIFACT-scope by its own
  contract (it requires the SYNC_SAFE recovery build as CF_SRC, which
  no main client defines) and was run as designed against the
  unchanged recovery artifact: 25/25. The evidence file records this
  scoping plus an operational note on the mis-pointed runs it took to
  rediscover it.

## Passed vs deferred
PASSED: everything in `## What it implements`, locally.
DEFERRED: increments 2–5 as listed; NAS/coach/enforcement/publication
remain behind their Owner gates, unrequested.

Requested ruling: whether increment 1 is accepted and increment 2
(the core durability protocol: wl_core_dirty/base/ack_journal with
M8-grade verified writes, the G9/G10 bootstrap, fenced route commits,
replay-first recovery, adoption postconditions) may proceed on this
base.
