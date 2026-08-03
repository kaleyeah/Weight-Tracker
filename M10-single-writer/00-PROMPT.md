# M10 single-writer — round 25: increment 4, round-23/24 rulings landed

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

Increment 4 only. **Code head `47b4daa`**, index.html sha256
`d996b96b6ab7f49716c140514db3d660a42c2dd4f307896c46aad84d38379c8b`.
Every package artifact in this bundle was regenerated FROM that head
AFTER it was committed (that was the round-24 process failure: the
artifacts described an earlier head). The records head carrying them
has a byte-identical `index.html`, which `INCR4-MANIFEST.txt` asserts;
`sha256sum -c` on the manifest verifies, and its C18 line matches the
committed `INCR4-C18-OUTPUT.txt` (41/41).

Rulings 2–8:
2. **The real metadata UI path is fixed.** The lightbox relabel now
   builds a durable `meta` queue entry (old+new canonical metadata),
   verified BEFORE the local store changes, and the server side rides
   the transactional update route. The raw
   `/api/collections/photos/records/<id>` PATCH is gone. The new
   UI-path test drives the production lightbox (open → Edit → meal
   chip) and asserts: the queue entry exists at the instant
   `idbAddLocal` is called, exactly one transactional update, and ZERO
   raw collection PATCHes observed at the network layer.
3/4. **Adoption `intent` recovery** identity-checks any existing local
   record: our own bytes (crash after the local write) → the mapping
   obligation is COMPLETED, not dropped; unrelated bytes or a
   conflicting mapping → `unverified` review. The unconditional clear
   is gone (both arms tested).
5. **Authoritative file identity** is captured AT displacement
   (recordId, localId, file) and all three fields are compared after
   the destructive confirmation; a change marks the entry
   `unverified` and deletes nothing (tested, including that the
   captured identity carries `file`).
6. **The destructive transition is ONE verified write** carrying both
   the freshly proven identity and the resolution state; a failed
   write dispatches nothing (tested with an injected queue-write
   failure: the photo survives).
7. **Application-path coverage** added, as above.
8. `git diff --check` on the regenerated cumulative patch is clean.

Evidence, all fresh at `47b4daa`: `INCR4-C18-OUTPUT.txt` 41/41;
`INCR4-C17-RERUN.txt` 37/37; `INCR4-C16-RERUN.txt` 49/49;
`INCR4-C15-RERUN.txt` 35/35; `INCR4-M8-REGRESSION.txt` 171/171
(+artifact-scope recovery 25/25); `INCR4-MANIFEST.txt` (verifies).
The mandatory reports remain on the repo's `main` branch per
RECORDS-LOCATION-EVIDENCE.md; their governance content was updated
there after round 22.

Requested ruling: acceptance of increment 4 and authorization for
increment 5.
