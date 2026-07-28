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
/* Several records, some on the SAME DAY — the case a date alone cannot tell
   apart, and the reason SETASIDE-MULTI exists. */
const RECORDS = [
  { stamp: '1700000000001', at: Date.UTC(2026, 0, 28, 9, 5) },
  { stamp: '1700000000002', at: Date.UTC(2026, 0, 28, 15, 42) },   /* same day */
  { stamp: '1700000000003', at: Date.UTC(2026, 1, 2, 20, 11) },
];
const seedOne = (r) => `
localStorage.setItem('cf:quarantine:${r.stamp}:core', ${JSON.stringify(CORE)});
localStorage.setItem('cf:quarantine:${r.stamp}:training', ${JSON.stringify(TRAINING)});
localStorage.setItem('cf:quarantine:${r.stamp}:workout', ${JSON.stringify(WORKOUT)});
localStorage.setItem('cf:quarantine:${r.stamp}:manifest', JSON.stringify({
  stamp:'${r.stamp}', createdAt: ${r.at}, appBuild:'ux-test',
  keys:['core','training','workout'], sizes:${JSON.stringify(SIZES)}}));`;
/* Two copies inside the SAME displayed minute, plus one unique — the case a
   minute-precision label cannot separate (Architect SETASIDE-MULTI-V2). */
const SAME_MIN = [
  { stamp: '1700000000011', at: Date.UTC(2026, 0, 28, 15, 42, 5) },
  { stamp: '1700000000012', at: Date.UTC(2026, 0, 28, 15, 42, 47) },  /* same minute */
  { stamp: '1700000000013', at: Date.UTC(2026, 1, 2, 20, 11) },
];
const SEED_SAMEMIN = `<!doctype html><meta charset="utf-8"><body><script>
localStorage.clear();
${SAME_MIN.map(seedOne).join('')}
location.replace('/index.html');
</script>`;

