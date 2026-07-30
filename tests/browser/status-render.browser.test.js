/* STATUS-V4-VIS-01..06 — the status states are VISIBLY what they claim to be.

   The previous package shipped six screenshots that showed the onboarding
   screen. The Architect said so plainly: they "do not prove the rendering
   claims they are named for". Two things were wrong — the disposable account
   was never onboarded (`state.onboarding` is the real gate, not
   `settings.onboarded`), and the Account card is reached through Settings ->
   "Sync & Devices" with `state.open.sync`, not a settings sub-page.

   This suite asserts the rendered facts rather than trusting a picture: the
   header dot's class, the settings detail's visible text and colour, the
   accessible name, and that a red source visibly outranks an amber one — at
   both mobile and desktop width. The screenshots in the package are captured
   from this same navigation. */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require(path.join(process.env.HOME, 'staging-cas', 'node_modules', 'playwright'));
const pb = require('./pbserver');
const { section, test, ok, notOk, eq, summary } = require('./harness');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 8251;
const PB_PORT = 8252;

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

  /* one prepared page per viewport, onboarded and sitting on the Account card */
  const prepare = async (width, height, mobile) => {
    const ctx = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile });
    const page = await ctx.newPage();
    await page.goto('http://127.0.0.1:' + PORT + '/seed', { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.style.visibility !== 'hidden', null, { timeout: 10000 });
    await page.evaluate(() => ['wl-applied-banner', 'wl-update-banner'].forEach((id) => {
      const el = document.getElementById(id); if (el && el.remove) el.remove();
    }));
    await page.evaluate((c) => {
      document.getElementById('wl-pb-email').value = c.email;
      document.getElementById('wl-pb-pass').value = c.pass;
      try { pbDoLogin(); } catch (e) {}
    }, { email: server.user.email, pass: pb.ATHLETE.pass });
    await page.waitForFunction(() => (typeof syncOn === 'function') && syncOn(), null, { timeout: 15000 });
    await page.evaluate(() => {
      state.onboarding = false;                      /* the REAL onboarding gate */
      state.settings.onboarded = true; state.settings.name = 'Canary Athlete';
      state.weights.push({ d: '2026-07-29', kg: 80.0 });
      save();
      try { render(); } catch (e) {}
    });
    await page.waitForTimeout(300);
    return page;
  };

  /* Settings root -> "Sync & Devices" -> the Account card. Setting
     state.open.sync alone is not enough: the card only exists once that
     sub-page is rendered, which is why the first version of this suite found no
     status line at all. */
  const openAccount = async (page) => {
    await page.evaluate(() => {
      state.onboarding = false; state.view = 'settings'; state.setPage = null;
      try { render(); } catch (e) {}
    });
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      const row = [...document.querySelectorAll('button,[data-act],a,div')]
        .find((e) => /^\s*Sync & Devices/i.test((e.textContent || '').trim()));
      if (row) row.click();
    });
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      state.open = state.open || {}; state.open.sync = true;
      try { render(); cfCasPaint(); } catch (e) {}
    });
    await page.waitForTimeout(250);
  };

  const show = async (page, setup) => {
    await page.evaluate(() => { CF_STATUS = {}; cfPending = null; revClean('core'); revClean('training'); cfStatusProject(); });
    await page.evaluate(setup);
    await openAccount(page);
    return page.evaluate(() => {
      const dot = document.getElementById('wl-sdot');
      const ctl = document.querySelector('[data-act="syncdot"]');
      const st = document.getElementById('wl-sync-status');
      const r = st ? st.getBoundingClientRect() : null;
      return {
        dotClass: dot ? dot.className : null,
        aria: ctl ? ctl.getAttribute('aria-label') : null,
        detailText: st ? st.textContent.trim() : null,
        detailHTML: st ? st.innerHTML : null,
        detailVisible: !!(r && r.height > 0 && r.width > 0),
        label: syncLabel(),
      };
    });
  };

  const mobile = await prepare(390, 844, true);
  const desktop = await prepare(1280, 900, false);

  section('STATUS-V4-VIS-01..06 — mobile');

  await test('STATUS-V4-VIS-01 pending is visibly amber with safe-local wording', async () => {
    const v = await show(mobile, () => { cfSetPending('push'); });
    ok(v.detailVisible, 'the settings status line must actually be on screen');
    eq(v.dotClass, 'wl-sdot warn', 'amber dot');
    eq(v.label, 'Attention needed');
    ok(/Saved on this device\. Waiting to sync\./.test(v.detailText), v.detailText);
    ok(/var\(--accent\)/.test(v.detailHTML), 'amber colour in the detail: ' + v.detailHTML.slice(0, 120));
    notOk(/tap to upload/i.test(v.detailText), 'the obsolete manual instruction is gone');
  });

  await test('STATUS-V4-VIS-02 the photo warning is visibly amber and distinct from pending', async () => {
    const v = await show(mobile, () => { cfPhotoStatusIncomplete(); });
    eq(v.dotClass, 'wl-sdot warn');
    ok(/Photo sync couldn.t be fully checked/.test(v.detailText), v.detailText);
    ok(/Nothing was removed/.test(v.detailText));
    notOk(/Saved on this device/.test(v.detailText), 'distinct from the pending wording');
  });

  await test('STATUS-V4-VIS-03 a network failure is visibly red', async () => {
    const v = await show(mobile, () => { cfStatusSet('cas-network', CF_NETWORK_MSG); });
    eq(v.dotClass, 'wl-sdot bad', 'red dot');
    eq(v.label, 'Sync error');
    ok(/Couldn.t sync — changes are safe here\./.test(v.detailText), v.detailText);
    ok(/var\(--bad\)/.test(v.detailHTML), 'red colour in the detail');
  });

  await test('STATUS-V4-VIS-04 an auth failure is visibly red', async () => {
    const v = await show(mobile, () => { cfStatusSet('auth', CF_AUTH_MSG); });
    eq(v.dotClass, 'wl-sdot bad');
    ok(/Sign in to sync/.test(v.detailText), v.detailText);
  });

  await test('STATUS-V4-VIS-05 a red source visibly outranks an amber one', async () => {
    const v = await show(mobile, () => {
      cfPhotoStatusIncomplete();
      cfStatusSet('legacy-manual', 'Couldn’t reach your server. Your changes are safe here.');
    });
    eq(v.dotClass, 'wl-sdot bad', 'the dot shows the red cause');
    ok(/Couldn.t reach your server/.test(v.detailText), 'and the detail shows it: ' + v.detailText);
    notOk(/Photo sync/.test(v.detailText), 'the amber cause must not be what is displayed');
  });

  await test('STATUS-V4-VIS-06 header and detail communicate the same top source', async () => {
    const v = await show(mobile, () => { cfStatusSet('auth', CF_AUTH_MSG); cfPhotoStatusIncomplete(); });
    ok(v.aria && v.aria.indexOf('Sign in to sync') >= 0,
      'the header accessible name carries the top cause: ' + JSON.stringify(v.aria));
    ok(v.detailText.indexOf('Sign in to sync') >= 0, 'and the detail agrees: ' + v.detailText);
    eq(v.dotClass, 'wl-sdot bad');
  });

  section('STATUS-V4-VIS — desktop viewport');

  await test('STATUS-V4-VIS the same states render at desktop width', async () => {
    const pend = await show(desktop, () => { cfSetPending('push'); });
    ok(pend.detailVisible, 'the status line must be visible at desktop width too');
    eq(pend.dotClass, 'wl-sdot warn');
    ok(/Saved on this device/.test(pend.detailText), pend.detailText);
    const red = await show(desktop, () => { cfStatusSet('cas-network', CF_NETWORK_MSG); });
    eq(red.dotClass, 'wl-sdot bad');
    ok(/safe here/.test(red.detailText), red.detailText);
    notOk(pend.dotClass === red.dotClass, 'amber and red remain distinguishable');
  });

  await browser.close();
  web.close();
  await server.stop();
  summary('status-render.browser.test.js');
})().catch((e) => { console.error(e); process.exit(1); });
