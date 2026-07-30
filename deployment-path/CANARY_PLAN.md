# Canary plan — one consenting athlete on the release candidate

Product Owner authorization: given 2026-07-30 (Griffin, the PO, as the
consenting athlete — briefed during the account walkthrough). Per the standing
rule, **nothing is published until the Product Architect approves this plan.**

## Objective

The release candidate `2026-07-29.348-pb-c10` (sha
`9e45a225a5ea663c23e88340916689ac77fc8d0796ef48f342b06195adab4256`) runs on a
real iPhone, against the athlete's real production data, through real
CAS-route syncs, before it is offered to the root path. This is also the only
honest verification of the iOS Safari standalone path, which the Chromium
evidence deliberately does not claim to cover (CACHE_SW_ANALYSIS.md §"One
thing this analysis does NOT cover").

## Mechanism

1. Build the artifact with the approved pipeline — `build-release.mjs`, then
   `select-artifact.mjs --copy-to` (never a hand-picked file). The lock,
   manifest and hash gates all apply.
2. Publish the selected artifact at a **same-origin canary path** on the
   GitHub Pages branch (proposed: `/canary/index.html`). The root
   `index.html` (`.347-pb`) is not touched.
3. Verify the served canary bytes: fetch until the CDN serves sha
   `9e45a225…`, byte count 1,187,105.
4. The athlete opens the canary URL on the iPhone and signs in. Preferred
   access mode: **add the canary as a second home-screen app** (separate
   icon, separate storage, fresh login). The existing home-screen app is
   **never removed or re-added** — that wipes local data and is prohibited.
5. Smoke checklist (PO on the phone, engineer watching the server):
   - sign-in works; existing data appears after first sync;
   - add a weigh-in; confirm it lands (appdata revs advance, ledger rows
     appear for the athlete — the CAS route writes one per commit);
   - background/foreground the app; no reload loop, no update banner unless
     the CDN is genuinely behind;
   - set-aside path: make a conflicting edit from the old client
     (root/installed app) and confirm the canary dispositions it safely.
6. Trial window: normal use, duration at the Architect's discretion
   (proposal: 48 hours).
7. Monitoring during the window: ledger attribution and rev progression for
   the canary athlete only; the second athlete's row must be driven solely by
   their own live use (bridge writes, zero ledger rows — same attribution
   method the HOTFIX-001 record established).

## Why this is safe — every claim already has evidence

- **No service worker, no Cache API, single document** (CSW-01/02/04): the
  canary cannot take over the root scope; there is no scope.
- **Build-pull isolation** (CSW-V2-02/04): each client's update probe fetches
  its OWN pathname — the root client can never pull the canary build, nor
  vice versa.
- **Storage**: on iOS, the second home-screen install has its own storage;
  even in the shared-storage worst case (same browsing context), upgrade,
  rollback and alternation are proven safe both directions (CSW-05/06/07) —
  unknown keys are ignored, not deleted.
- **Server**: no server change is part of this canary (ADR-0012). The legacy
  bridge and the CAS route are both live and proven correct concurrently;
  HOTFIX-001 protects the canary's retries; I5d closed cross-user key
  independence on production itself.
- **Reload behaviour**: exactly one auto-reload per new version, banner on
  CDN lag, no loops (CSW-V2-05/06).

## Rollback

Delete the canary path from the Pages branch (or replace it with the `.347`
artifact — recorded by hash in the build manifest). The root client is
untouched throughout, so rollback affects only the canary URL. The athlete's
data lives on the server; the canary's local storage is disposable. The
installed root app continues working at all times. **No step ever asks the
athlete to remove the root home-screen app.**

## Success criteria (proposed, for the Architect to amend)

- All smoke-checklist items pass on day one;
- 48h of normal use: no data loss, no failed syncs that HOTFIX-001-style
  retries don't recover, no reload loops, no set-aside surprises;
- ledger + rev attribution stays clean for both athletes;
- then: final cutover package → Architect release authorization → PO root
  deployment authorization.

## Decisions requested from the Architect

1. Approve or amend the canary path (`/canary/`).
2. Approve or amend the trial duration (48h proposed).
3. Approve the second-home-screen-app access mode.
4. Confirm the smoke checklist is sufficient, or extend it.