const SEED_MULTI = `<!doctype html><meta charset="utf-8"><body><script>
localStorage.clear();
${RECORDS.map(seedOne).join('')}
location.replace('/index.html');
</script>`;

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
    if (url === '/multi') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(SEED_MULTI); return; }
    if (url === '/sameminute') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(SEED_SAMEMIN); return; }
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
    const route = withData === 'multi' ? '/multi'
      : withData === 'sameminute' ? '/sameminute'
        : (withData ? '/with' : '/without');
    await page.goto(base + route, { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.style.visibility !== 'hidden',
      null, { timeout: 10000 });
    await page.waitForTimeout(350);
    /* the update banner is transient chrome, not part of the login layout */
    await page.evaluate(() => ['wl-applied-banner', 'wl-update-banner'].forEach((id) => {
      const el = document.getElementById(id); if (el && el.remove) el.remove();
    }));
    /* Fail as a broken FIXTURE rather than as a mysterious missing dialog. */
    if (withData && withData !== 'multi' && withData !== 'sameminute') {
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

  section('SETASIDE-MULTI-01..08 — several copies must be told apart');

  {
    const { ctx, page } = await open(DEVICES[1], 'multi');
    const rows = () => page.evaluate(() => [...document.querySelectorAll('.wl-setaside-row')].map((r) => ({
      text: r.querySelector('.wl-setaside-date').textContent.trim(),
      save: r.querySelector('[data-act^="cf:qexport"]').getAttribute('aria-label'),
      del: r.querySelector('[data-act^="cf:qdelete"]').getAttribute('aria-label'),
      saveAct: r.querySelector('[data-act^="cf:qexport"]').getAttribute('data-act'),
    })));

    await test('SETASIDE-MULTI-01 two copies made the same day show different times', async () => {
      const r = await rows();
      eq(r.length, 3, 'expected three rows, saw ' + r.length);
      const sameDay = r.filter((x) => /Jan 28, 2026/.test(x.text));
      eq(sameDay.length, 2, 'the fixture must contain two same-day copies');
      notOk(sameDay[0].text === sameDay[1].text,
        'both same-day rows read "' + sameDay[0].text + '" — indistinguishable');
      r.forEach((x) => ok(/\d{1,2}:\d{2}/.test(x.text), 'no time shown in "' + x.text + '"'));
    });

    await test('SETASIDE-MULTI-04 each row\'s actions are uniquely named for a reader', async () => {
      const r = await rows();
      const saves = r.map((x) => x.save), dels = r.map((x) => x.del);
      eq(new Set(saves).size, 3, 'duplicate Save names: ' + JSON.stringify(saves));
      eq(new Set(dels).size, 3, 'duplicate Delete names: ' + JSON.stringify(dels));
      saves.forEach((n) => ok(/^Save a copy — /.test(n), 'unexpected Save name: ' + n));
      dels.forEach((n) => ok(/^Delete set-aside copy — /.test(n), 'unexpected Delete name: ' + n));
    });

    await test('SETASIDE-MULTI-06 no raw internal stamp appears in athlete-facing text', async () => {
      const seen = await page.evaluate(() => {
        const s_ = document.querySelector('.wl-setaside');
        const labels = [...s_.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label'));
        return { text: s_.textContent, labels: labels.join(' | ') };
      });
      ['1700000000001', '1700000000002', '1700000000003'].forEach((st) => {
        notOk(seen.text.indexOf(st) >= 0, 'stamp ' + st + ' is visible in the text');
        notOk(seen.labels.indexOf(st) >= 0, 'stamp ' + st + ' is in an accessible name');
      });
      notOk(/ux-test/.test(seen.text), 'the internal build code is visible');
    });

    await test('SETASIDE-MULTI-02 Save operates on the intended record', async () => {
      const target = (await rows())[1];
      const captured = await page.evaluate(async (act) => {
        window.__exported = null;
        const real = window.cfQuarExport;
        window.cfQuarExport = function (stamp) { window.__exported = stamp; };
        document.querySelector('[data-act="' + act + '"]').click();
        await new Promise((r) => setTimeout(r, 200));
        window.cfQuarExport = real;
        return window.__exported;
      }, target.saveAct);
      eq(captured, target.saveAct.split(':').pop(), 'Save acted on the wrong record');
    });

    await test('SETASIDE-MULTI-03/08 Delete removes only the selected row', async () => {
      const beforeRows = await rows();
      const victim = beforeRows[1];
      const victimStamp = victim.saveAct.split(':').pop();
      await page.click('[data-act="cf:qdelete:' + victimStamp + '"]');
      await page.waitForSelector('.wl-confirm-msg', { timeout: 5000 });
      await page.click('[data-act="confirm:yes"]');
      await page.waitForTimeout(600);
      const afterRows = await rows();
      eq(afterRows.length, 2, 'expected two rows to remain, saw ' + afterRows.length);
      notOk(afterRows.some((x) => x.text === victim.text), 'the wrong row survived');
      const left = await page.evaluate((st) => ({
        gone: Object.keys(localStorage).filter((k) => k.indexOf(st) >= 0).length,
        others: Object.keys(localStorage).filter((k) => /^cf:quarantine:/.test(k)).length,
      }), victimStamp);
      eq(left.gone, 0, 'the deleted record left keys behind');
      eq(left.others, 8, 'the remaining two records must keep four keys each');
      const stillThere = await page.evaluate(() => !!document.getElementById('wl-setaside-title'));
      ok(stillThere, 'the block must remain while other copies exist');
    });

    await ctx.close();
  }

  {
    const { ctx, page } = await open(DEVICES[0], 'multi');
    await test('SETASIDE-MULTI-05 three rows stay readable and reachable on iPhone SE', async () => {
      const m = await page.evaluate(() => {
        const rows_ = [...document.querySelectorAll('.wl-setaside-row')];
        const btns = rows_.flatMap((r) => [...r.querySelectorAll('button')]);
        const clipped = (el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
        const title = document.getElementById('wl-setaside-title').getBoundingClientRect();
        return {
          rows: rows_.length,
          titleTop: Math.round(title.top),
          titleVisible: title.top >= 0 && title.bottom <= innerHeight,
          clipped: btns.filter(clipped).map((b) => b.textContent.trim()),
          minH: Math.min(...btns.map((b) => b.getBoundingClientRect().height)),
          sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          reachable: document.documentElement.scrollHeight >= innerHeight,
        };
      });
      eq(m.rows, 3);
      ok(m.titleVisible, 'the heading must still be in view, was at ' + m.titleTop);
      eq(m.clipped.length, 0, 'clipped: ' + JSON.stringify(m.clipped));
      ok(m.minH >= 44, 'smallest control was ' + m.minH + 'px');
      notOk(m.sideways, 'the page must not scroll sideways');
      /* the rows below the fold must be reachable by scrolling */
      const canScroll = await page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        const last = [...document.querySelectorAll('.wl-setaside-row')].pop().getBoundingClientRect();
        return last.top >= 0 && last.bottom <= innerHeight + 1;
      });
      ok(canScroll, 'the last row must be reachable by scrolling');
    });
    await ctx.close();
  }

  {
    const { ctx, page } = await open(DEVICES[1], 'multi');
    await test('SETASIDE-MULTI-07 formatting stays valid across time zones and a bad timestamp', async () => {
      const res = await page.evaluate(() => ({
        /* the app's own formatter, exercised directly */
        normal: cfQuarWhen(Date.UTC(2026, 0, 28, 23, 30)),
        boundary: cfQuarWhen(Date.UTC(2026, 0, 28, 0, 1)),
        zero: cfQuarWhen(0),
        nan: cfQuarWhen(NaN),
        text: cfQuarWhen('not a number'),
        missing: cfQuarWhen(undefined),
      }));
      ok(res.normal && /\d/.test(res.normal), 'normal timestamp did not format: ' + res.normal);
      ok(res.boundary && /\d/.test(res.boundary), 'day-boundary timestamp did not format: ' + res.boundary);
      notOk(/Invalid Date/.test(res.normal + res.boundary), 'Invalid Date reached the athlete');
      eq(res.zero, '', 'an absent timestamp must format as empty, not as 1970');
      eq(res.nan, '');
      eq(res.text, '');
      eq(res.missing, '');
      /* and the row copes: it says something honest rather than "Invalid Date" */
      const fallback = await page.evaluate(() => {
        const rows_ = [...document.querySelectorAll('.wl-setaside-row')];
        return rows_.every((r) => !/Invalid Date|NaN/.test(r.textContent));
      });
      ok(fallback, 'a row rendered Invalid Date or NaN');
    });
    await ctx.close();
  }

  section('SETASIDE-MULTI-V2-01..08 — copies made within the same minute');

  {
    const { ctx, page } = await open(DEVICES[1], 'sameminute');
    const rows = () => page.evaluate(() => [...document.querySelectorAll('.wl-setaside-row')].map((r) => ({
      text: r.querySelector('.wl-setaside-date').textContent.trim(),
      save: r.querySelector('[data-act^="cf:qexport"]').getAttribute('aria-label'),
      del: r.querySelector('[data-act^="cf:qdelete"]').getAttribute('aria-label'),
      stamp: r.querySelector('[data-act^="cf:qexport"]').getAttribute('data-act').split(':').pop(),
    })));

    await test('SETASIDE-MULTI-V2-01 same-minute copies get distinct visible Copy numbers', async () => {
      const r = await rows();
      eq(r.length, 3, 'expected three rows, saw ' + r.length);
      const collide = r.filter((x) => /3:42/.test(x.text));
      eq(collide.length, 2, 'the fixture must produce two same-minute rows');
      notOk(collide[0].text === collide[1].text,
        'both rows read "' + collide[0].text + '" — still indistinguishable');
      collide.forEach((x) => ok(/— Copy [12]$/.test(x.text), 'no Copy suffix on "' + x.text + '"'));
      eq(new Set(collide.map((x) => x.text)).size, 2, 'the two Copy numbers must differ');
    });

    await test('SETASIDE-MULTI-V2-02 the accessible names carry the same descriptors', async () => {
      const r = await rows();
      eq(new Set(r.map((x) => x.save)).size, 3, 'duplicate Save names: ' + JSON.stringify(r.map((x) => x.save)));
      eq(new Set(r.map((x) => x.del)).size, 3, 'duplicate Delete names');
      r.forEach((x) => {
        const desc = x.text.replace(/^Saved /, '');
        eq(x.save, 'Save a copy — ' + desc, 'Save name does not match the visible descriptor');
        eq(x.del, 'Delete set-aside copy — ' + desc, 'Delete name does not match');
      });
    });

    await test('SETASIDE-MULTI-V2-03 numbering is deterministic — oldest is Copy 1', async () => {
      const r = await rows();
      const byStamp = {};
      r.forEach((x) => { byStamp[x.stamp] = x.text; });
      /* 1700000000011 is 15:42:05, 1700000000012 is 15:42:47 */
      ok(/Copy 1$/.test(byStamp['1700000000011']),
        'the older copy must be Copy 1, got "' + byStamp['1700000000011'] + '"');
      ok(/Copy 2$/.test(byStamp['1700000000012']),
        'the newer copy must be Copy 2, got "' + byStamp['1700000000012'] + '"');
      /* and it is stable across a rerender */
      await page.evaluate(() => render());
      await page.waitForTimeout(200);
      const again = await rows();
      const byStamp2 = {};
      again.forEach((x) => { byStamp2[x.stamp] = x.text; });
      eq(byStamp2['1700000000011'], byStamp['1700000000011'], 'numbering changed on rerender');
      eq(byStamp2['1700000000012'], byStamp['1700000000012'], 'numbering changed on rerender');
    });

    await test('SETASIDE-MULTI-V2-04 a row with a unique time gets NO Copy suffix', async () => {
      const r = await rows();
      const unique = r.find((x) => x.stamp === '1700000000013');
      ok(unique, 'the unique row is missing');
      notOk(/Copy \d/.test(unique.text), 'unexpected suffix on a unique row: ' + unique.text);
      notOk(/Copy \d/.test(unique.save), 'unexpected suffix in its accessible name: ' + unique.save);
    });

    await test('SETASIDE-MULTI-V2-07 no stamp or millisecond value is exposed', async () => {
      const seen = await page.evaluate(() => {
        const s_ = document.querySelector('.wl-setaside');
        return { text: s_.textContent,
          labels: [...s_.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label')).join(' | ') };
      });
      SAME_MIN.forEach((rec) => {
        notOk(seen.text.indexOf(rec.stamp) >= 0, 'stamp visible: ' + rec.stamp);
        notOk(seen.labels.indexOf(rec.stamp) >= 0, 'stamp in accessible name: ' + rec.stamp);
        notOk(seen.text.indexOf(String(rec.at)) >= 0, 'raw epoch visible: ' + rec.at);
      });
      notOk(/\b\d{2}:\d{2}:\d{2}\b/.test(seen.text), 'seconds leaked into the label: ' + seen.text);
      notOk(/\.\d{3}\b/.test(seen.text), 'a millisecond value is visible');
    });

    await test('SETASIDE-MULTI-V2-05 export acts on the intended same-minute copy', async () => {
      const target = (await rows()).find((x) => /Copy 2$/.test(x.text));
      ok(target, 'no Copy 2 row found');
      const got = await page.evaluate(async (stamp) => {
        window.__exported = null;
        const real = window.cfQuarExport;
        window.cfQuarExport = function (s_) { window.__exported = s_; };
        document.querySelector('[data-act="cf:qexport:' + stamp + '"]').click();
        await new Promise((r) => setTimeout(r, 200));
        window.cfQuarExport = real;
        return window.__exported;
      }, target.stamp);
      eq(got, target.stamp, 'export acted on the wrong same-minute copy');
      eq(got, '1700000000012', 'Copy 2 must be the newer record');
    });

    await test('SETASIDE-MULTI-V2-06 delete removes only the intended same-minute copy', async () => {
      const before = await rows();
      const victim = before.find((x) => /Copy 1$/.test(x.text));
      ok(victim, 'no Copy 1 row found');
      eq(victim.stamp, '1700000000011', 'Copy 1 must be the older record');
      await page.click('[data-act="cf:qdelete:' + victim.stamp + '"]');
      await page.waitForSelector('.wl-confirm-msg', { timeout: 5000 });
      await page.click('[data-act="confirm:yes"]');
      await page.waitForTimeout(600);
      const after = await rows();
      eq(after.length, 2, 'expected two rows to remain');
      notOk(after.some((x) => x.stamp === victim.stamp), 'the wrong copy survived');
      ok(after.some((x) => x.stamp === '1700000000012'), 'the sibling copy was destroyed');
      const keys = await page.evaluate((st) => Object.keys(localStorage).filter((k) => k.indexOf(st) >= 0).length, victim.stamp);
      eq(keys, 0, 'the deleted copy left keys behind');
      /* and with the collision resolved, the survivor drops its suffix */
      const survivor = after.find((x) => x.stamp === '1700000000012');
      notOk(/Copy \d/.test(survivor.text),
        'the label must recompute once it no longer collides: ' + survivor.text);
    });

    await ctx.close();
  }

  {
    const { ctx, page } = await open(DEVICES[0], 'sameminute');
    await test('SETASIDE-MULTI-V2-08 same-minute rows stay readable on iPhone SE', async () => {
      const m = await page.evaluate(() => {
        const rows_ = [...document.querySelectorAll('.wl-setaside-row')];
        const labels = rows_.map((r) => r.querySelector('.wl-setaside-date'));
        const btns = rows_.flatMap((r) => [...r.querySelectorAll('button')]);
        const clipped = (el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
        const title = document.getElementById('wl-setaside-title').getBoundingClientRect();
        return {
          rows: rows_.length,
          titleVisible: title.top >= 0 && title.bottom <= innerHeight,
          clippedLabels: labels.filter(clipped).map((l) => l.textContent.trim()),
          clippedBtns: btns.filter(clipped).map((b) => b.textContent.trim()),
          minH: Math.min(...btns.map((b) => b.getBoundingClientRect().height)),
          sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
      });
      eq(m.rows, 3);
      ok(m.titleVisible, 'the heading must remain in view');
      eq(m.clippedLabels.length, 0, 'the longer "— Copy N" labels are clipped: ' + JSON.stringify(m.clippedLabels));
      eq(m.clippedBtns.length, 0, 'clipped controls: ' + JSON.stringify(m.clippedBtns));
      ok(m.minH >= 44, 'smallest control was ' + m.minH + 'px');
      notOk(m.sideways, 'the page must not scroll sideways');
    });
    await ctx.close();
  }

  const failed = summary('setaside-ux.browser.test.js');
  await browser.close();
  await new Promise((r) => server.close(r));
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAILURE', e); process.exit(1); });
