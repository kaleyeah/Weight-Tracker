# Product Architect Review — Canary Day 1 Status V2 / FIX-005

**Package:** `cf-canary-day1-status-v2-20260730.zip`  
**Review type:** Status ownership, pull/bootstrap convergence, photo warning separation, diagnostics, and second canary-restart request  
**Verdict:** **CHANGES REQUIRED — STATUS MODEL APPROVED IN CONCEPT; SHIPPING SOURCE OWNERSHIP AND PRIORITY ARE INCOMPLETE**

This review does not authorize republishing `/canary/`, production-root deployment, bridge removal, minimum-client-build enforcement, or P7 lockdown.

---

# Executive ruling

The package is honest about the canary incident:

> The original red state was not reproduced or conclusively attributed.

That disclosure is accepted.

The Product Architect does **not** require the exact historical red state to be reproduced before another controlled canary attempt, provided that:

- every reachable status producer is structurally owned;
- stale CAS pending state can clear only through approved convergence proof;
- unrelated warnings cannot be erased;
- diagnostic output can identify the owning source if the state returns;
- the exact candidate and evidence are complete.

The proposed model is the right direction:

- sources own their own status entries;
- clearing one source reveals the next;
- photo enumeration failure is amber and separate from core/training upload;
- convergence can clear a stale CAS-pending marker without a network write;
- `cfDiag()` avoids raw athlete payloads.

However, the shipping artifact does not yet implement the model it describes.

The new registry is used by:

- `cas-pending`;
- `photo-reconcile`.

It is **not** used by the actual shipping producers for:

- `auth`;
- `cas-network`;
- `legacy-manual`.

Those paths still call the old global `setSync(...)` directly.

The tests for those three sources manually call `cfStatusSet(...)`, so they prove the registry primitive, not that the real application paths use it.

Two additional product/rendering defects remain:

1. the priority order lets amber `photo-reconcile` outrank red `legacy-manual`;
2. `setSync("warn", ...)` is not fully supported by the legacy label/detail renderer or CSS.

Therefore `.351-pb-c10` is not approved for canary republish.

---

# 1. Product model

## Ruling: APPROVED IN CONCEPT

The status registry should remain.

Approved source categories:

- `auth`;
- `cas-network`;
- `cas-pending`;
- `legacy-manual`;
- `photo-reconcile`.

Approved ownership rule:

> A source may set and clear only its own entry.

Approved projection rule:

> The athlete sees the highest-priority live cause; clearing it reveals the next live cause.

Approved photo wording:

> Photo sync couldn’t be fully checked. Nothing was removed.

Approved photo severity:

- warning/amber;
- never the red core/training upload failure;
- a successful CAS commit does not clear it;
- a later complete photo enumeration clears it.

No return to message-text matching or one global last-writer-wins status is authorized.

---

# 2. “Closed off, not reproduced”

## Product Architect ruling: SUFFICIENT IN PRINCIPLE

The exact original iPhone state does not need to be manufactured before restarting the canary.

A controlled canary can serve as the real-device validation when:

- the known stale-pending paths are closed;
- all real producers participate in ownership;
- diagnostics identify the source if it returns;
- day one begins again at `CANARY-01`;
- the Product Owner captures `cfDiag()` immediately if any unexpected red/amber state appears.

The current package does not yet meet the first two implementation conditions, so the restart remains blocked.

Do not claim that the original cause was diagnosed after these corrections. The approved wording remains:

> Known paths are closed; the exact original cause was not reproduced.

---

# 3. Required correction STATUS-V3-01 — connect every real producer to the registry

## Defect

The exact `.351` artifact contains no shipping calls such as:

```js
cfStatusSet("auth", ...)
cfStatusSet("cas-network", ...)
cfStatusSet("legacy-manual", ...)
```

outside tests/manual setup.

Actual application failures continue to call:

```js
setSync("error", ...)
setSync("offline", ...)
```

directly.

This preserves the old shared-state race.

