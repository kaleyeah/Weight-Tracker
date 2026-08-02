# M10 single-writer — round 8: consolidated design v8 + rewritten matrix v5

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

Your round-7 ruling (16 items) is addressed in full. Both files were
EDITED AND COMMITTED before this prompt was written (commits 17e25df,
de738a6 on engineering/m8, local only). Per-item disposition
(G1–G16 = your round-7 items 1–16):

- **G1 (byte-bound upload identity)** — DESIGN §photo idempotency:
  upload identity = op + authenticated user + localId + canonical
  metadata + exact byte length + sha256 of the file bytes, the digest
  COMPUTED BY THE SERVER from the received file inside the transaction
  and stored in the ledger row; same key with different bytes/length/
  metadata → typed key-reuse 409, never a silent replay.
- **G2 (replay results)** — photo ledger rows persist `resultRecordId`
  + result identity; original, in-retention replay, and retention-
  expired fallback return the same usable contract (upload
  `{ok, recordId, identity}` — the id `wl_photomap` needs; the expired
  fallback reconstructs transactionally by authenticated
  `(user, localId)`); metadata `{ok, recordId, applied}`; delete
  `{ok, deleted, alreadyGone}`.
- **G3 (ownership before lease)** — update/delete resolve the target
  INSIDE the transaction and require `record.user === authenticated
  user` BEFORE lease validation; cross-account ids answer
  byte-identically to nonexistent ids; all three routes in evidence
  §8.6.
- **G4 (queue completeness)** — full per-op entry schemas: add carries
  blobByteLength + blobSha256 + meta + localId (a missing/changed
  IndexedDB blob is detected, not uploaded); delete carries captured
  pre-op state; metadata carries old+new; clear members carry captured
  identities.
- **G5 (write ordering + crash recovery)** — per-op ordering stated
  (add: intent → blob verified → dispatch; delete: tombstone with blob
  recoverable → ack → local delete; metadata: intent → ack → local
  apply); a failed blob write terminalizes the intent as void; a
  failed queue write blocks both sides; every boundary in evidence
  §8.6.
- **G6 (revalidated Apply)** — Apply-after-takeover re-fetches and
  compares the captured server identity; drift refreshes the review
  entry, never auto-applies; Discard is explicit.
- **G7 (journal name)** — the stale `wl_core_journal__` name is purged;
  displaced-core ops are defined on `wl_core_dx_journal__`; boot
  order, validators, quarantine kinds, hard-block union, and tests all
  use the same key.
- **G8 (handoff gap)** — the terminal ack is removed only after the dx
  intent + its captured request identity verify; a crash in the gap
  leaves the terminal ack and boot deterministically DERIVES the dx
  intent from it plus dirty/base/server state — neither copy lost;
  crash-in-gap in evidence §8.7.
- **G9 (emptiness predicate)** — exact content-only predicate
  (weights/statuses lengths, dated-key counts across the eight content
  maps, GLP doses/symptoms); settings/defaults and UNKNOWN fields are
  not consulted and survive adoption (exact-parsed-object rule,
  M8-style).
- **G10 (bootstrap tightening)** — the fenced first push at
  expectedRev 0 ONLY for no-row or absent-`data`-with-`coreRev===0`;
  absent data with positive coreRev is deletion evidence → displaced
  review; a nonempty server copy is never overwritten by a
  self-declared-fresh client.
- **G11 (blocked ≠ takeover)** — corrupt/blocked is status/read only;
  takeover only after explicit local recovery. Agreed on the merits —
  no Owner page needed.
- **G12 (takeover during recovery)** — takeover DEFERRED: recovery
  completes first; a surviving journal resolves under its ORIGINAL
  fence's replay/fetch rules; an old request resolving into a
  revision/fence conflict transitions to displaced review, never
  re-dispatches as authorized; only a verified terminal state unlocks
  acquisition.
- **G13 (enforcement-day gate)** — the recorded five-point checklist
  for BOTH devices (served identity; no fence-less journals — resolved
  while enforcement is OFF, a fence is never invented; no unresolved
  states; lease acquire/renew; fenced core/training/photo probes) plus
  the writer enumeration; end-to-end gate execution in evidence §8.8.
- **G14 (matrix)** — WRITE-SURFACE-MATRIX.md is REWRITTEN as v5
  against the live `2026-08-02.416-fx` tree, all line numbers
  re-verified today: hook-based photo fencing and "stays local,
  photoSync retries" are GONE; §3 queue-ordered client photo
  mutations with concrete sites (7571/7572/7771/7774/7780, lightbox
  6106 and 10034–10038, day:clear 7575/7581, reset:do 7666,
  pbk-import 7765/5997–5999); §4 the three transactional routes with
  raw-reject; §5 the non-holder photoSync zero-mutation rule; §6 the
  async revalidation surface; no v3 references anywhere (the design's
  composite note now cites v5 §1).
- **G15 (evidence)** — plan §8.6–8.8 adds: different-bytes/same-key;
  replay returning the same recordId across retention states;
  cross-account ids; queue-write and blob-write failures; the
  terminalization→dx-intent gap crash; coreRev-0 vs positive-rev
  absent core; takeover refused from blocked and deferred during
  recovery; legacy fence-less journals at the enforcement boundary.
- **G16** — acknowledged: records stay local-only; no route,
  migration, hook, client, NAS, coach, enforcement, or live-data
  change has begun.

Files: DESIGN.md (v8, consolidated, self-contained),
WRITE-SURFACE-MATRIX.md (v5, full rewrite), artifacts/
(PB-SEMANTICS-PROBE.md + probe scripts, unchanged since round 7).

Requested ruling: whether design v8 + matrix v5 constitute the
approved contract for §9 step 2 — LOCAL-only implementation against
disposable PB. Nothing else is requested.
