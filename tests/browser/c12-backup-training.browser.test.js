/* C12 in a REAL browser — the DELIVERED backup file must contain training.

       CF_SRC=/home/griffin/projects/compound-app/index.html \
         node tests/browser/c12-backup-training.browser.test.js

   This drives `exportData()` -- the button the athlete actually presses -- and
   parses the BYTES that leave the app, not the return value of backupJSON().
   Calling backupJSON() alone proves the string is right while proving nothing
   about the delivery path that carries it.

   Two routes exist inside exportData():
     * navigator.share(), taken on iOS. Cannot be driven for real headlessly, so
       it is exercised with a stub that captures the File and reads its bytes.
       That proves the same content reaches the share call; it does NOT prove
       iOS Share-sheet behaviour, which needs the manual check in the
       accompanying checklist.
     * a blob <a download> click, the fallback. Driven for real here and the
       downloaded file is read off disk.

   Restore is NOT asserted: applyImport() is unchanged by this candidate. An
   earlier version of this file "restored" training that was already seeded into
   localStorage, so the unfixed base passed by doing nothing at all. */
const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require(path.join(process.env.HOME, 'staging-cas', 'node_modules', 'playwright'));

const SRC = process.env.CF_SRC || '/home/griffin/projects/compound-app/index.html';

/* Seeded already-migrated, so boot-time normalisation does not rewrite them and
   full values can be compared rather than just ids. */
const TRAINING = {
  cardioTypes: ['Peloton', 'Rowing'],
  exercises: [{ id: 'e1', name: 'Squat', muscle: 'legs', movement: 'compound' }],
  routines: [{ id: 'r-1784875593790-csbt', name: 'Full Body Day 3',
               items: [{ exId: 'e1', sets: 3, progression: 'double' }] }],
  sessions: { '2026-07-30': [{ kind: 'cardio', type: 'Peloton', mins: 30, kcal: 320 }] },
  liftSessions: { '2026-07-31': [{ name: 'Deadlift', sets: [{ w: 140, r: 5 }, { w: 140, r: 5 }] }] },
};

let passed = 0; const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failures.push(name); console.log('  ✗ ' + name + '\n      ' + (e && e.message)); }
}
const eq = (a, b, m) => { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error((m ? m + ': ' : '') + `expected ${y}, got ${x}`); };
const ok = (v, m) => { if (!v) throw new Error(m || 'expected truthy'); };
const notOk = (v, m) => { if (v) throw new Error(m || 'expected falsy'); };

