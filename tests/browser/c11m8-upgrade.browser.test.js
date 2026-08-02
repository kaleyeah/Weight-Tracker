/* C11-M8 (browser) — the R3 authentic-upgrade regression, real Chromium.

   The exact case of the 2026-07-31 loss: OLD-client localStorage (an unsynced
   local lift session; NO dirty/base/conflict/journal keys) boots against a
   STALE server. The old client's pull overwrites the only copy; the M8
   candidate must keep it on disk and enter conflict instead.

       CF_SRC=<file> node tests/browser/c11m8-upgrade.browser.test.js

   Run against the live build (no M8 blocks) it FAILS; against the M8 working
   copy it PASSES. Both runs are required evidence (contract §8). */
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
    // authentic OLD-client state: signed in, owner marker, an unsynced session,
    // and NOT ONE M8 key on the device
    localStorage.setItem('wl_pb',JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok',email:'a@x.com'}));
    localStorage.setItem('wl_last_owner','userA');
    localStorage.setItem('wl_v1',JSON.stringify({settings:{onboarded:true,units:'lbs'},weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},statuses:[],presets:[],skips:{},nightlyLog:{}}));
    localStorage.setItem('wl_training_v1',JSON.stringify({
      cardioTypes:['Peloton'],exercises:[{id:'e1',name:'Squat',muscle:'legs',notes:[]}],routines:[],sessions:{},
      liftSessions:{'2026-07-31':[{date:'2026-07-31',name:'Full Body Day 3',ts:1785000000000,entries:[
        {exerciseId:'e1',name:'Squat',muscle:'legs',sets:[{weight:225,reps:5,rir:1,status:'done'}]}]}]}
    }));
  });
  // the STALE server: an appdata record whose training LACKS the local session
  const staleTraining={cardioTypes:['Peloton'],exercises:[],routines:[],sessions:{},liftSessions:{}};
  await ctx.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],token:'tok',record:{id:'userA'}})}));
  await ctx.route('**/api/collections/appdata/records**',r=>r.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({items:[{id:'rec1',user:'userA',training:staleTraining,trainingRev:7}]})}));
  await ctx.route('**/api/cf/appdata/commit',r=>r.fulfill({status:409,contentType:'application/json',
    body:JSON.stringify({ok:false,conflict:true,subsystem:'training',serverRev:7,payload:staleTraining})}));
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  await page.waitForFunction(()=>typeof window.trainingPull==='function',null,{timeout:15000});
  await page.waitForTimeout(2500); // let the boot sync path run fully
  const out=await page.evaluate(()=>{
    const disk=JSON.parse(localStorage.getItem('wl_training_v1')||'{}');
    return {
      sessionOnDisk:!!(disk.liftSessions&&disk.liftSessions['2026-07-31']&&disk.liftSessions['2026-07-31'].length),
      sessionInState:!!(state.training.liftSessions&&state.training.liftSessions['2026-07-31']&&state.training.liftSessions['2026-07-31'].length),
      conflictHeld:!!localStorage.getItem('wl_training_conflict__userA'),
      m8Present:typeof window.m8State==='function'
    };
  });
  console.log('\nC11-M8 — authentic upgrade boundary (R3)\n  source: '+SRC+'\n  M8 present: '+out.m8Present);
  test('R3: the unsynced 2026-07-31 session SURVIVES ON DISK after boot against a stale server',()=>ok(out.sessionOnDisk,'DESTROYED — the original loss mode'));
  test('R3: it also survives in live state',()=>ok(out.sessionInState));
  test('R3: the difference is HELD as a conflict, not silently resolved',()=>ok(out.conflictHeld,'no conflict record'));
  test('no page errors',()=>ok(errs.length===0,errs.join('; ')));
  await browser.close();server.close();
  console.log('\n'+(failures.length?`FAILED — ${passed} passed, ${failures.length} failed`:`OK — ${passed} passed`));
  process.exitCode=failures.length?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
