/* ================= M10-BLOCK-1: writer-lease client (design v9.1 §3/§4; round-13 revision) =================
   Increment 1 of the authorized LOCAL client work. MACHINERY ONLY: nothing
   outside the M10 blocks calls m10Gate yet. The fence is the authority;
   deviceId is a copyable label (D10). A persisted grant is NEVER sufficient
   to write after reload (design §4). Round-13 items landed here: lease
   authority is ACCOUNT-BOUND (K1), one reset primitive (K2), settle-before-
   adoption boot contract (K3), conservative send-time deadline (K4),
   validated deviceId (K5), validated informational grant + honest
   diagnostic-write accounting (K6), classified renew outcomes (K7). */
var M10={uid:null,fence:0,holder:false,deadline:0,known:null,corrupt:false,
  ttlMs:24*3600*1000,timer:null,booted:false,revokeReason:null,grantWriteFailed:false,
  gen:0};   /* L2: the session/operation generation — stale-response guard */

/* K2: THE reset primitive — clears every piece of in-memory authority and the
   account binding. Corruption is deliberately NOT cleared here: it marks
   installation-wide storage damage, not session state. */
function m10Reset(reason){
  M10.gen++;                                  /* L2: supersedes every in-flight response */
  M10.uid=null;M10.fence=0;M10.holder=false;M10.deadline=0;M10.known=null;
  M10.revokeReason=reason||null;M10.grantWriteFailed=false;
  if(M10.timer){clearInterval(M10.timer);M10.timer=null;}
}

/* K5: stable per-install id — crypto-random, exact grammar, verified write;
   malformed EXISTING bytes are corruption, never silently replaced. */
var M10_DEVID_RE=/^dev-[a-z0-9]{24}$/;
function m10DeviceId(){
  try{
    var id=localStorage.getItem("wl_m10_deviceid");
    if(id!=null){
      if(typeof id==="string"&&M10_DEVID_RE.test(id))return id;
      M10.corrupt=true;return null;                 /* malformed existing id */
    }
    /* L3: crypto-random ONLY. No fallback: without getRandomValues the
       identity contract cannot be met — fail closed, create and persist
       nothing, attempt no acquire (the caller stays read-only). */
    if(!((window.crypto||{}).getRandomValues))return null;
    var a=new Uint8Array(24),chars="abcdefghijklmnopqrstuvwxyz0123456789",out="";
    crypto.getRandomValues(a);
    for(var i=0;i<24;i++)out+=chars[a[i]%36];
    id="dev-"+out;
    if(!M10_DEVID_RE.test(id))return null;
    localStorage.setItem("wl_m10_deviceid",id);
    if(localStorage.getItem("wl_m10_deviceid")!==id)return null;
    return id;
  }catch(e){return null;}
}
function m10DeviceName(){
  var ua=navigator.userAgent||"";
  if(/iPad/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1))return "iPad";
  if(/iPhone/.test(ua))return "iPhone";
  if(/Android/.test(ua))return "Android";
  if(/Macintosh/.test(ua))return "Mac";
  return "Browser";
}
function m10GrantKey(uid){return "wl_m10_grant__"+(uid||pbUid());}
/* K6: the persisted copy is INFORMATIONAL — never restores authority — but a
   malformed one still evidences storage damage (corrupt). Strict shape:
   safe nonneg integer fence, deviceId matching THIS verified installation,
   owner uid + mark, finite bounded ttl and server timestamp. */
var M10_GRANT_MARK="m10.1";
function m10ValidGrant(g,uid,dev){
  return !!g&&typeof g==="object"&&g.mark===M10_GRANT_MARK&&g.uid===uid&&
    typeof g.fence==="number"&&isFinite(g.fence)&&g.fence>=0&&Math.floor(g.fence)===g.fence&&g.fence<=9007199254740990&&
    typeof g.deviceId==="string"&&g.deviceId===dev&&
    typeof g.ttlMs==="number"&&isFinite(g.ttlMs)&&g.ttlMs>0&&g.ttlMs<=7*24*3600*1000&&
    typeof g.grantedServerNow==="number"&&isFinite(g.grantedServerNow);
}
function m10ReadGrant(uid,dev){
  try{
    var raw=localStorage.getItem(m10GrantKey(uid));
    if(raw==null)return null;
    var g=JSON.parse(raw);
    if(!m10ValidGrant(g,uid,dev)){M10.corrupt=true;return null;}
    return g;
  }catch(e){M10.corrupt=true;return null;}
}
function m10WriteGrant(g){
  try{
    var k=m10GrantKey(g.uid),v=JSON.stringify(g);
    localStorage.setItem(k,v);
    return localStorage.getItem(k)===v;
  }catch(e){return false;}
}
function m10LeaseCall(op,extra){
  var b={op:op,deviceId:m10DeviceId(),deviceName:m10DeviceName()};
  if(extra)for(var k in extra)b[k]=extra[k];
  var h={"Content-Type":"application/json"};var t=pbTok();if(t)h.Authorization=t;
  return fetch(pbBase()+"/api/cf/writer/lease",{method:"POST",headers:h,body:JSON.stringify(b)})
    .then(function(r){return r.json().then(function(j){return {status:r.status,body:j};}).catch(function(){return {status:r.status,body:null};});});
}
/* K4/K6: validate the grant RESPONSE before applying; the monotonic deadline
   derives from the SEND time t0, so local authority ends no later than the
   server's expiry (the full round trip is subtracted, conservatively). */
function m10ValidGrantBody(b,dev){
  return !!b&&b.ok===true&&
    typeof b.fence==="number"&&isFinite(b.fence)&&b.fence>=1&&Math.floor(b.fence)===b.fence&&b.fence<=9007199254740990&&
    typeof b.ttlMs==="number"&&isFinite(b.ttlMs)&&b.ttlMs>0&&b.ttlMs<=7*24*3600*1000&&
    typeof b.serverNow==="number"&&isFinite(b.serverNow)&&
    b.holderDeviceId===dev;
}
/* L5: the typed held-409 shape — anything else is malformed, never
   authoritative takeover information. */
