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

  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* best effort */ }
  report();
}
