/* C21 — the coach report's rep-range resolution.

       node tests/browser/c21-repranges.browser.test.js

   Owner, 2026-08-03: "What is going on with seated cable row? It is not
   showing me a rep range on day 1 lifting on the coach report."

   lrPrescription() is what decides whether a lifting row prints a range or an
   em dash. Reverse pyramid always fell back to the ROUTINE ITEM's setRanges,
   but double progression only ever read the SESSION ENTRY's own repLow/repHigh
   — so an entry logged without one printed nothing while its neighbours were
   fine. These cases pin both directions. */
const path=require('path'),http=require('http'),fs=require('fs');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const SRC=process.env.CF_SRC||'/home/griffin/projects/compound-app/index.html';

let passed=0;const failures=[];
const test=(n,f)=>{try{f();passed++;console.log('  ✓ '+n);}catch(e){failures.push(n);console.log('  ✗ '+n+'\n      '+(e&&e.message));}};
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
    localStorage.setItem('wl_v1',JSON.stringify({settings:{onboarded:true,units:'lbs',weekStart:'1'},
      weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},
      statuses:[],presets:[],skips:{},nightlyLog:{}}));
  });
  /* M10 (single-writer merge, 2026-08-03): this suite signs in, so the device
     must hold the writer lease before it may mutate anything. Answer the lease
     route as the granting server; everything else keeps the old stub. Same
     disclosed pattern as c14/c11m8-faults/c11m8-quota. */
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
  await page.waitForFunction(()=>typeof window.lrPrescription==='function',null,{timeout:15000});
  console.log('\nC21 (browser) — coach-report rep ranges\n  source: '+SRC);
  console.log('  build : '+await page.evaluate(()=>window.APP_BUILD));
  const ev=fn=>page.evaluate(fn);

  const RT=()=>({id:'r1',name:'Day 1',items:[
    {id:'i1',exerciseId:'e-row',progression:'double',sets:3,repLow:'8',repHigh:'12'},
    {id:'i2',exerciseId:'e-press',progression:'double',sets:3,repLow:'6',repHigh:'10'},
    {id:'i3',exerciseId:'e-norange',progression:'double',sets:3,repLow:'',repHigh:''}]});

  /* ---- T1: THE REPORTED BUG — entry has no range, routine item does ------ */
  const t1=await ev(()=>{
    const rt={id:'r1',name:'Day 1',items:[
      {id:'i1',exerciseId:'e-row',progression:'double',sets:3,repLow:'8',repHigh:'12'}]};
    const en={exerciseId:'e-row',name:'Seated cable row',progression:'double'}; /* no repLow/repHigh */
    return lrPrescription(en,3,rt);
  });
  test('T1 an entry with no range of its own inherits the routine item’s range',()=>{
    eq(t1.mode,'single','mode was "'+t1.mode+'" — "none" is what printed the em dash');
    eq(t1.ranges.length,3,'one range per set');
    eq(t1.ranges[0],{lo:8,hi:12});
    ok(t1.assumed,'inherited, not logged — it must be flagged assumed');
  });

  /* ---- T2: the entry's OWN range still wins ----------------------------- */
  const t2=await ev(()=>{
    const rt={id:'r1',name:'Day 1',items:[{id:'i1',exerciseId:'e-row',progression:'double',repLow:'8',repHigh:'12'}]};
    return lrPrescription({exerciseId:'e-row',progression:'double',repLow:'5',repHigh:'7'},2,rt);
  });
  test('T2 a range recorded on the entry is never overridden by the routine',()=>{
    eq(t2.mode,'single');
    eq(t2.ranges[0],{lo:5,hi:7});
    notOk(t2.assumed,'this one was logged, not inferred');
  });

  /* ---- T3: no range anywhere still prints nothing ----------------------- */
  const t3=await ev(()=>{
    const rt={id:'r1',name:'Day 1',items:[{id:'i3',exerciseId:'e-norange',progression:'double',repLow:'',repHigh:''}]};
    return {noItemRange:lrPrescription({exerciseId:'e-norange',progression:'double'},3,rt),
      noRoutine:lrPrescription({exerciseId:'e-ghost',progression:'double'},3,null),
      notInRoutine:lrPrescription({exerciseId:'e-missing',progression:'double'},3,rt)};
  });
  test('T3 with no range anywhere the report still shows nothing rather than inventing one',()=>{
    eq(t3.noItemRange.mode,'none','an item with blank reps must not fabricate a range');
    eq(t3.noRoutine.mode,'none');
    eq(t3.notInRoutine.mode,'none','an exercise absent from the routine has nothing to inherit');
  });

  /* ---- T4: an inverted or partial saved pair is refused ------------------ */
  const t4=await ev(()=>{
    const mk=(lo,hi)=>lrPrescription({exerciseId:'e-row',progression:'double'},2,
      {items:[{exerciseId:'e-row',progression:'double',repLow:lo,repHigh:hi}]});
    return {inverted:mk('12','8').mode,onlyLo:mk('8','').mode,onlyHi:mk('','12').mode,
      equal:mk('8','8')};
  });
  test('T4 an inverted or half-filled routine range is refused, an equal pair is valid',()=>{
    eq(t4.inverted,'none','hi<lo is unusable');
    eq(t4.onlyLo,'none');
    eq(t4.onlyHi,'none');
    eq(t4.equal.mode,'single');
    eq(t4.equal.ranges[0],{lo:8,hi:8});
  });

  /* ---- T5: reverse pyramid is untouched by the change ------------------- */
  const t5=await ev(()=>{
    const rt={items:[{exerciseId:'e-row',progression:'rpt',movement:'compound',
      setRanges:[{lo:4,hi:6},{lo:6,hi:8},{lo:8,hi:10}]}]};
    return {fromItem:lrPrescription({exerciseId:'e-row'},3,rt),
      fromEntry:lrPrescription({exerciseId:'e-row',progression:'rpt',
        setRanges:[{lo:3,hi:5},{lo:5,hi:7}]},2,rt)};
  });
  test('T5 reverse pyramid keeps its own ladder resolution',()=>{
    eq(t5.fromItem.mode,'rpt');
    eq(t5.fromItem.ranges.length,3);
    eq(t5.fromEntry.mode,'rpt');
    eq(t5.fromEntry.ranges[0],{lo:3,hi:5},'the entry’s own ladder wins');
  });

  /* ---- T6: end to end — the row actually prints the range --------------- */
  const t6=await ev(()=>{
    const px=lrPrescription({exerciseId:'e-row',name:'Seated cable row',progression:'double'},3,
      {items:[{exerciseId:'e-row',progression:'double',repLow:'8',repHigh:'12'}]});
    const hasR=(px.mode!=='none');
    const g=hasR?px.ranges[0]:null;
    /* this is exactly what srWorkoutsHTML prints per set */
    return {cell:(g&&g.lo!=null&&g.hi!=null)?srRangeTxt({lo:g.lo,hi:g.hi}):'—',
      scheme:srSchemeTxt({mode:px.mode,ranges:px.ranges,sets:[1,2,3]})};
  });
  test('T6 the printed cell shows the range instead of an em dash',()=>{
    eq(t6.cell,'8–12','this cell is what the Owner saw as "—"');
    eq(t6.scheme,'3 × 8–12');
  });

  /* ---- T8: cardio leads the workouts section, every zone included ------
       Owner, 2026-08-03: "coach report needs to list the cardio sessions first
       under this week's workouts ... day, type, zone, duration, cals if
       available. This includes all zones, not just zone 2 plus." ---------- */
  const t8=await ev(()=>{
    const wk=weekDays(0).map(d=>toISO(d));
    state.training=state.training||{};state.training.sessions={};
    state.training.sessions[wk[1]]=[
      {kind:'cardio',type:'Peloton',zone:1,mins:22,cal:180,notes:'easy spin'},
      {kind:'lifting',name:'Day 1'}];
    state.training.sessions[wk[3]]=[{kind:'cardio',type:'Incline walk',zone:3,mins:45,cal:410}];
    state.training.sessions[wk[5]]=[{kind:'cardio',type:'Row',mins:15}];   /* no zone, no cals */
    const inp=srInput(0);
    const html=srWorkoutsHTML(inp);
    const holder=document.createElement('div');holder.innerHTML=html;
    const labels=[].slice.call(holder.querySelectorAll('.secLbl')).map(x=>x.textContent);
    const rows=[].slice.call(holder.querySelectorAll('.cd-row:not(.cd-hd)'))
      .map(r=>[].slice.call(r.children).map(c=>c.textContent));
    const cardioIdx=html.indexOf('>Cardio<'), liftIdx=html.indexOf('Weightlifting');
    return {n:inp.cardio.length,rows,labels,cardioIdx,liftIdx,wk,
      head:[].slice.call(holder.querySelectorAll('.cd-hd span')).map(x=>x.textContent),
      note:(holder.querySelector('.cd-note')||{}).textContent||null};
  });
  /* The day column is asserted against the weekday of the date each session was
     actually filed under, worked out here in Node. This originally hard-coded
     Mon/Wed/Fri, which silently assumed a Sunday-start week even though the
     fixture seeds weekStart:'1' — it only held because the legacy pull used to
     overwrite state.settings with the defaults on boot. Deriving it pins the
     label to the date, which is the stronger claim and holds at any weekStart. */
  const D3=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dayOf=iso=>D3[new Date(iso+'T12:00:00').getDay()];
  test('T8 cardio is listed first, with day/type/zone/time/cals, at every zone',()=>{
    eq(t8.n,3,'all three sessions, including the zone-1 one');
    eq(t8.head,['Day','Type','Zone','Time','Cals']);
    ok(t8.cardioIdx>=0&&t8.liftIdx>t8.cardioIdx,'Cardio must come before Weightlifting');
    ok(t8.labels.indexOf('Weightlifting')>=0,'the lifting block needs its own heading');
    eq(t8.rows[0],[dayOf(t8.wk[1]),'Peloton','Z1','22 min','180'],'zone 1 must not be filtered out');
    eq(t8.rows[1],[dayOf(t8.wk[3]),'Incline walk','Z3','45 min','410']);
    eq(t8.rows[2],[dayOf(t8.wk[5]),'Row','—','15 min','—'],'missing zone and cals print an em dash');
    eq(t8.note,'easy spin');
  });

  /* ---- T9: a week with no cardio says so instead of vanishing ----------- */
  const t9=await ev(()=>{
    state.training.sessions={};
    const html=srWorkoutsHTML(srInput(0));
    return {hasCardioHead:/>Cardio</.test(html),says:/No cardio logged this week/.test(html),
      rows:(html.match(/cd-row(?! cd-hd)/g)||[]).length};
  });
  test('T9 an empty cardio week still shows the heading and says nothing was logged',()=>{
    ok(t9.hasCardioHead);
    ok(t9.says);
  });

  /* ---- T10: weight and reps are visually separated -------------------- */
  const t10=await ev(()=>{
    const css=[].concat(SRCSS).join('\n');
    const holder=document.createElement('div');
    holder.innerHTML=srExerciseHTML({name:'Seated Cable Row',mode:'single',ranges:[{lo:8,hi:12}],
      sets:[{n:1,w:142.5,r:12,rir:3,lo:8,hi:12}]},true);
    const wr=holder.querySelector('.set-wr');
    return {html:wr?wr.innerHTML:null,text:wr?wr.textContent:null,
      hasX:!!(wr&&wr.querySelector('.wr-x')),
      xRule:/\.wr-x\{[^}]*\}/.exec(css),
      gridGap:/\.setgrid\{[^}]*gap:(\d+)px/.exec(css)};
  });
  test('T10 the multiply sign is spaced and dimmed so weight and reps read apart',()=>{
    ok(t10.hasX,'weight×reps is still one run of characters: '+t10.html);
    ok(t10.xRule&&/padding:0 6px/.test(t10.xRule[0]),'x rule was '+(t10.xRule&&t10.xRule[0]));
    ok(t10.gridGap&&Number(t10.gridGap[1])>=10,'set grid gap was '+(t10.gridGap&&t10.gridGap[1]));
    ok(/142\.5/.test(t10.text)&&/12/.test(t10.text),'the numbers must still be there: '+t10.text);
  });

  /* ---- T11: body fat and lean mass reach the report -------------------- */
  const t11=await ev(()=>{
    const wk=weekDays(0).map(d=>toISO(d));
    const before=toISO(new Date(parseISO(wk[0]).getTime()-10*86400000));
    state.bodyfat={};state.leanmass={};state.waist={};
    state.bodyfat[before]=22.1;state.bodyfat[wk[2]]=21.3;   /* down = good */
    state.leanmass[before]=146.0;state.leanmass[wk[2]]=147.2; /* up = good */
    state.waist[before]=35.0;                                /* stale only */
    const inp=srInput(0);
    const holder=document.createElement('div');
    holder.innerHTML=srBodyCompHTML(inp);
    const rows=[].slice.call(holder.querySelectorAll('.bc-row')).map(r=>({
      k:r.querySelector('.bc-k').textContent,
      v:r.querySelector('.bc-v').textContent,
      chg:(r.querySelector('.bc-chg')||{}).textContent||null,
      cls:(r.querySelector('.bc-chg')||{}).className||null,
      d:r.querySelector('.bc-d').textContent}));
    /* and with nothing ever logged the card omits itself entirely */
    state.bodyfat={};state.leanmass={};state.waist={};
    const empty=srBodyCompHTML(srInput(0));
    return {rows,empty};
  });
  test('T11 body fat and lean mass appear with direction, and a stale reading says so',()=>{
    eq(t11.rows.length,3,'body fat, lean mass and waist');
    eq(t11.rows[0].k,'Body fat');
    ok(/21\.3/.test(t11.rows[0].v),'value was '+t11.rows[0].v);
    ok(/good/.test(t11.rows[0].cls||''),'falling body fat should read as good: '+t11.rows[0].cls);
    eq(t11.rows[1].k,'Lean mass');
    ok(/147\.2/.test(t11.rows[1].v));
    ok(/good/.test(t11.rows[1].cls||''),'RISING lean mass must read as good, not bad: '+t11.rows[1].cls);
    ok(/last logged/.test(t11.rows[2].d),'a pre-week reading must be marked stale: '+t11.rows[2].d);
    notOk(t11.rows[2].chg,'a stale reading has no in-week change to report');
    eq(t11.empty,'','with nothing logged the card must omit itself');
  });

  /* ---- T12: weight leads, columns hold their width, header repeats ----- */
  const t12=await ev(()=>{
    const wk=weekDays(0).map(d=>toISO(d));
    const before=toISO(new Date(parseISO(wk[0]).getTime()-3*86400000));
    state.settings.strategy='lose';
    state.weights=[{date:before,weight:201.8},{date:wk[2],weight:199.6}];
    state.bodyfat={};state.leanmass={};state.waist={};
    state.bodyfat[before]=22.1;state.bodyfat[wk[2]]=21.3;
    state.waist[before]=35.0;                       /* stale: no in-week reading */
    const holder=document.createElement('div');
    holder.innerHTML=srBodyCompHTML(srInput(0));
    const rows=[].slice.call(holder.querySelectorAll('.bc-row'));
    const cellsPerRow=rows.map(r=>r.children.length);
    const first=rows[0];
    /* every row must carry all four cells, including the one with no change */
    const stale=rows.filter(r=>/last logged/.test(r.querySelector('.bc-d').textContent))[0];
    return {order:rows.map(r=>r.querySelector('.bc-k').textContent),
      cellsPerRow,
      firstVal:first.querySelector('.bc-v').textContent,
      firstChg:first.querySelector('.bc-chg').textContent.trim(),
      firstCls:first.querySelector('.bc-chg').className,
      firstDate:first.querySelector('.bc-d').textContent,
      staleChgText:stale?stale.querySelector('.bc-chg').textContent.trim():null,
      staleHasChgCell:stale?!!stale.querySelector('.bc-chg'):null,
      hint:(holder.querySelector('.wl-hint')||{}).textContent||''};
  });
  test('T12 weight leads body composition and every row keeps all four columns',()=>{
    eq(t12.order[0],'Weight','weight must be the first metric');
    eq(t12.order,['Weight','Body fat','Waist'],'metrics with no data at all are omitted');
    ok(t12.cellsPerRow.every(n2=>n2===4),'ragged rows will not align: '+JSON.stringify(t12.cellsPerRow));
    ok(/199\.6/.test(t12.firstVal),'value was '+t12.firstVal);
    ok(/↓|&#8595;|\u2193/.test(t12.firstChg)||/2\.2/.test(t12.firstChg),'change was "'+t12.firstChg+'"');
    ok(/good/.test(t12.firstCls),'weight down on a cut should read good: '+t12.firstCls);
    ok(t12.firstDate.length>0,'weight needs its last-measured date too');
    ok(t12.staleHasChgCell,'a stale row must still emit the change CELL, empty');
    eq(t12.staleChgText,'','and that cell must be empty rather than absent');
    ok(/Dates show the last entry/.test(t12.hint),'hint was: '+t12.hint);
    notOk(/Measured only when logged/.test(t12.hint),'the old wording is still there');
  });

  /* ---- T13: the set-column header repeats for every exercise ------------ */
  const t13=await ev(()=>{
    const mk=n2=>({name:n2,mode:'single',ranges:[{lo:8,hi:12}],
      sets:[{n:1,w:100,r:10,rir:2,lo:8,hi:12}]});
    const holder=document.createElement('div');
    holder.innerHTML=srExerciseHTML(mk('First'),true)+srExerciseHTML(mk('Second'),false)+srExerciseHTML(mk('Third'),false);
    const heads=[].slice.call(holder.querySelectorAll('.sethead'));
    return {n:heads.length,
      cols:heads.map(h2=>[].slice.call(h2.children).map(c=>c.textContent))};
  });
  test('T13 every exercise carries its own Set / Weight × Reps / Target / Range / RIR header',()=>{
    eq(t13.n,3,'the header appeared on '+t13.n+' of 3 exercises');
    t13.cols.forEach(c=>eq(c,['Set','Weight × Reps','Target','Range','RIR']));
  });

  test('T7 no uncaught page errors',()=>{eq(errs,[],'page errors');});

  console.log('\nC21 — coach-report rep ranges: '+passed+' passed, '+failures.length+' failed');
  if(failures.length)console.log('  failed: '+failures.join(', '));
  await browser.close();server.close();
  process.exit(failures.length?1:0);
})();
