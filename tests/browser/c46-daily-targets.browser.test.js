/* C46 (browser) — the daily targets are on screen, and Weekly Totals counts
   the thing he programmes against.

   Owner, 2019-04-12: "I just realized there's no current macros on any of my
   screens like progress or summary. It should go where the weekly activity
   card is now and replace it. Show my targets for Daily Calories, Protein,
   Carbs and Fat. The weekly activity card doesn't tell me much. Replace Cardio
   sessions with Lifting Sessions. Cardio minutes is zone 2+ minutes."

   He was right that it was missing. Every macro surface showed what he HAD
   EATEN — weekly totals, weekly averages, the daily grid, the diary — and
   none showed what he was aiming at, so the number he plans a day around lived
   only in Settings.

   Two properties are load-bearing here and both are asserted:

     * the card READS state.settings.target*, never recomputes. It sits inches
       from bars graded against those same values; a second derivation would
       eventually disagree with the thing it is printed beside.

     * the report's "Lifting sessions" counts the SAME list the Weightlifting
       section prints. lrModel drops a session with no logged exercises while
       weekTrainingStats keeps every stored entry, so the obvious source made
       the card read "2" directly above "No lifting sessions logged this week".

       CF_SRC=<file> node tests/browser/c46-daily-targets.browser.test.js */
const path=require('path'),http=require('http'),fs=require('fs');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const SRC=process.env.CF_SRC||'/home/griffin/projects/compound-app/index.html';
let passed=0;const failures=[];
const test=(n,f)=>{try{f();passed++;console.log('  ✓ '+n);}catch(e){failures.push(n);console.log('  ✗ '+n+'\n      '+(e&&e.message));}};
const ok=(v,m)=>{if(!v)throw new Error(m||'expected truthy');};
const notOk=(v,m)=>{if(v)throw new Error(m||'expected falsy');};
const eq=(a,b,m)=>{if(a!==b)throw new Error((m||'eq')+': '+JSON.stringify(a)+' !== '+JSON.stringify(b));};

const SETTINGS={onboarded:true,units:'lbs',weekStart:'1',name:'Griffin',
  sex:'m',age:47,heightFt:'5',heightIn:'10',goalWeight:'175',startingWeight:'190',
  activityLevel:'active',strategy:'lose',targetValue:'1',
  targetCalories:'2180',targetProtein:'175',targetCarbs:'232',targetFat:'48',
  stepsGoal:'10000',cardioMinGoal:'60',liftSessGoal:'4'};

