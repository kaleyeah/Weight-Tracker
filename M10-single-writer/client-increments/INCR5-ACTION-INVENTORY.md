# M10 increment 5 — mutation-boundary inventory (action → gate → test)

Regenerated after round 30, corrected in round 33. Classification follows
CALLEES transitively (depth ≤ 5), not branch text: a branch is gated when it
reaches any persistence primitive directly or through any callee.

**Round-30:** the four snapshot writers (`save`, `saveLocal`, `saveTraining`,
`saveWorkout`) are ALSO gated at the source, so a write is refused wherever it
originates — tap, timer, network callback, or a lazy migration during
rendering.

**Round-33 correction (item 4):** the previous edition had ONE "Ungated
actions" section whose text claimed every member "reaches no persistence
primitive through any callee" — while the list contained `m10cx:mine`,
`m10cx:export`, `m8:cx:export`, `m10p:discard`, `pb:logout` and `confirm:yes`,
all of which persist. That was internally contradictory, so the section is now
split into three: the boot-recovery EXEMPTIONS, the ungated MUTATIONS with
their handler-level authorization contracts, and the genuinely read-only
remainder. Nothing in the second group is described as non-persisting.

**Round-33 correction (item 6):** `migrateProgressionTypes()` is no longer
treated as substrate. It normalises in memory always, and PERSISTS only with
the pen — see INCR5-DURABLE-WRITERS.md.

## Mutation boundaries — all of them

| boundary | gate | tests |
|---|---|---|
| dispatcher `click` on `[data-act]` | capture-phase interceptor → `m10GateAction` | C19 T1–T4, T9 |
| global `input` / `change` on form controls | capture-phase interceptor; prior value restored; only individually identified recovery controls exempt (round-30 ruling 5) | C19 T8 ×3 |
| **snapshot writers** (save/saveLocal/saveTraining/saveWorkout) | gated at source (`m10AuthNow`), refusals counted on `window.__m10WriteRefused`. The withdrawn `m10InternalWrite` guard is gone — it was declared and never set (round-31 ruling 3). | C19 T4, T13, and every accepted suite |
| **the boot training migration** (`migrateProgressionTypes` → `saveTrainingLocal`) | in-memory normalisation always; the durable write requires `m10AuthNow().ok`. Idempotent, and re-run once `m10Boot()` settles the lease, so the holder still persists it. (round-33 item 6) | C19 T13 ×5 |
| file pickers + their post-async continuations | authority captured at open AND change; revalidated after `FileReader.onload`, after `processImage`/`idbAll`, before every delete/add | C19 T5 ×2, T11 |
| confirmation callbacks | captured when raised by a holder; revalidated at confirm; sheets raised WITHOUT the pen exempt so takeover/review can repair | C19 T6 ×3 |
| HealthKit import callback | ONE immutable capture stored with `state.hkWait`; revalidated on every poll, before the local mutation, and before each mailbox clear (round-30 ruling 1) | C19 T10 |
| photo/core/training transport | M10-BLOCK-2/3/4 (fenced routes, journals, queue) | C15–C18 |
| logout | every M10 obligation blocks, including a MALFORMED photo queue via the typed read | C19 T7 ×5, T12 |

## Gated actions (128) — the contents of `M10_GATED`

