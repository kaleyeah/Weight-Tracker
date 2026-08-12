/* ---- pre-sync recovery snapshot (2026-08-01) ----

   Installing this build requires a boot, and that boot runs autoSync() ->
   trainingPull(), which can overwrite local training before the athlete has any
   chance to export it. So before ANY training is loaded, migrated, normalised or
   synced, the RAW stored bytes are copied to an immutable envelope.

   Raw strings, not state: capture happens before loadTraining() and
   migrateProgressionTypes(), so the envelope holds exactly what was on disk
   rather than a normalised rendering of it. `null` means the key was absent,
   which is different information from an empty object.

   This is NOT a blind setItem in a swallowed catch. Quota, private mode or a
   serialisation failure would leave no copy, and continuing to pull would then
   recreate the original loss. The write is verified byte-for-byte and the pull
   is suppressed if it cannot be. */
var TRECOVERY_KEY="wl_training_recovery";
var RECOVERY_V=1;
/* Recovery state is one of:
     "none"    nothing on disk needed protecting
     "ok"      a validated envelope for this account protects the pre-sync bytes
     "blocked" the pre-sync bytes are NOT protected -- no training may sync
   `blocked` covers BOTH directions. Pulling can destroy the local copy; pushing
   an unverified local copy can destroy newer training on the server. Neither is
   known safe, so neither runs. */
/* Two DIFFERENT failure classes, deliberately not one boolean:

     "blocked"   a storage-integrity failure with no evidence of another account.
                 The pre-sync training bytes are unprotected, so TRAINING does not
                 sync and is withheld from exports. Core is independently
                 established and carries on unchanged.

     "ambiguous" ownership cannot be established -- another account has captured
                 on this device. Then NOTHING local is attributable: wl_v1 may
                 hold another person's weights, food, notes and settings just as
                 wl_training_v1 may hold their sessions. Everything quarantines.

   Blurring them would either under-protect core or needlessly cripple an app
   that merely ran out of storage. */
var recoveryState="none",recoveryBlocked=false,recoveryBlockReason="",recoveryRawCorrupt=null;
var recoveryFreeze=false;
/* The durable owner marker. Written only while authenticated, once ownership of
   the local bytes has been established; cleared only by a verified full logout.
   It is what lets a session renewal be told apart from a different-account login
   without stamping signed-out bytes with whoever authenticates next. */
var LASTOWNER_KEY="wl_last_owner";
function lastOwner(){try{return localStorage.getItem(LASTOWNER_KEY)||"";}catch(e){return "";}}
function setLastOwner(uid){try{if(uid)localStorage.setItem(LASTOWNER_KEY,uid);else localStorage.removeItem(LASTOWNER_KEY);}catch(e){}}
/* Verified, and fail-closed. A swallowed write here would let synchronisation
   proceed while ownership was never actually recorded -- and the next session,
   finding no marker, would then be free to adopt whatever this one pulled down.
   A full disk does not imply another account, but it does mean durable ownership
   was not established, and proceeding on that is unsafe. */
function setLastOwnerVerified(uid){
  if(!uid)return false;
  try{localStorage.setItem(LASTOWNER_KEY,uid);}catch(e){return false;}
  var back=null;
  try{back=localStorage.getItem(LASTOWNER_KEY);}catch(e){return false;}
  return back===uid;}
function localUserDataExists(){
  try{return localStorage.getItem(TKEY)!==null||localStorage.getItem(WOKEY)!==null||localStorage.getItem(KEY)!==null;}
  catch(e){return true;}}   /* unreadable storage: assume there is something to protect */

/* training may not sync or be exported */
function trainingQuarantined(){return recoveryState==="blocked"||ownershipAmbiguous();}

/* Ownership is evaluated against storage AS IT IS NOW, not as it was at boot.
   Another tab, or any later code path, can add an envelope after
   runRecoveryCapture() ran, and a cached "ok" would then authorise exactly the
   operations this exists to prevent. */
/* The device-quarantine predicate. Named for its original cause, but it is the
   one gate every user-data route consults, so an unresolved logout belongs in it
   too: that device must not sync, export, import, mutate or log out either. */