function m10ValidHeldBody(b){
  return !!b&&b.held===true&&
    typeof b.fence==="number"&&isFinite(b.fence)&&b.fence>=0&&Math.floor(b.fence)===b.fence&&b.fence<=9007199254740990&&
    typeof b.ttlMs==="number"&&isFinite(b.ttlMs)&&b.ttlMs>0&&b.ttlMs<=7*24*3600*1000&&
    typeof b.serverNow==="number"&&isFinite(b.serverNow)&&
    typeof b.holderDeviceId==="string"&&b.holderDeviceId.length>0&&b.holderDeviceId.length<=128&&
    (b.deviceName==null||typeof b.deviceName==="string");
}
function m10ApplyGrant(body,uid,t0){
  var dev=m10DeviceId();
  if(!dev||!m10ValidGrantBody(body,dev))return false;
  M10.uid=uid;M10.fence=body.fence;M10.holder=true;M10.revokeReason=null;
  M10.deadline=t0+body.ttlMs;
  M10.known=body;
  /* informational persisted copy; a failed write is recorded HONESTLY as a
     diagnostic-write failure — it does not revoke the in-session grant, and
     nothing calls this a verified apply (K6). */
  M10.grantWriteFailed=!m10WriteGrant({mark:M10_GRANT_MARK,uid:uid,fence:body.fence,
    deviceId:dev,grantedServerNow:body.serverNow,ttlMs:body.ttlMs});
  return true;
}
/* K1/K3: boot (returns a promise that SETTLES the lease before any adoption —
   the boot wiring awaits it). Synchronously revokes any prior authority
   before network activity; the async result applies only if the account is
   still the one this boot started for. */
function m10Boot(){
  m10Reset("boot");                            /* bumps gen: supersedes prior ops */
  if(!syncOn())return Promise.resolve();
  M10.booted=true;
  var uid=pbUid(),g=M10.gen;
  var dev=m10DeviceId();
  if(!uid||!dev){M10.corrupt=M10.corrupt||!dev;return Promise.resolve();}
  m10ReadGrant(uid,dev);                      /* corruption detection only */
  if(M10.corrupt)return Promise.resolve();
  var t0=performance.now();
  return m10LeaseCall("acquire",{}).then(function(r){
    if(M10.gen!==g){return;}                  /* L2: superseded — install nothing, revoke nothing */
    if(pbUid()!==uid){m10Reset("account-changed");return;}
    if(r.status===200&&m10ApplyGrant(r.body,uid,t0)){m10StartTimer();}
    else if(r.status===409&&r.body&&r.body.held===true){
      M10.uid=uid;M10.holder=false;M10.fence=0;
      if(m10ValidHeldBody(r.body)){M10.known=r.body;}
      else{M10.known=null;M10.revokeReason="malformed-response";}   /* L5 */
    }
    else{M10.uid=uid;M10.holder=false;M10.revokeReason="acquire-failed";}
  }).catch(function(){if(M10.gen===g&&pbUid()===uid){M10.uid=uid;M10.holder=false;M10.revokeReason="offline";}});
}
/* K7: renewal outcomes are CLASSIFIED. Typed stale (409 stale:true), auth
   failure (401/403 → full reset per K2), malformed body, server error — all
   revoke immediately (conservative), each with its reason recorded. Only a
   TRANSPORT failure retains authority, and only until the unchanged
   deadline. A valid 200 extends from ITS OWN send time. */
function m10Renew(){
  if(!M10.holder||M10.uid!==pbUid())return Promise.resolve(false);
  var uid=M10.uid,g=M10.gen,fence=M10.fence,dev=m10DeviceId(),t0=performance.now();
  if(!dev)return Promise.resolve(false);
  return m10LeaseCall("renew",{fence:fence}).then(function(r){
    if(M10.gen!==g)return false;              /* L2: a newer op/reset owns the state now */
    if(pbUid()!==uid){m10Reset("account-changed");return false;}
    /* L4: the SAME strict validator as acquire/steal — including
       holderDeviceId === this installation and finite serverNow — plus the
       unchanged-fence requirement. */
    if(r.status===200&&m10ValidGrantBody(r.body,dev)&&r.body.fence===fence){
      M10.deadline=t0+r.body.ttlMs;
      return true;
    }
    if(r.status===401||r.status===403){m10Reset("auth-failed");return false;}
    M10.holder=false;M10.known=null;
    M10.revokeReason=(r.status===409&&r.body&&r.body.stale===true)?"stale"
      :(r.status===200?"malformed-response":"server-error");
    return false;
  }).catch(function(){
    return M10.gen===g&&M10.holder&&M10.uid===pbUid()&&performance.now()<M10.deadline;
  });
}
function m10StartTimer(){
  if(M10.timer)clearInterval(M10.timer);
  M10.timer=setInterval(function(){
    if(document.visibilityState==="visible"&&M10.holder)m10Renew();
  },5*60*1000);
}
document.addEventListener("visibilitychange",function(){
  if(document.visibilityState!=="visible"||!M10.booted)return;
  if(M10.holder){m10Renew();return;}
  /* A NON-HOLDER used to do nothing here, so a read-only device never refreshed
     again after boot — the other device's changes never arrived (Owner,
     2026-08-03). Reading is always allowed under STRICT, so pull. */
  if(syncOn()&&pbUid()){try{m10RoRefresh();}catch(e){}}
});
/* pull-only refresh for a read-only device: re-checks the lease (so it notices
   the pen being released) and pulls. It never writes. */
var _m10RoLast=0;
function m10RoRefresh(force){
  if(!syncOn()||!pbUid()||M10.holder)return;
  var now=Date.now();
  if(!force&&now-_m10RoLast<20000)return;      /* not on every flicker */
  _m10RoLast=now;
  m10LeaseCall("status",{}).then(function(r){
    if(!syncOn()||!pbUid())return;
    if(r.status===200&&r.body&&m10ValidHeldBody(r.body))M10.known=r.body;
    try{autoSync();}catch(e){}
  }).catch(function(){});
}
/* and on a timer, so a device left open on the counter still catches up */
setInterval(function(){
  if(document.visibilityState==="visible"&&M10.booted&&!M10.holder)m10RoRefresh();
},60*1000);
function m10TakeoverSheet(){
  var name=(M10.known&&M10.known.deviceName)?('"'+M10.known.deviceName+'"'):"another session";
  askConfirm("Another session is the active writer ("+name+"). Take over on this device?",function(){
    var uid=pbUid(),g=++M10.gen,t0=performance.now();   /* L2: this op supersedes prior in-flight ops */
    m10LeaseCall("steal",{}).then(function(r){
      if(M10.gen!==g)return;                  /* a newer takeover/reset superseded this one */
      if(pbUid()!==uid){m10Reset("account-changed");return;}
      if(r.status===200&&m10ApplyGrant(r.body,uid,t0)){
        m10StartTimer();
        /* Owner, 2026-08-03: "when you say take over on this device, it needs to
           refresh the data first" — he took over on the iPad and saw stale data
           because taking the pen never pulled. Pull immediately, and say so. */
        toast("This device is now the active writer — refreshing\u2026");render();
        try{autoSync();}catch(e){}
      }else toast("Could not take over");
    }).catch(function(){if(M10.gen===g)toast("Offline \u2014 taking over needs a connection");});
  },{label:"Take over",danger:false});
}
/* K1: the gate requires the account binding, always. */
function m10Gate(tag){
  if(!syncOn())return true;
  if(M10.corrupt){toast("Sync identity problem \u2014 this device is read-only");return false;}
  if(M10.holder&&M10.uid===pbUid()&&performance.now()<M10.deadline)return true;
  m10TakeoverSheet();
  return false;
}
/* =============== M10-BLOCK-1-END =============== */

