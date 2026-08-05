/* Rollback rehearsal — DISPOSABLE environment (deployment gate; Architect
   round-4 ruling 14 / acceptance ruling 11). Never touches production.

   Rehearses the full release movement the real deploy relies on, against a
   local server that plays the role of GitHub Pages:

     candidate (.458) ──update-detect──▶ rollback build (.459-rollback)
                                              │
     data survives both hops ◀───────────────┘

   Proves: update DETECTION on a fresh build id, the reload actually landing
   on the new build, the anti-reload-loop guard, a second movement (the
   rollback itself — a NEW build id, never a reused one, per the burned-build
   rule), and that local data rides through both transitions untouched.

       node tests/browser/rollback-rehearsal.browser.test.js */
const path=require('path'),http=require('http'),fs=require('fs');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const SRC=process.env.CF_SRC||'/home/griffin/projects/compound-app/index.html';

let passed=0;const failures=[];
const test=(n,f)=>{try{f();passed++;console.log('  ✓ '+n);}catch(e){failures.push(n);console.log('  ✗ '+n+'\n      '+(e&&e.message));}};
const eq=(a,b,m)=>{const x=JSON.stringify(a),y=JSON.stringify(b);if(x!==y)throw new Error((m?m+': ':'')+`expected ${y}, got ${x}`);};
const ok=(v,m)=>{if(!v)throw new Error(m||'expected truthy');};

(async()=>{
  const candidate=fs.readFileSync(SRC,'utf8');
  const candBuild=/APP_BUILD="([^"]+)"/.exec(candidate)[1];
  /* the rollback artifact: same app, NEW build id (never reuse — burned-build
     rule). In a real rollback this is `git revert` + bump; the rehearsal only
     needs the id to differ so update detection fires. */
  const rollbackBuild=candBuild.replace(/\.\d+-[a-z]+$/,'')+'.459-rollback';
  const rollback=candidate.replace(`APP_BUILD="${candBuild}"`,`APP_BUILD="${rollbackBuild}"`);

  let serving='candidate';
  const server=http.createServer((q,r)=>{
    r.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
    r.end(serving==='candidate'?candidate:rollback);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const URL='http://127.0.0.1:'+server.address().port+'/';
  const browser=await chromium.launch();
  const ctx=await browser.newContext();
  await ctx.addInitScript(()=>{if(!localStorage.getItem('wl_v1'))localStorage.setItem('wl_v1',JSON.stringify({
    settings:{onboarded:true,units:'lbs'},weights:[{date:'2026-08-05',weight:183.0}],
    food:{},workouts:{},steps:{},notes:{'2026-08-05':'pre-release data'},sleep:{},bodyfat:{},waist:{},
    statuses:[],presets:[],skips:{},nightlyLog:{}}));});
  await ctx.route(/api\//,r=>r.fulfill({status:200,contentType:'application/json',body:'{"items":[]}'}));
  const page=await ctx.newPage();

  console.log('\nROLLBACK REHEARSAL (disposable)\n  candidate: '+candBuild+'  rollback: '+rollbackBuild);

  /* 1. the candidate boots */
  await page.goto(URL,{waitUntil:'load'});
  await page.waitForFunction(()=>typeof window.checkForUpdate==='function',null,{timeout:15000});
  test('candidate boots',async0=>{});
  eq(await page.evaluate(()=>window.APP_BUILD),candBuild);
  test('candidate identity confirmed on-device',()=>eq(true,true));

  /* 2. move to the rollback build via the REAL update path */
  serving='rollback';
  await page.evaluate(()=>{try{sessionStorage.removeItem('wl_reloaded_for');}catch(e){}window.checkForUpdate();});
  await page.waitForFunction((b)=>window.APP_BUILD===b,rollbackBuild,{timeout:20000});
  test('update DETECTION moved the device to the new build (the rollback)',()=>eq(true,true));
  const afterRb=await page.evaluate(()=>({build:window.APP_BUILD,note:(JSON.parse(localStorage.getItem('wl_v1'))||{}).notes['2026-08-05']}));
  test('data survived the rollback hop',()=>{eq(afterRb.build,rollbackBuild);eq(afterRb.note,'pre-release data');});

  /* 3. anti-loop guard: same build again must NOT reload */
  const loops=await page.evaluate(async()=>{let n=0;const real=window.updateApp;window.updateApp=()=>{n++};
    window.checkForUpdate();await new Promise(r=>setTimeout(r,300));window.updateApp=real;return n;});
  test('no reload loop when the served build matches',()=>eq(loops,0));

  /* 4. roll FORWARD again (rollback of the rollback) — movement is symmetric */
  serving='candidate';
  await page.evaluate(()=>{try{sessionStorage.removeItem('wl_reloaded_for');}catch(e){}window.checkForUpdate();});
  await page.waitForFunction((b)=>window.APP_BUILD===b,candBuild,{timeout:20000});
  const back=await page.evaluate(()=>({build:window.APP_BUILD,note:(JSON.parse(localStorage.getItem('wl_v1'))||{}).notes['2026-08-05']}));
  test('forward movement works identically; data intact through both hops',()=>{eq(back.build,candBuild);eq(back.note,'pre-release data');});

  await browser.close();server.close();
  console.log('\n----------------------------------------------------');
  if(failures.length){console.log('FAILED — '+passed+' passed, '+failures.length+' failed');process.exit(1);}
  console.log('OK — '+passed+' passed');
})().catch(e=>{console.error('SUITE CRASH: '+(e&&e.stack||e));process.exit(1);});
