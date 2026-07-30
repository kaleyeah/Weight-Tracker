# Product Architect Review — Production I5d and Commit 10 Canary Plan

**Package:** `cf-i5d-canary-plan-20260730.zip`  
**Review type:** Production cross-user idempotency verification and pre-publication canary authorization  
**Verdict:** **I5d APPROVED — CANARY PLAN APPROVED WITH REQUIRED PREFLIGHT AND EXTENDED SMOKE CHECKLIST**

This review authorizes preparation and publication of the approved canary path after the pre-publication gates below pass.

It does **not** authorize replacement of the production root client, removal of the legacy bridge, minimum-client-build enforcement, or P7 lockdown.

---

# Executive ruling

Production I5d is accepted.

The evidence proves on the real production PocketBase that one idempotency key is scoped independently per:

```text
(user, subsystem)
```

The same key and byte-identical multi-key payload produced:

- one live commit for User A;
- one independent live commit for User B;
- owner-specific replay for each user;
- rejection of a genuinely different request under User B’s reused key;
- one ledger row per user;
- exactly one revision advance per user.

The run was rehearsed locally, included a meaningful negative control, used only the two closed-whitelist disposable accounts, and ended with verified absence of both users, appdata rows, and ledger rows.

Both real athlete rows were unchanged before and after.

I5d is complete.

The canary plan is approved with these decisions:

1. **Path:** `/canary/` approved.
2. **Duration:** minimum 48 hours and at least one normal usage cycle.
3. **Access mode:** second home-screen icon approved, but storage separation must not be assumed.
4. **Smoke checklist:** extended as specified in this review.

---

# 1. I5d production verification

## Ruling: APPROVED

Accepted production evidence:

- `I5d-0`: two distinct disposable accounts;
- `I5d-1`: User A live commit;
- `I5d-2`: User B’s same key and same payload is a live commit, not replay;
- `I5d-3`: User B receives User B’s revision;
- `I5d-4`: User B replay returns User B’s result;
- `I5d-5`: User A replay remains User A’s result;
- `I5d-6`: different request with reused key is refused;
- `I5d-7/8`: one ledger row per owner;
- `I5d-9/10`: one revision advance per owner.

Accepted operational controls:

- production backup created first;
- backup downloaded off-NAS;
- archive integrity checked;
- local rehearsal completed before production;
- negative control using the same account twice failed correctly;
- non-disposable address refused;
- credentials kept out of process arguments;
- hard-coded two-account whitelist;
- immediate teardown;
- verified absence of users, appdata, and ledger;
- real athlete rows and timestamps unchanged;
- ledger returned from 0 rows to 0 rows.

This closes the remaining production idempotency gate.

No further I5d run is required before this canary unless the server idempotency implementation changes.

---

# 2. Canary path

## Product Architect decision: APPROVE `/canary/`

Approved path:

```text
/canary/
```

Required served document:

```text
/canary/index.html
```

The root client remains untouched.

Before the Product Owner opens the canary, prove:

- root still serves build `2026-07-28.347-pb`;
- root hash remains the recorded `.347` production hash;
- canary serves build `2026-07-29.348-pb-c10`;
- canary bytes and hash match the build-manifest-declared release artifact;
- canary fetch/update checks remain on `/canary/`;
- root fetch/update checks remain on `/`;
- no canary asset or route overwrites root;
- no service worker exists;
- no Cache API entries exist;
- deleting `/canary/` removes only the canary.

Record exact URLs, response headers, byte counts, hashes, and timestamps.

---

# 3. Canary duration

## Product Architect decision: MINIMUM 48 HOURS

The canary must run for:

- at least 48 elapsed hours;
- and at least one representative normal usage cycle.

The window starts only after the complete day-one smoke checklist passes.

Do not shorten the window merely because no error appears in the first few hours.

Extend the canary if:

- the athlete did not perform normal core and training activity;
- the device was not backgrounded/foregrounded;
- offline/reconnect was not exercised;
- a conflict was not safely exercised;
- the CDN delayed the candidate during the initial period;
- monitoring evidence is incomplete.

The canary does not need to manufacture repeated destructive conflicts after one safe conflict exercise has passed.

---

# 4. Second home-screen app

## Product Architect decision: APPROVED, WITH A CRITICAL CLARIFICATION

The Product Owner may add the `/canary/` URL as a second home-screen icon.

Do **not** claim or rely on guaranteed separate storage simply because there are two icons.

The canary must remain safe under either iOS behavior:

- separate installation storage;
- shared same-origin storage.

The package’s existing shared-storage upgrade/rollback/alternation evidence is therefore essential and carries forward.

Required before use:

