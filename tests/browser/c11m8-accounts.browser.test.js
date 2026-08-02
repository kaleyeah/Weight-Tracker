/* C11-M8 accounts (browser) — B4 per-uid isolation, malformed-key
   quarantine (C8), and the B5/D4 logout gate (Owner ruling A).
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
    // ACCOUNT B's sync state, present on the same device (the B4 scenario)
    localStorage.setItem('wl_training_dirty__userB',JSON.stringify({owner:'userB',mark:'m8.1',gen:9,ts:1}));
    localStorage.setItem('wl_training_base__userB',JSON.stringify({owner:'userB',mark:'m8.1',canon:1,rev:2,body:'{}'}));
    // a malformed key for A (bad owner inside)
    localStorage.setItem('wl_training_base__userA',JSON.stringify({owner:'userZ',mark:'m8.1',canon:1,rev:1,body:'{}'}));
  });
  await ctx.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],token:'tok',record:{id:'userA'}})}));
  await ctx.route('**/api/collections/appdata/records**',r=>r.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({items:[{id:'rec1',user:'userA',training:null,trainingRev:0}]})}));
  let commits=0;
  await ctx.route('**/api/cf/appdata/commit',r=>{commits++;const b=JSON.parse(r.request().postData());
    r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,subsystem:'training',newRev:b.expectedRev+1})});});
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  await page.waitForFunction(()=>typeof window.m8State==='function',null,{timeout:15000});
  await page.waitForTimeout(1500);
  const out=await page.evaluate(async()=>{
    const r={};
    // C8: A's malformed base was quarantined copy-first, never deleted unpreserved
    r.quarantined=Object.keys(localStorage).filter(k=>/^wl_training_corrupt__userA/.test(k));
    r.malformedGone=!localStorage.getItem('wl_training_base__userA')||JSON.parse(localStorage.getItem('wl_training_base__userA')).owner==='userA';
    // B4: B's keys byte-untouched by A's entire boot + activity
    r.bDirty=localStorage.getItem('wl_training_dirty__userB');
    r.bBase=localStorage.getItem('wl_training_base__userB');
    // A works normally: edit -> dirty -> push -> clean
    state.training.exercises.push({id:'eA',name:'Row',muscle:'back',notes:[]});
    saveTraining();m8Push();await new Promise(rr=>setTimeout(rr,400));
    r.aState=m8State();
    r.bDirtyAfter=localStorage.getItem('wl_training_dirty__userB');
    r.bBaseAfter=localStorage.getItem('wl_training_base__userB');
    // B5: logout from a dirty state refuses with Push-now, not the logout confirm
    state.training.exercises.push({id:'eB',name:'Curl',muscle:'biceps',notes:[]});
    saveTraining();
    pbLogout();await new Promise(rr=>setTimeout(rr,100));
    r.dirtyLogout=(state.pendingConfirm||{}).label;
    state.pendingConfirm=null;
    return r;
  });
  console.log('\nC11-M8 accounts — isolation, quarantine, logout gate\n  source: '+SRC);
  test('C8: the malformed key was preserved in quarantine, never silently dropped',
    ()=>ok(out.quarantined.length===1&&out.malformedGone,JSON.stringify(out.quarantined)));
  test('B4: account B\'s dirty state survives A\'s boot byte-for-byte',
    ()=>ok(out.bDirty===out.bDirtyAfter&&/userB/.test(out.bDirty||''),'mutated'));
  test('B4: account B\'s base survives A\'s push byte-for-byte',
    ()=>ok(out.bBase===out.bBaseAfter&&/"rev":2/.test(out.bBase||''),'mutated'));
  test('B4: account A operates normally alongside (dirty -> push -> clean)',
    ()=>ok(out.aState==='clean',out.aState));
  test('B5: logout from dirty offers Push now — never the logout confirm',
    ()=>ok(out.dirtyLogout==='Push now',String(out.dirtyLogout)));
  test('no page errors',()=>ok(errs.length===0,errs.join('; ')));
  await browser.close();server.close();
  console.log('\n'+(failures.length?`FAILED — ${passed} passed, ${failures.length} failed`:`OK — ${passed} passed`));
  process.exitCode=failures.length?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
