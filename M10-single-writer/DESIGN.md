# M10 — strict single writer: design v3

Engineer, 2026-08-02, per round-2 items 1–11 (answered as B1–B11).
Owner ruling STRICT stands. Base: released `2026-08-02.415-m8`.
Companion: `WRITE-SURFACE-MATRIX.md` (tree-derived, B8).

## 0. The invariant, stated honestly (B2)

**Exactly one fence may authorize server mutation.** At every moment the
server accepts content writes from at most one (deviceId, fence) pair,
atomically enforced. A partitioned former holder can still EDIT LOCALLY
(it cannot observe a steal); those edits can never commit under its
stale fence and are preserved durably for explicit reconciliation. M10
does not claim to stop offline local typing — physics forbids it; it
claims one server pen, always, plus lossless capture of stranded work.

## 1. The lease row (B3 — no ABA, ever)

One DURABLE row per user in the closed `writer_lease` collection,
created on first acquire and NEVER deleted during normal operation:
`{user(unique), holderDeviceId|null, deviceName, fence(int), renewedAt,
active(bool)}`.
- fence increments on EVERY ownership event: grant, steal,
  post-expiry acquisition, and release (release sets
  holderDeviceId=null, active=false, fence+=1 — a released fence can
  never validate again).
- Strictly-increasing proof: every route response echoes fence; the
  route rejects any transition that would not increase it; tests assert
  monotonicity across grant/steal/release/expiry cycles.
- Overflow: int64 via PB number field; at 1 event/second this outlives
  the sun — asserted, and the route hard-errors (blocks) rather than
  wraps if fence exceeds 2^53-2 (JS safe-integer guard).
- Server rollback (B1): SEQUENCED — (1) redeploy hooks with
  FENCING_ENFORCED off, verify; (2) publish + both-device-verify a
  client that no longer consults the lease; (3) only then remove the
  route/collection. A 404 on the route is NEVER permission to write:
  clients treat missing and unreachable identically (fail closed —
  cached-valid holder continues locally; everyone else read-only).

## 2. Atomic fencing (B4 — designed, not asserted)

PocketBase JSVM hooks support `$app.runInTransaction`. Both writers
serialize on the SAME lease row:
- **Content write** (CAS commit route AND the appdata update hook):
  one transaction: `SELECT` the user's lease row (the row lock under
  SQLite's single-writer transaction model serializes all contenders) →
  validate `fence === request.fence && holderDeviceId ===
  request.deviceId && active` → perform the content mutation →
  commit. Any mismatch → rollback + `409 {fenceStale:true,
  fence:<current>}`.
- **Lease mutation** (acquire/renew/release/steal): its own
  transaction on the same row. SQLite's serialized writes mean an
  ownership change either commits before a content transaction reads
  the row (content sees the new fence and rejects) or after it commits
  (the steal takes effect next write). No check-then-write window
  survives.
- Evidence (B4): a forced-race test on the disposable gate — two
  concurrent requests (steal ‖ fenced content write) fired repeatedly
  (100 iterations); the invariant checked after each: the content write
  landed iff its fence was current at commit; no lost/mixed state.

## 3. Fence transport and authentication (B9)

- CAS commit route: `fence` + `deviceId` as body fields.
- Raw core PATCH: headers `X-CF-Fence`, `X-CF-Device` read by the
  update hook.
- Binding: the hook resolves the lease row by `@request.auth.id` ONLY —
  the client-supplied pair is compared against that row; a spoofed
  deviceId without the matching current fence fails; a spoofed fence
  without the holder's deviceId fails. `deviceName` is display-only and
  appears in no comparison.
- Malformed/missing/duplicated values → `409 fenceStale` when
  enforcement is on (fail closed); ignored when off.
- deviceId: crypto-random 128-bit, generated once per install, stored
  outside content (device-local key), never in exports.

## 4. Displaced work — durable, per data class (B5, B6)

**Training** (proven path): on `fenceStale` from the CAS route, the
client runs fetch-WITHOUT-adoption → canonical validation →
`m8EnterConflict(serverTraining, rev, "fence-displaced")` — the
existing persist-and-verify machinery, crash-journaled end to end
(B6). Fetch failure → dirty retained, sync shows retry, nothing
dropped; server moved again by the next attempt → the newer copy is
what the conflict captures (same superseded semantics as M8). The M8
conflict UI resolves it; Choose Local requires first RETAKING the pen
(the choose action is m10-gated), so its CAS push carries the new
fence.

