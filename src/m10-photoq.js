/* ================= M10-BLOCK-4: photo operation queue (design v9.1 §5b G4/G5/G6, increment 4) =================
   Authorized round 22 on accepted head b92d418. Every content photo
   mutation rides the account-keyed durable queue `wl_photo_ops__<uid>`:
   entries preserve the FULL operation (add: blob identity+hash+size+meta;
   delete: captured pre-op state; metadata: old+new), are written VERIFIED
   before any network attempt, and clear only on acked, identity-validated
   outcomes. Server transport is the three reviewed transactional routes —
   never raw collection writes. A fenceStale outcome freezes the entry as
   DISPLACED for explicit review whose Apply revalidates the captured server
   identity first (G6). No conflict, displacement, reload, logout, account
   switch, storage failure, or malformed response can silently discard a
   pending operation (round-22 item 5). Caches/object-URLs stay exempt. */
M10C_KINDS.photoops="wl_photo_ops__";

/* single-record read (the tree has idbAll/idbByDate only) */
function idbGetLocal(id){
  return idb().then(function(db){return new Promise(function(res,rej){
    var tx=db.transaction("photos","readonly");
    var rq=tx.objectStore("photos").get(id);
    rq.onsuccess=function(){res(rq.result||null);};
    rq.onerror=function(){rej(rq.error);};});});}

var M10P_STATES=["intent","fetched","blob-ok","acked","local-applied","mapped","displaced","unverified","void"];
var M10P_OPS=["add","delete","meta","adopt"];
function m10pValidateEntry(en){
  if(!en||typeof en!=="object")return "not an object";
  if(M10P_OPS.indexOf(en.op)<0)return "unknown op";
  if(M10P_STATES.indexOf(en.state)<0)return "bad state";
  if(!(typeof en.id==="string"&&en.id.length>0&&en.id.length<=64))return "bad id";
  if(!(typeof en.requestId==="string"&&en.requestId.length>0&&en.requestId.length<=96))return "bad requestId";
  var natOk=function(v){return typeof v==="number"&&isFinite(v)&&v>=0&&Math.floor(v)===v&&v<=9007199254740991;};
  var hexOk=function(v){return typeof v==="string"&&/^[0-9a-f]{64}$/.test(v);};
  var metaOk=function(m){
    if(!m||typeof m!=="object"||Object.getPrototypeOf(m)!==Object.prototype)return false;
    var r=m10cCanon(m);return r.ok;};
  if(en.op==="add"){
    if(!(typeof en.localId==="string"&&en.localId.length>0&&en.localId.length<=96))return "bad localId";
    if(en.state!=="intent"&&en.state!=="void"){
      if(!natOk(en.blobByteLength))return "bad blobByteLength";
      if(!hexOk(en.blobSha256))return "bad blobSha256";}
    if(!metaOk(en.meta))return "bad meta";}
  if(en.exports!==undefined&&en.exports!==null){
    if(!(en.exports&&en.exports.done===true&&hexOk(en.exports.sha256)&&natOk(en.exports.byteLength)))return "bad exports";}
  if(en.resultRecordId!==undefined&&en.resultRecordId!==null){
    if(!(typeof en.resultRecordId==="string"&&en.resultRecordId.length>=10&&en.resultRecordId.length<=32))return "bad resultRecordId";}
  if(en.op==="delete"){
    if(!(typeof en.localId==="string"&&en.localId.length>0))return "bad localId";
    if(!(typeof en.serverId==="string"||en.serverId===null))return "bad serverId";
    if(!metaOk(en.capturedLocalMeta))return "bad capturedLocalMeta";}
  if(en.op==="meta"){
    if(!(typeof en.serverId==="string"&&en.serverId.length>0))return "bad serverId";
    if(!metaOk(en.oldMeta))return "bad oldMeta";
    if(!metaOk(en.newMeta))return "bad newMeta";}
  if(en.op==="adopt"){
    if(!(typeof en.localId==="string"&&en.localId.length>0))return "bad localId";
    if(!(typeof en.serverId==="string"&&en.serverId.length>0))return "bad serverId";
    if(!(typeof en.file==="string"&&en.file.length>0))return "bad file";
    if(!metaOk(en.meta))return "bad meta";
    /* U4: every identity-bearing phase MUST carry the identity recovery
       depends on */
    if(en.state==="fetched"||en.state==="blob-ok"||en.state==="mapped"){
      if(!hexOk(en.blobSha256))return "bad adopt blobSha256";
      if(!(natOk(en.blobByteLength)&&en.blobByteLength>0))return "bad adopt blobByteLength";}}
  return null;}
function m10pRead(uid){
  var r=m10cRead("photoops",uid);
  if(r.st!=="ok")return r;
  if(!Array.isArray(r.val.ops))return {st:"malformed",raw:JSON.stringify(r.val)};
  for(var i=0;i<r.val.ops.length;i++){
    if(m10pValidateEntry(r.val.ops[i]))return {st:"malformed",raw:JSON.stringify(r.val)};}
  return r;}
