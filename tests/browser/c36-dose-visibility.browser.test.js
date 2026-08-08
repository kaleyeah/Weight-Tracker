/* C36 (browser) — doses are visible where the Owner looks for them.
   Owner, 2026-08-08: "why don't my doses show up in activity? I want to keep
   track of those too. In fact we could even mark them on a weight loss chart
   where we show the dose periods. Yellow lines on the day."

       CF_SRC=<file> node tests/browser/c36-dose-visibility.browser.test.js */
const path=require('path'),http=require('http'),fs=require('fs');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const SRC=process.env.CF_SRC||'/home/griffin/projects/compound-app/index.html';
const _SRCBUF=fs.readFileSync(SRC);
const SRC_SHA=require('crypto').createHash('sha256').update(_SRCBUF).digest('hex');
const SRC_BUILD=((_SRCBUF.toString('utf8').match(/APP_BUILD="([^"]+)"/)||[])[1])||'UNKNOWN';
console.log('ARTIFACT '+SRC+'\n         build='+SRC_BUILD+' sha256='+SRC_SHA.slice(0,16));
if(process.env.CF_EXPECT_BUILD&&SRC_BUILD!==process.env.CF_EXPECT_BUILD){
  console.error('ARTIFACT MISMATCH: runner expected '+process.env.CF_EXPECT_BUILD+', suite loaded '+SRC_BUILD);
  process.exit(3);
}
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
  await ctx.route('**/api/**',r=>{
    const url=r.request().url();
    const reply=(st,b)=>r.fulfill({status:st,contentType:'application/json',body:JSON.stringify(b)});
    if(/cf\/writer\/lease/.test(url)){
      const b=JSON.parse(r.request().postData()||'{}');
      return reply(200,{ok:true,exists:true,granted:true,fence:1,holderDeviceId:b.deviceId,
        deviceName:b.deviceName||'x',active:true,serverNow:Date.now(),ttlMs:86400000});}
    if(/collections\/appdata\/records/.test(url))return reply(200,{items:[]});
    return reply(200,{items:[],token:'tok',record:{id:'userA'}});});
  await ctx.addInitScript(()=>{
    localStorage.setItem('wl_pb',JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok',email:'a@x.com'}));
    localStorage.setItem('wl_last_owner','userA');
    localStorage.setItem('wl_v1',JSON.stringify({settings:{onboarded:true,units:'lbs',weekStart:'0'},
      weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},
      statuses:[],presets:[],skips:{},nightlyLog:{}}));});
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  await page.waitForTimeout(900);

  /* a real dosing history: weekly doses, one of them skipped */
  const seeded=await page.evaluate(()=>{
    const iso=(n)=>{const d=new Date();d.setDate(d.getDate()-n);
      const m=d.getMonth()+1,dd=d.getDate();
      return d.getFullYear()+'-'+(m<10?'0':'')+m+'-'+(dd<10?'0':'')+dd;};
    const at=(n,h)=>{const d=new Date();d.setDate(d.getDate()-n);d.setHours(h||9,0,0,0);return d.getTime();};
    glpNormalize();
    state.glp.settings.enabled=true;
    state.glp.compound={name:'Tirzepatide',dose:'5',unit:'mg',cadenceDays:7};
    state.glp.doses=[
      {id:'d1',dose:5,unit:'mg',siteId:'l_abdomen',takenAt:at(0),note:'',skipped:false},
      {id:'d2',dose:5,unit:'mg',siteId:'r_abdomen',takenAt:at(7),note:'',skipped:false},
      {id:'d3',dose:5,unit:'mg',siteId:null,takenAt:at(14),note:'',skipped:true},
      {id:'d4',dose:2.5,unit:'mg',siteId:'l_thigh',takenAt:at(21),note:'',skipped:false}];
    /* weight history so the chart renders */
    state.weights=[];
    for(let n=27;n>=0;n--)state.weights.push({date:iso(n),weight:200-n*0.2});
    save();
    return {today:iso(0),twoWeeks:iso(14)};});

  /* ---- 1. the Activity card ---- */
  {
    const s=await page.evaluate((iso)=>{
      state.selDate=iso;state.view='overview';render();
      const card=[...document.querySelectorAll('.wl-card')].find(c=>/^\s*Activity/.test(c.textContent));
      return {text:card?card.textContent:'',
        chips:[...document.querySelectorAll('.wl-achip-ro.glp')].map(c=>c.textContent.trim())};},seeded.today);
    test('a dose logged today appears on the Activity card',()=>{
      ok(s.chips.length,'no dose chip: '+s.text.slice(0,120));
      ok(/Dose 5 mg/.test(s.chips.join('|')),'chip text: '+s.chips.join('|'));});
    test('the card no longer claims "No activity logged" when a dose exists',()=>
      eq(/No activity logged/.test(s.text),false,s.text.slice(0,120)));

    const t=await page.evaluate((iso)=>{
      state.selDate=iso;render();
      return {chips:[...document.querySelectorAll('.wl-achip-ro.glp')].map(c=>c.textContent.trim()),
        skippedClass:!!document.querySelector('.wl-achip-ro.glp.skipped')};},seeded.twoWeeks);
    test('a SKIPPED dose reads as skipped, not as a dose taken',()=>{
      ok(/skipped/i.test(t.chips.join('|')),'chip text: '+t.chips.join('|'));
      ok(t.skippedClass,'no skipped styling');});

    const u=await page.evaluate(()=>{
      const iso=(n)=>{const d=new Date();d.setDate(d.getDate()-n);
        const m=d.getMonth()+1,dd=d.getDate();
        return d.getFullYear()+'-'+(m<10?'0':'')+m+'-'+(dd<10?'0':'')+dd;};
      state.selDate=iso(3);render();     /* a day with no dose */
      return {chips:document.querySelectorAll('.wl-achip-ro.glp').length};});
    test('a day with no dose shows no dose chip',()=>eq(u.chips,0));
  }

  /* ---- 2. yellow markers on the WEIGHT chart ---- */
  {
    const s=await page.evaluate(()=>{
      state.view='weight';state.bcTab='weight';state.t2Mode='M';state.t2Off=0;render();
      const bc=[...document.querySelectorAll('.wl-card')].find(c=>/Body composition/.test(c.textContent));
      const svg=bc?bc.querySelector('.wl-chart'):null;
      const html=svg?svg.outerHTML:'';
      const doseLines=(html.match(/stroke="#F5B544"/g)||[]).length;
      const dashed=(html.match(/stroke="#F5B544"[^>]*stroke-dasharray/g)||[]).length;
      return {hasChart:!!svg,doseLines,dashed};});
    test('the weight chart draws a yellow line on each dose day in view',()=>{
      ok(s.hasChart,'no chart rendered');
      ok(s.doseLines>=3,'dose markers drawn: '+s.doseLines);});
    test('a skipped dose is drawn dashed, distinct from a dose taken',()=>
      eq(s.dashed,1,'dashed markers: '+s.dashed));

    const t=await page.evaluate(()=>{
      state.bcTab='bodyfat';render();
      const bc=[...document.querySelectorAll('.wl-card')].find(c=>/Body composition/.test(c.textContent));
      const svg=bc?bc.querySelector('.wl-chart'):null;
      return {marks:svg?(svg.outerHTML.match(/stroke="#F5B544"/g)||[]).length:0,hadChart:!!svg};});
    test('other measures stay uncluttered — markers are weight-only',()=>eq(t.marks,0));

    const u=await page.evaluate(()=>{
      state.bcTab='weight';state.glp.doses=[];save();render();
      const bc=[...document.querySelectorAll('.wl-card')].find(c=>/Body composition/.test(c.textContent));
      const svg=bc?bc.querySelector('.wl-chart'):null;
      return {marks:svg?(svg.outerHTML.match(/stroke="#F5B544"/g)||[]).length:-1,hasChart:!!svg};});
    test('no doses logged = no markers, and the chart still renders',()=>{
      ok(u.hasChart,'chart disappeared without doses');eq(u.marks,0);});
  }

  test('no page errors',()=>eq(errs.length,0,errs.join(';')));

  await ctx.close();await browser.close();server.close();
  console.log(failures.length?`FAILED — ${passed} passed, ${failures.length} failed`:`OK — ${passed} passed`);
  process.exit(failures.length?1:0);
})().catch(e=>{console.error('SUITE ERROR',e);process.exit(2);});
