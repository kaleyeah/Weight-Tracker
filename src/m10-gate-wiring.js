/* =============== M10-BLOCK-4-WIRING: the queue OWNS every content photo mutation.
   idbAdd/idbDelete/idbClearAll are re-wrapped over the increment-0 locals
   (idbAddLocal etc. — the M8-era pbPhoto* transport is no longer called from
   these paths); photoSync's server reconciliation is disabled while any
   pending/displaced entry exists or the device lacks the pen. ---- */
(function(){
  /* add: queue intent VERIFIED → local blob written+verified → dispatch */
  idbAdd=function(rec){
    if(ownershipAmbiguous())return Promise.reject("ambiguous");
    var uid=m8Uid();
    if(!uid||!syncOn())return idbAddLocal(rec);
    if(window.m8StorageBlocked)return Promise.reject("blocked");
    /* 2026-08-06 wedge root cause (Owner's phone, server log 'localId:
       Value must be unique'): a KEYED PUT on a record this device has
       already verifiably uploaded (it is in the photo map) is a local
       metadata update — normalization, retake bookkeeping — NOT new
       content. Re-queueing an upload made the server reject the duplicate
       localId with an untyped 500 and the retry wedged the whole queue. */
    try{if((pbPhotoMap()||{})[String(rec.id)])return idbAddLocal(rec);}catch(e){}
    var opId=m10pOpId();
    if(!opId)return Promise.reject("no-identity");
    var rid=m10cRequestId();
    if(!rid)return Promise.reject("no-identity");
    var meta=m10pMetaOf(rec);
    var en={id:opId,op:"add",localId:String(rec.id),meta:meta,requestId:rid,state:"intent"};
    if(!m10pMutate(uid,function(ops){ops.push(en);}))return Promise.reject("queue-failed");
    return idbAddLocal(rec).then(function(r){
      return m10pSha256(rec.blob).then(function(idn){
        return idbGetLocal(String(rec.id)).then(function(back){
          var okBlob=!!(back&&back.blob&&back.blob.size===rec.blob.size);
          if(!okBlob){
            m10pMutate(uid,function(ops){var e2=ops.find(function(x){return x.id===opId;});if(e2)e2.state="void";});
            return r;}
          m10pMutate(uid,function(ops){
            var e2=ops.find(function(x){return x.id===opId;});
            if(e2){e2.blobSha256=idn.hex;e2.blobByteLength=idn.byteLength;e2.state="blob-ok";}});
          m10pDispatch();
          return r;});});
    });};
  /* delete: tombstone VERIFIED (blob still recoverable) → ack → local delete */
  idbDelete=function(id){
    if(ownershipAmbiguous())return Promise.reject("ambiguous");
    var uid=m8Uid();
    if(!uid||!syncOn())return idbDeleteLocal(id);
    if(window.m8StorageBlocked)return Promise.reject("blocked");
    var opId=m10pOpId(),rid=m10cRequestId();
    if(!opId||!rid)return Promise.reject("no-identity");
    var sid=null;try{sid=pbPhotoMap()[id]||null;}catch(e){}
    return idbGetLocal(String(id)).then(function(rec){
      var en={id:opId,op:"delete",localId:String(id),serverId:sid,
        capturedLocalMeta:rec?m10pMetaOf(rec):{kind:"food",date:"",week:"",pose:"",meal:"",ts:""},
        capturedServerIdentity:sid?{recordId:sid}:null,requestId:rid,state:"intent"};
      if(!m10pMutate(uid,function(ops){ops.push(en);}))return Promise.reject("queue-failed");
      if(!sid){
        /* never uploaded: delete locally now, then settle the entry */
        return idbDeleteLocal(id).then(function(){
          m10pMutate(uid,function(ops){var k=ops.findIndex(function(x){return x.id===opId;});if(k>=0)ops.splice(k,1);});
          return true;});}
      m10pDispatch();
      return true;});};
  /* clear: every member becomes its own queued delete (captured identities) */
  idbClearAll=function(){
    if(ownershipAmbiguous())return Promise.reject("ambiguous");
    var uid=m8Uid();
    if(!uid||!syncOn())return idbClearAllLocal();
    if(window.m8StorageBlocked)return Promise.reject("blocked");
    return idbAll().then(function(all){
      var chain=Promise.resolve();
      all.forEach(function(rec){chain=chain.then(function(){return idbDelete(rec.id);});});
      return chain;});};
  /* metadata (the lightbox relabel) */
  window.m10pQueueMeta=function(serverId,localId,oldMeta,newMeta){
    var uid=m8Uid();
    if(!uid||!syncOn()||!serverId)return false;
    if(window.m8StorageBlocked)return false;
    var opId=m10pOpId(),rid=m10cRequestId();
    if(!opId||!rid)return false;
    var en={id:opId,op:"meta",localId:String(localId||""),serverId:String(serverId),
      oldMeta:oldMeta,newMeta:newMeta,requestId:rid,state:"intent"};
    if(!m10pMutate(uid,function(ops){ops.push(en);}))return false;
    m10pDispatch();
    return true;};
  /* server reconciliation pauses while anything is pending or displaced, and
     for non-holders (a non-holder must not add/delete/relabel local photos) */
  /* R3: the legacy sweep is REPLACED, not wrapped. It uploaded via raw
     pbPhotoUpload (bypassing the queue and its identity binding) and DELETED
     local photos absent from a server listing — a silent content deletion
     M10 forbids. The M10 sweep: drain the queue, then (holder only) DOWNLOAD
     server photos this device lacks, revalidating immediately before the
     IndexedDB write. It never deletes, never relabels: a server-side
     disappearance is a difference, not an authority to destroy local bytes. */
  photoSync=function(done){
    /* DIAGNOSTIC (_psLast): the on-device photo report the Owner asked for on
       2026-08-04 was originally instrumented inside the RETIRED M8-era
       photoSync, so it never ran and the UI permanently claimed "photo sync
       hasn't run yet" (Owner caught it on .458 day one). The live sweep now
       reports every early-return by name and the real adoption counts. */
    var uid=m8Uid();
    if(ownershipAmbiguous()){_psLast={ok:false,at:Date.now(),why:"this device's data isn't matched to your account"};done&&done();return;}
    if(!uid||!syncOn()){_psLast={ok:false,at:Date.now(),why:"not signed in"};done&&done();return;}
    if(typeof indexedDB==="undefined"){_psLast={ok:false,at:Date.now(),why:"photo storage unavailable"};done&&done();return;}
    if(window.m8StorageBlocked){_psLast={ok:false,at:Date.now(),why:"storage is blocked on this device"};done&&done();return;}
    var ctx=m10cCtx();
    if(!m10pPen()){_psLast={ok:false,at:Date.now(),why:"another device is the active writer — photos download on the writing device; take over to sync them here"};done&&done();return;}
    var sweepFence=m10pPen().fence;              /* ruling 5: bind the sweep */
    m10pDispatch(function(){
      if(m10pOps(uid).length){_psLast={ok:false,at:Date.now(),why:"pending photo operations must finish first"};done&&done();return;}
      Promise.all([idbAll(),pbPhotoList()]).then(function(res){
        if(!m10cCtxOk(ctx)){done&&done();return;}
        var p2=m10pPen();
        if(!p2||p2.fence!==sweepFence){done&&done();return;}
        var local=res[0]||[],server=res[1]||[];
        var localIds={};local.forEach(function(l){localIds[l.id]=1;});
        var missing=server.filter(function(s2){return s2.localId&&s2.file&&!localIds[s2.localId];});
        if(!missing.length){
          _psLast={ok:true,at:Date.now(),up:0,down:0,rm:0,
            seen:{server:server.length,serverProgress:server.filter(function(x){return x.kind==="progress";}).length,
                  local:local.length,localProgress:local.filter(function(x){return x.kind==="progress";}).length}};
          done&&done();return;}
        /* ruling 6: adoption is JOURNALED — identity captured in a verified
           queue entry, then blob durable, then map durable+verified */
        var okq=m10pMutate(uid,function(ops){
          missing.forEach(function(s2){
            var opId=m10pOpId(),rid=m10cRequestId();
            if(!opId||!rid)return;
            ops.push({id:opId,op:"adopt",localId:String(s2.localId),serverId:String(s2.id),
              file:String(s2.file),requestId:rid,state:"intent",
              meta:{kind:s2.kind==="progress"?"progress":"food",date:String(s2.date||"").slice(0,10),
                week:String(s2.week||"").slice(0,10),pose:String(s2.pose||"").slice(0,20),
                meal:String(s2.meal||"").slice(0,20),ts:String(s2.ts||"")}});});});
        if(!okq){done&&done();return;}
        m10pDispatch(function(){
          /* merge 2026-08-03: wkPhotoKey/refreshWeekPhotos were retired on main
             (the weekly check-in card replaced the prompt they fed). Nothing to
             invalidate here any more. */
          _psLast={ok:true,at:Date.now(),up:0,down:missing.length,rm:0,
            seen:{server:server.length,serverProgress:server.filter(function(x){return x.kind==="progress";}).length,
                  local:local.length,localProgress:local.filter(function(x){return x.kind==="progress";}).length}};
          try{if(state.view==="photos"||state.view==="diary")render();}catch(e){}
          done&&done();});
      }).catch(function(){done&&done();});});};
  /* boot: resume the queue after the core settles */
  var origCoreBoot2=m10cBoot;
  m10cBoot=function(cb){
    origCoreBoot2(function(){m10pDispatch(function(){cb&&cb();});});};
  /* the displaced-photo banner rides the photos view */
  var origPhotosView=view_photos;
  if(typeof origPhotosView==="function")
    view_photos=function(){return m10pBannerHTML()+origPhotosView();};
})();
document.addEventListener("click",function(e){
  var el=e.target.closest&&e.target.closest("[data-act^=\"m10p:\"]");
  if(!el)return;
  var a=el.getAttribute("data-act"),id=el.getAttribute("data-id");
  if(a==="m10p:export"){m10pExport(id);return;}
  if(a==="m10p:apply"){m10pReviewApply(id);return;}
  if(a==="m10p:discard"){m10pReviewDiscard(id);return;}
});
/* =============== M10-BLOCK-4-END =============== */

