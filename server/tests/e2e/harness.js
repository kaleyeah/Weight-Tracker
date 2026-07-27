/* Compound Fitness — Phase 2 staging harness.
   Drives the real build in a real browser against the real staging PocketBase.
   STAGING ONLY: refuses any non-loopback target. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const APP = process.env.APP || 'http://127.0.0.1:8092/index.html';
const PB = process.env.PB || 'http://127.0.0.1:8091';
const SHOTS = process.env.SHOTS || '/home/griffin/staging-cas/evidence/shots';

for (const [name, url] of [['APP', APP], ['PB', PB]]) {
  if (!/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):/.test(url)) {
    console.error(`REFUSED: ${name} must be loopback (got ${url})`);
    process.exit(2);
  }
}
fs.mkdirSync(SHOTS, { recursive: true });

const creds = (() => {
  const f = '/home/griffin/projects/Weight-Tracker/server/tests/.fixture-creds.env';
  const out = {};
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
})();

/* ---- results ------------------------------------------------------------ */
const results = [];
function record(id, title, expected, actual, pass, notes = '') {
  results.push({ id, title, expected, actual, pass, notes });
  const tag = pass === true ? 'PASS' : pass === false ? 'FAIL' : 'MANUAL';
  console.log(`${tag}  ${id}  ${title}`);
  if (pass !== true) console.log(`      expected: ${expected}\n      actual:   ${actual}${notes ? `\n      notes:    ${notes}` : ''}`);
}
function saveResults(file) {
  fs.writeFileSync(file, JSON.stringify(results, null, 2));
  const p = results.filter(r => r.pass === true).length;
  const f = results.filter(r => r.pass === false).length;
  const m = results.filter(r => r.pass !== true && r.pass !== false).length;
  console.log(`\n---- ${p} passed, ${f} failed, ${m} manual/inconclusive (${results.length} cases) ----`);
  return f;
}

/* ---- browser ------------------------------------------------------------ */
async function launch() {
  return chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
}

/* A fresh isolated profile. `init` runs before any app code — used to point the
   client at staging and to install fault injections (blocked/slow IndexedDB). */
async function profile(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const calls = [];
  await ctx.addInitScript(({ pb, mode }) => {
    // point the client at STAGING before it reads its config
    try {
      const cur = JSON.parse(localStorage.getItem('wl_pb') || '{}');
      localStorage.setItem('wl_pb', JSON.stringify(Object.assign({}, cur, { base: pb })));
    } catch (e) {}
    window.__cf = { idbBlocked: false, idbDelayMs: 0, boom: false };
    if (mode === 'idb-block') window.__cf.idbBlocked = true;
    if (mode === 'idb-slow') window.__cf.idbDelayMs = 4000;
    // Fault injection for the recovery-storage cases: the app must fail CLOSED
    // when it cannot write a safety copy.
    const realOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = function (...args) {
      if (window.__cf.idbBlocked) throw new DOMException('blocked by test', 'InvalidStateError');
      const req = realOpen(...args);
      if (window.__cf.idbDelayMs) {
        const delay = window.__cf.idbDelayMs;
        ['onsuccess', 'onerror'].forEach(k => {
          let h = null;
          Object.defineProperty(req, k, {
            configurable: true,
            get() { return h; },
            set(fn) { h = fn ? (ev) => setTimeout(() => fn.call(req, ev), delay) : fn; },
          });
        });
      }
      return req;
    };
  }, { pb: PB, mode: opts.mode || 'normal' });

  const page = await ctx.newPage();
  page.on('request', r => {
    const u = r.url();
    if (u.startsWith(PB)) calls.push({ method: r.method(), url: u.slice(PB.length), at: Date.now() });
  });
  page.on('pageerror', e => calls.push({ method: 'PAGEERROR', url: String(e).slice(0, 200), at: Date.now() }));
  return { ctx, page, calls };
}

/* Writes to the appdata snapshot fields — what section B/G must NOT see. */
function snapshotWrites(calls) {
  return calls.filter(c =>
    (c.method === 'POST' || c.method === 'PATCH') && /\/api\/collections\/appdata\/records/.test(c.url));
}
function commitCalls(calls) {
  return calls.filter(c => /\/api\/cf\/appdata\/commit/.test(c.url));
}

async function login(page, email, pass) {
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#wl-pb-email', { timeout: 20000 });
  await page.fill('#wl-pb-email', email);
  await page.fill('#wl-pb-pass', pass);
  await page.click('.wl-login-go');
  await page.waitForSelector('#wl-pb-email', { state: 'detached', timeout: 25000 });
  await page.waitForTimeout(1500);
}

async function shot(page, name) {
  const p = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

/* Visible sync/status text — used to assert "pending" rather than "saved". */
async function syncText(page) {
  return page.evaluate(() => {
    const el = document.querySelector('#wl-sync,.wl-sync,[data-act="sync:tap"],.wl-status,.wl-syncdot');
    return el ? (el.textContent || '').trim().slice(0, 200) : '(no status element)';
  });
}
async function dirty(page) {
  return page.evaluate(() => localStorage.getItem('wl_dirty'));
}

module.exports = {
  APP, PB, SHOTS, creds, results, record, saveResults,
  launch, profile, login, shot, syncText, dirty,
  snapshotWrites, commitCalls,
};