function m10pWrite(ops,uid){
  for(var i=0;i<ops.length;i++){
    var err=m10pValidateEntry(ops[i]);
    if(err){m10cBlock("refused to write an invalid photo record ("+err+")");return false;}}
  return m10cWrite("photoops",{ops:ops},uid);}
function m10pOps(uid){
  var r=m10pRead(uid);
  return r.st==="ok"?r.val.ops:[];}
function m10pMutate(uid,fn){
  /* verified read-modify-write of the queue; fail closed on any step */
  var r=m10pRead(uid);
  if(r.st==="malformed"){
    if(m10cQuarantine("photoops",uid))m10cBlock("a damaged photo record was preserved and needs review");
    return false;}
  var ops=r.st==="ok"?r.val.ops.slice():[];
  var out=fn(ops);
  if(out===false)return false;
  if(!m10pWrite(ops,uid)){m10cBlock("could not record a photo operation");return false;}
  return true;}
function m10pOpId(){
  var a=new Uint8Array(12);
  if(!((window.crypto||{}).getRandomValues))return null;
  crypto.getRandomValues(a);
  var out="";for(var i=0;i<12;i++)out+="abcdefghijklmnopqrstuvwxyz0123456789"[a[i]%36];
  return "pop-"+out;}
function m10pMetaOf(rec){
  return {kind:rec.kind==="progress"?"progress":"food",
    date:String(rec.date||"").slice(0,10),week:String(rec.week||"").slice(0,10),
    pose:String(rec.pose||"").slice(0,20),meal:String(rec.meal||"").slice(0,20),
    ts:String(rec.ts||"")};}
function m10pSha256(blob){
  return blob.arrayBuffer().then(function(buf){
    return crypto.subtle.digest("SHA-256",buf).then(function(h){
      var b=new Uint8Array(h),s="";
      for(var i=0;i<b.length;i++)s+=("0"+b[i].toString(16)).slice(-2);
      return {hex:s,byteLength:buf.byteLength};});});}

/* ---- typed server-identity validation (round-22 item 6) ---- */
function m10pValidUploadResult(b,expectSha,expectLen){
  return !!b&&b.ok===true&&typeof b.recordId==="string"&&b.recordId.length>=10&&b.recordId.length<=32&&
    !!b.identity&&typeof b.identity==="object"&&
    b.identity.sha256===expectSha&&b.identity.byteLength===expectLen;}
function m10pValidMetaResult(b,serverId){
  return !!b&&b.ok===true&&b.recordId===serverId&&b.applied===true;}
function m10pValidDeleteResult(b,serverId){
  return !!b&&b.ok===true&&b.recordId===serverId&&(b.deleted===true||b.alreadyGone===true);}

/* ---- pen check with entry-fence capture (round-22 item 7) ---- */
function m10pNat(v){return typeof v==="number"&&isFinite(v)&&v>=0&&Math.floor(v)===v&&v<=9007199254740991;}
function m10pPen(){
  return (M10.holder&&M10.uid===m8Uid()&&performance.now()<M10.deadline)?{fence:M10.fence,uid:M10.uid}:null;}

function m10pRoute(pathName,body){
  var h={"Content-Type":"application/json"};var t=pbTok();if(t)h.Authorization=t;
  return fetch(pbBase()+"/api/cf/photos/"+pathName,{method:"POST",headers:h,body:JSON.stringify(body)})
    .then(function(r){return r.json().then(function(j){return {status:r.status,body:j};})
      .catch(function(){return {status:r.status,body:null};});});}
function m10pUploadRoute(en,blob,pen){
  var fd=new FormData();
  var m=en.meta;
  fd.append("localId",en.localId);fd.append("kind",m.kind);fd.append("date",m.date);
  if(m.week)fd.append("week",m.week);if(m.pose)fd.append("pose",m.pose);
  if(m.meal)fd.append("meal",m.meal);fd.append("ts",m.ts);
  fd.append("byteLength",String(en.blobByteLength));
  fd.append("idempotencyKey",en.requestId);
  if(pen){fd.append("fence",String(pen.fence));fd.append("deviceId",m10DeviceId()||"");}
  fd.append("clientBuild",(typeof APP_BUILD==="string"?APP_BUILD:""));
  fd.append("file",blob,(m.pose||m.kind||"photo")+".jpg");
  var h={};var t=pbTok();if(t)h.Authorization=t;
  return fetch(pbBase()+"/api/cf/photos/upload",{method:"POST",headers:h,body:fd})
    .then(function(r){return r.json().then(function(j){return {status:r.status,body:j};})
      .catch(function(){return {status:r.status,body:null};});});}

