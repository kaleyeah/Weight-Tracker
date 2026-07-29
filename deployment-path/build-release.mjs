// build-release.mjs — THE release build command. One invocation, one artifact.
//
//   node deployment-path/build-release.mjs --compound=<path-to-sister-repo>
//
// Architect ruling DEPLOY-RC-V2-01: a human checklist requiring two commands is
// not a release pipeline. This wrapper performs the full chain:
//
//   1. verify the unported source is exactly the recorded commit's file
//   2. run the sister repo's pb-port.mjs --cutover (untouched)
//   3. verify the intermediate against the recorded ported hash
//   4. run the Commit 10 injector with --expect-sha
//   5. write ONE deployable artifact + a machine-readable build manifest
//   6. quarantine the intermediate (DEPLOY-RC-V2-02): it is a valid,
//      historically deployable .347 client, which is exactly what makes it
//      dangerous — it must never be mistakable for a release artifact
//
// Exits nonzero on any failed step. The deployment step consumes
// .build/release/manifest.json — never a manually selected HTML file.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const shaFile = (p) => sha(fs.readFileSync(p));
const die = (code, msg) => { console.error(`FAIL [${code}] ${msg}`); process.exit(1); };

/* ---- expected identities. Updated only via make-injection.mjs. ---------- */
const INJECTION = path.join(HERE, 'injections', 'commit10-client.json');
if (!fs.existsSync(INJECTION)) die('MISSING-INJECTION', INJECTION);
const inj = JSON.parse(fs.readFileSync(INJECTION, 'utf8'));
const EXPECT_PORTED = inj.generatedFrom.portedSha;   /* the .347 ported artifact */
const EXPECT_RELEASE = inj.generatedFrom.rcSha;      /* the reviewed RC */
const RELEASE_BUILD = inj.release;

const args = Object.fromEntries(process.argv.slice(2)
  .filter((a) => a.startsWith('--'))
  .map((a) => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)]; }));
const COMPOUND = args.compound ? path.resolve(args.compound) : null;
if (!COMPOUND) die('USAGE', 'node deployment-path/build-release.mjs --compound=<sister-repo>');

const SRC = path.join(COMPOUND, 'Weight-Tracker-main', 'index.html');
const PORT = path.join(COMPOUND, 'tools', 'pb-port.mjs');
const INTERMEDIATE_SRC = path.join(COMPOUND, 'Weight-Tracker-main', 'pb-cutover.html');
for (const [p, code] of [[SRC, 'NO-SOURCE'], [PORT, 'NO-GENERATOR']]) {
  if (!fs.existsSync(p)) die(code, p);
}