function ownershipAmbiguous(){
  if(logoutRecoveryPending())return true;
  if(recoveryState==="ambiguous"||recoveryState==="adoption")return true;
  var st=readRecoveryStore();
  if(st.status==="corrupt"||st.status==="unreadable")return true;
  var acct=recoveryAccountId();
  for(var k in st.map){if(k!==acct&&st.map[k]&&typeof st.map[k]==="object")return true;}
  /* A marker naming someone else means these bytes are theirs. A MISSING marker
     is deliberately not treated as ambiguity here: a storage-write failure
     produces exactly that shape without implying a second account, and calling
     it ambiguity would quarantine the whole app over a full disk. Unattributed
     data matters at the moment a session appears, and that is checked in
     establishOwnershipAfterLogin(), which is the only path that can act on it. */
  var lo=lastOwner();
  if(acct&&lo&&lo!==acct)return true;
  return false;}
function recoveryAccountId(){try{return pbUid()||"";}catch(e){return "";}}

/* Absent, valid and corrupt are three DIFFERENT states. Collapsing a parse
   failure into "empty" would let the next capture overwrite a damaged store and
   destroy whatever recoverable bytes were still in it. */
function readRecoveryStore(){
  var raw=null;
  try{raw=localStorage.getItem(TRECOVERY_KEY);}catch(e){return {status:"unreadable",map:null,raw:null};}
  if(raw===null)return {status:"absent",map:{},raw:null};
  var m=null;
  try{m=JSON.parse(raw);}catch(e){return {status:"corrupt",map:null,raw:raw};}
  if(!m||typeof m!=="object"||Array.isArray(m))return {status:"corrupt",map:null,raw:raw};
  return {status:"valid",map:m,raw:raw};}

/* A truthy object is not authorization to run a destructive pull. An envelope
   only counts as protection if it is entirely well-formed for THIS account. */
function validEnvelope(e,acct){
  if(!e||typeof e!=="object"||Array.isArray(e))return false;
  if(e.v!==RECOVERY_V)return false;                                   /* unsupported version */
  if(typeof e.account!=="string"||e.account!==acct)return false;      /* key must agree with contents */
  if(typeof e.capturedAt!=="string"||!/^\d{4}-\d{2}-\d{2}T/.test(e.capturedAt))return false;
  if(typeof e.appBuild!=="string"||!e.appBuild)return false;
  var t=e.training,w=e.workout;
  if(!(typeof t==="string"||t===null))return false;
  if(!(typeof w==="string"||w===null))return false;
  if(t===null&&w===null)return false;                                 /* protects nothing */
  return true;}

function trainingRecovery(){
  var st=readRecoveryStore();
  if(st.status!=="valid")return null;
  var acct=recoveryAccountId(),e=st.map[acct];
  return validEnvelope(e,acct)?e:null;}

/* Removal must be VERIFIED. Logout tells the user the device cache was wiped;
   a swallowed failure would make that a false statement about their privacy. */
function clearTrainingRecovery(acct){
  var st=readRecoveryStore();
  if(st.status==="absent")return true;
  if(st.status!=="valid")return false;              /* cannot safely rewrite a corrupt store */
  if(!(acct in st.map))return true;
  var m=st.map;delete m[acct];
  /* The postcondition is the WHOLE store, not just "A is gone". A faulty write
     that also dropped B and C would satisfy the weaker check while destroying
     two other people's only recovery copies. Compared as re-serialised parsed
     maps: semantic equality, since the raw bytes are rewritten by design. */
  var intended=JSON.stringify(m),empty=Object.keys(m).length===0;
  try{
    if(empty)localStorage.removeItem(TRECOVERY_KEY);
    else localStorage.setItem(TRECOVERY_KEY,intended);
  }catch(e){return false;}
  var after=readRecoveryStore();
  if(empty)return after.status==="absent";
  if(after.status!=="valid")return false;
  return JSON.stringify(after.map)===intended;}

function blockRecovery(reason,state){
  recoveryState=state||"blocked";recoveryBlocked=true;recoveryBlockReason=reason;
  /* Nothing may sync, nothing may be exported as training, and boot may not
     rewrite the very bytes we failed to protect. */
  recoveryFreeze=true;return false;}

/* Capture the RAW pre-sync bytes before anything loads, migrates or syncs.
   Returns true when training may sync. */
