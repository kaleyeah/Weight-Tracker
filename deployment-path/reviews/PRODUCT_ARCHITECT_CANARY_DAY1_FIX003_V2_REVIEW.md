# Product Architect Review — Canary Day 1 / FIX-003 V2

**Package:** `cf-canary-day1-fix003-v2-20260730.zip`  
**Review type:** Exact `.349` candidate, ownership-gate correction, claim-confirmation product change, browser-harness correction, and canary-restart request  
**Verdict:** **EXACT CLIENT CHANGES APPROVED — CANARY REPUBLISH BLOCKED BY STALE/INCONSISTENT RELEASE-PIPELINE PROVENANCE**

This review does not authorize production-root deployment, bridge removal, minimum-client-build enforcement, or P7 lockdown.

---

# Executive ruling

The V2 package corrects the three packaging defects from the prior review:

- the full proposed `artifact/index.html` is included;
- `FIX-003.diff` contains the real code hunks;
- the exact browser-harness and browser-runner sources are included.

The proposed client artifact is internally consistent:

```text
build   2026-07-30.349-pb-c10
sha256  0958b4e456789bde830517a5fe034941c6b9c6992a310dad87e524b9f9aeb418
bytes   1,189,661
```

The packaged file matches that SHA-256 and byte count.

I compared it with the previously reviewed `.348-pb-c10` artifact. The only application changes are:

1. the build identifier;
2. rendering `confirmOverlayHTML()` on the final ownership-gate path;
3. adding confirmation before claiming unknown pre-sign-in data.

Those changes are approved.

The package also includes valid evidence for:

- `GATE-01..16`;
- `BHARNESS-01..08`;
- repaired `C10-P8-01` and `C10-P8-16` test scenarios;
- truthful negative-control exit codes;
- the full string and browser regression suites.

However, `/canary/` may not yet be republished because the release provenance in the package is mathematically inconsistent with the proposed `.349` artifact.

The artifact itself is approved. The pipeline claim is not.

---

# 1. FIX-003 — paint confirmations on the ownership gate

## Ruling: APPROVED

The final ownership-gate render now includes:

```js
cfBlockedHTML(b) + confirmOverlayHTML()
```

This is the correct narrow repair.

Accepted behavior:

- **No — set it aside** paints a visible confirmation;
- Cancel leaves the gate and local data unchanged;
- confirming preserves the unknown local data;
- the data is not adopted into the authenticated account;
- the gate clears only after preservation;
- the set-aside copy remains discoverable;
- the dialog survives ownership-gate rerenders;
- no uncaught browser error occurs.

`GATE-01..08` are accepted.

The canary correctly discovered this defect and correctly stopped before unsafe adoption.

---

# 2. FIX-003b — confirmation before claiming unknown data

## Product Architect ruling: APPROVED AS A NEW PRODUCT SAFETY BEHAVIOR

The package correctly discloses that **Yes — this is mine** was never broken by FIX-003.

It was more concerning: it previously adopted unknown pre-sign-in data into the authenticated account with one tap and no confirmation.

Adding confirmation is the correct product decision.

Approved wording:

> Add this device’s existing data to your account? It becomes part of your history and is uploaded when you sync.

Approved confirmation label:

> Yes, add it

This language explains:

- the data comes from this device;
- it becomes part of account history;
- it will participate in synchronization.

The non-danger/primary confirmation treatment is acceptable because the action adds data rather than deleting it, while the explicit confirmation supplies the required friction.

Accepted behavior:

- visible confirmation before claim;
- Cancel is inert;
- confirmation stamps the authenticated owner;
- claimed data becomes that account’s local data;
- no false set-aside artifact is created;
- rapid repeated activation yields one dialog/one claim;
- rerender does not remove or duplicate the confirmation;
- buttons are reachable on the real iPhone-sized viewport;
- no uncaught page error occurs.

`GATE-09..16` are accepted.

No other ownership-gate product decision is required from this package.

---

# 3. Browser-harness correction

## Ruling: APPROVED

The browser assertion harness now sets:

```js
process.exitCode = 1
```

when failures exist.

The new child-process self-tests prove:

- a clean browser suite exits zero;
- a failing assertion exits nonzero;
- top-level rejection exits nonzero;
- an awaited-test failure exits nonzero;
- a suite cannot print `FAILED` and exit zero;
- the reverted FIX-003 negative control exits nonzero;
- printed counts and exit status agree;
- the browser release runner fails when any child fails.

`BHARNESS-01..08` are accepted as permanent regression evidence.

The aggregate `browser-run-all.js` design is also approved.

---

# 4. Scheduler-test repair disclosure

## Ruling: APPROVED AND REQUIRED TO REMAIN PERMANENT

The package correctly identifies two test defects:

1. payload-wide substring searches could collide with random/timestamped GLP symptom IDs;
2. the retry test advanced the retry timer before inserting the newer edit, making the named scenario vacuous.

The corrected tests now:

- stop explicitly at `waiting-retry`;
- assert that precondition;
- insert the newer edit while the retry is actually pending;
- compare captured payload values rather than arbitrary substrings;
- prove the retry reuses the original captured bytes;
- prove the newer edit is not smuggled into the uncertain retry.

The planted client defect now causes exit 1, while restored source passes 152/152 across 30 runs.

This is strong evidence and should remain in the permanent Commit 10 suite.

The client artifact itself was unchanged by this test correction.

---

# 5. Exact candidate content

## Ruling: APPROVED

