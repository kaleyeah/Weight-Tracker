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
    localStorage.setItem('wl_v1',JSON.stringify({settings:{onboarded:true,units:'lbs'},weights:[{date:'2026-07-22',weight:186.8},{date:'2026-08-01',weight:184.0}],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},statuses:[],presets:[],skips:{},nightlyLog:{}}));
    localStorage.setItem('wl_training_v1',JSON.stringify({
      cardioTypes:['Peloton'],
      exercises:[{id:'e-pull',name:'Pullup',muscle:'back',bodyweight:true,notes:[{id:'n-1',text:'Grip outside shoulders'}]},
                 {id:'e-row',name:'Row',muscle:'back',bodyweight:false,notes:[]}],
      routines:[{id:'r1',name:'Day T',items:[
        {id:'i1',exerciseId:'e-pull',sets:2,progression:'double',repLow:'6',repHigh:'12',weight:'',notes:[{id:'n-2',text:'Belt on set 2'}]},
        {id:'i2',exerciseId:'e-row',sets:2,progression:'double',repLow:'8',repHigh:'12',weight:'50',notes:[]}]}],
      sessions:{},
      liftSessions:{'2026-07-22':[{bw:186.8,date:'2026-07-22',mode:'full',name:'Day T',routineId:'r1',ts:1784700000000,entries:[
        {exerciseId:'e-pull',name:'Pullup',muscle:'back',sets:[{weight:186.8,reps:9,rir:1,status:'done'},{weight:186.8,reps:8,rir:0,status:'done'}]},
        {exerciseId:'e-row',name:'Row',muscle:'back',sets:[{weight:50,reps:10,rir:1,status:'done'},{weight:50,reps:9,rir:0,status:'done'}]}]}]}
    }));
  });
  await ctx.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],token:'tok',record:{id:'userA'}})}));
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
  test('workout bw is today\'s weigh-in (184)',()=>eq(wo.bw,184));
  test('#6 pull-up defaults to TODAY\'S bodyweight, not last session\'s 186.8',()=>eq(wo.pullW,['184','184']));
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
    state.liftViewDate='2026-07-22';
    state.liftViewId=state.training.liftSessions['2026-07-22'][0].id;
    state.liftEdit='summary';state.view='liftview';render();
    await new Promise(r=>setTimeout(r,100));
    const dateIn=document.querySelector('[data-sv="date"]');
    const timeIn=document.querySelector('[data-sv="time"]');
    const minsIn=document.querySelector('[data-sv="mins"]');
    if(!dateIn||!timeIn||!minsIn)return {fail:'editor fields missing',d:!!dateIn,t:!!timeIn,m:!!minsIn};
    // edit: move to 7-21 at 18:43, 60 minutes — via the real input events
    const setVal=(el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));};
    setVal(dateIn,'2026-07-21');setVal(timeIn,'18:43');setVal(minsIn,'60');
    await new Promise(r=>setTimeout(r,80));
    document.querySelector('[data-act="lift:savedetail"]').click();
    await new Promise(r=>setTimeout(r,120));
    const ls=state.training.liftSessions;
    const moved=(ls['2026-07-21']||[])[0];
    const stored=JSON.parse(localStorage.getItem('wl_training_v1'));
    const tags21=(state.workouts['2026-07-21']||[]).filter(a=>a.cat==='lifting');
    const tags22=(state.workouts['2026-07-22']||[]).filter(a=>a.cat==='lifting');
    return {
      oldKeyGone:!(ls['2026-07-22']||[]).length,
      moved:!!moved, date:moved&&moved.date, mins:moved&&moved.mins,
      ts:moved&&new Date(moved.ts).toString().slice(0,21),
      hh:moved&&new Date(moved.ts).getHours(), mm:moved&&new Date(moved.ts).getMinutes(),
      timeFieldGone:moved&&!('time' in moved),
      persisted:!!(stored.liftSessions['2026-07-21']||[]).length,
      tagMoved:tags21.length===1&&tags22.length===0
    };
  });
  test('EDIT: the editor shows Date, Start time and Duration fields',()=>notOk(move.fail,JSON.stringify(move)));
  test('EDIT: the session moved off the old date key',()=>ok(move.oldKeyGone));
  test('EDIT: and onto the new date key with date field updated',()=>{ok(move.moved);eq(move.date,'2026-07-21');});
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
      {id:'d-early',takenAt:at('2026-07-28','08:00'),dose:'0.5',unit:'mg',siteId:(g.sites&&g.sites[0]||{}).id,note:'left side'},
      {id:'d-late', takenAt:at('2026-07-31','09:15'),dose:'0.5',unit:'mg',siteId:(g.sites&&g.sites[1]||g.sites&&g.sites[0]||{}).id,note:'pre-workout'}
    ];
    const headId=(g.symptomTypes.find(t=>/Headache/.test(t.label))||{}).id;
    g.symptoms=[{id:'s-31',occurredAt:at('2026-07-31','20:00'),severity:2,symptomTypeId:headId,note:''}];
    const card=()=>{const c=[...document.querySelectorAll('.wl-card')].find(x=>/Log Dose|Dose skipped|Semaglutide|No shot this day/.test(x.textContent)&&x.querySelector('[data-act="glp:dose:open"],[data-act="glp:sym:open"]'));return c?c.textContent:'';};
    // day WITH a shot: only that day's dose + that day's symptom
    state.selDate='2026-07-31';state.view='train';render();await new Promise(r=>setTimeout(r,80));
    const dayWith=card();
    const entries31=document.querySelectorAll('[data-act="glp:dose:del"]').length;
    // day WITHOUT a shot: no dose entries, "last was N days ago" hint
    state.selDate='2026-07-30';render();await new Promise(r=>setTimeout(r,80));
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
    fld.value='152.4';fld.dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(r=>setTimeout(r,60));
    const stored=JSON.parse(localStorage.getItem('wl_v1')||'{}');
    // the HK plan understands leanmass — exact key, pretty key, and per-day lines
    const p1=hkPlan({for:'2026-07-31',leanmass:150.6,waist:34.2},null);
    const p2=hkPlan(JSON.stringify({for:'2026-07-31',"Lean Body Mass":151,"Waist Circumference":34}),null);
    const p3=hkPlan({leanmass:"2026-07-29,149.8\n2026-07-30,150.1"},null);
    // the chart gets an LBM tab
    state.view='weight';state.bcTab='leanmass';render();
    await new Promise(r=>setTimeout(r,80));
    const seg=[...document.querySelectorAll('[data-act="bc:tab"]')].map(b=>b.textContent);
    const card=[...document.querySelectorAll('.wl-card')].find(x=>/Body composition/.test(x.textContent));
    return {
      val:state.leanmass[today],
      persisted:(stored.leanmass||{})[today],
      p1:{lm:p1.leanmass['2026-07-31'],wa:p1.waist['2026-07-31'],n:p1.count},
      p2:{lm:p2.leanmass['2026-07-31'],wa:p2.waist['2026-07-31']},
      p3:p3.leanmass,
      tabs:seg, chartHasLatest:!!card&&/latest 152\.4/.test(card.textContent)
    };
  });
  test('LBM: the weight check-in has a Lean mass field that saves',()=>{notOk(lbm.fail,JSON.stringify(lbm));eq(String(lbm.val),'152.4');});
  test('LBM: the value persists to storage',()=>eq(String(lbm.persisted),'152.4'));
  test('LBM: hkPlan files leanmass and waist for the target day',()=>{eq(String(lbm.p1.lm),'150.6');eq(String(lbm.p1.wa),'34.2');eq(lbm.p1.n,2);});
  test('LBM: Shortcut may use pretty keys ("Lean Body Mass", "Waist Circumference")',()=>{eq(String(lbm.p2.lm),'151');eq(String(lbm.p2.wa),'34');});
  test('LBM: per-day "date,value" lines file each day',()=>{eq(String(lbm.p3['2026-07-29']),'149.8');eq(String(lbm.p3['2026-07-30']),'150.1');});
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
    state.view='train';state.selDate='2026-07-31';render();await new Promise(r=>setTimeout(r,80));
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
    ok(/6–12 reps/.test(rest.sameEx),rest.sameEx);ok(/184 lbs/.test(rest.sameEx),rest.sameEx);});
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
    state.workout=null;saveWorkout();state.view='train';state.selDate='2026-07-31';render();
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

  test('no page errors across the run',()=>eq(errs,[]));
  await browser.close();server.close();
  console.log('\n'+'-'.repeat(52));
  console.log(failures.length?`FAILED — ${passed} passed, ${failures.length} failed`:`OK — ${passed} passed`);
  process.exitCode=failures.length?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
