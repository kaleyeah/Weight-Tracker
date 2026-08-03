# M10 single-writer — round 23: client increment 4 (photo operation queue)

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

Increment 4 per round-22's authorization and list, implemented narrowly
on accepted head `b92d418`. `client-increments/INCR4-README.md` is the
package record; `INCR4-MANIFEST.txt` hashes every artifact plus the
source bytes.

Identity: base `b92d418` → head `6cc656d` (index.html sha256
`3b3dd584396e9b841b262394f57c5bf3dde597137d36b720e5673ee7cdf9cdc1`);
cumulative diff `INCR4-DIFF.patch` (488 lines). Two delimited regions:
`M10-BLOCK-4` (machinery + review UI) and `M10-BLOCK-4-WIRING`,
installed LAST because the M8-era photo wrappers assign
idbAdd/idbDelete/idbClearAll further down the file. No accepted
increment-1/2/3 code is modified.

Your return items:
1. **State machine + storage model** — `wl_photo_ops__<uid>` under the
   verified-write/quarantine/shared-block layer; states intent →
   blob-ok → cleared | displaced | void; per-op entry schemas
   preserving the FULL operation (add carries blob sha256 + byte
   length so a missing/changed blob is voided, never uploaded; delete
   carries the captured local meta + server identity; meta carries
   old+new). Entries validated on read AND write; malformed queues
   quarantine + block.
2. **Identity/idempotency (item 6)** — every op is account-bound,
   generation-bound, identity-bound and replayable: upload declares
   the byte length, the SERVER hashes the received bytes, and the
   client validates `{ok, recordId, identity.sha256, identity
   .byteLength}` against the captured blob identity before touching
   local state; metadata/delete results are validated against the
   submitted serverId; replays are answered by the ledger with the
   SAME requestId.
3. **Crash matrix (item 8)** — C18 covers upload/update/delete through
   their phases, lost responses (reload replays: ONE server record,
   ONE ledger key), reload with a pending add and a pending delete,
   queue-write (quota) failure (blocks BOTH sides), blob-write failure
   (void), A→B→A, stale fences on all three ops, malformed
   success/identity-mismatch/untyped-fence bodies (entry survives, not
   displaced, no local change), and cleanup-removal failure.
4. **Displaced-photo review (G6)** — typed fenceStale only (safe
   integer fence required); banner per pending change; Apply re-queues
   so the dispatcher revalidates; Discard is explicitly confirmed and
   keeps the local photo.
5. **Destructive resolution (item 8)** — Apply of a displaced DELETE
   requires a delivery-evidenced export of that photo whose evidence
   is bound to the blob's sha256 + byte length, then an identity-bound
   confirmation naming the digest and size. Refused without the
   export (tested); nothing is deleted.
6. **Pen/account boundaries (item 7)** — separate tests for REAL
   deadline expiry and same-account fence replacement, plus A→B→A
   (A's queue byte-identical, zero `__userB` keys, no map write).
7. **A defect this suite found and fixed** — the M8-era `photoSync`
   uploaded via raw `pbPhotoUpload` (bypassing the queue and its
   identity binding) and DELETED local photos absent from a server
   listing. That is a silent content deletion under M10, so the sweep
   is REPLACED: drain the queue, then holder-only additive downloads
   with revalidation immediately before each IndexedDB write; never
   deletes, never relabels, never overwrites local bytes. Non-holders
   perform zero local and zero server photo mutations (tested).
8. **Evidence** (fresh at `6cc656d`): `INCR4-C18-OUTPUT.txt` 25/25;
   `INCR4-C17-RERUN.txt` 37/37; `INCR4-C16-RERUN.txt` 49/49;
   `INCR4-C15-RERUN.txt` 35/35; `INCR4-M8-REGRESSION.txt` 171/171
   (+artifact-scope recovery 25/25); `INCR4-MANIFEST.txt`.

Deferred: increment 5 (the 92-action m10Gate surface, async
revalidation at delayed-mutation sites, logout coupling);
NAS/coach/enforcement/publication behind their Owner gates.

Requested ruling: acceptance of increment 4 and authorization for
increment 5.
