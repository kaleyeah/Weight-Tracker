# Commit 1+1b — staging browser checklist (MUST pass before shipping)

**Build:** `2026-07-25.334-pb-c1c`
**Status:** NOT RUN — no staging PocketBase is reachable from the dev environment.

The Architect's authorization is explicit: Commit 1 may be *coded* now but **must not ship** on automated tests alone. Automated tests cover the decision logic; everything below needs a real browser, real IndexedDB and a real server.

## Environment required
Two PocketBase accounts · two browser profiles or devices · offline mode · network throttling · forced token expiry · IndexedDB inspection · a failed-recovery-storage simulation (fill quota or block IDB).

## Record for every row

**Case count: 43** (A1–A6, B1–B4, C1–C5, D1–D3, E1–E2, F1–F5+F3b/F3c, G1–G8, H1–H8).
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
| D3 | Pre-upgrade install with meaningful data, first verified login | **Quarantine screen** — explicit "Yes it's mine" / "Set it aside" / export. Never auto-claimed |

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
| H2 | Unknown-owner meaningful data, login | "Is this your data?" — claim / set aside / export; NO auto-claim, sync paused until answered |
| H3 | Claim → continues login + reconciliation; Set aside → data quarantined, verified before removal |
| H4 | Mismatch screen | No export control; switch account / sign out only |
| H5 | Logout with clean data | Snapshot verified, wipe succeeds, cf:lastOwner cleared |
| H6 | Restore a previous copy | Works; marks pending; snapshot-first verified |
| H7 | GLP compound configured, no dose; sync | Treated as meaningful — never "empty" |
| H8 | Setup link confirmed after boot | Reaches only the safe pull/write paths |
