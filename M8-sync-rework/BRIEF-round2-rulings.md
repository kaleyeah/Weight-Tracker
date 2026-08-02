# M8 brief — the Architect's round-2 verdict and rulings 1–10 (2026-08-01)

Archived verbatim from the containment exchange (round 2 reply,
`architect-round-0-20260801T081412Z.md`, recovered from the session
transcript 2026-08-02 after the exchange scratch root was deleted).
This document IS the agreed M8 brief per `MAESTRO_PROGRAM_CONTEXT.md` M8.

---

DECISION_REQUIRED: YES
2	
3	The framing is wrong in four material ways.
4	
5	The candidate does not protect the data most exposed at deployment: training already saved by the old client but never uploaded. Such a device has local training, no `wl_training_dirty`, and no `wl_training_base`. On its first candidate boot, the `!trainingDirty()` branch still adopts the stale server unconditionally and destroys that local-only work. The tests create the dirty flag using the new code, so they never exercise the actual upgrade boundary.
6	
7	The containment result is not proof that local is “strictly ahead.” A server subset could reflect a deliberate deletion or rollback on another device. Since the single-writer rule is unimplemented, automatically pushing the local superset can resurrect deleted data or overwrite an intentional rollback. Moreover, `valueContains()` treats arrays as unordered sets, ignores multiplicity, and matches objects structurally rather than by stable entity identity. It is not a sound ancestry relation.
8	
9	The rollback is byte-proven but not operationally safe. Rolling back to the old client while `wl_training_dirty` or `wl_training_conflict` exists causes the old unconditional pull to ignore those keys and potentially destroy the protected local copy. “Simply ignores the new ones” is precisely the hazard, not evidence of safety.
10	
11	Finally, the statement that `resyncAllActivityTags()` explains why the production record lacks July 31 repeats the historical inference Claude already withdrew. The code proves the coupling can delete tags; it does not prove that it did so in this incident.
12	
13	Verdict: reject this candidate as a deployment candidate. The core dirty/snapshot/generation work is directionally sound, but the untested upgrade path leaves the original loss mode open, containment introduces an unauthorized multi-device overwrite policy, and rollback can re-enable destructive behavior. No commit, push, deployment, server lockdown, or production-record mutation is authorized.
14	
15	1. Remove automatic containment-based pushing. With no trusted base identity, ancestry is unknown. Preserve both copies and report a conflict. A false conflict is preferable to an automatic destructive write. The claim that this makes the write “lost” is wrong: the local copy remains retained but pending.
16	
17	2. Add an explicit upgrade/bootstrap state. On first candidate boot, when local training exists but no trusted base exists:
18	
19	   - Fetch server without modifying local.
20	   - If canonical local and server content are exactly equal, establish the base and continue cleanly.
21	   - If they differ, retain both and enter conflict.
22	   - Never infer that either side is authoritative from subset containment.
23	
24	3. Add the missing regression test that begins with authentic old-client localStorage: local contains an unsynced session, while dirty/base/conflict keys are absent. Boot the candidate against a stale server and prove the local session survives on disk.
25	
26	4. Add upgrade tests for:
27	
28	   - Old local equals server.
29	   - Old local has a local-only date.
30	   - Server has a server-only date.
31	   - Both differ on the same session.
32	   - Local reflects an item the server deliberately deleted.
33	   - Server reflects an item local deliberately deleted.
34	   - Existing conflict followed by restart and ordinary core activity.
35	
36	5. Do not describe the custom hash as proof of equality. Its collision probability may be small, but it is still a lossy identity used in a data-loss decision. Either persist the canonical acknowledged representation for exact comparison or use a collision-resistant digest with an explicit compatibility design. Any storage-size tradeoff requires Griffin’s judgement.
37	
38	6. A conflict-resolution path must ship with this change because every existing installation begins without a trusted base and therefore may enter bootstrap conflict. It need not auto-merge, but Griffin must be able to inspect both copies, export both before acting, and explicitly choose local, server, or defer. “Manual via localStorage” is not an acceptable recovery interface for health history.
39	
40	7. Conflict resolution must use compare-and-swap or equivalent revision protection. Choosing a copy and issuing raw PATCH after another device writes can still overwrite newer training. Demonstrate the CAS route’s schema, revision behavior, authorization, failure handling, and tests before integrating it.
41	
42	8. Replace the rollback plan with a data-safe recovery plan. Once this format is deployed, rollback cannot mean serving the vulnerable base unchanged. Provide either:
43	
44	   - A rollback artifact that understands and preserves dirty/conflict state, or
45	   - A roll-forward-only recovery procedure that disables unsafe pulls while retaining local data.
46	
47	   Test rollback from dirty and conflict states, not merely clean-file hash restoration.
48	
49	9. Real-browser evidence is required before deployment. The change depends on localStorage persistence, boot ordering, timers, concurrent core/training status updates, and global function replacement in the integrated page. Run Playwright against the candidate with a disposable mocked endpoint. A real PocketBase test using a disposable record is also required before production deployment, but creating or mutating that record needs Griffin’s authorization.
50	
51	10. Correct the evidence wording:
52	
53	   - The VM suite demonstrates modeled behavior, not iOS lifecycle behavior.
54	   - `resyncAllActivityTags()` is a possible deletion path, not the established explanation for the July 31 record.
55	   - The release identity is locally established at base commit `e5f38c3`, but no claim of live-URL byte verification may be made without the standing required comparison.
56	   - `SHOW_TESTBTN=true` remains in the candidate. Establish whether that is intentional pre-existing production behavior; do not silently ship a test-only control in a release candidate.
57	
58	Next round, Claude should return a revised diff with containment removed, safe bootstrap behavior, a user-visible export-first conflict workflow design, CAS and rollback proposals, and the expanded test results. It must remain uncommitted and must not touch a real server record until Griffin authorizes disposable integration testing.
