# M5 — proposed LOCAL-ONLY commands (for review; not executed; push forbidden)

Executed only after the Owner's exact-diff approval (decision 1). Fetching is
permitted; **no `git push` of `main` or of the release tag appears anywhere** —
pushing is M6's production publication under its own Owner authorization.

M5 writes **no evidence file into any worktree**. The two commits and the
annotated tag ARE the identity evidence — reproducible by anyone with the
repository. Raw postcondition output returns through the exchange for review,
and the same read-only identity checks are rerun immediately before M6.

## Gates (abort on ANY failure; capture all output)

    cd /home/griffin/projects/compound-app
    git fetch origin                                        # MUST succeed
    git rev-parse HEAD                                      # MUST = e5f38c314613f65ebcb368e37216c03a7930cac5
    git rev-parse origin/main                               # MUST = the same (fresh, post-fetch)
    git rev-parse -q --verify refs/tags/v2026-08-01.401-bk  # MUST fail (tag absent locally)
    git ls-remote origin refs/tags/v2026-08-01.401-bk       # MUST return nothing (absent remotely)
    sha256sum index.html                                    # MUST = 7d865ff8388dad5bc73f7a518bbc981676ca3caeb0723188c304043a029d5743
    find reports -type f | sort                             # MUST equal EXACTLY this 11-path list:
      # reports/MAESTRO_PROGRAM_CONTEXT.md
      # reports/PROJECT_LOG.md
      # reports/release-2026-08-01.401-bk/FINAL-TAG-COMMAND.md
      # reports/release-2026-08-01.401-bk/index.html.BASE-e5f38c3
      # reports/release-2026-08-01.401-bk/index.html.diff
      # reports/release-2026-08-01.401-bk/M5-COMMANDS.md
      # reports/release-2026-08-01.401-bk/MANIFEST.md
      # reports/release-2026-08-01.401-bk/OWNER-REVIEW-DECISIONS.md
      # reports/release-2026-08-01.401-bk/ROLLBACK-PROCEDURE.md
      # reports/release-2026-08-01.401-bk/SERVED-BASELINE-EVIDENCE.md
      # reports/release-2026-08-01.401-bk/TAG-EXECUTION-EVIDENCE.md
    git status --porcelain                                  # MUST list ONLY: " M index.html" and "?? reports/"

(The served-baseline recheck deliberately does NOT run here — local commits do
not affect the live site. It runs at the M6 pre-publication gate, per the
rollback procedure.)

## Commit 1 — the records and release package

    git add reports/
    git diff --cached --name-only | sort    # MUST equal the same 11-path list, nothing else
    git diff --cached --name-only | grep -cx 'index.html'   # MUST print 0 (exact path; the two
                                                             # index.html.* report files legitimately stage)

    # Explicit per-file staged-hash verification against MANIFEST.md — abort on
    # any mismatch. All ten non-manifest staged files are checked;
    # ONLY MANIFEST.md itself is excluded (its self-reference is unavoidable:
    # it cannot contain its own hash).
    # Exact staged-path -> manifest-label mapping (the manifest labels the two
    # top-level records as ../NAME; release-dir files by basename):
    #   reports/PROJECT_LOG.md              -> ../PROJECT_LOG.md
    #   reports/MAESTRO_PROGRAM_CONTEXT.md  -> ../MAESTRO_PROGRAM_CONTEXT.md
    #   reports/release-2026-08-01.401-bk/* -> basename
    fail=0
    for f in $(git diff --cached --name-only | grep -v 'MANIFEST.md$'); do
      case "$f" in
        reports/PROJECT_LOG.md)             key='../PROJECT_LOG.md' ;;
        reports/MAESTRO_PROGRAM_CONTEXT.md) key='../MAESTRO_PROGRAM_CONTEXT.md' ;;
        reports/release-2026-08-01.401-bk/*) key=$(basename "$f") ;;
        *) echo "UNMAPPED STAGED PATH: $f"; fail=1; continue ;;
      esac
      rows=$(grep -cF "| $key |" reports/release-2026-08-01.401-bk/MANIFEST.md)
      [ "$rows" = 1 ] || { echo "MANIFEST ROWS != 1 for $key ($rows)"; fail=1; continue; }
      want=$(grep -F "| $key |" reports/release-2026-08-01.401-bk/MANIFEST.md | grep -oE '[0-9a-f]{64}')
      [ "$(printf '%s' "$want" | wc -c)" = 64 ] || { echo "EXPECTED HASH NOT SINGULAR for $key"; fail=1; continue; }
      got=$(git show :"$f" | sha256sum | cut -d' ' -f1)
      [ "$got" = "$want" ] || { echo "HASH MISMATCH: $f staged=$got manifest=$want"; fail=1; }
    done
    [ "$fail" = 0 ] || exit 1               # ABORT on any mismatch

    git commit -m "Release records and package for containment build 2026-08-01.401-bk"

## Commit 2 — the frozen candidate

    git add index.html
    git diff --cached --name-only           # MUST print EXACTLY: index.html
    git diff --cached -- index.html | sha256sum
      # MUST = fd0b46ac9b2be54c039d4f852fec1260551d16dfec50de69adf59e2913ea755b (the reviewed diff)
    git show :index.html | sha256sum
      # MUST = 7d865ff8388dad5bc73f7a518bbc981676ca3caeb0723188c304043a029d5743 (the reviewed candidate blob)
    git commit -m "Containment build 2026-08-01.401-bk: pre-sync recovery snapshot, ownership quarantine, gated boot, training-inclusive backup"

## The release identity

    git tag -a v2026-08-01.401-bk -m "Containment release 2026-08-01.401-bk. Candidate index.html sha256 7d865ff8388dad5bc73f7a518bbc981676ca3caeb0723188c304043a029d5743 on base e5f38c3. Passed Architect technical and release-package review; see reports/PROJECT_LOG.md and reports/MAESTRO_PROGRAM_CONTEXT.md."

## Postconditions (raw output returned through the exchange; rerun before M6)

    git rev-parse HEAD                              # the candidate commit
    git rev-parse 'v2026-08-01.401-bk^{commit}'     # MUST equal HEAD
    sha256sum index.html                            # MUST still = 7d865ff8…9d5743
    git show HEAD:index.html | sha256sum            # MUST = the same (the commit carries the reviewed bytes)
    git rev-list --count origin/main..HEAD          # MUST print exactly: 2
    git log origin/main..HEAD --format='%H %s'      # record both full hashes + subjects
    git status --porcelain                          # MUST be empty
    git ls-remote origin refs/tags/v2026-08-01.401-bk   # MUST still return nothing (nothing pushed)

## Abort conditions

Any gate or postcondition fails; any unexpected staged or unstaged path; any
staged-hash mismatch; the tag exists anywhere beforehand; the tag resolves to
the records commit instead of the candidate commit. On abort: report raw
output, change nothing further, await the Architect.
