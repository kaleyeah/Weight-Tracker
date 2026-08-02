/* C11-M8 tags (browser) — §5b/C10 provenance-safe derivation.
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
    localStorage.setItem('wl_v1',JSON.stringify({settings:{onboarded:true,units:'lbs'},weights:[],food:{},
      workouts:{'2026-07-20':[{cat:'lifting',name:'Gym with Kris'},{cat:'lifting',name:'Ghost Session',auto:true}]},
      steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},statuses:[],presets:[],skips:{},nightlyLog:{}}));
  });
  await ctx.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],token:'tok',record:{id:'userA'}})}));
  await ctx.route('**/api/collections/appdata/records**',r=>r.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({items:[{id:'rec1',user:'userA',training:null,trainingRev:0}]})}));
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  await page.waitForFunction(()=>typeof window.m8State==='function',null,{timeout:15000});
  await page.waitForTimeout(1500);
  const out=await page.evaluate(async()=>{
    const r={};
    // C10: no session matches either tag on 7-20
    migrateOrphanLiftTags();
    const tags=(state.workouts['2026-07-20']||[]);
    r.handAddedSurvives=tags.some(a=>a.name==='Gym with Kris');
    r.autoOrphanRemoved=!tags.some(a=>a.name==='Ghost Session');
    // §5b: during an open conflict, derivation is refused
    localStorage.setItem('wl_training_conflict__userA',JSON.stringify({owner:'userA',mark:'m8.1',canon:1,enteredAt:Date.now(),reason:'test',serverRev:1,serverAtEntry:'{}',localAtEntry:'{}',exports:{}}));
    state.training.liftSessions['2026-07-21']=[{date:'2026-07-21',name:'New Day',ts:Date.now(),entries:[]}];
    const derived=resyncAllActivityTags();
    r.refusedInConflict=(derived===false)&&!((state.workouts['2026-07-21']||[]).length);
    localStorage.removeItem('wl_training_conflict__userA');
    const derived2=resyncAllActivityTags();
    r.derivesWhenClear=(state.workouts['2026-07-21']||[]).some(a=>a.cat==='lifting');
    return r;
  });
  console.log('\nC11-M8 tags — provenance-safe derivation (§5b/C10)\n  source: '+SRC);
  test('C10: a hand-added lifting tag SURVIVES orphan cleanup',()=>ok(out.handAddedSurvives));
  test('C10: an auto:true orphan is still removed',()=>ok(out.autoOrphanRemoved));
  test('§5b: derivation is refused while a conflict is open',()=>ok(out.refusedInConflict));
  test('§5b: derivation resumes once the conflict clears',()=>ok(out.derivesWhenClear));
  test('no page errors',()=>ok(errs.length===0,errs.join('; ')));
  await browser.close();server.close();
  console.log('\n'+(failures.length?`FAILED — ${passed} passed, ${failures.length} failed`:`OK — ${passed} passed`));
  process.exitCode=failures.length?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
