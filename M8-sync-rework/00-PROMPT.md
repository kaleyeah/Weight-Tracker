# M8 sync rework — round 23: the corrected release package

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

## Your round-22 items, as landed (verify in the tree)

1. **The decision draft no longer claims completed prerequisites.** All
   three (fresh Owner export, same-day DSM snapshot, nightly-backup
   confirmation) are stated as PENDING, to be completed and verified at
   decision time, with the publish flow stopping if any cannot be
   verified.
2. **The recovery derivation is deterministic and executed**:
   `recovery/derive-recovery.mjs` + the standalone
   `recovery/recovery-block.js` (sha256 `34a3b92b…7431cfc9`). Run
   against the final candidate it prints input `5bda0da5…1ba35ee3` →
   output `b87120fa…a49fb95f`, byte-equal to the packaged artifact.
3. **The candidate is finally stamped and frozen**: build
   `2026-08-02.415-m8`, sha256 `5bda0da5…1ba35ee3` — the exact bytes
   for the Owner's approval. `STAMP-ONLY-DIFF.txt` proves the 4-line
   diff from the gate-era `b8f252b3…de24b` is the one APP_BUILD string
   literal. ALL client gates re-run against the final bytes: 129 cases
   green (outputs regenerated in artifacts/evidence/), recovery
   re-derived and its 25 cases re-run. Real-PB gate applicability: the
   byte difference is the unreachable build-string literal, and the
   deterministic derivation from the FINAL bytes reproduces the
   gate-era recovery artifact byte-identically — the sync logic the
   gate exercised is bit-for-bit present.
4. **The rollback procedure defaults to roll-forward.** Unobservable
   eligibility (the iPhone Home Screen app has no tested read-only scan
   path) is treated as failed; rollback to `.414` is permitted only in
   the narrow, records-evidenced case that no device ever opened the M8
   build, plus an OBSERVED scan where a desktop inspector exists.
5. `verifiedAgainstLiveURL:false` everywhere; nothing tagged, pushed,
   published, locked down, or mutated.

## This round

Rule on the corrected package. If it passes, state that the Owner
publication decision sequence may begin (prerequisites verification →
decision instrument → and only on his authorization: records commit,
release commit, tag, push, served-byte verification, device checklist).
