# Mandatory current-state records — repository-history evidence
(round-19 ruling 6)

The two mandatory records exist and are current — on the repository's
`main` branch (the deployed lineage, checked out at
`~/projects/compound-app`). They are ABSENT from `engineering/m8`
because that branch has NEVER carried them — nothing was renamed,
moved, or removed. History, from this repository:

    $ git log --oneline engineering/m8 -- reports/ | wc -l
    0
    (zero commits in engineering/m8's entire history touch reports/)

    $ git log --oneline main -- reports/PROJECT_LOG.md | wc -l
    32
    (32 commits maintain it on main; latest:
     96c13ad "Record the .417 release entry (chronology)"
     3823d83 "Record the .417 release (and correct the mislabeled
              prior records commit)")

    $ git merge-base main engineering/m8
    e29ccc04…
    (the branches diverged long before reports/ was created on main)

No lineage was retired and no product judgment is involved — this is
the documented two-checkout layout (recorded in the round-14 bundle
and accepted by round-14 ruling 6's "corrected records-path
explanation"). If the Architect prefers the records mirrored or merged
into `engineering/m8`, rule so explicitly and it will be a merge from
`main`, not a recreation.
