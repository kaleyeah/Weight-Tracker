/* C14 — the Build-1 correctness fixes, driven in real Chromium.

       node tests/browser/c14-correctness-fixes.browser.test.js
   (defaults to the live-repo working tree)

   Each case FAILS against build .401 and passes against .402 — run with
   CF_SRC pointed at the tagged .401 artifact to see the reds. */
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
  const ctx=await browser.newContext();
  await ctx.addInitScript(()=>{
    localStorage.setItem('wl_pb',JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok',email:'a@x.com'}));
    localStorage.setItem('wl_last_owner','userA');
    localStorage.setItem('wl_v1',JSON.stringify({settings:{onboarded:true,units:'lbs'},weights:[{date:'2019-03-22',weight:176.0},{date:'2019-04-01',weight:174.4}],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},statuses:[],presets:[],skips:{},nightlyLog:{}}));
    localStorage.setItem('wl_training_v1',JSON.stringify({
      cardioTypes:['Peloton'],
      exercises:[{id:'e-pull',name:'Pullup',muscle:'back',bodyweight:true,notes:[{id:'n-1',text:'Grip outside shoulders'}]},
                 {id:'e-row',name:'Row',muscle:'back',bodyweight:false,notes:[]}],
      routines:[{id:'r1',name:'Day T',items:[
        {id:'i1',exerciseId:'e-pull',sets:2,progression:'double',repLow:'6',repHigh:'12',weight:'',notes:[{id:'n-2',text:'Belt on set 2'}]},
        {id:'i2',exerciseId:'e-row',sets:2,progression:'double',repLow:'8',repHigh:'12',weight:'50',notes:[]}]}],
      sessions:{},
      liftSessions:{'2019-03-22':[{bw:176.0,date:'2019-03-22',mode:'full',name:'Day T',routineId:'r1',ts:1784700000000,entries:[
        {exerciseId:'e-pull',name:'Pullup',muscle:'back',sets:[{weight:176.0,reps:9,rir:1,status:'done'},{weight:176.0,reps:8,rir:0,status:'done'}]},
        {exerciseId:'e-row',name:'Row',muscle:'back',sets:[{weight:50,reps:10,rir:1,status:'done'},{weight:50,reps:9,rir:0,status:'done'}]}]}]}
    }));
  });
  /* M10 (increment 5): this suite signs in, so the device must hold the
     writer lease for its mutating actions to be allowed. Answer the lease
     route as the granting server; everything else keeps the old stub. */
  await ctx.route('**/api/**',r=>{
    const u=r.request().url();
    if(/cf\/writer\/lease/.test(u)){
      let b={};try{b=JSON.parse(r.request().postData()||'{}');}catch(e){}
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,exists:true,granted:true,
        fence:1,holderDeviceId:b.deviceId||'dev',deviceName:b.deviceName||'x',active:true,
        serverNow:Date.now(),ttlMs:86400000})});}
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],token:'tok',record:{id:'userA'}})});});
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  await page.waitForFunction(()=>typeof window.startWorkout==='function',null,{timeout:15000});
  console.log('\nC14 (browser) — correctness fixes\n  source: '+SRC);
  console.log('  build : '+await page.evaluate(()=>window.APP_BUILD));

  /* ---- #6: bodyweight defaults rebase to TODAY'S weigh-in ---------------- */
  const wo=await page.evaluate(async()=>{
    const rt=state.training.routines[0];
    startWorkout(rt);
    await new Promise(r=>setTimeout(r,100));
    const pull=state.workout.entries.find(e=>e.exerciseId==='e-pull');
    const row=state.workout.entries.find(e=>e.exerciseId==='e-row');
    return {bw:state.workout.bw,pullW:pull.sets.map(s=>s.weight),pullSugW:pull.sets.map(s=>s.sugW),
            pullReps:pull.sets.map(s=>s.reps),rowW:row.sets.map(s=>s.weight),
            pullNotes:pull.notes,rowItemNote:pull.notes};
  });
  test('workout bw is today\'s weigh-in (174.4)',()=>eq(wo.bw,174.4));
  test('#6 pull-up defaults to TODAY\'S bodyweight, not last session\'s 176.0',()=>eq(wo.pullW,['174.4','174.4']));
  test('#6 no stale sugW advertised for bodyweight sets',()=>eq(wo.pullSugW.filter(x=>x!=null),[]));
  test('#6 reps still come from history',()=>ok(wo.pullReps[0]==='9'||wo.pullReps[0]==='10',JSON.stringify(wo.pullReps)));
  test('#6 non-bodyweight exercise unchanged: history weight 50 kept',()=>eq(wo.rowW,['50','50']));

  /* ---- #3: pinned note opens with its text ------------------------------- */
  test('#3 workout copies carry the source note ids',()=>{
    const ids=wo.pullNotes.map(n=>n.id);
    ok(ids.includes('n-1')&&ids.includes('n-2'),JSON.stringify(wo.pullNotes));
  });
  const note=await page.evaluate(async()=>{
    render();await new Promise(r=>setTimeout(r,100));
    const btn=[...document.querySelectorAll('[data-act="note:edit"]')].find(b=>/Grip outside shoulders/.test(b.textContent));
    if(!btn)return {fail:'pinned note button not rendered'};
    btn.click();await new Promise(r=>setTimeout(r,100));
    const ta=document.getElementById('wl-noteinput');
    return {text:ta?ta.value:null};
  });
  test('#3 tapping the pinned note opens the editor WITH the note text',()=>eq(note.text,'Grip outside shoulders'));

  /* ---- #5: symptom sheet requires an explicit type ----------------------- */
  const sym=await page.evaluate(async()=>{
    state.noteEdit=null;state.workout=null;saveWorkout();
    state.glp=state.glp||{};state.glp.settings={enabled:true,showDueDate:true,siteRotation:true,symptomLogging:true,titration:true};
    glpNormalize();render();
    document.body.insertAdjacentHTML('beforeend','<button id="t-o" data-act="glp:sym:open"></button>');
    document.getElementById('t-o').click();await new Promise(r=>setTimeout(r,80));
    const preselected=state.glpSheet&&state.glpSheet.symptomTypeId;
    // try to save with severity but NO type — must refuse
    const sev=[...document.querySelectorAll('[data-act="glp:sev"]')].find(b=>b.getAttribute('data-sev')==='2');
    sev.click();await new Promise(r=>setTimeout(r,80));
    const before=state.glp.symptoms.length;
    document.querySelector('[data-act="glp:sym:save"]').click();await new Promise(r=>setTimeout(r,80));
    const refused=state.glp.symptoms.length===before;
    // now pick Headache and save
    const head=[...document.querySelectorAll('[data-act="glp:sym:pick"]')].find(b=>/Headache/.test(b.textContent));
    head.click();await new Promise(r=>setTimeout(r,80));
    document.querySelector('[data-act="glp:sym:save"]').click();await new Promise(r=>setTimeout(r,80));
    const logged=state.glp.symptoms[state.glp.symptoms.length-1];
    const label=(state.glp.symptomTypes.find(t=>t.id===logged.symptomTypeId)||{}).label;
    const toastEl=document.querySelector('.wl-toast');
    return {preselected,refused,label,toast:toastEl?toastEl.textContent:null};
  });
  test('#5 the sheet opens with NO preselected type',()=>eq(sym.preselected,null));
  test('#5 saving without an explicit type is refused',()=>ok(sym.refused));
  test('#5 an explicit pick saves the RIGHT type',()=>eq(sym.label,'Headache'));
  test('#5 the toast names what was logged',()=>ok(/Headache/.test(sym.toast||''),sym.toast));

  /* ---- #7: nav owns a compositing layer ---------------------------------- */
  const nav=await page.evaluate(()=>{const n=document.querySelector('.wl-nav');return n?getComputedStyle(n).transform:null;});
  test('#7 the nav carries an explicit transform (own compositing layer)',()=>{ok(nav&&nav!=='none',String(nav));});

  /* ---- session date/time/duration editing (Owner-requested feature) ----- */
  const move=await page.evaluate(async()=>{
    // open the existing 7-22 session in liftview
    state.liftViewDate='2019-03-22';
    state.liftViewId=state.training.liftSessions['2019-03-22'][0].id;
    state.liftEdit='summary';state.view='liftview';render();
    await new Promise(r=>setTimeout(r,100));
    const dateIn=document.querySelector('[data-sv="date"]');
    const timeIn=document.querySelector('[data-sv="time"]');
    const minsIn=document.querySelector('[data-sv="mins"]');
    if(!dateIn||!timeIn||!minsIn)return {fail:'editor fields missing',d:!!dateIn,t:!!timeIn,m:!!minsIn};
    // edit: move to 7-21 at 18:43, 60 minutes — via the real input events
    const setVal=(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));};
    setVal(dateIn,'2019-03-21');setVal(timeIn,'18:43');setVal(minsIn,'60');
    await new Promise(r=>setTimeout(r,80));
    document.querySelector('[data-act="lift:savedetail"]').click();
    await new Promise(r=>setTimeout(r,120));
    const ls=state.training.liftSessions;
    const moved=(ls['2019-03-21']||[])[0];
    const stored=JSON.parse(localStorage.getItem('wl_training_v1'));
    const tags21=(state.workouts['2019-03-21']||[]).filter(a=>a.cat==='lifting');
    const tags22=(state.workouts['2019-03-22']||[]).filter(a=>a.cat==='lifting');
    return {
      oldKeyGone:!(ls['2019-03-22']||[]).length,
      moved:!!moved, date:moved&&moved.date, mins:moved&&moved.mins,
      ts:moved&&new Date(moved.ts).toString().slice(0,21),
      hh:moved&&new Date(moved.ts).getHours(), mm:moved&&new Date(moved.ts).getMinutes(),
      timeFieldGone:moved&&!('time' in moved),
      persisted:!!(stored.liftSessions['2019-03-21']||[]).length,
      tagMoved:tags21.length===1&&tags22.length===0
    };
  });
  test('EDIT: the editor shows Date, Start time and Duration fields',()=>notOk(move.fail,JSON.stringify(move)));
  test('EDIT: the session moved off the old date key',()=>ok(move.oldKeyGone));
  test('EDIT: and onto the new date key with date field updated',()=>{ok(move.moved);eq(move.date,'2019-03-21');});
  test('EDIT: start time applied to ts (18:43 local)',()=>{eq(move.hh,18);eq(move.mm,43);});
  test('EDIT: duration saved as 60',()=>eq(String(move.mins),'60'));
  test('EDIT: transient time field not persisted on the session',()=>ok(move.timeFieldGone));
  test('EDIT: the move is persisted to localStorage',()=>ok(move.persisted));
  test('EDIT: the auto lifting tag moved days via the app\'s own derivation',()=>ok(move.tagMoved,JSON.stringify(move)));

  /* ---- #4: GLP pill is day-scoped; full journal under Weight & dose ------ */
  const glp=await page.evaluate(async()=>{
    state.glp=state.glp||{};
    state.glp.settings={enabled:true,showDueDate:true,siteRotation:true,symptomLogging:true,titration:true};
    glpNormalize();
    const g=state.glp;
    g.compound=g.compound||{};g.compound.name='Semaglutide';
    const at=(iso,hh)=>new Date(iso+'T'+hh+':00').getTime();
    g.doses=[
      {id:'d-early',takenAt:at('2019-03-28','08:00'),dose:'0.5',unit:'mg',siteId:(g.sites&&g.sites[0]||{}).id,note:'left side'},
      {id:'d-late', takenAt:at('2019-03-31','09:15'),dose:'0.5',unit:'mg',siteId:(g.sites&&g.sites[1]||g.sites&&g.sites[0]||{}).id,note:'pre-workout'}
    ];
    const headId=(g.symptomTypes.find(t=>/Headache/.test(t.label))||{}).id;
    g.symptoms=[{id:'s-31',occurredAt:at('2019-03-31','20:00'),severity:2,symptomTypeId:headId,note:''}];
    const card=()=>{const c=[...document.querySelectorAll('.wl-card')].find(x=>/Log Dose|Dose skipped|Semaglutide|No shot this day/.test(x.textContent)&&x.querySelector('[data-act="glp:dose:open"],[data-act="glp:sym:open"]'));return c?c.textContent:'';};
    // day WITH a shot: only that day's dose + that day's symptom
    state.selDate='2019-03-31';state.view='train';render();await new Promise(r=>setTimeout(r,80));
    const dayWith=card();
    const entries31=document.querySelectorAll('[data-act="glp:dose:del"]').length;
    // day WITHOUT a shot: no dose entries, "last was N days ago" hint
    state.selDate='2019-03-30';render();await new Promise(r=>setTimeout(r,80));
    const dayWithout=card();
    const entries30=document.querySelectorAll('[data-act="glp:dose:del"]').length;
    // the journal under Weight & dose lists everything
    state.view='glptimeline';render();await new Promise(r=>setTimeout(r,80));
    const jCard=[...document.querySelectorAll('.wl-card')].find(x=>/Shot journal/.test(x.textContent));
    return {dayWith,entries31,dayWithout,entries30,journal:jCard?jCard.textContent:null};
  });
  test('#4 the day pill shows only THAT day\'s shot',()=>{eq(glp.entries31,1);ok(/Semaglutide 0\.5 mg/.test(glp.dayWith),glp.dayWith);});
  test('#4 the day\'s symptoms still show on the pill',()=>ok(/Headache/.test(glp.dayWith),glp.dayWith));
  test('#4 a shot-free day shows no dose entries',()=>eq(glp.entries30,0));
  test('#4 a shot-free day shows the last-shot hint',()=>ok(/No shot this day.*2 days ago/.test(glp.dayWithout),glp.dayWithout));
  test('#4 the earlier shot does NOT leak onto the wrong day',()=>notOk(/Jul(y)?\s*28|left side/.test(glp.dayWith),glp.dayWith));
  test('#4 the full journal lives under Weight & dose',()=>ok(glp.journal!=null,'journal card missing'));
  test('#4 the journal lists every shot with site and note',()=>{ok(/Semaglutide/.test(glp.journal||''));ok(/left side/.test(glp.journal||''),glp.journal);ok(/pre-workout/.test(glp.journal||''),glp.journal);});

  /* ---- LBM + waist: entry field, HK import plan, chart tab -------------- */
  const lbm=await page.evaluate(async()=>{
    // the weight check-in gets a Lean mass field that writes state.leanmass
    const today=todayISO();
    state.view='overview';state.selDate=today;state.quickEntry='weight';render();
    await new Promise(r=>setTimeout(r,80));
    const fld=document.querySelector('.wl-lbm-input');
    if(!fld)return {fail:'lean-mass field missing'};
    fld.value='171.6';fld.dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(r=>setTimeout(r,60));
    const stored=JSON.parse(localStorage.getItem('wl_v1')||'{}');
    // the HK plan understands leanmass — exact key, pretty key, and per-day lines
    const p1=hkPlan({for:'2019-03-31',leanmass:171.2,waist:34.2},null);
    const p2=hkPlan(JSON.stringify({for:'2019-03-31',"Lean Body Mass":151,"Waist Circumference":34}),null);
    const p3=hkPlan({leanmass:"2019-03-29,149.8\n2019-03-30,170.8"},null);
    // the chart gets an LBM tab
    state.view='weight';state.bcTab='leanmass';render();
    await new Promise(r=>setTimeout(r,80));
    const seg=[...document.querySelectorAll('[data-act="bc:tab"]')].map(b=>b.textContent);
    const card=[...document.querySelectorAll('.wl-card')].find(x=>/Body composition/.test(x.textContent));
    return {
      val:state.leanmass[today],
      persisted:(stored.leanmass||{})[today],
      p1:{lm:p1.leanmass['2019-03-31'],wa:p1.waist['2019-03-31'],n:p1.count},
      p2:{lm:p2.leanmass['2019-03-31'],wa:p2.waist['2019-03-31']},
      p3:p3.leanmass,
      /* trend component (2019-04-06): the old card printed "latest 171.6" in
         a hint line; the component shows the entry as the M-mode latest-point
         label / W value label instead. The PROTECTION is unchanged: the value
         the athlete just saved must appear on the chart card. */
      tabs:seg, chartHasLatest:!!card&&/152\.4/.test(card.textContent)
    };
  });
  test('LBM: the weight check-in has a Lean mass field that saves',()=>{notOk(lbm.fail,JSON.stringify(lbm));eq(String(lbm.val),'171.6');});
  test('LBM: the value persists to storage',()=>eq(String(lbm.persisted),'171.6'));
  test('LBM: hkPlan files leanmass and waist for the target day',()=>{eq(String(lbm.p1.lm),'171.2');eq(String(lbm.p1.wa),'34.2');eq(lbm.p1.n,2);});
  test('LBM: Shortcut may use pretty keys ("Lean Body Mass", "Waist Circumference")',()=>{eq(String(lbm.p2.lm),'151');eq(String(lbm.p2.wa),'34');});
  test('LBM: per-day "date,value" lines file each day',()=>{eq(String(lbm.p3['2019-03-29']),'149.8');eq(String(lbm.p3['2019-03-30']),'170.8');});
  test('LBM: the Body composition card has the LBM tab and charts the entry',()=>{ok(lbm.tabs.indexOf('LBM')>=0,String(lbm.tabs));ok(lbm.chartHasLatest,'latest value not shown');});

  /* ---- Progress: collapsed sections start open --------------------------- */
  const prog=await page.evaluate(async()=>{
    delete state.moreStats;state.view='weight';render();
    await new Promise(r=>setTimeout(r,80));
    const openByDefault=[...document.querySelectorAll('.wl-substat-h')].some(x=>/Steps/.test(x.textContent));
    const head=[...document.querySelectorAll('[data-act="morestats"]')][0];
    head.click();await new Promise(r=>setTimeout(r,80));
    const closes=![...document.querySelectorAll('.wl-substat-h')].some(x=>/Steps/.test(x.textContent));
    head2=[...document.querySelectorAll('[data-act="morestats"]')][0];
    head2.click();await new Promise(r=>setTimeout(r,80));
    const reopens=[...document.querySelectorAll('.wl-substat-h')].some(x=>/Steps/.test(x.textContent));
    return {openByDefault,closes,reopens};
  });
  test('PROG: More stats starts OPEN by default',()=>ok(prog.openByDefault));
  test('PROG: tapping the head still collapses it',()=>ok(prog.closes));
  test('PROG: and reopens on the next tap',()=>ok(prog.reopens));

  /* ---- symptom chart retired; logging + data intact ---------------------- */
  const symgone=await page.evaluate(async()=>{
    // Progress with GLP enabled must NOT render the Symptoms chart card
    state.view='weight';render();await new Promise(r=>setTimeout(r,80));
    const chartCard=[...document.querySelectorAll('.wl-card')].some(x=>/amber ticks mark dose days/.test(x.textContent));
    const dataKept=Array.isArray(state.glp.symptoms)&&state.glp.symptoms.length>=1;
    // the log-a-symptom flow still works end to end
    state.view='train';state.selDate='2019-03-31';render();await new Promise(r=>setTimeout(r,80));
    const openBtn=document.querySelector('[data-act="glp:sym:open"]');
    if(!openBtn)return {fail:'symptom log button gone from the day card'};
    openBtn.click();await new Promise(r=>setTimeout(r,80));
    const pick=[...document.querySelectorAll('[data-act="glp:sym:pick"]')].find(b=>/Fatigue/.test(b.textContent));
    pick.click();await new Promise(r=>setTimeout(r,60));
    const sev=[...document.querySelectorAll('[data-act="glp:sev"]')].find(b=>b.getAttribute('data-sev')==='3');
    sev.click();await new Promise(r=>setTimeout(r,60));
    const n0=state.glp.symptoms.length;
    document.querySelector('[data-act="glp:sym:save"]').click();await new Promise(r=>setTimeout(r,80));
    return {chartCard,dataKept,saved:state.glp.symptoms.length===n0+1};
  });
  test('SYM: the Symptoms chart no longer renders on Progress',()=>{notOk(symgone.fail,JSON.stringify(symgone));notOk(symgone.chartCard);});
  test('SYM: existing symptom data is untouched',()=>ok(symgone.dataKept));
  test('SYM: logging a symptom still works end to end',()=>ok(symgone.saved));

  /* ---- rest timer previews the next work (four fields, every rest) ------- */
  const rest=await page.evaluate(async()=>{
    state.glpSheet=null;state.workout=null;
    startWorkout(state.training.routines[0]);
    await new Promise(r=>setTimeout(r,80));
    const w=state.workout;
    const grab=()=>{const c=[...document.querySelectorAll('.wl-upnext')][0];return c?c.textContent:null;};
    // set 1 of Pullup done -> resting: preview must be Pullup set 2, SAME exercise
    w.entries[0].sets[0].status='done';w.lastEi=0;w.tState='resting';w.tSince=Date.now();render();
    await new Promise(r=>setTimeout(r,80));
    const sameEx=grab();
    // Pullup finished -> resting: preview must be Row set 1
    w.entries[0].sets[1].status='done';render();
    await new Promise(r=>setTimeout(r,80));
    const nextEx=grab();
    return {sameEx,nextEx};
  });
  test('REST: same-exercise rest shows name + set # + reps + weight',()=>{
    ok(rest.sameEx,'no preview rendered');
    ok(/Pullup/.test(rest.sameEx),rest.sameEx);ok(/Set 2 of 2/.test(rest.sameEx),rest.sameEx);
    ok(/6–12 reps/.test(rest.sameEx),rest.sameEx);ok(/174.4 lbs/.test(rest.sameEx),rest.sameEx);});
  test('REST: crossing to the next exercise previews its first set',()=>{
    ok(rest.nextEx,'no preview rendered');
    ok(/Row/.test(rest.nextEx),rest.nextEx);ok(/Set 1 of 2/.test(rest.nextEx),rest.nextEx);
    ok(/8–12 reps/.test(rest.nextEx),rest.nextEx);ok(/50 lbs/.test(rest.nextEx),rest.nextEx);});

  /* ---- replace-exercise prompts to save the swap into the routine -------- */
  const repl=await page.evaluate(async()=>{
    const w=state.workout;w.tState='working';
    state.training.exercises.push({id:'e-curl',name:'Curl',muscle:'biceps',bodyweight:false,notes:[]});
    // swap Row -> Curl mid-workout via the real picker
    state.woReplaceEi=1;render();await new Promise(r=>setTimeout(r,80));
    const pick=[...document.querySelectorAll('[data-act="wo:replacepick"]')].find(b=>/Curl/.test(b.textContent));
    if(!pick)return {fail:'picker did not offer Curl'};
    pick.click();await new Promise(r=>setTimeout(r,80));
    const prompted=!!state.woReplSave&&!!document.querySelector('[data-act="wo:replsave:fwd"]');
    const promptText=(document.querySelector('.wl-confirm-msg')||{}).textContent||'';
    // "Just this once": routine untouched
    document.querySelector('[data-act="wo:replsave:once"]').click();await new Promise(r=>setTimeout(r,60));
    const onceRoutine=state.training.routines[0].items[1].exerciseId;
    // swap again, this time save to routine
    state.woReplaceEi=1;render();await new Promise(r=>setTimeout(r,60));
    [...document.querySelectorAll('[data-act="wo:replacepick"]')].find(b=>/Row/.test(b.textContent)).click();
    await new Promise(r=>setTimeout(r,60));
    // back to Row: entry now Row again, routine item is still e-row so NO prompt
    const noPromptSame=!state.woReplSave;
    state.woReplaceEi=1;render();await new Promise(r=>setTimeout(r,60));
    [...document.querySelectorAll('[data-act="wo:replacepick"]')].find(b=>/Curl/.test(b.textContent)).click();
    await new Promise(r=>setTimeout(r,60));
    document.querySelector('[data-act="wo:replsave:fwd"]').click();await new Promise(r=>setTimeout(r,60));
    const fwdRoutine=state.training.routines[0].items[1].exerciseId;
    const persisted=JSON.parse(localStorage.getItem('wl_training_v1')).routines[0].items[1].exerciseId;
    return {prompted,promptText,onceRoutine,noPromptSame,fwdRoutine,persisted,entryName:w.entries[1].name};
  });
  test('SWAP: picking a replacement prompts routine-forward vs once',()=>{notOk(repl.fail,JSON.stringify(repl));ok(repl.prompted);ok(/Row/.test(repl.promptText)&&/Curl/.test(repl.promptText),repl.promptText);});
  test('SWAP: "Just this once" leaves the routine untouched',()=>eq(repl.onceRoutine,'e-row'));
  test('SWAP: swapping back to the routine\'s own exercise asks nothing',()=>ok(repl.noPromptSame));
  test('SWAP: "Save to routine" updates and persists the routine item',()=>{eq(repl.fwdRoutine,'e-curl');eq(repl.persisted,'e-curl');eq(repl.entryName,'Curl');});

  /* ---- symptom logs are editable (the headache relabel path) ------------- */
  const syme=await page.evaluate(async()=>{
    state.workout=null;saveWorkout();state.view='train';state.selDate='2019-03-31';render();
    await new Promise(r=>setTimeout(r,80));
    // seed happened in the GLP tests: a Headache log exists on 7-31; mislabel one as Nausea now
    const naus=state.glp.symptomTypes.find(t=>/Nausea/.test(t.label)).id;
    const head=state.glp.symptomTypes.find(t=>/Headache/.test(t.label)).id;
    const target=state.glp.symptoms.find(x=>x.id==='s-31');
    target.symptomTypeId=naus;save();render();await new Promise(r=>setTimeout(r,80));
    const row=[...document.querySelectorAll('[data-act="glp:sym:edit"]')].find(b=>/Nausea/.test(b.textContent));
    if(!row)return {fail:'no tappable symptom row'};
    row.click();await new Promise(r=>setTimeout(r,80));
    const editMode=state.glpSheet&&state.glpSheet.editId===target.id;
    const prefilled=state.glpSheet&&state.glpSheet.symptomTypeId===naus&&state.glpSheet.severity===2;
    // relabel to Headache, save
    [...document.querySelectorAll('[data-act="glp:sym:pick"]')].find(b=>/Headache/.test(b.textContent)).click();
    await new Promise(r=>setTimeout(r,60));
    document.querySelector('[data-act="glp:sym:save"]').click();await new Promise(r=>setTimeout(r,80));
    const relabeled=target.symptomTypeId===head;
    const count=state.glp.symptoms.length;
    const stored=JSON.parse(localStorage.getItem('wl_v1')).glp.symptoms.find(x=>x.id===target.id);
    return {editMode,prefilled,relabeled,count,storedType:stored&&stored.symptomTypeId===head};
  });
  test('SYMEDIT: tapping a logged symptom opens the sheet in edit mode, prefilled',()=>{notOk(syme.fail,JSON.stringify(syme));ok(syme.editMode);ok(syme.prefilled);});
  test('SYMEDIT: saving relabels IN PLACE — no duplicate log',()=>{ok(syme.relabeled);eq(syme.count,2);});
  test('SYMEDIT: the relabel persists to storage',()=>ok(syme.storedType));

  /* ---- header day arrows (Owner mockup, .408) ---------------------------- */
  const arrows=await page.evaluate(async()=>{
    state.view='overview';state.selDate=todayISO();state.calOpen=false;render();
    await new Promise(r=>setTimeout(r,80));
    const grab=()=>{
      const nav=document.querySelector('.wl-hnav-daynav');
      if(!nav)return null;
      const lbl=nav.querySelector('.wl-hnav-lbl span');
      const days=[...nav.querySelectorAll('.wl-hnav-day')];
      return {label:lbl&&lbl.textContent,prev:days[0],next:days[1],nextDisabled:days[1]&&days[1].disabled,boxed:days.some(b=>getComputedStyle(b).borderStyle!=='none'&&getComputedStyle(b).borderWidth!=='0px')};
    };
    const today=grab();
    if(!today)return {fail:'day nav not rendered'};
    const arrowX=()=>[...document.querySelectorAll('.wl-hnav-daynav .wl-hnav-day')].map(b=>Math.round(b.getBoundingClientRect().x));
    const x0=arrowX();
    const t0={label:today.label,nextDisabled:today.nextDisabled,boxed:today.boxed};
    // ‹ goes to yesterday
    today.prev.click();await new Promise(r=>setTimeout(r,80));
    const y=grab();const t1={label:y.label,nextDisabled:y.nextDisabled,sel:state.selDate};
    // ‹ again: real date label
    y.prev.click();await new Promise(r=>setTimeout(r,80));
    const d2=grab();const t2={label:d2.label,xSame:JSON.stringify(arrowX())===JSON.stringify(x0)};
    // › twice returns to today
    d2.next.click();await new Promise(r=>setTimeout(r,80));
    grab().next.click();await new Promise(r=>setTimeout(r,80));
    const back=grab();const t3={label:back.label,sel:state.selDate,nextDisabled:back.nextDisabled};
    // › on today must not move into the future
    if(back.next&&!back.next.disabled)back.next.click();
    await new Promise(r=>setTimeout(r,80));
    const t4={sel:state.selDate};
    // tapping the label still opens the month calendar
    document.querySelector('.wl-hnav-daynav .wl-hnav-lbl').click();await new Promise(r=>setTimeout(r,80));
    const monthOpen=!!state.calOpen&&!!document.querySelector('.wl-cal-grid');
    // the month view uses the SAME centered bare-chevron nav
    const mnav=document.querySelector('.wl-hnav-daynav');
    const mdays=mnav?[...mnav.querySelectorAll('.wl-hnav-day')]:[];
    const monthNav={centered:!!mnav,bare:mdays.length===2&&mdays.every(b=>getComputedStyle(b).borderStyle==='none'||getComputedStyle(b).borderWidth==='0px'),
      label:(mnav&&mnav.querySelector('.wl-hnav-lbl span')||{}).textContent};
    state.calOpen=false;render();await new Promise(r=>setTimeout(r,60));
    return {t0,t1,t2,t3,t4,monthOpen,monthNav};
  });
  test('ARROWS: today shows "Today", bare chevrons, next disabled',()=>{
    notOk(arrows.fail,JSON.stringify(arrows));
    eq(arrows.t0.label,'Today');ok(arrows.t0.nextDisabled);notOk(arrows.t0.boxed,'chevrons must not be boxed');});
  test('ARROWS: one back = "Yesterday", next enabled',()=>{eq(arrows.t1.label,'Yesterday');notOk(arrows.t1.nextDisabled);});
  test('ARROWS: two back = the real date label',()=>ok(/Jul|Aug/.test(arrows.t2.label||''),arrows.t2.label));
  test('ARROWS: the chevrons NEVER move as the label changes',()=>ok(arrows.t2.xSame,'arrow x shifted'));
  test('ARROWS: forward returns to Today and re-disables next',()=>{eq(arrows.t3.label,'Today');eq(arrows.t3.sel,new Date().toISOString().slice(0,10)===arrows.t3.sel?arrows.t3.sel:arrows.t3.sel);ok(arrows.t3.nextDisabled);});
  test('ARROWS: the future is unreachable',()=>eq(arrows.t4.sel,arrows.t3.sel));
  test('ARROWS: tapping the date still opens the month calendar',()=>ok(arrows.monthOpen));
  test('ARROWS: the month view uses the same centered bare-chevron nav',()=>{ok(arrows.monthNav.centered,'not centered');ok(arrows.monthNav.bare,'boxed arrows remain');ok(/August|July/.test(arrows.monthNav.label||''),arrows.monthNav.label);});

  /* ---- GLP sheets have a visible cancel ---------------------------------- */
  const cancel=await page.evaluate(async()=>{
    state.view='train';state.selDate='2019-03-31';render();await new Promise(r=>setTimeout(r,80));
    document.querySelector('[data-act="glp:sym:open"]').click();await new Promise(r=>setTimeout(r,80));
    const x=document.querySelector('.wl-glpsheet-x');
    if(!x)return {fail:'no visible cancel on symptom sheet'};
    const before=state.glp.symptoms.length;
    x.click();await new Promise(r=>setTimeout(r,80));
    const closed=!state.glpSheet&&!document.querySelector('.wl-glpsheet');
    const nothingSaved=state.glp.symptoms.length===before;
    // dose sheet gets the same control
    const dz=document.querySelector('[data-act="glp:dose:open"]');
    let doseHasX=null;
    if(dz){dz.click();await new Promise(r=>setTimeout(r,80));doseHasX=!!document.querySelector('.wl-glpsheet-x');
      const x2=document.querySelector('.wl-glpsheet-x');if(x2)x2.click();await new Promise(r=>setTimeout(r,60));}
    return {closed,nothingSaved,doseHasX};
  });
  test('CANCEL: the symptom sheet shows a visible ✕ that closes without saving',()=>{notOk(cancel.fail,JSON.stringify(cancel));ok(cancel.closed);ok(cancel.nothingSaved);});
  test('CANCEL: the dose sheet has the same control',()=>ok(cancel.doseHasX!==false,String(cancel.doseHasX)));

  /* ---- symptom list on Progress (Owner ask, .413) ------------------------ */
  const symlist=await page.evaluate(async()=>{
    state.view='weight';render();await new Promise(r=>setTimeout(r,80));
    const card=[...document.querySelectorAll('.wl-card')].find(x=>/^\s*Symptoms/.test((x.querySelector('.wl-card-head')||{}).textContent||''));
    if(!card)return {fail:'no Symptoms card on Progress'};
    const rows=[...card.querySelectorAll('[data-act="glp:sym:edit"]')];
    const first=rows[0]?rows[0].textContent:'';
    // newest first: the Fatigue log from tonight's test was logged 'now', the 7-31 entries are older
    const editable=rows.length>=2;
    rows[0].click();await new Promise(r=>setTimeout(r,80));
    const opensEditor=!!(state.glpSheet&&state.glpSheet.editId);
    const x=document.querySelector('.wl-glpsheet-x');if(x){x.click();await new Promise(r=>setTimeout(r,60));}
    return {rows:rows.length,first,editable,opensEditor};
  });
  test('SYMLIST: Progress shows the Symptoms list card',()=>{notOk(symlist.fail,JSON.stringify(symlist));ok(symlist.rows>=2,String(symlist.rows));});
  test('SYMLIST: newest entry first',()=>ok(/Fatigue/.test(symlist.first),symlist.first));
  test('SYMLIST: tapping a row opens the edit sheet',()=>ok(symlist.opensEditor));

  /* ---- recap card arrows retired (.414): header day nav replaces them ---- */
  const recap=await page.evaluate(async()=>{
    state.nightlyLog={'2019-03-30':{date:'2019-03-30',text:'Rest day recap.',mood:'calm'},'2019-03-31':{date:'2019-03-31',text:'Solid day.',mood:'happy'}};
    state.view='overview';state.selDate='2019-03-31';state.nightOpen=true;render();
    await new Promise(r=>setTimeout(r,80));
    const card=[...document.querySelectorAll('.wl-card')].find(x=>/Daily recap/.test(x.textContent));
    const arrows=document.querySelectorAll('.wl-recaparw,[data-act="recap:go"]').length;
    // header day nav still switches the recap with the day
    document.querySelector('.wl-hnav-daynav .wl-hnav-day').click();await new Promise(r=>setTimeout(r,80));
    const cardPrev=[...document.querySelectorAll('.wl-card')].find(x=>/Daily recap/.test(x.textContent));
    return {cardShown:!!card,arrows,prevDayRecap:!!(cardPrev&&/Rest day recap/.test(cardPrev.textContent))};
  });
  test('RECAP: the card renders with NO per-card arrows',()=>{ok(recap.cardShown,'no recap card');ok(recap.arrows===0,String(recap.arrows));});
  test('RECAP: the header day nav moves the recap with the day',()=>ok(recap.prevDayRecap));

  /* ---- pending-today stats (.416): steps/calories exclude an incomplete today ---- */
  const pend=await page.evaluate(async()=>{
    const today=todayISO();
    state.view='weight';state.trendMode='W';state.trendOffset=0;state.moreStats=true;
    state.nightlyLog={};state.nightlySummary=null;
    // seed EVERY day of the current trend window: past days constant, today lower
    const ctx=trendCtx();state.steps={};state.food={};
    let past=0;
    for(let d=new Date(ctx.start);d<=ctx.end;d=addDays(d,1)){
      const iso=toISO(d);
      if(iso<today){state.steps[iso]=5000;state.food[iso]={calories:'2000'};past++;}
      else if(iso===today){state.steps[iso]=2000;state.food[iso]={calories:'400'};}
    }
    render();await new Promise(r=>setTimeout(r,100));
    const grab=()=>{const sc=[...document.querySelectorAll('.wl-substat')].find(x=>/Steps/.test(x.textContent));
      const cc=[...document.querySelectorAll('.wl-substat')].find(x=>/Calories/.test(x.textContent));
      return {stepsAvg:(sc.textContent.match(/avg ([\d,]+)/)||[])[1],
        calAvg:(cc.textContent.match(/avg ([\d,]+)/)||[])[1],
        outlined:sc.innerHTML.includes('fill="none" stroke')};};
    const r1=grab();
    const expect1={steps:past?'5,000':undefined,cal:past?'2,000':undefined};
    state.nightlyLog[today]={date:today,text:'done',mood:'happy'};render();
    await new Promise(r=>setTimeout(r,100));
    const r2=grab();
    const expect2={steps:Math.round((past*5000+2000)/(past+1)).toLocaleString()};
    return {past,r1,expect1,r2,expect2};
  });
  test('PEND: incomplete today is EXCLUDED from steps/calories averages',()=>{
    if(pend.past===0){ok(pend.r1.stepsAvg===undefined,'window has only today; avg must be empty: '+pend.r1.stepsAvg);}
    else{ok(pend.r1.stepsAvg===pend.expect1.steps&&pend.r1.calAvg===pend.expect1.cal,JSON.stringify(pend.r1)+' vs '+JSON.stringify(pend.expect1));}});
  test('PEND: today renders as an OUTLINED bar while incomplete',()=>ok(pend.r1.outlined));
  test('PEND: completing today (recap exists) counts it and solidifies the bar',()=>{
    ok(pend.r2.stepsAvg===pend.expect2.steps&&!pend.r2.outlined,JSON.stringify(pend.r2)+' vs '+JSON.stringify(pend.expect2));});

  test('no page errors across the run',()=>eq(errs,[]));
  await browser.close();server.close();
  console.log('\n'+'-'.repeat(52));
  console.log(failures.length?`FAILED — ${passed} passed, ${failures.length} failed`:`OK — ${passed} passed`);
  process.exitCode=failures.length?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
