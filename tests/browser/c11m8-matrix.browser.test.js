/* C11-M8 matrix (browser) — the R4 seven bootstrap/upgrade cases, real
   Chromium, one fresh context per case (contract §2/§8).

       CF_SRC=<file> node tests/browser/c11m8-matrix.browser.test.js */
const path=require('path'),http=require('http'),fs=require('fs');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const SRC=process.env.CF_SRC||'/home/griffin/projects/compound-app/index.html';
let passed=0;const failures=[];
const test=(n,f)=>{try{f();passed++;console.log('  ✓ '+n);}catch(e){failures.push(n);console.log('  ✗ '+n+'\n      '+(e&&e.message));}};
const ok=(v,m)=>{if(!v)throw new Error(m||'expected truthy');};
const S={date:'2026-07-25',name:'Day A',ts:1784500000000,entries:[{exerciseId:'e1',name:'Squat',muscle:'legs',sets:[{weight:225,reps:5,rir:1,status:'done'}]}]};
function training(extra){return Object.assign({cardioTypes:['Peloton'],exercises:[{id:'e1',name:'Squat',muscle:'legs',notes:[]}],routines:[],sessions:{},liftSessions:{'2026-07-25':[S]}},extra||{});}
(async()=>{
  const html=fs.readFileSync(SRC,'utf8');
  const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch();
  const boot=async(localTraining,serverTraining,pre)=>{
    const ctx=await browser.newContext();
    await ctx.addInitScript(({lt,extras})=>{
      localStorage.setItem('wl_pb',JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok',email:'a@x.com'}));
      localStorage.setItem('wl_last_owner','userA');
      localStorage.setItem('wl_v1',JSON.stringify({settings:{onboarded:true,units:'lbs'},weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},statuses:[],presets:[],skips:{},nightlyLog:{}}));
      if(lt)localStorage.setItem('wl_training_v1',JSON.stringify(lt));
      (extras||[]).forEach(kv=>localStorage.setItem(kv[0],kv[1]));
    },{lt:localTraining,extras:pre||[]});
    await ctx.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],token:'tok',record:{id:'userA'}})}));
    await ctx.route('**/api/collections/appdata/records**',r=>r.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({items:[{id:'rec1',user:'userA',training:serverTraining,trainingRev:5}]})}));
    await ctx.route('**/api/cf/appdata/commit',r=>r.fulfill({status:409,contentType:'application/json',
      body:JSON.stringify({ok:false,conflict:true,subsystem:'training',serverRev:5,payload:serverTraining})}));
    const page=await ctx.newPage();
    const errs=[];page.on('pageerror',e=>errs.push(String(e)));
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
    await page.waitForFunction(()=>typeof window.trainingPull==='function',null,{timeout:15000});
    await page.waitForTimeout(1800);
    const out=await page.evaluate(()=>{
      const disk=JSON.parse(localStorage.getItem('wl_training_v1')||'{}');
      const cx=localStorage.getItem('wl_training_conflict__userA');
      const base=JSON.parse(localStorage.getItem('wl_training_base__userA')||'null');
      return {dates:Object.keys(disk.liftSessions||{}),conflict:!!cx,clean:!!base&&!cx,
        canon:(typeof m8Canon==='function')?m8Canon(state.training).canon:null};});
    out.errs=errs;await ctx.close();return out;};

  console.log('\nC11-M8 matrix — the seven R4 cases\n  source: '+SRC);
  // learn the post-migration canonical local (for case 1's true-equality server)
  const probe=await boot(training(),null);
  const migrated=probe.canon?JSON.parse(probe.canon):null;
  test('R4 pre: candidate exposes the canonical form',()=>ok(!!migrated,'no m8Canon — baseline run'));
  // 1. old local equals server (post-migration content) -> clean establish
  const c1=await boot(training(),migrated);
  test('R4-1: equal content establishes the base cleanly (no conflict)',()=>ok(c1.clean&&!c1.conflict,JSON.stringify({c:c1.conflict,clean:c1.clean})));
  // 2. local-only date -> conflict, session survives
  const sOnly=migrated?JSON.parse(JSON.stringify(migrated)):{};if(sOnly.liftSessions)delete sOnly.liftSessions['2026-07-25'];
  const c2=await boot(training(),sOnly);
  test('R4-2: local-only date -> conflict, local survives',()=>ok(c2.conflict&&c2.dates.indexOf('2026-07-25')>=0,JSON.stringify(c2.dates)));
  // 3. server-only date -> conflict (no silent adopt)
  const sExtra=migrated?JSON.parse(JSON.stringify(migrated)):{};if(sExtra.liftSessions)sExtra.liftSessions['2026-07-28']=[Object.assign({},S,{date:'2026-07-28'})];
  const c3=await boot(training(),sExtra);
  test('R4-3: server-only date -> conflict, nothing auto-adopted',()=>ok(c3.conflict&&c3.dates.length===1,JSON.stringify(c3.dates)));
  // 4. both differ on the same session -> conflict
  const sDiff=migrated?JSON.parse(JSON.stringify(migrated)):{};
  if(sDiff.liftSessions&&sDiff.liftSessions['2026-07-25'])sDiff.liftSessions['2026-07-25'][0].entries[0].sets[0].weight=245;
  const c4=await boot(training(),sDiff);
  test('R4-4: same session, different content -> conflict',()=>ok(c4.conflict));
  // 5. local has an item the server deleted -> conflict (no resurrection)
  const sDel=migrated?JSON.parse(JSON.stringify(migrated)):{};if(sDel.exercises)sDel.exercises=[];
  const c5=await boot(training(),sDel);
  test('R4-5: server-deleted item -> conflict, never auto-pushed back',()=>ok(c5.conflict));
  // 6. server has an item local deleted -> conflict (no silent restore)
  const ltDel=training();ltDel.exercises=[];
  const c6=await boot(ltDel,migrated);
  test('R4-6: locally-deleted item on server -> conflict, no silent restore',()=>ok(c6.conflict));
  // 7. existing conflict + restart + ordinary core activity -> conflict persists, local intact
  const preCx=[['wl_training_conflict__userA',JSON.stringify({owner:'userA',mark:'m8.1',canon:1,enteredAt:Date.now()-60000,reason:'bootstrap',serverRev:5,serverAtEntry:'{}',localAtEntry:'{}',exports:{}})]];
  const c7=await boot(training(),sOnly,preCx);
  test('R4-7: an existing conflict survives restart with local intact',()=>ok(c7.conflict&&c7.dates.indexOf('2026-07-25')>=0));
  test('no page errors across all cases',()=>ok([probe,c1,c2,c3,c4,c5,c6,c7].every(x=>!x.errs.length)));
  await browser.close();server.close();
  console.log('\n'+(failures.length?`FAILED — ${passed} passed, ${failures.length} failed`:`OK — ${passed} passed`));
  process.exitCode=failures.length?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
