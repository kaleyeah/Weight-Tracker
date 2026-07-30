/* GATE-01..08 — the ownership gate's own buttons must WORK.

   Found on a real iPhone during the day-one canary smoke, 2026-07-30: the
   athlete signed into the canary, hit "Is this your data?", and "No — set it
   aside" did nothing at all. Repeated taps, nothing. The only control that
   responded was the unsafe one ("Yes — this is mine"), which would have merged
   unknown pre-sign-in data into a real account.

   Cause: cfDisownLocal runs behind askConfirm, which queues
   state.pendingConfirm and calls render() to paint the dialog. The final render
   gate replaces #app with cfBlockedHTML(b) and returns, and
   confirmOverlayHTML() is otherwise only appended by the main app render and
   the login render — so the dialog could never be painted. Every
   confirm-driven action reachable from that screen was dead the same way.

   Why no existing suite caught it: the set-aside suites drive cfDisownLocal()
   and the recovery surfaces DIRECTLY, never through the gate's button, and the
   string suites cannot see paint at all. So these tests assert on what the
   athlete can actually reach: real clicks on the rendered gate, in a real
   browser, with the dialog required to be VISIBLE before it is used.

   Disposable instance, 127.0.0.1, cf_test_* accounts only, destroyed after the
   run. Production is not involved. */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require(path.join(process.env.HOME, 'staging-cas', 'node_modules', 'playwright'));
const pb = require('./pbserver');
const { section, test, ok, notOk, eq, summary } = require('./harness');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 8161;
const PB_PORT = 8162;

/* Pre-sign-in data that is MEANINGFUL (so the gate triggers) and identifiable
   (so we can prove it was preserved, not destroyed, and never adopted). */
const PRE = JSON.stringify({
  settings: { onboarded: true, name: 'PRE-SIGNIN STRANGER' },
  weights: [{ date: '2026-01-09', weight: 101.5, note: 'stranger row' }],
});

