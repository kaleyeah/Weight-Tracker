# M10 client increment 4 — photo operation queue

## Package identity
- **Base**: `b92d418` — the accepted increment-3 head.
- **Code head**: `3f6cd45` — index.html sha256
  `0de01c2e54276038952c2eec3f6e48b8ca7e6bf6a3f13c68558ac8576fa12a5b`.
  (Heads: 6cc656d → 311c3b2 → 47b4daa → 5095ed6 → 3f6cd45; narrow
  round-26 diff `INCR4-DIFF-FROM-5095ed6.patch`.)
- **Records head**: the commit carrying this README, both patches, all
  evidence outputs and `INCR4-MANIFEST.txt` — its `index.html` is
  BYTE-IDENTICAL to `47b4daa` (the manifest asserts that hash).
- **Cumulative diff** `INCR4-DIFF.patch` = b92d418 → 3f6cd45. Two
  delimited regions: `M10-BLOCK-4` (machinery + review UI) and
  `M10-BLOCK-4-WIRING` — the wiring is installed LAST, after the
  M8-era photo wrappers, because those assign `idbAdd`/`idbDelete`/
  `idbClearAll` further down the file and would otherwise win. No
  accepted increment-1/2/3 code is modified.

## Round-23 rulings, as landed
- **1 (upload mapping durability)**: the entry advances to a durable
  `acked` phase carrying `resultRecordId` BEFORE anything else; the
  photo map is then written and READ BACK (verified) and the entry
  advances to `mapped` before it may clear. A map-write failure holds
  the entry at `acked` and hard-blocks; reload replays only the map
  write — no second upload (tested both halves).
- **2 (delete settlement)**: explicit `acked` → `local-applied` →
  cleared phases; account + session generation + the SAME entry fence
  are re-proven immediately before the local deletion and before the
  map clear. Pen loss at the `acked` boundary parks the entry with the
  photo intact; restoring the pen completes it (tested).
- **3 (intent is not dispatchable)**: an add `intent` is resolved
  first — blob present → identity captured → promoted to `blob-ok`;
  blob definitively absent → `void` with a reason. Only `blob-ok`
  dispatches (both arms tested).
- **4 (displaced-delete revalidation)**: after the export gate and the
  identity-bound confirmation, the destructive Apply fetches the
  server listing and requires the SAME (recordId, localId) identity
  and the same fence; a changed identity marks the entry `unverified`
  and deletes nothing (tested).
- **5/6 (sweep + adoption)**: the download sweep captures its fence
  and requires the same fence at the write boundary; adoption is a
  JOURNALED `adopt` op (identity captured → blob durable → map
  durable+verified → cleared). A fence replacement during the sweep
  adopts nothing (tested).
- **7 (typed 404)**: an indistinguishable `{notFound:true}` is not
  authority — delete and metadata entries become `unverified` for
  review and the local photo is KEPT (tested).
- **8 (uniform validation)**: safe-integer rules applied to export
  byte length and every integer field; all metadata objects must pass
  strict plain-object canonicalization; `void` and `unverified`
  entries surface in the review banner with export/discard paths.
- **Round-24 additions**: the REAL lightbox relabel now journals a
  `meta` entry (old+new metadata) and dispatches the transactional
  route — the raw `/api/collections/photos/records/<id>` PATCH is gone
  (UI-path test: the queue entry exists at the instant the local store
  is written, one transactional update, ZERO raw PATCHes); adoption
  `intent` recovery identity-checks an existing local record (own bytes
  → complete the mapping obligation; unrelated → `unverified` review,
  never a silent clear); the destructive requeue persists the freshly
  proven identity AND the resolution state in ONE verified transition
  (a failed write dispatches nothing); the authoritative server
  identity (recordId, localId, file) is captured AT displacement and
  all three fields are compared after confirmation.
- **9/10 (records)**: this bundle's manifest is committed at the head;
  the mandatory reports live on the repo's `main` branch (the
  deployed-lineage checkout) and are NOT presented as artifacts of
  this branch — see RECORDS-LOCATION-EVIDENCE.md from round 20.

## Round-26 rulings, as landed
- **2/3/5 (adoption recovery)**: `adopt/fetched` with NO local record
  now REFETCHES the authoritative server file, validates its hash and
  byte length against the durable fetched identity, writes IndexedDB,
  reads the bytes BACK and re-verifies them, and only then writes the
  map — it can never park in `fetched` forever. Differing refetched
  bytes → `unverified/adopt-server-differs` with nothing written or
  mapped; a temporary fetch failure preserves the obligation and the
  retry succeeds. Three tests.
- **4 (phase-aware validation)**: every `adopt` entry in `fetched`,
  `blob-ok`, or `mapped` must carry a valid sha256 and a safe POSITIVE
  byte length; the validator rejects identity-less phase records.
- **6 (honest UI result)**: the lightbox result is bound to THIS
  operation's outcome — it polls the local record for the new label and
  reports "Moved" only when it is actually applied, otherwise
  "Couldn't move the photo — it stays where it was". Tested through the
  production UI with a failing IndexedDB write: no false success, the
  label unchanged, the server untouched.

## Round-25 rulings, as landed
- **1 (adoption identity)**: `adopt` gains a durable `fetched` phase —
  the FETCHED server blob's sha256 + byte length are recorded in a
  verified queue write BEFORE IndexedDB is touched. Recovery at
  `fetched` resumes only on an exact hash+length match (else
  `unverified`); recovery at `intent` with an existing local record
  never guesses — it goes to review (`adopt-local-exists`). Three
  tests: matching → mapping completed; differing → unverified, no
  mapping; intent-with-existing → unverified.
