# Module map — extraction and deferment ledger (ruling 2)

Against the Architect's MODULE-MAP.md, under the amended Phase-1 contract
(one atomic artifact). Every planned target dispositioned; nothing silently
deferred.

| Target | Disposition |
|---|---|
| `domain/tdee.js` | **EXTRACTED** (`src/tdee-core.js`, `src/tdee-proposal.js` — pre-existing, now under the boundary scan) |
| MP calc (not in the map; discovered pure block) | **EXTRACTED** (`src/mp-calc.js`, 2,000 lines) |
| Report generators (feature: reports) | **EXTRACTED** (`src/report-progress.js`, `src/report-srview.js`) |
| `ui` icon primitives | **EXTRACTED** (`src/icons.js`); avatars → `assets/max/` |
| `state/store.js`, `schema.js`, `selectors.js`, `commands.js` | **DEFERRED — named hazard:** the store is `state` + the save-gate chain; the gate resolves via `window[name]` and every wrapper layer is live (DUPLICATE-DECLARATIONS §B). Splitting state from its wrappers re-orders assignment execution. Belongs after Phase 2's release mechanism, extracted WITH its wrappers as one unit. |
| `storage/local-db.js`, `photo-cache.js` | **DEFERRED — named hazard:** `idbAdd` chain depends on the 13761 capture executing between layer declarations (the file warns of infinite recursion). Extract as one unit with BLOCK-4. |
| `storage/outbox.js` | **DEFERRED to Phase 3** by the plan itself (durable outbox is a Phase-3 deliverable). Today's journals (`wl_core_ack_journal__` etc.) are the outbox and live inside the M8/M10 blocks. |
| `sync/api-client.js`, `auth.js`, `sync-engine.js`, `conflict-policy.js`, `photo-sync.js` | **DEFERRED — named hazard:** these are the M8/M10 blocks (10,435–14,208-era), the region where all 21 shadowings and every wrapper chain live. The Phase-0 pins (c23) exist precisely to make their later extraction safe. Extracting them under a no-behaviour-change constraint in the same phase that established the pins would be the highest-risk possible ordering. |
| `bridge/*` | **DEFERRED to Phase 5** by the plan (native bridge). The current Health-import region is small and entangled with the mailbox writes. |
| `features/*` views | **DEFERRED:** views read `state` directly today; they follow the store extraction, not precede it (map's own dependency rule: features call commands/selectors). |
| `ui/components, sheets, toast, formatting` | **DEFERRED** with views. |
| `styles/*` | **DEFERRED to Phase 2** (the CSS bundle decision arrives with the release mechanism; the ruling accepted one atomic artifact for now). |
| `pwa/register-sw.js`, `sw.js`, `public/manifest` | **Phase 2 by definition.** |
| `main.js` / `app-router.js` | **LAST per the map's own extraction order** (#9: "Router and boot sequence last"). |

Summary: 6 modules + 13 assets extracted; everything else deferred with a
named hazard or an explicit phase assignment from the Architect's own plan.
The extraction ORDER followed the map's §"Extraction order" items 1, 4, 7
(utilities-as-data, pure domain, shared primitives); items 2/3/5/6/8/9 are the
deferred rows above.
