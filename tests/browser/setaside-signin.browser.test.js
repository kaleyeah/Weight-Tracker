/* SETASIDE-SIGNIN-01..05 — a SUCCESSFUL sign-in must not consume the copy.

   SETASIDE-UX-09 signed in against a server that was not there. That proves a
   FAILED login leaves the copy alone, which is not the requirement: a
   successful authentication runs different account-adoption, ownership, render
   and cleanup logic, and that is the path where the copy could be silently
   taken or dropped.

   So this uses a real disposable PocketBase running the shipping server kit and
   performs a genuine sign-in, a genuine logout, and a genuine second-account
   sign-in. Nothing about the login is simulated.

   Disposable instance, 127.0.0.1, cf_test_* accounts only, destroyed after the
   run. Production is not involved. */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require(path.join(process.env.HOME, 'staging-cas', 'node_modules', 'playwright'));
const pb = require('./pbserver');
const { section, test, ok, notOk, eq, summary } = require('./harness');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 8151;
const PB_PORT = 8152;

const STAMP = '1700000000000';
const CORE = JSON.stringify({
  settings: { onboarded: true, name: 'SET-ASIDE DEMO' },
  weights: [{ date: '2026-01-13', weight: 87.9 }],
});
const TRAIN = '{"plan":"DEMO"}';
const WO = '{"draft":true}';

const SEED = (base) => `<!doctype html><meta charset="utf-8"><body><script>
localStorage.clear();
localStorage.setItem('cf:quarantine:${STAMP}:core', ${JSON.stringify(CORE)});
localStorage.setItem('cf:quarantine:${STAMP}:training', ${JSON.stringify(TRAIN)});
localStorage.setItem('cf:quarantine:${STAMP}:workout', ${JSON.stringify(WO)});
localStorage.setItem('cf:quarantine:${STAMP}:manifest', JSON.stringify({
  stamp:'${STAMP}', createdAt: 1769558400000, appBuild:'signin-test',
  keys:['core','training','workout'],
  sizes:{core:${CORE.length},training:${TRAIN.length},workout:${WO.length}}}));
localStorage.setItem('wl_pb', JSON.stringify({ base: ${JSON.stringify(base)} }));
location.replace('/index.html');
</script>`;

