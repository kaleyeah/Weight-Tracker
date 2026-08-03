/* C20 — daily subjective ratings + weekly check-in, driven in real Chromium.

       node tests/browser/c20-feelings-checkin.browser.test.js

   Covers the Owner-approved behaviours from
   features/daily-subjective-ratings/SPEC.md: six questions with stable enum
   storage, the count-only collapsed summary, never blocking "Complete today",
   the Progress-tab trend, the coach-report block leading the recap, and the
   weekly check-in card that replaces the progress-photo prompt (persistent,
   escalating lateness, explicit skip, editable after sending). */
const path=require('path'),http=require('http'),fs=require('fs');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const SRC=process.env.CF_SRC||'/home/griffin/projects/compound-app/index.html';

let passed=0;const failures=[];
const test=(n,f)=>{try{const r=f();if(r&&r.then)throw new Error('await outside test()');passed++;console.log('  ✓ '+n);}catch(e){failures.push(n);console.log('  ✗ '+n+'\n      '+(e&&e.message));}};
const eq=(a,b,m)=>{const x=JSON.stringify(a),y=JSON.stringify(b);if(x!==y)throw new Error((m?m+': ':'')+`expected ${y}, got ${x}`);};
const ok=(v,m)=>{if(!v)throw new Error(m||'expected truthy');};
const notOk=(v,m)=>{if(v)throw new Error(m||'expected falsy');};

