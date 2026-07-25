# Server Notes — Threat Model, Field Mapping, Policies

**Last Updated:** 2026-07-25 · Companion to `DEPLOYMENT.md` (required by the Product Architect server-kit addendum, items 6–9, 11–12).

## 1. pbSave field mapping (addendum deliverable 7)

| Field | Path | Revision impact | After lockdown |
| --- | --- | --- | --- |
| `data` | **core CAS** — `/api/cf/appdata/commit` only | `coreRev` (route) | raw PATCH **blocked** by field-conditional rule |
| `training` | **training CAS** — commit route only | `trainingRev` (route) | raw PATCH **blocked** |
| `health` | independent operational write (Apple Health inbox clear) | none — outside CAS by design | **still allowed**: update rule permits bodies without snapshot/revision fields |
| `coachreq` | independent operational write (Coach Max recap request) | none | **still allowed** |
| `coreRev` / `trainingRev` | server-managed | — | client-set attempts → 400 (hook) and rule-blocked |
| any other field | no longer supported from clients | — | blocked |

The lockdown `updateRule` (DEPLOYMENT step 7):
```
user = @request.auth.id
&& @request.body.data:isset = false
&& @request.body.training:isset = false
&& @request.body.coreRev:isset = false
&& @request.body.trainingRev:isset = false
```
`createRule: null` — only the commit route creates rows (at `expectedRev 0`).

## 2. Threat model (deliverable 6)

- **Stale cached clients.** A PWA can serve an old build indefinitely. Until lockdown, its raw snapshot writes pass through the bridge, which bumps the matching revision and audit-logs — CAS clients *detect* every legacy write even though old clients can still overwrite each other. After the 24–48 h deadline (Product Owner approves the exact time), the rule blocks snapshot writes; old clients fail closed with their local data intact, and builds below `CF_MIN_CLIENT_BUILD` get an explicit `426 update-required` from the route rather than a generic error.
- **Duplicate rows.** Two devices creating first rows concurrently: the unique index arbitrates inside the transaction; the loser is retried through the existing-row path **only** when evidence matches a create race (first commit + row now exists) — any other failure is a 500, never a fake 409. The migration refuses to run while historical duplicates exist.
- **Idempotency misuse.** Ledger unique on `(user, subsystem, key)`, written in the same transaction as the data. Replay of the same key+request returns the original result; same key with a different request is rejected; a concurrent same-key race resolves to one live commit and one replay. Keys are required and length-capped. The ledger stores hashes only — never payloads — `deviceId` is stored as a 16-char SHA-256 prefix, retention is 30 days with a daily prune job, and all API rules are locked (superusers only).
- **Copied staging data.** Integration tests run only against disposable `cf_test_*` users; the script hard-refuses production hostnames, non-disposable emails, and runs without `STAGING_CONFIRM=YES`. A production copy may be used solely to verify the migration, isolated to the Tailnet, never targeted by destructive tests, and deleted after verification. Staging backups follow the same handling as production backups; no external integrations run against staging.
- **Raw-route bypass.** Pre-lockdown: bridge keeps revisions truthful. Post-lockdown: field-conditional rules make snapshot fields route-only while operational fields keep working; the create hook pins `user` to the authenticated identity so a raw create cannot forge another owner; revision fields are never client-settable. Superusers bypass rules by design — admin tooling must use the commit route, documented as an operational caveat.

## 3. Old-client cutover & minimum build (addendum #11)

1. Deploy migration + hook (bridge active). 2. Deploy the CAS client (Commit 10).
3. Watch `CF legacy raw snapshot write` log lines — that is the old-client traffic signal (works even for clients that send no build metadata, because the *hook* logs, not the client).
4. At the deadline the Product Owner approves: apply the lockdown rules, set `CF_MIN_CLIENT_BUILD` in the hook, restart.
5. Old clients now: snapshot writes rule-blocked (fail closed, local data preserved); route commits from older builds get `426 update-required`; the CAS client surfaces "Update required — reload the app" (self-update then picks up the new build). No silent stranding.
6. Confirm zero legacy-write log lines over a full day before removing the bridge hooks.

## 4. Commit 1b blocker status (deliverable 8)

All 16 Commit 1b required changes are implemented client-side in **Commit 1c** (build `2026-07-25.334-pb-c1c`, 158 tests incl. 42 executable integration tests) — under separate Product Architect review (`cf-commit1c-review.zip`). Nothing in this server kit claims or implies Commit 1b/1c approval; the client CAS wiring (Commit 10) is written only after this kit passes on staging **and** the client review returns READY-FOR-STAGING.
