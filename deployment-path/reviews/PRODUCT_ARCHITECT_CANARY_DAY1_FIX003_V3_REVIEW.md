# Product Architect Review — Canary Day 1 / FIX-003 V3

**Package:** `cf-canary-day1-fix003-v3-20260730.zip`  
**Review type:** Corrected release provenance and canary-restart authorization  
**Verdict:** **PROVENANCE BLOCKER CLEARED — `/canary/` REPUBLISH AUTHORIZED**

This review authorizes replacing the halted `.348-pb-c10` canary with the exact approved `.349-pb-c10` artifact and restarting the canary from `CANARY-01`.

It does not authorize production-root deployment, bridge removal, minimum-client-build enforcement, or P7 lockdown.

---

# Executive ruling

The V2 provenance blocker is cleared.

The package proves that:

- the `.349` injection was genuinely regenerated;
- it declares the exact approved `.349` output;
- the unchanged `.347` intermediate is intentional;
- a stale `.348` injection previously could self-certify and silently emit the old client;
- `RELEASE.expected.json` now supplies an independent intended release identity;
- stale injection and intended release disagreement fails with `RELEASE-EXPECTATION-MISMATCH`;
- the authoritative single-flight build emits the exact approved `.349` bytes;
- the manifest’s builder commit matches the repository HEAD used for the evidence;
- the manifest selector chooses the exact `.349` artifact;
- root and halted canary remained unchanged during this build-only correction.

The approved canary candidate is:

```text
build   2026-07-30.349-pb-c10
sha256  0958b4e456789bde830517a5fe034941c6b9c6992a310dad87e524b9f9aeb418
bytes   1,189,661
```

The packaged `artifact/index.html` independently matches that hash and byte count.

The canary may now be republished with this exact artifact.

---

# 1. Injection identity

## Ruling: APPROVED

The package correctly distinguishes:

```text
intermediate:
bb41dab4d851c73036714ba2299ad3f5cc6c1f54e10c432a4b74bf996e2a568a
```

from:

```text
injection:
2be8d8e883c383d888f64bd4931e54738a7765f18e224f62c2f2cfbfdb2cf635
```

and:

```text
release output:
0958b4e456789bde830517a5fe034941c6b9c6992a310dad87e524b9f9aeb418
```

The intermediate remains unchanged because it is the frozen `.347` PocketBase-adapted production lineage.

The injection carries:

- Commit 10;
- FIX-003;
- FIX-003b;
- the `.349` build identity.

Same intermediate plus a different injection correctly produces a different final artifact.

The earlier Product Architect conclusion that `2be8d8e8…` necessarily represented `.348` was incorrect. The package’s git trace and current injection metadata correct that record.

---

# 2. Self-certifying release defect

## Ruling: THE DISCLOSED DEFECT IS REAL AND THE FIX IS APPROVED

The previous builder derived its intended release from:

```text
inj.generatedFrom.rcSha
```

inside the injection being validated.

That meant a stale or reverted injection could define its own expected output and still pass.

The supplied negative-control transcript proves this occurred: a real `.348` injection was restored and the pipeline reported success while emitting the old client.

This was a serious release-integrity defect.

The new independent file:

```text
deployment-path/RELEASE.expected.json
```

correctly records the reviewed intended:

- build;
- SHA-256;
- byte count.

The builder now compares:

- injection-declared release;
- injection-declared output hash;
- independently reviewed release expectation.

Disagreement fails before work proceeds.

This is the correct two-source agreement model.

---

# 3. Permanent pipeline decision — `RELEASE.expected.json` is mandatory

## Product Architect decision

`RELEASE.expected.json` is a permanent required release input.

The current builder still contains an optional fallback:

> when the file is absent, build whatever the injection declares.

That fallback is inconsistent with the reason the file was introduced.

## Required correction before root cutover

Change the builder so:

- missing `RELEASE.expected.json` fails nonzero;
- malformed expectation fails nonzero;
- missing build/SHA/bytes fails nonzero;
- expectation and injection disagreement fails nonzero;
- produced artifact must match all three expected values;
- the manifest records the expectation-file SHA-256.

Add permanent tests:

- **RELEASE-EXPECT-01:** Missing expectation file fails.
- **RELEASE-EXPECT-02:** Malformed expectation file fails.
- **RELEASE-EXPECT-03:** Missing build, SHA, or bytes fails.
- **RELEASE-EXPECT-04:** Stale injection versus current expectation fails.
- **RELEASE-EXPECT-05:** Stale expectation versus current injection fails.
- **RELEASE-EXPECT-06:** Produced bytes must match expected byte count.
- **RELEASE-EXPECT-07:** Produced hash must match expected SHA.
- **RELEASE-EXPECT-08:** Manifest records the expectation-file hash.
- **RELEASE-EXPECT-09:** Identical reviewed inputs regenerate deterministically.
- **RELEASE-EXPECT-10:** Deployment selector refuses an artifact built without a valid expectation identity.

This does not block the current canary because:

- the expectation file is present;
- it is load-bearing;
- negative controls prove disagreement fails;
- the selected `.349` artifact is exact.

It is required before root-production cutover and must remain in the permanent release pipeline.

---

# 4. Authoritative build and manifest

## Ruling: APPROVED

Accepted authoritative build evidence:

- source identity verified;
- `.347` intermediate verified;
- eight injection operations applied;
- adapter precedes Commit 10;
- final CAS overrides win;
- exact `.349` output produced;
- artifact and manifest atomically published;
- source policy is exact;
- builder commit matches repository HEAD;
- selector accepts only the exact candidate.

Manifest:

