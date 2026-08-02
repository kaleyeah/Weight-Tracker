# M10 server package — rollback procedure (operator runbook)

Contract: design v9 §7 (approved round 9). LOCAL DISPOSABLE scope only —
nothing here is authorized against the NAS until the Owner authorizes the
enforcement-OFF deployment (§9 step 4).

## Sequenced rollback (server), in this order — never reordered
1. Redeploy the hook package with enforcement OFF (it ships OFF; if an
   enforcement-ON redeploy ever happened, this step is the revert of that
   exact redeploy). A 404/absent lease route never unlocks a client: missing
   == unreachable == fail closed.
2. Verify BOTH devices work against the enforcement-OFF server.
3. Only then, optionally, revert code: remove cf_m10_*.js hooks and restore
   the pre-M10 cf_cas.pb.js (CAS-DIFF.patch in reverse).
4. Only after the sequenced CLIENT rollback (an M10 client is fully
   functional against an enforcement-OFF server; a `.415-m8` client requires
   enforcement OFF — release-package rule), and only per this runbook:
   the down-migration.

## The down-migration gate (mechanical + procedural, stated honestly)
- Mechanical: `pocketbase migrate down 1` REFUSES unless the environment
  variable `M10_DOWN_CONFIRM=yes` is set for that invocation, and refuses if
  the deployed cf_m10_shared.js reads `FENCING_ENFORCED_DEFAULT = true`.
  A refused down leaves schema and data byte-identical (tested, T9).
- Procedural (NOT code-enforced — operator gate): no M10 client may still be
  deployed when down runs. That precondition lives here, not in code.
- Down removes ONLY the seven M10 ledger columns and the writer_lease
  collection; every pre-existing CAS ledger row, field, and
  idx_cf_commit_key survive (tested, T9).
- CAUTION (test-proven behavior): `pocketbase serve` AUTO-APPLIES pending JS
  migrations at boot. After a deliberate down, remove or quarantine the M10
  migration file before restarting the server, or the migration re-applies.
- CAUTION: `pocketbase migrate` exits 0 even when a revert fails — check the
  output for `Reverted ...` vs `failed to revert`, never the exit code.
