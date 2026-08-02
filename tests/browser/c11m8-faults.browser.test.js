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
      window.__denySet=cfg.denySet||[];window.__denyRemove=cfg.denyRemove||[];
      const oSet=Storage.prototype.setItem,oRem=Storage.prototype.removeItem;
      Storage.prototype.setItem=function(k,v){if(window.__denySet.some(rx=>new RegExp(rx).test(k)))throw new DOMException('quota','QuotaExceededError');return oSet.call(this,k,v);};
      Storage.prototype.removeItem=function(k){if(window.__denyRemove.some(rx=>new RegExp(rx).test(k)))return;return oRem.call(this,k);};
      // share control
      if(cfg.share==='reject'){navigator.canShare=()=>true;navigator.share=()=>Promise.reject(new Error('cancel'));}
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

  // E: choose-server journals seeded at every phase -> recovery completes all postconditions
  for(const ph of ['intent','k1','k2']){
    const scanon=JSON.stringify(OLDT,Object.keys(OLDT).sort());
    const j=['wl_training_journal__userA',JSON.stringify({owner:'userA',mark:'m8.1',op:'choose-server',phase:ph,startedAt:Date.now(),
      expect:{serverRev:5,serverCanon:null,discardedLocalGen:3}})];
    // serverCanon must be the app's canon — learn once via a probe? use m8Canon in-page after boot instead:
    const b=await boot({seed:[j,CX(),['wl_training_dirty__userA',JSON.stringify({owner:'userA',mark:'m8.1',gen:3,persistedGen:3,ts:1})]]});
    const r=await b.page.evaluate(async()=>{
      // fix up the journal's serverCanon with the app's own canon, then re-run recovery
      const jj=JSON.parse(localStorage.getItem('wl_training_journal__userA'));
      jj.expect.serverCanon=m8Canon({cardioTypes:["Peloton"],exercises:[],liftSessions:{},routines:[],sessions:{}}).canon;
      localStorage.setItem('wl_training_journal__userA',JSON.stringify(jj));
      await new Promise(x=>m8Boot(x));
      return {state:m8State(),journal:!!localStorage.getItem('wl_training_journal__userA'),
        conflict:!!localStorage.getItem('wl_training_conflict__userA'),dirty:!!localStorage.getItem('wl_training_dirty__userA'),
        base:JSON.parse(localStorage.getItem('wl_training_base__userA')||'null'),
        localIsAdopted:m8Canon(state.training).canon===JSON.parse(localStorage.getItem('wl_training_base__userA')||'{}').body};});
    test(`E(${ph}): choose-server crash recovery completes every postcondition`,
      ()=>ok(r.state==='clean'&&!r.journal&&!r.conflict&&!r.dirty&&r.base&&r.base.rev===5&&r.localIsAdopted,JSON.stringify(r)));
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

  await browser.close();server.close();
  console.log('\n'+(failures.length?`FAILED — ${passed} passed, ${failures.length} failed`:`OK — ${passed} passed`));
  process.exitCode=failures.length?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
