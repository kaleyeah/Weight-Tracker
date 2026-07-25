# Commits 1–1g — staging browser checklist (MUST pass before shipping)

**Build:** `2026-07-26.339-pb-c1g2`
**Status:** NOT RUN — no staging PocketBase is reachable from the dev environment.

**Client build is READY-FOR-STAGING** (Product Architect verdict, 2026-07-25, after 7 review rounds). This checklist is the remaining client gate. The staging evidence package must record, per the verdict: expected + actual result for every case; browser/device and build; exact PocketBase version; screenshots/logs for failures and conflict flows; any deviations; confirmation that accounts/fixtures were disposable; whether the CAS server kit was installed; and a clear request for production review or remediation.

The Architect's authorization is explicit: Commit 1 may be *coded* now but **must not ship** on automated tests alone. Automated tests cover the decision logic; everything below needs a real browser, real IndexedDB and a real server.

## Environment required
Two PocketBase accounts · two browser profiles or devices · offline mode · network throttling · forced token expiry · IndexedDB inspection · a failed-recovery-storage simulation (fill quota or block IDB).

## Record for every row

**Case count: 67** (A1–A6, B1–B4, C1–C5, D1–D3, E1–E2, F1–F5+F3b/F3c, G1–G8, H1–H8, J1–J10, K1–K5, L1–L5, M1–M4).
`Test · Expected · Actual · Browser/device · Client build · PocketBase version · Pass/Fail · Notes`

---

### A. The live defect this commit exists to fix
| # | Test | Expected |
|---|---|---|
| A1 | Log a GLP-1 dose only (no weigh-in/food/workout), stay offline, reconnect, **pull-to-refresh** | Dose still present. Never silently replaced. |
| A2 | Same with a note only | Note survives |
| A3 | Same with a settings change only | Change survives |
| A4 | Same with a skip only | Skip survives |
| A5 | Delete all data locally while dirty, then refresh | Not treated as "nothing to lose"; no silent adopt |
| A6 | Historical correction on device A, newer weigh-in on device B, reconcile | Correction not discarded; conflict offered |

### B. No automatic whole-snapshot write before CAS
| # | Test | Expected |
|---|---|---|
| B1 | Make an edit, wait past the debounce | **No** PATCH in the network tab; pending state shown |
| B2 | Fresh account, no server row, local data present | **No** POST; pending "setup" state |
| B3 | Tap the status indicator while dirty vs a non-empty server | **No replace option exists.** Honest pause message + export offer; nothing uploaded |
| B4 | Local and server already identical, dirty flag set | Resolves to agree silently, no prompt, goes clean |

### C. Recovery fails closed
| # | Test | Expected |
|---|---|---|
| C1 | Block IndexedDB, then choose "Use the online version" | Nothing replaced; error shown; local intact |
| C2 | Block IndexedDB, then log out | **Still signed in**, device not cleared |
| C3 | Block IndexedDB, then restore a previous copy | Nothing restored; current state intact |
| C4 | Conflict → "Keep this device's changes" | The **online** copy is saved as a previous copy; state holds **pending** — pre-CAS nothing uploads |
| C5 | C4 with recovery blocked | Upload refused; wording never claims a copy was saved |

### D. Cross-account guard (minimal, pre-Commit-4)
| # | Test | Expected |
|---|---|---|
| D1 | User A signs in, makes unsynced edits, session expires; User B signs in | A's data not shown, not uploaded, not adopted; held untouched |
| D2 | Same, but User A signs back in | A's data still there and usable |
| D3 | Pre-upgrade install with meaningful data, first verified login | **"Is this your data?" screen** — claim / set aside / sign out (**no export before claim**). Never auto-claimed |

### E. Legacy migration
| # | Test | Expected |
|---|---|---|
| E1 | Upgrade an install with `wl_dirty` absent, content identical to server | Marked dirty, then resolves to agree on first sync, no prompt |
| E2 | Upgrade with `wl_dirty="0"` but genuinely unsynced local edits | Edits preserved, pending state shown |

