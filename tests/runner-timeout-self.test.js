/* Runner self-test (Architect ruling, D1 round 1): the per-suite timeout must
   PROVABLY fire. The old spawnSync timeout sat in the release gate through
   every shipped release and never once fired; a suite ran 57 minutes under an
   8-minute limit. A gate mechanism that has never been exercised is not a
   mechanism — this test exercises it on every run.

       node tests/runner-timeout-self.test.js

   Asserts, against the deliberately hanging fixture (which traps SIGTERM and
   spawns a grandchild, the two behaviors that defeated spawnSync):
     1. the runner exits NONZERO;
     2. it reports the timeout;
     3. it returns within a bounded window (timeout + grace), i.e. it was not
        held hostage by the grandchild's open pipe;
     4. the ENTIRE process group is dead — the grandchild too. */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const HERE = __dirname;
const TIMEOUT_MS = 4000;
const GRACE_MS = 8000;
const pidFile = path.join(os.tmpdir(), 'cf-hang-grandchild-' + process.pid + '.pid');

let passed = 0; const failures = [];
const test = (n, f) => { try { f(); passed++; console.log('  ✓ ' + n); }
  catch (e) { failures.push(n); console.log('  ✗ ' + n + '\n      ' + (e && e.message)); } };
const ok = (v, m) => { if (!v) throw new Error(m || 'expected truthy'); };

const t0 = Date.now();
const r = spawnSync(process.execPath,
  [path.join(HERE, 'browser', 'run-all.js'), path.join(HERE, 'browser', 'hang.fixture.js')],
  { encoding: 'utf8',
    env: Object.assign({}, process.env,
      { CF_SUITE_TIMEOUT_MS: String(TIMEOUT_MS), CF_HANG_PIDFILE: pidFile }),
    timeout: TIMEOUT_MS + GRACE_MS + 20000 });
const elapsed = Date.now() - t0;
const out = (r.stdout || '') + (r.stderr || '');

test('the runner exits nonzero on a hung suite', () =>
  ok(r.status !== 0 && r.status !== null, 'status: ' + r.status + ' signal: ' + r.signal));
test('the timeout is reported loudly', () =>
  ok(/TIMED OUT/.test(out), 'output was:\n' + out.slice(0, 800)));
test('the runner returns within timeout+grace — not held by open pipes', () =>
  ok(elapsed < TIMEOUT_MS + GRACE_MS, 'elapsed ' + elapsed + 'ms > ' + (TIMEOUT_MS + GRACE_MS)));
test('the grandchild is dead — the whole process group was killed', () => {
  ok(fs.existsSync(pidFile), 'fixture never wrote its grandchild pid');
  const pid = Number(fs.readFileSync(pidFile, 'utf8'));
  fs.unlinkSync(pidFile);
  let alive = true;
  try { process.kill(pid, 0); } catch (e) { alive = (e.code === 'EPERM'); }
  ok(!alive, 'grandchild ' + pid + ' is still running');
});

console.log(failures.length
  ? `FAILED — ${passed} passed, ${failures.length} failed`
  : `OK — ${passed} passed`);
process.exit(failures.length ? 1 : 0);