- **2/7 (metadata state machine)**: the queue now owns BOTH sides. The
  dispatcher applies the local metadata in its own verified
  `local-applied` phase and only then dispatches the transactional
  route; the lightbox no longer writes locally itself. Crash arms:
  interrupted at `local-applied` → reload completes the server side
  (replayed update); a failing local write parks the entry at `intent`
  with the server untouched.
- **3/4 (complete pre-image)**: a destructive Apply requires a COMPLETE
  pre-displacement `(recordId, localId, file)` identity that exactly
  matches the fresh post-confirmation identity. Displacement that
  cannot capture it (listing failure or missing `file`) records
  `unverified/identity-uncaptured`, and Apply refuses with an explicit
  message — tested end-to-end with a failing listing.
- **5 (manifest)**: `INCR4-MANIFEST.txt` is now pure `sha256sum`
  format with repo-root-relative paths, `index.html` included as a
  real path. Verify from the repo root:
  `sha256sum -c M10-single-writer/client-increments/INCR4-MANIFEST.txt`
  → every line OK, exit 0.
- **6 (patch cleanliness)**: `git diff --check b92d418 5095ed6 --
  index.html` produces no output (exit 0) — the source range is clean.
  The whitespace previously reported lives INSIDE the committed
  `.patch` artifacts and is the unified-diff format's own blank
  CONTEXT line (a single space); it is not a whitespace error in the
  source and cannot be removed without corrupting the patch. The
  superseded narrow patch has been deleted.

## Storage model
`wl_photo_ops__<uid>` — an account-keyed durable queue under the same
verified-write / quarantine / shared-block layer as the core stores.
Entry states: `intent` → `blob-ok` → (cleared on ack) | `displaced`
(fence-stale, awaiting review) | `void` (terminal: the local blob did
not survive its write, so the entry is never uploadable).
Entries preserve the FULL operation:
- **add**: `{localId, blobByteLength, blobSha256, meta, requestId}` —
  the blob stays in IndexedDB, its identity in the entry, so a missing
  or changed blob is detected and voided rather than uploaded.
- **delete**: `{localId, serverId, capturedLocalMeta,
  capturedServerIdentity, requestId}` — a tombstone; the blob remains
  recoverable until the server acks.
- **meta**: `{serverId, oldMeta, newMeta, requestId}`.
Every entry is validated on read AND write; a malformed queue is
quarantined into the corrupt namespace and hard-blocks.

## Write ordering (G5)
- add: queue intent verified → local blob written + read back and
  identity-hashed → state `blob-ok` → dispatch. A failed queue write
  blocks BOTH the local and the server mutation (tested); a failed
  blob write voids the intent (tested).
- delete: tombstone verified while the blob is still recoverable →
  server ack (or typed already-gone) → local blob removed → entry
  cleared (tested mid-flight: the photo is still on the device while
  the delete is in flight).
- meta: intent verified → ack → entry cleared.
- clear-all: every member becomes its own queued delete with captured
  identities.

## Server transport
Only the three reviewed transactional routes. Upload sends the
declared `byteLength` + the file; the SERVER hashes the received bytes
and returns `{ok, recordId, identity}`, which the client validates
(sha256 AND byteLength must equal the captured blob identity, recordId
well-formed) before touching local state. Metadata/delete results are
validated against the submitted `serverId`. Replays are answered by
the ledger with the SAME requestId (tested: lost response → reload →
one server record, one ledger key).

## Authority (round-22 item 7)
Every operation captures `{uid, session generation}` and the entry
fence; every settlement re-proves the account context AND the same
fence before touching the queue or local stores. Tested separately
for: A→B→A mid-upload (A's queue byte-identical, zero `__userB` keys,
no map write), REAL deadline expiry, and same-account fence
replacement.

## Displaced review (G6) and destructive resolution (item 8)
A typed `fenceStale` (safe integer fence required — a malformed one
leaves the entry pending, tested) freezes the entry as DISPLACED with
a banner listing each pending change. **Apply** re-queues so the
dispatcher revalidates everything; **Discard** requires explicit
confirmation and leaves the local photo untouched. A displaced
DELETE is destructive, so Apply additionally requires a
delivery-evidenced export of that photo (share-resolution or
download + confirmation) whose evidence is bound to the blob's
sha256 + byte length, then an identity-bound confirmation naming that
digest and size. Without the export, Apply refuses and nothing is
deleted (tested).

## The legacy reconciliation is REPLACED (defect found by this suite)
The M8-era `photoSync` uploaded via raw `pbPhotoUpload` (bypassing the
queue and its identity binding) and DELETED local photos absent from a
server listing. Under M10 that is a silent content deletion. The M10
sweep drains the queue, then — holder only, with revalidation
immediately before each IndexedDB write — downloads server photos this
device lacks. It never deletes, never relabels, never overwrites
existing local bytes. Non-holders perform zero local and zero server
photo mutations (tested).

## Evidence
- `INCR4-C18-OUTPUT.txt` — C18 50/50: upload happy path + ordering;
  lost-response replay (same requestId, single record); delete
  ordering; metadata; stale fence on all three ops; malformed
  success/identity-mismatch/untyped-fence bodies (entry survives);
  reload with a pending add and a pending delete; queue-write (quota)
  failure; blob-write failure → void; A→B→A; deadline expiry;
  fence replacement; Apply after takeover; Discard; the destructive
  export + identity gate (refused, then completed); non-holder
  zero-mutation; cleanup-failure fail-closed; plus the round-23
  phase-boundary arms (map-write failure + replay, acked-pen-loss and
  recovery, intent promotion vs void, changed server identity, bare
  404, journaled adopt sweep, fence-replaced sweep).
- `INCR4-C17/C16/C15-RERUN.txt` — 37/37, 49/49, 35/35.
- `INCR4-M8-REGRESSION.txt` — the full client matrix.
