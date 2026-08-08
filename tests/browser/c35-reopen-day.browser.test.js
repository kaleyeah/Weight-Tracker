/* C35 (browser) — reopening a completed day actually reopens it.
   Owner, 2026-08-08: "I can't reopen today. I do it and I confirm it. But it
   won't allow me to import from Apple health."
   reopenDay() cleared only the two LOCAL recap stores; the coach-report cache
   is a server mirror, so the recap survived, dayRecap() still said Completed,
   and both "Complete today" and the Health import stayed hidden. Deleting the
   cache locally would not have helped either — fetchCoachReports() replaces
   it wholesale on the next sync.

       CF_SRC=<file> node tests/browser/c35-reopen-day.browser.test.js */
const path=require('path'),http=require('http'),fs=require('fs');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const SRC=process.env.CF_SRC||'/home/griffin/projects/compound-app/index.html';
const _SRCBUF=fs.readFileSync(SRC);
const SRC_SHA=require('crypto').createHash('sha256').update(_SRCBUF).digest('hex');
const SRC_BUILD=((_SRCBUF.toString('utf8').match(/APP_BUILD="([^"]+)"/)||[])[1])||'UNKNOWN';
console.log('ARTIFACT '+SRC+'\n         build='+SRC_BUILD+' sha256='+SRC_SHA.slice(0,16));
if(process.env.CF_EXPECT_BUILD&&SRC_BUILD!==process.env.CF_EXPECT_BUILD){
  console.error('ARTIFACT MISMATCH: runner expected '+process.env.CF_EXPECT_BUILD+', suite loaded '+SRC_BUILD);
  process.exit(3);
}
let passed=0;const failures=[];
const test=(n,f)=>{try{f();passed++;console.log('  ✓ '+n);}catch(e){failures.push(n);console.log('  ✗ '+n+'\n      '+(e&&e.message));}};
const ok=(v,m)=>{if(!v)throw new Error(m||'expected truthy');};
const eq=(a,b,m)=>{if(a!==b)throw new Error((m||'eq')+': '+JSON.stringify(a)+' !== '+JSON.stringify(b));};

(async()=>{
  const html=fs.readFileSync(SRC,'utf8');
  /* the coach report the server holds for the day under test */
  let serverRecap={date:null,text:'Solid day — calories on target.',mood:'happy',generated:null};
  const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch();
  const ctx=await browser.newContext({viewport:{width:390,height:844}});
  await ctx.route('**/api/**',r=>{
    const url=r.request().url();
    const reply=(st,b)=>r.fulfill({status:st,contentType:'application/json',body:JSON.stringify(b)});
    if(/cf\/writer\/lease/.test(url)){
      const b=JSON.parse(r.request().postData()||'{}');
      return reply(200,{ok:true,exists:true,granted:true,fence:1,holderDeviceId:b.deviceId,
        deviceName:b.deviceName||'x',active:true,serverNow:Date.now(),ttlMs:86400000});}
    if(/coach_reports/.test(url))
      return reply(200,{items:[{id:'r1',kind:'nightly',period:serverRecap.date,report:serverRecap}]});
    if(/collections\/appdata\/records/.test(url))return reply(200,{items:[]});
    return reply(200,{items:[],token:'tok',record:{id:'userA'}});});
  await ctx.addInitScript(()=>{
    localStorage.setItem('wl_pb',JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok',email:'a@x.com'}));
    localStorage.setItem('wl_last_owner','userA');
    localStorage.setItem('wl_v1',JSON.stringify({settings:{onboarded:true,units:'lbs',weekStart:'0'},
      weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},
      statuses:[],presets:[],skips:{},nightlyLog:{}}));});
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  await page.waitForTimeout(900);

  /* the day is COMPLETED: a coach recap exists for it, exactly as the
     server would hold it after the nightly run */
  const today=await page.evaluate(()=>todayISO());
  serverRecap.date=today;
  serverRecap.generated=new Date(Date.now()-3600000).toISOString();   /* an hour ago */
  const s=await page.evaluate((rec)=>{
    state.coachRpt={weekly:null,nightly:{[rec.date]:rec},tdee:null};
    state.selDate=rec.date;state.view='overview';render();   /* the check-in card lives here */
    return {completed:!!dayRecap(rec.date),
      hkButton:/Import from Apple Health/.test(document.body.innerText),
      /* the real "Complete today" button, NOT the recap card's Regenerate
         link — both carry data-act="night:gen" */
      completeButton:[...document.querySelectorAll('[data-act="night:gen"]')]
        .some(b=>/^Complete /.test(b.textContent.trim()))};},serverRecap);
  test('a completed day hides the Health import and the Complete button',()=>{
    ok(s.completed,'day not seen as completed');
    eq(s.hkButton,false,'Health import still offered on a completed day');
    eq(s.completeButton,false,'Complete button still offered');});

  /* REOPEN — his exact action */
  const t=await page.evaluate((iso)=>{
    reopenDay(iso);
    return {completed:!!dayRecap(iso),
      hkButton:/Import from Apple Health/.test(document.body.innerText),
      completeButton:[...document.querySelectorAll('[data-act="night:gen"]')]
        .some(b=>/^Complete /.test(b.textContent.trim())),
      stamp:(state.settings.reopened||{})[iso]||null,
      coachRptStillThere:!!(state.coachRpt.nightly&&state.coachRpt.nightly[iso])};},today);
  test('reopening returns the Health import and the Complete button',()=>{
    eq(t.completed,false,'day STILL reads as completed after reopen');
    ok(t.hkButton,'Health import did not come back — the Owner\'s exact symptom');
    ok(t.completeButton,'Complete button did not come back');});
  test('the reopen is a stamp, not a delete — the coach recap is preserved',()=>{
    ok(t.stamp,'no reopen stamp recorded');
    ok(t.coachRptStillThere,'the coach report was destroyed rather than suppressed');});

  /* THE REGRESSION THAT MATTERS: a sync replaces the coach cache wholesale.
     A delete-based fix would silently undo itself here. */
  const u=await page.evaluate(async(iso)=>{
    await new Promise(res=>fetchCoachReports(()=>res()));
    render();
    return {completed:!!dayRecap(iso),
      hkButton:/Import from Apple Health/.test(document.body.innerText),
      cacheRefilled:!!(state.coachRpt.nightly&&state.coachRpt.nightly[iso])};},today);
  test('a sync re-pulls the recap but the day STAYS reopened',()=>{
    ok(u.cacheRefilled,'the fetch did not refill the cache — arm is not proving anything');
    eq(u.completed,false,'the sync resurrected the completed state');
    ok(u.hkButton,'Health import vanished again after a sync');});

  /* re-completing with a NEWER recap closes the day again, and the stamp
     is not sticky */
  const v=await page.evaluate(async(args)=>{
    const [iso]=args;
    const fresh={date:iso,text:'Regenerated recap.',mood:'happy',generated:new Date(Date.now()+1000).toISOString()};
    state.coachRpt.nightly[iso]=fresh;render();
    return {completed:!!dayRecap(iso),
      hkButton:/Import from Apple Health/.test(document.body.innerText)};},[today]);
  test('a recap generated AFTER the reopen closes the day again',()=>{
    ok(v.completed,'a fresh recap did not re-complete the day');
    eq(v.hkButton,false,'Health import still offered after re-completion');});

  /* an untouched day is unaffected by any of this */
  const w=await page.evaluate((iso)=>{
    const other='2026-01-02';
    return {reopenedOther:!!(state.settings.reopened||{})[other],
      recapOther:!!dayRecap(other)};},today);
  test('reopening one day does not touch any other day',()=>{
    eq(w.reopenedOther,false);eq(w.recapOther,false);});

  test('no page errors',()=>eq(errs.length,0,errs.join(';')));

  await ctx.close();await browser.close();server.close();
  console.log(failures.length?`FAILED — ${passed} passed, ${failures.length} failed`:`OK — ${passed} passed`);
  process.exit(failures.length?1:0);
})().catch(e=>{console.error('SUITE ERROR',e);process.exit(2);});