| action | why gated | tests |
|---|---|---|
| `act:addcat` | direct | C19 T1/T2/T3/T4 |
| `act:del` | direct | C19 T1/T2/T3/T4 |
| `act:toggle` | direct | C19 T1/T2/T3/T4 |
| `ai:copy` | via weeklyAIText | C19 T1/T2/T3/T4 |
| `ai:gen` | via genSummary | C19 T1/T2/T3/T4 |
| `cal:ignore` | direct | C19 T1/T2/T3/T4 |
| `cal:overwrite` | direct | C19 T1/T2/T3/T4 |
| `cal:usecalc` | direct | C19 T1/T2/T3/T4 |
| `cardio:del` | direct | C19 T1/T2/T3/T4 |
| `cardio:save` | direct | C19 T1/T2/T3/T4 |
| `cf:newtype` | direct | C19 T1/T2/T3/T4 |
| `conn:remove` | direct | C19 T1/T2/T3/T4 |
| `day:clear` | direct | C19 T1/T2/T3/T4 |
| `day:reopendo` | via reopenDay | C19 T1/T2/T3/T4 + T9 |
| `ex:clearall` | direct | C19 T1/T2/T3/T4 |
| `ex:del` | direct | C19 T1/T2/T3/T4 |
| `ex:save` | direct | C19 T1/T2/T3/T4 |
| `ex:seedall` | direct | C19 T1/T2/T3/T4 |
| `exseed:add` | direct | C19 T1/T2/T3/T4 |
| `fb:done` | direct | C19 T1/T2/T3/T4 |
| `fb:set` | direct | C19 T1/T2/T3/T4 |
| `glp:compound` | via glpNormalize | C19 T1/T2/T3/T4 |
| `glp:compoundsave` | direct | C19 T1/T2/T3/T4 |
| `glp:dose:del` | direct | C19 T1/T2/T3/T4 |
| `glp:dose:open` | via glpNormalize | C19 T1/T2/T3/T4 |
| `glp:dose:save` | direct | C19 T1/T2/T3/T4 |
| `glp:enable` | direct | C19 T1/T2/T3/T4 |
| `glp:showdue` | direct | C19 T1/T2/T3/T4 |
| `glp:siterot` | direct | C19 T1/T2/T3/T4 |
| `glp:skip` | direct | C19 T1/T2/T3/T4 |
| `glp:sym:del` | direct | C19 T1/T2/T3/T4 |
| `glp:sym:edit` | via glpNormalize | C19 T1/T2/T3/T4 |
| `glp:sym:newsave` | direct | C19 T1/T2/T3/T4 |
| `glp:sym:open` | via glpNormalize | C19 T1/T2/T3/T4 |
| `glp:sym:save` | direct | C19 T1/T2/T3/T4 |
| `glp:symptoms` | direct | C19 T1/T2/T3/T4 |
| `glp:titration` | direct | C19 T1/T2/T3/T4 |
| `hk:import` | direct | C19 T1/T2/T3/T4 + T5/T10/T11 |
| `import` | deferred-open | C19 T1/T2/T3/T4 + T5/T10/T11 |
| `invite:create` | direct | C19 T1/T2/T3/T4 |
| `invite:join` | direct | C19 T1/T2/T3/T4 |
| `lift:del` | direct | C19 T1/T2/T3/T4 |
| `lift:save` | direct | C19 T1/T2/T3/T4 |
| `lift:savedetail` | direct | C19 T1/T2/T3/T4 |
| `m10cx:server` | via m10cxTakeServer | C19 T1/T2/T3/T4 |
| `m10cx:takeover` | direct | C19 T1/T2/T3/T4 |
| `m10p:apply` | via m10pReviewApply | C19 T1/T2/T3/T4 |
| `m10p:export` | via m10pExport | C19 T1/T2/T3/T4 |
| `m8:cx:local` | via m8CxChooseLocal | C19 T1/T2/T3/T4 |
| `m8:cx:server` | direct | C19 T1/T2/T3/T4 |
| `macro:keep` | direct | C19 T1/T2/T3/T4 |
| `macro:suggest` | direct | C19 T1/T2/T3/T4 |
| `max:open` | direct | C19 T1/T2/T3/T4 |
| `night:gen` | via genNightly | C19 T1/T2/T3/T4 |
| `night:toggle` | direct | C19 T1/T2/T3/T4 |
| `note:del` | direct | C19 T1/T2/T3/T4 |
| `note:save` | direct | C19 T1/T2/T3/T4 |
| `ob:back` | direct | C19 T1/T2/T3/T4 |
| `ob:recalc` | direct | C19 T1/T2/T3/T4 |
| `paste:do` | direct | C19 T1/T2/T3/T4 |
| `pb:adv` | via pbRenderLogin | C19 T1/T2/T3/T4 |
| `pb:pwsave` | direct | C19 T1/T2/T3/T4 |
| `pbk:import` | deferred-open | C19 T1/T2/T3/T4 + T5/T10/T11 |
| `photo:add` | deferred-open | C19 T1/T2/T3/T4 + T5/T10/T11 |
| `pphoto:add` | deferred-open | C19 T1/T2/T3/T4 + T5/T10/T11 |
| `preset:del` | direct | C19 T1/T2/T3/T4 |
| `reminder:add` | direct | C19 T1/T2/T3/T4 |
| `reset:ask` | deferred-open | C19 T1/T2/T3/T4 + T5/T10/T11 |
| `reset:do` | direct | C19 T1/T2/T3/T4 |
| `ri:mv` | direct | C19 T1/T2/T3/T4 |
| `ri:pick` | direct | C19 T1/T2/T3/T4 |
| `ri:prog` | direct | C19 T1/T2/T3/T4 |
| `ri:remove` | direct | C19 T1/T2/T3/T4 |
| `rt:del` | direct | C19 T1/T2/T3/T4 |
| `rt:new` | direct | C19 T1/T2/T3/T4 |
| `rt:save` | direct | C19 T1/T2/T3/T4 |
| `set:activity` | direct | C19 T1/T2/T3/T4 |
| `set:sex` | direct | C19 T1/T2/T3/T4 |
| `set:strategy` | direct | C19 T1/T2/T3/T4 |
| `set:theme` | direct | C19 T1/T2/T3/T4 |
| `set:ttype` | direct | C19 T1/T2/T3/T4 |
| `set:units` | direct | C19 T1/T2/T3/T4 |
| `set:weekstart` | direct | C19 T1/T2/T3/T4 |
| `skip:calories` | direct | C19 T1/T2/T3/T4 |
| `skip:sleep` | direct | C19 T1/T2/T3/T4 |
| `skip:steps` | direct | C19 T1/T2/T3/T4 |
| `skip:weight` | direct | C19 T1/T2/T3/T4 |
| `status:end` | direct | C19 T1/T2/T3/T4 |
| `status:endnow` | direct | C19 T1/T2/T3/T4 |
| `status:save` | direct | C19 T1/T2/T3/T4 |
| `sum:coachreport` | via srExport | C19 T1/T2/T3/T4 |
| `sum:exportall` | via exportAllFiles | C19 T1/T2/T3/T4 |
| `sum:exportweek` | via exportWeekFiles | C19 T1/T2/T3/T4 |
| `sum:toggle` | direct | C19 T1/T2/T3/T4 |
| `sync:pasteapply` | direct | C19 T1/T2/T3/T4 + T9 |
| `sync:pull` | direct | C19 T1/T2/T3/T4 |
| `sync:push` | direct | C19 T1/T2/T3/T4 |
| `sync:test` | via cloudTest | C19 T1/T2/T3/T4 |
| `tdee:apply` | direct | C19 T1/T2/T3/T4 |
| `tdee:later` | direct | C19 T1/T2/T3/T4 |
| `weight:add` | direct | C19 T1/T2/T3/T4 |
| `weight:del` | direct | C19 T1/T2/T3/T4 |
| `wo:addset` | direct | C19 T1/T2/T3/T4 |
| `wo:begin` | direct | C19 T1/T2/T3/T4 |
| `wo:bwsave` | direct | C19 T1/T2/T3/T4 |
| `wo:delset` | direct | C19 T1/T2/T3/T4 |
| `wo:discard` | direct | C19 T1/T2/T3/T4 |
| `wo:discardnow` | direct | C19 T1/T2/T3/T4 |
| `wo:endnow` | direct | C19 T1/T2/T3/T4 |
| `wo:endrest` | via woTransition | C19 T1/T2/T3/T4 + T9 |
| `wo:exaddset` | direct | C19 T1/T2/T3/T4 |
| `wo:exmove` | direct | C19 T1/T2/T3/T4 |
| `wo:exprog` | via switchEntryProgression | C19 T1/T2/T3/T4 |
| `wo:exremove` | direct | C19 T1/T2/T3/T4 |
| `wo:finish` | direct | C19 T1/T2/T3/T4 |
| `wo:finishback` | direct | C19 T1/T2/T3/T4 |
| `wo:finishlater` | via pauseWorkout | C19 T1/T2/T3/T4 + T9 |
| `wo:log` | direct | C19 T1/T2/T3/T4 |
| `wo:replacepick` | direct | C19 T1/T2/T3/T4 |
| `wo:replsave:fwd` | direct | C19 T1/T2/T3/T4 |
| `wo:resume` | direct | C19 T1/T2/T3/T4 |
| `wo:savesession` | direct | C19 T1/T2/T3/T4 |
| `wo:skipset` | direct | C19 T1/T2/T3/T4 |
| `wo:skipthem` | direct | C19 T1/T2/T3/T4 |
| `wo:start` | via startWorkout | C19 T1/T2/T3/T4 + T9 |
| `wo:startroutine` | via woTransition | C19 T1/T2/T3/T4 + T9 |
| `wu:no` | direct | C19 T1/T2/T3/T4 |
| `wu:yes` | via markWarmup | C19 T1/T2/T3/T4 + T9 |

