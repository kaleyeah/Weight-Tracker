/* ================= M10-BLOCK-3: displaced-core review (design v9.1 displaced-core, increment 3) =================
   Authorized round 20 on accepted head 3056e8d. Consumes ONLY validated
   terminal core-ack/bootstrap journals (ruling 7). Griffin's local copy is
   preserved until a selected resolution is DURABLY complete (ruling 8); no
   destructive default exists — reload, logout, account switch, lease expiry,
   and restart all leave unresolved review state unresolved (ruling 9).
   Keys: wl_core_displaced__<uid> (the envelope) + wl_core_dx_journal__<uid>
   (ops core-displace / core-refresh / core-push-mine / core-take-server),
   both under the same verified-write/quarantine layer and the shared
   fail-closed block union. */
M10C_KINDS.displaced="wl_core_displaced__";
M10C_KINDS.dxjournal="wl_core_dx_journal__";

var M10CX_J_PHASES={"core-displace":["intent","net-done","k1","done"],
  "core-refresh":["intent","k2","done"],
  "core-push-mine":["intent","net-done","k1","k2","k3","done"],
  "core-take-server":["intent","k1","k2","k3","done"]};
function m10cxValidateDx(j){
  if(!j||typeof j!=="object")return "not an object";
  var ph=M10CX_J_PHASES[j.op];
  if(!ph)return "unknown op";
  if(ph.indexOf(j.phase)<0)return "impossible phase for op";
  if(!(typeof j.startedAt==="number"&&isFinite(j.startedAt)&&j.startedAt>=0))return "bad startedAt";
  var e=j.expect;
  if(!e||typeof e!=="object")return "missing expect";
  var natOk=function(v){return typeof v==="number"&&isFinite(v)&&v>=0&&Math.floor(v)===v&&v<=9007199254740991;};
  var canonOk=function(v,allowNull){
    if(v===null)return !!allowNull;
    if(typeof v!=="string")return false;
    try{var o=JSON.parse(v);return !!o&&typeof o==="object"&&!Array.isArray(o);}catch(ex){return false;}};
  if(j.op==="core-displace"){
    if(["conflict","fence-displaced","bootstrap-conflict"].indexOf(e.reason)<0)return "bad reason";
    if(j.phase!=="intent"&&!natOk(e.coreRevSeen))return "bad coreRevSeen";
    if(j.phase!=="intent"&&!canonOk(e.serverCanon,true))return "bad serverCanon";}
  if(j.op==="core-refresh"){
    if(!natOk(e.gen))return "bad gen";}
  if(j.op==="core-push-mine"){
    if(!natOk(e.expectedRev))return "bad expectedRev";
    if(!canonOk(e.pushedCanon))return "bad pushedCanon";
    if(!natOk(e.gen))return "bad gen";
    if(!(e.fence===null||natOk(e.fence)))return "bad fence";
    if(!(typeof e.requestId==="string"&&e.requestId.length>0&&e.requestId.length<=96))return "bad requestId";
    if((j.phase==="net-done"||j.phase==="k1"||j.phase==="k2"||j.phase==="k3")&&!natOk(e.newRev))return "bad newRev";}
  if(j.op==="core-take-server"){
    if(!natOk(e.serverRev))return "bad serverRev";
    if(!canonOk(e.serverCanon))return "bad serverCanon";}
  return null;}
function m10cxDxWrite(j,uid){
  var err=m10cxValidateDx(j);
  if(err){m10cBlock("refused to write an invalid review record ("+err+")");return false;}
  return m10cWrite("dxjournal",j,uid||j.owner);}
function m10cxDxAdvance(j,phase,extra,uid){
  j.phase=phase;
  if(extra)for(var k in extra)j.expect[k]=extra[k];
  return m10cxDxWrite(j,uid||j.owner);}
function m10cxValidateEnvelope(v){
  if(!v||typeof v!=="object")return "not an object";
  if(["conflict","fence-displaced","bootstrap-conflict"].indexOf(v.reason)<0)return "bad reason";
  var natOk=function(x){return typeof x==="number"&&isFinite(x)&&x>=0&&Math.floor(x)===x&&x<=9007199254740991;};
  if(!natOk(v.coreRevSeen))return "bad coreRevSeen";
  if(!(typeof v.enteredAt==="number"&&isFinite(v.enteredAt)))return "bad enteredAt";
  var canonOk=function(c,allowNull){
    if(c===null)return !!allowNull;
    if(typeof c!=="string")return false;
    try{var o=JSON.parse(c);return !!o&&typeof o==="object"&&!Array.isArray(o);}catch(ex){return false;}};
  if(!canonOk(v.serverData,true))return "bad serverData";
  if(!canonOk(v.localData))return "bad localData";
  return null;}
function m10cxEnvelope(uid){
  var r=m10cRead("displaced",uid);
  if(r.st!=="ok")return r;
  var err=m10cxValidateEnvelope(r.val);
  if(err)return {st:"malformed",raw:JSON.stringify(r.val)};
  return r;}

/* ---- state override: dx layer sits above the increment-2 machine ---- */
(function(){
  var origState=m10cState;
  m10cState=function(){
    var dj=m10cRead("dxjournal");
    if(dj.st==="malformed")return "corrupt";
    var env=m10cxEnvelope();
    if(env.st==="malformed")return "corrupt";
    if(dj.st==="ok")return "dx-recovery";
    if(env.st==="ok")return "displaced";
    return origState();};
})();

