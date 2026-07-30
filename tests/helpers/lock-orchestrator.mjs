// lock-orchestrator.mjs — DEV-ONLY test helper, never shipped.
//
// The suite's harness forbids async test() callbacks (assertions after the
// callback returns are invisible to it), and truly CONCURRENT child builds
// cannot be awaited from synchronous code — Atomics.wait blocks the very
// event loop that would deliver the children's exit events. So the
// concurrency lives here, in a child process the test invokes with
// execFileSync: this script spawns the contenders / holders, awaits them
// properly, and prints ONE JSON transcript for the test to assert on
// synchronously.
//
// argv[2] = JSON spec: { mode, builder, compound, buildDir, ... }
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const spec = JSON.parse(process.argv[2]);
const LOCK = path.join(spec.buildDir, '.build-lock');

const runBuild = (env) => new Promise((resolve) => {
  const c = spawn(process.execPath, [spec.builder, '--compound=' + spec.compound],
    { env: Object.assign({}, process.env, env || {}), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  c.stdout.on('data', (d) => { out += d; });
  c.stderr.on('data', (d) => { out += d; });
  c.on('close', (code) => resolve({ code, out, pid: c.pid }));
  c.on('error', (e) => resolve({ code: -1, out: String(e), pid: c.pid }));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (pred, what, ms = 20000) => {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error('orchestrator timeout waiting for ' + what);
    await sleep(25);
  }
};
const readLock = () => { try { return fs.readFileSync(LOCK, 'utf8'); } catch (e) { return null; } };
/* A holder that provably ACQUIRED (it writes .holding-<pid> only after the
   lock is its own) and then just sits on the lock via CF_TEST_HOLD_LOCK. */
const spawnHolder = (holdMs) => {
  const c = spawn(process.execPath, [spec.builder, '--compound=' + spec.compound],
    { env: Object.assign({}, process.env, { CF_TEST_HOLD_LOCK: String(holdMs) }), stdio: 'ignore' });
  const done = new Promise((r) => { c.on('close', (code, sig) => r(sig || code)); });
  const acquired = () => fs.existsSync(path.join(spec.buildDir, '.holding-' + c.pid));
  return { c, done, acquired };
};

const out = { mode: spec.mode };

if (spec.mode === 'contend') {
  /* N simultaneous builds against whatever lock the test planted. */
  out.results = await Promise.all(Array.from({ length: spec.count }, () => runBuild()));
  out.lockAfterRaw = readLock();

} else if (spec.mode === 'live-holder') {
  /* real live holder; optionally age its lock in place; run one contender. */
  const h = spawnHolder(spec.holdMs);
  await waitFor(h.acquired, 'holder acquisition');
  if (spec.ageLock) {
    const l = JSON.parse(readLock());
    l.startedAt = '1999-01-01T00:00:00.000Z';   /* age must never matter */
    fs.writeFileSync(LOCK, JSON.stringify(l));
  }
  out.holderPid = h.c.pid;
  out.holderLockRaw = readLock();
  out.loser = await runBuild();
  out.lockAfterLoserRaw = readLock();           /* did the loser touch it? */
  out.holderExit = await h.done;
  out.lockAfterHolderExitRaw = readLock();      /* holder removes ONLY its own */

} else if (spec.mode === 'supersede') {
  /* while the holder still runs, replace the lock with a NEWER owner's —
     the holder's exit handler must then leave it alone. */
  const h = spawnHolder(spec.holdMs);
  await waitFor(h.acquired, 'holder acquisition');
  fs.writeFileSync(LOCK, JSON.stringify(spec.newLock));
  out.holderPid = h.c.pid;
  out.holderExit = await h.done;
  out.lockAfterHolderExitRaw = readLock();

} else if (spec.mode === 'kill-holder') {
  /* SIGKILL: no exit handler runs — the crash-recovery surface. */
  const h = spawnHolder(spec.holdMs);
  await waitFor(h.acquired, 'holder acquisition');
  h.c.kill('SIGKILL');
  out.holderExit = await h.done;
  out.holderPid = h.c.pid;
  out.lockAfterKillRaw = readLock();

} else {
  throw new Error('unknown orchestrator mode: ' + spec.mode);
}

process.stdout.write(JSON.stringify(out));
