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

/* ---- -1. SINGLE FLIGHT (Architect DEPLOY-LOCK-V2) ------------------------
   The only CLAIM path is the atomic O_EXCL create. The V1 takeover renamed a
   fresh lock onto the stale one — but rename replaces its destination, so two
   contenders who both saw the same dead holder could BOTH proceed. And the V1
   exit handler removed whatever lock existed, even a newer owner's.

   V2 rules, per the accepted pattern:
   - every acquisition carries a cryptographically random ownership TOKEN;
   - stale locks are never renamed over: they are REMOVED, and only under a
     recovery mutex, only after re-reading that the content is byte-identical
     to the stale content this contender captured, and only after re-verifying
     the recorded pid is dead — then everyone loops back to O_EXCL create,
     where exactly one contender can win;
   - double-entry into recovery is safe by design: two removers of the SAME
     stale bytes just race one unlink (the second gets ENOENT) and both fall
     through to the create, which is exclusive. What the mutex prevents is the
     dangerous interleave — verifying stale, the winner claiming, and THEN
     unlinking the winner's new lock — because all unlinks re-verify content
     under the mutex, and a claim changes the content;
   - release verifies the lock still carries THIS process's token, under the
     same mutex, before removing anything. A process that never acquired, or
     was superseded, removes nothing;
   - liveness of a holder is decided by pid, never by age. */
const LOCK = path.join(BUILD, '.build-lock');
const RMUTEX = path.join(BUILD, '.build-lock-recovery');
const TOKEN = crypto.randomBytes(16).toString('hex');
fs.mkdirSync(BUILD, { recursive: true });

const sleepMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const readLockRaw = () => { try { return fs.readFileSync(LOCK, 'utf8'); } catch (e) { return null; } };
const parseLock = (raw) => { if (raw === null) return null; try { return JSON.parse(raw); } catch (e) { return { malformed: true }; } };

/* Serialises stale-lock REMOVAL only. Its own staleness (a recoverer that
   crashed mid-recovery) is handled by dead-pid takeover with plain removal,
   which is safe here precisely because double-entry into recovery is safe. */
const withRecoveryMutex = (fn) => {
  const deadline = Date.now() + 10000;
  for (;;) {
    try {
      fs.mkdirSync(RMUTEX);
      fs.writeFileSync(path.join(RMUTEX, 'owner.json'), JSON.stringify({ pid: process.pid, token: TOKEN }));
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let o = null;
      try { o = JSON.parse(fs.readFileSync(path.join(RMUTEX, 'owner.json'), 'utf8')); } catch (e2) { o = null; }
      if (o && o.pid && pidAlive(o.pid)) {
        if (Date.now() > deadline) die('RECOVERY-BUSY', 'another process has held the recovery mutex for >10s');
        sleepMs(50); continue;
      }
      /* dead or contentless recoverer: force it and retry the mkdir */
      try { fs.rmSync(RMUTEX, { recursive: true, force: true }); } catch (e2) { /* retry */ }
    }
  }
  try { return fn(); } finally {
    try { fs.rmSync(RMUTEX, { recursive: true, force: true }); } catch (e) { /* best effort */ }
  }
};

const acquireLock = () => {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const fd = fs.openSync(LOCK, 'wx');                     /* the ONLY claim path */
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, token: TOKEN, startedAt: new Date().toISOString() }));
      fs.closeSync(fd);
      return;
    } catch (e) { if (e.code !== 'EEXIST') throw e; }

    const raw = readLockRaw();
    if (raw === null) continue;                                /* vanished between — retry the create */
    const holder = parseLock(raw);
    if (holder && !holder.malformed && holder.pid && pidAlive(holder.pid)) {
      die('BUILD-IN-FLIGHT',
        `another release build is running (pid ${holder.pid}, started ${holder.startedAt}). ` +
        'Refusing — only one invocation may publish .build/release/.');
    }
    /* dead or malformed: verified removal, then back around to O_EXCL */
    withRecoveryMutex(() => {
      const now = readLockRaw();
      if (now !== null && now === raw) {                       /* still the exact bytes we judged stale */
        const h = parseLock(now);
        if (!h || h.malformed || !h.pid || !pidAlive(h.pid)) fs.rmSync(LOCK, { force: true });
      }
    });
    sleepMs(5 + Math.floor(Math.random() * 20));               /* decorrelate contenders */
  }
  die('LOCK-CONTENTION', 'could not acquire the build lock after 100 attempts');
};
acquireLock();