```text
releaseBuild
2026-07-30.349-pb-c10

releaseSha256
0958b4e456789bde830517a5fe034941c6b9c6992a310dad87e524b9f9aeb418

releaseBytes
1189661

builderCommit
a05d23cd20b29e37b2e9dc34e360191f33704607
```

This is accepted canary provenance.

---

# 5. FIX003-PIPE evidence

## Ruling: APPROVED

The package reports 55 release-pipeline assertions with zero failures, including:

- exact `.349` output;
- regenerated injection identity;
- manifest-to-injection binding;
- builder HEAD/source hash binding;
- selector exactness;
- stale `.348` injection refusal;
- expectation file load-bearing negative control;
- deterministic repeated builds;
- root/canary unchanged during build-only work.

`FIX003-PIPE-01` through `FIX003-PIPE-08`, plus `06b`, are accepted.

---

# 6. Client behavior evidence carried forward

The previously approved client changes remain accepted:

- FIX-003 ownership-gate confirmation rendering;
- FIX-003b claim confirmation;
- `GATE-01..16`;
- `BHARNESS-01..08`;
- repaired scheduler retry scenarios;
- full string suite;
- full browser runner.

No new product or UX review is required.

---

# 7. Served-state verification

The package confirms the pre-republish state:

```text
root:
bb41dab4d851c73036714ba2299ad3f5cc6c1f54e10c432a4b74bf996e2a568a

/canary/:
9e45a225a5ea663c23e88340916689ac77fc8d0796ef48f342b06195adab4256
```

This proves:

- root `.347` remained untouched;
- canary remained halted on `.348`;
- no unapproved republish occurred during the provenance correction.

Accepted.

---

# 8. Canary republish authorization

## AUTHORIZED

Claude may replace only:

```text
/canary/index.html
```

with the exact manifest-selected `.349` artifact:

```text
0958b4e456789bde830517a5fe034941c6b9c6992a310dad87e524b9f9aeb418
```

## Required publication sequence

1. Run the approved authoritative single-flight builder.
2. Verify `RELEASE.expected.json`.
3. Select the artifact using the manifest-verifying selector.
4. Verify selected build/hash/bytes.
5. Back up the current `/canary/` `.348` artifact and hash.
6. Publish `.349` to `/canary/` only.
7. Verify served `/canary/` build, hash, bytes, headers, and update behavior.
8. Verify root remains exact `.347`.
9. Verify no service worker or Cache API state appears.
10. Verify HOTFIX-001 and server health remain green.
11. Open the clearly named `Compound Canary` home-screen icon.
12. Restart day one at `CANARY-01`.

If the served canary hash differs, stop and restore halted `.348`.

---

# 9. Canary restart rules

The previous Day 1 run is void after CANARY-01 because the candidate changed.

Restart from:

```text
CANARY-01
```

Do not continue from CANARY-02.

The 48-hour clock starts only after all day-one smoke cases pass.

The Product Owner should first re-exercise the exact path that failed:

- sign in with meaningful pre-sign-in data;
- choose **No — set it aside**;
- verify confirmation is visible;
- Cancel once;
- reopen;
- confirm;
- verify the set-aside copy exists and the gate clears;
- export that copy before continuing normal canary activity.

Also verify the approved **Yes — this is mine** confirmation path using safe disposable test data where required by the canary plan, not the Product Owner’s real unknown data.

---

# 10. Canary rollback conditions

Stop and restore the backed-up `.348` canary if:

- served `.349` hash/build is wrong;
- root changes;
- confirmation still fails to render;
- claim occurs without confirmation;
- set-aside confirmation does not preserve data;
- browser runner reports nonzero;
- raw core/training snapshot mutation occurs;
- pending data becomes inaccessible;
- any prior canary stop criterion is met.

Preserve:

- root `.347`;
- HOTFIX-001;
- legacy bridge.

Do not deploy root as a workaround.

---

# 11. Required results package

After republishing and completing Day 1, return:

```text
cf-commit10-canary-day1-v2-YYYYMMDD.zip
├── 00-PROMPT.md
├── PROJECT_STATUS.md
├── CANARY_DAY1_RESULTS.md
├── artifact/
│   ├── manifest.json
│   ├── RELEASE.expected.json
│   ├── served-canary.sha256
│   └── served-root.sha256
├── evidence/
│   ├── publication transcript
│   ├── CANARY-01..40
│   ├── ownership-gate screenshots
│   ├── export verification
│   ├── request/revision/ledger log
│   ├── root/canary headers
│   ├── browser runner result
│   └── 48-hour clock status
└── rollback/
    └── backed-up `.348` artifact/hash and restore command
```

If Day 1 passes, continue the already approved minimum 48-hour window.

If Day 1 fails, stop and return the failure package without starting the clock.

---

# 12. Current authorization

## Authorized

- republish `/canary/` with the exact approved `.349`;
- restart canary Day 1 from CANARY-01;
- continue into the 48-hour window only after Day 1 passes;
- use the Product Owner as the consenting athlete;
- preserve the existing root `.347`.

## Not authorized

- change the root production client;
- enroll the second athlete;
- remove the bridge;
- enforce minimum client build;
- activate P7 lockdown;
- change the CAS server contract.

---

# Final verdict

## **PROVENANCE BLOCKER CLEARED**

## **EXACT `.349` CANDIDATE APPROVED**

## **`/canary/` REPUBLISH AUTHORIZED**

## **CANARY DAY 1 RESTART AUTHORIZED FROM CANARY-01**

Make `RELEASE.expected.json` mandatory before root cutover, then carry its permanent tests into the final release package.
