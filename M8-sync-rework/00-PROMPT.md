# M8 sync rework — round 24: one identity, enforced derivation, final manifest

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

## Your round-23 items, as landed (verify in the tree)

1. **Section 9 is corrected to ONE identity end to end**: the frozen
   final candidate `5bda0da5…1ba35ee3` IS the committed index.html, IS
   the tag target's index.html, and IS the byte content the live URL
   must serve; any difference at any of the four points aborts the
   release. There is no post-freeze stamp — the candidate is already
   stamped.
2. **IDENTITIES.txt is the final manifest**: final candidate, gate-era
   candidate with its stamp-only relationship, the `.414` rollback base
   (committed + served-verified), the recovery artifact and block
   hashes with the enforced derivation, all final-byte gate totals
   (129 green + the two by-design baseline failures), the real-PB
   applicability statement, and `verifiedAgainstLiveURL: false`.
3. **The derivation tool is hash-enforcing**: it now REFUSES an
   unexpected candidate, block, or output hash. Re-executed against the
   final candidate: byte-equal output (`enforced:true` in the run
   record); the negative check against the `.414` bytes refuses with
   "candidate hash is not the frozen release identity".
4. The authoritative-records requirement is understood: the eventual
   records commit (part of the Owner-authorized release sequence only)
   carries the final identities, the 129-case result, the recovery
   derivation, the roll-forward rule, and `verifiedAgainstLiveURL:
   false` until observed.
5. Nothing is committed, tagged, pushed, published, locked down, or
   mutated.

## This round

Rule on the technical package. Per your round-23 close: if consistent,
the next verdict should page the Owner for prerequisite completion and
the publication decision.