/* ---- the G8 handoff: validated terminal ack -> dx intent -> envelope ---- */
function m10cxHandoff(cb,ctx){
  ctx=ctx||m10cCtx();
  if(!m10cCtxOk(ctx)){cb&&cb(false);return;}
  var uid=ctx.uid;
  var dj=m10cRead("dxjournal",uid);
  if(dj.st==="malformed"){
    if(m10cQuarantine("dxjournal",uid))m10cBlock("a damaged review record was preserved and needs review");
    cb&&cb(false);return;}
  if(dj.st==="ok"){
    /* G8 crash-in-gap: the dx intent exists and validates — the terminal ack
       it superseded is removed NOW (verified), then recovery proceeds */
    var jGap=m10cRead("journal",uid);
    if(jGap.st==="ok"&&jGap.val.phase==="done"&&jGap.val.outcome){
      m10cRemove("journal",uid);
      if(m10cRead("journal",uid).st!=="absent"){m10cBlock("could not clear a handed-off sync record");cb&&cb(false);return;}}
    m10cxDxRecover(cb,ctx);return;}
  var j=m10cRead("journal",uid);
  if(j.st!=="ok"||j.val.phase!=="done"||!j.val.outcome){cb&&cb(true);return;}
  var v=j.val;
  if(m10cValidateJournal(v)!==null){
    if(m10cQuarantine("journal",uid))m10cBlock("an invalid sync record was preserved and needs review");
    cb&&cb(false);return;}
  if(v.outcome==="auth"){
    /* not a review state: the request terminally failed auth; dirty stays for
       a fresh push under a live session — cleanup-only (verified) */
    m10cRemove("journal",uid);
    if(m10cRead("journal",uid).st!=="absent"){m10cBlock("could not clear a finished sync record");cb&&cb(false);return;}
    cb&&cb(true);return;}
  var reason=v.outcome;
  var di={op:"core-displace",phase:"intent",startedAt:Date.now(),
    expect:{reason:reason,
      coreRevSeen:(reason==="conflict")?v.expect.serverRev:(reason==="bootstrap-conflict")?v.expect.serverRev:v.expect.expectedRev,
      serverCanon:(reason==="bootstrap-conflict")?(v.expect.serverCanon||null):null,
      origRequestId:v.expect.requestId||null}};
  if(!m10cxDxWrite(di,uid)){cb&&cb(false);return;}
  /* G8: the terminal ack is removed ONLY now that the dx intent (carrying the
     original request identity) is verified in place */
  m10cRemove("journal",uid);
  if(m10cRead("journal",uid).st!=="absent"){m10cBlock("could not clear a handed-off sync record");cb&&cb(false);return;}
  m10cxDxRecover(cb,ctx);}

function m10cxBuildEnvelope(j,uid,cb){
  var e=j.expect;
  var lc=m10cCanon(payload());
  if(!lc.ok){m10cBlock("core data failed validation ("+lc.error+")");cb&&cb(false);return;}
  var env={canon:M10C_CANON_VER,enteredAt:Date.now(),reason:e.reason,
    coreRevSeen:e.coreRevSeen,serverData:e.serverCanon,localData:lc.canon,exports:null};
  if(!m10cWrite("displaced",env,uid)){m10cBlock("could not record the review copies");cb&&cb(false);return;}
  var back=m10cxEnvelope(uid);
  if(back.st!=="ok"){m10cBlock("could not verify the review copies");cb&&cb(false);return;}
  if(!m10cxDxAdvance(j,"done",null,uid)){cb&&cb(false);return;}
  m10cRemove("dxjournal",uid);
  if(m10cRead("dxjournal",uid).st!=="absent"){m10cBlock("could not clear a finished review record");cb&&cb(false);return;}
  try{setSync("error","core needs review");try{render();}catch(_e){}}catch(ex){}
  try{render();}catch(ex){}
  cb&&cb(true);}

function m10cxDxRecover(cb,ctx){
  ctx=ctx||m10cCtx();
  if(!m10cCtxOk(ctx)){cb&&cb(false);return;}
  var uid=ctx.uid;
  var dj=m10cRead("dxjournal",uid);
  if(dj.st==="malformed"){
    if(m10cQuarantine("dxjournal",uid))m10cBlock("a damaged review record was preserved and needs review");
    cb&&cb(false);return;}
  if(dj.st!=="ok"){cb&&cb(true);return;}
  var j=dj.val;
  var err=m10cxValidateDx(j);
  if(err){if(m10cQuarantine("dxjournal",uid))m10cBlock("an invalid review record was preserved");cb&&cb(false);return;}
  if(j.op==="core-displace"){
    if(j.phase==="done"){m10cRemove("dxjournal",uid);cb&&cb(m10cRead("dxjournal",uid).st==="absent");return;}
    if(j.phase==="intent"){
      /* net-done: fetch the freshest server copy (also covers conflict and
         fence-displaced, whose terminals carry no payload) */
      pbGetRecord(function(rec,ferr){
        if(!m10cCtxOk(ctx)){cb&&cb(false);return;}
        if(ferr){cb&&cb(false);return;}       /* ambiguity: journal survives, retried on next boot */
        var srev=rec?(rec.coreRev||0):0;
        var scanon=null;
        if(rec&&rec.data!=null){
          var sc=m10cCanon(rec.data);
          if(!sc.ok){m10cBlock("the server core copy failed validation");cb&&cb(false);return;}
          scanon=sc.canon;}
        if(!m10cxDxAdvance(j,"net-done",{coreRevSeen:srev,serverCanon:scanon},uid)){cb&&cb(false);return;}
        m10cxBuildEnvelope(j,uid,cb);});
      return;}
    /* net-done or k1: identity captured — build/verify the envelope */
    m10cxBuildEnvelope(j,uid,cb);return;}
  if(j.op==="core-refresh"){m10cxFinishRefresh(j,uid,cb);return;}
  if(j.op==="core-push-mine"){m10cxFinishPushMine(j,uid,cb,ctx);return;}
  if(j.op==="core-take-server"){m10cxFinishTakeServer(j,uid,cb,ctx);return;}
  cb&&cb(false);}

