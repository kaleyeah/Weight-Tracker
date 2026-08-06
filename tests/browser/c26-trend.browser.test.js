/* C26 (browser) — the W/M/6M measurement trend component (Owner package
   2026-08-06), integrated on the Progress tab, real Chromium.

       CF_SRC=<file> node tests/browser/c26-trend.browser.test.js

   Asserts the acceptance-test behaviors that need a real DOM: one component
   powers all four metrics; W/M/6M updates average+copy+chart together;
   navigation never reaches the future; metric switching preserves the
   period; point details; sparse and empty states; no NaN anywhere. */
const path=require('path'),http=require('http'),fs=require('fs');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const SRC=process.env.CF_SRC||'/home/griffin/projects/compound-app/index.html';
let passed=0;const failures=[];
const test=(n,f)=>{try{f();passed++;console.log('  ✓ '+n);}catch(e){failures.push(n);console.log('  ✗ '+n+'\n      '+(e&&e.message));}};
const ok=(v,m)=>{if(!v)throw new Error(m||'expected truthy');};
const eq=(a,b,m)=>{if(a!==b)throw new Error((m||'eq')+': '+JSON.stringify(a)+' !== '+JSON.stringify(b));};

/* seeded local data: ~4 months of weigh-ins (dense recent, sparse early),
   sparse body fat, no waist at all — built relative to TODAY so the rolling
   windows always contain data */
function seedState(){
  const day=(n)=>{const d=new Date();d.setDate(d.getDate()-n);
    const m=d.getMonth()+1,dd=d.getDate();
    return d.getFullYear()+'-'+(m<10?'0':'')+m+'-'+(dd<10?'0':'')+dd;};
  const weights=[];const bodyfat={};
  for(let n=0;n<30;n++){weights.push({date:day(n),weight:180+Math.sin(n/5)*2+n*0.08});}
  for(let n=30;n<120;n+=4){weights.push({date:day(n),weight:184+n*0.05});}
  for(let n=0;n<30;n+=4){bodyfat[day(n)]=24-n*0.02;}
  return {weights:weights,bodyfat:bodyfat,day:day};
}

