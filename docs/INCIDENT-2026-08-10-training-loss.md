# Incident — training data destroyed by the app, 2026-08-10

**Severity:** data loss, recovered. **Subsystem:** M8 training sync.
**Reported by:** the Owner ("My routines have disappeared").
**Fixes:** builds 480, 481, 483. **Architect review:** round 0, 2026-08-11,
14 numbered rulings; this record answers ruling 13.

Written because "PATCHed back" is a live-data mutation and must not survive as
an informal note in a chat log. Anything below stated as fact was read off a
record; anything not is marked as a hypothesis and stays one.

---

## 1. Established facts

From `cf_commit_log`, the server-side ledger:

| field | value |
|---|---|
| timestamp | `2026-08-10T07:17:49.493Z` |
| subsystem | `training` |
| expectedRev → resultingRev | `36 → 37` |
| fileByteLength | `0` |
| responseStatus | `200` |
| clientBuild | `""` (empty) |

Every neighbouring commit in the ledger carries `clientBuild: "…478…"`. This one
carries nothing, because the training route — `m8CasCommit` — was the only
commit path in the app that never sent the field. That absence is what
identified the route within minutes, and it is why ruling 10 requires the field
be sent from now on (done in 483).

**What was lost:** 3 routines, 25 exercises, 9 lift sessions (latest 2026-08-08)
and 14 cardio sessions — replaced by an empty training object.

**What was NOT touched:** the core `data` blob. 22 weights, latest 2026-08-10
at 183 lbs, verified intact before and after the restore. Photos untouched.

## 2. A defect capable of producing this — NOT a determination of what did

**The historical trigger is unknown and this section does not claim otherwise.**
What follows is a defect that was present, that is sufficient to produce exactly
the ledger row in §1, and that has been removed. It is not evidence that it is
what happened on the day.

`loadTraining()` wrapped its whole body in `try{…}catch(e){}`. A throwing
`localStorage`, truncated bytes, unparseable JSON and an absent key were all
indistinguishable from success, and all left `state.training` at its empty
default. Boot would continue, and `m8Push` would compare empty-local against a
base holding his training, find a difference, and classify it as an ordinary
edit.

Nothing in the pipeline would have malfunctioned in doing so. Every layer would
have done what it was told, on a premise nobody had checked. That is the
property that made the defect worth removing regardless of whether it fired
here.

### Ruled out

A store whose reads **throw** cannot produce this record. In that case the boot
capture cannot secure the pre-sync bytes, `recoveryState` becomes `"blocked"`,
and `m8Push` returns on its first line via `trainingQuarantined()`. Verified in
a real browser with `getItem` throwing for `wl_training_v1`: no commit is sent.
That path was already safe and is now asserted in C44 so the two layers stay
distinguishable.

### Still hypotheses — not proven, and deliberately not chosen between

- a push that ran before `loadTraining()` did, during the .478 update reload;
- unparseable or truncated stored bytes;
- an absent/evicted key;
- some other path that constructed an empty training state.

The guards are written to cover **all** of them rather than to bet on one
(Architect ruling 1). Since build 484 the question is also no longer load-bearing:
an empty training is refused over a non-empty server **whatever** produced it,
so a future recurrence of any of these — or of a cause not on this list — is
stopped without needing to be identified first.

## 3. Recovery — what was actually done to live data

| item | value |
|---|---|
| source | Synology Btrfs hourly snapshot, `/volume1/docker/#snapshot/` |
| note | `#` must be `%23`-escaped in a SQLite URI or the path is silently truncated at the fragment |
| recovered payload | 41,910 bytes of training JSON |
| contents | 3 routines, 25 exercises, 9 lift sessions (latest Aug 8), 14 cardio sessions |
| method | `PATCH` to the PocketBase `appdata` record for the account, training field only |
| authorisation | Owner, in session, using a superuser token he supplied |
| verification | read-back of the record after write; the Owner then resolved the resulting M8 conflict on-device by exporting both copies and choosing the server's |
| core `data` blob | **not written**; confirmed unchanged (22 weights, latest Aug 10, 183 lbs) |
| photos | **not written** |

