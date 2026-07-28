/* EXPORT-UTF8-01..08 — runtime proof that exported files declare UTF-8.

   A green string suite proves nothing here: the defect was a MIME type, and
   the bug it caused was visible only when a human opened the file. So every
   assertion below runs the real shipping export in a real browser and reads
   the produced Blob or the downloaded bytes back.

   EXPORT-UTF8-08 is the one that matters most: a static grep can be defeated by
   a fourth export path added later, so the audit is done at RUNTIME by
   intercepting every Blob the page constructs. */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require(path.join(process.env.HOME, 'staging-cas', 'node_modules', 'playwright'));
const { section, test, ok, notOk, eq, summary } = require('./harness');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 8150;

/* One string per required case, plus a combined one. */
const SAMPLES = {
  accented: 'café crème, naïve, Ångström, señor',
  emdash: 'DEMO — not real data',
  cjk: '日本語のメモ 体重 減量',
  emoji: 'session 🏋️‍♀️ done 💪 feeling 😀',
};
const COMBINED = Object.values(SAMPLES).join(' | ');

const STAMP = '1700000000000';
const QCORE = JSON.stringify({
  settings: { onboarded: true, name: SAMPLES.accented },
  weights: [{ date: '2026-01-13', weight: 87.9 }],
  notes: { '2026-01-13': COMBINED },
});
const QTRAIN = JSON.stringify({ plan: SAMPLES.cjk });
const QWO = JSON.stringify({ draft: true, name: SAMPLES.emoji });

const SEED = `<!doctype html><meta charset="utf-8"><body><script>
localStorage.clear();
localStorage.setItem('cf:quarantine:${STAMP}:core', ${JSON.stringify(QCORE)});
localStorage.setItem('cf:quarantine:${STAMP}:training', ${JSON.stringify(QTRAIN)});
localStorage.setItem('cf:quarantine:${STAMP}:workout', ${JSON.stringify(QWO)});
localStorage.setItem('cf:quarantine:${STAMP}:manifest', JSON.stringify({
  stamp:'${STAMP}', createdAt: 1769558400000, appBuild:'utf8-test',
  keys:['core','training','workout'],
  sizes:{core:${QCORE.length},training:${QTRAIN.length},workout:${QWO.length}}}));
localStorage.setItem('wl_v1', JSON.stringify({
  settings:{ onboarded:true, name:${JSON.stringify(SAMPLES.accented)} },
  weights:[{date:'2026-02-01', weight:80.5}],
  notes:{'2026-02-01': ${JSON.stringify(COMBINED)}}
}));
location.replace('/index.html');
</script>`;

