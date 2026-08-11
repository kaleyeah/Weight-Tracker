# Compound Fitness — project handover

> ## STATUS 2026-08-05 (newest first — everything below is older)
>
> - **Live build: `2026-08-05.460-cleanup`**, byte-verified against the live
>   URL. `.458-modular` shipped the Phase 0+1 modular architecture: the whole
>   script is now 23 position-preserving modules in `src/`, built into ONE
>   atomic `index.html` by `build.mjs`. **Bump `APP_BUILD` in
>   `src/app-core.js`, never in `index.html`, then run `node build.mjs`.**
>   `.459` fixed the photo diagnostic; `.460` retired the dead GitHub-era
>   surfaces (device sheet, invite flow, connections) after proving them
>   unreachable, and took the a11y unlabelled-input count to zero.
> - **Candidate `2026-08-05.461-fence-stage1` (`ada831d`) — built, tested, NOT
>   deployed.** D1 fence enforcement Stage 1, the CLIENT half: the training
>   commit now carries fence+deviceId, a 409 `fenceStale` is displacement
>   rather than a hard block, a pen-less device refuses to push, the core
>   strict gate fails closed on an unsettled lease, `m10Boot()` runs from the
>   login continuation, `m10cDispatch` re-proves the enqueue-time fence, and an
>   expired pen offers takeover. Evidence: `docs/D1-ENFORCE-EVIDENCE.md`.
>   **Stage 2 — the server flip — is NOT done:** `FENCING_ENFORCED_DEFAULT`
>   stays `false`, `enforce-suite.json` predates `0a1016d` and must be re-run,
>   G13 device evidence is unrecorded, ROLLBACK 1–3 unrehearsed.
> - **A staging origin now exists** (2026-08-05):
>   `https://kaleyeah.github.io/Weight-Tracker-staging/` against a staging
>   PocketBase on the NAS at `:8091` — the production binary, production-shaped
>   schema, synthetic data only. Phase 2 (service worker) was blocked on this.
> - NAS `pb_data` permissions remediated the same day (0777 → 750/700).
>
> ## STATUS 2026-08-02 (history)
>
> - Live build: `2026-08-02.416-fx` (compound-app main). The July-31
>   training-loss arc is CLOSED: `.415-m8` shipped the M8 sync rework
>   (server-acked, crash-journaled training sync; 25 Architect rounds),
>   released, Owner-accepted, records reconciled.
> - Current milestone: **M10 strict single-writer** (Owner ruling:
>   offline non-holders read-only). Design v9.1 approved; the LOCAL
>   server package (writer_lease + fenced commits + transactional photo
>   routes; `M10-single-writer/server/`) passed the
>   Architect gate at round 12. The superuser **platform route was retired
>   and deleted 2026-08-05** — once reports moved to `coach_reports` it had
>   no caller, so there is no longer any superuser content-write path for
>   `appdata`. Do not restore it. Client work is in progress in THIS
>   checkout on `engineering/m8` — `index.html` here is now the synced
>   `.416` client + M10 client increments (increment 1 = the lease
>   client, C15 suite). NOT published; NAS deploy/coach
>   migration/enforcement all await Owner authorization.
> - The M8 rework record lives in `M8-sync-rework/`; M10 in
>   `M10-single-writer/`. Memory + `reports/PROJECT_LOG.md` (in
>   compound-app) carry the chronology.
>
> ## Direction changed 2026-07-30 (historical)
>
> **Where to edit the app the athletes actually use:**
> `~/projects/compound-app` (branch `main`, file `index.html`, build `.400`).
> That checkout IS the live app, served at
> `https://kaleyeah.github.io/Weight-Tracker/`. Edit, commit, push to `main`,
> it deploys. Number builds `.401`, `.402`, … — `.348`–`.353` were consumed by
> canary experiments and must never be reused.
>
> `~/projects/Weight-Tracker` (branch `integration/commit10-lineage-a`) is the
> ENGINEERING repo — docs, tests, the CAS work. Its `index.html` is the parked
> Commit 10 candidate, **not** the live app. Editing it does nothing for the
> athletes.
>
> **The Product Owner's decisions, 2026-07-30:**
>
> 1. **Sync is being simplified.** Compare-and-swap conflict resolution is
>    heavier than this product needs: one person, one phone. The intended model
>    is single-device sign-in — save locally, upload when connected, and don't
>    let two clients write at once. The CAS server kit stays deployed (it works,
>    removing it is its own risk) but nothing new gets built on it.
> 2. **The canary is retired.** `/canary/` is removed and returns 404. It earned
>    its keep: on real hardware it found the ownership gate that could not paint
>    its own confirmation dialog, a successful upload reported as failed, and a
>    409 proving a CAS client cannot commit while the legacy bridge advances the
>    same account.
> 3. **Next work is the native iOS shell + read-only HealthKit** —
>    `shell/SHELL_SCOPE.md`. Blocked on confirming a Mac with Xcode exists;
>    an Apple Developer account is needed and not yet purchased.
> 4. **Process is lighter.** Keep the Product Architect loop for anything
>    touching the server or capable of losing data. Client and UI changes do not
>    need a review package. Much of 2026-07-30's review churn was cleanup of
>    engineering mistakes, not product risk.
>
> Everything below this banner predates that change. Where it conflicts, the
> banner wins.

