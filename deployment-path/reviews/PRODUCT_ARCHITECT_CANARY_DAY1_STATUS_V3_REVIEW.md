# Product Architect Review — Canary Day 1 Status V3

**Package:** `cf-canary-day1-status-v3-20260730.zip`  
**Review type:** Status ownership integration, convergence, warning rendering, diagnostics, and canary-restart request  
**Verdict:** **CHANGES REQUIRED — REAL PRODUCER INTEGRATION APPROVED; CROSS-SOURCE SUCCESS OVERWRITES AND AUDIT COVERAGE REMAIN**

This review does not authorize republishing `/canary/`, production-root deployment, bridge removal, minimum-client-build enforcement, or P7 lockdown.

---

# Executive ruling

The V3 package materially improves the shipping status architecture.

Approved:

- the priority order is now:
  - `auth`
  - `cas-network`
  - `legacy-manual`
  - `cas-pending`
  - `photo-reconcile`;
- ordinary pending is amber and uses:
  > Saved on this device. Waiting to sync.
- network/auth/manual failures are red;
- photo reconciliation remains a separate amber warning;
- `warn` now has a real label, CSS state, dot state, detail color, and accessible name;
- convergence is no longer driven by generic `setLastSync()` wrapping;
- named commit/save/manual-upload/bootstrap completions invoke the shared proof rule;
- real auth, CAS-network, and manual-failure paths are exercised;
- diagnostic output is limited to state, revisions, lengths, booleans, and approved source names;
- the browser runner now times out a hung child rather than hanging indefinitely;
- the exact packaged candidate is internally consistent:
  - build `2026-07-30.352-pb-c10`
  - SHA-256 `9e7ee78da6704e4fed5c44304485c185a65cfa8afbd227f505fc618c8c05b82c`
  - 1,205,531 bytes.

The package reports green status, photo, browser-runner, release-pipeline, and full string-suite evidence.

However, the source-ownership contract is not yet complete.

Two real cross-source overwrite paths remain:

1. a successful manual operation clears `cas-network`, even though it owns only `legacy-manual`;
2. direct legacy `setSync("ok")`/terminal writes can visually replace the projected registry state without clearing the underlying source.

The static producer audit also does not find every persistent producer it claims to inventory, because it scans only literal:

```js
setSync("error"...)
setSync("offline"...)
```

and misses ternary/dynamic forms such as:

```js
setSync(err==="offline"?"offline":"error", ...)
```

Finally, the supplied screenshots do not visibly demonstrate the status states; they show the onboarding screen.

Therefore `.352` is not approved for canary republish.

---

# 1. Priority and severity

## Ruling: APPROVED

The shipping order:

```js
["auth","cas-network","legacy-manual","cas-pending","photo-reconcile"]
```

matches the Product Architect ruling.

Approved severity:

- auth: red;
- CAS network failure: red;
- manual/restore failure: red;
- ordinary pending: amber;
- photo reconciliation warning: amber.

Approved wording:

- auth:
  > Sign in to sync.
- network:
  > Couldn’t sync — changes are safe here.
- pending:
  > Saved on this device. Waiting to sync.
- photo:
  > Photo sync couldn’t be fully checked. Nothing was removed.

No priority or wording redesign is required.

---

# 2. Warning rendering

## Ruling: IMPLEMENTATION APPROVED; VISUAL EVIDENCE MUST BE REPLACED

The artifact now defines:

- `warn` in `syncLabel()`;
- amber warning dot behavior;
- `.wl-sync.warn`;
- an accessible name derived from the owning status message.

That closes the code defect from V2.

## Evidence defect

The six screenshots described as rendered status states show the onboarding page and do not visibly show:

- the header status control;
- the settings/detail status label;
- amber versus red;
- the owning message;
- warning focus or accessibility state.

The screenshots therefore do not prove the rendering claims they are named for.

## Required screenshots

Provide actual visible screenshots for:

- Synced;
- pending amber;
- photo-warning amber;
- network red;
- auth red;
- red source outranking amber.

For each state include:

- header status control;
- settings/detail status surface;
- visible label/message;
- mobile viewport;
- one desktop viewport;
- accessible-name dump or browser accessibility snapshot.

Add:

- **STATUS-V4-VIS-01:** Pending is visibly amber with safe-local wording.
- **STATUS-V4-VIS-02:** Photo warning is visibly amber and distinct from pending.
- **STATUS-V4-VIS-03:** Network failure is visibly red.
- **STATUS-V4-VIS-04:** Auth failure is visibly red.
- **STATUS-V4-VIS-05:** Red source visibly outranks amber source.
- **STATUS-V4-VIS-06:** Settings/detail and header communicate the same top source.

---

# 3. Required correction STATUS-V4-01 — a success may clear only its own source

## Defect

The shipping helper is:

```js
function cfStatusTransportOk(opts){
  cfStatusClearSource("cas-network");
  if(opts&&opts.manual)cfStatusClearSource("legacy-manual");
}
```

A successful manual upload invokes:

```js
cfStatusTransportOk({manual:true})
```

and therefore clears:

- `legacy-manual`;
- **and `cas-network`**.

