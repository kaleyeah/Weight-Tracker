# M10 write-surface matrix v5.1 — companion to design v9

Fully rewritten (round-7 item 14; platform wording corrected per round-8 item 6). Supersedes v4 entirely. Derived from
the live tree at build `2026-08-02.416-fx` (all line numbers re-verified
against it). Contains NO hook-based photo fencing and NO automatic
retry-after-stale behavior: photo server writes go through the three
transactional photo routes of design v9 §photo, client photo mutations
ride the verified `wl_photo_ops__<uid>` queue ordering (G4/G5), and
every stale-fence outcome lands in explicit displaced review (G6).

266 dispatcher actions; 96 mutating; 92 GATED (pre-mutation m10Gate at
handler entry); 4 exempt (device-local only). Composite actions list
EVERY class they touch. Photos are CONTENT and gated.

## 1. Dispatcher actions

| action | classes | gate |
|---|---|---|
| `act:addcat` | core | m10Gate |
| `act:del` | core | m10Gate |
| `act:toggle` | core | m10Gate |
| `cal:expand` | device-local | EXEMPT (device-local) |
| `cal:ignore` | core | m10Gate |
| `cal:overwrite` | core | m10Gate |
| `cal:sel` | device-local | EXEMPT (device-local) |
| `cal:usecalc` | core | m10Gate |
| `cardio:del` | core, training | m10Gate |
| `cardio:save` | core, training | m10Gate |
| `cf:newtype` | core | m10Gate |
| `conn:remove` | core | m10Gate |
| `day:clear` | core, photos, training | m10Gate |
| `ex:clearall` | training | m10Gate |
| `ex:del` | training | m10Gate |
| `ex:save` | training | m10Gate |
| `ex:seedall` | training | m10Gate |
| `exseed:add` | training | m10Gate |
| `fb:done` | training | m10Gate |
| `fb:set` | training | m10Gate |
| `glp:compoundsave` | core | m10Gate |
| `glp:dose:del` | core | m10Gate |
| `glp:dose:save` | core | m10Gate |
| `glp:enable` | core | m10Gate |
| `glp:showdue` | core | m10Gate |
| `glp:siterot` | core | m10Gate |
| `glp:skip` | core | m10Gate |
| `glp:sym:del` | core | m10Gate |
| `glp:sym:newsave` | core | m10Gate |
| `glp:sym:save` | core | m10Gate |
| `glp:symptoms` | core | m10Gate |
| `glp:titration` | core | m10Gate |
| `hk:import` | server-direct | m10Gate |
| `invite:create` | core | m10Gate |
| `invite:join` | core | m10Gate |
| `lift:del` | core, training | m10Gate |
| `lift:save` | core, training | m10Gate |
| `lift:savedetail` | core, training | m10Gate |
| `macro:keep` | core | m10Gate |
| `macro:suggest` | core | m10Gate |
| `max:open` | core | m10Gate |
| `night:toggle` | core | m10Gate |
| `note:del` | training | m10Gate |
| `note:save` | training | m10Gate |
| `ob:back` | core | m10Gate |
| `ob:recalc` | core | m10Gate |
| `pb:pwsave` | device-local | EXEMPT (device-local) |
| `preset:del` | core | m10Gate |
| `reminder:add` | core | m10Gate |
| `reset:do` | core, photos | m10Gate |
| `ri:mv` | training | m10Gate |
| `ri:pick` | training | m10Gate |
| `ri:prog` | training | m10Gate |
| `ri:remove` | training | m10Gate |
| `rt:del` | training | m10Gate |
| `rt:new` | training | m10Gate |
| `rt:save` | training | m10Gate |
| `set:activity` | core | m10Gate |
| `set:sex` | core | m10Gate |
| `set:strategy` | core | m10Gate |
| `set:theme` | core | m10Gate |
| `set:ttype` | core | m10Gate |
| `set:units` | core | m10Gate |
| `set:weekstart` | core | m10Gate |
| `skip:calories` | core | m10Gate |
| `skip:sleep` | core | m10Gate |
| `skip:steps` | core | m10Gate |
| `skip:weight` | core | m10Gate |
| `status:end` | core | m10Gate |
| `status:endnow` | core | m10Gate |
| `status:save` | core | m10Gate |
| `sum:toggle` | core | m10Gate |
| `sync:pasteapply` | device-local | EXEMPT (device-local) |
| `tdee:apply` | core | m10Gate |
| `tdee:later` | core | m10Gate |
| `weight:add` | core | m10Gate |
| `weight:del` | core | m10Gate |
| `wo:addset` | training | m10Gate |
| `wo:begin` | training | m10Gate |
| `wo:bwsave` | training | m10Gate |
| `wo:delset` | training | m10Gate |
| `wo:discard` | training | m10Gate |
| `wo:discardnow` | training | m10Gate |
| `wo:endnow` | training | m10Gate |
| `wo:exaddset` | training | m10Gate |
| `wo:exmove` | training | m10Gate |
| `wo:exremove` | training | m10Gate |
| `wo:finish` | training | m10Gate |
| `wo:finishback` | training | m10Gate |
| `wo:log` | training | m10Gate |
| `wo:replacepick` | training | m10Gate |
| `wo:replsave:fwd` | training | m10Gate |
| `wo:resume` | training | m10Gate |
| `wo:skipset` | training | m10Gate |
| `wo:skipthem` | training | m10Gate |
| `wu:no` | training | m10Gate |

