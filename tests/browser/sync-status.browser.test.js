/* STATUS-H-01..05 — the sync indicator must not cry wolf.

   Found on the Product Owner's iPhone during the canary day-one restart,
   2026-07-30: after signing in and letting the app settle, the header dot was
   RED and Settings read

       Status: Sync error · changes on this device aren't uploaded yet
               — tap to upload · synced 12:22 AM

   while the server showed his data intact and nothing outstanding.

   Mechanism: scheduleCloudPush() does two things on every edit —
   cfSetPending("push"), which sets the LEGACY sync state to error with that
   message, and cfCasSchedule(), which performs the real CAS commit. The CAS
   success path acked revisions and set the baseline but never cleared the
   legacy marker, and syncDotClass() falls through to the legacy state whenever
   the conflict centre has nothing to show. So a fully successful upload left
   the athlete looking at a red "not uploaded yet".

   Reproduced before the fix: commit 200, newRev 1, CAS "synced", dirty false,
   dot "bad". No data was ever at risk. But a health app whose alarm fires when
   nothing is wrong teaches the athlete to ignore the alarm — and the same
   indicator has to be believed when a real pending state appears, which is
   what STATUS-H-03 pins down.

   Disposable instance, 127.0.0.1, cf_test_* accounts only. */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require(path.join(process.env.HOME, 'staging-cas', 'node_modules', 'playwright'));
const pb = require('./pbserver');
const { section, test, ok, notOk, eq, summary } = require('./harness');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 8201;
const PB_PORT = 8202;

const SEED = (base) => `<!doctype html><meta charset="utf-8"><body><script>
localStorage.clear();
localStorage.setItem('wl_pb', JSON.stringify({ base: ${JSON.stringify(base)} }));
location.replace('/index.html');
</script>`;