That violates the structural ownership rule.

A successful manual reconcile does not prove that an independently failed CAS request recovered.

The current `STATUS-V3-06` test plants only an unrelated photo warning. It does not plant a live `cas-network` failure, so this defect passes.

## Required behavior

A successful operation clears only the source owned by that operation.

Examples:

- successful CAS retry/commit clears `cas-network`;
- successful manual upload/restore clears `legacy-manual`;
- successful reauthentication clears `auth`;
- complete photo enumeration clears `photo-reconcile`;
- convergence clears `cas-pending`.

Do not use one generic “transport OK” function that always clears `cas-network`.

Claude may use:

- an explicit source argument;
- operation-specific success helpers;
- another structurally owned mechanism.

## Required tests

- **STATUS-V4-01:** Real successful manual upload clears `legacy-manual` but preserves a live `cas-network`.
- **STATUS-V4-02:** Real successful CAS commit clears `cas-network` but preserves `legacy-manual`.
- **STATUS-V4-03:** Reauthentication clears `auth` only.
- **STATUS-V4-04:** Photo completion clears `photo-reconcile` only.
- **STATUS-V4-05:** No generic success path clears two unrelated sources.

These tests must drive the real application operation, not call the clearing helper directly.

---

# 4. Required correction STATUS-V4-02 — owned causes must remain visually authoritative

## Defect

The registry stores a live cause in `CF_STATUS`, then projects it into the legacy `syncState`.

But numerous existing paths still call terminal legacy UI operations directly, including forms of:

```js
setSync("ok", ...)
setSync("syncing", ...)
setSync(err==="offline"?"offline":"error", ...)
```

A direct successful unrelated operation can change `syncState` to `ok` while:

- `auth`;
- `cas-network`;
- `legacy-manual`;
- `cas-pending`;
- or `photo-reconcile`

remains live in `CF_STATUS`.

The registry cause is not deleted, but the athlete-facing legacy detail can temporarily say Synced/Connected until another projection occurs.

This is still a last-writer-wins presentation race.

## Required behavior

When one or more owned persistent causes exist:

- terminal unrelated `ok`/offline/error writes must not hide the top source;
- transient saving/syncing may be shown only according to an explicit product rule and must return to the top source afterward;
- header and detail must always agree on the top persistent cause;
- a successful operation that owns no current source must not project global Synced.

Claude decides whether to:

- centralize final projection in `setSync`;
- replace remaining terminal callers;
- add an operation-aware rendering layer.

The product requirement is that the registry remains authoritative, not merely preserved in memory.

## Required real-path tests

- **STATUS-V4-06:** Live photo warning survives a successful unrelated pull visually and structurally.
- **STATUS-V4-07:** Live auth failure survives a successful unrelated operational save.
- **STATUS-V4-08:** Live manual failure survives a successful CAS commit.
- **STATUS-V4-09:** Live network failure survives a successful manual reconcile.
- **STATUS-V4-10:** After transient syncing ends, the previous top cause is restored.
- **STATUS-V4-11:** Header and settings/detail never disagree on the top source.
- **STATUS-V4-12:** With no live source and no dirty work, successful completion may show Synced.

Use MutationObserver or state snapshots through the operation, not only the final registry object.

---

# 5. Required correction STATUS-V4-03 — expand the persistent-producer audit

## Evidence defect

`status-producers.test.js` scans with:

```js
/setSync\(\s*"(error|offline)"/
```

That finds only literal first arguments.

It misses shipping forms such as:

```js
setSync(err==="offline"?"offline":"error", ...)
```

and any variable/computed persistent state.

The package therefore cannot claim that every persistent producer is inventoried.

It also audits only failure producers, not terminal `setSync("ok")` calls capable of visually hiding a live owned cause.

## Required audit

Use an AST-based scan or a deliberately broader maintained inventory.

The audit must identify:

- literal persistent failure calls;
- ternary/computed calls that can yield `error` or `offline`;
- terminal `ok` calls;
- transient `saving/syncing` calls;
- whether each call is active, superseded, conflict-surface-owned, or source-routed;
- the specific owned source or explicit reason.

Required:

- no stale excuses;
- no line-text-only excuse that accidentally matches multiple unrelated paths;
- active override/call-site identity included where append-and-override makes source order relevant.

Add:

- **STATUS-V4-AUDIT-01:** Ternary error/offline producers are found.
- **STATUS-V4-AUDIT-02:** Terminal `ok` producers are inventoried.
- **STATUS-V4-AUDIT-03:** Active versus superseded definitions are distinguished.
- **STATUS-V4-AUDIT-04:** Every active persistent producer names an owner or an approved full-screen/conflict owner.
- **STATUS-V4-AUDIT-05:** Every active terminal success proves it cannot hide a live owned source.
- **STATUS-V4-AUDIT-06:** A planted ternary producer fails the audit.
- **STATUS-V4-AUDIT-07:** A planted direct `setSync("ok")` bypass fails the audit.
- **STATUS-V4-AUDIT-08:** Removing an active source integration fails the audit.

The current five audit assertions remain useful but are not complete.

