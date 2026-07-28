# Commit 10 (CAS Client) — Pre-Coding Plan

**Last Updated:** 2026-07-28 — **Revision 2**
**Status:** **APPROVED TO IMPLEMENT WITH REQUIRED CLARIFICATIONS** (Product Architect, `spec/PRODUCT_ARCHITECT_PRECODING_REVIEW.md`). Revision 2 folds in every ruling from that review. **No implementation code written yet.**
**Authority:** `spec/PRODUCT_ARCHITECT_COMMIT10_SPEC.md` is the WHAT; `spec/PRODUCT_ARCHITECT_PRECODING_REVIEW.md` amends it and wins where the two differ. This document is the HOW.

**What changed in Revision 2** — six rulings, all binding:

| # | Ruling | Where applied |
| --- | --- | --- |
| 1 | Recovery artifacts must satisfy an explicit contract; extend the format narrowly rather than save a misleading hybrid snapshot | §2.1 |
| 2 | Idempotency keys use **SHA-256**, not a short hash | §4.1 |
| 3 | `cfCtxDrifted` may not be reused as the whole guard — the CAS resolution context is **subsystem-specific** | §3.1 |
| 4 | Conflicts persist as captured; freshness is checked **before a destructive resolution**, differently per choice | §2.4 |
| 5 | First-row creation at `expectedRev: 0` requires **positive authenticated no-row proof** | §4.5 |
| 6 | A 409 whose recovery write fails must **not** produce an actionable conflict card | §2.5 |

---

## 0. What already exists

Reconnaissance against build `2026-07-27.342-pb-c1h` (`index.html`, 8,030 lines, single file, vanilla JS). Three foundations are already shipped and hardened:

| Need | Already present | Where |
| --- | --- | --- |
| Per-subsystem revisions | `revTrack(t)` → `{local, attempted, success}`, with `revBump`/`revAttempt`/`revCommit`/`revClean`/`revIsDirty` | ~5885–5908 |
| Write freeze | `pbSave` gated shut for snapshot fields; `cloudPush` inert | 5044, 5070, Commit 1b ~6599 |
| Destructive-operation guard | `cfCtxDrifted(a,b)` — captures context before an async safety copy, re-verifies before acting | ~7759 (Commit 1f) |
| Quarantine manifest validation | `cfManifestValid(man,stamp,comps)` — exact `{core,training,workout}` set | ~7907 (Commit 1g) |
| Local entry points | `save()` → `scheduleCloudPush()`, `saveTraining()` → `scheduleTrainingPush()` | 1128, 1074 |

The codebase's established pattern is **append-and-override**. Commit 10 follows it — one trailing `COMMIT 10: CAS CLIENT` block. The Architect approved this **for this release only**, as a clear rollback boundary, and explicitly not as an endorsement of indefinite growth by appending. §8 lists the tests that must prove the boundary holds.

---

## 1. Per-subsystem sync state machine

One machine per subsystem, `core` and `training`, run independently (CAS-04, CAS-19).

### 1.1 State record

```
cfSync[subsystem] = {
  local, attempted, success,   // existing revision track
  serverRev,                   // last known server revision (200 newRev / 409 serverRev)
  baselineHash,                // SHA-256 of the payload last agreed with the server
  blocked,                     // null | auth | update | oversize | invariant | recovery | ownership
  conflictId                   // null | id of the persisted conflict record
}
```

`baselineHash` exists only to evaluate the spec's §1.4 second exemption ("server still equals the last agreed baseline"). Without a remembered baseline that rule cannot be evaluated safely.

### 1.2 States

| State | Condition | Leaves via |
| --- | --- | --- |
| `clean` | `local === success`, no conflict, not blocked | meaningful mutation → `pending` |
| `pending` | `local > success` | debounce + preconditions → `syncing`; 409 → `conflict`; block → `blocked` |
| `syncing` | exactly one request in flight | 200 → `clean` or `pending` (§1.3); 409 → `conflict`; 400/401/413/426/invariant → `blocked`; 500/network → `pending` + bounded retry |
| `conflict` | unresolved conflict record | explicit athlete resolution only |
| `blocked` | a reason above | that reason clearing |

At most one in-flight request per subsystem; both subsystems may be in flight at once.

### 1.3 The in-flight edit rule (CAS-05, CAS-06)

Each request captures an immutable context at send time. On 200: `serverRev := newRev`, and `success := max(success, capturedLocalRev)` — **only** the captured revision. If `local > capturedLocalRev`, the subsystem returns to `pending`.