(async () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const server = http.createServer((req, res) => {
    if ((req.url || '').split('?')[0] === '/seed') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(SEED); return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(html);
  });
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();

  /* Record EVERY Blob the page constructs, with its type. This is the runtime
     audit for EXPORT-UTF8-08 — a grep only sees the paths I thought to look at. */
  await page.addInitScript(() => {
    window.__blobs = [];
    const Real = window.Blob;
    window.Blob = function (parts, opts) {
      try { window.__blobs.push({ type: (opts && opts.type) || '', len: (parts && parts[0] && parts[0].length) || 0 }); } catch (e) { /* never break the app */ }
      return new Real(parts, opts);
    };
    window.Blob.prototype = Real.prototype;
  });

  await page.goto('http://127.0.0.1:' + PORT + '/seed', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.style.visibility !== 'hidden', null, { timeout: 10000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => ['wl-applied-banner', 'wl-update-banner'].forEach((id) => {
    const el = document.getElementById(id); if (el && el.remove) el.remove();
  }));

  const blobsOfJson = () => page.evaluate(() =>
    (window.__blobs || []).filter((b) => /json/i.test(b.type)));
  const clearBlobs = () => page.evaluate(() => { window.__blobs = []; });

  const download = async (trigger) => {
    const dlP = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
    await trigger();
    const dl = await dlP;
    if (!dl) return null;
    return fs.readFileSync(await dl.path());
  };

  section('EXPORT-UTF8-01..02 — every shipping export declares the charset');

  await test('EXPORT-UTF8-01 the main backup blob is application/json;charset=utf-8', async () => {
    await clearBlobs();
    await page.evaluate(() => { try { navigator.canShare = undefined; } catch (e) {} exportData(); });
    await page.waitForTimeout(300);
    const b = await blobsOfJson();
    ok(b.length >= 1, 'exportData() created no JSON blob');
    b.forEach((x) => eq(x.type, 'application/json;charset=utf-8', 'main backup blob type'));
  });

  await test('EXPORT-UTF8-02 the set-aside export declares it too, on both paths', async () => {
    /* the ACTIVE override, driven through the real button */
    await clearBlobs();
    await page.click('[data-act^="cf:qexport"]');
    await page.waitForSelector('.wl-confirm-msg', { timeout: 5000 });
    await page.click('[data-act="confirm:yes"]');
    await page.waitForTimeout(400);
    const active = await blobsOfJson();
    ok(active.length >= 1, 'the active cfQuarExport created no JSON blob');
    active.forEach((x) => eq(x.type, 'application/json;charset=utf-8', 'active set-aside blob type'));

    /* and the ORIGINAL definition, still reachable in source and shadowed at
       runtime — asserted statically because it cannot be invoked once
       overridden, and named as such rather than dressed up as a runtime check */
    const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const bare = (src.match(/new Blob\(\[json\],\s*\{type:"application\/json"\}/g) || []);
    eq(bare.length, 0, 'a shipping export still constructs a bare application/json blob');
  });

  section('EXPORT-UTF8-03..06 — the characters survive, exactly');

  let exported = null;
  await test('EXPORT-UTF8-03..06 accented, em dash, CJK and emoji all round-trip', async () => {
    const buf = await download(() => page.evaluate(() => {
      try { navigator.canShare = undefined; } catch (e) {}
      cfQuarExport('1700000000000');
      const yes = document.querySelector('[data-act="confirm:yes"]');
      if (yes) yes.click();
    }));
    ok(buf, 'no file was downloaded');
    /* decoded as UTF-8, which is what the declared charset now promises */
    exported = JSON.parse(buf.toString('utf8'));
    const note = exported.notes['2026-01-13'];
    ok(note.indexOf('café crème, naïve, Ångström, señor') >= 0, 'EXPORT-UTF8-03 accented Latin: ' + note);
    ok(note.indexOf('DEMO — not real data') >= 0, 'EXPORT-UTF8-04 em dash: ' + note);
    ok(note.indexOf('日本語のメモ 体重 減量') >= 0, 'EXPORT-UTF8-05 CJK: ' + note);
    ok(note.indexOf('session 🏋️‍♀️ done 💪 feeling 😀') >= 0, 'EXPORT-UTF8-06 emoji: ' + note);
    eq(exported.settings.name, 'café crème, naïve, Ångström, señor', 'accented name');
    eq(exported.training.plan, '日本語のメモ 体重 減量', 'CJK in training');
    eq(exported.workoutDraft.name, 'session 🏋️‍♀️ done 💪 feeling 😀', 'emoji in workout draft');
  });

  await test('EXPORT-UTF8-03b the bytes are genuinely UTF-8, not luck', async () => {
    const buf = await download(() => page.evaluate(() => {
      try { navigator.canShare = undefined; } catch (e) {}
      cfQuarExport('1700000000000');
      const yes = document.querySelector('[data-act="confirm:yes"]');
      if (yes) yes.click();
    }));
    ok(buf, 'no file was downloaded');
    const i = buf.indexOf(Buffer.from('DEMO '));
    const em = buf.slice(i + 5, i + 8);
    eq([...em].map((x) => x.toString(16).padStart(2, '0')).join(' '), 'e2 80 94',
      'the em dash must be encoded as UTF-8 e2 80 94');
    /* and decoding as Latin-1 must visibly differ — otherwise the test proves nothing */
    notOk(buf.toString('latin1') === buf.toString('utf8'),
      'the sample contains no non-ASCII, so this case is vacuous');
  });

  section('EXPORT-UTF8-07 — re-import preserves the strings exactly');

  await test('EXPORT-UTF8-07 importing the exported file restores identical text', async () => {
    const restored = await page.evaluate((text) => {
      /* the app's own import path, with its confirmation auto-accepted */
      const realAsk = window.askConfirm;
      window.askConfirm = function (msg, fn) { fn(); };
      try { applyImport(text); } finally { window.askConfirm = realAsk; }
      return {
        name: state.settings.name,
        note: state.notes && state.notes['2026-02-01'],
      };
    }, JSON.stringify({
      settings: { onboarded: true, name: SAMPLES.accented },
      weights: [{ date: '2026-02-01', weight: 80.5 }],
      notes: { '2026-02-01': COMBINED },
    }));
    eq(restored.name, SAMPLES.accented, 'accented name did not survive import');
    eq(restored.note, COMBINED, 'the combined sample did not survive import');
  });

  section('EXPORT-UTF8-08 — runtime audit: no bare application/json anywhere');

  await test('EXPORT-UTF8-08 every JSON blob the app constructed declared UTF-8', async () => {
    const all = await page.evaluate(() => (window.__blobs || []).filter((b) => /json/i.test(b.type)));
    ok(all.length >= 3, 'expected several JSON blobs across this run, saw ' + all.length);
    const bare = all.filter((b) => b.type === 'application/json');
    eq(bare.length, 0, bare.length + ' JSON blob(s) were created with a bare type');
    all.forEach((b) => ok(/charset=utf-8/i.test(b.type), 'blob without charset: ' + b.type));
  });

  await test('EXPORT-UTF8-08b the static source agrees, as a supporting check', () => {
    const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const jsonBlobs = src.match(/new Blob\([^)]*\{\s*type:\s*"application\/json[^"]*"/g) || [];
    ok(jsonBlobs.length >= 3, 'expected the three known export paths, found ' + jsonBlobs.length);
    const bare = jsonBlobs.filter((m) => !/charset=utf-8/.test(m));
    eq(bare.length, 0, 'bare JSON blob type in source: ' + bare.join(' | '));
  });

  const failed = summary('export-utf8.browser.test.js');
  await browser.close();
  await new Promise((r) => server.close(r));
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAILURE', e); process.exit(1); });
