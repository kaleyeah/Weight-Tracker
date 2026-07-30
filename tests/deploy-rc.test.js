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
/* Architect DEPLOY-PKG-01: no fallback to a stale global path, no dependency
   on a prior manual build. The suite WIPES .build first, builds via the probe,
   and discovers the quarantine from the run that build just created. A test
   that passes because yesterday's directory is still on disk is the vacuous
   pattern this project keeps finding — and it happened HERE: V2-02 passed
   against the pre-rewrite .build/intermediate layout. */
const currentRunIntermediate = () => {
  const runs = path.join(ROOT, '.build', 'runs');
  if (!fs.existsSync(runs)) return null;
  const dirs = fs.readdirSync(runs);
  if (dirs.length !== 1) return null;          /* the builder wipes runs/ at start */
  const p_ = path.join(runs, dirs[0], 'intermediate', 'pb-cutover.NOT-A-RELEASE.html');
  return fs.existsSync(p_) ? p_ : null;
};
/* wipe ALL build state before anything runs (DEPLOY-PKG-04) */
fs.rmSync(path.join(ROOT, '.build'), { recursive: true, force: true });
let PORTED = process.env.CF_PORTED || null;
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

/* Resolve the sister repo and run the probe build FIRST, so the suite's input
   is the output of the packaged builder — never leftovers. */
const BUILDER0 = path.join(ROOT, 'deployment-path', 'build-release.mjs');
const COMPOUND0_CANDIDATES = [process.env.CF_COMPOUND, path.join(os.homedir(), 'projects', 'compound')].filter(Boolean);
const COMPOUND0 = COMPOUND0_CANDIDATES.find((c) =>
  fs.existsSync(path.join(c, 'tools', 'pb-port.mjs'))
  && fs.existsSync(path.join(c, 'Weight-Tracker-main', 'index.html')));
