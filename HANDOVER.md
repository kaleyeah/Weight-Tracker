# Compound Fitness — project handover

Written 2026-07-28 for a fresh conversation picking up this work. Everything
here is checked against the repo, not recalled.

---

## 1. What this is

**Compound** — a weight/nutrition/training tracker for a very small number of
real athletes, holding real health data.

- **Client:** one file, `index.html`, ~10,200 lines, vanilla JS, no framework,
  no build step. It is a PWA served as a single document.
- **Server:** self-hosted **PocketBase v0.39.8** in Docker on a Synology
  RS1221+ NAS ("RACK"), reachable **only over Tailscale**. There is also a VPS
  (`GBClaude`, `100.72.141.89` on the tailnet, public IP `155.138.245.67`) where
  the repo lives and where Claude Code runs.
- **Sync model:** compare-and-swap. The client sends
  `POST /api/cf/appdata/commit` with `{subsystem, expectedRev, idempotencyKey,
  payload, clientBuild, deviceId}`. Two independent subsystems — `core`
  (health/progress) and `training` — with separate `coreRev` / `trainingRev`.

### Who decides what

| Role | Who | Decides |
| --- | --- | --- |
| Product Owner | Griffin (the user) | priorities, authorises production changes |
| Product Architect | ChatGPT, via zip packages | **WHAT** — product behaviour, UX, acceptance criteria |
| Lead Engineer | Claude Code | **HOW** — implementation, tests, evidence |

**The working loop:** build something → produce a zip package with a
`00-PROMPT.md` → the PO gives it to the Architect → a review comes back as a zip
→ implement the corrections → repeat. **Every unit of work ships with a package,
unprompted.** Do not skip this; it is the standing instruction.

---

## 2. Architecture facts that are easy to get wrong

These have each cost real debugging time.

**The client is append-and-override.** New work is added as a `HARDENING —
COMMIT n` block at the end of the script that *reassigns* existing functions
rather than editing them in place. Blocks present: `1, 1b–1h, 10, 10b`, plus
`M1–M4`. **A function defined earlier may be shadowed later** — always
`grep -n 'name'` for *all* definitions before reasoning about behaviour. This
caught me twice: `cfQuarExport` and `cfQuarComplete` both have later, stricter
overrides that are the ones that actually run.

**Tests slice the real source.** `tests/harness.js` extracts
`/* @testable-start NAME */ … /* @testable-end NAME */` blocks out of
`index.html` and evaluates them, so tests cannot drift from a copy. Blocks:
`C1, C1B–C1H, C10, C10B, M1–M4`.

**`tests/harness.js` refuses promise-returning `test()` callbacks.** This is
deliberate — async assertion failures used to be invisible. Await the async work
*outside* `test()`, then assert synchronously, or use `defer()`.

**`revAll()` / `REV_KEY` (`wl_rev`) is NOT account-scoped.** It is a single
unscoped key that the app wipes on logout. Anything that must be per-account
needs its own scoped key — e.g. the CAS preservation obligation uses
`cf:casneed:<uid>`, and recovery artifacts use `cf:casrec:<uid>:<id>:*`.

**`.wl-login` is a centred flex container with `min-height:100dvh`.** Content
taller than the viewport overflows the **top**, where it cannot be scrolled to.
If you add anything to the login screen, check the top edge, not just the bottom.

**`document.body.textContent` includes the entire inline `<script>`.** In a
single-file app, asserting on body text will match the source code. I nearly
reported a UI defect that did not exist because of this. Query the DOM.

**PocketBase hooks run in a separate Goja runtime.** A handler cannot see the
registering file's top-level scope — everything must be loaded *inside* the
handler (`require(\`${__hooks}/cf_cas_shared.js\`)`). Getting this wrong made
the commit route throw on every request during an earlier round.

**`e.requestInfo().body` is a Go map, and Go randomises map iteration order.**
`JSON.stringify` over it is not stable. This is the cause of HOTFIX-001 below.