/* ================= M10-BLOCK-2: core durability protocol (design v9.1 §2, increment 2) =================
   Authorized round 16 ruling 7 on authority head 3e7a0d0. Account-bound
   wl_core_dirty/base/ack journals with M8-grade verified writes, fenced
   route commits, replay-first recovery, the G9/G10 bootstrap, and adoption
   postconditions. Ruling 8 honored: NO dispatcher gating here — this block
   owns the core sync TRANSPORT (cloudPush/cloudPull are overridden in the
   wiring section below), nothing else. Displaced/conflict REVIEW UI is
   increment 3: this increment preserves every byte (dirty + terminal
   journal) and blocks core sync pending that review. Reuses the proven M8
   canonicalization functions verbatim (no M8 code is modified). */
var M10C_MARK="m10.1", M10C_CANON_VER=1;
/* Core canonicalization: the JSON projection, then sorted-key serialization.
   Core state legitimately carries undefined-valued properties in memory
   (e.g. tag fields); JSON.stringify has ALWAYS dropped them on the wire and
   in wl_v1 — the server has never seen them. Canonicalizing the JSON
   round-trip therefore matches the historical wire truth exactly; it is not
   coercion of persisted data. Circular/unserializable structures still fail
   closed. */
/* N8: validate the ORIGINAL graph before projecting. `undefined` is allowed
   ONLY as an object-property omission (the historical JSON projection);
   every other lossy category fails closed: undefined/holes in arrays,
   non-finite numbers, functions, symbols, BigInt, cycles, non-plain
   objects. Returns the projected value alongside the error channel. */
function m10cCanonWalk(v,path,seen){
  var t=typeof v;
  if(v===null||t==="string"||t==="boolean")return {ok:true,out:v};
  if(t==="number")return isFinite(v)?{ok:true,out:v}:{ok:false,error:path+": non-finite number"};
  if(t==="function"||t==="symbol"||t==="bigint")return {ok:false,error:path+": "+t};
  if(t==="undefined")return {ok:false,error:path+": undefined"};
  if(t==="object"){
    if(seen.indexOf(v)>=0)return {ok:false,error:path+": cycle"};
    seen.push(v);
    var r;
    if(Array.isArray(v)){
      var arr=[];
      for(var i=0;i<v.length;i++){
        if(!(i in v))return {ok:false,error:path+"["+i+"]: hole"};
        if(v[i]===undefined)return {ok:false,error:path+"["+i+"]: undefined"};
        r=m10cCanonWalk(v[i],path+"["+i+"]",seen);
        if(!r.ok)return r;
        arr.push(r.out);}
      seen.pop();return {ok:true,out:arr};}
    /* P1 (round-18 ruling 3): a REAL plain-object check. Core data comes
       from JSON.parse, whose objects always have Object.prototype — class
       instances, custom prototypes, AND null-prototype objects all fail
       closed (the null-prototype rejection is the documented decision:
       nothing legitimate produces one in this store). */
    if(Object.getPrototypeOf(v)!==Object.prototype)
      return {ok:false,error:path+": non-plain object"};
    var o={};
    for(var k in v){
      if(!Object.prototype.hasOwnProperty.call(v,k))continue;
      if(v[k]===undefined)continue;                /* the ONE permitted omission */
      r=m10cCanonWalk(v[k],path+"."+k,seen);
      if(!r.ok)return r;
      o[k]=r.out;}
    seen.pop();return {ok:true,out:o};}
  return {ok:false,error:path+": unsupported type "+t};}
function m10cCanon(v){
  if(v===null||typeof v!=="object"||Array.isArray(v))return {ok:false,error:"$: root must be an object"};
  var r=m10cCanonWalk(v,"$",[]);
  if(!r.ok)return r;
  return {ok:true,canon:m8CanonSerialize(r.out)};}
var M10C_KINDS={dirty:"wl_core_dirty__",base:"wl_core_base__",journal:"wl_core_ack_journal__"};
function m10cKey(kind,uid){return M10C_KINDS[kind]+(uid||m8Uid());}
var m10cHardBlocked=false,m10cUnprovenBlocked=false,m10cBlockReason="";
/* the SHARED fail-closed union (design: block classes shared): extend the
   existing m8StorageBlocked getter so EITHER subsystem's hard/soft block
   halts both engines — an override inside the M10 block, no M8 edits. */
Object.defineProperty(window,"m8StorageBlocked",{configurable:true,
  get:function(){return m8HardBlocked||m8UnprovenBlocked||m10cHardBlocked||m10cUnprovenBlocked;}});
function m10cBlock(reason){m10cHardBlocked=true;m10cBlockReason=reason;
  try{setSync("error","sync paused \u2014 "+reason);}catch(e){}}
function m10cSoftBlock(reason){m10cUnprovenBlocked=true;m10cBlockReason=reason;
  try{setSync("error","sync paused \u2014 "+reason);}catch(e){}}
function m10cReleaseUnprovenIfProven(){
  if(!m10cUnprovenBlocked)return;
  var d=m10cRead("dirty");
  if(d.st==="absent"||(d.st==="ok"&&d.val.persistedGen===d.val.gen))m10cUnprovenBlocked=false;}

