# Production Gate — RETURN after the two security hardenings (for ChatGPT / Product Architect)

**Last Updated:** 2026-07-27

**Status:** Active — the Architect returned **APPROVED PENDING TWO SECURITY HARDENINGS** and asked for one final package confirming they are complete. This is that package. Companion to `STAGING_RESULTS.md` §14.

> Copy the block below into ChatGPT and attach `cf-production-gate-final-20260727.zip`.

---

## Prompt

```text
You are the Product Architect for Compound Fitness. I'm the Product Owner.
Claude Code is the Lead Engineer. Per our workflow you decide WHAT gets built
and review WHAT was built; Claude decides HOW.

You reviewed V15 and returned APPROVED PENDING TWO SECURITY HARDENINGS, asking
for one final package confirming they are complete. All three required changes
are done. Nothing has been deployed to production.

Read in this order:

  1. STAGING_RESULTS.md §14   — the three hardenings, what was found, and the
                                evidence
  2. _lib.sh                  — the cf_curl helper (the header never reaches a
                                command line)
  3. _sentinel.py             — stdin token, secure_write(), destroy
  4. DEPLOYMENT.md Step 7     — P0 capture with hashes, P3.4 verified deletion
  5. evidence/                — full rig transcript, generated at build time
  6. rig/verify-rig.sh        — the harness, S10a-m are the new security checks

1. CREDENTIALS OUT OF PROCESS ARGUMENTS — done, and it was worse than one
   token. /proc/<pid>/cmdline is world-readable, so every request in the kit
   published a live superuser token to every local user for the life of the
   request. Three classes of exposure, all closed:
     - 11 curl call sites across 8 scripts, plus cf_req in _lib.sh: a new
       cf_curl helper writes the Authorization header into a 0600 curl config
       file inside the 0700 temp directory and passes -K.
     - _sentinel.py took the token as argv[3]: it now reads it from stdin and
       refuses to run without it.
     - ACCOUNT PASSWORDS were also being passed to `python3 -c` as argv, in
       cf_auth and in three scripts that create users. This was not on your
       list; it is the same defect with a different credential, found while
       implementing the first two. They now travel through the environment,
       readable by the same uid and root only.
   cf_commit_body still passes subsystem, revision and idempotency key through
   argv. That is deliberate — they are not secrets — and the rig check is
   written to distinguish them rather than banning argv outright.

   This rewrote the SHARED HTTP LAYER, so I re-ran the entire staging suite to
   prove nothing broke: 11 suites, 172 assertions, 0 failures, verified
   teardown — identical to Round 3.

2. SENTINEL FILE SAFETY — done. secure_write() refuses a symlink or
   non-regular target before writing, writes to a mkstemp file in the same
   directory, fchmod 0600, fsync, atomic os.replace, then re-checks with lstat
   that the result is not a symlink, is mode 0600, and is owned by the caller.
   Any failure reports "BASELINE NOT CAPTURED — do NOT deploy".
   `_sentinel.py destroy` deletes the baseline and confirms absence, refusing
   to delete through a symlink. Runbook P3.4 runs it after a pass; P5 runs it
   after a rollback.

3. HASH MODE MANDATORY FOR PRODUCTION — done, and made structural rather than
   procedural. Hash mode is now ON BY DEFAULT at capture, so forgetting the
   flag cannot silently weaken the check. SENTINEL_NO_HASH=YES disables it with
   a warning, and a hashless baseline is then REFUSED at verify time unless
   ACCEPT_NO_HASH=YES is also set. The runbook passes SENTINEL_WITH_HASH=YES
   explicitly as you instructed. This closes the open question I raised last
   round — you answered it.

Evidence: the rig is now eleven states, 59 assertions, 0 failures, plus the
172-assertion staging suite re-run. The new checks:

  S10a-c  no token in a curl command line, no token in _sentinel.py argv, no
          password reaching python through argv
  S10d-e  the captured baseline is mode 0600 and owned by the running user
  S10f    hash mode is the default at capture
  S10g    the baseline is PARSED and confirmed to contain no payload fields
  S10h-i  secure_write refuses a symlink target and leaves it untouched
  S10j-k  destroy deletes the baseline and absence is confirmed
  S10l-m  a hashless baseline is refused, and only ACCEPT_NO_HASH waives it

S10a-c are static checks by design: sampling `ps` mid-request is racy, and what
matters is that no code path can put a credential on a command line at all.

Two defects in my own work, recorded rather than hidden: the first automated
rewrite of the curl call sites stripped the Authorization header from
continuation lines without adding cf_curl, which would have left those requests
silently UNAUTHENTICATED; and the same pattern's \s* swallowed a newline and
welded a line-continuation backslash onto the next token. Both were caught
before commit, by reading the diff and by the syntax and behaviour checks.

Unchanged and still true: the gate has never run against production. It has
only run against throwaway instances built from a synthetic production-shaped
schema. V15 will read real athlete rows for the first time during P0 of the
actual cutover.

One question: are the two hardenings satisfactory, and do you authorize the
production cutover?
```

---

## Package contents

| Path | What it is |
| --- | --- |
| `00-PROMPT.md` | The prompt above |
| `docs/STAGING_RESULTS.md` | §13 is this round; §12 the gate; §1–§11 Round 3 server evidence |
| `docs/DEPLOYMENT.md` | Step 7 runbook — P0 capture, P3 probe + verify, P5 triggers, P6 monitoring |
| `docs/CHECKLIST_RESULTS.md` | The client staging ruling as applied, and the Commit 10 gate |
| `docs/SERVER_NOTES.md`, `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/CHANGELOG.md` | Threat model; current state; ADR-015; product log |
| `code/verify-deployment.sh` | The gate, with V15 and hash enforcement |
| `code/_lib.sh` | The shared HTTP layer, with `cf_curl` |
| `code/_sentinel.py` | The integrity sentinel |
| `code/probe-account.sh` | The disposable production probe account |
| `code/rig/verify-rig.sh` | The self-checking harness — eleven states, 59 assertions |
| `code/pb_hooks/`, `code/pb_migrations/` | The kit under verification |
| `evidence/00-rig-run.log` | Full rig transcript, generated when the archive was built |
| `evidence/s1…s10*.log` | Per-scenario output, including the V15 and security runs |
| `diff/production-gate.patch` | The complete diff since the last package |

No health data, credentials or tokens — schema, code and logs from synthetic loopback instances only.

## Reproducing the evidence

```bash
PB_BIN=/path/to/pocketbase-0.39.8 bash server/tests/rig/verify-rig.sh <evidence-dir>
```

Self-contained: it builds its own production-shaped schema (including production's `idx_88qok6ts7v` index name), seeds athlete-shaped rows for the V15 scenarios, runs eleven states, and asserts the gate's verdict on each. Requires only the binary — no copy of production data.
