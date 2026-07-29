// inject-commit10.mjs — the FINAL ordered build step of the release pipeline.
//
//   live unported source
//       ↓  pb-port.mjs   (adapter transforms, then cutover transforms)
//       ↓  THIS STEP     (Commit 10 injection, last)
//   exact deployable index.html
//
// Architect ruling, release-candidate review: Commit 10 must be injected by the
// generator, not maintained by hand in the deployed file. Before this existed,
// a bug-fix build regenerated the artifact from the unported source — which has
// no Commit 10 — and would have silently shipped a client with no CAS at all.
//
// So the whole point of this file is to be LOUD. It refuses to emit an artifact
// it cannot fully vouch for, and every refusal names what it found instead.
//
//   node deployment-path/inject-commit10.mjs <ported.html> <out.html> [--expect-sha=<hex>]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const die = (code, msg) => { console.error(`FAIL [${code}] ${msg}`); process.exit(1); };

const args = process.argv.slice(2);
const portedPath = args[0];
const outPath = args[1];
const expect = (args.find((a) => a.startsWith('--expect-sha=')) || '').split('=')[1] || '';
if (!portedPath || !outPath) {
  console.error('usage: inject-commit10.mjs <ported.html> <out.html> [--expect-sha=<hex>]');
  process.exit(2);
}

const INJECTION = path.join(path.dirname(new URL(import.meta.url).pathname), 'injections', 'commit10-client.json');

/* ---- 1. the injection file must exist and be well formed ---------------- */
if (!fs.existsSync(INJECTION)) die('MISSING-INJECTION', `no injection file at ${INJECTION}`);
let inj;
try { inj = JSON.parse(fs.readFileSync(INJECTION, 'utf8')); }
catch (e) { die('BAD-INJECTION', `injection file is not valid JSON: ${e.message}`); }
if (!Array.isArray(inj.ops) || inj.ops.length === 0) die('EMPTY-INJECTION', 'injection has no ops');
if (!inj.release) die('NO-RELEASE', 'injection does not declare a release identifier');
for (const [i, op] of inj.ops.entries()) {
  if (typeof op.find !== 'string' || typeof op.replace !== 'string' || !op.find.length) {
    die('BAD-MARKER', `op ${i} is missing its find/replace markers`);
  }
}

let src = fs.readFileSync(portedPath, 'utf8');
const portedSha = sha(src);

/* ---- 2. the input must be the PORTED artifact, not the raw source ------- */
const adapterCount = src.split('function pbSave').length - 1;
if (adapterCount === 0) die('NO-ADAPTER', 'input has no PocketBase adapter — run pb-port.mjs --cutover first');
if (adapterCount > 1) die('DUP-ADAPTER', `PocketBase adapter appears ${adapterCount} times`);
if (src.includes('HARDENING — COMMIT 10')) die('ALREADY-INJECTED', 'input already contains Commit 10 — do not double-inject');

/* ---- 3. apply every op, each exactly once ------------------------------- */
for (const [i, op] of inj.ops.entries()) {
  const n = src.split(op.find).length - 1;
  if (n === 0) die('ANCHOR-MISSING', `op ${i} (${op.kind} near line ${op.atLine}) did not match. The live product changed underneath — regenerate the injection.`);
  if (n > 1) die('ANCHOR-AMBIGUOUS', `op ${i} matched ${n} times; it must match exactly once`);
  src = src.replace(op.find, op.replace);
}

/* ---- 4. the result must actually be a CAS client ------------------------ */
const injCount = src.split('HARDENING — COMMIT 10').length - 1;
if (injCount === 0) die('INJECTION-ABSENT', 'Commit 10 is not present after generation');
/* the marker appears once for COMMIT 10 and once for COMMIT 10b, by design */
if (injCount !== 2) die('INJECTION-COUNT', `expected the Commit 10 marker twice (10 and 10b), found ${injCount}`);

const adapterAt = src.indexOf('function pbSave');
const commit10At = src.indexOf('HARDENING — COMMIT 10');
if (!(adapterAt < commit10At)) die('ORDER', 'Commit 10 is ordered BEFORE the PocketBase adapter — its overrides would be shadowed');

/* the last definition wins in this file, so the FINAL scheduler must be ours */
const lastCore = src.lastIndexOf('scheduleCloudPush=function');
const lastTraining = src.lastIndexOf('scheduleTrainingPush=function');
if (lastCore < commit10At) die('SCHEDULER-CORE', 'the final scheduleCloudPush is not Commit 10\'s — a raw snapshot path would be live');
if (lastTraining < commit10At) die('SCHEDULER-TRAINING', 'the final scheduleTrainingPush is not Commit 10\'s');
if (!src.slice(lastCore, lastCore + 400).includes('cfCasSchedule')) die('SCHEDULER-NOT-CAS', 'the final core scheduler does not route to CAS');
if (!src.slice(lastTraining, lastTraining + 400).includes('cfCasSchedule')) die('SCHEDULER-NOT-CAS', 'the final training scheduler does not route to CAS');

/* ---- 5. release identity ------------------------------------------------ */
const build = (src.match(/APP_BUILD="([^"]*)"/) || [])[1] || '';
if (!build) die('NO-BUILD-STAMP', 'generated artifact has no APP_BUILD');
if (build !== inj.release) die('BUILD-MISMATCH', `generated build "${build}" != injection release "${inj.release}"`);

const outSha = sha(src);
if (expect && outSha !== expect) {
  die('HASH-MISMATCH', `generated ${outSha} but --expect-sha=${expect}`);
}

fs.writeFileSync(outPath, src);
console.log('Commit 10 injection: OK');
console.log(`  ops applied:   ${inj.ops.length}`);
console.log(`  input  sha256: ${portedSha}`);
console.log(`  output sha256: ${outSha}`);
console.log(`  output bytes:  ${Buffer.byteLength(src, 'utf8')}`);
console.log(`  release:       ${build}`);
console.log(`  adapter@${adapterAt} < commit10@${commit10At}  (CAS overrides win)`);
console.log(`  wrote ${outPath}`);