function captureTrainingRecovery(){
  var acct=recoveryAccountId();
  var st=readRecoveryStore();

  if(st.status==="unreadable")
    return blockRecovery("Training syncing is paused: this device's storage could not be read, so a recovery copy of your training could not be secured.");

  if(st.status==="corrupt"){
    /* Preserve the exact bytes and never rewrite them. They may still be the
       only copy of something, and they are exported as a diagnostic -- as raw
       text, explicitly NOT interpreted as trusted training. */
    recoveryRawCorrupt=st.raw;
    return blockRecovery("Training syncing is paused: this device's saved recovery copy is damaged. It has been left untouched and is included in exports.");}

  var m=st.map;

  if(acct===""){
    /* No session: no pull can run, so nothing needs a snapshot yet. Attribution
       is deferred to the marker, which login checks before it touches anything. */
    recoveryState="none";return true;}

  /* Unmarked local data, and an authenticated session. The code cannot tell
     Griffin's own data from data typed while signed out from a previous owner's
     on a reused device -- so it does not guess. It asks, once, and stays fully
     quarantined until answered. Product Owner ruling, 2026-08-01. */
  if(acct&&!lastOwner()&&localUserDataExists()&&Object.keys(m).length===0){
    recoveryState="adoption";recoveryBlocked=true;recoveryFreeze=true;
    recoveryBlockReason="Waiting for you to confirm that the data already on this device is yours.";
    return false;}

  /* Signed out, there is nothing to protect against. The snapshot exists solely
     because trainingPull() can overwrite local training, and trainingPull()
     requires syncOn() -- a token and a uid. With no session, no pull can run.

     Capturing here would manufacture an anonymous envelope that the next sign-in
     must then treat as unattributable, quarantining the app for a user who never
     shared the device with anyone. A session expiry alone would trigger it. So
     the anonymous slot is never created, which resolves the ownership ambiguity
     by not creating it rather than by policing it afterwards. */
  /* ANY envelope under another key -- including the anonymous "" slot -- means
     someone else has captured on this device. The live wl_training_v1 and
     wl_workout_v1 carry no owner stamp, so their bytes cannot be attributed to
     whoever is signed in now.

     This check comes BEFORE accepting our own envelope. A valid envelope for
     this account proves only what WE captured once; it does not prove the live
     keys still belong to us. A signs out-ish, B uses the device, A signs back in
     without a verified logout: A's envelope is still perfectly valid while the
     live bytes are B's. */
  var other=null;
  for(var k in m){if(k!==acct&&m[k]&&typeof m[k]==="object"){other=k;break;}}
  if(other!==null)
    return blockRecovery("Training syncing is paused: this device holds training saved under another account, so it cannot be established whose the current data is. Log out fully to clear it.","ambiguous");

  var mine=m[acct];
  if(mine!==undefined){
    if(validEnvelope(mine,acct)){
      if(!setLastOwnerVerified(acct))
        return blockRecovery("Training syncing is paused: this device could not record which account its data belongs to.");
      recoveryState="ok";return true;}   /* write-once, and sound */
    /* Present but malformed: do not overwrite it, do not trust it. */
    return blockRecovery("Training syncing is paused: this device's saved recovery copy for your account is not readable. It has been left untouched.");}

  var rawT=null,rawW=null;
  try{rawT=localStorage.getItem(TKEY);rawW=localStorage.getItem(WOKEY);}
  catch(e){return blockRecovery("Training syncing is paused: this device's storage could not be read.");}
  if(rawT===null&&rawW===null){
    /* Nothing to snapshot -- but the marker must STILL be recorded and verified.
       Without it, a later core pull fills wl_v1 for this account and the next
       session, seeing no marker, could adopt those bytes as its own. */
    if(!setLastOwnerVerified(acct))
      return blockRecovery("Training syncing is paused: this device could not record which account its data belongs to.");
    recoveryState="none";return true;}    /* nothing to protect */

  var env={v:RECOVERY_V,capturedAt:new Date().toISOString(),appBuild:APP_BUILD,account:acct,
           training:rawT,workout:rawW};
  m[acct]=env;
  var str;
  try{str=JSON.stringify(m);}catch(e){return blockRecovery("Training syncing is paused: a recovery copy of your training could not be prepared.");}
  try{localStorage.setItem(TRECOVERY_KEY,str);}catch(e){return blockRecovery("Training syncing is paused: a recovery copy of your training could not be saved (storage may be full).");}
  /* Read back and compare. A storage layer that accepts a write and then returns
     different bytes is exactly what a bare setItem cannot detect. */
  var back=null;
  try{back=localStorage.getItem(TRECOVERY_KEY);}catch(e){return blockRecovery("Training syncing is paused: the recovery copy could not be verified.");}
  if(back!==str)return blockRecovery("Training syncing is paused: the recovery copy did not verify after saving.");
  var chk=trainingRecovery();
  if(!(chk&&chk.training===rawT&&chk.workout===rawW))
    return blockRecovery("Training syncing is paused: the recovery copy did not verify after saving.");
  if(!setLastOwnerVerified(acct))
    return blockRecovery("Training syncing is paused: this device could not record which account its data belongs to.");
  recoveryState="ok";return true;}

