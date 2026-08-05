# Duplicate top-level declarations in index.html — who wins and why

Phase 0 deliverable (Architect instruction: *"detect duplicate top-level
declarations and document which implementation wins"*). Line numbers are
against build `2026-08-05.457-outliers` (`a9ee0e1`) and will drift; names and
rules will not.

The whole app is ONE classic `<script>` (958–14424), so every top-level
`function` shares one scope and hoists — **for declaration-vs-declaration
duplicates the last one wins and the earlier ones never exist at runtime, not
even for an instant.** Only *assignment* overrides (`name = function…`) create
ordering that matters at execution time.

## A. Declaration-vs-declaration (last wins; losers are dead code)

| Name | Sites (winner **bold**) | What the winner does differently |
|---|---|---|
| `cloudPush` | 1387, 10424, **12040** | fenced `m10cPush` via ownership guard (1387 = GitHub PUT; 10424 = raw pbSave) |
| `cloudPull` | 1357, **12043** | journaled `m10cPull` (1357 = wholesale local replace) |
| `autoSync` | 1397, **12046** | never consults the retired newest-date heuristic |
| `save` | 1285, **12033** | adds `m10cMarkDirty` + read-back persistence proof |
| `saveTraining` | 1224, **11047** | adds `m8MarkDirty`, offline toast, persistence proof |
| `trainingPush` | 1364, 11016, **11066** | `m8Push()` journaled protocol (11016 = raw pbSave — plausible-looking, never ran) |
| `trainingPull` | 1371, 11025, **11069** | `m8Boot→m8Pull` |
| `scheduleTrainingPush` | 1363, **11065** | debounces to `m8Push` directly — deliberately NOT via `trainingPush` |
| `cloudGet` | 1337, **10418** | PocketBase + `ownershipAmbiguous` guard |
| `cloudTest` | 1417, **13330** | PocketBase connectivity report |
| `pushDataPromise` | 1420, **13340** | fenced protocol; the 13340 comment records the `.446` raw-PATCH incident |
| `syncOn` | 1294, **10041** | PocketBase session, not GitHub token |
| `syncCfg`/`setSyncCfg` | 1291/1292, **10049/10050** | permanently-empty stubs ("GitHub is retired — make unreachability structural") |
| `myUid`/`isOwner` | 1320/1321, **10097/10098** | constant `"owner"`/`true` |
| `connectionList`/`pullConnections` | 1327/1331, **10099/10100** | `[]` / no-op |
| `genSummary`/`genNightly` | 1437/1604, **10054/10060** | coach service, not GitHub Actions |
| `openLightbox` | 7566, **14216** | adds the Edit-meal-type affordance |

**Danger noted for extraction:** any bundler that reorders by dependency graph
changes the winner silently. The Phase-1 build therefore concatenates in a
DECLARED order and treats order as semantics.

## B. Assignment chains (every layer is LIVE; deleting any changes behaviour)

| Name | Chain (decl → wrappers → final) |
|---|---|
| `render` | 8734 → 11222 → 12679 → 13569 |
| `save` | 12033 → 12672 → **`window.save` gate 14090** |
| `saveTraining` | 11047 → **`window.saveTraining` gate 14090** |
| `saveLocal`/`saveWorkout` | 1284/7893 → **gate 14090** |
| `pbLogout` | 10376 → 11230 → 12687 → 14183 (four fail-closed gates) |
| `askConfirm` | 8731 → 13580 → 14165 (pen revalidation) |
| `m10cBoot` | 12016 → 12650 → 13910 |
| `m10cPull`/`m10cPush` | 11982→12658 / 11775→12665 |
| `m10cState` | 11711 → 12145 **wrapper** — captures `origState` and delegates; BOTH layers live. (Recorded as a full replacement until 2026-08-05, when deleting 11711 broke the chain and the c23 pins caught it — the analysis was wrong, the tests were not.) |
| `photoSync` | 13666 → **13872 full replacement** (13666 dead — incl. the old deletion-inference; see docs/RETIRED-TESTS.md) |
| `idbAdd`/`idbDelete`/`idbClearAll` | decl 7412/7415/7416 (**live** under `idbAddLocal` aliases via the 13761 capture) → M8 wrappers 13763+ (**dead**) → **M10 queue 13795+ wins** |

**The `window[name]` gate at 14085–14099 is the single most fragile
construct**: it resolves `save`/`saveLocal`/`saveTraining`/`saveWorkout` via
`window[name]`, which works only because classic-script top-level declarations
are window properties. Module scope silently disables the entire write gate.
Pinned by `tests/browser/c23-characterization` ("the gate is installed ON
window").

**The 13761 capture** (`var idbAddLocal=idbAdd,…`) must remain an assignment
executed before the wrappers; the file's own comment explains a declaration
would capture the wrapper and recurse. Pinned by `c23` ("no recursion").

## C. Winners that still call retired stubs (inert, but tripwires)

- `ensureIdentity()` (1324) — called at boot (14356); reads/writes the
  `syncCfg` stubs, so it is a no-op **only while the stubs exist**. Deleting
  the stubs without deleting this caller resurrects uid-minting on every boot.
- Settings renderer 8693 + handlers `invite:create` 9211, `sync:copy` 9241,
  `sync:pasteapply` 9248, `data-sync` input 9300 — all operate on the
  permanently-empty config.
- The 9239 `sync:pull` confirm still says "Pull from GitHub…" while invoking
  the fenced `cloudPull`. Stale copy; harmless; fix text when the region goes.
- `autoSync` (12046) calls `pullConnections()` — a no-op stub.

**Rule for Phase 1 (applied in P1.3):** the dead GitHub bodies AND their
callers/stubs are removed together, never half.

## D. Clean bills

No name is declared both as top-level `function` and `var`. No duplicate
top-level `var` names. No `eval`, `new Function`, or `with`.
