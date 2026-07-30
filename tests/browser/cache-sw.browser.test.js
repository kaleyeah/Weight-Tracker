/* CSW-01..09 and CSW-V2-01..13 — cache/service-worker characterisation.

   V2 revision, after three Architect corrections that were all fair:

   - CSW-03 asserted `upd.length <= 1`, which a build that never probes would
     pass. Occurrence is now awaited deterministically (V2-01/02).
   - The `cache:"no-store"` claim was asserted from source, not runtime. The
     browser's own fetch is now instrumented BEFORE app code runs, recording
     {url, cache, method} while delegating to the native fetch (V2-07..09) —
     the Architect's preferred approach.
   - The page-health test was `ok(true)` under a comment describing a pageerror
     listener that did not exist. A vacuous test AND a false caption in one
     line — my two most-repeated failure classes together. Collectors are now
     registered before any boot, carry a narrow documented allowlist, and a
     negative control proves the assertion fails when an exception is injected
     (V2-10..13).

   Architecture facts unchanged: no service worker, no Cache API, one document,
   inline data:-URI manifest; update via a self-fetch of the app's OWN path;
   storage shared across builds and safe in both directions. */
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

  /* Server. /rc and /root serve fixed builds. /upg simulates a deploy whose
     CDN has caught up (first document load = old build, every later one =
     new). /flip simulates persistent CDN lag (documents stay old, the
     no-store probe sees new). docLoads counts full document loads per path. */
  const docLoads = { '/rc': 0, '/root': 0, '/upg': 0, '/flip': 0 };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const p = u.pathname;
    const isProbe = u.searchParams.has('vc');
    let body;
    if (p === '/rc') body = rcHtml;
    else if (p === '/root') body = liveHtml;
    else if (p === '/upg') body = isProbe ? rcHtml : (docLoads['/upg'] === 0 ? liveHtml : rcHtml);
    else if (p === '/flip') body = isProbe ? rcHtml : liveHtml;
    else { res.writeHead(404); res.end(); return; }
    if (!isProbe) docLoads[p]++;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'max-age=600' });
    res.end(body);
  });
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + PORT;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });

  /* Fetch instrumentation, installed before ANY app code runs on every page
     in this context. Records the cache OPTION, which network events cannot
     see. Delegates to the native fetch, so behaviour is unchanged. */
  await ctx.addInitScript(() => {
    window.__fetches = [];
    const native = window.fetch.bind(window);
    window.fetch = function (input, init) {
      try {
        window.__fetches.push({
          url: String(typeof input === 'string' ? input : (input && input.url) || input),
          cache: (init && init.cache) || (typeof input === 'object' && input && input.cache) || '(default)',
          method: (init && init.method) || 'GET',
        });
      } catch (e) { /* never break the app */ }
      return native(input, init);
    };
  });

  /* Error collectors: registered at page CREATION, before any boot, tagged by
     page label. Allowlist, documented and narrow: resource-load console errors
     for the app's PocketBase base (unreachable by design in this suite) — and
     nothing else. An uncaught exception is never allowed. */
  const errors = [];
  const ALLOW = (e) => e.kind === 'console'
    && /Failed to load resource|net::ERR_/.test(e.text)
    && /pb\.test|rack\.tail/.test(e.text + (e.locationUrl || ''));
  const newPage = async (label) => {
    const p = await ctx.newPage();
    p.on('pageerror', (err) => errors.push({ label, kind: 'exception', text: String(err && err.message || err) }));
    p.on('console', (m) => {
      if (m.type() === 'error') {
        errors.push({ label, kind: 'console', text: m.text(), locationUrl: (m.location() || {}).url || '' });
      }
    });
    return p;
  };
  const unexpected = () => errors.filter((e) => e.label !== 'negctl' && !ALLOW(e));

  const page = await newPage('main');
  const boot = async (urlPath) => {
    await page.goto(base + urlPath, { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.style.visibility !== 'hidden', null, { timeout: 10000 });
  };
  /* deterministic: the probe HAS happened, not "did not happen yet" */
  const awaitProbe = (p) => p.waitForFunction(
    () => (window.__fetches || []).some((f) => f.url.includes('?vc=')), null, { timeout: 10000 });
  const probes = (p) => p.evaluate(() => (window.__fetches || []).filter((f) => f.url.includes('?vc=')));
  /* window.__fetches is PER-DOCUMENT — navigation resets it. A whole-session
     assertion therefore has to accumulate here on the Node side; reading the
     current page can only ever see the latest boot. That wrong assumption is
     what my first rewrite of V2-03 shipped with. */
  const sessionProbes = [];

  section('CSW-01..04 — no service worker, no Cache API, one document');

  await boot('/rc');
  await test('CSW-01 the release candidate registers NO service worker', async () => {
    const sw = await page.evaluate(async () => ({
      supported: 'serviceWorker' in navigator,
      registrations: (await navigator.serviceWorker.getRegistrations()).length,
      controller: !!navigator.serviceWorker.controller,
    }));
    ok(sw.supported, 'environment must support SW or this proves nothing');
    eq(sw.registrations, 0);
    notOk(sw.controller);
  });

  await test('CSW-02 the Cache API holds nothing after boot', async () => {
    const keys = await page.evaluate(async () => await caches.keys());
    eq(keys.length, 0, 'unexpected caches: ' + keys.join(', '));
  });

  await test('CSW-04 the web-app manifest is an inline data: URI', async () => {
    const m = await page.evaluate(() => {
      const l = document.querySelector('link[rel="manifest"]');
      return l ? l.href.slice(0, 30) : null;
    });
    ok(m && m.startsWith('data:application/manifest'), 'manifest href: ' + m);
  });

  section('CSW-V2-01..04 — the probe OCCURS, and never targets a foreign path');

  await test('CSW-V2-01 the candidate performs its self-update probe (awaited, not assumed)', async () => {
    await awaitProbe(page);            /* times out = fails; <=1 can no longer pass vacuously */
    const ps = await probes(page);
    sessionProbes.push(...ps);
    ok(ps.length >= 1);
    ps.forEach((f) => ok(f.url.startsWith(base + '/rc?vc='), 'foreign probe: ' + f.url));
  });

  await test('CSW-V2-07/08 the shipping probe uses cache:"no-store" against its own pathname', async () => {
    const ps = await probes(page);
    ps.forEach((f) => {
      eq(f.cache, 'no-store', 'probe fetch cache option was ' + f.cache);
      eq(f.method, 'GET');
      ok(f.url.startsWith(base + '/rc?vc='), f.url);
    });
  });

  await test('CSW-V2-09 the probe mutates no application or athlete state', async () => {
    const before = await page.evaluate(() => JSON.stringify({
      ls: Object.entries(localStorage).sort(),
      weights: (window.state && state.weights) || null,
    }));
    await page.evaluate(() => checkForUpdate());
    await page.waitForTimeout(400);    /* same build served, so nothing should change */
    const after = await page.evaluate(() => JSON.stringify({
      ls: Object.entries(localStorage).sort(),
      weights: (window.state && state.weights) || null,
    }));
    eq(after, before, 'a same-build probe changed state');
  });

  await test('CSW-V2-02/04 the root probes itself and never the candidate', async () => {
    await boot('/root');
    await awaitProbe(page);
    const ps = await probes(page);
    sessionProbes.push(...ps);
    ok(ps.length >= 1, 'the root build must probe too');
    ps.filter((f) => !f.url.includes('/rc?')).forEach((f) =>
      ok(f.url.startsWith(base + '/root?vc='), 'root probed a foreign path: ' + f.url));
    notOk(ps.some((f) => f.url.startsWith(base + '/rc?vc=') && !f.url.startsWith(base + '/root')),
      'earlier rc probes are from the previous boot; no NEW rc probe may originate from root');
  });

  await test('CSW-V2-03 across the whole session, every probe targeted the path that made it', async () => {
    /* Two of my own defects live in this test's history. The first draft
       contained `notOk(x && false)` — a placeholder, always true. The second
       read window.__fetches for "the whole session", but that log is
       per-document and resets on navigation, so it could only ever see one
       boot — the conditional-commit gate caught that one. The probes are now
       accumulated Node-side as each boot completes. */
    ok(sessionProbes.length >= 2, 'expected probes from both boots, saw ' + sessionProbes.length);
    ok(sessionProbes.some((f) => f.url.startsWith(base + '/rc?vc=')), 'no candidate probe recorded');
    ok(sessionProbes.some((f) => f.url.startsWith(base + '/root?vc=')), 'no root probe recorded');
    sessionProbes.forEach((f) => ok(
      f.url.startsWith(base + '/rc?vc=') || f.url.startsWith(base + '/root?vc='),
      'probe with a foreign or malformed target: ' + f.url));
  });

  section('CSW-V2-05/06 — one reload per version; CDN lag gets a banner, not a loop');

  await test('CSW-V2-05 a newer served build causes exactly one automatic reload', async () => {
    const p = await newPage('upg');    /* fresh tab: fresh sessionStorage guard */
    await p.goto(base + '/upg', { waitUntil: 'load' });
    /* boots as .347, probe sees the RC build, reloads once onto it */
    await p.waitForFunction(() => /c10/.test(window.APP_BUILD || ''), null, { timeout: 15000 });
    await p.waitForTimeout(1200);      /* window in which a loop would show */
    eq(docLoads['/upg'], 2, 'expected exactly initial load + one reload, saw ' + docLoads['/upg']);
    const banner = await p.evaluate(() => !!document.getElementById('wl-update-banner'));
    notOk(banner, 'a clean upgrade needs no banner');
    await p.close();
  });

  await test('CSW-V2-06 persistent CDN lag falls back to the banner instead of looping', async () => {
    const p = await newPage('flip');
    await p.goto(base + '/flip', { waitUntil: 'load' });
    /* boots .347; probe sees RC; reloads; document is STILL .347 (lag); the
       sessionStorage guard must then show the banner rather than reload again */
    await p.waitForFunction(() => !!document.getElementById('wl-update-banner'), null, { timeout: 20000 });
    const loadsAtBanner = docLoads['/flip'];
    await p.waitForTimeout(1500);
    eq(docLoads['/flip'], loadsAtBanner, 'documents kept loading after the banner — a loop');
    ok(loadsAtBanner <= 2, 'more than one automatic reload before the banner: ' + loadsAtBanner);
    const build = await p.evaluate(() => window.APP_BUILD);
    notOk(/c10/.test(build), 'still on the old build, by design: ' + build);
    await p.close();
  });

  section('CSW-05..07 — one shared storage: upgrade, rollback, canary/root');

  await test('CSW-05 UPGRADE: the RC boots on storage written by the live client', async () => {
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
      build: APP_BUILD, weights: (state.weights || []).length,
      note: state.notes && state.notes['2026-07-25'], name: state.settings && state.settings.name,
    }));
    ok(after.build.includes('c10'));
    eq(after.weights, 2);
    eq(after.note, 'written by .347');
    eq(after.name, 'CSW');
  });

  await test('CSW-06 ROLLBACK: the live client boots on RC-written storage, CAS keys untouched', async () => {
    await page.evaluate(() => {
      state.weights.push({ date: '2026-07-29', weight: 81.5 });
      saveLocal();
      localStorage.setItem('cf:casneed:u1', JSON.stringify({ core: 3 }));
      localStorage.setItem('cf:casrec:u1:casrec-core-' + 'a'.repeat(32) + ':payload', '{"x":1}');
    });
    const rcKeys = await page.evaluate(() => Object.keys(localStorage).sort());
    await boot('/root');
    const rolled = await page.evaluate(() => ({
      build: APP_BUILD, weights: (state.weights || []).length,
      keys: Object.keys(localStorage).sort(),
    }));
    notOk(rolled.build.includes('c10'));
    eq(rolled.weights, 3, 'data written under the RC must survive rollback');
    eq(rolled.keys.join(','), rcKeys.join(','), 'the live client altered keys it does not own');
  });

  await test('CSW-07 / V2-12 canary/root alternation: nothing corrupted, no unexpected errors', async () => {
    await boot('/rc');
    const a = await page.evaluate(() => ({ w: state.weights.length, need: localStorage.getItem('cf:casneed:u1') }));
    await boot('/root');
    await boot('/rc');
    const b = await page.evaluate(() => ({ w: state.weights.length, need: localStorage.getItem('cf:casneed:u1') }));
    eq(b.w, a.w);
    eq(b.need, a.need);
    eq(unexpected().length, 0,
      'unexpected errors during alternation: ' + JSON.stringify(unexpected().slice(0, 3)));
  });

  section('CSW-V2-10..13 — the health check is real, and proven able to fail');

  await test('CSW-V2-13 negative control: an injected exception IS captured and WOULD fail', async () => {
    const p = await newPage('negctl');
    await p.goto(base + '/root', { waitUntil: 'load' });
    await p.evaluate(() => { setTimeout(() => { throw new Error('CSW-NEGATIVE-CONTROL'); }, 0); });
    await p.evaluate(() => console.error('CSW-CONSOLE-NEGATIVE'));
    await p.waitForTimeout(300);
    await p.close();
    const neg = errors.filter((e) => e.label === 'negctl');
    ok(neg.some((e) => e.kind === 'exception' && e.text.includes('CSW-NEGATIVE-CONTROL')),
      'CSW-V2-10: the pageerror listener did not capture an uncaught exception');
    ok(neg.some((e) => e.kind === 'console' && e.text.includes('CSW-CONSOLE-NEGATIVE')),
      'CSW-V2-11: the console listener did not capture console.error');
    /* and the health predicate itself flags them — the assertion CAN fail */
    const wouldFail = errors.filter((e) => !ALLOW(e)).length > 0;
    ok(wouldFail, 'the health predicate did not flag the injected errors');
  });

  await test('CSW-V2-10/11/12 final health: no unexpected exception or console error anywhere', async () => {
    const u = unexpected();
    eq(u.length, 0, JSON.stringify(u.slice(0, 5)));
    /* prove the allowlist did real filtering OR nothing needed filtering —
       never silently hiding arbitrary noise */
    const allowed = errors.filter((e) => e.label !== 'negctl' && ALLOW(e));
    console.log('    (allowlisted pb.test resource errors: ' + allowed.length + ')');
  });

  const failed = summary('cache-sw.browser.test.js');
  await browser.close();
  await new Promise((r) => server.close(r));
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAILURE', e); process.exit(1); });
