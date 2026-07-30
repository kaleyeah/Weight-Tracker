// select-artifact.mjs — the deployment preflight. The ONLY way an artifact
// reaches deployment.
//
//   node deployment-path/select-artifact.mjs            # verify + print the path
//   node deployment-path/select-artifact.mjs --copy-to=<dest>
//
// Architect DEPLOY-BUILD-03: manifest consumption must not be documentation.
// This command reads .build/release/manifest.json, re-verifies everything it
// claims against the artifact beside it, refuses anything else, and records
// exactly what it selected. The deploy ritual takes THIS command's output —
// never a hand-picked HTML file, and never the quarantined intermediate.
//
// Because build-release invalidates .build/release/ before any step can fail,
// a manifest that exists here is by construction the product of the LAST
// SUCCESSFUL run — a failed build leaves nothing for this command to select.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const RELEASE = path.join(REPO, '.build', 'release');
const die = (code, msg) => { console.error(`REFUSED [${code}] ${msg}`); process.exit(1); };
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

const args = Object.fromEntries(process.argv.slice(2)
  .filter((a) => a.startsWith('--'))
  .map((a) => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)]; }));

const manifestPath = path.join(RELEASE, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  die('NO-MANIFEST', 'no published release. Either no build has run, or the last build FAILED '
    + 'and correctly published nothing. Run build-release.mjs.');
}
let man;
try { man = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
catch (e) { die('BAD-MANIFEST', e.message); }

if (man.testFailInjected) {
  die('TEST-BUILD', `this release was built with CF_TEST_FAIL=${man.testFailInjected} set — test builds are not deployable`);
}

const artifactPath = path.join(RELEASE, man.artifact || '');
if (!man.artifact || man.artifact.includes('..') || man.artifact.includes('/')) {
  die('BAD-ARTIFACT-PATH', `manifest artifact must be a bare filename inside release/: "${man.artifact}"`);
}
if (!fs.existsSync(artifactPath)) die('NO-ARTIFACT', artifactPath);

/* the intermediate must never be selectable, by name or by content */
if (/NOT-A-RELEASE/i.test(man.artifact)) die('INTERMEDIATE', 'the manifest names a quarantined intermediate');
const actualSha = sha(artifactPath);
if (man.intermediateSha256 && actualSha === man.intermediateSha256) {
  die('INTERMEDIATE', 'the artifact\'s content IS the ported intermediate — a client with no CAS');
}

const actualBytes = fs.statSync(artifactPath).size;
if (actualSha !== man.releaseSha256) die('HASH-MISMATCH', `artifact ${actualSha}\nmanifest ${man.releaseSha256}`);
if (actualBytes !== man.releaseBytes) die('BYTES-MISMATCH', `artifact ${actualBytes} bytes, manifest says ${man.releaseBytes}`);

const build = (fs.readFileSync(artifactPath, 'utf8').match(/APP_BUILD="([^"]*)"/) || [])[1];
if (build !== man.releaseBuild) die('BUILD-MISMATCH', `artifact build "${build}", manifest says "${man.releaseBuild}"`);

/* The reviewed release expectation must have gated this build, and must still
   describe it (Architect RELEASE-EXPECT-10). Without this, an artifact built
   before the expectation existed — or against a since-changed one — could still
   be selected for deployment, which reopens the self-certifying hole one level
   further down the pipeline. */
const EXPECTED_FILE = path.join(REPO, 'deployment-path', 'RELEASE.expected.json');
if (!man.expectationSha256) {
  die('NO-EXPECTATION-IDENTITY',
    'this release was built without a recorded RELEASE.expected.json identity — rebuild with the current builder');
}
if (!fs.existsSync(EXPECTED_FILE)) die('NO-RELEASE-EXPECTATION', EXPECTED_FILE);
if (sha(EXPECTED_FILE) !== man.expectationSha256) {
  die('EXPECTATION-CHANGED',
    'RELEASE.expected.json has changed since this artifact was built — rebuild so the\n'
    + '         intended release and the artifact are gated by the same reviewed expectation');
}
let expected;
try { expected = JSON.parse(fs.readFileSync(EXPECTED_FILE, 'utf8')); }
catch (e) { die('BAD-RELEASE-EXPECTATION', e.message); }
if (expected.sha256 !== actualSha || expected.build !== build
    || (expected.bytes && expected.bytes !== actualBytes)) {
  die('EXPECTATION-MISMATCH',
    `the intended release is ${expected.build} (${expected.sha256}, ${expected.bytes} bytes),\n`
    + `         but this artifact is ${build} (${actualSha}, ${actualBytes} bytes)`);
}

/* record exactly what was selected, beside the artifact */
const record = {
  selected: man.artifact,
  sha256: actualSha,
  bytes: actualBytes,
  build,
  sourceCommit: man.sourceCommit,
  builderCommit: man.builderCommit,
};
fs.writeFileSync(path.join(RELEASE, 'SELECTED.json'), JSON.stringify(record, null, 1));

if (args['copy-to']) {
  /* Atomic, fail-clean (Architect DEPLOY-PKG-02). The previous version copied
     straight onto the destination and verified afterwards — a crash mid-copy
     could leave the destination half-overwritten with unverified bytes, which
     for a deploy target means a torn client. Now: temp file in the SAME
     directory (rename is only atomic within a filesystem), fsync, verify,
     rename. On any failure the temp is removed and the destination is
     untouched. */
  const dest = path.resolve(args['copy-to']);
  const tmp = path.join(path.dirname(dest), '.cf-copy-' + process.pid + '-' + path.basename(dest));
  try {
    fs.copyFileSync(artifactPath, tmp);
    const fd = fs.openSync(tmp, 'r+');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    if (process.env.CF_TEST_FAIL_COPY === 'YES') {
      throw Object.assign(new Error('CF_TEST_FAIL_COPY=YES — injected failure after temp write'), { code: 'TEST' });
    }
    if (sha(tmp) !== actualSha) throw Object.assign(new Error('temp copy does not match the verified artifact'), { code: 'COPY-CORRUPT' });
    if (fs.statSync(tmp).size !== actualBytes) throw Object.assign(new Error('temp copy byte count mismatch'), { code: 'COPY-CORRUPT' });
    fs.renameSync(tmp, dest);
  } catch (e) {
    try { fs.rmSync(tmp, { force: true }); } catch (e2) { /* best effort */ }
    die(e.code === 'TEST' ? 'TEST-COPY-FAIL' : (e.code || 'COPY-FAILED'), e.message + ' — destination untouched');
  }
  console.log(`SELECTED ${artifactPath}`);
  console.log(`COPIED   ${dest}`);
} else {
  console.log(`SELECTED ${artifactPath}`);
}
console.log(`  sha256 ${actualSha}`);
console.log(`  bytes  ${actualBytes}`);
console.log(`  build  ${build}`);