/* ================= M10-BLOCK-5: the gate surface (design v9.1 §5, increment 5) =================
   Authorized round 28 on accepted head 249fd0e. ONE choke point: a
   capture-phase listener that runs BEFORE the application's own dispatcher and
   refuses every mutation-capable action unless this device holds the pen for
   this account. Delayed mutations (file pickers, share sheets, confirmations,
   network callbacks) are revalidated again immediately before they mutate —
   entry gating alone proves nothing once an await intervenes. Fail closed: if
   the gate state or durable storage is unavailable, nothing mutates. */
var M10_GATED={};
["act:addcat","act:del","act:toggle","ai:copy","ai:gen","cal:ignore","cal:overwrite","cal:usecalc","cardio:del","cardio:save","cf:newtype","ci:send","ci:skipyes","ci:unskip","day:clear","day:reopendo","ex:clearall","ex:del","ex:save","ex:seedall","exseed:add","fb:done","fb:set","glp:compound","glp:compoundsave","glp:dose:del","glp:dose:open","glp:dose:save","glp:enable","glp:showdue","glp:siterot","glp:skip","glp:sym:del","glp:sym:edit","glp:sym:newsave","glp:sym:open","glp:sym:save","glp:symptoms","glp:titration","hk:import","import","lift:del","lift:save","lift:savedetail","m10cx:server","m10cx:takeover","m10p:apply","m10p:export","m8:cx:local","m8:cx:server","macro:keep","macro:suggest","max:open","night:gen","night:toggle","note:del","note:save","ob:back","ob:recalc","paste:do","pb:adv","pb:pwsave","pbk:import","photo:add","pphoto:add","preset:del","rat:set","reminder:add","reset:ask","reset:do","ri:mv","ri:pick","ri:prog","ri:remove","rt:del","rt:new","rt:save","set:activity","set:sex","set:strategy","set:theme","set:ttype","set:units","set:weekstart","skip:calories","skip:sleep","skip:steps","skip:weight","status:end","status:endnow","status:save","sum:coachreport","sum:exportall","sum:exportweek","sum:toggle","sync:pull","sync:push","sync:test","tdee:apply","tdee:later","weight:add","weight:del","wo:addset","wo:begin","wo:bwsave","wo:delset","wo:discard","wo:discardnow","wo:endnow","wo:endrest","wo:exaddset","wo:exmove","wo:exprog","wo:exremove","wo:finish","wo:finishback","wo:finishlater","wo:log","wo:replacepick","wo:replsave:fwd","wo:resume","wo:savesession","wo:skipset","wo:skipthem","wo:start","wo:startroutine","wu:no","wu:yes"].forEach(function(a){M10_GATED[a]=1;});