/* A small, honest notice -- not a blocking screen, since a verified snapshot
   makes blocking unnecessary. It must never imply the training on screen is the
   authoritative copy: a stale pull may already have replaced it, which is the
   whole reason the snapshot exists. */
function recoveryNoticeHTML(){
  if(logoutRecoveryPending()){
    var known=logoutRecovery.phase!=="unreadable"&&logoutRecovery.journal;
    return '<div class="wl-hint" style="margin-bottom:10px;color:var(--bad)"><b>A log-out on this device was interrupted.</b> '+
      (known
        ? 'Your data was saved before it started, so nothing has been lost. Choose whether to put it back or finish clearing it.'
        : 'The record of it cannot be read, so it is not known how far it got. Nothing further will be changed until you decide.')+
      ' Until then this device will not sync, export, restore, change anything or log out.'+
      '<div class="wl-row" style="margin-top:10px">'+
      '<button class="wl-btn wl-btn-ghost wl-full" data-act="lrec:finish">Finish clearing it</button>'+
      (known?'<button class="wl-btn wl-btn-primary wl-full" data-act="lrec:restore">Put my data back</button>':'')+
      '</div></div>';}
  if(recoveryState==="adoption")
    return '<div class="wl-hint" style="margin-bottom:10px;color:var(--bad)"><b>This device is waiting on one question.</b> '+
      'Nothing will sync, export, restore, or be added, changed or deleted until you answer whether the data already here is yours.'+
      '<div class="wl-row" style="margin-top:10px"><button class="wl-btn wl-btn-primary wl-full" data-act="adopt:ask">Answer it now</button></div></div>';
  if(recoveryBlocked)
    return '<div class="wl-hint" style="margin-bottom:10px;color:var(--bad)"><b>Training syncing is paused.</b> '+
      esc(recoveryBlockReason.replace(/^Training syncing is paused: /,""))+
      (ownershipAmbiguous()
        ?' Nothing on this device can be synced, exported, restored or logged out while this is unresolved, because none of it can be attributed to one person.'
        :(trainingQuarantined()?' Backups will not include training while this is unresolved.':''))+
      ' Your local training has not been altered by this app. Tell whoever maintains it.</div>';
  var rec=trainingRecovery();
  if(!rec)return '';
  return '<div class="wl-hint" style="margin-bottom:10px">A <b>pre-sync copy</b> of your training was saved on '+
    esc(String(rec.capturedAt||"").slice(0,10))+' before this device last synced, and it is included in every export below. '+
    'It may differ from the training shown in the app — both are kept, and neither is assumed to be the right one.</div>';}

/* Called immediately after a successful same-page authentication, before any
   user-data operation. Returns false when the continuation must abort.

   The marker is the attribution, and it is never inferred from the act of
   signing in: stamping signed-out bytes with whoever authenticates next is the
   privacy defect, not the fix. */
function establishOwnershipAfterLogin(){
  var acct=recoveryAccountId();
  if(!acct)return false;
  var lo=lastOwner();
  if(lo&&lo!==acct){
    recoveryState="ambiguous";recoveryBlocked=true;recoveryFreeze=true;
    recoveryBlockReason="Training syncing is paused: this device holds data saved under another account, so it cannot be established whose the current data is.";
    return false;}
  if(!lo&&localUserDataExists()){
    /* Same decision as boot: ask rather than infer. */
    var st0=readRecoveryStore();
    if(st0.status==="valid"&&Object.keys(st0.map).length===0){
      recoveryState="adoption";recoveryBlocked=true;recoveryFreeze=true;
      recoveryBlockReason="Waiting for you to confirm that the data already on this device is yours.";
      return false;}
    /* Data present, and this build has never recorded an owner for it. It was
       either written signed out or by a build older than the marker. The FIRST
       authenticated boot of this build adopts it (see captureTrainingRecovery),
       which is the upgrade path; reaching here instead means the data appeared
       while signed out, and nothing attributes it to this account. */
    recoveryState="ambiguous";recoveryBlocked=true;recoveryFreeze=true;
    recoveryBlockReason="Training syncing is paused: this device holds training that cannot be attributed to your account.";
    return false;}
  return runRecoveryCapture();}

