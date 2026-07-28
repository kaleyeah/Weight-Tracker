/* SETASIDE-UX-01..10 — the set-aside notice must be SEEN, not merely rendered.

   FINDING-003 was found by a person looking at a phone, not by any of the
   assertions in this repo. The block was present, correct, accessible and
   fully covered — and sat 12px below the fold on every phone size measured,
   with no partial sliver to suggest anything was there. Every existing test
   asked whether it rendered. None asked whether anybody would see it.

   So these assert POSITION AGAINST THE VIEWPORT, at the three sizes that were
   measured, using the browser's own geometry. */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require(path.join(process.env.HOME, 'staging-cas', 'node_modules', 'playwright'));
const { section, test, ok, notOk, eq, summary } = require('./harness');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 8140;
const SHOTS = process.argv[2] || null;

/* The three sizes FINDING-003 was measured on. */
const DEVICES = [
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'iPhone 14', width: 390, height: 844 },
  { name: 'iPhone Pro Max', width: 430, height: 932 },
];

const STAMP = '1700000000000';
const CORE = JSON.stringify({
  settings: { onboarded: true, name: 'SET-ASIDE DEMO', units: 'kg' },
  weights: [{ date: '2026-01-13', weight: 87.9 }],
  notes: { '2026-01-13': 'DEMO ONLY — not real data' },
});
const TRAINING = '{"plan":"DEMO"}';
const WORKOUT = '{"draft":true}';
/* Sizes are COMPUTED, never hand-written. cfManifestValid enforces that the
   manifest's recorded sizes match the stored components exactly — no subsets,
   no unknown keys, no wrong sizes — so a seed with a guessed number produces a
   manifest the app correctly refuses. My first version hardcoded two of them
   and the export then failed with "This set-aside copy is incomplete", which
   read like a missing confirmation dialog and was actually the app being right
   about a fixture I had got wrong. */
const SIZES = { core: CORE.length, training: TRAINING.length, workout: WORKOUT.length };
const SEED = (withData) => `<!doctype html><meta charset="utf-8"><body><script>
localStorage.clear();
${withData ? `
localStorage.setItem('cf:quarantine:${STAMP}:core', ${JSON.stringify(CORE)});
localStorage.setItem('cf:quarantine:${STAMP}:training', ${JSON.stringify(TRAINING)});
localStorage.setItem('cf:quarantine:${STAMP}:workout', ${JSON.stringify(WORKOUT)});
localStorage.setItem('cf:quarantine:${STAMP}:manifest', JSON.stringify({
  stamp:'${STAMP}', createdAt: 1769558400000, appBuild:'ux-test',
  keys:['core','training','workout'],
  sizes:${JSON.stringify(SIZES)}}));` : ''}
location.replace('/index.html');
</script>`;

