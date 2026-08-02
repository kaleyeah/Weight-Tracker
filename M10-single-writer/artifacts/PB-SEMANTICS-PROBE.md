# PB v0.39.8 hook/transaction semantics — probe evidence (M10 round-3 item 2)

Local disposable PocketBase v0.39.8 on the VPS (binary from the official
release; production untouched). Hooks: artifacts/probe.pb.js.

Results (raw run 2026-08-02):
- Q1 route-handler transactions: `$app.runInTransaction` in a routerAdd
  handler covering a cross-collection read (lease) + write (doc): WORKS.
- Q1b rollback: a throw after the in-tx write leaves the record
  unchanged: {"errored":true,"valUnchanged":true}.
- Q1c SERIALIZATION (the load-bearing fact): a steal fired mid-flight
  against a deliberately slow write transaction BLOCKED for 652ms until
  the write transaction committed, then applied fence 2. The slow
  transaction had read fence 1 and committed writerFence 1 — i.e.
  transactions serialize on the database's single-writer; with fence
  validation and content mutation inside ONE transaction, an ownership
  change can never interleave between check and write.
- Q2 raw-PATCH fencing: `onRecordUpdateRequest` can read the lease
  collection and reject PRE-WRITE on a stale `x-probe-fence` header
  (400 before mutation); a current fence passes and the hook can stamp
  fields.
- Q3 recursion: a programmatic `e.app.save()` inside
  `onRecordAfterUpdateSuccess` completes without re-firing loops or
  deadlock (777→778 observed, no hang).
- Q4 create path: `onRecordCreateRequest` fires (creation is fenceable).