function m10cRead(kind,uid){
  uid=uid||m8Uid();if(!uid)return {st:"absent"};
  var raw;
  try{raw=localStorage.getItem(m10cKey(kind,uid));}
  catch(e){m10cBlock("storage unreadable");return {st:"malformed"};}
  if(raw==null)return {st:"absent"};
  var v;try{v=JSON.parse(raw);}catch(e){return {st:"malformed",raw:raw};}
  if(!v||typeof v!=="object"||v.owner!==uid||v.mark!==M10C_MARK)return {st:"malformed",raw:raw};
  return {st:"ok",val:v};}
function m10cWrite(kind,obj,uid){
  uid=uid||m8Uid();if(!uid)return false;
  obj.owner=uid;obj.mark=M10C_MARK;
  var ser;try{ser=JSON.stringify(obj);}catch(e){return false;}
  try{localStorage.setItem(m10cKey(kind,uid),ser);}catch(e){return false;}
  var back;try{back=localStorage.getItem(m10cKey(kind,uid));}catch(e){return false;}
  return back===ser;}
function m10cRemove(kind,uid){uid=uid||m8Uid();try{localStorage.removeItem(m10cKey(kind,uid));}catch(e){}
  try{return localStorage.getItem(m10cKey(kind,uid))==null;}catch(e){return false;}}
function m10cQuarantine(kind,uid){
  uid=uid||m8Uid();if(!uid)return false;
  var orig;
  try{orig=localStorage.getItem(m10cKey(kind,uid));}
  catch(e){m10cBlock("storage unreadable during preservation");return false;}
  if(orig==null)return true;
  var qk,n=0;
  do{qk="wl_core_corrupt__"+uid+"."+kind+"."+Date.now()+"."+n;n++;}
  while((function(){try{return localStorage.getItem(qk)!=null;}catch(e){return true;}})()&&n<50);
  try{localStorage.setItem(qk,orig);}catch(e){m10cBlock("storage full while preserving a damaged record");return false;}
  var back;try{back=localStorage.getItem(qk);}catch(e){back=null;}
  if(back!==orig){m10cBlock("could not verify a preserved copy");return false;}
  try{localStorage.removeItem(m10cKey(kind,uid));}catch(e){}
  var gone;try{gone=localStorage.getItem(m10cKey(kind,uid))==null;}catch(e){gone=false;}
  if(!gone){m10cBlock("could not clear a damaged record after preserving it");return false;}
  return true;}

/* ---- journal validation (operation-aware, M8 R15 standard) ---- */
var M10C_J_PHASES={"core-ack":["intent","net-done","k1","k2","done"],
  "core-bootstrap":["intent","done"],
  "core-adopt":["intent","k1","k2","done"]};
var M10C_J_OUTCOMES=["conflict","fence-displaced","auth","bootstrap-conflict"];
function m10cValidateJournal(j){
  if(!j||typeof j!=="object")return "not an object";
  var ph=M10C_J_PHASES[j.op];
  if(!ph)return "unknown op";
  if(ph.indexOf(j.phase)<0)return "impossible phase for op";
  if(!(typeof j.startedAt==="number"&&isFinite(j.startedAt)&&j.startedAt>=0))return "bad startedAt";
  var e=j.expect;
  if(!e||typeof e!=="object")return "missing expect";
  /* round-19 ruling 4: a GENUINE safe-integer predicate — stored terminal
     records must never carry a value that cannot be represented exactly */
  var natOk=function(v){return typeof v==="number"&&isFinite(v)&&v>=0&&Math.floor(v)===v&&v<=9007199254740991;};
  var canonOk=function(v,allowNull){
    if(v===null)return !!allowNull;
    if(typeof v!=="string")return false;
    try{var o=JSON.parse(v);return !!o&&typeof o==="object"&&!Array.isArray(o);}catch(ex){return false;}};
  if(j.op==="core-ack"){
    if(!canonOk(e.oldBaseCanon,true))return "bad oldBaseCanon";
    if(!natOk(e.expectedRev))return "bad expectedRev";
    if(!canonOk(e.pushedCanon))return "bad pushedCanon";
    if(!natOk(e.gen))return "bad gen";
    if(!(e.fence===null||natOk(e.fence)))return "bad fence";
    if(!(typeof e.requestId==="string"&&e.requestId.length>0&&e.requestId.length<=96))return "bad requestId";
    if(j.phase==="net-done"||j.phase==="k1"||j.phase==="k2"){if(!natOk(e.newRev))return "bad newRev";}
    if(j.phase==="done"&&j.outcome!==undefined){
      if(M10C_J_OUTCOMES.indexOf(j.outcome)<0)return "bad outcome";
      /* P3 (round-18 ruling 5): terminal payloads are TYPED — increment 3
         consumes these records and must never meet a malformed one. */
      if(j.outcome==="conflict"&&!natOk(e.serverRev))return "bad conflict serverRev";
      if(j.outcome==="fence-displaced"&&!natOk(e.staleFence))return "bad staleFence";}}
  if(j.op==="core-bootstrap"){
    if(!natOk(e.serverRev))return "bad serverRev";
    if(!canonOk(e.serverCanon,true))return "bad serverCanon";}
  if(j.op==="core-adopt"){
    if(!natOk(e.serverRev))return "bad serverRev";
    if(!canonOk(e.serverCanon))return "bad serverCanon";}
  return null;}
function m10cJournalWrite(j,uid){
  var err=m10cValidateJournal(j);
  if(err){m10cBlock("refused to write an invalid core journal ("+err+")");return false;}
  return m10cWrite("journal",j,uid||j.owner);}
function m10cJournalAdvance(j,phase,extra,uid){
  j.phase=phase;
  if(extra)for(var k in extra)j.expect[k]=extra[k];
  return m10cJournalWrite(j,uid||j.owner);}

/* ---- dirty generation with verified persistence proof ---- */
var m10cGen=0;
function m10cMarkDirty(){
  m10cGen++;
  var uid=m8Uid();if(!uid)return;
  if(!m10cWrite("dirty",{gen:m10cGen,persistedGen:-1,ts:Date.now()}))
    m10cSoftBlock("could not record an unsaved-changes marker");}
function m10cProveGen(){
  var uid=m8Uid();if(!uid)return;
  var d=m10cRead("dirty");
  if(d.st!=="ok")return;
  if(d.val.gen!==m10cGen)return;                 /* a newer edit owns the marker */
  d.val.persistedGen=d.val.gen;
  if(m10cWrite("dirty",d.val))m10cReleaseUnprovenIfProven();
  else m10cSoftBlock("could not verify the unsaved-changes marker");}