/* ---- the dispatcher: ONE entry at a time, ctx+fence bound at every
   boundary, with explicit crash phases (round-23 rulings 1-3, 7).
   Phases per op:
     add    : intent → blob-ok → acked(recordId) → mapped → cleared
     delete : intent → acked(typed proof) → local-applied → cleared
     meta   : intent → acked → cleared
     adopt  : intent(identity) → blob-ok → mapped → cleared
   Every phase advance is a VERIFIED queue write; every local mutation is
   preceded by a fresh account+fence check; recovery replays from the
   recorded phase (all replays are idempotent through the ledger). ---- */
var m10pBusy=false;
function m10pFindEntry(ops){
  for(var i=0;i<ops.length;i++){
    var st=ops[i].state;
    if(st==="blob-ok"||st==="fetched"||st==="acked"||st==="local-applied"||st==="mapped")return ops[i];
    if(st==="intent"&&ops[i].op!=="add"&&ops[i].op!=="adopt")return ops[i];
    if(st==="intent"&&(ops[i].op==="add"||ops[i].op==="adopt"))return ops[i];  /* recovery decides */
  }
  return null;}
function m10pDispatch(done){
  var ctx=m10cCtx();
  var fin=function(ok){m10pBusy=false;done&&done(ok);};
  if(m10pBusy||!syncOn()||window.m8StorageBlocked){done&&done(false);return;}
  if(!m10cCtxOk(ctx)){done&&done(false);return;}
  var ops=m10pOps(ctx.uid);
  var en=m10pFindEntry(ops);
  if(!en){done&&done(true);return;}
  /* Round-34 ruling 5: the round-33 `window.__m10pFault` seam is REMOVED. The
     release artifact carries no fault hook. C18 T34 now interrupts the
     retirement from the harness by wrapping this function itself — a
     test-side wrapper over a public global, using the same entry+state the
     dispatcher has already computed. */
  var pen=m10pPen();
  if(!pen){done&&done(false);return;}
  m10pBusy=true;
  var entryFence=pen.fence;
  /* every mutation point re-proves account, session generation AND the same
     fence BEFORE touching the queue or any local store (ruling 2/5) */
  var authOk=function(){
    if(!m10cCtxOk(ctx))return false;
    var p2=m10pPen();
    return !!(p2&&p2.fence===entryFence);};
  var setPhase=function(patch){
    if(!authOk())return false;
    return m10pMutate(ctx.uid,function(ops2){
      var e2=ops2.find(function(x){return x.id===en.id;});
      if(!e2)return false;
      for(var k in patch)e2[k]=patch[k];});};
  var clearEntry=function(){
    if(!authOk())return false;
    return m10pMutate(ctx.uid,function(ops2){
      var k=ops2.findIndex(function(x){return x.id===en.id;});
      if(k>=0)ops2.splice(k,1);});};
  /* durable map write, VERIFIED, before the entry may clear (ruling 1/6) */
  var mapWriteVerified=function(localId,serverId){
    try{
      var m=pbPhotoMap();m[localId]=serverId;setPbPhotoMap(m);
      var back=pbPhotoMap();
      return back[localId]===serverId;
    }catch(e){return false;}};
  var mapClearVerified=function(localId){
    try{
      var m=pbPhotoMap();delete m[localId];setPbPhotoMap(m);
      var back=pbPhotoMap();
      return back[localId]===undefined;
    }catch(e){return false;}};
  var next=function(ok){fin(ok);if(ok)m10pDispatch();};

  /* ---------- add ---------- */
  if(en.op==="add"){
    /* recovery (2026-08-06): an add op for a photo this device has ALREADY
       verifiably uploaded (per its own durable map — written only after a
       validated server ack) is complete by definition. Clear it instead of
       re-uploading; the server rejects duplicate localIds. Restricted to
       pre-ack states — an acked op owns a NEW server id whose map write
       must still land. */
    if(en.state==="intent"||en.state==="blob-ok"){
      var _srv=null;try{_srv=(pbPhotoMap()||{})[en.localId];}catch(e){}
      if(_srv){if(clearEntry())next(true);else fin(false);return;}}
    if(en.state==="intent"){
      /* ruling 3: an intent is NOT dispatchable — resolve its identity first,
         distinguishing "blob present (promote)" from "definitively absent" */
      idbGetLocal(en.localId).then(function(rec){
        if(!authOk()){fin(false);return;}
        if(!rec||!rec.blob){setPhase({state:"void",voidReason:"blob-absent"});fin(false);return;}
        m10pSha256(rec.blob).then(function(idn){
          if(!authOk()){fin(false);return;}
          setPhase({blobSha256:idn.hex,blobByteLength:idn.byteLength,state:"blob-ok"})&&next(true);
        }).catch(function(){fin(false);});
      }).catch(function(){fin(false);});
      return;}
    if(en.state==="blob-ok"){
      idbGetLocal(en.localId).then(function(rec){
        if(!authOk()){fin(false);return;}
        if(!rec||!rec.blob){setPhase({state:"void",voidReason:"blob-absent"});fin(false);return;}
        m10pSha256(rec.blob).then(function(idn){
          if(!authOk()){fin(false);return;}
          if(idn.hex!==en.blobSha256||idn.byteLength!==en.blobByteLength){
            setPhase({state:"void",voidReason:"blob-changed"});fin(false);return;}
          /* Architect ruling 2026-08-07 (P0, send-time metadata integrity):
             the queue means "this photo needs to reach the server" — NOT
             "with the labels it wore when queued". Identity and blob stay
             bound to the op; the MUTABLE labels (date/week/pose/meal) are
             read from the authoritative local record at transmission, so a
             relabel while the op was wedged can never fork local vs server.
             Known narrow edge, fails LOUD not silent: success-then-crash
             followed by a relabel makes the idempotent replay mismatch its
             requestHash and surface a reviewable block. */
          var sendEn={};for(var ek in en)sendEn[ek]=en[ek];
          sendEn.meta=m10pMetaOf(rec);
          m10pUploadRoute(sendEn,rec.blob,{fence:entryFence}).then(function(r){
            if(!authOk()){fin(false);return;}
            if(r.status===200&&m10pValidUploadResult(r.body,en.blobSha256,en.blobByteLength)){
              /* phase: acked — the server id is DURABLE before anything else */
              if(!setPhase({state:"acked",resultRecordId:r.body.recordId})){fin(false);return;}
              if(!authOk()){fin(false);return;}
              if(!mapWriteVerified(en.localId,r.body.recordId)){
                m10cBlock("could not record where a photo was saved");fin(false);return;}
              if(!setPhase({state:"mapped"})){fin(false);return;}
              clearEntry()&&next(true);return;}
            if(r.status===409&&r.body&&r.body.fenceStale===true){
              if(!m10pNat(r.body.fence)){fin(false);return;}
              setPhase({state:"displaced",displacedReason:"fence"});fin(false);
              try{render();}catch(ex){}
              return;}
            if(r.status===409&&r.body&&/reused/.test((r.body.error||""))){
              m10cBlock("a photo request identity was reused");fin(false);return;}
            fin(false);
          }).catch(function(){fin(false);});
        }).catch(function(){fin(false);});
      }).catch(function(){fin(false);});
      return;}
    if(en.state==="acked"){
      /* crash between ack and the durable map: replay the map write only */
      if(!en.resultRecordId){setPhase({state:"blob-ok"});fin(false);return;}
      if(!mapWriteVerified(en.localId,en.resultRecordId)){
        m10cBlock("could not record where a photo was saved");fin(false);return;}
      setPhase({state:"mapped"})&&clearEntry()&&next(true);
      return;}
    if(en.state==="mapped"){clearEntry()&&next(true);return;}
    fin(false);return;}

  /* ---------- adopt (server → this device), journaled (ruling 6) ---------- */
  if(en.op==="adopt"){
    if(en.state==="fetched"){
      /* the fetched server-blob identity is durable; the local write may be
         (re)attempted and verified against it */
      idbGetLocal(en.localId).then(function(existing){
        if(!authOk()){fin(false);return;}
        if(!existing||!existing.blob){
          /* U2 (round-26 ruling 2): the durable identity exists but the local
             blob does not — REFETCH, validate against that identity, and only
             then write. Never park in `fetched` forever. */
          pbFileToken().then(function(tok){
            if(!authOk()){fin(false);return;}
            pbPhotoFetchBlob({id:en.serverId,file:en.file},tok).then(function(b2){
              if(!authOk()){fin(false);return;}
              m10pSha256(b2).then(function(idnR){
                if(!authOk()){fin(false);return;}
                if(idnR.hex!==en.blobSha256||idnR.byteLength!==en.blobByteLength){
                  /* U3: changed server bytes — nothing written, nothing mapped */
                  setPhase({state:"unverified",unverifiedReason:"adopt-server-differs"});fin(false);
                  try{render();}catch(ex){}
                  return;}
                var nrec2={id:en.localId,date:en.meta.date,week:en.meta.week||en.meta.date,
                  pose:en.meta.pose||"",kind:en.meta.kind||"progress",blob:b2,ts:en.meta.ts||Date.now()};
                if(en.meta.meal)nrec2.meal=en.meta.meal;
                idbAddLocal(nrec2).then(function(){
                  if(!authOk()){fin(false);return;}
                  idbGetLocal(en.localId).then(function(back2){
                    if(!authOk()){fin(false);return;}
                    if(!back2||!back2.blob){fin(false);return;}
                    /* the map is written ONLY after the exact bytes are read
                       back and re-verified (ruling 5, last bullet) */
                    m10pSha256(back2.blob).then(function(idnB){
                      if(!authOk()){fin(false);return;}
                      if(idnB.hex!==en.blobSha256||idnB.byteLength!==en.blobByteLength){fin(false);return;}
                      if(!setPhase({state:"blob-ok"})){fin(false);return;}   /* V4 */
                      if(!mapWriteVerified(en.localId,en.serverId)){
                        m10cBlock("could not record where a photo was saved");fin(false);return;}
                      setPhase({state:"mapped"})&&clearEntry()&&next(true);
                    }).catch(function(){fin(false);});
                  }).catch(function(){fin(false);});
                }).catch(function(){fin(false);});
              }).catch(function(){fin(false);});
            }).catch(function(){fin(false);});   /* U3: transient failure keeps the obligation */
          }).catch(function(){fin(false);});
          return;}
        m10pSha256(existing.blob).then(function(idn3){
          if(!authOk()){fin(false);return;}
          if(idn3.hex!==en.blobSha256||idn3.byteLength!==en.blobByteLength){
            setPhase({state:"unverified",unverifiedReason:"adopt-local-differs"});fin(false);
            try{render();}catch(ex){}
            return;}
          if(!setPhase({state:"blob-ok"})){fin(false);return;}   /* V4 */
          if(!mapWriteVerified(en.localId,en.serverId)){
            m10cBlock("could not record where a photo was saved");fin(false);return;}
          setPhase({state:"mapped"})&&clearEntry()&&next(true);
        }).catch(function(){fin(false);});
      }).catch(function(){fin(false);});
      return;}
    if(en.state==="intent"){
      idbGetLocal(en.localId).then(function(existing){
        if(!authOk()){fin(false);return;}
        if(existing){
          /* rulings 3/4: an existing record may be THIS adoption's own blob
             (crash after the local write, before `blob-ok`) or unrelated local
             data. Identity-check it: our own → promote through the mapping
             phase; unrelated → review, never silent cleanup. */
          /* S1 (round-25 ruling 1): at `intent` NO server-blob identity has
             been recorded, so an existing local record can never be PROVEN to
             be this adoption's bytes — it goes to review, never a guess. */
          setPhase({state:"unverified",unverifiedReason:"adopt-local-exists"});fin(false);
          try{render();}catch(ex){}
          return;}
        pbFileToken().then(function(tok){
          if(!authOk()){fin(false);return;}
          pbPhotoFetchBlob({id:en.serverId,file:en.file},tok).then(function(b){
            if(!authOk()){fin(false);return;}
            m10pSha256(b).then(function(idn){
              if(!authOk()){fin(false);return;}
              /* S1: the fetched identity is DURABLE before any local write, so
                 recovery can prove whether an existing blob is this adoption */
              if(!setPhase({state:"fetched",blobSha256:idn.hex,blobByteLength:idn.byteLength})){fin(false);return;}
              var nrec={id:en.localId,date:en.meta.date,week:en.meta.week||en.meta.date,
                pose:en.meta.pose||"",kind:en.meta.kind||"progress",blob:b,ts:en.meta.ts||Date.now()};
              if(en.meta.meal)nrec.meal=en.meta.meal;
              idbAddLocal(nrec).then(function(){
                if(!authOk()){fin(false);return;}
                idbGetLocal(en.localId).then(function(back){
                  if(!authOk()){fin(false);return;}
                  if(!back||!back.blob){fin(false);return;}   /* not durable: retry later */
                  /* V3 (round-27 ruling 3): the READ-BACK bytes are hashed and
                     compared to the durable fetched identity — presence alone
                     is not durability. */
                  m10pSha256(back.blob).then(function(idnB0){
                    if(!authOk()){fin(false);return;}
                    if(idnB0.hex!==idn.hex||idnB0.byteLength!==idn.byteLength){fin(false);return;}
                    /* V4: a failed phase write blocks the map mutation */
                    if(!setPhase({state:"blob-ok"})){fin(false);return;}
                    if(!mapWriteVerified(en.localId,en.serverId)){
                      m10cBlock("could not record where a photo was saved");fin(false);return;}
                    setPhase({state:"mapped"})&&clearEntry()&&next(true);
                  }).catch(function(){fin(false);});
                }).catch(function(){fin(false);});
              }).catch(function(){fin(false);});
            }).catch(function(){fin(false);});
          }).catch(function(){fin(false);});
        }).catch(function(){fin(false);});
      }).catch(function(){fin(false);});
      return;}
    if(en.state==="blob-ok"){
      if(!mapWriteVerified(en.localId,en.serverId)){
        m10cBlock("could not record where a photo was saved");fin(false);return;}
      setPhase({state:"mapped"})&&clearEntry()&&next(true);
      return;}
    if(en.state==="mapped"){clearEntry()&&next(true);return;}
    fin(false);return;}

  /* ---------- meta ---------- */
  if(en.op==="meta"){
    if(en.state==="acked"){clearEntry()&&next(true);return;}
    if(en.state==="intent"){
      /* S2 (ruling 2): the LOCAL side is applied and verified first, in its
         own phase, so a crash on either side leaves a recoverable obligation */
      idbGetLocal(en.localId).then(function(rec){
        if(!authOk()){fin(false);return;}
        if(!rec){setPhase({state:"unverified",unverifiedReason:"meta-local-missing"});fin(false);return;}
        /* 2026-08-06 (Owner: in-app date fixes): apply EVERY relabelable
           field carried by newMeta — meal, date, week, pose — not meal
           alone. The server route always accepted them; the local phase
           was the meal-only bottleneck. ts/kind are never applied. */
        var _mflds=["meal","date","week","pose"];
        var _mwant={};_mflds.forEach(function(k){if(k in en.newMeta)_mwant[k]=String(en.newMeta[k]||"");});
        var _mok=function(r2){return _mflds.every(function(k){return !(k in _mwant)||String(r2[k]||"")===_mwant[k];});};
        if(_mok(rec)){setPhase({state:"local-applied"})&&next(true);return;}
        _mflds.forEach(function(k){if(k in _mwant)rec[k]=_mwant[k];});
        idbAddLocal(rec).then(function(){
          if(!authOk()){fin(false);return;}
          idbGetLocal(en.localId).then(function(back){
            if(!authOk()){fin(false);return;}
            if(!back||!_mok(back)){fin(false);return;}   /* retry next pass */
            setPhase({state:"local-applied"})&&next(true);
          }).catch(function(){fin(false);});
        }).catch(function(){fin(false);});
      }).catch(function(){fin(false);});
      return;}
    m10pRoute("update",{serverId:en.serverId,oldMeta:en.oldMeta,newMeta:en.newMeta,
      idempotencyKey:en.requestId,fence:entryFence,deviceId:m10DeviceId(),
      clientBuild:(typeof APP_BUILD==="string"?APP_BUILD:"")}).then(function(r){
      if(!authOk()){fin(false);return;}
      if(r.status===200&&m10pValidMetaResult(r.body,en.serverId)){
        setPhase({state:"acked"})&&clearEntry()&&next(true);return;}
      if(r.status===404&&r.body&&r.body.notFound===true){
        /* ruling 7: an indistinguishable 404 is not authority — freeze for
           review, change nothing */
        setPhase({state:"unverified",unverifiedReason:"target-not-found"});fin(false);
        try{render();}catch(ex){}
        return;}
      if(r.status===409&&r.body&&r.body.fenceStale===true){
        if(!m10pNat(r.body.fence)){fin(false);return;}
        setPhase({state:"displaced",displacedReason:"fence"});fin(false);
        try{render();}catch(ex){}
        return;}
      fin(false);
    }).catch(function(){fin(false);});
    return;}

  /* ---------- delete ---------- */
  if(en.op==="delete"){
    if(en.state==="local-applied"){
      if(!mapClearVerified(en.localId)){m10cBlock("could not clear a photo mapping");fin(false);return;}
      clearEntry()&&next(true);return;}
    if(en.state==="acked"){
      /* ruling 2: revalidate IMMEDIATELY before the local deletion */
      if(!authOk()){fin(false);return;}
      idbDeleteLocal(en.localId).then(function(){
        if(!authOk()){fin(false);return;}
        if(!setPhase({state:"local-applied"})){fin(false);return;}
        if(!mapClearVerified(en.localId)){m10cBlock("could not clear a photo mapping");fin(false);return;}
        try{if(state.view==="photos")render();}catch(ex){}
        clearEntry()&&next(true);
      }).catch(function(){fin(false);});
      return;}
    if(!en.serverId){
      /* never uploaded: no server authority is needed */
      if(!authOk()){fin(false);return;}
      idbDeleteLocal(en.localId).then(function(){
        setPhase({state:"local-applied"})&&clearEntry()&&next(true);
      }).catch(function(){fin(false);});
      return;}
    m10pRoute("delete",{serverId:en.serverId,capturedIdentity:en.capturedServerIdentity||{},
      idempotencyKey:en.requestId,fence:entryFence,deviceId:m10DeviceId(),
      clientBuild:(typeof APP_BUILD==="string"?APP_BUILD:"")}).then(function(r){
      if(!authOk()){fin(false);return;}
      /* ruling 7: ONLY a typed deletion result (this request's own outcome,
         incl. its ledger replay) authorizes removing the local copy. A bare
         404 — deliberately indistinguishable from a foreign id — does not. */
      if(r.status===200&&m10pValidDeleteResult(r.body,en.serverId)){
        setPhase({state:"acked"})&&next(true);return;}
      if(r.status===404&&r.body&&r.body.notFound===true){
        setPhase({state:"unverified",unverifiedReason:"delete-unproven"});fin(false);
        try{render();}catch(ex){}
        return;}
      if(r.status===409&&r.body&&r.body.fenceStale===true){
        if(!m10pNat(r.body.fence)){fin(false);return;}
        /* ruling 5: capture the AUTHORITATIVE server identity at displacement
           so the later destructive Apply has a pre-image to compare against */
        pbPhotoList().then(function(list){
          var srec=(list||[]).find(function(x){return x.id===en.serverId;});
          var complete=!!(srec&&srec.id&&srec.localId&&srec.file);
          setPhase(complete?{state:"displaced",displacedReason:"fence",
              capturedServerIdentity:{recordId:srec.id,localId:srec.localId,file:srec.file}}
            :{state:"unverified",unverifiedReason:"identity-uncaptured"});
          fin(false);try{render();}catch(ex){}
        }).catch(function(){
          /* the listing failed: no pre-image exists, so this can never become
             a destructive resolution — review instead */
          setPhase({state:"unverified",unverifiedReason:"identity-uncaptured"});
          fin(false);try{render();}catch(ex){}});
        return;}
      fin(false);
    }).catch(function(){fin(false);});
    return;}
  fin(false);}


