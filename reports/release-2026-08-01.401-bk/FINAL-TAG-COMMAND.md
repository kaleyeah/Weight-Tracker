# Final tag procedure — reviewed artifact, not yet executed

Closes standing ruling 2's lineage marker for the retired Commit 10 branch.
Ref-only mutation in the ENGINEERING repository; adds no commit, changes no
file, and does not touch the deployed repository or GitHub Pages.

## Preconditions (capture output before execution)

    cd /home/griffin/projects/Weight-Tracker
    git for-each-ref refs/heads refs/remotes --format='%(refname) %(objectname)'   # BEFORE snapshot
    git status --porcelain                                                          # BEFORE snapshot
    git rev-parse integration/commit10-lineage-a
    # MUST print e379783259cf9fecbd5d24b4374bf1f94f034ce0 — abort if not

## The command

    git tag -a retired/commit10-lineage-a e379783259cf9fecbd5d24b4374bf1f94f034ce0 -m "Retired Commit 10 lineage (CAS client, Lineage B). Final build 2026-07-30.353-pb-c10; index.html sha256 f8cd835252db9c55e4e4c8fd02970dd66deab94826540ac7fe5c78c2ae737556. Published only as the /canary/ review artifact; never promoted to the production root. Retired by Architect standing ruling 2; head preserved, no further commits. See compound-app reports/PROJECT_LOG.md."
    git push origin refs/tags/retired/commit10-lineage-a:refs/tags/retired/commit10-lineage-a

The explicit tag-to-tag refspec makes the tag-only mutation explicit — nothing
else can ride the push.

## Postconditions (verify and record raw output)

1. `git rev-parse integration/commit10-lineage-a`
   == `e379783259cf9fecbd5d24b4374bf1f94f034ce0`
2. `git cat-file -t retired/commit10-lineage-a` == `tag` (annotated object exists)
3. `git rev-parse 'retired/commit10-lineage-a^{commit}'`
   == `e379783259cf9fecbd5d24b4374bf1f94f034ce0`
4. `git ls-remote origin 'refs/tags/retired/commit10-lineage-a*'` shows BOTH rows:
   the tag object (`refs/tags/retired/commit10-lineage-a`) and the dereferenced
   commit (`refs/tags/retired/commit10-lineage-a^{}`) — the `^{}` row MUST be
   `e379783259cf9fecbd5d24b4374bf1f94f034ce0`. (`ls-remote` on the bare ref
   returns the tag-object hash, not the commit, so the dereference row is the
   check that matters.)
5. `git for-each-ref refs/heads refs/remotes --format='%(refname) %(objectname)'`
   AFTER == BEFORE, byte-identical (no branch ref moved).
6. `git status --porcelain` AFTER == BEFORE (no file created or changed).

## After success

Record the tag name and its resolved commit in `PROJECT_LOG.md` and
`MAESTRO_PROGRAM_CONTEXT.md` — retirement documented as fact, not intention.