## Exempt: terminal boot-recovery actions (4)

These are NOT in `M10_GATED`, deliberately (round-31 ruling 5). They exist only
on the terminal boot screens that REPLACE the app before `m10Boot()` has run, so
the device is a non-holder BY CONSTRUCTION; putting them behind the ordinary
lease gate would make recovery impossible on the exact devices that need it.
Their contract is enforced by the screen and by the handler, not by the gate.

| action | handler | contract enforced in the handler | tests |
|---|---|---|---|
| `adopt:ask` | `renderAdoptionGate` | renders the terminal question only; writes nothing | C19 T15a |
| `adopt:yes` | `adoptLocalData` | records the verified owner (`setLastOwnerVerified`, write + read-back) or blocks recovery; reaches `location.reload()` only after that | C19 T15a |
| `lrec:restore` | `logoutRecoveryRestore` | restores ONLY the fixed target list and both session slots, verifies every value, deletes the journal verified, then reloads; refuses outright when the journal is unreadable | C19 T15b, T15d |
| `lrec:finish` | `logoutRecoveryFinish` | explicit destructive confirmation; removes only the fixed target list; verifies every target absent, both session slots credential-free, and the journal deleted, before declaring the device clear; an UNREADABLE journal offers no destructive path at all (no control rendered AND the function refuses) | C19 T15c ×2, T15d |

