# Cache / service-worker characterisation

Written 2026-07-30. Every claim is pinned by a named runtime test in
`tests/browser/cache-sw.browser.test.js` (CSW-01..07, real Chromium) or by a
measured HTTP response, not by reading source.

## The central finding

**There is no service worker and no Cache API — in the release candidate or the
live client.** Both are one HTML document with every asset inline: the web-app
manifest is a `data:` URI injected at runtime (CSW-04), the coach avatars and
report photos are data URIs, and the only same-origin network traffic is the
document itself plus one self-fetch (below). CSW-01/01b/02/03 pin all of this at
runtime for both builds.

Several of the Architect's questions therefore dissolve rather than need
answering:

| Asked | Answer |
| --- | --- |
| Registration and scope | No registration exists. Nothing to scope. (CSW-01, CSW-01b) |
| Cache names / update behaviour | No Cache API entries exist. (CSW-02) |
| Canary path taking over the root SW scope | Impossible — there is no SW to take over anything. The real shared surface is storage; see below. |

## How the app is actually cached and updated

**HTTP layer.** GitHub Pages serves the document with `cache-control:
max-age=600` plus an etag (measured live). A browser may serve the page from
HTTP cache for up to 10 minutes, then revalidates.

**The app's own update path** — discovered by CSW-03 *failing* on first run,
which is worth recording: the test expected exactly one same-origin request and
found two. `checkForUpdate()` fetches **the app's own URL** with
`?vc=<timestamp>` and `cache: "no-store"` — bypassing the HTTP cache entirely —
extracts the served `APP_BUILD`, and if it differs from the running one:

- auto-reloads, **once per new version** (a `sessionStorage` guard prevents a
  reload loop when a CDN still serves the old build);
- if the reload did not stick, shows the "New version available" banner instead.

So an installed PWA converges on a new build at the next launch/foreground
check, regardless of the 600s HTTP window. This is the documented iOS ritual
("force-quit + reopen picks up builds") made automatic.

**Installed-PWA specifics.** iOS home-screen installation uses the
`apple-mobile-web-app-*` meta tags plus the data-URI manifest; there is no SW
requirement for standalone mode. The known iOS behaviours from the operational
notes still apply: removing/re-adding the home-screen app **wipes localStorage
and IndexedDB** — never part of any update or rollback procedure.

## Canary / root isolation — the real question is storage, not SW scope

The proposed canary is a same-origin path. Two isolation properties, one free
and one proven:

**Build-pull isolation (free, by construction).** The update check probes
`location.pathname` — its *own* path. The canary client checks the canary URL;
the root client checks the root URL. Neither can pull the other's build.
Asserted in CSW-03 and CSW-01b.

**Storage is shared, deliberately, and proven safe in both directions.** Same
origin means one `localStorage`/IndexedDB. That is not a defect to engineer
away — it is what makes the canary meaningful, because the canary athlete runs
the new client against their real data. What must therefore hold:

- **CSW-05 (upgrade):** the RC boots on storage written by `.347`; weigh-ins,
  notes and settings intact. Payload field sets are identical between builds
  (verified in the reconciliation), so there is no migration step.
- **CSW-06 (rollback):** `.347` boots on storage written by the RC — including
  keys it has never seen (`cf:casneed:*`, `cf:casrec:*`). Data intact, and the
  unknown keys are **ignored, not deleted**: the storage key set is
  byte-identical after the rollback boot, so returning to the RC later finds
  its CAS state where it left it.
- **CSW-07 (alternation):** canary → root → canary corrupts nothing and loses
  no durable CAS state. This is the canary athlete's actual exposure if they
  ever open the root URL mid-trial.

## Mixed-build prevention

A single-file client cannot skew against its own assets — there are none. The
remaining mixed-build risks and their status:

1. **Old HTML from HTTP cache after a root deploy** — bounded at 10 minutes by
   `max-age=600`, then closed by the self-check's `no-store` probe at next
   launch. During that window the athlete runs the *previous complete build*,
   never a mixture.
2. **Two builds against one storage** — exactly the canary situation; proven
   safe both directions (CSW-05/06/07).
3. **Two builds against one server** — the server keeps the legacy bridge
   active while any `.347` client remains, and HOTFIX-001 is already live, so
   both write paths are correct concurrently. This is the existing approved
   bridge-window design.

## Rollback cache behaviour

Rolling back the root is deploying the previous artifact (recorded in the build
manifest with its hash: `bb41dab4…`). The same two mechanisms govern
convergence: at most 10 minutes of HTTP cache, then the self-check sees the
older `APP_BUILD` differs and reloads onto it. CSW-06 proves the rolled-back
client is safe on the newer client's storage. **No cache purge exists or is
needed; no step may ever ask the athlete to reinstall the PWA** (that deletes
their local data).

## One thing this analysis does NOT cover

All runtime evidence is Chromium. iOS Safari standalone mode is asserted here
from the documented operational behaviour, not from an automated test — there is
no iOS automation in this environment. The canary trial itself is the honest
verification of the iOS path, which is one more reason it should precede the
root deploy.
