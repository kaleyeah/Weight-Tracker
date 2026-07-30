# The status model

## The problem it replaces

`syncState` was one shared object, `{s, msg}`, written by at least five
unrelated systems: CAS pending, CAS network failure, authentication, photo
reconciliation, and the legacy manual upload paths. The last writer won, and no
reader could tell what the current message was *about*.

Two failures followed directly from that:

- **FIX-004**: a successful CAS commit acked its revisions but never cleared the
  legacy "changes aren't uploaded yet" marker, so a completed upload showed red.
- The naive fix — clear the shared state on CAS convergence — would have erased
  an unrelated live warning, which is exactly what the Architect refused.

## The model

Every status *cause* has a **source** that owns it:

| Source | Severity | Meaning |
| --- | --- | --- |
| `auth` | red | the athlete must sign in to sync |
| `cas-network` | red | the server could not be reached for a commit |
| `cas-pending` | red | local work exists that is not uploaded |
| `photo-reconcile` | amber | photo enumeration incomplete; nothing removed |
| `legacy-manual` | red | a manual upload/restore path failed |

Rules, all enforced by tests:

1. A source may set and clear **only its own** entry. Ownership is structural —
   it is never inferred by matching message text, which would break the moment
   wording changed or was translated.
2. The athlete sees a **projection**: the highest-priority live cause, at that
   cause's severity. The dot is red only when a red-severity cause is live.
3. Clearing a source **reveals the next** live cause. It never forces a global
   "everything is fine".
4. Transient progress (`saving`, `syncing`) is not a cause and is left alone —
   it clears itself.

## Convergence — two paths, one rule

`cas-pending` may be cleared only by proof, and the same function serves both
the commit path and the bootstrap/pull path:

- no operation in flight for either subsystem;
- no block (auth, failed, recovery) on either;
- no undecided conflict on either;
- neither subsystem locally dirty;
- where an agreed baseline exists, the local canonical form **equals** it.

A subsystem that has never been committed and is not dirty has nothing
outstanding, so it does not block convergence — otherwise an athlete who has
only ever edited one subsystem would carry a permanent red.

Convergence performs **no network request** and mutates **no snapshot**
(STATUS-H-15). A completed pull on its own proves nothing and clears nothing
(STATUS-H-12/13/14).

## Photo reconciliation

"Incomplete enumeration" means the app could not list all photo metadata and
therefore **refused to infer any deletion**. Core and training sync may be
perfectly healthy. It is presented as its own amber warning — "Photo sync
couldn't be fully checked. Nothing was removed." — never as the red
core/training upload failure, and it survives a successful commit. A later
complete enumeration clears it; a complete enumeration that finds zero photos
raises nothing.

## Has the Product Owner's actual red status been reproduced?

**No — and the package does not claim it.** What this candidate does is close
every source that could have produced it:

- a stale `cas-pending` with no commit in the session now converges on proof
  (STATUS-H-11), which is the shape his device was in;
- a stale `cas-pending` after a successful commit clears (STATUS-H-02/06);
- the photo warning can no longer masquerade as an upload failure
  (PHOTO-STATUS-03);
- and `cfDiag()` means the next occurrence is diagnosed from recorded state
  rather than inference.

The honest position is that the cause is *closed off*, not *identified*. If the
red status appears again on the next canary attempt, `cfDiag()` output will
name the owning source, and that is the evidence this round lacked.
