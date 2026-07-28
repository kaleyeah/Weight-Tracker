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
  return failures;
}

module.exports = { section, test, ok, notOk, eq, summary, results };
