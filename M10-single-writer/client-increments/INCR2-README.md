# M10 client increment 2 — core durability protocol

## Package identity (through round-19 rulings)
- **Base**: `3e7a0d0` — the accepted increment-1 authority head.
- **Increment head**: `3056e8d` — index.html sha256 prefix `1bf63e59…`.
- **Cumulative diff** `INCR2-DIFF.patch` = 3e7a0d0 → 3056e8d
  (550 lines); **narrow round-19 diff**
  `INCR2-DIFF-FROM-78cb17e.patch` (15 lines); prior narrow diffs
  retained (`INCR2-DIFF-FROM-f78d2e0.patch`,
  `INCR2-DIFF-FROM-5359060.patch`). Everything sits in
  `M10-BLOCK-2 … M10-BLOCK-2-END` plus the delimited wiring section
  and one boot-line edit.

## Round-19 rulings, as landed
- Ruling 4: the journal validator's `natOk` is a GENUINE safe-integer
  predicate (finite, nonnegative, integral, ≤ 9007199254740991 =
  Number.MAX_SAFE_INTEGER), applied to every integer journal field
  (expectedRev, newRev, gen, fence, serverRev, staleFence). Tests
  (T19): MAX_SAFE_INTEGER+1 rejected in a live 409 (journal stays at
  intent, dirty preserved); seeded conflict AND displacement
  terminals carrying the unsafe value follow quarantine-and-block
  (never review state; preserved in the corrupt namespace).
- Ruling 5: this README's identity and evidence sections corrected
  and audited (no stale head or count remains).
- Ruling 6: `RECORDS-LOCATION-EVIDENCE.md` — repository-history proof
  of the reports' location (nothing renamed, moved, or removed).

## Round-18 rulings, as landed (P1–P3 = rulings 3–5)
- P1 (ruling 3): REAL plain-object validation —
  `Object.getPrototypeOf(v) === Object.prototype`; class instances,
  custom prototypes, AND null-prototype objects all fail closed (the
  null-prototype rejection is the documented decision: JSON.parse
  never produces one, so nothing legitimate does). Tests: class
  instance, custom prototype, Object.create(null), plain-object
  control.
- P2 (ruling 4): adoption annulment is DURABLE — the journal removal
  is verified; a failed removal raises the shared storage block so
  the stale intent can never silently run later. Fault-injected test:
  removal blocked on first boot → hard block, no adoption, edit
  preserved; reload with the fault cleared → the adopt intent is
  durably annulled, still zero adoption, and the boot push then
  surfaces the GENUINE revision conflict as a typed core-ack
  terminal (dirty + edit intact throughout).
- P3 (ruling 5): terminal payloads are TYPED — the journal validator
  requires a safe nonnegative integer `serverRev` for conflict and
  `staleFence` for displacement; the dispatch arms validate 409
  bodies BEFORE terminalizing, and a malformed 409 (missing/
  fractional/non-numeric fields, 4 tests) leaves the journal at
  intent as a recoverable request — never authoritative review
  state — with dirty preserved.

## Round-17 rulings, as landed (N1–N9 = rulings 1–9)
- N1/N4: `m10cCtx()` captures `{uid, session generation}` at the start
  of EVERY core operation (push, recovery, bootstrap, pull, adoption);
  every asynchronous continuation verifies both before touching
  anything. A→B→A yields a new generation, so an original-session
  response can never complete under the new session (tested).
- N2: journal completion, advancement, terminalization, quarantine,
  and every read/write in those paths operate on the JOURNAL's
  validated owner or the explicitly captured uid — `m8Uid()` is never
  consulted after dispatch.
- N3: a push response arriving after an account switch leaves A's
  intent journal BYTE-IDENTICAL for replay under A's next session and
  makes zero writes under B (tested: no `wl_core_*__userB` keys).
- N5/N6: pull and bootstrap capture the local bytes before the GET
  and revalidate AFTER it (session context, storage block, dirty
  marker, byte-identical local) before any decision; the adoption
  intent phase re-proves the preconditions immediately before the
  `wl_v1` replacement and ANNULS itself (journal removed, nothing
  written) if an edit or dirty marker appeared — local always wins.
- N7: the edit-during-pull race is a dedicated test (delayed GET,
  mid-flight verified edit → zero adoption, dirty + bytes + base all
  preserved).
- N8: canon validates the ORIGINAL graph before projection —
  `undefined` allowed ONLY as an object-property omission;
  arrays reject undefined and holes; NaN/±Infinity, functions,
  symbols, BigInt, cycles, and non-plain objects (e.g. Date) all fail
  closed. Positive `auto: undefined` case + negative case per lossy
  category, plus a push-path case proving hard block with dirty
  preserved and zero commits.
- N9: a commit success requires a safe nonnegative integer `newRev`
  EQUAL to expectedRev+1 (the route's exact postcondition); malformed
  successes (fractional / missing / wrong increment) block with the
  journal at intent, dirty preserved, base unmoved (three tests).

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
- `INCR2-C16-OUTPUT.txt` — C16 49/49 (all evidence arms through round 19): bootstrap ×5 (equal /
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
- `INCR2-M8-REGRESSION.txt` — full client matrix vs `3056e8d`.
