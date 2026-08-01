# Rollback procedure — release 2026-08-01.401-bk

**Status: PROPOSED, not executed.** Written per Architect round-16 rulings 7–10.

## What the earlier evidence did and did not show

The verified round trip (candidate → base bytes → candidate, sha256-matched both
ways) is a **verified local artifact round-trip**: it proves the preserved base
artifact is byte-identical to `e5f38c3:index.html` and can replace the
candidate locally. It does **not** demonstrate the repository-to-GitHub-Pages
rollback path. That path is specified below and remains unexecuted.

## Authoritative recoverable source

The **base commit `e5f38c3`** in this repository is the authoritative source.
The file `index.html.BASE-e5f38c3` in this directory is a convenience copy of
those exact bytes (sha256 `4407050ed9a41d3235b6144e4a76e1c190af986315574b34af3a5ba98a004771`); if the two ever disagree, the commit wins.

## The rollback-commit procedure (post-deployment)

A plain `git checkout e5f38c3 -- index.html` restores the file in the working
tree but publishes nothing — there is no commit to push. And a naive
commit-and-push can do damage of its own: it can carry unrelated local commits
out with it, or check the old file out of a later `main` and silently revert
post-release work. So the procedure begins with release-state gates, every one
of which must pass before `index.html` is touched:

    cd ~/projects/compound-app
    # ---- PRECONDITION GATES (abort on any failure) ----
    git status --porcelain                       # MUST be empty (clean tree)
    git fetch origin                             # MUST succeed
    git rev-parse HEAD                           # MUST equal the release commit (see below)
    git rev-parse origin/main                    # MUST equal the same release commit
    git rev-parse 'v2026-08-01.401-bk^{commit}'  # MUST equal the same release commit
    git log origin/main..HEAD --oneline          # MUST be empty (nothing unpushed)
    # ---- THE ROLLBACK ----
    git checkout e5f38c3 -- index.html
    sha256sum index.html                         # MUST print 4407050ed9a41d3235b6144e4a76e1c190af986315574b34af3a5ba98a004771 — abort if not
    git commit -m "ROLLBACK to e5f38c3 (build 2026-07-30.400-pb)" index.html
    git push origin main                         # publishes exactly this one commit

**Release identity is TAG-BASED, permanently.** This document cannot contain
the candidate commit's own hash: it is committed as part of that commit's
ancestry, and embedding the hash would be circular (inserting it afterwards
dirties the tree or forces another commit, moving HEAD off the identity the
gates require). The predicates above are therefore expressed against the
annotated tag `v2026-08-01.401-bk`, which MUST point to the candidate commit
(the one that changes `index.html`), not the records-only commit. The resulting
identities are embodied by the commits and the annotated tag themselves — the
reproducible evidence; raw postcondition output is reviewed through the
exchange and regenerated read-only at the M6 gate. Nothing is written inside
the committed content or either worktree.

**Expected resulting tree:** identical to `e5f38c3` for `index.html`;
`reports/` (these records) remains — rollback reverts the app, not the record
of what happened.

**Deployment trigger:** push to `main`. There is no workflow file in the tree,
so the Pages source is repository-settings configuration that read-only
inspection cannot see — a **production assumption**, but one with direct
empirical support gathered read-only on 2026-08-01: the live URL served
byte-for-byte the bytes of the last commit pushed to `main`
(`curl -fsSL https://kaleyeah.github.io/Weight-Tracker/index.html?cb=<ts>`
hashed to 4407050ed9a41d3235b6144e4a76e1c190af986315574b34af3a5ba98a004771,
exactly `e5f38c3:index.html`). This baseline is re-confirmed at the **M6
pre-publication gate** (not at commit time — local commits do not affect the
live site). Allow Pages' propagation delay (minutes).

**Verification step (required):** the request must FAIL loudly rather than hash
an error page — `-f` (fail on HTTP error), `-L` (follow redirects), explicit
cache-buster, and the exit code checked before the hash is trusted:

    curl -fsSL "https://kaleyeah.github.io/Weight-Tracker/index.html?cb=$(date +%s)" -o /tmp/served.html
    # curl exit code MUST be 0 (HTTP success condition)
    sha256sum /tmp/served.html
    # MUST print 4407050ed9a41d3235b6144e4a76e1c190af986315574b34af3a5ba98a004771  (byte condition)

Repeat until it matches or the abort window (30 min) elapses.

**Abort conditions — stop and reassess rather than pushing further commits:**
- the local sha256 does not match `4407050ed9a41d3235b6144e4a76e1c190af986315574b34af3a5ba98a004771` after checkout;
- the push is rejected (diverged remote — investigate before force-anything);
- the served hash still differs after 30 minutes (Pages backlog or CDN cache —
  do not stack additional rollback commits on top).

## When rollback is NOT safe (Owner must accept this residual risk)

The base build enforces none of the new protections and does not know the new
keys exist. **Never roll back a device that is showing a gate, is in ownership
ambiguity, or has an unresolved logout journal** — the base build would resume
syncing and could destroy the very data the gate is protecting. Those states
require the separately reviewed recovery procedure instead, which means
**emergency rollback may be unavailable at exactly the moment something is
wrong on the device**. This limitation is a standing item in the Owner review.

Server-side nothing changes in either direction: no schema, no lockdown, no
migration. Rollback is a client-file operation only.