---

## 3. Current state

### Branches

| Branch | Contains | Status |
| --- | --- | --- |
| `claude/compound-fitness-roles-workflow-aala7o` | all Commit 10 work + merged client fixes (131 commits ahead of `main`) | active |
| `hotfix/cas-idempotency-canonical-hash` | HOTFIX-001, server only | **awaiting approval, NOT deployed** |
| `fix/export-charset-utf8`, `fix/setaside-above-login`, `fix/client-manual-gate` | superseded — already merged into the working branch | historical |
| `main` | far behind | not used |

### What is deployed

- **Production PocketBase runs the CAS server kit** (deployed at an earlier
  cutover, evidence in `server/PRODUCTION_CUTOVER_RESULTS.md`).
- **Nothing from Commit 10 is deployed.** No client release has been made from
  this work.
- **HOTFIX-001 is not deployed.** Production still runs the defective hook.

### Test suites

**949 string assertions** (`node tests/run-all.js`) plus eight browser suites in
`tests/browser/` (Playwright at `~/staging-cas/node_modules`, not in
`run-all.js`):

| Suite | Assertions | Needs |
| --- | --- | --- |
| `conflict-center` | 56 | Chromium |
| `multi-context` | 41 | Chromium (two tabs, real Web Locks) |
| `setaside-ux` | 26 | Chromium |
| `cas-status-matrix` | 30 | Chromium + **real PocketBase** |
| `route-contract` | 23 | Chromium + **real PocketBase** |
| `manifest-recovery` | 14 | Chromium + **real PocketBase** |
| `export-utf8` | 7 | Chromium |
| `setaside-signin` | 6 | Chromium + **real PocketBase** |

`tests/browser/pbserver.js` spins up a **disposable, empty PocketBase** in a
temp dir from `server/pb_hooks` + `server/pb_migrations`, on 127.0.0.1, and
destroys it afterwards. It needs `~/staging-cas/bin/pocketbase`. Suites skip
cleanly if that binary is absent.

### Outstanding

1. **HOTFIX-001** — the only item with an ongoing live cost. Needs the
   Architect's approval, then the PO's authorisation.
2. Architect rulings on `C10-MC-01..20` and `MV-01..13` (sent, never ruled on —
   one review came back as a duplicate of the previous one).
3. Final consolidated Commit 10 package and release ruling.

---

## 4. HOTFIX-001 — read this before touching the server

**A defect is live in production right now.**

The commit route derives its idempotency `requestHash` from
`JSON.stringify(body.payload)` over a Go map, so **byte-identical requests hash
differently**. The ledger sees a mismatch and refuses the retry with *"idempotency
key reused with a different request"* — the idempotency layer rejecting the exact
case it exists for.

Measured with raw HTTP, no client: **11–12 of 12 identical retries refused.**
With the fix: 0 of 12.

- **No data loss.** CAS still protects the row and the client routes the 409 to
  its safe failure state. But a retry after a dropped response is the whole
  point of an idempotency key, so an athlete on a poor connection dead-ends with
  nothing explaining it.
- **Why it shipped:** `server/tests/idempotency.py` already tested replay — with
  `payload = {"v": "original"}`. **One key.** A single-key object has one
  possible serialisation, so the test could not detect an unstable one. Right
  contract, wrong data.
- Full package lives **on the hotfix branch only** — it is deliberately not on
  the working branch, to keep server and client work decoupled:
  ```bash
  git checkout hotfix/cas-idempotency-canonical-hash
  cat server/hotfix/HOTFIX-001_CAS_IDEMPOTENCY_CANONICAL_HASH.md   # RCA, migration, rollback, H0–H9, verification
  node server/hotfix/proof/hotfix-evidence.js                      # ~2 min: deployed vs corrected, side by side
  ```

---

## 5. Rules when pushing changes

### Absolute

