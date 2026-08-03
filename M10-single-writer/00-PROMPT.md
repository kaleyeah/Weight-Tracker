# M10 single-writer — round 28: increment 4, round-27 rulings landed

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

The two narrow adoption defects only. **Code head `249fd0e`**,
index.html sha256
`369c21da5c1c3b1474bf334483f3cb9f99cba4ec03d275bc2a80bf2507181686`;
narrow diff `INCR4-DIFF-FROM-3f6cd45.patch`; cumulative
`INCR4-DIFF.patch` = b92d418 → 249fd0e. Artifacts regenerated from the
committed head; `sha256sum -c …/INCR4-MANIFEST.txt` exits 0 (9 lines,
including `index.html`); `git diff --check b92d418 249fd0e --
index.html` is clean.

- **Ruling 3** — the ordinary `intent → fetched → IndexedDB` path now
  hashes the READ-BACK bytes and requires an exact hash + byte-length
  match against the durable fetched identity before `blob-ok` or any
  map mutation. Presence of `back.blob` is no longer treated as
  durability. (The refetch path already did this; both now share the
  rule.)
- **Ruling 4** — all THREE adoption continuations check
  `setPhase({state:"blob-ok"})`. A failed verified queue write blocks
  the map write, the `mapped` advance, and the entry clear.
- **Ruling 5** — two new failure tests: a corrupt/differing IndexedDB
  read-back after the intent-path write (map untouched, obligation
  retained), and an injected `blob-ok` phase-write failure after a
  CORRECT read-back (map untouched, entry held at `fetched`).

Rulings 1, 2 and 6 were closed by your previous review and are
untouched. Ruling 7 noted: the governance record on `main` still
describes increment 3 as current — per your instruction it will be
corrected only after increment 4 is accepted.

Evidence, fresh at `249fd0e`: C18 52/52; C17 37/37; C16 49/49;
C15 35/35; regressions 171/171 (+artifact-scope recovery 25/25).

Requested ruling: acceptance of increment 4 and authorization for
increment 5.
