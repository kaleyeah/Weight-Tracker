# Commit 1 — staging browser checklist (MUST pass before shipping)

**Build:** `2026-07-25.332-pb-c1`
**Status:** NOT RUN — no staging PocketBase is reachable from the dev environment.

The Architect's authorization is explicit: Commit 1 may be *coded* now but **must not ship** on automated tests alone. Automated tests cover the decision logic; everything below needs a real browser, real IndexedDB and a real server.

## Environment required
Two PocketBase accounts · two browser profiles or devices · offline mode · network throttling · forced token expiry · IndexedDB inspection · a failed-recovery-storage simulation (fill quota or block IDB).

## Record for every row
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
| B3 | Tap the status indicator | Explicit confirm → uploads → status clears |
| B4 | Local and server already identical, dirty flag set | Resolves to agree silently, no prompt, goes clean |

### C. Recovery fails closed
| # | Test | Expected |
|---|---|---|
| C1 | Block IndexedDB, then choose "Use the online version" | Nothing replaced; error shown; local intact |
| C2 | Block IndexedDB, then log out | **Still signed in**, device not cleared |
| C3 | Block IndexedDB, then restore a previous copy | Nothing restored; current state intact |
| C4 | Conflict → "Use changes from this device" | The **online** copy is saved as a previous copy *before* upload |
| C5 | C4 with recovery blocked | Upload refused; wording never claims a copy was saved |

### D. Cross-account guard (minimal, pre-Commit-4)
| # | Test | Expected |
|---|---|---|
| D1 | User A signs in, makes unsynced edits, session expires; User B signs in | A's data not shown, not uploaded, not adopted; held untouched |
| D2 | Same, but User A signs back in | A's data still there and usable |
| D3 | Pre-upgrade install, first verified login | Claims the existing data (documented limitation) |

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
| F3 | Coach Max recap opens; charts render | Unaffected |
| F4 | Offline for a session, then reconnect | No data loss, pending state accurate |
| F5 | Explicit "Replace this device with the online copy" | Confirms, snapshots, replaces |