(async()=>{
  const html=fs.readFileSync(SRC,'utf8');
  const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch();
  const ctx=await browser.newContext({viewport:{width:390,height:844}});
  await ctx.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({items:[],token:'tok',record:{id:'userA'}})}));
  await ctx.addInitScript((st)=>{
    localStorage.setItem('wl_pb',JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok',email:'a@x.com'}));
    localStorage.setItem('wl_last_owner','userA');
    localStorage.setItem('wl_v1',JSON.stringify({settings:st,
      weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},
      statuses:[],presets:[],skips:{},nightlyLog:{},checkins:{}}));
  },SETTINGS);
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  await page.waitForTimeout(900);

  console.log('C46 — daily targets on screen');

  /* a realistic part-week: food, steps, one cardio, one real lift session */
  await page.evaluate(()=>{
    const day=n=>toISO(addDays(weekStartFor(0),n));
    for(let i=0;i<4;i++){
      state.food[day(i)]={calories:[2100,2240,1980,2160][i],protein:170+i,carbs:225+i*3,fat:50+i,fiber:28};
      state.steps[day(i)]=9000+i*500;
      state.weights.push({date:day(i),weight:173.2-i*0.2});
    }
    state.training={cardioTypes:['Peloton'],exercises:[{id:'e1',name:'Bench'}],routines:[],
      sessions:{[day(0)]:[{kind:'cardio',type:'Peloton',mins:35,zone:3}]},
      liftSessions:{[day(1)]:[{id:'s1',name:'Push',mins:52,
        entries:[{exId:'e1',name:'Bench',sets:[{w:135,r:8,status:'done'}]}]}]}};
    state.view='summary';render();
  });
  await page.waitForTimeout(400);

  /* ---- 1. the Summary tab ---- */
  const sum=await page.evaluate(()=>{
    const cards={};
    document.querySelectorAll('.wl-card').forEach(c=>{
      const head=c.querySelector('.wl-card-head span');
      if(head)cards[head.textContent.trim().split(' ')[0]+'|'+head.textContent.trim()]=c;});
    const targets=[...document.querySelectorAll('.wl-card')].find(c=>
      (c.querySelector('.wl-card-head span')||{}).textContent==='Daily Targets');
    const read=(card)=>[...card.querySelectorAll('.wl-stat')].map(s=>[
      (s.querySelector('.wl-stat-label')||{}).textContent,
      (s.querySelector('.wl-stat-val')||{}).textContent]);
    const totals=[...document.querySelectorAll('.wl-card')].find(c=>
      (c.querySelector('.wl-card-head span')||{}).textContent==='Weekly Totals');
    return {hasTargets:!!targets,
      targetTiles:targets?read(targets):null,
      totalTiles:totals?read(totals).map(t=>t[0]):null,
      liftSessionTile:totals?read(totals).filter(t=>t[0]==='Lifting sessions').map(t=>t[1])[0]:null,
      activityGone:!/Weekly Activity/.test(document.body.innerText),
      cardioSessionsGone:!/Cardio sessions/.test(document.body.innerText)};
  });

  test('the Summary tab shows a Daily Targets card',()=>ok(sum.hasTargets));
  test('with exactly the four he asked for, in his order',()=>{
    eq((sum.targetTiles||[]).map(t=>t[0]).join(','),'Calories,Protein,Carbs,Fat');
  });
  test('showing his real targets, read from settings and not recomputed',()=>{
    const v=Object.fromEntries(sum.targetTiles);
    eq(v.Calories,'2,180');
    eq(v.Protein,'175g');eq(v.Carbs,'232g');eq(v.Fat,'48g');
  });
  test('and Weekly Activity is gone — it is what the card replaced',()=>ok(sum.activityGone));

  test('Weekly Totals counts Lifting sessions, not Cardio sessions',()=>{
    ok((sum.totalTiles||[]).indexOf('Lifting sessions')>=0,'tiles: '+sum.totalTiles);
    ok(sum.cardioSessionsGone,'"Cardio sessions" should be gone entirely');
    eq(sum.liftSessionTile,'1','one lift session was logged');
  });
  test('and cardio minutes say on the tile that they are zone 2+',()=>{
    ok((sum.totalTiles||[]).some(t=>/Cardio min/.test(t)&&/Z2\+/.test(t)),'tiles: '+sum.totalTiles);
  });

  /* ---- 2. the card follows the settings, rather than holding a copy ---- */
  const changed=await page.evaluate(()=>{
    state.settings.targetCalories='1950';state.settings.targetProtein='180';
    render();
    const card=[...document.querySelectorAll('.wl-card')].find(c=>
      (c.querySelector('.wl-card-head span')||{}).textContent==='Daily Targets');
    return Object.fromEntries([...card.querySelectorAll('.wl-stat')].map(s=>[
      s.querySelector('.wl-stat-label').textContent,s.querySelector('.wl-stat-val').textContent]));
  });
  test('changing a target in settings moves the card',()=>{
    eq(changed.Calories,'1,950');eq(changed.Protein,'180g');
  });

  /* ---- 3. no targets set: an honest dash and where to fix it ---- */
  const none=await page.evaluate(()=>{
    ['targetCalories','targetProtein','targetCarbs','targetFat'].forEach(k=>state.settings[k]='');
    state.settings.macroAuto=false;   /* stop auto refilling them */
    render();
    const card=[...document.querySelectorAll('.wl-card')].find(c=>
      (c.querySelector('.wl-card-head span')||{}).textContent==='Daily Targets');
    return {vals:[...card.querySelectorAll('.wl-stat-val')].map(e=>e.textContent),
            hint:(card.querySelector('.wl-hint')||{}).textContent||''};
  });
  test('with nothing set it shows dashes, never a confident zero',()=>{
    ok(none.vals.every(v=>v==='—'),'got '+JSON.stringify(none.vals));
  });
  test('and says where to set them',()=>ok(/Settings/.test(none.hint),'hint: '+none.hint));

  /* ---- 4. the progress report ---- */
  const rep=await page.evaluate(()=>{
    ['targetCalories','targetProtein','targetCarbs','targetFat'].forEach((k,i)=>
      state.settings[k]=['2180','175','232','48'][i]);
    const doc=srReportHTML(srInput(0));
    return {hasTargets:/Daily Targets/.test(doc),
            activityGone:!/Weekly Activity/.test(doc),
            hasVals:/2,180/.test(doc)&&/175/.test(doc)&&/232/.test(doc)&&/48/.test(doc),
            liftLabel:/Lifting sessions/.test(doc),
            cardioSessionsGone:!/Cardio sessions/.test(doc),
            zoneLabel:/Cardio min \(Z2\+\)/.test(doc)};
  });
  test('the coach report carries the targets too',()=>{
    ok(rep.hasTargets,'no Daily Targets card');
    ok(rep.hasVals,'the numbers must be in the document');
    ok(rep.activityGone,'Weekly Activity should be replaced there as well');
  });
  test('and the report names lifting sessions and the cardio zone',()=>{
    ok(rep.liftLabel);ok(rep.cardioSessionsGone);ok(rep.zoneLabel);
  });

  /* ---- 5. THE SELF-CONTRADICTION THIS COST ----
     lrModel drops a lift session with no logged exercises; weekTrainingStats
     keeps it. Taking the tile from the stats made the report print a count
     above a section that then said there were none. */
  const consistent=await page.evaluate(()=>{
    const day=n=>toISO(addDays(weekStartFor(0),n));
    /* a session that was started and abandoned: stored, but nothing logged */
    state.training.liftSessions[day(3)]=[{id:'s2',name:'Abandoned',mins:4,entries:[]}];
    const inp=srInput(0);
    const doc=srReportHTML(inp);
    const stats=weekTrainingStats(weekStartFor(0));
    const tile=(inp.totals.filter(t=>t.label==='Lifting sessions')[0]||{}).v;
    return {statsSays:stats.liftSessions,listHas:inp.sessions.length,tile:tile,
            saysNone:/No lifting sessions logged this week/.test(doc)};
  });
  test('the two sources really can disagree — the trap is real',()=>{
    eq(consistent.statsSays,2,'the stats counter keeps the empty session');
    eq(consistent.listHas,1,'the printed list drops it');
  });
  test('and the report tile follows the list it prints, so the document agrees with itself',()=>{
    eq(consistent.tile,1,'the tile must match what the Weightlifting section shows');
    notOk(consistent.saysNone,'with one real session the section is not empty');
  });

  test('no page errors',()=>eq(errs.length,0,errs.join(' | ')));

  console.log('\n'+passed+' passed, '+failures.length+' failed');
  await browser.close();server.close();
  process.exit(failures.length?1:0);
})();
