# M10 increment 5 — mutation-boundary inventory (action → gate → test)

Regenerated after round 30. Classification follows CALLEES transitively
(depth ≤ 5), not branch text: a branch is gated when it reaches any
persistence primitive directly or through any callee.

**Round-30 change:** the four persistence primitives (`save`, `saveLocal`,
`saveTraining`, `saveWorkout`) are now ALSO gated at the source, so a write
is refused wherever it originates — tap, timer, network callback, or a lazy
migration during rendering. The action list below is therefore the
*navigational* surface; the primitive gate is the backstop that makes
"a read-only device performs zero durable writes" true regardless of path.

## Mutation boundaries — all of them

| boundary | gate | tests |
|---|---|---|
| dispatcher `click` on `[data-act]` | capture-phase interceptor → `m10GateAction` | C19 T1–T4, T9 |
| global `input` / `change` on form controls | capture-phase interceptor; prior value restored; only individually identified recovery controls exempt (round-30 ruling 5) | C19 T8 ×3 |
| **persistence primitives** (save/saveLocal/saveTraining/saveWorkout) | gated at source; `m10InternalWrite` guard for M10's own authorized transitions | C19 T4, and every accepted suite |
| file pickers + their post-async continuations | authority captured at open AND change; revalidated after `FileReader.onload`, after `processImage`/`idbAll`, before every delete/add | C19 T5 ×2, T11 |
| confirmation callbacks | captured when raised by a holder; revalidated at confirm; sheets raised WITHOUT the pen exempt so takeover/review can repair | C19 T6 ×3 |
| HealthKit import callback | ONE immutable capture stored with `state.hkWait`; revalidated on every poll, before the local mutation, and before each mailbox clear (round-30 ruling 1) | C19 T10 |
| photo/core/training transport | M10-BLOCK-2/3/4 (fenced routes, journals, queue) | C15–C18 |
| logout | every M10 obligation blocks, including a MALFORMED photo queue via the typed read | C19 T7 ×5, T12 |

## Gated actions (132)

| action | why gated | tests |
|---|---|---|
| `act:addcat` | direct | C19 T1/T2/T3/T4 |
| `act:del` | direct | C19 T1/T2/T3/T4 |
| `act:toggle` | direct | C19 T1/T2/T3/T4 |
| `adopt:ask` | recovery (explicit contract) | C19 T1/T2/T3/T4 — recovery action, explicit contract |
| `adopt:yes` | recovery (explicit contract) | C19 T1/T2/T3/T4 — recovery action, explicit contract |
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
| `lrec:finish` | recovery (explicit contract) | C19 T1/T2/T3/T4 — recovery action, explicit contract |
| `lrec:restore` | recovery (explicit contract) | C19 T1/T2/T3/T4 — recovery action, explicit contract |
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

## Ungated actions (142)

View, selection, navigation and sheet-open branches reaching no
persistence primitive through any callee. `photo:view` is deliberately
here (round-30 ruling 7): opening the lightbox is READ-ONLY, and its own
mutations are gated at their primitives.

`act:addopen`, `act:editmode`, `act:pick`, `actpick:close`, `al:change`, `alert:dismiss`, `app:update`, `bc:tab`, `browse:close`, `browse:open`, `cal:expand`, `cal:next`, `cal:prev`, `cal:sel`, `card:toggle`, `cardio:add`, `cardio:cancel`, `cardio:edit`, `cardio:pick`, `cardio:repick`, `cf:type`, `cf:typeedit`, `cf:zone`, `chart:pt`, `confirm:no`, `confirm:yes`, `copy`, `day:next`, `day:prev`, `day:reopenask`, `day:reopencancel`, `device:close`, `device:copylink`, `device:open`, `diary:older`, `dl:open`, `ex:add`, `ex:bw`, `ex:cancel`, `ex:edit`, `ex:muscle`, `ex:mv`, `export`, `food:pick`, `glp:compoundback`, `glp:prog:mode`, `glp:setup`, `glp:sev`, `glp:sheetclose`, `glp:site`, `glp:sym:new`, `glp:sym:pick`, `glp:timeline`, `glp:unit`, `go`, `hist:day`, `hist:more`, `hist:tab`, `hk:cancel`, `info`, `info:close`, `invite:copy`, `invite:joincancel`, `invite:open`, `lf:zone`, `lift:back`, `lift:cancel`, `lift:edit`, `lift:editcancel`, `lift:summaryback`, `lift:tofinish`, `lift:view`, `m10cx:close`, `m10cx:export`, `m10cx:mine`, `m10cx:open`, `m10p:discard`, `m8:cx:close`, `m8:cx:export`, `m8:cx:open`, `max:close`, `morestats`, `noop`, `note:add`, `note:cancel`, `note:edit`, `note:pin`, `ob:install`, `ob:next`, `ob:start`, `openday`, `opentoday`, `paste`, `paste:cancel`, `pb:logout`, `pb:pwtoggle`, `pbk:export`, `photo:view`, `qe:close`, `reset:cancel`, `ri:add`, `ri:pickclose`, `rt:open`, `rt:openedit`, `rt:openedit_dummy`, `set:back`, `set:page`, `status:close`, `status:open`, `status:type`, `sum:day`, `sum:next`, `sum:prev`, `sum:tocur`, `sync:copy`, `sync:paste`, `sync:pastecancel`, `syncdot`, `trend:mode`, `trend:next`, `trend:prev`, `trend:tocur`, `wo:bw`, `wo:bwcancel`, `wo:completethem`, `wo:exmenu`, `wo:exmenu:close`, `wo:exnote`, `wo:exreplace`, `wo:fbopen`, `wo:hist`, `wo:histclose`, `wo:promptcancel`, `wo:quick`, `wo:replacecancel`, `wo:replsave:once`, `wo:resumeask`, `wo:resumecancel`, `wo:setmenu`, `wo:setmenu:close`, `wof:zone`, `wt:add`
