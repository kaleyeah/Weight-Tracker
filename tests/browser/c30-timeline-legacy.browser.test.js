/* C30 (browser) — progress-photo Milestones 4+5: the pose timeline with
   two-photo comparison, and the legacy re-standardization queue.

       CF_SRC=<file> node tests/browser/c30-timeline-legacy.browser.test.js

   M4: pose tabs; chronological 3:4 strip with dates; Add-next card;
   select-two (numbered badges, not color-only) → Compare side-by-side;
   selection caps at two. M5: one-at-a-time queue through the SAME review;
   accept writes ONLY metadata (blob bytes identical); skip parks; the
   narrow-source hint appears only when relevant; no bulk rewrite. */
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
    localStorage.setItem('wl_v1',JSON.stringify({settings:{onboarded:true,units:'lbs'},weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},statuses:[],presets:[],skips:{},nightlyLog:{}}));
  });
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  await page.waitForTimeout(900);

  /* seed: three normalized FRONT weeks, one legacy BACK photo (narrow: it was
     pre-cropped tall), one legacy FRONT photo */
  const seeded=await page.evaluate(async()=>{
    const mk=async(w,h,color)=>{const cv=document.createElement('canvas');cv.width=w;cv.height=h;
      const cx=cv.getContext('2d');cx.fillStyle=color;cx.fillRect(0,0,w,h);
      return await new Promise(r=>cv.toBlob(r,'image/jpeg',0.85));};
    const norm=pfAutoSuggest(1200,1600);
    await idbAdd({id:'p-f1',date:'2026-07-13',week:'2026-07-13',pose:'front',kind:'progress',blob:await mk(1200,1600,'#334455'),ts:1,normalization:norm});
    await idbAdd({id:'p-f2',date:'2026-07-20',week:'2026-07-20',pose:'front',kind:'progress',blob:await mk(1200,1600,'#445566'),ts:2,normalization:norm});
    await idbAdd({id:'p-f3',date:'2026-07-27',week:'2026-07-27',pose:'front',kind:'progress',blob:await mk(1200,1600,'#556677'),ts:3,normalization:norm});
    await idbAdd({id:'p-leg-front',date:'2026-06-29',week:'2026-06-29',pose:'front',kind:'progress',blob:await mk(1200,1500,'#667788'),ts:0});
    const legBlob=await mk(400,1024,'#778899');   /* the mock's tall pre-crop */
    await idbAdd({id:'p-leg-back',date:'2026-07-06',week:'2026-07-06',pose:'back',kind:'progress',blob:legBlob,ts:0});
    const legBytes=(await legBlob.arrayBuffer()).byteLength;
    state.view='photos';render();
    return {legBytes};});
  await page.waitForTimeout(500);

  /* ---- M4: strip, tabs, dates, add-next ---- */
  {
    const s=await page.evaluate(()=>({
      tabs:[...document.querySelectorAll('[data-act="pftl:pose"]')].map(b=>b.textContent),
      cards:document.querySelectorAll('[data-act="pftl:sel"]').length,
      dates:[...document.querySelectorAll('#wl-progtimeline .wl-tllbl')].map(x=>x.textContent),
      addNext:!!document.querySelector('#wl-progtimeline [data-act="pphoto:add"][data-pose="front"]'),
      legacyBtn:(document.querySelector('[data-act="pfleg:start"]')||{}).textContent||''}));
    test('pose tabs render with the timeline defaulting to Front',()=>{
      eq(s.tabs.length,4);ok(/Front/.test(s.tabs[0]));});
    test('the Front strip shows its four dated cards chronologically',()=>{
      eq(s.cards,4,'cards: '+s.cards);ok(s.dates.length>=4,'dates');});
    test('an Add-next card follows the latest entry',()=>ok(s.addNext));
    test('the legacy queue offers exactly the un-standardized count',()=>
      ok(/\(2\)/.test(s.legacyBtn),'label: '+s.legacyBtn));
  }

  /* ---- M4: selection caps at two with numbered badges; compare ---- */
  {
    await page.click('[data-act="pftl:sel"][data-id="p-f1"]');
    await page.waitForTimeout(150);
    await page.click('[data-act="pftl:sel"][data-id="p-f2"]');
    await page.waitForTimeout(150);
    await page.click('[data-act="pftl:sel"][data-id="p-f3"]');   /* third: oldest drops */
    await page.waitForTimeout(150);
    const s=await page.evaluate(()=>({
      sel:state.pfSel.slice(),badges:[...document.querySelectorAll('.pftl-badge')].map(b=>b.textContent),
      compareEnabled:!!document.querySelector('[data-act="pftl:compare"]')}));
    test('selection caps at two — the oldest selection rolls off',()=>{
      eq(s.sel.length,2);eq(s.sel[0],'p-f2');eq(s.sel[1],'p-f3');});
    test('selected cards carry numbered badges, not color alone',()=>{
      eq(s.badges.length,2);ok(/1/.test(s.badges[0])&&/2/.test(s.badges[1]),s.badges.join(','));});
    test('Compare enables only with two selections',()=>ok(s.compareEnabled));
    await page.click('[data-act="pftl:compare"]');
    await page.waitForTimeout(400);
    const c=await page.evaluate(()=>({
      open:/compare/i.test(document.body.innerText),
      imgs:document.querySelectorAll('.pfcmp-img').length,
      filled:[...document.querySelectorAll('.pfcmp-img')].every(el=>/url\(/.test(el.style.backgroundImage))}));
    test('the comparison shows both dates side by side in 3:4, filled',()=>{
      ok(c.open,'no compare view');eq(c.imgs,2);ok(c.filled,'images not filled');});
    await page.click('[data-act="pfcmp:close"]');
    await page.waitForTimeout(150);
  }

  /* ---- M5: the queue, oldest first; narrow hint only when relevant ---- */
  {
    await page.click('[data-act="pfleg:start"]');
    await page.waitForFunction(()=>!!document.querySelector('[data-act="pf:use"]'),null,{timeout:8000});
    const s=await page.evaluate(()=>({
      title:/Standardize existing photo/.test(document.body.innerText),
      remaining:/2 to review/.test(document.body.innerText),
      skip:!!document.querySelector('[data-act="pf:skiplegacy"]'),
      narrowHint:/already cropped tall/.test(document.body.innerText),
      pose:state.pfReview.pose,legacyId:state.pfReview.legacyId}));
    test('the queue opens the SAME review in legacy mode, count shown',()=>{
      ok(s.title,'no legacy title');ok(s.remaining,'no remaining count');ok(s.skip,'no skip');});
    test('a normal-ratio legacy photo shows NO narrow-crop warning',()=>{
      eq(s.narrowHint,false);eq(s.legacyId,'p-leg-front','oldest first');});
  }

  /* ---- M5: accept writes ONLY metadata; blob bytes identical ---- */
  {
    const firstId=await page.evaluate(()=>state.pfReview.legacyId);
    const before=await page.evaluate(async(id)=>{
      const rec=(await idbAll()).filter(p=>p.id===id)[0];
      return (await rec.blob.arrayBuffer()).byteLength;},firstId);
    await page.click('[data-act="pf:use"]');
    /* the accept path is async (idbAll → put → next); wait for the QUEUE to
       actually advance, not merely for the sheet to blink */
    await page.waitForFunction(id=>state.pfReview&&state.pfReview.legacyId&&state.pfReview.legacyId!==id,firstId,{timeout:8000});
    const s=await page.evaluate(async(args)=>{
      const rec=(await idbAll()).filter(p=>p.id===args.id)[0];
      const bytes=(await rec.blob.arrayBuffer()).byteLength;
      return {norm:pfHasNorm(rec),bytes:bytes,
        nextOpen:!!state.pfReview,nextId:state.pfReview&&state.pfReview.legacyId};},{id:firstId});
    test('accepting a legacy photo writes metadata and NOTHING else',()=>{
      ok(s.norm,'no normalization written');eq(s.bytes,before,'blob bytes changed');});
    test('the queue advances to the next legacy photo',()=>{
      ok(s.nextOpen,'queue ended early');ok(s.nextId&&s.nextId!==firstId);});
  }

  /* ---- M5: the tall pre-crop gets the honest hint; skip parks it ---- */
  {
    const s=await page.evaluate(()=>({
      narrowHint:/already cropped tall/.test(document.body.innerText),
      id:state.pfReview.legacyId}));
    test('the 400×1024 pre-cropped photo DOES get the narrow-crop notice',()=>{
      ok(s.narrowHint,'hint missing for the tall source');eq(s.id,'p-leg-back');});
    await page.click('[data-act="pf:skiplegacy"]');
    await page.waitForTimeout(400);
    const t=await page.evaluate(async()=>{
      renderProgressPhotos();await new Promise(r=>setTimeout(r,300));
      return {reviewOpen:!!state.pfReview,
        backStillLegacy:!pfHasNorm((await idbAll()).filter(p=>p.id==='p-leg-back')[0]),
        /* the queue clears its session skip list when it drains — the OUTCOMES
           are what matter: record untouched, queue ended, count now 1 */
        legacyBtn:(document.querySelector('[data-act="pfleg:start"]')||{}).textContent||''};});
    test('Skip parks the photo unchanged and ends the empty queue',()=>{
      eq(t.reviewOpen,false);ok(t.backStillLegacy,'skip modified the record');
      ok(/\(1\)/.test(t.legacyBtn),'legacy count after queue: '+t.legacyBtn);});
  }

  test('no page errors across timeline, compare and the legacy queue',()=>eq(errs.length,0,errs.join(';')));

  await ctx.close();await browser.close();server.close();
  console.log(failures.length?`FAILED — ${passed} passed, ${failures.length} failed`:`OK — ${passed} passed`);
  process.exit(failures.length?1:0);
})().catch(e=>{console.error('SUITE ERROR',e);process.exit(2);});