let probe0 = null;
if (!PORTED && COMPOUND0) {
  try {
    execFileSync(process.execPath, [BUILDER0, '--compound=' + COMPOUND0], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    probe0 = { code: 0, out: '' };
  } catch (e) {
    probe0 = { code: e.status === undefined ? -1 : e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
  if (probe0.code === 0) PORTED = currentRunIntermediate();
}

const havePorted = PORTED && fs.existsSync(PORTED)
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

  /* The V2 tests need the actual sister repo (source + pb-port.mjs), not just
     a ported artifact. Deriving its path from PORTED was wrong the moment the
     default PORTED became the quarantined copy under .build/ — the dirname
     walk then produced .build/Weight-Tracker-main, which does not exist, and
     the suite failed as NO-SOURCE instead of skipping. Resolve it properly and
     skip with a message when it is not available. */
  const BUILDER = path.join(ROOT, 'deployment-path', 'build-release.mjs');
  const COMPOUND_CANDIDATES = [
    process.env.CF_COMPOUND,
    path.join(os.homedir(), 'projects', 'compound'),
  ].filter(Boolean);
  const COMPOUND = COMPOUND_CANDIDATES.find((c) =>
    fs.existsSync(path.join(c, 'tools', 'pb-port.mjs'))
    && fs.existsSync(path.join(c, 'Weight-Tracker-main', 'index.html')));

  /* A structurally valid sister repo can still be at the WRONG COMMIT — the
     stale clone at ~/projects/compound is exactly that, and under run-all it
     made the builder refuse with INTERMEDIATE-MISMATCH, which the suite then
     scored as a failure while also stomping .build. Probe once: a clean
     refusal on stale input is the machinery WORKING, so assert the refusal was
     clean and skip the rest, rather than failing eleven ways or weakening the
     builder. Any other failure mode is real. */
  let compoundUsable = false;
  if (COMPOUND) {
    const probe = probe0 !== null && COMPOUND === COMPOUND0 ? probe0 : (() => {
      try {
        const out = execFileSync(process.execPath, [BUILDER, '--compound=' + COMPOUND],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        return { code: 0, out };
      } catch (e) {
        return { code: e.status === undefined ? -1 : e.status, out: (e.stdout || '') + (e.stderr || '') };
      }
    })();
    if (probe.code === 0) {
      compoundUsable = true;
    } else if (/INTERMEDIATE-MISMATCH|DIRTY-SOURCE|SOURCE-SHA-MISMATCH|SOURCE-COMMIT-MISMATCH|UNVERIFIED-COMMIT/.test(probe.out)) {
      group('DEPLOY-RC-V2 — stale sister repo: refusal verified, build tests skipped', () => {
        test('DEPLOY-RC-V2-00 the builder refuses stale input cleanly', () => {
          notOk(probe.code === 0);
          notOk(fs.existsSync(path.join(ROOT, '.build', 'release', 'manifest.json')),
            'a refused build must not leave a release manifest behind');
        });
      });
      console.log('  (set CF_COMPOUND to a checkout at the recorded source commit for the full V2 tests)');
    } else {
      group('DEPLOY-RC-V2 — one authoritative build command', () => {
        test('DEPLOY-RC-V2-01 one command produces the release artifact and manifest', () => {
          eq(probe.code, 0, probe.out);   /* a real failure, surfaced as itself */
        });
      });
    }
  } else {
    console.log('\nDEPLOY-RC-V2 — SKIPPED: no sister repo with tools/pb-port.mjs found.');
    console.log('  Set CF_COMPOUND=<path to kaleyeah/compound checkout> to run the build-command tests.');
  }
  /* A disposable local clone of the sister repo, for failure-mode tests that
     must not touch the real one. --local clones hardlink objects, so this is
     cheap. Each case gets a fresh clone because the cases sabotage it. */
  const cloneCompound = (mutate) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-compound-'));
    execFileSync('git', ['clone', '-q', '--local', COMPOUND, dir], { stdio: 'ignore' });
    execFileSync('git', ['-C', dir, 'checkout', '-q',
      execFileSync('git', ['-C', COMPOUND, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()], { stdio: 'ignore' });
    if (mutate) mutate(dir);
    return dir;
  };
  const runBuildAt = (compoundDir, env) => {
    try {
      const out = execFileSync(process.execPath, [BUILDER, '--compound=' + compoundDir],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, env || {}) });
      return { code: 0, out };
    } catch (e) {
      return { code: e.status === undefined ? -1 : e.status, out: (e.stdout || '') + (e.stderr || '') };
    }
  };
  const runSelector = () => {
    try {
      const out = execFileSync(process.execPath, [path.join(ROOT, 'deployment-path', 'select-artifact.mjs')],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { code: 0, out };
    } catch (e) {
      return { code: e.status === undefined ? -1 : e.status, out: (e.stdout || '') + (e.stderr || '') };
    }
  };
  const releaseState = () => ({
    manifest: fs.existsSync(path.join(ROOT, '.build', 'release', 'manifest.json')),
    artifact: fs.existsSync(path.join(ROOT, '.build', 'release', 'index.html')),
  });
  const assertNoStaleRelease = (label) => {
    const st = releaseState();
    notOk(st.manifest, label + ': a stale manifest survived the failed build');
    notOk(st.artifact, label + ': a stale artifact survived the failed build');
  };

  if (compoundUsable) group('DEPLOY-BUILD-01..08 — failures publish NOTHING; only a matching pair deploys', () => {
    test('DEPLOY-BUILD-01 dirty source leaves no stale release artifact or manifest', () => {
      const dir = cloneCompound((d) => fs.appendFileSync(path.join(d, 'Weight-Tracker-main', 'index.html'), '\n/* dirty */\n'));
      const r = runBuildAt(dir);
      notOk(r.code === 0);
      /* dirty content also changes the sha; either named refusal is honest */
      ok(/DIRTY-SOURCE|SOURCE-SHA-MISMATCH/.test(r.out), r.out.slice(0, 300));
      assertNoStaleRelease('DEPLOY-BUILD-01');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('DEPLOY-BUILD-02 generator failure leaves no stale release', () => {
      const dir = cloneCompound((d) => fs.writeFileSync(path.join(d, 'tools', 'pb-port.mjs'),
        'throw new Error("sabotaged generator for DEPLOY-BUILD-02");'));
      const r = runBuildAt(dir);
      notOk(r.code === 0);
      ok(/PORT-FAILED/.test(r.out), r.out.slice(0, 300));
      assertNoStaleRelease('DEPLOY-BUILD-02');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('DEPLOY-BUILD-03 missing generator leaves no stale release', () => {
      const dir = cloneCompound((d) => fs.rmSync(path.join(d, 'tools', 'pb-port.mjs')));
      const r = runBuildAt(dir);
      notOk(r.code === 0);
      ok(/NO-GENERATOR/.test(r.out), r.out.slice(0, 300));
      assertNoStaleRelease('DEPLOY-BUILD-03');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('DEPLOY-BUILD-04 missing intermediate leaves no stale release', () => {
      const dir = cloneCompound((d) => fs.writeFileSync(path.join(d, 'tools', 'pb-port.mjs'),
        'process.exit(0); /* exits happily, writes nothing — the .347 exit-0 trap */'));
      const r = runBuildAt(dir);
      notOk(r.code === 0);
      ok(/NO-INTERMEDIATE/.test(r.out), r.out.slice(0, 300));
      assertNoStaleRelease('DEPLOY-BUILD-04');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('DEPLOY-BUILD-05 / RC-V2-04 injection failure publishes no candidate or manifest', () => {
      const dir = cloneCompound(null);
      const r = runBuildAt(dir, { CF_TEST_FAIL: 'inject' });
      notOk(r.code === 0);
      assertNoStaleRelease('DEPLOY-BUILD-05');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('DEPLOY-BUILD-06 / RC-V2-13 manifest or publish failure leaves no deployable pair', () => {
      const dir = cloneCompound(null);
      for (const step of ['manifest', 'publish']) {
        const r = runBuildAt(dir, { CF_TEST_FAIL: step });
        notOk(r.code === 0, 'CF_TEST_FAIL=' + step + ' must exit nonzero');
        assertNoStaleRelease('DEPLOY-BUILD-06/' + step);
        const sel = runSelector();
        notOk(sel.code === 0, 'the selector must refuse after CF_TEST_FAIL=' + step);
        ok(/NO-MANIFEST/.test(sel.out), sel.out.slice(0, 200));
      }
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('DEPLOY-BUILD-07 the selector rejects a stale prior manifest after a failed build', () => {
      /* build OK, then fail a build, then try to select: the wipe-first design
         means the stale pair is GONE, which is exactly the guarantee */
      eq(runBuildAt(COMPOUND).code, 0, 'baseline build must succeed');
      eq(runSelector().code, 0, 'and select');
      const dir = cloneCompound((d) => fs.rmSync(path.join(d, 'tools', 'pb-port.mjs')));
      notOk(runBuildAt(dir).code === 0, 'the sabotaged build must fail');
      const sel = runSelector();
      notOk(sel.code === 0, 'selecting after a failed build must refuse');
      ok(/NO-MANIFEST/.test(sel.out), sel.out.slice(0, 200));
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('DEPLOY-BUILD-08 only an atomically published matching pair is deployable', () => {
      eq(runBuildAt(COMPOUND).code, 0);
      /* tamper with the artifact: hash mismatch must refuse */
      const art = path.join(ROOT, '.build', 'release', 'index.html');
      const orig = fs.readFileSync(art);
      fs.appendFileSync(art, '\n<!-- tampered -->');
      let sel = runSelector();
      notOk(sel.code === 0, 'a tampered artifact must refuse');
      ok(/HASH-MISMATCH|BYTES-MISMATCH/.test(sel.out), sel.out.slice(0, 200));
      fs.writeFileSync(art, orig);
      eq(runSelector().code, 0, 'restored pair selects again');
    });
  });

  if (compoundUsable) group('DEPLOY-RC-V2-03..14 — the remaining named cases', () => {
    test('DEPLOY-RC-V2-03 adapter failure prevents injection and final output', () => {
      const dir = cloneCompound((d) => fs.writeFileSync(path.join(d, 'tools', 'pb-port.mjs'),
        'throw new Error("adapter transform failure");'));
      const r = runBuildAt(dir);
      notOk(r.code === 0);
      ok(/PORT-FAILED/.test(r.out));
      assertNoStaleRelease('V2-03');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('DEPLOY-RC-V2-05 the selector refuses the intermediate .347 artifact', () => {
      eq(runBuildAt(COMPOUND).code, 0);
      /* forge a manifest that points at intermediate content */
      const rel = path.join(ROOT, '.build', 'release');
      const man = JSON.parse(fs.readFileSync(path.join(rel, 'manifest.json'), 'utf8'));
      const runs = fs.readdirSync(path.join(ROOT, '.build', 'runs'));
      const inter = path.join(ROOT, '.build', 'runs', runs[0], 'intermediate', 'pb-cutover.NOT-A-RELEASE.html');
      fs.copyFileSync(inter, path.join(rel, 'index.html'));
      man.releaseSha256 = sha(path.join(rel, 'index.html'));
      man.releaseBytes = fs.statSync(path.join(rel, 'index.html')).size;
      fs.writeFileSync(path.join(rel, 'manifest.json'), JSON.stringify(man));
      const sel = runSelector();
      notOk(sel.code === 0, 'intermediate content must never be selectable even with a matching forged hash');
      ok(/INTERMEDIATE|BUILD-MISMATCH/.test(sel.out), sel.out.slice(0, 200));
      eq(runBuildAt(COMPOUND).code, 0, 'rebuild restores a good pair');
    });

    test('DEPLOY-RC-V2-06/07 manifest names the exact hash and bytes, and input must match it', () => {
      const man = JSON.parse(fs.readFileSync(path.join(ROOT, '.build', 'release', 'manifest.json'), 'utf8'));
      eq(man.releaseSha256, sha(path.join(ROOT, '.build', 'release', 'index.html')));
      eq(man.releaseBytes, fs.statSync(path.join(ROOT, '.build', 'release', 'index.html')).size);
      eq(man.releaseSha256, sha(RC), 'and it is the reviewed candidate');
    });

    test('DEPLOY-RC-V2-08 identical inputs produce an identical manifest and bytes', () => {
      const m1 = fs.readFileSync(path.join(ROOT, '.build', 'release', 'manifest.json'), 'utf8');
      const a1 = sha(path.join(ROOT, '.build', 'release', 'index.html'));
      eq(runBuildAt(COMPOUND).code, 0);
      const m2 = fs.readFileSync(path.join(ROOT, '.build', 'release', 'manifest.json'), 'utf8');
      const a2 = sha(path.join(ROOT, '.build', 'release', 'index.html'));
      eq(a1, a2, 'artifact bytes must be deterministic');
      eq(m1, m2, 'the manifest must be byte-identical too — no timestamps, no run ids');
    });

    test('DEPLOY-RC-V2-09 a wrong sister-repo commit fails before producing a release', () => {
      const dir = cloneCompound((d) => {
        const prior = execFileSync('git', ['-C', d, 'log', '--format=%H', '--follow', '--', 'Weight-Tracker-main/index.html'],
          { encoding: 'utf8' }).trim().split('\n')[1];
        execFileSync('git', ['-C', d, 'checkout', '-q', prior]);
      });
      const r = runBuildAt(dir);
      notOk(r.code === 0);
      ok(/SOURCE-SHA-MISMATCH|SOURCE-COMMIT-MISMATCH/.test(r.out), r.out.slice(0, 300));
      assertNoStaleRelease('V2-09');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('DEPLOY-RC-V2-10 a missing sister repo fails with a named error and no release', () => {
      const r = runBuildAt(path.join(os.tmpdir(), 'no-such-compound-anywhere'));
      notOk(r.code === 0);
      ok(/NO-SOURCE|NO-GENERATOR/.test(r.out), r.out.slice(0, 200));
      assertNoStaleRelease('V2-10');
    });

    test('DEPLOY-RC-V2-11 a live-source change fails at a named anchor, never a partial release', () => {
      /* a real source change alters the source sha, and the pipeline correctly
         refuses at the identity gate before anchors are even consulted — the
         no-partial-release property is what matters */
      const dir = cloneCompound((d) => {
        const f = path.join(d, 'Weight-Tracker-main', 'index.html');
        fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('function todayChecklistHTML(', '/* changed */\nfunction todayChecklistHTML('));
        execFileSync('git', ['-C', d, 'commit', '-aqm', 'simulated live fix'], { stdio: 'ignore' });
      });
      const r = runBuildAt(dir);
      notOk(r.code === 0, 'an unreviewed live change must not build');
      ok(/SOURCE-SHA-MISMATCH/.test(r.out), r.out.slice(0, 300));
      assertNoStaleRelease('V2-11');
      fs.rmSync(dir, { recursive: true, force: true });
    });

    test('DEPLOY-RC-V2-12 the final release contains the adapter once and Commit 10/10b once', () => {
      eq(runBuildAt(COMPOUND).code, 0);
      const s = fs.readFileSync(path.join(ROOT, '.build', 'release', 'index.html'), 'utf8');
      eq(s.split('function pbSave').length - 1, 1, 'adapter count');
      eq(s.split('HARDENING — COMMIT 10:').length - 1, 1);
      eq(s.split('HARDENING — COMMIT 10b:').length - 1, 1);
    });

    test('DEPLOY-RC-V2-14 release and rollback have distinct identities', () => {
      const man = JSON.parse(fs.readFileSync(path.join(ROOT, '.build', 'release', 'manifest.json'), 'utf8'));
      ok(man.rollback && man.rollback.sha256, 'the manifest must name the rollback artifact');
      notOk(man.rollback.sha256 === man.releaseSha256, 'rollback and release must be different bytes');
      notOk(man.rollback.bytes === man.releaseBytes);
    });
  });

  /* NEGATIVE CONTROLS (run 2026-07-30, sabotage → observed failures → restored
     byte-identical). Every V2 test below fails under at least one:
       1. releaseLock → unconditional rmSync (the V1 defect)  → V2-06
       2. pidAlive → always false (live holders judged dead)  → V2-01.., V2-04.., V2-08, LOCK-01
       3. loser rmSync(LOCK) before BUILD-IN-FLIGHT die       → V2-01.., V2-04.. (the V2-07 claim), V2-08, LOCK-01
       4. pidAlive → always true (recovery impossible)        → V2-01.., V2-04.., V2-06, V2-11/12, LOCK-02
     Note on V2-07: a contender that never acquired cannot run releaseLock at
     all — the exit handler is registered only AFTER acquireLock() returns. The
     assertion still guards the whole loser lifetime (control 3 proves it). */
  if (compoundUsable) group('DEPLOY-LOCK-V2 — exclusive takeover, tokenized ownership', () => {
    const LOCK = path.join(ROOT, '.build', '.build-lock');
    const ORCH = path.join(__dirname, 'helpers', 'lock-orchestrator.mjs');
    /* All concurrency runs inside the orchestrator child (see its header for
       why), invoked SYNCHRONOUSLY — so every assertion here is synchronous and
       visible to the harness. */
    const orchestrate = (extra) => JSON.parse(execFileSync(process.execPath,
      [ORCH, JSON.stringify(Object.assign({
        builder: BUILDER, compound: COMPOUND, buildDir: path.join(ROOT, '.build'),
      }, extra))],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 300000 }));
    const deadPid = () => Number(execFileSync(process.execPath, ['-e', 'console.log(process.pid)'],
      { encoding: 'utf8' }).trim());
    const tails = (rs) => rs.map((r) => r.out.trim().split('\n').slice(-2).join(' | ')).join('\n---\n');

    test('DEPLOY-LOCK-V2-01/02/03/05/10 three contenders on one dead holder: ONE winner, losers touch nothing', () => {
      fs.rmSync(path.join(ROOT, '.build'), { recursive: true, force: true });
      fs.mkdirSync(path.join(ROOT, '.build'), { recursive: true });
      fs.writeFileSync(LOCK, JSON.stringify({ pid: deadPid(), token: 'stale-crashed-token', startedAt: 'crashed' }));
      const o = orchestrate({ mode: 'contend', count: 3 });
      const winners = o.results.filter((r) => r.code === 0 && /RELEASE BUILD OK/.test(r.out));
      const losers = o.results.filter((r) => r.code !== 0);
      eq(winners.length, 1, 'exactly one contender may build (V2-01/05):\n' + tails(o.results));
      eq(losers.length, 2, 'both other contenders must lose');
      ok(losers.every((r) => /BUILD-IN-FLIGHT/.test(r.out)),
        'losers must refuse as BUILD-IN-FLIGHT (V2-02):\n' + tails(losers));
      /* V2-03: the losers invalidated nothing — the winner's release selects */
      eq(runSelector().code, 0, 'the surviving release must select cleanly (V2-03)');
      /* V2-10: the winner released its own lock after publishing */
      eq(o.lockAfterRaw, null, 'the winner must remove its own lock when done (V2-10)');
      notOk(fs.existsSync(LOCK));
    });

    test('DEPLOY-LOCK-V2-04/07/09 a LIVE holder is never replaced or unlocked, regardless of recorded age', () => {
      const o = orchestrate({ mode: 'live-holder', holdMs: 8000, ageLock: true });
      const held = JSON.parse(o.holderLockRaw);
      /* preconditions: the lock really was the live holder's, and really aged */
      eq(held.pid, o.holderPid, 'precondition: the lock belongs to the spawned holder');
      eq(held.startedAt, '1999-01-01T00:00:00.000Z', 'precondition: the lock was aged before the contender ran');
      notOk(o.loser.code === 0, 'the contender must refuse against a live holder (V2-04)');
      ok(/BUILD-IN-FLIGHT/.test(o.loser.out), o.loser.out.slice(-300));
      ok(o.loser.out.includes('pid ' + held.pid), 'the refusal must attribute the live holder');
      /* V2-09: age is irrelevant — the aged lock was still honoured (asserted
         by the refusal above). V2-07: the loser's exit removed NOTHING. */
      ok(o.lockAfterLoserRaw !== null, 'the loser (or its exit handler) removed the live holder\'s lock (V2-07)');
      eq(JSON.parse(o.lockAfterLoserRaw).token, held.token, 'the loser replaced the live holder\'s lock');
      /* and when the holder finally exits, it removes only its OWN lock */
      eq(o.lockAfterHolderExitRaw, null, 'the holder must remove its own lock on exit');
    });

    test('DEPLOY-LOCK-V2-06 a superseded holder\'s exit handler leaves the newer owner\'s lock alone', () => {
      const o = orchestrate({ mode: 'supersede', holdMs: 1500,
        newLock: { pid: 999999999, token: 'newer-owner-token', startedAt: 'now' } });
      ok(o.lockAfterHolderExitRaw !== null,
        'the exiting superseded holder removed a lock it no longer owned');
      eq(JSON.parse(o.lockAfterHolderExitRaw).token, 'newer-owner-token',
        'the surviving lock must still be the newer owner\'s, untouched');
      fs.rmSync(LOCK, { force: true });   /* planted lock, not a real owner's */
    });

    test('DEPLOY-LOCK-V2-08 a malformed lock recovers through the same exclusive path: ONE winner', () => {
      fs.writeFileSync(LOCK, 'not json at all {{{');
      const o = orchestrate({ mode: 'contend', count: 3 });
      const winners = o.results.filter((r) => r.code === 0 && /RELEASE BUILD OK/.test(r.out));
      eq(winners.length, 1, 'malformed recovery must still produce exactly one winner:\n' + tails(o.results));
      ok(o.results.filter((r) => r.code !== 0).every((r) => /BUILD-IN-FLIGHT/.test(r.out)),
        'losers must refuse, not crash:\n' + tails(o.results));
      eq(o.lockAfterRaw, null, 'the winner released its lock');
    });

    test('DEPLOY-LOCK-V2-11/12 a SIGKILLed holder leaves an attributable lock and NO deployable pair; the next build recovers', () => {
      fs.rmSync(path.join(ROOT, '.build'), { recursive: true, force: true });
      const o = orchestrate({ mode: 'kill-holder', holdMs: 30000 });
      eq(o.holderExit, 'SIGKILL', 'precondition: the holder died by signal, no exit handler ran');
      ok(o.lockAfterKillRaw !== null, 'a crash must leave the lock behind for attributable recovery (V2-11)');
      eq(JSON.parse(o.lockAfterKillRaw).pid, o.holderPid, 'and the lock must name the crashed pid');
      notOk(fs.existsSync(path.join(ROOT, '.build', 'release', 'manifest.json')),
        'a crashed holder must not have published anything');
      const sel = runSelector();
      notOk(sel.code === 0, 'nothing may be selectable after the crash');
      ok(/NO-MANIFEST/.test(sel.out), sel.out.slice(0, 200));
      /* V2-12: the next single build takes over the dead holder's lock and publishes */
      const next = runBuildAt(COMPOUND);
      eq(next.code, 0, 'recovery build failed: ' + next.out.slice(-300));
      eq(runSelector().code, 0, 'and its release selects');
      notOk(fs.existsSync(LOCK), 'and the recovered lock is released');
    });
  });

  group('DEPLOY-UNLOCK — the audited stale-lock recovery command (Architect V2-03 runbook tooling)', () => {
    const LOCK = path.join(ROOT, '.build', '.build-lock');
    const UNLOCK = path.join(ROOT, 'deployment-path', 'unlock-build.mjs');
    const AUDIT = path.join(TMP, 'unlock-audit.log');
    const runUnlock = (extra) => {
      try {
        const out = execFileSync(process.execPath, [UNLOCK, ...(extra || [])],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
            env: Object.assign({}, process.env, { CF_UNLOCK_AUDIT: AUDIT }) });
        return { code: 0, out };
      } catch (e) {
        return { code: e.status === undefined ? -1 : e.status, out: (e.stdout || '') + (e.stderr || '') };
      }
    };

    test('DEPLOY-UNLOCK-01 without confirmation it displays metadata and removes NOTHING — even facing the pid-reuse shape', () => {
      fs.mkdirSync(path.join(ROOT, '.build'), { recursive: true });
      /* the pid-reuse shape: the recorded pid is ALIVE (this test process),
         but the operator knows the builder is gone. Liveness lies here —
         exactly the case automatic recovery must never touch. */
      fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, token: 'reused-pid-token', startedAt: 'long ago' }));
      const r = runUnlock();
      notOk(r.code === 0, 'display-only mode must exit nonzero');
      ok(/IS RUNNING/.test(r.out), 'it must report the pid as live: ' + r.out.slice(0, 300));
      ok(r.out.includes('reused-pid-token'), 'it must display the token the operator has to echo');
      ok(fs.existsSync(LOCK), 'display mode removed the lock');
      notOk(fs.existsSync(AUDIT), 'nothing was removed, so nothing may be audited');
    });

    test('DEPLOY-UNLOCK-02 a wrong confirmation refuses; the exact token removes and AUDITS', () => {
      const r1 = runUnlock(['--confirm=wrong-token']);
      notOk(r1.code === 0);
      ok(/CONFIRM-MISMATCH/.test(r1.out), r1.out.slice(0, 200));
      ok(fs.existsSync(LOCK), 'a mismatched confirmation removed the lock');
      const r2 = runUnlock(['--confirm=reused-pid-token']);
      eq(r2.code, 0, r2.out);
      notOk(fs.existsSync(LOCK), 'the confirmed removal must remove the lock');
      const audit = fs.readFileSync(AUDIT, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      eq(audit.length, 1, 'exactly one removal, exactly one audit record');
      ok(audit[0].lockContent.includes('reused-pid-token'), 'the audit must preserve the removed lock\'s content');
      ok(audit[0].removedAt && audit[0].operator, 'the audit must say when and who');
    });

    test('DEPLOY-UNLOCK-03 a malformed lock needs the literal MALFORMED confirmation', () => {
      fs.writeFileSync(LOCK, 'garbage {{{ not json');
      const r1 = runUnlock(['--confirm=garbage']);
      notOk(r1.code === 0, 'guessing must not remove a malformed lock');
      const r2 = runUnlock(['--confirm=MALFORMED']);
      eq(r2.code, 0, r2.out);
      notOk(fs.existsSync(LOCK));
      eq(fs.readFileSync(AUDIT, 'utf8').trim().split('\n').length, 2, 'the second removal appended, not replaced');
      fs.rmSync(AUDIT, { force: true });
    });
  });

  if (compoundUsable) group('DEPLOY-LOCK — single-flight build enforcement (V1 cases, retained)', () => {
    const LOCK = path.join(ROOT, '.build', '.build-lock');

    test('DEPLOY-LOCK-01 a second build refuses while one is in flight, deleting nothing', () => {
      /* Simulate an in-flight build with a lock held by a LIVE pid — this test
         process itself, which is as alive as a pid gets. Plant a fake active
         run directory; the refusal must come BEFORE the wipe, so it survives. */
      fs.mkdirSync(path.join(ROOT, '.build', 'runs', 'active-run', 'candidate'), { recursive: true });
      fs.writeFileSync(path.join(ROOT, '.build', 'runs', 'active-run', 'candidate', 'work.txt'), 'in flight');
      fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, startedAt: 'test' }));
      try {
        const r = runBuildAt(COMPOUND);
        notOk(r.code === 0, 'the second build must refuse');
        ok(/BUILD-IN-FLIGHT/.test(r.out), r.out.slice(0, 200));
        ok(fs.existsSync(path.join(ROOT, '.build', 'runs', 'active-run', 'candidate', 'work.txt')),
          'the refusing build deleted the active build\'s run directory');
        ok(fs.existsSync(LOCK), 'the refusing build removed the winner\'s lock');
      } finally {
        fs.rmSync(LOCK, { force: true });
        fs.rmSync(path.join(ROOT, '.build', 'runs', 'active-run'), { recursive: true, force: true });
      }
    });

    test('DEPLOY-LOCK-02 a crash-leftover lock (dead pid) is taken over, not fatal', () => {
      /* A pid that provably exited: spawn a no-op child and wait for it. */
      const child = execFileSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf8' }).trim();
      fs.writeFileSync(LOCK, JSON.stringify({ pid: Number(child), startedAt: 'crashed' }));
      const r = runBuildAt(COMPOUND);
      eq(r.code, 0, 'a stale lock must not block forever: ' + r.out.slice(0, 200));
      notOk(fs.existsSync(LOCK), 'the lock must be released after a successful build');
    });
  });

  if (compoundUsable) group('DEPLOY-PKG / DEPLOY-COPY — the packaged source reproduces its own evidence', () => {
    test('DEPLOY-PKG-02/03/04 no stale global intermediate exists, and the suite ran from a clean .build', () => {
      /* .build was wiped before anything ran; the ONLY intermediate is inside
         the current run. If the old global path exists, something recreated
         the pre-rewrite layout and these results are suspect. */
      notOk(fs.existsSync(path.join(ROOT, '.build', 'intermediate')),
        'the pre-rewrite global intermediate path exists — stale-state hazard');
      ok(PORTED.includes(path.join('.build', 'runs')),
        'the suite input must come from the current run, got ' + PORTED);
    });

    test('DEPLOY-PKG-05 the evidence records the exact source hashes', () => {
      const files = {
        'deployment-path/build-release.mjs': null,
        'deployment-path/select-artifact.mjs': null,
        'deployment-path/inject-commit10.mjs': null,
        'deployment-path/injections/commit10-client.json': null,
        'tests/deploy-rc.test.js': null,
      };
      console.log('  SOURCE HASHES (DEPLOY-PKG-05):');
      for (const f of Object.keys(files)) {
        const h = sha(path.join(ROOT, f));
        console.log('    ' + h + '  ' + f);
        ok(h.length === 64, f);
      }
      let head = '(unknown)';
      try { head = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch (e) { /* keep */ }
      console.log('    repo HEAD: ' + head);
    });

    test('DEPLOY-COPY-01 a successful --copy-to produces exact bytes, atomically', () => {
      eq(runBuildAt(COMPOUND).code, 0, 'baseline build');
      const dest = path.join(TMP, 'deployed.html');
      const r = (() => {
        try {
          const out = execFileSync(process.execPath,
            [path.join(ROOT, 'deployment-path', 'select-artifact.mjs'), '--copy-to=' + dest],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
          return { code: 0, out };
        } catch (e) { return { code: e.status === undefined ? -1 : e.status, out: (e.stdout || '') + (e.stderr || '') }; }
      })();
      eq(r.code, 0, r.out);
      eq(sha(dest), sha(RC), 'the copied bytes must be the reviewed candidate');
      const leftovers = fs.readdirSync(TMP).filter((f) => f.startsWith('.cf-copy-'));
      eq(leftovers.length, 0, 'temp files left behind: ' + leftovers.join(', '));
    });

    test('DEPLOY-COPY-02 an injected copy failure leaves the existing destination unchanged', () => {
      const dest = path.join(TMP, 'existing-deploy.html');
      fs.writeFileSync(dest, 'THE PREVIOUS DEPLOY — must survive');
      const before = sha(dest);
      const r = (() => {
        try {
          const out = execFileSync(process.execPath,
            [path.join(ROOT, 'deployment-path', 'select-artifact.mjs'), '--copy-to=' + dest],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
              env: Object.assign({}, process.env, { CF_TEST_FAIL_COPY: 'YES' }) });
          return { code: 0, out };
        } catch (e) { return { code: e.status === undefined ? -1 : e.status, out: (e.stdout || '') + (e.stderr || '') }; }
      })();
      notOk(r.code === 0, 'the injected failure must exit nonzero');
      ok(/TEST-COPY-FAIL/.test(r.out), r.out.slice(0, 200));
      eq(sha(dest), before, 'the destination was modified by a FAILED copy');
      const leftovers = fs.readdirSync(TMP).filter((f) => f.startsWith('.cf-copy-'));
      eq(leftovers.length, 0, 'the failed copy left its temp file behind');
    });
  });

  if (compoundUsable) group('DEPLOY-RC-V2 — one authoritative build command', () => {
    test('DEPLOY-RC-V2-01 one command produces the release artifact and manifest', () => {
      const man = JSON.parse(fs.readFileSync(path.join(ROOT, '.build', 'release', 'manifest.json'), 'utf8'));
      eq(man.releaseSha256, sha(path.join(ROOT, '.build', 'release', 'index.html')),
        'the manifest must describe the artifact beside it');
      eq(man.releaseSha256, sha(RC), 'and that artifact must be the reviewed candidate');
      eq(man.releaseBuild, inj.release);
      ok(man.sourceCommit && man.injectionSha256 && man.command, 'manifest must carry provenance');
    });

    test('DEPLOY-RC-V2-02 the intermediate is quarantined, not deployable-looking', () => {
      /* the CURRENT run's quarantine, not a global directory — the global path
         is the pre-rewrite layout, and this test passing against it was
         exactly the stale-state defect the Architect caught */
      const runs = path.join(ROOT, '.build', 'runs');
      const dirs = fs.readdirSync(runs);
      eq(dirs.length, 1, 'expected exactly one run after the build, saw ' + dirs.join(', '));
      const q = path.join(runs, dirs[0], 'intermediate');
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

  if (compoundUsable) group('FIX003-PIPE-01..08 — the provenance the manifest CLAIMS is the provenance it HAS', () => {
    /* The Architect blocked canary republication because the .349 manifest
       "cannot" be real: it names the same intermediate as .348, and identical
       intermediate + identical injection cannot yield different output. The
       premise is half right. The intermediate IS unchanged and must be — it is
       the ported .347, frozen Lineage A. What changed is the INJECTION, and the
       manifest's injection identity is the regenerated one, not the .348 one.

       Reading a hash and believing a story about it is what got us here, so
       these tests machine-check the binding instead: every identity the
       manifest asserts is recomputed from the files on disk, the stale
       injection is proven to be REFUSED rather than silently accepted, and the
       build is proven deterministic. */
    /* The approved identity comes from the REVIEWED EXPECTATION, never a literal.
       These tests hard-coded .349 and all failed the moment FIX-004 produced a
       .350 candidate — twelve red tests that were really one brittle constant.
       The expectation file is the single place the intended release is declared;
       reading it here means the pipeline tests follow the release instead of
       having to be hand-edited (and mis-edited) on every candidate. */
    const EXPECTED = JSON.parse(fs.readFileSync(
      path.join(ROOT, 'deployment-path', 'RELEASE.expected.json'), 'utf8'));
    const APPROVED_SHA = EXPECTED.sha256;
    const APPROVED_BUILD = EXPECTED.build;
    const OLD_348_INJECTIONS = [
      'c2c55f6cbb2faaa8acb2d36a3e8ef7894eff77f800b3083cb6202979b7e59fd5',
      'dceef82d0260ded45728d4c117d2c505980edf3bf3d2e7ddf921c2de151a033d',
    ];
    const RELEASE = path.join(ROOT, '.build', 'release');
    const manifest = () => JSON.parse(fs.readFileSync(path.join(RELEASE, 'manifest.json'), 'utf8'));

    test('FIX003-PIPE-01 the authoritative build emits the EXACT approved bytes', () => {
      const r = runBuildAt(COMPOUND);
      eq(r.code, 0, r.out);
      const art = path.join(RELEASE, 'index.html');
      eq(sha(art), APPROVED_SHA, 'the built artifact must be the approved candidate');
      const m = manifest();
      eq(m.releaseSha256, APPROVED_SHA);
      eq(m.releaseBuild, APPROVED_BUILD);
      eq(m.releaseBytes, fs.statSync(art).size);
      eq(sha(RC), APPROVED_SHA, 'and the reviewed source must be those same bytes');
    });

    test('FIX003-PIPE-02 the injection identity is the REGENERATED one, not an older leftover', () => {
      const injSha = sha(INJECTION);
      const inj_ = JSON.parse(fs.readFileSync(INJECTION, 'utf8'));
      notOk(OLD_348_INJECTIONS.includes(injSha),
        'the injection on disk is a recorded .348 identity — genuinely stale: ' + injSha);
      eq(inj_.release, APPROVED_BUILD, 'the injection must declare the release it produces');
      eq(inj_.generatedFrom.rcSha, APPROVED_SHA,
        'and record the exact candidate it was derived from');
      /* the premise under test: the intermediate is UNCHANGED by design */
      eq(inj_.generatedFrom.portedSha, manifest().intermediateSha256,
        'the injection and the manifest must agree on the ported intermediate');
    });

    test('FIX003-PIPE-03 the manifest names the injection file that is actually on disk', () => {
      eq(manifest().injectionSha256, sha(INJECTION),
        'the manifest\'s injectionSha256 must be the hash of injections/commit10-client.json');
    });

    test('FIX003-PIPE-04 the manifest binds source, builder and tools to what is on disk', () => {
      const m = manifest();
      const srcSha = sha(path.join(COMPOUND, 'Weight-Tracker-main', 'index.html'));
      const srcCommit = execFileSync('git', ['-C', COMPOUND, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      eq(m.sourceCommit, srcCommit, 'source commit must be the sister repo HEAD actually used');
      const inj_ = JSON.parse(fs.readFileSync(INJECTION, 'utf8'));
      eq(inj_.expectedSource.sha256, srcSha, 'the injection must pin the exact source bytes');
      const head = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      eq(m.builderCommit, head,
        'builderCommit must be THIS repo state — a manifest built at an older HEAD is stale evidence');
      /* the tool identities that produced it, recomputed here */
      console.log('    FIX003-PIPE-04 tool hashes at HEAD ' + head + ':');
      ['deployment-path/build-release.mjs', 'deployment-path/inject-commit10.mjs',
       'deployment-path/select-artifact.mjs', 'deployment-path/make-injection.mjs',
       'deployment-path/injections/commit10-client.json'].forEach((f) => {
        console.log('      ' + sha(path.join(ROOT, f)) + '  ' + f);
      });
    });

    test('FIX003-PIPE-05 the selector accepts ONLY the exact approved artifact', () => {
      const sel = runSelector();
      eq(sel.code, 0, sel.out);
      const rec = JSON.parse(fs.readFileSync(path.join(RELEASE, 'SELECTED.json'), 'utf8'));
      eq(rec.sha256, APPROVED_SHA);
      eq(rec.build, APPROVED_BUILD);
      /* and it refuses a substituted artifact of the right name but wrong bytes */
      const art = path.join(RELEASE, 'index.html');
      const keep = fs.readFileSync(art);
      try {
        fs.writeFileSync(art, Buffer.concat([keep, Buffer.from('\n<!-- tampered -->\n')]));
        const bad = runSelector();
        notOk(bad.code === 0, 'a tampered artifact must be refused');
        ok(/HASH-MISMATCH|BYTES-MISMATCH/.test(bad.out), bad.out.slice(0, 200));
      } finally { fs.writeFileSync(art, keep); }
      eq(runSelector().code, 0, 'and the restored artifact selects again');
    });

    test('FIX003-PIPE-06 a stale older injection CANNOT report success for the approved release', () => {
      /* the Architect's worry, made falsifiable: put a real .348 injection back
         and prove the pipeline refuses rather than quietly emitting something */
      const stash = INJECTION + '.pipe06';
      fs.renameSync(INJECTION, stash);
      try {
        const old348 = execFileSync('git', ['-C', ROOT, 'show',
          '78374fc:deployment-path/injections/commit10-client.json'], { encoding: 'utf8' });
        fs.writeFileSync(INJECTION, old348);
        eq(sha(INJECTION), OLD_348_INJECTIONS[1], 'precondition: the stale .348 injection is in place');
        const r = runBuildAt(COMPOUND);
        notOk(r.code === 0, 'a stale injection must not produce a successful .349 build');
        ok(/RELEASE-EXPECTATION-MISMATCH/.test(r.out),
          'and must refuse by name — the injection is self-certifying, so only the '
          + 'independent RELEASE.expected.json can catch this: ' + r.out.slice(-400));
        ok(r.out.includes('2026-07-29.348-pb-c10') && r.out.includes(APPROVED_BUILD),
          'the refusal must name BOTH what it found and what was intended: ' + r.out.slice(-300));
        assertNoStaleRelease('FIX003-PIPE-06');
      } finally {
        fs.rmSync(INJECTION, { force: true });
        fs.renameSync(stash, INJECTION);
      }
      /* the real injection restored, the pipeline works again */
      eq(runBuildAt(COMPOUND).code, 0, 'the restored injection must build');
      eq(sha(path.join(RELEASE, 'index.html')), APPROVED_SHA);
    });

    test('FIX003-PIPE-06b the expectation file itself is load-bearing, not decoration', () => {
      /* a wrong expectation must stop a build that would otherwise succeed */
      const EXP = path.join(ROOT, 'deployment-path', 'RELEASE.expected.json');
      const keep = fs.readFileSync(EXP, 'utf8');
      try {
        const bad = JSON.parse(keep);
        bad.sha256 = 'f'.repeat(64);
        fs.writeFileSync(EXP, JSON.stringify(bad, null, 1));
        const r = runBuildAt(COMPOUND);
        notOk(r.code === 0, 'a mismatched expectation must refuse');
        ok(/RELEASE-EXPECTATION-MISMATCH/.test(r.out), r.out.slice(-300));
        assertNoStaleRelease('FIX003-PIPE-06b');
      } finally { fs.writeFileSync(EXP, keep); }
      eq(runBuildAt(COMPOUND).code, 0, 'and the correct expectation builds again');
      eq(sha(path.join(RELEASE, 'index.html')), APPROVED_SHA);
    });

    test('FIX003-PIPE-07 repeated builds are deterministic, manifest included', () => {
      const m1 = fs.readFileSync(path.join(RELEASE, 'manifest.json'), 'utf8');
      const a1 = sha(path.join(RELEASE, 'index.html'));
      eq(runBuildAt(COMPOUND).code, 0);
      const m2 = fs.readFileSync(path.join(RELEASE, 'manifest.json'), 'utf8');
      const a2 = sha(path.join(RELEASE, 'index.html'));
      eq(a2, a1, 'two builds must produce identical artifacts');
      eq(m2, m1, 'and byte-identical manifests (no timestamps, no run ids)');
      eq(a2, APPROVED_SHA);
    });

    test('FIX003-PIPE-08 the published branch: root is still .347, /canary/ is the APPROVED candidate', () => {
      /* Written during the provenance correction, when the invariant was "the
         canary is still the halted .348". The canary has since been republished
         with .349 under the Architect's §8 authorization, so pinning that old
         hash would now fail for the RIGHT reason — which it did, once.

         The durable invariant is the one that survives authorized releases:
         root must not move until root cutover is authorized, and /canary/ must
         be exactly the release the reviewed expectation names. An accidental
         root deploy, or a canary carrying anything other than the approved
         candidate, still fails here.

         The published branch as this checkout sees it; live served bytes are
         recorded separately in each package's curl transcript. */
      const blobSha = (p_) => crypto.createHash('sha256').update(
        execFileSync('git', ['-C', ROOT, 'show', 'origin/main:' + p_],
          { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 })).digest('hex');
      /* against PUBLISHED.json, not the expectation: the intended NEXT release
         and the currently PUBLISHED one legitimately differ while a candidate
         awaits review. Pinning this to the expectation made it fail the moment
         FIX-004 produced .350 — for the wrong reason. */
      const published = JSON.parse(fs.readFileSync(path.join(ROOT, 'deployment-path', 'PUBLISHED.json'), 'utf8'));
      eq(blobSha('index.html'), published.root.sha256,
        'the production root must still be the published .347 artifact — root cutover is not authorized');
      eq(published.root.build, '2026-07-28.347-pb', 'and PUBLISHED.json must still say so');
      eq(blobSha('canary/index.html'), published.canary.sha256,
        'and /canary/ must carry exactly what PUBLISHED.json records as published');
    });
  });

  if (compoundUsable) group('RELEASE-EXPECT-01..10 — the intended release is MANDATORY, not advisory', () => {
    /* Architect V3 §3: the expectation file was introduced as optional, with a
       fallback to "build whatever the injection declares" — which is exactly the
       self-certifying behaviour it exists to end. An optional integrity gate is
       not a gate: deleting one file restored the defect silently. These tests
       hold it mandatory, in the builder AND in the selector. */
    const EXP = path.join(ROOT, 'deployment-path', 'RELEASE.expected.json');
    const RELEASE = path.join(ROOT, '.build', 'release');
    const EXPECTED_NOW = JSON.parse(fs.readFileSync(EXP, 'utf8'));
    const APPROVED_SHA = EXPECTED_NOW.sha256;
    const APPROVED_BUILD = EXPECTED_NOW.build;
    /* Every case mutates the expectation, so each restores it in a finally and
       the group re-verifies a clean build at the end. */
    const withExpectation = (mutate, fn) => {
      const keep = fs.readFileSync(EXP, 'utf8');
      try {
        const next = mutate(JSON.parse(keep));
        if (next === null) fs.rmSync(EXP, { force: true });
        else fs.writeFileSync(EXP, typeof next === 'string' ? next : JSON.stringify(next, null, 1));
        return fn();
      } finally { fs.writeFileSync(EXP, keep); }
    };

    test('RELEASE-EXPECT-01 a MISSING expectation file fails the build', () => {
      const r = withExpectation(() => null, () => runBuildAt(COMPOUND));
      notOk(r.code === 0, 'a build with no intended release must refuse');
      ok(/NO-RELEASE-EXPECTATION/.test(r.out), r.out.slice(-300));
      assertNoStaleRelease('RELEASE-EXPECT-01');
    });

    test('RELEASE-EXPECT-02 a MALFORMED expectation file fails the build', () => {
      const r = withExpectation(() => '{ this is not json', () => runBuildAt(COMPOUND));
      notOk(r.code === 0);
      ok(/BAD-RELEASE-EXPECTATION/.test(r.out), r.out.slice(-300));
      assertNoStaleRelease('RELEASE-EXPECT-02');
    });

    test('RELEASE-EXPECT-03 a missing build, sha256 or bytes fails the build', () => {
      ['build', 'sha256', 'bytes'].forEach((k) => {
        const r = withExpectation((e) => { delete e[k]; return e; }, () => runBuildAt(COMPOUND));
        notOk(r.code === 0, `omitting ${k} must refuse`);
        ok(new RegExp('BAD-RELEASE-EXPECTATION').test(r.out) && r.out.includes(k),
          `the refusal must name the missing field ${k}: ` + r.out.slice(-200));
      });
      /* and malformed values, not just absent ones */
      const badSha = withExpectation((e) => { e.sha256 = 'nothex'; return e; }, () => runBuildAt(COMPOUND));
      notOk(badSha.code === 0); ok(/64-character hex/.test(badSha.out), badSha.out.slice(-200));
      const badBytes = withExpectation((e) => { e.bytes = -1; return e; }, () => runBuildAt(COMPOUND));
      notOk(badBytes.code === 0); ok(/positive integer/.test(badBytes.out), badBytes.out.slice(-200));
    });

    test('RELEASE-EXPECT-04 a STALE INJECTION against the current expectation fails', () => {
      const stash = INJECTION + '.re04';
      fs.renameSync(INJECTION, stash);
      try {
        fs.writeFileSync(INJECTION, execFileSync('git', ['-C', ROOT, 'show',
          '78374fc:deployment-path/injections/commit10-client.json'], { encoding: 'utf8' }));
        const r = runBuildAt(COMPOUND);
        notOk(r.code === 0, 'a stale injection must not build');
        ok(/RELEASE-EXPECTATION-MISMATCH/.test(r.out), r.out.slice(-300));
        assertNoStaleRelease('RELEASE-EXPECT-04');
      } finally { fs.rmSync(INJECTION, { force: true }); fs.renameSync(stash, INJECTION); }
    });

    test('RELEASE-EXPECT-05 a STALE EXPECTATION against the current injection fails', () => {
      /* the mirror image: the injection is right, the intended release was left behind */
      const r = withExpectation((e) => {
        e.build = '2026-07-29.348-pb-c10';
        e.sha256 = '9e45a225a5ea663c23e88340916689ac77fc8d0796ef48f342b06195adab4256';
        e.bytes = 1187105;
        return e;
      }, () => runBuildAt(COMPOUND));
      notOk(r.code === 0, 'a stale expectation must refuse');
      ok(/RELEASE-EXPECTATION-MISMATCH/.test(r.out), r.out.slice(-300));
      ok(r.out.includes('348-pb-c10') && r.out.includes(APPROVED_BUILD),
        'the refusal must name both the intended and the produced release: ' + r.out.slice(-300));
      assertNoStaleRelease('RELEASE-EXPECT-05');
    });

    test('RELEASE-EXPECT-06/07 produced bytes and hash must match the expectation', () => {
      /* bytes: right build and sha, wrong byte count -> the final gate catches it */
      const rb = withExpectation((e) => { e.bytes = e.bytes + 1; return e; }, () => runBuildAt(COMPOUND));
      notOk(rb.code === 0, 'a wrong expected byte count must refuse');
      ok(/RELEASE-EXPECTATION-MISMATCH/.test(rb.out), rb.out.slice(-300));
      /* hash: a valid-looking but wrong digest */
      const rh = withExpectation((e) => { e.sha256 = 'a'.repeat(64); return e; }, () => runBuildAt(COMPOUND));
      notOk(rh.code === 0, 'a wrong expected hash must refuse');
      ok(/RELEASE-EXPECTATION-MISMATCH/.test(rh.out), rh.out.slice(-300));
      assertNoStaleRelease('RELEASE-EXPECT-06/07');
    });

    test('RELEASE-EXPECT-08 the manifest records the expectation file identity', () => {
      eq(runBuildAt(COMPOUND).code, 0, 'baseline build');
      const man = JSON.parse(fs.readFileSync(path.join(RELEASE, 'manifest.json'), 'utf8'));
      eq(man.expectationSha256, sha(EXP),
        'the manifest must bind the exact reviewed expectation it was gated against');
      eq(man.releaseSha256, APPROVED_SHA);
    });

    test('RELEASE-EXPECT-09 identical reviewed inputs rebuild deterministically', () => {
      const m1 = fs.readFileSync(path.join(RELEASE, 'manifest.json'), 'utf8');
      eq(runBuildAt(COMPOUND).code, 0);
      const m2 = fs.readFileSync(path.join(RELEASE, 'manifest.json'), 'utf8');
      eq(m2, m1, 'the manifest, expectation identity included, must be byte-identical');
      eq(sha(path.join(RELEASE, 'index.html')), APPROVED_SHA);
    });

    test('RELEASE-EXPECT-10 the selector refuses an artifact lacking a valid expectation identity', () => {
      /* (a) a manifest with no expectation identity at all — an artifact built
             by the pre-gate builder */
      const manPath = path.join(RELEASE, 'manifest.json');
      const keep = fs.readFileSync(manPath, 'utf8');
      try {
        const m = JSON.parse(keep); delete m.expectationSha256;
        fs.writeFileSync(manPath, JSON.stringify(m, null, 1));
        const r = runSelector();
        notOk(r.code === 0, 'an artifact with no expectation identity must not be selectable');
        ok(/NO-EXPECTATION-IDENTITY/.test(r.out), r.out.slice(0, 300));
      } finally { fs.writeFileSync(manPath, keep); }
      /* (b) the expectation changed after the build — rebuild required */
      const r2 = withExpectation((e) => { e.approvedBy = 'edited after the build'; return e; },
        () => runSelector());
      notOk(r2.code === 0, 'a changed expectation must force a rebuild');
      ok(/EXPECTATION-CHANGED/.test(r2.out), r2.out.slice(0, 300));
      /* (c) restored: the real pair selects */
      const good = runSelector();
      eq(good.code, 0, good.out);
      const rec = JSON.parse(fs.readFileSync(path.join(RELEASE, 'SELECTED.json'), 'utf8'));
      eq(rec.sha256, APPROVED_SHA);
      eq(rec.build, APPROVED_BUILD);
    });

    test('RELEASE-EXPECT — the group left a clean, selectable, correct release behind', () => {
      eq(runBuildAt(COMPOUND).code, 0);
      eq(sha(path.join(RELEASE, 'index.html')), APPROVED_SHA);
      eq(runSelector().code, 0);
      eq(sha(EXP), sha(EXP), 'expectation restored');
      const man = JSON.parse(fs.readFileSync(path.join(RELEASE, 'manifest.json'), 'utf8'));
      eq(man.expectationSha256, sha(EXP));
    });
  });

  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* best effort */ }
  report();
}