const releaseLock = () => {
  try {
    const cur = parseLock(readLockRaw());
    if (!cur || cur.token !== TOKEN) return;                   /* not ours — never touch it */
    withRecoveryMutex(() => {
      const again = parseLock(readLockRaw());
      if (again && again.token === TOKEN) fs.rmSync(LOCK, { force: true });
    });
  } catch (e) { /* never throw from an exit handler */ }
};
process.on('exit', releaseLock);

/* test-only: hold the acquired lock, then exit WITHOUT building. Lets the
   suite orchestrate real concurrent holders. Never reaches a manifest. */
if (process.env.CF_TEST_HOLD_LOCK) {
  fs.writeFileSync(path.join(BUILD, '.holding-' + process.pid), TOKEN);
  sleepMs(Number(process.env.CF_TEST_HOLD_LOCK) || 500);
  die('TEST-INJECTED-FAILURE', 'CF_TEST_HOLD_LOCK — held the lock, built nothing');
}

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

/* ---- the INTENDED release, recorded independently of the injection -------
   Every expectation above comes out of the injection itself, so the injection
   was self-certifying: revert it to a .348 copy and the build succeeded, quietly
   emitting the OLD client for the selector to hand over as "the release".
   FIX003-PIPE-06 planted exactly that and watched it report success.

   RELEASE.expected.json is the second opinion. It is committed, reviewed, and
   changed in the SAME commit as the injection whenever the release changes —
   which is the point: two files must agree, and disagreement is fatal here
   rather than silent. Checked before any work, and again on the produced bytes
   below. */
const EXPECTED_FILE = path.join(HERE, 'RELEASE.expected.json');
let EXPECTED = null;
if (fs.existsSync(EXPECTED_FILE)) {
  try { EXPECTED = JSON.parse(fs.readFileSync(EXPECTED_FILE, 'utf8')); }
  catch (e) { die('BAD-RELEASE-EXPECTATION', `${EXPECTED_FILE}: ${e.message}`); }
  if (!EXPECTED.sha256 || !EXPECTED.build) {
    die('BAD-RELEASE-EXPECTATION', 'RELEASE.expected.json must declare build and sha256');
  }
  if (inj.release !== EXPECTED.build || inj.generatedFrom.rcSha !== EXPECTED.sha256) {
    die('RELEASE-EXPECTATION-MISMATCH',
      `the injection on disk produces ${inj.release} (${inj.generatedFrom.rcSha}),\n`
      + `        but the intended release is ${EXPECTED.build} (${EXPECTED.sha256}).\n`
      + '        Either the injection is stale/reverted, or the expectation was not updated.\n'
      + '        Regenerate the injection from the reviewed candidate, or update\n'
      + '        RELEASE.expected.json in the same reviewed commit. Refusing to build.');
  }
} else {
  console.log('  (no RELEASE.expected.json — building whatever the injection declares)');
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
/* second opinion, on the produced bytes rather than the declaration */
if (EXPECTED) {
  if (releaseSha !== EXPECTED.sha256 || build !== EXPECTED.build) {
    die('RELEASE-EXPECTATION-MISMATCH',
      `produced ${build} (${releaseSha}), intended ${EXPECTED.build} (${EXPECTED.sha256})`);
  }
  if (EXPECTED.bytes && fs.statSync(artifact).size !== EXPECTED.bytes) {
    die('RELEASE-EXPECTATION-MISMATCH',
      `produced ${fs.statSync(artifact).size} bytes, intended ${EXPECTED.bytes}`);
  }
}

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