`revCommit(t, sent)` already implements exactly this and is reused unchanged. Per the review, tests must **prove** a response can acknowledge only the revision its own request captured, rather than asserting it by inheritance.

### 1.4 Preconditions (CAS-11)

No automatic commit while: unresolved conflict, failed recovery storage, unknown/mismatched ownership, unavailable auth, update required, oversized payload, or an active invariant error. Ownership gates from Commits 1c/1e are preconditions, not replacements.

---

## 2. Conflict state

### 2.1 The recovery artifact contract *(ruling 1)*

On a 409 the server payload — real health data — is written through the verified-recovery path, and the conflict record holds only a reference. The Architect requires that artifact to be:

| Requirement | How it is met |
| --- | --- |
| Immutable once referenced | artifacts are content-addressed; a new capture writes a **new** id, never overwrites in place |
| Account-scoped | key includes the account id; another account cannot enumerate or read it |
| Subsystem-labelled | `core` / `training` recorded in the artifact header |
| Self-contained enough to restore that subsystem | header carries subsystem, `serverRev`, canonical hash, byte length, capture time |
| Verified before the conflict is actionable | read back, parsed, length- and hash-checked before any card is offered |
| Inaccessible to another account | enforced by the existing account-scoped storage gates |
| Retained while unresolved | cleanup skips artifacts referenced by an unresolved conflict |
| Never logged or in diagnostics | payload never passed to any logging path (CAS-17) |

**Format decision.** The existing recovery format stores a *whole-snapshot* set `{core, training, workout}`. A CAS conflict concerns exactly one subsystem, so writing a whole-snapshot entry would mean pairing a genuine server `core` payload with a local `training` payload the server never had — precisely the "misleading hybrid snapshot" the review forbids.

So the format is extended **narrowly**: a new artifact kind `cas-conflict` whose manifest declares a single-subsystem component set and is validated by its own exact-set rule. Existing whole-snapshot artifacts are untouched, and `cfManifestValid`'s `{core,training,workout}` rule keeps applying unchanged to set-aside artifacts. Two kinds, two exact-set rules, no hybrids.

### 2.2 Conflict record

```
cfConflicts[id] = {
  id, subsystem, accountId,
  serverRev,           // from the 409
  serverCopyRef,       // immutable recovery artifact id — verified before use
  localRevAtCapture, capturedAt, resolved:false
}
```

Account-scoped in `localStorage`, survives reload (STATUS-05), restores account-safely (CAS-16), cleared only by explicit resolution or legitimate account removal.

### 2.3 Conflict center

One surface, two independently resolvable cards. A view (`view_conflicts`), **not** a modal that can appear over an active workout (STATUS-08). Background discovery sets the compact state plus one non-repeating notification; opens on tap or at a safe transition. Explicit **Sync now** may open it immediately. No bulk resolve.

### 2.4 Freshness — captured, then checked at the point of action *(ruling 4)*

The conflict is persisted **exactly as received** and is never silently replaced on a foreground event. It does not expire with age. Freshness is instead established at the moment a destructive choice is taken, and differently per choice:

| Choice | Freshness rule |
| --- | --- |
| **Keep this device's changes** | no refresh, no request; captured conflict and recovery copy retained; stays unresolved and pending |
| **Use this device everywhere** | submits against the **captured** `serverRev` — CAS itself is the freshness check. On a second 409: save and verify the newer server copy, replace the conflict record with the newer conflict, tell the athlete **"The online copy changed again. Review your choice."**, and require a new confirmation. Never loop (CAS-13) |
| **Use the online copy here** | before adopting, perform an authenticated **read-only refresh** of the current server row and revision. Unchanged → proceed with recovery-first adoption. Changed → save and verify the newer payload, update the conflict, require a fresh explicit choice. A weeks-old captured payload is never adopted merely because it was once valid |

### 2.5 When the recovery write fails *(ruling 6)*

A 409 whose server payload cannot be saved **and verified** must not become a normal actionable conflict card. Instead the subsystem enters the recovery-blocked safe state: local data stays active and pending, export is offered, retrying recovery storage is offered, **neither destructive choice is presented**, and no wording claims the online copy is preserved. This is C5 made structural — with no verified artifact there is no reference, so the destructive paths are unreachable rather than merely discouraged.

---

## 3. Recovery-first destructive choices

### 3.1 A subsystem-specific CAS resolution context *(ruling 3)*

`cfCtxDrifted`'s predicate is proven and is reused, but the whole-app context is **not** applied unchanged: an unrelated Training edit must not abort a Health & progress adoption. Commit 10 defines a narrower context captured at the start of a destructive resolution:

