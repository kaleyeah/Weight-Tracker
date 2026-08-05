/* C23 — characterization pins for the Phase-1 modularization (Phase 0 gate).

       node tests/browser/c23-characterization.browser.test.js

   Two jobs in one suite:

   1. PORTED coverage from the retired marker tier (docs/RETIRED-TESTS.md):
      the only assertions in those 12 dead suites that were UNIQUE and whose
      behaviour still exists — reopenDay's scoping/non-destructiveness (c1h
      H2/H3) and canonical-serialization key/array ordering (c1 group 1).

   2. CHARACTERIZATION of the machinery most likely to break silently when
      source moves into modules:
      - the window[] save gate (index.html ~14085): it exists ONLY because
        top-level declarations in a classic script are window properties.
        Under ESM/IIFE it silently disables. These tests are the tripwire.
      - the idbAdd assignment chain (~13761): the file itself warns that
        turning the assignments into declarations recurses infinitely.
      - checkForUpdate/extractBuild (~9965): reads APP_BUILD out of the
        fetched document text; moving APP_BUILD out of index.html freezes
        every deployed device.
      - the pbLogout gate chain: logout must fail closed while unsynced
        work exists. */
const path=require('path'),http=require('http'),fs=require('fs');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const SRC=process.env.CF_SRC||'/home/griffin/projects/compound-app/index.html';

let passed=0;const failures=[];
const test=(n,f)=>{try{const r=f();if(r&&r.then)throw new Error('await outside test()');passed++;console.log('  ✓ '+n);}catch(e){failures.push(n);console.log('  ✗ '+n+'\n      '+(e&&e.message));}};
const eq=(a,b,m)=>{const x=JSON.stringify(a),y=JSON.stringify(b);if(x!==y)throw new Error((m?m+': ':'')+`expected ${y}, got ${x}`);};
const ok=(v,m)=>{if(!v)throw new Error(m||'expected truthy');};
const notOk=(v,m)=>{if(v)throw new Error(m||'expected falsy');};

