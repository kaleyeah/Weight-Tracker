# M10 — strict single writer: design v2

Engineer, 2026-08-02, per the round-1 rejection and the Owner's STRICT
ruling (Option A, decision channel; recorded in PROJECT_LOG). Round-1
items answered as A1–A9. Base: released `2026-08-02.415-m8`.

## 0. The ruled policy (A1/A2, Owner)

- A non-holder device is READ-ONLY, online or offline. Taking over
  requires being online.
- The holder may continue writing offline only while it carries a
  locally cached, unexpired lease; its server commits still require the
  current fencing token at commit time.
- Displaced dirty work (edits made under a lease that was since stolen)
  is PRESERVED and presented for explicit conflict recovery through the
  M8 conflict workflow; it NEVER auto-applies and never competes
  silently through CAS.

## 1. The lease collection (A3)

A new collection `writer_lease`, NOT a field on appdata (appdata is
raw-PATCHable by its owner until lockdown; a field there cannot be
hook-only):

- Fields: `user` (relation, unique), `deviceId`, `deviceName`,
  `fence` (integer, monotonic), `renewedAt` (server-stamped).
- Client API rules: list/view = `user = @request.auth.id`;
  create/update/delete = **closed** (`null` rule — nobody). All
  mutation happens inside the authenticated hook route, which runs with
  elevated access.
- Route `POST /api/cf/writer/lease` (CAS-kit shared-module pattern):
  ops `status`, `acquire`, `renew`, `release`, `steal`.
  - `acquire`: succeeds iff no lease row, or expired
    (server-now − renewedAt > TTL), or own deviceId; on success
    `fence += 1` when ownership CHANGES (renewal keeps fence).
  - `renew`: own deviceId only, refreshes `renewedAt`; rejected
    (`stale`) if the fence has moved.
  - `steal`: always succeeds online; `fence += 1`; returns the new
    fence. Displacement is discovered by the old holder via `stale`
    rejections — no handshake (A8: atomic + monotonic fencing makes a
    handshake unnecessary).
  - `release`: own deviceId only.
  - Responses carry `{fence, deviceId, deviceName, renewedAt,
    serverNow}` so clients never do cross-clock math (A7 groundwork).

## 2. Server-side fencing on EVERY writable path (A5)

The fence must be enforced where writes land, atomically:

- **Training CAS route** (`/api/cf/appdata/commit`): request gains a
  required `fence` field once enforcement is on. The hook loads the
  user's lease row IN the same handler, rejects
  (`409 {fenceStale:true, fence:<current>}`) unless the request fence
  equals the current fence AND the deviceId matches the holder. The M8
  idempotency ledger is unchanged; a fence rejection is recorded like a
  revision conflict (no ledger row).
- **Core raw writes** (the appdata update hook that today bumps
  revisions): the same check on any request touching `data`,
  `training`, `health`, or `coachreq` — the four writable content
  fields. Reads and rule-allowed non-content fields are unaffected.
- **The lease route itself** is the only fence mutator.
- **Enforcement switch** (staged rollout, A9-compatible): a
  `fencingOn` flag per user, set by the FIRST successful `acquire` from
  an M10 client... rejected — implicit switches are how upgrades break.
  Instead: enforcement is a reviewed hook constant `FENCING_ENFORCED`
  deployed OFF; turned ON only by a separately Owner-authorized hook
  redeploy AFTER both of the Owner's devices run the M10 client
  (mirrors the raw-PATCH lockdown pattern; the two switches can land
  together in one authorized server change).
  Until enforcement is ON, the lease still coordinates honestly (M10
  clients respect it client-side); enforcement closes the stale-holder
  hole (A5) and the legacy-client hole at the same moment.

## 3. Client rule and the write-surface inventory (A4)

Gates run BEFORE mutation, not at persistence. One primitive:
`m10CanWrite()` → `{ok}` | `{ok:false, holder:{deviceName}}`, consulted
by a single wrapper `m10Gate(fn)` installed at every mutation ENTRY
point (the action-dispatch handlers), not at save time.

Inventory of write surfaces (gated **G**, exempt **E** with reason):

- **G** All training mutations: workout start/set-log/finish/discard,
  session editor, routines, exercises, quick log, replace-exercise,
  notes (training-side).
- **G** All core day-data mutations: weight/steps/sleep/food/notes
  quick entry, GLP doses/symptoms (add, edit, delete), statuses,
  photos add/delete, day-clear, presets, settings edits that write
  `data` (targets, goals, profile, strategy).
- **G** Imports: backup restore, Health import apply
  (`hkTryFetch` apply step), seed/reset actions.
