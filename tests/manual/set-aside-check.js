/* Manual production-readiness confirmation of the set-aside inventory /
   export / delete flow (Architect spec §5, "one manual confirmation").

   This exists so a person can confirm the HUMAN-VISIBLE behaviour without
   touching real health data. It serves the REAL shipping index.html on
   127.0.0.1 and seeds one set-aside record containing obviously fake data.

   Because it runs on its own origin (127.0.0.1:<port>), its localStorage is
   completely separate from the real app. Nothing here can see, change or
   delete an athlete's actual data.

   usage:  node tests/manual/set-aside-check.js
   then open the URL it prints.
*/
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.PORT || 8123);

/* Unmistakably fake. If any of this appears in an export, it came from here. */
const STAMP = '1700000000000';
const CORE = JSON.stringify({
  settings: { onboarded: true, name: 'SET-ASIDE DEMO', theme: 'dark',
    startingWeight: 88, goalWeight: 80, units: 'kg' },
  weights: [
    { date: '2026-01-11', weight: 88.8 },
    { date: '2026-01-12', weight: 88.2 },
    { date: '2026-01-13', weight: 87.9 },
  ],
  notes: { '2026-01-13': 'DEMO ONLY — not real data' },
  steps: { '2026-01-13': 12345 },
});
const TRAINING = JSON.stringify({ plan: 'DEMO upper/lower', sessions: [1, 2, 3] });
const WORKOUT = JSON.stringify({ draft: true, name: 'DEMO workout in progress' });

const SEED = `<!doctype html><meta charset="utf-8">
<title>Seeding set-aside demo…</title>
<body style="font:16px system-ui;padding:40px;background:#0e1013;color:#e9edf2">
<p>Seeding a demo set-aside record…</p>
<script>
try {
  localStorage.clear();
  var stamp = ${JSON.stringify(STAMP)};
  localStorage.setItem('cf:quarantine:' + stamp + ':core', ${JSON.stringify(CORE)});
  localStorage.setItem('cf:quarantine:' + stamp + ':training', ${JSON.stringify(TRAINING)});
  localStorage.setItem('cf:quarantine:' + stamp + ':workout', ${JSON.stringify(WORKOUT)});
  /* manifest LAST — its presence is what certifies a complete set, exactly as
     the app itself writes it */
  localStorage.setItem('cf:quarantine:' + stamp + ':manifest', JSON.stringify({
    stamp: stamp, createdAt: Date.now(), appBuild: 'manual-check',
    keys: ['core', 'training', 'workout'],
    sizes: { core: ${CORE.length}, training: ${TRAINING.length}, workout: ${WORKOUT.length} }
  }));
  location.replace('/index.html');
} catch (e) {
  document.body.innerHTML = '<p style="color:#F26D5B">Could not seed: ' + e.message + '</p>';
}
</script>`;

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/' || url === '/seed') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(SEED);
    return;
  }
  const file = path.join(ROOT, path.normalize(url).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  const type = path.extname(file) === '.html' ? 'text/html; charset=utf-8' : 'text/plain';
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`
  Set-aside manual confirmation
  ─────────────────────────────────────────────────────────────
  Open this in a browser:

      http://127.0.0.1:${PORT}/

  It seeds ONE fake set-aside record and loads the real app.
  Your real data is untouched — this is a separate origin.

  What to confirm (four things):

   1  You see a heading "Data set aside on this device", with a date,
      and two buttons: "Save a copy" and "Delete".

   2  Click "Save a copy". It must ASK FIRST — "This file contains private
      health data - weight, nutrition, medication and training history.
      Save a copy to this device's files?" with a "Save the file" button.
      Confirm it. A file named compound-set-aside-....json downloads.
      Open it: it should contain "SET-ASIDE DEMO" and weights 88.8, 88.2,
      87.9, plus "training" and "workoutDraft" sections.

   3  Click "Delete". It must ASK FIRST ("Delete this set-aside data from
      the device? This can't be undone."). Press Cancel — the entry must
      still be listed.

   4  Click "Delete" again and confirm. The entry disappears from the list
      and you see "Deleted".

  Then tell me what you saw for each of the four. Ctrl+C to stop.
  ─────────────────────────────────────────────────────────────
`);
});