/* ---- core-refresh: local editing continues during review ---- */
function m10cxRefresh(cb){
  var ctx=m10cCtx();
  if(!m10cCtxOk(ctx)){cb&&cb(false);return;}
  var env=m10cxEnvelope(ctx.uid);
  if(env.st!=="ok"){cb&&cb(false);return;}
  var j={op:"core-refresh",phase:"intent",startedAt:Date.now(),expect:{gen:m10cGen}};
  if(!m10cxDxWrite(j,ctx.uid)){cb&&cb(false);return;}
  m10cxFinishRefresh(j,ctx.uid,cb);}
function m10cxFinishRefresh(j,uid,cb){
  var lc=m10cCanon(payload());
  if(!lc.ok){m10cBlock("core data failed validation ("+lc.error+")");cb&&cb(false);return;}
  var env=m10cxEnvelope(uid);
  if(env.st!=="ok"){m10cRemove("dxjournal",uid);cb&&cb(false);return;}
  env.val.localData=lc.canon;
  if(!m10cWrite("displaced",env.val,uid)){m10cBlock("could not record the edited review copy");cb&&cb(false);return;}
  if(!m10cxDxAdvance(j,"k2",null,uid)){cb&&cb(false);return;}
  m10cRemove("dxjournal",uid);
  if(m10cRead("dxjournal",uid).st!=="absent"){m10cBlock("could not clear a finished review record");cb&&cb(false);return;}
  cb&&cb(true);}

/* ---- export gate (M8 Choose-Server standard): delivery-evidenced, bound to
   the CURRENT generation and both copy identities ---- */
function m10cxExportGateOpen(env){
  var x=env&&env.exports;
  if(!(x&&x.serverDone&&x.localDone))return false;
  if(x.localGen!==m10cGen)return false;
  var lc=m10cCanon(payload());
  if(!lc.ok||x.localCanon!==lc.canon)return false;
  if(x.serverCanon!==env.serverData)return false;
  return true;}
function m10cxExport(cb){
  var ctx=m10cCtx();
  if(!m10cCtxOk(ctx)){cb&&cb(false);return;}
  var env=m10cxEnvelope(ctx.uid);
  if(env.st!=="ok"){cb&&cb(false);return;}
  var gen=m10cGen;
  var lc=m10cCanon(payload());
  if(!lc.ok){m10cBlock("core data failed validation ("+lc.error+")");cb&&cb(false);return;}
  var fileLocalCanon=lc.canon,fileServerCanon=env.val.serverData;
  var files=[{name:"conflict-core-local-"+todayISO()+".json",mime:"application/json",
      text:conflictExportText("core-local")},
    {name:"conflict-core-server-"+todayISO()+".json",mime:"application/json",
      text:JSON.stringify({__conflict:"core-server",coreRev:env.val.coreRevSeen,
        data:fileServerCanon?JSON.parse(fileServerCanon):null})}];
  var markDelivered=function(){
    if(!m10cCtxOk(ctx)){cb&&cb(false);return;}
    var lcAfter=m10cCanon(payload());
    if(m10cGen!==gen||!lcAfter.ok||lcAfter.canon!==fileLocalCanon){
      toast("You edited during the export — export again");try{render();}catch(e){}cb&&cb(false);return;}
    var env2=m10cxEnvelope(ctx.uid);
    if(env2.st!=="ok"||env2.val.serverData!==fileServerCanon){
      toast("The review changed during the export — export again");cb&&cb(false);return;}
    env2.val.exports={localGen:gen,localCanon:fileLocalCanon,serverCanon:fileServerCanon,
      serverDone:true,localDone:true};
    if(!m10cWrite("displaced",env2.val,ctx.uid)){m10cBlock("could not record the export");cb&&cb(false);return;}
    toast("Both copies exported");try{render();}catch(e){}cb&&cb(true);};
  var canShare=false;
  try{var fl=files.map(function(f){return new File([f.text],f.name,{type:f.mime});});
    canShare=!!(navigator.canShare&&navigator.canShare({files:fl})&&navigator.share);
    if(canShare){navigator.share({files:fl}).then(markDelivered,
      function(){toast("Share cancelled — the copies have not left the device");cb&&cb(false);});return;}}catch(e){}
  try{files.forEach(function(f,i){setTimeout(function(){repDownloadFile(f);},i*400);});}catch(e){toast("Export failed");cb&&cb(false);return;}
  askConfirm("Two files were downloaded: this device’s copy and the server’s copy. Confirm BOTH are saved somewhere safe — the choice buttons unlock only after that.",markDelivered,{label:"Both files are saved",danger:false});}

/* ---- resolution requires the pen: fence-holding bound to this account ---- */
function m10cxHolder(){
  return M10.holder&&M10.uid===m8Uid()&&performance.now()<M10.deadline;}

/* ---- in-action freshness: fetch, compare against the envelope, drift ->
   envelope refreshed + gate reset + NO action ---- */