Written 2026-07-28 for a fresh conversation picking up this work. Everything
here is checked against the repo, not recalled.

---

## 0. READ FIRST — there are TWO client lineages

This was not known when the rest of this document was written, and it changes
several statements below. See `RECONCILIATION.md` for the full analysis.

- **Lineage A** = `origin/main`, build `2026-07-28.343-pb`. **This is what the
  two real athletes run today**, served via GitHub Pages. It syncs by writing
  PocketBase records **directly** and **never calls the CAS commit route**.
- **Lineage B** = `claude/compound-fitness-roles-workflow-aala7o`, everything
  else in this document. **Never deployed to anyone.**

Both are branches of this same repo. They forked at `66108ea` (build `.339`), so
**B already contains A's features through .339**; A is only four commits ahead.

Consequence that corrects §4 below: **HOTFIX-001 is latent, not live-costing.**
The deployed client never touches the route the defect is in. It remains a hard
prerequisite for shipping B, but it is not hurting anyone today.

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

### What is deployed (updated 2026-08-11)

> **This section contradicted the banner at the top of this file for eleven
> days** — it still said production ran `.347-pb` while the banner said
> `.460-cleanup`, byte-verified. Found 2026-08-11 during an Architect review
> that flagged "the mandated current-state source contradicts itself". The
> banner was right and this was stale. **A build number stated here is a claim
> about a live system: update it in the same commit that changes what is
> deployed, or delete it rather than let it rot.**

- **Deployed to production:** **`2026-08-11.486-recovery-shows-the-server`**,
  release commit `de2c69a`, on `main` at `kaleyeah/Weight-Tracker` → GitHub
  Pages. Owner-authorized 2026-08-11. Served-byte verification (standing ruling
  1) recorded in `docs/RELEASE-SERVED-VERIFICATION.md`: committed and served
  artifacts both sha256 `6a767874…88021`, `cmp` identical.
- **Publication is not adoption**, and the two are checked separately. A
  verified serve proves the bytes left the origin; a PWA can run a cached
  artifact for an arbitrary period. Owner confirmed on-device 2026-08-11: his
  app reports `486-recovery-shows-the-server`. **The way to check is to have
  the app say what it is** (Settings shows `APP_BUILD`) and read it back —
  never to infer it from the origin.
- **Owner-authorized exception on this release.** The Architect had asked for
  the correction to be returned *unpushed* for review. The Owner was told 485
  had not been back through review and chose to deploy and review after. That
  is his authority, but this release is an **exception**, not an ordinary
  reviewed completion, and is recorded as one.
- **Superseded:** `.478-tailnet-pb-base` (`198da64`) was production until
  2026-08-11; `.485` was live for roughly an hour the same evening. `483` was **rejected in review and never deployed** — see the
  incident record.