/* fresh, complete authority check — account, session generation, holder,
   deadline AND fence identity, plus storage health */
function m10AuthNow(){
  if(!syncOn())return {ok:true,local:true};       /* no account: no lease concept */
  if(M10.corrupt)return {ok:false,why:"corrupt"};
  if(window.m8StorageBlocked)return {ok:false,why:"blocked"};
  var uid=null;try{uid=pbUid();}catch(e){}
  if(!uid)return {ok:false,why:"no-account"};
  if(!M10.holder||M10.uid!==uid)return {ok:false,why:"not-holder"};
  if(!(performance.now()<M10.deadline))return {ok:false,why:"expired"};
  if(!m10pNat(M10.fence)||M10.fence<1)return {ok:false,why:"no-fence"};
  return {ok:true,uid:uid,fence:M10.fence,gen:M10.gen};}

function m10GateReason(why){
  if(why==="corrupt")return "Sync identity problem \u2014 this device is read-only";
  if(why==="blocked")return "Sync is paused \u2014 see the banner";
  /* D1/F6: "expired" used to return a message, and a message means toast-and-
     stop — the athlete was told the device is read-only with no way to act on
     it, and the read-only bar stays hidden until a reload. It is the same
     recoverable situation as "not-holder", so it takes the same route: the
     takeover sheet. Only genuinely unrecoverable reasons (corrupt identity,
     paused storage) still toast. */
  return null;}

