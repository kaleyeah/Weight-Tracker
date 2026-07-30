/* PHOTO-STATUS-01..08 — a photo-enumeration warning is not an upload failure.

   Architect ruling (canary day-one FIX-004 review §5). The photo reconciliation
   path used the SAME global red "Sync error" as a failed core/training upload:

       setSync("error", "photo list incomplete — nothing removed")

   Two things are wrong with that. It tells the athlete their health data failed
   to upload when it did not, and it uses internal vocabulary ("photo list") for
   a condition that actually means "we could not fully check, so we deliberately
   removed nothing".

   It is also reachable on a clean account with no photos at all — which is how
   it turned up: the day-one probe showed a red dot before any edit had been
   made.

   These tests pin the approved presentation: its own source, warning severity,
   athlete-facing wording, survives a successful CAS commit, cleared only by a
   later COMPLETE enumeration, and never deletes anything.

   Disposable instance, 127.0.0.1, cf_test_* accounts only. */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require(path.join(process.env.HOME, 'staging-cas', 'node_modules', 'playwright'));
const pb = require('./pbserver');
const { section, test, ok, notOk, eq, summary } = require('./harness');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 8211;
const PB_PORT = 8212;

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
  const deletes = [];
  page.on('request', (r) => { if (r.method() === 'DELETE') deletes.push(r.url()); });

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
  await page.waitForTimeout(1000);

  const st = () => page.evaluate(() => ({
    photo: cfStatusHas('photo-reconcile'),
    pending: cfStatusHas('cas-pending'),
    top: (cfStatusTop() || {}).source || null,
    sev: (cfStatusTop() || {}).sev || null,
    msg: (window.syncState || {}).msg || '',
    state: (window.syncState || {}).s,
    dot: syncDotClass(),
  }));
  const reset = () => page.evaluate(() => {
    CF_STATUS = {}; cfPending = null;
    CF_CAS_BLOCK.core = null; CF_CAS_BLOCK.training = null;
    revClean('core'); revClean('training');
    cfCasSetBaseline('core', cfCanon(cfCasPayloadFor('core')));
    cfCasSetBaseline('training', cfCanon(cfCasPayloadFor('training')));
    cfStatusProject();
  });

  section('PHOTO-STATUS-01..04 — presentation and safety');

  await test('PHOTO-STATUS-01 a COMPLETE enumeration finding zero photos shows no warning', async () => {
    await reset();
    await page.evaluate(() => { cfPhotoStatusComplete(); });
    const s_ = await st();
    notOk(s_.photo, 'a complete enumeration must leave no photo warning');
    notOk(/Photo sync/.test(s_.msg), 'and say nothing about photos: ' + JSON.stringify(s_.msg));
    notOk(s_.dot === 'bad', 'and certainly not paint red');
  });

  await test('PHOTO-STATUS-02 an INCOMPLETE enumeration shows the approved warning', async () => {
    await reset();
    await page.evaluate(() => { cfPhotoStatusIncomplete(); });
    const s_ = await st();
    ok(s_.photo, 'the warning must be raised');
    eq(s_.top, 'photo-reconcile', 'and owned by the photo source');
    ok(/Photo sync couldn.t be fully checked/.test(s_.msg), 'approved wording: ' + JSON.stringify(s_.msg));
    ok(/Nothing was removed/.test(s_.msg), 'and it must say nothing was removed');
  });

  await test('PHOTO-STATUS-03 it is a WARNING, not the red upload failure', async () => {
    const s_ = await st();
    eq(s_.sev, 'warn', 'severity must be warning');
    eq(s_.dot, 'warn', 'the dot must be amber, not red');
    notOk(/aren.t uploaded yet/.test(s_.msg),
      'it must never claim core/training changes failed to upload: ' + JSON.stringify(s_.msg));
  });

  await test('PHOTO-STATUS-04 nothing is deleted while enumeration is incomplete', async () => {
    /* the whole point of the condition: an incomplete listing must never be
       used to infer a deletion */
    const photoDeletes = deletes.filter((u) => /photos/.test(u));
    eq(photoDeletes.length, 0, 'no photo delete may be issued: ' + JSON.stringify(photoDeletes));
  });

  section('PHOTO-STATUS-05..08 — ownership, lifecycle, and language');

  await test('PHOTO-STATUS-05 a successful CAS commit does NOT clear the photo warning', async () => {
    await reset();
    await page.evaluate(() => { cfPhotoStatusIncomplete(); });
    await page.evaluate(() => { state.weights.push({ d: '2026-08-09', kg: 78.8 }); save(); });
    await page.waitForFunction(() => cfCasStatusFor('core') === 'synced' && !isDirty(), null, { timeout: 25000 });
    await page.waitForTimeout(250);
    const s_ = await st();
    notOk(s_.pending, 'the upload alarm must clear (it is the CAS source\'s own)');
    ok(s_.photo, 'but the photo warning must survive — a different source owns it');
    eq(s_.sev, 'warn');
  });

  await test('PHOTO-STATUS-06 a later COMPLETE enumeration clears it', async () => {
    ok(await page.evaluate(() => cfStatusHas('photo-reconcile')), 'precondition: still warned');
    await page.evaluate(() => { cfPhotoStatusComplete(); });
    const s_ = await st();
    notOk(s_.photo, 'a complete enumeration must clear the warning');
    notOk(/Photo sync/.test(s_.msg), s_.msg);
  });

  await test('PHOTO-STATUS-07 core/training status stays independently accurate under the warning', async () => {
    await reset();
    await page.evaluate(() => { cfPhotoStatusIncomplete(); });
    const withPhoto = await page.evaluate(() => ({
      core: cfCasStatusFor('core'), training: cfCasStatusFor('training'),
    }));
    eq(withPhoto.core, 'synced', 'the photo warning must not disturb core status');
    eq(withPhoto.training, 'synced', 'nor training status');
    /* pending outranks the photo warning — but BOTH are amber now: the ruling
       made ordinary pending a warning, not a failure, because "safe here, not
       synced yet" is not something going wrong. This assertion used to demand a
       red dot and was left behind by that decision. A genuinely RED source is
       checked separately below. */
    await page.evaluate(() => { cfSetPending('push'); });
    const both = await st();
    eq(both.top, 'cas-pending', 'pending outranks a photo warning');
    eq(both.sev, 'warn', 'and ordinary pending is amber, not a failure');
    await page.evaluate(() => cfStatusSet('cas-network', 'Couldn’t sync — changes are safe here.'));
    const red = await st();
    eq(red.top, 'cas-network', 'a real failure outranks both amber causes');
    eq(red.dot, 'bad', 'and it is red');
    await page.evaluate(() => cfStatusClearSource('cas-network'));
    await page.evaluate(() => { cfClearPending(); });
    const after = await st();
    eq(after.top, 'photo-reconcile', 'and clearing it reveals the photo warning again');
  });

  await test('PHOTO-STATUS-08 the message carries no internal collection or API vocabulary', async () => {
    const s_ = await st();
    ['photo list', 'collection', 'api', 'record', 'enumerat', 'pocketbase', 'http', 'null', 'undefined']
      .forEach((bad) => notOk(new RegExp(bad, 'i').test(s_.msg),
        'athlete-facing text must not contain "' + bad + '": ' + JSON.stringify(s_.msg)));
    const unexpected = errors.filter((e) => !/pb\.test|ERR_|Failed to fetch|NetworkError/i.test(e));
    eq(unexpected.length, 0, unexpected.join('\n'));
  });

  await browser.close();
  web.close();
  await server.stop();
  summary('photo-status.browser.test.js');
})().catch((e) => { console.error(e); process.exit(1); });