(async()=>{
  const html=fs.readFileSync(SRC,'utf8');
  const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch();
  const seeded=seedState();
  const ctx=await browser.newContext({viewport:{width:390,height:844}});
  /* a signed-in device; the API is mocked so the lease grants and pulls are
     empty — this suite is about the trend component, not sync */
  await ctx.route('**/api/**',async(route)=>{
    const url=route.request().url();
    const reply=(st,b)=>route.fulfill({status:st,contentType:'application/json',body:JSON.stringify(b)});
    if(/cf\/writer\/lease/.test(url)){
      const b=JSON.parse(route.request().postData()||'{}');
      return reply(200,{ok:true,exists:true,granted:true,fence:1,holderDeviceId:b.deviceId,
        deviceName:b.deviceName||'x',active:true,serverNow:Date.now(),ttlMs:86400000});}
    if(/collections\/appdata\/records/.test(url))return reply(200,{items:[]});
    return reply(200,{items:[],token:'tok',record:{id:'userA'}});});
  await ctx.addInitScript((sd)=>{
    const z=JSON.parse(sd);
    localStorage.setItem('wl_pb',JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok',email:'a@x.com'}));
    localStorage.setItem('wl_last_owner','userA');
    const base={settings:{onboarded:true,units:'lbs'},weights:z.weights,food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:z.bodyfat,waist:{},leanmass:{},statuses:[],presets:[],skips:{},nightlyLog:{}};
    localStorage.setItem('wl_v1',JSON.stringify(base));
  },JSON.stringify(seeded));
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  await page.waitForTimeout(900);
  await page.evaluate(()=>{state.view='weight';render();});
  await page.waitForTimeout(200);

  const S=process.env.C26_SHOTS||'';
  const shot=async(name)=>{if(!S)return;
    const card=await page.evaluateHandle(()=>document.querySelector('.wl-t2-head').closest('.wl-card'));
    await card.asElement().screenshot({path:S+'/'+name+'.png'});};

  /* ---- default M view ---- */
  {
    const s=await page.evaluate(()=>({
      head:!!document.querySelector('.wl-t2-head'),
      avg:(document.querySelector('.wl-t2-avg')||{}).textContent||'',
      copy:(document.querySelector('.wl-t2-copy')||{}).textContent||'',
      svg:!!document.querySelector('.wl-t2-copy ~ svg, svg.wl-chart'),
      avgLine:(document.body.innerHTML.match(/>AVG</)||[]).length,
      nextOff:!!document.querySelector('[disabled].wl-hnav-arw, .wl-hnav-arw.off'),
      nan:/NaN|Infinity/.test((document.querySelector('.wl-t2-head').closest('.wl-card')||{}).innerHTML||'')}));
    test('M is the default view with a real average headline',()=>{
      ok(s.head,'no component head');ok(/^\d+\.\d/.test(s.avg),'avg: '+s.avg);});
    test('M copy is a real sentence about this month',()=>
      ok(/average weight this month \(\d+\.\d lbs?\)/i.test(s.copy),'copy: '+s.copy));
    test('M draws the chart with the dashed AVG line',()=>{ok(s.svg,'no svg');eq(s.avgLine,1,'AVG labels');});
    test('Next is disabled at the current period',()=>ok(s.nextOff,'next not disabled'));
    test('no NaN/Infinity anywhere in the card',()=>ok(!s.nan,'NaN leaked'));
    await shot('weight-M');
  }

  /* ---- W view: value labels on points; one tap updates everything ---- */
  {
    const before=await page.evaluate(()=>(document.querySelector('.wl-t2-copy')||{}).textContent);
    await page.click('[data-act="t2:mode"][data-mode="W"]');
    await page.waitForTimeout(150);
    const s=await page.evaluate(()=>({
      copy:(document.querySelector('.wl-t2-copy')||{}).textContent||'',
      labels:document.querySelectorAll('svg.wl-chart text[font-weight="700"]').length,
      on:(document.querySelector('[data-act="t2:mode"][data-mode="W"]')||{}).className||''}));
    test('W: the segmented control reflects selection',()=>ok(/on/.test(s.on),'class: '+s.on));
    test('W: copy switched to the week wording in the same update',()=>{
      ok(/this week/.test(s.copy),'copy: '+s.copy);ok(s.copy!==before,'copy unchanged');});
    test('W: plotted points carry visible value labels',()=>ok(s.labels>=3,'labels: '+s.labels));
    await shot('weight-W');
  }

  /* ---- period navigation ---- */
  {
    const t2label=()=>page.evaluate(()=>{const c=document.querySelector('.wl-t2-head').closest('.wl-card');
      return (c.querySelector('.wl-hnav-lbl span')||{}).textContent;});
    const l0=await t2label();
    await page.click('[data-act="t2:prev"]');
    await page.waitForTimeout(150);
    const l1=await t2label();
    const nextEnabled=await page.evaluate(()=>!!document.querySelector('[data-act="t2:next"]'));
    await page.click('[data-act="t2:next"]');
    await page.waitForTimeout(150);
    const l2=await t2label();
    test('Previous moves back one period and changes the range label',()=>ok(l1!==l0,'label unchanged: '+l1));
    test('Next re-enables off-current and returns to the current period',()=>{
      ok(nextEnabled,'next stayed disabled');eq(l2,l0,'did not return');});
  }

  /* ---- point details ---- */
  {
    await page.click('svg.wl-chart circle[data-act="t2:pt"][r="13"]');
    await page.waitForTimeout(150);
    const s=await page.evaluate(()=>(document.querySelector('.wl-readout')||{}).textContent||'');
    test('tapping a point reveals exact value, unit and date',()=>
      ok(/\d+\.\d.*lbs?.*·/.test(s)||/\d+\.\d/.test(s)&&/logged entry/.test(s),'readout: '+s));
  }

  /* ---- 6M view ---- */
  {
    await page.click('[data-act="t2:mode"][data-mode="6M"]');
    await page.waitForTimeout(200);
    const s=await page.evaluate(()=>{
      const card=document.querySelector('.wl-t2-head').closest('.wl-card');
      return {copy:(card.querySelector('.wl-t2-copy')||{}).textContent||'',
        segs:card.querySelectorAll('svg.wl-chart line[stroke-width="2.6"]').length,
        avgLine:(card.innerHTML.match(/>AVG</)||[]).length,
        nan:/NaN|Infinity/.test(card.innerHTML)};});
    test('6M: monthly average segments exist and are the primary summary',()=>{
      ok(s.segs>=2,'segments: '+s.segs);eq(s.avgLine,0,'a full-period AVG line leaked into 6M');});
    test('6M: copy is the period-average wording',()=>ok(/over this period/.test(s.copy),'copy: '+s.copy));
    test('6M: no NaN with sparse early months',()=>ok(!s.nan));
    await shot('weight-6M');
  }

  /* ---- metric switching preserves the period ---- */
  {
    const before=await page.evaluate(()=>({mode:state.t2Mode,off:state.t2Off||0}));
    await page.click('[data-act="bc:tab"][data-tab="bodyfat"]');
    await page.waitForTimeout(200);
    const s=await page.evaluate(()=>({mode:state.t2Mode,off:state.t2Off||0,
      copy:(document.querySelector('.wl-t2-copy')||{}).textContent||'',
      unit:(document.querySelector('.wl-t2-unit')||{}).textContent||''}));
    test('switching to Body fat preserves the selected period',()=>{
      eq(s.mode,before.mode,'mode');eq(s.off,before.off,'offset');});
    test('Body fat renders with % and its own copy',()=>{
      eq(s.unit,'%','unit');ok(/body fat/.test(s.copy),'copy: '+s.copy);});
    await shot('bodyfat-6M');
  }

  /* ---- LBM derives from same-date pairs ---- */
  {
    await page.click('[data-act="bc:tab"][data-tab="leanmass"]');
    await page.waitForTimeout(200);
    const s=await page.evaluate(()=>({
      avg:(document.querySelector('.wl-t2-avg')||{}).textContent||'',
      copy:(document.querySelector('.wl-t2-copy')||{}).textContent||''}));
    test('LBM (no stored entries) derives from weight+bodyfat pairs',()=>
      ok(/^\d+\.\d/.test(s.avg),'avg: '+s.avg));
    /* Owner question 2026-08-06: derived points must SAY they are derived */
    await page.click('svg.wl-chart circle[data-act="t2:pt"][r="13"]');
    await page.waitForTimeout(200);
    const det=await page.evaluate(()=>(document.querySelector('.wl-readout')||{}).textContent||'');
    test('a derived LBM point discloses its arithmetic, never "logged entry"',()=>{
      ok(/calculated from weight \+ body fat/.test(det),'readout: '+det);
      ok(!/logged entry/.test(det),'claimed logged: '+det);});
  }

  /* ---- empty metric: honest empty state, intact layout ---- */
  {
    await page.click('[data-act="bc:tab"][data-tab="waist"]');
    await page.waitForTimeout(200);
    const s=await page.evaluate(()=>{
      const card=document.querySelector('.wl-t2-head').closest('.wl-card');
      return {empty:(card.querySelector('.wl-empty')||{}).textContent||'',
        avg:(card.querySelector('.wl-t2-avg')||{}).textContent||'',
        svg:!!card.querySelector('svg.wl-chart'),
        nan:/NaN|Infinity/.test(card.innerHTML)};});
    test('empty metric shows useful text, an em-dash average, and no chart',()=>{
      ok(/No waist logged yet/i.test(s.empty),'empty: '+s.empty);
      ok(/—|—/.test(s.avg),'avg: '+s.avg);eq(s.svg,false,'svg rendered for empty data');});
    test('empty metric produces no NaN and no broken axes',()=>ok(!s.nan));
    await shot('waist-empty');
  }

  /* ---- the untouched surfaces still render (no unrelated change) ---- */
  {
    const s=await page.evaluate(()=>({
      pageSeg:!!document.querySelector('[data-act="trend:mode"]'),
      substats:document.querySelectorAll('.wl-substat').length,
      errs:0}));
    test('the page-level trend control and More stats survive unchanged',()=>{
      ok(s.pageSeg,'page trend control gone');ok(s.substats>=3,'substats: '+s.substats);});
  }

  test('no page errors across every interaction',()=>eq(errs.length,0,errs.join(';')));

  await ctx.close();await browser.close();server.close();
  console.log(failures.length?`FAILED — ${passed} passed, ${failures.length} failed`
    :`OK — ${passed} passed`);
  process.exit(failures.length?1:0);
})().catch(e=>{console.error('SUITE ERROR',e);process.exit(2);});