/* ---- G9: the exact content-only emptiness predicate ---- */
function m10cLocalEmpty(p){
  var zk=function(o){return !o||Object.keys(o).length===0;};
  var g=p.glp||{};
  return (p.weights||[]).length===0&&zk(p.food)&&zk(p.workouts)&&zk(p.steps)&&
    zk(p.notes)&&zk(p.sleep)&&zk(p.bodyfat)&&zk(p.waist)&&zk(p.leanmass)&&
    (p.statuses||[]).length===0&&
    ((g.doses||[]).length===0&&(g.symptoms||g.symptomLog||[]).length===0);}

/* ---- N1/N4: immutable per-operation account context ----
   Captured at operation start; EVERY asynchronous continuation verifies it
   (uid AND the session generation — A\u2192B\u2192A yields a new generation, so a
   response from the original A session can never complete under the new
   one). On mismatch: discard the response, touch NOTHING — a surviving
   journal replays under its own account's next session. */
function m10cCtx(){return {uid:m8Uid(),gen:M10.gen};}
function m10cCtxOk(ctx){return !!ctx&&!!ctx.uid&&ctx.uid===m8Uid()&&ctx.gen===M10.gen;}

/* ---- states derived from KEYS (never phase alone) ---- */
function m10cState(){
  var j=m10cRead("journal");
  if(j.st==="malformed")return "corrupt";
  if(j.st==="ok"&&j.val.phase==="done"&&j.val.outcome)return "review-pending";
  if(j.st==="ok")return "journal-recovery";
  var b=m10cRead("base");
  if(b.st==="malformed")return "corrupt";
  var d=m10cRead("dirty");
  if(d.st==="malformed")return "corrupt";
  if(b.st==="absent")return "bootstrap";
  if(d.st==="ok")return (d.val.persistedGen===d.val.gen)?"dirty":"dirty-unproven";
  return "clean";}

/* ---- the fenced route commit ---- */
function m10cRoute(body){
  var h={"Content-Type":"application/json"};var t=pbTok();if(t)h.Authorization=t;
  return fetch(pbBase()+"/api/cf/appdata/commit",{method:"POST",headers:h,body:JSON.stringify(body)})
    .then(function(r){return r.json().then(function(j){return {status:r.status,body:j};})
      .catch(function(){return {status:r.status,body:null};});});}
function m10cRequestId(){
  var a=new Uint8Array(24);
  if(!((window.crypto||{}).getRandomValues))return null;
  crypto.getRandomValues(a);
  var out="";for(var i=0;i<24;i++)out+="abcdefghijklmnopqrstuvwxyz0123456789"[a[i]%36];
  return "m10c-"+out;}

/* Completion of a landed commit from journal j (phases net-done→k1→k2→done).
   Every advance is a verified write; failures block, never lose. */
function m10cComplete(j,cb,uid){
  /* N2: uid is the JOURNAL's validated owner, threaded explicitly — the
     current session is never consulted here. */
  uid=uid||j.owner;
  var e=j.expect;
  if(j.phase==="net-done"){
    if(!m10cWrite("base",{canon:M10C_CANON_VER,rev:e.newRev,body:e.pushedCanon},uid)){m10cBlock("could not record the acknowledged copy");cb&&cb(false);return;}
    var b=m10cRead("base",uid);
    if(!(b.st==="ok"&&b.val.rev===e.newRev&&b.val.body===e.pushedCanon)){m10cBlock("could not verify the acknowledged copy");cb&&cb(false);return;}
    if(!m10cJournalAdvance(j,"k1",null,uid)){m10cBlock("could not verify the base phase");cb&&cb(false);return;}}
  if(j.phase==="k1"){
    var d=m10cRead("dirty",uid);
    if(d.st==="ok"&&d.val.gen===e.gen){
      m10cRemove("dirty",uid);
      var dNow=m10cRead("dirty",uid);
      if(dNow.st!=="absent"){m10cBlock("could not clear the unsaved-changes marker");cb&&cb(false);return;}}
    /* newer-generation arm: base advanced, dirty (newer gen) STAYS; the next
       push carries it */
    if(!m10cJournalAdvance(j,"k2",null,uid)){m10cBlock("could not verify the marker phase");cb&&cb(false);return;}}
  if(j.phase==="k2"){
    m10cRemove("journal",uid);
    var gone=m10cRead("journal",uid);
    if(gone.st!=="absent"){m10cBlock("could not clear a finished sync record");cb&&cb(false);return;}
    try{markDirty(false);setLastSync();}catch(ex){}
    cb&&cb(true);return;}
  cb&&cb(true);}

/* Terminalize the ack journal with a typed outcome (conflict / displacement /
   auth). Dirty is NEVER touched here — no data loss; review is increment 3. */
function m10cTerminalize(j,outcome,extra,uid){
  j.outcome=outcome;
  if(extra)for(var k in extra)j.expect[k]=extra[k];
  if(!m10cJournalAdvance(j,"done",null,uid||j.owner)){m10cBlock("could not record the sync outcome");return false;}
  return true;}

