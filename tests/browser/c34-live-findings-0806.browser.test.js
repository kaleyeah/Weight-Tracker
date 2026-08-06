/* C34 (browser) — Owner live findings, evening of 2026-08-06:
   1. Pull-to-refresh "syncs" but the last-sync time stays old — the gesture
      called cloudPull directly, which never stamps; it now mirrors autoSync
      (pull → push if dirty → stamp+ok on clean → coach reports ride along).
   2. The macros-vs-calories mismatch warning is RETIRED ("no point anymore").
      The cal==null fill-in offer STAYS — it feeds the calAuto disclosure.

       CF_SRC=<file> node tests/browser/c34-live-findings-0806.browser.test.js */
const path=require('path'),http=require('http'),fs=require('fs');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const SRC=process.env.CF_SRC||'/home/griffin/projects/compound-app/index.html';
let passed=0;const failures=[];
const test=(n,f)=>{try{f();passed++;console.log('  ✓ '+n);}catch(e){failures.push(n);console.log('  ✗ '+n+'\n      '+(e&&e.message));}};
const ok=(v,m)=>{if(!v)throw new Error(m||'expected truthy');};
const eq=(a,b,m)=>{if(a!==b)throw new Error((m||'eq')+': '+JSON.stringify(a)+' !== '+JSON.stringify(b));};

(async()=>{
  const html=fs.readFileSync(SRC,'utf8');
  const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch();
  const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
  await ctx.route('**/api/**',r=>{
    const url=r.request().url();
    const reply=(st,b)=>r.fulfill({status:st,contentType:'application/json',body:JSON.stringify(b)});
    if(/cf\/writer\/lease/.test(url)){
      const b=JSON.parse(r.request().postData()||'{}');
      return reply(200,{ok:true,exists:true,granted:true,fence:1,holderDeviceId:b.deviceId,
        deviceName:b.deviceName||'x',active:true,serverNow:Date.now(),ttlMs:86400000});}
    if(/coach_reports/.test(url))return reply(200,{items:[]});
    if(/collections\/appdata\/records/.test(url))return reply(200,{items:[]});
    return reply(200,{items:[],token:'tok',record:{id:'userA'}});});
  await ctx.addInitScript(()=>{
    localStorage.setItem('wl_pb',JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok',email:'a@x.com'}));
    localStorage.setItem('wl_last_owner','userA');
    localStorage.setItem('wl_v1',JSON.stringify({settings:{onboarded:true,units:'lbs',weekStart:'0'},
      weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},
      statuses:[],presets:[],skips:{},nightlyLog:{}}));
    localStorage.setItem('wl_lastsync','1000');    /* ancient — the stamp must move */
  });
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  await page.waitForTimeout(1200);

  /* ---- 2: the mismatch warning is gone; the fill-in offer stays ---- */
  {
    const s=await page.evaluate(()=>{
      state.food['2026-08-05']={calories:2000,protein:150,carbs:200,fat:60}; /* macros→1940 ≠ 2000 */
      state.food['2026-08-04']={protein:150,carbs:200,fat:60};              /* no calories logged */
      return {mismatch:calNoticeHTML('2026-08-05'),fill:calNoticeHTML('2026-08-04')};});
    test('the macros-vs-calories mismatch warning is retired',()=>
      eq(s.mismatch,'','warning still renders: '+s.mismatch.slice(0,80)));
    test('the no-calories fill-in offer still stands (feeds calAuto)',()=>{
      ok(/Use as calories/.test(s.fill),'offer gone: '+s.fill.slice(0,80));
      ok(/1,?940/.test(s.fill),'computed total wrong: '+s.fill.slice(0,80));});
  }

  /* ---- 1: pull-to-refresh stamps the last-sync time ---- */
  {
    const before=await page.evaluate(()=>localStorage.getItem('wl_lastsync'));
    await page.evaluate(async()=>{
      window.scrollTo(0,0);
      const t=(y)=>new Touch({identifier:1,target:document.body,clientX:200,clientY:y});
      document.dispatchEvent(new TouchEvent('touchstart',{touches:[t(100)],bubbles:true,cancelable:true}));
      for(let y=120;y<=280;y+=40)
        document.dispatchEvent(new TouchEvent('touchmove',{touches:[t(y)],bubbles:true,cancelable:true}));
      document.dispatchEvent(new TouchEvent('touchend',{touches:[],bubbles:true,cancelable:true}));});
    await page.waitForTimeout(2500);
    const s=await page.evaluate(()=>({
      last:localStorage.getItem('wl_lastsync'),
      spinnerExisted:!!document.querySelector('.wl-ptr')}));
    test('the gesture reached the refresh path (indicator element exists)',()=>
      ok(s.spinnerExisted,'no .wl-ptr indicator — gesture never armed'));
    test('a completed pull STAMPS the last-sync time (Owner: "still old")',()=>{
      ok(s.last!==before,'wl_lastsync unchanged: '+s.last);
      ok(Number(s.last)>Date.now()-60000,'stamp not fresh: '+s.last);});
  }

  test('no page errors',()=>eq(errs.length,0,errs.join(';')));

  await ctx.close();await browser.close();server.close();
  console.log(failures.length?`FAILED — ${passed} passed, ${failures.length} failed`:`OK — ${passed} passed`);
  process.exit(failures.length?1:0);
})().catch(e=>{console.error('SUITE ERROR',e);process.exit(2);});
