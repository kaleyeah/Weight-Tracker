# M10 — strict single writer: design v6 (CONSOLIDATED)

Engineer, 2026-08-02. THE authoritative server-package contract —
self-contained; v2–v4 are history, not references. Owner ruling STRICT
(recorded). Base: released `2026-08-02.415-m8`. Companions:
`WRITE-SURFACE-MATRIX.md` (current version in the tree) and `artifacts/PB-SEMANTICS-PROBE.md`
(corrected). Round-4 items answered as D1–D13, round-5 as E1–E12 inline.

## 1. Invariant, stated exactly (E2)

- At most one DEVICE fence may authorize athlete-device content writes
  at any moment (atomically enforced).
- PLATFORM writers (the NAS coach) are separately authenticated and
  limited to NAMED fields through a revision-safe transactional path —
  they bypass the device lease, never revision safety or field
  ownership (§2b).
- ALL content mutation — device or platform — serializes through
  revision-safe transactional primitives.
- A partitioned former holder can still edit locally (a steal is
  unobservable offline); such edits are captured durably for explicit
  review and can never commit under a stale fence.

## 2. Architecture (D1/D2): all content writes are ROUTE writes

No content fencing rides raw PATCH — the check-then-write window in
request hooks is unproven and therefore forbidden. Instead:

- **Training**: already writes via `/api/cf/appdata/commit`
  (subsystem `training`) — gains fence fields.
- **Core**: moves to the SAME route, subsystem `core`, with an
  EXPLICIT M8-grade client durability protocol of its own (E3 — core
  keys and postconditions stated, not "reuses M8"):
  - `wl_core_dirty__<uid>` `{owner, mark, gen, persistedGen, ts}` —
    set synchronously in `save()` before the debounce; verified
    primary write of `wl_v1` with per-generation proof; an unproven
    generation soft-blocks core sync exactly as M8's rule.
  - `wl_core_base__<uid>` `{owner, mark, canon, rev, body}` — the
    acknowledged canonical core copy + `coreRev` (~size of `data`;
    same full-copy Owner ruling rationale).
  - `wl_core_journal__<uid>` — intent PERSISTED BEFORE DISPATCH:
    `{op:"core-ack", phase, startedAt, expect:{oldBaseCanon,
    expectedRev, pushedCanon, gen, fence, requestId}}`; phases
    intent → net-done(`newRev`) → k1(base) → k2(dirty) → verified end;
    newer-generation-in-flight arm (base advances, dirty stays,
    reschedule); replay-first recovery within ledger retention,
    fetch-and-compare fallback after expiry; transport ambiguity
    keeps the journal; auth rejection terminalizes (`done`/outcome);
    revision conflict → displaced-core flow; fence displacement →
    displaced-core flow; storage failure → the same fail-closed
    verified-write rules as M8 (block classes shared); cleanup-only
    recovery for terminal records; operation-aware validation +
    quarantine identical in structure to M8's, in core's namespace.
  - Boot ordering: M8 training journal → core journal → displaced-core
    journal; a hard block from any halts all (shared union).
  Core writes send `{subsystem:"core", expectedRev, idempotencyKey,
  payload, fence, deviceId}`; the route ledger provides replay,
  retention, and same-key/different-body semantics per subsystem.
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
5. content mutation + rev increment + ledger row — the ledger row now
   PERSISTS `writerFence` and a `deviceLabelHash` (sha256 of deviceId,
   privacy-preserving) for every user content commit (E4): the durable
   commit oracle the race evidence reads. Migration adds the two
   nullable columns (existing rows default null = pre-M10);
   enforcement-OFF writes record them when supplied; down-migration
   drops the columns only under the sequenced rollback rules;
6. commit. Any failure → rollback (proven).
### 2b. The platform writer path (E1/E5)

The coach jobs currently read `data` and write back a FULL snapshot —
a live lost-update window against a concurrent device commit (either
side can build its payload from stale content). M10 removes it:

- New route `POST /api/cf/platform/patch-data`, **superuser middleware
  only** (`$apis.requireSuperuserAuth()` — its own binding, not a
  branch inside the users-only commit route; a user token cannot reach
  it, tested). Body: `{user, fields:{...}, idempotencyKey}` where
  `fields` keys must be ⊆ the PLATFORM-OWNED set
  `{nightlySummary, weeklySummary, nightlyLog, scriptVer}` — anything
  else rejects.
