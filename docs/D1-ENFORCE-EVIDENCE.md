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
| **F1** | `m8CasCommit` — the TRAINING commit — sent no `fence` and no `deviceId`, so enforcement would reject every workout sync | the commit carries the fence and this installation's device id, proven at **dispatch** (the `m10pDispatch` rule). Round 2: attachment is the WIRE INVARIANT — a commit that cannot carry proof is refused locally and never sent (Architect finding 1; the round-1 best-effort design was ruled fail-open) |
| **F2** | any 409 was classified `keyReused` → hard block | `fenceStale` is classified first and treated as displacement: journal ends, work stays local and dirty, **never** `m8Block()` |
| **F3** | a device without the pen still pushed training | refused before a request identity is minted or a journal written. Round 2: a pen-less REPLAY is also refused (locally, journal preserved byte-for-byte) — under the enforcement-OFF production server an unfenced replay would be accepted (Architect finding 2) |
| **F4** | `M10.booted` was an AND-term of the core strict gate, so a session where the lease never settled skipped the gate and pushed `fence:null` — and `m10Boot()` ran only at page load, so signing in mid-session left it unsettled all session | the gate fails **closed** on `!M10.booted`, and the login continuation settles the lease before the first write-capable moment |
| **F5** | `m10cDispatch` used the fence captured at **enqueue** and never re-proved it | a captured fence that no longer matches terminalizes to the existing `fence-displaced` review instead of going on the wire |
| **F6** | `why==="expired"` toasted "no longer the active writer" while the read-only bar stayed hidden — read-only with no way to act, until reload | expired routes to the takeover sheet, like `not-holder`. Genuinely unrecoverable reasons (corrupt identity, paused storage) still toast |

F4 is the one the Owner actually felt: unfenced `subsystem:"core"` pushes are
the documented source of false "Body data needs your review" prompts, twice in
one evening on 2026-08-04.

## Evidence 1 — client behaviour (`tests/browser/c25-fence-stage1.browser.test.js`)

**54 assertions, 54 passed**, real Chromium against the built artifact, with the
server mocked at the route layer so each arm can assert what the client actually
put on the wire.

## Evidence 1b — the full tier, and the regression it caught

`node tests/browser/run-all.js` — **26 suites, all passed** (1 of them,
`cache-sw`, SKIPPED for a missing `.347` artifact; a skip is not a pass, and 8
suites exit 0 without printing a parseable summary line).

The first run of the tier was **red**: `c11m8-replay` 5 passed / 5 failed. The
cause was a real defect in the first cut of this work, not a test problem.

`m8CasCommit` serves two callers: a NEW push, and **journal replay** — re-sending
a request this device already made, to learn whether the server applied it.
Fail-closed had been placed at dispatch, so it blocked both. A device that no
longer holds the pen could no longer resolve its own in-flight journal, which
strands unsynced work indefinitely — a data-loss risk introduced by a change
whose entire purpose was protecting data.

The round-1 response moved fail-closed onto starting work and made dispatch
attachment best-effort, so replays always proceeded — **superseded in round 2**:
the Architect ruled the unfenced replay unsafe while production enforcement is
OFF. The final design refuses a proof-less replay LOCALLY, preserves its
journal byte-for-byte, and replays fenced once the pen is reacquired. See the
Round 2 section.

The suite that caught it was written months earlier, for a different purpose,
by someone not thinking about fences. The 42 assertions written specifically
for this change all passed against the broken build.

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
| `F1b-nodevguard` — drop the device-id guard on fence attachment | **2 failed** | no fence claimed without an identity; no null deviceId on the wire |
| `F3b-replayblocked` — reinstate fail-closed at dispatch | **2 failed** | the captured request is still replayed |

Two mutations initially **survived** — `F3-ungated` and `F4-failopen` — because
those arms asserted the wrong thing. `F3` measured commit count, which
`m8CasCommit`'s own fail-closed already forces to zero either way; it now
observes the journal **write** through a `Storage.prototype.setItem` spy.
`F4` asserted a `false` return, which any downstream failure produces; it now
asserts the distinguishing outcome — an unfenced body on the commit route.
Both were strengthened until the mutation failed. This is the whole reason the
step exists.

