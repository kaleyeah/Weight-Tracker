# Canary day one (restart) — progress record, 2026-07-30

Canary republished with .349-pb-c10 and verified served (steps 1-10).
The Product Owner then ran the gate sequence on a real iPhone.

## PASSED

| Case | Result |
| --- | --- |
| CANARY-01 | /canary/ serves the approved build; PO confirmed `349-pb-c10` on the device |
| CANARY-02 | the canary URL opened the canary client |
| CANARY-04 | sign-in succeeded as the consenting athlete |
| FIX-003 on real hardware | **"No — set it aside" now paints a visible confirmation** — the defect that stopped day one is fixed on the device, not just in Chromium |
| set-aside completed | the athlete confirmed; the gate cleared |
| CANARY-05 | existing athlete data pulled in and appeared |

Deviation from the Architect's requested order: the PO confirmed without first
exercising Cancel (their §9 step). GATE-05/GATE-10 cover Cancel in Chromium; the
on-device Cancel pass is still owed and is recorded here as NOT RUN, not passed.

## OPEN — the red status dot

The PO reports, and a screenshot confirms:

    Status: Sync error · changes on this device aren't uploaded yet
            — tap to upload · synced 12:22 AM

That is the LEGACY status line (`syncState.s === "error"`), reached through the
`syncDotClass()` fallback — not the CAS conflict centre, which paints red only
for a recovery-blocked subsystem (`cfCasCentreSeverity()`).

Server state, measured (05:25Z and again continuously 05:30-05:35Z):

    huhguz7atzdq546  coreRev=85 trainingRev=10  updated 2026-07-30 05:06:30.938Z
    cf_commit_log:   0 rows

So: the 12:22 AM "synced" was a PULL; nothing has been uploaded; no CAS commit
has succeeded or been logged; the athlete's server data is untouched and intact.
A five-minute server watch during the report window recorded no change at all.

### Reproduction status — NOT yet reproduced

`day1-repro-probe.js` drives the PO's exact sequence against a disposable
PocketBase running the shipping kit: pre-sign-in data, sign in, gate, set aside,
pull. Result: data pulls, **dot GREEN, CAS synced, dirty false** — no error.

Known differences from the PO's device, any of which may matter:

- his server row is at coreRev=85 from many legacy-bridge writes; the probe's
  row is at coreRev=1 (a direct PATCH of coreRev is REFUSED by the server, 400,
  so the probe cannot yet forge a high bridge-set revision);
- his account has photos and operational fields (health, coachreq); the probe
  account has none;
- his device carries real Safari storage history; the probe starts clean.

**Not diagnosed. Not assumed benign.** The next fact needed is what happens when
the athlete taps "tap to upload" — success, or a named error — with the server
watched from the other side. Until then CANARY-08/09/10 (pending -> syncing ->
synced, coreRev advances exactly once, ledger row attributed to the athlete)
cannot be marked, and the 48-hour clock does not start.

## Safety position while this is open

- root serves .347, untouched and hash-verified after republication;
- the athlete's server data is unchanged (coreRev 85, ledger 0);
- his installed .347 app is untouched and still works;
- the set-aside copy of the pre-sign-in data is preserved on the device;
- rollback to the halted .348 is one command, artifact backed up off-repo.


---

## RESOLVED: the red dot was FIX-004, a real defect

Diagnosed and reproduced 2026-07-30, after the PO reported that tapping **Test**
turned the dot green while the server showed no write at all.

`scheduleCloudPush()` sets `cfSetPending("push")` — the legacy "changes on this
device aren't uploaded yet" marker, drawn RED — and schedules the CAS commit.
**The CAS success path never cleared the marker**, and `syncDotClass()` falls
through to the legacy state whenever the conflict centre has nothing to show.

Reproduced on a disposable instance (`day1-repro-probe.js`): commit `200`,
`newRev 1`, CAS `synced`, `dirty false` — dot still `bad`, message still
"aren't uploaded yet", `cfPending` still `"push"`.

Why the server never changed in his case: local and server already agreed after
the pull, so there was genuinely nothing to upload. Tapping **Test** ran a
legacy path that ends in `setSync("ok")`, clearing the false alarm. His data was
never at risk at any point.

**Day one therefore FAILS at CANARY-08** (pending -> syncing -> synced never
reaches synced). The window did not start.

Fixed by `cfCasSyncLegacyStatus()`, which clears the marker only when the whole
CAS surface is settled and neither subsystem is locally dirty — so a blocked or
unsent sibling keeps the honest warning. Covered permanently by
`tests/browser/sync-status.browser.test.js` STATUS-H-01..05 with a negative
control that exits 1.

New candidate `2026-07-30.350-pb-c10` (`c3dc0321…`, 1,191,327 bytes) is with the
Architect. **Nothing republished**: `/canary/` still serves `.349`, root `.347`.

### Unresolved, reported not fixed

On a clean account with no photos, the boot path sets a red legacy error
"photo list incomplete — nothing removed" BEFORE any edit (seen in probe
output). Not investigated, not assumed benign, raised with the Architect.