## 2. Non-action writers

| writer (function) | stores | gate location | endpoint | fence | stale recovery / exemption |
|---|---|---|---|---|---|
| `hkTryFetch` (Health apply) | core (`wl_v1` weights/steps/sleep/food/bodyfat/waist/leanmass), server `health` clear | m10Gate + async REVALIDATION at the apply step (after the fetch resolves) | commit route (`core`) + mailbox clear | yes (core) | coreStale → displaced-core review; health clear is mailbox |
| `applyImport` (backup restore) | core + training | m10Gate at action entry + revalidation pre-apply (file picker is async) | commit route (both subsystems) | yes | per-subsystem displaced review |
| `migrateProgressionTypes` (boot) | `wl_training_v1` local | EXEMPT: local normalization pre-gate; reaches the server only via gated paths | — | — | n/a |
| `resyncAllActivityTags` | core tags | inherits caller (runs only inside acked/adopted transitions, M8 §5b) | via caller | via caller | n/a |
| `cloudPush` (core push) | server `data` | n/a (transport; every caller is gated) | commit route (`core`) | yes | coreStale/fenceStale → displaced-core review |
| `m8Push`/M8 internals | server `training` | n/a (transport) | commit route (`training`) | yes | fenceStale → M8 conflict (typed terminal, D6) |
| `m8CxChooseLocal`/`ChooseServer` | training + conflict keys | m10Gate (user actions) | commit route | yes | M8 flows |
| `pushDataPromise` (pre-import) | server `data` | inherits import gate + revalidation | commit route (`core`) | yes | coreStale → displaced-core review |
| `pbForceLogout` push | server `data`+`training` | EXEMPT from lease gate (M8 logout gate governs); pushes fence-carrying | commit route | yes | refusal keeps device signed in |
| coach request (`max:*`) | server `coachreq` | EXEMPT (mailbox) | raw PATCH mailbox-only | no | §6 mailbox rule |
| NAS coach jobs | coach-owned fields inside `data` + `health` clear | server-side | PLATFORM WRITER ROUTE (design v9 §2: superuser middleware, field-scoped patch-data read-modify-write inside one transaction, `coreRev` incremented, idempotent) — never raw full-snapshot PATCH | platform identity (bypasses device lease, never revision safety or field ownership) | no expectedRev conflict exists: concurrent platform/device calls SERIALIZE on the transaction and each applies to the transaction-current snapshot; a transaction error returns a typed failure with no ledger row and the job re-invokes with the SAME idempotency key (replay-safe); logged payload-free |
| health Shortcut | server `health` | external | raw PATCH mailbox-only | no | §6 |

## 3. Photo surface — client mutations (queue-ordered, G4/G5)

Local primitives in the tree: `idbAdd` (5953), `idbDelete` (5956),
`idbClearAll` (5957), wrapped at 9947+ (`idbAddLocal` et al.). Under
M10 every content photo mutation follows design v9's verified-queue
ordering: queue entry verified BEFORE any local blob/server mutation;
entries clear only on acked outcomes; `fenceStale` → DISPLACED review
entry (never auto-retry, never local-despite-remote-failure).

