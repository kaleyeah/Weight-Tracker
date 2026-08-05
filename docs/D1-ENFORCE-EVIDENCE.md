# D1 — fence enforcement, Stage 1 (client half)

Stage 1 makes the **client** honest about the writer pen while the server flag
stays OFF. Nothing here flips `FENCING_ENFORCED_DEFAULT` (`cf_m10_shared.js:16`);
that is Stage 2, a separate Owner decision with its own checklist (G13).

The order matters. Flipping the server first, with the client as it was, would
have hard-blocked training sync on the Owner's own holder device: the training
commit sent no fence, and its 409 classifier mapped **any** 409 to `keyReused`
→ `m8Block("sync integrity error — request key reused")`, a block that taking
over cannot clear.

## What changed

| | Defect | Fix |
|---|---|---|
| **F1** | `m8CasCommit` — the TRAINING commit — sent no `fence` and no `deviceId`, so enforcement would reject every workout sync | the commit carries the fence and this installation's device id, proven at **dispatch** (the `m10pDispatch` rule), and fails closed when no verified device identity exists |
| **F2** | any 409 was classified `keyReused` → hard block | `fenceStale` is classified first and treated as displacement: journal ends, work stays local and dirty, **never** `m8Block()` |
| **F3** | a device without the pen still pushed training | refused before a request identity is minted or a journal written |
| **F4** | `M10.booted` was an AND-term of the core strict gate, so a session where the lease never settled skipped the gate and pushed `fence:null` — and `m10Boot()` ran only at page load, so signing in mid-session left it unsettled all session | the gate fails **closed** on `!M10.booted`, and the login continuation settles the lease before the first write-capable moment |
| **F5** | `m10cDispatch` used the fence captured at **enqueue** and never re-proved it | a captured fence that no longer matches terminalizes to the existing `fence-displaced` review instead of going on the wire |
| **F6** | `why==="expired"` toasted "no longer the active writer" while the read-only bar stayed hidden — read-only with no way to act, until reload | expired routes to the takeover sheet, like `not-holder`. Genuinely unrecoverable reasons (corrupt identity, paused storage) still toast |

F4 is the one the Owner actually felt: unfenced `subsystem:"core"` pushes are
the documented source of false "Body data needs your review" prompts, twice in
one evening on 2026-08-04.

## Evidence 1 — client behaviour (`tests/browser/c25-fence-stage1.browser.test.js`)

**42 assertions, 42 passed**, real Chromium against the built artifact, with the
server mocked at the route layer so each arm can assert what the client actually
put on the wire.

## Evidence 2 — the tests were verified by reinstating the bugs

A suite that passes proves nothing until it is shown to fail for the right
reason. Each fix was individually reverted in a copy of the artifact and the
suite re-run:

| Mutation | Result | Arms that caught it |
|---|---|---|
| `F1-unfenced` — drop fence/deviceId | **3 failed** | carries the held fence; carries this deviceId; F2's fenced-commit precondition |
| `F2-keyreused` — remove the `fenceStale` classifier | **2 failed** | displaced writer is never hard-blocked; journal ended |
| `F3-ungated` — remove the pen gate on `m8Push` | **1 failed** | no request identity minted, no journal written |
| `F4-failopen` — restore `M10.booted &&` in the gate | **2 failed** | no unfenced commit escaped; nothing on the commit route |
| `F4-noboot` — remove `m10Boot()` from the login continuation | **2 failed** | login settles the lease; device holds a real fence |
| `F5-noreval` — use the captured fence unchecked | **1 failed** | never reached the commit route |
| `F6-toast` — restore the expired message | **2 failed** | no dead-end toast; offers takeover |

Two mutations initially **survived** — `F3-ungated` and `F4-failopen` — because
those arms asserted the wrong thing. `F3` measured commit count, which
`m8CasCommit`'s own fail-closed already forces to zero either way; it now
observes the journal **write** through a `Storage.prototype.setItem` spy.
`F4` asserted a `false` return, which any downstream failure produces; it now
asserts the distinguishing outcome — an unfenced body on the commit route.
Both were strengthened until the mutation failed. This is the whole reason the
step exists.

## Evidence 3 — the real server (enforce mode)

A disposable PocketBase (`tests/setup-instance.sh <dir> enforce`, fresh
`pb_data`, `127.0.0.1:8099`, deleted afterwards) running the M10 package with
`CF_M10_ENFORCE_OVERRIDE=1` — **9 assertions, 9 passed**:

- the disposable device acquires the lease and gets fence 1
- **an unfenced training commit is rejected** `409 {"fence":1,"fenceStale":true,"ok":false}` — this is exactly what the pre-Stage-1 client sent
- a wrong fence is rejected
- the right fence from the **wrong device** is rejected
- **the Stage-1 fenced training commit is accepted** `200 newRev 1`
- the three rejected attempts mutated nothing (the accepted commit is still revision 1 — the server validates before the mutation, inside the same transaction)
- the same holds for the `core` subsystem
- the disposable athlete was deleted and **verified absent** (`404`)

No production data, no Owner account, no NAS server was involved at any point.

## What Stage 1 does NOT do

- It does not flip `FENCING_ENFORCED_DEFAULT`. The server still accepts
  unfenced writes from any client build.
- It does not set `MIN_CLIENT_BUILD` (`cf_cas_shared.js:20`, empty and inert).
- `enforce-suite.json` is 92/92 but dated 2026-08-02, which **predates commit
  `0a1016d`** — it must be re-run before Stage 2, not cited as current.
- G13 device-side evidence has never been recorded, and ROLLBACK steps 1–3 are
  unrehearsed. Both are Stage 2 preconditions.
