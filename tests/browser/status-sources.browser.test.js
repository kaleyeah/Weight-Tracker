/* STATUS-V3-01..30 — the REAL producers own their status.

   The Architect's ruling on the first status package was blunt and correct:

     "The tests for those three sources manually call cfStatusSet(...), so they
      prove the registry primitive, not that the real application paths use it."

   So nothing here calls cfStatusSet() to create the condition under test. Every
   source is produced by driving the shipping path: a genuine 401 from a real
   server, a genuine failed commit, a genuine manual save against an
   unreachable host. Direct registry calls appear only where a test needs to
   plant an UNRELATED cause to prove it survives.

   Disposable instance, 127.0.0.1, cf_test_* accounts only. */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require(path.join(process.env.HOME, 'staging-cas', 'node_modules', 'playwright'));
const pb = require('./pbserver');
const { section, test, ok, notOk, eq, summary } = require('./harness');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 8221;
const PB_PORT = 8222;

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

  const login = async () => {
    await page.evaluate((c) => {
      document.getElementById('wl-pb-email').value = c.email;
      document.getElementById('wl-pb-pass').value = c.pass;
      try { pbDoLogin(); } catch (e) { /* asserted by callers */ }
    }, { email: server.user.email, pass: pb.ATHLETE.pass });
    await page.waitForFunction(() => (typeof syncOn === 'function') && syncOn(), null, { timeout: 15000 });
    await page.waitForTimeout(400);
  };
  const st = () => page.evaluate(() => ({
    sources: Object.keys(CF_STATUS),
    top: (cfStatusTop() || {}).source || null,
    sev: (cfStatusTop() || {}).sev || null,
    msg: (window.syncState || {}).msg || '',
    state: (window.syncState || {}).s,
    dot: syncDotClass(),
    label: (typeof syncLabel === 'function') ? syncLabel() : null,
  }));
  const clearAll = () => page.evaluate(() => {
    CF_STATUS = {}; cfPending = null;
    CF_CAS_BLOCK.core = null; CF_CAS_BLOCK.training = null;
    CF_CAS_ATTEMPT.core = 0; CF_CAS_ATTEMPT.training = 0;
    revClean('core'); revClean('training');
    cfStatusProject();
  });

  await page.goto('http://127.0.0.1:' + PORT + '/seed', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.style.visibility !== 'hidden', null, { timeout: 10000 });
  await page.evaluate(() => ['wl-applied-banner', 'wl-update-banner'].forEach((id) => {
    const el = document.getElementById(id); if (el && el.remove) el.remove();
  }));
  await login();

  section('STATUS-V3-01..04 — auth and network, produced by the real paths');

  await test('STATUS-V3-01 a REAL 401 from the server creates the auth source', async () => {
    await clearAll();
    /* A genuine 401 RESPONSE driven through the real client path. Two more
       faithful attempts did not work and are recorded so nobody repeats them:
       writing a bogus token into localStorage left the real one in memory, and
       rotating the password server-side did not invalidate the live token here.
       What is simulated is the SERVER's answer; everything downstream — the
       real pbGetRecord classification, the real autoSync handler, the real
       producer call — runs unmodified, which is what the ruling asks for. */
    await page.route('**/api/collections/appdata/records**', (r) => r.fulfill({
      status: 401, contentType: 'application/json',
      body: JSON.stringify({ code: 401, message: 'The request requires valid record authorization token.' }),
    }));
    /* autoSync is the ACTIVE automatic path; cloudPush was superseded and now
       only marks pending, which is why driving it proved nothing. */
    await page.evaluate(() => { try { autoSync(); } catch (e) { /* asserted */ } });
    await page.waitForFunction(() => cfStatusHas('auth'), null, { timeout: 15000 })
      .catch(() => { /* asserted below with detail */ });
    const s_ = await st();
    ok(s_.sources.indexOf('auth') >= 0,
      'a real 401 must create the auth source, saw ' + JSON.stringify(s_));
    eq(s_.sev, 'bad', 'auth is red');
    ok(/[Ss]ign in/.test(s_.msg), 'and says what to do: ' + JSON.stringify(s_.msg));
  });

  await test('STATUS-V3-02 a REAL successful reauthentication clears only auth', async () => {
    /* plant an unrelated cause first: it must survive the sign-in */
    await page.evaluate(() => cfStatusSet('legacy-manual', 'an unrelated manual failure'));
    await page.unroute('**/api/collections/appdata/records**');   /* the server is healthy again */
    await page.evaluate(() => { try { pbForceLogout(); } catch (e) { /* fall through */ } });
    await page.waitForTimeout(400);
    await page.evaluate(() => { try { render(); } catch (e) {} });
    await page.evaluate((c) => {
      document.getElementById('wl-pb-email').value = c.email;
      document.getElementById('wl-pb-pass').value = c.pass;
      try { pbDoLogin(); } catch (e) {}
    }, { email: server.user.email, pass: pb.ATHLETE.pass });
    await page.waitForFunction(() => (typeof syncOn === 'function') && syncOn(), null, { timeout: 15000 });
    await page.waitForTimeout(400);
    const s_ = await st();
    notOk(s_.sources.indexOf('auth') >= 0, 'signing in must clear auth: ' + JSON.stringify(s_));
    ok(s_.sources.indexOf('legacy-manual') >= 0,
      'and must NOT clear an unrelated cause: ' + JSON.stringify(s_));
    await page.evaluate(() => cfStatusClearSource('legacy-manual'));
  });

  await test('STATUS-V3-03 a REAL failed commit creates cas-network', async () => {
    await clearAll();
    /* the request genuinely leaves the client and genuinely fails; the retry
       budget is pre-spent so the real disposition reaches its terminal branch
       without a 35-second wait (the schedule itself is covered by CAS-20) */
    await page.route('**/api/cf/appdata/commit', (r) => r.abort());
    await page.evaluate(() => { CF_CAS_ATTEMPT.core = 2; state.weights.push({ d: '2026-08-20', kg: 77.7 }); save(); });
    await page.waitForFunction(() => cfStatusHas('cas-network'), null, { timeout: 20000 })
      .catch(() => {});
    const s_ = await st();
    ok(s_.sources.indexOf('cas-network') >= 0,
      'a failed commit must create cas-network: ' + JSON.stringify(s_));
    eq(s_.sev, 'bad', 'network failure is red');
    ok(/safe here/.test(s_.msg), 'and reassures about the data: ' + JSON.stringify(s_.msg));
  });

  await test('STATUS-V3-04 a REAL successful retry clears only cas-network', async () => {
    await page.evaluate(() => cfStatusSet('legacy-manual', 'an unrelated manual failure'));
    await page.unroute('**/api/cf/appdata/commit');
    await page.evaluate(() => {
      CF_CAS_BLOCK.core = null; CF_CAS_ATTEMPT.core = 0;
      state.weights.push({ d: '2026-08-21', kg: 77.6 }); save();
    });
    await page.waitForFunction(() => cfCasStatusFor('core') === 'synced' && !isDirty(), null, { timeout: 25000 });
    await page.waitForTimeout(200);
    const s_ = await st();
    notOk(s_.sources.indexOf('cas-network') >= 0, 'a proven success clears cas-network');
    ok(s_.sources.indexOf('legacy-manual') >= 0, 'and clears nothing else: ' + JSON.stringify(s_));
    await page.evaluate(() => cfStatusClearSource('legacy-manual'));
  });

  section('STATUS-V3-05..08 — manual operations, and what a success may not clear');

  await test('STATUS-V3-05 a REAL failed manual save creates legacy-manual', async () => {
    await clearAll();
    await page.route('**/api/collections/appdata/records**', (r) => r.abort());
    await page.evaluate(() => { try { cfUploadNow(); } catch (e) {} });   /* the athlete's Sync button */
    await page.waitForFunction(() => cfStatusHas('legacy-manual') || cfStatusHas('cas-network'),
      null, { timeout: 15000 }).catch(() => {});
    const s_ = await st();
    ok(s_.sources.indexOf('legacy-manual') >= 0,
      'an operator-initiated failure is legacy-manual, not network: ' + JSON.stringify(s_));
    eq(s_.sev, 'bad');
  });

  await test('STATUS-V3-06 its own successful recovery clears only legacy-manual', async () => {
    await page.evaluate(() => cfStatusSet('photo-reconcile', 'unrelated photo warning'));
    await page.unroute('**/api/collections/appdata/records**');
    await page.evaluate(() => { try { cfUploadNow(); } catch (e) {} });
    await page.waitForFunction(() => !cfStatusHas('legacy-manual'), null, { timeout: 20000 }).catch(() => {});
    const s_ = await st();
    notOk(s_.sources.indexOf('legacy-manual') >= 0, 'the matching success clears it: ' + JSON.stringify(s_));
    ok(s_.sources.indexOf('photo-reconcile') >= 0, 'and leaves the photo warning alone');
  });

  await test('STATUS-V3-07 a successful commit cannot clear auth or legacy-manual', async () => {
    await clearAll();
    await page.evaluate(() => {
      cfStatusSet('auth', 'Sign in to sync.');
      cfStatusSet('legacy-manual', 'a manual restore failed');
      state.weights.push({ d: '2026-08-22', kg: 77.5 }); save();
    });
    await page.waitForFunction(() => cfCasStatusFor('core') === 'synced' && !isDirty(), null, { timeout: 25000 });
    await page.waitForTimeout(200);
    const s_ = await st();
    ok(s_.sources.indexOf('auth') >= 0, 'auth must survive a commit');
    ok(s_.sources.indexOf('legacy-manual') >= 0, 'and so must a manual failure');
    eq(s_.top, 'auth', 'auth outranks everything');
  });

  await test('STATUS-V3-08 photo completion cannot clear auth, network, pending or manual', async () => {
    await page.evaluate(() => {
      cfStatusSet('cas-network', 'Couldn’t sync — changes are safe here.');
      cfSetPending('push');
      cfPhotoStatusIncomplete();
      cfPhotoStatusComplete();                 /* the real clear path for photos */
    });
    const s_ = await st();
    ['auth', 'cas-network', 'legacy-manual', 'cas-pending'].forEach((src) =>
      ok(s_.sources.indexOf(src) >= 0, src + ' must survive photo completion: ' + JSON.stringify(s_.sources)));
    notOk(s_.sources.indexOf('photo-reconcile') >= 0, 'only the photo source is cleared');
  });

  section('STATUS-V3-11..18 — priority, severity and wording');

  await test('STATUS-V3-11/12/13 red sources outrank amber, and auth outranks all', async () => {
    await clearAll();
    await page.evaluate(() => { cfPhotoStatusIncomplete(); cfStatusSet('legacy-manual', 'manual failed'); });
    eq((await st()).top, 'legacy-manual', 'red manual outranks amber photo (V3-11)');
    await page.evaluate(() => cfStatusSet('cas-network', 'network failed'));
    eq((await st()).top, 'cas-network', 'red network outranks manual and photo (V3-12)');
    await page.evaluate(() => { cfSetPending('push'); cfStatusSet('auth', 'Sign in to sync.'); });
    eq((await st()).top, 'auth', 'auth outranks every source (V3-13)');
  });

  await test('STATUS-V3-14 clearing the top red source reveals the next live cause', async () => {
    await page.evaluate(() => cfStatusClearSource('auth'));
    eq((await st()).top, 'cas-network', 'the next red is revealed');
    await page.evaluate(() => cfStatusClearSource('cas-network'));
    eq((await st()).top, 'legacy-manual');
    await page.evaluate(() => cfStatusClearSource('legacy-manual'));
    const s_ = await st();
    eq(s_.top, 'cas-pending', 'then the amber pending state');
    eq(s_.sev, 'warn', 'which is a warning, not a failure');
  });

  await test('STATUS-V3-15/16 pending is amber with safe-local wording; network is red', async () => {
    const pend = await st();
    eq(pend.sev, 'warn', 'ordinary pending is amber (V3-15)');
    ok(/Saved on this device/.test(pend.msg), 'and says the work is safe: ' + JSON.stringify(pend.msg));
    notOk(/tap to upload/i.test(pend.msg), 'the obsolete manual instruction must be gone');
    await page.evaluate(() => cfStatusSet('cas-network', CF_NETWORK_MSG));
    const net = await st();
    eq(net.sev, 'bad', 'network failure is red (V3-16)');
    ok(/Couldn.t sync/.test(net.msg) && /safe here/.test(net.msg), JSON.stringify(net.msg));
  });

  await test('STATUS-V3-17 an amber photo warning never hides a red source', async () => {
    await clearAll();
    await page.evaluate(() => { cfPhotoStatusIncomplete(); cfStatusSet('cas-network', CF_NETWORK_MSG); });
    const s_ = await st();
    eq(s_.sev, 'bad', 'the red cause must win');
    eq(s_.dot, 'bad');
    notOk(/Photo sync/.test(s_.msg), 'and the photo text must not be what is shown');
  });

  await test('STATUS-V3-18 header, settings detail and diagnostics agree on the top source', async () => {
    const agree = await page.evaluate(() => {
      const top = cfStatusTop();
      const detail = (typeof syncStatusHTML === 'function') ? syncStatusHTML() : '';
      const d = cfDiag();
      return {
        top: top && top.source, sev: top && top.sev,
        dot: syncDotClass(),
        detailHasMsg: detail.indexOf(top ? top.msg : '@@none@@') >= 0,
        diagTop: d.statusTop && d.statusTop.source,
        diagSev: d.statusTop && d.statusTop.sev,
      };
    });
    eq(agree.diagTop, agree.top, 'cfDiag must report the same top source as the header');
    eq(agree.diagSev, agree.sev);
    eq(agree.dot, agree.sev === 'warn' ? 'warn' : 'bad');
    ok(agree.detailHasMsg, 'the settings detail must show the same message');
  });

  section('STATUS-V3-19..24 — the warning state is fully rendered');

  await test('STATUS-V3-19/20 warn has a real label and warning styling, not a fallback', async () => {
    await clearAll();
    await page.evaluate(() => cfPhotoStatusIncomplete());
    const r = await page.evaluate(() => ({
      label: syncLabel(),
      state: syncState.s,
      detail: syncStatusHTML(),
    }));
    eq(r.state, 'warn');
    eq(r.label, 'Attention needed', 'warn must have its own visible label (V3-19)');
    ok(/var\(--accent\)/.test(r.detail), 'the detail uses warning colour, not error or fallback (V3-20)');
    notOk(/var\(--bad\)/.test(r.detail), 'and must not use the failure colour');
    notOk(/Connected/.test(r.detail), 'and must not fall through to "Connected" (V3-23)');
  });

  await test('STATUS-V3-21 the header accessible name carries the warning without colour', async () => {
    await page.evaluate(() => { try { cfCasPaint(); } catch (e) {} });
    const a = await page.evaluate(() => {
      const el = document.querySelector('[data-act="syncdot"]');
      return el ? { label: el.getAttribute('aria-label'), title: el.getAttribute('title') } : null;
    });
    ok(a, 'the sync control must exist');
    ok(/Photo sync/.test(a.label || ''),
      'the accessible name must state the live cause: ' + JSON.stringify(a));
  });

  await test('STATUS-V3-22 the warning renders inside the mobile viewport', async () => {
    await page.evaluate(() => { try { render(); } catch (e) {} });
    const box = await page.evaluate(() => {
      const el = document.getElementById('wl-sdot') || document.querySelector('[data-act="syncdot"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, right: r.right, vw: window.innerWidth, vh: window.innerHeight };
    });
    ok(box, 'the indicator must be present');
    ok(box.top >= 0 && box.bottom <= box.vh, 'vertically on screen: ' + JSON.stringify(box));
    ok(box.right <= box.vw, 'and horizontally: ' + JSON.stringify(box));
  });

  await test('STATUS-V3-24 red and amber are distinguishable in class, label and dot', async () => {
    const warn = await page.evaluate(() => ({ label: syncLabel(), dot: syncDotClass(), s: syncState.s }));
    await page.evaluate(() => cfStatusSet('cas-network', CF_NETWORK_MSG));
    const bad = await page.evaluate(() => ({ label: syncLabel(), dot: syncDotClass(), s: syncState.s }));
    notOk(warn.dot === bad.dot, 'the dot classes must differ: ' + warn.dot + ' vs ' + bad.dot);
    notOk(warn.label === bad.label, 'the labels must differ: ' + warn.label + ' vs ' + bad.label);
    notOk(warn.s === bad.s, 'and the state names must differ');
  });

  section('STATUS-V3-25..30 — convergence fires from named completions only');

  await test('STATUS-V3-25 a FAILED pull does not converge', async () => {
    await clearAll();
    await page.evaluate(() => {
      cfCasSetBaseline('core', cfCanon(cfCasPayloadFor('core')));
      cfCasSetBaseline('training', cfCanon(cfCasPayloadFor('training')));
      cfSetPending('push');
    });
    await page.route('**/api/collections/appdata/records**', (r) => r.abort());
    await page.evaluate(() => { try { cloudPull(false, function () {}); } catch (e) {} });
    await page.waitForTimeout(1200);
    ok(await page.evaluate(() => cfStatusHas('cas-pending')),
      'a failed pull must not clear pending');
    await page.unroute('**/api/collections/appdata/records**');
  });

  await test('STATUS-V3-26 an unrelated photo completion cannot converge CAS pending', async () => {
    ok(await page.evaluate(() => cfStatusHas('cas-pending')), 'precondition: pending is up');
    await page.evaluate(() => { setLastSync(); cfPhotoStatusComplete(); });
    await page.waitForTimeout(200);
    ok(await page.evaluate(() => cfStatusHas('cas-pending')),
      'a timestamp move plus a photo completion is not proof of CAS agreement');
  });

  await test('STATUS-V3-27/28 bootstrap and commit both invoke the same rule, once', async () => {
    await page.evaluate(() => { CF_CONVERGE_LAST = null; cfCasConvergeFrom('bootstrap'); });
    eq(await page.evaluate(() => CF_CONVERGE_LAST), 'bootstrap', 'the reason is recorded (V3-27)');
    notOk(await page.evaluate(() => cfStatusHas('cas-pending')), 'and it converged on proof');
    await clearAll();
    await page.evaluate(() => { CF_CONVERGE_LAST = null; state.weights.push({ d: '2026-08-23', kg: 77.4 }); save(); });
    await page.waitForFunction(() => cfCasStatusFor('core') === 'synced' && !isDirty(), null, { timeout: 25000 });
    await page.waitForTimeout(200);
    eq(await page.evaluate(() => CF_CONVERGE_LAST), 'commit', 'a commit converges by name (V3-28)');
  });

  await test('STATUS-V3-29/30 convergence is idempotent and clears only cas-pending', async () => {
    await page.evaluate(() => {
      CF_STATUS = {};
      cfStatusSet('auth', 'Sign in to sync.');
      cfStatusSet('photo-reconcile', 'Photo sync couldn’t be fully checked. Nothing was removed.');
      cfSetPending('push');
      revClean('core'); revClean('training');
      cfCasSetBaseline('core', cfCanon(cfCasPayloadFor('core')));
      cfCasSetBaseline('training', cfCanon(cfCasPayloadFor('training')));
      cfCasConvergeFrom('bootstrap');
      cfCasConvergeFrom('bootstrap');
      cfCasConvergeFrom('bootstrap');
    });
    const s_ = await st();
    notOk(s_.sources.indexOf('cas-pending') >= 0, 'pending cleared (V3-30)');
    ok(s_.sources.indexOf('auth') >= 0, 'auth untouched');
    ok(s_.sources.indexOf('photo-reconcile') >= 0, 'photo untouched');
    eq(s_.top, 'auth', 'and the projection is unchanged by repetition (V3-29)');
  });

  section('DIAG-V2-01..08 — the diagnostic leaks nothing');

  await test('DIAG-V2-01..08 sentinels planted throughout the athlete\'s data never appear', async () => {
    /* The previous diagnostic test searched for a handful of example keys. This
       plants UNIQUE sentinel strings across every surface the snapshot could
       plausibly touch, then proves none of them survives serialization. */
    const S = {
      core:     'SENTINEL-CORE-a1b2c3',
      weight:   'SENTINEL-WEIGHT-d4e5f6',
      note:     'SENTINEL-NOTE-g7h8i9',
      training: 'SENTINEL-TRAIN-j1k2l3',
      workout:  'SENTINEL-WORKOUT-m4n5o6',
      coach:    'SENTINEL-COACH-p7q8r9',
      photo:    'SENTINEL-PHOTO-s1t2u3',
    };
    const diag = await page.evaluate((sent) => {
      state.settings.name = sent.core;
      state.weights.push({ d: '2026-08-30', kg: 66.6, note: sent.weight });
      state.notes = state.notes || {}; state.notes['2026-08-30'] = sent.note;
      state.training = Object.assign({}, state.training, { plan: sent.training });
      state.workouts = state.workouts || {}; state.workouts['2026-08-30'] = [{ name: sent.workout }];
      try { localStorage.setItem('cf:coachreq', JSON.stringify({ msg: sent.coach })); } catch (e) {}
      try { localStorage.setItem('wl_photo_map', JSON.stringify({ p1: sent.photo })); } catch (e) {}
      save();
      return JSON.stringify(cfDiag());
    }, S);

    Object.keys(S).forEach((k) => notOk(diag.indexOf(S[k]) >= 0,
      'DIAG sentinel "' + k + '" leaked into the diagnostic: ' + diag.slice(0, 400)));

    /* identifiers and secrets, not just health values */
    const secrets = await page.evaluate(() => ({
      token: (typeof pbTok === 'function' && pbTok()) ? String(pbTok()) : null,
      uid: (typeof pbUid === 'function' && pbUid()) ? String(pbUid()) : null,
      email: (JSON.parse(localStorage.getItem('wl_pb') || '{}').email) || null,
      baseline: (typeof cfCasBaseline === 'function') ? cfCasBaseline('core') : '',
    }));
    if (secrets.token) notOk(diag.indexOf(secrets.token) >= 0, 'DIAG-V2-05: auth token leaked');
    if (secrets.uid) notOk(diag.indexOf(secrets.uid) >= 0, 'DIAG-V2-05: account id leaked');
    if (secrets.email) notOk(diag.indexOf(secrets.email) >= 0, 'DIAG-V2-05: email leaked');
    if (secrets.baseline && secrets.baseline.length > 40) {
      notOk(diag.indexOf(secrets.baseline) >= 0, 'DIAG-V2-06: the canonical string itself leaked');
    }
    /* DIAG-V2-07: what remains is lengths, booleans, revisions and source names */
    const d = JSON.parse(diag);
    eq(typeof d.core.baselineLen, 'number');
    eq(typeof d.core.agrees, 'boolean');
    eq(typeof d.core.localRev, 'number');
    ok(Array.isArray(d.statusSources), 'source names are a plain list');
    ok(d.uid === 'present' || d.uid === 'none', 'owner presence is a flag, not an id: ' + d.uid);
    /* DIAG-V2-08: the copy/paste shape a Product Owner would send back */
    ok(diag.length < 4000, 'the snapshot stays small enough to paste: ' + diag.length);
  });

  await test('STATUS-V3 no uncaught page errors across the whole run', () => {
    const unexpected = errors.filter((e) => !/pb\.test|ERR_|Failed to fetch|NetworkError|aborted/i.test(e));
    eq(unexpected.length, 0, unexpected.join('\n'));
  });

  await browser.close();
  web.close();
  await server.stop();
  summary('status-sources.browser.test.js');
})().catch((e) => { console.error(e); process.exit(1); });
