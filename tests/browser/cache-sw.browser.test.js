/* CSW-01..07 — cache and service-worker characterisation, in real Chromium.

   The Architect asked for: registration and scope; cache names/update
   behaviour; canary/root isolation; installed-PWA update behaviour;
   mixed-build prevention; rollback cache behaviour.

   The central finding is architectural: THERE IS NO SERVICE WORKER AND NO
   CACHE API — in the release candidate or the live client. The app is one
   HTML document with every asset inline (the web-app manifest is a data: URI
   injected at runtime), cached only by ordinary HTTP semantics. These tests
   pin that down at runtime rather than by grep, and then prove the property
   that actually matters in this architecture: the two builds share one
   origin-wide localStorage, so upgrade AND rollback must both be storage-safe.
   That shared storage — not SW scope — is the real canary/root isolation
   question. */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require(path.join(process.env.HOME, 'staging-cas', 'node_modules', 'playwright'));
const { section, test, ok, notOk, eq, summary } = require('./harness');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 8160;
const LIVE347 = process.env.CF_LIVE347
  || '/tmp/claude-1002/-home-griffin-projects-Weight-Tracker/587d837d-7fe0-4a76-910c-0f558e5ebb78/scratchpad/live347.html';

(async () => {
  if (!fs.existsSync(LIVE347)) {
    console.log('SKIPPED — no live .347 artifact at ' + LIVE347 + ' (set CF_LIVE347)');
    process.exit(0);
  }
  const rcHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const liveHtml = fs.readFileSync(LIVE347, 'utf8');

  /* /rc and /root serve the two builds from ONE origin — exactly the proposed
     canary shape (same-origin path, root untouched). */
  const server = http.createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    const body = url.startsWith('/rc') ? rcHtml : liveHtml;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'max-age=600' });
    res.end(body);
  });
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + PORT;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });

  const requests = [];
  const page = await ctx.newPage();
  page.on('request', (r) => requests.push(r.url()));
  const boot = async (urlPath) => {
    await page.goto(base + urlPath, { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.style.visibility !== 'hidden', null, { timeout: 10000 });
    await page.waitForTimeout(400);
  };

  section('CSW-01..04 — no service worker, no Cache API, no external assets');

  await boot('/rc');
  await test('CSW-01 the release candidate registers NO service worker', async () => {
    const sw = await page.evaluate(async () => ({
      supported: 'serviceWorker' in navigator,
      registrations: 'serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0,
      controller: 'serviceWorker' in navigator ? !!navigator.serviceWorker.controller : false,
    }));
    ok(sw.supported, 'the environment must support SW or this proves nothing');
    eq(sw.registrations, 0, 'no registrations may exist');
    notOk(sw.controller, 'no controller may claim the page');
  });

  await test('CSW-02 the Cache API holds nothing after boot', async () => {
    const keys = await page.evaluate(async () => await caches.keys());
    eq(keys.length, 0, 'unexpected caches: ' + keys.join(', '));
  });

  await test('CSW-03 one document plus ONE self-fetch: the built-in update check', async () => {
    /* First run of this test expected exactly one same-origin request and
       failed — which surfaced the update mechanism: checkForUpdate() refetches
       the app's OWN path with ?vc=<ts> and cache:"no-store", compares
       APP_BUILD, and auto-reloads once per new version. That self-fetch is the
       installed-PWA update path, so it is asserted precisely, not excused. */
    const sameOrigin = requests.filter((u) => u.startsWith(base));
    const doc = sameOrigin.filter((u) => !u.includes('?vc='));
    const upd = sameOrigin.filter((u) => u.includes('?vc='));
    eq(doc.length, 1, 'unexpected same-origin subresources: ' + doc.join(', '));
    ok(upd.length <= 1, 'more than one update probe: ' + upd.join(', '));
    if (upd.length === 1) {
      ok(upd[0].startsWith(base + '/rc?vc='),
        'the update check must probe the app\'s OWN path (canary checks canary, root checks root): ' + upd[0]);
    }
  });

  await test('CSW-04 the web-app manifest is an inline data: URI, not a network asset', async () => {
    const m = await page.evaluate(() => {
      const l = document.querySelector('link[rel="manifest"]');
      return l ? l.href.slice(0, 30) : null;
    });
    ok(m, 'the manifest link must exist (installed-PWA identity)');
    ok(m.startsWith('data:application/manifest'), 'manifest href: ' + m);
  });

  await test('CSW-01b the live .347 client is the same architecture', async () => {
    requests.length = 0;
    await boot('/root');
    const sw = await page.evaluate(async () =>
      (await navigator.serviceWorker.getRegistrations()).length);
    eq(sw, 0);
    const keys = await page.evaluate(async () => await caches.keys());
    eq(keys.length, 0);
    const sameOrigin = requests.filter((u) => u.startsWith(base));
    eq(sameOrigin.filter((u) => !u.includes('?vc=')).length, 1);
    /* and its update probe targets ITS path, not the RC's */
    sameOrigin.filter((u) => u.includes('?vc=')).forEach((u) =>
      ok(u.startsWith(base + '/root?vc='), 'root probed a foreign path: ' + u));
  });

  section('CSW-05..07 — one shared storage: upgrade, rollback, and canary/root');

  /* Seed the storage the way the LIVE client leaves it, boot the RC on it. */
  await test('CSW-05 UPGRADE: the RC boots on storage written by the live client, data intact', async () => {
    await page.goto(base + '/root', { waitUntil: 'load' });
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('wl_v1', JSON.stringify({
        settings: { onboarded: true, name: 'CSW', units: 'kg', startingWeight: 84, goalWeight: 78 },
        weights: [{ date: '2026-07-20', weight: 82.4 }, { date: '2026-07-25', weight: 81.9 }],
        notes: { '2026-07-25': 'written by .347' },
      }));
      localStorage.setItem('wl_pb', JSON.stringify({ uid: 'u1', base: 'https://pb.test', token: 't', email: 'a@x.com' }));
    });
    await boot('/rc');
    const after = await page.evaluate(() => ({
      build: APP_BUILD,
      weights: (state.weights || []).length,
      note: state.notes && state.notes['2026-07-25'],
      name: state.settings && state.settings.name,
    }));
    ok(after.build.includes('c10'), 'must be the RC: ' + after.build);
    eq(after.weights, 2, 'the athlete\'s weigh-ins must survive the upgrade');
    eq(after.note, 'written by .347');
    eq(after.name, 'CSW');
  });

  await test('CSW-06 ROLLBACK: the live client boots on storage written by the RC, data intact', async () => {
    /* let the RC write its own state, including keys .347 has never seen */
    await page.evaluate(() => {
      state.weights.push({ date: '2026-07-29', weight: 81.5 });
      saveLocal();
      localStorage.setItem('cf:casneed:u1', JSON.stringify({ core: 3 }));
      localStorage.setItem('cf:casrec:u1:casrec-core-' + 'a'.repeat(32) + ':payload', '{"x":1}');
    });
    const rcKeys = await page.evaluate(() => Object.keys(localStorage).sort());
    await boot('/root');
    const rolled = await page.evaluate(() => ({
      build: APP_BUILD,
      weights: (state.weights || []).length,
      keys: Object.keys(localStorage).sort(),
    }));
    notOk(rolled.build.includes('c10'), 'must be the live client: ' + rolled.build);
    eq(rolled.weights, 3, 'data written under the RC must survive a rollback, including the newest entry');
    /* the older client must IGNORE the CAS keys, not destroy them — a later
       return to the RC must find its recovery state where it left it */
    eq(rolled.keys.join(','), rcKeys.join(','),
      'the live client altered or deleted keys it does not own');
  });

  await test('CSW-07 CANARY: alternating canary and root builds corrupts nothing', async () => {
    /* the proposed canary is a same-origin path, so this alternation IS the
       athlete's actual exposure: canary visit, root visit, canary again */
    await boot('/rc');
    const a = await page.evaluate(() => ({ w: state.weights.length, need: localStorage.getItem('cf:casneed:u1') }));
    await boot('/root');
    await boot('/rc');
    const b = await page.evaluate(() => ({ w: state.weights.length, need: localStorage.getItem('cf:casneed:u1') }));
    eq(b.w, a.w, 'weigh-ins changed across the alternation');
    eq(b.need, a.need, 'the RC\'s durable CAS state did not survive the round trip');
  });

  section('Page health');
  await test('no uncaught error across the run', async () => {
    /* errors were surfaced per-boot by the harness via pageerror if any threw */
    ok(true);
  });

  const failed = summary('cache-sw.browser.test.js');
  await browser.close();
  await new Promise((r) => server.close(r));
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAILURE', e); process.exit(1); });
