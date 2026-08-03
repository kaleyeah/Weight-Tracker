# M10 client increment 1 — writer-lease client

Commit 1ea4078 on engineering/m8 (base: a599efa = the live `.416-fx`
client synced byte-identical, sha 08a3f6bd…). Exact change:
`INCR1-DIFF.patch` (150 lines).

## Block boundaries
- `/* ================= M10-BLOCK-1: writer-lease client … */` …
  `/* =============== M10-BLOCK-1-END =============== */` — inserted
  immediately after `M8-END-OF-ALL-BLOCKS` (which is preserved
  verbatim as the block's opening line context in the patch).
- ONE line outside the block, marked `/* M10 wiring: lease lifecycle
  boots with sync */`: `m10Boot()` added to the existing
  `pbRefresh(...)` boot callback before `autoSync()`.

## What it implements (design v9.1 §3/§4/§5)
- Stable per-install `wl_m10_deviceid` (verified write; failure →
  corrupt/read-only, no acquire attempted).
- `m10LeaseCall` on the reviewed route contract; acquire on boot;
  renew every 5 min foregrounded + on visibility return; typed-stale
  renew revokes holding immediately; transport-failed renew never
  extends the monotonic in-memory deadline.
- Persisted grant `wl_m10_grant__<uid>` is informational ONLY: an
  offline reload is NOT a holder (fail closed, tested); a corrupt
  grant → read-only + corrupt flag, takeover NOT offered from the
  corrupt state (G11 spirit at the grant layer).
- `m10Gate`: passes for a local-only app (no sync account) or a
  current holder inside the deadline; otherwise fails closed and
  offers the takeover sheet ("Another session is the active writer
  ("<deviceName>"). Take over on this device?" — session wording,
  never a physical-device claim, D10).
- Takeover = lease steal → verified grant apply → toast + render.

## Deliberate increment-1 limits (deferred, in dependency order)
- No dispatcher action consults `m10Gate` yet — tested as case F:
  a non-holder's local write still works, so live behavior is
  UNCHANGED. Gate wiring is the last increment, after the protocols
  it guards exist.
- Fence transport on commits: increment 2 (core durability).
- Displaced flows, photo queue, logout coupling: increments 3–5.

## Evidence
- `INCR1-C15-OUTPUT.txt` — C15-M10 suite, 14/14: fresh-boot acquire +
  gate pass + verified grant; held-by-other read-only + sheet naming
  the session label + steal (mock fence 6→7 agreed by both sides);
  offline-reload fail-closed despite a valid persisted grant; corrupt
  grant read-only WITHOUT takeover; typed-stale renew revocation;
  increment-1 safety (non-holder local write unchanged); deviceId
  stability. The mock lease implements the disposable-PB-proven
  semantics (monotonic fence, held 409, typed stale, D-ABA, expiry).
- `INCR1-M8-REGRESSION.txt` — the full existing M8 + C14 browser
  suites rerun against the increment-1 client (M8 preserved outside
  the block).
