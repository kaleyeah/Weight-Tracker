# Defect: the browser runner's per-suite timeout does not fire

**Found 2026-08-05** while running the tier for D1. Not fixed yet — recorded
here first because it changes what "the tier passed" is worth, and fixing the
gate while using it as the gate would muddy D1's evidence.

## What was observed

`tests/browser/run-all.js:36` runs each suite with an 8-minute per-suite
timeout:

```js
const r = spawnSync(process.execPath, [s], { encoding: 'utf8',
  timeout: Number(process.env.CF_SUITE_TIMEOUT_MS || 8 * 60 * 1000), … });
```

A run of the full tier sat on `c11m8-recovery.browser.test.js` for **57
minutes**, with the suite's own node process still alive the whole time
(`ps -eo etime,args`), and the runner still blocked behind it. The timeout
never reported, never failed the suite, and never moved on. The runner's own
comment says exactly why it exists — *"A release gate that can hang forever is
not a gate — it is a hostage"* — and that is precisely what happened.

## Why the suite hung in the first place (a separate, smaller mistake)

The tier had been invoked as `CF_SRC=$PWD/index.html node tests/browser/run-all.js`.
The suites are **not** uniform in what they test:

| Default source | Suites |
|---|---|
| `compound-app/index.html` (the live lineage) | 16 |
| `Weight-Tracker/index.html` (the engineering candidate) | 6 |
| `M8-sync-rework/recovery/index-recovery-syncsafe.html` | 1 |

Forcing `CF_SRC` globally points every suite at one artifact. `c11m8-recovery`
then waits on `window.SYNC_SAFE`, a marker that exists only in the recovery
page, and blocks. **Do not set `CF_SRC` when running the whole tier** — each
suite already names the artifact it was written against. `CF_SRC` is for
running ONE suite against a specific build (a mutation copy, a candidate).

That mistake is what surfaced the runner defect, but the defect is independent:
any suite that hangs for any reason will hang the whole gate.

## Likely mechanism

`spawnSync`'s `timeout` sends `killSignal` (default `SIGTERM`) to the direct
child. Two things then keep it blocked:

1. Playwright installs its own `SIGTERM`/`SIGINT` handlers to shut the browser
   down gracefully. If Chromium is wedged, that cleanup does not complete and
   the node child never exits.
2. `spawnSync` waits for the child's stdio pipes to reach EOF as well as for
   process exit. Chromium subprocesses inherit those pipes, so even a dead node
   child can leave the runner waiting on an open pipe held by a grandchild.

This is a hypothesis consistent with everything observed, not something proven
by instrumentation — it should be confirmed before the fix is called verified.

## Fix APPLIED 2026-08-05 (see the runner-fix commit; self-test below)

- pass `killSignal: 'SIGKILL'` so the child cannot trap the signal, and
- spawn `detached: true` and kill the whole **process group** on timeout, so
  Chromium grandchildren die with it, and
- add a runner self-test: a deliberately hanging fixture suite that the runner
  must report as `FAIL … TIMED OUT` within the configured window.

The self-test matters most. The timeout has been in the runner, believed
working, through every release this project has gated — including the six-round
Phase 0+1 review. It was never once exercised.

## Resolution

The hypothesis was confirmed by construction: `tests/browser/hang.fixture.js`
traps SIGTERM and spawns a grandchild holding inherited stdio, and under the
old runner that combination hangs forever. The runner now spawns each suite
`detached` (its own process group) and SIGKILLs the **group** on timeout —
untrappable, and it takes the grandchildren's pipe ends with it.

`tests/runner-timeout-self.test.js` exercises the mechanism on every run:
nonzero exit, loud report, bounded return, grandchild verified dead. 4/4.

The runner also stopped conflating skips with passes: suites listed in
`OPTIONAL_SUITES` (with a stated reason) report as `SKIP` and are excluded from
the passed count; any OTHER suite that prints SKIPPED fails the run. The final
line now reads `REQUIRED BROWSER SUITES PASSED — N of N; OPTIONAL SKIPPED — M`.