var m10cPushing=false;
function m10cPush(manual,done){
  var uid=m8Uid();
  var fin=function(ok){m10cPushing=false;done&&done(ok);};
  if(!uid||!syncOn()){if(manual)toast("Log in first");fin(false);return;}
  if(window.m8StorageBlocked){if(manual)toast("Sync is paused \u2014 see the banner");fin(false);return;}
  if(m10cPushing){fin(false);return;}
  var st=m10cState();
  if(st==="corrupt"){m10cBlock("a damaged core sync record was preserved and needs review");fin(false);return;}
  if(st==="review-pending"){if(manual)toast("Core sync needs review");fin(false);return;}
  if(st==="journal-recovery"){m10cRecover(function(){fin(false);});return;}
  if(st==="bootstrap"){m10cBootstrap(function(ok){if(ok)m10cPush(manual,done);else fin(false);});return;}
  if(st==="dirty-unproven"){m10cSoftBlock("recent changes could not be verified on this device");fin(false);return;}
  if(st!=="dirty"){fin(true);return;}                       /* clean: nothing to push */
  /* A device WITHOUT the pen must not push. It used to send the commit anyway
     with fence:null, and with FENCING_ENFORCED off the server accepts that — so
     both devices were writing, and two copies of the same data at different
     revisions manufactured "conflicts" where nothing actually differed (Owner,
     2026-08-04, twice in one evening). Reading stays allowed; the changes stay
     local and dirty until this device takes the pen, which the read-only bar
     offers. This is the client half of STRICT; FENCING_ENFORCED is the server
     half and is still off pending the coach migration. */
  if(typeof M10!=="undefined"&&M10.booted&&syncOn()&&
     !(M10.holder&&M10.uid===uid&&performance.now()<M10.deadline)){
    if(manual)toast("Another device is the active writer — take over to upload these changes");
    fin(false);return;}
  var d=m10cRead("dirty");if(d.st!=="ok"){fin(false);return;}
  var b=m10cRead("base");if(b.st!=="ok"){fin(false);return;}
  var pc=m10cCanon(payload());
  if(!pc.ok){m10cBlock("core data failed validation ("+pc.error+")");fin(false);return;}
  var rid=m10cRequestId();
  if(!rid){fin(false);return;}
  var fence=(M10.holder&&M10.uid===uid&&performance.now()<M10.deadline)?M10.fence:null;
  var ctx=m10cCtx();
  var j={op:"core-ack",phase:"intent",startedAt:Date.now(),
    expect:{oldBaseCanon:b.val.body,expectedRev:b.val.rev,pushedCanon:pc.canon,
      gen:d.val.gen,fence:fence,requestId:rid}};
  if(!m10cJournalWrite(j,ctx.uid)){fin(false);return;}
  m10cPushing=true;setSync("saving");
  m10cDispatch(j,JSON.parse(pc.canon),function(ok){
    if(ok&&manual)toast("Saved to your server");
    fin(ok);},ctx);}

function m10cDispatch(j,payloadObj,cb,ctx){
  var e=j.expect;
  var body={subsystem:"core",expectedRev:e.expectedRev,idempotencyKey:e.requestId,
    payload:payloadObj,clientBuild:(typeof APP_BUILD==="string"?APP_BUILD:"")};
  if(e.fence!==null){body.fence=e.fence;body.deviceId=m10DeviceId();}
  m10cRoute(body).then(function(r){
    /* N3/N4: a response from a superseded session touches NOTHING — the
       captured journal stays byte-identical for replay under its own
       account's next session; zero writes under the current one. */
    if(!m10cCtxOk(ctx)){cb&&cb(false);return;}
    if(r.status===200&&r.body&&r.body.ok===true){
      /* N9: the route's exact revision postcondition — a safe nonnegative
         integer equal to expectedRev+1. Anything else is a malformed
         success: journal and dirty preserved, base NOT advanced, blocked. */
      var nr=r.body.newRev;
      var revOk=typeof nr==="number"&&isFinite(nr)&&Math.floor(nr)===nr&&nr>=0&&
        nr<=9007199254740990&&nr===e.expectedRev+1;
      if(!revOk){m10cBlock("the server acknowledgement failed validation");cb&&cb(false);return;}
      if(!m10cJournalAdvance(j,"net-done",{newRev:nr},ctx.uid)){m10cBlock("could not record the server acknowledgement");cb&&cb(false);return;}
      m10cComplete(j,function(ok){if(ok)setSync("ok");cb&&cb(ok);},ctx.uid);
      return;}
    var natRes=function(v2){return typeof v2==="number"&&isFinite(v2)&&v2>=0&&Math.floor(v2)===v2&&v2<=9007199254740990;};
    if(r.status===409&&r.body&&r.body.fenceStale===true){
      /* P3: a malformed 409 never becomes authoritative review state — the
         journal survives at intent (recoverable request), dirty untouched */
      if(!natRes(r.body.fence)){setSync("error","core sync received a malformed response");cb&&cb(false);return;}
      m10cTerminalize(j,"fence-displaced",{staleFence:r.body.fence},ctx.uid);
      setSync("error","another device is the active writer");cb&&cb(false);return;}
    if(r.status===409&&r.body&&r.body.conflict===true){
      if(!natRes(r.body.serverRev)){setSync("error","core sync received a malformed response");cb&&cb(false);return;}
      m10cTerminalize(j,"conflict",{serverRev:r.body.serverRev},ctx.uid);
      setSync("error","core needs review");try{render();}catch(_e){}cb&&cb(false);return;}
    if(r.status===409&&r.body&&/reused/.test(r.body.error||"")){
      m10cBlock("a sync request identity was reused");cb&&cb(false);return;}
    if(r.status===401||r.status===403){
      m10cTerminalize(j,"auth",null,ctx.uid);
      setSync("error","session expired \u2014 log in again");cb&&cb(false);return;}
    /* transport ambiguity / 5xx: the journal SURVIVES for replay-first */
    setSync("offline");cb&&cb(false);
  }).catch(function(){setSync("offline");cb&&cb(false);});}

/* Replay-first recovery: an in-flight journal re-dispatches ITS OWN captured
   request (same requestId + expectedRev + payload) — the server ledger
   answers replays idempotently; the response is handled by the SAME arms. */
function m10cRecover(cb,ctx){
  ctx=ctx||m10cCtx();
  if(!m10cCtxOk(ctx)){cb&&cb(false);return;}
  var j=m10cRead("journal",ctx.uid);
  if(j.st==="malformed"){
    if(m10cQuarantine("journal",ctx.uid))m10cBlock("a damaged core sync record was preserved and needs review");
    cb&&cb(false);return;}
  if(j.st!=="ok"){cb&&cb(true);return;}
  var v=j.val;
  var err=m10cValidateJournal(v);
  if(err){if(m10cQuarantine("journal",ctx.uid))m10cBlock("an invalid core sync record was preserved and needs review");cb&&cb(false);return;}
  if(v.op==="core-ack"){
    if(v.phase==="done"&&v.outcome){cb&&cb(false);return;}     /* review-pending: increment 3 */
    if(v.phase==="net-done"||v.phase==="k1"||v.phase==="k2"){m10cComplete(v,cb,ctx.uid);return;}
    var pobj;try{pobj=JSON.parse(v.expect.pushedCanon);}catch(ex){pobj=null;}
    if(!pobj){if(m10cQuarantine("journal",ctx.uid))m10cBlock("an unreadable core sync record was preserved");cb&&cb(false);return;}
    m10cDispatch(v,pobj,cb,ctx);return;}
  if(v.op==="core-bootstrap"||v.op==="core-adopt"){m10cFinishBootAdopt(v,cb,ctx);return;}
  cb&&cb(false);}