## Ungated MUTATIONS — recovery and review, authorized inside the handler (6)

**These persist.** They are not in `M10_GATED` because gating them at the click
would deadlock the device that needs them: they are the flows that repair an
unresolved situation, and a device in that state is usually the one WITHOUT the
pen. Each one therefore carries its own authorization contract, proven at the
handler, and each is listed here with what it writes.

| action | handler | what it persists | authorization contract | tests |
|---|---|---|---|---|
| `m10cx:mine` | `m10cxPushMine` | dx journal, core base, dirty marker, displaced envelope; a fenced `/cf/appdata/commit` | REQUIRES the pen: `m10cxHolder()` at entry, and again — same account, same session generation, SAME fence — after the freshness fetch and immediately before the resolution journal. Also requires an open export gate. | C19 T16 ×5 (non-holder: refusal, zero commits, zero journal/base/dirty/displaced bytes moved, zero snapshot replacement) + the holder contrast arm |
| `m10cx:export` | `m10cxExport` | export evidence into the displaced envelope (`m10cWrite`) — and nothing else | NON-DESTRUCTIVE by construction — it only records that BOTH copies left the device, bound to the current generation and both copy identities; the evidence re-arms if either copy changes. It is the precondition for the destructive choices, never a choice itself. Delivery must be EVIDENCED (a resolved share, or the athlete's explicit confirmation on the download fallback); the account+session context captured at entry is revalidated before the evidence is written. | **C19 T18a/T18b/T18c** (round-34 ruling 4) + C16, C17 |
| `m8:cx:export` | `m8CxExport` | export evidence into the M8 conflict record (`m8Write`) — and nothing else | Same contract, M8 side. The re-read of the conflict record at delivery time is keyed by the CURRENT account, so an account change mid-export records nothing on either account; an edit during the export invalidates the delivery and demands a fresh export. | **C19 T19a/T19b/T19c** (round-34 ruling 4) + C17, c11m8-* |
| `m10p:discard` | `m10pReviewDiscard` | removes ONE displaced/unverified/void entry from the photo queue | Deliberately reachable WITHOUT the pen — discarding a pending photo obligation is a repair, and a displaced device by definition lost the pen. Its safety is in WHAT it does: an explicit confirmation, then the obligation and nothing else. It never touches photo bytes, the id map, the core stores or the server. | C18 T35 ×4 (non-holder, real displaced entry, through the real banner control) |
| `pb:logout` | `pbLogout` | destructive: wipes the local stores and the session | Journaled (`wl_logout_journal`) and phase-verified, and COUPLED to every M10 obligation: refused while core sync is dirty/unproven, while any core journal or dx recovery is open, while a core review is pending or corrupt, and while ANY photo queue entry exists (including a malformed one, read typed). | C19 T7 ×5, T12; C17 T10 |
| `confirm:yes` | dispatcher → `state.pendingConfirm.fn` | whatever the pending callback persists | A DELEGATED boundary, not a write of its own. `askConfirm` is wrapped: a sheet raised WHILE holding the pen revalidates account+fence+generation at confirm time; a sheet raised WITHOUT the pen is deliberately not wrapped, because those are the repair flows above. | C19 T6 ×3 |

## Ungated actions — genuinely read-only (136)

View, selection, navigation and sheet-open branches. Each was checked to reach
NO persistence primitive through any callee (depth <= 5): they change
`state.*` view fields and re-render, copy text to the clipboard, or open a
sheet. `photo:view` is deliberately here (round-30 ruling 7): opening the
lightbox is READING, which STRICT allows, and the lightbox's own mutations
(delete, relabel) are gated at their primitives instead.

`act:addopen`, `act:editmode`, `act:pick`, `actpick:close`, `al:change`, `alert:dismiss`, `app:update`, `bc:tab`, `browse:close`, `browse:open`, `cal:expand`, `cal:next`, `cal:prev`, `cal:sel`, `card:toggle`, `cardio:add`, `cardio:cancel`, `cardio:edit`, `cardio:pick`, `cardio:repick`, `cf:type`, `cf:typeedit`, `cf:zone`, `chart:pt`, `confirm:no`, `copy`, `day:next`, `day:prev`, `day:reopenask`, `day:reopencancel`, `device:close`, `device:copylink`, `device:open`, `diary:older`, `dl:open`, `ex:add`, `ex:bw`, `ex:cancel`, `ex:edit`, `ex:muscle`, `ex:mv`, `export`, `food:pick`, `glp:compoundback`, `glp:prog:mode`, `glp:setup`, `glp:sev`, `glp:sheetclose`, `glp:site`, `glp:sym:new`, `glp:sym:pick`, `glp:timeline`, `glp:unit`, `go`, `hist:day`, `hist:more`, `hist:tab`, `hk:cancel`, `info`, `info:close`, `invite:copy`, `invite:joincancel`, `invite:open`, `lf:zone`, `lift:back`, `lift:cancel`, `lift:edit`, `lift:editcancel`, `lift:summaryback`, `lift:tofinish`, `lift:view`, `m10cx:close`, `m10cx:open`, `m8:cx:close`, `m8:cx:open`, `max:close`, `morestats`, `noop`, `note:add`, `note:cancel`, `note:edit`, `note:pin`, `ob:install`, `ob:next`, `ob:start`, `openday`, `opentoday`, `paste`, `paste:cancel`, `pb:pwtoggle`, `pbk:export`, `photo:view`, `qe:close`, `reset:cancel`, `ri:add`, `ri:pickclose`, `rt:open`, `rt:openedit`, `rt:openedit_dummy`, `set:back`, `set:page`, `status:close`, `status:open`, `status:type`, `sum:day`, `sum:next`, `sum:prev`, `sum:tocur`, `sync:copy`, `sync:paste`, `sync:pastecancel`, `syncdot`, `trend:mode`, `trend:next`, `trend:prev`, `trend:tocur`, `wo:bw`, `wo:bwcancel`, `wo:completethem`, `wo:exmenu`, `wo:exmenu:close`, `wo:exnote`, `wo:exreplace`, `wo:fbopen`, `wo:hist`, `wo:histclose`, `wo:promptcancel`, `wo:quick`, `wo:replacecancel`, `wo:replsave:once`, `wo:resumeask`, `wo:resumecancel`, `wo:setmenu`, `wo:setmenu:close`, `wof:zone`, `wt:add`
