/* Compound Fitness — dev-only test harness.
   NOT shipped. Production remains a single framework-free index.html.

   Tests run against the REAL shipping source: each @testable-start/@testable-end
   block is sliced out of index.html and evaluated here, so the tests cannot
   silently drift from a copy of the logic. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

/** Extract every /* @testable-start NAME ... @testable-end NAME *\/ block. */
function testableBlocks(src) {
  const text = fs.readFileSync(src, 'utf8');
  const out = {};
  const re = /\/\*\s*@testable-start\s+(\S+)[^]*?\*\/([^]*?)\/\*\s*@testable-end\s+\1\s*\*\//g;
  let m;
  while ((m = re.exec(text)) !== null) out[m[1]] = (out[m[1]] || '') + m[2];
  return out;
}

/** Evaluate the named blocks in one sandbox and return the declared globals. */
function loadTestable(names) {
  const blocks = testableBlocks(SRC);
  const missing = names.filter((n) => !blocks[n]);
  if (missing.length) throw new Error('missing @testable block(s): ' + missing.join(', '));
  const sandbox = { console };
  vm.createContext(sandbox);
  for (const n of names) vm.runInContext(blocks[n], sandbox, { filename: `index.html#${n}` });
  return sandbox;
}

/* ---- tiny assert layer (no dependencies) ---- */
let passed = 0;
const failures = [];
let current = '(none)';

function test(name, fn) {
  current = name;
  try {
    fn();
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

function report() {
  console.log('\n' + '-'.repeat(52));
  if (failures.length) {
    console.log(`FAILED — ${passed} passed, ${failures.length} failed`);
    process.exitCode = 1;
  } else {
    console.log(`OK — ${passed} passed`);
  }
}

module.exports = { SRC, loadTestable, test, group, eq, ok, notOk, report };
