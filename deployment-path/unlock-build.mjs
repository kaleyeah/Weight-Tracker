// unlock-build.mjs — deliberate, audited removal of a stuck build lock.
//
// Architect DEPLOY-LOCK-V2-03: a PID can be reused by the OS, so a crashed
// builder's lock can name a pid that now belongs to an unrelated live
// process. The builder then refuses forever — fail-safe, but stuck. Automatic
// recovery must NEVER handle this case (liveness is the only automatic
// signal, and here liveness lies), so the escape hatch is this command:
//
//   node deployment-path/unlock-build.mjs
//       shows the lock's metadata and liveness, removes NOTHING, and prints
//       the exact confirmation required;
//
//   node deployment-path/unlock-build.mjs --confirm=<token>
//       removes the lock only when <token> matches the lock's ownership
//       token exactly (for tokenless/legacy locks: the pid; for unparseable
//       locks: the literal string MALFORMED), and appends a dated record to
//       deployment-path/unlock-audit.log.
//
// Deliberately absent: any age-based logic, any automatic mode, any force
// flag. The operator must read the metadata and echo the identity back.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const LOCK = path.join(REPO, '.build', '.build-lock');
/* CF_UNLOCK_AUDIT redirects the audit trail for the test suite only —
   the record is always written somewhere before anything is removed */
const AUDIT = process.env.CF_UNLOCK_AUDIT || path.join(HERE, 'unlock-audit.log');
const die = (code, msg) => { console.error(`REFUSED [${code}] ${msg}`); process.exit(1); };

const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

if (!fs.existsSync(LOCK)) die('NO-LOCK', `nothing to unlock — ${LOCK} does not exist`);
const raw = fs.readFileSync(LOCK, 'utf8');
let lock = null;
try { lock = JSON.parse(raw); } catch (e) { /* malformed stays null */ }

const identity = lock === null ? 'MALFORMED'
  : (lock.token ? String(lock.token) : String(lock.pid));

console.log('BUILD LOCK METADATA');
console.log(`  path      ${LOCK}`);
if (lock === null) {
  console.log(`  content   UNPARSEABLE (${raw.length} bytes): ${JSON.stringify(raw.slice(0, 120))}`);
} else {
  console.log(`  pid       ${lock.pid} (${lock.pid && pidAlive(lock.pid) ? 'a process with this pid IS RUNNING — it may be the builder, or pid reuse' : 'no such process — the holder is dead'})`);
  console.log(`  startedAt ${lock.startedAt}`);
  console.log(`  token     ${lock.token || '(none — legacy lock)'}`);
}

const arg = process.argv.slice(2).find((a) => a.startsWith('--confirm='));
if (!arg) {
  console.log('\nNothing removed. To remove this lock deliberately, re-run with:');
  console.log(`  node deployment-path/unlock-build.mjs --confirm=${identity}`);
  console.log('Only do this after confirming no release build is actually running.');
  process.exit(1);
}
const given = arg.slice('--confirm='.length);
if (given !== identity) {
  die('CONFIRM-MISMATCH', 'the confirmation does not match this lock\'s identity — '
    + 'read the metadata above and echo the exact token (this prevents removing a lock that changed since you looked)');
}

/* re-read under no lock of our own: if the content changed between display
   and confirmation, the identity check above already fails on next run */
const now = fs.readFileSync(LOCK, 'utf8');
if (now !== raw) die('LOCK-CHANGED', 'the lock changed while you were confirming — re-run and re-read');

const record = {
  removedAt: new Date().toISOString(),
  operator: process.env.USER || process.env.LOGNAME || '(unknown)',
  confirmed: given,
  lockContent: raw,
};
fs.appendFileSync(AUDIT, JSON.stringify(record) + '\n');
fs.rmSync(LOCK, { force: true });
console.log(`\nREMOVED ${LOCK}`);
console.log(`AUDITED ${AUDIT}`);
