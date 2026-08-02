# M10 write-surface matrix v2 — multi-class, tree-derived (round-3 items 8/9)

266 dispatcher actions; 96 mutating; 92 GATED (pre-mutation m10Gate at handler entry); 4 exempt (device-local only).

Composite actions list EVERY class they touch. Photos are CONTENT and gated (C8).

| action | classes | gate |
|---|---|---|
| `act:addcat` | core | m10Gate |
| `act:del` | core | m10Gate |
| `act:toggle` | core | m10Gate |
| `cal:expand` | device-local | EXEMPT (device-local) |
| `cal:ignore` | core | m10Gate |
| `cal:overwrite` | core | m10Gate |
| `cal:sel` | device-local | EXEMPT (device-local) |
| `cal:usecalc` | core | m10Gate |
| `cardio:del` | core, training | m10Gate |
| `cardio:save` | core, training | m10Gate |
| `cf:newtype` | core | m10Gate |
| `conn:remove` | core | m10Gate |
| `day:clear` | core, photos, training | m10Gate |
| `ex:clearall` | training | m10Gate |
| `ex:del` | training | m10Gate |
| `ex:save` | training | m10Gate |
| `ex:seedall` | training | m10Gate |
| `exseed:add` | training | m10Gate |
| `fb:done` | training | m10Gate |
| `fb:set` | training | m10Gate |
| `glp:compoundsave` | core | m10Gate |
| `glp:dose:del` | core | m10Gate |
| `glp:dose:save` | core | m10Gate |
| `glp:enable` | core | m10Gate |
| `glp:showdue` | core | m10Gate |
| `glp:siterot` | core | m10Gate |
| `glp:skip` | core | m10Gate |
| `glp:sym:del` | core | m10Gate |
| `glp:sym:newsave` | core | m10Gate |
| `glp:sym:save` | core | m10Gate |
| `glp:symptoms` | core | m10Gate |
| `glp:titration` | core | m10Gate |
| `hk:import` | server-direct | m10Gate |
| `invite:create` | core | m10Gate |
| `invite:join` | core | m10Gate |
| `lift:del` | core, training | m10Gate |
| `lift:save` | core, training | m10Gate |
| `lift:savedetail` | core, training | m10Gate |
| `macro:keep` | core | m10Gate |
| `macro:suggest` | core | m10Gate |
| `max:open` | core | m10Gate |
| `night:toggle` | core | m10Gate |
| `note:del` | training | m10Gate |
| `note:save` | training | m10Gate |
| `ob:back` | core | m10Gate |
| `ob:recalc` | core | m10Gate |
| `pb:pwsave` | device-local | EXEMPT (device-local) |
| `preset:del` | core | m10Gate |
| `reminder:add` | core | m10Gate |
| `reset:do` | core, photos | m10Gate |
| `ri:mv` | training | m10Gate |
| `ri:pick` | training | m10Gate |
| `ri:prog` | training | m10Gate |
| `ri:remove` | training | m10Gate |
| `rt:del` | training | m10Gate |
| `rt:new` | training | m10Gate |
| `rt:save` | training | m10Gate |
| `set:activity` | core | m10Gate |
| `set:sex` | core | m10Gate |
| `set:strategy` | core | m10Gate |
| `set:theme` | core | m10Gate |
| `set:ttype` | core | m10Gate |
| `set:units` | core | m10Gate |
| `set:weekstart` | core | m10Gate |
| `skip:calories` | core | m10Gate |
| `skip:sleep` | core | m10Gate |
| `skip:steps` | core | m10Gate |
| `skip:weight` | core | m10Gate |
| `status:end` | core | m10Gate |
| `status:endnow` | core | m10Gate |
| `status:save` | core | m10Gate |
| `sum:toggle` | core | m10Gate |
| `sync:pasteapply` | device-local | EXEMPT (device-local) |
| `tdee:apply` | core | m10Gate |
| `tdee:later` | core | m10Gate |
| `weight:add` | core | m10Gate |
| `weight:del` | core | m10Gate |
| `wo:addset` | training | m10Gate |
| `wo:begin` | training | m10Gate |
| `wo:bwsave` | training | m10Gate |
| `wo:delset` | training | m10Gate |
| `wo:discard` | training | m10Gate |
| `wo:discardnow` | training | m10Gate |
| `wo:endnow` | training | m10Gate |
| `wo:exaddset` | training | m10Gate |
| `wo:exmove` | training | m10Gate |
| `wo:exremove` | training | m10Gate |
| `wo:finish` | training | m10Gate |
| `wo:finishback` | training | m10Gate |
| `wo:log` | training | m10Gate |
| `wo:replacepick` | training | m10Gate |
| `wo:replsave:fwd` | training | m10Gate |
| `wo:resume` | training | m10Gate |
| `wo:skipset` | training | m10Gate |
| `wo:skipthem` | training | m10Gate |
| `wu:no` | training | m10Gate |

Non-action writers: unchanged from v1 matrix, with corrections:
- photo import/delete/clear paths (idb*) are G-photos wherever they appear, incl. day:clear and reset:do composites.
- Object-URL caches, thumbnails, UI prefs: exempt (non-content).
- All entries per DESIGN v4 §§2,5,6,7.