/* the entry gate: TRUE to proceed */
function m10GateAction(tag){
  var a=m10AuthNow();
  if(a.ok)return true;
  var msg=m10GateReason(a.why);
  if(msg){toast(msg);return false;}
  m10TakeoverSheet();
  return false;}

/* the delayed-boundary gate: captured at the start of a deferred flow, checked
   again immediately before the mutation it authorizes */
function m10Capture(){
  var a=m10AuthNow();
  return a.ok?{local:!!a.local,uid:a.uid||null,fence:a.fence||null,gen:a.gen||null}:null;}
function m10StillValid(cap){
  if(!cap)return false;
  var a=m10AuthNow();
  if(!a.ok)return false;
  if(cap.local||a.local)return !!(cap.local&&a.local);
  return a.uid===cap.uid&&a.fence===cap.fence&&a.gen===cap.gen;}

/* capture-phase interception: the application's dispatcher never sees a
   refused action */
document.addEventListener("click",function(e){
  var el=e.target&&e.target.closest&&e.target.closest("[data-act]");
  if(!el)return;
  var a=el.getAttribute("data-act");
  if(!a||!M10_GATED[a])return;
  if(!m10GateAction(a)){e.stopImmediatePropagation();e.preventDefault();}
},true);

/* X4 (round-30 ruling 4): single-writer correctness is about WRITES, not
   intent. The four persistence primitives are gated at the source, so a
   read-only device performs zero durable writes even when a lazy migration
   fires during ordinary navigation.

   Y2/Y3 (round-31 rulings 2/3): this wraps the SNAPSHOT writers only —
   save/saveLocal/saveTraining/saveWorkout. The lower-level durable writers
   (saveTrainingLocal, m8Write, m10cWrite, idb*, direct localStorage) are
   deliberately NOT wrapped: they are the substrate M8/M10 journaling,
   quarantine and recovery are built from, and gating them would break the
   flows that repair a blocked device. Their authorization is proven at their
   own call sites (fenced routes, journal phases, the photo queue) and
   catalogued in INCR5-DURABLE-WRITERS.md. The earlier `m10InternalWrite`
   guard is REMOVED: it was declared and never set, so the claim that it
   enforced anything was false. */