/* ---- G9/G10 bootstrap ---- */
function m10cBootstrap(cb,ctx){
  ctx=ctx||m10cCtx();
  var uid=ctx.uid;if(!uid){cb&&cb(false);return;}
  /* N6: capture the local precondition BEFORE the network call */
  var preLocal;try{preLocal=localStorage.getItem(KEY);}catch(e){preLocal=null;}
  ctx.preLocal=preLocal;
  pbGetRecord(function(rec,err){
    /* N4/N5: revalidate EVERYTHING after the GET, before any decision */
    if(!m10cCtxOk(ctx)){cb&&cb(false);return;}
    if(window.m8StorageBlocked){cb&&cb(false);return;}
    var nowLocal;try{nowLocal=localStorage.getItem(KEY);}catch(e){nowLocal=null;}
    if(nowLocal!==ctx.preLocal){cb&&cb(false);return;}   /* an edit landed mid-flight: decide nothing from stale evidence */
    if(m10cRead("dirty",uid).st!=="absent"){cb&&cb(false);return;}
    if(err){cb&&cb(false);return;}
    var lp=payload();
    var lc=m10cCanon(lp);
    if(!lc.ok){m10cBlock("core data failed validation ("+lc.error+")");cb&&cb(false);return;}
    var serverData=rec?rec.data:null;
    var serverRev=rec?(rec.coreRev||0):0;
    if(!rec||(serverData==null&&serverRev===0)){
      /* G10: no row, or absent data at rev 0 — the fenced first push may
         create; the acknowledged state is rev 0 with NO server copy */
      var jf={op:"core-bootstrap",phase:"intent",startedAt:Date.now(),expect:{serverRev:0,serverCanon:null}};
      if(!m10cJournalWrite(jf,uid)){cb&&cb(false);return;}
      /* CONFIRMED: the server answered and holds nothing for this account. This
         is the only evidence that may declare a first run on the boot path. */
      try{onboardingGate(true);}catch(e){}
      m10cFinishBootAdopt(jf,cb,ctx);return;}
    if(serverData==null&&serverRev>0){
      /* G10: deletion/change evidence — review, never a first push */
      var jd={op:"core-bootstrap",phase:"intent",startedAt:Date.now(),expect:{serverRev:serverRev,serverCanon:null}};
      if(m10cJournalWrite(jd,uid))m10cTerminalize(jd,"bootstrap-conflict",null,uid);
      setSync("error","core needs review");try{render();}catch(_e){}cb&&cb(false);return;}
    var sc=m10cCanon(serverData);
    if(!sc.ok){m10cBlock("the server core copy failed validation");cb&&cb(false);return;}
    /* The server answered and it HAS a core — never a first run. Set this in
       MEMORY only: a save() here marks the core dirty, and a dirty device
       refuses to adopt, which would block the very pull we are riding. */
    try{if(state.obDeferred){state.obDeferred=false;state.settings.onboarded=true;}}catch(e){}
    if(sc.canon===lc.canon){
      var je={op:"core-bootstrap",phase:"intent",startedAt:Date.now(),expect:{serverRev:serverRev,serverCanon:sc.canon}};
      if(!m10cJournalWrite(je,uid)){cb&&cb(false);return;}
      m10cFinishBootAdopt(je,cb,ctx);return;}
    if(m10cLocalEmpty(lp)){
      /* fresh device: journaled adoption of the server copy */
      var ja={op:"core-adopt",phase:"intent",startedAt:Date.now(),expect:{serverRev:serverRev,serverCanon:sc.canon}};
      if(!m10cJournalWrite(ja,uid)){cb&&cb(false);return;}
      m10cFinishBootAdopt(ja,cb,ctx);return;}
    /* differing, local nonempty: BOTH copies preserved; review is increment 3 */
    var jc={op:"core-bootstrap",phase:"intent",startedAt:Date.now(),expect:{serverRev:serverRev,serverCanon:sc.canon}};
    if(m10cJournalWrite(jc,uid))m10cTerminalize(jc,"bootstrap-conflict",null,uid);
    setSync("error","core needs review");try{render();}catch(_e){}cb&&cb(false);});}

function m10cFinishBootAdopt(j,cb,ctx){
  var uid=j.owner||((ctx&&ctx.uid)||m8Uid());
  var e=j.expect;
  if(j.op==="core-bootstrap"){
    if(j.phase==="done"&&j.outcome){cb&&cb(false);return;}
    if(!m10cWrite("base",{canon:M10C_CANON_VER,rev:e.serverRev,body:e.serverCanon},uid)){m10cBlock("could not record the acknowledged copy");cb&&cb(false);return;}
    var b=m10cRead("base",uid);
    if(!(b.st==="ok"&&b.val.rev===e.serverRev&&b.val.body===e.serverCanon)){m10cBlock("could not verify the acknowledged copy");cb&&cb(false);return;}
    m10cRemove("journal",uid);
    if(m10cRead("journal",uid).st!=="absent"){m10cBlock("could not clear a finished sync record");cb&&cb(false);return;}
    cb&&cb(true);return;}
  if(j.op==="core-adopt"){
    /* N5: adoption writes the CURRENT session's primary store — it must not
       proceed for a superseded session, and the intent phase re-proves the
       local preconditions immediately before the wl_v1 replacement. */
    if(ctx&&!m10cCtxOk(ctx)){cb&&cb(false);return;}
    if(!ctx&&uid!==m8Uid()){cb&&cb(false);return;}
    var obj;try{obj=JSON.parse(e.serverCanon);}catch(ex){obj=null;}
    if(!obj){if(m10cQuarantine("journal",uid))m10cBlock("an unreadable adoption record was preserved");cb&&cb(false);return;}
    if(j.phase==="intent"){
      /* N5/N6: if a dirty marker or a local edit appeared since the intent
         was recorded, the adoption is annulled — local wins, nothing is
         overwritten, the journal is removed (no data was touched). */
      if(m10cRead("dirty",uid).st!=="absent"||window.m8StorageBlocked||
         (ctx&&ctx.preLocal!==undefined&&(function(){try{return localStorage.getItem(KEY)!==ctx.preLocal;}catch(ex2){return true;}})())){
        /* P2 (round-18 ruling 4): annulment is DURABLE — the removal is
           verified; a failed removal raises the shared block so the stale
           intent can never silently run later. */
        if(!m10cRemove("journal",uid)||m10cRead("journal",uid).st!=="absent")
          m10cBlock("could not annul a superseded adoption record");
        cb&&cb(false);return;}
      try{localStorage.setItem("wl_v1",JSON.stringify(obj));}catch(ex){m10cBlock("could not store the adopted copy");cb&&cb(false);return;}
      var back;try{back=localStorage.getItem("wl_v1");}catch(ex){back=null;}
      if(back!==JSON.stringify(obj)){m10cBlock("could not verify the adopted copy");cb&&cb(false);return;}
      if(!m10cJournalAdvance(j,"k1",null,uid)){m10cBlock("could not verify the adoption phase");cb&&cb(false);return;}}
    if(j.phase==="k1"){
      if(!m10cWrite("base",{canon:M10C_CANON_VER,rev:e.serverRev,body:e.serverCanon},uid)){m10cBlock("could not record the acknowledged copy");cb&&cb(false);return;}
      if(!m10cJournalAdvance(j,"k2",null,uid)){m10cBlock("could not verify the base phase");cb&&cb(false);return;}}
    if(j.phase==="k2"){
      m10cRemove("journal",uid);
      if(m10cRead("journal",uid).st!=="absent"){m10cBlock("could not clear a finished adoption record");cb&&cb(false);return;}
      try{load();render();}catch(ex){}
      cb&&cb(true);return;}
    cb&&cb(true);return;}
  cb&&cb(false);}

