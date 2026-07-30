/* BHARNESS-01..08 — the BROWSER harness's exit status, under test.

   The browser harness printed FAILED and exited 0. Every release gate in this
   project is "the command exited nonzero", so a suite that cannot fail a
   command is not a gate at all — it is a transcript nobody is obliged to read.
   The string harness already has HARNESS-01..06 for exactly this; the browser
   harness had nothing, which is how the defect survived.

   Same method as HARNESS-01..06 and for the same reason: a harness cannot
   credibly assert its own failure behaviour, so each case writes a tiny suite,
   runs it in a REAL child process against the real tests/browser/harness.js,
   and inspects the exit code from outside. No Chromium is needed — these test
   the harness's accounting, not the browser.

   Architect: canary day-one ruling §3. */
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, group, eq, ok, notOk, report } = require('./harness');

const BH = path.join(__dirname, 'browser', 'harness.js').replace(/\\/g, '\\\\');
const RUNNER = path.join(__dirname, 'browser', 'run-all.js');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-bharness-self-'));

/* Run a suite body in a child process. Returns { code, out, signal }. */
function runSuite(body, name) {
  const f = path.join(TMP, (name || 'suite') + '-' + Math.random().toString(36).slice(2) + '.js');
  fs.writeFileSync(f, `const { section, test, ok, notOk, eq, summary } = require('${BH}');\n` + body);
  const r = spawnSync(process.execPath, [f], { encoding: 'utf8' });
  return { code: r.status, signal: r.signal, out: (r.stdout || '') + (r.stderr || ''), file: f };
}

group('BHARNESS-01..07 — a browser suite\'s exit status must tell the truth', () => {
  test('BHARNESS-01 a clean suite prints OK and exits 0', () => {
    const r = runSuite(`(async () => {
      await test('passes', async () => { eq(1, 1); ok(true); });
      summary('clean');
    })();`, 'clean');
    eq(r.code, 0, r.out);
    ok(/^OK — 1 passed, 0 failed/m.test(r.out), r.out);
  });

  test('BHARNESS-02 a failing assertion exits NONZERO', () => {
    const r = runSuite(`(async () => {
      await test('fails', async () => { eq(1, 2, 'deliberate'); });
      summary('failing');
    })();`, 'fail');
    notOk(r.code === 0, 'a failing browser assertion must not exit 0 — it printed:\n' + r.out);
    ok(/^FAILED — 0 passed, 1 failed/m.test(r.out), r.out);
  });

  test('BHARNESS-03 a top-level rejected promise exits NONZERO', () => {
    /* the shape every browser suite ends with: .catch(e => process.exit(1)) */
    const r = runSuite(`(async () => {
      await test('ok', async () => { ok(true); });
      throw new Error('boom after the tests');
    })().catch((e) => { console.error(e); process.exit(1); });`, 'reject');
    notOk(r.code === 0, 'an unhandled rejection must fail the suite:\n' + r.out);
  });

  test('BHARNESS-04 a failure INSIDE an awaited test exits NONZERO', () => {
    /* the async-invisibility class: the throw happens after test() returns */
    const r = runSuite(`(async () => {
      await test('async work that throws', async () => {
        await new Promise((r) => setTimeout(r, 30));
        throw new Error('late failure');
      });
      summary('async-fail');
    })();`, 'asyncfail');
    notOk(r.code === 0, 'a throw inside an awaited browser test must fail the run:\n' + r.out);
    ok(/FAILED/m.test(r.out), 'and must be reported: ' + r.out);
  });

  test('BHARNESS-05 no suite can print FAILED and still exit 0', () => {
    /* the exact defect: several failures, a summary, nothing else */
    const r = runSuite(`(async () => {
      await test('a', async () => { ok(false, 'x'); });
      await test('b', async () => { ok(false, 'y'); });
      await test('c', async () => { ok(true); });
      summary('mixed');
    })();`, 'mixed');
    ok(/^FAILED — 1 passed, 2 failed/m.test(r.out), r.out);
    notOk(r.code === 0, 'printed FAILED and exited 0 — the defect is back');
  });

  test('BHARNESS-06 the FIX-003 negative control EXITS nonzero, not merely prints', () => {
    /* Proving the property that made the negative control trustworthy: when the
       ownership-gate fix is reverted, the suite must fail the COMMAND. Modelled
       here with the same failure shape (awaited waitForSelector-style timeout
       inside a test) rather than re-reverting shipped source. */
    const r = runSuite(`(async () => {
      await test('GATE-04 tapping it PAINTS a visible confirmation dialog', async () => {
        await new Promise((res, rej) => setTimeout(() => rej(new Error('Timeout 5000ms exceeded')), 20));
      });
      summary('negative-control-shape');
    })();`, 'negctl');
    notOk(r.code === 0, 'the negative control must fail the command:\n' + r.out);
    ok(/FAILED/.test(r.out));
  });

  test('BHARNESS-07 the printed count and the exit status agree, both ways', () => {
    const clean = runSuite(`(async () => { await test('p', async () => ok(true)); summary('c'); })();`, 'agree-ok');
    const dirty = runSuite(`(async () => { await test('f', async () => ok(false)); summary('d'); })();`, 'agree-bad');
    const failedCount = (out) => Number((out.match(/(\d+) failed/) || [])[1]);
    eq(failedCount(clean.out), 0, clean.out);
    eq(clean.code, 0, 'zero failures must mean exit 0');
    eq(failedCount(dirty.out), 1, dirty.out);
    notOk(dirty.code === 0, 'nonzero failures must mean nonzero exit');
  });
});