/* ===== Z1 (round-34 rulings 1 and 2): the ONE exemption from the source gate.
   =====
   M8's recovery design is that a dirty generation whose bytes were never
   proven to reach disk raises a SOFT (unproven) block at boot, and that the
   athlete's next successful, VERIFIED re-save is exactly what releases it.
   Round-30 gated saveTraining() on m10AuthNow(), which refuses whenever the
   SHARED m8StorageBlocked union is raised — and that union includes the soft
   block. So the one action able to clear the block was the action the gate
   refused: a device that tripped it stayed read-only until reinstall.

   The exemption is NOT a generic hole in the combined m8StorageBlocked
   condition. It is refused unless ALL of the following hold:
     - the caller is saveTraining() and nothing else;
     - m8UnprovenBlocked === true AND m8HardBlocked === false;
     - the M10 core raises neither a hard NOR a soft block;
     - identity is not corrupt, an account is present, this device holds the
       pen for THAT account, the lease has not expired, and the fence is a
       valid safe integer >= 1;
     - local writes are not frozen by a recovery/adoption/logout screen, the
       training store is not quarantined, no corrupt M8 journal is preserved,
       and the dirty record itself reads back typed rather than malformed.
   M10/core/photo blocks and hard M8 blocks remain absolute.

   The contract of what it may then do is in m8SoftBlockRecoverySave(). */
function m8SoftRecoveryAuth(){
  if(!syncOn())return {ok:false,why:"local"};       /* no lease concept: the ordinary path already allows it */
  if(!m8UnprovenBlocked)return {ok:false,why:"not-soft-blocked"};
  if(m8HardBlocked)return {ok:false,why:"hard-blocked"};
  if(m10cHardBlocked||m10cUnprovenBlocked)return {ok:false,why:"core-blocked"};
  if(M10.corrupt)return {ok:false,why:"corrupt"};
  var uid=null;try{uid=pbUid();}catch(e){}
  if(!uid)return {ok:false,why:"no-account"};
  if(!M10.holder||M10.uid!==uid)return {ok:false,why:"not-holder"};
  if(!(performance.now()<M10.deadline))return {ok:false,why:"expired"};
  if(!m10pNat(M10.fence)||M10.fence<1)return {ok:false,why:"no-fence"};
  if(localWritesFrozen())return {ok:false,why:"frozen"};
  if(trainingQuarantined())return {ok:false,why:"quarantined"};
  if(m8CorruptJournalPresent(uid))return {ok:false,why:"corrupt-journal"};
  if(m8Read("dirty",uid).st==="malformed")return {ok:false,why:"unreadable"};
  return {ok:true,uid:uid,fence:M10.fence,gen:M10.gen};}

/* The exemption's whole contract, in one place (round-34 ruling 2):
     - it persists the current training snapshot and its dirty-generation
       proof, and NOTHING else;
     - the soft block is cleared only after BOTH have been read back and
       verified, and only through M8's own re-read-and-validate release —
       never by assigning the flag here;
     - no network push may begin while the proof is absent;
     - any persistence or verification failure RETAINS the soft block or
       ESCALATES it to a hard block, and returns false. Recovery is never
       claimed on failure.
   Returns true only when the device is genuinely recovered. */
