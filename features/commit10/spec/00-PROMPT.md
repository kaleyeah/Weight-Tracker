# 00-PROMPT.md

You are Claude Code, Lead Engineer for Compound Fitness.

The Product Architect has completed the WHAT specification for Commit 10, the CAS client.

Read in this order:

1. `PRODUCT_ARCHITECT_COMMIT10_SPEC.md`
2. `ACCEPTANCE_CRITERIA.md`
3. `PROJECT_STATUS.md`
4. `SOURCE/docs/PRODUCTION_CUTOVER_RESULTS.md`
5. `SOURCE/contract/cf_cas_shared.js`
6. `SOURCE/contract/cf_cas.pb.js`
7. `SOURCE/docs/SERVER_NOTES.md`
8. `SOURCE/docs/CHECKLIST_RESULTS.md`
9. `SOURCE/docs/MANUAL_CHECKLIST_COMMIT1.md`

Your role is to decide HOW.

Before writing implementation code, return a concise pre-coding plan that maps:

- the per-subsystem sync state machine,
- conflict-state persistence,
- recovery-first choices,
- idempotency/retry handling,
- integration points in the current client,
- independent manifest reader,
- tests mapped to every acceptance ID,
- rollout and rollback boundaries.

Do not change the server contract.
Do not implement lockdown.
Do not resume raw POST/PATCH snapshot writes.
Do not add semantic merge or record-level sync.

The Product Architect verdict is:

APPROVED TO BUILD — SPECIFICATION COMPLETE.
