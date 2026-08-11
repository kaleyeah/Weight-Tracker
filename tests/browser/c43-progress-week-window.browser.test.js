/* C43 (browser) — the Progress tab's W window is the check-in week.

   Owner, 2026-08-10: "The time frame it's wrong in progress. It should be last
   week is August 3-9 but it shows August 4-10." Then the rule, from him:
   "The logic is check in day plus 6 days."

   W used to be a ROLLING seven days ending today, so the same seven days had
   one name on Progress and a different one on Summary, the report and the
   check-in. This proves the whole Progress page — the measurement trend AND
   everything trendCtx() drives (sleep, steps, calories, training history) —
   now agrees with the check-in week.

       CF_SRC=<file> node tests/browser/c43-progress-week-window.browser.test.js */
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
  const ctx=await browser.newContext({viewport:{width:390,height:844}});
  await ctx.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({items:[],token:'tok',record:{id:'userA'}})}));
  await ctx.addInitScript(()=>{
    localStorage.setItem('wl_pb',JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok',email:'a@x.com'}));
    localStorage.setItem('wl_last_owner','userA');
    localStorage.setItem('wl_v1',JSON.stringify({settings:{onboarded:true,units:'lbs',weekStart:'1',name:'G'},
      weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},
      statuses:[],presets:[],skips:{},nightlyLog:{},checkins:{}}));
  });
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  await page.waitForTimeout(900);
  const run=(fn,arg)=>page.evaluate(fn,arg);

  console.log('C43 — Progress W is the check-in week');

  /* The Owner's own report, reproduced exactly: Monday 10 August, weeks start
     Monday. The rolling window called this Aug 4–10. */
  const owner=await run(()=>({
    rolling:tcPeriod('W',0,'2026-08-10'),
    aligned:tcPeriod('W',0,'2026-08-10',1),
    lastWeek:tcPeriod('W',1,'2026-08-10',1)}));

  test('the reported symptom is real: rolling W called Aug 10 "Aug 4 – Aug 10"',()=>{
    eq(owner.rolling.startISO,'2026-08-04');eq(owner.rolling.endISO,'2026-08-10');
  });
  test('aligned W starts on the check-in day and runs 6 more',()=>{
    eq(owner.aligned.startISO,'2026-08-10');eq(owner.aligned.endISO,'2026-08-16');
  });
  test('the week he was asking for is one step back, and named right',()=>{
    eq(owner.lastWeek.startISO,'2026-08-03');eq(owner.lastWeek.endISO,'2026-08-09');
    ok(/Aug 3 – Aug 9/.test(owner.lastWeek.label),'label was '+owner.lastWeek.label);
  });

  /* The point of the change: Progress and Summary must name the same days. */
  const agree=await run(()=>{
    state.settings.weekStart='1';
    state.t2Mode='W';state.t2Off=1;
    const p=tcPeriod('W',1,todayISO(),weekStartDow());
    return {trendStart:p.startISO,trendEnd:p.endISO,
            summaryStart:toISO(weekStartFor(-1)),summaryEnd:toISO(addDays(weekStartFor(-1),6)),
            ctxStart:toISO(trendCtx().start),ctxEnd:toISO(trendCtx().end)};
  });
  test('the trend week and the Summary week are the same seven days',()=>{
    eq(agree.trendStart,agree.summaryStart);eq(agree.trendEnd,agree.summaryEnd);
  });
  test('trendCtx — which drives sleep, steps, calories and history — agrees too',()=>{
    eq(agree.ctxStart,agree.summaryStart);eq(agree.ctxEnd,agree.summaryEnd);
  });

  /* A Sunday-start athlete must get Sunday weeks, and weekStartDow 0 must not
     be mistaken for "no argument given". */
  const sun=await run(()=>{
    state.settings.weekStart='0';
    const p=tcPeriod('W',1,todayISO(),weekStartDow());
    return {dow:weekStartDow(),start:p.startISO,
            summaryStart:toISO(weekStartFor(-1)),
            startDay:new Date(p.startISO+'T00:00:00').getDay()};
  });
  test('a Sunday-start athlete gets Sunday weeks on Progress',()=>{
    eq(sun.dow,0);eq(sun.startDay,0,'week must start on a Sunday');
    eq(sun.start,sun.summaryStart);
  });

  /* Averages must not be diluted by days that have not happened yet. */
  const partial=await run(()=>{
    state.settings.weekStart='1';
    state.t2Mode='W';state.t2Off=0;
    const days=[];const ctx=trendCtx();
    for(let d=new Date(ctx.start);d<=ctx.end;d=addDays(d,1))days.push(toISO(d));
    state.steps={};
    /* log 10,000 on the first two days only; the rest of the week is unlived */
    state.steps[days[0]]=10000;state.steps[days[1]]=10000;
    const bk=bucketValues(state.steps,true);
    return {n:bk.length,logged:bk.filter(b=>b.value!=null).length,avg:bucketAvg(bk)};
  });
  test('an unlived day is empty, never a zero that drags the average down',()=>{
    eq(partial.n,7,'the window is still a full seven days');
    eq(partial.logged,2);
    eq(partial.avg,10000,'average must be over logged days only');
  });

  /* only the WEEK was wrong; nothing here should have moved M or 6M */
  const modes=await run(()=>({
    m:tcPeriod('M',0,'2026-08-10',1),m0:tcPeriod('M',0,'2026-08-10'),
    s:tcPeriod('6M',0,'2026-08-10',1),s0:tcPeriod('6M',0,'2026-08-10')}));
  test('M and 6M are unchanged by the anchor',()=>{
    eq(modes.m.startISO,modes.m0.startISO);eq(modes.m.endISO,modes.m0.endISO);
    eq(modes.s.startISO,modes.s0.startISO);eq(modes.s.endISO,modes.s0.endISO);
  });

  test('no page errors',()=>eq(errs.length,0,errs.join(' | ')));

  console.log('\n'+passed+' passed, '+failures.length+' failed');
  await browser.close();server.close();
  process.exit(failures.length?1:0);
})();
