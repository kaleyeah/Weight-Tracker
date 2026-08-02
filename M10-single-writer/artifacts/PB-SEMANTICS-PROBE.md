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
- Q3 (corrected description per M10 round-4 item 3): a programmatic
  `e.app.save()` inside `onRecordAfterUpdateSuccess` — an AFTER hook —
  completes without loops or deadlock (777→778, no hang). This says
  NOTHING about saves inside `onRecordUpdateRequest` or request-hook
  recursion; it is not cited for that, and the v5 architecture removes
  the need (no request-hook writes: content moves to explicit
  transactional routes).
- Q4 create path: `onRecordCreateRequest` fires (creation is fenceable).

## File-backed transaction probe (round-6 item 2; hooks: probe2.pb.js)

Local disposable PB v0.39.8, raw run 2026-08-02:
- A: a multipart/file record CREATED inside `runInTransaction` commits
  with its managed file retrievable (2048 bytes round-tripped).
- B: forced rollback after the in-tx save → the record AND the managed
  file are both absent (404/404) — no orphaned file.
- C: a deliberately slow file-upload transaction serialized against a
  concurrent lease steal (steal blocked 654 ms) — same single-writer
  serialization as the content probe.
- D: transactional DELETE with forced rollback preserves BOTH the
  record and the file (200/200).
- E: committed transactional delete removes both (404/404).
Conclusion: transactional photo routes (create/delete) are viable on
the deployed PocketBase version with correct managed-file semantics in
both directions.
