# M10 — strict single writer: design v4

Engineer, 2026-08-02, per round-3 items 1–13 (answered as C1–C13).
STRICT stands. Base: `2026-08-02.415-m8`. Companions:
`WRITE-SURFACE-MATRIX.md` (v2, multi-class) and
`artifacts/PB-SEMANTICS-PROBE.md` (real-0.39.8 evidence for C2).

## 0. The invariant (unchanged, honest)

Exactly one fence may authorize server mutation; a partitioned former
holder can still edit locally, losslessly captured for explicit
reconciliation.

## 1. Core writes gain optimistic concurrency (C1)

Every core content write carries `expectedCoreRev`, validated in the
SAME transaction as the fence and the mutation (the server already
maintains `coreRev`; M10 makes clients SEND it and the server ENFORCE
it — finishing for core what M8 did for training):
- ordinary core push: `expectedCoreRev` = the client's last-seen rev;
  mismatch → `409 {coreStale:true, coreRev}` → the client fetches
  without adoption and enters the displaced-core flow (§4) — never a
  blind overwrite, even for a valid holder.
- displaced-core resolutions (§4): both actions re-fetch WITHOUT
  adoption inside the action; if the server's rev or canonical content
  differs from the envelope's captured copy, the envelope is REPLACED
  (verified write) and review restarts. Push-mine then commits with
  the freshly observed rev; stale evidence never pushes or adopts.

## 2. ONE enforcement primitive, per path (C2 — proven, not assumed)

`cfFencedWrite(txApp, authUserId, {fence, deviceId}, mutateFn)`:
a shared-module function executed INSIDE `$app.runInTransaction`:
loads the lease row by authUserId → validates
`active && holderDeviceId===deviceId && fence===request.fence` (when
FENCING_ENFORCED) → runs `mutateFn(txApp)` → commits. Callers:
- **CAS commit route**: replaces its current save with a
  `runInTransaction(cfFencedWrite(...))` wrapping ledger check +
  content write (one transaction, per the probe).
- **Raw update hook** (`onRecordUpdateRequest` on appdata): reads
  fence from headers, validates PRE-WRITE (probe Q2) and then lets
  the framework save proceed; the validation SELECT and the
  framework's save are serialized by the DB single-writer (probe
  Q1c) — an ownership change either commits before the request's
  transaction (stale fence rejected) or queues behind it.
- **Record CREATE** (`onRecordCreateRequest`, probe Q4): same header
  validation — a create IS the first content write.
- **Programmatic/superuser writes**: requests authenticated as
  `_superusers` bypass the fence BY EXPLICIT RULE in the shared
  module (`isSuperuser(e)`), logged (route+collection+fields, never
  payloads) — the platform (coach jobs) is not a device. Ordinary
  user tokens NEVER match this branch (tested).
- **Hook ordering/recursion**: after-hooks performing programmatic
  saves complete without re-firing loops (probe Q3); the design
  keeps all M10 mutation inside request-phase hooks and the two
  routes; no after-hook writes content.
