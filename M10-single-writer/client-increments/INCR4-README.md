# M10 client increment 4 — photo operation queue

## Package identity
- **Base**: `b92d418` — the accepted increment-3 head.
- **Increment head**: `311c3b2` — index.html sha256
  `ff45a5ff4eedb0bbc62571c8463cc9a2f6059c2284d6e7dbc44d9bbb0990d623`
  (prior head 6cc656d revised by the round-23 rulings; narrow diff
  `INCR4-DIFF-FROM-6cc656d.patch`, 476 lines).
- **Cumulative diff** `INCR4-DIFF.patch` = b92d418 → 311c3b2 (638 lines). Two
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
- **9/10 (records)**: this bundle's manifest is committed at the head;
  the mandatory reports live on the repo's `main` branch (the
  deployed-lineage checkout) and are NOT presented as artifacts of
  this branch — see RECORDS-LOCATION-EVIDENCE.md from round 20.

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
- `INCR4-C18-OUTPUT.txt` — C18 35/35: upload happy path + ordering;
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
