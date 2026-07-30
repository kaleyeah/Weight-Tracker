/* STATUS-V3-09/10 — every PERSISTENT status producer is accounted for.

   Architect: "No persistent shipping error path bypasses the source registry"
   and "Static/runtime audit names every persistent producer and its source."

   The browser suites prove the important paths behave. This is the sweep that
   catches the one nobody drove: it reads the SHIPPING source, finds every call
   that leaves a persistent failure state behind, and requires each to be either
   routed through an owned source or explicitly listed here with a reason.

   A new unrouted producer therefore fails the build rather than quietly
   reintroducing the shared last-writer-wins state this model exists to end. */
const fs = require('fs');
const path = require('path');
const { test, group, eq, ok, notOk, report } = require('./harness');

const SRC = path.join(__dirname, '..', 'index.html');
const src = fs.readFileSync(SRC, 'utf8');
const lines = src.split('\n');

/* Only the SHIPPING script matters; the CSS and markup above it cannot set
   status. Anything after the last </script> is markup too. */
const OWNED_SOURCES = ['auth', 'cas-network', 'legacy-manual', 'cas-pending', 'photo-reconcile'];

/* A persistent failure state is one of these; "saving"/"syncing" are transient
   progress that clears itself and is explicitly out of scope per the ruling. */
const PERSISTENT = /setSync\(\s*"(error|offline)"/;

/* Producers that are deliberately NOT registry-owned, each with the reason.
   These are account/ownership conditions that the ownership GATE renders as a
   full screen — the athlete is not looking at the status line at all, and
   routing them to a status source would put a second, quieter copy of the same
   message somewhere it cannot be acted on. */
const ALLOWED = [
  { match: /this device holds another account/, why: 'ownership gate renders this as a full screen (cfBlockedHTML mismatch case)' },
  { match: /is this your data\? — needs your answer/, why: 'ownership gate renders this as a full screen (unclaimed case)' },
  { match: /unsynced changes — needs your decision/, why: 'pre-CAS conflict surface; superseded by the conflict centre, kept for the legacy path' },
  { match: /unsynced changes — not yet reconciled/, why: 'same pre-CAS conflict surface' },
  { match: /changes in two places — needs your decision/, why: 'same pre-CAS conflict surface' },
  { match: /couldn.t save a previous copy/, why: 'recovery-first failure: the conflict centre owns this workflow and shows it in place' },
  { match: /photo list incomplete/, why: 'unreachable fallback inside the photo source\'s own catch (cfPhotoStatusIncomplete)' },
  { match: /changes in two places — not yet resolved/, why: 'conflict surface: the conflict centre owns this decision and shows it in place' },
  { match: /changes arrived while syncing — nothing was replaced/, why: 'recovery-first outcome shown by the conflict centre in place' },
  { match: /aren.t uploaded yet — tap to upload/, why: 'SUPERSEDED cfSetPending definition; the active override owns cas-pending (append-and-override)' },
];

group('STATUS-V3-09/10 — the persistent-producer audit', () => {
  const found = [];
  lines.forEach((line, i) => {
    if (!PERSISTENT.test(line)) return;
    found.push({ n: i + 1, text: line.trim() });
  });

  test('STATUS-V3-10 the audit finds producers at all (it is not vacuously empty)', () => {
    ok(found.length > 0, 'the scan must actually find setSync("error"/"offline") calls');
    console.log('  persistent status producers in the shipping source: ' + found.length);
  });

  /* A line that ALSO calls an owned-source API is routed: the setSync on it is
     the catch fallback for when the registry itself is unavailable. Recognising
     that structurally beats bolting another string onto ALLOWED every time a
     producer is correctly converted. */
  const ROUTED = /cfStatusSet\(|cfStatusTransportFailure\(|cfSetPending\(|cfPhotoStatus(Incomplete|Complete)\(/;

  test('STATUS-V3-09 every persistent producer is registry-owned or explicitly excused', () => {
    const unexplained = found.filter((f) => !ROUTED.test(f.text) && !ALLOWED.some((a) => a.match.test(f.text)));
    unexplained.forEach((f) => console.log('    UNROUTED line ' + f.n + ': ' + f.text.slice(0, 120)));
    eq(unexplained.length, 0,
      'these persistent producers neither use an owned source nor appear in the excused list — '
      + 'route them through cfStatusSet/cfStatusTransportFailure, or add them with a reason');
  });

  test('STATUS-V3-10 the inventory names each excused producer and its reason', () => {
    console.log('  excused producers (deliberately not status sources):');
    ALLOWED.forEach((a) => {
      const hits = found.filter((f) => a.match.test(f.text)).length;
      console.log('    ' + (hits ? hits + '×' : 'none') + '  ' + a.why);
    });
    /* an excuse for something that no longer exists is stale scaffolding */
    const routed = found.filter((f) => ROUTED.test(f.text));
    console.log('  registry-routed producers (setSync present only as a catch fallback): ' + routed.length);
    const stale = ALLOWED.filter((a) => !found.some((f) => a.match.test(f.text)));
    eq(stale.length, 0, 'excuses with no matching producer left behind: '
      + stale.map((a) => a.why).join(' | '));
  });

  test('STATUS-V3-09 the owned sources are exactly the approved five', () => {
    const declared = (src.match(/var CF_STATUS_ORDER=\[([^\]]*)\]/) || [])[1] || '';
    const names = declared.split(',').map((x) => x.replace(/["'\s]/g, '')).filter(Boolean);
    eq(names.join(','), OWNED_SOURCES.join(','),
      'the shipping priority order must be the approved one, saw: ' + names.join(','));
  });

  test('STATUS-V3-09 every owned source is actually produced somewhere in shipping code', () => {
    OWNED_SOURCES.forEach((name) => {
      /* the producer call, not the declaration or the severity table */
      const produced = new RegExp('cfStatusSet\\("' + name + '"').test(src)
        || (name === 'cas-pending' && /cfSetPending=/.test(src))
        || (name === 'photo-reconcile' && /cfPhotoStatusIncomplete\(\)/.test(src));
      ok(produced, 'source "' + name + '" is declared but nothing in shipping code creates it');
    });
  });
});

report();