- **G** Conflict-resolution actions (Choose Local/Server) — they write
  training; the M8 export steps remain available read-only.
- **E** Reads, exports, backups, the coach request button (`coachreq`
  is a server-consumed mailbox field; writing it does not mutate
  content — EXEMPT but fenced server-side anyway by §2's core check…
  correction: `coachreq` IS in §2's fenced set; the client gate
  exempts it deliberately so a read-only device can still request a
  recap. The server accepts `coachreq`-only writes without a fence:
  it is append-only operational signaling, never content. Stated
  explicitly for review).
- **E** Logout journal / ownership / recovery-snapshot machinery
  (containment-owned, device-local).
- **E** M8 sync-state keys (device-local bookkeeping, not content).
- **E** The M8 push of ALREADY-dirty work after displacement: pushes
  are blocked by the server fence; the CLIENT, on `fenceStale`, routes
  the dirty copy into the M8 conflict workflow (§0: preserved,
  explicit, never auto-applied). The push attempt itself is permitted;
  its rejection is the designed path into review. This is the A2
  policy made concrete.

Non-holder UX: any gated action shows one sheet — "Griffin's iPhone is
the active writer. Take over on this iPad?" [Take over] [Not now].
Take-over requires the lease route to answer; offline it explains
read-only status.

## 4. TTL and cadence (A7, derived from strict policy)

The dominant risk under STRICT is a stale holder writing after
displacement — closed by fencing, not by the TTL. The TTL's only job is
letting a crashed/lost holder's lease expire so the OTHER device can
acquire without `steal`. Choose generous values that respect iOS
backgrounding: **TTL 24 hours**, renewed on every app-open and every 5
minutes foregrounded. Rationale: a backgrounded iPhone must not lose
its lease during a workday (A7's exact hazard); the iPad taking over an
"in-use" account is ALWAYS an explicit `steal` (one tap), which is safe
because fencing instantly invalidates the old holder's future commits.
Expiry only matters for a device that is gone for good.

## 5. Compatibility, migration, backup, rollback (A9)

- **Compatibility with `.415-m8`**: pre-M10 clients ignore the lease
  entirely. With enforcement OFF they behave exactly as today. The
  enforcement redeploy happens only after the Owner's devices are on
  M10 (verified via build check in Settings, both devices).
- **Migration**: one new empty collection; zero data transforms;
  appdata untouched. Collection creation via a reviewed migration file
  deployed with the hook.
- **Backup**: the lease is operational state, deliberately EXCLUDED
  from exports (losing it costs nothing — a device re-acquires).
- **Rollback (server)**: remove the lease route + collection; with
  enforcement OFF this is a pure deletion, no client impact. With
  enforcement ON, rollback = redeploy hooks with FENCING_ENFORCED off
  first (one file), then optionally remove.
- **Rollback (client)**: an M10 client against a leaseless server
  treats `status` failure as "no coordination available" and,
  per STRICT, stays writable ONLY if it was the last known holder,
  else read-only with a "coordination unavailable" notice.
  **Question 1 to the Architect**: is that fail-state acceptable, or
  should a missing lease SERVICE (as opposed to an unreachable one)
  unlock both devices — distinguishable via a 404 route probe?

## 6. Evidence plan

- **Route gate** (disposable users, real hook, M8-gate standard):
  acquire/renew/release/steal/expiry semantics; fence monotonicity
  across steals; closed client rules proven (direct create/update/
  delete attempts 400/403); field isolation (the route touches only
  writer_lease); enforcement OFF: legacy-shaped writes still land;
  enforcement ON (disposable-scoped flag build): unfenced and
  stale-fenced commits rejected atomically, correct-fence commits land.
- **Client suites** (two contexts, one account): holder writes freely;
  non-holder gated at ENTRY (mutation absent from state, not merely
  unsaved); takeover flow; demoted holder's next commit → fenceStale →
  the dirty copy lands in the M8 conflict workflow with both copies
  preserved; offline non-holder read-only; offline holder continues on
  cached lease; crash/restart of each device mid-everything (the M8
  fault-injection style); the full M8 + containment suites re-run
  unchanged.

## 7. Sequence

1. This design → review.
2. Server package (collection migration + hook + tests) → review →
   Owner-authorized NAS deploy (enforcement OFF) → disposable route
   gate.
3. Client implementation (delimited blocks) → evidence rounds.
4. Release package → Owner decision → publish → BOTH devices checked.
5. Owner-authorized enforcement redeploy (with or alongside raw-PATCH
   lockdown — one server-hardening decision).
