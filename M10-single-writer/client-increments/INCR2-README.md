# M10 client increment 2 — core durability protocol

## Package identity
- **Base**: `3e7a0d0` — the accepted increment-1 authority head.
- **Increment head**: `5359060` — index.html sha256
  `2a1f48400257465746261bc047d0e5dda1f4d118251651790b35d2d7fbcf2d77`.
- **Cumulative diff** `INCR2-DIFF.patch` = 3e7a0d0 → 5359060
  (439 lines). Everything sits in `M10-BLOCK-2 … M10-BLOCK-2-END` plus
  the delimited `M10 WIRING (increment 2)` section and one boot-line
  edit (core journal recovery after the lease settles).

## What it implements (design v9.1 §2, round-16 ruling 7 scope)
- **Account-keyed core stores** with M8-grade verified read/write/
  quarantine: `wl_core_dirty__<uid>` (generation + persistence proof),
  `wl_core_base__<uid>` (acknowledged canonical copy + coreRev),
  `wl_core_ack_journal__<uid>` (operation-aware validated journal;
  corrupt namespace `wl_core_corrupt__<uid>.*` via copy-verify-delete).
- **Shared fail-closed union**: the `m8StorageBlocked` getter is
  re-defined INSIDE the M10 block to include the core hard/soft
  classes — either subsystem's block halts both. No M8 code modified.
- **Core canonicalization** `m10cCanon`: sorted-key serialization of
  the JSON projection (`JSON.parse(JSON.stringify(v))`). Core state
  legitimately carries in-memory `undefined` properties that
  JSON.stringify has ALWAYS dropped on the wire and in `wl_v1` — the
  JSON projection is the historical wire truth, not coercion.
  Unserializable structures still fail closed. (Found by the tags
  regression suite: the strict M8 validator hard-blocked on
  `auto: undefined` tag fields.)
- **save() wiring**: synchronous `m10cMarkDirty()` (gen++) before the
  local write; persistence proof compares the stored `wl_v1` bytes and
  promotes `persistedGen`; failure soft-blocks (dirty-unproven never
  pushes).
- **Fenced journaled push** (`core-ack`): intent persisted BEFORE
  dispatch `{oldBaseCanon, expectedRev, pushedCanon, gen, fence,
  requestId}`; fence riding only while this device holds the bound,
  in-deadline lease; phases intent → net-done(newRev) → k1(base
  verified) → k2(dirty cleared iff same gen — the newer-generation arm
  keeps the newer dirty) → verified journal removal. Typed outcomes:
  conflict / fence-displaced / auth terminalize the journal with dirty
  and local bytes UNTOUCHED (review UI is increment 3); transport
  ambiguity keeps the journal for replay.
- **Replay-first recovery**: boot (after the lease settles) re-drives
  a surviving journal — an intent journal re-dispatches its CAPTURED
  request (same requestId/expectedRev/payload; the server ledger
  answers replays), later phases complete verified; malformed or
  invalid journals quarantine + hard-block.
- **G9/G10 bootstrap**: exact content-only emptiness predicate;
  equal → journaled base establishment; fresh-device → journaled
  adoption applying the EXACT parsed server object (unknown fields
  survive — tested); no row / absent data at rev 0 → rev-0 base, the
  fenced first push creates; absent data at positive rev → terminal
  bootstrap-conflict (deletion evidence); differing nonempty → terminal
  bootstrap-conflict with BOTH copies preserved.
- **Adoption postconditions**: journaled `core-adopt` (local bytes
  verified → base verified → cleanup); a dirty device NEVER adopts.
- **autoSync replaced** (marked wiring): the retired newest-date
  recency heuristic is gone from the live path; core boot flows
  pull-refuses-if-dirty → journaled push.
- **Ruling 8 honored**: no dispatcher gating was added; the wiring
  owns the core sync TRANSPORT only (save marking, cloudPush,
  cloudPull, autoSync).

## Evidence
- `INCR2-C16-OUTPUT.txt` — C16 29/29: bootstrap ×5 (equal /
  fresh-adopt with unknown-field survival / differing-preserved /
  no-row-first-push / absent-at-positive-rev), happy push, lost-response
  replay (same requestId, server committed EXACTLY once), crash
  recovery seeded at EVERY journal phase (intent, net-done, k1, k2 —
  each recovering to clean with consistent server state), revision
  conflict (dirty + local bytes preserved), stale-fence displacement
  (zero server mutation, nothing lost), pull-refused-while-dirty,
  account-switch isolation (A's bytes byte-identical), storage-write
  failure ×2 (journal-write fail → no network, no loss; dirty-write
  fail → soft block + shared union), clean adoption, newer-gen-in-
  flight.
- `INCR2-C15-RERUN.txt` — increment-1 suite still 35/35.
- `INCR2-M8-REGRESSION.txt` — full client matrix vs `5359060`.