```
casCtx = { accountId, sessionId, generation,
           subsystem, subsystemLocalRev,
           conflictId, capturedServerRev, recoveryCopyRef }
```

Aborts if **any** of these change before the action completes. An edit to the *other* subsystem changes none of them and proceeds independently. This is a narrow wrapper around proven machinery, not a rewrite of prior hardening.

### 3.2 The shared sequence

```
1. capture casCtx
2. write recovery artifact   (server payload for Choice 3 / local payload for Choice 2)
3. VERIFY it                 (read back, parse, length + hash, exact-set for its kind)
4. re-verify casCtx          (abort on any drift)
5. act                       (commit, or adopt)
6. re-verify + settle        (mark only the intended revision clean)
```

| Choice | Recovery copy | Then |
| --- | --- | --- |
| 1 — Keep this device's changes (default) | server payload | nothing sent; stays pending and unresolved; status *Sync needs your choice* |
| 2 — Use this device everywhere | server payload | commit **latest local payload** at the captured `serverRev`, new idempotency key; second 409 → §2.4 |
| 3 — Use the online copy here | **local** payload | refresh (§2.4), then adopt; clean at `serverRev` |

Choices 2 and 3 require explicit confirmation naming what is replaced.

### 3.3 Edits after "Keep this device's changes" *(ruling 4B)*

The existing conflict **stands**. Later edits advance the local revision, stay local and pending, trigger no automatic commit for that subsystem, and neither erase nor silently refresh the conflict. The other subsystem keeps syncing. When the athlete later chooses **Use this device everywhere**, it sends the *latest* local payload while still referencing the originally captured online recovery copy.

---

## 4. Idempotency, retry and first-row creation

### 4.1 Derived keys, SHA-256 *(ruling 2)*

```
idempotencyKey = "c10-" + sha256hex(subsystem + "\n" + expectedRev + "\n" + canonicalPayloadBytes)
                 // 4 + 64 = 68 chars, within the server's 96-char limit
```

Full hex digest of a collision-resistant hash over the complete canonical request identity — no truncation, no ad-hoc hash. Acceptance: identical canonical payloads → identical key; any change to payload bytes, subsystem or expected revision → different key; retry after an unknown network outcome → original key; canonicalization stable across reload; no raw health data in the key.

Canonicalization is one implementation, shared by fingerprints, baseline comparison and key identity. **The independent manifest reader must not import it** (§6).

### 4.2 `409 idempotency key reused` is not a conflict

A client invariant failure. Stop retries, keep pending, show the safe failure state, record a diagnostic. It never reaches the conflict center — an athlete cannot act on it.

### 4.3 Retry policy

- **500 / network:** pending, same key, ~5 s then ~30 s while foreground/authenticated/online; then stop until foreground, reconnect, meaningful edit, or explicit Retry/Sync now.
- **400 / 401 / 413 / 426 / invariant:** no automatic retry.
- **409:** never retried automatically except the two §1.4 exemptions, each at most once.

CAS-20 is enforced by a per-subsystem attempt counter reset only by those explicit triggers.

### 4.4 Push scheduling

3 s inactivity per subsystem, coalescing all edits in the interval; reset on further edits; never per keystroke. High-intent points (day complete, workout saved, import complete, restore complete, Sync now) attempt immediately and never block. Foreground, reconnect and re-auth resume pending work. No service-worker queue.

### 4.5 First-row creation requires positive proof *(ruling 5)*

Automatic creation at `expectedRev: 0` is allowed **only** when an authenticated bootstrap result positively establishes all of:

1. the account owns no `appdata` row,
2. no unresolved ownership/adoption condition exists,
3. this device has never acknowledged a server row for that account,
4. the local data belongs to the authenticated account.

Absent local revision metadata is **not** proof. If a client that previously knew a server row later sees a no-row condition, that is the unexpected no-row conflict from spec §4 — never a silent recreate.

---

## 5. Integration points