function m8SoftBlockRecoverySave(){
  var pre=m8SoftRecoveryAuth();
  if(!pre.ok)return false;
  /* (1) the dirty GENERATION marker — a verified write inside m8MarkDirty */
  m8MarkDirty();
  if(m8HardBlocked)return false;                 /* escalated; nothing claimed */
  var gen=m8Gen;
  /* (2) the training SNAPSHOT — the only other thing this path may persist */
  if(!saveTrainingLocal()){m8Block("could not save training to storage");return false;}
  /* (3) the proof that THIS generation's bytes are on disk */
  var d=m8Read("dirty",pre.uid);
  if(!(d.st==="ok"&&d.val.gen===gen)){m8Block("could not record the proof");return false;}
  if(!m8Write("dirty",{gen:gen,persistedGen:gen,ts:d.val.ts},pre.uid)){
    m8Block("saved, but could not record the proof");return false;}
  /* (4) READ BOTH BACK and verify before anything is cleared */
  var v=m8Read("dirty",pre.uid);
  if(!(v.st==="ok"&&v.val.gen===gen&&v.val.persistedGen===gen)){
    m8Block("could not verify the proof");return false;}
  var onDisk=null,want=null;
  try{onDisk=localStorage.getItem(TKEY);}catch(e){onDisk=null;}
  try{want=JSON.stringify(state.training);}catch(e){want=null;}
  if(want==null||onDisk!==want){m8Block("could not verify the saved training");return false;}
  /* (5) only now may the soft block be released */
  m8ReleaseUnprovenIfProven();
  if(m8UnprovenBlocked)return false;             /* release refused: the block stands */
  /* (6) and only now, with the proof present and no block standing, may a
         network push begin */
  scheduleTrainingPush();
  return true;}

(function(){
  var prim={save:null,saveLocal:null,saveTraining:null,saveWorkout:null};
  Object.keys(prim).forEach(function(name){
    var orig=window[name];
    if(typeof orig!=="function")return;
    window[name]=function(){
      var a=m10AuthNow();
      if(!a.ok){
        /* Z1: the ONE exemption. Everything else about the refusal is
           unchanged, including the refusal counter. */
        if(name==="saveTraining"&&a.why==="blocked"&&m8SoftRecoveryAuth().ok)
          return m8SoftBlockRecoverySave();
        try{if(!window.__m10WriteRefused)window.__m10WriteRefused=0;window.__m10WriteRefused++;}catch(e){}
        return undefined;}
      return orig.apply(this,arguments);};});
})();

/* W1 (round-29 ruling 1): the click interceptor is NOT the only mutation
   boundary — the application's global `input`/`change` handlers persist
   directly (sleep, goals, lift-session fields, workout sets, routines,
   notes/food/steps/weight/bodyfat/waist/leanmass, sync config). Those events
   are intercepted at capture too, so a non-holder produces NO in-memory and
   NO durable change. Controls belonging to sign-in / server setup stay usable
   (they are how a device recovers), and everything is allowed when there is no
   sync account at all. */
function m10EditableAllowed(el){
  if(!el)return true;
  var id=(el.id||"");
  if(/^pb-|^wl-pb|^sync-|^setup-/.test(id))return true;     /* sign-in + server config */
  /* X5 (round-30 ruling 5): individually identified recovery controls only.
     `.wl-confirm` is a generic overlay used by ordinary application forms
     (workout editors, bodyweight, notes, GLP sheets) — it is NOT an authority
     boundary. */
  if(el.closest&&el.closest("#m10-cx"))return true;              /* the M10 core-review sheet */
  if(/^(m10-|wl-takeover-)/.test(id))return true;                /* M10 recovery controls */
  return false;}
["input","change"].forEach(function(evt){
  document.addEventListener(evt,function(e){
    var el=e.target;
    if(!el||!/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName||""))return;
    if(m10EditableAllowed(el))return;
    var a=m10AuthNow();
    if(a.ok)return;
    e.stopImmediatePropagation();
    e.preventDefault();
    /* restore the prior value so no in-memory or displayed change survives */
    try{
      if(el.type==="checkbox"||el.type==="radio")el.checked=!el.checked;
      else if(el.__m10Prev!==undefined)el.value=el.__m10Prev;
    }catch(e2){}
    var msg=m10GateReason(a.why);
    toast(msg||"Another session is the active writer — this device is read-only");
  },true);});
