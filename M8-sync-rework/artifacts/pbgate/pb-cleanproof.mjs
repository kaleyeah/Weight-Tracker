/* Read-only absence proof for prior disposable uids + gate-2 rerun with
   attributable IDs and independent user/record postconditions. */
import fs from "node:fs";
const cfg={};for(const l of fs.readFileSync("/volume1/homes/griffingoodman/compound-coach/pb.env","utf8").split("\n")){const m=/^([A-Z_]+)=(.*)$/.exec(l.trim());if(m)cfg[m[1]]=m[2];}
const PB=(cfg.PB_URL||"http://127.0.0.1:8090").replace(/\/+$/,"");
const jj=async r=>{const t=await r.text();try{return JSON.parse(t);}catch{return {raw:t.slice(0,200)};}};
const main=async()=>{
  const a=await jj(await fetch(PB+"/api/collections/_superusers/auth-with-password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({identity:cfg.PB_EMAIL,password:cfg.PB_PASSWORD})}));
  const H={"Content-Type":"application/json",Authorization:a.token};
  const EV={readOnlyAbsence:{},gate2:{cases:[]}};
  // 1) read-only postconditions for the two restart-run uids
  for(const uid of ["jiez8jcwd6ckdn0","puo4f7pxj94vq3j"]){
    const u=await fetch(PB+"/api/collections/users/records/"+uid,{headers:H});
    const g=await jj(await fetch(PB+"/api/collections/appdata/records?perPage=5&filter="+encodeURIComponent(`user="${uid}"`),{headers:H}));
    EV.readOnlyAbsence[uid]={userStatus:u.status,appdataItemsForRelation:(g.items||[]).length,totalItems:g.totalItems??0};}
  // 2) gate-2 rerun with attributable IDs
  const mk=async(tag)=>{
    const email=`disposable-${tag}-${Date.now()}@disposable.invalid`;const pw=`pw-${tag}-fixed`;
    const u=await jj(await fetch(PB+"/api/collections/users/records",{method:"POST",headers:H,body:JSON.stringify({email,password:pw,passwordConfirm:pw})}));
    const ua=await jj(await fetch(PB+"/api/collections/users/auth-with-password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({identity:email,password:pw})}));
    return {id:u.id,email,tok:ua.token};};
  const A=await mk("xa2"),B=await mk("xb2");
  EV.gate2.users={A:{id:A.id,email:A.email},B:{id:B.id,email:B.email}};
  const T={cardioTypes:["Peloton"],exercises:[],liftSessions:{},routines:[],sessions:{}};
  const commit=async(tok,body)=>jj(await fetch(PB+"/api/cf/appdata/commit",{method:"POST",headers:{"Content-Type":"application/json",Authorization:tok},body:JSON.stringify({subsystem:"training",...body})}));
  const cA=await commit(A.tok,{expectedRev:0,idempotencyKey:"xa2-1",payload:T});
  EV.gate2.cases.push({name:"A-fresh-commit",response:cA});
  const recA=(await jj(await fetch(PB+"/api/collections/appdata/records?perPage=1&filter="+encodeURIComponent(`user="${A.id}"`),{headers:H}))).items[0];
  const cB=await commit(B.tok,{expectedRev:0,idempotencyKey:"xa2-1",payload:T});
  EV.gate2.cases.push({name:"B-same-key-own-ledger",response:cB});
  const recB=(await jj(await fetch(PB+"/api/collections/appdata/records?perPage=1&filter="+encodeURIComponent(`user="${B.id}"`),{headers:H}))).items[0];
  EV.gate2.records={A:recA&&recA.id,B:recB&&recB.id};
  const pDenied=await fetch(PB+"/api/collections/appdata/records/"+recA.id,{method:"PATCH",headers:{"Content-Type":"application/json",Authorization:B.tok},body:JSON.stringify({training:{hacked:true}})});
  EV.gate2.cases.push({name:"B-raw-patch-of-A-denied",status:pDenied.status});
  const recA2=await jj(await fetch(PB+"/api/collections/appdata/records/"+recA.id,{headers:H}));
  EV.gate2.cases.push({name:"A-record-unaffected",response:{trainingRev:recA2.trainingRev,trainingUntouched:JSON.stringify(recA2.training)===JSON.stringify(T)}});
  // cleanup with INDEPENDENT postconditions per identifier
  for(const [tag,u,rec] of [["A",A,recA],["B",B,recB]]){
    if(rec)await fetch(PB+"/api/collections/appdata/records/"+rec.id,{method:"DELETE",headers:H});
    await fetch(PB+"/api/collections/users/records/"+u.id,{method:"DELETE",headers:H});}
  EV.gate2.cleanup={};
  for(const [tag,u,rec] of [["A",A,recA],["B",B,recB]]){
    const us=(await fetch(PB+"/api/collections/users/records/"+u.id,{headers:H})).status;
    const rs=rec?(await fetch(PB+"/api/collections/appdata/records/"+rec.id,{headers:H})).status:null;
    const rel=await jj(await fetch(PB+"/api/collections/appdata/records?perPage=5&filter="+encodeURIComponent(`user="${u.id}"`),{headers:H}));
    EV.gate2.cleanup[tag]={userStatus:us,recordByIdStatus:rs,recordsByRelation:(rel.items||[]).length};}
  console.log(JSON.stringify(EV,null,1));};
main().catch(e=>{console.error("FATAL",e);process.exit(1);});