function m10cxFreshCheck(ctx,cb){
  pbGetRecord(function(rec,err){
    if(!m10cCtxOk(ctx)){cb(null);return;}
    if(err){toast("No connection — try again");cb(null);return;}
    var env=m10cxEnvelope(ctx.uid);
    if(env.st!=="ok"){cb(null);return;}
    /* Q5 (round-21 ruling 7): the revision is VALIDATED, not defaulted — a
       malformed record must never seed an envelope or a destructive journal */
    var srev=0;
    if(rec){
      if(!(typeof rec.coreRev==="number"&&isFinite(rec.coreRev)&&rec.coreRev>=0&&
           Math.floor(rec.coreRev)===rec.coreRev&&rec.coreRev<=9007199254740991)){
        toast("The server answer was malformed — try again");cb(null);return;}
      srev=rec.coreRev;}
    var scanon=null;
    if(rec&&rec.data!=null){
      var sc=m10cCanon(rec.data);
      if(!sc.ok){m10cBlock("the server core copy failed validation");cb(null);return;}
      scanon=sc.canon;}
    if(srev!==env.val.coreRevSeen||scanon!==env.val.serverData){
      env.val.coreRevSeen=srev;env.val.serverData=scanon;env.val.exports=null;
      if(!m10cWrite("displaced",env.val,ctx.uid)){m10cBlock("could not record the fresher server copy");cb(null);return;}
      toast("The server copy changed — review and export again");
      try{render();}catch(e){}
      cb(null);return;}
    cb({rev:srev,canon:scanon,env:env.val});});}

/* ---- Keep this device's copy: journaled fenced push of the local snapshot ---- */
function m10cxPushMine(){
  var ctx=m10cCtx();
  if(!m10cCtxOk(ctx))return;
  var env=m10cxEnvelope(ctx.uid);
  if(env.st!=="ok")return;
  if(!m10cxExportGateOpen(env.val)){toast("Export both copies first");try{render();}catch(e){}return;}
  if(!m10cxHolder()){toast("Take over as the active writer first");return;}
  var entryFence=M10.fence;
  m10cxFreshCheck(ctx,function(fresh){
    if(!fresh)return;
    /* Q1 (round-21 ruling 3): the pen must still be held — same account,
       same session, unexpired, SAME fence as at action entry — after the
       asynchronous fetch, immediately before the resolution journal */
    if(!m10cxHolder()||M10.fence!==entryFence){
      toast("The active-writer pen changed — take over and review again");return;}
    var lc=m10cCanon(payload());
    if(!lc.ok){m10cBlock("core data failed validation ("+lc.error+")");return;}
    var rid=m10cRequestId();if(!rid)return;
    var j={op:"core-push-mine",phase:"intent",startedAt:Date.now(),
      expect:{expectedRev:fresh.rev,pushedCanon:lc.canon,gen:m10cGen,
        fence:M10.fence,requestId:rid}};
    if(!m10cxDxWrite(j,ctx.uid))return;
    m10cxFinishPushMine(j,ctx.uid,function(ok){
      if(ok){toast("Your copy is now the server copy");}
    },ctx);});}
function m10cxFinishPushMine(j,uid,cb,ctx){
  var e=j.expect;
  if(j.phase==="net-done"||j.phase==="k1"||j.phase==="k2"||j.phase==="k3"){m10cxPushMineComplete(j,uid,cb);return;}
  var pobj;try{pobj=JSON.parse(e.pushedCanon);}catch(ex){pobj=null;}
  if(!pobj){if(m10cQuarantine("dxjournal",uid))m10cBlock("an unreadable review record was preserved");cb&&cb(false);return;}
  var body={subsystem:"core",expectedRev:e.expectedRev,idempotencyKey:e.requestId,
    payload:pobj,clientBuild:(typeof APP_BUILD==="string"?APP_BUILD:"")};
  if(e.fence!==null){body.fence=e.fence;body.deviceId=m10DeviceId();}
  m10cRoute(body).then(function(r){
    if(ctx&&!m10cCtxOk(ctx)){cb&&cb(false);return;}
    var natRes=function(v2){return typeof v2==="number"&&isFinite(v2)&&v2>=0&&Math.floor(v2)===v2&&v2<=9007199254740991;};
    if(r.status===200&&r.body&&r.body.ok===true&&natRes(r.body.newRev)&&r.body.newRev===e.expectedRev+1){
      if(!m10cxDxAdvance(j,"net-done",{newRev:r.body.newRev},uid)){cb&&cb(false);return;}
      m10cxPushMineComplete(j,uid,cb);return;}
    if(r.status===409&&r.body&&r.body.conflict===true){
      /* Q3 (ruling 5): a typed conflict needs a safe serverRev AND a
         payload passing strict canonicalization — anything else is a
         malformed response: the dx journal SURVIVES for replay and the
         preserved server copy is untouched */
      var scOk=null;
      if(natRes(r.body.serverRev)&&r.body.payload!=null){
        var sc=m10cCanon(r.body.payload);
        if(sc.ok)scOk=sc.canon;}
      if(scOk===null){setSync("error","core sync received a malformed response");cb&&cb(false);return;}
      var env=m10cxEnvelope(uid);
      if(env.st==="ok"){
        env.val.coreRevSeen=r.body.serverRev;env.val.serverData=scOk;env.val.exports=null;
        if(!m10cWrite("displaced",env.val,uid)){m10cBlock("could not record the fresher server copy");cb&&cb(false);return;}}
      m10cRemove("dxjournal",uid);
      if(m10cRead("dxjournal",uid).st!=="absent"){m10cBlock("could not clear a finished review record");cb&&cb(false);return;}
      toast("The server changed again — export and choose once more");
      try{render();}catch(ex){}
      cb&&cb(false);return;}
    if(r.status===409&&r.body&&r.body.fenceStale===true){
      /* Q2 (ruling 4): displacement is authoritative ONLY with a typed
         fence; malformed → the journal survives as a recoverable request */
      if(!natRes(r.body.fence)){setSync("error","core sync received a malformed response");cb&&cb(false);return;}
      m10cRemove("dxjournal",uid);
      if(m10cRead("dxjournal",uid).st!=="absent"){m10cBlock("could not clear a finished review record");cb&&cb(false);return;}
      toast("Another device took over — take over again to resolve");
      cb&&cb(false);return;}
    if(r.status===401||r.status===403){
      /* Q4 (ruling 6): cleanup is VERIFIED — a failed removal blocks */
      m10cRemove("dxjournal",uid);
      if(m10cRead("dxjournal",uid).st!=="absent"){m10cBlock("could not clear a finished review record");cb&&cb(false);return;}
      cb&&cb(false);return;}
    /* ambiguity: the dx journal survives for replay-first */
    cb&&cb(false);
  }).catch(function(){cb&&cb(false);});}
