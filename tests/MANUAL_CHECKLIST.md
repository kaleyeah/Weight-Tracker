# Manual browser checklist — M1–M4

**Last Updated:** 2026-07-25

**Status:** Active

The Node suite (`node tests/run-all.js`) covers the decision logic. These flows need a
real browser (IndexedDB, two accounts, session expiry) and must be run against a
staging PocketBase — **not** production data — before release.

Record pass/fail and the build tested.

---

## M1 — Photo account scoping

### 1. Two-user privacy (the blocker)
1. Log in as **User A**. Add ≥2 photos. Wait for sync ("Synced").
2. Log out.
3. Log in as **User B** (same device).
4. Verify:
   - [ ] User A's photos are **not displayed** anywhere (Photos, Diary, week strip).
   - [ ] User A's photos are **not uploaded** into B's account (check B's server records).
   - [ ] B's photo list contains **only** B's records.
   - [ ] No photo is deleted from A's server account.
5. Log back in as **User A**.
   - [ ] A's photos are still present (locally or re-downloaded).

### 2. Session expiry with a pending photo
1. Add a photo while signed in as A.
2. Invalidate the token before upload (change password on another device, or clear the token).
3. Verify:
   - [ ] The photo is still stored locally.
   - [ ] The app shows a re-authentication state, not a wipe.
4. Sign back in as **the same account**.
   - [ ] The photo uploads to A's account.

### 3. Legacy (ownerless) photos
1. Seed IndexedDB `wl_photos` with a record that has **no** `ownerId`.
2. Verify:
   - [ ] It is not displayed and not uploaded.
   - [ ] The account card offers "Add to this account" / "Remove from device".
   - [ ] "Add to this account" makes it visible and syncs it.
   - [ ] Logging in as a different user does **not** offer them that photo's content.

### 4. Account-scoped local clear
- [ ] "Remove this account's local photos from this device" removes only local copies.
- [ ] Server copies survive; next sync re-downloads them.

---

## M2 — Pagination

1. Create/mock **501** server photo records for one account.
2. Run a sync.
   - [ ] No local photo is deleted merely because it fell past the first page.
   - [ ] All 501 are enumerated (check network tab: multiple `page=` requests).
3. Interrupt pagination mid-way (offline after page 1).
   - [ ] **No** local deletion occurs.
   - [ ] A recoverable sync error is surfaced ("photo list incomplete").
4. Delete one photo on device B, sync device A.
   - [ ] With a complete enumeration, that one photo is removed on A.

---

## M3 — Revisions

### In-flight edit (the blocker)
1. Make edit **A**; let the debounced push begin.
2. Before it finishes, make edit **B** (throttle the network to widen the window).
3. On completion of the first request, verify:
   - [ ] The app is still **dirty** (status not "Synced").
   - [ ] Edit **B** still exists locally.
   - [ ] A second push is scheduled/executed.
   - [ ] Only the second successful push marks it clean.
4. Reload — [ ] edit B survives and is uploaded.

### Failure paths
- [ ] Push fails (server down) → stays dirty, retries; nothing marked clean.
- [ ] App closed during debounce → on next open, changes still pending and push.
- [ ] Training edit failing to push is retried, not swallowed.

---

## M4 — Reconciliation

### Local GLP-1 edit vs newer remote weight
1. Sync both devices.
2. Device A: log a **GLP-1 dose** offline.
3. Device B: log a **newer weight**, sync.
4. Reconnect A.
   - [ ] The dose is **not** silently deleted.
   - [ ] A conflict choice is presented, default = keep this device's data.
   - [ ] Choosing "Use the server copy" writes a recovery snapshot first.

### Historical correction vs newer daily record
1. Device A corrects an **older** food/note entry.
2. Device B logs **today's** weight; sync.
3. Reconcile on A — [ ] the correction is not silently discarded.

### Equal newest dates
1. Both devices edit **different fields on the same latest date**.
2. Reconcile — [ ] equal dates are not treated as proof either snapshot wins.

### Expired session
1. Make unsynced edits.
2. Expire authentication. Reload.
   - [ ] All local changes remain.
   - [ ] Revisions/pending state remain (still dirty).
   - [ ] No authenticated requests are retried in a loop.
3. Re-authenticate as the same user — [ ] sync resumes without replacing local changes.

### Manual pull / pull-to-refresh
- [ ] Ordinary refresh with dirty local data does **not** replace it (reconciles or conflicts).
- [ ] "Replace this device with server copy" is explicit, confirmed, and snapshots first.

### Logout with unsynced changes
- [ ] Offers "Upload, then log out" as the default.
- [ ] "Log out anyway" takes a recovery snapshot before wiping.

### Recovery
- [ ] Snapshots are listed on the account card (max 3 per account).
- [ ] Restoring one snapshots the current state first, then restores.
- [ ] A restored state is marked dirty and uploads.

---

## Regression sweep (existing behavior must survive)

- [ ] Log a weigh-in, food, cardio, a lift session — all persist and sync.
- [ ] GLP-1 dose + symptom logging, site rotation.
- [ ] Progress photos: add, view in lightbox, reassign a food photo's meal, delete.
- [ ] Coach Max daily recap generates; "Complete today" works.
- [ ] Apple Health import applies weight/body fat/steps/sleep.
- [ ] Charts, trend/pace/forecast render.
- [ ] Theme switch, settings changes persist.
- [ ] Install as PWA; self-update banner behaves.
