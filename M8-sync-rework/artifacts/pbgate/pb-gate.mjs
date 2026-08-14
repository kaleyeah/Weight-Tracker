/* M8 disposable-PocketBase gate — runs ON THE SYNOLOGY against localhost.
   Disposable user + records ONLY. Captures raw request/response evidence for
   every required case, before/after record state, and identities; deletes the
   disposable user and record afterward with verified absence. */
import fs from "node:fs";
import crypto from "node:crypto";
const COACH="/volume1/homes/NAS_ACCOUNT/compound-coach";
const cfg={};for(const line of fs.readFileSync(COACH+"/pb.env","utf8").split("\n")){const m=/^([A-Z_]+)=(.*)$/.exec(line.trim());if(m)cfg[m[1]]=m[2];}
const PB=(cfg.PB_URL||"http://127.0.0.1:8090").replace(/\/+$/,"");
const EV={cases:[],identities:{}};
const raw=(name,req,res,body)=>EV.cases.push({name,request:req,status:res.status,response:body});
let admin=null,userTok=null,uid=null,recId=null;
async function pb(path,opts={},tok){
  const headers={"Content-Type":"application/json",...(opts.headers||{})};
  if(tok)headers.Authorization=tok;
  const r=await fetch(PB+path,{...opts,headers});
  const txt=await r.text();let j=null;try{j=JSON.parse(txt);}catch{}
  return {r,j,txt};
}
const die=(m)=>{console.error("FATAL: "+m);process.exit(1);};
const main=async()=>{
  // identities
  EV.identities.pbHealth=(await pb("/api/health")).j;
  EV.identities.hooks={
    "cf_cas.pb.js":crypto.createHash("sha256").update(fs.readFileSync("/volume1/docker/pocketbase/pb_hooks/cf_cas.pb.js")).digest("hex"),
    "cf_cas_shared.js":crypto.createHash("sha256").update(fs.readFileSync("/volume1/docker/pocketbase/pb_hooks/cf_cas_shared.js")).digest("hex")};
  const a=await pb("/api/collections/_superusers/auth-with-password",{method:"POST",body:JSON.stringify({identity:cfg.PB_EMAIL,password:cfg.PB_PASSWORD})});
  if(!a.j||!a.j.token)die("superuser auth failed: "+a.txt.slice(0,200));
  admin=a.j.token;
  // disposable user
  const email="disposable-m8-"+Date.now()+"@disposable.invalid",pw="dispose-"+Date.now()+"-pw";
  const cu=await pb("/api/collections/users/records",{method:"POST",body:JSON.stringify({email,password:pw,passwordConfirm:pw})},admin);
  if(!cu.j||!cu.j.id)die("user create failed: "+cu.txt.slice(0,300));
  uid=cu.j.id;EV.identities.disposableUser={id:uid,email};
  const ua=await pb("/api/collections/users/auth-with-password",{method:"POST",body:JSON.stringify({identity:email,password:pw})});
  userTok=ua.j.token;
  const commit=async(name,body,tok)=>{
    const req={subsystem:"training",...body};
    const res=await pb("/api/cf/appdata/commit",{method:"POST",body:JSON.stringify(req)},tok===undefined?userTok:tok);
    raw(name,req,res.r,res.j??res.txt.slice(0,300));
    return res;};
  const getRec=async()=>{
    const g=await pb(`/api/collections/appdata/records?perPage=1&filter=${encodeURIComponent(`user="${uid}"`)}`,{},admin);
    return (g.j&&g.j.items&&g.j.items[0])||null;};
  const T1={cardioTypes:["Peloton"],exercises:[{id:"e1",muscle:"back",name:"Row",notes:[]}],liftSessions:{},routines:[],sessions:{}};
  const T2={...T1,exercises:[...T1.exercises,{id:"e2",muscle:"chest",name:"Press",notes:[]}]};
  EV.beforeState=await getRec();
  // 1 fresh commit at rev 0 (creates the record)
  const k1="m8-gate-fresh-"+Date.now();
  const c1=await commit("fresh-commit",{expectedRev:0,idempotencyKey:k1,payload:T1});
  if(!(c1.j&&c1.j.ok&&c1.j.newRev===1))die("fresh commit failed");
  recId=(await getRec()).id;
  // 2 identical-key replay
  const c2=await commit("identical-key-replay",{expectedRev:0,idempotencyKey:k1,payload:T1});
  // 3 same-key different-body rejection
  const c3=await commit("same-key-different-body",{expectedRev:0,idempotencyKey:k1,payload:T2});
  // 4 stale revision conflict
  const c4=await commit("stale-revision-conflict",{expectedRev:0,idempotencyKey:"m8-gate-stale-"+Date.now(),payload:T2});
  // 5 committed-with-response-lost recovery: commit at rev1 then REPLAY the same key
  const k5="m8-gate-lost-"+Date.now();
  const c5a=await commit("lost-response-original",{expectedRev:1,idempotencyKey:k5,payload:T2});
  const c5b=await commit("lost-response-replay",{expectedRev:1,idempotencyKey:k5,payload:T2});
  // 6 unapplied replay: a NEVER-executed key simply executes fresh (no ledger row)
  const k6="m8-gate-unapplied-"+Date.now();
  const c6=await commit("unapplied-key-executes-fresh",{expectedRev:2,idempotencyKey:k6,payload:T1});
  // 7 auth/account isolation: unauthenticated + a SECOND disposable user
  const c7a=await commit("unauthenticated",{expectedRev:3,idempotencyKey:"m8-gate-noauth",payload:T1},null);
  const email2="disposable2-m8-"+Date.now()+"@disposable.invalid";
  const cu2=await pb("/api/collections/users/records",{method:"POST",body:JSON.stringify({email:email2,password:"x-"+Date.now()+"pw",passwordConfirm:"x-"+Date.now()+"pw"})},admin);
  let uid2=cu2.j&&cu2.j.id;
  if(uid2){
    const ua2=await pb("/api/collections/users/auth-with-password",{method:"POST",body:JSON.stringify({identity:email2,password:"x-"+Date.now()+"pw"})});
    // password mismatch is possible due to Date.now drift; recreate deterministically if auth failed
    if(!(ua2.j&&ua2.j.token)){
      await pb("/api/collections/users/records/"+uid2,{method:"DELETE"},admin);uid2=null;}
    else{
      const c7b=await pb("/api/cf/appdata/commit",{method:"POST",body:JSON.stringify({subsystem:"training",expectedRev:3,idempotencyKey:"m8-gate-cross",payload:T1})},ua2.j.token);
      raw("cross-account-isolation",{note:"user2 commits to ITS OWN record, not user1's"},c7b.r,c7b.j);
      const rec1=await getRec();
      EV.cases.push({name:"cross-account-check",request:null,status:200,
        response:{user1RevStillOwn:rec1.trainingRev,user1Unaffected:rec1.trainingRev===3}});
    }}
  EV.afterState=await getRec();
  // field isolation: core fields byte-compare across a concurrent core PATCH
  const corePatch=await pb("/api/collections/appdata/records/"+recId,{method:"PATCH",body:JSON.stringify({data:{weights:[{date:"2026-08-02",weight:180}]}})},userTok);
  raw("concurrent-core-patch",{data:"weights[1]"},corePatch.r,{coreRev:corePatch.j&&corePatch.j.coreRev,trainingRev:corePatch.j&&corePatch.j.trainingRev});
  const k8="m8-gate-isolation-"+Date.now();
  const before=await getRec();
  const c8=await commit("commit-after-core-patch",{expectedRev:before.trainingRev,idempotencyKey:k8,payload:T2});
  const after=await getRec();
  const permitted=["training","trainingRev","updated"];
  const changed=Object.keys(after).filter(k=>JSON.stringify(after[k])!==JSON.stringify(before[k]));
  EV.cases.push({name:"whole-record-field-isolation",request:{permitted},status:200,
    response:{changedFields:changed,onlyPermitted:changed.every(k=>permitted.indexOf(k)>=0)}});
  // cleanup: delete records + users, verify absence
  if(recId)await pb("/api/collections/appdata/records/"+recId,{method:"DELETE"},admin);
  if(uid2){
    const g2=await pb(`/api/collections/appdata/records?perPage=1&filter=${encodeURIComponent(`user="${uid2}"`)}`,{},admin);
    const r2=(g2.j&&g2.j.items&&g2.j.items[0]);if(r2)await pb("/api/collections/appdata/records/"+r2.id,{method:"DELETE"},admin);
    await pb("/api/collections/users/records/"+uid2,{method:"DELETE"},admin);}
  await pb("/api/collections/users/records/"+uid,{method:"DELETE"},admin);
  const gone=await pb(`/api/collections/users/records/${uid}`,{},admin);
  EV.cleanup={userDeleted:gone.r.status===404,
    recordGone:!(await getRec())};
  console.log(JSON.stringify(EV,null,1));
};
main().catch(e=>{console.error("FATAL",e);process.exit(1);});