(async()=>{
  const html=fs.readFileSync(SRC,'utf8');
  const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch();
  const ctx=await browser.newContext({viewport:{width:390,height:844}});
  await ctx.addInitScript(()=>{
    localStorage.setItem('wl_pb',JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok',email:'a@x.com'}));
    localStorage.setItem('wl_last_owner','userA');
    localStorage.setItem('wl_v1',JSON.stringify({
      settings:{onboarded:true,units:'lbs',weekStart:'1',targetCalories:2150},
      weights:[{date:'2026-07-27',weight:186.8},{date:'2026-08-02',weight:184.0}],
      food:{},workouts:{},steps:{'2026-08-01':9100,'2026-08-02':10400},notes:{},sleep:{'2026-08-02':440},
      bodyfat:{},waist:{'2026-08-02':34.5},leanmass:{},statuses:[],presets:[],skips:{},nightlyLog:{}}));
  });
  await ctx.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({items:[],token:'tok',record:{id:'userA'}})}));
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  await page.waitForFunction(()=>typeof window.render==='function',null,{timeout:15000});
  console.log('\nC20 (browser) — how you felt + weekly check-in\n  source: '+SRC);
  console.log('  build : '+await page.evaluate(()=>window.APP_BUILD));

  const ev=fn=>page.evaluate(fn);
  const reset=()=>ev(()=>{state.ratings={};state.checkins={};state.feelOpen=null;state.ciWeek=null;
    state.ciSkipAsk=null;state.view='overview';state.selDate=todayISO();save();render();});

  /* ---- T1: the row exists, sits directly above Notes, and starts empty ---- */
  await reset();
  const t1=await ev(()=>{
    const rows=[].slice.call(document.querySelectorAll('.wl-check .wl-ck-row'));
    const labs=rows.map(r=>(r.querySelector('.wl-ck-lab')||{}).textContent||'');
    const i=labs.indexOf('How you felt');
    const feel=rows[i];
    return {labs,i,next:labs[i+1]||null,val:feel?feel.querySelector('.wl-ck-val').textContent:null,
      act:feel?feel.getAttribute('data-act'):null};
  });
  test('T1 "How you felt" row renders directly above Notes, empty state = "Add"',()=>{
    ok(t1.i>=0,'row not found; labels were '+JSON.stringify(t1.labs));
    eq(t1.next,'Notes','row after it');
    eq(t1.val,'Add');
    eq(t1.act,'dl:open','the row must open the same sheet the other check-in rows use');
  });

  /* ---- T2: opens as a SHEET like Calories, not an inline accordion ------- */
  await ev(()=>{
    [].slice.call(document.querySelectorAll('.wl-check .wl-ck-row'))
      .filter(r=>(r.querySelector('.wl-ck-lab')||{}).textContent==='How you felt')[0].click();});
  const t2s=await ev(()=>{
    const card=document.querySelector('.wl-confirm .wl-confirm-card');
    return {sheet:!!card,sec:state.quickEntry,
      title:card?card.querySelector('div[style*="font-weight:800"]').textContent:null,
      inCheckCard:!!document.querySelector('.wl-check .wl-feelq'),
      close:!!document.querySelector('[data-act="qe:close"]'),
      done:!!document.querySelector('.wl-confirm-card .wl-btn-primary')};});
  test('T2 the questions open in the quick-entry sheet, titled and closable, never inline',()=>{
    ok(t2s.sheet,'no sheet was raised');
    eq(t2s.sec,'feel');
    eq(t2s.title,'How you felt');
    notOk(t2s.inCheckCard,'the questions must not render inside the check-in card');
    ok(t2s.close&&t2s.done,'the sheet needs its ✕ and its Done button');
  });

  const t2=await ev(()=>{
    const qs=[].slice.call(document.querySelectorAll('.wl-confirm-card .wl-feelq'));
    return {n:qs.length,
      names:qs.map(q=>q.querySelector('.wl-feelq-h span').textContent),
      chips:qs.map(q=>q.querySelectorAll('.wl-feelchip').length),
      first:[].slice.call(qs[0].querySelectorAll('.wl-feelchip .lg')).map(c=>c.textContent),
      unanswered:qs.every(q=>q.querySelector('.wl-feelq-h .na')),
      pressed:qs[0].querySelector('.wl-feelchip').getAttribute('aria-pressed')};
  });
  test('T2b six questions, five labelled chips each, all "Not answered"',()=>{
    eq(t2.n,6);
    eq(t2.names,['Hunger','Sleep quality','Stress','Recovery','Energy','Digestion']);
    eq(t2.chips,[5,5,5,5,5,5]);
    eq(t2.first,['Too low','Slightly low','Just right','Slightly high','Too high']);
    ok(t2.unanswered,'expected every question to read Not answered');
    eq(t2.pressed,'false');
  });

  /* ---- T3: Hunger replaced Appetite; Digestion is balanced --------------- */
  const t3=await ev(()=>({
    keys:RATINGS.map(q=>q[0]),
    hunger:RATINGS.filter(q=>q[0]==='hunger')[0][2].map(o=>o[1]),
    digestion:RATINGS.filter(q=>q[0]==='digestion')[0][2].map(o=>o[1]),
    recovery:RATINGS.filter(q=>q[0]==='recovery')[0][2].map(o=>o[1]),
    appetite:RATINGS.some(q=>/appetite/i.test(q[1]))}));
  test('T3 Hunger not Appetite; Digestion balanced like Recovery',()=>{
    eq(t3.keys,['hunger','sleepQuality','stress','recovery','energy','digestion']);
    notOk(t3.appetite,'an Appetite question still exists');
    eq(t3.digestion,t3.recovery,'Digestion scale must match the neutral-midpoint shape');
    eq(t3.digestion[2],'Okay','midpoint must be neutral, not "Minor problems"');
  });

  /* ---- T4: a choice stores the ENUM, and the row shows a COUNT ----------- */
  await ev(()=>{document.querySelector('[data-act="rat:set"][data-q="hunger"][data-v="just_right"]').click();
                document.querySelector('[data-act="rat:set"][data-q="stress"][data-v="a_little"]').click();});
  const t4=await ev(()=>{
    const stored=JSON.parse(localStorage.getItem('wl_v1')).ratings[todayISO()];
    const row=[].slice.call(document.querySelectorAll('.wl-ck-row'))
      .filter(r=>(r.querySelector('.wl-ck-lab')||{}).textContent==='How you felt')[0];
    return {stored,val:row.querySelector('.wl-ck-val').textContent,
      hdr:document.querySelector('#feelq-hunger').parentNode.querySelector('.a').textContent,
      pressed:document.querySelector('[data-act="rat:set"][data-q="hunger"][data-v="just_right"]').getAttribute('aria-pressed')};
  });
  test('T4 stores the stable enum, header shows the full label, row shows a count only',()=>{
    eq(t4.stored.hunger,'just_right');
    eq(t4.stored.stress,'a_little');
    eq(t4.val,'2 of 6','collapsed row must show the count, never the values');
    eq(t4.hdr,'Just right');
    eq(t4.pressed,'true');
    notOk(/just right/i.test(t4.val),'the row must not leak the chosen value');
  });

  /* ---- T5: same wording on a past day ----------------------------------- */
  const t5=await ev(()=>{
    state.selDate='2026-08-01';render();
    const labs=[].slice.call(document.querySelectorAll('.wl-check .wl-ck-lab')).map(x=>x.textContent);
    state.selDate=todayISO();render();
    return labs;});
  test('T5 a past day uses the same "How you felt" wording',()=>{
    ok(t5.indexOf('How you felt')>=0,'labels were '+JSON.stringify(t5));
  });

  /* ---- T6: ratings never block "Complete today" ------------------------- */
  const t6=await ev(()=>{
    state.ratings={};save();
    const before=dayMissing(todayISO());
    state.ratings[todayISO()]={hunger:'just_right'};save();
    const after=dayMissing(todayISO());
    return {before,after,mentions:before.concat(after).some(x=>/feel|hunger|stress|recovery|energy|digest|sleep quality/i.test(x))};
  });
  test('T6 unanswered ratings never appear in the completion blockers',()=>{
    notOk(t6.mentions,'blockers were '+JSON.stringify(t6.before)+' / '+JSON.stringify(t6.after));
    eq(t6.before,t6.after,'answering must not change what blocks completion');
  });

  /* ---- T7: goodness scoring is direction-correct ------------------------ */
  const t7=await ev(()=>({
    hungerMid:ratGood('hunger','just_right'),hungerHigh:ratGood('hunger','too_high'),hungerLow:ratGood('hunger','too_low'),
    stressNone:ratGood('stress','none'),stressVery:ratGood('stress','very_high'),
    energyBest:ratGood('energy','excellent'),energyWorst:ratGood('energy','very_low'),
    junk:ratGood('energy','not_a_value'),unset:ratGood('energy',null)}));
  test('T7 best-in-the-middle and best-at-zero scales score in the same direction',()=>{
    eq(t7.hungerMid,5);eq(t7.hungerHigh,1);eq(t7.hungerLow,1);
    eq(t7.stressNone,5);eq(t7.stressVery,1);
    eq(t7.energyBest,5);eq(t7.energyWorst,1);
    eq(t7.junk,null,'an unknown enum must not score');
    eq(t7.unset,null);
  });

  /* ---- T8: only canonical enums are accepted --------------------------- */
  const t8=await ev(()=>{state.ratings={};ratSet(todayISO(),'energy','sneaky');ratSet(todayISO(),'nosuchq','good');
    const bad=JSON.parse(JSON.stringify(state.ratings));
    ratSet(todayISO(),'energy','good');
    return {bad,good:state.ratings[todayISO()].energy};});
  test('T8 non-canonical values and unknown questions are ignored',()=>{
    eq(t8.bad,{},'nothing should have been stored');
    eq(t8.good,'good');
  });

  /* ---- T9: re-tapping the chosen chip clears it ------------------------ */
  const t9=await ev(()=>{state.ratings={};ratSet(todayISO(),'energy','good');
    const on=state.ratings[todayISO()].energy;
    ratSet(todayISO(),'energy','good');
    return {on,off:(state.ratings[todayISO()]||{}).energy||null,pruned:!state.ratings[todayISO()]};});
  test('T9 tapping the chosen chip again clears it and prunes the empty day',()=>{
    eq(t9.on,'good');eq(t9.off,null);ok(t9.pruned,'an all-null day should not be kept');
  });

  /* ---- T10: Progress tab trend card ------------------------------------ */
  const t10=await ev(()=>{
    const wk=toISO(weekStartFor(0));const d=parseISO(wk);const days=[];
    for(let i=0;i<7;i++){days.push(toISO(d));d.setDate(d.getDate()+1);}
    state.ratings={};
    state.ratings[days[0]]={recovery:'good',energy:'okay'};
    state.ratings[days[1]]={recovery:'poor'};
    save();state.view='weight';render();
    const card=[].slice.call(document.querySelectorAll('.wl-card'))
      .filter(c=>/How you’ve felt/.test((c.querySelector('.wl-card-head')||{}).textContent||''))[0];
    const rows=[].slice.call(card.querySelectorAll('.wl-fgrid .k')).map(x=>x.textContent);
    const cells=[].slice.call(card.querySelectorAll('.wl-fcells')[0].children).map(c=>({t:c.textContent,na:c.className.indexOf('na')>=0}));
    state.view='overview';render();
    return {found:!!card,rows,cells,dow:card.querySelectorAll('.wl-fdow span').length};
  });
  test('T10 Progress tab shows a per-question week grid with "–" for unanswered days',()=>{
    ok(t10.found,'How you’ve felt card missing from the Progress tab');
    eq(t10.rows,['Hunger','Sleep quality','Stress','Recovery','Energy','Digestion']);
    eq(t10.dow,7);
    eq(t10.cells.length,7);
    ok(t10.cells.every(c=>c.na?c.t==='–':/^[1-5]$/.test(c.t)),'cells were '+JSON.stringify(t10.cells));
  });

  /* ---- T11: the recap carries NO chart, but the coach still gets the data
       (Owner, 2026-08-03: "Coach can have the data and comment, but no need
       to display it") ---------------------------------------------------- */
  const t11=await ev(()=>{
    const d=parseISO(todayISO());state.ratings={};
    for(let i=13;i>=0;i--){const x=new Date(d);x.setDate(x.getDate()-i);
      state.ratings[toISO(x)]={recovery:i>6?'good':'poor',energy:'okay',hunger:'just_right',
        sleepQuality:'okay',stress:'some',digestion:'good'};}
    state.nightlyLog={};state.nightlyLog[todayISO()]={text:'Solid week.',generated:1,mood:null};
    state.nightOpen=true;save();state.view='overview';render();
    const body=document.querySelector('.wl-ai-summary');
    const p=payload();
    return {has:!!body,
      rows:body?body.querySelectorAll('.wl-frow').length:0,
      bars:body?body.querySelectorAll('.wl-fbars i').length:0,
      watch:body?body.querySelectorAll('.wl-fwatch').length:0,
      text:body?body.textContent:'',
      inPayload:!!(p.ratings&&Object.keys(p.ratings).length===14),
      sample:p.ratings?p.ratings[toISO(d)]:null};
  });
  test('T11 the daily recap shows no rating chart, while the coach still receives the data',()=>{
    ok(t11.has,'no recap body rendered');
    eq(t11.rows,0,'no trend rows may appear in the recap');
    eq(t11.bars,0,'no colour bars may appear in the recap');
    eq(t11.watch,0,'no Watch block may appear in the recap');
    ok(/Solid week\./.test(t11.text),'the coach’s own text must still render');
    ok(t11.inPayload,'the ratings must still reach the coach in the synced record');
    eq(t11.sample.recovery,'poor');
  });

  /* ---- T12: unanswered days are grey, never scored as bad --------------- */
  const t12=await ev(()=>{
    state.ratings={};const d=parseISO(todayISO());
    state.ratings[todayISO()]={energy:'excellent'};
    save();render();
    const html=feelBarsHTML(todayISO(),14);
    const holder=document.createElement('div');holder.innerHTML='<div>'+html+'</div>';
    const row=[].slice.call(holder.querySelectorAll('.wl-frow'))
      .filter(r=>r.querySelector('.k').textContent==='Energy')[0];
    const bars=[].slice.call(row.querySelectorAll('.wl-fbars i'));
    return {n:bars.length,last:bars[bars.length-1].getAttribute('style'),
      firstStyle:bars[0].getAttribute('style'),
      firstTitle:bars[0].getAttribute('title')};
  });
  test('T12 an unanswered day renders as a flat uncoloured bar, not a low score',()=>{
    eq(t12.n,14);
    ok(/height:100%/.test(t12.last),'today was Excellent; got '+t12.last);
    eq(t12.firstStyle,'height:3px');
    ok(/not answered/.test(t12.firstTitle),'title was '+t12.firstTitle);
  });

  /* ---- T13: the check-in card replaces the progress-photo prompt -------- */
  const t13=await ev(()=>{
    state.checkins={};state.settings.ciSince=toISO(weekStartFor(0));save();state.view='overview';render();
    const cards=[].slice.call(document.querySelectorAll('.wl-card'));
    const ci=document.querySelector('.wl-ci');
    const photoPrompt=cards.filter(c=>/This Week’s Progress Photos/.test(c.textContent))[0];
    const stack=document.querySelector('.wl-stack');
    const check=document.querySelector('.wl-check');
    return {hasCi:!!ci,hasOldPrompt:!!photoPrompt,
      status:(ci.querySelector('.wl-ci-st')||{}).textContent,
      btn:(ci.querySelector('[data-act="ci:open"]')||{}).getAttribute?ci.querySelector('[data-act="ci:open"]').getAttribute('data-week'):null,
      beforeCheckin:!!(check&&(ci.compareDocumentPosition(check)&Node.DOCUMENT_POSITION_FOLLOWING))};
  });
  test('T13 the weekly check-in card takes the photo prompt’s slot above the daily check-in',()=>{
    ok(t13.hasCi,'no weekly check-in card');
    notOk(t13.hasOldPrompt,'the old "This Week’s Progress Photos" card must be gone');
    ok(t13.beforeCheckin,'the check-in card must sit above the daily check-in card');
    ok(/^Due today · /.test(t13.status),'status was '+t13.status);
  });

  /* ---- T14: escalating lateness, and it never disappears ---------------- */
  const t14=await ev(()=>{
    const real=window.todayISO;const wk=toISO(weekStartFor(0));
    const shift=n=>{const d=parseISO(wk);d.setDate(d.getDate()+n);return toISO(d);};
    const out={};
    [0,1,4].forEach(n=>{window.todayISO=()=>shift(n);out['d'+n]=ciStatusLine([wk]);});
    window.todayISO=real;
    const older=toISO(new Date(parseISO(wk).getTime()-7*86400000));
    out.two=ciStatusLine([wk,older]);
    out.stillOpen=ciOpenWeeks().length>0;
    return out;});
  test('T14 lateness escalates in the Owner’s wording and the prompt persists',()=>{
    ok(/^Due today/.test(t14.d0),t14.d0);
    eq(t14.d1,'Due yesterday');
    ok(/^Due Monday · 4 days late$/.test(t14.d4),t14.d4);
    ok(/^2 weeks open · /.test(t14.two),t14.two);
    ok(t14.stillOpen,'an unresolved week must stay open');
  });

  /* ---- T15: a missed week is NOT a skip -------------------------------- */
  const t15=await ev(()=>{
    state.checkins={};save();
    const wk=toISO(weekStartFor(0));
    const older=toISO(new Date(parseISO(wk).getTime()-7*86400000));
    state.settings.ciSince=older;save();
    return {open:ciOpenWeeks(),resolvedOld:ciResolved(older)};});
  test('T15 a week that was never answered stays open rather than counting as skipped',()=>{
    eq(t15.open.length,2);
    notOk(t15.resolvedOld,'a missed week must not be treated as resolved');
  });

  /* ---- T16: the form — trends, four poses, five questions, auto-fill ---- */
  const t16=await ev(()=>{
    state.settings.ciSince=toISO(weekStartFor(0));state.checkins={};save();
    document.querySelector('[data-act="ci:open"]').click();
    const tiles=[].slice.call(document.querySelectorAll('#wl-ciphotos .wl-citile, .wl-citiles button'));
    return {view:state.view,
      poses:POSES.map(p=>p[1]),
      tileHost:!!document.getElementById('wl-ciphotos'),
      adherence:[].slice.call(document.querySelectorAll('[data-act="ci:adh"]')).length,
      texts:[].slice.call(document.querySelectorAll('.wl-ci-input')).map(t=>t.getAttribute('data-ci')),
      autofill:[].slice.call(document.querySelectorAll('.wl-cifill .k')).map(x=>x.textContent),
      hasTrend:!!document.querySelector('.wl-frow'),
      skip:!!document.querySelector('[data-act="ci:skipask"]'),
      send:!!document.querySelector('[data-act="ci:send"]')};});
  test('T16 the form carries the trend, four poses, five questions and the auto-filled facts',()=>{
    eq(t16.view,'checkin');
    eq(t16.poses,['Front','Left Side','Right Side','Back']);
    ok(t16.tileHost,'no photo tile host');
    eq(t16.adherence,5,'plan-adherence is a five-choice question');
    eq(t16.texts,['win','challenge','training','discomfort']);
    ok(t16.hasTrend,'the colour-bar trend must lead the form');
    ok(t16.autofill.indexOf('Weight')>=0&&t16.autofill.indexOf('Steps')>=0,'auto-fill rows were '+JSON.stringify(t16.autofill));
    ok(t16.skip&&t16.send,'both send and skip must be present');
  });

  /* ---- T16b: the auto-filled facts cover the week that just CLOSED ------
       Owner, 2026-08-03: "it would be from last week Monday through Sunday".
       The check-in is keyed by its own day, but every metric it reports comes
       from the previous check-in day through the day before this one. ------ */
  const t16b=await ev(()=>{
    const wk=toISO(weekStartFor(0));
    const covered=ciCoveredDays(wk);
    const dayBefore=toISO(new Date(parseISO(wk).getTime()-86400000));
    /* seed the CLOSED week with 7 known days, and today (the check-in day)
       with a value that must NOT be counted */
    state.steps={};state.food={};state.sleep={};state.weights=[];state.ratings={};
    covered.forEach(function(d,i){state.steps[d]=1000*(i+1);state.food[d]={calories:2000};});
    state.steps[wk]=999999;state.food[wk]={calories:999999};
    save();
    const f=ciFacts(wk);
    const row=k=>(f.rows.filter(r=>r[0]===k)[0]||[])[1];
    return {covered,dayBefore,
      first:covered[0],last:covered[6],
      len:covered.length,
      startsBeforeWk:covered[0]<wk,endsDayBefore:covered[6]===dayBefore,
      includesWk:covered.indexOf(wk)>=0,
      days:f.days,tracked:f.tracked,
      steps:row('Steps'),cal:row('Calories'),tracked7:row('Days tracked'),
      label:ciCoveredLabel(wk),
      startDow:parseISO(covered[0]).getDay(),endDow:parseISO(covered[6]).getDay(),
      wkDow:parseISO(wk).getDay()};
  });
  test('T16b the auto-fill window is the closed week — previous check-in day to the day before',()=>{
    eq(t16b.len,7,'a check-in covers exactly seven days');
    ok(t16b.startsBeforeWk,'the window must start BEFORE the check-in day');
    ok(t16b.endsDayBefore,'the window must end the day before the check-in day');
    notOk(t16b.includesWk,'the check-in day itself must not be counted');
    eq(t16b.startDow,t16b.wkDow,'the window starts on the previous check-in day (same weekday)');
    eq(t16b.endDow,(t16b.wkDow+6)%7,'and ends the day before this one');
    eq(t16b.days,7,'all seven closed days are reportable');
    eq(t16b.tracked,7);
    eq(t16b.tracked7,'7 of 7');
    /* 1000..7000 averages 4000 — 999999 on the check-in day would blow this up */
    eq(t16b.steps,'4,000 avg','the check-in day’s value leaked into the average');
    ok(/^2,000 avg/.test(t16b.cal),'calories were '+t16b.cal);
  });

  /* ---- T17: the four poses actually render as tiles --------------------- */
  await page.waitForFunction(()=>{const h=document.getElementById('wl-ciphotos');return h&&h.children.length===4;},null,{timeout:5000}).catch(()=>{});
  const t17=await ev(()=>{
    const host=document.getElementById('wl-ciphotos');
    return {n:host?host.children.length:0,
      labels:host?[].slice.call(host.querySelectorAll('.wl-citlbl')).map(x=>x.textContent):[],
      weeks:host?[].slice.call(host.querySelectorAll('.wl-citile')).map(b=>b.getAttribute('data-week')):[],
      counter:(document.getElementById('wl-ciphoto-n')||{}).textContent};});
  test('T17 four capture tiles — Front, Left, Right, Back — bound to the form’s week',()=>{
    eq(t17.n,4);
    eq(t17.labels,['Front','Left Side','Right Side','Back']);
    ok(t17.weeks.every(w=>w===t17.weeks[0]&&/^\d{4}-\d{2}-\d{2}$/.test(w)),'weeks were '+JSON.stringify(t17.weeks));
    eq(t17.counter,'0 of 4');
  });

  /* ---- T18: typing is kept as a draft, and a draft stays open ----------- */
  const t18=await ev(()=>{
    const wk=state.ciWeek;
    const ta=document.querySelector('.wl-ci-input[data-ci="win"]');
    ta.value='Hit 3 plates.';ta.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('[data-act="ci:adh"][data-v="mostly_on"]').click();
    const stored=JSON.parse(localStorage.getItem('wl_v1')).checkins[wk];
    return {stored,open:ciOpenWeeks().indexOf(wk)>=0};});
  test('T18 a part-filled form persists as a draft and the week stays open',()=>{
    eq(t18.stored.status,'draft');
    eq(t18.stored.answers.win,'Hit 3 plates.');
    eq(t18.stored.answers.adherence,'mostly_on');
    ok(t18.open,'a draft must not resolve the week');
  });

  /* ---- T19: skip is explicit and confirmed ----------------------------- */
  const t19=await ev(()=>{
    const wk=state.ciWeek;
    document.querySelector('[data-act="ci:skipask"]').click();
    const askVisible=!!document.querySelector('[data-act="ci:skipyes"]');
    const askText=(document.querySelector('.wl-ciskip .wl-hint')||{}).textContent||'';
    const notYet=ciRec(wk).status;
    document.querySelector('[data-act="ci:skipcancel"]').click();
    const afterCancel=ciRec(wk).status;
    document.querySelector('[data-act="ci:skipask"]').click();
    document.querySelector('[data-act="ci:skipyes"]').click();
    return {askVisible,askText,notYet,afterCancel,after:ciRec(wk).status,open:ciOpenWeeks().indexOf(wk)>=0,view:state.view};});
  test('T19 skipping asks first, cancels cleanly, and only then marks the week skipped',()=>{
    ok(t19.askVisible,'no confirmation was raised');
    ok(/nothing is sent/i.test(t19.askText),'the confirm must say what skipping means; got: '+t19.askText);
    ok(/undo/i.test(t19.askText),'the confirm must say it can be undone');
    eq(t19.notYet,'draft','asking must not itself skip');
    eq(t19.afterCancel,'draft','cancel must leave it unresolved');
    eq(t19.after,'skipped');
    notOk(t19.open,'a skipped week resolves the prompt');
  });

  /* ---- T20: a skip can be undone until the next check-in day ----------- */
  const t20=await ev(()=>{
    render();
    const btn=document.querySelector('[data-act="ci:unskip"]');
    const had=!!btn;if(btn)btn.click();
    return {had,status:(ciRec(toISO(weekStartFor(0)))||{}).status,open:ciOpenWeeks().length};});
  test('T20 a skipped week offers an undo that reopens it',()=>{
    ok(t20.had,'no undo control on the skipped card');
    eq(t20.status,'draft');
    ok(t20.open>0);
  });

  /* ---- T21: sending resolves the week and records what was sent -------- */
  const t21=await ev(()=>{
    const wk=toISO(weekStartFor(0));
    /* seed its own ratings — never inherit them from an earlier case */
    state.ratings={};
    const d=parseISO(todayISO());
    for(let i=0;i<3;i++){const x=new Date(d);x.setDate(x.getDate()-i);
      state.ratings[toISO(x)]={recovery:'good',energy:'okay'};}
    save();
    state.ciWeek=wk;state.view='checkin';render();
    document.querySelector('[data-act="ci:send"]').click();
    const r=ciRec(wk);
    return {status:r.status,ts:!!r.ts,updated:!!r.updated,snap:Array.isArray(r.ratings14),
      snapN:(r.ratings14||[]).length,open:ciOpenWeeks().indexOf(wk)>=0,view:state.view,
      persisted:JSON.parse(localStorage.getItem('wl_v1')).checkins[wk].status};});
  test('T21 sending marks the week sent, snapshots the ratings, and clears the prompt',()=>{
    eq(t21.status,'sent');ok(t21.ts);ok(t21.updated);
    ok(t21.snap,'the sent record should carry the 14-day rating snapshot');
    ok(t21.snapN>0,'snapshot was empty');
    notOk(t21.open,'a sent week resolves the prompt');
    eq(t21.persisted,'sent','it must be durable');
  });

  /* ---- T22: a sent check-in is editable and re-sendable ---------------- */
  const t22=await ev(()=>{
    const wk=toISO(weekStartFor(0));
    render();
    const editBtn=document.querySelector('.wl-ci [data-act="ci:open"]');
    const cardText=(document.querySelector('.wl-ci')||{}).textContent||'';
    editBtn.click();
    const sendLabel=(document.querySelector('[data-act="ci:send"]')||{}).textContent;
    const skipGone=!document.querySelector('[data-act="ci:skipask"]');
    const ta=document.querySelector('.wl-ci-input[data-ci="win"]');
    ta.value='Corrected.';ta.dispatchEvent(new Event('input',{bubbles:true}));
    const was=ciRec(wk).updated;
    document.querySelector('[data-act="ci:send"]').click();
    const r=ciRec(wk);
    return {cardText,sendLabel,skipGone,win:r.answers.win,status:r.status,bumped:r.updated>=was};});
  test('T22 a sent check-in can be reopened, corrected and re-sent',()=>{
    ok(/Sent/.test(t22.cardText),'the card should confirm it was sent; got: '+t22.cardText);
    ok(/Edit this week/.test(t22.cardText),'the card must offer an edit');
    ok(/Re-send/.test(t22.sendLabel),'send label was '+t22.sendLabel);
    ok(t22.skipGone,'a sent check-in should not offer "skip"');
    eq(t22.win,'Corrected.');
    eq(t22.status,'sent');
    ok(t22.bumped,'re-sending should bump the updated stamp');
  });

  /* ---- T23: history on the Progress tab -------------------------------- */
  const t23=await ev(()=>{
    state.view='weight';render();
    const card=[].slice.call(document.querySelectorAll('.wl-card'))
      .filter(c=>/Weekly check-ins/.test((c.querySelector('.wl-card-head')||{}).textContent||''))[0];
    return {found:!!card,
      rows:card?card.querySelectorAll('.wl-cihist').length:0,
      text:card?card.querySelector('.wl-cihist').textContent:'',
      action:card?card.querySelector('.wl-cihist [data-act="ci:open"]').textContent:''};});
  test('T23 the Progress tab lists past check-ins with their state and an edit action',()=>{
    ok(t23.found,'no Weekly check-ins card on the Progress tab');
    ok(t23.rows>=1);
    ok(/Sent/.test(t23.text),'row text was '+t23.text);
    ok(/Edit/.test(t23.action),'action was '+t23.action);
  });

  /* ---- T24: the check-in day follows the profile preference ------------ */
  const t24=await ev(()=>{
    const before=state.settings.weekStart;
    const monday=toISO(weekStartFor(0));
    state.settings.weekStart='4';
    const thursday=toISO(weekStartFor(0));
    const name=ciDayName(thursday);
    state.settings.weekStart=before;
    return {monday,thursday,name,mondayName:ciDayName(monday),moved:monday!==thursday};});
  test('T24 changing the profile’s check-in day moves the check-in week',()=>{
    eq(t24.mondayName,'Monday');
    eq(t24.name,'Thursday');
    ok(t24.moved,'the week must re-date when the preference changes');
  });

  /* ---- T25: a fresh account is not retroactively late ------------------ */
  const t25=await ev(()=>{
    delete state.settings.ciSince;state.checkins={};
    const since=ciSince();
    const open=ciOpenWeeks();
    return {since,cur:toISO(weekStartFor(0)),n:open.length};});
  test('T25 an account with no check-in history opens exactly one week, not months',()=>{
    eq(t25.since,t25.cur);
    eq(t25.n,1);
  });

  /* ---- T26: backward compatibility ------------------------------------ */
  const t26=await ev(()=>{
    const raw=JSON.parse(localStorage.getItem('wl_v1'));
    delete raw.ratings;delete raw.checkins;
    localStorage.setItem('wl_v1',JSON.stringify(raw));
    load();
    const okShape=(typeof state.ratings==='object'&&typeof state.checkins==='object');
    const counts=ratCount(todayISO());
    state.view='overview';render();
    const rendered=!!document.querySelector('.wl-check');
    const inPayload=('ratings' in payload())&&('checkins' in payload());
    return {okShape,counts,rendered,inPayload,
      badTypes:(function(){state.ratings=null;state.checkins=null;return {c:ratCount(todayISO()),o:ciOpenWeeks().length};})()};});
  test('T26 records saved before this feature still load, render and round-trip',()=>{
    ok(t26.okShape,'missing fields must rehydrate as objects');
    eq(t26.counts,0);
    ok(t26.rendered,'the day card must still render');
    ok(t26.inPayload,'both fields must be in the sync payload');
    eq(t26.badTypes.c,0,'a corrupt ratings field must not throw');
  });

  /* ---- T27: narrow screens get the short chip labels ------------------- */
  await ev(()=>{load();state.view='overview';state.selDate=todayISO();state.quickEntry=null;render();
    [].slice.call(document.querySelectorAll('.wl-check .wl-ck-row'))
      .filter(r=>(r.querySelector('.wl-ck-lab')||{}).textContent==='How you felt')[0].click();});
  await page.setViewportSize({width:320,height:800});
  const t27=await ev(()=>{
    const chip=document.querySelector('.wl-feelchip');
    const lg=chip.querySelector('.lg'),sm=chip.querySelector('.sm');
    const row=document.querySelector('.wl-feelchips');
    return {lgShown:getComputedStyle(lg).display!=='none',smShown:getComputedStyle(sm).display!=='none',
      hdr:document.querySelector('#feelq-hunger').textContent,
      overflow:row.scrollWidth<=row.clientWidth+1,
      bodyFits:document.body.scrollWidth<=320};});
  test('T27 at 320px the chips switch to short labels, the header keeps the full wording, nothing overflows',()=>{
    notOk(t27.lgShown,'the long label should be hidden at 320px');
    ok(t27.smShown,'the short label should show at 320px');
    eq(t27.hdr,'Hunger');
    ok(t27.overflow,'chip row overflows its container at 320px');
    ok(t27.bodyFits,'the page scrolls horizontally at 320px');
  });
  await page.setViewportSize({width:390,height:844});

  /* ---- T28: no page errors -------------------------------------------- */
  test('T28 no uncaught page errors across the whole run',()=>{
    eq(errs,[],'page errors');
  });

  console.log('\nC20 — how you felt + weekly check-in: '+passed+' passed, '+failures.length+' failed');
  if(failures.length)console.log('  failed: '+failures.join(', '));
  await browser.close();server.close();
  process.exit(failures.length?1:0);
})();
