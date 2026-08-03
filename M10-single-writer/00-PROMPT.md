# M10 single-writer — round 29: client increment 5 (the gate surface)

You are the Architect for the Compound project (read-only; rulings bind
the Engineer; the Owner alone authorizes deployment and live-data
mutation).

Increment 5, the final client increment, implemented locally on the
accepted increment-4 head. `client-increments/INCR5-README.md` is the
package record; `INCR5-ACTION-INVENTORY.md` is the mapping ruling 8
requires.

Identity: base `249fd0e` → code head `48e966a`; index.html sha256
`57461665696f2a844f2bba57dd729a34e611004f9e0554e69fd7bf567d509cc2`;
`INCR5-DIFF.patch` (131 lines, index.html — `git diff --check` clean)
and `INCR5-TESTS-DIFF.patch` (the new C19 suite plus three harness
edits, below).

**Design — one choke point rather than 104 branch edits.** A
capture-phase `click` listener runs BEFORE the application dispatcher;
for any `data-act` in the generated `M10_GATED` set it calls
`m10GateAction`, and on refusal issues `stopImmediatePropagation()` +
`preventDefault()` so the application handler never executes. This is
strictly stronger than per-branch edits and is one reviewable
primitive. `m10AuthNow()` is the fresh complete check: account, session
generation, holder, unexpired deadline, valid safe-integer fence,
identity not corrupt, storage not blocked. Local-only apps (no sync
account) pass — no lease concept exists there.

**Ruling 8 — the inventory.** `INCR5-ACTION-INVENTORY.md` lists all 274
dispatcher branches: 104 gated (each with its mutation classes —
core / training / photos / import-health / deferred-open — and the C19
tests covering it) and 170 deliberately ungated view/selection/
navigation branches with the reason (gating them would stop a
read-only device from navigating its own data, which STRICT allows).
The classification is derived from each branch's actual persistence
primitives (`save`, `saveLocal`, `saveTraining`, `saveWorkout`, `idb*`,
`cloudPush/Pull`, `pbSave`, `applyImport`, `hkTryFetch`), not a count.

**Delayed asynchronous boundaries.** File pickers capture authority at
the opening click and REVALIDATE in a capture-phase `change` listener
before any application handler reads the files. `askConfirm` is wrapped
so a sheet raised WHILE holding the pen revalidates at confirm time —
and, deliberately, a sheet raised WITHOUT the pen is not wrapped,
because take-over, displaced review, discard and conflict resolution
are the flows that repair the situation. (An unconditional wrapper
deadlocked takeover; the accepted increment-1 and increment-3 suites
caught it immediately.) Comparison is identity-based — same uid AND
fence AND session generation — so A→B→A or a same-account fence
replacement invalidates the capture.

**Logout coupling.** Sign-out is refused while core sync is dirty or
unproven, while any core journal or dx recovery is open, while a core
review is pending or corrupt, and while ANY photo queue entry exists —
each with a plain-language prompt and a repair action. A clean device
signs out normally.

**Fail-closed.** Corrupt identity, raised storage block, expired
deadline, missing/invalid fence, or absent account all refuse.

**Evidence** (fresh at `48e966a`): `INCR5-C19-OUTPUT.txt` 17/17 —
inventory membership; non-holder interception; holder pass-through;
four fail-closed arms; two delayed-picker arms (pen lost, fence
replaced); three confirmation arms (expired, still-holder, A→B→A);
four logout-coupling arms plus the clean case. Accepted suites rerun:
C18 52/52, C17 37/37, C16 49/49, C15 35/35.
`INCR5-M8-REGRESSION.txt` carries the client matrix.

**Test-harness changes, disclosed:** (a) C14 previously signed in with
no lease route mocked; under the wired gate that device is not the
holder, so its mutating clicks were correctly refused and the suite
crashed. Its route stub now answers the lease route as a granting
server — a harness change only, no product change; C14 is 67/67 again.
(b) C15 case K asserted increment 1's documented "gate not yet wired"
limit; it is now the inverse assertion (refused, dispatcher never
runs). (c) C17 T10 accepted the increment-3 logout wording; increment 5
owns that prompt now, so it accepts either — the property tested is
unchanged.

Requested ruling: acceptance of increment 5 and, with it, the M10
client. Nothing beyond local implementation is requested; NAS
deployment, coach migration, enforcement, publication and the
two-device release all remain Owner-gated.