(async () => {
  if (!pb.available()) { console.log('SKIPPED — no PocketBase binary'); process.exit(0); }
  const server = await pb.start(PB_PORT);

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const web = http.createServer((req, res) => {
    if ((req.url || '').split('?')[0] === '/seed') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(SEED(server.base)); return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(html);
  });
  await new Promise((r) => web.listen(PORT, '127.0.0.1', r));

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const commits = [];
  page.on('response', async (r) => {
    if (/cf\/appdata\/commit/.test(r.url())) {
      let b = null; try { b = await r.json(); } catch (e) { /* non-json */ }
      commits.push({ status: r.status(), body: b });
    }
  });

  await page.goto('http://127.0.0.1:' + PORT + '/seed', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.style.visibility !== 'hidden', null, { timeout: 10000 });
  await page.evaluate(() => ['wl-applied-banner', 'wl-update-banner'].forEach((id) => {
    const el = document.getElementById(id); if (el && el.remove) el.remove();
  }));
  await page.evaluate((c) => {
    document.getElementById('wl-pb-email').value = c.email;
    document.getElementById('wl-pb-pass').value = c.pass;
    try { pbDoLogin(); } catch (e) { /* asserted below */ }
  }, { email: server.user.email, pass: pb.ATHLETE.pass });
  await page.waitForFunction(() => (typeof syncOn === 'function') && syncOn(), null, { timeout: 15000 });
  await page.waitForTimeout(1200);

  const read = () => page.evaluate(() => ({
    casCore: cfCasStatusFor('core'),
    casCompact: cfCasCompactStatus(),
    serverRev: cfCasServerRev('core'),
    dirty: isDirty(),
    dot: syncDotClass(),
    legacyState: (window.syncState || {}).s,
    legacyMsg: (window.syncState || {}).msg || '',
    pending: window.cfPending,
  }));
  const NOT_UPLOADED = /aren.t uploaded yet/;

  section('STATUS-H-01..02 — a successful upload clears the "not uploaded" alarm');

  await page.evaluate(() => { state.weights.push({ d: '2026-08-01', kg: 80.4 }); save(); });
  const duringEdit = await read();

  await test('STATUS-H-01 precondition: the edit DOES raise the honest pending warning', () => {
    eq(duringEdit.pending, 'push', 'an edit must mark work as not yet uploaded');
    ok(NOT_UPLOADED.test(duringEdit.legacyMsg),
      'and say so in words: ' + JSON.stringify(duringEdit.legacyMsg));
    /* if this ever stops firing, STATUS-H-02 becomes vacuous */
  });

  /* wait for the commit to actually succeed — never a fixed sleep */
  await page.waitForFunction(() => cfCasStatusFor('core') === 'synced' && cfCasServerRev('core') > 0,
    null, { timeout: 25000 });
  await page.waitForTimeout(300);
  const after = await read();

  await test('STATUS-H-02 after a SUCCESSFUL commit the athlete is not told it failed', () => {
    /* the commit really did succeed — assert that, not just the UI */
    const okCommit = commits.filter((c) => c.status === 200 && c.body && c.body.ok);
    ok(okCommit.length >= 1, 'a commit must have succeeded: ' + JSON.stringify(commits));
    eq(after.casCore, 'synced');
    ok(after.serverRev > 0, 'the server revision must have advanced');
    notOk(after.dirty, 'nothing may remain dirty');
    /* the actual defect */
    notOk(after.dot === 'bad',
      'the dot is still RED after a successful upload: ' + JSON.stringify(after));
    notOk(NOT_UPLOADED.test(after.legacyMsg),
      'the athlete is still told their changes are not uploaded: ' + JSON.stringify(after.legacyMsg));
    eq(after.pending, null, 'the pending marker must be cleared');
    /* NOT "the global state is ok": clearing an owned source reveals the next
       live one (FIX-005). On a clean account the photo-reconciliation warning
       is legitimately underneath, so the claim is that the UPLOAD alarm is
       gone and nothing red remains — not that every cause vanished. */
    notOk(after.dot === 'bad', 'no red upload alarm may remain: ' + JSON.stringify(after));
    ok(after.legacyState === 'ok' || after.legacyState === 'warn',
      'the revealed state must be ok or a warning, saw ' + after.legacyState);
  });

  section('STATUS-H-03..05 — but the warning must SURVIVE when something really is outstanding');

  await test('STATUS-H-03 a blocked sibling subsystem keeps the warning visible', () => {
    /* core succeeds while training is genuinely blocked: clearing the alarm
       here would hide a real problem, which is the opposite failure */
    return page.evaluate(() => {
      CF_CAS_BLOCK.training = 'failed';
      cfSetPending('push');
      cfCasSyncLegacyStatus();                 /* must decline to clear */
      return null;
    }).then(async () => {
      const st = await read();
      ok(st.casCompact !== 'synced', 'precondition: the surface is not settled, saw ' + st.casCompact);
      eq(st.pending, 'push', 'the pending marker must NOT be cleared while a subsystem is blocked');
      ok(NOT_UPLOADED.test(st.legacyMsg), 'and the warning must remain: ' + JSON.stringify(st.legacyMsg));
      await page.evaluate(() => { CF_CAS_BLOCK.training = null; });
    });
  });

  await test('STATUS-H-04 a locally dirty subsystem keeps the warning visible', () => {
    return page.evaluate(() => {
      revBump('training');                     /* a real local edit, not yet committed */
      cfSetPending('push');
      cfCasSyncLegacyStatus();
      return null;
    }).then(async () => {
      const st = await read();
      eq(st.pending, 'push', 'unsent local work must keep the honest warning');
      ok(NOT_UPLOADED.test(st.legacyMsg), st.legacyMsg);
    });
  });

  await test('STATUS-H-05 no uncaught page errors through the whole status path', () => {
    const unexpected = errors.filter((e) => !/pb\.test|ERR_|Failed to fetch|NetworkError/i.test(e));
    eq(unexpected.length, 0, unexpected.join('\n'));
  });

  section('STATUS-H-06..10 — a source may clear only what it OWNS');

  /* H-04 leaves training dirty on purpose, and H-03 blocks it — so the
     ownership cases must start from a known-settled surface or they test the
     leftovers of the previous case instead of what they claim. */
  const resetSurface = () => page.evaluate(() => {
    CF_STATUS = {}; cfPending = null;
    CF_CAS_BLOCK.core = null; CF_CAS_BLOCK.training = null;
    revClean('core'); revClean('training');
    cfCasSetBaseline('core', cfCanon(cfCasPayloadFor('core')));
    cfCasSetBaseline('training', cfCanon(cfCasPayloadFor('training')));
    cfStatusProject();
  });

  await test('STATUS-H-06 a successful commit clears the cas-pending source it owns', async () => {
    await resetSurface();
    await page.evaluate(() => { cfSetPending('push'); });
    ok(await page.evaluate(() => cfStatusHas('cas-pending')), 'precondition: cas-pending is live');
    await page.evaluate(() => { state.weights.push({ d: '2026-08-03', kg: 80.1 }); save(); });
    await page.waitForFunction(() => cfCasStatusFor('core') === 'synced' && !isDirty(), null, { timeout: 25000 });
    await page.waitForTimeout(200);
    notOk(await page.evaluate(() => cfStatusHas('cas-pending')),
      'the commit must clear its own pending source');
  });

  await test('STATUS-H-07 a successful commit does NOT clear a photo-reconciliation warning', async () => {
    await resetSurface();
    await page.evaluate(() => { cfPhotoStatusIncomplete(); cfSetPending('push'); });
    const before = await page.evaluate(() => ({ photo: cfStatusHas('photo-reconcile'), pending: cfStatusHas('cas-pending') }));
    ok(before.photo && before.pending, 'precondition: both sources live');
    await page.evaluate(() => { state.weights.push({ d: '2026-08-04', kg: 80.0 }); save(); });
    await page.waitForFunction(() => cfCasStatusFor('core') === 'synced' && !isDirty(), null, { timeout: 25000 });
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => ({
      photo: cfStatusHas('photo-reconcile'), pending: cfStatusHas('cas-pending'),
      msg: (window.syncState || {}).msg, dot: syncDotClass() }));
    notOk(after.pending, 'cas-pending must clear');
    ok(after.photo, 'the photo warning must SURVIVE a successful core commit');
    ok(/Photo sync/.test(after.msg), 'and be what the athlete now sees: ' + JSON.stringify(after.msg));
    eq(after.dot, 'warn', 'at warning severity, not red upload failure');
  });

  await test('STATUS-H-08 a successful commit does NOT clear auth or an unrelated failure source', async () => {
    for (const src of ['auth', 'cas-network', 'legacy-manual']) {
      await resetSurface();
      await page.evaluate((s_) => { cfStatusSet(s_, 'unrelated ' + s_); cfSetPending('push'); }, src);
      await page.evaluate(() => { state.weights.push({ d: '2026-08-05', kg: 79.9 }); save(); });
      await page.waitForFunction(() => cfCasStatusFor('core') === 'synced' && !isDirty(), null, { timeout: 25000 });
      await page.waitForTimeout(150);
      const st = await page.evaluate((s_) => ({ kept: cfStatusHas(s_), pending: cfStatusHas('cas-pending') }), src);
      ok(st.kept, src + ' must survive a successful commit');
      notOk(st.pending, 'while cas-pending clears');
    }
    await page.evaluate(() => { CF_STATUS = {}; cfStatusProject(); });
  });

  await test('STATUS-H-09 a BLOCKED sibling prevents cas-pending from clearing', async () => {
    await page.evaluate(() => { CF_STATUS = {}; CF_CAS_BLOCK.training = 'failed'; cfSetPending('push'); cfStatusConverge(); });
    ok(await page.evaluate(() => cfStatusHas('cas-pending')),
      'a blocked sibling must keep the honest warning');
    await page.evaluate(() => { CF_CAS_BLOCK.training = null; });
  });

  await test('STATUS-H-10 a DIRTY sibling prevents cas-pending from clearing', async () => {
    await page.evaluate(() => { CF_STATUS = {}; revBump('training'); cfSetPending('push'); cfStatusConverge(); });
    ok(await page.evaluate(() => cfStatusHas('cas-pending')),
      'unsent local work must keep the honest warning');
    ok(await page.evaluate(() => revIsDirty('training')), 'precondition: training really is dirty');
  });

  section('STATUS-H-11..15 — convergence without a commit (the ACTUAL canary state)');

  await test('STATUS-H-11 a stale marker clears when agreement is PROVEN, with no commit', async () => {
    /* the Product Owner's shape: pending raised, nothing sent, device and
       server already in agreement. Prove it converges without any request. */
    await page.evaluate(() => {
      CF_STATUS = {}; CF_CAS_BLOCK.core = null; CF_CAS_BLOCK.training = null;
      revClean('core'); revClean('training');
      cfCasSetBaseline('core', cfCanon(cfCasPayloadFor('core')));
      cfCasSetBaseline('training', cfCanon(cfCasPayloadFor('training')));
      cfSetPending('push');
    });
    ok(await page.evaluate(() => cfStatusHas('cas-pending')), 'precondition: the stale marker is up');
    const commitsBefore = commits.length;
    await page.evaluate(() => { setLastSync(); });          /* a pull completing */
    await page.waitForTimeout(200);
    notOk(await page.evaluate(() => cfStatusHas('cas-pending')),
      'proven agreement must clear the stale marker');
    eq(commits.length, commitsBefore, 'and it must do so WITHOUT sending anything');
  });

  await test('STATUS-H-12 a completed pull does NOT clear pending when payloads differ', async () => {
    await page.evaluate(() => {
      CF_STATUS = {}; revClean('core'); revClean('training');
      cfCasSetBaseline('core', 'A-DIFFERENT-CANONICAL-FORM');
      cfSetPending('push');
      setLastSync();
    });
    await page.waitForTimeout(150);
    ok(await page.evaluate(() => cfStatusHas('cas-pending')),
      'differing content must keep the warning — a pull alone proves nothing');
  });

  await test('STATUS-H-13 a completed pull does NOT clear pending while a subsystem is dirty', async () => {
    await page.evaluate(() => {
      CF_STATUS = {};
      cfCasSetBaseline('core', cfCanon(cfCasPayloadFor('core')));
      cfCasSetBaseline('training', cfCanon(cfCasPayloadFor('training')));
      revBump('core');                      /* unsent local work */
      cfSetPending('push');
      setLastSync();
    });
    await page.waitForTimeout(150);
    ok(await page.evaluate(() => cfStatusHas('cas-pending')), 'dirty work must keep the warning');
  });

  await test('STATUS-H-14 convergence does not clear conflict or recovery state', async () => {
    const st = await page.evaluate(() => {
      CF_STATUS = {};
      revClean('core'); revClean('training');
      cfCasSetBaseline('core', cfCanon(cfCasPayloadFor('core')));
      cfCasSetBaseline('training', cfCanon(cfCasPayloadFor('training')));
      CF_CAS_BLOCK.core = 'recovery';
      cfSetPending('push');
      setLastSync();
      const out = { pending: cfStatusHas('cas-pending'), block: CF_CAS_BLOCK.core };
      CF_CAS_BLOCK.core = null;
      return out;
    });
    ok(st.pending, 'a recovery block must keep the warning');
    eq(st.block, 'recovery', 'and convergence must not have cleared the block itself');
  });

  await test('STATUS-H-15 the no-commit convergence path emits NO request at all', async () => {
    const seen = [];
    const onReq = (r) => { if (/appdata|commit/.test(r.url())) seen.push(r.method() + ' ' + r.url()); };
    page.on('request', onReq);
    await page.evaluate(() => {
      CF_STATUS = {}; revClean('core'); revClean('training');
      cfCasSetBaseline('core', cfCanon(cfCasPayloadFor('core')));
      cfCasSetBaseline('training', cfCanon(cfCasPayloadFor('training')));
      cfSetPending('push');
      setLastSync();
    });
    await page.waitForTimeout(600);
    page.off('request', onReq);
    notOk(await page.evaluate(() => cfStatusHas('cas-pending')), 'precondition: it did converge');
    eq(seen.length, 0, 'convergence must be a pure local proof, saw: ' + JSON.stringify(seen));
  });

  section('DIAG-01 — the payload-free diagnostic snapshot');

  await test('DIAG-01 cfDiag() reports the state the next canary needs and no athlete data', async () => {
    const d = await page.evaluate(() => cfDiag());
    ['build', 'cfPending', 'statusSources', 'legacyState', 'dot', 'converged', 'core', 'training']
      .forEach((k) => ok(k in d, 'cfDiag must report ' + k));
    ['localRev', 'serverRev', 'dirty', 'block', 'opPhase', 'conflict', 'status', 'agrees']
      .forEach((k) => ok(k in d.core, 'cfDiag().core must report ' + k));
    /* and NOTHING that could carry health data */
    const blob = JSON.stringify(d);
    notOk(/weights|"kg"|notes|bodyfat|sleep|food/i.test(blob),
      'the snapshot must not contain athlete payload keys: ' + blob.slice(0, 300));
    notOk(/80\.1|80\.0|79\.9/.test(blob), 'nor any weigh-in values');
    eq(typeof d.core.baselineLen, 'number', 'canonical forms appear only as lengths');
  });

  await browser.close();
  web.close();
  await server.stop();
  summary('sync-status.browser.test.js');
})().catch((e) => { console.error(e); process.exit(1); });
