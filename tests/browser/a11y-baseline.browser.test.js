/* Accessibility TOP-LEVEL-VIEW baseline — a reproducible automated
   inspection (round-4 rulings 9/10). Scope stated honestly: this walks boot
   plus the five top-level view renders. It does NOT open sheets,
   confirmations, the lightbox, check-in flows, or error states — those are
   physical-device territory (deployment gates), not covered here.

   CONTRACT (one honest rule, ruling 9): this is a NON-BLOCKING BASELINE
   INVENTORY for a no-behaviour-change refactor. Structural document checks
   (lang, viewport, alt, tabindex, reduced-motion) fail hard because they
   were clean at baseline. Labelling findings are INVENTORIED with their
   exact baseline counts pinned — growth fails the tier, the existing count
   does not. `placeholder` is NOT an accessible name; it is counted
   separately as a visible hint. Remediation milestone: aria-labels in the
   next authorized behaviour-change release (PLATFORM-SUPPORT.md).

       node tests/browser/a11y-baseline.browser.test.js */
const path=require('path'),http=require('http'),fs=require('fs');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const SRC=process.env.CF_SRC||'/home/griffin/projects/compound-app/index.html';

let passed=0;const failures=[];
const test=(n,f)=>{try{f();passed++;console.log('  ✓ '+n);}catch(e){failures.push(n);console.log('  ✗ '+n+'\n      '+(e&&e.message));}};
const ok=(v,m)=>{if(!v)throw new Error(m||'expected truthy');};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error((m||'')+` expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);};

(async()=>{
  const html=fs.readFileSync(SRC,'utf8');
  const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html; charset=utf-8'});r.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch();
  const ctx=await browser.newContext();
  await ctx.addInitScript(()=>{
    localStorage.setItem('wl_pb',JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok',email:'a@x.com'}));
    localStorage.setItem('wl_last_owner','userA');
    localStorage.setItem('wl_v1',JSON.stringify({settings:{onboarded:true,units:'lbs'},
      weights:[{date:'2026-08-01',weight:184.0}],food:{},workouts:{},steps:{},notes:{},sleep:{},
      bodyfat:{},waist:{},statuses:[],presets:[],skips:{},nightlyLog:{}}));
    localStorage.setItem('wl_training_v1',JSON.stringify({cardioTypes:[],exercises:[],routines:[],sessions:{},liftSessions:{}}));});
  await ctx.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],token:'tok',record:{id:'userA'},ok:true,granted:true,fence:1,active:true,holderDeviceId:'d',serverNow:Date.now(),ttlMs:86400000})}));
  const page=await ctx.newPage();
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  await page.waitForFunction(()=>typeof window.render==='function'&&document.querySelector('#app').children.length>0,null,{timeout:15000});

  const scan=async(view)=>page.evaluate((v)=>{
    if(v){state.view=v;window.render();}
    const out={view:v||'(boot)',unnamedButtons:[],noAltImgs:0,unlabelledInputs:0,positiveTabindex:0};
    document.querySelectorAll('button').forEach(b=>{
      const name=(b.textContent||'').trim()||b.getAttribute('aria-label')||b.getAttribute('title');
      if(!name)out.unnamedButtons.push((b.className||'?').slice(0,30));});
    document.querySelectorAll('img').forEach(i=>{if(!i.hasAttribute('alt'))out.noAltImgs++;});
    document.querySelectorAll('input:not([type=hidden]),select,textarea').forEach(i=>{
      /* accessible name mechanisms ONLY — placeholder is a hint, not a name */
      const named=i.getAttribute('aria-label')||(i.id&&document.querySelector('label[for="'+i.id+'"]'))||i.closest('label');
      if(!named){out.unlabelledInputs++;if(i.getAttribute('placeholder'))out.placeholderOnly=(out.placeholderOnly||0)+1;}});
    document.querySelectorAll('[tabindex]').forEach(e=>{if(+e.getAttribute('tabindex')>0)out.positiveTabindex++;});
    return out;},view);

  console.log('\nA11Y baseline');
  const doc=await page.evaluate(()=>({lang:document.documentElement.lang,
    viewport:!!document.querySelector('meta[name=viewport]'),
    reducedMotion:!!Array.from(document.styleSheets).some(s=>{try{return Array.from(s.cssRules).some(r=>r.media&&/prefers-reduced-motion/.test(r.media.mediaText));}catch(e){return false;}})}));
  test('document declares lang',()=>eq(doc.lang,'en'));
  test('viewport meta present',()=>ok(doc.viewport));
  test('prefers-reduced-motion is honoured somewhere in the stylesheet',()=>ok(doc.reducedMotion));

  /* pinned at the recorded top-level-view baseline; update ONLY with a
   documented re-baseline, never to absorb a regression */
/* re-baselined at .460: the 18 were the three hidden file inputs counted
   across six views; they now carry aria-labels. Zero is the new pin. */
const UNNAMED_INPUT_BASELINE=0;
const views=[null,'overview','train','weight','summary','settings'];
  const findings=[];
  for(const v of views)findings.push(await scan(v));
  const totalUnnamed=findings.reduce((a,f)=>a+f.unnamedButtons.length,0);
  const totalNoAlt=findings.reduce((a,f)=>a+f.noAltImgs,0);
  const totalUnlabelled=findings.reduce((a,f)=>a+f.unlabelledInputs,0);
  const totalPosTab=findings.reduce((a,f)=>a+f.positiveTabindex,0);

  test('no image lacks alt across the walked views',()=>eq(totalNoAlt,0));
  test('no positive tabindex anywhere',()=>eq(totalPosTab,0));
  /* INVENTORY PINS — current findings, counted exactly so growth is loud.
     These are the "inventoried findings" of ruling 14; whether any becomes a
     deployment blocker is triaged in PLATFORM-SUPPORT.md. */
  test('icon-only buttons without an accessible name: inventoried and pinned',()=>{
    console.log('      inventory: '+totalUnnamed+' unnamed buttons — '+JSON.stringify(findings.map(f=>({v:f.view,n:f.unnamedButtons.length}))));
    eq(totalUnnamed,0,'unnamed buttons appeared — every button had a name at baseline');});
  const totalPlaceholderOnly=findings.reduce((a,f)=>a+(f.placeholderOnly||0),0);
  test('inputs without an accessible NAME: non-blocking inventory, growth-pinned',()=>{
    console.log('      inventory: '+totalUnlabelled+' unnamed inputs ('+totalPlaceholderOnly+' of them carry a visible placeholder hint, which is not a name)');
    ok(totalUnlabelled<=UNNAMED_INPUT_BASELINE,'inventory grew past the recorded baseline ('+UNNAMED_INPUT_BASELINE+'): '+totalUnlabelled);});

  await browser.close();server.close();
  console.log('\n----------------------------------------------------');
  if(failures.length){console.log('FAILED — '+passed+' passed, '+failures.length+' failed');process.exit(1);}
  console.log('OK — '+passed+' passed');
})().catch(e=>{console.error('SUITE CRASH: '+(e&&e.stack||e));process.exit(1);});