function m10cxPushMineComplete(j,uid,cb){
  var e=j.expect;
  if(j.phase==="net-done"){
    if(!m10cWrite("base",{canon:M10C_CANON_VER,rev:e.newRev,body:e.pushedCanon},uid)){m10cBlock("could not record the acknowledged copy");cb&&cb(false);return;}
    if(!m10cxDxAdvance(j,"k1",null,uid)){cb&&cb(false);return;}}
  if(j.phase==="k1"){
    var d=m10cRead("dirty",uid);
    if(d.st==="ok"&&d.val.gen===e.gen){
      m10cRemove("dirty",uid);
      if(m10cRead("dirty",uid).st!=="absent"){m10cBlock("could not clear the unsaved-changes marker");cb&&cb(false);return;}}
    if(!m10cxDxAdvance(j,"k2",null,uid)){cb&&cb(false);return;}}
  if(j.phase==="k2"){
    m10cRemove("displaced",uid);
    if(m10cRead("displaced",uid).st!=="absent"){m10cBlock("could not clear the resolved review");cb&&cb(false);return;}
    if(!m10cxDxAdvance(j,"k3",null,uid)){cb&&cb(false);return;}}
  if(j.phase==="k3"){
    m10cRemove("dxjournal",uid);
    if(m10cRead("dxjournal",uid).st!=="absent"){m10cBlock("could not clear a finished review record");cb&&cb(false);return;}
    try{markDirty(false);setLastSync();setSync("ok");render();}catch(ex){}
    cb&&cb(true);return;}
  cb&&cb(true);}

/* ---- Take the server's copy: destructive, M8 Choose-Server standard ---- */
function m10cxTakeServer(){
  var ctx=m10cCtx();
  if(!m10cCtxOk(ctx))return;
  var env=m10cxEnvelope(ctx.uid);
  if(env.st!=="ok")return;
  if(!m10cxExportGateOpen(env.val)){toast("Export both copies first");try{render();}catch(e){}return;}
  /* NO PEN REQUIRED. Taking the SERVER's copy writes only to this device —
     m10cWrite("base"), load(), markDirty(false) — and never calls a server
     route. Requiring the pen created a genuine deadlock: a read-only device
     with a conflict could not review it, and could not take the pen without
     resolving the review first (Owner, 2026-08-03, iPad: "it tells me i need
     to take the pen first"). Keeping THIS device's copy still requires the
     pen — see m10cxPushMine — because that one does write to the server. */
  if(env.val.serverData===null){toast("The server holds no copy — keep this device’s copy instead");return;}
  var entryHeld=m10cxHolder();
  var entryFence=M10.fence;
  askConfirm("Replace EVERYTHING on this device — weights, food, steps, settings, all of it — with the server’s copy? Your export is the only remaining copy of this device’s data.",function(){
    m10cxFreshCheck(ctx,function(fresh){
      if(!fresh||fresh.canon===null)return;
      /* Q1: if this device HELD the pen at entry, it must still hold the same
         one after both asynchronous boundaries (the confirm pause and the
         fetch). A device that never held it is adopting the server copy
         locally, so there is no authority to revalidate — but it must not have
         GAINED the pen mid-flight either, which would change what this means. */
      if(m10cxHolder()!==entryHeld||(entryHeld&&M10.fence!==entryFence)){
        toast("The active-writer state changed — review again");return;}
      var j={op:"core-take-server",phase:"intent",startedAt:Date.now(),
        expect:{serverRev:fresh.rev,serverCanon:fresh.canon}};
      if(!m10cxDxWrite(j,ctx.uid))return;
      m10cxFinishTakeServer(j,ctx.uid,function(ok){
        if(ok)toast("The server copy is now this device’s copy");
      },ctx);});
  },{label:"Take server copy",danger:true});}
