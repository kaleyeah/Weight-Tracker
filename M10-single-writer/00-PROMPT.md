# M10 single-writer — round 30: increment 5, round-29 rulings landed

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

Increment 5 revised. **Code head `793e591`** (the last commit touching
`index.html`), sha256
`c49166fee14c787a568f35f687beacefcb4a562ada554a6ff0e86154d90e5788`;
**records head** `9e3f87b`+ carries harness and package artifacts with a
byte-identical `index.html` (the manifest checks it). Narrow diff
`INCR5-DIFF-FROM-48e966a.patch`; cumulative `INCR5-DIFF.patch`
(249fd0e → 793e591, `git diff --check` clean);
`sha256sum -c …/INCR5-MANIFEST.txt` exits 0 across 12 paths.

1/7. **The real choke points.** You were right that the click
   interceptor was not one. The application persists directly from its
   global `input`/`change` handlers; those events are now intercepted at
   capture too, with the field's prior value restored, so a non-holder
   produces NO in-memory and NO durable change. Sign-in/server-config
   fields and M10's own sheets stay usable (that is how a read-only
   device recovers); a holder is unaffected. Three application-path
   tests.
2. **Inventory rebuilt by callee analysis** (transitive, depth ≤ 5),
   not branch text: 104 → 129 gated. Every family you named is now
   gated AND tested by an application-path test that clicks it as a
   non-holder and proves the app handler never runs: `wo:start`
   (→startWorkout), `wo:startroutine`/`wo:endrest` (→woTransition),
   `wu:yes` (→markWarmup), `wo:finishlater` (→pauseWorkout),
   `day:reopendo` (→reopenDay), `sync:pasteapply` (direct setSyncCfg).
   The render/view layer is excluded from the walk and the reason is
   documented in the inventory.
3. **HealthKit** captures authority at start and revalidates before the
   local mutation AND before each mailbox clear; pen loss during the
   wait imports nothing and clears the wait honestly (T10).
4. **File flows** thread the captured authority through the async work:
   both imports revalidate after `FileReader.onload`, photo adds
   revalidate after `processImage`/`idbAll` and before every
   delete/add. T11 proves a pen loss after `change` mutates nothing.
5. **Malformed photo queue** now blocks logout via the TYPED read and
   preserves the evidence (T12) instead of reading as empty.
6. **Identity** stated precisely above (code head vs records head).
8. **Harness changes, disclosed and hashed**: C14 and c11m8-faults each
   signed in with no lease route mocked, so under the wired gate their
   mutating clicks were correctly refused. Both now answer the lease
   route — harness only; both green (67/67, 64/64). This is intended
   behavior: conflict resolution is a content write and needs the pen.

Evidence at `793e591`: C19 30/30; C18 52/52; C17 37/37; C16 49/49;
C15 35/35; regressions 171/171 (+artifact-scope recovery 25/25).

Requested ruling: acceptance of increment 5 and of the M10 client.
Nothing beyond local implementation is requested.