Examples include:

- session-expiry/auth failures;
- CAS/network failures;
- explicit/manual upload or restore failures;
- older manual reconciliation paths.

A later registry projection can overwrite one of those direct errors, and a direct error can overwrite a registry-owned warning.

## Required behavior

Route all live persistent status causes through explicit source-owned APIs.

At minimum:

### Authentication

- auth/session expiry sets `auth`;
- successful reauthentication clears `auth`;
- CAS success does not clear `auth`;
- photo completion does not clear `auth`.

### CAS/network

- commit/network failure sets `cas-network`;
- successful retry or proven recovery clears `cas-network`;
- a photo warning cannot hide it;
- clearing it reveals another live source.

### Legacy/manual operations

- manual upload/restore/replace failure sets `legacy-manual`;
- only the corresponding successful/manual recovery path clears it;
- a CAS commit cannot clear it;
- a photo warning cannot outrank it.

Transient progress may remain transient, but persistent failure outcomes must become owned causes.

Do not implement this by overriding every `setSync()` call indiscriminately. Claude decides the integration structure, but the ownership source must be explicit at the producer.

## Required tests

- **STATUS-V3-01:** Real auth-expiry path creates the `auth` source.
- **STATUS-V3-02:** Successful real reauthentication clears only `auth`.
- **STATUS-V3-03:** Real CAS network failure creates `cas-network`.
- **STATUS-V3-04:** Successful retry clears only `cas-network`.
- **STATUS-V3-05:** Real manual upload/restore failure creates `legacy-manual`.
- **STATUS-V3-06:** Its corresponding successful recovery clears only `legacy-manual`.
- **STATUS-V3-07:** CAS success cannot clear auth or legacy-manual.
- **STATUS-V3-08:** Photo completion cannot clear auth, network, pending, or manual failure.
- **STATUS-V3-09:** No persistent shipping error path bypasses the source registry.
- **STATUS-V3-10:** Static/runtime audit names every persistent producer and its source.

Tests must drive the actual application paths. Direct calls to `cfStatusSet()` are supporting unit checks, not sufficient acceptance evidence.

---

# 4. Required correction STATUS-V3-02 — correct priority and severity

## Defect

The submitted priority is:

```js
["auth","cas-network","cas-pending","photo-reconcile","legacy-manual"]
```

Because `cfStatusTop()` returns the first live source, an amber photo warning can hide a red legacy/manual failure.

That contradicts the stated rule that the athlete sees the most serious live cause.

## Product decision

Use this priority:

```text
auth
cas-network
legacy-manual
cas-pending
photo-reconcile
```

Severity:

- `auth`: bad/red;
- `cas-network`: bad/red;
- `legacy-manual`: bad/red;
- `cas-pending`: warning/amber;
- `photo-reconcile`: warning/amber.

## Pending-state correction

`cas-pending` represents:

> local work is safely stored on this device and has not synchronized yet.

It is not the same as a failed network operation.

Use athlete-facing wording aligned with the approved Commit 10 status model, for example:

> Saved on this device. Waiting to sync.

When a genuine network attempt fails, `cas-network` supplies the red failure state:

> Couldn’t sync — changes are safe here.

Do not keep the obsolete:

> tap to upload

wording as the normal automatic-CAS pending state.

The explicit Sync/Retry control may remain available, but automatic sync means ordinary pending should not instruct the athlete that manual upload is required.

## Required tests

- **STATUS-V3-11:** Red manual failure outranks amber photo warning.
- **STATUS-V3-12:** Red network failure outranks pending and photo.
- **STATUS-V3-13:** Auth outranks every other source.
- **STATUS-V3-14:** Clearing the top red source reveals the next warning.
- **STATUS-V3-15:** Ordinary pending is amber and uses safe-local wording.
- **STATUS-V3-16:** Network failure is red and uses safe-failure wording.
- **STATUS-V3-17:** Photo warning never hides a red source.
- **STATUS-V3-18:** Priority is derived consistently in header, settings detail, and diagnostic output.

