# M10 single-writer — round 24: increment 4, round-23 rulings landed

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

Increment 4 only, revised. Head `311c3b2`; index.html sha256
`ff45a5ff4eedb0bbc62571c8463cc9a2f6059c2284d6e7dbc44d9bbb0990d623`.
Narrow diff from the rejected head: `INCR4-DIFF-FROM-6cc656d.patch`
(476 lines); regenerated cumulative `INCR4-DIFF.patch` = b92d418 →
311c3b2 (638 lines). `INCR4-MANIFEST.txt` is COMMITTED at this head
and hashes every artifact plus the source bytes (`sha256sum -c`
verifies).

The eight code rulings, as landed (details in INCR4-README):
1. **Upload mapping durability** — phases `blob-ok → acked
   (resultRecordId durable) → mapped (photo map written AND read back)
   → cleared`. A map-write failure holds the entry at `acked` and
   hard-blocks; reload replays only the map write, with NO second
   upload (both halves tested).
2. **Delete settlement** — explicit `acked → local-applied → cleared`;
   account, session generation and the SAME entry fence are re-proven
   immediately before the local deletion and before the map clear. Pen
   loss at the `acked` boundary parks the entry with the photo intact;
   restoring the pen completes it (tested).
3. **`intent` is not dispatchable** — an add intent resolves first:
   blob present → identity captured → promoted; blob definitively
   absent → `void` with a reason. Only `blob-ok` dispatches (both
   arms tested).
4. **Displaced-delete revalidation** — after the export gate and the
   identity-bound confirmation, the destructive Apply fetches the
   server listing and requires the same (recordId, localId) identity
   AND the same fence; a changed identity marks the entry `unverified`
   and deletes nothing (tested).
5/6. **Sweep + adoption** — the sweep captures its fence and requires
   it at the write boundary; adoption is a JOURNALED `adopt` op
   (identity → blob durable → map durable+verified → cleared). A fence
   replacement mid-sweep adopts nothing (tested).
7. **Typed 404** — an indistinguishable `{notFound:true}` is not
   authority: delete and metadata entries become `unverified` for
   review and the local photo is KEPT (tested).
8. **Uniform validation** — safe-integer rules on export byte length
   and every integer field; strict plain-object canonicalization for
   all metadata; `void` and `unverified` entries surface in the review
   banner with export/discard paths.

Records (rulings 9/10): the manifest is committed at this head, and
the mandatory `reports/PROJECT_LOG.md` /
`reports/MAESTRO_PROGRAM_CONTEXT.md` live on the repo's `main` branch
(the deployed-lineage checkout) — they are NOT presented as artifacts
of this branch; see RECORDS-LOCATION-EVIDENCE.md. Their governance
content was updated there after round 22 to record the accepted
increments.

Evidence, fresh at `311c3b2`: `INCR4-C18-OUTPUT.txt` 35/35 (the
original 25 plus the seven round-23 phase-boundary arms);
`INCR4-C17-RERUN.txt` 37/37; `INCR4-C16-RERUN.txt` 49/49;
`INCR4-C15-RERUN.txt` 35/35; `INCR4-M8-REGRESSION.txt` 171/171
(+artifact-scope recovery 25/25).

Requested ruling: acceptance of increment 4 and authorization for
increment 5 (the m10Gate action surface, async revalidation at
delayed-mutation sites, logout coupling).
