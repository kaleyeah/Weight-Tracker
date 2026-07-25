/* Runs every *.test.js and the source syntax check. Dev-only. */
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');

let failed = 0;

// 1. the shipping file's script block must parse
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
const tmp = path.join(require('os').tmpdir(), '_cf_syntax_check.js');
fs.writeFileSync(tmp, m[1]);
try {
  execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
  console.log('✓ index.html script block parses');
} catch (e) {
  console.log('✗ index.html script block FAILED to parse\n' + e.stderr);
  failed++;
}

// 2. unit suites
for (const f of fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort()) {
  try {
    const out = execFileSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8' });
    console.log(out.trim().split('\n').pop() + '  — ' + f);
  } catch (e) {
    console.log('FAILED — ' + f + '\n' + (e.stdout || '') + (e.stderr || ''));
    failed++;
  }
}
process.exitCode = failed ? 1 : 0;
console.log(failed ? `\n${failed} suite(s) failed` : '\nAll suites passed');