/* ---- displaced-photo review (G6): Apply revalidates the captured server
   identity; Discard is explicit; nothing auto-applies ---- */
function m10pDisplaced(uid){
  return m10pOps(uid).filter(function(x){
    return x.state==="displaced"||x.state==="unverified"||x.state==="void";});}
/* R1: the photo bytes leave the device (delivery-evidenced) and the athlete
   confirms the EXACT identity before any destructive apply. The evidence is
   bound to the blob's sha256+length, so a changed photo re-arms the gate. */
function m10pExport(opId,cb){
  var ctx=m10cCtx();
  if(!m10cCtxOk(ctx)){cb&&cb(false);return;}
  var en=m10pOps(ctx.uid).find(function(x){return x.id===opId;});
  if(!en){cb&&cb(false);return;}
  idbGetLocal(en.localId).then(function(rec){
    if(!rec||!rec.blob){toast("That photo is no longer on this device");cb&&cb(false);return;}
    m10pSha256(rec.blob).then(function(idn){
      var name="photo-"+(en.capturedLocalMeta&&en.capturedLocalMeta.date||"")+"-"+idn.hex.slice(0,8)+".jpg";
      var mark=function(){
        if(!m10cCtxOk(ctx)){cb&&cb(false);return;}
        if(!m10pMutate(ctx.uid,function(ops){
          var e2=ops.find(function(x){return x.id===opId;});
          if(!e2)return false;
          e2.exports={done:true,sha256:idn.hex,byteLength:idn.byteLength};})){cb&&cb(false);return;}
        toast("Photo exported");try{render();}catch(e){}cb&&cb(true);};
      var canShare=false;
      try{var f=new File([rec.blob],name,{type:rec.blob.type||"image/jpeg"});
        canShare=!!(navigator.canShare&&navigator.canShare({files:[f]})&&navigator.share);
        if(canShare){navigator.share({files:[f],title:"Compound photo"}).then(mark,
          function(){toast("Share cancelled — the photo has not left the device");cb&&cb(false);});return;}}catch(e){}
      try{var url=URL.createObjectURL(rec.blob);var a=document.createElement("a");
        a.href=url;a.download=name;document.body.appendChild(a);a.click();
        setTimeout(function(){try{document.body.removeChild(a);URL.revokeObjectURL(url);}catch(e2){}},400);}
      catch(e){toast("Export failed");cb&&cb(false);return;}
      askConfirm("The photo was downloaded. Confirm it is saved somewhere safe — applying this deletion removes it from this device.",mark,{label:"It is saved",danger:false});
    }).catch(function(){cb&&cb(false);});
  }).catch(function(){cb&&cb(false);});}