var adoptionAsked=false;
/* Asked once per load, and only ever after boot has finished rendering. Cancel
   ("Not mine") deliberately does nothing, which leaves the device quarantined --
   the safe default is the one you get by not answering. */
function maybeAskAdoption(){
  if(recoveryState!=="adoption"||adoptionAsked)return;
  adoptionAsked=true;
  askConfirm("This device already has training and health data saved on it, from before this update.\n\nLink it to "+(pbEmail()||"this account")+"?\n\nIf it isn't yours, choose Cancel — nothing will be synced, exported or deleted until it's sorted out.",
    function(){adoptLocalData();},{label:"Yes, it's mine",danger:false});}
function adoptLocalData(){
  var acct=recoveryAccountId();
  if(!acct)return;
  if(!setLastOwnerVerified(acct)){
    blockRecovery("Training syncing is paused: this device could not record which account its data belongs to.");
    if(bootGated&&document.getElementById("app"))renderGate&&renderGate();
    return;}
  /* Reload rather than resume: when the gate owned the screen, the ordinary boot
     never ran, so there is no half-initialised app to resume INTO. The reload
     boots normally -- the marker now exists, so capture takes its snapshot in
     its canonical position, BEFORE load and migration. The gate blocked every
     write while it was up, so the bytes at reload are the bytes at confirmation. */
  location.reload();}

/* ---- recovery-only and adoption-only boot screens ----
   These REPLACE the app, they are not banners inside it. A device that cannot
   resolve its own state must not render data-mutating controls at all: a
   suppressed save still leaves the edit in memory, visible on screen and ready
   to be exported the moment the state clears -- which is what made the previous
   "quarantine" claim false. */
function gateScreenHTML(title,body,buttons){
  return '<div class="wl-shell"><main class="wl-main" style="display:flex;align-items:center;justify-content:center;min-height:80vh">'+
    '<div class="wl-card" style="max-width:420px;margin:20px">'+
    '<div class="wl-card-head"><span>'+esc(title)+'</span></div>'+
    '<div style="font-size:14px;line-height:1.5;color:var(--text);margin:10px 0">'+body+'</div>'+
    buttons+'</div></main></div>'+confirmOverlayHTML();}
function renderLogoutRecoveryGate(){
  var known=logoutRecovery&&logoutRecovery.phase!=="unreadable"&&logoutRecovery.journal;
  var body,buttons;
  if(known){
    body='A log-out on this device was interrupted before it finished. Your data was saved before it started, so nothing has been lost.'+
      '<br><br>Choose whether to put everything back the way it was, or to finish clearing the device. Until then nothing will sync, export, change or log out.';
    buttons='<div class="wl-row" style="margin-top:14px">'+
      '<button class="wl-btn wl-btn-ghost wl-full" data-act="lrec:finish">Finish clearing it</button>'+
      '<button class="wl-btn wl-btn-primary wl-full" data-act="lrec:restore">Put my data back</button></div>';
  }else{
    /* Product Owner ruling 2026-08-01: no destructive escape when the record is
       unreadable. The device stays locked for the reviewed recovery procedure. */
    body='A log-out on this device was interrupted, and the record of it cannot be read — so it is not known what it holds or how far the log-out got.'+
      '<br><br>Nothing has been changed, and nothing will be: this device will not sync, export, restore, change data, or log out until it has been looked at.'+
      '<br><br><b>Contact whoever maintains this app before doing anything else.</b>';
    buttons='';}
  document.getElementById("app").innerHTML=gateScreenHTML("Interrupted log-out",body,buttons);}
