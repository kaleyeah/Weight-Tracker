# M10 — strict single writer: design v5 (CONSOLIDATED)

Engineer, 2026-08-02. THE authoritative server-package contract —
self-contained; v2–v4 are history, not references. Owner ruling STRICT
(recorded). Base: released `2026-08-02.415-m8`. Companions:
`WRITE-SURFACE-MATRIX.md` v3 and `artifacts/PB-SEMANTICS-PROBE.md`
(corrected). Round-4 items answered as D1–D13 inline.

## 1. Invariant and honesty

Exactly ONE fence may authorize server mutation of content. A
partitioned former holder can still edit locally (a steal is
unobservable offline); such edits are captured durably for explicit
review and can never commit under a stale fence. M10 does not stop
offline typing; it guarantees one server pen and lossless capture.

## 2. Architecture (D1/D2): all content writes are ROUTE writes

No content fencing rides raw PATCH — the check-then-write window in
request hooks is unproven and therefore forbidden. Instead:

- **Training**: already writes via `/api/cf/appdata/commit`
  (subsystem `training`) — gains fence fields.
- **Core**: moves to the SAME route, subsystem `core` (the deployed
  CAS kit already defines `core: {field:"data", rev:"coreRev"}` and
  its ledger is subsystem-scoped) — one route, one ledger, one
  transaction model, already byte-proven live for training by the M8
  gate. Core writes send `{subsystem:"core", expectedRev:coreRev,
  idempotencyKey, payload, fence, deviceId}` — solving D5
  (idempotency for Push-mine and every core write) with the EXISTING
  ledger semantics: replay-first recovery, 30-day retention,
  same-key/different-body 409, ambiguity handled exactly as M8's
  journaled protocol — reused, not reinvented.
- **Raw user PATCH/CREATE carrying `data`, `training`, or revision
  fields REJECTS outright** (`onRecordUpdateRequest`/`CreateRequest`
  keep only two jobs: reject forbidden raw content writes, police
  mailbox-only requests). Enforcement of this rejection ships with
  FENCING_ENFORCED (one switch, below) because `.415-m8` clients
  still raw-PATCH core; until the switch, raw core writes pass
  untouched (compatibility) while the new route already exists.
- **Record provisioning**: the commit route already creates the
  appdata row on a rev-0 commit (proven in the M8 PB gate). Raw
  user CREATE with content: rejected under enforcement; mailbox-only
  create is unnecessary (the row exists after any first commit) and
  is rejected for simplicity — the mailbox writers (Shortcut, coach)
  only ever PATCH existing rows.

### The one server primitive

`cfFencedCommit` — executed inside ONE `$app.runInTransaction`
(route-handler transactions and their serialization are proven on
real 0.39.8: probe Q1/Q1b/Q1c, steal blocked 652ms):
1. load lease row by `@request.auth.id`;
2. if FENCING_ENFORCED: require `active && holderDeviceId===deviceId
   && fence===request.fence` → else `409 {fenceStale, fence}`;
3. idempotency-ledger check (existing kit logic, subsystem-scoped);
4. `expectedRev` check against the subsystem's rev → else
   `409 {conflict, serverRev, payload}`;
5. content mutation + rev increment + ledger row;
6. commit. Any failure → rollback (proven).
Superuser context (`_superusers` auth) bypasses step 2 ONLY, by
explicit branch, logged (route, collection, field names — never
payloads), tested to never match user tokens.

## 3. The lease

**Collection `writer_lease`** (closed): fields `user` (relation,
unique), `holderDeviceId` (text, nullable), `deviceName` (text,
display-only), `fence` (number), `renewedAt` (autodate on update),
`active` (bool). API rules: list/view `user = @request.auth.id`;
create/update/delete `null` (nobody) — mutation only inside hooks.

**Route `POST /api/cf/writer/lease`**, ops (each one transaction):
- `status` → current `{fence, holderDeviceId, deviceName, active,
  renewedAt, serverNow, ttlMs}`.
- `acquire` → succeeds iff no row (creates it, fence=1, active),
  or own deviceId (no-op refresh), or `active===false`, or expired
  (`serverNow - renewedAt > TTL`); ownership CHANGE → `fence+=1`.
- `renew` → own deviceId + fence match + active → refresh renewedAt;
  else `409 stale`.
- `release` → own deviceId + fence match → `active=false,
  holderDeviceId=null, fence+=1` (a released fence can NEVER validate
  again — D-ABA).