function m10pExportGateOpen(en,idn){
  return !!(en.exports&&en.exports.done===true&&idn&&
    en.exports.sha256===idn.hex&&en.exports.byteLength===idn.byteLength);}
function m10pReviewApply(opId){
  var ctx=m10cCtx();
  if(!m10cCtxOk(ctx))return;
  var pen=m10pPen();
  if(!pen){toast("Take over as the active writer first");return;}
  var en=m10pOps(ctx.uid).find(function(x){return x.id===opId&&
    (x.state==="displaced"||x.state==="unverified");});
  if(!en)return;
  var requeue=function(){
    if(!m10pMutate(ctx.uid,function(ops){
      var e2=ops.find(function(x){return x.id===opId&&
        (x.state==="displaced"||x.state==="unverified");});
      if(!e2)return false;
      e2.state="intent";                        /* re-queued; dispatch revalidates */
    }))return;
    m10pDispatch(function(){try{render();}catch(e){}});};
  if(en.op!=="delete"){requeue();return;}       /* add/meta destroy nothing */
  var entryFence=pen.fence;
  /* destructive: export gate + identity-bound confirmation (R1) */
  idbGetLocal(en.localId).then(function(rec){
    if(!rec||!rec.blob){requeue();return;}      /* nothing left to protect */
    m10pSha256(rec.blob).then(function(idn){
      if(!m10pExportGateOpen(en,idn)){toast("Export this photo first");try{render();}catch(e){}return;}
      askConfirm("Delete this photo everywhere? Identity "+idn.hex.slice(0,12)+"… ("+idn.byteLength+" bytes). Your export is the only remaining copy.",function(){
        /* ruling 4: the server record's (id, localId, file) triple must still
           be the SAME before a destructive deletion proceeds */
        pbPhotoList().then(function(list){
          if(!m10cCtxOk(ctx))return;
          var p2=m10pPen();
          if(!p2||p2.fence!==entryFence){toast("The active-writer pen changed — review again");return;}
          var srec=(list||[]).find(function(x){return x.id===en.serverId;});
          var pre=en.capturedServerIdentity||null;
          /* S3 (ruling 3): a COMPLETE pre-displacement identity is required —
             no pre-image means no destructive dispatch, ever */
          var preComplete=!!(pre&&typeof pre.recordId==="string"&&pre.recordId&&
            typeof pre.localId==="string"&&pre.localId&&
            typeof pre.file==="string"&&pre.file);
          var same=preComplete&&!!srec&&srec.localId===en.localId&&
            pre.recordId===srec.id&&pre.localId===srec.localId&&pre.file===srec.file;
          if(!same){
            m10pMutate(ctx.uid,function(ops){
              var e3=ops.find(function(x){return x.id===opId;});
              if(e3){e3.state="unverified";e3.unverifiedReason="server-identity-changed";}});
            toast(preComplete?"That photo is no longer the same on the server — review again"
              :"This photo's server identity was never captured — it cannot be deleted safely");
            try{render();}catch(e){}
            return;}
          /* ruling 6: ONE verified transition carries both the freshly proven
             identity and the resolution state — never two independent writes */
          if(!m10pMutate(ctx.uid,function(ops){
            var e4=ops.find(function(x){return x.id===opId&&
              (x.state==="displaced"||x.state==="unverified");});
            if(!e4)return false;
            e4.capturedServerIdentity={recordId:srec.id,localId:srec.localId,file:srec.file};
            e4.state="intent";})){toast("Couldn’t record the change — try again");return;}
          m10pDispatch(function(){try{render();}catch(e){}});
        }).catch(function(){toast("No connection — try again");});
      },{label:"Delete it",danger:true});
    }).catch(function(){});
  }).catch(function(){});}
