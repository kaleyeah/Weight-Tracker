/* DEPLOY-RC-01..12 — permanent release-pipeline regressions.

   These exist because of a specific hazard. Before the Commit 10 injection step,
   the generator rebuilt the deployed artifact from the UNPORTED source — which
   contains no Commit 10 — so a routine bug-fix build would have silently
   shipped a client with no CAS at all, reverting the whole commit with nothing
   in the ritual to catch it.

   So most of these tests assert that the generator REFUSES. A generator that
   quietly emits a non-CAS client is the failure mode; a nonzero exit is the
   feature.

   Requires the sister repo (the unported source and pb-port.mjs). Skips cleanly
   when it is not present, so the string suite still runs on a bare checkout. */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { test, group, eq, ok, notOk, report } = require('./harness');

const ROOT = path.join(__dirname, '..');
const INJECTOR = path.join(ROOT, 'deployment-path', 'inject-commit10.mjs');
const INJECTION = path.join(ROOT, 'deployment-path', 'injections', 'commit10-client.json');
/* The generator's .347 output, i.e. the input this step consumes. After a
   build-release run the file no longer sits in the sister repo tree — the
   build QUARANTINES it (DEPLOY-RC-V2-02), which broke the original default
   here. The quarantined copy is the same bytes under an honest name, so it is
   a legitimate test input; sha verification below still gates it. */
const CANDIDATES = [
  process.env.CF_PORTED,
  path.join(ROOT, '.build', 'intermediate', 'pb-cutover.NOT-A-RELEASE.html'),
  path.join(os.homedir(), '..', 'griffin', 'projects', 'compound', 'Weight-Tracker-main', 'pb-cutover.html'),
].filter(Boolean);
const PORTED = CANDIDATES.find((p_) => fs.existsSync(p_)) || CANDIDATES[CANDIDATES.length - 1];
const RC = path.join(ROOT, 'index.html');

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-deployrc-'));

/* Run the injector. Returns {code, out}. Never throws on nonzero — a refusal is
   the thing under test. */
