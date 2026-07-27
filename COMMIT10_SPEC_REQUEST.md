# Commit 10 (CAS Client) — Specification Request (for ChatGPT / Product Architect)

**Last Updated:** 2026-07-27

**Status:** Active — the CAS server kit is deployed to production and verified. Commit 10 is the client half, and it needs a specification before any code is written. Per `ROLES_AND_WORKFLOW.md`, the Architect decides WHAT; this asks for that decision. Follows the `REVIEW_REQUEST.md` pattern.

> Copy the block below into ChatGPT and attach `cf-commit10-spec-request-20260727.zip`.

---

## Prompt

```text
You are the Product Architect for Compound Fitness. I'm the Product Owner.
Claude Code is the Lead Engineer. Per our workflow you decide WHAT gets built
and review WHAT was built; Claude decides HOW.

The CAS server kit went to production today and the deployment gate returned
VERIFIED — 20 checks, 0 failures, both athletes' rows unchanged byte-for-byte
including content hashes. The system is now in the bridge window exactly as you
sequenced it: the server enforces compare-and-swap, existing clients still write
the legacy way, and the bridge keeps revisions truthful.

Nothing uses the commit route yet. That is Commit 10 — the CAS client — and I
need you to specify it before Claude writes any of it.

Read in this order:

  1. PRODUCTION_CUTOVER_RESULTS.md — what is live right now, and what is
                                    deliberately NOT done (lockdown)
  2. cf_cas_shared.js + cf_cas.pb.js — the exact route contract the client must
                                    speak: request shape, and the
                                    200/400/401/409/413/426/500 semantics
  3. SERVER_NOTES.md §1, §3        — field mapping, and the old-client cutover
                                    and lockdown policy this feeds into
  4. CHECKLIST_RESULTS.md §9       — the acceptance criteria you already ruled
  5. MANUAL_CHECKLIST_COMMIT1.md   — the wording of those cases as issued
  6. STATUS.md, DECISIONS.md       — current state and the decision log

What is already settled, so you don't re-decide it:

  - You ruled five checklist cases DEFERRED TO COMMIT 10 as its mandatory
    acceptance criteria: A6, C4, C5, F5, K1. All five need a conflict-resolution
    UI that does not exist in .342.
  - You ruled that H3 and its eight dependents (J6, K4, K5, L4, M1-M4) must be
    automated with an INDEPENDENT manifest reader — a second implementation that
    validates the contract rather than the code — plus one manual
    production-readiness confirmation. That is also unbuilt and belongs to this
    cycle.
  - Lockdown (runbook P7) comes AFTER this ships and a 24-48h bridge window, and
    is a separate authorization.

The current client is build 2026-07-27.342-pb-c1h, in which upward sync is
deliberately FROZEN: an ordinary edit produces zero POST/PATCH to appdata, the
device shows a pending state, and the athlete has an export path. That freeze
was the whole point of Commit 1. Commit 10 is what safely unfreezes it.

What I need specified, in priority order:

1. THE CONFLICT UX. This is the core of it and it is a product decision, not a
   technical one. When the server returns 409 with its current revision and the
   server's payload, what does the athlete actually see and choose? Our earlier
   remediation work assumed a three-way choice defaulting to keep-local. Is that
   still what you want? Specifically:
     - What are the options, in the athlete's words?
     - What is the default, and can it ever be automatic with no prompt?
     - core and training carry SEPARATE revisions and can conflict
       independently. Is that one conversation with the athlete or two?
     - A6 is the motivating case: a historical correction on one device versus a
       newer weigh-in on another. Neither is wrong. What is the right outcome?

2. WHEN THE CLIENT PUSHES. The freeze made "never automatically" correct.
   Post-CAS, what replaces it? On every edit, debounced? On app background? Only
   on an explicit action? This decides whether conflicts are rare and
   comprehensible or constant and annoying.

3. WHAT THE ATHLETE SEES WHILE IT WORKS. Today "pending" is an honest pause with
   an export path. Once syncing works, what does the status indicator mean, and
   what does a failed push look like without becoming a nag?

4. SCOPE BOUNDARY. What is explicitly NOT in Commit 10? I would rather ship a
   narrow, verifiable commit than a broad one — the last hardening line took
   seven review rounds and I don't want to repeat that by over-scoping.

Also worth your attention: the deployment surfaced two things that may bear on
your thinking. Production had NO pb_hooks/pb_migrations mounts, so the container
had to be recreated with them — the infrastructure was less prepared than the
docs assumed. And the athlete payloads measured 19,556 B and 22,100 B against a
256 KiB cap, so we have roughly 13x headroom; payload size is not a constraint
on whatever you specify.

Format: lead with the conflict UX decision, then the remaining three, then
anything you would explicitly defer past Commit 10. Where you want a specific
behaviour, state it as an acceptance criterion Claude can test against.
```

---

## Package contents

| Path | What it is |
| --- | --- |
| `00-PROMPT.md` | The prompt above |
| `docs/PRODUCTION_CUTOVER_RESULTS.md` | What is live in production as of today |
| `docs/SERVER_NOTES.md` | Field mapping, threat model, cutover and lockdown policy |
| `docs/DEPLOYMENT.md` | The runbook, including the P7 lockdown this feeds |
| `docs/CHECKLIST_RESULTS.md` | §9 is the Commit 10 gate; §0 the rulings |
| `docs/MANUAL_CHECKLIST_COMMIT1.md` | The deferred cases as originally worded |
| `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/CHANGELOG.md` | Current state, decision log, product history |
| `docs/CODE_ARCHITECTURE.md` | How the single-file client is built, with a line map |
| `contract/cf_cas.pb.js`, `contract/cf_cas_shared.js` | The route contract the client must speak |
| `contract/1753400000_cf_cas.js` | The schema now live in production |

No health data, credentials or tokens.