function m10cxFinishTakeServer(j,uid,cb,ctx){
  var e=j.expect;
  if(ctx&&!m10cCtxOk(ctx)){cb&&cb(false);return;}
  if(!ctx&&uid!==m8Uid()){cb&&cb(false);return;}
  var obj;try{obj=JSON.parse(e.serverCanon);}catch(ex){obj=null;}
  if(!obj){if(m10cQuarantine("dxjournal",uid))m10cBlock("an unreadable review record was preserved");cb&&cb(false);return;}
  if(j.phase==="intent"){
    var ser=JSON.stringify(obj);
    try{localStorage.setItem("wl_v1",ser);}catch(ex){m10cBlock("could not store the adopted copy");cb&&cb(false);return;}
    var back;try{back=localStorage.getItem("wl_v1");}catch(ex){back=null;}
    if(back!==ser){m10cBlock("could not verify the adopted copy");cb&&cb(false);return;}
    if(!m10cxDxAdvance(j,"k1",null,uid)){cb&&cb(false);return;}}
  if(j.phase==="k1"){
    if(!m10cWrite("base",{canon:M10C_CANON_VER,rev:e.serverRev,body:e.serverCanon},uid)){m10cBlock("could not record the acknowledged copy");cb&&cb(false);return;}
    if(!m10cxDxAdvance(j,"k2",null,uid)){cb&&cb(false);return;}}
  if(j.phase==="k2"){
    m10cRemove("displaced",uid);
    if(m10cRead("displaced",uid).st!=="absent"){m10cBlock("could not clear the resolved review");cb&&cb(false);return;}
    m10cRemove("dirty",uid);
    if(m10cRead("dirty",uid).st!=="absent"){m10cBlock("could not clear the superseded marker");cb&&cb(false);return;}
    if(!m10cxDxAdvance(j,"k3",null,uid)){cb&&cb(false);return;}}
  if(j.phase==="k3"){
    m10cRemove("dxjournal",uid);
    if(m10cRead("dxjournal",uid).st!=="absent"){m10cBlock("could not clear a finished review record");cb&&cb(false);return;}
    try{load();markDirty(false);setLastSync();setSync("ok");render();}catch(ex){}
    cb&&cb(true);return;}
  cb&&cb(true);}

/* ---- review UI (session wording; whole-snapshot honesty per D8) ---- */
var m10cxOpen=false;
/* Counts alone do not help you choose — two copies can hold the same number of
   entries and differ only in which is NEWER (Owner, 2026-08-04: "it needs the
   time stamp of the last saved states"). Report the newest dated entry on each
   side, and flag which side is ahead. */
function m10cxNewest(o){
  var newest="";
  (o.weights||[]).forEach(function(w){if(w&&w.date&&w.date>newest)newest=w.date;});
  ["food","workouts","steps","notes","sleep","bodyfat","waist","leanmass","ratings","checkins"].forEach(function(k){
    Object.keys(o[k]||{}).forEach(function(d){if(d>newest)newest=d;});});
  return newest||null;
}
function m10cxSummary(canon){
  if(canon===null)return "no copy recorded";
  var o;try{o=JSON.parse(canon);}catch(e){return "unreadable";}
  var days={};["food","workouts","steps","notes","sleep","bodyfat","waist","leanmass"].forEach(function(k){
    Object.keys(o[k]||{}).forEach(function(d){days[d]=1;});});
  var nw=m10cxNewest(o);
  return (o.weights||[]).length+" weigh-ins · "+Object.keys(days).length+" days with entries"+
    (nw?" · newest entry "+fmtShort(parseISO(nw)):" · no dated entries");}
/* which side is ahead, in plain words, or that they match */
function m10cxAheadLine(v){
  var pl=null,ps=null;
  try{pl=v.localData?m10cxNewest(JSON.parse(v.localData)):null;}catch(e){}
  try{ps=v.serverData?m10cxNewest(JSON.parse(v.serverData)):null;}catch(e){}
  if(!pl&&!ps)return "";
  if(pl&&ps&&pl===ps)
    return '<div class="wl-hint" style="margin-top:8px">Both copies reach the same day ('+esc(fmtShort(parseISO(pl)))+
      '), so neither is obviously newer. If they also match above, either choice keeps the same data.</div>';
  var newerServer=(!pl)||(ps&&ps>pl);
  return '<div class="wl-hint" style="margin-top:8px"><b>'+(newerServer?"The server copy":"This device\u2019s copy")+
    ' has the more recent entry</b> ('+esc(fmtShort(parseISO(newerServer?ps:pl)))+' vs '+
    esc(pl&&ps?fmtShort(parseISO(newerServer?pl:ps)):"none")+').</div>';}
/* A read-only device said nothing persistent: the sync dot stayed green (it is
   sync health, not writer status) and the only signal was a toast you had to
   provoke. Owner, 2026-08-03: "a bar that says Another device is already logged
   in. Click here to take over. And a warning that says save any progress on
   other device first." It shows on EVERY tab, not just Home. */
/* Why is this device not syncing? Every silent early-return in autoSync and
   m10cPull, named. The Owner spent tonight guessing at a read-only iPad that
   pulled nothing and showed a stale timestamp; the app knew why and said
   nothing. Read-only: computes a string, changes no state. */
function syncIdleReason(){
  try{
    if(!syncOn())return "not signed in on this device";
    if(typeof ownershipAmbiguous==="function"&&ownershipAmbiguous())
      return "this device holds data that hasn't been matched to your account — sync is paused";
    if(window.m8StorageBlocked)return "storage is blocked on this device";
    var st=m10cState();
    if(st==="dirty"||st==="dirty-unproven"){
      return (typeof M10!=="undefined"&&!M10.holder)
        ? "this device has unsent changes AND another device is the active writer — it cannot upload them, and it will not pull until they are resolved"
        : "this device has unsent changes waiting to upload";
    }
    if(st==="displaced")return "body data needs review before syncing";
    if(st==="dx-recovery")return "preparing the body-data review";
    if(st==="review-pending")return "a sync conflict is waiting to be prepared for review";
    if(st==="corrupt")return "a local sync record is damaged and was preserved for review";
    if(st==="journal-recovery")return "finishing an interrupted sync";
    if(typeof M10!=="undefined"&&!M10.holder)return "read-only: another device is the active writer (pulls still run)";
    return "";
  }catch(e){return "";}
}
/* The review banner used to be injected by WRAPPING view_overview, so it lived
   on the Home tab only and only if that wrapper held. It renders from the shell
   now, on every tab. The Home wrapper stays (harmless, and it keeps the banner
   above Home's own cards); this de-duplicates so it never appears twice. */