---

# 5. Required correction STATUS-V3-03 — fully support warning rendering

## Defect

The new projection calls:

```js
setSync("warn", message)
```

but the legacy renderer does not fully define `warn`.

In the submitted artifact:

- `syncLabel()` has no `warn` label;
- `syncStatusHTML()` has no `warn` color mapping;
- no `.wl-sync.warn` styling is present.

The header dot override understands warning severity, but the settings/status detail can display a blank/“Connected” label with fallback styling.

That is not a complete athlete-facing warning state.

## Required behavior

Add a fully supported warning state across:

- label;
- text color;
- dot;
- settings/detail surface;
- accessible name;
- mobile/desktop rendering.

Recommended label:

> Attention needed

or a more specific source-owned message without a generic label, provided it remains coherent and accessible.

Do not show `Sync error` for photo reconciliation or ordinary pending.

## Required tests

- **STATUS-V3-19:** `warn` has an explicit visible label or approved message-only rendering.
- **STATUS-V3-20:** Settings/detail uses warning styling, not error or fallback.
- **STATUS-V3-21:** Header accessible name communicates the warning without color alone.
- **STATUS-V3-22:** Photo warning and pending warning render correctly at mobile width.
- **STATUS-V3-23:** No warning state falls through to blank/Connected unexpectedly.
- **STATUS-V3-24:** Red and amber states remain visually and accessibly distinguishable.

Include real rendered screenshots.

---

# 6. Convergence rule

## Ruling: APPROVED IN DIRECTION, WITH EVENT-PROVENANCE HARDENING

The proof obligations are appropriate:

- no operation in flight;
- no block;
- no unresolved conflict;
- no dirty subsystem;
- local canonical content equals the trusted baseline where a baseline exists.

The path is correctly local-only:

- no commit;
- no raw snapshot mutation.

`STATUS-H-11..15` are useful evidence.

## Required integration hardening

Do not rely on wrapping generic `setLastSync()` as the sole semantic trigger forever.

`setLastSync()` is a timestamp helper used by several flows. It does not itself prove which operation completed.

Before canary restart, ensure convergence is invoked from named successful CAS/bootstrap/reconcile completion points, or pass an explicit convergence reason/context.

Required:

- a photo-only or unrelated timestamp update cannot accidentally become the semantic proof event;
- a failed pull cannot trigger convergence;
- a successful bootstrap/reconcile can trigger it;
- commit success can trigger it;
- the proof function itself remains side-effect-free except clearing its own source.

Add:

- **STATUS-V3-25:** Failed pull does not invoke successful convergence.
- **STATUS-V3-26:** Unrelated photo completion cannot clear CAS pending merely through timestamp movement.
- **STATUS-V3-27:** Successful bootstrap/reconcile invokes convergence once.
- **STATUS-V3-28:** Successful commit invokes the same convergence rule once.
- **STATUS-V3-29:** Repeated convergence calls are idempotent.
- **STATUS-V3-30:** Convergence clears only `cas-pending`.

---

# 7. Diagnostics

## Ruling: APPROVED IN DIRECTION

`cfDiag()` is useful for the next canary attempt.

Approved payload-free fields include:

- build/path;
- signed-in/owner-presence flags;
- source names;
- top source/severity;
- local/server revision trackers;
- dirty/block/operation/conflict state;
- canonical lengths and agreement booleans.

## Required safety/evidence additions

The submitted diagnostic test searches for a limited set of example payload keys/values.

Strengthen with:

- a recursively generated sentinel payload containing unique strings in core, training, notes, workout, coach, and photo metadata;
- proof none appears in serialized diagnostics;
- no raw token, account ID, email, idempotency key, recovery artifact ID, payload hash, or canonical string;
- no full timestamped health event detail.

Add:

