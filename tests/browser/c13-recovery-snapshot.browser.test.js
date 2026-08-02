/* C13 in a REAL browser — the pre-sync recovery snapshot at the upgrade boundary.

       CF_SRC=/home/griffin/projects/compound-app/index.html \
         node tests/browser/c13-recovery-snapshot.browser.test.js

   The VM suite models boot order. This proves it in the real engine: the
   snapshot must be captured before migrateProgressionTypes() rewrites
   wl_training_v1 and before autoSync() can pull over it. Ordering is exactly
   the class of claim a stubbed environment can get subtly wrong, so it is worth
   asserting where the real boot sequence runs. */
const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require(path.join(process.env.HOME, 'staging-cas', 'node_modules', 'playwright'));

const SRC = process.env.CF_SRC || '/home/griffin/projects/compound-app/index.html';
const PB = { uid: 'userA', base: 'https://pb.test', token: 'tok', email: 'a@x.com' };

/* The server copy stops before the unsynced session. Exercises carry no
   `movement` -- the old on-disk shape, which migration adds at boot. */
const SERVER = {
  cardioTypes: ['Peloton'],
  exercises: [{ id: 'e1', name: 'Squat', muscle: 'legs' }],
  routines: [{ id: 'r1', name: 'Full Body Day 3', items: [] }],
  sessions: {},
  liftSessions: { '2026-07-27': [{ name: 'Squat', sets: [{ w: 100, r: 5 }] }] },
};
const OLD_LOCAL = JSON.parse(JSON.stringify(SERVER));
OLD_LOCAL.liftSessions['2026-07-31'] = [{ name: 'Deadlift', sets: [{ w: 140, r: 5 }] }];
const ACTIVE_WORKOUT = { routineId: 'r1', startedAt: 1785000000000, entries: [{ name: 'Bench', sets: [{ w: 80, r: 5, done: true }] }] };

