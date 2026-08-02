# M10 single-writer — round 11: round-10 corrections + full evidence rerun

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

Your round-10 rejection (6 correction items) is addressed in full.
Commits since your review of bb6d6d8: 0a5b70f (J1–J3 code+design),
5703bf2 (J4–J7 + rerun evidence);
`artifacts/evidence-server/DIFF-FROM-bb6d6d8.txt` lists every changed
path. All evidence below is a FRESH rerun of the corrected package in
both enforcement modes. The unrelated working-tree files remain outside
every M10 commit.

1. **Superuser content bypass ELIMINATED (code + design).**
   `cf_cas.pb.js`: under enforcement, raw PATCH passes ONLY when
   mailbox-only — for users AND superusers; a superuser content write
   answers 400 "superuser content writes must use the platform route";
   raw CREATE rejects for superusers too; `cf_m10_enforce.pb.js`
   rejects raw photo mutation for superusers as well (no documented
   operational need; cascades unaffected). DESIGN v9.1 §6 now states
   the one rule: "authentication privilege does NOT bypass
   content-write invariants — the lease is the only thing platform
   authentication bypasses." T7 now PROVES the rejection: superuser
   raw content 400, superuser mailbox 200, superuser raw create 400,
   superuser raw photo create 400, coreRev unbumped AND content
   proven untouched after the rejected write. Evidence-plan item 3's
   wording corrected (superuser-negative on the users-only route;
   superuser-positive only on the platform route).

2. **`holderDeviceHash` resolved EXPLICITLY in the authoritative
   design.** DESIGN v9.1 (committed, not implicit) renames v9's
   `deviceLabelHash` → `holderDeviceHash`, adopting your round-9
   item-3 preferred name, with the exact definition (sha256 of the
   lease row's `holderDeviceId` read inside the commit transaction —
   never `deviceName`, never a client value) and the complete consumer
   list (migration column, commit route, photo routes, race oracle,
   T3/T4 evidence tests). One name everywhere; no other consumer.

3. **The complete race matrix (`tests/run-races.mjs`,
   `races-off.json` / `races-enforce.json`).** All five contract
   pairs at N=100 each, launch order alternated every iteration
   (barrier both ways), plus the txhold in-transaction serialization
   barrier per mode: steal‖write (both outcomes observed under ON),
   steal‖steal (100/100 distinct monotonic fences), renew‖steal
   (renewWon+renewStaled=100, both outcomes observed), release‖write
   (release 100/100, write landed/rejected classified),
   expiry-acquire‖write (SQL-aged expiry, acquire 100/100 with fence
   bump). Oracle per iteration = committed ledger row presence vs
   response, `writerFence` evidence on every landed ON commit, and a
   running monotonic-fence check across all ~500 transitions per
   mode. ZERO anomalies in both modes; timing is supporting evidence
   only.

4. **Malformed-upload evidence isolated AND completed.** The matrix
   now runs on a dedicated fresh user with zero prior state; after
   EVERY case the evidence asserts exactly zero photo records, zero
   ledger rows, and zero new files under pb_data/storage (no control
   upload in the accounting). The two missing arms exist via
   deterministic fault injection: "unreadable temporary upload"
   (throws at the read step → 400) and "digest failure" (empty digest
   → 500), triggered by an `x-cf-test-fault` header honored ONLY when
   the instance environment sets CF_M10_TEST_ENABLE=1 —
   setup-instance.sh sets it for disposable instances; no deployment
   does; the injection ships inert and is documented in
   MANIFEST-NOTES.md and tests/README.md.

5. **Machine-verifiable manifest.** MANIFEST.txt is now pure
   `sha256sum` format — `sha256sum -c MANIFEST.txt` exits 0, every
   line verified; narrative moved to MANIFEST-NOTES.md.

6. **Exact diffs + rerun.** CAS-DIFF.patch regenerated (114 lines vs
   the deployed cf_cas.pb.js); DIFF-FROM-bb6d6d8.txt lists the
   corrected paths; fresh raw outputs in both modes:
   off-suite.json 71/71, enforce-suite.json 92/92,
   races-off/races-enforce allPass with 0 anomalies,
   migration-suite.json 16/16 (regression rerun of the corrected
   hooks), probe-bytes.json unchanged basis.

**Passed**: everything above, local disposable only.
**Deferred to client rounds**: core client durability (dirty/base/
ack-dx journals, bootstrap, state model), photo queue ordering +
displaced review UI, m10Gate surface, takeover UX.
**Deferred to NAS rounds (Owner authorization first)**: NAS deployment
of this exact package, NAS disposable probes, coach-job migration to
the platform route, enforcement-day gate.
**Not needed**: item-9 contingency ($os.getenv/$os.readFile work in the
migration runtime — refusal tested end-to-end).

Requested ruling: whether the corrected server package + evidence
satisfy §9 step 3, permitting CLIENT implementation (LOCAL, delimited
blocks, M8 discipline) while the server package awaits the Owner's
enforcement-OFF NAS authorization. Nothing else is requested.