function m10cxShellBannerHTML(){
  try{
    if(state.view==="overview")return "";     /* the Home wrapper already places it */
    return m10cxBannerHTML();
  }catch(e){return "";}
}
function m10RoBarHTML(){
  if(typeof M10==="undefined"||!M10.booted)return "";
  if(!syncOn()||!pbUid())return "";
  if(M10.holder)return "";
  if(M10.uid&&M10.uid!==pbUid())return "";
  /* a core review owns the screen when one is open — never stack the two */
  try{var cs=m10cState();if(cs==="displaced"||cs==="dx-recovery"||cs==="review-pending"||cs==="corrupt")return "";}catch(e){}
  var who=(M10.known&&M10.known.deviceName)?esc(M10.known.deviceName):"Another device";
  return '<button class="wl-robar" data-act="m10:takeover">'
    +'<span class="wl-robar-main"><span class="wl-robar-t">'+who+' is already logged in</span>'
    +'<span class="wl-robar-s">Tap to take over. Save any progress on that device first.</span>'
    +(function(){var r=syncIdleReason();
        return (r&&!/^read-only/.test(r))?'<span class="wl-robar-s" style="color:var(--bad)">Sync paused \u2014 '+esc(r)+'</span>':'';})()
    +'</span>'
    +'<span class="wl-robar-go">Take over</span></button>';
}
function m10cxBannerHTML(){
  var st=m10cState();
  /* review-pending used to render NOTHING: the sync dot said "core needs review",
     no banner appeared, sync stopped and logout was blocked — a dead end with no
     control (Owner, 2026-08-03, iPad). It now shows, and offers the promotion
     that boot was supposed to perform. */
  if(st==="review-pending")
    return '<div class="wl-card" style="border-color:var(--bad)"><div class="wl-card-head"><span>Body data needs your review</span></div>'
      +'<div class="wl-hint">This device and your server disagree about your body data. Nothing has been lost — both copies are kept until you choose. Prepare the review to see them side by side.</div>'
      +'<button class="wl-btn wl-btn-primary wl-full" style="margin-top:10px" data-act="m10cx:prepare">Prepare review</button></div>';
  if(st!=="displaced"&&st!=="dx-recovery")return "";
  if(st==="dx-recovery")
    return '<div class="wl-card" style="border-color:var(--bad)"><div class="wl-card-head"><span>Body data needs your review</span></div>'
      +'<div class="wl-hint">Preparing the review — this needs a connection. Nothing has been lost.</div></div>';
  return '<div class="wl-card" style="border-color:var(--bad)"><div class="wl-card-head"><span>Body data needs your review</span></div>'
    +'<div class="wl-hint">This device and your server hold different body data (weights, food, steps, settings). Nothing has been lost — both copies are kept until you decide.</div>'
    +'<button class="wl-btn wl-btn-primary wl-full" style="margin-top:10px" data-act="m10cx:open">Review both copies</button></div>';}
function m10cxViewHTML(){
  if(!m10cxOpen)return "";
  var env=m10cxEnvelope();
  if(env.st!=="ok"){m10cxOpen=false;return "";}
  var v=env.val;
  var exported=m10cxExportGateOpen(v);
  var holder=m10cxHolder();
  var h='<div class="wl-confirm"><div class="wl-confirm-card" style="max-height:82vh;overflow:auto;text-align:left">';
  h+='<div style="font-weight:800;font-size:17px;margin-bottom:6px">Two copies of your body data</div>';
  h+='<div class="wl-hint" style="margin-bottom:10px">Held since '+esc(fmtShort(new Date(v.enteredAt)))+'. Choosing replaces the ENTIRE body-data snapshot on the losing side — weights, food, steps, notes, sleep, settings, everything. Neither is treated as right until you choose.</div>';
  /* Owner request 2026-08-05, from hitting this screen live: say WHEN each
     side was last known good, so "which copy is stale" is answerable from
     the screen instead of from memory. */
  var _ls=(typeof getLastSync==="function")?getLastSync():null;
  h+='<div style="font-size:13px;line-height:1.6;margin-bottom:10px">';
  h+='<b>This device:</b> '+esc(m10cxSummary(v.localData))
    +'<br><span class="wl-hint">last synced '+(_ls?esc(fmtShort(new Date(_ls))+" "+fmtClock(_ls)):"never on this device")+'</span><br>';
  h+='<b>Server:</b> '+esc(m10cxSummary(v.serverData))
    +'<br><span class="wl-hint">'+(v.coreRevSeen!=null?'server revision '+esc(String(v.coreRevSeen)):'revision unknown')
    +' · captured '+esc(fmtShort(new Date(v.enteredAt))+" "+fmtClock(v.enteredAt))+'</span></div>';
  h+=m10cxAheadLine(v);
  if(!holder)h+='<div class="wl-hint" style="margin-bottom:6px">Another session is the active writer — you can still take the SERVER’s copy here; keeping this device’s copy needs the pen.</div>'
    +'<button class="wl-btn wl-btn-primary wl-full" data-act="m10cx:takeover">Take over on this device</button>';
  h+='<button class="wl-btn '+(exported?'wl-btn-ghost':'wl-btn-primary')+' wl-full" style="margin-top:12px" data-act="m10cx:export">'+(exported?'Exported ✓ — export again':'Export both copies first')+'</button>';
  if(!exported)h+='<div class="wl-hint" style="margin-top:6px">Both copies leave the device before any choice — and any new edit asks for a fresh export.</div>';
  /* The UI gate was the SAME for both choices, which re-created the deadlock at
     the button even after m10cxTakeServer stopped demanding the pen: a read-only
     device saw both options greyed and had no way out (Owner, 2026-08-03).
     They are different operations and need different gates.
       keep-mine   -> WRITES TO THE SERVER: export + pen.
       take-server -> installs the server copy LOCALLY: export only. */
  var unlockedMine=exported&&holder;
  var unlockedServer=exported;
  h+='<button class="wl-btn wl-full" style="margin-top:10px;background:var(--accent);color:#fff;border:none'+(unlockedMine?'':';opacity:.4')+'" '+(unlockedMine?'data-act="m10cx:mine"':'disabled')+'>Keep this device’s copy</button>';
  h+='<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px'+(unlockedServer&&v.serverData!==null?'':';opacity:.4')+'" '+(unlockedServer&&v.serverData!==null?'data-act="m10cx:server"':'disabled')+'>Take the server’s copy</button>';
  h+='<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px" data-act="m10cx:close">Decide later</button>';
  return h+'</div></div>';}


