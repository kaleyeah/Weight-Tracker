# M8 — training-sync rework: design for review

Engineer draft v1, 2026-08-02. Base: live build `2026-08-02.407-fx`
(commit `74a4777`, served bytes verified). Brief: `BRIEF-round2-rulings.md`
(the round-2 verdict; rulings cited as R1–R10 below).

The withdrawn round-2 candidate's dirty/snapshot/generation core was ruled
"directionally sound"; its containment test, upgrade path, and rollback plan
were ruled unsound. This design keeps the sound core, removes containment
entirely, and adds what R2/R6/R7/R8 require. The candidate diff no longer
exists (scratch deleted); the rework will be re-implemented against the
current head, which has since gained the session editor, GLP changes, LBM,
and the containment-release protections (recovery snapshot, ownership gates,
journalled logout) that did not exist when the round-2 candidate was written.

## 1. States and stores

One training sync state per signed-in account, derived from three keys:

| Key | Content | Written when |
|---|---|---|
| `wl_training_dirty` | `{gen, ts}` | synchronously in `saveTraining()`, before the debounce, before any `syncOn()` gate (R-sound core) |
| `wl_training_base` | the **full canonical JSON string** of the last server copy this device acknowledged, plus the server revision it carried | on acked push; on clean adopt |
| `wl_training_conflict` | `{serverCopy, serverRev, localSnapshot?, enteredAt, reason}` | on any refused adoption/push |

States: **clean** (base known, not dirty) · **dirty** (local edits pending) ·
**bootstrap** (local training exists, no base) · **conflict** (both copies
retained, Owner decision pending).

**Base representation (R5):** full canonical copy, not a hash. Exact string
equality is then the only identity test anywhere in a data-loss decision.
Cost: one more copy of training in localStorage (~tens of KB for the Owner's
data today). The digest alternative saves that space but reintroduces a lossy
identity. **Owner decision point** per R5; full-copy is the Engineer's
recommendation and the design assumes it.

## 2. Bootstrap (R2, R3, R4)

On boot, signed in, quarantine/ownership gates already passed, local
training present, **no base**:

1. Fetch the server record. Local is not modified by the fetch.
2. Server training **canonically equal** to local → write base, state clean.
3. Server training **differs** → retain both (`wl_training_conflict` holds
   the server copy), state conflict. No subset inference, ever.
4. Server record **has no training field at all** (never written by any
   client): this is the one case equality cannot decide. Proposed: treat as
   push-candidate — push local through the CAS route (§3), which fails
   closed into conflict if any other writer has appeared between fetch and
   commit. **Question 1 to the Architect:** is that acceptable, or must
   field-absent also park in conflict for the Owner to release?

Fresh device (no local training) with server training: adopt server, write
base — unchanged from today, and already protected by the containment
release's ownership gates.

## 3. Push protocol (R1, R7)

Trigger: dirty, debounced, plus boot retry when dirty. Never a blind push.

1. Capture `{gen, deep copy}` of local training.
2. Push **through the server CAS commit route** (deployed on the NAS in
   July, live, 401 unauthenticated, unused by Lineage A): send the copy plus
   the expected server revision (from base). The route commits only if the
   revision matches, and returns the new revision.
3. Success + `gen` unchanged → clear dirty, write base (copy + new rev).
4. Success + `gen` advanced (edit landed mid-flight) → base updates, dirty
   stays, reschedule.
5. Revision mismatch → fetch; if the server copy equals base (stale-rev
   race, no actual writer) retry once; else → conflict with the fetched
   copy. No overwrite.
6. Transport/5xx/401 → dirty persists, sync state shows the failure,
   retry on next boot/debounce. (The July 31 loss class dies here: a failed
   push can no longer be followed by an overwriting pull, because —)

## 4. Pull protocol (R4)

`trainingPull()` adopts the server copy **only** in state clean and only
with ownership established. Dirty or bootstrap-with-difference or existing
conflict → the server copy goes to `wl_training_conflict` (or is discarded
if identical to base), local is never overwritten. `resyncAllActivityTags()`
(the round-2 "separate defect": a stale training read can delete published
activity tags) is fixed in the same change: tag derivation runs only after
an adoption actually completes, never from a fetched-but-refused copy.

