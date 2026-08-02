# M10 write-surface matrix — tree-derived (2026-08-02, from the shipping .415-m8 source)

266 dispatcher actions inspected; 94 mutate persistent state. Columns:
action | persistence path(s) | gate class. Gate classes:
  G-training / G-core / G-photos / G-serverdirect -> m10Gate BEFORE mutation
  E-devicelocal -> exempt (device-local bookkeeping, no content)

| action | persistence | class |
|---|---|---|
| `act:addcat` | save(core) | G-core |
| `act:del` | save(core) | G-core |
| `act:toggle` | save(core) | G-core |
| `cal:expand` | rawLS | E-devicelocal |
| `cal:ignore` | save(core) | G-core |
| `cal:overwrite` | save(core) | G-core |
| `cal:sel` | rawLS | E-devicelocal |
| `cal:usecalc` | save(core) | G-core |
| `cardio:del` | saveTraining, save(core) | G-training |
| `cardio:save` | saveTraining, save(core) | G-training |
| `cf:newtype` | save(core) | G-core |
| `conn:remove` | save(core) | G-core |
| `day:clear` | saveTraining, save(core), photosIDB | G-training |
| `ex:clearall` | saveTraining | G-training |
| `ex:del` | saveTraining | G-training |
| `ex:save` | saveTraining | G-training |
| `ex:seedall` | saveTraining | G-training |
| `exseed:add` | saveTraining | G-training |
| `fb:done` | saveWorkout | G-training |
| `fb:set` | saveWorkout | G-training |
| `glp:compoundsave` | save(core) | G-core |
| `glp:dose:del` | save(core) | G-core |
| `glp:dose:save` | save(core) | G-core |
| `glp:enable` | save(core) | G-core |
| `glp:showdue` | save(core) | G-core |
| `glp:siterot` | save(core) | G-core |
| `glp:skip` | save(core) | G-core |
| `glp:sym:del` | save(core) | G-core |
| `glp:sym:newsave` | save(core) | G-core |
| `glp:sym:save` | save(core) | G-core |
| `glp:symptoms` | save(core) | G-core |
| `glp:titration` | save(core) | G-core |
| `hk:import` | pbSave(direct) | G-serverdirect |
| `invite:create` | save(core) | G-core |
| `invite:join` | save(core), rawLS | G-core |
| `lift:del` | saveTraining, save(core) | G-training |
| `lift:save` | saveTraining, save(core) | G-training |
| `macro:keep` | save(core) | G-core |
| `macro:suggest` | save(core) | G-core |
| `max:open` | save(core) | G-core |
| `night:toggle` | save(core) | G-core |
| `note:del` | saveTraining | G-training |
| `note:save` | saveTraining | G-training |
| `ob:back` | save(core) | G-core |
| `ob:recalc` | save(core) | G-core |
| `preset:del` | save(core) | G-core |
| `reminder:add` | save(core) | G-core |
| `reset:do` | save(core), photosIDB | G-photos |
| `ri:mv` | saveTraining | G-training |
| `ri:pick` | saveTraining | G-training |
| `ri:prog` | saveTraining | G-training |
| `ri:remove` | saveTraining | G-training |
| `rt:del` | saveTraining | G-training |
| `rt:new` | saveTraining | G-training |
| `rt:save` | saveTraining | G-training |
| `set:activity` | save(core) | G-core |
| `set:sex` | save(core) | G-core |
| `set:strategy` | save(core) | G-core |
| `set:theme` | save(core) | G-core |
| `set:ttype` | save(core) | G-core |
| `set:units` | save(core) | G-core |
| `set:weekstart` | save(core) | G-core |
| `skip:calories` | save(core) | G-core |
| `skip:sleep` | save(core) | G-core |
| `skip:steps` | save(core) | G-core |
| `skip:weight` | save(core) | G-core |
| `status:end` | save(core) | G-core |
| `status:endnow` | save(core) | G-core |
| `status:save` | save(core) | G-core |
| `sum:toggle` | save(core), rawLS | G-core |
| `sync:pasteapply` | rawLS | E-devicelocal |
| `tdee:apply` | save(core) | G-core |
| `tdee:later` | save(core) | G-core |
| `weight:add` | save(core) | G-core |
| `weight:del` | save(core) | G-core |
| `wo:addset` | saveWorkout | G-training |
| `wo:begin` | saveWorkout | G-training |
| `wo:bwsave` | saveWorkout | G-training |
| `wo:delset` | saveWorkout | G-training |
| `wo:discard` | saveWorkout | G-training |
| `wo:discardnow` | saveWorkout | G-training |
| `wo:endnow` | saveWorkout | G-training |
| `wo:exaddset` | saveWorkout | G-training |
| `wo:exmove` | saveWorkout | G-training |
| `wo:exremove` | saveWorkout | G-training |
| `wo:finish` | saveWorkout | G-training |
| `wo:finishback` | saveWorkout | G-training |
| `wo:log` | saveWorkout | G-training |
| `wo:replacepick` | saveWorkout | G-training |
| `wo:replsave:fwd` | saveTraining | G-training |
| `wo:resume` | saveWorkout | G-training |
| `wo:skipset` | saveWorkout | G-training |
| `wo:skipthem` | saveWorkout | G-training |
| `wu:no` | saveWorkout | G-training |

## Non-action write paths (each individually specified in DESIGN v3 §8):

- **hkTryFetch**: applies Health import to core+weights and CLEARS the server health field via pbSave — G-core + pbSave; fence-carrying; import blocked for non-holders
- **applyImport**: backup restore into core+training — G-core+G-training; gated
- **migrateProgressionTypes**: boot migration writes wl_training_v1 — LOCAL migration, exempt from lease (runs pre-gate at boot; cannot reach the server by itself; its output syncs only through gated paths)
- **resyncAllActivityTags**: derives core tags from training — runs only inside already-gated/acked transitions (M8 §5b); inherits the callers gate
- **cloudPush**: core push, raw PATCH — carries the fence once enforcement is on
- **m8Push/m8CxChooseLocal/m8CxChooseServer/m8AdoptServer**: training CAS/adoption — fence-carrying; ChooseLocal/ChooseServer additionally m10-gated as user actions
- **pushDataPromise**: pre-import core push — fence-carrying
- **glpNormalize**: in-memory normalization; persists only via callers save() — inherits gates
- **pbForceLogout**: logout machinery — containment-owned, exempt from lease (M8 logout gate already governs); its pbSave push is fence-carrying
- **startWorkout**: writes wl_workout_v1 scratch — G-training entry (gated: starting a workout is a write intent)
- **coach request (max sheet)**: pbSave({coachreq}) — EXEMPT from client gate AND server fence as an operational mailbox; server proof required that a coachreq write cannot carry content fields (single-field PATCH enforced in the hook)
- **nightly/weekly coach jobs (NAS)**: superuser writes of nightlySummary/weeklySummary/scriptVer/health — server-side writer, enumerated for the enforcement gate: superuser-context writes bypass user fencing BY RULE (stated, reviewed), touch no athlete content fields except clearing health after import
- **health Shortcut**: user-token PATCH of the health field — content-adjacent mailbox; same single-field proof as coachreq; enumerated for enforcement

Class counts: {"G-core": 49, "E-devicelocal": 3, "G-training": 40, "G-serverdirect": 1, "G-photos": 1}