- the canary icon opens `/canary/`, not root;
- the existing root home-screen app remains installed and untouched;
- the root app is never removed or re-added;
- the canary icon has a distinguishable name, such as:
  - `Compound Canary`
  - or another clearly temporary label;
- the athlete is told which icon is production and which is canary;
- opening one icon must not visually masquerade as the other—show and verify the build identifier in the canary session.

The canary local storage is not to be described as disposable until server sync and export have been verified. It may contain pending data during the trial.

Removing the canary icon is not the primary rollback mechanism. First remove or disable the canary path and confirm athlete data is synchronized/exported; then remove the temporary icon when safe.

---

# 5. Pre-publication gates

Before publishing `/canary/`, Claude must verify:

1. The release artifact was produced by the approved authoritative build command.
2. The single-flight lock gate is active.
3. The selector verifies the manifest, hash, bytes, and build.
4. The exact selected artifact hash is:
   ```text
   9e45a225a5ea663c23e88340916689ac77fc8d0796ef48f342b06195adab4256
   ```
5. The production root artifact is backed up and hashed.
6. HOTFIX-001 remains active and canonical replay remains green.
7. Server health and the commit route are healthy.
8. Production has no duplicate appdata owner.
9. Payload sizes remain below 256 KiB.
10. The canary removal/rollback command has been rehearsed against a nonproduction Pages branch or equivalent safe fixture.
11. The canary path does not alter the root file.
12. The Product Owner receives a short written briefing before opening the canary.

If the artifact hash/build changes because of a new commit, stop and return the new candidate for review rather than substituting it silently.

---

# 6. Extended day-one smoke checklist

The proposed checklist is directionally right but incomplete.

The Product Owner and engineer must record expected/actual results for all of the following.

## Identity and launch

- **CANARY-01:** `/canary/` serves the exact approved build and hash.
- **CANARY-02:** The canary home-screen icon opens `/canary/`.
- **CANARY-03:** The production root icon still opens the `.347` root client.
- **CANARY-04:** Successful sign-in under the consenting athlete.
- **CANARY-05:** Existing athlete data appears without local or server replacement.
- **CANARY-06:** Initial `coreRev` and `trainingRev` match production server state.

## Health & progress

- **CANARY-07:** Add one clearly identifiable test weigh-in.
- **CANARY-08:** Core local state becomes pending, then syncing, then synced.
- **CANARY-09:** Server `coreRev` advances exactly once.
- **CANARY-10:** Commit ledger entry belongs to the consenting athlete.
- **CANARY-11:** No direct raw core snapshot POST/PATCH occurs.

## Training & workouts

- **CANARY-12:** Save one clearly identifiable training/workout change.
- **CANARY-13:** Training local state becomes pending, then syncing, then synced.
- **CANARY-14:** Server `trainingRev` advances exactly once.
- **CANARY-15:** Core revision does not advance from the training-only change.
- **CANARY-16:** No direct raw training snapshot POST/PATCH occurs.

## Offline and lifecycle

- **CANARY-17:** Make one safe local edit while offline.
- **CANARY-18:** The app says the change is saved on this device.
- **CANARY-19:** Reconnect and verify automatic safe synchronization.
- **CANARY-20:** Background and foreground the PWA.
- **CANARY-21:** Reload/relaunch and verify no pending data disappears.
- **CANARY-22:** No update loop occurs.
- **CANARY-23:** An update banner appears only if the served document is genuinely behind.

## Export and set-aside safety

- **CANARY-24:** Export JSON successfully from the canary.
- **CANARY-25:** Exported file uses UTF-8 and contains the expected recent data.
- **CANARY-26:** Existing set-aside data, if present, remains discoverable.
- **CANARY-27:** No same-minute set-aside labels are ambiguous.

## Conflict behavior

Use a deliberate, low-risk conflict involving test data that can be verified afterward.

- **CANARY-28:** Create one controlled conflict between old root and canary.
- **CANARY-29:** The canary detects the conflict and does not silently overwrite either version.
- **CANARY-30:** The conflict center is reachable from status.
- **CANARY-31:** The Product Owner can close the center without committing a choice.
- **CANARY-32:** Choose **Keep this device’s changes** first; verify no server overwrite occurs.
- **CANARY-33:** Resolve the test conflict through one approved destructive path only after both copies are verified/recoverable.
- **CANARY-34:** The other subsystem remains unaffected.
- **CANARY-35:** No unresolved conflict disappears without athlete action.

## Cleanup and continued use

- **CANARY-36:** Remove or clearly annotate the synthetic test weigh-in/training change if the Product Owner does not want it retained.
- **CANARY-37:** Verify final server revisions and payload accessibility.
- **CANARY-38:** Verify no recovery-blocked or cleanup obligation remains unexpectedly.
- **CANARY-39:** Verify export remains available at the end of smoke.
- **CANARY-40:** Record screenshots, build ID, timestamps, revision movements, request statuses, and ledger attribution without recording raw health payloads.

