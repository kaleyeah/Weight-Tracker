# M8 — training-sync rework: design v2

Engineer, 2026-08-02, revised per the Architect's round-1 reply and three
Owner rulings taken the same night via the decision channel. Base: live
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
  Application code is worked in the deployed-lineage checkout
  (`compound-app`, `main`, head `74a4777`) and stays uncommitted until the
  release gates. **Question for this round: confirm this branch plan.**
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

## 1. States and stores (revised per A7)

All three keys are **account-enveloped**: `{owner:<uid>, canon:<ver>, ...}`.
A key whose `owner` differs from the signed-in uid is treated as absent for
sync decisions and is **never deleted** on mismatch — it is quarantined
in place for the account it names, consistent with the containment release's
ownership model (`wl_last_owner`, `ownershipAmbiguous()`).

| Key | Content |
|---|---|
| `wl_training_dirty` | `{owner, gen, ts}` — set synchronously in `saveTraining()` before debounce and gates |
| `wl_training_base` | `{owner, canon, rev, body}` — body = full canonical string of the last acknowledged server copy (Owner ruling A6) |
| `wl_training_conflict` | `{owner, canon, enteredAt, reason, serverRev, serverAtEntry, localAtEntry, exports:{localGen?, serverDone?, localDone?}}` |

States per account: **clean · dirty · bootstrap · conflict**.

**Account lifecycle (A7):**
- Login/adoption: sync state for the new uid starts from that uid's own
  enveloped keys (usually absent → bootstrap rules apply).
- Account switch: prior account's keys stay quarantined in place.
- **Logout with dirty state: the journalled logout stops and asks** — the
  Owner's standing interrupted-logout policy extended to unsynced training:
  the logout screen names the unsynced work and offers export or abort; a
  verified logout that proceeds only does so after the dirty copy is either
  pushed (acked) or exported with delivery evidence. No silent discard.

## 2. Bootstrap (R2–R4; strict per Owner ruling)

On boot: signed in, ownership established, local training present, no base
for this uid → fetch server without modifying local, then:

- server training canonically equal to local → establish base, clean;
- anything else — differing content, **or the training field absent** —
  → conflict, both copies retained. Never any subset or authority inference.

Fresh device (no local training): adopt server, establish base (unchanged,
already behind the ownership gates).

**Stated consequence, eyes open:** legacy devices whose local copy carries
migration-stamped fields (`migrateProgressionTypes()` adds `movement`) will
canonically differ from the server and will enter a one-time bootstrap
conflict, resolved through the full workflow (§5) — export, then Choose
Local. This is the ruled outcome: a false conflict with a real resolution
path is preferred to any equality-weakening cleverness. The conflict view's
difference list will show "fields present locally only" so the Owner sees
why it fired.

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
- **Choose Local** = the **current** local copy (A8a — the live copy the
  Owner has been editing; localAtEntry remains inside the conflict record
  and the export trail): CAS-push with the conflict's `serverRev`; mismatch
  re-enters conflict with the newer server copy.
- **Choose Server** (A9): shows a final warning that names what will be
  discarded — including the count of edits made since conflict entry
  (gen delta) — takes one more fresh delivered export of current local,
  re-checks gen and rev immediately before adopting, then adopts and
  establishes base.
- **Defer:** everything persists.

Patterns reused from the retired Commit 10 conflict centre where they fit.

## 6. Canonicalization, versioned (A10)

`canonV1(training)`: UTF-8 JSON; object keys sorted lexicographically at
every level; **array order preserved** (order is data here — sets within an
exercise, items within a routine); numbers serialized per ECMA-404 JSON
(as `JSON.stringify` emits); strings uninterpreted (no Unicode
normalization); no member elision — **absent and empty are distinct and
never coerced**; no whitespace. Every stored envelope carries `canon:1`.
Comparisons are defined only between equal canon versions; a future client
whose canon differs re-derives by parsing the stored `body` and
re-canonicalizing under its version before comparing. The spec lives in the
code as a pure function with its own test vectors (including
key-order-insensitivity, array-order-sensitivity, absent-vs-empty, and
unicode-string identity).

## 7. Recovery (R8; A12) — roll-forward only, artifact built first

Before M8 publishes, the recovery build exists as an artifact: derived from
the M8 candidate with server adoption disabled (`SYNC_SAFE`: pulls fetch
nothing into training, pushes may continue), hashed, release-packaged, and
tested to boot from clean, dirty, and conflict states without mutating any
training key. Rollback to `.407` remains legal only for devices that have
never written an M8 key (all three absent). The recovery artifact's
identity goes in the release records before deployment.

## 8. Evidence plan (R3, R4, R9, R10; A5)

- **C11 revised on `engineering/m8`**: sound-core cases kept; containment
  cases become conflict expectations; the authentic-upgrade regression (R3:
  old-client localStorage, unsynced session, no new keys, stale server —
  session survives on disk) and the seven R4 matrix cases added; plus
  account-envelope cases (wrong-owner keys ignored and preserved) and
  logout-with-dirty (stop-and-ask). Suite must fail against `.407`.
- **Browser suite**: Playwright, shipping file, mocked endpoint; boot
  ordering, timers, the conflict view driven through real DOM including
  export-gating and the re-disable-on-edit rule.
- **Disposable-PB round** (Owner-authorized): CAS auth, revision behavior,
  failure handling; plus the A5 demonstration that the route touches only
  training + its revision (byte-compare of untouched fields).
- Wording per R10: VM = modeled; browser = real engine; device claims only
  from the device; no live-URL claims without the served-byte comparison.

## 9. Sequence

1. ✅ Round 1: design review → halt → Owner rulings → this revision.
2. Round 2 (this bundle): confirm v2 + branch plan → implementation begins.
3. Implementation; C11 revision; browser suite; evidence round(s).
4. Disposable-PB integration round.
5. Recovery artifact built, hashed, packaged (gate for 6).
6. Owner decision file → publish → served-byte verify → device check.
7. Owner-authorized server lockdown of raw training PATCH.
