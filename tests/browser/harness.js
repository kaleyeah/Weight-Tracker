/* Async assertion harness for the browser suite.
   tests/harness.js deliberately REFUSES a promise-returning callback, because
   in that suite an async assertion failure would be invisible. Here the whole
   point is asynchrony, so this harness awaits every test and reports failures
   itself — the property tests/harness.js protects is preserved, not bypassed. */
const results = [];
let failures = 0, passes = 0;

function section(name) { console.log('\n' + name); results.push({ section: name }); }

async function test(name, fn) {
  try {
    await fn();
    passes++; results.push({ name, ok: true });
    console.log('  ✓ ' + name);
  } catch (e) {
    failures++; results.push({ name, ok: false, err: String((e && e.message) || e) });
    console.log('  ✗ ' + name + '\n      ' + ((e && e.message) || e));
  }
}

function ok(v, msg) { if (!v) throw new Error(msg || ('expected truthy, got ' + JSON.stringify(v))); }
function notOk(v, msg) { if (v) throw new Error(msg || ('expected falsy, got ' + JSON.stringify(v))); }
function eq(a, b, msg) {
  if (a !== b) throw new Error(msg || ('expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)));
}

function summary(title) {
  console.log('\n' + '-'.repeat(56));
  const line = failures
    ? 'FAILED — ' + passes + ' passed, ' + failures + ' failed  — ' + title
    : 'OK — ' + passes + ' passed, 0 failed  — ' + title;
  console.log(line);
  /* A failing suite must EXIT nonzero. This returned the count and set nothing,
     so every browser suite exited 0 while printing FAILED — any gate keyed on
     the exit status would have reported green on red. Found 2026-07-30 while
     adding the ownership-gate suite, whose first run failed 5 of 8 and still
     exited 0. Verify-before-commit chains grep the transcript, which is why
     this never shipped a bad commit; that is luck, not a guarantee. */
  if (failures) process.exitCode = 1;
  return failures;
}

module.exports = { section, test, ok, notOk, eq, summary, results };
