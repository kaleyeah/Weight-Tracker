/* C11-M8 recovery (browser) — §7/B8/A12: the SYNC_SAFE artifact boots from
   clean, dirty, and conflict without mutating ANY training or sync key and
   makes zero training network calls.   CF_SRC must be the recovery file. */
const path=require('path'),http=require('http'),fs=require('fs');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const SRC=process.env.CF_SRC||'/home/griffin/projects/Weight-Tracker/M8-sync-rework/recovery/index-recovery-syncsafe.html';
let passed=0;const failures=[];
const test=(n,f)=>{try{f();passed++;console.log('  ✓ '+n);}catch(e){failures.push(n);console.log('  ✗ '+n+'\n      '+(e&&e.message));}};
const ok=(v,m)=>{if(!v)throw new Error(m||'expected truthy');};
(async()=>{
  const html=fs.readFileSync(SRC,'utf8');
  const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch();
  const states={
    clean:[['wl_training_base__userA',JSON.stringify({owner:'userA',mark:'m8.1',canon:1,rev:3,body:'{}'})]],
    dirty:[['wl_training_base__userA',JSON.stringify({owner:'userA',mark:'m8.1',canon:1,rev:3,body:'{}'})],
           ['wl_training_dirty__userA',JSON.stringify({owner:'userA',mark:'m8.1',gen:4,ts:1})],
           ['wl_training_journal__userA',JSON.stringify({owner:'userA',mark:'m8.1',op:'ack',phase:'intent',startedAt:1,expect:{oldBaseCanon:'{}',expectedRev:3,pushedCanon:'{"a":1}',gen:4,requestId:'k1'}})]],
    conflict:[['wl_training_conflict__userA',JSON.stringify({owner:'userA',mark:'m8.1',canon:1,enteredAt:1,reason:'t',serverRev:3,serverAtEntry:'{}',localAtEntry:'{}',exports:{}})]]};
  for(const name of Object.keys(states)){
    const ctx=await browser.newContext();
    await ctx.addInitScript((kv)=>{
      localStorage.setItem('wl_pb',JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok',email:'a@x.com'}));
      localStorage.setItem('wl_last_owner','userA');
      localStorage.setItem('wl_v1',JSON.stringify({settings:{onboarded:true,units:'lbs'},weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},statuses:[],presets:[],skips:{},nightlyLog:{}}));
      localStorage.setItem('wl_training_v1',JSON.stringify({cardioTypes:['Peloton'],exercises:[],routines:[],sessions:{},liftSessions:{}}));
      kv.forEach(p=>localStorage.setItem(p[0],p[1]));
    },states[name]);
    let trainingNet=0;
    await ctx.route('**/api/**',r=>{
      /* only TRAINING network activity is banned (B8): CAS commits. The shared
         appdata record fetch serves core sync; non-adoption is proven by the
         untouched keys and surviving local copy below. */
      if(/cf\/appdata\/commit/.test(r.request().url()))trainingNet++;
      r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],token:'tok',record:{id:'userA'}})});});
    const page=await ctx.newPage();
    const errs=[];page.on('pageerror',e=>errs.push(String(e)));
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
    await page.waitForFunction(()=>typeof window.SYNC_SAFE!=='undefined',null,{timeout:15000});
    await page.waitForTimeout(1800);
    const out=await page.evaluate(async(seed)=>{
      // 9: byte-preservation asserted BEFORE any deliberate edit, no exemption
      const preKeys={};seed.forEach(p=>{preKeys[p[0]]=localStorage.getItem(p[0]);});
      // 8: force the training path explicitly — it must make no fetch
      const f0=performance.getEntriesByType('resource').length;
      await new Promise(r=>trainingPull(r));m8Push();
      await new Promise(r=>setTimeout(r,300));
      const f1=performance.getEntriesByType('resource').length;
      // local edits still work and accumulate dirty
      state.training.exercises.push({id:'r1',name:'Row',muscle:'back',notes:[]});
      saveTraining();
      return {keys:preKeys,banner:!!document.getElementById('m8-recovery-banner'),
        trainingFetches:f1-f0,
        editSaved:JSON.parse(localStorage.getItem('wl_training_v1')).exercises.length===1,
        dirtyNow:!!localStorage.getItem('wl_training_dirty__userA')};
    },states[name]);
    test(`${name}: boots with banner, zero training WRITES (CAS calls)`,()=>ok(out.banner&&trainingNet===0,'net='+trainingNet));
    test(`${name}: EVERY seeded sync key byte-identical before any edit`,()=>ok(states[name].every(p=>out.keys[p[0]]===p[1]),'mutated'));
    test(`${name}: a forced training pull+push makes ZERO network requests`,()=>ok(out.trainingFetches===0,'fetches='+out.trainingFetches));
    test(`${name}: local editing works and marks dirty`,()=>ok(out.editSaved&&out.dirtyNow));
    test(`${name}: no page errors`,()=>ok(errs.length===0,errs.join('; ')));
    await ctx.close();
  }
  await browser.close();server.close();
  console.log('\n'+(failures.length?`FAILED — ${passed} passed, ${failures.length} failed`:`OK — ${passed} passed`));
  process.exitCode=failures.length?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
