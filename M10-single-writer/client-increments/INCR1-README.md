# M10 client increment 1 — writer-lease client (REVISED, round 13)

Base: commit 0389770 — `index.html` synced BYTE-IDENTICAL to live
`2026-08-02.417-fx` (sha dc2cd56f…), per round-13 item 10; both
Owner-approved `.417` changes verified present in the increment bytes
(the sessions-match recommendation and the offline toast each grep to
exactly their expected occurrence). Change: commit 08e1280, exact diff
`INCR1-DIFF.patch` (213 lines).

## Block boundaries
- `M10-BLOCK-1 … M10-BLOCK-1-END` immediately after
  `M8-END-OF-ALL-BLOCKS` (M8 blocks untouched).
- TWO marked wiring lines outside it:
  - boot: `m10Boot().then(function(){autoSync();photoSync();})` —
    the K3 contract: the lease SETTLES before any adoption runs;
  - `pbClearSession`: `m10Reset("session-cleared")` first — K2.

## Round-13 items, as landed (K1–K9 = items 1–9)
- K1 account binding: `M10.uid` set only by a validated grant apply;
  gate/renew/takeover all require `M10.uid === pbUid()`; boot
  synchronously revokes prior authority BEFORE network; an in-flight
  response for a switched-away account is discarded with a full reset.
- K2 reset primitive: `m10Reset(reason)` clears holder/fence/deadline/
  known/timer/uid + records the reason; invoked at boot start, on
  `pbClearSession` (covers logout and the auth-refresh-death path,
  which calls pbClearSession), on auth-failed renew (401/403), and on
  any detected UID change. Corruption deliberately persists
  (installation-wide storage evidence).
- K3 boot ordering: wiring awaits `m10Boot()`; C15 case J proves the
  first appdata request lands only after the delayed lease response.
- K4 conservative deadline: `deadline = sendT0 + ttlMs` (full round
  trip subtracted); grant bodies validated (ok===true, safe integer
  fence ≥1 ≤2^53−2, finite 0<ttl≤7d, holderDeviceId === our verified
  id) before ANY apply.
- K5 deviceId: crypto.getRandomValues, exact grammar
  `dev-[a-z0-9]{24}`, verified write; malformed or oversized EXISTING
  bytes → corrupt, never silently replaced.
- K6 grant validation: mark + uid + fence (safe nonneg int) +
  deviceId === current installation + finite bounded ttl/serverNow;
  foreign-uid/foreign-device/unsafe values are corruption. The
  persisted copy is informational and never restores authority; a
  failed write is recorded as `M10.grantWriteFailed` — no "verified
  apply" language anywhere.
- K7 classified renew: valid 200 extends from its OWN send time;
  typed stale → revoke reason "stale"; 401/403 → FULL reset
  ("auth-failed"); malformed 200 → "malformed-response"; other →
  "server-error"; only a TRANSPORT failure retains authority, and
  only until the unchanged deadline.
- K9 dispatcher evidence: C15 case K drives the PRODUCTION dispatcher
  (a real `data-act` click through the document handler) and keeps the
  direct-write check under its honest new name.

## Round-14 rulings, as landed (L2–L5 = rulings 2–5)
- L2 generation guard: `M10.gen` increments on every reset AND at the
  start of every superseding lease operation (boot, takeover); every
  async callback (boot acquire, renew, takeover, and their catch
  arms) captures `(uid, gen)` and discards its response unless BOTH
  still match — a superseded response neither installs stale
  authority nor revokes a newer valid grant. Tested: same-uid
  relogin mid-acquire; overlapping boots; reversed-order takeovers
  (the superseded op's later response cannot install); a late valid
  renew after a newer takeover (neither extends nor revokes).
- L3 no insecure fallback: without `crypto.getRandomValues` the
  device fails closed — no id created or persisted, NO lease request
  ever leaves the device, gate blocks (tested with zero mock
  traffic).
- L4 one strict validator: `m10ValidGrantBody` (now also requiring
  finite `serverNow`) is used by acquire, steal, AND renew — renew
  additionally requires the unchanged fence; a valid-shaped 200
  naming another device revokes as `malformed-response` (tested).
- L5 typed held-409: `m10ValidHeldBody` (safe fence, bounded ttl,
  finite serverNow, nonempty bounded holderDeviceId, string-or-null
  deviceName); anything else → `known=null`,
  reason=`malformed-response` — never authoritative takeover info
  (tested).

## Evidence
- `INCR1-C15-OUTPUT.txt` — 35/35 (was 28): all original cases plus
  the round-13 list — A→B switch mid-acquire; session-teardown reset;
  malformed + oversized persisted deviceId; foreign-uid/device grant;
  non-integer fence; unbounded ttl; malformed success body; typed
  stale vs 5xx vs 401 renew classification; response-delay deadline
  conservatism; grant-write-failure honesty; boot-ordering proof;
  real-dispatcher case.
- `INCR1-M8-REGRESSION.txt` — full client regression matrix rerun
  against the REVISED, REBASED bytes.

## Records-path contract (round-13 item 11)
The authoritative records (`reports/PROJECT_LOG.md`,
`reports/MAESTRO_PROGRAM_CONTEXT.md`) live on the repo's `main`
branch — the deployed lineage (`~/projects/compound-app` checkout).
The M10 engineering work lives on `engineering/m8`, which has never
carried `reports/` (branch layout predates M10). This is the
documented contract as invited by item 11; if the Architect prefers
records mirrored into `engineering/m8`, say so and they will be
merged rather than copied.
