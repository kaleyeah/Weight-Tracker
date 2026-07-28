/* HARNESS-01..06 — the harness itself, under test.

   A harness cannot credibly assert its own failure behaviour: if it is broken
   in the way under test, the assertion is broken too. So each case writes a
   tiny suite to a temp file, runs it in a REAL child node process against the
   real tests/harness.js, and checks the exit code and output from outside.

   That is the only way to prove "the runner exits nonzero" — the property that
   matters most, because every other guarantee in this project is enforced by CI
   noticing a nonzero exit. */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, group, eq, ok, notOk, report } = require('./harness');

const HARNESS = path.join(__dirname, 'harness.js').replace(/\\/g, '\\\\');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-harness-self-'));

/* Run a suite body in a child process. Returns { code, out }. */
function run(body) {
  const file = path.join(TMP, 'case-' + Math.abs(hash(body)) + '.js');
  fs.writeFileSync(file, `const { test, group, eq, ok, notOk, defer, report } = require('${HARNESS}');\n${body}\n`);
  try {
    const out = execFileSync(process.execPath, [file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status === undefined ? -1 : e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
}
/* deterministic filename per body — Date.now()/Math.random() would make the
   temp files unreproducible between runs for no benefit */
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
  return h;
}

group('HARNESS-01..06 — the harness fails when it should, and says so', () => {
  /* ---- HARNESS-01 ---- */
  const sync = run(`
    test('this one passes', () => { eq(1, 1); });
    test('this one fails', () => { eq(1, 2); });
    report();
  `);
  test('HARNESS-01 a synchronous assertion failure fails the suite', () => {
    eq(sync.code, 1, 'exit code was ' + sync.code + '\n' + sync.out);
    ok(/✗ this one fails/.test(sync.out), sync.out);
    ok(/FAILED — 1 passed, 1 failed/.test(sync.out), sync.out);
  });

  const clean = run(`
    test('all good', () => { eq(1, 1); });
    report();
  `);
  test('HARNESS-01b and a clean suite exits zero', () => {
    eq(clean.code, 0, clean.out);
    ok(/OK — 1 passed/.test(clean.out), clean.out);
  });

  /* ---- HARNESS-02 ---- */
  const promised = run(`
    test('async callback', async () => { eq(1, 2); });
    report();
  `);
  test('HARNESS-02 a promise-returning test() callback is REFUSED', () => {
    eq(promised.code, 1, 'exit code was ' + promised.code + '\n' + promised.out);
    ok(/callback returned a promise/.test(promised.out),
      'the refusal must name the cause: ' + promised.out);
  });
  test('HARNESS-02b the refusal is what fails it, not the hidden assertion', () => {
    /* An async callback whose assertions PASS must still be refused — otherwise
       the guard is only catching failures it happens to notice. */
    const r = run(`
      test('async callback that would pass', async () => { eq(1, 1); });
      report();
    `);
    eq(r.code, 1, 'a passing async callback must still be refused: ' + r.out);
    ok(/callback returned a promise/.test(r.out), r.out);
  });

  /* ---- HARNESS-03 ---- */
  const deferredReject = run(`
    defer((async () => { throw new Error('late boom'); })());
    test('a synchronous test that passes', () => { eq(1, 1); });
    report();
  `);
  test('HARNESS-03 a deferred rejection fails the suite', () => {
    eq(deferredReject.code, 1, 'exit code was ' + deferredReject.code + '\n' + deferredReject.out);
    ok(/late boom/.test(deferredReject.out), deferredReject.out);
    ok(/deferred scenario/.test(deferredReject.out), deferredReject.out);
  });

  /* ---- HARNESS-04 ---- */
  const waits = run(`
    defer((async () => {
      await new Promise((r) => setTimeout(r, 250));
      test('registered AFTER the delay', () => { eq(1, 2); });
    })());
    report();
  `);
  test('HARNESS-04 report() waits for every registered deferred scenario', () => {
    eq(waits.code, 1,
      'a failure registered 250ms late did not fail the run: ' + waits.out);
    ok(/✗ registered AFTER the delay/.test(waits.out), waits.out);
    /* and the totals line must come after it, not before */
    ok(waits.out.indexOf('registered AFTER the delay') < waits.out.indexOf('FAILED —'),
      'the summary was printed before the deferred work finished:\n' + waits.out);
  });

  test('HARNESS-04b a slow deferred scenario that passes still counts', () => {
    const r = run(`
      defer((async () => {
        await new Promise((res) => setTimeout(res, 200));
        test('slow but fine', () => { eq(1, 1); });
      })());
      report();
    `);
    eq(r.code, 0, r.out);
    ok(/OK — 1 passed/.test(r.out), 'the late pass was not counted: ' + r.out);
  });

  /* ---- HARNESS-05 ---- */
  test('HARNESS-05 the documented pattern completes async work BEFORE asserting', () => {
    const r = run(`
      defer((async () => {
        const value = await new Promise((res) => setTimeout(() => res(41), 120));
        test('asserts on resolved work', () => { eq(value, 41); });
        test('and catches a wrong expectation', () => { eq(value, 42); });
      })());
      report();
    `);
    eq(r.code, 1, r.out);
    ok(/✓ asserts on resolved work/.test(r.out), r.out);
    ok(/✗ and catches a wrong expectation/.test(r.out),
      'a wrong assertion inside a converted scenario must be visible: ' + r.out);
    ok(/FAILED — 1 passed, 1 failed/.test(r.out), r.out);
  });

  /* ---- HARNESS-06 ---- */
  test('HARNESS-06 the runner exits nonzero for EVERY failure mode', () => {
    const modes = {
      'synchronous assertion': sync.code,
      'promise-returning callback': promised.code,
      'deferred rejection': deferredReject.code,
      'late-registered failure': waits.code,
    };
    Object.keys(modes).forEach((k) => {
      eq(modes[k], 1, k + ' exited ' + modes[k] + ', expected 1');
    });
    /* and a clean run must NOT be nonzero, or the check above proves nothing */
    eq(clean.code, 0, 'a clean suite must exit zero');
  });

  test('HARNESS-06b an unhandled throw outside test() is not silently swallowed', () => {
    const r = run(`
      test('fine', () => { eq(1, 1); });
      throw new Error('setup exploded');
    `);
    notOk(r.code === 0, 'a suite that throws during setup exited 0:\n' + r.out);
    ok(/setup exploded/.test(r.out), r.out);
  });
});

/* leave nothing behind */
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* best effort */ }

report();
