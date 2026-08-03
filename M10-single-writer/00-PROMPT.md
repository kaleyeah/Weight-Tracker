# M10 single-writer — round 32: increment 5, round-31 rulings landed

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

Code head `87e9d84`, index.html sha256
`d2c8ed29cb9258c2c277350e0cb94eddcd9b8ad31c179fb2797c4589694b0a3b`.
Narrow diff `INCR5-DIFF-FROM-3cd7311.patch` (96 lines); cumulative
`INCR5-DIFF.patch` = 249fd0e → 87e9d84, `git diff --check` clean;
`sha256sum -c …/INCR5-MANIFEST.txt` exits 0 across 13 paths.

Three of your findings were errors of mine, stated plainly:

1. **HealthKit captured too late — correct, and worse than described.** The
   `hk:import` branch performed the FIRST mailbox clear (`pbSave({health:
   null})`) before any capture existed. The capture is now taken in the
   dispatcher at the click, stored on `state.hkWait`, and covers that first
   clear, every poll, the local mutation and the final clear;
   `hkTryFetch` now REFUSES an import whose capture is missing rather than
   manufacturing one. Tests: capture present at click; A→B→A before the
   first poll imports nothing and clears the wait; a non-holder produces
   ZERO health writes.
2. **"Four persistence primitives" was false.** `INCR5-DURABLE-WRITERS.md`
   inventories all 13 durable writers from the source with counts, and
   classifies each: GATED at source (the snapshot writers a tap or a lazy
   render can reach), SUBSTRATE (m8Write, m10cWrite, idb*Local,
   setPbPhotoMap — the journal/queue/quarantine machinery; gating these
   would break the flows that repair a blocked device, and their authority
   is proven at their call sites, covered by C15–C18), and ACCOUNT-LOCAL
   INFRASTRUCTURE (setPbCfg — session/auth; gating it would prevent a
   read-only device from signing in or taking over). Your
   `migrateProgressionTypes → saveTrainingLocal` example is addressed
   explicitly: it is a pure local normalization of already-local bytes, and
   T13 proves the property that matters.
3. **`m10InternalWrite` was never set — removed.** The README claim that
   M10 recovery wrapped its transitions with it was false; the real
   authorization path is documented in its place.
4. **T13 added**: a non-holder navigating every view, with
   `migrateProgressionTypes` and `resyncAllActivityTags` fired directly,
   leaves wl_v1 / wl_training_v1 / wl_workout byte-identical.
5. **Boot recovery un-gated — you were right that this was dangerous.**
   `adopt:ask`, `adopt:yes`, `lrec:restore`, `lrec:finish` run on terminal
   boot screens before lease initialisation; requiring the ordinary pen
   could have made adoption and interrupted-logout recovery impossible.
   They are exempt with an explicit contract in the inventory (T15).
6. **`m10cx:mine` / `m10p:discard` reclassified** as M10 review actions
   that persist and prove authority inside their handlers, not as
   non-persisting (T16).
7. **Imported photos stage under a fresh unique id**, so a reused incoming
   id can no longer overwrite the pre-image in place via IndexedDB `put`.

Evidence at `87e9d84`: C19 36/36; C18 52/52; C17 37/37; C16 49/49;
C15 35/35; client matrix 171/171 (+recovery artifact 25/25).

Still outstanding from your list and NOT claimed as done: the decisive
progress-retake interruption test (ruling 8) — losing authority after the
new blob is durable but during retirement. It needs a fault hook the photo
queue does not currently expose; I would rather add it deliberately next
round than assert coverage I do not have.

Requested ruling: whether increment 5 is acceptable with that one test
outstanding, or whether it blocks acceptance.
