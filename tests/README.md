# Tests (dev-only)

Not shipped. Production stays a single framework-free `index.html`.

    node tests/run-all.js

Tests slice the `@testable-start NAME ... @testable-end NAME` blocks out of
`index.html` and evaluate them, so they run against the **real shipping source**
rather than a copy that can drift.

Flows needing a real browser (IndexedDB, two-user login, session expiry) are in
`MANUAL_CHECKLIST.md`.
