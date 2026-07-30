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
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const args = process.argv.slice(2);
const suites = args.length
  ? args.map((a) => path.resolve(a))
  : fs.readdirSync(HERE).filter((f) => /\.browser\.test\.js$/.test(f)).sort().map((f) => path.join(HERE, f));

let failed = 0;
const lines = [];

for (const s of suites) {
  const r = spawnSync(process.execPath, [s], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  process.stdout.write(out);
  const summary = (out.match(/^(OK|FAILED|SKIPPED).*$/m) || [])[0] || '(no summary printed)';
  const bad = r.status !== 0;
  if (bad) failed++;
  lines.push(`${bad ? 'FAIL' : 'ok  '}  exit=${r.status === null ? 'signal ' + r.signal : r.status}  ${path.basename(s)}  ${summary}`);
  /* A suite that printed FAILED must also have exited nonzero. If it did not,
     say so loudly and fail the run — that is the exact defect this runner and
     BHARNESS-05 exist to catch. */
  if (/^FAILED/m.test(out) && r.status === 0) {
    lines.push(`      ^^ printed FAILED but exited 0 — harness exit-code defect`);
    failed++;
  }
}

console.log('\n' + '='.repeat(64));
lines.forEach((l) => console.log(l));
console.log(failed ? `BROWSER SUITES FAILED — ${failed} of ${suites.length}` : `ALL BROWSER SUITES PASSED — ${suites.length} suites`);
process.exit(failed ? 1 : 0);
