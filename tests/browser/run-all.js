/* Run every browser suite as a CHILD PROCESS and fail if any of them fails.

   node tests/browser/run-all.js                 # all *.browser.test.js
   node tests/browser/run-all.js a.js b.js       # only these (used by the self-test)

   Why children rather than require(): each suite launches Chromium and a
   disposable PocketBase and calls process.exit paths of its own; one suite
   crashing must not take the runner's own accounting with it. The exit status
   of this runner is the release gate — it is nonzero if ANY child is nonzero,
   including a child that dies without printing a summary at all.

   Architect (canary day-one ruling §3, BHARNESS-08): "The release runner fails
   when any browser-suite child exits nonzero." Before this existed there was no
   browser runner — suites were run one at a time by hand, which is exactly how
   an exit code nobody read went unnoticed. */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const args = process.argv.slice(2);
const suites = args.length
  ? args.map((a) => path.resolve(a))
  : fs.readdirSync(HERE).filter((f) => /\.browser\.test\.js$/.test(f)).sort().map((f) => path.join(HERE, f));

/* Suites that are allowed to SKIP, each with the reason. Anything else that
   prints SKIPPED is a FAILURE — a required suite whose fixture is missing is
   a broken gate, not a pass (Architect ruling, D1 round 1). */
const OPTIONAL_SUITES = {
  'cache-sw.browser.test.js':
    'needs a captured live .347 artifact (CF_LIVE347); pre-modular lineage',
};

let failed = 0;
let skippedOptional = 0;
const lines = [];

/* A per-suite timeout, because a suite CAN hang rather than fail. The first
   implementation used spawnSync{timeout}, which NEVER FIRED in the wild: a
   suite ran 57 minutes under an 8-minute limit (docs/
   TEST-RUNNER-TIMEOUT-DEFECT.md). Two mechanisms defeated it — Playwright
   traps SIGTERM for graceful shutdown, which never completes when Chromium is
   wedged, and spawnSync waits for stdio EOF, which Chromium grandchildren
   hold open even after the direct child dies. So: the child is spawned
   DETACHED (its own process group), and the timeout SIGKILLs the WHOLE GROUP
   — untrappable, and it takes the grandchildren's pipe ends with it.
   tests/runner-timeout-self.test.js proves this fires, with a deliberately
   hanging fixture that spawns its own grandchild. */
function runSuite(file, timeoutMs) {
  return new Promise((resolve) => {
    /* PIN THE ARTIFACT UNDER TEST (2026-08-07). Six M10 suites defaulted to
       `~/projects/Weight-Tracker/index.html` — the PARKED CAS candidate, not
       what ships — and the runner never overrode it, so the release gate was
       green while validating a file frozen on Aug 4. c18 then failed 12/72
       the moment it was pointed at the real artifact (a test stale against
       the guided-camera chooser, harmless in itself; the point is the gate
       could not see it). The gate now names the artifact explicitly and any
       suite may still be run by hand with CF_SRC. */
    const child = spawn(process.execPath, [file], {
      stdio: ['ignore', 'pipe', 'pipe'], detached: true,
      env: { ...process.env, CF_SRC: process.env.CF_SRC || path.join(HERE, '..', '..', 'index.html') } });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch (e) {
        try { child.kill('SIGKILL'); } catch (e2) {}
      }
    }, timeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ out, code, signal, timedOut });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ out: out + '\nSPAWN ERROR: ' + err, code: 127, signal: null, timedOut });
    });
  });
}

(async () => {
for (const s of suites) {
  const r = await runSuite(s, Number(process.env.CF_SUITE_TIMEOUT_MS || 8 * 60 * 1000));
  process.stdout.write(r.out);
  const summary = (r.out.match(/^(OK|FAILED|SKIPPED).*$/m) || [])[0] || '(no summary printed)';
  const base = path.basename(s);
  const skipped = /^SKIPPED/m.test(r.out);
  let bad = r.code !== 0 || r.timedOut;
  let tag = bad ? 'FAIL' : 'ok  ';
  if (r.timedOut) console.log(`\n*** TIMED OUT after ${process.env.CF_SUITE_TIMEOUT_MS || 8 * 60 * 1000}ms: ${base} — process group killed, treated as a failure ***`);
  if (skipped && !bad) {
    if (OPTIONAL_SUITES[base]) { skippedOptional++; tag = 'SKIP'; }
    else { bad = true; tag = 'FAIL'; lines.push(`FAIL  ${base}  SKIPPED but not classified optional — a required suite may not skip`); failed++; continue; }
  }
  if (bad) failed++;
  lines.push(`${tag}  exit=${r.code === null ? 'signal ' + r.signal : r.code}  ${base}  ${summary}`);
  /* A suite that printed FAILED must also have exited nonzero. If it did not,
     say so loudly and fail the run — that is the exact defect this runner and
     BHARNESS-05 exist to catch. */
  if (/^FAILED/m.test(r.out) && r.code === 0) {
    lines.push(`      ^^ printed FAILED but exited 0 — harness exit-code defect`);
    failed++;
  }
}

console.log('\n' + '='.repeat(64));
lines.forEach((l) => console.log(l));
const required = suites.length - skippedOptional;
if (failed) console.log(`BROWSER SUITES FAILED — ${failed} of ${suites.length}`);
else console.log(`REQUIRED BROWSER SUITES PASSED — ${required} of ${required}` +
  (skippedOptional ? `; OPTIONAL SKIPPED — ${skippedOptional} (classified, reported, NOT counted as passes)` : ''));
process.exit(failed ? 1 : 0);
})();
