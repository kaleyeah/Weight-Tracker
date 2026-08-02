/// <reference path="../pb_data/types.d.ts" />
/* Compound Fitness — M10 raw-photo enforcement (PocketBase v0.39.8).
   Contract: design v9 §5b (Architect-approved round 9): raw user mutation of
   the photos collection REJECTS under enforcement — every photo content write
   goes through the three transactional routes — for users AND superusers
   (round-10 item 1: no documented operational need for raw superuser photo
   mutation; relation cascades are unaffected — request hooks fire only for
   API requests). Enforcement OFF: raw writes pass untouched (`.415-m8`
   compatibility). */

onRecordCreateRequest((e) => {
  const m10 = require(`${__hooks}/cf_m10_shared.js`);
  if (m10.fencingEnforced())
    throw new BadRequestError("photo writes must use the photo routes");
  e.next();
}, "photos");

onRecordUpdateRequest((e) => {
  const m10 = require(`${__hooks}/cf_m10_shared.js`);
  if (m10.fencingEnforced())
    throw new BadRequestError("photo writes must use the photo routes");
  e.next();
}, "photos");

onRecordDeleteRequest((e) => {
  const m10 = require(`${__hooks}/cf_m10_shared.js`);
  if (m10.fencingEnforced())
    throw new BadRequestError("photo writes must use the photo routes");
  e.next();
}, "photos");
