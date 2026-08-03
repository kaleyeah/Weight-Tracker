# M10 increment 5 — durable-writer inventory (round-31 ruling 2)

Every function in the shipping client that can put bytes on the device, with
its authorization path. Produced by grepping the source, not by assertion.
The point of the exercise: "a read-only device performs zero durable writes"
must be provable per writer, not claimed for four wrapped names.

| writer | what it persists | count | authorization under M10 |
|---|---|---|---|
| `localStorage.setItem` | direct key write | 28 | MIXED — see the per-call breakdown below |
| `localStorage.removeItem` | direct key delete | 14 | MIXED — see below |
| `saveLocal` | core snapshot → wl_v1 | 9 | GATED at source (snapshot wrapper) |
| `saveTrainingLocal` | training snapshot → wl_training_v1 | 8 | callers gated: `saveTraining()` is wrapped at source; the boot migration path is GATED AT ITS CALLER as of round 33 — see the corrected migration section below |
| `saveWorkout` | live workout → wl_workout | 31 | GATED at source (snapshot wrapper) |
| `m8Write` | M8 journal/base/dirty/conflict (verified) | 11 | SUBSTRATE — M8 journal/quarantine; every caller is a journal phase that already proved its own authority. Gating it would break recovery on a blocked device. |
| `m10cWrite` | M10 core journal/base/dirty/displaced/queue (verified) | 16 | SUBSTRATE — M10 core/photo journals; same rule, plus fenced-route proof at dispatch |
| `idbAddLocal` | IndexedDB photo put | 9 | SUBSTRATE — reached only through the increment-4 queue, which checks account+fence at every phase |
| `idbDeleteLocal` | IndexedDB photo delete | 6 | SUBSTRATE — same; local deletion happens only after a typed server ack |
| `idbClearAllLocal` | IndexedDB photo clear | 2 | SUBSTRATE — reached only via the journaled clear batch |
| `setPbPhotoMap` | photo id map | 7 | SUBSTRATE — written inside verified queue phases (mapWriteVerified) |
| `setSyncCfg` | sync configuration | 7 | GATED — its only dispatcher action (sync:pasteapply) is in M10_GATED |
| `setPbCfg` | session/auth record | 4 | ACCOUNT-LOCAL INFRASTRUCTURE — session/auth record, not athlete content; must keep working for a read-only device to sign in, take over, or recover |

## The three classes

1. **Gated at source** — the snapshot writers a tap or a lazy render can
   reach: `save`, `saveLocal`, `saveTraining`, `saveWorkout`, plus
   `setSyncCfg` via its gated action, plus (round 33) the boot training
   migration's own call to `saveTrainingLocal`, gated at that call site.
   A non-holder cannot move these.
2. **Substrate** — the journal, quarantine and queue primitives M8/M10 are
   built from (`m8Write`, `m10cWrite`, `idb*Local`, `setPbPhotoMap`).
   These are NOT gated, deliberately: they are how a displaced or blocked
   device records evidence and repairs itself. Their authority is proven at
   the call site — fenced route responses, journal phases, and the photo
   queue's per-phase account+fence checks — and every one of those paths is
   covered by C15–C18.
3. **Account-local infrastructure** — `setPbCfg` (session/auth). Gating it
   would prevent a read-only device from signing in or taking over, i.e. it
   would prevent recovery.

## The migration case (the Architect's concrete example) — CORRECTED, round 33

**The previous edition of this document was wrong, and it contradicted the
suite.** It called `migrateProgressionTypes()` a "pure local normalization of
already-local bytes" and filed it under class 2 (substrate), while C19 T13
asserted byte identity for `wl_training_v1`. Those are two different policies:
substrate means "this device may write it", byte identity means "it may not".
Under STRICT the second is correct — a non-holder performs ZERO durable
content writes — and "it only rewrites the same data into a new shape" is not
an exemption, because the bytes on disk still change and `wl_training_v1` is
athlete content, not journal machinery. Substrate is the journal, quarantine
and queue material recovery is built from; the training store is not that.

**The corrected policy, as implemented:**

1. `migrateProgressionTypes()` ALWAYS performs its normalisation in memory.
   A read-only device must still render correctly, and reading and normalising
   in RAM writes nothing.
2. It calls `saveTrainingLocal()` **only when `m10AuthNow().ok`**. A non-holder
   is refused, and the refusal is counted on `window.__m10WriteRefused` like
   every other refused snapshot write.
3. The migration is idempotent, so nothing is lost: boot calls it once before
   the lease exists (in-memory only) and again immediately after `m10Boot()`
   settles the lease. On the device that holds the pen it persists there; on a
   read-only device it simply re-runs, in memory, every boot until that device
   takes over.

`saveTrainingLocal()` itself is unchanged and still NOT wrapped — the wrapper
belongs on the caller, because `saveTrainingLocal` is also reached from
`saveTraining()` (already gated at source) and from recovery paths.

C19 T13 now proves this behaviourally, on a genuinely OLD-SHAPE record that
forces the migration's `ch=true`:
- non-holder: `wl_training_v1` byte-identical, the disk still carries the
  pre-migration shape, exactly one refusal counted;
- non-holder: the in-memory normalisation still happened (movement stamped,
  routine-level type folded into the items and dropped) — display is intact;
- **holder, same record: the migration DOES rewrite the store** — so the byte
  identity above is the guard's doing, not an inert migration.

## Round-34: one new durable writer — `m8SoftBlockRecoverySave()`

Round 34 adds exactly one function to this inventory. It is reached ONLY from
the source-gate wrapper around `saveTraining()`, and only through the narrow
exemption described in `index.html` (search `Z1 (round-34 rulings 1 and 2)`).

| writer | what it persists | authorization under M10 |
|---|---|---|
| `m8SoftBlockRecoverySave` | `wl_training_v1` (the training snapshot) and `wl_training_dirty__<uid>` (the dirty generation + its persistence proof) — **and nothing else** | GATED at source, then narrowed again by `m8SoftRecoveryAuth()`: it runs only when M8's SOFT (unproven) block is the *only* thing refusing the write. Account, holder, same-account binding, unexpired deadline, valid fence, no corrupt identity, no M8 hard block, no M10 core hard or soft block, local writes not frozen, training not quarantined, no corrupt M8 journal, and a typed-readable dirty record are all re-proved first. |

Why it is not "substrate": it writes athlete content (`wl_training_v1`). It is
in class 1 — gated at source — and the exemption is a *narrowing* of that gate
for one recovery transition, not a bypass of it. The contract it must satisfy:

1. it persists the training snapshot and its dirty-generation proof only;
2. it clears the soft block only after BOTH have been read back and verified,
   and it clears it through M8's own `m8ReleaseUnprovenIfProven()` (which
   re-reads and re-validates the dirty record) rather than by assigning the
   flag;
3. no network push may begin while the proof is absent — `scheduleTrainingPush()`
   is the last statement, reached only after the release actually took;
4. any persistence or verification failure RETAINS the soft block or ESCALATES
   it to a hard block, and returns `false`. Recovery is never claimed on
   failure.

Proved by C19 T17a (recovery works), T17b ×10 (every other condition refuses),
T17c ×2 (a snapshot or proof-write failure leaves the device blocked with zero
network writes), T17d ×2 (the ordinary path, blocked and unblocked, is
unchanged). Anti-tautology: 11 mutants, each detected — see
`INCR5-MUTATION-EVIDENCE.txt`.
