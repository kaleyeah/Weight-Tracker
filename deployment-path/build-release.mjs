// build-release.mjs — THE release build command. One invocation, one artifact.
//
//   node deployment-path/build-release.mjs --compound=<path-to-sister-repo>
//
// Structure (Architect DEPLOY-BUILD-01): the published release is invalidated
// FIRST — before any check can fail — and all work happens in a unique run
// directory. Publication is one atomic directory rename at the very end, so
// the world only ever sees release/ as either absent or a complete, matching
// artifact+manifest pair. The previous version wiped .build after its early
// checks, which meant NO-SOURCE / DIRTY-SOURCE / PORT-FAILED left yesterday's
// release sitting there looking like the result of the failed run. My package
// even claimed wipe-first while the code did wipe-late; the Architect read the
// code.
//
//   .build/
//     runs/<run-id>/          all work happens here
//       intermediate/         quarantined ported .347 (NOT a release)
//       candidate/            index.html + manifest.json, assembled
//     release/                atomic rename of candidate/, or absent
//
// Source identity (DEPLOY-BUILD-02) is enforced DIRECTLY: the injection
// declares the expected sister-repo commit and source sha256, and both are
// checked before the generator runs. A different commit with an identical
// source file is refused unless listed in compatibleSourceCommits — explicit
// policy, not accidental acceptance.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const BUILD = path.join(REPO, '.build');
const RELEASE = path.join(BUILD, 'release');
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const shaFile = (p) => sha(fs.readFileSync(p));
const die = (code, msg) => { console.error(`FAIL [${code}] ${msg}`); process.exit(1); };

/* ---- 0. INVALIDATE THE PUBLISHED RELEASE, before anything can fail ------ */
fs.rmSync(RELEASE, { recursive: true, force: true });
const RUN = path.join(BUILD, 'runs',
  new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid);
fs.rmSync(path.join(BUILD, 'runs'), { recursive: true, force: true });
fs.mkdirSync(path.join(RUN, 'intermediate'), { recursive: true });
fs.mkdirSync(path.join(RUN, 'candidate'), { recursive: true });

/* ---- injection spec ------------------------------------------------------ */
const INJECTION = path.join(HERE, 'injections', 'commit10-client.json');
if (!fs.existsSync(INJECTION)) die('MISSING-INJECTION', INJECTION);
const inj = JSON.parse(fs.readFileSync(INJECTION, 'utf8'));
const EXPECT_PORTED = inj.generatedFrom.portedSha;
const EXPECT_RELEASE = inj.generatedFrom.rcSha;
const RELEASE_BUILD = inj.release;
const EXPECT_SRC = inj.expectedSource || null;
if (!EXPECT_SRC || !EXPECT_SRC.commit || !EXPECT_SRC.sha256) {
  die('NO-SOURCE-SPEC', 'injection does not declare the expected source identity — regenerate with make-injection.mjs');
}

const args = Object.fromEntries(process.argv.slice(2)
  .filter((a) => a.startsWith('--'))
  .map((a) => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)]; }));
const COMPOUND = args.compound ? path.resolve(args.compound) : null;
if (!COMPOUND) die('USAGE', 'node deployment-path/build-release.mjs --compound=<sister-repo>');

const SRC = path.join(COMPOUND, 'Weight-Tracker-main', 'index.html');
const PORT = path.join(COMPOUND, 'tools', 'pb-port.mjs');
if (!fs.existsSync(SRC)) die('NO-SOURCE', SRC);
if (!fs.existsSync(PORT)) die('NO-GENERATOR', PORT);