- **Production PocketBase runs the CAS server kit + HOTFIX-001** (hotfix
  deployed and verified 2026-07-29; record in
  `server/PRODUCTION_CUTOVER_RESULTS.md`).
- **Historical, for the Lineage A lineage only:** build
  `2026-07-29.348-pb-c10`, sha `9e45a225…`, produced by
  `deployment-path/build-release.mjs` and consumed via `select-artifact.mjs`,
  on `integration/commit10-lineage-a`. Never deployed. See §0 for why two
  lineages exist.

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

### Outstanding (updated 2026-07-30, post single-flight V2 ruling)

**All engineering evidence gates are closed and approved**, including the last
one: single-flight build enforcement (Architect: "CORRECTIONS APPROVED —
SINGLE-FLIGHT RELEASE-BUILD GATE COMPLETE"). That covers: matrices, manifest
recovery, route contract, multi-context, harness, manual set-aside, client UX
fixes, release pipeline (DEPLOY-RC/BUILD/PKG/COPY), cache/service-worker
(CSW-V2), and the build lock (DEPLOY-LOCK-V2-01..12 + DEPLOY-UNLOCK-01..03,
46 pipeline assertions, four negative controls). The lock implementation
(`build-release.mjs` "-1. SINGLE FLIGHT" section, `unlock-build.mjs`) needs no
further single-flight review unless it changes; carry it and its evidence into
the final cutover package.

Remaining, in order (PO authorized both I5d and the canary on 2026-07-30):

1. ~~**I5d**~~ — EXECUTED on production 2026-07-30: 11 passed, 0 failed, both
   disposable accounts torn down with verified absence, athletes byte-identical
   before/after. See `server/I5D_RESULTS.md`.
2. **Canary** — approved, published, and STOPPED on day one. The PO was
   trapped on the ownership gate ("No — set it aside" did nothing) — FIX-003,
   see `deployment-path/CANARY_DAY1_STOP.md`. The 48h window never started.
   `/canary/` still serves the superseded `.348-pb-c10`, halted; root untouched
   at `.347`. New candidate `2026-07-30.349-pb-c10` (`30336aee…`) is with the
   Architect; nothing republishes until it is accepted.
3. Real-iPhone canary smoke (inside the canary window).
4. Final cutover package → Architect release authorization → PO
   root-deployment authorization.

---

## 4. HOTFIX-001 — read this before touching the server

**A defect is present in production, but latent** — the deployed client
(Lineage A) never calls this route, so no athlete is currently affected. It
becomes live the moment Lineage B ships.

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

**A swallowed read failure becomes a factual claim.** 2026-08-10, and it cost
the Owner his training data. `loadTraining()` was
`try{ … }catch(e){}` around its whole body, so a storage failure, unparseable
bytes and a genuinely empty store were the same outcome: `state.training` at
its empty default, and nothing recorded about which had happened. The sync
layer then compared empty-local against a base holding 3 routines, 25
exercises and 23 sessions, correctly identified a difference, and pushed the
emptiness over it — 200 OK, `fileByteLength: 0`.

  The bug was not in the sync layer. Every gate there did its job on the
  premise it was handed. **The question a loader must answer is not "what is
  the data" but "do I KNOW what the data is",** and one boolean is usually too
  few: the contract is now three-state — a document was read / the key is
  absent / we know nothing — because "absent" reads as fact on a new device and
  as ignorance on an evicted one.

  Full write-up, including what was done to live data during the restore:
  `docs/INCIDENT-2026-08-10-training-loss.md`.

**Authority that a reload forgets.** The first fix used a process-lifetime flag
("did this boot read the store") as permission to destroy. It is the right
question at the moment of the edit and the wrong one at every later dispatch —
a journal replayed after a reload would be judged on a flag belonging to a
different boot. **Destructive authority has to be durable and bound to the
operation**: recorded when the athlete's own action makes the data empty, and
bound to device, prior content, resulting content, generation and revision, so
it authorises exactly one push and cannot be minted by the code that wants to
use it.

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
