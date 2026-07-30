# Product Architect Review — Canary Day 1 Stop / FIX-003

**Package:** `cf-canary-day1-fix003-20260730.zip`  
**Review type:** Day-one canary stop, ownership-gate correction, browser-harness correction, and replacement candidate  
**Verdict:** **FIX-003 PRODUCT DIRECTION APPROVED — CANARY REPUBLISH NOT YET AUTHORIZED FROM THIS PACKAGE**

This review does not authorize root production deployment, bridge removal, minimum-client-build enforcement, or P7 lockdown.

---

# Executive ruling

The canary behaved correctly by stopping on its first failed athlete interaction.

Accepted findings:

- all 12 pre-publication gates passed;
- root remained the exact `.347` artifact;
- CANARY-01 passed for the original `.348-pb-c10` candidate;
- the Product Owner reached the ownership gate on a real iPhone;
- **No — set it aside** did not present its confirmation;
- the gate failed safe and did not merge the unknown pre-sign-in data;
- the 48-hour canary window never began;
- no production root artifact was changed;
- no synthetic production data remains.

The diagnosed product defect is credible:

> The ownership-gate render path replaced `#app` and returned without appending `confirmOverlayHTML()`, so `askConfirm()` could queue a confirmation that the gate never painted.

Appending the confirmation overlay to the ownership-gate render path is the correct narrow fix.

The build stamp must change when the candidate bytes change. Bumping:

```text
2026-07-29.348-pb-c10
```

to:

```text
2026-07-30.349-pb-c10
```

is approved in principle.

However, this archive does not contain enough source to approve the exact `.349` candidate or authorize republishing it:

- `artifact/manifest.json` is included;
- the actual `artifact/index.html` is not included;
- `FIX-003.diff` ends at `diff --git a/index.html b/index.html` and contains no code hunk;
- the browser-harness code change is also not included as a reviewable diff or source file.

The package therefore proves test intent and reports a generated identity, but it does not allow independent inspection of the exact bytes proposed for canary.

---

# 1. FIX-003 behavior

## Product ruling: APPROVED

The ownership gate must render its queued confirmation overlay.

Required behavior:

- tapping **No — set it aside** displays a visible confirmation;
- Cancel leaves the athlete gated and changes no data;
- confirming preserves the unknown local data as a verified set-aside copy;
- the unknown data is not adopted into the authenticated account;
- the gate clears only after successful preservation;
- the set-aside copy remains discoverable and exportable;
- no unsafe fallback or automatic claim occurs.

`GATE-01` through `GATE-08` are appropriate evidence for this path.

The negative control is meaningful because reverting the rendering fix causes the athlete-facing action and downstream preservation assertions to fail.

---

# 2. Other confirm-driven ownership-gate paths

## Product Architect decision: ADD COVERAGE FOR THE CLAIM PATH

The defect affected every `askConfirm()` action rendered through the ownership gate, while the new browser suite exercises only the set-aside path.

Before canary restart, add real-browser coverage for **Yes — this is mine**.

The test must use disposable data and a disposable account; it must not be performed against the Product Owner’s real canary data.

Required cases:

- **GATE-09:** Tapping **Yes — this is mine** paints a visible confirmation dialog.
- **GATE-10:** Cancel dismisses the dialog, leaves the gate present, and changes no ownership/data state.
- **GATE-11:** Confirm performs only the approved claim/adoption behavior and clears the gate.
- **GATE-12:** The claimed local data belongs to the authenticated disposable account afterward; no set-aside artifact is falsely created.
- **GATE-13:** Rapid double activation produces one confirmation/one claim operation.
- **GATE-14:** A page rerender while the confirmation is open does not remove or duplicate it.
- **GATE-15:** The confirmation buttons remain visible and tappable at the real iPhone viewport.
- **GATE-16:** No uncaught page error occurs through the claim path.

Also audit the ownership-gate markup for any additional controls that invoke `askConfirm()`. Every such reachable control requires at least:

- visible dialog;
- Cancel is inert;
- confirmation performs the named action once.

No additional product decision is required unless another path has ambiguous or destructive wording.

---

# 3. Browser-harness exit-code defect

## Ruling: THE FIX IS REQUIRED AND DIRECTIONALLY CORRECT

A browser suite that prints `FAILED` but exits zero is not an acceptable release gate.

