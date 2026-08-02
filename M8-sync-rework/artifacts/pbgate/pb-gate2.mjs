/* Supplement: cross-account isolation + PB version + schema capture. */
import fs from "node:fs";
const COACH="/volume1/homes/griffingoodman/compound-coach";
const cfg={};for(const line of fs.readFileSync(COACH+"/pb.env","utf8").split("\n")){const m=/^([A-Z_]+)=(.*)$/.exec(line.trim());if(m)cfg[m[1]]=m[2];}
const PB=(cfg.PB_URL||"http://127.0.0.1:8090").replace(/\/+$/,"");
const EV={cases:[]};
async function pb(path,opts={},tok){
  const headers={"Content-Type":"application/json",...(opts.headers||{})};
  if(tok)headers.Authorization=tok;
  const r=await fetch(PB+path,{...opts,headers});const txt=await r.text();let j=null;try{j=JSON.parse(txt);}catch{}
  return {r,j,txt};}
const main=async()=>{
  const a=await pb("/api/collections/_superusers/auth-with-password",{method:"POST",body:JSON.stringify({identity:cfg.PB_EMAIL,password:cfg.PB_PASSWORD})});
  const admin=a.j.token;
  const h=await pb("/api/health",{},admin);
  EV.pbVersionFromHealth=h.j;
  const col=await pb("/api/collections/appdata",{},admin);
  EV.appdataSchema={fields:(col.j.fields||col.j.schema||[]).map(f=>({name:f.name,type:f.type})),
    listRule:col.j.listRule,viewRule:col.j.viewRule,createRule:col.j.createRule,updateRule:col.j.updateRule,deleteRule:col.j.deleteRule};
  const mk=async(tag)=>{
    const email=`disposable-${tag}-${Date.now()}@disposable.invalid`;const pw=`pw-${tag}-fixed`;
    const cu=await pb("/api/collections/users/records",{method:"POST",body:JSON.stringify({email,password:pw,passwordConfirm:pw})},admin);
    const ua=await pb("/api/collections/users/auth-with-password",{method:"POST",body:JSON.stringify({identity:email,password:pw})});
    return {id:cu.j.id,email,tok:ua.j.token};};
  const A=await mk("xa"),B=await mk("xb");
  const T={cardioTypes:["Peloton"],exercises:[],liftSessions:{},routines:[],sessions:{}};
  const cA=await pb("/api/cf/appdata/commit",{method:"POST",body:JSON.stringify({subsystem:"training",expectedRev:0,idempotencyKey:"xa-1",payload:T})},A.tok);
  EV.cases.push({name:"A-fresh-commit",status:cA.r.status,response:cA.j});
  const recA=(await pb(`/api/collections/appdata/records?perPage=1&filter=${encodeURIComponent(`user="${A.id}"`)}`,{},admin)).j.items[0];
  // B commits with the SAME key: lands on B's OWN record, A untouched
  const cB=await pb("/api/cf/appdata/commit",{method:"POST",body:JSON.stringify({subsystem:"training",expectedRev:0,idempotencyKey:"xa-1",payload:T})},B.tok);
  EV.cases.push({name:"B-same-key-own-ledger",status:cB.r.status,response:cB.j});
  // B attempts a raw PATCH of A's record: must be denied by rules
  const pB=await pb("/api/collections/appdata/records/"+recA.id,{method:"PATCH",body:JSON.stringify({training:{hacked:true}})},B.tok);
  EV.cases.push({name:"B-raw-patch-of-A-denied",status:pB.r.status,response:pB.j&&pB.j.message||pB.txt.slice(0,120)});
  const recA2=(await pb(`/api/collections/appdata/records/${recA.id}`,{},admin)).j;
  EV.cases.push({name:"A-record-unaffected",status:200,
    response:{trainingRev:recA2.trainingRev,trainingUntouched:JSON.stringify(recA2.training)===JSON.stringify(T)}});
  // cleanup
  for(const u of [A,B]){
    const g=(await pb(`/api/collections/appdata/records?perPage=1&filter=${encodeURIComponent(`user="${u.id}"`)}`,{},admin)).j;
    if(g.items&&g.items[0])await pb("/api/collections/appdata/records/"+g.items[0].id,{method:"DELETE"},admin);
    await pb("/api/collections/users/records/"+u.id,{method:"DELETE"},admin);}
  const goneA=(await pb(`/api/collections/users/records/${A.id}`,{},admin)).r.status===404;
  const goneB=(await pb(`/api/collections/users/records/${B.id}`,{},admin)).r.status===404;
  EV.cleanup={A:goneA,B:goneB};
  console.log(JSON.stringify(EV,null,1));};
main().catch(e=>{console.error("FATAL",e);process.exit(1);});
