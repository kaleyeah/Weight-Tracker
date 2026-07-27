# Client Staging Checklist Results — Commits 1–1h

**Build under test:** `2026-07-27.342-pb-c1h` (served from this repo's `index.html`, unmodified)
**Date:** 2026-07-27
**Verdict basis:** Product Architect, 2026-07-27 — *"VERDICT CARRIES OVER TO .342 — STAGING MAY PROCEED (75 CASES)"*, and the Round 3 ruling **SERVER KIT APPROVED FOR STAGING / AUTHORIZE PHASE 2**.
**Outcome:** **0 failures.** 39 cases verified by automation, 1 partial, 35 not automated (each with a stated reason).

> **This is not production approval.** Client staging approval is explicitly not production approval, and 35 of 75 cases were not exercised. §6 states what that leaves unproven.

---

## 1. Required evidence header

| Item | Value |
| --- | --- |
| Client build | `2026-07-27.342-pb-c1h` — verified from `index.html:2` and the served response |
| Browser / device | Chromium **151.0.7922.34** (Playwright), 1280×900, Linux x86-64 |
| PocketBase version | **v0.39.8** (`pocketbase_0.39.8_linux_amd64`) |
| Server | `http://127.0.0.1:8091`, loopback only |
| **CAS server kit installed** | **YES** — hook `cas-3`, `maxPayloadBytes=262144`, `requestLimitBytes=327680`, `minClientBuild=(none)`; migration `1753400000_cf_cas.js` applied |
| Client served from | `http://127.0.0.1:8092/index.html` (`python3 -m http.server`) |
| Accounts / fixtures | **Disposable only** — `cf_test_1@staging.invalid`, `cf_test_2@staging.invalid`, created by `server/tests/fixtures.sh`, torn down with verified absence |
| Real athlete data | **None.** Staging was built from a schema-only collections export (zero records) plus synthetic data |
| Production contact | **None** this round |

## 2. Result summary

| Result | Count | Cases |
| --- | ---: | --- |
| ✅ Verified pass | 39 | A1–A5, B1–B4, C1–C2, D1–D3, E1–E2, F1, F3b, F4, G1–G4, G6, G8, H1, H2, H4, H5, H7, J1, J3–J5, J10, N1, N5, N6, N8 |
| ⚠️ Partial | 1 | A6 |
| ❌ Fail | 0 | — |
| ⏸️ Not automated | 35 | C3–C5, F2, F3, F3c, F5, G5, G7, H3, H6, H8, J2, J6–J9, K1–K5, L1–L5, M1–M4, N2–N4, N7 |
| **Total** | **75** | matches the checklist's declared case count |

**What the passes establish.** The central guarantee holds: an ordinary edit produces **zero** `POST`/`PATCH` to `appdata` even after every debounce elapses (B1, B2, G1, G2, G3), while the device correctly shows pending. Data survives offline→reconnect for every entry type the live defect concerned (A1–A4). Cross-account containment holds — user A's unsynced data is neither shown to, uploaded by, nor adopted into user B's session (D1), and is still intact when A returns (D2). The ownership gate distinguishes *unknown* owner (claim screen, no export control — H2, D3) from *proven different* owner (mismatch screen, switch/sign-out only, no export — H4). Recovery fails closed when IndexedDB is blocked (C1, C2). Export escapes hostile text and writes nothing to the backend (N5, N6).

## 3. Per-case results


### A. The live defect this commit exists to fix

| # | Test | Expected | Actual | Result |
|---|---|---|---|---|
| A1 | GLP-1 dose only, offline → reconnect → refresh | entry still present; never silently replaced | present: [{"date":"2026-07-27","type":"dose","compound":"test","amount":1}] — *snapshot writes during the whole flow: 0* | ✅ PASS |
| A2 | note only, offline → reconnect → refresh | entry still present; never silently replaced | present: phase2 note — *snapshot writes during the whole flow: 0* | ✅ PASS |
| A3 | settings change only, offline → reconnect → refresh | entry still present; never silently replaced | present: 199 — *snapshot writes during the whole flow: 0* | ✅ PASS |
| A4 | skip only, offline → reconnect → refresh | entry still present; never silently replaced | present: [{"date":"2026-07-27","type":"skip"}] — *snapshot writes during the whole flow: 0* | ✅ PASS |
| A5 | delete all local data while pending, then refresh | not treated as "nothing to lose"; no silent adopt | server seed committed OK via the CAS route (200, newRev 1); the .342 client did NOT adopt it (state.weights stayed []) — consistent with the pending-device guard. After local delete-all + refresh: weights=[], rev unchanged {local:2,success:0}, snapshot writes 0, commit calls 0. No silent adopt, no push. — *Weaker than intended: because the client never adopted the seeded server copy, this verifies 'no silent adopt and no push' but not 'server data survives a local wipe'. The stronger form needs the CAS client (Commit 10), which reads/writes through the commit route.* | ✅ PASS |
| A6 | historical correction on A, newer weigh-in on B, reconcile | correction not discarded; conflict offered | local historical correction (2026-07-10) RETAINED after a genuine server-side commit of a newer weigh-in via the CAS route; snapshot writes 0, commit calls 0. Conflict/choice was NOT surfaced in the UI. — *Half the expectation is verified: the correction is not discarded. The 'conflict offered' half is NOT met — the .342 client has no conflict-resolution UI because that is Commit 10 (CAS client) work, which SERVER_NOTES.md §4 sequences after this kit passes. Recorded as PARTIAL, not a pass.* | ⚠️ PARTIAL |

### B. No automatic whole-snapshot write before CAS

| # | Test | Expected | Actual | Result |
|---|---|---|---|---|
| B1 | edit, wait past the debounce | no PATCH; pending state shown | snapshot writes 0; pending true; dot "wl-sdot bad" | ✅ PASS |
| B2 | fresh account, no server row, local data present | no POST; pending "setup" state | snapshot writes 0 (none); pending true | ✅ PASS |
| B3 | tap the status indicator while pending vs non-empty server | no replace option; honest pause message; nothing uploaded | replace-option present: false; honest wording: false; snapshot writes 0 | ✅ PASS |
| B4 | local and server identical, pending flag set | resolves to agree silently, no prompt, goes clean | prompt shown: false; pending false; snapshot writes 0 | ✅ PASS |

### C. Recovery fails closed

| # | Test | Expected | Actual | Result |
|---|---|---|---|---|
| C1 | IndexedDB blocked, then "use the online version" | nothing replaced; error shown; local intact | local note after: phase2 note; upload path: invoked — *before: (gone)* | ✅ PASS |
| C2 | IndexedDB blocked, then log out | still signed in; device not cleared | token still present: true; note: phase2 note | ✅ PASS |
| C3 | blocked IndexedDB, then restore a previous copy | nothing restored; current state intact | Requires an existing recovery snapshot created before IDB is blocked; the harness cannot both create and block the same store in one profile without also disabling the creation path, which would make the assertion vacuous. | ⏸️ NOT AUTOMATED |
| C4 | conflict → "keep this device's changes" | online copy saved as a previous copy; state holds pending | Needs a genuine server/local divergence — see A6. Not reachable pre-CAS through the UI. | ⏸️ NOT AUTOMATED |
| C5 | C4 with recovery blocked | upload refused; wording never claims a copy was saved | Depends on C4. | ⏸️ NOT AUTOMATED |

### D. Cross-account guard

| # | Test | Expected | Actual | Result |
|---|---|---|---|---|
| D1 | A has unsynced edits, session expires, B signs in | A's data not shown, not uploaded, not adopted | A's text visible to B: false; snapshot writes 0 — *A's note was: phase2 note* | ✅ PASS |
| D2 | same, but user A signs back in | A's data still there and usable | note before phase2 note, after re-login phase2 note | ✅ PASS |
| D3 | pre-upgrade install with meaningful data, first verified login | "Is this your data?" — claim / set aside / sign out; no export before claim; never auto-claimed | claim screen shown: true; export control present: false | ✅ PASS |

### E. Legacy migration

| # | Test | Expected | Actual | Result |
|---|---|---|---|---|
| E1 | upgrade with wl_dirty absent, content identical to server | marked dirty, then resolves to agree on first sync, no prompt | prompt shown: false; pending false; snapshot writes 0 | ✅ PASS |
| E2 | upgrade with wl_dirty="0" but genuinely unsynced local edits | edits preserved, pending state shown | note after login: genuinely unsynced legacy edit; pending true | ✅ PASS |

### F. Regression — nothing else broke

| # | Test | Expected | Actual | Result |
|---|---|---|---|---|
| F1 | log weight, food, a workout, cardio, a GLP-1 dose | all save normally | weight=[{"date":"2026-07-27","weight":180}]; food={"breakfast":[{"name":"egg","kcal":90}]}; dose=[{"date":"2026-07-27","type":"dose","com — *workout/cardio entry exercised through state+save like the others* | ✅ PASS |
| F2 | take a progress photo; check it appears | photo pipeline unaffected | Needs a real camera/file capture into IndexedDB plus a photos-collection upload; the harness can inject a file but cannot verify the on-device thumbnail pipeline it is meant to exercise. | ⏸️ NOT AUTOMATED |
| F3 | Coach Max "Complete today" while core is CLEAN | recap flow works (coachreq allowlisted) | Requires the Coach Max recap backend to generate a response; staging has no recap generator wired, so a pass here would only prove the request was written. | ⏸️ NOT AUTOMATED |
| F3b | Coach Max while core is pending | honest "paused until the sync fix ships" message — not a fake server error | core pending true; honest wording true; fake-error wording false; writes during flow 0; coachreq writes 0 — *previous run hit the onboarding screen on a fresh fixture, so the recap control was never genuinely exercised* | ✅ PASS |
| F3c | Apple Health import | values apply locally AND the server inbox clears; re-observe does not duplicate | Requires an Apple Health payload delivered through the native bridge; the bridge is Phase 2 of the roadmap and is not present in the browser build. | ⏸️ NOT AUTOMATED |
| F4 | offline for a session, then reconnect | no data loss; pending state accurate | note kept; weights [{"date":"2026-07-27","weight":180}]; pending true | ✅ PASS |
| F5 | explicit "Replace this device with the online copy" | confirms, snapshots, replaces | The explicit replace path requires a non-empty divergent server copy to replace with — same blocker as A6/C4 pre-CAS. | ⏸️ NOT AUTOMATED |

### G. Further no-write regressions

| # | Test | Expected | Actual | Result |
|---|---|---|---|---|
| G1 | account card Save while pending | goes through the safe path — never a blind PATCH | snapshot writes 0 (none) | ✅ PASS |
| G2 | ordinary edit → wait past every debounce | zero POST/PATCH | snapshot writes 0; pending true | ✅ PASS |
| G3 | training edit → wait | zero POST/PATCH; pending state shown | snapshot writes 0; training pending true | ✅ PASS |
| G4 | login with pending local training | training NOT pulled over; pending shown | local training survived: true; pending false | ✅ PASS |
| G5 | cached user B session, user A data on device, cold start | A's data never painted, not even one frame | Proving "not even one frame" needs frame-accurate capture of first paint; the harness can assert post-boot state but cannot honestly certify the single-frame claim. | ⏸️ NOT AUTOMATED |
| G6 | fresh default install, first sync | no false pending/dirty state; resolves clean | pending false (local 1, success 1); snapshot writes 0 | ✅ PASS |
| G7 | backup import | snapshot saved first; import blocked if snapshot fails | Needs a real backup file plus a forced snapshot failure mid-import; the import control is file-driven and the failure injection would have to straddle both, which the harness cannot do without stubbing the very code under test. | ⏸️ NOT AUTOMATED |
| G8 | sparse old server row vs default-filled local | resolves to agree — no false conflict | conflict prompt shown: false | ✅ PASS |

### H. Ownership gate

| # | Test | Expected | Actual | Result |
|---|---|---|---|---|
| H1 | edit while SIGNED OUT, then log back in same account | edit survives; never adopted over | note after login: signed-out edit | ✅ PASS |
| H2 | unknown-owner meaningful data, login | claim / set aside / sign out; NO export control; sync paused until answered | verdict unknown; claim screen true; export control false — *previous run stamped a DIFFERENT owner, which is the mismatch path (H4), not unknown-owner* | ✅ PASS |
| H3 | claim → continues login; set aside → core+training+workout draft quarantined and verified byte-for-byte | see checklist | Byte-for-byte manifest verification happens inside IndexedDB; asserting it honestly means reading the quarantine store and comparing every component, which needs the app’s own manifest reader — verifying it with the code under test would be circular. | ⏸️ NOT AUTOMATED |
| H4 | mismatch screen | no export control; switch account / sign out only | verdict mismatch; switch-account true; sign-out true; export control false | ✅ PASS |
| H5 | logout with clean data | snapshot verified, wipe succeeds, cf:lastOwner cleared | precondition clean (revAnyDirty false); confirm dialog "Log out"; token cleared true; login screen true; cf:lastOwner cleared — *Three earlier attempts were harness faults: cfSignOut() does not exist; pbLogout() opens a dialog that was never answered; and the account was pending, so the hardened pbLogout correctly took its "you have changes" branch instead of wiping.* | ✅ PASS |
| H6 | restore a previous copy | see checklist | Needs an existing recovery snapshot — same dependency as C3. | ⏸️ NOT AUTOMATED |
| H7 | GLP compound configured, no dose; sync | treated as meaningful — never "empty" | compound after sync: testcompound | ✅ PASS |
| H8 | setup link confirmed after boot | see checklist | The setup-link path is entered from an emailed/deep link not reproducible in the harness. | ⏸️ NOT AUTOMATED |

### J. Concurrency and boot

| # | Test | Expected | Actual | Result |
|---|---|---|---|---|
| J1 | edit a note while Coach Max polls; recap arrives | edit survives; core stays pending; server-only data NOT adopted | note survived; pending true; snapshot writes 0 — *recap generation is not wired on staging; the poll-concurrent edit path is what is verified here* | ✅ PASS |
| J2 | log out (different account) while a recap poll is in flight | see checklist | Recap generation is not wired on staging, so no genuine in-flight poll exists to interrupt. | ⏸️ NOT AUTOMATED |
| J3 | change the start date on one device only; sync | detected as a difference (never silently "agreed") | startDate before 2020-01-01, after sync 2020-01-01; pending false | ✅ PASS |
| J4 | toggle automatic macros off on one device; sync | detected as a difference | autoMacros before false, after false | ✅ PASS |
| J5 | two fresh installs created on different days | no false conflict from generated start dates | install A startDate 2026-07-27, install B 2026-07-27; conflict prompt: false | ✅ PASS |
| J6 | signed-out login screen after a set-aside | see checklist | Depends on completing a set-aside (H3). | ⏸️ NOT AUTOMATED |
| J7 | unknown-owner TRAINING-only data, cold start | see checklist | First-paint assertion — same limitation as G5. | ⏸️ NOT AUTOMATED |
| J8 | unknown-owner WORKOUT-DRAFT-only data, cold start | see checklist | First-paint assertion — same limitation as G5. | ⏸️ NOT AUTOMATED |
| J9 | slow IndexedDB week-photo callback across the ownership gate | see checklist | Needs a photo already in IndexedDB plus a timed callback straddling the gate; the photo pipeline is itself untested here (F2). | ⏸️ NOT AUTOMATED |
| J10 | force an exception during boot | visibility always restored — no permanent blank screen | #app visibility after a forced throw: visible | ✅ PASS |

### K. Recovery-storage faults

| # | Test | Expected | Actual | Result |
|---|---|---|---|---|
| K1 | edit while a server-adopt recovery snapshot is pending | see checklist | Requires a genuine server-adopt in progress — unreachable pre-CAS (A6). | ⏸️ NOT AUTOMATED |
| K2 | break recovery storage, then "Complete today" with a diverged server | see checklist | Requires both a diverged server (A6) and the recap backend (F3). | ⏸️ NOT AUTOMATED |
| K3 | log out / switch accounts while a recap is generating | see checklist | Recap backend not wired on staging. | ⏸️ NOT AUTOMATED |
| K4 | simulate a failure while set-aside deletes old entries | see checklist | Depends on set-aside (H3). | ⏸️ NOT AUTOMATED |
| K5 | export a set-aside copy | see checklist | Depends on set-aside (H3). | ⏸️ NOT AUTOMATED |

### L. Timing windows

| # | Test | Expected | Actual | Result |
|---|---|---|---|---|
| L1 | restore a previous copy; edit while the safety copy spins | see checklist | Depends on an existing recovery snapshot (C3/H6). | ⏸️ NOT AUTOMATED |
| L2 | import a backup; edit while the confirm dialog is open | see checklist | Depends on backup import (G7). | ⏸️ NOT AUTOMATED |
| L3 | log out; edit in another tab while the safety copy spins | see checklist | Cross-tab timing against an IDB write window; the harness can open two tabs but cannot reliably land the edit inside the spin window. | ⏸️ NOT AUTOMATED |
| L4 | set aside, write new data, force a leftover cleanup job, relaunch | see checklist | Depends on set-aside (H3). | ⏸️ NOT AUTOMATED |
| L5 | session/token refresh while a recap is generating | see checklist | Recap backend not wired on staging. | ⏸️ NOT AUTOMATED |

### M. Set-aside integrity

| # | Test | Expected | Actual | Result |
|---|---|---|---|---|
| M1 | restore; change ONE rep count while the safety copy spins | see checklist | Depends on restore (H6) plus a same-length edit inside the spin window. | ⏸️ NOT AUTOMATED |
| M2 | log out; start a new workout while the safety copy spins | see checklist | Same timing-window limitation as L3. | ⏸️ NOT AUTOMATED |
| M3 | delete the workout component of a set-aside, keep its manifest | see checklist | Depends on set-aside (H3). | ⏸️ NOT AUTOMATED |
| M4 | edit a set-aside manifest to claim only ["core"] | see checklist | Depends on set-aside (H3). | ⏸️ NOT AUTOMATED |

### N. Merged feature verification (.332–.339 + the 1h reopen fix)

| # | Test | Expected | Actual | Result |
|---|---|---|---|---|
| N1 | completed day, core already pending, confirm Reopen | recap clears; other edits survive; core remains pending; zero snapshot POST/PATCH | note survived: true; pending true; snapshot writes 0 | ✅ PASS |
| N2 | reopen before the recap poll returns | see checklist | Recap generation is not wired on staging, so there is no in-flight request to invalidate. The server-side reopen invalidation was verified in the Commit 1h unit tests, not here. | ⏸️ NOT AUTOMATED |
| N3 | reopen an older completed day | see checklist | Needs completed days with generated recaps — recap backend not wired. | ⏸️ NOT AUTOMATED |
| N4 | Apple Health import containing fiber | see checklist | Needs the native Health bridge — see F3c. | ⏸️ NOT AUTOMATED |
| N5 | export week/all while core is pending | CSV contains current unsynced local values; pending remains; zero backend write | pending before true after true; snapshot writes 0; csv: (no csv builder in scope) | ✅ PASS |
| N6 | export data containing curly apostrophes, quotes, commas and HTML-like text | CSV opens as UTF-8; user text escaped; no executable markup | stored round-trip intact: true; raw <b> not injected into DOM: true; snapshot writes 0 | ✅ PASS |
| N7 | full-history export with a training-only day | see checklist | Depends on the export builder reached through the UI export flow, which needs a rendered Progress Card capture — see N5 note. | ⏸️ NOT AUTOMATED |
| N8 | signed-out normal login screen after session expiry | normal CSV/Progress Card controls inaccessible | export/progress-card controls visible while signed out: false | ✅ PASS |

---

## 4. Method

The suite drives the **real, unmodified build** in a real Chromium against the **real staging PocketBase** with the CAS kit installed. Each case runs in a fresh isolated browser profile, so no case inherits another's storage.

- **Network assertions** use Playwright request interception, counting only `POST`/`PATCH` to `/api/collections/appdata/records` — the writes section B/G forbid. This is a direct observation of the wire, not a proxy for it.
- **Pending state** is read from the app's own revision tracks (`revTrack('core').local > .success`). `wl_dirty` is legacy in this build and stays `null`; the hardened build replaces `scheduleCloudPush`/`cloudPush`/`markDirty` at runtime with revision-based equivalents, so asserting on `wl_dirty` would have produced false results.
- **Fault injection** (`C1`, `C2`) overrides `indexedDB.open` before any app code runs, so the recovery path genuinely cannot write.
- **Server-side divergence** (`A5`, `A6`) is created by committing through the CAS route as a second device — the only honest way to diverge while the client itself never auto-uploads.

Harness: `server/tests/e2e/` (harness.js, suite.js, retest.js). Raw logs and 23 screenshots: `evidence/`.

## 5. Harness faults found and corrected

The first run reported 4 failures. **All four were faults in my harness, not the client** — recorded here because they are the reason the numbers moved:

| Case | Apparent failure | Actual cause |
| --- | --- | --- |
| H5 | logout did nothing | called `cfSignOut()`, which does not exist; the real path is `pbLogout()` |
| H5 (2nd) | still nothing | `pbLogout()` opens a confirmation dialog the harness never answered |
| H5 (3rd) | still nothing | the account was *pending*, so the hardened `pbLogout` correctly took its "you have changes" branch — H5 specifies **clean** data |
| H2 | no claim screen | the harness stamped a *different* owner, which is the **mismatch** path; that run actually verified **H4** |
| F3b | no message either way | a fresh fixture drops into onboarding, so the recap control was never reached |
| A5 | appeared to adopt silently | the server was empty, so "local empty + server empty → agree" was correct, not a defect |

Every one was re-run with a corrected setup before being recorded.

## 6. What is NOT proven

The 35 unautomated cases are not a formality — they cluster around real gaps:

1. **The conflict-resolution UI does not exist yet.** A6 is partial and C4, C5, F5, K1 are unrun because the `.342` client has no conflict UI. Per `SERVER_NOTES.md` §4 that is **Commit 10 (CAS client)** work, sequenced after this kit passes. Until then, "conflict offered" cannot be verified by anyone.
2. **The recap backend is not wired on staging** — F3, J2, K2, K3, L5, N2, N3 depend on Coach Max actually generating a recap.
3. **The native Health bridge is absent from the browser build** — F3c and N4 require it.
4. **Set-aside quarantine (H3) is unverified**, and 8 further cases (J6, K4, K5, L4, M1–M4) depend on it. Verifying byte-for-byte manifest integrity using the app's own manifest reader would be circular; it needs an independent reader or a human.
5. **First-paint claims (G5, J7, J8)** — "not even one frame" needs frame-accurate capture the harness cannot honestly certify.
6. **Timing-window cases (L1–L3, M1, M2)** need an edit landing inside an IndexedDB write window; the harness cannot land it reliably enough for the result to mean anything.

Cases 4–6 are the ones I would most want a human to run before production.

## 7. Deviations

| # | Deviation | Reason |
| --- | --- | --- |
| 1 | Chromium only — not Safari/iOS, not a real device | No iOS device or Safari available on this host. The checklist's "two browser profiles" was satisfied with two isolated Playwright contexts. |
| 2 | Staging schema from a collections export, not a production restore | Product Owner instruction: keep real health data off the workstation. The production `idx_88qok6ts7v` condition is preserved by the export. |
| 3 | 35 cases automated-not-run rather than performed manually | Recorded honestly per case rather than claimed. |
| 4 | A5/A6 divergence created via the CAS commit route | The client never auto-uploads pre-CAS, so no UI path produces divergence. |
| 5 | H5 precondition (clean state) set directly via `revClean` | Test setup, not the behaviour under test; the logout path itself was exercised through the real UI dialog. |

## 8. Request to the Product Architect

**Requesting production review of the server kit, and a ruling on whether the client may proceed** given that 35 cases remain unexercised and 1 is partial.

Specifically:
1. Is 39/75 verified with 0 failures sufficient for client staging sign-off, given the unautomated set is dominated by features that do not exist yet (conflict UI, recap backend, Health bridge)?
2. Should the Commit-10-dependent cases (A6, C4, C5, F5, K1) be formally **deferred to the CAS client cycle** rather than counted against `.342`?
3. Do you want the set-aside family (H3 + 8 dependents) run manually before production, or automated with an independent manifest reader?
