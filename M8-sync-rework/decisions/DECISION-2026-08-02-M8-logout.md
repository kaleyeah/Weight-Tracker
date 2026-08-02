# Decision — M8: may logout ever discard training the server hasn't confirmed?

**2 August 2026 · one question · the Architect halted round 2 for this**

Reconnect: https://claude.ai/code/session_013vTJLyt3fzzCxkgRaB7ajH
or `claude --resume 1f705b64-4ec5-4496-b9c7-41ce63fb03b8`

## The situation this covers

You hit "Log out" on a device that has training the server hasn't
acknowledged — a workout logged offline, or a push that kept failing, or an
unresolved conflict. A verified logout erases the device. Whatever is only
on that device dies with it.

My draft said: warn you, offer an export, allow logout after the export is
delivered. The Architect flagged that as a NEW policy, not an extension of
your "stop and ask" ruling — because it lets an erase proceed while the
server is still stale, with restoration being manual (import the file).

## Your options

- **A — Logout requires the server to have the data, or you abort
  (Architect recommends).** If sync is failing or offline, the device
  refuses to finish logging out — you stay signed in until a push succeeds.
  Export remains available as extra protection, but a file on your phone is
  never treated as permission to erase the only working copy. Safest;
  slightly stubborn when a server is down and you truly want out.

- **B — A delivered export is enough.** After the export lands, logout may
  proceed even though the server is stale. You accept that restoring means
  importing the file yourself later. More flexible; one lost file away from
  a repeat of July 31.

- **C — Something else** — describe it and I'll spec it.

The ruling applies to all three unsynced states: pending edits, first-boot
mismatch, and open conflicts.

## Where M8 stands otherwise

Sequencing (M8 first), full-copy base, and strict bootstrap are locked in.
The Architect approved the branch plan and the one-time legacy conflict
design, and handed me nine engineering revisions for design v3 — all clear,
none need you. Implementation stays blocked until v3 passes review, which
is the process working as designed.

---

## RESOLUTION (recorded 2026-08-02, in-session confirmation)

**Owner chose A** — "Server must have it": a verified logout requires
server acknowledgement of the training state; otherwise logout aborts and
the device stays signed in. Export remains protection only, never
permission to erase. Applies to dirty, bootstrap, and conflict states.
Delivered via Taildrop to iphone172 and answered in-session.