---

# 6. Convergence

## Ruling: APPROVED IN DIRECTION

The generic `setLastSync()` wrapper is gone.

Named convergence call sites exist for:

- commit;
- save;
- manual upload;
- bootstrap/reconcile.

The proof rule is conservative:

- no operation;
- no block;
- no unresolved conflict;
- no dirty subsystem;
- local content matches trusted baseline where a baseline exists.

The path performs no network request and no snapshot mutation.

`STATUS-V3-25..30` support the intended behavior.

## Required carry-forward test

Add one combined real-device-shaped startup case:

- stale `cas-pending`;
- no commit in this session;
- successful bootstrap establishes baselines;
- convergence clears pending;
- a concurrent unrelated warning remains visible.

Name:

- **STATUS-V4-13:** Bootstrap convergence clears only stale pending and reveals the next live source.

This is the closest automated model to the original iPhone shape and should remain in the canary release suite.

---

# 7. Diagnostics

## Ruling: APPROVED IN DIRECTION

The exact `cfDiag()` output contains:

- build/path;
- signed-in and UID-presence flags;
- source names and top source/severity;
- revision trackers;
- dirty/block/operation/conflict states;
- canonical lengths and equality booleans;
- account verdict and blocked state.

It does not emit:

- raw payloads;
- notes;
- training/workout values;
- token;
- email;
- account ID;
- idempotency key;
- recovery artifact ID;
- payload hash;
- canonical string.

`DIAG-V2-01..08` are accepted as useful evidence.

## Documentation correction

The source comment says canonical forms include “a short digest prefix.”

The actual output includes lengths and equality only; no digest prefix is present.

Update the comment so documentation matches the implementation.

Do not add a digest merely to make the comment true.

---

# 8. Browser harness and suite health

## Ruling: APPROVED

Accepted:

- `BHARNESS-08e` hanging-child timeout;
- browser runner fails rather than hanging;
- full 13-suite browser runner passes;
- photo-status suite passes;
- release pipeline reports 65 passing assertions;
- mandatory `RELEASE.expected.json` tests carry forward.

The package’s `RUN-ALL.txt` reports `deploy-rc.test.js` as `0 passed` because that suite is environment-gated in the general string runner. The dedicated release-pipeline log supplies the authoritative 65-case evidence.

Document that distinction in the final package to avoid presenting “0 passed” as pipeline coverage.

---

# 9. Candidate `.352`

## Current ruling: NOT APPROVED FOR CANARY REPUBLISH

The candidate identity is internally consistent:

```text
build   2026-07-30.352-pb-c10
sha256  9e7ee78da6704e4fed5c44304485c185a65cfa8afbd227f505fc618c8c05b82c
bytes   1,205,531
```

The exact artifact is present and hashed correctly.

Republish is withheld because:

- cross-source success clearing is still incorrect;
- direct legacy terminal writes can hide live registry causes;
- the producer audit is incomplete;
- visual status screenshots do not show the status UI.

These corrections will change the candidate. Use the next build identifier.

Keep:

- root `.347`;
- canary `.349`;
- 48-hour clock not started.

---

# 10. Required next package

Return:

```text
cf-canary-day1-status-v4-YYYYMMDD.zip
├── 00-PROMPT.md
├── PROJECT_STATUS.md
├── STATUS_MODEL.md
├── FIX.diff
├── artifact/
│   ├── index.html
│   ├── index.html.sha256
│   ├── manifest.json
│   ├── RELEASE.expected.json
│   └── PUBLISHED.json
├── source/
│   ├── success-source ownership
│   ├── authoritative projection integration
│   ├── convergence call sites
│   └── corrected diagnostics comment
├── tests/
│   ├── real-path status ownership
│   ├── expanded producer/success audit
│   ├── status rendering browser tests
│   └── diagnostics tests
└── evidence/
    ├── STATUS-V4-01..13
    ├── STATUS-V4-AUDIT-01..08
    ├── STATUS-V4-VIS-01..06
    ├── real visible screenshots
    ├── full browser runner
    ├── full regression
    ├── release pipeline
    └── served root/canary hashes
```

---

# 11. Canary restart ruling

## Current status: NOT AUTHORIZED

The Product Architect accepts:

> known paths are closed; exact original cause was not reproduced

as an honest canary standard.

Restart is withheld because the source registry can still be bypassed or hidden by successful unrelated operations.

After V4 approval:

- republish `/canary/` only;
- restart at `CANARY-01`;
- perform the required on-device Cancel step;
- capture `cfDiag()` immediately if an unexpected state appears;
- start the 48-hour clock only after all day-one cases pass.

---

# Final verdict

## **PRIORITY, WARNING RENDERER, CONVERGENCE, AND DIAGNOSTIC DIRECTION APPROVED**

## **REAL FAILURE PRODUCERS ARE MATERIALLY IMPROVED**

## **`.352` CANARY REPUBLISH NOT AUTHORIZED**

Make success clearing source-specific, keep the owned registry visually authoritative against terminal legacy writes, expand the producer audit, and replace the non-demonstrative screenshots before returning the next canary candidate.
