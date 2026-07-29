// make-injection.mjs — derive the Commit 10 injection from the reviewed
// release candidate, mechanically.
//
// The injection is NOT hand-transcribed. It is computed as the difference
// between the generator's own .347 output and the reviewed RC, so the generated
// artifact is byte-identical to what the Architect reviewed by construction
// rather than by assertion.
//
//   node deployment-path/make-injection.mjs <ported-347.html> <reviewed-rc.html>
//
// Writes deployment-path/injections/commit10-client.json:
//   { release, sourceSha, rcSha, ops: [ {kind, find, replace} ... ] }
//
// Every op is anchored on the EXACT surrounding lines it replaces, so if the
// live product changes underneath, applying it fails loudly instead of
// producing a half-injected file. That is the same contract pb-port.mjs uses
// for its own replacements.
import fs from 'node:fs';
import crypto from 'node:crypto';

const [, , portedPath, rcPath] = process.argv;
if (!portedPath || !rcPath) {
  console.error('usage: make-injection.mjs <ported-347.html> <reviewed-rc.html>');
  process.exit(2);
}
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

const ported = fs.readFileSync(portedPath, 'utf8');
const rc = fs.readFileSync(rcPath, 'utf8');
const A = ported.split('\n');
const B = rc.split('\n');

/* Longest-common-subsequence opcodes, same shape as Python's difflib. Kept
   small and dependency-free: this runs inside the deploy pipeline. */
function opcodes(a, b) {
  const n = a.length, m = b.length;
  // Hirschberg is overkill; the files share a long common core, so trim first.
  let lo = 0;
  while (lo < n && lo < m && a[lo] === b[lo]) lo++;
  let hi = 0;
  while (hi < n - lo && hi < m - lo && a[n - 1 - hi] === b[m - 1 - hi]) hi++;
  const A2 = a.slice(lo, n - hi), B2 = b.slice(lo, m - hi);
  // classic DP over the trimmed middle
  const N = A2.length, M = B2.length;
  const dp = Array.from({ length: N + 1 }, () => new Int32Array(M + 1));
  for (let i = N - 1; i >= 0; i--) {
    for (let j = M - 1; j >= 0; j--) {
      dp[i][j] = A2[i] === B2[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  const push = (tag, i1, i2, j1, j2) => out.push([tag, i1 + lo, i2 + lo, j1 + lo, j2 + lo]);
  while (i < N && j < M) {
    if (A2[i] === B2[j]) { i++; j++; continue; }
    const si = i, sj = j;
    while (i < N && j < M && A2[i] !== B2[j]) {
      if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
    }
    push(i > si && j > sj ? 'replace' : (i > si ? 'delete' : 'insert'), si, i, sj, j);
  }
  if (i < N || j < M) push(i < N && j < M ? 'replace' : (i < N ? 'delete' : 'insert'), i, N, j, M);
  return out;
}

const ops = opcodes(A, B);
const CONTEXT = 3;
const built = [];

for (const [tag, i1, i2, j1, j2] of ops) {
  /* Anchor with context on both sides so `find` is unique in the file. */
  let c = CONTEXT;
  let find, replace;
  for (; c <= 40; c++) {
    const pre = A.slice(Math.max(0, i1 - c), i1);
    const post = A.slice(i2, i2 + c);
    find = [...pre, ...A.slice(i1, i2), ...post].join('\n');
    replace = [...pre, ...B.slice(j1, j2), ...post].join('\n');
    if (ported.split(find).length - 1 === 1) break;
  }
  if (ported.split(find).length - 1 !== 1) {
    console.error(`could not uniquely anchor ${tag} at live[${i1}:${i2}] even with ${c} lines of context`);
    process.exit(1);
  }
  built.push({ kind: tag, atLine: i1 + 1, addedLines: j2 - j1, find, replace });
}

const release = (rc.match(/APP_BUILD="([^"]*)"/) || [])[1] || '';
const out = {
  release,
  generatedFrom: { portedSha: sha(ported), rcSha: sha(rc) },
  opCount: built.length,
  ops: built,
};
fs.mkdirSync('deployment-path/injections', { recursive: true });
fs.writeFileSync('deployment-path/injections/commit10-client.json', JSON.stringify(out, null, 1));

/* Prove it reconstructs, here, before anything downstream trusts it. */
let check = ported;
for (const op of built) {
  if (check.split(op.find).length - 1 !== 1) { console.error('reconstruct: anchor not unique'); process.exit(1); }
  check = check.replace(op.find, op.replace);
}
if (sha(check) !== sha(rc)) { console.error('reconstruct: FAILED — does not reproduce the RC'); process.exit(1); }

console.log(`ops:           ${built.length}`);
built.forEach((o) => console.log(`  ${o.kind.padEnd(8)} line ${String(o.atLine).padStart(5)}  +${o.addedLines} lines`));
console.log(`release:       ${release}`);
console.log(`ported sha:    ${out.generatedFrom.portedSha}`);
console.log(`rc sha:        ${out.generatedFrom.rcSha}`);
console.log(`reconstructed: OK — applying these ops to the ported source reproduces the RC exactly`);
