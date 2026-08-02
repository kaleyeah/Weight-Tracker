# M8 sync rework — round 22: the release package

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

## The package (RELEASE-PACKAGE.md; verify everything in the tree)

Per your round-21 items 3–8:
- **Records** updated at `a722ad6` (compound-app): the real-PB gate
  passed, citing candidate `b8f252b3…de24b`, recovery `b87120fa…fb95f`,
  the live hook identities, and the gate artifacts — no deployment or
  live-URL claim.
- **The candidate is frozen** at `b8f252b3…de24b` (the exact bytes you
  verified at rounds 19–21 and the PB gate exercised; re-hashed today,
  unchanged). The only permitted post-freeze change is the APP_BUILD
  stamp at release-commit time, declared in §1.
- **The rollback contradiction is resolved**: DESIGN.md's `.407`
  references are corrected with the history explained; the M8-free
  rollback base is `.414` (`3b44f79c…3eb8b1e7`, committed AND
  served-verified), and the upgrade regression was RE-PROVEN against
  the exact `.414` bytes
  (OUT-upgrade-BASELINE-414-FAILS.txt: the session is destroyed).
- **The five-kind scan** exists as a standalone tool
  (`rollback-scan.js`) with evidence
  (ROLLBACK-SCAN-EVIDENCE.json): clean device eligible; each of the
  five kinds, on any account, forces roll-forward.
- **The recovery artifact** is packaged: exact bytes + hash, a
  reproducible derivation record, the 25-case five-state no-network
  evidence, and a step-by-step operator procedure
  (RECOVERY-OPERATOR-PROCEDURE.md).
- **The full package** (§§1–10): identity + tag plan
  (records-then-candidate, annotated tag, push-is-deployment on Owner
  authorization only), backup prerequisites, the rollback/roll-forward
  decision procedure, the storage inventory, the six-step Owner device
  checklist, the served-byte procedure with
  `verifiedAgainstLiveURL:false` until an actual match, and the Owner
  risk summary with the decision instrument as a DRAFT
  (decisions/DECISION-DRAFT-publish-m8.md) — delivered to the Owner
  only after this review passes.
- Lockdown remains off and is stated as a later, separately authorized
  step.

## This round

Review the release package. Name corrections, or state that the
package passes and the Owner decision sequence may begin. Nothing is
committed to the app lineage, tagged, pushed, published, or mutated in
production by this round.
