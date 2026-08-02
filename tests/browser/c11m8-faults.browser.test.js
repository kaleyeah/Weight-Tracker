/* C11-M8 faults (browser) — R10-9/10: real-DOM export gating (share
   rejection, fallback confirm, edit-after-export), Choose Local transport
   ambiguity + restart recovery, choose-server crash at every phase, and
   quarantine fault injection via wrapped Storage primitives.
       CF_SRC=<file> node <this> */
const path=require('path'),http=require('http'),fs=require('fs');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const SRC=process.env.CF_SRC||'/home/griffin/projects/compound-app/index.html';
let passed=0;const failures=[];
const test=(n,f)=>{try{f();passed++;console.log('  ✓ '+n);}catch(e){failures.push(n);console.log('  ✗ '+n+'\n      '+(e&&e.message));}};
const ok=(v,m)=>{if(!v)throw new Error(m||'expected truthy');};
const OLDT={cardioTypes:["Peloton"],exercises:[],liftSessions:{},routines:[],sessions:{}};
(async()=>{
  const html=fs.readFileSync(SRC,'utf8');
  const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch();
  const boot=async(o)=>{
    const ctx=await browser.newContext();
    await ctx.addInitScript((cfg)=>{
      // controllable storage faults
      window.__denySet=cfg.denySet||[];window.__denyRemove=cfg.denyRemove||[];window.__denyGet=cfg.denyGet||[];
      const oSet=Storage.prototype.setItem,oRem=Storage.prototype.removeItem,oGet=Storage.prototype.getItem;
      Storage.prototype.getItem=function(k){if(window.__denyGet.some(rx=>new RegExp(rx).test(k)))throw new DOMException('io','InvalidStateError');return oGet.call(this,k);};
      Storage.prototype.setItem=function(k,v){if(window.__denySet.some(rx=>new RegExp(rx).test(k)))throw new DOMException('quota','QuotaExceededError');return oSet.call(this,k,v);};
      Storage.prototype.removeItem=function(k){if(window.__denyRemove.some(rx=>new RegExp(rx).test(k)))return;return oRem.call(this,k);};
      // share control
      if(cfg.share==='reject'){navigator.canShare=()=>true;navigator.share=()=>Promise.reject(new Error('cancel'));}
      if(cfg.share==='hold'){navigator.canShare=()=>true;navigator.share=()=>new Promise(res=>{window.__resolveShare=res;});}
      localStorage.setItem('wl_pb',JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok',email:'a@x.com'}));
      localStorage.setItem('wl_last_owner','userA');
      localStorage.setItem('wl_v1',JSON.stringify({settings:{onboarded:true,units:'lbs'},weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},statuses:[],presets:[],skips:{},nightlyLog:{}}));
      (cfg.seed||[]).forEach(p=>localStorage.setItem(p[0],p[1]));
    },o);
    let srvT=o.serverTraining!==undefined?o.serverTraining:null,srvR=o.serverRev||0,commits=0;
    await ctx.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],token:'tok',record:{id:'userA'}})}));
    await ctx.route('**/api/collections/appdata/records**',r=>r.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({items:[{id:'rec1',user:'userA',training:srvT,trainingRev:srvR}]})}));
    await ctx.route('**/api/cf/appdata/commit',r=>{commits++;
      if(o.commit==='abort'){r.abort();return;}
      const b=JSON.parse(r.request().postData());
      srvT=b.payload;srvR=b.expectedRev+1;
      r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,subsystem:'training',newRev:srvR})});});
    const page=await ctx.newPage();
    const errs=[];page.on('pageerror',e=>errs.push(String(e)));
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
    await page.waitForFunction(()=>typeof window.m8State==='function',null,{timeout:15000});
    await page.waitForTimeout(1500);
    return {ctx,page,errs,commits:()=>commits};};
  const CX=(exports)=>['wl_training_conflict__userA',JSON.stringify({owner:'userA',mark:'m8.1',canon:1,enteredAt:Date.now(),reason:'t',serverRev:0,serverAtEntry:JSON.stringify(OLDT),localAtEntry:'{}',exports:exports||{}})];

  console.log('\nC11-M8 faults — DOM gating, ambiguity+restart, phase crashes, storage faults\n  source: '+SRC);

  // A: share rejection keeps the gate closed
  {const {ctx,page,errs}=await boot({share:'reject',seed:[CX()]});
   const r=await page.evaluate(async()=>{
     state.view='train';render();await new Promise(x=>setTimeout(x,80));
     document.querySelector('[data-act="m8:cx:open"]').click();await new Promise(x=>setTimeout(x,80));
     document.querySelector('[data-act="m8:cx:export"]').click();await new Promise(x=>setTimeout(x,300));
     const cx=JSON.parse(localStorage.getItem('wl_training_conflict__userA'));
     return {choices:!!document.querySelector('[data-act="m8:cx:local"]'),delivered:!!(cx.exports&&cx.exports.localDone)};});
   test('A: a REJECTED share leaves choices disabled and nothing marked delivered',()=>ok(!r.choices&&!r.delivered,JSON.stringify(r)));
   test('A: no page errors',()=>ok(!errs.length,errs.join(';')));await ctx.close();}

  // B: fallback confirm advances; cancel keeps closed. C: edit re-disables a RENDERED button.
  {const {ctx,page,errs}=await boot({seed:[CX()]});
   const r=await page.evaluate(async()=>{
     state.view='train';render();await new Promise(x=>setTimeout(x,80));
     document.querySelector('[data-act="m8:cx:open"]').click();await new Promise(x=>setTimeout(x,80));
     document.querySelector('[data-act="m8:cx:export"]').click();await new Promise(x=>setTimeout(x,900));
     document.querySelector('[data-act="confirm:no"]').click();await new Promise(x=>setTimeout(x,150));
     const closedAfterCancel=!document.querySelector('[data-act="m8:cx:local"]');
     document.querySelector('[data-act="m8:cx:export"]').click();await new Promise(x=>setTimeout(x,900));
     document.querySelector('[data-act="confirm:yes"]').click();await new Promise(x=>setTimeout(x,200));
     const openAfterConfirm=!!document.querySelector('[data-act="m8:cx:local"]');
     // C: edit -> the rendered button must die
     state.training.exercises.push({id:'z',name:'Z',muscle:'back',notes:[]});saveTraining();render();
     await new Promise(x=>setTimeout(x,120));
     const reDisabled=!document.querySelector('[data-act="m8:cx:local"]');
     // and even a STALE handle refuses in-action
     return {closedAfterCancel,openAfterConfirm,reDisabled,
       conflictStill:!!localStorage.getItem('wl_training_conflict__userA')};});
   test('B: download-fallback cancel keeps the gate closed; confirm opens it',()=>ok(r.closedAfterCancel&&r.openAfterConfirm,JSON.stringify(r)));
   test('C: an edit after export re-disables the rendered choice',()=>ok(r.reDisabled&&r.conflictStill));
   test('B/C: no page errors',()=>ok(!errs.length,errs.join(';')));await ctx.close();}

  // D: Choose Local transport ambiguity -> journal survives -> RESTART -> recovery completes incl. owed conflict phase
  {const b1=await boot({seed:[CX({localGen:0,serverDone:true,localDone:true})],commit:'abort'});
   const r1=await b1.page.evaluate(async()=>{
     state.view='train';render();await new Promise(x=>setTimeout(x,80));
     document.querySelector('[data-act="m8:cx:open"]').click();await new Promise(x=>setTimeout(x,80));
     document.querySelector('[data-act="m8:cx:local"]').click();await new Promise(x=>setTimeout(x,400));
     return {journal:localStorage.getItem('wl_training_journal__userA'),conflict:!!localStorage.getItem('wl_training_conflict__userA'),
       training:localStorage.getItem('wl_training_v1'),dirty:localStorage.getItem('wl_training_dirty__userA')};});
   test('D: transport ambiguity keeps the journal AND the conflict',()=>ok(r1.journal&&r1.conflict,JSON.stringify({j:!!r1.journal,c:r1.conflict})));
   await b1.ctx.close();
   // restart with the surviving state; commit now succeeds (replay path)
   const seed2=[['wl_training_journal__userA',r1.journal],CX({localGen:0,serverDone:true,localDone:true}),
     ['wl_training_v1',r1.training]].concat(r1.dirty?[['wl_training_dirty__userA',r1.dirty]]:[]);
   const b2=await boot({seed:seed2});
   const r2=await b2.page.evaluate(()=>({state:m8State(),journal:!!localStorage.getItem('wl_training_journal__userA'),
     conflict:!!localStorage.getItem('wl_training_conflict__userA'),base:JSON.parse(localStorage.getItem('wl_training_base__userA')||'null')}));
   test('D: restart recovery replays, acks, and clears the OWED conflict phase',
     ()=>ok(r2.state==='clean'&&!r2.journal&&!r2.conflict&&r2.base&&r2.base.rev===1,JSON.stringify(r2)));
   await b2.ctx.close();}

  // E (R11-8, authentic): a VALID choose-server journal seeded before page
  // load at every phase incl. the k3/k4 boundary — the FIRST boot must
  // complete every postcondition, with page errors asserted
  const OLDC='{"cardioTypes":["Peloton"],"exercises":[],"liftSessions":{},"routines":[],"sessions":{}}';
  for(const ph of ['intent','k1','k2','k3']){
    const j=['wl_training_journal__userA',JSON.stringify({owner:'userA',mark:'m8.1',op:'choose-server',phase:ph,startedAt:Date.now(),
      expect:{serverRev:5,serverCanon:OLDC,discardedLocalGen:3}})];
    const b=await boot({seed:[j,CX(),['wl_training_dirty__userA',JSON.stringify({owner:'userA',mark:'m8.1',gen:3,persistedGen:3,ts:1})]],
      serverTraining:JSON.parse('{"cardioTypes":["Peloton"],"exercises":[],"liftSessions":{},"routines":[],"sessions":{}}'),serverRev:5});
    const r=await b.page.evaluate(()=>({state:m8State(),journal:!!localStorage.getItem('wl_training_journal__userA'),
      conflict:!!localStorage.getItem('wl_training_conflict__userA'),dirty:!!localStorage.getItem('wl_training_dirty__userA'),
      base:JSON.parse(localStorage.getItem('wl_training_base__userA')||'null'),
      localIsAdopted:m8Canon(state.training).canon===JSON.parse(localStorage.getItem('wl_training_base__userA')||'{}').body}));
    test(`E(${ph}): FIRST boot completes every choose-server postcondition`,
      ()=>ok(r.state==='clean'&&!r.journal&&!r.conflict&&!r.dirty&&r.base&&r.base.rev===5&&r.localIsAdopted,JSON.stringify(r)));
    test(`E(${ph}): no page errors`,()=>ok(!b.errs.length,b.errs.join(';')));
    await b.ctx.close();}

  // F: quarantine copy failure (setItem denied for corrupt keys) -> original retained, sync blocked
  {const bad=['wl_training_base__userA',JSON.stringify({owner:'userZ',mark:'m8.1',canon:1,rev:1,body:'{}'})];
   const b=await boot({seed:[bad],denySet:['^wl_training_corrupt__']});
   const r=await b.page.evaluate(()=>({orig:!!localStorage.getItem('wl_training_base__userA'),
     blocked:m8StorageBlocked,corrupt:Object.keys(localStorage).filter(k=>/corrupt/.test(k)).length}));
   test('F: quarantine COPY failure retains the original and blocks sync',()=>ok(r.orig&&r.blocked&&r.corrupt===0,JSON.stringify(r)));
   await b.ctx.close();}
  // F2: original-removal failure -> blocked, BOTH copies retained
  {const bad=['wl_training_base__userA',JSON.stringify({owner:'userZ',mark:'m8.1',canon:1,rev:1,body:'{}'})];
   const b=await boot({seed:[bad],denyRemove:['^wl_training_base__userA$']});
   const r=await b.page.evaluate(()=>({orig:!!localStorage.getItem('wl_training_base__userA'),
     blocked:m8StorageBlocked,corrupt:Object.keys(localStorage).filter(k=>/corrupt/.test(k)).length}));
   test('F2: original-removal failure keeps BOTH copies and blocks',()=>ok(r.orig&&r.blocked&&r.corrupt===1,JSON.stringify(r)));
   await b.ctx.close();}

  // G (R11-9): getItem failure can never become absence, quarantine, bootstrap, or network
  {const good=['wl_training_base__userA',JSON.stringify({owner:'userA',mark:'m8.1',canon:1,rev:1,body:'{}'})];
   const b=await boot({seed:[good],denyGet:['^wl_training_base__userA$']});
   const r=await b.page.evaluate(()=>({blocked:m8StorageBlocked,state:m8State(),
     corrupt:Object.keys(localStorage).filter(k=>/corrupt/.test(k)).length}));
   test('G: a READ failure blocks — no absence, no quarantine, no bootstrap',
     ()=>ok(r.blocked&&r.state==='blocked'&&r.corrupt===0,JSON.stringify(r)));
   test('G: zero training commits under read failure',()=>ok(b.commits()===0,'commits='+b.commits()));
   await b.ctx.close();}
  // H (R11-10a): journal-removal failure after a completed ack — transition
  // completes, boot retries only cleanup
  {const b=await boot({seed:[]});
   const r=await b.page.evaluate(async()=>{
     await new Promise(x=>trainingPull(x));
     window.__denyRemove=['^wl_training_journal__userA$'];/* fault begins AFTER a clean boot */
     state.training.exercises.push({id:'e1',name:'Row',muscle:'back',notes:[]});
     saveTraining();m8Push();await new Promise(x=>setTimeout(x,400));
     return {base:JSON.parse(localStorage.getItem('wl_training_base__userA')||'null'),
       dirty:!!localStorage.getItem('wl_training_dirty__userA'),
       journal:!!localStorage.getItem('wl_training_journal__userA'),
       blocked:m8StorageBlocked};});
   test('H: cleanup failure after a completed ack — base advanced, dirty cleared, journal survives, NOT blocked',
     ()=>ok(r.base&&r.base.rev===1&&!r.dirty&&r.journal&&!r.blocked,JSON.stringify(r)));
   const r2=await b.page.evaluate(async()=>{
     window.__denyRemove=[];await new Promise(x=>m8Boot(x));
     return {journal:!!localStorage.getItem('wl_training_journal__userA'),state:m8State(),
       base:JSON.parse(localStorage.getItem('wl_training_base__userA')||'null')};});
   test('H: after the fault lifts, boot retries ONLY cleanup (journal gone, base untouched)',
     ()=>ok(!r2.journal&&r2.state==='clean'&&r2.base.rev===1,JSON.stringify(r2)));
   await b.ctx.close();}
  // I (R11-10c): the finisher's own malformed-dirty guard, invoked directly —
  // boot's copy-first quarantine heals a malformed key BEFORE resolution (that
  // path is covered in the accounts suite), so the guard is driven in-page
  {const b=await boot({seed:[]});
    const r=await b.page.evaluate(async(oldc)=>{
      await new Promise(x=>trainingPull(x));
      const j={owner:'userA',mark:'m8.1',op:'ack',phase:'net-done',startedAt:Date.now(),
        expect:{oldBaseCanon:'{}',expectedRev:0,pushedCanon:oldc,gen:4,requestId:'kx',newRev:1}};
      localStorage.setItem('wl_training_journal__userA',JSON.stringify(j));
      localStorage.setItem('wl_training_dirty__userA','{{{corrupt');
      m8FinishAck(j);
      return {blocked:m8StorageBlocked,journal:!!localStorage.getItem('wl_training_journal__userA'),
        dirtyPreserved:localStorage.getItem('wl_training_dirty__userA')==='{{{corrupt'};
    },'{"cardioTypes":["Peloton"],"exercises":[],"liftSessions":{},"routines":[],"sessions":{}}');
    test('I: malformed dirty during ack completion blocks, journal AND malformed bytes preserved',
      ()=>ok(r.blocked&&r.journal&&r.dirtyPreserved,JSON.stringify(r)));
    await b.ctx.close();}
  // J (R11-10d): base-write failure during adoption — blocked, journal preserved
  {const b=await boot({seed:[],serverTraining:JSON.parse('{"cardioTypes":["Peloton"],"exercises":[],"liftSessions":{},"routines":[],"sessions":{}}'),serverRev:7,denySet:['^wl_training_base__userA$']});
   const r=await b.page.evaluate(()=>({blocked:m8StorageBlocked,journal:!!localStorage.getItem('wl_training_journal__userA'),
     base:!!localStorage.getItem('wl_training_base__userA')}));
   test('J: adoption base-write failure blocks with the journal preserved',
     ()=>ok(r.blocked&&r.journal&&!r.base,JSON.stringify(r)));
   await b.ctx.close();}
  // K (R11-10f): an ack landing while a NEWER generation exists reschedules
  {const b=await boot({seed:[]});
   const r=await b.page.evaluate(async()=>{
     await new Promise(x=>trainingPull(x));
     state.training.exercises.push({id:'e1',name:'Row',muscle:'back',notes:[]});
     saveTraining();
     m8Push();
     // race a second edit in before the (immediate) mock response is processed
     state.training.exercises.push({id:'e2',name:'Curl',muscle:'biceps',notes:[]});
     saveTraining();
     await new Promise(x=>setTimeout(x,3200));/* the finisher's reschedule fires the debounced second push */
     return {state:m8State(),base:JSON.parse(localStorage.getItem('wl_training_base__userA')||'null'),
       dirty:!!localStorage.getItem('wl_training_dirty__userA')};});
   test('K: a newer generation after an ack is rescheduled by the finisher to a second ack (rev 2, clean)',
     ()=>ok(r.state==='clean'&&r.base&&r.base.rev===2&&!r.dirty,JSON.stringify(r)));
   await b.ctx.close();}

  // L (R12-4): a failed PRIMARY save is fail-closed across reload
  {const b=await boot({seed:[]});
   const r=await b.page.evaluate(async()=>{
     await new Promise(x=>trainingPull(x));
     window.__denySet=['^wl_v1$'.replace('wl_v1','wl_training_v1')];
     state.training.exercises.push({id:'lost',name:'Lost Edit',muscle:'back',notes:[]});
     saveTraining();
     return {blocked:m8StorageBlocked,dirty:localStorage.getItem('wl_training_dirty__userA')};});
   test('L: a failed primary save blocks immediately with an unproven dirty marker',
     ()=>ok(r.blocked&&r.dirty&&JSON.parse(r.dirty).persistedGen!==JSON.parse(r.dirty).gen,JSON.stringify(r)));
   await b.page.reload({waitUntil:'load'});
   await b.page.waitForFunction(()=>typeof window.m8State==='function',null,{timeout:15000});
   await b.page.waitForTimeout(1500);
   const r2=await b.page.evaluate((prevDirty)=>({
     blocked:m8StorageBlocked,
     dirtySame:localStorage.getItem('wl_training_dirty__userA')===prevDirty,
     state:m8State()}),r.dirty);
   test('L: after RELOAD the block is re-derived and the dirty bytes are untouched',
     ()=>ok(r2.blocked&&r2.dirtySame,JSON.stringify(r2)));
   test('L: zero commits across the failed-save lifetime',()=>ok(b.commits()===0,'commits='+b.commits()));
   const r3=await b.page.evaluate(async()=>{
     window.__denySet=[];
     state.training.exercises.push({id:'again',name:'Recovered',muscle:'back',notes:[]});
     saveTraining();
     const d=JSON.parse(localStorage.getItem('wl_training_dirty__userA'));
     return {proof:d.persistedGen===d.gen,onDisk:JSON.parse(localStorage.getItem('wl_training_v1')).exercises.some(x=>x.id==='again')};});
   test('L: recovery is an explicit verified re-save — proof recorded, bytes on disk',
     ()=>ok(r3.proof&&r3.onDisk,JSON.stringify(r3)));
   await b.ctx.close();}
  // M (R12-5/7): an edit while the share sheet is OPEN can never be discarded
  {const b=await boot({share:'hold',seed:[CX()]});
   const r=await b.page.evaluate(async()=>{
     state.view='train';render();await new Promise(x=>setTimeout(x,80));
     document.querySelector('[data-act="m8:cx:open"]').click();await new Promise(x=>setTimeout(x,80));
     const f0=performance.getEntriesByType('resource').filter(x=>/collections\/appdata|cf\/appdata/.test(x.name)).length;
     document.querySelector('[data-act="m8:cx:export"]').click();await new Promise(x=>setTimeout(x,150));
     // the sheet is open; the athlete edits
     state.training.exercises.push({id:'mid',name:'Mid-share Edit',muscle:'back',notes:[]});
     saveTraining();
     window.__resolveShare();await new Promise(x=>setTimeout(x,250));
     const cx=JSON.parse(localStorage.getItem('wl_training_conflict__userA'));
     const f1=performance.getEntriesByType('resource').filter(x=>/collections\/appdata|cf\/appdata/.test(x.name)).length;
     return {delivered:!!(cx.exports&&cx.exports.localDone),choices:!!document.querySelector('[data-act="m8:cx:local"]'),
       conflictIntact:!!cx,localIntact:state.training.exercises.some(x=>x.id==='mid'),fetches:f1-f0};});
   test('M: resolving a share AFTER an edit marks nothing delivered and keeps choices closed',
     ()=>ok(!r.delivered&&!r.choices&&r.conflictIntact&&r.localIntact,JSON.stringify(r)));
   test('M: no fetch or adoption occurred',()=>ok(r.fetches===0,'fetches='+r.fetches));
   await b.ctx.close();}
  // N (R12-9): adoption preserves EXACT server objects — empty arrays and unknown fields
  {const weird={cardioTypes:[],exercises:[],liftSessions:{},routines:[],sessions:{},futureField:{keep:"me"}};
   const b=await boot({seed:[],serverTraining:weird,serverRev:9});
   const r=await b.page.evaluate(()=>{
     const base=JSON.parse(localStorage.getItem('wl_training_base__userA')||'null');
     const lc=m8Canon(state.training);
     return {state:m8State(),rev:base&&base.rev,exact:lc.ok&&lc.canon===base.body,
       unknownKept:JSON.stringify(state.training).indexOf('futureField')>=0,
       emptyCardioKept:Array.isArray(state.training.cardioTypes)&&state.training.cardioTypes.length===0};});
   test('N: fresh adoption preserves empty cardioTypes and unknown fields EXACTLY',
     ()=>ok(r.state==='clean'&&r.rev===9&&r.exact&&r.unknownKept&&r.emptyCardioKept,JSON.stringify(r)));
   await b.ctx.close();}

  await browser.close();server.close();
  console.log('\n'+(failures.length?`FAILED — ${passed} passed, ${failures.length} failed`:`OK — ${passed} passed`));
  process.exitCode=failures.length?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
