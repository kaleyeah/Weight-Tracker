# M8 sync rework — round 4: design v4

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

## Since round 3

No Owner input was needed, per your verdict. `DESIGN.md` is v4; your
C1–C12 are answered inline:

- C1: the logout decision artifact is committed at
  `decisions/DECISION-2026-08-02-M8-logout.md` and recorded in
  `compound-app/reports/PROJECT_LOG.md` (M8 rounds 2–3 entry).
- C3: `canon` removed from the dirty envelope.
- C4: "seal" demoted to a per-value integrity `mark`; cross-key
  consistency now belongs to an explicit transition journal
  (`wl_training_journal__<uid>`), with the design stating plainly that
  setItem is atomic per value and nothing else is claimed.
- C5: all five adoption/acknowledgement transitions specified with
  ordering, journal contents, and crash recovery at each phase — recovery
  lands only in dirty/conflict, never clean, and mismatched local/base is
  never treated as clean.
- C6: ack-after-storage-failure recovers by fetch-and-compare against the
  journaled pushed copy (three arms specified); the stale CAS retry is
  gone.
- C7: base-persisted/dirty-clear-failed retries locally after comparing
  local with base; no server traffic, no extra revision.
- C8: quarantine is copy → read-back verify → delete; a failed copy
  leaves the original and blocks sync.
- C9: canonical validation inspects the original value recursively before
  any serialization.
- C10: tag cleanup is bound to the `auto:true` provenance marker;
  `migrateOrphanLiftTags()` is included and its missing `auto` check is
  corrected in the same change.
- C12: quota tests run under realistic combined occupancy, seeded to size.

## This round

Rule on design v4 as the implementation contract. If it passes,
implementation begins exactly as §9 specifies — on `engineering/m8` for
tests, uncommitted on top of `bc4d5ff` for the app, records preserved, no
server record touched, disposable-PB as its own later round.