(async () => {
  if (!pb.available()) { console.log('SKIPPED — no PocketBase binary'); process.exit(0); }
  const server = await pb.start(PB_PORT);

  /* a second real account, for the ownership case */
  const other = { email: 'cf_test_other@staging.invalid', pass: 'OtherPw123456' };
  await server.api('POST', '/api/collections/users/records', server.adminToken, {
    email: other.email, password: other.pass, passwordConfirm: other.pass, verified: true,
  });

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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:' + PORT + '/seed', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.style.visibility !== 'hidden', null, { timeout: 10000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => ['wl-applied-banner', 'wl-update-banner'].forEach((id) => {
    const el = document.getElementById(id); if (el && el.remove) el.remove();
  }));

  const keys = () => page.evaluate(() =>
    Object.keys(localStorage).filter((k) => /^cf:quarantine:/.test(k)).sort());
  const signIn = async (email, pass) => {
    await page.evaluate((c) => {
      const e = document.getElementById('wl-pb-email'); if (e) e.value = c.email;
      const p = document.getElementById('wl-pb-pass'); if (p) p.value = c.pass;
      try { pbDoLogin(); } catch (err) { /* surfaced by the assertions below */ }
    }, { email, pass });
    /* wait for the app to actually consider itself signed in */
    await page.waitForFunction(() => (typeof syncOn === 'function') && syncOn(), null, { timeout: 15000 });
    await page.waitForTimeout(600);
  };

  const before = await keys();

  section('SETASIDE-SIGNIN-01..03 — a real successful sign-in');

  await test('precondition: a complete set-aside copy exists and the app is signed OUT', async () => {
    eq(before.length, 4, 'expected four keys, saw ' + JSON.stringify(before));
    ok(await page.evaluate((s) => cfQuarComplete(s), STAMP), 'the seeded copy must be valid');
    notOk(await page.evaluate(() => syncOn()), 'must start signed out');
  });

  await test('SETASIDE-SIGNIN-01 a successful sign-in does not delete set-aside storage', async () => {
    await signIn(server.user.email, pb.ATHLETE.pass);
    const signedIn = await page.evaluate(() => ({ on: syncOn(), uid: pbUid() }));
    ok(signedIn.on, 'the sign-in must actually have succeeded for this to test anything');
    eq(signedIn.uid, server.user.id, 'and as the expected account');
    const after = await keys();
    eq(after.join(','), before.join(','), 'set-aside storage changed across a successful sign-in');
  });

  await test('SETASIDE-SIGNIN-02 it is not silently marked handled or adopted', async () => {
    const state_ = await page.evaluate((s) => ({
      complete: cfQuarComplete(s),
      listed: cfQuarList().length,
      flag: localStorage.getItem('cf:quar'),
      /* the athlete's live data must NOT have become the set-aside copy */
      liveName: (window.state && state.settings && state.settings.name) || null,
    }), STAMP);
    ok(state_.complete, 'the copy must still verify as complete');
    eq(state_.listed, 1, 'and still be listed as one unresolved copy');
    notOk(state_.liveName === 'SET-ASIDE DEMO',
      'the set-aside copy was auto-adopted into the signed-in account');
  });

  await test('SETASIDE-SIGNIN-03 it remains reachable through its lifecycle surface', async () => {
    /* The approved lifecycle shows the inventory on the signed-OUT screen. So
       "still reachable" means: the record is intact and the surface returns on
       sign-out — not merely that the data sits in storage unreferenced. */
    const reachable = await page.evaluate((s) => ({
      readable: !!localStorage.getItem('cf:quarantine:' + s + ':core'),
      listed: cfQuarList().length,
      renders: /Data set aside on this device/.test(pbLoginHTML()),
    }), STAMP);
    ok(reachable.readable, 'the stored copy must still be readable');
    eq(reachable.listed, 1);
    ok(reachable.renders,
      'the recovery surface must still render the copy when the login screen is shown');
  });

  section('SETASIDE-SIGNIN-04 — another account cannot silently consume it');

  await test('SETASIDE-SIGNIN-04 a second real account leaves the copy untouched', async () => {
    await page.evaluate(() => { try { pbClearSession(true); } catch (e) {} });
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.style.visibility !== 'hidden', null, { timeout: 10000 });
    await page.waitForTimeout(500);
    await signIn('cf_test_other@staging.invalid', 'OtherPw123456');
    const res = await page.evaluate((s) => ({
      uid: pbUid(),
      keys: Object.keys(localStorage).filter((k) => /^cf:quarantine:/.test(k)).sort(),
      complete: cfQuarComplete(s),
      liveName: (window.state && state.settings && state.settings.name) || null,
    }), STAMP);
    notOk(res.uid === server.user.id, 'the second account must be a different user, got ' + res.uid);
    eq(res.keys.join(','), before.join(','), 'a different account changed the set-aside storage');
    ok(res.complete, 'and it must still be complete');
    notOk(res.liveName === 'SET-ASIDE DEMO',
      'another account silently adopted the set-aside copy');
  });

  section('SETASIDE-SIGNIN-05 — logout and return');

  await test('SETASIDE-SIGNIN-05 logging out and returning preserves the unresolved copy', async () => {
    await page.evaluate(() => { try { pbClearSession(true); } catch (e) {} });
    await page.waitForTimeout(400);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.style.visibility !== 'hidden', null, { timeout: 10000 });
    await page.waitForTimeout(600);
    await page.evaluate(() => ['wl-applied-banner', 'wl-update-banner'].forEach((id) => {
      const el = document.getElementById(id); if (el && el.remove) el.remove();
    }));
    const res = await page.evaluate((s) => ({
      keys: Object.keys(localStorage).filter((k) => /^cf:quarantine:/.test(k)).sort(),
      complete: cfQuarComplete(s),
      visible: !!document.getElementById('wl-setaside-title'),
      save: !!document.querySelector('[data-act^="cf:qexport"]'),
      del: !!document.querySelector('[data-act^="cf:qdelete"]'),
    }), STAMP);
    eq(res.keys.join(','), before.join(','), 'logout/return changed the set-aside storage');
    ok(res.complete, 'the copy must still be complete');
    ok(res.visible, 'and visible again on the login screen');
    ok(res.save && res.del, 'with both actions available');
  });

  const failed = summary('setaside-signin.browser.test.js');
  await browser.close();
  await new Promise((r) => web.close(r));
  await server.stop();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAILURE', e); process.exit(1); });