| entry (live `.416` site) | primitive(s) | gate | M10 ordering |
|---|---|---|---|
| `photo:add` (7571) → `wl-photo-input` change listener (7771), food branch (7780) | processImage → idbAdd | m10Gate at entry AND revalidation inside the async change listener, pre-mutation | add: queue intent verified → blob written+verified → transactional upload route |
| `pphoto:add` (7572) → same listener, progress branch (7774: idbDelete old + idbAdd) | idbDelete + idbAdd | same | replace = delete tombstone + add intent, each queue-ordered |
| lightbox delete (`act==="del"`, 6106) | idbDelete | m10Gate (lightbox is reached from gated views; the confirm callback revalidates) | delete: tombstone verified (blob recoverable) → route ack → local delete |
| lightbox "Edit meal type" (10034–10038) | metadata PATCH + local rec update | revalidation inside the confirm callback | metadata: intent (old+new) verified → transactional metadata route ack → local apply |
| `day:clear` photo pruning (7575/7581: idbByDate → idbDelete loop) | idbDelete ×N | m10Gate (composite: core+training+photos) | each member a queue-ordered delete |
| `reset:do` (7666: idbClearAll) | idbClearAll | m10Gate (composite) | journaled clear batch: captured member set, per-member outcomes, restart-resumable (design v9 §clear) |
| `wl-pbk-import` change (7765 → idbAdd loop at 5997–5999) | idbDelete (dupes) + idbAdd ×N | revalidation pre-loop | each member queue-ordered |
| object-URL/thumbnail caches, `photoURLs` revocation, `srPhotoInvalidate` | in-memory only | EXEMPT (non-content) | n/a |

## 4. Photo surface — server transport (transactional routes, G1–G3)

The `.416` transport (`pbPhotoUpload` 9835/9853 raw POST,
`pbPhotoDelete` 9856/9858 raw DELETE, reconciliation PATCH 9927,
wrapped-idb dispatch 9947+, `photoSync` 9868) is REPLACED under M10:

| operation | M10 endpoint | validation (one `runInTransaction`) | stale outcome |
|---|---|---|---|
| upload | transactional photo-create route | fence + byte-bound identity (op+user+localId+canonical meta+length+sha256, server-computed) + ledger; result carries `resultRecordId` | `fenceStale` → queue entry DISPLACED; review after takeover; Apply revalidates fresh server state (G6) |
| metadata update | transactional photo-patch route | target resolved in-tx, `record.user === auth user` BEFORE lease check (G3); old→new identity; ledger | same |
| delete | transactional photo-delete route | same ownership-first resolution; captured identity; already-gone replays success | same |
| raw user photo CREATE/PATCH/DELETE | — | REJECTED when enforcement is on | n/a |

There is no "stays local, photoSync retries" behavior anywhere in the
M10 contract: a failed or displaced operation is a durable queue entry
with an explicit state, resolved only by ack, replay, or reviewed
Apply/Discard.

## 5. Photo pull/reconciliation (non-holder safety)

`photoSync` (9868) today can download, delete, and relabel local
photos. Under M10 it is a content mutator: every adoption
(download/delete/relabel of a local photo) is gated and REVALIDATED
immediately before its IndexedDB transaction; a non-holder's photoSync
performs ZERO local and ZERO server mutations (evidence plan §8.6);
local-and-server-both-changed enters explicit review, never
server-wins.

## 6. Sync + async delayed-mutation surface

| entry (live `.416` site) | effect | gate | recovery |
|---|---|---|---|
| `sync:push` (7646) | `cloudPush(true)` — server core write | m10Gate | coreStale/fenceStale → displaced-core review |
| `sync:pull` (7645) | askConfirm → `cloudPull(true)` REPLACES local core | m10Gate at entry + revalidation inside the confirm callback | clean-state-only adoption (journaled, F10); else displaced rules |
| boot pulls (`autoSync` via 10091) | core+training adoption | clean-state-only per subsystem protocols (newest-date heuristic RETIRED) | M8/core adoption journals |
| `wl-import` change (7759) | applyImport (core+training) | revalidation pre-apply | per-subsystem displaced review |
| askConfirm callbacks that mutate (`day:clear`, `reset:do`, `sync:pull`, `glp:*:del`, lightbox delete, restore) | delayed mutation after user pause | revalidation inside the callback, before mutation | refuse → takeover sheet, zero mutation |
| `hkTryFetch` apply step | core write + health clear | revalidation pre-apply (after network fetch) | coreStale → displaced-core review |

Rule of the section (design v9 §async): handler-entry gating proves
nothing once mutation occurs after an await, callback, picker, share
sheet, timer, or network fetch — every such site revalidates
immediately before the mutation it authorizes.
