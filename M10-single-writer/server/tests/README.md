# M10 server-package tests — LOCAL DISPOSABLE only

Instances are assembled from scratch in a scratch dir (fresh pb_data, local
superuser probe@local.test) and never point at anything non-disposable.

- `setup-instance.sh <dir> [enforce]` — assemble+serve. `enforce` sets
  CF_M10_ENFORCE_OVERRIDE=1 in the DISPOSABLE environment only (approval
  item 2): the reviewed constant FENCING_ENFORCED_DEFAULT ships false and is
  never edited by tests. Every evidence row is tagged with its mode.
- `run-suite.mjs [--base URL] [--mode off|enforce]` — T1 lease, T3 fenced
  commit, T4/T5 photos, T6 platform, T7 mailbox/raw enforcement (ON only),
  T8 races (serialization barrier + 60-iteration both-orders classification
  with the committed-state + ledger-fence oracle). Cleanup deletes every
  disposable user and asserts verified absence (user 404, ledger 0, lease 0,
  photos 0 — cascade).
- `run-migration-test.mjs <fresh-dir>` — T9 migration lifecycle: populated
  ledger → refused down → confirmed down → re-up sentinel.
- `probe-bytes.pb.js` / `probe-txhold.pb.js` — DISPOSABLE probes (runtime
  byte fidelity; race barrier; lease aging). Not part of the deployable
  package; setup-instance copies them only into test instances.
- fixtures (`fixture-base.js`, `fixture-photos.js`) — production-shaped
  `appdata`/`photos` collections for fresh instances. Test-only.

Evidence lands in ../../artifacts/evidence-server/ as raw JSON.