/* ---- pull/adoption: NEVER overwrites unresolved local dirty ---- */
function m10cPull(manual,done){
  var ctx=m10cCtx();
  var uid=ctx.uid;
  if(!uid||!syncOn()){done&&done(false);return;}
  if(window.m8StorageBlocked){done&&done(false);return;}
  var st=m10cState();
  if(st==="corrupt"||st==="review-pending"||st==="journal-recovery"){
    if(st==="journal-recovery"){m10cRecover(function(){done&&done(false);},ctx);return;}
    done&&done(false);return;}
  if(st==="bootstrap"){m10cBootstrap(done,ctx);return;}
  if(st==="dirty"||st==="dirty-unproven"){
    /* the proof case: adoption REFUSED while local dirty is unresolved */
    if(manual)toast("This device has unsynced changes \u2014 they go up first");
    done&&done(false);return;}
  /* N6: capture the local precondition before the network call */
  try{ctx.preLocal=localStorage.getItem(KEY);}catch(e){ctx.preLocal=null;}
  pbGetRecord(function(rec,err){
    /* N4/N5: revalidate after the GET — session, block, dirty, local bytes */
    if(!m10cCtxOk(ctx)){done&&done(false);return;}
    if(window.m8StorageBlocked){done&&done(false);return;}
    if(m10cRead("dirty",uid).st!=="absent"){done&&done(false);return;}
    var nowLocal;try{nowLocal=localStorage.getItem(KEY);}catch(e){nowLocal=null;}
    if(nowLocal!==ctx.preLocal){done&&done(false);return;}
    if(err||!rec){done&&done(false);return;}
    var b=m10cRead("base",uid);if(b.st!=="ok"){done&&done(false);return;}
    var serverRev=rec.coreRev||0;
    if(serverRev<=b.val.rev){done&&done(true);return;}       /* nothing newer */
    var sc=m10cCanon(rec.data||{});
    if(!sc.ok){m10cBlock("the server core copy failed validation");done&&done(false);return;}
    var ja={op:"core-adopt",phase:"intent",startedAt:Date.now(),expect:{serverRev:serverRev,serverCanon:sc.canon}};
    if(!m10cJournalWrite(ja,uid)){done&&done(false);return;}
    m10cFinishBootAdopt(ja,done,ctx);});}

/* boot-time core recovery: journal first (replay-first), then bootstrap */
function m10cBoot(cb){
  var uid=m8Uid();if(!uid||!syncOn()){cb&&cb();return;}
  var j=m10cRead("journal");
  if(j.st!=="absent"){m10cRecover(function(){cb&&cb();},m10cCtx());return;}
  var b=m10cRead("base");
  if(b.st==="malformed"){if(m10cQuarantine("base"))m10cBlock("a damaged core record was preserved and needs review");cb&&cb();return;}
  var d=m10cRead("dirty");
  if(d.st==="malformed"){if(m10cQuarantine("dirty"))m10cBlock("a damaged core record was preserved and needs review");cb&&cb();return;}
  if(d.st==="ok"){m10cGen=Math.max(m10cGen,d.val.gen);}
  cb&&cb();}
/* =============== M10-BLOCK-2-END =============== */

/* ================= M10 WIRING (increment 2) =================
   Core sync transport ownership (ruling 8: transport, not dispatcher
   gating): save() marks the core dirty generation synchronously and proves
   persistence; cloudPush/cloudPull route through the journaled fenced
   protocol. Declared LAST, so these declarations are the live bindings. */
function save(){
  m10cMarkDirty();
  saveLocal();
  /* persistence proof: the primary store now carries this generation */
  try{var expect=JSON.stringify(payload());
    if(localStorage.getItem(KEY)===expect)m10cProveGen();}catch(e){}
  scheduleCloudPush();}
function cloudPush(manual){
  if(ownershipAmbiguous()){if(manual)toast("Paused \u2014 this device holds data from another account");return;}
  m10cPush(manual);}
function cloudPull(manual,done){
  if(ownershipAmbiguous()){done&&done(false);return;}
  m10cPull(manual,done);}
function autoSync(){
  /* the retired newest-date recency heuristic is NEVER consulted (design
     §2 bootstrap): core boot flows through the journaled protocol only */
  if(ownershipAmbiguous())return;
  if(!syncOn())return;
  trainingPull(function(){if(state.view==="train")render();});
  setSync("syncing");
  m10cPull(false,function(){
    var st=m10cState();
    if(st==="dirty"){m10cPush(false,function(ok){if(ok)setSync("ok");try{render();}catch(e){}});return;}
    /* A successful PULL is a sync too. setLastSync() only ever ran on push and
       login paths, so a read-only device — which never pushes — could pull
       correctly every minute and still display the time it last signed in
       (Owner, 2026-08-03: "the last sync is still 5:56"). */
    if(st==="clean"){try{setLastSync();}catch(e){}setSync("ok");}
    /* the coach-reports feed rides along with every sync: a pure read of the
       reports collection, outside the synced record entirely */
    try{fetchCoachReports(function(ch){if(ch)try{render();}catch(_e){}});}catch(e){}
    try{render();}catch(e){}});}
/* =============== M10-WIRING-END (increment 2) =============== */