group('BHARNESS-08 — the release runner fails when any child fails', () => {
  const mk = (body, name) => {
    const f = path.join(TMP, name + '.browser.test.js');
    fs.writeFileSync(f, `const { section, test, ok, notOk, eq, summary } = require('${BH}');\n` + body);
    return f;
  };
  const good = mk(`(async () => { await test('good', async () => ok(true)); summary('good'); })();`, 'zz-good');
  const bad = mk(`(async () => { await test('bad', async () => ok(false, 'deliberate')); summary('bad'); })();`, 'zz-bad');
  const runRunner = (files) => {
    const r = spawnSync(process.execPath, [RUNNER, ...files], { encoding: 'utf8' });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
  };

  test('BHARNESS-08a the runner exits 0 when every child passes', () => {
    const r = runRunner([good]);
    eq(r.code, 0, r.out);
    ok(/ALL BROWSER SUITES PASSED/.test(r.out), r.out);
  });

  test('BHARNESS-08b ONE failing child fails the whole run', () => {
    const r = runRunner([good, bad]);
    notOk(r.code === 0, 'the runner must fail when any child fails:\n' + r.out);
    ok(/BROWSER SUITES FAILED/.test(r.out), r.out);
    ok(/zz-bad/.test(r.out), 'and must name the failing suite');
  });

  test('BHARNESS-08c a child that dies without a summary still fails the run', () => {
    const crash = mk(`process.exit(3);`, 'zz-crash');
    const r = runRunner([crash]);
    notOk(r.code === 0, 'a crashed child must fail the run:\n' + r.out);
    ok(/no summary printed/.test(r.out), 'and be reported honestly: ' + r.out);
  });

  test('BHARNESS-08e a HANGING child fails the run instead of holding it hostage', () => {
    /* A suite can hang rather than fail: on this box ownership-gate's Chromium
       died under the runner and left Playwright's promise pending — node sat in
       ep_poll for 17+ minutes reporting nothing, so the release gate simply
       never returned. A gate that can hang forever is not a gate.
       The fixture needs a LIVE HANDLE: an unresolved promise alone does not keep
       node alive, and my first attempt at this test passed vacuously because the
       child exited immediately. */
    const hang = mk(`(async () => { await test('starts', async () => ok(true));\n`
      + `  setInterval(() => {}, 1000); await new Promise(() => {}); })();`, 'zz-hang');
    const r = spawnSync(process.execPath, [RUNNER, hang],
      { encoding: 'utf8', env: Object.assign({}, process.env, { CF_SUITE_TIMEOUT_MS: '6000' }) });
    const out = (r.stdout || '') + (r.stderr || '');
    notOk(r.status === 0, 'a hanging child must fail the run:\n' + out.slice(-400));
    ok(/TIMED OUT/.test(out), 'and be reported as a timeout: ' + out.slice(-300));
    ok(/BROWSER SUITES FAILED/.test(out), out.slice(-200));
  });

  test('BHARNESS-08d a child printing FAILED while exiting 0 is caught explicitly', () => {
    /* Belt and braces: if the harness defect ever returns, the runner refuses
       the run on the transcript alone, independently of the exit code. */
    const liar = path.join(TMP, 'zz-liar.browser.test.js');
    fs.writeFileSync(liar, `console.log('FAILED — 0 passed, 1 failed  — liar');\nprocess.exit(0);\n`);
    const r = runRunner([liar]);
    notOk(r.code === 0, 'a suite printing FAILED must fail the run whatever its exit code');
    ok(/printed FAILED but exited 0/.test(r.out), r.out);
  });
});

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* best effort */ }
report();