function renderAdoptionGate(){
  var body='This device already has training and health data saved on it, from before this update.'+
    '<br><br><b>Is it yours?</b> Linking it to <b>'+esc(pbEmail()||"this account")+'</b> makes it part of that account and turns syncing back on.'+
    '<br><br>Until you answer, nothing on this device will sync, export, restore, or be added, changed or deleted.'+
    '<br><br>If it is not yours, do nothing — nothing is touched while this screen is showing.';
  var buttons='<div class="wl-row" style="margin-top:14px">'+
    '<button class="wl-btn wl-btn-primary wl-full" data-act="adopt:yes">Yes, it’s mine</button></div>';
  document.getElementById("app").innerHTML=gateScreenHTML("One question first",body,buttons);}
/* True when a gate owns the screen; the ordinary app must not render. */
function bootGated(){return logoutRecoveryPending()||recoveryState==="adoption";}
function renderGate(){if(logoutRecoveryPending())renderLogoutRecoveryGate();else renderAdoptionGate();}

function runRecoveryCapture(){
  recoveryState="none";recoveryBlocked=false;recoveryBlockReason="";recoveryRawCorrupt=null;
  recoveryFreeze=false;
  return captureTrainingRecovery();}
/* Boot is over: the athlete's own edits must persist again, even while training
   stays quarantined from syncing and from the ordinary backup. */
function endRecoveryFreeze(){recoveryFreeze=false;}

/* ---- the application-data JSON backup ----

   payload() is deliberately NOT extended to carry training: it defines both the
   core localStorage record and the server's `data` field, and training is a
   separate subsystem with its own field and revision counter. Mixing them would
   change what every sync writes. The backup is assembled here instead.

   Repository history shows backupJSON() originated as payload() and contains no
   training addition before this change, so backups produced by the current
   lineage carry no exercises, routines, cardio sessions or lift sessions.

   Three training-related components are kept SEPARATE, because they can legitimately
   differ and any of them may be the one that matters:
     trainingHistory : the live copy, which a stale pull may already have overwritten
     activeWorkout   : the in-progress session, null when there genuinely is none
     recovery        : the immutable pre-sync raw snapshot, when one exists
   Recovery is never substituted for the live copy. Both are evidence.

   NOT a complete device backup: progress photos have their own export
   (`pbk:export`) and are not included here.

   __backup goes LAST in the assign order. The double underscore avoids a
   collision with today's fields but cannot promise one against a field added
   years from now, and payload() must never be able to overwrite the metadata a
   restore reads to decide how to interpret the file. */
/* backupJSON() returns a STRING. Object.assign({}, <string>, {...}) spreads it
   into numbered CHARACTER keys, so both conflict exports were written as ~150k
   entries of {"0":"{","1":"\"",...} instead of the data — 4MB of unusable
   noise, and these are the safety artifact the user is told to take BEFORE
   choosing which copy to keep (Owner, 2026-08-04). Build the object properly. */
function conflictExportText(marker){
  var raw=backupJSON();
  var obj=null;
  try{obj=JSON.parse(raw);}catch(e){obj=null;}
  if(obj&&typeof obj==="object"&&!Array.isArray(obj)){
    obj.__conflict=marker;
    return JSON.stringify(obj,null,2);
  }
  /* never silently emit a broken artifact: keep the payload readable */
  return JSON.stringify({__conflict:marker,__note:"backup could not be parsed; raw payload preserved below",backup:raw},null,2);
}
function backupJSON(){
  var contains=[];
  var out={};
  /* Core is no more attributable than training. Under ownership ambiguity the
     backup carries NO user data at all rather than a "core-only" file that would
     still be someone's weights, food and notes. */
  if(!ownershipAmbiguous()){out=Object.assign({},payload());contains.push("core");}
  /* When ownership of the live training bytes cannot be established -- another
     account has captured here, or the store is damaged -- the ordinary backup
     carries NO training at all. Not the live copy, not the active workout, not
     any recovery envelope, not the damaged raw bytes. Any of them could be
     someone else's health data, and an export is the moment it would leave the
     device. Core stays, and the metadata says why the rest is missing. */
  if(!trainingQuarantined()&&!ownershipAmbiguous()){
    out.trainingHistory=state.training;contains.push("trainingHistory");
    var woRaw=null;
    try{woRaw=localStorage.getItem(WOKEY);}catch(e){woRaw=null;}
    if(woRaw===null){out.activeWorkout=null;}
    else{var wo=null;try{wo=JSON.parse(woRaw);}catch(e){wo=null;}
         out.activeWorkout=wo;if(wo)contains.push("activeWorkout");}
    var rec=trainingRecovery();
    if(rec){out.recovery=rec;contains.push("recovery");}}
  out.__backup={format:BACKUP_FORMAT,createdAt:new Date().toISOString(),
    appBuild:APP_BUILD,contains:contains,account:recoveryAccountId()||null,
    recoveryState:recoveryState,recoveryBlocked:!!recoveryBlocked,
    trainingWithheld:trainingQuarantined(),userDataWithheld:ownershipAmbiguous(),
    recoveryBlockReason:recoveryBlocked?recoveryBlockReason:null};
  return JSON.stringify(out,null,2);}
