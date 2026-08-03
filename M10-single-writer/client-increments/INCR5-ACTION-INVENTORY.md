# M10 increment 5 — action → gate → test inventory

Generated from the shipping dispatcher at the increment-5 head. Every
`data-act` branch in the application dispatcher is listed exactly once.
The gate is ONE capture-phase listener (M10-BLOCK-5) that runs before the
application's own click handler; a refused action is stopped with
`stopImmediatePropagation` so the dispatcher never sees it.

- **Gate**: `m10GateAction` → `m10AuthNow` (account + session generation +
  holder + unexpired deadline + valid fence + storage health).
- **Tests**: C19 T1 asserts this exact inventory is loaded (count and
  membership); T2 proves a gated action is intercepted for a non-holder;
  T3 proves it runs for the holder; T4 proves fail-closed on corrupt
  identity, blocked storage, expired deadline and missing fence. Deferred
  openers additionally have T5 (picker → pen lost / fence replaced) and
  T6 (confirmation revalidation).

## Gated actions (104)

| action | mutation classes | gate | tests |
|---|---|---|---|
| `act:addcat` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `act:del` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `act:toggle` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `cal:ignore` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `cal:overwrite` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `cal:usecalc` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `cardio:del` | training+core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `cardio:save` | training+core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `cf:newtype` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `conn:remove` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `day:clear` | training+core+photos | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `ex:clearall` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `ex:del` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `ex:save` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `ex:seedall` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `exseed:add` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `fb:done` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `fb:set` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `glp:compoundsave` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `glp:dose:del` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `glp:dose:save` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `glp:enable` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `glp:showdue` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `glp:siterot` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `glp:skip` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `glp:sym:del` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `glp:sym:newsave` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `glp:sym:save` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `glp:symptoms` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `glp:titration` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `hk:import` | deferred-open | capture-phase m10GateAction | C19 T1/T2/T3/T4 + T5/T6 |
| `import` | deferred-open | capture-phase m10GateAction | C19 T1/T2/T3/T4 + T5/T6 |
| `invite:create` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `invite:join` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `lift:del` | training+core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `lift:save` | training+core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `lift:savedetail` | training+core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `m10cx:takeover` | deferred-open | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `m8:cx:server` | deferred-open | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `macro:keep` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `macro:suggest` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `max:open` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `night:toggle` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `note:del` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `note:save` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `ob:back` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `ob:recalc` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `paste:do` | import/health | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `pb:pwsave` | photos | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `pbk:import` | deferred-open | capture-phase m10GateAction | C19 T1/T2/T3/T4 + T5/T6 |
| `photo:add` | deferred-open | capture-phase m10GateAction | C19 T1/T2/T3/T4 + T5/T6 |
| `pphoto:add` | deferred-open | capture-phase m10GateAction | C19 T1/T2/T3/T4 + T5/T6 |
| `preset:del` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `reminder:add` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `reset:ask` | deferred-open | capture-phase m10GateAction | C19 T1/T2/T3/T4 + T5/T6 |
| `reset:do` | training+core+photos | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `ri:mv` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `ri:pick` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `ri:prog` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `ri:remove` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `rt:del` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `rt:new` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `rt:save` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `set:activity` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `set:sex` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `set:strategy` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `set:theme` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `set:ttype` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `set:units` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `set:weekstart` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `skip:calories` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `skip:sleep` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `skip:steps` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `skip:weight` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `status:end` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `status:endnow` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `status:save` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `sum:toggle` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `sync:pull` | deferred-open | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `sync:push` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `tdee:apply` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `tdee:later` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `weight:add` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `weight:del` | core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `wo:addset` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `wo:begin` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `wo:bwsave` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `wo:delset` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `wo:discard` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `wo:discardnow` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `wo:endnow` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `wo:exaddset` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `wo:exmove` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `wo:exremove` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `wo:finish` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `wo:finishback` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `wo:log` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `wo:replacepick` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `wo:replsave:fwd` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `wo:resume` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `wo:savesession` | training+core | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `wo:skipset` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `wo:skipthem` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |
| `wu:no` | training | capture-phase m10GateAction | C19 T1/T2/T3/T4 |

