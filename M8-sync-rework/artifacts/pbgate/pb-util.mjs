/* pb-util.mjs <mkuser|truthclean> [uid] — disposable-gate helpers, NAS-local. */
import fs from "node:fs";
const cfg={};for(const l of fs.readFileSync("/volume1/homes/griffingoodman/compound-coach/pb.env","utf8").split("\n")){const m=/^([A-Z_]+)=(.*)$/.exec(l.trim());if(m)cfg[m[1]]=m[2];}
const PB=(cfg.PB_URL||"http://127.0.0.1:8090").replace(/\/+$/,"");
const j=async(r)=>r.json();
const main=async()=>{
  const a=await j(await fetch(PB+"/api/collections/_superusers/auth-with-password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({identity:cfg.PB_EMAIL,password:cfg.PB_PASSWORD})}));
  const H={"Content-Type":"application/json",Authorization:a.token};
  const cmd=process.argv[2];
  if(cmd==="mkuser"){
    const email="disposable-restart-"+Date.now()+"@disposable.invalid",pw="pw-restart-fixed";
    const u=await j(await fetch(PB+"/api/collections/users/records",{method:"POST",headers:H,body:JSON.stringify({email,password:pw,passwordConfirm:pw})}));
    const ua=await j(await fetch(PB+"/api/collections/users/auth-with-password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({identity:email,password:pw})}));
    console.log(JSON.stringify({id:u.id,email,pw,token:ua.token}));return;}
  if(cmd==="truthclean"){
    const uid=process.argv[3];
    const g=await j(await fetch(PB+"/api/collections/appdata/records?perPage=1&filter="+encodeURIComponent(`user="${uid}"`),{headers:H}));
    const rec=g.items&&g.items[0];
    const out={trainingRev:rec&&rec.trainingRev,hasRealEdit:!!(rec&&JSON.stringify(rec.training).indexOf("Real Push")>=0)};
    if(rec)await fetch(PB+"/api/collections/appdata/records/"+rec.id,{method:"DELETE",headers:H});
    await fetch(PB+"/api/collections/users/records/"+uid,{method:"DELETE",headers:H});
    const gone=await fetch(PB+"/api/collections/users/records/"+uid,{headers:H});
    out.cleanupUserGone=gone.status===404;
    console.log(JSON.stringify(out));return;}
};
main().catch(e=>{console.error("FATAL",e);process.exit(1);});
