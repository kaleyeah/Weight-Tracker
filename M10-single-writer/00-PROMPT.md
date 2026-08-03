# M10 single-writer — round 16: the corrected increment-1 records package

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

Per your closing instruction: the records package ONLY. No authority
code was modified (the records head's `index.html` is byte-identical
to accepted head `3e7a0d0` —
`0d26b1da5ba1a0d34607918e69be0d6e6906cf168140de34820738c7f0bceef8` —
asserted in the manifest). Records commit: 749d494.

- **Ruling 6 (cumulative artifact)** — `INCR1-DIFF.patch` regenerated
  as base `0389770` → authority head `3e7a0d0`. It contains the
  generation guard and the unified strict validators, and ZERO
  `Math.random` occurrences (grep-asserted).
  `INCR1-PATCH-VERIFY.txt` is the reproduction proof: the base file
  from `0389770` with the cumulative patch applied hashes EXACTLY to
  the authority-head bytes (both sha256 lines shown, equal).
- **Ruling 7 (identity)** — `INCR1-README.md` now opens with the
  three-way identity: base `0389770` (= served `.417-fx`, your
  ruling-1 verification), authority implementation head `3e7a0d0`
  (the accepted code), and the records/bundle head carrying the final
  evidence — with patch roles and hashes.
- **Ruling 8 (self-consistency)** — at THIS single head: the README,
  the cumulative patch, the narrow round-14 patch, `INCR1-C15-OUTPUT`
  (35/35), `INCR1-M8-REGRESSION` (171/171 vs `3e7a0d0`, plus the
  artifact-scope recovery 25/25), `INCR1-MANIFEST.txt` (sha256 of
  every artifact plus the source-bytes hash), and the source itself
  all agree. No working-tree or later-commit knowledge is needed.

Rulings 1–4 (code) were accepted last round and nothing touched the
code since. Ruling 9 honored: no production action taken or
requested.

Requested ruling: acceptance of increment 1 as a reproducible package
and authorization for increment 2 (core durability protocol).