### F. Regression — nothing else broke
| # | Test | Expected |
|---|---|---|
| F1 | Log weight, food, a workout, cardio, a GLP-1 dose | All save normally |
| F2 | Take a progress photo; check it appears | Photo pipeline unaffected |
| F3 | Coach Max "Complete today" while core is CLEAN | Recap flow works (coachreq is allowlisted) |
| F3b | Coach Max while core is DIRTY | Honest "paused until the sync fix ships" message — not a fake server error |
| F3c | Apple Health import | Values apply locally AND the server inbox clears (health write allowlisted); re-observe does not duplicate |
| F4 | Offline for a session, then reconnect | No data loss, pending state accurate |
| F5 | Explicit "Replace this device with the online copy" | Confirms, snapshots, replaces |
| G1 | Account card **Save** button while dirty | Goes through the safe path — never a blind PATCH |
| G2 | Ordinary edit → wait past every debounce | **Zero** POST/PATCH in the network tab |
| G3 | Training edit → wait | Zero POST/PATCH; pending state shown |
| G4 | Login with dirty local training | Training NOT pulled over; pending shown |
| G5 | Cached User B session, User A data on device, cold start | A's data never painted, not even one frame |
| G6 | Fresh default install, first sync | No false pending/dirty state; resolves clean |
| G7 | Backup import | Snapshot saved first; import blocked if snapshot fails |
| G8 | Sparse old server row vs default-filled local, same user meaning | Resolves to agree — no false conflict |
| H1 | Edit while SIGNED OUT, then log back in same account | Edit survives; never adopted over |
| H2 | Unknown-owner meaningful data, login | "Is this your data?" — claim / set aside / sign out. **NO export control** (ruling: unknown ≠ proven owner); sync paused until answered |
| H3 | Claim → continues login + reconciliation; Set aside → core+training+**workout draft** all quarantined and verified byte-for-byte (manifest written last) before any source is removed |
| H4 | Mismatch screen | No export control; switch account / sign out only |
| H5 | Logout with clean data | Snapshot verified, wipe succeeds, cf:lastOwner cleared |
| H6 | Restore a previous copy | Works; marks pending; snapshot-first verified |
| H7 | GLP compound configured, no dose; sync | Treated as meaningful — never "empty" |
| H8 | Setup link confirmed after boot | Reaches only the safe pull/write paths |
| J1 | Start Coach Max, edit a note while it polls, recap arrives | Edit survives; core stays pending; recap displays; server-only data NOT adopted |
| J2 | Log out (different account logs in) while a recap poll is in flight | Result dropped silently; nothing merged into the new account |
| J3 | Change the start date in Settings on one device only; sync | Detected as a difference (never silently "agreed") |
| J4 | Toggle automatic macros off on one device; sync | Detected as a difference |
| J5 | Two fresh installs created on different days | No false conflict from the generated start dates |
| J6 | Signed-out login screen after a set-aside | Lists the set with Save a copy / Delete; export absent everywhere else pre-claim |
| J7 | Unknown-owner TRAINING-only data, cold start | Claim screen; first paint shows nothing |
| J8 | Unknown-owner WORKOUT-DRAFT-only data, cold start | Claim screen; draft preserved through set-aside |
| J9 | Slow IndexedDB week-photo callback across the ownership gate | Cannot repaint another owner's data |
| J10 | Force an exception during boot (dev tools) | Visibility always restored — no permanent blank screen |
| K1 | Edit while a server-adopt recovery snapshot is pending (throttle IDB via dev tools) | Adoption aborted; edit survives; device stays pending |
| K2 | Break recovery storage, then "Complete today" with a diverged server | **No** coach request sent; honest "couldn't save a safety copy" message |
| K3 | Log out and back in (or switch accounts) while a recap is generating | Poll stops silently; nothing merged; busy state clears |
| K4 | Simulate a failure while set-aside deletes old entries | Recovery set + manifest remain; cleanup finishes on next launch |
| K5 | Export a set-aside copy | Confirmation states it contains private health data; incomplete sets refuse to export |
| L1 | Restore a previous copy; edit a note while the safety copy spins (throttle IDB) | Restore aborts; edit survives; honest "device changed" message |
| L2 | Import a backup; edit while the confirm dialog is open | Import aborts at confirm; edit survives |
| L3 | Log out; edit in another tab while the safety copy spins | Not wiped; still signed in; edit survives |
| L4 | Set aside, write new data, force a leftover cleanup job, relaunch | Newer data NEVER deleted; stale job marked superseded; recovery set intact |
| L5 | Session/token refresh while a recap is generating | Poll aborts silently (fingerprint) |
| M1 | Start a restore; while the safety copy spins, change ONE rep count in the open workout (same-length edit) | Restore aborts; the edited draft survives |
| M2 | Log out; while the safety copy spins, start a new workout | Not wiped; still signed in |
| M3 | Dev tools: delete the `workout` component of a set-aside, keep its manifest | Inventory shows it incomplete; export refuses |
| M4 | Dev tools: edit a set-aside manifest to claim only ["core"] | Export refuses (exact-set validation) |
