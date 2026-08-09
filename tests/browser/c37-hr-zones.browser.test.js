/* C37 (browser) — cardio heart-rate zones: automatic (Karvonen when a resting
   HR exists, percent-of-max otherwise) or a manual table the athlete types in.

   The zone decides what counts toward the weekly cardio-minute goal (zone 2+),
   so the boundaries are load-bearing, not cosmetic. Two properties matter most:
     - an athlete with NO resting HR keeps exactly the zones they had before;
     - Karvonen places zone 2 higher than percent-of-max for the same athlete,
       because effort is measured above rest.

       CF_SRC=<file> node tests/browser/c37-hr-zones.browser.test.js */
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
    localStorage.setItem('wl_v1',JSON.stringify({settings:{onboarded:true,units:'lbs',age:'40',maxHR:'180',weekStart:'0'},
      weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},
      statuses:[],presets:[],skips:{},nightlyLog:{}}));
  });
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  await page.waitForTimeout(900);

  const run=(fn,arg)=>page.evaluate(fn,arg);

  console.log('C37 — heart-rate zones');

  /* --- 1. no resting HR: identical to the zones the app shipped with ------ */
  /* Swept across max HRs whose 60/70/80/90% lines do NOT land on whole numbers
     (183, 187, 191…): rounding the boundaries would move a zone edge by a beat
     for those athletes and quietly change what counts toward the cardio goal. */
  const pctmax=await run(()=>{
    state.settings.restingHR='';state.settings.zoneMethod='auto';
    let same=true,diff=null;
    for(let mx=150;mx<=205;mx++){
      state.settings.maxHR=String(mx);
      for(let hr=80;hr<=210;hr++){
        const now=zoneForHR(hr),before=zoneFromHR(hr,mx);
        if(now!==before){same=false;diff=diff||{mx:mx,hr:hr,now:now,before:before};}
      }
    }
    state.settings.maxHR='180';
    const m=zoneModel();
    return {method:m.method,bounds:m.bounds,same:same,diff:diff};
  });
  test('no resting HR falls back to percent of max',()=>eq(pctmax.method,'pctmax'));
  test('percent-of-max zones are unchanged for every max HR 150–205 (80–210 bpm)',
    ()=>ok(pctmax.same,'zone assignment changed for an athlete who set nothing new: '+JSON.stringify(pctmax.diff)));
  test('zone 2 still starts at 60% of max',()=>eq(Math.round(pctmax.bounds[0]),108));

  /* --- 2. Karvonen once a resting HR exists ------------------------------ */
  const hrr=await run(()=>{
    state.settings.restingHR='60';state.settings.zoneMethod='auto';
    const m=zoneModel();
    return {method:m.method,reserve:m.reserve,bounds:m.bounds.map(Math.round),
      at120:zoneForHR(120),at132:zoneForHR(132),at131:zoneForHR(131),at174:zoneForHR(174)};
  });
  test('a resting HR switches the model to Karvonen',()=>eq(hrr.method,'hrr'));
  test('heart-rate reserve is max − resting',()=>eq(hrr.reserve,120));
  test('Karvonen bounds are rest + fraction × reserve',
    ()=>eq(JSON.stringify(hrr.bounds),JSON.stringify([132,144,156,168])));
  test('120 bpm is zone 1 under Karvonen (it was zone 2 on percent-of-max)',()=>eq(hrr.at120,1));
  test('the zone-2 line is inclusive at 132 and exclusive at 131',
    ()=>{eq(hrr.at132,2);eq(hrr.at131,1);});
  test('90% of reserve reaches zone 5',()=>eq(hrr.at174,5));

  /* --- 3. manual overrides both, and only when it is a real table -------- */
  const manual=await run(()=>{
    state.settings.zoneMethod='manual';
    state.settings.zoneB2='130';state.settings.zoneB3='145';state.settings.zoneB4='';state.settings.zoneB5='175';
    const partial=zoneModel();
    state.settings.zoneB4='160';
    const full=zoneModel();
    state.settings.zoneB4='120';              /* out of order — not a table */
    const descending=zoneModel();
    state.settings.zoneB4='160';
    return {partial:partial.method,partialIncomplete:!!partial.incomplete,
      full:full.method,fullBounds:full.bounds,
      descending:descending.method,at130:zoneForHR(130),at129:zoneForHR(129),at180:zoneForHR(180)};
  });
  test('an incomplete manual table falls back to automatic',()=>eq(manual.partial,'hrr'));
  test('the fallback is flagged so the UI can say so',()=>ok(manual.partialIncomplete));
  test('a descending manual table is refused, not silently used',()=>eq(manual.descending,'hrr'));
  test('a complete ascending table is used verbatim',
    ()=>{eq(manual.full,'manual');eq(JSON.stringify(manual.fullBounds),JSON.stringify([130,145,160,175]));});
  test('manual boundaries assign zones inclusively',
    ()=>{eq(manual.at130,2);eq(manual.at129,1);eq(manual.at180,5);});

  /* --- 4. a logged cardio session gets the zone from the live model ------ */
  const logged=await run(()=>{
    state.settings.zoneMethod='auto';state.settings.restingHR='60';
    /* the same average HR, saved under both models */
    const hr=125;
    const karv=zoneForHR(hr);
    state.settings.restingHR='';
    const pct=zoneForHR(hr);
    return {karv:karv,pct:pct};
  });
  test('the same 125 bpm session is zone 2 on percent-of-max and zone 1 on Karvonen',
    ()=>{eq(logged.pct,2);eq(logged.karv,1);});

  /* --- 5. the settings screen renders the table and the picker ----------- */
  await run(()=>{state.settings.restingHR='60';state.settings.zoneMethod='auto';
    state.view='settings';state.setPage=null;state.open={};render();});
  await page.click('[data-act="set:page"][data-page="profile"]');
  await page.waitForTimeout(300);
  const ui=await page.evaluate(()=>{
    const read=document.getElementById('wl-zoneread');
    const btns=[...document.querySelectorAll('[data-act="set:zonemethod"]')].map(b=>b.textContent.trim());
    return {hasRead:!!read,text:read?read.textContent:'',btns:btns,
      restField:!!document.querySelector('[data-set="restingHR"]')};
  });
  test('settings shows a resting heart-rate field',()=>ok(ui.restField));
  test('settings offers Automatic and Manual',
    ()=>eq(JSON.stringify(ui.btns),JSON.stringify(['Automatic','Manual'])));
  test('the zone readout names Karvonen and shows the reserve',
    ()=>{ok(/Karvonen/.test(ui.text),'no Karvonen in: '+ui.text);ok(/120 bpm/.test(ui.text),'no reserve in: '+ui.text);});
  test('the zone readout lists all five zones',
    ()=>ok(/Zone 1/.test(ui.text)&&/Zone 5/.test(ui.text),ui.text));

  /* --- 6. choosing Manual seeds empty boxes, and never clobbers a table --- */
  await page.click('[data-act="set:zonemethod"][data-zm="manual"]');
  await page.waitForTimeout(300);
  const kept=await page.evaluate(()=>[2,3,4,5].map(z=>document.querySelector('[data-set="zoneB'+z+'"]').value));
  test('Manual leaves an existing table alone',
    ()=>eq(JSON.stringify(kept),JSON.stringify(['130','145','160','175'])));

  await page.click('[data-act="set:zonemethod"][data-zm="auto"]');
  await run(()=>{[2,3,4,5].forEach(z=>{state.settings['zoneB'+z]='';});render();});
  await page.click('[data-act="set:zonemethod"][data-zm="manual"]');
  await page.waitForTimeout(300);
  const seeded=await page.evaluate(()=>({
    b:[2,3,4,5].map(z=>document.querySelector('[data-set="zoneB'+z+'"]').value),
    method:zoneModel().method}));
  test('Manual seeds empty boxes from the automatic zones',
    ()=>eq(JSON.stringify(seeded.b),JSON.stringify(['132','144','156','168'])));
  test('and the model switches to manual immediately',()=>eq(seeded.method,'manual'));

  test('no page errors',()=>eq(errs.length,0,errs.join(' | ')));

  await browser.close();server.close();
  console.log('\n'+passed+' passed, '+failures.length+' failed');
  if(failures.length){console.log('FAILED: '+failures.join(', '));process.exit(1);}
})().catch(e=>{console.error(e);process.exit(1);});