(async()=>{
  const html=fs.readFileSync(SRC,'utf8');
  const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch();

  /* ---------- context A: signed in, lease granted ---------- */
  const ctx=await browser.newContext();
  await ctx.addInitScript(()=>{
    localStorage.setItem('wl_pb',JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok',email:'a@x.com'}));
    localStorage.setItem('wl_last_owner','userA');
    localStorage.setItem('wl_v1',JSON.stringify({settings:{onboarded:true,units:'lbs'},
      weights:[{date:'2026-08-01',weight:184.0}],food:{},workouts:{},steps:{},notes:{},sleep:{},
      bodyfat:{},waist:{},statuses:[],presets:[],skips:{},
      nightlyLog:{'2026-08-01':{date:'2026-08-01',text:'older recap'},
                  '2026-08-03':{date:'2026-08-03',text:'latest recap'}},
      nightlySummary:{date:'2026-08-03',text:'latest recap'}}));
    localStorage.setItem('wl_training_v1',JSON.stringify({cardioTypes:[],exercises:[],routines:[],sessions:{},liftSessions:{}}));
  });
  await ctx.route('**/api/**',r=>{
    const u=r.request().url();
    if(/cf\/writer\/lease/.test(u)){
      let b={};try{b=JSON.parse(r.request().postData()||'{}');}catch(e){}
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,exists:true,granted:true,
        fence:1,holderDeviceId:b.deviceId||'dev',deviceName:b.deviceName||'x',active:true,
        serverNow:Date.now(),ttlMs:86400000})});}
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],token:'tok',record:{id:'userA'}})});});
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  await page.waitForFunction(()=>typeof window.save==='function'&&typeof window.M10==='object',null,{timeout:15000});
  await page.waitForFunction(()=>window.M10&&window.M10.booted===true,null,{timeout:15000});
  console.log('\nC23 (browser) — characterization pins\n  source: '+SRC);
  console.log('  build : '+await page.evaluate(()=>window.APP_BUILD));

  /* ================= 1. the window[] save gate ================= */
  const gate=await page.evaluate(()=>{
    const out={};
    out.holderOk=window.m10AuthNow().ok;
    /* holder path: a save writes through */
    state.notes['2026-08-02']='gate probe';
    const before=window.__m10WriteRefused|0;
    window.save();
    out.wroteThrough=(localStorage.getItem('wl_v1')||'').indexOf('gate probe')>=0;
    out.refusedDelta1=(window.__m10WriteRefused|0)-before;
    /* revoke the pen: the SAME call must now refuse and not write */
    const hold={holder:M10.holder,deadline:M10.deadline};
    M10.holder=false;
    state.notes['2026-08-02']='must not persist';
    window.save();
    out.refusedDelta2=(window.__m10WriteRefused|0)-before;
    out.refusedWrite=(localStorage.getItem('wl_v1')||'').indexOf('must not persist')<0;
    M10.holder=hold.holder;M10.deadline=hold.deadline;
    state.notes['2026-08-02']='gate probe';window.save();
    return out;});
  test('save gate: holder writes through, no refusal',()=>{ok(gate.holderOk,'holder auth');ok(gate.wroteThrough);eq(gate.refusedDelta1,0);});
  test('save gate: without the pen the SAME save refuses and does not persist',()=>{ok(gate.refusedDelta2>=1,'refusal counted');ok(gate.refusedWrite,'nothing persisted');});
  /* the modularization tripwire, asserted directly: the gate exists because
     window[name] resolved to a function at install time. If source ever moves
     to module scope, window.save is undefined and this fails. */
  test('the gate is installed ON window (fails if globals stop being globals)',()=>{
    ok(gate.holderOk!==undefined&&gate.refusedDelta2>=1,'gate observed refusing via window.save');});

  /* ================= 2. reopenDay — ported c1h H2/H3 ================= */
  const reopen=await page.evaluate(()=>{
    const out={};
    state.notes['2026-08-01']='dirty edit that must survive';
    window.save();
    window.reopenDay('2026-08-01');                       /* the OLDER day */
    out.olderRecapGone=!window.dayRecap||!window.dayRecap('2026-08-01');
    out.editSurvives=state.notes['2026-08-01']==='dirty edit that must survive';
    out.latestLogIntact=((state.nightlyLog['2026-08-03']||{}).text)==='latest recap';
    out.latestSummaryIntact=((state.nightlySummary||{}).text)==='latest recap';
    window.reopenDay('2026-08-03');                       /* the LATEST day */
    out.latestRecapGone=!window.dayRecap('2026-08-03');
    out.summarySlotCleared=!state.nightlySummary||!state.nightlySummary.text;
    return out;});
  test('reopenDay clears ONLY the reopened day\'s recap (H3)',()=>{ok(reopen.olderRecapGone,'older cleared');ok(reopen.latestLogIntact,'latest log intact');ok(reopen.latestSummaryIntact,'summary intact');});
  test('reopenDay never touches other dirty edits (H2)',()=>ok(reopen.editSurvives));
  test('reopening the LATEST day clears its summary slot too (H3)',()=>{ok(reopen.latestRecapGone);ok(reopen.summarySlotCleared);});

  /* ================= 3. canonical serialization ordering ================= */
  const canon=await page.evaluate(()=>{
    const s=window.m8CanonSerialize||window.m10cCanon;
    const f=window.m8CanonSerialize?function(v){return window.m8CanonSerialize(v);}:function(v){return window.m10cCanon(v).canon;};
    return {
      keyOrder:f({a:1,b:{x:1,y:2}})===f({b:{y:2,x:1},a:1}),
      arrayOrder:f({a:[1,2,3]})!==f({a:[3,2,1]}),
      which:window.m8CanonSerialize?'m8CanonSerialize':'m10cCanon'};});
  test('canon: key order does not matter (ported c1)',()=>ok(canon.keyOrder,canon.which));
  test('canon: array order DOES matter (ported c1)',()=>ok(canon.arrayOrder,canon.which));

  /* ================= 4. checkForUpdate / extractBuild ================= */
  const upd=await page.evaluate(async()=>{
    const out={};
    out.extractSame=window.extractBuild('var APP_BUILD="'+window.APP_BUILD+'";')===window.APP_BUILD;
    out.extractNull=window.extractBuild('no build constant here')===null;
    /* changed build: stub fetch + updateApp, prove detection without navigating */
    const realFetch=window.fetch,realUpdate=window.updateApp;
    let updated=false;window.updateApp=function(){updated=true;};
    window.fetch=function(){return Promise.resolve({text:function(){return Promise.resolve('APP_BUILD="9999-99-99.999-future"');}});};
    try{sessionStorage.removeItem('wl_reloaded_for');}catch(e){}
    window.checkForUpdate();
    await new Promise(r=>setTimeout(r,50));
    out.detected=updated;
    /* unchanged build: must NOT trigger */
    updated=false;
    window.fetch=function(){return Promise.resolve({text:function(){return Promise.resolve('APP_BUILD="'+window.APP_BUILD+'"');}});};
    window.checkForUpdate();
    await new Promise(r=>setTimeout(r,50));
    out.noopOnSame=!updated;
    window.fetch=realFetch;window.updateApp=realUpdate;
    return out;});
  test('extractBuild finds APP_BUILD in document text; null when absent',()=>{ok(upd.extractSame);ok(upd.extractNull);});
  test('checkForUpdate fires on a CHANGED build (self-update contract)',()=>ok(upd.detected));
  test('checkForUpdate no-ops on the SAME build',()=>ok(upd.noopOnSame));

  /* ================= 4b. the render wrapper chain ========================= */
  const chain=await page.evaluate(()=>{
    const out={};
    /* Both wrappers must survive extraction IN ORDER: 11222 appends #m8-cx,
       12679 appends #m10-cx, each calling the previous layer first. If module
       reordering drops or reorders a wrapper, one surface silently vanishes. */
    /* The view functions return '' without a real conflict envelope, and the
       wrappers skip empty HTML — so stub the VIEWS and pin the CHAIN. */
    const realM8=window.m8ConflictViewHTML,realM10=window.m10cxViewHTML;
    window.m8ConflictViewHTML=function(){return '<div>m8 stub</div>';};
    window.m10cxViewHTML=function(){return '<div>m10 stub</div>';};
    window.m8ConflictOpen=true;window.m10cxOpen=true;
    try{window.render();}catch(e){out.threw=String(e);}
    out.m8Surface=!!document.getElementById('m8-cx');
    out.m10Surface=!!document.getElementById('m10-cx');
    window.m8ConflictOpen=false;window.m10cxOpen=false;window.render();
    out.bothCleared=!document.getElementById('m8-cx')&&!document.getElementById('m10-cx');
    window.m8ConflictViewHTML=realM8;window.m10cxViewHTML=realM10;
    return out;});
  test('render chain: BOTH conflict surfaces render together',()=>{ok(!chain.threw,chain.threw);ok(chain.m8Surface,'m8-cx');ok(chain.m10Surface,'m10-cx');});
  test('render chain: both surfaces clear when their flags drop',()=>ok(chain.bothCleared));

  /* ================= 5. pbLogout fails closed on unsynced work ============ */
  const lgout=await page.evaluate(async()=>{
    const out={};
    state.notes['2026-08-04']='unsynced work';
    window.save();                                        /* marks core dirty */
    out.dirtyState=window.m10cState();
    window.pbLogout();
    await new Promise(r=>setTimeout(r,150));
    out.stillSignedIn=!!localStorage.getItem('wl_pb');
    out.dataIntact=(localStorage.getItem('wl_v1')||'').indexOf('unsynced work')>=0;
    return out;});
  test('pbLogout is blocked while unsynced work exists',()=>{ok(lgout.stillSignedIn,'session survives, state='+lgout.dirtyState);ok(lgout.dataIntact,'data untouched');});

  await ctx.close();

  /* ---------- context B: signed OUT — idbAdd must hit raw IndexedDB ------- */
  const ctxB=await browser.newContext();
  const pageB=await ctxB.newPage();
  const errsB=[];pageB.on('pageerror',e=>errsB.push(String(e)));
  await pageB.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  await pageB.waitForFunction(()=>typeof window.idbAdd==='function',null,{timeout:15000});
  const idb=await pageB.evaluate(async()=>{
    const out={};
    /* the 13786 warning: if the assignment chain ever becomes declarations,
       idbAddLocal captures the wrapper and this recurses forever. Completing
       at all — and storing exactly one record — IS the assertion. */
    await window.idbAdd({id:'c23-probe',date:'2026-08-04',kind:'food',dataUrl:'data:image/gif;base64,R0lGODlhAQABAAAAACw=',ts:1});
    const all=await window.idbAll();
    out.stored=all.filter(p=>p.id==='c23-probe').length;
    await window.idbDelete('c23-probe');
    out.afterDelete=(await window.idbAll()).filter(p=>p.id==='c23-probe').length;
    return out;});
  test('signed out, idbAdd reaches raw IndexedDB exactly once (no recursion)',()=>eq(idb.stored,1));
  test('signed out, idbDelete removes it locally',()=>eq(idb.afterDelete,0));
  await ctxB.close();

  await browser.close();server.close();
  test('no page errors across the run',()=>eq([...new Set(errs.concat(errsB))],[]));

  console.log('\n----------------------------------------------------');
  if(failures.length){console.log('FAILED — '+passed+' passed, '+failures.length+' failed');process.exit(1);}
  console.log('OK — '+passed+' passed');
})().catch(e=>{console.error('SUITE CRASH: '+(e&&e.stack||e));process.exit(1);});