| # | Point | Change |
| --- | --- | --- |
| 1 | `save()` / `saveTraining()` | keep local write; re-point the inert schedulers at the CAS scheduler |
| 2 | Commit 1b write freeze | **stays** for raw snapshot POST/PATCH (CAS-01, CAS-02) |
| 3 | `pbSave` | unchanged — `health`/`coachreq` stay outside CAS (CAS-18) |
| 4 | `revCommit(t,sent)` | reused; proven by test, not by inheritance |
| 5 | Ownership gates (1c/1e) | sync preconditions |
| 6 | `cfCtxDrifted` (1f) | predicate reused inside the narrower `casCtx` (§3.1) |
| 7 | `cfManifestValid` (1g) | unchanged for set-aside artifacts; new exact-set rule for `cas-conflict` artifacts |
| 8 | Status indicator | extended to the seven-state priority list; tap → per-subsystem detail |
| 9 | New `view_conflicts` | the conflict center |
| 10 | Recap guard (1h) | unchanged |

---

## 6. Independent manifest reader

Test-only second implementation at `tests/independent/manifest-reader.js`. Imports nothing from `index.html` — **and, per the review, not the shared canonicalization either**. A test asserts the file references neither. It re-derives validity from the contract: exact component set, no missing/subset/duplicate/unknown component, valid byte sizes, stored bytes matching declared sizes, manifest present only after all components were written.

Automates H3, J6, K4, K5, L4, M1–M4 with outcomes exactly as worded in `MANUAL_CHECKLIST_COMMIT1.md`, plus one manual production-readiness confirmation of the human-visible set-aside flow. Reader and all nine cases are release blockers.

---

## 7. Test plan

| Layer | Runner | Covers |
| --- | --- | --- |
| State-machine unit | `node tests/run-all.js` | CAS-04/05/06/08/09/12/19/20; STATUS-01/02/03; C10-PLAN-11 |
| Executable integration | real PocketBase staging with the **production** kit | CAS-01/02/03/07/10/11/13/14/18; C10-PLAN-01/02/03/07/08 |
| Browser (Playwright, Chromium, real IndexedDB, two accounts, two profiles, offline) | `server/tests/e2e/` | A6, C4, C5, F5, K1; CAS-15/16/17; STATUS-04–08; H3 + 8 dependents; C10-PLAN-04/05/06/09/10/12 |

**Required by this review** — named tests, each failure message quoting its criterion:

| ID | Asserts |
| --- | --- |
| C10-PLAN-01 | current-server refresh happens before **Use online copy here** |
| C10-PLAN-02 | changed server state forces a new confirmation |
| C10-PLAN-03 | a second 409 on **Use this device everywhere** does not loop |
| C10-PLAN-04 | edits after **Keep this device's changes** do not auto-push |
| C10-PLAN-05 | an unrelated subsystem edit does **not** abort the selected subsystem's adoption |
| C10-PLAN-06 | an affected-subsystem edit **does** abort adoption |
| C10-PLAN-07 | first-row creation requires positive authenticated no-row proof |
| C10-PLAN-08 | a previously known row disappearing is never auto-recreated |
| C10-PLAN-09 | the recovery reference is immutable and account-scoped |
| C10-PLAN-10 | recovery failure exposes no destructive actions |
| C10-PLAN-11 | canonical request identity produces stable SHA-256 keys |
| C10-PLAN-12 | no duplicate legacy/CAS scheduler and no live raw snapshot write path |

C10-PLAN-05 and C10-PLAN-06 are the pair that proves ruling 3 landed: same interruption, opposite outcomes, decided solely by which subsystem was edited.

---

## 8. Rollout, rollback and the append boundary

**Build:** `2026-07-2X.343-pb-c10`. No server change of any kind.

**Rollout:** staging against a PocketBase carrying the production kit → full acceptance run → evidence package for Architect review → deploy with the bridge still active → 24–48 h bridge window → lockdown as a separate Product Owner authorization and Architect operational review.

**Rollback:** redeploy the previous `index.html`. Server untouched; data committed through the route stays valid because the bridge keeps legacy revisions truthful. No server rollback for a client defect.

**The append boundary must be proven, not assumed** (review §5). Tests: the raw snapshot path is still frozen; exactly one active CAS scheduler exists per subsystem; no overridden function can still schedule a competing legacy push; and rolling back to `.342-pb-c1h` requires only restoring the previous client file. C10-PLAN-12 covers the scheduler and raw-path halves.

---

## 9. Open questions — all answered

| # | Question | Ruling |
| --- | --- | --- |
| a | Conflict-record lifetime and freshness | Persist as captured; never expire by age; check freshness at the point of destructive action, per choice (§2.4) |
| b | Edits after "Keep this device's changes" | The conflict stands; edits stay local and pending; the later resolution uses the latest local payload (§3.3) |
| c | First-ever push at `expectedRev: 0` | Allowed only with positive authenticated no-row proof; a vanished known row is never recreated (§4.5) |

No open questions remain. Implementation may begin.