The disposable server gate re-proves each path on the real NAS before
any reliance in production (per C2's closing requirement).

## 3. The race oracle, non-circular (C3)

Each race iteration records, from the server, the tuple
`{finalFence, finalHolder, coreRev/trainingRev, contentIdentity
(canonical hash), responseOutcomes}` — the invariant asserted from
OBSERVED state: for every committed content write there exists a
lease-history entry (fences are strictly increasing and logged by the
route) whose fence equals the write's stamped fence, and no committed
write's fence is < the fence of any lease event that COMMITTED before
it (order proven by the blocked-transaction timing, cf. probe Q1c
652ms). Barriers force both orders (write-tx-first via slowMs inside
the mutation; steal-first via sequencing) across the full op set:
steal‖write, steal‖steal, renew‖steal, release‖write,
expiry-acquire‖write. 100 iterations per pairing.

## 4. Displaced work (C4, C5, C6, C7)

**Training (C4, claim corrected)**: `m8EnterConflict` is a SINGLE
verified conflict-record write — not itself journaled. The guarantee,
stated exactly: on `fenceStale` from the CAS route the client fetches
without adoption; on fetch success it attempts the verified conflict
write; if THAT write fails, `m8Block` fires with dirty bytes and the
unresolved ack journal INTACT and zero adoption (the fetched copy is
droppable — re-fetchable), which is the M8 fail-closed contract;
evidence adds this fetch-ok/conflict-write-fails arm explicitly.

**Core (C5 — the full machine)**: new account-keyed namespace,
disjoint from M8's: `wl_core_displaced__<uid>` (envelope) +
`wl_core_journal__<uid>` (its own journal; ops `core-displace`,
`core-push-mine`, `core-take-server`). Phases mirror M8's proven
grammar: intent → net-done (fetch identity recorded) → k1..kN
(verified writes) → verified end. Validation schema per op (typed
fields incl. `coreRevSeen`, canonical `localData`/`serverData` —
same canon-class checks as M8's validator); malformed/invalid →
copy-verify-delete quarantine into the SAME corrupt namespace with
kind `corejournal`/`coredisplaced`, hard block, boot-derived.
Interaction rule (C5): the two journals are independent keys; boot
resolves M8's first, then core's; NEITHER op ever writes the other's
keys (asserted by postcondition byte-checks in every core test);
a hard block from either halts both (shared fail-closed union).

**Post-displacement editing (C6)**: the LIVE store (`wl_v1`) remains
authoritative for the UI; the envelope's `localData` is a snapshot
REFRESHED by each subsequent core edit through one journaled
two-key write (`core-displace` phase `refresh`: live store verified →
envelope verified → journal end); a crash between them is recovered
by boot comparing the two and re-deriving the envelope from live (the
live store is truth for "mine"). No window can mark either falsely
complete because the envelope is DERIVED, never independently edited.
Quota tests run under the full worst-case occupancy: live core +
displaced core (×2 copies inside the envelope) + training + base +
conflict copies + both journals + recovery snapshot + photo metadata.

**Take-server(core) (C7)**: held to the M8 Choose-Server standard —
in-action freshness (envelope identity + current local gen), delivery-
evidenced exports (share-resolution or explicit confirm) tied to the
exact current generation, re-export demanded after ANY edit during
the sheet or the fetch, fresh fetch immediately before adoption with
rev+canonical match against the envelope (mismatch → envelope
replaced, gates reset), journal-first adoption with verified local
persistence, verified cleanup.

## 5. Photos are content (C8)

The matrix contradiction is fixed: EVERY IndexedDB content mutation —
photo add, delete, import, day-clear photo pruning, reset — is
G-photos, gated pre-mutation by the same `m10Gate`. Exempt: photo
OBJECT-URL caches, thumbnails, and UI prefs (non-content, listed).
A non-holder iPad cannot add or delete photos; it can view them.

## 6. Composite actions (C9)

The matrix v2 lists EVERY affected class per action (e.g. `day:clear`:
core+training+photos; `reset:do`: all; cardio/lift saves:
training+core-tags). One global pre-gate authorizes the whole handler
BEFORE any mutation (handler-entry gating means no partial pre-gate
mutation by construction — asserted by tests that deny the gate and
byte-check every store). Split-across-steal recovery: composite
SERVER effects ride the existing per-subsystem protocols (training →
CAS+M8 journal; core → coreRev+core journal); a steal between the two
commits leaves each side in its own well-defined displaced flow — no
new composite journal is needed, and the tests prove both sides land
in their respective review paths with nothing lost.

## 7. Mailbox rule, from the parsed body (C10)

The hook inspects the PARSED request body: the write is mailbox-only
iff the set of present keys (excluding nulls it also rejects — a null
content field is still "present") is a subset of
{coachreq}|{health}; unknown fields → reject; duplicated transport
values (body+query) → reject; CREATE requests carrying content →
fenced like updates. Superuser bypass: `_superusers` auth context
only, logged without payloads, tested to NOT apply to user tokens.

## 8. deviceId is not identity (C11)

Stated: the FENCE is the sole authority; deviceId is a routing label.
A copied deviceId cannot mint authority: acquire/steal still bump the
fence, so two installs sharing an id merely displace each other, and
the takeover UI keys on fence+holder from the server, never on local
id equality. Tests: duplicated-id devices cannot both hold valid
fences; UI shows the true server holder.

## 9. Records (C12) — DONE

PROJECT_LOG §4 and MAESTRO_PROGRAM_CONTEXT reconciled (commit
`f257c1d`, local-only): single-writer proceeds post-M8 by Owner
direction; HealthKit-import half remains M7b-gated.

## 10. Sequence

1. This design → review.
2. Server package: collection migration + shared module + routes +
   hook changes + the full disposable-instance test suite (local PB
   first, then the NAS disposable gate) → review → Owner-authorized
   NAS deploy, enforcement OFF.
3. Client (delimited blocks; M8 discipline) → evidence rounds.
4. Release package → Owner decision → publish → BOTH devices.
5. Owner-authorized enforcement + raw-PATCH lockdown (one hardening
   decision).
