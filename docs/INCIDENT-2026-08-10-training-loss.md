# Incident — training data destroyed by the app, 2026-08-10

**Severity:** data loss, recovered. **Subsystem:** M8 training sync.
**Reported by:** the Owner ("My routines have disappeared").
**Fixes:** builds 480, 481, **484 / 485 / 486** (483 was rejected in review —
see §4). **Architect review:** four rounds, 2026-08-11. This record answers ruling 13
of round 0 and rulings 11/16 of the later rounds.

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
be sent from now on (done in 484).

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

- a push that ran before `loadTraining()` did;
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

**483 — REJECTED IN REVIEW, kept here as history.** It replaced the boolean
with a durable "delete-all intent" record minted in `saveTraining`. The
Architect found the hole: `saveTraining` runs *after* state has changed and
compares the result against the base, so it observes a **state**, not a
**command** — any bug that emptied training and then called the generic save
would have minted its own authority. The same defect the design existed to
prevent, one level up. Its content hash was also wrong on its own terms
(FNV-1a over UTF-16 code units, `String.length` appended while documented as
UTF-8 byte length, no `Math.imul`), so any non-ASCII exercise name would have
made a future server disagree. **Never deployed.**

**484 / 485 / 486 — the shipped fix.** The Owner was asked what scenario the
machinery served, and answered that he never clears out all his training. So
the app does not need to tell a genuine delete from a failed load:

- **An empty training is never uploaded over a non-empty server.**
  Unconditional, for training as for core. The intent records, hashing, journal
  proof schema, command boundary and confirmation dialog are all deleted — 201
  lines out of the sync layer, 100 in.
- **Stated plainly, because it is the consequence:** Compound has **no
  supported delete-all-training operation**. Not through sync, and not through
  the conflict banner, which refuses an empty local copy for the same reason.
  If that is ever wanted it is a new destructive feature with its own reviewed
  command and server contract.
- **The invariant sits at the dispatch choke point** for both subsystems —
  `m8CasCommit` and `m10cDispatch` — so a journal replay cannot route around
  it. The core refusal was initially in `m10cPush` only, which a replay through
  `m10cRecover` bypassed; that gap is closed.
- **`priorCanon` is mandatory** at the training choke point. It used to default
  to a fresh read of the base, and that default was a live bug: a replay was
  judged against whatever the base holds *now* rather than the content the
  request was written to replace. Every caller now declares its prior, and a
  caller that does not cannot commit at all.
- **`emptyRefused`** is its own result, never folded into
  `conflict`/`fenceStale`/`auth`/`transport`.
- **A refused stored request is left exactly where it is** — same key, byte
  identical, not quarantined — and surfaces as a conflict.
- **`clientBuild`** on training commits, and `fenceStale` added to the
  journal's terminal-outcome list where it was written but never listed.
- **Three-state load contract** (`ok` / `absent` / `unknown`) on both
  `loadTraining` and `load()`. It no longer decides anything; it is the honest
  answer to "why", carried in the conflict record.
- **485** — `priorCanon` made mandatory after the Architect found that a replay
  was judged against the *current* base rather than the content the stored
  request was written to replace. Every caller now declares its prior.
- **486** — a refused replay used to build the conflict banner from the current
  base, so the guard protected one document while the UI offered another as
  "the server's copy". It now fetches what the server actually holds; if that
  fetch fails, no local record is substituted and the state is typed and
  retryable. And a missing `priorCanon` returns `priorMissing`, not
  `emptyRefused` — a programming defect must not reach the athlete dressed as a
  disagreement about his data.

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
| the m8 choke-point invariant disabled | 4 fail |
| the m8 early refusal in `m8Push` disabled | 1 fail |
| `priorCanon` no longer mandatory | 2 fail |
| replay drops the journal's prior and reads the current base | 1 fail |
| the core DISPATCH refusal disabled | 1 fail |
| the core PUSH refusal disabled | 1 fail |
| the journal-preservation disposition changed | 1 fail |

Two of those exist because the first attempts at them were vacuous. The core
push mutant initially survived — both core guards were in place, so the
dispatch layer caught the same case and the assertion could not tell which had
acted; it now asserts the push-layer block reason and that no journal was
written. The replay mutant initially survived for the mirror reason — the test
asserted refusal, which the mandatory-`priorCanon` rule produces on its own, so
a case was added where the stored request is HARMLESS and must actually
dispatch.

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
