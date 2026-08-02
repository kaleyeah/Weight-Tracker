# M8 — training-sync rework: design v5

Engineer, 2026-08-02, revised per the Architect's rounds 1–3 and four
Owner rulings taken via the decision channel. Round-2 items answered as
B1–B14, round-3 as C1–C12, round-4 as D1–D9. The Owner logout decision artifact is at
`decisions/DECISION-2026-08-02-M8-logout.md` (C1) and in the authoritative
record (`compound-app/reports/PROJECT_LOG.md`, M8 rounds 2–3 entry). Base: live
build `2026-08-02.407-fx` (commit `74a4777`). Brief: `BRIEF-round2-rulings.md`
(R1–R10). Round-1 items answered inline as A1–A12.

## 0. Rulings on record (round 1)

- **Sequencing (A1, Owner):** M8 formally precedes M7b; the program record
  (`compound-app/reports/MAESTRO_PROGRAM_CONTEXT.md`) is amended, commit
  `bc4d5ff`. M7b stays parked for Maestro.
- **Placement (A2):** the retired `integration/commit10-lineage-a` ref is
  untouched. Engineering work (this design, tests) lives on
  **`engineering/m8`**, branched from the retired head `e379783` — the ref
  the retirement froze receives no commits; the new branch carries the whole
  engineering tree forward (commits `4e436c0`, `1cfaf94`, which also land
  the containment-era C11–C13 suites that had never been committed).
  Application code is worked in the deployed-lineage checkout. Repository
  facts as of this round (D2): `compound-app/main` HEAD is the local
  records commit `3de02ee`, **three** records commits ahead of
  `origin/main` (`74a4777`); **`74a4777:index.html` remains the live
  application base**. All records commits are preserved — implementation
  never resets or rewrites them; the M8 candidate is worked as an
  uncommitted change on top of the current records HEAD and the eventual
  release commit follows the established records-then-candidate pattern.
  (These facts move as records land; each bundle restates them.)
- **Records path (A3):** accepted — authoritative records are
  `compound-app/reports/`; the engineering repo holds working artifacts only.
- **Empty-server bootstrap (A4, Owner):** strict — field-absent enters
  conflict like any other difference. No auto-push path exists.
- **Scope (A5):** training-only confirmed. The disposable-PB round will
  include the demonstration that the CAS route writes only the training
  field and its revision (core fields byte-compared before/after).
- **Base representation (A6, Owner):** full canonical copy. Measured on the
  Owner's live export: 29,805 bytes today; ~3.4 MB/copy at 4 sessions/week
  for 5 years. Session archiving is future work regardless of this choice.

## 1. States and stores (revised per A7, B4)

Storage is **per-account by key name** (B4): `wl_training_dirty__<uid>`,
`wl_training_base__<uid>`, `wl_training_conflict__<uid>`, plus the
transition journal `wl_training_journal__<uid>` (C4). Every value carries
`{owner}` as a self-check (C3: `canon` only where a canonical body exists —
base and conflict, not dirty); an inner owner mismatching its key suffix is
malformed (below).

| Key (per uid) | Content |
|---|---|
| `wl_training_dirty__<uid>` | `{owner, gen, ts}` — set synchronously in `saveTraining()` before debounce and gates |
| `wl_training_base__<uid>` | `{owner, canon, rev, body, mark}` — body = full canonical string of the last acknowledged server copy (Owner ruling A6) |
| `wl_training_conflict__<uid>` | `{owner, canon, enteredAt, reason, serverRev, serverAtEntry, localAtEntry, exports:{localGen?, serverDone?, localDone?}, mark}` |
| `wl_training_journal__<uid>` | `{owner, op, phase, startedAt, expect}` — the multi-key transition journal (C4) |