function applyImport(text){
  if(ownershipAmbiguous()){toast("Restore paused — this device holds data from another account");return;}
  var d;try{d=JSON.parse(text);}catch(err){toast("That isn't valid backup data");return;}
  if(!d||typeof d!=="object"||(!("weights" in d)&&!("settings" in d))){toast("Unrecognized backup format");return;}
  askConfirm("Replace all data on this device with this backup? Current entries will be overwritten.",function(){
  state.settings=Object.assign({},DEFAULT_SETTINGS,d.settings||{});
  state.weights=Array.isArray(d.weights)?d.weights:[];
  state.food=d.food||{};state.workouts=d.workouts||{};state.steps=d.steps||{};state.notes=d.notes||{};state.sleep=d.sleep||{};state.bodyfat=d.bodyfat||{};state.waist=d.waist||{};state.leanmass=d.leanmass||{};state.statuses=d.statuses||[];state.weeklySummary=d.weeklySummary||null;state.nightlySummary=d.nightlySummary||null;state.nightlyLog=d.nightlyLog||{};state.scriptVer=d.scriptVer||{};coachRptLoad();if(migrateCoachSeen())save();
  state.presets=(Array.isArray(d.presets)&&d.presets.length)?d.presets:DEFAULT_PRESETS.slice();
  state.pasteOpen=false;state.view="overview";applyTheme(state.settings.theme||"dark");save();toast("Data restored");
  },{label:"Replace",danger:false});
}
function exportData(){
  if(ownershipAmbiguous()){toast("Export paused — this device holds data from another account");return;}
  var json=backupJSON();var name="weight-tracker-backup-"+todayISO()+".json";
  try{
    var file=new File([json],name,{type:"application/json;charset=utf-8"});
    if(navigator.canShare&&navigator.canShare({files:[file]})){
      navigator.share({files:[file]}).catch(function(){});return;
    }
  }catch(e){}
  var blob=new Blob([json],{type:"application/json;charset=utf-8"});var url=URL.createObjectURL(blob);
  var a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(function(){URL.revokeObjectURL(url);},1000);toast("Backup exported");
}
function copyBackup(){
  if(ownershipAmbiguous()){toast("Copy paused — this device holds data from another account");return;}
  var json=backupJSON();
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(json).then(function(){toast("Backup copied");}).catch(function(){fallbackCopy(json);});
  else fallbackCopy(json);
}
function fallbackCopy(text){
  var ta=document.createElement("textarea");ta.value=text;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.focus();ta.select();
  try{document.execCommand("copy");toast("Backup copied");}catch(e){toast("Couldn't copy — use Export instead");}document.body.removeChild(ta);
}
function copyText(text,msg){
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(function(){toast(msg||"Copied");}).catch(function(){legacyCopy(text,msg);});
  else legacyCopy(text,msg);
}
function legacyCopy(text,msg){
  var ta=document.createElement("textarea");ta.value=text;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.focus();ta.select();
  try{document.execCommand("copy");toast(msg||"Copied");}catch(e){toast("Couldn't copy");}document.body.removeChild(ta);
}
function updateApp(){toast("Fetching latest…");setTimeout(function(){location.replace(location.origin+location.pathname+"?v="+Date.now());},250);}
function extractBuild(txt){var m=/APP_BUILD="([^"]+)"/.exec(txt);return m?m[1]:null;}
function checkForUpdate(){
  fetch(location.origin+location.pathname+"?vc="+Date.now(),{cache:"no-store"})
    .then(function(r){return r.text();})
    .then(function(txt){var sv=extractBuild(txt);if(!sv||sv===APP_BUILD)return;
      var already="";try{already=sessionStorage.getItem("wl_reloaded_for")||"";}catch(e){}
      if(already===sv){showUpdateBanner();return;} /* reload didn't stick (CDN lag) — offer instead of looping */
      try{sessionStorage.setItem("wl_reloaded_for",sv);}catch(e){}
      updateApp();
    }).catch(function(){});
}
function showUpdateBanner(){
  if(document.getElementById("wl-update-banner"))return;
  var b=document.createElement("div");b.id="wl-update-banner";b.className="wl-update-banner";
  b.innerHTML='<span>New version available</span><button class="wl-btn" style="background:var(--on-accent);color:var(--accent)" data-act="app:update">Update now</button>';
  document.body.appendChild(b);
}
function showAppliedBanner(ver){
  if(document.getElementById("wl-applied-banner"))return;
  var b=document.createElement("div");b.id="wl-applied-banner";b.className="wl-applied-banner";
  b.innerHTML='<span>✓ Updated to version '+ver+'</span><span class="wl-applied-hint">Swipe to dismiss</span>';
  document.body.appendChild(b);
  setTimeout(function(){b.classList.add("in");},30);
  var sx=0,sy=0,dx=0,dy=0,drag=false,gone=false;
  function dismiss(){if(gone)return;gone=true;b.style.transition="transform .25s ease, opacity .25s ease";b.style.transform="translateY(-130%)";b.style.opacity="0";setTimeout(function(){if(b.parentNode)b.parentNode.removeChild(b);},280);}
  b.addEventListener("touchstart",function(e){sx=e.touches[0].clientX;sy=e.touches[0].clientY;dx=dy=0;drag=true;b.style.transition="none";},{passive:true});
  b.addEventListener("touchmove",function(e){if(!drag)return;dx=e.touches[0].clientX-sx;dy=e.touches[0].clientY-sy;b.style.transform="translate("+dx+"px,"+Math.min(0,dy)+"px)";b.style.opacity=String(Math.max(0,1-(Math.abs(dx)+Math.abs(Math.min(0,dy)))/150));},{passive:true});
  b.addEventListener("touchend",function(){drag=false;if(Math.abs(dx)>60||dy<-40){dismiss();}else{b.style.transition="transform .2s ease, opacity .2s ease";b.style.transform="";b.style.opacity="";}});
  b.addEventListener("click",dismiss);
  setTimeout(function(){dismiss();},12000);
}