A failed checklist item stops the canary window and triggers the rollback/diagnostic plan.

---

# 7. Monitoring during the 48-hour window

Monitor the consenting athlete only, except for confirming the other athlete remains attributable solely to their own bridge activity.

Required canary monitoring:

- commit-route 200;
- 409 conflicts;
- 400/401/413/426/500;
- replay responses;
- idempotency-key reuse refusals;
- `coreRev` and `trainingRev`;
- pending/syncing/synced transitions;
- unresolved conflict count;
- recovery-blocked state;
- cleanup-ledger obligations;
- legacy PATCH attempts from the canary;
- payload byte sizes;
- update reloads and banners;
- export/recovery incidents.

Do not log raw athlete payloads.

## Success criteria

The canary passes when:

- all 40 smoke cases pass;
- at least 48 hours pass;
- at least one representative normal usage cycle occurs;
- no data is lost or made inaccessible;
- no raw snapshot mutation is emitted by the canary;
- no unexplained revision movement occurs;
- no repeated invariant/replay refusal occurs;
- no update loop occurs;
- no unresolved cleanup obligation remains;
- no second-athlete anomaly is attributable to the canary.

---

# 8. Canary rollback and stop conditions

Stop the canary immediately for:

- raw core/training snapshot POST or PATCH from the candidate;
- client saying Synced while a newer local revision exists;
- inaccessible pending data;
- unexpected local or server replacement;
- conflict disappearing without explicit athlete action;
- failed recovery verification;
- repeated idempotency invariant errors;
- sustained commit-route 5xx;
- ownership anomaly;
- unexpected payload-size jump;
- root client or root file changing;
- root/canary path crossover;
- mixed-build behavior;
- canary PWA stuck in reload/update loop.

## Rollback sequence

1. Stop using the canary.
2. Verify pending canary data is synced or exported.
3. Remove/disable `/canary/` from Pages.
4. Verify root remains the exact `.347` artifact.
5. Verify the canary URL no longer serves `.348`.
6. Preserve HOTFIX-001 and the legacy bridge.
7. Record final revisions and diagnostics.
8. Remove the temporary home-screen icon only after data safety is confirmed.

Replacing the canary path with `.347` is acceptable only if removal is operationally difficult and the result is clearly verified. Deletion/disablement is preferred.

---

# 9. Required canary evidence package

After the 48-hour window, return:

```text
cf-commit10-canary-results-YYYYMMDD.zip
├── 00-PROMPT.md
├── PROJECT_STATUS.md
├── CANARY_RESULTS.md
├── artifact/
│   ├── manifest
│   ├── canary served hash
│   └── root served hash
├── evidence/
│   ├── CANARY-01..40
│   ├── day-one request/revision log
│   ├── 48-hour monitoring log
│   ├── iPhone screenshots
│   ├── export verification
│   ├── conflict exercise
│   ├── final payload sizes/revisions
│   └── page removal/retention status
└── rollback/
    └── commands and result
```

State explicitly:

- whether root was ever touched;
- whether any canary item failed;
- whether any synthetic data remains;
- whether the canary path remains published;
- whether the Product Owner is requesting root cutover.

---

# 10. Final cutover package additions

The final cutover package must additionally contain:

- accepted I5d results;
- canary plan approval;
- canary results;
- exact one-command build manifest;
- single-flight evidence;
- cache/service-worker V2 evidence;
- root and candidate hashes;
- real production preflight;
- 48-hour monitoring summary;
- root deployment and rollback steps;
- bridge-window monitoring plan.

No new architecture review is required if the canary follows this approved plan and exposes no new behavior.

---

# 11. Current authorization

## Authorized by this review

- publish the exact approved candidate at `/canary/`;
- use the Product Owner as the consenting athlete;
- add a second clearly named home-screen icon;
- execute CANARY-01 through CANARY-40;
- monitor for a minimum of 48 hours;
- remove/disable the canary under the rollback rules.

This authorization assumes the Product Owner authorization recorded in the package remains valid.

## Not authorized

- replace the production root client;
- enroll the second athlete in the canary;
- remove the legacy bridge;
- enforce minimum client build;
- activate P7 lockdown;
- change the CAS server contract.

---

# Final verdict

## **PRODUCTION I5d APPROVED**

## **ONE-ATHLETE CANARY APPROVED WITH EXTENDED CHECKLIST**

The production server dependency is complete.

Publish the exact approved release candidate only at `/canary/`, run the 40-case day-one smoke, continue for at least 48 hours, and return the canary-results package for final root-cutover authorization.
