# M8 sync rework — round 9: implementation evidence

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

## What this round contains

The v7 contract is implemented. Everything is in the tree; verify there,
not here. `artifacts/evidence/IDENTITIES.txt` carries every hash.

- **The app diff** (`APP-DIFF-m8-over-414.txt`, 555 lines): the M8
  candidate as an uncommitted change over the published `.414`
  (`3b44f79c…`, live and byte-verified). Two delimited blocks: the
  core+transitions engine and the wiring/conflict-UI/logout-gate/§5b
  overrides. Candidate sha256 `0cdd7268…dafcf9fb`. Records commits
  preserved; nothing committed to the app lineage.
- **Seven browser evidence suites, 50 cases, all green on the candidate**
  (`tests/browser/c11m8-*.browser.test.js`, raw outputs in
  `artifacts/evidence/OUT-*.txt`):
  - `upgrade` (R3): the authentic old-client boot against a stale server.
    Baseline run DESTROYS the 2026-07-31 session (OUT-…-BASELINE-FAILS:
    1/4); candidate holds it on disk and in state as a conflict (4/4).
  - `matrix` (R4): all seven bootstrap cases; equal-content establishes
    via a probe-learned post-migration canon; every difference conflicts
    with local intact.
  - `replay` (E5/F7): seeded intent/net-done journals × scripted
    outcomes — lost-response replay ack, not-applied, fetch-proves-
    applied, intervening writer, key-reuse hard stop with journal
    preserved, repeated transport unresolved, expired-ledger fetch-only
    (commit calls asserted zero), net-done local completion.
  - `accounts` (B4/C8/B5): cross-account byte-isolation, copy-first
    quarantine, dirty-logout offers Push-now.
  - `quota` (B6/C12): ~5MB combined occupancy; save never throws, no
    half-written key, recovers to clean.
  - `tags` (§5b/C10): the migrateOrphanLiftTags auto-check fix is IN the
    candidate; hand-added tags survive; derivation refuses during an
    open conflict.
  - `recovery` (§7/B8/A12): the SYNC_SAFE artifact
    (`recovery/index-recovery-syncsafe.html`, sha256 `6a2a9fbe…df7bd0`)
    boots from clean/dirty/conflict with zero training CAS calls and
    every seeded key byte-untouched.
- **Known flip**: containment C13's "the boot sync DID overwrite the
  live copy (loss reproduced)" fails WITH M8 present — M8 prevents the
  overwrite that case documents. It becomes a conflict expectation at
  release; the published `.414` (M8-free) passes all containment suites.

## Wording discipline (R10)

All evidence is desktop Chromium against mocked endpoints: real-engine,
modeled-server. No device claim is made. The disposable-PocketBase round
(real route, field isolation incl. concurrent core mutation) remains its
own later gate, Owner-authorized but not yet scheduled.

## This round

Rule on the implementation as evidenced. Name what must change, or name
the remaining gates (disposable-PB round, release packaging) as next. No
commit, publication, or server-record mutation is requested.
