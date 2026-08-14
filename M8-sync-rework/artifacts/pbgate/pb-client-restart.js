/* M8 disposable gate — client recovery after restart, REAL app + REAL PB.
   A disposable user only. Persistent Chromium profile so localStorage
   survives the simulated crash. */
const path=require('path'),fs=require('fs'),cp=require('child_process');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const PBHOST='rack.tail6fa16c.ts.net',PBIP='100.124.59.10';
const PB='https://'+PBHOST;
const ssh=(cmd)=>cp.execSync(`ssh -o BatchMode=yes NAS_ACCOUNT@${PBIP} ${JSON.stringify(cmd)}`,{encoding:'utf8'});
(async()=>{
  // create the disposable user via the NAS-side admin (creds never leave the NAS)
  const mk=ssh("/usr/local/bin/node /volume1/homes/NAS_ACCOUNT/compound-coach/pb-util.mjs mkuser");
  const user=JSON.parse(mk.trim().split('\n').pop());
  console.log('disposable user:',user.email);
  const tok=user.token,uid=user.id;
  console.log('authenticated, uid:',uid);
  const html=fs.readFileSync('/home/griffin/projects/compound-app/index.html','utf8');
  const http=require('http');
  const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+server.address().port;
  const profile='/tmp/claude-1002/m8-restart-profile-'+Date.now();
  const launch=()=>chromium.launchPersistentContext(profile,{
    args:['--host-resolver-rules=MAP '+PBHOST+' '+PBIP]});
  // phase 1: sign in, edit, dispatch the push, CRASH before the response settles
  let ctx=await launch();
  let page=ctx.pages()[0]||await ctx.newPage();
  await page.goto(url,{waitUntil:'load'});
  await page.evaluate(([u,t,base])=>{
    localStorage.setItem('wl_pb',JSON.stringify({uid:u,base:base,token:t,email:'d@d'}));
    localStorage.setItem('wl_last_owner',u);
    localStorage.setItem('wl_v1',JSON.stringify({settings:{onboarded:true,units:'lbs'},weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},statuses:[],presets:[],skips:{},nightlyLog:{}}));
  },[uid,tok,PB]);
  await page.reload({waitUntil:'load'});
  await page.waitForFunction(()=>typeof window.m8State==='function',null,{timeout:20000});
  await page.waitForTimeout(2500);
  const pre=await page.evaluate(async()=>{
    await new Promise(x=>trainingPull(x));
    state.training.exercises.push({id:'real',name:'Real Push',muscle:'back',notes:[]});
    saveTraining();
    m8Push();
    return {state:m8State(),journal:!!localStorage.getItem('wl_training_journal__'+pbUid())};});
  // crash 60ms after dispatch: the commit reaches the server, the response is lost
  await page.waitForTimeout(60);
  await ctx.close();
  console.log('phase1 (crashed mid-push):',JSON.stringify(pre));
  // phase 2: restart — recovery must resolve via the REAL idempotency ledger
  ctx=await launch();
  page=ctx.pages()[0]||await ctx.newPage();
  await page.goto(url,{waitUntil:'load'});
  await page.waitForFunction(()=>typeof window.m8State==='function',null,{timeout:20000});
  await page.waitForTimeout(3500);
  const post=await page.evaluate(async()=>{
    await new Promise(x=>trainingPull(x));
    await new Promise(x=>setTimeout(x,1500));
    const u=pbUid();
    return {state:m8State(),journal:!!localStorage.getItem('wl_training_journal__'+u),
      dirty:!!localStorage.getItem('wl_training_dirty__'+u),
      base:JSON.parse(localStorage.getItem('wl_training_base__'+u)||'null'),
      editSurvives:state.training.exercises.some(x=>x.id==='real')};});
  console.log('phase2 (after restart):',JSON.stringify(post));
  await ctx.close();server.close();
  // server-side truth + cleanup via the NAS
  const truth=ssh("/usr/local/bin/node /volume1/homes/NAS_ACCOUNT/compound-coach/pb-util.mjs truthclean "+uid);
  console.log('server truth + cleanup:',truth.trim().split('\n').pop());
  const ok=post.state==='clean'&&!post.journal&&!post.dirty&&post.editSurvives&&post.base&&post.base.rev>=1;
  console.log(ok?'CLIENT-RESTART RECOVERY: PASSED against the real ledger':'FAILED');
  process.exitCode=ok?0:1;
})().catch(e=>{console.error('FATAL',e);process.exitCode=1;});