- One transaction: load latest `data`+`coreRev` → apply ONLY the named
  fields onto the CURRENT snapshot (never replacing athlete fields
  from a stale fetch) → `coreRev+=1` → ledger row (subsystem
  `platform`, same idempotency semantics) → commit.
- Bypasses the device lease by design; NEVER bypasses revision safety
  or field scope. Logged (user, fields, rev — no payloads).
- The NAS coach jobs migrate to this route (run-coach's write step
  swaps its raw PATCH for the platform route; a reviewed coach change
  deployed over the SSH channel). Clearing `health` after import stays
  a mailbox operation.
- Evidence: coach‖device races in BOTH orders proving athlete fields
  and coach fields both survive; user-token access to the platform
  route rejected; field-scope rejection matrix.

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
  the matrix, AND — the async rule (E8) — REVALIDATED immediately
  before every mutation that happens after an await, callback, file
  picker, share sheet, confirmation, timer, or network fetch. Concrete
  delayed-mutation sites from the tree (E7): the `wl-photo-input`
  change listener (idbAdd after processImage, reached from `photo:add`
  meal photos AND `pphoto:add` progress photos — both re-gate inside
  the listener, before idbDelete/idbAdd); the `wl-import` and
  `wl-pbk-import` change listeners (applyImport / photo-bundle import);
  every askConfirm callback that mutates (day:clear, reset:do,
  sync:pull, glp deletes, restore); the Health apply step inside
  `hkTryFetch`; M8/M10 conflict-resolution actions after their export
  sheets and fetches (already specified); the export-unlock callbacks.
  A failed revalidation surfaces the takeover sheet and mutates
  NOTHING.
- Sync actions inventoried by EFFECT (E6): `sync:push` →
  `cloudPush(true)` (server core write; fence-carrying; coreStale →
  displaced flow); `sync:pull` → confirm-gated `cloudPull(true)`
  (REPLACES local core — m10Gate + async revalidation in its confirm
  callback; adopting server core in clean state only, else the
  displaced/conflict rules); boot pulls (`autoSync` core adopt +
  `trainingPull`) follow the same clean-state-only adoption rules —
  reads are free, ADOPTION is a write to local content and follows
  each subsystem's protocol.
- Photos are content: every IndexedDB content mutation gated
  (add/delete/import/clear at all call sites above); caches,
  thumbnails, object-URLs exempt. **Photos also sync server-side**
  (`/api/collections/photos/records` create/delete/patch via the
  wrapped idbAdd/idbDelete): the photos collection's
  create/delete/update hooks validate the fence under enforcement
  (per-row authorization — no revision protocol needed: rows are
  independent, never merged snapshots); superuser and mailbox rules
  do not apply to photos.
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

- **Migration up** (E10, full enumeration): (1) create `writer_lease`
  (closed rules); (2) add `writerFence`+`deviceLabelHash` nullable
  columns to the commit ledger (existing rows null; integrity
  sentinel: row counts + a sample-hash check recorded before/after);
  (3) no appdata transforms; (4) photos hooks gain the fence check
  (code, not schema). **Down**: refuses while FENCING_ENFORCED is on
  or any M10 client is known deployed (operational rule recorded in
  the runbook); otherwise: drop ledger columns, delete `writer_lease`,
  remove hooks — in that order, after the sequenced client rollback.
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

## 9. Sequence (E11 — corrected order)

1. This design → review (round 6).
2. On approval: implement + test LOCALLY ONLY (local disposable PB).
3. Return code, migration, hashes, tests, rollback, and local evidence
   for Architect review.
4. Owner authorization for the enforcement-OFF NAS deployment.
5. Deploy the EXACT reviewed package; run NAS disposable probes;
   verified cleanup.
6. Coach-job migration to the platform route (reviewed; SSH channel).
7. Client (delimited blocks, M8 discipline) → evidence rounds.
8. Release package → Owner decision → publish → BOTH devices checked.
9. The combined hardening decision: FENCING_ENFORCED + raw-PATCH
   lockdown, Owner-authorized, with the enforcement-day checklist.
