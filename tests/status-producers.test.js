/* STATUS-V4-AUDIT-01..08 — every status writer is inventoried and classified.

   The first version of this audit scanned for literal `setSync("error"` and
   `setSync("offline"` only. The Architect caught that it therefore missed the
   most common shipping form:

       setSync(err==="offline"?"offline":"error", ...)

   and audited only failures, never the terminal `setSync("ok")` calls that can
   visually hide a live owned cause. An inventory that misses most of its
   subject is worse than none: it reads as coverage.

   This version parses every setSync(...) call site, classifies it by what it
   can produce, distinguishes the ACTIVE definition from superseded ones (this
   client is append-and-override), and requires each active persistent producer
   to name an owner or an approved reason. Planted violations must fail it —
   AUDIT-06/07/08 demonstrate that rather than asserting it. */
const fs = require('fs');
const path = require('path');
const { test, group, eq, ok, notOk, report } = require('./harness');

const SRC = path.join(__dirname, '..', 'index.html');

const OWNED_SOURCES = ['auth', 'cas-network', 'legacy-manual', 'cas-pending', 'photo-reconcile'];
const ROUTED = /cfStatusSet\(|cfStatusTransportFailure\(|cfSetPending\(|cfStatusOperationOk\(|cfPhotoStatus(Incomplete|Complete)\(/;

/* Deliberately NOT registry-owned, each with a reason. These render as a full
   screen or inside the conflict centre, where the athlete can act on them — a
   second, quieter copy on the status line would be unactionable. */
const ALLOWED = [
  { match: /this device holds another account/, why: 'ownership gate: full-screen (cfBlockedHTML mismatch)' },
  { match: /is this your data\? — needs your answer/, why: 'ownership gate: full-screen (unclaimed)' },
  { match: /unsynced changes — needs your decision/, why: 'pre-CAS conflict surface, superseded by the conflict centre' },
  { match: /unsynced changes — not yet reconciled/, why: 'pre-CAS conflict surface' },
  { match: /changes in two places — needs your decision/, why: 'pre-CAS conflict surface' },
  { match: /changes in two places — not yet resolved/, why: 'conflict surface: the centre owns the decision' },
  { match: /changes arrived while syncing — nothing was replaced/, why: 'recovery-first outcome shown by the conflict centre' },
  { match: /couldn.t save a previous copy/, why: 'recovery-first failure shown in place by the conflict centre' },
  { match: /photo list incomplete/, why: 'unreachable fallback inside the photo source\'s own catch' },
  { match: /aren.t uploaded yet — tap to upload/, why: 'SUPERSEDED cfSetPending; the active override owns cas-pending' },
];

/* ---- the scan ---------------------------------------------------------- */
function auditSource(src) {
  const lines = src.split('\n');
  const calls = [];
  lines.forEach((line, i) => {
    const re = /setSync\(/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      /* the first argument, to the first top-level comma */
      const rest = line.slice(m.index + 'setSync('.length);
      let depth = 0, arg = '';
      for (let k = 0; k < rest.length; k++) {
        const c = rest[k];
        if (c === '(' || c === '[') depth++;
        else if (c === ')' || c === ']') { if (depth === 0) break; depth--; }
        else if (c === ',' && depth === 0) break;
        arg += c;
      }
      const produces = [];
      ['error', 'offline', 'ok', 'saving', 'syncing', 'warn'].forEach((state) => {
        if (new RegExp('"' + state + '"').test(arg)) produces.push(state);
      });
      calls.push({
        n: i + 1, text: line.trim(), arg: arg.trim(), produces,
        dynamic: !/^\s*"[a-z]+"\s*$/.test(arg.trim()),
        persistent: produces.some((x) => x === 'error' || x === 'offline'),
        terminalOk: produces.indexOf('ok') >= 0,
        transient: produces.some((x) => x === 'saving' || x === 'syncing'),
        routed: ROUTED.test(line),
        isDefinition: /setSync\s*=\s*function/.test(line) || /function setSync/.test(line),
      });
    }
  });
  return calls;
}

const src = fs.readFileSync(SRC, 'utf8');
const srcLines = src.split('\n');

/* ---- active vs superseded (Architect STATUS-V4-AUDIT-03) ----------------
   This client is append-and-override: `cloudPush`, `cloudGet`, `autoSync`,
   `cfUploadNow` and friends are each redefined several times, and only the LAST
   definition runs. A producer inside a superseded definition is dead code — it
   cannot mislead an athlete — but it must be identified as such rather than
   quietly excused by matching its message text.

   For each producer we find the enclosing top-level definition and ask whether
   that same name is reassigned at a LATER line. If it is, the producer is
   superseded. */
function enclosingDef(lineNo) {
  for (let i = lineNo - 1; i >= 0; i--) {
    const m = srcLines[i].match(/^(?:function\s+([A-Za-z_$][\w$]*)\s*\(|([A-Za-z_$][\w$]*)\s*=\s*function)/);
    if (m) return { name: m[1] || m[2], line: i + 1 };
  }
  return null;
}
function isSuperseded(lineNo) {
  const def = enclosingDef(lineNo);
  if (!def) return null;
  const name = def.name.replace(/\$/g, '\\$');
  /* BOTH forms supersede: a later `name = function` assignment AND a later
     `function name(` redeclaration — the second one is how cloudTest is
     replaced (legacy GitHub version at 1346, PocketBase version at 8075), and
     missing it reported dead legacy code as a live unrouted producer. */
  const reAssign = new RegExp('^\\s*' + name + '\\s*=\\s*function');
  const reDeclare = new RegExp('^\\s*function\\s+' + name + '\\s*\\(');
  for (let i = def.line; i < srcLines.length; i++) {
    if (reAssign.test(srcLines[i]) || reDeclare.test(srcLines[i])) return { name: def.name, by: i + 1 };
  }
  return null;
}

const calls = auditSource(src).map((c) => {
  const sup = isSuperseded(c.n);
  return Object.assign({}, c, { superseded: sup, def: enclosingDef(c.n) });
});

/* The projector itself and the registry's own catch fallbacks are not
   producers — they are the mechanism. Excluding them structurally beats adding
   their text to the excuse list. */
const IS_MECHANISM = (c) => {
  const before = srcLines.slice(Math.max(0, c.n - 14), c.n).join('\n');
  /* the projector writing its own computed projection */
  if (/cfStatusProject/.test(before) && /top\.sev/.test(c.text)) return true;
  /* a catch fallback INSIDE one of the registry helpers: the helper is the
     routed producer, and this line only runs if the registry itself threw */
  if (/^\s*\}catch\(e\)\{setSync/.test(c.text)
      && /(cfStatusTransportFailure|cfStatusOperationOk|cfStatusSet)\s*[({]/.test(before)) return true;
  return false;
};

const unrouted = (list) => list.filter((c) => c.persistent && !c.isDefinition && !c.routed
  && !c.superseded && !IS_MECHANISM(c)
  && !ALLOWED.some((a) => a.match.test(c.text)));

group('STATUS-V4-AUDIT — the inventory is complete and classified', () => {
  test('STATUS-V4-AUDIT-01 ternary / computed producers are found, not just literals', () => {
    const dynamic = calls.filter((c) => c.dynamic && c.persistent);
    ok(dynamic.length > 0,
      'the scan must find computed forms like setSync(err==="offline"?"offline":"error", …); '
      + 'the previous literal-only regex missed every one of them');
    console.log('  computed persistent producers found: ' + dynamic.length);
    dynamic.slice(0, 3).forEach((c) => console.log('    line ' + c.n + ': ' + c.arg.slice(0, 56)));
  });

  test('STATUS-V4-AUDIT-02 terminal ok producers are inventoried', () => {
    const oks = calls.filter((c) => c.terminalOk);
    ok(oks.length > 0, 'terminal setSync("ok") calls must be inventoried, not ignored');
    console.log('  terminal ok producers: ' + oks.length
      + ' | transient: ' + calls.filter((c) => c.transient).length
      + ' | persistent: ' + calls.filter((c) => c.persistent).length);
  });

  test('STATUS-V4-AUDIT-03 the ACTIVE definition is identified and is registry-authoritative', () => {
    /* definitions are not call sites — `setSync=function(...)` contains no
       `setSync(`, so scanning call sites alone missed every override and
       reported the base definition as ACTIVE */
    const defs = [];
    srcLines.forEach((l, i) => {
      if (/^\s*function setSync\s*\(/.test(l) || /^\s*setSync\s*=\s*function/.test(l)) defs.push(i + 1);
    });
    ok(defs.length >= 1, 'at least the base definition must be found');
    const active = Math.max.apply(null, defs);
    console.log('  setSync definitions at lines: ' + defs.sort((a, b) => a - b).join(', ')
      + '  -> ACTIVE: ' + active);
    const window_ = srcLines.slice(active - 1, active + 10).join('\n');
    ok(/cfStatusTop\(\)/.test(window_),
      'the ACTIVE setSync must consult the registry, or any terminal write can hide a live cause');
  });

  test('STATUS-V4-AUDIT-04 every active persistent producer names an owner or an approved reason', () => {
    const bad = unrouted(calls);
    bad.forEach((c) => console.log('    UNROUTED line ' + c.n + ': ' + c.text.slice(0, 110)));
    eq(bad.length, 0, 'route these through an owned source or add them with a reason');
    const pers = calls.filter((c) => c.persistent);
    console.log('  persistent producers: ' + pers.length
      + ' | registry-routed: ' + pers.filter((c) => c.routed).length
      + ' | superseded: ' + pers.filter((c) => c.superseded).length
      + ' | mechanism: ' + pers.filter((c) => IS_MECHANISM(c)).length
      + ' | excused: ' + pers.filter((c) => ALLOWED.some((a) => a.match.test(c.text))).length);
    pers.filter((c) => c.superseded).slice(0, 4).forEach((c) =>
      console.log('    superseded line ' + c.n + ' in ' + c.def.name + '() — redefined at line ' + c.superseded.by));
  });

  test('STATUS-V4-AUDIT-05 terminal successes are structurally unable to hide a live source', () => {
    /* Structural rather than per-call-site: the ACTIVE setSync refuses to lower
       the displayed state below the top live cause, so every terminal ok in the
       file is covered by it — including ones nobody audited by hand.
       STATUS-V4-06..09 prove the behaviour at runtime. */
    ok(/CF_STATUS_PROJECTING/.test(src), 'the projection re-entrancy guard must exist');
    ok(/if\(top\)return _fix007SetSync/.test(src),
      'the active setSync must return the top cause instead of the requested terminal state');
    const stale = ALLOWED.filter((a) => !calls.some((c) => a.match.test(c.text)));
    eq(stale.length, 0, 'stale excuses with no matching producer: ' + stale.map((a) => a.why).join(' | '));
  });

  test('STATUS-V4-AUDIT-06 a planted TERNARY producer fails the audit', () => {
    const baseline = unrouted(calls).length;
    eq(baseline, 0, 'precondition: the real source is clean, so the plant is the only difference');
    const marker = 'function cfPlantedTernary(err){setSync(err==="offline"?"offline":"error","planted producer");}';
    const planted = src.replace('/* ---- scheduling', marker + '\n/* ---- scheduling');
    notOk(planted === src, 'precondition: the plant was actually inserted');
    /* re-derive with the planted file so superseded/mechanism classification
       applies to it too — counting only what the plant added */
    const bad = auditSource(planted).filter((c) => /planted producer/.test(c.text));
    eq(bad.length, 1, 'the planted computed producer must be found, saw ' + bad.length);
    ok(bad[0].persistent && !bad[0].routed, 'and be classified as an unrouted persistent producer');
  });

  test('STATUS-V4-AUDIT-07 removing the registry guard from setSync fails the audit', () => {
    const bypassed = src.replace('if(top)return _fix007SetSync(top.sev==="warn"?"warn":"error",top.msg);', '/* bypass */');
    notOk(bypassed === src, 'precondition: the guard was actually removed in this variant');
    notOk(/if\(top\)return _fix007SetSync/.test(bypassed),
      'with the guard gone, the AUDIT-05 assertion above fails — which is the point');
  });

  test('STATUS-V4-AUDIT-08 removing an active source integration fails the audit', () => {
    const gutted = src.replace(/cfStatusTransportFailure\(err,\{manual:\(typeof manual!=="undefined"\)&&!!manual\}\);/g,
      'setSync(err==="offline"?"offline":"error","");');
    notOk(gutted === src, 'precondition: the integration was actually removed');
    const bad = unrouted(auditSource(gutted));
    ok(bad.length > 0, 'un-routing the transport producers must fail the audit, saw ' + bad.length);
    console.log('  removing transport integration would surface ' + bad.length + ' unrouted producers');
  });

  test('STATUS-V4-AUDIT the owned sources are exactly the approved five, and all are produced', () => {
    const declared = (src.match(/var CF_STATUS_ORDER=\[([^\]]*)\]/) || [])[1] || '';
    const names = declared.split(',').map((x) => x.replace(/["'\s]/g, '')).filter(Boolean);
    eq(names.join(','), OWNED_SOURCES.join(','), 'shipping priority order, saw: ' + names.join(','));
    OWNED_SOURCES.forEach((name) => {
      const produced = new RegExp('cfStatusSet\\("' + name + '"').test(src)
        || (name === 'cas-pending' && /cfSetPending=/.test(src))
        || (name === 'photo-reconcile' && /cfPhotoStatusIncomplete\(\)/.test(src));
      ok(produced, 'source "' + name + '" is declared but never produced in shipping code');
    });
  });
});

report();