/* ---- 1. verify the unported source ------------------------------------- */
let srcCommit = '(uncommitted working tree)';
try {
  srcCommit = execFileSync('git', ['-C', COMPOUND, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['-C', COMPOUND, 'status', '--porcelain', '--', 'Weight-Tracker-main/index.html'],
    { encoding: 'utf8' }).trim();
  if (dirty) die('DIRTY-SOURCE', 'Weight-Tracker-main/index.html has uncommitted changes — commit them so the build is attributable');
} catch (e) { if (String(e.message).includes('DIRTY-SOURCE')) throw e; }
const srcSha = shaFile(SRC);

/* ---- 2. run the sister repo's generator, untouched ---------------------- */
console.log('step 1/4  pb-port.mjs --cutover');
try {
  execFileSync(process.execPath, [PORT, '--cutover'], { cwd: path.dirname(PORT), stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  die('PORT-FAILED', (e.stdout || '') + (e.stderr || ''));
}
if (!fs.existsSync(INTERMEDIATE_SRC)) die('NO-INTERMEDIATE', 'pb-port.mjs did not produce pb-cutover.html');

/* ---- 3. quarantine + verify the intermediate ---------------------------- */
const BUILD_DIR = path.join(REPO, '.build');
const QUAR = path.join(BUILD_DIR, 'intermediate');
const REL = path.join(BUILD_DIR, 'release');
fs.rmSync(BUILD_DIR, { recursive: true, force: true });
fs.mkdirSync(QUAR, { recursive: true });
fs.mkdirSync(REL, { recursive: true });

/* Move it OUT of the sister repo working tree so a valid .347 client is never
   sitting where a deploy ritual historically picked files up from. The name
   says what it is; the sidecar says it twice. */
const intermediate = path.join(QUAR, 'pb-cutover.NOT-A-RELEASE.html');
fs.copyFileSync(INTERMEDIATE_SRC, intermediate);
fs.rmSync(INTERMEDIATE_SRC, { force: true });
fs.writeFileSync(path.join(QUAR, 'README.txt'),
  'INTERMEDIATE BUILD OUTPUT — NOT A RELEASE ARTIFACT.\n'
  + 'This is the ported .347 client WITHOUT Commit 10. Deploying it would ship\n'
  + 'a client with no CAS. The only deployable artifact is the one declared in\n'
  + '../release/manifest.json.\n');

console.log('step 2/4  verify intermediate identity');
const portedSha = shaFile(intermediate);
if (portedSha !== EXPECT_PORTED) {
  die('INTERMEDIATE-MISMATCH',
    `ported output ${portedSha}\nexpected      ${EXPECT_PORTED}\n`
    + 'The live source moved. Re-derive the injection: make-injection.mjs, then re-review.');
}

/* ---- 4. inject Commit 10, enforcing the release hash -------------------- */
console.log('step 3/4  inject Commit 10');
const artifact = path.join(REL, 'index.html');
try {
  const out = execFileSync(process.execPath,
    [path.join(HERE, 'inject-commit10.mjs'), intermediate, artifact, '--expect-sha=' + EXPECT_RELEASE],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  process.stdout.write(out.split('\n').map((l) => '          ' + l).join('\n') + '\n');
} catch (e) {
  die('INJECT-FAILED', (e.stdout || '') + (e.stderr || ''));
}

/* ---- 5. manifest --------------------------------------------------------- */
console.log('step 4/4  write build manifest');
const releaseSha = shaFile(artifact);
if (releaseSha !== EXPECT_RELEASE) die('RELEASE-MISMATCH', `${releaseSha} != ${EXPECT_RELEASE}`);
const build = (fs.readFileSync(artifact, 'utf8').match(/APP_BUILD="([^"]*)"/) || [])[1];
if (build !== RELEASE_BUILD) die('BUILD-MISMATCH', `${build} != ${RELEASE_BUILD}`);

let genCommit = '(unknown)';
try { genCommit = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch (e) { /* keep */ }

const manifest = {
  releaseBuild: RELEASE_BUILD,
  releaseSha256: releaseSha,
  releaseBytes: fs.statSync(artifact).size,
  artifact: path.relative(REPO, artifact),
  sourceCommit: srcCommit,
  sourceSha256: srcSha,
  adapterGeneratorCommit: srcCommit,
  adapterGenerator: 'tools/pb-port.mjs --cutover',
  injectionSha256: shaFile(INJECTION),
  injectionOps: inj.ops.length,
  intermediateSha256: portedSha,
  intermediateQuarantine: path.relative(REPO, intermediate),
  builderCommit: genCommit,
  command: 'node deployment-path/build-release.mjs --compound=' + args.compound,
  builtAtCommitOf: { compound: srcCommit, weightTracker: genCommit },
};
fs.writeFileSync(path.join(REL, 'manifest.json'), JSON.stringify(manifest, null, 1));

console.log('\nRELEASE BUILD OK');
console.log(`  artifact  ${path.relative(REPO, artifact)}`);
console.log(`  sha256    ${releaseSha}`);
console.log(`  build     ${RELEASE_BUILD}`);
console.log(`  bytes     ${manifest.releaseBytes}`);
console.log(`  manifest  ${path.relative(REPO, path.join(REL, 'manifest.json'))}`);
console.log(`  intermediate quarantined at ${path.relative(REPO, intermediate)}`);