`mark` (C4 correction of v3's "seal"): an integrity/version marker inside
the single serialized value — it detects a truncated or foreign VALUE, and
claims nothing about multi-key atomicity. Cross-key consistency is the
journal's job, below. `localStorage.setItem` is atomic per value; nothing
in this design pretends otherwise anymore.

States per account: **clean · dirty · bootstrap · conflict**.

**Account lifecycle (B4):**
- **Enumeration**: prefix scan of localStorage; no registry key to corrupt.
- **Login/adoption**: the uid's own keys; absent → bootstrap rules.
- **Account switch**: nothing global changes; the other account's keys are
  untouched by construction.
- **Retention**: another account's keys are never deleted by any operation
  of the signed-in account (device-clear actions remain out of M8 scope,
  per the containment release's standing exclusion).
- **Malformed entries** (parse failure, owner/suffix mismatch, bad mark):
  quarantined **copy-first** (C8, localStorage has no rename): write the
  copy to a collision-free `wl_training_corrupt__<uid>.<ts>.<n>` key,
  read-back verify it, only then remove the original. If the copy or its
  verification fails (quota exhaustion included), the original stays
  untouched and **sync is blocked** with the storage-failure banner — an
  unpreserved malformed entry is never treated as absent.
- **Migration from global keys**: none shipped in any released build; if a
  pre-release global test key is found, it is renamed to the corrupt form,
  never interpreted.

**Logout (B5 — Owner ruling A; state-specific per D4):** a verified
logout requires the training state to be **clean**. Otherwise the logout
screen explains what is unsynced and aborts — the device stays signed in.
Its affordances differ by state: **dirty with a trusted base** offers
"Push now" (an ordinary retry) and export; **bootstrap or conflict** offers
NO generic push — the screen routes into the inspected, export-first
conflict workflow (§5), because pushing over an uninspected difference is
exactly what M8 exists to prevent. Export is protection only and never
unlocks logout, in any state.

**Quota / write failure (B6):** every sync-state `setItem` is wrapped and
verified by read-back; failure is **fail-closed for the operation, never
for the data**: a base that cannot persist after a server ack → dirty is
retained and recovery is the journaled fetch-and-compare of transition 1
(D3 — never a CAS retry at the stale rev); if the acknowledgement journal
itself cannot persist **before** the network request, the push does not
happen at all (journal-first ordering, §1 transitions); a conflict copy
that cannot persist → adoption is
refused AND the fetched copy is dropped (it is re-fetchable; local is
authoritative-on-device and untouched); an export whose evidence cannot
persist → the export is not marked done. A persistent storage-failure
banner surfaces after any such refusal.

**The transition journal (C4, C5; phases per D6):** every operation that
touches more than one key — and every operation with a network side effect
— runs journaled. Phases are explicit per op and each phase advance is
itself persisted and read-back verified before the work of the next phase
begins: `intent` (journal written, nothing else done — for ops with a
network step this MUST be persisted before the request is sent, D3) →
`net-done` (server responded; response identity recorded in the journal) →
`k1..kN` (one phase per key write in the op's stated order) → removal.
Boot recovery never trusts `phase` alone (D6): it compares the actual keys
against `expect` and derives what completed; phase only tells it where to
look first. Recovery moves **toward dirty/conflict only** — never toward
clean; mismatched local/base content is never treated as clean (C5).
**Journal-removal failure (D7):** if every data write verified but the
journal delete fails, boot recognizes the completed transition by that
key comparison, treats the op as done idempotently, and retries only the
journal cleanup — it never replays an adoption and never clears dirty
state newer than the journal's `expect.gen`.

The five adoption/acknowledgement transitions, each with its ordering and
its crash recovery (C5):

1. **Acked push** — journal(op:ack, expect:{pushedCanon, gen, newRev}) →
   write base → clear dirty → clear journal.
   *Base write fails after server ack (C6):* the journal survives with the
   pushed canonical identity. Recovery (boot or next push attempt) does
   NOT retry the stale CAS: it **fetches**, and (a) server content equals
   the journaled pushed copy AND local gen unchanged → establish base at
   the server's current rev, clear dirty; (b) gen advanced → establish
   base, dirty stays, normal push follows; (c) server differs → conflict.
   *Dirty-clear fails after base persisted (C7):* boot compares current
   local with the persisted base — equal → retry clearing dirty locally,
   no server traffic, no new revision; different → dirty stays, normal
   push path.
2. **Clean pull adoption** — journal(op:adopt, expect:{serverRev,
   serverCanon}) → write local training → write base → clear journal.
   *Local written, base failed:* journal recovery re-derives base from the
   journaled expect (content already verified at adoption time); if that
   write still fails → sync blocked, banner, local retained; state is NOT
   clean (no base) → bootstrap rules next boot, which see equality and
   re-establish.
   *Base written, local failed:* impossible in this order (local first);
   the inverse order is forbidden.
3. **Fresh-device adoption** — same journal and order as 2.
4. **Bootstrap-equality establishment** — journal(op:bootstrap-base,
   expect:{serverRev, serverCanon}) → write base only (local already equal,
   untouched) → clear journal. Failure → no base, bootstrap re-runs.
5. **Choose Server** — after the §5 gates: journal(op:choose-server,
   expect:{serverRev, serverCanon, discardedLocalGen}) → write local
   training → write base → clear conflict → clear journal. Any failure
   mid-sequence: journal recovery completes the remaining writes from
   expect; if a write cannot complete, sync blocks with local at whichever
   verified step it reached and the conflict record intact — the journaled
   op is re-runnable because every input is inside it.
   **Choose Local acknowledgement** is transition 1 with the conflict key
   cleared after base, inside the same journal.

Export evidence stays single-key (inside the conflict value) and needs no
journal: write file → delivery evidence → update `exports.*` (B7).

## 2. Bootstrap (R2–R4; strict per Owner ruling)

On boot: signed in, ownership established, local training present, no base
for this uid → fetch server without modifying local, then:

- server training canonically equal to local → establish base, clean;
- anything else — differing content, **or the training field absent** —
  → conflict, both copies retained. Never any subset or authority inference.

Fresh device (no local training): adopt server, establish base (unchanged,
already behind the ownership gates).

**Stated consequence, eyes open (approved B3):** legacy devices whose local
copy carries migration-stamped fields (`migrateProgressionTypes()` adds
`movement`) will canonically differ from the server and will enter a
one-time bootstrap conflict, resolved through the full workflow (§5). The
conflict view's difference list shows "fields present locally only —
added by an app update" so the Owner sees why it fired; per B3 the UI
explains the cause **without recommending either copy as authoritative**.

## 3. Push protocol (R1, R7; A11)

1. Capture `{gen, deep copy}`.
2. Push via the **server CAS commit route** with expected `rev` from base.
3. Ack → base := `{copy, newRev}`; dirty cleared only if `gen` unchanged;
   else base updates, dirty stays, reschedule.
4. Revision mismatch → fetch. Retry **once**, only if the fetched content
   is exactly equal to base under the same canon version, using the freshly
   fetched revision (A11). Anything else → conflict with the fetched copy.
5. Transport/5xx/401 → dirty persists, failure visible in sync status,
   retry on next debounce/boot. No pull can follow a failed push into an
   overwrite, because —

## 4. Pull protocol (R4)

Adoption happens only in state clean. Dirty, bootstrap-difference, or
existing conflict → the fetched copy goes to conflict (or is dropped if
identical to base). `resyncAllActivityTags()` is re-anchored in the same
change: tag derivation runs only after an adoption or acked push actually
completes, never from a fetched-but-refused copy (closes the round-2
"separate defect": a stale read deleting published activity tags).

## 5. Conflict resolution (R6, R7; A8, A9)

Non-blocking banner on the Training tab; the app stays usable; local editing
continues on the live local copy. Conflict entry freezes **both**
`serverAtEntry` and `localAtEntry` (mandatory, A8).

- **Inspect:** per-copy summaries plus a difference list by date, including
  a "local-only fields" class so migration-stamp conflicts are legible.
- **Export before choice:** the view exports **the exact copies the
  decision will preserve or discard** (A8d): current local (not merely
  at-entry) and serverAtEntry, format-2 envelopes marked
  `conflict-local` / `conflict-server`, delivery-evidenced. The export
  records the local `gen` it captured; **any later local edit re-disables
  the choice buttons until a fresh local export** (A8c).
- **Choose Local** = the **current** local copy (A8a; localAtEntry remains
  inside the conflict record and the export trail): CAS-push with the
  conflict's `serverRev`. Mismatch → the conflict is replaced with the
  newer server copy and **all export and choice evidence resets** (B10) —
  earlier exports do not cover a server state they never contained.
- **Choose Server** (A9, B9): final warning naming what will be discarded
  (including the gen delta since entry) → one more fresh delivered export
  of current local → then a **fresh fetch immediately before adoption**:
  both the revision and the canonical content must still equal
  `serverRev`/`serverAtEntry`; any difference replaces the conflict with
  the newer copy and invalidates every prior gate. Only an exact match
  adopts and establishes base.
- **Defer:** everything persists.

Patterns reused from the retired Commit 10 conflict centre where they fit.

## 5b. Activity-tag derivation (B11)

`resyncAllActivityTags()`/`syncLiftTags()` write derived core "lifting"
tags — a core write driven by training state, and therefore specified here
even though M8 is otherwise training-only:
- derivation reads **only** acknowledged or adopted training (never a
  fetched-but-refused copy, never mid-transition state); on an ack whose
  `gen` advanced mid-flight, derivation receives **the captured
  acknowledged copy explicitly** (D8) — it may not read the newer live
  `state.training` and call that acknowledged;
- it runs strictly **after** a sync transition completes; its failure can
  neither clear dirty nor invalidate base (it has no access to sync keys);
- cleanup removes **only derived entries carrying the existing provenance
  marker `auto:true`** (C10); hand-added entries survive even when names
  or categories overlap. `migrateOrphanLiftTags()` joins this audit — its
  current filtering does not check `auto` and is corrected in the same
  change;
- tests cover: derivation refused during conflict, a failing core `save()`
  leaving sync state intact, and concurrent core edits during a push.

## 6. Canonicalization, versioned (A10)

`canonV1(training)`: UTF-8 JSON; object keys sorted lexicographically at
every level; **array order preserved** (order is data here — sets within an
exercise, items within a routine); numbers serialized per ECMA-404 JSON
(as `JSON.stringify` emits); strings uninterpreted (no Unicode
normalization); no member elision — **absent and empty are distinct and
never coerced**; no whitespace. Every stored envelope carries `canon:1`.
Comparisons are defined only between equal canon versions; a future client
whose canon differs re-derives by parsing the stored `body` and
re-canonicalizing under its version before comparing. `canonV1` validates the **original in-memory value first, recursively**
(C9 — a JSON round-trip destroys the evidence it should reject):
`undefined` members (object or array), non-finite numbers, functions,
symbols, and non-object roots are validation errors — fail closed, never
silently coerced. Only a value that passes validation is serialized. `-0`
serializes as `0` per JSON; a fixture pins it. Legacy malformed training
normalizes through the existing `normActs`-family normalizers **before**
validation; anything the normalizers cannot shape is conflict-grade
preserved, not canonicalized.
The spec lives in the code as a pure function with test vectors:
key-order-insensitivity, array-order-sensitivity, absent-vs-empty, unicode
identity, `-0`, null-member, nested-absent, and a malformed legacy fixture.

## 7. Recovery (R8; A12) — roll-forward only, artifact built first

Before M8 publishes, the recovery build exists as an artifact: derived
from the M8 candidate with **all training network activity disabled**
(B8 — `SYNC_SAFE` performs no training pushes, no pulls, no adoption; a
generic recovery cannot assume the defect is pull-only), local edits fully
functional, dirty state accumulating, a visible recovery banner, hashed,
release-packaged, and tested to boot from clean, dirty, and conflict
states without mutating any training or sync key. Rollback to `.407` remains legal only for devices that have
never written an M8 key (all three absent). The recovery artifact's
identity goes in the release records before deployment. Rollback
eligibility (D5): rolling back to `.407` is legal only when a prefix scan
proves **no M8 sync key of any kind has ever been written for any
account** — no dirty, no base, no conflict, no journal, and no
quarantined/corrupt M8 key. Any single M8 key on the device makes recovery
roll-forward-only.

## 8. Evidence plan (R3, R4, R9, R10; A5)

- **C11 revised on `engineering/m8`**: sound-core cases kept; containment
  cases become conflict expectations; the authentic-upgrade regression (R3)
  and the seven R4 matrix cases added; per-uid key isolation (B4);
  copy-verify-delete quarantine incl. the copy-fails path (C8); quota
  fail-closed per transition **under realistic combined occupancy** (C12:
  live training + base + recovery snapshot + both conflict copies + core
  app data seeded to size, not isolated key writes); every journaled
  transition crash-tested at each phase boundary with boot recovery
  asserted to land only in dirty/conflict (C4/C5); the ack-persist-failure
  fetch-and-compare recovery, all three arms (C6); the dirty-clear retry
  without server traffic (C7); logout refusal from dirty, bootstrap, AND
  conflict (B5); §5b tag-provenance cases incl. `migrateOrphanLiftTags`
  (C10). Suite must fail against `.407`.
- **Browser suite**: Playwright, shipping file, mocked endpoint; boot
  ordering, timers, the conflict view driven through real DOM including
  export-gating and the re-disable-on-edit rule.
- **Disposable-PB round** (Owner-authorized): CAS auth, revision behavior,
  failure handling, against the real route implementation (B13): the
  field-isolation demonstration byte-compares the **whole record** except
  the explicitly permitted training/revision/server-metadata fields, and
  includes a concurrent core mutation landing between the training fetch
  and the CAS commit.
- Wording per R10: VM = modeled; browser = real engine; device claims only
  from the device; no live-URL claims without the served-byte comparison.

## 9. Sequence

1. ✅ Round 1: design review → halt → Owner rulings (sequencing, base
   representation, strict bootstrap).
2. ✅ Round 2: v2 review → 14 findings → Owner logout ruling (A: server
   acknowledgement or abort; artifact in `decisions/`).
3. ✅ Round 3: v3 review → policies and branch plan approved → 12
   technical corrections.
4. ✅ Round 4: v4 review → journal architecture accepted → 8 narrow
   corrections (stale B6 sentence, journal phases and idempotent cleanup,
   state-specific logout affordances, five-key rollback scan, captured-copy
   tag derivation, repo facts).
5. Round 5 (this bundle): v5 as the implementation contract.
6. Implementation; C11 revision; browser suite; evidence round(s).
7. Disposable-PB integration round.
8. Recovery artifact built, hashed, packaged (gate for 9).
9. Owner decision file → publish → served-byte verify → device check.
10. Owner-authorized server lockdown of raw training PATCH.