- **Never modify production PocketBase without explicit PO authorisation.**
  Not schema, not hooks, not API rules, not `CF_MIN_CLIENT_BUILD`, not the
  bridge hooks, not P7 lockdown.
- **Back up production before any change to it**, and verify the backup reads.
- **Destructive tests run only against disposable `cf_test_*` accounts.** Never
  the two real athlete accounts.
- **Never ask the PO for a real athlete password.**
- **Staging/production copies contain real health data — keep them
  Tailnet-only.** On GBClaude, bind test servers to the tailnet IP
  (`100.72.141.89`), never `0.0.0.0`, which would also publish on the public IP.
- **If something is ambiguous or fails in a way not covered — stop and report.**
  Do not improvise on the server.

### Process

- **Do not couple server changes with client changes** (ADR-0012). They deploy
  separately and are approved separately.
- **`index.html` is one file**, so client changes must be *sequenced*, not
  developed in parallel branches. Rebase/cherry-pick onto the current tip.
- **Ship an Architect package with every unit of work**, unprompted.
- Commit messages here are long and explain *why*, including what went wrong.
  Match that.

### Practical

- `pkill -f <pattern>` will match Claude Code's own shell and kill the command.
  Use a narrower pattern or `kill $(pgrep -f ...)`.
- `scp` fails against the Synology (no sftp-server). Use `ssh host 'cat file' >`.
- The DSM Unix account is `griffingoodman`, not `griffin`.

---

## 6. Failure classes this project keeps finding

Every one of these was caught by review or by a human looking at a screen, not
by the tests that already existed. They are worth reading before writing tests.

**Vacuous tests that pass for the wrong reason.** Three times.
- `MC-06` purged six record ids **without writing the artifacts**, so every
  purge hit a nonexistent record and created no obligation. The assertion was
  trivially true.
- `STATUS-07` read `typeof exportData === 'function' && … ? true : typeof
  exportData === 'function'` — both branches collapse to the same thing.
- `CAS-08` counted a Playwright `route.fetch()` copy as a client retry.

  **Mitigation now used:** assert the *precondition* fired (e.g. "the artifacts
  are still present, so the forced failure really happened"), and negative-control
  anything important — break the code, watch the test fail, restore it.

**Waiting a duration instead of for a condition.** Twice. A fixed 250ms sleep in
the browser suite, and a 5ms sleep in `c10-scheduler.test.js` that made a
one-in-fifty failure look like a product defect. Use `waitForSelector`, or expose
an explicit signal (`gate.parked()`).

**Comments and captions that describe code that no longer exists.** A screenshot
caption claimed a state "renders nothing" while the code rendered a heading and a
sentence. A comment claimed focus restoration survived a remount, which node
identity cannot do. **A caption is a claim** — re-read the code before writing it.

**Testing what renders, not what is seen.** The set-aside notice was present,
correct, accessible and fully covered by tests — and sat 12px below the fold on
every phone size. Assert geometry against the viewport when visibility matters.

**Assuming the app is wrong when a test fails.** Repeatedly, the app was right:
a stale client revision, a fixture with hardcoded manifest sizes, a 409 body
missing `conflict:true`. Instrument before concluding.

**Fixture shape hiding a real bug.** The single-key payload in
`idempotency.py`. A test can assert exactly the right contract and still be
blind to the defect if its data cannot express the failure.

---

## 7. Useful commands

```bash
node tests/run-all.js                                  # 949 string assertions
node tests/browser/<suite>.browser.test.js             # any browser suite
node tests/browser/shots.js <outdir>                   # screenshots of every conflict state
node tests/manual/set-aside-check.js                   # PO-facing manual check (HOST=<tailnet ip>)
# on the hotfix branch only:
node server/hotfix/proof/hotfix-evidence.js            # deployed vs corrected hook, side by side
```

Note: `server/hotfix/` does **not** exist on the working branch. Check out
`hotfix/cas-idempotency-canonical-hash` first.
