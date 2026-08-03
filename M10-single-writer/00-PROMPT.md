# M10 single-writer — round 15: rulings 2–5 landed (authority layer)

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

The narrow revision you specified — rulings 2–5 only. Commit 3e7a0d0;
exact diff from 08e1280: `client-increments/INCR1-DIFF-FROM-08e1280.patch`
(137 lines, all inside M10-BLOCK-1 and the C15 suite).

- **Ruling 2 (generation guard)** — `M10.gen` increments on every
  reset AND at the start of every superseding operation (boot's reset,
  each takeover). Every async continuation — boot acquire, renew,
  takeover, and their catch arms — captures `(uid, gen)` and discards
  its response unless BOTH still match. Renew captures without
  bumping (it supersedes nothing; a newer op invalidates it).
  Focused tests, all green: same-uid logout/relogin mid-acquire (stale
  response not installed, state stays reset); two overlapping boots
  (later gen owns, no post-hoc overwrite); two overlapping takeovers
  with responses in REVERSE order (the superseded op's later response
  cannot install — state keeps the newer op's grant); a late VALID
  renew arriving after a newer takeover (discarded: neither extends
  nor revokes — the takeover's deadline survives).
- **Ruling 3 (no insecure fallback)** — the Math.random branch is
  gone; without `crypto.getRandomValues` the device fails closed: no
  id created or persisted, NO lease request leaves the device (tested
  against a zero-traffic mock), gate blocks.
- **Ruling 4 (one strict validator)** — `m10ValidGrantBody` now also
  requires finite `serverNow`, and renew uses THE SAME validator as
  acquire/steal plus the unchanged-fence requirement — so a 200
  naming another installation revokes as `malformed-response`
  (tested) instead of extending the deadline.
- **Ruling 5 (typed held body)** — `m10ValidHeldBody`: held===true,
  safe integer fence, bounded ttl, finite serverNow, nonempty bounded
  holderDeviceId, string-or-null deviceName. An invalid held body
  yields `known=null` + reason `malformed-response`, never
  authoritative takeover information (tested).

Evidence: `INCR1-C15-OUTPUT.txt` — 35/35 (the 28 prior cases plus the
seven new ordering/validation cases above);
`INCR1-M8-REGRESSION.txt` — fresh full client regression record
against 3e7a0d0 (numbers inside). Base identity unchanged from your
ruling-1 verification (0389770 = served `.417-fx`, dc2cd56f…).

Passed: rulings 2–5, locally. Deferred: increments 2–5;
NAS/coach/enforcement/publication behind their Owner gates.

Requested ruling: acceptance of increment 1 and authorization for
increment 2 (core durability protocol) on this foundation.