- `steal` → always succeeds online: `fence+=1`, new holder. No
  handshake — displacement is discovered via `stale`/`fenceStale`.
Monotonicity: every transition strictly increases fence or leaves it
unchanged (renew/no-op acquire); the route hard-errors (blocks) if
fence would exceed 2^53-2. The row is NEVER deleted in normal
operation. Fence history is evidenced by the strictly-increasing
responses; tests assert monotonic order across the full op set.

## 4. TTL, cached grants, clocks

TTL 24h; renew on app-open + every 5min foregrounded (PROVISIONAL,
revisited with client lifecycle evidence). Client cached grant:
in-memory `{fence, deviceId, perfDeadline=performance.now()+ttlMs}`;
persisted copy `{fence, deviceId, grantedServerNow, ttlMs}` is
NEVER sufficient for offline writing after reload/reboot (monotonic
clock lost): boot requires an online `renew` to count as holder;
failing that the device is read-only (fail closed). Corrupt cached
grants → read-only + banner. Clients never compare their wall clock
to server time; expiry decisions live on the server (`serverNow` in
responses is informational).

## 5. Client consequences

- `m10Gate` at HANDLER ENTRY for every gated action/function in
  matrix v3 (pre-mutation by construction; denied-gate byte-checks in
  evidence). Photos are content: all IndexedDB content mutations
  gated; caches/thumbnails/UI prefs exempt.
- Composites (7 in matrix v3): one global pre-gate; each side of a
  split-across-steal lands in its own subsystem\'s displaced flow.
- Non-holder UX: "Another session is the active writer ("<deviceName>")
  — take over here?" [Take over]/[Not now]. NEVER claims which
  PHYSICAL device (D10): deviceName is a copyable label; wording is
  "session", and the takeover UI keys on server fence+holder only.
- Displaced TRAINING: fenceStale → fetch-without-adoption →
  `m8EnterConflict(...,"fence-displaced")`. Completion (D6): on
  verified conflict persistence the surviving ack journal advances to
  a typed terminal outcome `{outcome:"fence-displaced"}` (verified
  write) then verified cleanup; crash arms — between conflict write
  and terminal write: boot sees conflict + nonterminal journal →
  fail-closed union (M8 rules) → re-runs terminalization idempotently;
  between terminal write and cleanup: cleanup-only (proven M8
  pattern). Conflict-write failure: block; dirty + intent journal
  intact; zero adoption.
