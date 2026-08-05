/* Compound Fitness — dev-only test harness.
   NOT shipped. Production remains a single framework-free index.html.

   Historically, tests sliced @testable blocks out of index.html; that
   mechanism was retired 2026-08-05 (see docs/RETIRED-TESTS.md) — the markers
   died with the cf* layer. The remaining suites here are self-contained; the
   real coverage lives in tests/browser/. */

const fs = require('fs');
const path = require('path');

/* Resolve the shipping source so the suite runs from a repo checkout AND from an
   extracted review archive (where index.html may sit beside tests/ or in full-source/). */
const CANDIDATES = [
  process.env.CF_SRC,
  path.join(__dirname, '..', 'index.html'),
  path.join(__dirname, 'index.html'),
  path.join(__dirname, '..', 'full-source', 'index.html'),
].filter(Boolean);
const SRC = CANDIDATES.find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
if (!SRC) { console.error('Cannot find index.html. Tried:\n  ' + CANDIDATES.join('\n  ') + '\nSet CF_SRC=/path/to/index.html'); process.exit(2); }

/* loadTestable / @testable extraction RETIRED 2026-08-05 (Architect ruling —
   see docs/RETIRED-TESTS.md). The markers it read were deleted from index.html
   with the cf* layer at commit a599efa; the suites that used it are deleted,
   their unique coverage ported to tests/browser/c23-characterization. Do not
   reintroduce marker comments to satisfy tests. */

/* ---- tiny assert layer (no dependencies) ---- */
let passed = 0;
const failures = [];
let current = '(none)';

function test(name, fn) {
  current = name;
  try {
    const result = fn();
    /* An async callback's assertions run AFTER this returns, so a failure
       inside one never reaches the catch below: the test prints a tick and the
       rejection surfaces later — as a crash under the runner, or not at all
       standalone. That is how a wrong assertion passed review-visible runs.
       Async setup belongs OUTSIDE test(); await it, then assert synchronously. */
    if (result && typeof result.then === 'function') {
      result.catch(() => {});
      throw new Error(
        'test() callback returned a promise. Await the async work before test(), ' +
        'then assert synchronously — otherwise failures are invisible here.');
    }
    passed++;
    console.log('  ✓ ' + name);
  } catch (err) {
    failures.push({ name, err });
    console.log('  ✗ ' + name + '\n      ' + (err && err.message));
  }
}

function group(name, fn) {
  console.log('\n' + name);
  fn();
}

function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error((msg ? msg + ': ' : '') + `expected ${b}, got ${a}`);
}
function ok(v, msg) { if (!v) throw new Error(msg || 'expected truthy, got ' + JSON.stringify(v)); }
function notOk(v, msg) { if (v) throw new Error(msg || 'expected falsy, got ' + JSON.stringify(v)); }

/* Async suites register their promises here; report() awaits every one BEFORE
   printing totals and setting the exit code, so a late assertion failure can
   never slip past the runner (Commit 1e harness correction). */
const _deferred = [];
function defer(p) { _deferred.push(p.catch((e) => { failures.push({ name: 'deferred scenario', err: e }); console.log('  ✗ deferred scenario threw: ' + (e && e.message)); })); return p; }
function report() {
  return Promise.all(_deferred).then(_finalReport);
}
function _finalReport() {
  console.log('\n' + '-'.repeat(52));
  if (failures.length) {
    console.log(`FAILED — ${passed} passed, ${failures.length} failed`);
    process.exitCode = 1;
  } else {
    console.log(`OK — ${passed} passed`);
  }
}

module.exports = { SRC, defer, test, group, eq, ok, notOk, report };