The full packaged `.349` candidate has been independently checked:

```text
SHA-256  0958b4e456789bde830517a5fe034941c6b9c6992a310dad87e524b9f9aeb418
bytes    1,189,661
build    2026-07-30.349-pb-c10
```

Compared with the approved `.348` file, it contains only the intended three hunks listed above.

The exact client content is approved for canary **once the release-pipeline provenance is corrected**.

---

# 6. Release-pipeline provenance blocker

## Defect

The packaged manifest declares:

```text
intermediateSha256
bb41dab4d851c73036714ba2299ad3f5cc6c1f54e10c432a4b74bf996e2a568a

injectionSha256
2be8d8e883c383d888f64bd4931e54738a7765f18e224f62c2f2cfbfdb2cf635
```

Those are the old production `.347` intermediate and the previously recorded Commit 10 injection identity.

The proposed output is now `.349`, not `.348`.

With:

- the same exact intermediate bytes;
- the same exact deterministic injection bytes/operations;

the injector cannot produce a different output.

Yet the manifest claims a new `.349` output.

At least one of these is stale or missing from the package:

- the injection specification;
- builder implementation/identity;
- generated manifest;
- build transcript.

The packaged `DEPLOY-RC-46.txt` is also tied to an older repository state:

- it prints an older repository HEAD/source-hash set than `HASHES.txt`;
- it reports the old injection identity;
- it is not evidence that the approved authoritative pipeline generated the packaged `.349` artifact.

This does not mean the `.349` HTML is wrong. Its exact diff is approved.

It means the handoff does not prove that the approved generator will reproducibly emit those bytes, and canary publication must use that generator.

---

# 7. Required correction FIX003-PIPE-01 — regenerate the release injection and manifest

From the exact reviewed `.349` source:

1. derive/update the versioned Commit 10 injection through the approved mechanism;
2. run the authoritative single-flight build command;
3. generate the final artifact;
4. verify it is byte-identical to the approved packaged `.349`;
5. produce a fresh build manifest;
6. select the artifact through the approved manifest-verifying selector;
7. package the actual injection JSON/build tool identities and transcripts.

The corrected manifest must accurately bind:

- source commit and source SHA;
- adapter-generator identity;
- actual injection SHA and operation count;
- intermediate SHA;
- builder commit;
- release build;
- release SHA and bytes.

Add:

- **FIX003-PIPE-01:** Authoritative build produces the exact approved `.349` SHA.
- **FIX003-PIPE-02:** Fresh injection identity differs from the old `.348` injection when the injected output changes.
- **FIX003-PIPE-03:** Fresh manifest accurately names the packaged injection file.
- **FIX003-PIPE-04:** Packaged build transcript and source hashes match the submitted tools.
- **FIX003-PIPE-05:** Manifest selector chooses only the exact `.349` artifact.
- **FIX003-PIPE-06:** A stale `.348` injection cannot report success for `.349`.
- **FIX003-PIPE-07:** Repeated builds are deterministic.
- **FIX003-PIPE-08:** Root and halted canary remain unchanged during this build-only correction.

If the engineering explanation is that FIX-003 enters through a different formally approved source stage, document and package that stage explicitly. The current manifest does not explain it.

---

# 8. Current served state

The package proves:

```text
root
build   2026-07-28.347-pb
sha256  bb41dab4d851c73036714ba2299ad3f5cc6c1f54e10c432a4b74bf996e2a568a

/canary/
build   2026-07-29.348-pb-c10
sha256  9e45a225a5ea663c23e88340916689ac77fc8d0796ef48f342b06195adab4256
```

That is the correct halted state.

Keep it unchanged until the corrected pipeline package is approved.

---

# 9. Canary restart status

## Current ruling: NOT YET AUTHORIZED

All client behavior corrections required for restart are approved.

Republish is withheld solely because the authoritative release provenance for `.349` is stale/inconsistent.

After the narrow corrected pipeline package is accepted:

- replace only `/canary/` with the exact approved `.349`;
- verify served build/hash;
- verify root remains exact `.347`;
- restart the canary at `CANARY-01`;
- the 48-hour clock starts only after the complete day-one checklist passes.

Do not continue the old canary run from CANARY-02.

---

# 10. Required narrow resubmission

Return:

```text
cf-canary-day1-fix003-v3-YYYYMMDD.zip
├── 00-PROMPT.md
├── PROJECT_STATUS.md
├── artifact/
│   ├── index.html
│   ├── index.html.sha256
│   └── manifest.json
├── deployment-path/
│   ├── authoritative builder identity/source
│   ├── actual updated injection JSON
│   └── manifest selector identity/source
└── evidence/
    ├── FIX003-PIPE-01..08
    ├── authoritative build transcript
    ├── exact source/tool/injection hashes
    ├── artifact selection transcript
    ├── root/canary served hashes
    ├── GATE-01..16
    ├── BHARNESS-01..08
    └── complete regression summaries
```

A new product/UX review is not required unless the candidate bytes change beyond the already approved three hunks.

---

# Final verdict

## **FIX-003 APPROVED**

## **FIX-003b CLAIM CONFIRMATION APPROVED**

## **BROWSER-HARNESS AND SCHEDULER-TEST CORRECTIONS APPROVED**

## **EXACT `.349` CLIENT CONTENT APPROVED**

## **CANARY REPUBLISH NOT YET AUTHORIZED**

Regenerate and package truthful authoritative build provenance for the exact approved `.349` bytes, then return for the narrow canary-restart authorization.