/* remember the pre-edit value so a refused edit can be reverted exactly */
document.addEventListener("focusin",function(e){
  var el=e.target;
  if(el&&/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName||"")){try{el.__m10Prev=el.value;}catch(e2){}}
},true);

/* delayed-mutation boundaries: file inputs and the import/photo chains */
(function(){
  var caps={};
  ["wl-photo-input","wl-import","wl-pbk-import"].forEach(function(id){
    var elx=document.getElementById(id);
    if(!elx)return;
    /* capture at picker OPEN (the click that reaches .click()) */
    elx.addEventListener("click",function(){caps[id]=m10Capture();},true);
    /* revalidate at CHANGE, before any handler reads the files */
    elx.addEventListener("change",function(ev){
      if(!m10StillValid(caps[id])){
        ev.stopImmediatePropagation();ev.preventDefault();
        try{elx.value="";}catch(e2){}
        toast("This device is no longer the active writer \u2014 nothing was changed");}
    },true);});
})();

/* confirmation callbacks are delayed mutations too: capture when the sheet is
   raised, revalidate when the athlete confirms */
(function(){
  var origAsk=askConfirm;
  askConfirm=function(message,fn,opts){
    var cap=m10Capture();
    /* Only sheets raised WHILE holding the pen are revalidated. A sheet
       raised without it (take over, review a displaced change, discard a
       pending photo op, resolve a conflict) is precisely the flow that
       repairs the situation — gating those would deadlock the device.
       Mutating actions are already refused at the dispatcher entry. */
    if(!cap)return origAsk(message,fn,opts);
    var wrapped=function(){
      if(!m10StillValid(cap)){toast("This device is no longer the active writer \u2014 nothing was changed");return;}
      return fn&&fn();};
    return origAsk(message,wrapped,opts);};
})();

/* logout coupling: every M10 obligation blocks sign-out (nothing may be
   erased while work is owed), on top of the M8 training gate */
(function(){
  var origLogout=pbLogout;
  pbLogout=function(){
    var uid=null;try{uid=pbUid();}catch(e){}
    if(uid&&syncOn()){
      var cst=m10cState();
      /* W5 (ruling 5): read the TYPED queue result — a malformed/unreadable
         queue must block logout and preserve the evidence, never look empty */
      var qr=m10pRead(uid);
      if(qr.st==="malformed"){
        askConfirm("This device's photo sync record is damaged and has been preserved. Resolve that before signing out — nothing can be erased while it is unreadable.",function(){try{render();}catch(e){}},{label:"OK",danger:false});
        return;}
      var pend=qr.st==="ok"?qr.val.ops.length:0;
      if(cst==="dirty"||cst==="dirty-unproven"||cst==="journal-recovery"||cst==="dx-recovery"){
        askConfirm("This device holds body data the server hasn\u2019t confirmed. Logout stays off until it syncs \u2014 try now?",function(){
          m10cPush(true,function(){});},{label:"Sync now",danger:false});
        return;}
      if(cst==="displaced"||cst==="review-pending"||cst==="corrupt"){
        askConfirm("Body data needs review before you can sign out \u2014 nothing can be erased while it is unresolved.",function(){try{render();}catch(e){}},{label:"Review",danger:false});
        return;}
      if(pend){
        askConfirm(pend+" photo change"+(pend===1?"":"s")+" haven\u2019t finished syncing. Logout stays off until they do.",function(){
          m10pDispatch(function(){});},{label:"Try now",danger:false});
        return;}}
    origLogout();};
})();
/* =============== M10-BLOCK-5-END =============== */

/* ---- lightbox with "Edit meal type" ----
   Full replacement of the app's openLightbox: identical navigation, delete, swipe
   and close-rerender behavior, plus — for FOOD photos only — an "Edit meal type"
   button in the bar. Tapping it reveals the four meal options; tapping one
   reassigns immediately (no confirm — it's fully reversible), collapses the row,
   and the diary regroups on close. Chips are hidden behind the button on purpose:
   always-visible chips invite accidental taps. */