## 5. Conflict resolution (R6, R7)

Every existing installation may enter bootstrap conflict on first boot, so
the workflow ships in the same build. Non-blocking: a persistent banner on
the Training tab (the app stays usable; local edits continue accumulating in
the local copy). The conflict view:

- **Inspect both**: per-copy summary — session count, dates, exercises,
  latest entry — and a per-date difference list (dates only in local, only
  in server, differing).
- **Export both first**: one tap produces two backup files (existing
  format-2 envelope, marked `conflict-local` / `conflict-server`). The
  choice buttons stay disabled until both exports have been delivered
  (the same delivered-file evidence pattern the backup work established).
- **Choose Local** → CAS-push local (expected rev = the conflict's
  serverRev); mismatch re-enters conflict with the newer copy.
- **Choose Server** → adopt server copy, write base, local copy is included
  in the exports taken above.
- **Defer** → keep everything, banner persists.

The retired Commit 10 lineage carried a reviewed conflict-centre UI with 56
browser assertions (`tests/browser/conflict-center.browser.test.js`); its
interaction patterns are reused where they fit the much narrower M8 scope.

## 6. Recovery plan (R8) — roll-forward only

Once M8's keys exist on devices, serving the old client again is not a safe
rollback: its unconditional pull ignores dirty/conflict and can destroy the
protected copy. Recovery from a bad M8 build is **roll-forward**: a minimal
patch build derived from M8 with `trainingPull()` adoption disabled entirely
(`SYNC_SAFE`), leaving reads/writes local-only and dirty accumulating, until
a fixed build ships. The recovery build is prepared and byte-identified
**before** M8 deploys; tests must show it boots from clean, dirty, and
conflict states without mutating any training key. Rollback-to-`.407` stays
available only for a build that has never written an M8 key (detectable:
none of the three keys present).

## 7. Scope boundaries

- **Training only.** Core data (weights/food/steps/…) keeps its existing
  raw-PATCH path and revision counter; reworking it is not in M8. The CAS
  kit only takes over the training field. **Question 2 to the Architect:**
  confirm this boundary, or require core in the same pass.
- **Server lockdown** (rule-blocking raw PATCH of training) remains OFF
  until M8 is deployed and verified on the Owner's device; turning it on is
  a separate Owner-authorized step, after which old clients cannot write
  training at all — which is exactly the point.
- Single-writer (M10) still comes after; M8 must be correct without it,
  which the CAS route provides at the training field.

## 8. Evidence plan (R3, R4, R9, R10)

- **C11 revised**: the containment cases (old C11-10) become conflict
  expectations; the sound-core cases stay; the R3 authentic-upgrade test
  (old-client localStorage: unsynced session, no dirty/base/conflict keys,
  stale server, session must survive on disk) and the seven R4 matrix cases
  are added. Suite must fail against `.407` and pass against the candidate.
- **Browser suite**: Playwright, shipping file, mocked PB endpoint; boot
  ordering, timers, localStorage persistence, the conflict view driven
  through real DOM, export-delivery gating.
- **Disposable-PB round**: real PocketBase against a disposable record
  (Owner authorized 2026-08-01), covering the CAS route's auth, revision
  behavior, and failure handling per R7.
- Wording discipline per R10 throughout: VM = modeled, browser = real
  engine, device claims only from the device.

## 9. Sequence

1. This design → Architect review (this round).
2. Implement per rulings; revise C11; new browser suite.
3. Evidence round(s) with the Architect.
4. Disposable-PB integration round.
5. Owner decision file → publish → served-byte verify → device check.
6. Owner-authorized server lockdown of raw training PATCH.

## Questions collected

1. §2.4 — may field-absent-on-server bootstrap push via CAS, or must it
   park in conflict?
2. §7 — confirm training-only scope for M8.
3. §1 — base as full canonical copy (Engineer recommendation) vs digest:
   flagged for the Owner per R5; does the Architect see a reason to forbid
   full-copy?