**Core** (new, mirrors the training pattern): a durable
`wl_core_displaced__<uid>` envelope written via the same
verified-write + journal discipline (journal op `core-displace`):
`{localData, serverData, serverFetchedAt, coreRevSeen, enteredAt,
reason, mark}` — captured on the first fence-stale core push, via
fetch-without-adoption of the server's `data` field. The app then
shows a persistent banner ("Edits from this device are waiting for
review") with a review sheet presenting PER-CLASS summaries derived
from the one envelope (weigh-ins, food days, GLP entries, notes,
settings — counts and dates differing), an export-both affordance
(format-2 files), and two explicit actions after retaking the pen:
**Push mine** (re-push localData under the new fence) or **Take
server** (adopt serverData locally, discard localData — exports
already taken). Until resolved, further core pushes stay paused
(fail closed); local editing continues and updates localData through
the same envelope discipline. Photos (IndexedDB, device-local until
share) and device-local bookkeeping are exempt (matrix).
This satisfies "separate durable displaced storage and recovery" for
every enforced class; nothing rejected lives only in memory.

## 5. Mailbox fields — one contract (B7)

`coachreq` and `health` are EXEMPT from fencing, with the server
enforcing the exemption's safety: the update hook REJECTS any PATCH
that mixes a mailbox field with any content field (`data`, `training`)
or revision field, whether fenced or not. Mailbox-only writes need no
fence (a read-only iPad may request a recap; the Shortcut may deliver
health lines). Content-bearing writes are always fenced. Tests: mixed
PATCH rejected; mailbox-only accepted unfenced; content-only rejected
unfenced (enforcement on).

## 6. Client gating and cached expiry (B10 + matrix)

- `m10Gate` wraps the ACTION DISPATCH entry for every G-class action in
  the matrix (pre-mutation: the handler body never runs ungated), plus
  the non-action entries listed there.
- Cached grant: `{fence, deviceId, ttlMs, grantedServerNow,
  perfDeadline: performance.now()+ttlMs}` held in memory; a persisted
  copy stores only `{fence, deviceId, grantedServerNow, ttlMs}`.
  Across reload/reboot the monotonic clock is LOST: the persisted copy
  alone never authorizes offline writing — on boot the client must
  revalidate online (renew) before it counts as holder; failing that
  it is read-only (fail closed, B10). Offline-holder continuity
  therefore survives foreground/background within a session, not
  reboots. Corrupt/unverifiable cached grants → read-only + banner.
- TTL/cadence stay 24h/5min PROVISIONAL, revisited with lifecycle
  evidence in the client rounds (B10 accepted).

## 7. Enforcement compatibility gate (B11)

Every writer, enumerated from the tree and the NAS:
1. Owner iPhone + iPad on the M10 client — fence-carrying.
2. NAS coach jobs (run-coach/coach-watch): superuser-context writes of
   `nightlySummary`/`weeklySummary`/`scriptVer`/`nightlyLog` inside
   `data`, and clearing `health`. RULE: superuser requests bypass user
   fencing (stated, hook-tested) — they are the platform, not a device.
   Their fields ride inside `data`, so the mixed-PATCH rule exempts
   superuser context explicitly.
3. The health Shortcut: user-token, `health`-only (mailbox rule).
4. In-app imports/restores: gated + fenced (matrix).
5. No other writers exist (rules closed; verified in the gate by
   attempting every path).
The enforcement redeploy checklist re-verifies this enumeration on the
day, plus both devices on the M10 build, before flipping
FENCING_ENFORCED — one Owner-authorized server change, deliberately
able to ride together with raw-PATCH lockdown.

## 8. Evidence plan (delta from v2)

Adds: the §2 forced-race suite; §1 monotonicity-across-lifecycle and
release-fence-bump tests; §3 spoof/malformed transport cases; §4
displaced-CORE capture/review/resolve suite incl. crash journaling at
each phase and fetch-failure arms; §5 mixed-PATCH matrix; §6
reboot-loses-monotonic fail-closed case; §7 every-writer probe. All at
the M8 standard (disposable users; postcondition bytes; request
counts; suites re-run unchanged).

## 9. Sequence

Unchanged from v2 §7, with the §7 compatibility checklist inserted
before the enforcement redeploy.
