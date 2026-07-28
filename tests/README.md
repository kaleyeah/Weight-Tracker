# Tests (dev-only)

Not shipped. Production stays a single framework-free `index.html`.

    node tests/run-all.js

Tests slice the `@testable-start NAME ... @testable-end NAME` blocks out of
`index.html` and evaluate them, so they run against the **real shipping source**
rather than a copy that can drift.

Flows needing a real browser (IndexedDB, two-user login, session expiry) are in
`MANUAL_CHECKLIST_COMMIT1.md` — the 58-case gate for the hardening commits
(`MANUAL_CHECKLIST.md` is the older M1–M4 list, retained for history).

## Browser tests (real Chromium)

    node tests/browser/conflict-center.browser.test.js     # 32 assertions
    node tests/browser/shots.js <outdir>                   # screenshots of every state

These boot the **shipping `index.html`** over `http://127.0.0.1` in real
Chromium via Playwright and drive the app's own globals and DOM. localhost
rather than `file://` because Web Locks and `crypto.subtle` need a secure
context, and testing the app on an origin where those are missing would prove
nothing about the app the athlete runs.

They exist because the string suites cannot see the things that broke here:
focus order, whether a live region re-announces on every repaint, whether a
disabled control can still be activated, whether a label truncates at 390px —
and whether the screen is reachable at all. Commit 10's conflict centre passed
891 string assertions while having no entry point in the app.

`tests/browser/harness.js` is a separate, async-aware harness. `tests/harness.js`
deliberately **refuses** a promise-returning callback, because in that suite an
async failure would be silently swallowed; the browser suite awaits every test
instead, so the property that harness protects is preserved rather than bypassed.

Requires Playwright at `~/staging-cas/node_modules`. Not part of `run-all.js`.
