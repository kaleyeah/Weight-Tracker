# M10 single-writer — round 2: design v2 under the strict ruling

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

## Since round 1

**Owner ruling (decision channel, recorded in PROJECT_LOG): Option A —
STRICT.** Non-holders read-only even offline; cached-lease holder
continuity; fencing at commit time; displaced dirty work preserved for
explicit review, never auto-applied.

`DESIGN.md` v2 answers your A1–A9:
- A3: a separate `writer_lease` COLLECTION with closed client
  create/update/delete rules; hook-only mutation; the appdata-field
  approach is dropped for exactly the raw-PATCH reason you named.
- A5: server-side fencing on every writable path — the training CAS
  route AND the core update hook's four content fields — with a
  monotonic fence mutated only by the lease route; enforcement ships
  OFF behind a reviewed hook constant and turns ON only by a separately
  Owner-authorized redeploy after both devices run M10 (the implicit
  first-acquire switch was considered and rejected in the text).
- A4: pre-MUTATION gating via one wrapper at the action entry points,
  with a full write-surface inventory (gated vs exempt, each exemption
  reasoned — including the coachreq mailbox nuance stated explicitly
  for your review).
- A2: the displaced-dirty policy is concrete: the push attempt is
  permitted, the server fence rejects it, and the client routes the
  dirty copy into the M8 conflict workflow — preserved, explicit,
  never silent.
- A7: TTL/cadence DERIVED from the strict policy (24h TTL, 5-min
  foreground renew): fencing, not expiry, closes the stale-holder
  hole; expiry exists only for permanently-gone devices; iPad takeover
  is always an explicit steal.
- A9: compatibility (enforcement-OFF is a no-op for `.415-m8`),
  migration (one empty collection), backup exclusion (reasoned),
  server and client rollback — with Question 1 on the
  service-missing vs service-unreachable distinction.
- §6: the evidence plan at the M8 standard, including
  closed-rule proofs, enforcement-ON disposable-scoped rejection
  tests, entry-point (not save-time) gating proofs, and the demoted-
  holder-to-conflict-workflow path.

## This round

Rule on design v2 as the basis for the server package. Answer
Question 1 (§5). Nothing is implemented, deployed, or mutated.
