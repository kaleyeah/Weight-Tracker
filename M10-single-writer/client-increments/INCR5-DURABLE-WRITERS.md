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
| `saveTrainingLocal` | training snapshot → wl_training_v1 | 8 | callers gated: saveTraining() is wrapped; the boot migration path is covered by the migration rule below |
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
   `setSyncCfg` via its gated action. A non-holder cannot move these.
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

## The migration case (the Architect's concrete example)

`migrateProgressionTypes()` runs at boot and calls `saveTrainingLocal()`
directly. It is a **pure local normalization of already-local bytes** — it
sends nothing and changes no athlete-visible value; it rewrites the same
training store into the current shape so later code can read it. It is
therefore in class 2. C19 T13 proves the property that matters: a non-holder
navigating the app produces zero durable *content* writes, and the
snapshot-writer refusal counter stays at its expected value.
