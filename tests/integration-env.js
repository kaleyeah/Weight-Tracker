/* Executable integration environment: evaluates the ENTIRE shipping script in
   a VM sandbox with a stub DOM, fake storage, captured fetch and controllable
   timers — then tests drive the real integrated call graph, not extracts. */
const fs = require('fs'); const vm = require('vm');
const { SRC } = require('./harness');

function makeStorage(seed) {
  const m = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(String(k), String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
    _map: m,
  };
}
function makeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(), children: [], style: { setProperty(){}, removeProperty(){} },
    dataset: {}, attributes: {}, value: '', checked: false, innerHTML: '', textContent: '',
    classList: { _s: new Set(), add(...a){a.forEach(x=>this._s.add(x));}, remove(...a){a.forEach(x=>this._s.delete(x));},
                 toggle(x){this._s.has(x)?this._s.delete(x):this._s.add(x);}, contains(x){return this._s.has(x);} },
    setAttribute(k, v){ this.attributes[k] = String(v); }, getAttribute(k){ return k in this.attributes ? this.attributes[k] : null; },
    removeAttribute(k){ delete this.attributes[k]; },
    appendChild(c){ this.children.push(c); return c; }, removeChild(c){ this.children = this.children.filter(x=>x!==c); return c; },
    insertBefore(c){ this.children.unshift(c); return c; }, remove(){}, contains(){ return false; },
    addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return true; },
    querySelector(){ return null; }, querySelectorAll(){ return []; }, closest(){ return null; },
    focus(){}, blur(){}, select(){}, click(){}, scrollIntoView(){}, getBoundingClientRect(){ return {top:0,left:0,width:0,height:0,bottom:0,right:0}; },
  };
  return el;
}

/* One registry for the whole process: locks are an ORIGIN-wide primitive, and
   every env created here models a tab on the same origin. */
const LOCK_QUEUES = new Map();
function makeLocks() {
  return {
    request(name, optionsOrFn, maybeFn) {
      const fn = typeof optionsOrFn === 'function' ? optionsOrFn : maybeFn;
      const prev = LOCK_QUEUES.get(name) || Promise.resolve();
      let releaseHeld;
      const held = new Promise((r) => { releaseHeld = r; });
      const run = prev.then(() => Promise.resolve(fn({ name, mode: 'exclusive' })));
      LOCK_QUEUES.set(name, run.then(() => held, () => held).then(() => {}, () => {}));
      return run.finally(() => releaseHeld());
    },
  };
}

function createEnv(opts) {
  opts = opts || {};
  const fetchLog = [];
  const timers = []; let timerId = 1;
  const byId = new Map();
  const doc = {
    documentElement: makeEl('html'), head: makeEl('head'), body: makeEl('body'),
    hidden: false, visibilityState: 'visible',
    createElement: (t) => makeEl(t), createTextNode: (s) => ({ textContent: s }),
    getElementById: (id) => { if (!byId.has(id)) byId.set(id, makeEl('div')); return byId.get(id); },
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener(){}, removeEventListener(){}, execCommand(){ return true; },
  };
  const fetchResponses = opts.fetchResponses || (() => null);
  const sandbox = {
    console: { log(){}, warn(){}, error(){}, info(){} },
    document: doc,
    /* opts.storagePatch(localStorage) runs BEFORE the app script, so a suite can
       model a storage layer that throws, silently drops, or returns different
       bytes than were written. Boot-time code runs against the patched object,
       which is the only way to test a capture that happens during boot. */
    localStorage: (function () { const s = makeStorage(opts.localStorage); if (opts.storagePatch) opts.storagePatch(s); return s; })(),
    sessionStorage: makeStorage(opts.sessionStorage),
    location: { origin: 'https://app.test', pathname: '/', hash: '', search: '', href: 'https://app.test/', replace(){}, reload(){} },
    history: { replaceState(){}, pushState(){} },
    navigator: { userAgent: 'test', storage: { persist: () => Promise.resolve(true) }, canShare: undefined, share: undefined },
    fetch: function (url, init) {
      const entry = { url: String(url), method: ((init && init.method) || 'GET').toUpperCase(), body: init && init.body };
      fetchLog.push(entry);
      const custom = fetchResponses(entry);
      if (custom) return Promise.resolve(custom);
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(''), json: () => Promise.resolve({ items: [] }) });
    },
    setTimeout: (fn, ms) => { const id = timerId++; timers.push({ id, fn, ms: ms || 0 }); return id; },
    clearTimeout: (id) => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); },
    setInterval: () => 0, clearInterval(){},
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL(){} },
    Blob: function (parts, o) { this.parts = parts; this.type = o && o.type; },
    File: function (parts, name, o) { this.parts = parts; this.name = name; this.type = o && o.type; },
    indexedDB: { open: () => ({ set onsuccess(f){}, set onerror(f){}, set onupgradeneeded(f){} }) },
    /* Real browsers expose WebCrypto and TextEncoder on a secure context, and
       the app is served over https. The stub models that rather than forcing a
       test seam into production code — the CAS recovery writer hashes with the
       same crypto.subtle call it will use in the browser. */
    crypto: require('crypto').webcrypto,
    TextEncoder,
    /* Web Locks. Browsers serialise exclusive locks by NAME across every
       context on the origin, so the stub keeps its queues on a module-level
       registry shared by every sandbox created here — otherwise each "tab"
       would get its own private lock and the concurrency tests would prove
       nothing, which is precisely the failure the Architect caught in the
       previous round. opts.locks:false models a browser without the API. */
    navigator: undefined,   /* replaced below, after locks are wired */
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    alert(){}, confirm(){ return true; }, matchMedia: () => ({ matches: false, addListener(){}, addEventListener(){} }),
    requestAnimationFrame: (fn) => { timers.push({ id: timerId++, fn, ms: 0 }); return 0; },
  };
  sandbox.addEventListener = function(){}; sandbox.removeEventListener = function(){};
  sandbox.dispatchEvent = function(){ return true; };
  sandbox.getComputedStyle = () => ({ getPropertyValue: () => '' });
  sandbox.scrollY = 0; sandbox.innerWidth = 390; sandbox.innerHeight = 844;
  sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
  sandbox.navigator = {
    userAgent: 'test', storage: { persist: () => Promise.resolve(true) },
    canShare: undefined, share: undefined,
    locks: opts.locks === false ? undefined : makeLocks(),
  };
  vm.createContext(sandbox);
  const html = fs.readFileSync(SRC, 'utf8');
  const script = html.match(/<script>([^]*)<\/script>/)[1];
  vm.runInContext(script, sandbox, { filename: 'index.html#full' });
  return {
    S: sandbox, fetchLog,
    /* Timer callbacks used to fail silently here, which hid a ReferenceError
       thrown inside a scheduled CAS commit — the suite simply saw "no request
       was sent". Errors are now recorded so a test can assert on them. */
    timerErrors: [],
    runTimers() {
      let guard = 0;
      while (timers.length && guard++ < 200) {
        const t = timers.shift();
        try { t.fn(); } catch (e) { this.timerErrors.push(e); }
      }
    },
    appdataWrites() { return fetchLog.filter(e => /\/api\/collections\/appdata\/records/.test(e.url) && (e.method === 'POST' || e.method === 'PATCH')); },
  };
}
module.exports = { createEnv };