### Two guards that looked identical and were not

A later mutation exposed something the assertions could not. The first cut had
**two** device-identity checks, written as defence-in-depth:

1. one in `m8HasPen()` — **unreachable**. A malformed stored id sets
   `M10.corrupt` directly (`m10-lease-core.js:32`) and `m10Boot` sets it for any
   null id (`:135`), so `m10AuthNow()` already refuses on corrupt before the
   holder test. Reverting it left every assertion green. **Deleted** — dead
   defensive code reads exactly like protection and survives review unchallenged.
2. one in `m8CommitFence()` — **reachable**, and nearly deleted for looking the
   same. `m10DeviceId()`'s `catch` arm returns null *without* marking corrupt
   (`:46`), so a throwing storage read leaves a genuine holder with no identity
   to bind a fence to. Without the guard it would claim a fence while
   identifying no device. **Kept**, and `F1c` now builds that exact condition —
   a `Storage.prototype.getItem` that throws for the device-id key only.

Reading the code gave the same answer for both, and that answer was wrong once.
Only deliberately reaching each guard distinguished them.

## Evidence 3 — the real server (round 1: enforce mode only; round 2 adds the OFF-mode run)

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

---

# Round 2 — the Architect's three blocking findings, applied

Round-1 verdict: **CHANGES REQUIRED**. All three blockers were real defects in
the round-1 candidate, and one of them — finding 1 — was a fail-open hiding
inside the very arm (`F1c`) written to prove fail-closed.

## Finding 1 → the wire invariant

`m8CommitFence` attached proof best-effort; when it could not, it returned and
`m8CasCommit` **sent the unfenced request anyway**. The F1c arm asserted no
fence was attached — never that no request was sent — so it passed while the
unfenced commit went out. Under production's enforcement-OFF server that
request is accepted and mutates data.

Now: `m8CommitFence` returns false when proof cannot be attached, and
`m8CasCommit` refuses locally (`{st:"fenceStale"}`) — **no training commit
leaves the client without both fence and matching deviceId, on any path.**
F1c asserts ZERO training requests (mutation `F1b-failopen` reinstates the
exact ruled bug and fails it).

## Finding 2 → pen-less replay refuses, preserves, offers takeover

Round 1 dispatched replays unfenced by design, reasoning from the
enforcement-ON server. Ruled unsafe for the OFF transition: an accepted replay
is a mutation without writer authority. Now a pen-less replay is refused
locally; F3b proves zero requests, a **byte-identical** journal, and the
takeover message surfacing. F3c proves the recovery contract survives: once
the pen is reacquired, **exactly one** fenced replay resolves the journal
(terminal histories pinned by c11m8-replay, which now runs with a granted
lease per the ruling — recovery guarantees preserved, old unfenced network
behavior not binding).

## Finding 3 → command-boundary gate on `m8CxChooseLocal`

The click-layer `M10_GATED` entry is UX, not authority. `m8CxChooseLocal` now
checks start-authority itself, before minting a request identity or writing a
journal; refusal preserves the conflict record untouched and opens the
takeover sheet. F7 proves direct programmatic invocation without authority
does nothing (zero journal writes, zero network, byte-identical conflict
record); F7b proves the authorized path dispatches fenced. All four
`m8CasCommit` call paths are classified in the source and individually
mutation-tested (F8 covers the conflict-retry path: both attempts fenced,
fresh request identity).

## Round-2 evidence

- c25: **69/69** (arms F1c/F3b rewritten to the ruling's required observations;
  F3c/F7/F7b/F8 added)
- mutations: **10**, one per protection incl. one per call path — see
  MUTATION-RUNS.txt
- server proof, **both modes** (required evidence 7): enforce-ON 9/9 (unfenced
  rejected before mutation); enforce-OFF 8/8 — documenting that the OFF server
  **accepts** unfenced and even wrong-fence commits, which is precisely why the
  client-side wire invariant is load-bearing until Stage 2
- the runner timeout is now real: group-kill + self-test (4/4, grandchild
  verified dead), separate commit; skips report separately and required suites
  may not skip
- full tier re-run under the fixed runner against the final artifact