/* ---- 1. source identity, enforced directly ------------------------------ */
console.log('step 1/5  verify source identity');
const srcSha = shaFile(SRC);
if (srcSha !== EXPECT_SRC.sha256) {
  die('SOURCE-SHA-MISMATCH',
    `source ${srcSha}\nexpected ${EXPECT_SRC.sha256}\n`
    + 'The live source moved. Re-derive the injection (make-injection.mjs) and re-review.');
}
let srcCommit = null;
try {
  srcCommit = execFileSync('git', ['-C', COMPOUND, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
} catch (e) { die('UNVERIFIED-COMMIT', 'cannot resolve the sister repo HEAD — the build must be attributable'); }
const dirty = execFileSync('git', ['-C', COMPOUND, 'status', '--porcelain', '--', 'Weight-Tracker-main/index.html'],
  { encoding: 'utf8' }).trim();
if (dirty) die('DIRTY-SOURCE', 'Weight-Tracker-main/index.html has uncommitted changes — commit them so the build is attributable');
let sourcePolicy = 'exact';
if (srcCommit !== EXPECT_SRC.commit) {
  const compat = EXPECT_SRC.compatibleSourceCommits || [];
  if (!compat.includes(srcCommit)) {
    die('SOURCE-COMMIT-MISMATCH',
      `HEAD is ${srcCommit}\nexpected ${EXPECT_SRC.commit}\n`
      + 'Identical bytes at a different commit is not accidental acceptance: list the commit in '
      + 'expectedSource.compatibleSourceCommits (with review) if it is genuinely equivalent.');
  }
  sourcePolicy = 'compatible-source-commit';
}

/* ---- 2. generator, untouched -------------------------------------------- */
console.log('step 2/5  pb-port.mjs --cutover');
const INTERMEDIATE_SRC = path.join(COMPOUND, 'Weight-Tracker-main', 'pb-cutover.html');
fs.rmSync(INTERMEDIATE_SRC, { force: true });
try {
  execFileSync(process.execPath, [PORT, '--cutover'], { cwd: path.dirname(PORT), stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) { die('PORT-FAILED', (e.stdout || '') + (e.stderr || '')); }
if (!fs.existsSync(INTERMEDIATE_SRC)) die('NO-INTERMEDIATE', 'pb-port.mjs did not produce pb-cutover.html');

/* quarantine into THIS RUN, out of the sister repo tree */
const intermediate = path.join(RUN, 'intermediate', 'pb-cutover.NOT-A-RELEASE.html');
fs.copyFileSync(INTERMEDIATE_SRC, intermediate);
fs.rmSync(INTERMEDIATE_SRC, { force: true });
fs.writeFileSync(path.join(RUN, 'intermediate', 'README.txt'),
  'INTERMEDIATE BUILD OUTPUT — NOT A RELEASE ARTIFACT.\n'
  + 'This is the ported .347 client WITHOUT Commit 10. Deploying it would ship\n'
  + 'a client with no CAS. The only deployable artifact is the pair published\n'
  + 'atomically to .build/release/ and named in its manifest.json.\n');

console.log('step 3/5  verify intermediate identity');
const portedSha = shaFile(intermediate);
if (portedSha !== EXPECT_PORTED) {
  die('INTERMEDIATE-MISMATCH',
    `ported output ${portedSha}\nexpected      ${EXPECT_PORTED}\n`
    + 'The generator no longer reproduces the recorded intermediate. Re-derive and re-review.');
}

/* ---- 3. inject Commit 10 ------------------------------------------------- */
console.log('step 4/5  inject Commit 10');
const artifact = path.join(RUN, 'candidate', 'index.html');
if (process.env.CF_TEST_FAIL === 'inject') die('TEST-INJECTED-FAILURE', 'CF_TEST_FAIL=inject');
try {
  const out = execFileSync(process.execPath,
    [path.join(HERE, 'inject-commit10.mjs'), intermediate, artifact, '--expect-sha=' + EXPECT_RELEASE],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  process.stdout.write(out.split('\n').map((l) => '          ' + l).join('\n') + '\n');
} catch (e) { die('INJECT-FAILED', (e.stdout || '') + (e.stderr || '')); }

/* ---- 4. manifest, then ATOMIC publish ------------------------------------ */
console.log('step 5/5  manifest + atomic publish');
const releaseSha = shaFile(artifact);
if (releaseSha !== EXPECT_RELEASE) die('RELEASE-MISMATCH', `${releaseSha} != ${EXPECT_RELEASE}`);
const build = (fs.readFileSync(artifact, 'utf8').match(/APP_BUILD="([^"]*)"/) || [])[1];
if (build !== RELEASE_BUILD) die('BUILD-MISMATCH', `${build} != ${RELEASE_BUILD}`);

let builderCommit = '(unknown)';
try { builderCommit = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch (e) { /* keep */ }

/* No timestamps and no run-ids in here: identical inputs must produce an
   identical manifest (DEPLOY-RC-V2-08). The run directory name carries the
   when; the manifest carries only the what. */
const manifest = {
  releaseBuild: RELEASE_BUILD,
  releaseSha256: releaseSha,
  releaseBytes: fs.statSync(artifact).size,
  artifact: 'index.html',
  sourceCommit: srcCommit,
  sourceSha256: srcSha,
  sourcePolicy,
  adapterGenerator: 'tools/pb-port.mjs --cutover',
  injectionSha256: shaFile(INJECTION),
  injectionOps: inj.ops.length,
  intermediateSha256: portedSha,
  builderCommit,
  command: 'node deployment-path/build-release.mjs --compound=<sister-repo>',
  rollback: {
    sha256: portedSha,
    bytes: fs.statSync(intermediate).size,
    note: 'current production (.347). Restore by deploying the previous root artifact, never the quarantined intermediate.',
  },
  testFailInjected: process.env.CF_TEST_FAIL ? String(process.env.CF_TEST_FAIL) : undefined,
};
if (process.env.CF_TEST_FAIL === 'manifest') die('TEST-INJECTED-FAILURE', 'CF_TEST_FAIL=manifest — manifest not written, nothing published');
fs.writeFileSync(path.join(RUN, 'candidate', 'manifest.json'), JSON.stringify(manifest, null, 1));

if (process.env.CF_TEST_FAIL === 'publish') die('TEST-INJECTED-FAILURE', 'CF_TEST_FAIL=publish — candidate complete but NOT published');
fs.renameSync(path.join(RUN, 'candidate'), RELEASE);   /* one rename publishes the pair */

console.log('\nRELEASE BUILD OK');
console.log(`  artifact  ${path.relative(REPO, path.join(RELEASE, 'index.html'))}`);
console.log(`  sha256    ${releaseSha}`);
console.log(`  build     ${RELEASE_BUILD}`);
console.log(`  bytes     ${manifest.releaseBytes}`);
console.log(`  manifest  ${path.relative(REPO, path.join(RELEASE, 'manifest.json'))}`);
console.log(`  source    ${srcCommit} (${sourcePolicy})`);
console.log(`  intermediate quarantined in ${path.relative(REPO, path.join(RUN, 'intermediate'))}`);
