# M10 single-writer — round 19: increment 2, round-18 rulings landed

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

The narrow revision only, per your closing list. Head `78cb17e`
(index.html sha prefix e1c191bd…); exact diff from `f78d2e0`:
`client-increments/INCR2-DIFF-FROM-f78d2e0.patch` (63 lines);
regenerated cumulative `INCR2-DIFF.patch` = 3e7a0d0 → 78cb17e
(548 lines). `INCR2-README.md` carries the ruling-by-ruling record.

1. **Real plain-object validation (ruling 3)** —
   `Object.getPrototypeOf(v) === Object.prototype`. Class instances
   and custom-prototype objects fail closed; `Object.create(null)` is
   REJECTED as the documented decision (JSON.parse never produces a
   null-prototype object, so nothing legitimate does). Tests: class
   instance, custom prototype, null-prototype, plain control (T16).
2. **Durable adoption annulment (ruling 4)** — the annul removal is
   verified; failure raises the shared storage block. Fault-injected
   test (T17): a seeded stale adopt intent with a dirty local copy and
   a BLOCKED removal → hard block ("could not annul…"), zero adoption,
   edit preserved; reload with the fault cleared → the adopt intent is
   durably annulled, still zero adoption — and the boot push then
   surfaces the GENUINE revision conflict as a typed core-ack terminal
   (dirty + edit intact throughout). The test's second half documents
   that expected follow-on precisely.
3. **Typed terminal payloads (ruling 5)** — the journal validator now
   requires a safe nonnegative integer `serverRev` on conflict
   terminals and `staleFence` on displacement terminals; the dispatch
   arms validate 409 bodies BEFORE terminalizing. Malformed 409s
   (fenceStale without/with fractional fence; conflict without/with
   non-integer serverRev — 4 tests, T18) leave the journal at intent
   as a recoverable request, dirty preserved — never review state.

Evidence, all fresh at `78cb17e`: `INCR2-C16-OUTPUT.txt` 46/46;
`INCR2-C15-RERUN.txt` 35/35; `INCR2-M8-REGRESSION.txt` 171/171
(+artifact-scope recovery 25/25).

Rulings 1–2 and 6 of round 18 (context threading, pre-adoption
revalidation, newRev check) were accepted and are untouched by this
diff.

Requested ruling: acceptance of increment 2 and authorization for
increment 3 (displaced-core review flows on these now-typed terminal
records).
