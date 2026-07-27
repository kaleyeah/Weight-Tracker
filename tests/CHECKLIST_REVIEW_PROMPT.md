# Client Staging Review Request — Phase 2, 75-case checklist (for ChatGPT / Product Architect)

**Last Updated:** 2026-07-27

**Status:** Active — Phase 2 complete with 0 failures; requesting production review of the server kit and a ruling on the unautomated set. Companion to `CHECKLIST_RESULTS.md`. Follows the `REVIEW_REQUEST.md` pattern.

> Copy the block below into ChatGPT and attach `cf-client-staging-phase2-20260727.zip`.

---

## Prompt

```text
You are the Product Architect for Compound Fitness. I'm the Product Owner.
Claude Code is the Lead Engineer. Per our workflow you decide WHAT gets built
and review WHAT was built; Claude decides HOW.

You approved the CAS server kit for staging and authorized Phase 2. Phase 2 is
done: the 75-case client checklist ran against build 2026-07-27.342-pb-c1h in a
real browser against the real staging server, with 0 failures. Read in this
order:

  1. CHECKLIST_RESULTS.md      — §1 required evidence header, §2 summary,
                                 §3 all 75 cases, §5 harness faults,
                                 §6 what is NOT proven, §8 what I need from you
  2. evidence/shots/           — 23 screenshots incl. the claim, mismatch,
                                 pending and logout screens
  3. evidence/checklist-final.json — machine-readable per-case record
  4. e2e/                      — the harness, if you want to audit the method
  5. STAGING_RESULTS.md        — Round 3 server evidence, for reference

Context so you evaluate rather than rediscover:

  - 39 cases verified pass, 1 PARTIAL (A6), 0 failures, 35 not automated.
    All 75 are accounted for with expected + actual recorded per case.
  - The central guarantee HOLDS. An ordinary edit produces ZERO POST/PATCH to
    appdata after every debounce elapses, while the device correctly shows
    pending (B1, B2, G1, G2, G3). This was measured by intercepting the wire,
    not inferred.
  - Data survives offline -> reconnect for every entry type the live defect
    concerned (A1-A4). Cross-account containment holds (D1, D2). The ownership
    gate correctly distinguishes UNKNOWN owner (claim screen, no export
    control) from PROVEN DIFFERENT owner (mismatch screen, switch/sign-out
    only, no export) — H2, D3, H4. Recovery fails closed with IndexedDB blocked
    (C1, C2). Export escapes hostile text and writes nothing (N5, N6).
  - A6 is PARTIAL, deliberately not counted as a pass. The local historical
    correction DOES survive a genuine server-side divergence, but no conflict
    is offered — the .342 client has no conflict-resolution UI, because that is
    Commit 10 (CAS client) work which SERVER_NOTES.md §4 sequences AFTER this
    kit passes. Nobody could verify "conflict offered" against .342 today.
  - The first run reported 4 failures. All four were faults in Claude's test
    harness, not the client: a call to a function that does not exist, an
    unanswered confirmation dialog, a pending-state precondition where the case
    specifies clean, a wrong owner stamp that actually exercised a different
    case, an empty server that made "agree" correct, and an onboarding screen
    that blocked the control under test. Each was re-run with a corrected setup.
    §5 records this instead of quietly reporting the better numbers.
  - Environment: Chromium 151 (Playwright), PocketBase v0.39.8, CAS kit
    INSTALLED (hook cas-3, 256 KiB cap). Disposable cf_test_* fixtures only,
    torn down with verified absence. Staging was built from a schema-only
    collections export, so NO real athlete data was on the machine, and
    production was never contacted.

Three things I need from you:

1. IS THIS SUFFICIENT FOR CLIENT STAGING SIGN-OFF? 39/75 verified with zero
   failures, where the unautomated remainder is dominated by features that do
   not exist yet. If it is not sufficient, name the specific cases you want
   evidence for rather than a general concern.

2. SHOULD THE COMMIT-10-DEPENDENT CASES BE FORMALLY DEFERRED? A6, C4, C5, F5
   and K1 all need the conflict-resolution UI. I would rather you rule them
   deferred to the CAS client cycle than leave them counted against .342 where
   they can never pass.

3. THE SET-ASIDE FAMILY. H3 (quarantine verified byte-for-byte) plus 8
   dependents (J6, K4, K5, L4, M1-M4) are unverified. Automating H3 with the
   app's own manifest reader would be circular. Do you want these run manually
   before production, or automated with an independent reader? This is the
   largest genuine gap and it involves deleting user data, so I want your call.

Also worth your attention from the server round, still open: PocketBase v0.39.8
exits with code 0 even when a migration FAILS, so a deploy script trusting $?
would read a refused migration as success. That needs a runbook decision before
the production cutover.

This is NOT production approval and I am not treating it as such. 35 of 75
cases were not exercised; §6 of CHECKLIST_RESULTS.md states exactly what that
leaves unproven, and flags the set-aside family, the first-paint claims and the
IndexedDB timing windows as what I would most want a human to run first.
```

---

## Package contents

| Path | What it is |
| --- | --- |
| `CHECKLIST_RESULTS.md` | All 75 cases with expected + actual; §5 harness faults; §6 gaps; §7 deviations |
| `evidence/checklist-final.json` | Machine-readable per-case record |
| `evidence/shots/*.png` | 23 screenshots including claim, mismatch, pending and logout screens |
| `evidence/*.log` | Round 3 server suite logs (CAS kit state during Phase 2) |
| `e2e/` | The harness — staging-guarded, loopback only |
| `STAGING_RESULTS.md` | Round 3 server evidence for reference |
| `MANUAL_CHECKLIST_COMMIT1.md` | The checklist as issued |

No health data, credentials or tokens — schema, code, logs and screenshots of synthetic accounts only.
