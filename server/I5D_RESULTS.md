# I5d — cross-user idempotency-key independence: PRODUCTION RESULTS

Run 2026-07-30 against `https://rack.tail6fa16c.ts.net` (Tailnet-only), with
Product Owner authorization for two disposable production accounts (given
2026-07-30) and per the Architect's requirement that I5d not be assumed from
staging. **11 passed, 0 failed.** Production left byte-identical to its
baseline.

## What was proven

An idempotency key is scoped per **(user, subsystem)**, on the production
instance with HOTFIX-001 live:

| Check | Result |
| --- | --- |
| I5d-1 user A commits key K (multi-key payload) | live commit, A's rev +1 |
| I5d-2 user B, SAME key, byte-identical payload | **live commit, not a replay** |
| I5d-3 B received B's revision, not A's result | pass |
| I5d-4 B's replay returns B's own original result | pass |
| I5d-5 A's replay untouched by B's use of the key | pass |
| I5d-6 B reusing its key with a different request | 409 "reused" |
| I5d-7/8 exactly one ledger row for K per user | pass |
| I5d-9/10 each revision advanced exactly once | pass |

The payload deliberately has multiple keys — the HOTFIX-001 lesson that a
single-key object cannot detect an unstable serialisation.

## Ritual compliance

- **Backup first**: `cf_pre_i5d_20260730.zip`, 32,432,927 bytes, created via
  `POST /api/backups`, listed on NAS, downloaded off-NAS to `~/cf-cutover/`
  (size match, `unzip -t` clean, `data.db` present).
  SHA-256 `e104ff92631994659b6417b15f1c2d03bbe68d52f895d3fb5f5578142cb3f055`.
- **Accounts**: the two hard-coded disposable addresses only —
  `cf_test_prod@staging.invalid`, `cf_test_prod2@staging.invalid`
  (`probe-account.sh` now takes `PROBE_SLOT=1|2`; still a closed whitelist,
  slot 3 is refused). Created for the length of the gate, torn down
  immediately after with **verified absence**: user, appdata and ledger rows
  all confirmed gone, both slots.
- **Attribution**: before teardown, every `cf_commit_log` row (2) belonged to
  the two probe accounts. After teardown the ledger is **0 rows**, as at
  baseline.
- **Athletes untouched**: both real athlete rows identical before and after —
  `huhguz7atzdq546` coreRev=64 trainingRev=10 updated=2026-07-30 00:47:44.393Z,
  `asxx3sejhxjycgo` coreRev=0 trainingRev=0 updated=2026-07-21 20:39:25.681Z.
  No live-use confound this time; the timestamps did not move.
- **Rehearsed first**: the whole flow (both probe slots, the verifier, the
  teardown) ran against a disposable local PocketBase with the real CAS kit
  before production, including a **negative control** — pointed at the same
  account twice, the verifier fails I5d-0 and I5d-2 — and a refusal test for
  non-`cf_test_*` addresses.
- Credentials: superuser password read from `~/.cf-admin-pass`, probe
  passwords generated into gitignored mode-600 files; nothing in process
  arguments.

## Status

This closes the one check `hotfix-verify.py` recorded as NOTRUN. Combined
with the earlier production I1–I5c, I6–I8 (28 passed), the idempotency
verification is now complete: **39 production assertions total, 0 failures,
nothing assumed.**
