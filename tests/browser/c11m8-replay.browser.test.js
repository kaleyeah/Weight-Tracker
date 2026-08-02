/* C11-M8 replay (browser) — E5 crash points and F7 replay outcomes: an ack
   journal survives a crash mid-push; boot recovery must resolve it through
   the idempotency ledger or exact comparison, never inference (contract §1
   transition 1, E2/F3-F5).      CF_SRC=<file> node <this> */
const path=require('path'),http=require('http'),fs=require('fs');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const SRC=process.env.CF_SRC||'/home/griffin/projects/compound-app/index.html';
let passed=0;const failures=[];
const test=(n,f)=>{try{f();passed++;console.log('  ✓ '+n);}catch(e){failures.push(n);console.log('  ✗ '+n+'\n      '+(e&&e.message));}};
const ok=(v,m)=>{if(!v)throw new Error(m||'expected truthy');};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error((m||'')+` expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);};
(async()=>{
  const html=fs.readFileSync(SRC,'utf8');
  const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch();
  // the canonical fixtures: old base (empty-ish) and the pushed copy
  const oldT={cardioTypes:["Peloton"],exercises:[],liftSessions:{},routines:[],sessions:{}};
  const newT={cardioTypes:["Peloton"],exercises:[{id:"e1",muscle:"back",name:"Row",notes:[]}],liftSessions:{},routines:[],sessions:{}};
  const canon=o=>JSON.stringify(o,Object.keys(JSON.parse(JSON.stringify(o))).sort());
  // exact canonical strings must match the app's m8Canon: sorted keys at every
  // level. These fixtures are flat enough that a probe validates them below.
  const boot=async(opts)=>{
    const ctx=await browser.newContext();
    await ctx.addInitScript((cfg)=>{
      localStorage.setItem('wl_pb',JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok',email:'a@x.com'}));
      localStorage.setItem('wl_last_owner','userA');
      localStorage.setItem('wl_v1',JSON.stringify({settings:{onboarded:true,units:'lbs'},weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},statuses:[],presets:[],skips:{},nightlyLog:{}}));
      localStorage.setItem('wl_training_v1',cfg.localTraining);
      localStorage.setItem('wl_training_base__userA',JSON.stringify({owner:'userA',mark:'m8.1',canon:1,rev:cfg.baseRev,body:cfg.baseBody}));
      if(cfg.dirtyGen!=null)localStorage.setItem('wl_training_dirty__userA',JSON.stringify({owner:'userA',mark:'m8.1',gen:cfg.dirtyGen,persistedGen:cfg.dirtyGen,ts:Date.now()}));
      localStorage.setItem('wl_training_journal__userA',JSON.stringify(Object.assign({owner:'userA',mark:'m8.1'},cfg.journal)));
    },opts.seed);
    let commitCalls=0,recordCalls=0;
    let srvT=opts.serverTraining,srvR=opts.serverRev;/* stateful: a successful
      commit updates what the record route serves, like the real server */
    await ctx.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],token:'tok',record:{id:'userA'}})}));
    await ctx.route('**/api/collections/appdata/records**',r=>{recordCalls++;
      r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[{id:'rec1',user:'userA',training:srvT,trainingRev:srvR}]})});});
    await ctx.route('**/api/cf/appdata/commit',r=>{commitCalls++;
      if(opts.commit==='abort'){r.abort();return;}
      try{const body=JSON.parse(opts.commit.body);
        if(body.ok&&body.newRev!=null){srvT=JSON.parse(r.request().postData()).payload;srvR=body.newRev;}}catch(e){}
      r.fulfill(opts.commit);});
    const page=await ctx.newPage();
    const errs=[];page.on('pageerror',e=>errs.push(String(e)));
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
    await page.waitForFunction(()=>typeof window.m8State==='function',null,{timeout:15000});
    await page.waitForTimeout(1800);
    const out=await page.evaluate(()=>({
      state:m8State(),
      base:JSON.parse(localStorage.getItem('wl_training_base__userA')||'null'),
      dirty:!!localStorage.getItem('wl_training_dirty__userA'),
      journal:!!localStorage.getItem('wl_training_journal__userA'),
      conflict:!!localStorage.getItem('wl_training_conflict__userA'),
      blocked:(typeof m8StorageBlocked!=='undefined')&&m8StorageBlocked}));
    out.commitCalls=commitCalls;out.recordCalls=recordCalls;out.errs=errs;
    await ctx.close();return out;};

  console.log('\nC11-M8 replay — E5/F7 recovery of a surviving ack journal\n  source: '+SRC);
  // probe the app's exact canonical strings for the fixtures
  {const ctx=await browser.newContext();
   await ctx.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[]})}));
   const page=await ctx.newPage();
   await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
   await page.waitForFunction(()=>typeof window.m8Canon==='function',null,{timeout:15000});
   var CAN=await page.evaluate(([a,b])=>[m8Canon(a).canon,m8Canon(b).canon],[oldT,newT]);
   await ctx.close();}
  const [OLDC,NEWC]=CAN;
  const J=(phase,extra)=>Object.assign({op:'ack',phase:phase,startedAt:Date.now()-60000,
    expect:Object.assign({oldBaseCanon:OLDC,expectedRev:3,pushedCanon:NEWC,gen:5,requestId:'m8-userA-test-req-1'},extra)},{});
  const seedBase={localTraining:NEWC,baseRev:3,baseBody:OLDC,dirtyGen:5};

  // F7-1: committed with the response lost — idempotent replay acks
  const r1=await boot({seed:Object.assign({journal:J('intent')},seedBase),serverTraining:JSON.parse(NEWC),serverRev:4,
    commit:{status:200,contentType:'application/json',body:JSON.stringify({ok:true,replay:true,subsystem:'training',newRev:4})}});
  test('F7-1: lost-response replay acks — base at the replayed rev, dirty cleared, journal gone',
    ()=>{eq(r1.state,'clean');eq(r1.base.rev,4);ok(!r1.dirty&&!r1.journal,JSON.stringify(r1));});
  // F7-2 (real route): an unexecuted request has NO ledger row — the replay
  // simply executes as a fresh commit at the unchanged revision
  const r2=await boot({seed:Object.assign({journal:J('intent')},seedBase),serverTraining:JSON.parse(OLDC),serverRev:3,
    commit:{status:200,contentType:'application/json',body:JSON.stringify({ok:true,subsystem:'training',newRev:4})}});
  test('F7-2: no ledger row — the replay executes fresh and acks (base rev 4, clean)',
    ()=>{ok(r2.state==='clean'&&r2.base.rev===4&&!r2.journal&&!r2.dirty,JSON.stringify({state:r2.state,rev:r2.base&&r2.base.rev,dirty:r2.dirty,journal:r2.journal,conflict:r2.conflict,blocked:r2.blocked,commits:r2.commitCalls,records:r2.recordCalls}));});
  // F7-2b: not-applied is proven only by the fetch path (expired ledger,
  // server untouched at the expected revision)
  const r2b=await boot({seed:Object.assign({journal:Object.assign(J('intent'),{startedAt:Date.now()-31*24*3600*1000})},seedBase),
    serverTraining:JSON.parse(OLDC),serverRev:3,commit:'abort'});
  test('F7-2b: expired ledger + untouched server — not-applied resolves, dirty retained, no commit call',
    ()=>{ok(!r2b.journal);ok(r2b.dirty);ok(!r2b.conflict);eq(r2b.commitCalls,0,'replay attempted');});
  // F7-3: replay conflicts but fetch shows the push actually landed
  const r3=await boot({seed:Object.assign({journal:J('intent')},seedBase),serverTraining:JSON.parse(NEWC),serverRev:6,
    commit:{status:409,contentType:'application/json',body:JSON.stringify({ok:false,conflict:true,subsystem:'training',serverRev:6,payload:JSON.parse(NEWC)})}});
  test('F7-3: replay-conflict + fetch proves applied — base adopts the fetched rev',
    ()=>{eq(r3.state,'clean');eq(r3.base.rev,6);ok(!r3.dirty&&!r3.journal,JSON.stringify(r3));});
  // F7-4: intervening third-party write — conflict, never inference
  const third={cardioTypes:["Peloton"],exercises:[{id:"eZ",muscle:"chest",name:"Press",notes:[]}],liftSessions:{},routines:[],sessions:{}};
  const r4=await boot({seed:Object.assign({journal:J('intent')},seedBase),serverTraining:third,serverRev:7,
    commit:{status:409,contentType:'application/json',body:JSON.stringify({ok:false,conflict:true,subsystem:'training',serverRev:7,payload:third})}});
  test('F7-4: intervening write — held as conflict, local intact',
    ()=>{eq(r4.state,'conflict');ok(r4.conflict&&!r4.journal,JSON.stringify(r4));});
  // F7-5: same key recognized with different identity — hard stop, journal preserved
  const r5=await boot({seed:Object.assign({journal:J('intent')},seedBase),serverTraining:JSON.parse(OLDC),serverRev:3,
    commit:{status:409,contentType:'application/json',body:JSON.stringify({ok:false,error:'idempotency key reused with a different request'})}});
  test('F7-5: key-reuse mismatch — hard stop, journal PRESERVED, sync blocked',
    ()=>{ok(r5.journal,'journal lost');ok(r5.blocked,'not blocked');});
  // F7-6: repeated transport failure — unresolved, nothing inferred, no new mutation
  const r6=await boot({seed:Object.assign({journal:J('intent')},seedBase),serverTraining:JSON.parse(OLDC),serverRev:3,commit:'abort'});
  test('F7-6: transport failure again — journal and dirty survive untouched',
    ()=>{ok(r6.journal&&r6.dirty,JSON.stringify(r6));ok(!r6.conflict);});
  // F7-7: ledger expired — replay must be SKIPPED, fetch-and-compare decides
  const r7=await boot({seed:Object.assign({journal:Object.assign(J('intent'),{startedAt:Date.now()-31*24*3600*1000})},seedBase),
    serverTraining:JSON.parse(NEWC),serverRev:9,
    commit:{status:200,contentType:'application/json',body:JSON.stringify({ok:true,newRev:99})}});
  test('F7-7: expired ledger skips replay (no commit call) and proves the outcome by fetch',
    ()=>{eq(r7.commitCalls,0,'replay was attempted');eq(r7.base.rev,9);ok(!r7.journal,JSON.stringify(r7));});
  // E5: net-done journal — key phases finish with NO network at all
  const r8=await boot({seed:Object.assign({journal:J('net-done',{newRev:4})},seedBase),serverTraining:JSON.parse(NEWC),serverRev:4,
    commit:'abort'});
  test('E5: a net-done journal completes locally — no commit call, base at newRev',
    ()=>{eq(r8.commitCalls,0);eq(r8.base.rev,4);eq(r8.state,'clean');ok(!r8.journal,JSON.stringify(r8));});
  test('no page errors across all cases',()=>ok([r1,r2,r3,r4,r5,r6,r7,r8].every(x=>!x.errs.length),'page errors seen'));
  await browser.close();server.close();
  console.log('\n'+(failures.length?`FAILED — ${passed} passed, ${failures.length} failed`:`OK — ${passed} passed`));
  process.exitCode=failures.length?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
