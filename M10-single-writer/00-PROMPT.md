# M10 single-writer — round 26: increment 4, round-25 rulings landed

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

Increment 4 only. **Code head `5095ed6`**, index.html sha256
`0b226ead91aa18d442a969e86fcc5cf8259e69bfbb7d2cf431091415c385b86d`.
Artifacts regenerated from that head after it was committed; the
records head carrying them has a byte-identical `index.html` (the
manifest includes `index.html` itself as a checked path).

**Exact verification commands and their recorded outputs:**

    $ cd ~/projects/Weight-Tracker
    $ sha256sum -c M10-single-writer/client-increments/INCR4-MANIFEST.txt
    …/INCR4-DIFF.patch: OK
    …/INCR4-DIFF-FROM-47b4daa.patch: OK
    …/INCR4-C18-OUTPUT.txt: OK
    …/INCR4-C17-RERUN.txt: OK
    …/INCR4-C16-RERUN.txt: OK
    …/INCR4-C15-RERUN.txt: OK
    …/INCR4-M8-REGRESSION.txt: OK
    …/INCR4-README.md: OK
    index.html: OK
    (exit 0 — ruling 5: the manifest is pure sha256sum format with
     repo-root-relative paths; all commentary moved to the README)

    $ git diff --check b92d418 5095ed6 -- index.html
    (no output, exit 0 — ruling 6: the SOURCE range is clean)

On ruling 6, precisely: the whitespace previously reported is inside
the committed `.patch` artifacts and is the unified-diff format's own
blank CONTEXT line (a single space). It is not a whitespace error in
the source and cannot be removed without corrupting the patch; the
superseded narrow patch was deleted.

Rulings 1–4, as landed:
1. **Adoption identity is durable BEFORE the local write.** `adopt`
   gains a `fetched` phase: the fetched server blob's sha256 + byte
   length are recorded in a verified queue write before IndexedDB is
   touched. Recovery at `fetched` resumes only on an exact
   hash-and-length match, else `unverified`. Recovery at `intent`
   with an existing local record NEVER guesses — `unverified`
   (`adopt-local-exists`). Three tests cover matching, differing, and
   intent-with-existing.
2/7. **Metadata is a recoverable local/server state machine.** The
   queue owns both sides: the dispatcher applies the local metadata in
   its own verified `local-applied` phase and only then dispatches the
   transactional route (the lightbox no longer writes locally itself).
   Crash arms tested: interrupted at `local-applied` → reload
   completes the server side (the update is replayed); a failing local
   write parks the entry at `intent` with the server untouched. The
   UI-path test still proves the entry exists at the local-write
   instant with zero raw PATCHes.
3/4. **A complete pre-image is mandatory for destructive delete.**
   Apply requires a complete pre-displacement `(recordId, localId,
   file)` identity exactly matching the fresh post-confirmation
   identity. Displacement that cannot capture it (listing failure or
   missing `file`) records `unverified/identity-uncaptured`, and Apply
   refuses with an explicit message — tested end-to-end.

Evidence, fresh at `5095ed6`: C18 46/46; C17 37/37; C16 49/49;
C15 35/35; regressions 171/171 (+artifact-scope recovery 25/25).

Requested ruling: acceptance of increment 4 and authorization for
increment 5.