(async () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const server = http.createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    if (url === '/with') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(SEED(true)); return; }
    if (url === '/without') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(SEED(false)); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(html);
  });
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + PORT;
  const browser = await chromium.launch();
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

  const open = async (device, withData) => {
    const ctx = await browser.newContext({
      viewport: { width: device.width, height: device.height },
      deviceScaleFactor: 2, isMobile: true, acceptDownloads: true,
    });
    const page = await ctx.newPage();
    await page.goto(base + (withData ? '/with' : '/without'), { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.style.visibility !== 'hidden',
      null, { timeout: 10000 });
    await page.waitForTimeout(350);
    /* the update banner is transient chrome, not part of the login layout */
    await page.evaluate(() => ['wl-applied-banner', 'wl-update-banner'].forEach((id) => {
      const el = document.getElementById(id); if (el && el.remove) el.remove();
    }));
    /* Fail as a broken FIXTURE rather than as a mysterious missing dialog. */
    if (withData) {
      const valid = await page.evaluate((st) => cfQuarComplete(st), STAMP);
      if (!valid) throw new Error('seeded set-aside record is not valid per cfManifestValid — fix the fixture, not the app');
    }
    return { ctx, page };
  };

  const geometry = (page) => page.evaluate(() => {
    const title = document.getElementById('wl-setaside-title');
    const email = document.getElementById('wl-pb-email');
    const t = title ? title.getBoundingClientRect() : null;
    const e = email ? email.getBoundingClientRect() : null;
    return {
      hasBlock: !!title,
      titleTop: t ? Math.round(t.top) : null,
      titleBottom: t ? Math.round(t.bottom) : null,
      emailTop: e ? Math.round(e.top) : null,
      viewportH: innerHeight,
      pageH: document.documentElement.scrollHeight,
      docScrollTop: document.documentElement.scrollTop || document.body.scrollTop || 0,
    };
  });

  section('SETASIDE-UX-01..02 — order, and no change when there is nothing set aside');

  {
    const { ctx, page } = await open(DEVICES[1], true);
    const g = await geometry(page);
    await test('SETASIDE-UX-01 the heading appears ABOVE the first login field', () => {
      ok(g.hasBlock, 'the block must render when set-aside data exists');
      ok(g.emailTop !== null, 'the email field must still be present');
      ok(g.titleTop < g.emailTop,
        'heading at ' + g.titleTop + ' must be above the email field at ' + g.emailTop);
    });
    await test('SETASIDE-UX-01b the login form is still immediately available below it', () => {
      ok(g.emailTop - g.titleBottom < 400,
        'the login form must follow closely, gap was ' + (g.emailTop - g.titleBottom) + 'px');
    });
    await ctx.close();
  }

  {
    const { ctx, page } = await open(DEVICES[1], false);
    const g = await geometry(page);
    await test('SETASIDE-UX-02 with nothing set aside, the login layout is unchanged', () => {
      notOk(g.hasBlock, 'no block may render');
      const cls = 'wl-login-setaside';
      return page.evaluate((c) => !document.querySelector('.' + c), cls)
        .then((clean) => ok(clean, 'the layout modifier class must not be applied'));
    });
    await ctx.close();
  }

  section('SETASIDE-UX-03..05 — visible without scrolling, at the three measured sizes');

  for (let i = 0; i < DEVICES.length; i++) {
    const d = DEVICES[i];
    const { ctx, page } = await open(d, true);
    const g = await geometry(page);
    if (SHOTS) {
      await page.screenshot({ path: path.join(SHOTS, 'setaside-' + d.name.replace(/\s+/g, '-').toLowerCase() + '.png') });
    }
    await test('SETASIDE-UX-0' + (3 + i) + ' ' + d.name + ' shows the heading without scrolling', () => {
      eq(g.docScrollTop, 0, 'the page must not be pre-scrolled for this to mean anything');
      ok(g.titleTop >= 0,
        'the heading is off the TOP of the screen at ' + g.titleTop
          + 'px — a centred flex container overflowing upward is unreachable');
      ok(g.titleBottom <= g.viewportH,
        'the heading ends at ' + g.titleBottom + 'px, below the ' + g.viewportH + 'px fold');
    });
    await ctx.close();
  }

  section('SETASIDE-UX-06..10 — the behaviour that was already correct must stay correct');

  {
    const { ctx, page } = await open(DEVICES[1], true);

    await test('SETASIDE-UX-06 Save and Delete are reachable by keyboard and named for a reader', async () => {
      const info = await page.evaluate(() => {
        const save = document.querySelector('[data-act^="cf:qexport"]');
        const del = document.querySelector('[data-act^="cf:qdelete"]');
        const section_ = document.querySelector('.wl-setaside');
        const labelled = section_ ? document.getElementById(section_.getAttribute('aria-labelledby')) : null;
        return {
          saveName: save ? save.textContent.trim() : null,
          delName: del ? del.textContent.trim() : null,
          saveTag: save ? save.tagName : null,
          delTag: del ? del.tagName : null,
          regionName: labelled ? labelled.textContent.trim() : null,
          headingTag: labelled ? labelled.tagName : null,
        };
      });
      eq(info.saveName, 'Save a copy');
      eq(info.delName, 'Delete');
      eq(info.saveTag, 'BUTTON', 'must be a real button, not a div');
      eq(info.delTag, 'BUTTON');
      eq(info.regionName, 'Data set aside on this device', 'the section must be named for a screen reader');
      ok(/^H[1-6]$/.test(info.headingTag), 'the name should come from a heading, got ' + info.headingTag);

      /* focusable in order, by the browser's own tab handling */
      await page.evaluate(() => document.getElementById('wl-setaside-title').setAttribute('tabindex', '-1'));
      await page.evaluate(() => document.getElementById('wl-setaside-title').focus());
      await page.keyboard.press('Tab');
      const first = await page.evaluate(() => (document.activeElement || {}).getAttribute
        && document.activeElement.getAttribute('data-act'));
      ok(first && first.indexOf('cf:qexport') === 0,
        'the first Tab from the heading should reach Save a copy, reached ' + first);
    });

    await test('SETASIDE-UX-07 both confirmations are unchanged', async () => {
      /* Wait for the dialog rather than sleeping a fixed interval. A 250ms
         sleep passed in isolation and failed inside the suite — a flake that
         would have read as "the export confirmation is missing". */
      await page.click('[data-act^="cf:qexport"]');
      await page.waitForSelector('.wl-confirm-msg', { timeout: 5000 });
      const exportMsg = await page.evaluate(() => {
        const c = document.querySelector('.wl-confirm-msg');
        const yes = document.querySelector('[data-act="confirm:yes"]');
        return { msg: c ? c.textContent.trim() : null, label: yes ? yes.textContent.trim() : null };
      });
      ok(/private health data/.test(exportMsg.msg || ''), 'export warning changed: ' + exportMsg.msg);
      eq(exportMsg.label, 'Save the file');
      await page.click('[data-act="confirm:no"]');
      await page.waitForSelector('.wl-confirm-msg', { state: 'detached', timeout: 5000 });

      await page.click('[data-act^="cf:qdelete"]');
      await page.waitForSelector('.wl-confirm-msg', { timeout: 5000 });
      const delMsg = await page.evaluate(() => {
        const c = document.querySelector('.wl-confirm-msg');
        const yes = document.querySelector('[data-act="confirm:yes"]');
        return { msg: c ? c.textContent.trim() : null, label: yes ? yes.textContent.trim() : null };
      });
      ok(/can’t be undone/.test(delMsg.msg || ''), 'delete warning changed: ' + delMsg.msg);
      eq(delMsg.label, 'Delete');
      await page.click('[data-act="confirm:no"]');
      await page.waitForSelector('.wl-confirm-msg', { state: 'detached', timeout: 5000 });
    });

    await test('SETASIDE-UX-10 it stays readable at narrow width and covers no login control', async () => {
      await page.setViewportSize({ width: 320, height: 667 });
      await page.waitForTimeout(250);
      const m = await page.evaluate(() => {
        const s = document.querySelector('.wl-setaside');
        const email = document.getElementById('wl-pb-email');
        const btns = [...s.querySelectorAll('button')];
        const clipped = (el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
        const sr = s.getBoundingClientRect(), er = email.getBoundingClientRect();
        return {
          overlapsEmail: !(sr.bottom <= er.top || sr.top >= er.bottom),
          clipped: btns.filter(clipped).map((b) => b.textContent.trim()),
          minHeight: Math.min(...btns.map((b) => b.getBoundingClientRect().height)),
          sidewaysScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
      });
      notOk(m.overlapsEmail, 'the block overlaps the email field');
      eq(m.clipped.length, 0, 'clipped controls: ' + JSON.stringify(m.clipped));
      ok(m.minHeight >= 44, 'smallest control was ' + m.minHeight + 'px tall');
      notOk(m.sidewaysScroll, 'the page must not scroll sideways');
    });

    await ctx.close();
  }

  {
    const { ctx, page } = await open(DEVICES[1], true);
    await test('SETASIDE-UX-08 deleting the last record restores the normal login layout', async () => {
      await page.click('[data-act^="cf:qdelete"]');
      await page.waitForSelector('.wl-confirm-msg', { timeout: 5000 });
      await page.click('[data-act="confirm:yes"]');
      await page.waitForTimeout(600);
      const after = await page.evaluate(() => ({
        block: !!document.getElementById('wl-setaside-title'),
        modifier: !!document.querySelector('.wl-login-setaside'),
        email: !!document.getElementById('wl-pb-email'),
        keys: Object.keys(localStorage).filter((k) => /quarantine/.test(k)).length,
      }));
      notOk(after.block, 'the block must be gone');
      notOk(after.modifier, 'and the layout modifier with it');
      ok(after.email, 'the login form must remain');
      eq(after.keys, 0, 'and the storage keys must actually be removed');
    });
    await ctx.close();
  }

  {
    const { ctx, page } = await open(DEVICES[1], true);
    await test('SETASIDE-UX-09 signing in does not silently delete the set-aside record', async () => {
      const before = await page.evaluate(() => Object.keys(localStorage).filter((k) => /quarantine/.test(k)).sort());
      ok(before.length >= 4, 'precondition: a complete record must be present');
      /* attempt a sign-in against a server that is not there; the attempt itself
         must not touch set-aside storage either way */
      await page.evaluate(() => {
        const e = document.getElementById('wl-pb-email'); if (e) e.value = 'nobody@example.invalid';
        const p = document.getElementById('wl-pb-pass'); if (p) p.value = 'whatever';
        try { pbDoLogin(); } catch (err) { /* failure is expected and fine */ }
      });
      await page.waitForTimeout(1500);
      const after = await page.evaluate(() => Object.keys(localStorage).filter((k) => /quarantine/.test(k)).sort());
      eq(after.join(','), before.join(','), 'a sign-in attempt changed set-aside storage');
    });
    await ctx.close();
  }

  const failed = summary('setaside-ux.browser.test.js');
  await browser.close();
  await new Promise((r) => server.close(r));
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAILURE', e); process.exit(1); });