let passed = 0; const failures = [];
function test(name, fn) {
  /* Synchronous only. A promise-returning callback would have its assertions run
     after this returns, so a failure would print a tick and surface later as an
     unhandled rejection -- which is exactly what happened while writing this
     file. Await the async work first, then assert on the result. */
  try {
    const r = fn();
    if (r && typeof r.then === 'function') { r.catch(() => {}); throw new Error('test() callback returned a promise; await outside test()'); }
    passed++; console.log('  ✓ ' + name); }
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

  /* Authentic old-build storage: the raw keys the previous build leaves, and
     none of the new ones. */
  await context.addInitScript((d) => {
    try {
      localStorage.setItem('wl_pb', JSON.stringify(d.pb));
      localStorage.setItem('wl_training_v1', d.local);
      localStorage.setItem('wl_workout_v1', d.workout);
      /* Ownership already settled -- a device that has been through the one-time
         adoption prompt. The prompt itself is covered in the VM suite; seeding it
         keeps this test about boot ORDER, which is what a real engine adds. */
      localStorage.setItem('wl_last_owner', d.pb.uid);
    } catch (e) {}
  }, { pb: PB, local: JSON.stringify(OLD_LOCAL), workout: JSON.stringify(ACTIVE_WORKOUT) });

  /* A stale server, answering the pull with the copy that lacks the session. */
  await context.route('**/api/collections/appdata/records**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ items: [{ id: 'rec1', training: SERVER, trainingRev: 11 }] }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'rec1' }) });
  });
  await context.route('**/api/collections/users/auth-refresh**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'tok', record: { id: 'userA' } }) }));

  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.backupJSON === 'function', null, { timeout: 15000 });

  console.log('\nC13 (browser) — pre-sync recovery snapshot');
  console.log('  source: ' + SRC);
  console.log('  build : ' + await page.evaluate(() => window.APP_BUILD));

  test('the app booted with no page error', () => eq(pageErrors, []));

  const rec = await page.evaluate(() => {
    const m = JSON.parse(localStorage.getItem('wl_training_recovery') || '{}');
    return m.userA || null;
  });
  test('a recovery envelope was captured on the real boot', () => ok(rec));
  test('it holds the exact pre-migration bytes', () => eq(rec.training, JSON.stringify(OLD_LOCAL)));
  test('its exercises have no migration-added `movement`', () => notOk('movement' in JSON.parse(rec.training).exercises[0]));
  test('the in-progress workout was captured raw', () => eq(rec.workout, JSON.stringify(ACTIVE_WORKOUT)));
  const blocked = await page.evaluate(() => window.recoveryBlocked);
  test('syncing is not blocked, since the write verified', () => notOk(blocked));

  /* Let the real boot sync settle, then check the snapshot outlived it. */
  await page.waitForTimeout(2500);
  const afterSync = await page.evaluate(() => ({
    rec: (JSON.parse(localStorage.getItem('wl_training_recovery') || '{}')).userA || null,
    live: JSON.parse(localStorage.getItem('wl_training_v1') || '{}').liftSessions || {},
  }));
  test('the snapshot survives the boot sync', () => ok(afterSync.rec));
  /* THE POINT OF THE WHOLE CHANGE. This build still has the unconditional
     trainingPull, so the boot sync really does overwrite the live copy with the
     stale server one. That is NOT fine: the displayed history becomes wrong,
     this build cannot restore from the snapshot, and anything logged afterwards
     is still exposed to the unfixed defect. What the snapshot achieves is that
     the loss is CONTAINED in an exportable copy while the live app stays
     degraded. Asserting both halves proves the loss happened and was survived --
     not that it was prevented. */
  test('the boot sync DID overwrite the live copy (loss reproduced)', () => {
    notOk(afterSync.live['2026-07-31'], 'expected the live key to lose the session here');
  });
  test('but the snapshot still holds the unsynced 2026-07-31 session', () => {
    ok(JSON.parse(afterSync.rec.training).liftSessions['2026-07-31'], 'the pre-sync copy lost it');
  });

  /* ---- the delivered file carries it ------------------------------------ */
  await page.evaluate(() => { try { delete navigator.canShare; delete navigator.share; } catch (e) {} });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.evaluate(() => window.exportData()),
  ]);
  const delivered = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));

  test('DELIVERED FILE carries the recovery snapshot', () => ok(delivered.recovery));
  test('DELIVERED FILE recovery holds the unsynced session', () => {
    ok(JSON.parse(delivered.recovery.training).liftSessions['2026-07-31']);
  });
  test('DELIVERED FILE also carries the live history, separately', () => ok(delivered.trainingHistory));
  test('DELIVERED FILE carries the active workout in full', () => eq(delivered.activeWorkout, ACTIVE_WORKOUT));
  test('the metadata declares exactly what is present', () => {
    const c = delivered.__backup.contains;
    ok(c.indexOf('recovery') >= 0, 'recovery not declared');
    ok(c.indexOf('activeWorkout') >= 0, 'activeWorkout not declared');
    ok(c.indexOf('trainingHistory') >= 0, 'trainingHistory not declared');
  });
  const stillThere = await page.evaluate(() => !!(JSON.parse(localStorage.getItem('wl_training_recovery') || '{}')).userA);
  test('recovery was NOT cleared by exporting', () => ok(stillThere));

  /* ---- the real device photo routes, under ambiguity ------------------- */
  /* Driven here rather than in the VM because these await real IndexedDB, which
     the VM only stubs. And "no photo request was sent" is NOT quarantine: the
     earlier version of this check added a photo, deleted it, then cleared the
     whole store, and reported green because it only watched the network. What
     matters is that the photos are STILL THERE afterwards. */
  const photoRequests = [];
  page.on('request', (r) => { if (/\/photos\/|\/files\//.test(r.url())) photoRequests.push(r.url()); });

  /* Seed real photos BEFORE ambiguity, while adding is still permitted. */
  const seeded = await page.evaluate(async () => {
    const mk = (id, meal) => ({ id, date: '2026-08-01', blob: new Blob(['x'.repeat(64)], { type: 'image/jpeg' }), ts: Date.now(), meal });
    await window.idbAdd(mk('keep-1', 'lunch'));
    await window.idbAdd(mk('keep-2', 'dinner'));
    const m = window.pbPhotoMap(); m['keep-1'] = 'srv-1'; window.setPbPhotoMap(m);
    const all = await window.idbAll();
    return { ids: all.map((p) => p.id).sort(), meals: all.map((p) => p.id + ':' + (p.meal || '')).sort(),
             map: JSON.stringify(window.pbPhotoMap()) };
  });
  test('two real photos are on the device', () => eq(seeded.ids, ['keep-1', 'keep-2']));
  /* Seeding legitimately uploads, since ambiguity has not started yet. Only what
     happens AFTER it starts is the property under test. idbAdd's upload is
     fire-and-forget, so let those land before scoping the assertion to them. */
  await page.waitForTimeout(600);
  photoRequests.length = 0;

  const after = await page.evaluate(async () => {
    /* Another account captures on this device, after boot. */
    const store = JSON.parse(localStorage.getItem('wl_training_recovery') || '{}');
    store.userB = { v: 1, capturedAt: '2026-07-01T00:00:00.000Z', appBuild: 'x', account: 'userB', training: '{"b":1}', workout: null };
    localStorage.setItem('wl_training_recovery', JSON.stringify(store));
    if (!window.ownershipAmbiguous()) return { ambiguous: false };

    const swallow = (p) => (p && p.catch ? p.catch(() => {}) : Promise.resolve());
    const blob = new Blob(['y'], { type: 'image/jpeg' });
    await swallow(window.idbAdd({ id: 'should-not-exist', date: '2026-08-02', blob, ts: Date.now() }));
    await swallow(window.idbDelete('keep-1'));
    await swallow(window.idbClearAll());
    await swallow(window.pbPhotoList());
    await swallow(window.pbFileToken());
    await new Promise((r) => window.photoSync(r));
    await new Promise((r) => setTimeout(r, 200));

    const all = await window.idbAll();
    return { ambiguous: true, ids: all.map((p) => p.id).sort(),
             meals: all.map((p) => p.id + ':' + (p.meal || '')).sort(),
             map: JSON.stringify(window.pbPhotoMap()) };
  });

  test('the device is ambiguous for the photo checks', () => ok(after.ambiguous));
  test('idbDelete did NOT delete the local photo', () => ok(after.ids.indexOf('keep-1') >= 0, 'keep-1 was deleted under quarantine'));
  test('idbClearAll did NOT clear the local store', () => eq(after.ids.filter((i) => i.startsWith('keep')), ['keep-1', 'keep-2']));
  test('idbAdd did NOT write a new local photo', () => notOk(after.ids.indexOf('should-not-exist') >= 0));
  test('the photo records are unchanged, meals included', () => eq(after.meals, seeded.meals));
  test('the photo map is unchanged', () => eq(after.map, seeded.map));
  test('and no photo request reached the network', () => eq(photoRequests, []));

  /* The lightbox meal-edit control, driven through the real DOM. Its guard sits
     before r.meal and idbAddLocal, but the guard existing is not the same as the
     control being inert -- that distinction is exactly what the earlier photo
     evidence got wrong. */
  const meal = await page.evaluate(async () => {
    const before = (await window.idbAll()).map((p) => p.id + ':' + (p.meal || '')).sort();
    window.openLightbox('keep-1');
    await new Promise((r) => setTimeout(r, 150));
    /* The chip row is built lazily; reveal it the way the UI does. */
    const editBtn = document.querySelector('[data-lb="mealedit"], [data-lb="meal-edit"]');
    if (editBtn) editBtn.click();
    await new Promise((r) => setTimeout(r, 100));
    const chip = document.querySelector('[data-lb="meal"][data-meal="dinner"]');
    if (!chip) return { drove: false, before };
    chip.click();
    await new Promise((r) => setTimeout(r, 300));
    const after = (await window.idbAll()).map((p) => p.id + ':' + (p.meal || '')).sort();
    return { drove: true, before, after, map: JSON.stringify(window.pbPhotoMap()) };
  });
  test('the meal-edit control was reachable in the DOM', () => ok(meal.drove, 'chip not found — control not driven'));
  test('clicking a different meal changed NOTHING on disk', () => eq(meal.after, meal.before));
  test('the photo map is still unchanged', () => eq(meal.map, seeded.map));
  test('and it still issued no photo request', () => eq(photoRequests, []));

  test('no page errors across the whole run', () => eq(pageErrors, []));

  /* ---- the recovery-only boot, in a real engine ------------------------- */
  /* Ruling 2 demanded real-browser evidence that a gated boot performs no
     user-data load, migration, IndexedDB access, auth refresh, or network
     request. A fresh page with a mid-wipe journal is exactly that boot. */
  const gatePage = await context.newPage();
  /* Pages in one context share localStorage, so the earlier seeding is legitimately
     present -- which makes this MORE realistic: a device with real data, booting
     gated. The property is that boot leaves those bytes untouched. Static <link>
     fetches (fonts) come from the HTML head, not boot code; only API traffic
     counts. */
  /* The context init script re-seeds wl_training_v1 = OLD_LOCAL on every new
     page, so the gated boot starts from exactly those bytes -- including the
     unmigrated exercises a normal boot would rewrite. The property: they are
     byte-identical afterwards. */
  const beforeTrainingKey = JSON.stringify(OLD_LOCAL);
  /* Ruling 3: EVERY post-navigation request, not an API-shaped subset -- the
     same-origin cache-busting fetch from checkForUpdate() was invisible to the
     narrower filter. The initial document and its static head resources (fonts
     CSS declared in the HTML) are excluded; anything code-initiated counts. */
  const gateRequests = [];
  let gateDocLoaded = false;
  gatePage.on('request', (r) => {
    if (r.isNavigationRequest() && !gateDocLoaded) { gateDocLoaded = true; return; }
    if (/fonts\.googleapis|fonts\.gstatic/.test(r.url())) return;   /* static <link> in <head> */
    gateRequests.push(r.url());
  });
  let gateNavigations = 0;
  gatePage.on('framenavigated', () => { gateNavigations++; });
  const gateErrors = [];
  gatePage.on('pageerror', (e) => gateErrors.push(String(e)));
  await gatePage.addInitScript(() => {
    const j = { v: 1, at: '2026-08-01', account: 'userA', appBuild: 'x', phase: 'data-cleared',
      vals: { wl_v1: null, wl_training_v1: '{"liftSessions":{}}', wl_workout_v1: null, wl_dirty: null,
              wl_lastsync: null, wl_last_owner: 'userA', wl_training_recovery: null },
      session: { local: null, session: null } };
    localStorage.setItem('wl_logout_journal', JSON.stringify(j));
  });
  await gatePage.goto(origin, { waitUntil: 'load' });
  await gatePage.waitForTimeout(2000);
  const gate = await gatePage.evaluate(() => ({
    html: document.getElementById('app').innerHTML,
    weights: window.state.weights.length,
    lifts: Object.keys(window.state.training.liftSessions || {}).length,
    trainingKey: localStorage.getItem('wl_training_v1'),
  }));
  test('GATED BOOT: the interrupted-logout screen owns the page', () => ok(/Interrupted log-out/.test(gate.html), gate.html.slice(0, 120)));
  test('GATED BOOT: no user data was loaded into memory', () => { eq(gate.weights, 0); eq(gate.lifts, 0); });
  test('GATED BOOT: migration did not touch the stored training key', () => eq(gate.trainingKey, beforeTrainingKey));
  test('GATED BOOT: zero code-initiated requests — no update check, no API, no files', () => eq(gateRequests, []));
  test('GATED BOOT: no automatic navigation replaced the gate', () => eq(gateNavigations, 1));
  test('GATED BOOT: no page errors', () => eq(gateErrors, []));
  await gatePage.close();

  /* ---- the adoption transition, through the REAL reload (ruling 6) ------ */
  const adoptContext = await browser.newContext({ acceptDownloads: true });
  await adoptContext.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ items: [{ id: 'rec1', training: SERVER, trainingRev: 11 }], token: 'tok', record: { id: 'userA' } }) }));
  const adoptPage = await adoptContext.newPage();
  const adoptErrors = [];
  adoptPage.on('pageerror', (e) => adoptErrors.push(String(e)));
  await adoptPage.addInitScript((d) => {
    /* An unmarked upgrading device: data, session, no marker. Seed ONCE — a
       reload must see the post-adoption state, not a re-seeded pre-state. */
    if (!localStorage.getItem('__seeded')) {
      localStorage.setItem('__seeded', '1');
      localStorage.setItem('wl_pb', JSON.stringify(d.pb));
      localStorage.setItem('wl_training_v1', d.local);
    }
  }, { pb: PB, local: JSON.stringify(OLD_LOCAL) });
  await adoptPage.goto(origin, { waitUntil: 'load' });
  await adoptPage.waitForFunction(() => typeof window.bootGated === 'function', null, { timeout: 15000 });

  const preAdopt = await adoptPage.evaluate(() => ({
    gated: !!document.querySelector('[data-act="adopt:yes"]'),
    weights: window.state.weights.length,
    marker: localStorage.getItem('wl_last_owner'),
    raw: localStorage.getItem('wl_training_v1'),
  }));
  test('ADOPTION: the gate renders with the confirm button', () => ok(preAdopt.gated));
  test('ADOPTION: no user data loaded pre-answer', () => eq(preAdopt.weights, 0));
  test('ADOPTION: no marker recorded pre-answer', () => eq(preAdopt.marker, null));

  /* Click the real button; the app performs a REAL location.reload(). */
  await Promise.all([
    adoptPage.waitForNavigation({ timeout: 15000 }),
    adoptPage.click('[data-act="adopt:yes"]'),
  ]);
  await adoptPage.waitForFunction(() => typeof window.backupJSON === 'function', null, { timeout: 15000 });
  await adoptPage.waitForTimeout(1500);

  const postAdopt = await adoptPage.evaluate(() => ({
    marker: localStorage.getItem('wl_last_owner'),
    rec: (JSON.parse(localStorage.getItem('wl_training_recovery') || '{}')).userA || null,
    gatedNow: !!document.querySelector('[data-act="adopt:yes"]'),
    appUp: !!document.querySelector('.wl-main'),
  }));
  test('ADOPTION: the marker was recorded before the navigation', () => eq(postAdopt.marker, 'userA'));
  test('ADOPTION: the reboot captured a snapshot', () => ok(postAdopt.rec));
  test('ADOPTION: holding the exact pre-gate bytes', () => eq(postAdopt.rec.training, preAdopt.raw));
  test('ADOPTION: the ordinary app initialised only after the reload', () => { notOk(postAdopt.gatedNow); ok(postAdopt.appUp); });
  test('ADOPTION: no page errors across the transition', () => eq(adoptErrors, []));
  await adoptContext.close();

  await browser.close();
  server.close();

  console.log('\n' + '-'.repeat(52));
  console.log(failures.length ? `FAILED — ${passed} passed, ${failures.length} failed` : `OK — ${passed} passed`);
  process.exitCode = failures.length ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