## Non-mutating actions (170) — deliberately ungated

These branches change only view state, selection, UI toggles or
navigation and reach no persistence primitive (`save`, `saveLocal`,
`saveTraining`, `saveWorkout`, `idb*`, `cloudPush/Pull`, `pbSave`,
`applyImport`, `hkTryFetch`). Gating them would block a read-only
device from navigating its own data, which the Owner's STRICT ruling
explicitly allows.

`act:addopen`, `act:editmode`, `act:pick`, `actpick:close`, `adopt:ask`, `adopt:yes`, `ai:copy`, `ai:gen`, `al:change`, `alert:dismiss`, `app:update`, `bc:tab`, `browse:close`, `browse:open`, `cal:expand`, `cal:next`, `cal:prev`, `cal:sel`, `card:toggle`, `cardio:add`, `cardio:cancel`, `cardio:edit`, `cardio:pick`, `cardio:repick`, `cf:type`, `cf:typeedit`, `cf:zone`, `chart:pt`, `confirm:no`, `confirm:yes`, `copy`, `day:next`, `day:prev`, `day:reopenask`, `day:reopencancel`, `day:reopendo`, `device:close`, `device:copylink`, `device:open`, `diary:older`, `dl:open`, `ex:add`, `ex:bw`, `ex:cancel`, `ex:edit`, `ex:muscle`, `ex:mv`, `export`, `food:pick`, `glp:compound`, `glp:compoundback`, `glp:dose:open`, `glp:prog:mode`, `glp:setup`, `glp:sev`, `glp:sheetclose`, `glp:site`, `glp:sym:edit`, `glp:sym:new`, `glp:sym:open`, `glp:sym:pick`, `glp:timeline`, `glp:unit`, `go`, `hist:day`, `hist:more`, `hist:tab`, `hk:cancel`, `info`, `info:close`, `invite:copy`, `invite:joincancel`, `invite:open`, `lf:zone`, `lift:back`, `lift:cancel`, `lift:edit`, `lift:editcancel`, `lift:summaryback`, `lift:tofinish`, `lift:view`, `lrec:finish`, `lrec:restore`, `m10cx:close`, `m10cx:export`, `m10cx:mine`, `m10cx:open`, `m10cx:server`, `m10p:apply`, `m10p:discard`, `m10p:export`, `m8:cx:close`, `m8:cx:export`, `m8:cx:local`, `m8:cx:open`, `max:close`, `morestats`, `night:gen`, `noop`, `note:add`, `note:cancel`, `note:edit`, `note:pin`, `ob:install`, `ob:next`, `ob:start`, `openday`, `opentoday`, `paste`, `paste:cancel`, `pb:adv`, `pb:logout`, `pb:pwtoggle`, `pbk:export`, `photo:view`, `qe:close`, `reset:cancel`, `ri:add`, `ri:pickclose`, `rt:open`, `rt:openedit`, `rt:openedit_dummy`, `set:back`, `set:page`, `status:close`, `status:open`, `status:type`, `sum:coachreport`, `sum:day`, `sum:exportall`, `sum:exportweek`, `sum:next`, `sum:prev`, `sum:tocur`, `sync:copy`, `sync:paste`, `sync:pasteapply`, `sync:pastecancel`, `sync:test`, `syncdot`, `trend:mode`, `trend:next`, `trend:prev`, `trend:tocur`, `wo:bw`, `wo:bwcancel`, `wo:completethem`, `wo:endrest`, `wo:exmenu`, `wo:exmenu:close`, `wo:exnote`, `wo:exprog`, `wo:exreplace`, `wo:fbopen`, `wo:finishlater`, `wo:hist`, `wo:histclose`, `wo:promptcancel`, `wo:quick`, `wo:replacecancel`, `wo:replsave:once`, `wo:resumeask`, `wo:resumecancel`, `wo:setmenu`, `wo:setmenu:close`, `wo:start`, `wo:startroutine`, `wof:zone`, `wt:add`, `wu:yes`
