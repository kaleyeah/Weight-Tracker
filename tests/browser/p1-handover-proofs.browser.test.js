/* Phase-1 handover proofs (Architect 00-PROMPT requirements):
 *   - the built PWA boots online AND stays usable offline;
 *   - existing local data loads unchanged;
 *   - a save + relaunch retains data.
 *
 * No service worker exists yet (Phase 2), so "offline" here is the app's real
 * offline story on iOS: the DOCUMENT comes from the browser/home-screen cache
 * (simulated by serving identical bytes), and everything else — logging,
 * rendering, storage — must work with the network gone.
 *
 *       node tests/browser/p1-handover-proofs.browser.test.js
 */
const path=require('path'),http=require('http'),fs=require('fs');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const SRC=process.env.CF_SRC||'/home/griffin/projects/compound-app/index.html';

let passed=0;const failures=[];
const test=(n,f)=>{try{f();passed++;console.log('  ✓ '+n);}catch(e){failures.push(n);console.log('  ✗ '+n+'\n      '+(e&&e.message));}};
const eq=(a,b,m)=>{const x=JSON.stringify(a),y=JSON.stringify(b);if(x!==y)throw new Error((m?m+': ':'')+`expected ${y}, got ${x}`);};
const ok=(v,m)=>{if(!v)throw new Error(m||'expected truthy');};

(async()=>{
  const html=fs.readFileSync(SRC,'utf8');
  const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const URL='http://127.0.0.1:'+server.address().port+'/';
  const browser=await chromium.launch();
  const ctx=await browser.newContext();

  /* A realistic EXISTING account: settings + history seeded before first boot,
     exactly the shape a device holds today. */
  const FIXTURE={settings:{onboarded:true,units:'lbs',targetCalories:'2100',weekStart:'1'},
    weights:[{date:'2026-08-01',weight:184.0},{date:'2026-08-02',weight:183.6},{date:'2026-08-03',weight:183.9}],
    food:{'2026-08-03':{calories:1980,protein:150}},notes:{'2026-08-03':'existing note'},
    workouts:{},steps:{},sleep:{},bodyfat:{},waist:{},statuses:[],presets:[],skips:{},nightlyLog:{}};
  /* init scripts replay on EVERY navigation including reload — seed only once,
     or the relaunch proof would test the seed, not the retention. */
  await ctx.addInitScript((fx)=>{if(!localStorage.getItem('wl_v1'))localStorage.setItem('wl_v1',JSON.stringify(fx));},FIXTURE);

  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto(URL,{waitUntil:'load'});
  await page.waitForFunction(()=>typeof window.view_overview==='function',null,{timeout:15000});
  console.log('\nP1 handover proofs\n  build: '+await page.evaluate(()=>window.APP_BUILD));

  /* ---- proof 1: online boot, existing data loads UNCHANGED ---- */
  const loaded=await page.evaluate(()=>({
    weights:state.weights.length,
    w3:state.weights[2]&&state.weights[2].weight,
    note:state.notes['2026-08-03'],
    cals:(state.food['2026-08-03']||{}).calories,
    units:state.settings.units,
    rendered:document.querySelector('#app').children.length>0}));
  test('boots online; app shell rendered',()=>ok(loaded.rendered));
  test('existing local data loads unchanged (weights, food, notes, settings)',()=>{
    eq(loaded.weights,3);eq(loaded.w3,183.9);eq(loaded.note,'existing note');
    eq(loaded.cals,1980);eq(loaded.units,'lbs');});

  /* ---- proof 2: network gone — the app stays usable and saves ---- */
  await ctx.setOffline(true);
  const off=await page.evaluate(()=>{
    const out={};
    try{
      state.weights.push({date:'2026-08-04',weight:183.2});
      state.notes['2026-08-04']='logged offline';
      window.saveLocal();               /* the storage layer, no network needed */
      const back=JSON.parse(localStorage.getItem('wl_v1'));
      out.persistedWeights=back.weights.length;
      out.persistedNote=back.notes['2026-08-04'];
      out.renders=typeof window.view_overview()==='string';
    }catch(e){out.err=String(e);}
    return out;});
  test('offline: logging a weight persists locally',()=>{ok(!off.err,off.err);eq(off.persistedWeights,4);});
  test('offline: the app still renders',()=>ok(off.renders));

  /* ---- proof 3: relaunch (same document, still offline) retains data ---- */
  await page.route('**/*',r=>{
    if(r.request().url()===URL)return r.fulfill({status:200,contentType:'text/html',body:html});
    return r.abort();                    /* every other request: the network is gone */
  });
  await page.reload({waitUntil:'load'});
  await page.waitForFunction(()=>typeof window.view_overview==='function',null,{timeout:15000});
  const relaunch=await page.evaluate(()=>({
    weights:state.weights.length,
    note:state.notes['2026-08-04'],
    rendered:document.querySelector('#app').children.length>0}));
  test('relaunch offline: document from cache boots the app',()=>ok(relaunch.rendered));
  test('relaunch offline: the offline save survived',()=>{eq(relaunch.weights,4);eq(relaunch.note,'logged offline');});

  await browser.close();server.close();
  const fatal=errs.filter(e=>!/Failed to fetch|NetworkError|ERR_INTERNET|ERR_FAILED|net::/i.test(e));
  test('no unexpected page errors (network failures excluded while offline)',()=>eq(fatal,[]));

  console.log('\n----------------------------------------------------');
  if(failures.length){console.log('FAILED — '+passed+' passed, '+failures.length+' failed');process.exit(1);}
  console.log('OK — '+passed+' passed');
})().catch(e=>{console.error('SUITE CRASH: '+(e&&e.stack||e));process.exit(1);});
