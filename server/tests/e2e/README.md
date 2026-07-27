# Phase 2 — client staging checklist harness

Drives the real `index.html` build in Chromium (Playwright) against the real
staging PocketBase with the CAS kit installed. **STAGING ONLY** — `harness.js`
refuses any non-loopback `APP`/`PB` target.

| File | Purpose |
| --- | --- |
| `harness.js` | Profiles, staging guard, login, network capture, screenshots |
| `suite.js` | All 75 checklist cases; records expected + actual for each |
| `retest.js` | Re-runs cases whose first setup was wrong (see CHECKLIST_RESULTS §5) |
| `retest-h5b.js` | H5 with a genuinely clean precondition |

```bash
cd server/tests/e2e
npm install playwright && npx playwright install chromium   # outside the repo
node suite.js && node retest.js && node retest-h5b.js
```

Requires `server/tests/.fixture-creds.env` from `fixtures.sh`, the client served
on `127.0.0.1:8092`, and staging PocketBase on `127.0.0.1:8091`.

Two things worth knowing before trusting a run:
1. This build tracks pending state in **revision tracks** (`revTrack(t).local > .success`),
   not `wl_dirty` — the hardened build replaces `scheduleCloudPush`/`cloudPush`/`markDirty`
   at runtime. Asserting on `wl_dirty` produces false results.
2. Several destructive paths open a confirmation dialog and an overlay intercepts
   real pointer events, so the confirm button must be dispatched directly.