**Outstanding from this:** the superuser token used for the restore has not been
revoked. That is an Owner action and is listed in §6.

**Not captured, and it should have been:** a pre-restore export of the record as
it stood immediately before the `PATCH`. The snapshot is the authoritative
source and the empty state is fully described by the ledger row above, so
nothing is unrecoverable — but the next restore of live data takes that export
first.

## 4. What changed in the app

**480** — `loadTraining` records whether it read the store; `m8Push` refuses to
originate a push that would empty a non-empty base when it never loaded, routing
to the existing conflict banner rather than blocking hard.

**481** — the Architect rejected 480's treatment of an absent key as
"known empty". Load state is now three values (`ok` / `absent` / `unknown`) and
only `ok` authorises emptying. First-run is unaffected: with no base,
`m8State` is `fresh`/`bootstrap` and the refusal is never reached.

**483** — the completed contract:

- **Durable delete-all intent.** Minted only in `saveTraining`, at the moment
  the athlete's own edit takes training from content to nothing, bound to the
  device, the prior content hash, the resulting content hash, the generation
  and the revision. Never minted at dispatch — that is the difference between
  proof and a rubber stamp.
- **The invariant at the choke point.** `m8CasCommit` refuses any commit that
  would replace a known non-empty prior with nothing, unless handed a proof
  that matches that exact destruction. Covers new push, journal replay and
  conflict resolution alike, which is the standard `m8CommitFence` already set.
- **`emptyUnproven`** as its own result, never folded into
  `conflict`/`fenceStale`/`auth`/`transport`, whose execution and retry
  meanings differ.
- **Replay judges on journal-time evidence.** The proof travels inside the ack
  journal; a legacy journal from before proofs existed carries none, is refused,
  and is preserved rather than deleted or retroactively authorised.
- **Core subsystem.** `load()` had the identical defect. It now carries the same
  three-state contract, and `m10cPush` refuses to upload an empty core over a
  non-empty base. Core has no delete-everything gesture, so there is nothing to
  prove intent for and the refusal is unconditional.
- **`clientBuild`** on training commits.
- **`fenceStale`** added to the journal's terminal-outcome list — it was written
  but never listed, so a done-record outliving its own cleanup would have been
  quarantined as malformed. Found while adding `emptyUnproven` beside it.

## 5. Evidence

`tests/browser/c44-empty-training-refusal.browser.test.js` — 35 assertions.
The fixture has to be armed to reach the guards at all (a bare harness enters a
bootstrap conflict and reports `not-holder`, either of which would make "no
commit was sent" true for unrelated reasons); the delete-everything cases
require a commit to be **sent**, so a vacuous run fails rather than reading
green.

Mutation-tested against the shipping artifact — each guard removed in turn,
confirmed the suite fails, restored:

| mutation | result |
|---|---|
| the original 480 guard forced `false` | 3 fail; output is the destructive commit itself, `routines: []` at rev 36 |
| absent counted as `ok` (the 481 hole) | 1 fail — the eviction case, exactly |
| choke-point invariant disabled | 8 fail |
| device binding removed | 1 fail |
| generation binding removed | 1 fail |
| journal emptying-validation disabled | 1 fail |

Full browser gate green on the shipping artifact.

## 6. Open — Owner decisions

1. **Server-side backstop** (Architect ruling 11). A non-empty→empty transition
   should require an explicit destructive-intent field and a matching expected
   revision at the server. This is a wire and schema change against live data
   and needs a compatibility plan, disposable-server tests, a rollback and
   **explicit Owner authorisation**. Not started.
2. **Revoke the superuser token** used for the restore.
3. **Backups.** The recovery depended on a Synology snapshot that happened to
   exist. Nothing in the app or the deployment guarantees one.
