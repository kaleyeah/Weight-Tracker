# Release-package manifest — 2026-08-01.401-bk

**Living working-tree copy.** The record rows below track the evolving
current-state records. The immutable ACCEPTED release-package manifest is the
version inside tag `v2026-08-01.401-bk`; that tagged version remains the
authority for the released artifacts.

Location: reports/release-2026-08-01.401-bk/ in ~/projects/compound-app. The
immutable ACCEPTED manifest is the version inside tag `v2026-08-01.401-bk`
(published at M6); this working-tree copy is the LIVING manifest, updated by
later local records commits.

| file | sha256 |
|---|---|
| index.html (candidate, repo root) | 7d865ff8388dad5bc73f7a518bbc981676ca3caeb0723188c304043a029d5743 |
| index.html.BASE-e5f38c3 | 4407050ed9a41d3235b6144e4a76e1c190af986315574b34af3a5ba98a004771 |
| index.html.diff | fd0b46ac9b2be54c039d4f852fec1260551d16dfec50de69adf59e2913ea755b |
| ROLLBACK-PROCEDURE.md | a6c4fea52f8bb49291528e71473e4ab96ebfabc3a7aea2d844ad1831906242f1 |
| OWNER-REVIEW-DECISIONS.md | 5cd881ef986ba3f02b71993dc655ad8e0fd600e78ffd805b093154c177706660 |
| SERVED-BASELINE-EVIDENCE.md | 17331cd58b0ddd0b63240450f178d60f059359b3624c9f39036021f384610f24 |
| FINAL-TAG-COMMAND.md | 9e58280bd22088502feba91ecde527d1b3a9df3844d5e51ae766c5734587e397 |
| TAG-EXECUTION-EVIDENCE.md | 5af9b4f18bde72291a7cdfa07e0accf578ab29f6ed1ad1e00730cf8d4e056acc |
| M5-COMMANDS.md | ad0200045707da059699a5db73141352ae738555d78ade20f9e16d640957b205 |
| ../PROJECT_LOG.md | b190a219c23804a0c66e17b3f1aed48d159b5af47e92262fd9e7d265f74da280 |
| ../MAESTRO_PROGRAM_CONTEXT.md | b9ffcc37f5b0e36916b5a2874a09f789d7bed8ffcdbb6978dab98e527c476a87 |

Commit 10 retirement marker: tag retired/commit10-lineage-a, verified
remotely, dereferencing to e379783259cf9fecbd5d24b4374bf1f94f034ce0.
Execution evidence: TAG-EXECUTION-EVIDENCE.md (hashed above).

Release identity is tag-based (v2026-08-01.401-bk on the candidate
commit). M5 writes no evidence file into any worktree: the commits and
tag are the reproducible identity evidence; raw postcondition output
returns through the exchange and is rerun read-only before M6. M5 is
local-only; push is forbidden by design.

SELF-REFERENCE: only MANIFEST.md is excluded from the M5 staged-hash
check (it cannot contain its own hash). Every other staged file,
including M5-COMMANDS.md, is verified against this manifest via the
exact staged-path-to-label mapping in M5-COMMANDS.md.

The served-baseline statement is backed by the raw gate output in
SERVED-BASELINE-EVIDENCE.md (hashed above), not asserted here; it is
re-confirmed at the M6 pre-publication gate, not at commit time.