- **DIAG-V2-01:** Core sentinel absent.
- **DIAG-V2-02:** Training/workout sentinel absent.
- **DIAG-V2-03:** Notes/coach sentinel absent.
- **DIAG-V2-04:** Photo metadata sentinel absent.
- **DIAG-V2-05:** Auth token/email/account ID absent.
- **DIAG-V2-06:** Idempotency/recovery identifiers absent.
- **DIAG-V2-07:** Only lengths/booleans/revisions and approved source names remain.
- **DIAG-V2-08:** Console copy/paste output contains no raw athlete data.

The current `uid: "present"|"none"` shape is approved.

---

# 8. Photo fixture disclosure

## Ruling: ACCEPTED

The package correctly retracts the earlier claim that incomplete photo enumeration occurred naturally on a clean account.

The test fixture lacked the photos collection and produced the 404.

Correcting the fixture and preserving the independent photo-warning product behavior is the right response.

The photo source remains justified because incomplete enumeration is a real safety condition even though the original clean-account observation came from scaffolding.

---

# 9. Browser-runner timeout

## Ruling: APPROVED IN DIRECTION

A browser release gate must not hang indefinitely.

Adding a per-suite timeout that reports failure is correct.

The negative control must prove:

- a genuinely live handle keeps the child alive;
- timeout kills/refuses it;
- the aggregate runner exits nonzero;
- no later suite is reported as successfully complete after the timeout;
- partial logs identify the timed-out suite.

Carry `BHARNESS-08e` into the permanent browser-harness evidence.

No separate product decision is required.

---

# 10. Candidate `.351`

## Current ruling: NOT APPROVED FOR CANARY REPUBLISH

The packaged candidate is internally identified as:

```text
build   2026-07-30.351-pb-c10
sha256  fb0e32230375e3edafc954ba9114c08f9917b18ad2d4dd97d71095a47d3a3908
bytes   1,200,545
```

The artifact bytes and manifest are present.

But the implementation needs the source-integration, priority, warning-rendering, and convergence-trigger corrections above.

Those corrections will change the artifact and require a new build identity, likely `.352-pb-c10` or the next available release number.

Do not republish `.351`.

Keep:

- root `.347`;
- canary `.349`;
- 48-hour clock not started.

---

# 11. Required next package

Return:

```text
cf-canary-day1-status-v3-YYYYMMDD.zip
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
│   ├── exact status ownership integration
│   ├── exact warning renderer
│   └── exact convergence call sites
├── tests/
│   ├── status-source browser tests
│   ├── warning-render browser tests
│   ├── diagnostic safety tests
│   └── browser-harness timeout tests
└── evidence/
    ├── STATUS-V3-01..30
    ├── DIAG-V2-01..08
    ├── PHOTO-STATUS-01..08
    ├── BHARNESS-08e
    ├── negative controls
    ├── full browser runner
    ├── full regression
    ├── release pipeline
    └── served root/canary hashes
```

The package must drive the real auth, network, and manual-operation paths rather than setting synthetic registry entries directly.

---

# 12. Canary restart ruling

## Current status: NOT AUTHORIZED

“Closed off, not reproduced” is acceptable as the honest standard.

The restart is withheld because the status sources are not fully connected and the priority/rendering model can still mislead the athlete.

After the corrected V3 package is approved:

- republish `/canary/` only;
- restart from `CANARY-01`;
- perform the previously required on-device Cancel step;
- capture `cfDiag()` immediately if any unexpected red/amber state appears;
- start the 48-hour clock only after the full day-one checklist passes.

---

# Final verdict

## **STATUS-OWNERSHIP MODEL APPROVED IN CONCEPT**

## **PHOTO WARNING SEPARATION APPROVED**

## **“CLOSED OFF, NOT REPRODUCED” IS AN ACCEPTABLE CANARY STANDARD**

## **`.351` CANARY REPUBLISH NOT AUTHORIZED**

Connect every real persistent status producer to the registry, correct priority and pending severity, fully render warning states, harden convergence triggers and diagnostics, then return the next candidate for canary-restart authorization.