(async () => {
  const html = fs.readFileSync(SRC, 'utf8');
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(html);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;

  const browser = await chromium.launch();
  const context = await browser.newContext({ acceptDownloads: true });
  await context.addInitScript((t) => {
    try { localStorage.setItem('wl_training_v1', JSON.stringify(t)); } catch (e) {}
  }, TRAINING);
  const page = await context.newPage();
  const pageErrors = [];
  const netAfterBoot = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.exportData === 'function', null, { timeout: 15000 });

  console.log('\nC12 (browser) — the DELIVERED backup file');
  console.log('  source: ' + SRC);
  console.log('  build : ' + await page.evaluate(() => window.APP_BUILD));
  console.log('  origin: ' + origin);

  test('the app booted with no page error', () => eq(pageErrors, []));

  /* ---- route 1: the real blob-download fallback -------------------------- */
  const before = await page.evaluate(() => ({
    training: JSON.parse(localStorage.getItem('wl_training_v1')),
    payloadHasTraining: 'training' in window.payload(),
  }));
  /* Force the fallback: this is the route a desktop browser takes anyway, but
     asserting it explicitly means the test cannot silently drift onto the other. */
  await page.evaluate(() => { try { delete navigator.canShare; delete navigator.share; } catch (e) {} });
  page.on('request', (r) => netAfterBoot.push(r.url()));

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.evaluate(() => window.exportData()),
  ]);
  const dlPath = await download.path();
  const deliveredBytes = fs.readFileSync(dlPath, 'utf8');
  const delivered = JSON.parse(deliveredBytes);

  test('a file was actually delivered', () => ok(deliveredBytes.length > 0));
  test('its filename is a dated backup name', () => ok(/^weight-tracker-backup-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()), 'got ' + download.suggestedFilename()));
  test('the delivered bytes parse as JSON', () => ok(delivered && typeof delivered === 'object'));

  test('DELIVERED FILE contains lift sessions, in full', () => eq(delivered.trainingHistory.liftSessions, TRAINING.liftSessions));
  test('DELIVERED FILE contains cardio sessions, in full', () => eq(delivered.trainingHistory.sessions, TRAINING.sessions));
  test('DELIVERED FILE contains routines, in full', () => eq(delivered.trainingHistory.routines, TRAINING.routines));
  test('DELIVERED FILE contains exercises, in full', () => eq(delivered.trainingHistory.exercises, TRAINING.exercises));
  test('DELIVERED FILE contains cardio types', () => eq(delivered.trainingHistory.cardioTypes, TRAINING.cardioTypes));
  test('DELIVERED FILE carries the format version and build', () => {
    eq(delivered.__backup.format, 2);
    ok(delivered.__backup.appBuild, 'no appBuild');
    ok(/^\d{4}-\d{2}-\d{2}T/.test(delivered.__backup.createdAt), 'no createdAt');
  });
  /* Only fields payload() actually gives a defined value: JSON.stringify drops
     undefined ones, so on a fresh device `scriptVer` is legitimately absent.
     That is pre-existing serialisation behaviour, unchanged by this candidate. */
  const coreKeys = await page.evaluate(() => {
    const p = window.payload();
    return Object.keys(p).filter((k) => p[k] !== undefined);
  });
  test('DELIVERED FILE contains every defined core field', () => {
    ok(coreKeys.length > 5, 'suspiciously few core fields: ' + coreKeys.length);
    coreKeys.forEach((k) => ok(k in delivered, 'missing ' + k));
  });

  /* ---- export must be inert -------------------------------------------- */
  const after = await page.evaluate(() => ({
    training: JSON.parse(localStorage.getItem('wl_training_v1')),
    payloadHasTraining: 'training' in window.payload(),
  }));
  test('export did not mutate localStorage training', () => eq(after.training, before.training));
  test('training did NOT leak into payload()', () => { notOk(before.payloadHasTraining); notOk(after.payloadHasTraining); });
  test('export issued no network request', () => eq(netAfterBoot.filter((u) => !u.startsWith('blob:')), []));

  /* ---- route 2: the share path, stubbed --------------------------------- */
  const shared = await page.evaluate(async () => {
    let captured = null;
    navigator.canShare = () => true;
    navigator.share = (d) => { captured = d; return Promise.resolve(); };
    window.exportData();
    await new Promise((r) => setTimeout(r, 50));
    if (!captured || !captured.files || !captured.files[0]) return { ok: false };
    return { ok: true, name: captured.files[0].name, type: captured.files[0].type, text: await captured.files[0].text() };
  });
  test('the share route was taken when the platform offers it', () => ok(shared.ok, 'navigator.share was not called'));
  test('the shared FILE carries the same training bytes', () => {
    eq(JSON.parse(shared.text).trainingHistory.liftSessions, TRAINING.liftSessions);
    eq(JSON.parse(shared.text).__backup.format, 2);
  });
  test('the shared file is named and typed correctly', () => {
    ok(/^weight-tracker-backup-\d{4}-\d{2}-\d{2}\.json$/.test(shared.name), 'got ' + shared.name);
    /* FIX-002 (Owner, 2026-07-28; restored 2026-08-05 after the a599efa
       lineage sync dropped it): exports declare charset so non-ASCII text
       survives share targets. 'Typed correctly' includes the charset. */
    eq(shared.type, 'application/json;charset=utf-8');
  });

  test('no page errors across the whole run', () => eq(pageErrors, []));

  await browser.close();
  server.close();

  console.log('\n  NOTE: the share route is exercised through a stub. Real iOS');
  console.log('  Share-sheet delivery is NOT proven here and needs the manual check.');
  console.log('\n' + '-'.repeat(52));
  console.log(failures.length ? `FAILED — ${passed} passed, ${failures.length} failed` : `OK — ${passed} passed`);
  process.exitCode = failures.length ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