function run(portedFile, outFile, extra = []) {
  try {
    const out = execFileSync(process.execPath, [INJECTOR, portedFile, outFile, ...extra],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status === undefined ? -1 : e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
}

/* The injection records the exact ported artifact it was derived from. Running
   against a DIFFERENT one is not a regression — it is the wrong input, and the
   injector correctly refuses it. So check that first and skip, rather than
   reporting eleven failures that all mean "you pointed me at a stale file".
   A local clone of the sister repo sitting at an older commit is exactly how
   this happens. */
const injOnDisk = fs.existsSync(INJECTION) ? JSON.parse(fs.readFileSync(INJECTION, 'utf8')) : null;
const expectedPortedSha = injOnDisk && injOnDisk.generatedFrom && injOnDisk.generatedFrom.portedSha;
const havePorted = fs.existsSync(PORTED)
  && expectedPortedSha
  && sha(PORTED) === expectedPortedSha;

if (!havePorted) {
  console.log('\nDEPLOY-RC-01..12 — SKIPPED');
  if (!fs.existsSync(PORTED)) {
    console.log('  no ported artifact at ' + PORTED);
  } else {
    console.log('  ported artifact at ' + PORTED);
    console.log('    is      ' + sha(PORTED));
    console.log('    expected ' + expectedPortedSha);
    console.log('  That file is not the one this injection was derived from.');
  }
  console.log('  Set CF_PORTED=<pb-cutover.html generated from the recorded source> to run these.');
  report();
} else {
  const ported = fs.readFileSync(PORTED, 'utf8');
  const inj = JSON.parse(fs.readFileSync(INJECTION, 'utf8'));

  group('DEPLOY-RC — the generator produces a CAS client, or refuses', () => {
    const good = path.join(TMP, 'generated.html');
    const r = run(PORTED, good);

    test('DEPLOY-RC-01 the generator appends the Commit 10 injection exactly once', () => {
      eq(r.code, 0, r.out);
      const s = fs.readFileSync(good, 'utf8');
      /* the marker appears for COMMIT 10 and COMMIT 10b — that pair, once */
      eq(s.split('HARDENING — COMMIT 10:').length - 1, 1, 'COMMIT 10 block count');
      eq(s.split('HARDENING — COMMIT 10b:').length - 1, 1, 'COMMIT 10b block count');
    });

    test('DEPLOY-RC-02 the PocketBase adapter precedes Commit 10', () => {
      const s = fs.readFileSync(good, 'utf8');
      const a = s.indexOf('function pbSave');
      const c = s.indexOf('HARDENING — COMMIT 10');
      ok(a >= 0 && c >= 0, 'both markers must be present');
      ok(a < c, `adapter at ${a} must precede Commit 10 at ${c}`);
    });

    test('DEPLOY-RC-03 a missing injection file fails nonzero', () => {
      const stash = INJECTION + '.stashed';
      fs.renameSync(INJECTION, stash);
      try {
        const x = run(PORTED, path.join(TMP, 'no-inj.html'));
        notOk(x.code === 0, 'must not succeed without the injection file');
        ok(/MISSING-INJECTION/.test(x.out), x.out);
      } finally { fs.renameSync(stash, INJECTION); }
    });

    test('DEPLOY-RC-04 a missing injection marker fails nonzero', () => {
      const broken = JSON.parse(JSON.stringify(inj));
      broken.ops[0].find = '';
      const p = path.join(TMP, 'broken-marker.json');
      const stash = INJECTION + '.stashed';
      fs.renameSync(INJECTION, stash);
      fs.writeFileSync(INJECTION, JSON.stringify(broken));
      try {
        const x = run(PORTED, path.join(TMP, 'bad-marker.html'));
        notOk(x.code === 0);
        ok(/BAD-MARKER/.test(x.out), x.out);
      } finally { fs.unlinkSync(INJECTION); fs.renameSync(stash, INJECTION); fs.rmSync(p, { force: true }); }
    });

    test('DEPLOY-RC-05 a duplicated injection fails nonzero', () => {
      /* feed it an input that already contains Commit 10 */
      const already = path.join(TMP, 'already.html');
      fs.copyFileSync(good, already);
      const x = run(already, path.join(TMP, 'double.html'));
      notOk(x.code === 0, 'double injection must be refused');
      ok(/ALREADY-INJECTED/.test(x.out), x.out);
    });

    test('DEPLOY-RC-06 the final core scheduler is Commit 10\'s', () => {
      const s = fs.readFileSync(good, 'utf8');
      const last = s.lastIndexOf('scheduleCloudPush=function');
      const c10 = s.indexOf('HARDENING — COMMIT 10');
      ok(last > c10, 'the last definition must come from Commit 10');
      ok(s.slice(last, last + 400).includes('cfCasSchedule'), 'and must route to CAS');
    });

    test('DEPLOY-RC-07 the final training scheduler is Commit 10\'s', () => {
      const s = fs.readFileSync(good, 'utf8');
      const last = s.lastIndexOf('scheduleTrainingPush=function');
      const c10 = s.indexOf('HARDENING — COMMIT 10');
      ok(last > c10);
      ok(s.slice(last, last + 400).includes('cfCasSchedule'));
    });

    test('DEPLOY-RC-08 no active raw core/training snapshot write path remains', () => {
      const s = fs.readFileSync(good, 'utf8');
      /* the legacy raw path is only safe if the LAST word on both schedulers is
         Commit 10's; assert positively rather than grepping for absence, because
         the old code legitimately still exists earlier in the file */
      const c10 = s.indexOf('HARDENING — COMMIT 10');
      ok(s.lastIndexOf('scheduleCloudPush=function') > c10);
      ok(s.lastIndexOf('scheduleTrainingPush=function') > c10);
      /* and the CAS commit route is what the client actually calls */
      ok(s.includes('/api/cf/appdata/commit'), 'the CAS route must be present');
    });

    test('DEPLOY-RC-09 the generated build identifier matches the release', () => {
      const s = fs.readFileSync(good, 'utf8');
      const build = (s.match(/APP_BUILD="([^"]*)"/) || [])[1];
      eq(build, inj.release, 'generated build vs injection release');
      const rcBuild = (fs.readFileSync(RC, 'utf8').match(/APP_BUILD="([^"]*)"/) || [])[1];
      eq(build, rcBuild, 'generated build vs the reviewed candidate');
    });

    test('DEPLOY-RC-10 the generated artifact hash matches the reviewed candidate', () => {
      eq(sha(good), sha(RC),
        'the generated file must be byte-identical to the artifact supplied for deployment');
    });

    test('DEPLOY-RC-10b --expect-sha refuses a mismatch', () => {
      const x = run(PORTED, path.join(TMP, 'expect.html'), ['--expect-sha=' + '0'.repeat(64)]);
      notOk(x.code === 0, 'a wrong expected hash must fail');
      ok(/HASH-MISMATCH/.test(x.out), x.out);
    });

    test('DEPLOY-RC-11 regenerating from identical inputs is deterministic', () => {
      const a = path.join(TMP, 'det-a.html'), b = path.join(TMP, 'det-b.html');
      eq(run(PORTED, a).code, 0);
      eq(run(PORTED, b).code, 0);
      eq(sha(a), sha(b), 'two runs must produce the same bytes');
      eq(sha(a), sha(RC));
    });

    test('DEPLOY-RC-12 a live-source change survives regeneration without dropping Commit 10', () => {
      /* Simulate the exact hazard: the live product ships a fix, the artifact is
         regenerated, and Commit 10 must still be there afterwards. */
      const marker = 'CF_LIVE_CHANGE_PROBE_' + inj.release.replace(/\W/g, '');
      const anchor = 'function todayChecklistHTML(';
      ok(ported.includes(anchor), 'anchor for the simulated change must exist');
      const changed = path.join(TMP, 'changed-live.html');
      fs.writeFileSync(changed, ported.replace(anchor, `/* ${marker} */\n` + anchor));
      const out = path.join(TMP, 'changed-generated.html');
      const x = run(changed, out);
      eq(x.code, 0, 'regeneration after a live change must succeed: ' + x.out);
      const s = fs.readFileSync(out, 'utf8');
      ok(s.includes(marker), 'the live change must be present in the generated artifact');
      ok(s.includes('HARDENING — COMMIT 10'), 'and Commit 10 must NOT have been dropped');
      ok(s.lastIndexOf('scheduleCloudPush=function') > s.indexOf('HARDENING — COMMIT 10'),
        'and CAS must still own the scheduler');
    });
  });

  group('DEPLOY-RC-V2 — one authoritative build command', () => {
    const BUILDER = path.join(ROOT, 'deployment-path', 'build-release.mjs');
    const COMPOUND = process.env.CF_COMPOUND || path.dirname(path.dirname(PORTED));
    const runBuild = () => {
      try {
        const out = execFileSync(process.execPath, [BUILDER, '--compound=' + COMPOUND],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        return { code: 0, out };
      } catch (e) {
        return { code: e.status === undefined ? -1 : e.status, out: (e.stdout || '') + (e.stderr || '') };
      }
    };

    test('DEPLOY-RC-V2-01 one command produces the release artifact and manifest', () => {
      const r = runBuild();
      eq(r.code, 0, r.out);
      const man = JSON.parse(fs.readFileSync(path.join(ROOT, '.build', 'release', 'manifest.json'), 'utf8'));
      eq(man.releaseSha256, sha(path.join(ROOT, '.build', 'release', 'index.html')),
        'the manifest must describe the artifact beside it');
      eq(man.releaseSha256, sha(RC), 'and that artifact must be the reviewed candidate');
      eq(man.releaseBuild, inj.release);
      ok(man.sourceCommit && man.injectionSha256 && man.command, 'manifest must carry provenance');
    });

    test('DEPLOY-RC-V2-02 the intermediate is quarantined, not deployable-looking', () => {
      const q = path.join(ROOT, '.build', 'intermediate');
      const files = fs.readdirSync(q);
      ok(files.some((f) => /NOT-A-RELEASE/.test(f)),
        'the intermediate name must say what it is: ' + files.join(', '));
      ok(files.includes('README.txt'), 'and carry the sidecar warning');
      const readme = fs.readFileSync(path.join(q, 'README.txt'), 'utf8');
      ok(/NOT A RELEASE/.test(readme));
      /* the generator's own output must no longer sit in the sister repo tree,
         where the historical deploy ritual picked files up from */
      notOk(fs.existsSync(path.join(COMPOUND, 'Weight-Tracker-main', 'pb-cutover.html')),
        'pb-cutover.html must not remain in the sister repo working tree after a build');
    });
  });

  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* best effort */ }
  report();
}
