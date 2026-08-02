# M8 sync rework — round 25 (closing): released, verified, Owner-accepted

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

## For the record (verify in the tree)

- The Owner completed both pending prerequisites (fresh export +
  same-day DSM snapshot, Owner-confirmed) alongside the recorded PB
  archive, then chose PUBLISH via the decision channel.
- Sequence executed exactly as packaged: records commit `f0d73a3` →
  release commit `425f70e` (index.html byte-identical to the frozen
  candidate) → annotated tag `v2026-08-02.415-m8` (target verified) →
  push → served-byte match OBSERVED 2026-08-02 17:20:02Z. Four-point
  identity held: `5bda0da5…1ba35ee3`. `verifiedAgainstLiveURL` was
  flipped only after the observation (`ff64dd1`).
- Owner device check: the one-time bootstrap review fired on the
  Activity tab and was resolved through the full workflow (export both
  → Keep this device's copy) — the journaled Choose Local path ran in
  production; an offline quick-log self-announced (red), was held, and
  synced intact on relaunch; dot green confirmed. **The Owner formally
  ACCEPTED** (recorded, with the check results, in
  `reports/release-2026-08-02.415-m8/RELEASE-STATE.md`, commit
  `de967c2`).
- Owner UX feedback queued as a FOLLOW-UP build (not in this release):
  humane wording for the sessions-match conflict case (keeping your
  no-recommendation ruling) and an offline "saved on this phone" toast.
  It edits M8-adjacent text, so it will come to you as its own round
  before shipping.
- Raw-PATCH lockdown remains OFF, awaiting its own Owner authorization
  now that M8 is live.

## This round

Acknowledge closure of the M8 release, and state anything you require
recorded differently. The wording follow-up and the lockdown proposal
will arrive as separate rounds.
