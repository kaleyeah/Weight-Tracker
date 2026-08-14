/* Renders the new daily-ratings + weekly-check-in surfaces to PNGs for review.
       node tests/browser/c20-shots.js [outdir]                                */
const path=require('path'),http=require('http'),fs=require('fs');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const SRC=process.env.CF_SRC||'/home/griffin/projects/compound-app/index.html';
const OUT=process.argv[2]||'/tmp/c20-shots';

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const html=fs.readFileSync(SRC,'utf8');
  const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch();
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
  await ctx.addInitScript(()=>{
    localStorage.setItem('wl_pb',JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok',email:'a@x.com'}));
    localStorage.setItem('wl_last_owner','userA');
    localStorage.setItem('wl_v1',JSON.stringify({
      settings:{onboarded:true,units:'lbs',weekStart:'1',name:'Griffin',
        targetCalories:2150,targetProtein:180,targetCarbs:200,targetFat:60,
        startingWeight:198,goalWeight:175,stepsGoal:10000,sleepGoal:'450'},
      weights:[{date:'2026-07-20',weight:189.2},{date:'2026-07-27',weight:201.8},
               {date:'2026-07-30',weight:200.6},{date:'2026-08-02',weight:199.0},{date:'2026-08-03',weight:198.6}],
      food:{'2026-08-01':{calories:2180,protein:176,carbs:198,fat:62},
            '2026-08-02':{calories:2090,protein:181,carbs:186,fat:58},
            '2026-08-03':{calories:2140,protein:178,carbs:192,fat:61}},
      workouts:{},steps:{'2026-07-30':10250,'2026-07-31':9600,'2026-08-01':11400,'2026-08-02':9100,'2026-08-03':10480},
      notes:{},sleep:{'2026-08-01':432,'2026-08-02':408,'2026-08-03':451},
      bodyfat:{},waist:{'2026-08-02':34.5},leanmass:{},statuses:[],presets:[],skips:{},nightlyLog:{}}));
  });
  await ctx.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({items:[],token:'tok',record:{id:'userA'}})}));
  const page=await ctx.newPage();
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  await page.waitForFunction(()=>typeof window.render==='function',null,{timeout:15000});

  /* fourteen days of plausible ratings: recovery and energy sag over the last week */
  await page.evaluate(()=>{
    const pick=(a,i)=>a[i%a.length];
    const d=parseISO(todayISO());state.ratings={};
    const early={hunger:['just_right','slightly_high','just_right'],sleepQuality:['good','excellent','good'],
      stress:['a_little','none','a_little'],recovery:['good','excellent','good'],
      energy:['good','good','excellent'],digestion:['okay','good','poor']};
    const late={hunger:['slightly_high','just_right','too_high'],sleepQuality:['okay','poor','okay'],
      stress:['some','high','some'],recovery:['okay','poor','okay'],
      energy:['okay','low','okay'],digestion:['good','excellent','good']};
    for(let i=13;i>=0;i--){
      const x=new Date(d);x.setDate(x.getDate()-i);
      if(i===9)continue;                                  /* one unanswered day */
      const src=i>6?early:late;const day={};
      Object.keys(src).forEach(k=>{day[k]=pick(src[k],i);});
      state.ratings[toISO(x)]=day;
    }
    state.glp={settings:{enabled:true,showDueDate:true,titration:true,siteRotation:true,symptomLogging:true},
      compound:{name:'Tirzepatide',dose:'5',unit:'mg',cadenceDays:7},
      doses:[{id:'d1',dose:'2.5',unit:'mg',takenAt:Date.parse('2026-06-29T09:00:00Z'),skipped:false},
             {id:'d2',dose:'2.5',unit:'mg',takenAt:Date.parse('2026-07-06T09:00:00Z'),skipped:false},
             {id:'d3',dose:'5',unit:'mg',takenAt:Date.parse('2026-07-13T09:00:00Z'),skipped:false},
             {id:'d4',dose:'5',unit:'mg',takenAt:Date.parse('2026-07-27T09:00:00Z'),skipped:false}],
      symptoms:[],symptomTypes:[]};
    state.settings.ciSince=toISO(weekStartFor(0));
    state.checkins={};state.view='overview';save();render();
  });

  const shot=async(name,clip)=>{await page.screenshot({path:path.join(OUT,name+'.png'),fullPage:!clip});console.log('  '+name+'.png');};

  console.log('writing to '+OUT);
  await shot('01-home-checkin-due');

  await page.evaluate(()=>{state.quickEntry='feel';render();});
  await shot('02-feelings-sheet',true);

  await page.evaluate(()=>{state.quickEntry=null;state.view='weight';render();});
  await shot('03-progress-trend');

  await page.evaluate(()=>{
    state.nightlyLog={};state.nightlyLog[todayISO()]={text:
      'Weight is still tracking down and your intake held steady all week — that part is working.\n\n'+
      'What I want to flag is recovery. It has been sitting at okay or worse for four days now and energy is following it down, while your training volume has not changed. That is the shape of accumulating fatigue, not a bad night.\n\n'+
      'Hold the volume where it is this week rather than adding to it, and get one earlier night in. If recovery is still flat by the weekend we pull a session.',
      generated:1,mood:null};
    state.nightOpen=true;state.view='overview';save();render();});
  await shot('04-coach-report-trend-first');

  await page.evaluate(()=>{document.querySelector('[data-act="ci:open"]').click();});
  await page.waitForTimeout(300);
  await shot('05-checkin-form');

  await page.evaluate(()=>{
    const wk=state.ciWeek;const r=ciDraft(wk);
    r.answers.adherence='mostly_on';
    r.answers.win='Hit 3 plates on squat for a clean triple — first time since the cut started.';
    r.answers.challenge='Wednesday and Thursday were long work days and I ate late both nights.';
    r.answers.training='Heavy but slower than usual. Bar speed was off on the last two sessions.';
    save();render();});
  await page.waitForTimeout(200);
  await shot('06-checkin-answered');

  await page.evaluate(()=>{state.ciSkipAsk=state.ciWeek;render();});
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  await shot('07-skip-confirm');

  /* late + a second open week */
  await page.evaluate(()=>{
    state.ciSkipAsk=null;
    const wk=toISO(weekStartFor(0));
    const older=toISO(new Date(parseISO(wk).getTime()-7*86400000));
    state.settings.ciSince=older;state.checkins={};
    const real=window.todayISO;
    window.todayISO=()=>{const d=parseISO(wk);d.setDate(d.getDate()+4);return toISO(d);};
    state.view='overview';render();window.__restore=real;});
  await shot('08-late-two-weeks');
  await page.evaluate(()=>{window.todayISO=window.__restore;});

  /* sent state + history */
  await page.evaluate(()=>{
    const wk=toISO(weekStartFor(0));
    state.settings.ciSince=wk;
    state.checkins={};
    state.checkins[wk]={status:'sent',ts:Date.now()-3600e3,updated:Date.now()-3600e3,
      answers:{adherence:'mostly_on',win:'Hit 3 plates.',challenge:'Late meals.',training:'Heavy.'}};
    const prev=toISO(new Date(parseISO(wk).getTime()-7*86400000));
    state.settings.ciSince=prev;
    state.checkins[prev]={status:'skipped',ts:Date.now()-7*86400e3,updated:Date.now()-7*86400e3,answers:{}};
    state.view='overview';save();render();});
  await shot('09-sent-state');
  await page.evaluate(()=>{state.view='weight';render();});
  await shot('10-checkin-history');

  /* narrow */
  await page.setViewportSize({width:320,height:800});
  await page.evaluate(()=>{state.view='overview';state.quickEntry='feel';render();});
  await shot('11-narrow-320',true);

  await browser.close();server.close();
})();
