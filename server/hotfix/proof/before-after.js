/* Prove I8's assertions against BOTH hook versions on disposable instances. */
const {spawn,execFileSync}=require('child_process');
const fs=require('fs'),path=require('path'),os=require('os');
const PB=path.join(process.env.HOME,'staging-cas','bin','pocketbase');
const REPO='/home/griffin/projects/Weight-Tracker';
const BOOT=`migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  app.save(new Collection({ type: "base", name: "appdata",
    fields: [
      { name: "user", type: "relation", required: true, collectionId: users.id, cascadeDelete: true, maxSelect: 1 },
      { name: "data", type: "json", maxSize: 2000000 },
      { name: "training", type: "json", maxSize: 2000000 }],
    listRule: "user = @request.auth.id", viewRule: "user = @request.auth.id",
    createRule: "user = @request.auth.id", updateRule: "user = @request.auth.id",
    deleteRule: "user = @request.auth.id" }));
}, (app) => { try { app.delete(app.findCollectionByNameOrId("appdata")); } catch (_) {} });`;
async function run(hooksFrom,port,label){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'i8-'));
  fs.mkdirSync(dir+'/pb_hooks');fs.mkdirSync(dir+'/pb_migrations');
  for(const f of ['cf_cas.pb.js','cf_cas_shared.js'])
    fs.writeFileSync(dir+'/pb_hooks/'+f, execFileSync('git',['-C',REPO,'show',hooksFrom+':server/pb_hooks/'+f]));
  fs.writeFileSync(dir+'/pb_migrations/1753400000_cf_cas.js',
    execFileSync('git',['-C',REPO,'show',hooksFrom+':server/pb_migrations/1753400000_cf_cas.js']));
  fs.writeFileSync(dir+'/pb_migrations/1753300000_base.js',BOOT);
  const lg=fs.openSync(dir+'/pb.log','a');
  const p=spawn(PB,['serve','--http=127.0.0.1:'+port,'--dir='+dir+'/pb_data','--hooksDir='+dir+'/pb_hooks','--migrationsDir='+dir+'/pb_migrations'],{cwd:dir,stdio:['ignore',lg,lg]});
  const base='http://127.0.0.1:'+port;
  for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch(e){}await new Promise(r=>setTimeout(r,250));}
  execFileSync(PB,['superuser','upsert','cf_test_local@staging.invalid','LocalTestPw123456','--dir='+dir+'/pb_data'],{stdio:'ignore'});
  const j=async(m,u,t,b)=>{const r=await fetch(base+u,{method:m,headers:{'content-type':'application/json',...(t?{Authorization:t}:{})},body:b?JSON.stringify(b):undefined});return{status:r.status,body:await r.json().catch(()=>null)};};
  const at=(await j('POST','/api/collections/_superusers/auth-with-password',null,{identity:'cf_test_local@staging.invalid',password:'LocalTestPw123456'})).body.token;
  await j('POST','/api/collections/users/records',at,{email:'cf_test_athlete@staging.invalid',password:'AthletePw123456',passwordConfirm:'AthletePw123456',verified:true});
  const ut=(await j('POST','/api/collections/users/auth-with-password',null,{identity:'cf_test_athlete@staging.invalid',password:'AthletePw123456'})).body.token;
  const multi={weights:[{date:'2026-02-02',weight:79,note:'x',steps:1000}],
    settings:{theme:'dark',units:'kg',startDate:'2026-01-01'},steps:{'2026-02-02':8000},notes:{'2026-02-02':'felt good'}};
  const commit=(rev,key,pl)=>j('POST','/api/cf/appdata/commit',ut,{subsystem:'core',expectedRev:rev,idempotencyKey:key,payload:pl,clientBuild:'t',deviceId:'d'});
  const first=await commit(0,'k-multi',multi);
  let refused=0; for(let i=0;i<12;i++){const r=await commit(0,'k-multi',multi); if(r.status!==200) refused++;}
  const diff=await commit(0,'k-multi',{...multi,extra:'different'});
  const reordered={}; Object.keys(multi).reverse().forEach(k=>reordered[k]=multi[k]);
  const reord=await commit(0,'k-multi',reordered);
  console.log(label.padEnd(22),'first',first.status,
    '| I8b refused',String(refused)+'/12',
    '| I8d different->',diff.status,
    '| I8e reordered->',reord.status);
  p.kill('SIGTERM'); await new Promise(r=>setTimeout(r,400)); fs.rmSync(dir,{recursive:true,force:true});
  return {refused, diff:diff.status, reord:reord.status};
}
(async()=>{
  const before=await run('b929852',8097,'WITHOUT the fix');
  const after =await run('HEAD',   8098,'WITH the fix');
  console.log('\nI8b would have caught it:', before.refused>0 && after.refused===0);
  console.log('I8d still enforced      :', before.diff===409 && after.diff===409);
  console.log('I8e now correct         :', after.reord===200);
})().catch(e=>{console.error(String(e).slice(0,700));process.exit(1);});