function m10pReviewDiscard(opId){
  var ctx=m10cCtx();
  if(!m10cCtxOk(ctx))return;
  askConfirm("Discard this pending photo change? The photo on this device stays exactly as it is now.",function(){
    m10pMutate(ctx.uid,function(ops){
      var k=ops.findIndex(function(x){return x.id===opId&&
        (x.state==="displaced"||x.state==="unverified"||x.state==="void");});
      if(k<0)return false;
      ops.splice(k,1);});
    try{render();}catch(e){}
  },{label:"Discard",danger:true});}
function m10pBannerHTML(){
  var d=m10pDisplaced();
  if(!d.length)return "";
  return '<div class="wl-card" style="border-color:var(--bad)"><div class="wl-card-head"><span>Photo changes need your review</span></div>'
    +'<div class="wl-hint">'+d.length+' photo change'+(d.length===1?'':'s')+' could not sync because another session became the active writer. Nothing has been lost.</div>'
    +d.map(function(en){
      var what=en.op==="add"?("Upload: "+esc((en.meta&&en.meta.kind)||"photo")+" photo from "+esc((en.meta&&en.meta.date)||""))
        :en.op==="delete"?("Delete: photo from "+esc((en.capturedLocalMeta&&en.capturedLocalMeta.date)||""))
        :("Relabel: photo to “"+esc((en.newMeta&&en.newMeta.meal)||"")+"”");
      var exp=en.op==="delete"?('<button class="wl-btn wl-btn-ghost" data-act="m10p:export" data-id="'+esc(en.id)+'">'+(en.exports&&en.exports.done?'Exported \u2713':'Export first')+'</button>'):'';
      return '<div style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap"><span style="flex:1;font-size:13px">'+what+'</span>'
        +exp
        +'<button class="wl-btn wl-btn-ghost" data-act="m10p:apply" data-id="'+esc(en.id)+'">Apply</button>'
        +'<button class="wl-btn wl-btn-ghost" data-act="m10p:discard" data-id="'+esc(en.id)+'">Discard</button></div>';}).join("")
    +'</div>';}


/* (BLOCK-4 wiring is installed LAST, after the M8-era photo wrappers —
   see M10-BLOCK-4-WIRING below; those wrappers assign idbAdd/idbDelete/
   idbClearAll at a later point in the file and would otherwise win.) */
/* =============== M10-BLOCK-4-END (machinery) =============== */