const SEED = (base) => `<!doctype html><meta charset="utf-8"><body><script>
localStorage.clear();
/* data on the device from before any sign-in — exactly the iPhone situation */
localStorage.setItem('wl_v1', ${JSON.stringify(PRE)});
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

  await page.goto('http://127.0.0.1:' + PORT + '/seed', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.style.visibility !== 'hidden', null, { timeout: 10000 });
  /* the update banner overlays the top of the screen; it is not under test */
  await page.evaluate(() => ['wl-applied-banner', 'wl-update-banner'].forEach((id) => {
    const el = document.getElementById(id); if (el && el.remove) el.remove();
  }));

  const signIn = async () => {
    await page.evaluate((c) => {
      const e = document.getElementById('wl-pb-email'); if (e) e.value = c.email;
      const p = document.getElementById('wl-pb-pass'); if (p) p.value = c.pass;
      try { pbDoLogin(); } catch (err) { /* asserted below */ }
    }, { email: server.user.email, pass: pb.ATHLETE.pass });
    await page.waitForFunction(() => (typeof syncOn === 'function') && syncOn(), null, { timeout: 15000 });
    await page.waitForTimeout(500);
  };

  section('GATE-01..03 — the athlete really is at the gate, with real data behind it');

  await test('GATE-01 a genuine sign-in with meaningful pre-sign-in data lands on the gate', async () => {
    notOk(await page.evaluate(() => syncOn()), 'must start signed out');
    await signIn();
    ok(await page.evaluate(() => syncOn()), 'the sign-in must have actually succeeded');
    const verdict = await page.evaluate(() => cfAccountBlocked());
    eq(verdict, 'unclaimed', 'the gate must be the "is this your data" case');
    /* what the athlete can SEE — not what the source says */
    const seen = await page.evaluate(() => ({
      title: (document.body.innerText.match(/Is this your data\?/) || [])[0] || null,
      buttons: Array.from(document.querySelectorAll('[data-act]')).map((b) => b.getAttribute('data-act')),
    }));
    eq(seen.title, 'Is this your data?', 'the gate screen must be painted');
    ok(seen.buttons.includes('cf:disown'), 'the set-aside button must be present: ' + JSON.stringify(seen.buttons));
    ok(seen.buttons.includes('cf:claim'), 'and the claim button');
  });

  await test('GATE-02 precondition: the pre-sign-in data is present and not yet set aside', async () => {
    const st = await page.evaluate(() => ({
      live: localStorage.getItem('wl_v1'),
      quarKeys: Object.keys(localStorage).filter((k) => /^cf:quarantine:/.test(k)).length,
      flag: localStorage.getItem('cf:quarantined'),
    }));
    ok(st.live && /PRE-SIGNIN STRANGER/.test(st.live), 'the stranger data must still be in place');
    eq(st.quarKeys, 0, 'nothing may be set aside yet');
    eq(st.flag, null);
  });

  await test('GATE-03 no confirmation dialog is showing before the athlete asks for one', async () => {
    eq(await page.evaluate(() => document.querySelectorAll('.wl-confirm').length), 0);
  });

  section('GATE-04..06 — "No — set it aside" actually works (the iPhone defect)');

  await test('GATE-04 tapping it PAINTS a visible confirmation dialog', async () => {
    await page.click('[data-act="cf:disown"]');
    /* the defect: pendingConfirm gets queued but the gate never paints it, so
       this wait is the whole test. Assert visibility, not mere existence. */
    await page.waitForSelector('.wl-confirm', { state: 'visible', timeout: 5000 });
    const dlg = await page.evaluate(() => {
      const el = document.querySelector('.wl-confirm');
      const r = el.getBoundingClientRect();
      return {
        text: el.innerText,
        onscreen: r.width > 0 && r.height > 0,
        confirmLabel: (el.querySelector('[data-act="confirm:yes"]') || {}).innerText || null,
        hasCancel: !!el.querySelector('[data-act="confirm:no"]'),
      };
    });
    ok(dlg.onscreen, 'the dialog must occupy real screen area');
    ok(/[Ss]et (this data )?aside/.test(dlg.text), 'it must ask about setting the data aside: ' + dlg.text);
    eq(dlg.confirmLabel, 'Set aside', 'the confirm button must be labelled for this action');
    ok(dlg.hasCancel, 'and a cancel must be offered');
  });

  await test('GATE-05 Cancel dismisses it and changes nothing', async () => {
    await page.click('[data-act="confirm:no"]');
    await page.waitForFunction(() => document.querySelectorAll('.wl-confirm').length === 0, null, { timeout: 5000 });
    const st = await page.evaluate(() => ({
      stillGated: cfAccountBlocked(),
      live: localStorage.getItem('wl_v1'),
      quarKeys: Object.keys(localStorage).filter((k) => /^cf:quarantine:/.test(k)).length,
      gateVisible: /Is this your data\?/.test(document.body.innerText),
    }));
    eq(st.stillGated, 'unclaimed', 'cancelling must leave the athlete at the gate');
    ok(st.gateVisible, 'and the gate must be repainted, not left blank');
    ok(/PRE-SIGNIN STRANGER/.test(st.live || ''), 'cancel must not touch the data');
    eq(st.quarKeys, 0, 'cancel must not set anything aside');
  });

  await test('GATE-06 confirming sets the data aside, preserved, and clears the gate', async () => {
    await page.click('[data-act="cf:disown"]');
    await page.waitForSelector('.wl-confirm', { state: 'visible', timeout: 5000 });
    await page.click('[data-act="confirm:yes"]');
    /* cfDisownLocal reloads the page; wait for the app to come back up */
    await page.waitForFunction(() => document.documentElement.style.visibility !== 'hidden', null, { timeout: 15000 });
    await page.waitForTimeout(500);
    const st = await page.evaluate(() => {
      const quar = Object.keys(localStorage).filter((k) => /^cf:quarantine:/.test(k));
      const coreKey = quar.find((k) => /:core$/.test(k));
      return {
        blocked: cfAccountBlocked(),
        quarCount: quar.length,
        preserved: coreKey ? localStorage.getItem(coreKey) : null,
        flag: localStorage.getItem('cf:quarantined'),   /* CF_QUAR_FLAG */
        liveData: localStorage.getItem('wl_v1'),
        liveName: (window.state && state.settings && state.settings.name) || null,
      };
    });
    eq(st.blocked, '', 'the gate must be cleared after setting the data aside');
    ok(st.quarCount >= 1, 'a set-aside copy must exist');
    ok(st.preserved && /PRE-SIGNIN STRANGER/.test(st.preserved),
      'the stranger data must be PRESERVED in the set-aside copy, not destroyed');
    ok(st.flag, 'the set-aside flag must be recorded');
    notOk(st.liveName === 'PRE-SIGNIN STRANGER',
      'the stranger data must NOT have become the signed-in account\'s live data');
  });

  section('GATE-07..08 — the set-aside copy stays reachable, and the run was clean');

  await test('GATE-07 the copy is listed and complete on the recovery surface', async () => {
    const st = await page.evaluate(() => {
      const list = (typeof cfQuarList === 'function') ? cfQuarList() : [];
      return {
        listed: list.length,
        complete: list.length ? cfQuarComplete(list[0].stamp || list[0]) : false,
        rendersOnLogin: (typeof pbLoginHTML === 'function')
          ? /Data set aside on this device/.test(pbLoginHTML()) : false,
      };
    });
    ok(st.listed >= 1, 'the set-aside copy must be listed');
    ok(st.complete, 'and verify as complete');
    ok(st.rendersOnLogin, 'and be offered on the signed-out screen');
  });

  await test('GATE-08 no uncaught page errors during the whole gate interaction', async () => {
    const unexpected = errors.filter((e) => !/pb\.test|ERR_|Failed to fetch|NetworkError/i.test(e));
    eq(unexpected.length, 0, unexpected.join('\n'));
  });

  await browser.close();
  web.close();
  await server.stop();
  summary('ownership-gate.browser.test.js');
})().catch((e) => { console.error(e); process.exit(1); });
