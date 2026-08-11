/* C42 (browser) — the weekly check-in lands on the report for the week it
   describes, however late it was written.

   Owner, 2026-08-11: "The questions I fill out on weekly checking need to go
   with the previous week progress report. Even if it's late. I just filled it
   out for last week. That is the end of the week report my coach sees."

   The trap this guards is the obvious implementation: matching a check-in to a
   report by WHEN IT WAS SUBMITTED. Do that and a check-in filled in on the 11th
   attaches to the week containing the 11th — the week it says nothing about —
   while the week it actually describes ships to the coach with the athlete's
   voice missing. The correct key is what the check-in COVERS.

       CF_SRC=<file> node tests/browser/c42-checkin-on-report.browser.test.js */
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

  console.log('C42 — the check-in goes with the week it describes');

  /* Seed a check-in on the check-in day that FOLLOWS last week, written late:
     the answers describe last week, the timestamp is days afterwards. */
  const seeded=await run(()=>{
    const lastWeekStart=toISO(weekStartFor(-1));          // the report week
    const key=toISO(addDays(weekStartFor(-1),7));         // its check-in day
    state.checkins={};
    state.checkins[key]={
      status:'sent',
      /* deliberately LATE: three days after the check-in day */
      updated:addDays(parseISO(key),3).getTime(),
      answers:{win:'Hit a PR on incline press',
               challenge:'Weekend eating got away from me',
               training:'Strong, legs felt heavy on day 3',
               discomfort:'Left elbow a bit sore'},
    };
    return {lastWeekStart:lastWeekStart, key:key, covered:ciCovered(key),
            lastWeekEnd:toISO(addDays(weekStartFor(-1),6))};
  });

  test('the check-in day for last week covers exactly last week',()=>{
    /* the mapping the whole feature rests on */
    eq(seeded.covered.start,seeded.lastWeekStart,'covered week should start on the report week');
    eq(seeded.covered.end,seeded.lastWeekEnd,'covered week should end on the report week');
  });

  const lastWeek=await run(()=>{
    const inp=srInput(-1);
    const doc=srReportHTML(inp);
    return {checkin:inp.checkin, inDoc:/In his own words/.test(doc), doc:doc.slice(0,0),
            hasWin:/Hit a PR on incline press/.test(doc),
            hasChallenge:/Weekend eating got away from me/.test(doc)};
  });

  test("LAST week's report carries the answers, though written days late",()=>{
    ok(lastWeek.checkin,'no check-in attached to last week');
    eq(lastWeek.checkin.answered,4);
    ok(lastWeek.inDoc,'the card is missing from the document');
    ok(lastWeek.hasWin,'the win answer is missing');
    ok(lastWeek.hasChallenge,'the challenge answer is missing');
  });

  test('it says WHEN it was written, so the coach can judge how fresh it is',()=>{
    ok(lastWeek.checkin.lateDays>=1,'lateness should be recorded, got '+lastWeek.checkin.lateDays);
  });

  /* The actual bug being guarded: a submitted-date match would put it here. */
  const thisWeek=await run(()=>{
    const inp=srInput(0);
    return {checkin:inp.checkin, inDoc:/In his own words/.test(srReportHTML(inp))};
  });
  test('THIS week\'s report does NOT get it, despite the late timestamp',()=>{
    ok(!thisWeek.checkin,'the check-in leaked onto the wrong week');
    ok(!thisWeek.inDoc,'the card rendered on a week it does not describe');
  });

  /* an unrelated older week must not pick it up either */
  const older=await run(()=>({checkin:srInput(-3).checkin}));
  test('an unrelated week gets nothing',()=>ok(!older.checkin));

  /* a skipped check-in is reported honestly rather than silently omitted */
  const skipped=await run(()=>{
    const key=toISO(addDays(weekStartFor(-1),7));
    state.checkins[key]={status:'skipped',updated:parseISO(key).getTime(),answers:{}};
    const inp=srInput(-1);
    return {status:inp.checkin&&inp.checkin.status, doc:/Check-in skipped/.test(srReportHTML(inp))};
  });
  test('a skipped week says so rather than vanishing',()=>{
    eq(skipped.status,'skipped');
    ok(skipped.doc,'the report should state the check-in was skipped');
  });

  const none=await run(()=>{
    state.checkins={};
    const inp=srInput(-1);
    return {checkin:inp.checkin, inDoc:/In his own words/.test(srReportHTML(inp))};
  });
  test('no check-in at all omits the card entirely',()=>{
    ok(!none.checkin);ok(!none.inDoc);
  });

  test('no page errors',()=>eq(errs.length,0,errs.join(' | ')));

  console.log('\n'+passed+' passed, '+failures.length+' failed');
  await browser.close();server.close();
  process.exit(failures.length?1:0);
})();