/* ---------------- app icon (generated, for Add to Home Screen) ---------------- */
function makeIcon(){
  try{var cv=document.createElement("canvas");cv.width=180;cv.height=180;var x=cv.getContext("2d");
    var g=x.createLinearGradient(0,0,180,180);g.addColorStop(0,"#212836");g.addColorStop(1,"#10131A");
    x.fillStyle=g;x.fillRect(0,0,180,180);
    function rr(bx,by,bw,bh,br){x.beginPath();x.moveTo(bx+br,by);x.arcTo(bx+bw,by,bx+bw,by+bh,br);x.arcTo(bx+bw,by+bh,bx,by+bh,br);x.arcTo(bx,by+bh,bx,by,br);x.arcTo(bx,by,bx+bw,by,br);x.closePath();x.fill();}
    x.fillStyle="#7C93F5";rr(22,101,40,50,14);
    x.fillStyle="#9FB0C9";rr(70,72,40,79,14);
    x.fillStyle="#F5B544";rr(119,29,40,122,14);
    var data=cv.toDataURL("image/png");
    var link=document.createElement("link");link.rel="apple-touch-icon";link.href=data;document.head.appendChild(link);
    var fav=document.createElement("link");fav.rel="icon";fav.href=data;document.head.appendChild(fav);
    var man={name:"Compound",short_name:"Compound",start_url:".",display:"standalone",background_color:"#0F1218",theme_color:"#0F1218",icons:[{src:data,sizes:"180x180",type:"image/png"},{src:data,sizes:"512x512",type:"image/png"}]};
    var ml=document.createElement("link");ml.rel="manifest";ml.href="data:application/manifest+json,"+encodeURIComponent(JSON.stringify(man));document.head.appendChild(ml);
  }catch(e){}
}