/* ---- BLOCK-3 wiring: boot handoff, sync pause, edit refresh, view hooks,
   actions, logout gate. All wrapping — increment-2 code is untouched. ---- */
(function(){
  /* boot: after core recovery, hand terminal acks into the review flow */
  var origCoreBoot=m10cBoot;
  m10cBoot=function(cb){
    /* the generation must be live BEFORE any recovery path — the original
       boot only syncs it on the no-journal path, but resolutions (push-mine
       k2) compare against it */
    try{var d0=m10cRead("dirty");if(d0.st==="ok")m10cGen=Math.max(m10cGen,d0.val.gen);}catch(e){}
    origCoreBoot(function(){m10cxHandoff(function(){cb&&cb();});});};
  /* pull NEVER adopts while a review (or its recovery) is open */
  var origPull=m10cPull;
  m10cPull=function(manual,done){
    var st=m10cState();
    if(st==="displaced"){if(manual)toast("Body data needs review first");done&&done(false);return;}
    if(st==="dx-recovery"){m10cxDxRecover(function(){done&&done(false);});return;}
    origPull(manual,done);};
  /* push pauses the same way (fail closed) */
  var origPush=m10cPush;
  m10cPush=function(manual,done){
    var st=m10cState();
    if(st==="displaced"){if(manual)toast("Body data needs review first");done&&done(false);return;}
    if(st==="dx-recovery"){m10cxDxRecover(function(){done&&done(false);});return;}
    origPush(manual,done);};
  /* editing during review: the envelope's local copy follows the live store */
  var origSave=save;
  save=function(){
    origSave();
    try{if(m10cxEnvelope().st==="ok"&&m10cRead("dxjournal").st==="absent")m10cxRefresh();}catch(e){}};
  /* review overlay + banner (banner rides the overview view) */
  var origViewOverview=view_overview;
  view_overview=function(){return m10cxBannerHTML()+origViewOverview();};
  var origRender=render;
  render=function(){origRender();
    if(m10cxOpen){var d=document.createElement("div");d.id="m10-cx";d.innerHTML=m10cxViewHTML();
      var old=document.getElementById("m10-cx");if(old)old.remove();
      if(d.innerHTML)document.body.appendChild(d);}
    else{var o2=document.getElementById("m10-cx");if(o2)o2.remove();}};
  /* logout: unresolved core review blocks it (ruling 9 — no destructive
     default; M8's own logout gate still runs afterwards for training) */
  var origLogout=pbLogout;
  pbLogout=function(){
    var st=m10cState();
    if(st==="displaced"||st==="dx-recovery"||st==="review-pending"||st==="corrupt"){
      m10cxOpen=(st==="displaced");
      askConfirm("This device and the server disagree about your body data. Review and resolve that first — logout stays off so nothing can be erased.",function(){try{render();}catch(e){}},{label:"Review",danger:false});
      return;}
    origLogout();};
})();
document.addEventListener("click",function(e){
  /* The selector must match EVERY action this handler owns. It filtered for
     the m10cx: prefix only, while the read-only bar's button is
     data-act="m10:takeover" — so that branch below was unreachable and the
     bar's Take over button did nothing, on every build since it was written.
     Found live by the Owner during the .461 canary (2026-08-05): with the
     phone displaced, its only visible path to reclaiming the pen was a dead
     button. (The gate path — tapping any gated action — still offered the
     sheet, which is why earlier takeovers worked.) */
  var el=e.target.closest&&e.target.closest("[data-act^=\"m10cx:\"],[data-act=\"m10:takeover\"]");
  if(!el)return;
  var a=el.getAttribute("data-act");
  if(a==="m10cx:open"){m10cxOpen=true;try{render();}catch(ex){}return;}
  if(a==="m10cx:close"){m10cxOpen=false;try{render();}catch(ex){}return;}
  if(a==="m10cx:export"){m10cxExport();return;}
  if(a==="m10cx:mine"){m10cxPushMine();return;}
  if(a==="m10cx:server"){m10cxTakeServer();return;}
  if(a==="m10cx:prepare"){toast("Preparing the review\u2026");
    m10cxHandoff(function(){var st2=m10cState();
      if(st2==="displaced"){m10cxOpen=true;render();}
      else{render();toast(st2==="review-pending"?"Still preparing \u2014 this needs a connection":"Review state: "+st2);}});return;}
  if(a==="m10cx:takeover"){m10TakeoverSheet();return;}
  if(a==="m10:takeover"){m10TakeoverSheet();return;}
});
/* =============== M10-BLOCK-3-END =============== */