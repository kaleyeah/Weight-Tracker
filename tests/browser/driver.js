/* Boot the SHIPPING index.html in real Chromium and hand back a page whose
   globals are the app's own. Nothing here re-implements app behaviour: every
   assertion in the browser suite drives the same functions and the same DOM the
   athlete gets. */
const path = require('path');
const { chromium } = require(path.join(process.env.HOME, 'staging-cas', 'node_modules', 'playwright'));
const { start } = require('./serve');

const ACCOUNT = { uid: 'userA', base: 'https://pb.test', token: 'tok', email: 'a@x.com' };
const REC = (sub) => 'casrec-' + sub + '-' + 'a'.repeat(32);

async function boot(opts) {
  opts = opts || {};
  const srv = await start(0);
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: opts.viewport || { width: 1280, height: 900 },
  });
  /* Seed the signed-in account AND an onboarded athlete before any app script
     runs. Without the second part the app boots into its onboarding flow, which
     covers the screen — the conflict centre would be photographed behind a
     welcome overlay and driven in a state no returning athlete is ever in. */
  await context.addInitScript(({ acct, seed }) => {
    try {
      localStorage.setItem('wl_pb', JSON.stringify(acct));
      localStorage.setItem('cf:lastOwner', acct.uid);
      localStorage.setItem('wl_v1', JSON.stringify(seed));
    } catch (e) { /* first-run storage refusal is the app's problem, not ours */ }
  }, {
    acct: ACCOUNT,
    seed: {
      settings: { onboarded: true, name: 'Test', theme: 'dark', startingWeight: 84, goalWeight: 78 },
      /* {date, weight} — the shape sortedWeights() actually sorts on. A
         plausible-looking {d, kg} booted the app straight into an uncaught
         localeCompare on undefined, which stopped the script before the Commit
         10 block was ever defined. */
      weights: [{ date: '2026-07-20', weight: 82.4 }, { date: '2026-07-25', weight: 81.9 }],
    },
  });

  /* Block the network before the first navigation, not after: the app's boot
     tries to reach its PocketBase base URL immediately, and a route installed
     after goto() would let those requests out. */
  await context.route('**://pb.test/**', (route) => route.abort());

  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });

  await page.goto(srv.origin + '/index.html', { waitUntil: 'load' });
  /* The app hides the document until its boot guard decides; wait for that
     decision rather than for a fixed delay. */
  await page.waitForFunction(() => document.documentElement.style.visibility !== 'hidden', null,
    { timeout: 10000 });

  return {
    page, browser, context, origin: srv.origin, pageErrors,
    async close() { await browser.close(); await srv.close(); },
  };
}

/* Put the app into a named CAS state through its OWN setters, so the state is
   reachable the same way production reaches it. */
async function setState(page, spec) {
  await page.evaluate((s) => {
    ['core', 'training'].forEach((sub) => {
      cfCasSetConflictId(sub, null);
      cfCasSetBlock(sub, null, null);
      CF_CAS_RECHOOSE[sub] = false;
      CF_CAS_RES[sub] = null;
    });
    (s.conflicts || []).forEach((sub) => cfCasSetConflictId(sub, s.recIds[sub]));
    (s.blocks || []).forEach(([sub, kind]) => cfCasSetBlock(sub, kind, 'tok'));
    (s.rechoose || []).forEach((sub) => { CF_CAS_RECHOOSE[sub] = true; });
    (s.aged || []).forEach((sub) => { CF_CAS_PRESERVE_AT[sub] = Date.now() - (CF_CAS_PRESERVE_MS + 200); });
    (s.busy || []).forEach((sub) => { CF_CAS_RES[sub] = { action: 'test', sub: sub }; });
    cfCasPaint();
  }, Object.assign({ recIds: { core: REC('core'), training: REC('training') } }, spec));
}

/* Seed a conflict the way production creates one: a REAL recovery artifact,
   written and verified through the app's own writer, then referenced.
   Fabricating a record id without the artifact behind it produces a conflict
   that fails verification the moment anything touches it — which is a valid
   state, but it is the recovery-blocked state, not the one under test. */
async function seedConflict(page, sub, serverRev, payload) {
  return page.evaluate(async (s) => {
    const id = cfCasRecNewId(s.sub);
    if (!id) throw new Error('seed: no entropy for a record id');
    cfCasSetServerRev(s.sub, s.serverRev);
    const ok = await new Promise((res) => {
      cfCasRecWrite(id, s.sub, s.serverRev, JSON.stringify(s.payload), (o) => res(o));
    });
    if (!ok) throw new Error('seed: the recovery write failed');
    cfCasSetConflictId(s.sub, id);
    return id;
  }, { sub, serverRev, payload });
}

/* Give the subsystem something genuinely unsent, so the scheduler is allowed
   to run at all (cfCasCanCommit requires local > success). */
async function makePending(page, sub) {
  await page.evaluate((s) => { revBump(s); }, sub);
}

/* A second tab on the SAME origin and the same browsing context group.
   This is what "multi-context" has to mean for Web Locks and localStorage: a
   fresh browser.newContext() is a different storage partition entirely, so two
   such contexts could never contend for a lock or see each other's artifacts,
   and a test built on them would prove the opposite of what it claimed. */
async function newTab(b) {
  const page = await b.context.newPage();
  page.on('pageerror', (e) => b.pageErrors.push('tab: ' + String((e && e.message) || e)));
  await page.goto(b.origin + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.style.visibility !== 'hidden',
    null, { timeout: 10000 });
  return page;
}

/* Sign the page into a different account, the way the app does. */
async function switchAccount(page, uid, email) {
  await page.evaluate((a) => {
    const cfg = JSON.parse(localStorage.getItem('wl_pb') || '{}');
    cfg.uid = a.uid; cfg.email = a.email; cfg.token = 'tok-' + a.uid;
    localStorage.setItem('wl_pb', JSON.stringify(cfg));
    localStorage.setItem('cf:lastOwner', a.uid);
    if (typeof CF_SESSION_GEN === 'number') CF_SESSION_GEN++;
  }, { uid, email: email || (uid + '@x.com') });
}

/* What currently has focus, described the way a person would describe it. */
async function focused(page) {
  return page.evaluate(() => {
    const a = document.activeElement;
    if (!a || a === document.body) return { tag: 'BODY', text: '', act: '', id: '' };
    return {
      tag: a.tagName,
      text: (a.textContent || '').trim().slice(0, 60),
      act: a.getAttribute('data-act') || '',
      id: a.id || '',
      sub: a.getAttribute('data-sub') || '',
    };
  });
}

/* Tab order as the browser itself computes it: walk focus forward and record
   where it lands. Reading tabindex out of markup would only prove what we
   wrote, not what Chromium does. */
async function tabOrder(page, steps) {
  const seen = [];
  for (let i = 0; i < (steps || 8); i++) {
    await page.keyboard.press('Tab');
    seen.push(await focused(page));
  }
  return seen;
}

async function liveText(page) {
  return page.evaluate(() => {
    const el = document.getElementById('cf-cas-live');
    return el ? (el.textContent || '') : null;
  });
}

module.exports = {
  boot, newTab, switchAccount, setState, seedConflict, makePending,
  focused, tabOrder, liveText, ACCOUNT, REC,
};