- Displaced CORE (full machine, D7): stores
  `wl_core_displaced__<uid>` (envelope: `{owner, mark, canon,
  enteredAt, reason, coreRevSeen, serverData(canonical str),
  localData(canonical str), exports:{...}}`) and
  `wl_core_journal__<uid>`. Ops (validator-typed like M8\'s):
  - `core-displace`: intent `{coreRevSeen}` → net-done (fetched
    serverData identity recorded) → k1 envelope written+verified →
    verified end. Ambiguity (fetch fails): journal survives; retry on
    boot; local untouched. Boot derives from keys (envelope present +
    matching identity ⇒ complete regardless of phase).
  - `core-refresh` (explicit op, D7): intent `{gen}` → k1 live store
    verified → k2 envelope.localData re-derived from live, verified →
    end. Crash: boot compares envelope.localData vs live canonical →
    re-derives from live (live is truth for "mine").
  - `core-push-mine` (after retake + freshness): rides the commit
    route with its own idempotencyKey journaled at intent
    `{expectedRev(fresh), pushedCanon(localData), requestId, fence}`;
    same ambiguity/replay grammar as M8 ack (the route ledger is the
    same); success → verified envelope+journal cleanup, coreRev base
    updated; conflict → envelope REPLACED with the newer server copy
    (verified), gates reset.
  - `core-take-server` (M8 Choose-Server standard, D8 scope honesty):
    the review sheet states explicitly that resolution replaces the
    ENTIRE core snapshot on the losing side (no per-class merge —
    none is authorized); per-class summaries are display only.
    In-action freshness, delivery-evidenced exports bound to current
    gen+identity, fresh fetch (rev+canonical) immediately before
    adoption, journal-first (intent→k1 live store→k2 envelope
    cleanup→verified end), re-export on any drift.
  - Quarantine: malformed/invalid envelope or journal →
    copy-verify-delete into the shared corrupt namespace (kinds
    `coredisplaced`/`corejournal`), persistent hard block derived at
    boot; same fail-closed union as M8 (either subsystem\'s hard
    block halts both).
  - While displaced-core is open, ordinary core pushes pause (fail
    closed); local editing continues via `core-refresh`.

## 6. Mailbox contract

`coachreq` and `health` only. From the PARSED body: a request is
mailbox-only iff its present-key set ⊆ {coachreq} or ⊆ {health};
null-valued content keys count as present (reject); unknown keys
reject; duplicated transport values reject; CREATEs are never
mailbox-only (see §2). Mailbox-only user writes pass unfenced (a
read-only device may request a recap; the Shortcut may deliver).
Superuser writes: §2 bypass, logged, payload-free logs.

## 7. Migration, backup, compatibility, rollback

- **Migration up**: one migration file creating `writer_lease`
  (closed rules) — no data transforms; appdata untouched. **Down**:
  delete the collection (safe: operational state only).
- **Backup**: lease excluded from athlete exports (operational,
  valueless to restore); included in PB full backups trivially.
- **Compatibility (enforcement OFF)**: `.415-m8` devices see zero
  behavioral change — raw core PATCH still passes, training CAS
  unaffected (fence fields optional until enforced), lease routes
  unused. The M10 client, pre-enforcement, already uses the core
  route + lease honestly (client-side strictness) — enforcement
  closes the stale-holder and legacy-client holes server-side.
- **Enforcement switch**: ONE reviewed constant `FENCING_ENFORCED`,
  deployed OFF; flipped ON only by a separately Owner-authorized
  redeploy after BOTH devices verified on the M10 build — deliberately
  combinable with raw-PATCH lockdown (the same redeploy: lockdown IS
  the §2 raw-reject going live). The enforcement-day checklist
  re-verifies the writer enumeration: both devices (M10, fenced),
  NAS coach jobs (superuser bypass), health Shortcut (mailbox), in-app
  imports (gated+fenced), nothing else (rules closed).
- **Rollback (server)**: SEQUENCED — redeploy with enforcement OFF →
  verify both devices → then optionally remove route/collection. A
  404 lease route NEVER unlocks a client: missing == unreachable ==
  fail closed (cached-valid holder continuity only; everyone else
  read-only).
- **Rollback (client)**: an M10 client is fully functional against an
  enforcement-OFF server; rolling the CLIENT back to `.415-m8`
  requires enforcement OFF first (else its raw core writes fail) —
  stated in the release package when we get there.

## 8. Evidence plan (the server-package gate, disposable only)

Local instance first, then the NAS disposable gate:
1. Lease semantics: full op set, monotonicity across
   grant/steal/release/expiry cycles, never-deleted row, overflow
   guard, closed-rule proofs (direct create/update/delete → 400/403).
2. The race suite (D3 oracle): observational tuples (fence, holder,
   revs, canonical content identity) + the route\'s strictly-increasing
   fence responses as the independent order; barriers BOTH ways
   (in-transaction slowMs; pre-queued steal); pairs: steal‖write,
   steal‖steal, renew‖steal, release‖write, expiry-acquire‖write;
   100 iterations each.
3. Fenced commit route: fence/device/expectedRev/ledger validation
   matrix incl. spoofed/malformed/missing transport; superuser bypass
   positive + user-token negative; subsystem-`core` creation at rev 0;
   whole-record field isolation per subsystem (M8-gate standard).
4. Raw rejection (enforcement ON, disposable-scoped build): content
   PATCH/CREATE rejected; mailbox matrix (§6) both directions; mixed
   rejected; `.415`-shaped writes pass with enforcement OFF.
5. Ledger reuse for core: replay, same-key/different-body, retention
   boundary — subsystem-scoped independence from training keys.
All with raw request/response evidence, before/after record state,
hook hashes, and verified disposable cleanup (user 404 + record-by-id
404 + relation 0), per the M8 gate bar.

## 9. Sequence

1. This design → review (round 5).
2. Server package implementation vs disposable infra → review → 
   Owner-authorized NAS deploy (enforcement OFF) → NAS disposable gate.
3. Client (delimited blocks, M8 discipline) → evidence rounds.
4. Release package → Owner decision → publish → BOTH devices checked.
5. The combined hardening decision: FENCING_ENFORCED + raw-PATCH
   lockdown, Owner-authorized, with the enforcement-day checklist.
