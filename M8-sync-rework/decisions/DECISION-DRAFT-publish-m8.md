# DRAFT — publish the M8 sync rework (delivered only after packaging review)

**One question · the big one**

## What this is
The fix for the July 31 data loss, reviewed across 21 Architect rounds
and tested against your real server. Four plain rules: your phone never
forgets unsaved work; the server can never silently overwrite your
phone; every server conversation is crash-proof; you can't log out of a
phone holding the only copy.

## What you'll see
Once per device, a one-time "Training needs your review" card on first
open — export both copies, tap "Keep this device's copy," done. After
that: nothing new unless something actually goes wrong, in which case
the app pauses sync VISIBLY instead of guessing.

## What could go wrong, honestly
- If the new build itself misbehaves, going BACK to the old app is only
  safe while no device has written the new safety records; after that
  it's roll-forward to a locked "recovery build" (prepared, hashed, and
  tested in advance) while a fix is reviewed.
- Your export habit stays worthwhile during the first days.

## Prerequisites already in place before you say yes
Fresh export from your phone · same-day NAS snapshot · nightly PB
backup schedule confirmed.

## Options
- **A — Publish.** Push → byte-verify → your device checklist (6 steps,
  ~3 minutes) → accept or the rollback/roll-forward procedure runs.
- **B — Hold.**