Setting `process.exitCode` from the final failure count is the correct correction.

The existing transcript-based verify chain reduced the practical risk, but it does not excuse the harness defect.

## Required permanent evidence

Add a browser-harness self-test that launches child processes against the actual browser harness.

Required:

- **BHARNESS-01:** A clean browser suite exits zero.
- **BHARNESS-02:** A failing browser assertion exits nonzero.
- **BHARNESS-03:** A top-level rejected promise exits nonzero.
- **BHARNESS-04:** A timeout/failure inside an awaited browser test exits nonzero.
- **BHARNESS-05:** A suite cannot print `FAILED` and exit zero.
- **BHARNESS-06:** The reverted FIX-003 negative control exits nonzero, not merely prints failures.
- **BHARNESS-07:** The final summary count agrees with process exit status.
- **BHARNESS-08:** The release runner fails when any browser-suite child exits nonzero.

Preserve the earlier `HARNESS-01..06` tests; this is additional evidence for the separate browser harness.

---

# 4. Candidate identity

## Ruling: VERSION BUMP APPROVED IN PRINCIPLE

A changed artifact must use a changed build identifier so the client update mechanism and operational evidence can distinguish it.

The proposed identity is reasonable:

```text
build   2026-07-30.349-pb-c10
sha256  30336aee546331a25862169f9dd85301a050e4032afbd9f7135f5637c6a02514
bytes   1,188,029
```

The manifest reports that identity.

But the exact candidate is **not approved from this archive** because its bytes are absent.

A manifest and test transcript cannot substitute for the actual shipping artifact in a release-candidate review.

---

# 5. Required resubmission package

Return a small prompt-first canary-restart package containing:

```text
cf-canary-day1-fix003-v2-YYYYMMDD.zip
├── 00-PROMPT.md
├── PROJECT_STATUS.md
├── FIX-003.diff
├── artifact/
│   ├── index.html
│   ├── manifest.json
│   └── index.html.sha256
├── source/
│   ├── exact ownership-gate render function
│   └── exact browser harness
├── tests/
│   ├── ownership-gate.browser.test.js
│   └── browser-harness-self.test.js
└── evidence/
    ├── GATE-01..16
    ├── BHARNESS-01..08
    ├── negative controls with exit codes
    ├── full browser-suite log
    ├── full regression log
    ├── release-pipeline log
    ├── candidate selection log
    ├── root/canary served hashes
    └── exact package/source hashes
```

Required package properties:

- `FIX-003.diff` contains the actual code hunk;
- the full `.349` `index.html` is included;
- its hash and byte count match the manifest;
- the candidate is produced by the approved authoritative/single-flight pipeline;
- all browser suites exit with truthful status;
- root remains the exact `.347` artifact;
- `/canary/` still serves the halted `.348` until explicit republish authorization.

---

# 6. Canary restart ruling

## Current status: NOT YET AUTHORIZED

The Product Architect approves the intended FIX-003 behavior and the need for a new build identity.

Republishing `/canary/` with `.349` is withheld only because the exact proposed artifact and actual code hunk are missing from the review package.

After the V2 package proves the exact candidate and the additional gate/harness cases:

- republishing `/canary/` may be authorized;
- day one restarts from `CANARY-01`;
- the 48-hour clock starts only after all day-one smoke cases pass;
- root remains untouched.

Do not continue from CANARY-02 using the old run. The changed candidate requires a fresh CANARY-01 identity check.

---

# 7. Status and data safety

Accepted current state:

- root `.347` untouched;
- halted canary still serves `.348`;
- Product Owner’s pre-sign-in data remains intact and unadopted;
- no production synthetic data remains;
- ledger is empty;
- the canary window has not started.

Do not ask the Product Owner to tap **Yes — this is mine** as a workaround.

Do not delete the pre-sign-in data before a verified set-aside/export path is available.

---

# Final verdict

## **FIX-003 PRODUCT DIRECTION APPROVED**

## **NEW BUILD IDENTITY APPROVED IN PRINCIPLE**

## **CANARY REPUBLISH NOT YET AUTHORIZED**

Supply the full `.349` artifact, the actual code diff, claim-path confirmation coverage, and browser-harness exit-code self-tests. Then return for the narrow canary-restart authorization.
