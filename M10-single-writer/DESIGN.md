# M10 — one active writing device: design v1 for review

Engineer draft, 2026-08-02. Owner direction: M10 ahead of M9 (recorded,
compound-app PROJECT_LOG). Scope: the single-writer rule ONLY — the
HealthKit-import half of M10 stays gated on the reviewed M7b package.
Base: released `2026-08-02.415-m8` (`5bda0da5…1ba35ee3`); M8's journaled
CAS sync is the substrate and the backstop.

## 1. What it is, plainly

Two devices (iPhone + iPad) signed into one account. Both read
everything. Exactly ONE holds the pen at a time. The other says so, and
offers a one-tap "Take over writing here." M8 conflicts remain the
backstop for anything that slips through; the lease exists so conflicts
become rare instead of routine.

## 2. The lease (server side)

A new `writerLease` field on the appdata record, managed ONLY by a new
CAS-kit route (`POST /api/cf/appdata/lease`), same shared-module
pattern, hook reviewed then deployed to the NAS like the CAS kit:

- `{deviceId, deviceName, acquiredAt, renewedAt, leaseSeq}` or null.
- Ops: `acquire` (succeeds if lease null/expired/own), `renew` (own
  lease only), `release` (own lease only), `steal` (explicit takeover:
  succeeds ALWAYS, bumping `leaseSeq` — the previous holder discovers
  on its next renew/write and demotes itself).
- TTL: a lease is expired when `renewedAt` is older than 3 minutes.
  Clock source is the SERVER's time on write; clients never compare
  their own clocks to it (they compare leaseSeq and identity only).
- The route touches ONLY `writerLease` (field isolation, provable the
  same way as the training route).

## 3. The client rule

- Stable per-install `deviceId` (crypto-random, stored once); a human
  `deviceName` ("Griffin's iPhone", editable in Settings).
- The ACTIVE device: renews the lease on app-open and every 60s while
  foregrounded; releases on clean background/close where the platform
  allows (best-effort; TTL is the truth).
- A NON-holder device: fully readable; every WRITE entry point (the
  same `saveTraining`/core-save choke points M8 already owns) is
  gated: attempting an edit surfaces "Your iPhone is the active writer.
  Take over on this iPad?" One tap = `steal` → this device becomes the
  writer → the edit proceeds. No modal maze: read freely, one tap to
  write.
- A DEMOTED device (lost the lease mid-session): its next write
  attempt is gated the same way; any UNSYNCED work it still holds
  pushes normally under M8 rules — the lease governs new writes, never
  blocks the sync of already-made ones (data durability outranks the
  lease).
- Offline: a device that cannot reach the lease route falls back to
  M8 semantics unchanged (write locally, dirty, retry). The lease is an
  online courtesy, not a data gate; M8 conflicts absorb the rare
  offline double-write.

## 4. What this deliberately is NOT

- Not a lock on reading, pulls, exports, or the coach.
- Not a second conflict system: one source of write-truth (CAS revs +
  M8 journals) — the lease only reduces contention.
- Not HealthKit import (M7b-gated) and not lockdown (its own decision).

## 5. Evidence plan

- Server: route suite (acquire/renew/release/steal/expiry/field
  isolation) on disposable users against the real hook, same standard
  as the M8 PB gate.
- Client: browser suites — two contexts, one account: writer renews;
  reader gated with the takeover affordance; steal demotes the holder
  on its next renew; demoted device's unsynced work still pushes;
  offline fallback to pure M8; no lease call can loop or block boot.
- The M8 suites re-run unchanged (the lease must not perturb them).

## 6. Sequence

1. This design → Architect review.
2. Server hook (reviewed) → NAS deploy over the SSH channel → disposable
   route gate.
3. Client implementation (inside delimited blocks, same discipline) →
   evidence rounds.
4. Release package, Owner decision, publish, device check — iPhone AND
   iPad this time.

## Questions for the Architect

1. TTL value and renew cadence (3 min / 60 s proposed).
2. `steal` as always-succeeds with discovery-by-seq (proposed), vs a
   confirm handshake through the server.
3. Whether the lease field rides the existing appdata record (proposed)
   or its own collection.
