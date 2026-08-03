/* C11-M8 quota (browser) — B6/C12: storage exhaustion under realistic
   combined occupancy must fail CLOSED for the operation, never the data.
       CF_SRC=<file> node <this> */
const path=require('path'),http=require('http'),fs=require('fs');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const SRC=process.env.CF_SRC||'/home/griffin/projects/compound-app/index.html';
let passed=0;const failures=[];
const test=(n,f)=>{try{f();passed++;console.log('  ✓ '+n);}catch(e){failures.push(n);console.log('  ✗ '+n+'\n      '+(e&&e.message));}};
const ok=(v,m)=>{if(!v)throw new Error(m||'expected truthy');};
(async()=>{
  const html=fs.readFileSync(SRC,'utf8');
  const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch();
  const ctx=await browser.newContext();
  await ctx.addInitScript(()=>{
    localStorage.setItem('wl_pb',JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok',email:'a@x.com'}));
    localStorage.setItem('wl_last_owner','userA');
    localStorage.setItem('wl_v1',JSON.stringify({settings:{onboarded:true,units:'lbs'},weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},statuses:[],presets:[],skips:{},nightlyLog:{}}));
  });
  await ctx.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],token:'tok',record:{id:'userA'}})}));
  /* M10 (increment 5): this suite edits and saves as a signed-in device, and
     under the wired gate a signed-in device must hold the writer lease. Answer
     the lease route as the granting server — HARNESS ONLY, no product change,
     and the same disclosed change already made to c11m8-faults and
     c14-correctness-fixes. Without it the edit under exhaustion is refused as
     "not the writer" long before M8's storage handling is reached, so the
     suite stops testing what it is named for. Every assertion is unchanged. */
  await ctx.route('**/api/cf/writer/lease',r=>{
    let b={};try{b=JSON.parse(r.request().postData()||'{}');}catch(e){}
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,exists:true,granted:true,
      fence:1,holderDeviceId:b.deviceId||'dev',deviceName:b.deviceName||'x',active:true,
      serverNow:Date.now(),ttlMs:86400000})});});
  await ctx.route('**/api/collections/appdata/records**',r=>r.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({items:[{id:'rec1',user:'userA',training:null,trainingRev:0}]})}));
  await ctx.route('**/api/cf/appdata/commit',r=>{const b=JSON.parse(r.request().postData());
    r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,subsystem:'training',newRev:b.expectedRev+1})});});
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  await page.waitForFunction(()=>typeof window.m8State==='function',null,{timeout:15000});
  await page.waitForTimeout(1500);
  const out=await page.evaluate(async()=>{
    const r={};
    // realistic combined occupancy: live training grown large + core data,
    // then fill the remaining quota with app-shaped ballast
    for(let i=0;i<40;i++)state.training.exercises.push({id:'x'+i,name:'Exercise '+i,muscle:'back',notes:[{id:'n'+i,text:'note '.repeat(50)}]});
    saveTraining();m8Push();await new Promise(rr=>setTimeout(rr,400));
    r.preState=m8State();
    let filled=0;
    try{const chunk='x'.repeat(64*1024);
      for(let i=0;i<200;i++){localStorage.setItem('wl_ballast_'+i,chunk);filled=i;}}catch(e){}
    r.filledKB=(filled*64);
    // an edit under exhaustion: dirty write may fail -> blocked, or succeed
    const before=JSON.stringify(state.training.exercises.length);
    state.training.exercises.push({id:'over',name:'Overflow',muscle:'back',notes:[]});
    let threw=false;try{saveTraining();}catch(e){threw=true;}
    await new Promise(rr=>setTimeout(rr,200));
    // 13: the verified marker (or explicit block) must exist BEFORE any
    // network action — captured before the push is even attempted
    const preNet={state:m8State(),dirtyRaw:localStorage.getItem('wl_training_dirty__userA')};
    r.preNetState=preNet.state;
    r.preNetDirtyBytes=preNet.dirtyRaw;
    r.preNetBlocked=(typeof m8StorageBlocked!=='undefined')&&m8StorageBlocked;
    r.primaryPersisted=(function(){try{return JSON.parse(localStorage.getItem('wl_training_v1')).exercises.some(x=>x.id==='over');}catch(e){return false;}})();
    r.preNetDirtyVerified=(function(){try{const d=JSON.parse(preNet.dirtyRaw);return d&&d.owner==='userA'&&d.gen>=1&&(r.primaryPersisted?d.persistedGen===d.gen:true);}catch(e){return false;}})();
    const req0=performance.getEntriesByType('resource').filter(x=>/cf\/appdata\/commit/.test(x.name)).length;
    m8Push();await new Promise(rr=>setTimeout(rr,500));
    r.commitReqs=performance.getEntriesByType('resource').filter(x=>/cf\/appdata\/commit/.test(x.name)).length-req0;
    r.blockedNoRequest=!r.preNetBlocked||r.commitReqs===0;
    const disk=(function(){try{return JSON.parse(localStorage.getItem('wl_training_v1')||'{}');}catch(e){return {};}})();
    r.liveIntact=state.training.exercises.some(x=>x.id==='over');
    r.stateNow=m8State();
    // 13: after an edit under exhaustion the state must be a VERIFIED dirty
    // marker or an explicit block — never clean-with-changes
    r.dirtyOrBlocked=(r.preNetState==='blocked')||(r.preNetState==='dirty'&&r.preNetDirtyVerified);
    r.noThrow=!threw;
    r.baseParses=(function(){try{const b=localStorage.getItem('wl_training_base__userA');if(!b)return true;JSON.parse(b);return true;}catch(e){return false;}})();
    r.dirtyParses=(function(){try{const d=localStorage.getItem('wl_training_dirty__userA');if(!d)return true;JSON.parse(d);return true;}catch(e){return false;}})();
    // release pressure: everything must recover on the next push
    for(let i=0;i<200;i++)localStorage.removeItem('wl_ballast_'+i);
    if(typeof m8StorageBlocked!=='undefined'&&m8StorageBlocked){r.recoveredNote='blocked-stays-until-reload';}
    saveTraining();m8Push();await new Promise(rr=>setTimeout(rr,500));
    r.afterRelease=m8State();
    return r;
  });
  console.log('\nC11-M8 quota — fail-closed under combined occupancy\n  source: '+SRC);
  console.log('  ballast ~'+out.filledKB+'KB; preNet state='+out.preNetState+' blocked='+out.preNetBlocked+' primaryPersisted='+out.primaryPersisted+' commitReqs='+out.commitReqs+'; dirty bytes: '+String(out.preNetDirtyBytes).slice(0,90));
  test('B6: exhaustion never throws through the save path',()=>ok(out.noThrow));
  test('B6: the live in-memory copy keeps the edit regardless',()=>ok(out.liveIntact));
  test('B6/13: BEFORE any network action the edit is a VERIFIED dirty marker or an explicit block',()=>ok(out.dirtyOrBlocked,out.preNetState));
  test('B6/13: a blocked state sent ZERO commit requests',()=>ok(out.blockedNoRequest,'reqs='+out.commitReqs));
  test('B6: no sync key is left half-written (base and dirty both parse)',()=>ok(out.baseParses&&out.dirtyParses));
  test('no page errors across the run',()=>ok(errs.length===0,errs.join('; ')));
  await browser.close();server.close();
  console.log('\n'+(failures.length?`FAILED — ${passed} passed, ${failures.length} failed`:`OK — ${passed} passed`));
  process.exitCode=failures.length?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
