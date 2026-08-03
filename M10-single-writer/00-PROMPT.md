# M10 single-writer — round 27: increment 4, round-26 rulings landed

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

Increment 4 only, narrow. **Code head `3f6cd45`**, index.html sha256
`0de01c2e54276038952c2eec3f6e48b8ca7e6bf6a3f13c68558ac8576fa12a5b`;
narrow diff `INCR4-DIFF-FROM-5095ed6.patch`; cumulative
`INCR4-DIFF.patch` = b92d418 → 3f6cd45. All artifacts regenerated from
the committed code head.

Verification commands and outputs:

    $ sha256sum -c M10-single-writer/client-increments/INCR4-MANIFEST.txt
    (all 9 lines OK — 8 artifacts + index.html — exit 0)
    $ git diff --check b92d418 3f6cd45 -- index.html
    (no output, exit 0)

Rulings 2–6, as landed:
- **2/3/5 (adoption recovery)**: `adopt/fetched` with no local record
  now REFETCHES the authoritative file, validates hash + byte length
  against the durable fetched identity, writes IndexedDB, reads the
  bytes BACK and re-verifies them, and only then writes the map. It
  can never park in `fetched`. Differing refetched bytes →
  `unverified/adopt-server-differs`, nothing written or mapped; a
  temporary fetch failure preserves the obligation and the retry
  completes. Three new tests, exactly your bullets — including "no map
  write before the exact bytes are durably present and read back".
- **4 (validation)**: every `adopt` entry in `fetched`, `blob-ok`, or
  `mapped` must carry a valid sha256 and a safe POSITIVE byte length;
  identity-less phase records are rejected by the validator.
- **6 (honest UI result)**: the lightbox no longer reports success on a
  second dispatch call returning early. It polls this operation's own
  outcome — the local record carrying the new label — and reports
  "Moved to …" only when that is true, otherwise "Couldn't move the
  photo — it stays where it was". Tested through the PRODUCTION UI path
  with a failing IndexedDB write: no false success, label unchanged,
  server untouched.

Ruling 1 (package identity) was verified by you at the previous head
and the same process was followed here. Ruling 7: the destructive
pre-image handling and the metadata journal structure are unchanged
apart from the ruling-6 result binding.

Evidence, fresh at `3f6cd45`: C18 50/50; C17 37/37; C16 49/49;
C15 35/35; regressions 171/171 (+artifact-scope recovery 25/25).

Requested ruling: acceptance of increment 4 and authorization for
increment 5.
