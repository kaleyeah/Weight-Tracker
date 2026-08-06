/* C28 (browser) — progress-photo Milestone 2: the upload standardization
   review, real Chromium, driven through the REAL file-picker flow (pose-slot
   click → file chooser → review sheet → explicit accept).

       CF_SRC=<file> node tests/browser/c28-photo-review.browser.test.js

   M2 gate evidence: uploads route through the automatic suggestion; original
   vs standardized review; manual adjustment; save writes metadata + source
   safely (source untouched, normalization valid); cancel saves nothing;
   authority loss during the review pause refuses the save; backup v2
   round-trips normalization and v1 imports still work. */
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

  /* fixture PNG (1200×2000 quadrants) generated in-page, handed to the chooser */
  const fixB64=await page.evaluate(async()=>{
    const cv=document.createElement('canvas');cv.width=1200;cv.height=2000;
    const cx=cv.getContext('2d');
    cx.fillStyle='#ff0000';cx.fillRect(0,0,600,1000);
    cx.fillStyle='#00ff00';cx.fillRect(600,0,600,1000);
    cx.fillStyle='#0000ff';cx.fillRect(0,1000,600,1000);
    cx.fillStyle='#ffff00';cx.fillRect(600,1000,600,1000);
    return cv.toDataURL('image/png').split(',')[1];});
  const fixture={name:'progress.png',mimeType:'image/png',buffer:Buffer.from(fixB64,'base64')};
  const openReview=async(pose)=>{
    pose=pose||'front';
    await page.evaluate(()=>{state.view='photos';render();});
    await page.waitForTimeout(150);
    /* the slot click's real job is the gate + setting pendingPose; the gate
       is already pinned by c19's inventory, and headless Chromium does not
       surface a chooser for the hidden input's programmatic click — so the
       slot is clicked when it exists (empty slot) and the pose intent is
       then set the way the slot handler sets it; the REAL change listener
       is driven by setInputFiles either way. */
    const slot='[data-act="pphoto:add"][data-pose="'+pose+'"]';
    if(await page.evaluate(sel=>!!document.querySelector(sel),slot)){
      await page.click(slot);
      /* M3: the slot now opens the take-or-upload chooser first */
      await page.click('[data-act="pfsrc:upload"]');
    }
    await page.evaluate(p2=>{state.pendingPose=p2;state.pendingProgWeek=null;},pose);
    await page.setInputFiles('#wl-photo-input',fixture);
    await page.waitForFunction(()=>!!document.querySelector('[data-act="pf:use"]'),null,{timeout:8000});
    await page.waitForFunction(()=>!!document.querySelector('#wl-pfrev-std img'),null,{timeout:8000});
  };

  /* ---- the review appears; nothing saved until accept ---- */
  await openReview();
  {
    const s=await page.evaluate(async()=>({
      sheet:/Standardize this photo/.test(document.body.innerText),
      original:!!document.querySelector('.wl-pfrev-src'),
      originalLoaded:await new Promise(res=>{const im=document.querySelector('.wl-pfrev-src');
        if(!im)return res(false);if(im.complete)return res(im.naturalWidth>0);
        im.onload=()=>res(im.naturalWidth>0);im.onerror=()=>res(false);setTimeout(()=>res(im.naturalWidth>0),2500);}),
      std:!!document.querySelector('#wl-pfrev-std img'),
      sliders:document.querySelectorAll('[data-pfadj]').length,
      saved:(await idbAll()).filter(p=>p.kind==='progress').length}));
    test('the picker routes into the review sheet, not a direct save',()=>{
      ok(s.sheet,'no sheet');eq(s.saved,0,'saved early');});
    test('original AND standardized previews render side by side',()=>{
      ok(s.original,'no original');ok(s.std,'no standardized');});
    test('the original preview actually DISPLAYS (its URL survives the async pose-card refresh)',()=>
      ok(s.originalLoaded,'original img failed to load — revoked URL'));
    test('all four adjustment controls exist (zoom, pan ×2, level)',()=>eq(s.sliders,4));
  }

  /* ---- cancel saves nothing ---- */
  {
    await page.click('[data-act="pf:cancel"]');
    await page.waitForTimeout(200);
    const s=await page.evaluate(async()=>({
      sheet:!!document.querySelector('[data-act="pf:use"]'),
      saved:(await idbAll()).filter(p=>p.kind==='progress').length}));
    test('Cancel closes the review and saves nothing',()=>{eq(s.sheet,false);eq(s.saved,0);});
  }

  /* ---- adjust, then accept: the record carries a MANUAL normalization ---- */
  await openReview();
  {
    await page.evaluate(()=>{
      const z=document.querySelector('[data-pfadj="zoom"]');
      z.value='1.6';z.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.waitForTimeout(400);
    const mode=await page.evaluate(()=>pfReviewNorm().mode);
    test('adjusting a slider turns the suggestion into a manual transform',()=>eq(mode,'manual'));
    await page.click('[data-act="pf:use"]');
    await page.waitForTimeout(700);
    const s=await page.evaluate(async()=>{
      const recs=(await idbAll()).filter(p=>p.kind==='progress');
      const r=recs[0]||{};
      return {n:recs.length,pose:r.pose,valid:pfHasNorm(r),mode:r.normalization&&r.normalization.mode,
        zoomed:r.normalization&&r.normalization.crop.width<0.9,
        sheet:!!document.querySelector('[data-act="pf:use"]')};});
    test('accepting saves ONE record with a valid manual normalization',()=>{
      eq(s.n,1);eq(s.pose,'front');ok(s.valid,'invalid normalization');
      eq(s.mode,'manual');ok(s.zoomed,'zoom not reflected in the crop');});
    test('the sheet closes after accept',()=>eq(s.sheet,false));
  }

  /* ---- backup round-trips: v2 carries normalization, v1 still imports ---- */
  {
    const s=await page.evaluate(async()=>{
      const out={};
      const rec=(await idbAll()).filter(p=>p.kind==='progress')[0];
      const du=await blobToDataURL(rec.blob);
      const oAsk=window.askConfirm;window.askConfirm=function(m,fn){fn&&fn();};
      /* v2 export shape (same mapping the exporter uses) */
      const v2={app:'compound',kind:'progress-photos',version:2,count:1,
        photos:[{id:'imp-2',week:'2026-07-13',pose:'back',date:'2026-07-13',ts:1,dataUrl:du,normalization:rec.normalization}]};
      importProgressPhotos(JSON.stringify(v2),(typeof m10Capture==='function')?m10Capture():null);
      await new Promise(r=>setTimeout(r,900));
      const back=(await idbAll()).filter(p=>p.pose==='back'&&p.week==='2026-07-13')[0];
      out.v2ok=!!back&&pfHasNorm(back)&&back.normalization.mode===rec.normalization.mode;
      /* v1 (no normalization) must still import cleanly */
      const v1={app:'compound',kind:'progress-photos',version:1,count:1,
        photos:[{id:'imp-1',week:'2026-07-06',pose:'left',date:'2026-07-06',ts:1,dataUrl:du}]};
      importProgressPhotos(JSON.stringify(v1),(typeof m10Capture==='function')?m10Capture():null);
      await new Promise(r=>setTimeout(r,900));
      const left=(await idbAll()).filter(p=>p.pose==='left'&&p.week==='2026-07-06')[0];
      out.v1ok=!!left&&!left.normalization;
      window.askConfirm=oAsk;
      return out;});
    test('a v2 backup restores the photo WITH its normalization',()=>ok(s.v2ok));
    test('a v1 backup (pre-metadata) still imports, as legacy',()=>ok(s.v1ok));
  }

  /* ---- authority lost during the review pause refuses the save ---- */
  await openReview('right');
  {
    const before=await page.evaluate(async()=>(await idbAll()).filter(p=>p.kind==='progress').length);
    await page.evaluate(()=>{M10.gen++;});     /* the capture is now stale */
    await page.click('[data-act="pf:use"]');
    await page.waitForTimeout(500);
    const s=await page.evaluate(async()=>({
      saved:(await idbAll()).filter(p=>p.kind==='progress').length,
      sheet:!!document.querySelector('[data-act="pf:use"]')}));
    test('a stale capture refuses the save and closes the review',()=>{
      eq(s.saved,before,'a record was saved without authority');eq(s.sheet,false);});
  }

  /* ---- IMG_2898 (Owner, 2026-08-06): two same-size reviews in one session
     must each preview THEIR OWN photo. The constant "pf-preview" cache id +
     identical auto-suggest crops collided, and review #2 showed photo #1's
     standardized derivative. Repro: solid RED then solid BLUE, same dims. ---- */
  {
    const s=await page.evaluate(async()=>{
      const mk=(color)=>new Promise(res=>{
        const cv=document.createElement('canvas');cv.width=600;cv.height=800;
        const g=cv.getContext('2d');g.fillStyle=color;g.fillRect(0,0,600,800);
        cv.toBlob(res,'image/jpeg',0.9);});
      const preview=async(blob)=>{
        const base=pfAutoSuggest(600,800);
        state.pfReview={blob:blob,pose:'front',week:'2026-08-02',base:base,
          revId:(typeof pfRevSeq!=='undefined')?++pfRevSeq:undefined,
          adj:{panX:0,panY:0,zoom:1,rot:0},cap:null,srcUrl:''};
        render();pfReviewPreview();
        for(let i=0;i<40;i++){
          const im=document.querySelector('#wl-pfrev-std img');
          if(im&&im.src)return im.src;
          await new Promise(r=>setTimeout(r,50));}
        return null;};
      const px=(src)=>new Promise(res=>{const im=new Image();
        im.onload=()=>{const cv=document.createElement('canvas');cv.width=4;cv.height=4;
          cv.getContext('2d').drawImage(im,0,0,4,4);
          const d=cv.getContext('2d').getImageData(2,2,1,1).data;res([d[0],d[1],d[2]]);};
        im.onerror=()=>res(null);im.src=src;});
      const red=await preview(await mk('#CC2222'));
      pfReviewClose();render();
      const blue=await preview(await mk('#2233CC'));
      pfReviewClose();render();
      const p1=red?await px(red):null,p2=blue?await px(blue):null;
      return {p1:p1,p2:p2};});
    test('the second same-size review previews ITS OWN photo, not the first (IMG_2898)',()=>{
      ok(s.p1&&s.p2,'previews missing: '+JSON.stringify(s));
      ok(s.p1[0]>s.p1[2],'first preview not red: '+s.p1);
      ok(s.p2[2]>s.p2[0],'second preview not blue — stale cache served the first photo: '+s.p2);});
  }

  /* ---- review ghost (Owner, 2026-08-06): the standardize sheet overlays the
     pinned-else-latest same-pose reference — 'the review is where the crop is
     framed; otherwise you have no idea what to select'. Uploads route through
     this same sheet, so this covers them too. ---- */
  {
    const s=await page.evaluate(async()=>{
      const mk=(color)=>new Promise(res=>{
        const cv=document.createElement('canvas');cv.width=600;cv.height=800;
        const g=cv.getContext('2d');g.fillStyle=color;g.fillRect(0,0,600,800);
        cv.toBlob(res,'image/jpeg',0.9);});
      for(const p of (await idbAll()).filter(x=>x.pose==='back'))await idbDelete(p.id);
      await idbAdd({id:'bk-ref',date:'2026-07-27',week:'2026-07-27',pose:'back',kind:'progress',blob:await mk('#00AA44'),ts:1});
      await idbAdd({id:'bk-new',date:'2026-08-03',week:'2026-08-03',pose:'back',kind:'progress',blob:await mk('#AAAA00'),ts:2});
      localStorage.setItem('wl_pf_refs',JSON.stringify({back:{id:'bk-ref',week:'2026-07-27'}}));
      localStorage.setItem('wl_pf_overlay',JSON.stringify({on:true,strength:48}));
      const base=pfAutoSuggest(600,800);
      state.pfReview={blob:await mk('#CC2222'),pose:'back',week:'2026-08-09',base:base,
        revId:(typeof pfRevSeq!=='undefined')?++pfRevSeq:undefined,
        adj:{panX:0,panY:0,zoom:1,rot:0},cap:null,srcUrl:''};
      render();pfReviewPreview();
      for(let i=0;i<40;i++){
        if(document.querySelector('#wl-pfrev-std .wl-pfrev-ghost'))break;
        await new Promise(r=>setTimeout(r,50));}
      const g=document.querySelector('#wl-pfrev-std .wl-pfrev-ghost');
      const px=g?await new Promise(res=>{const im=new Image();im.onload=()=>{
        const cv=document.createElement('canvas');cv.width=4;cv.height=4;
        cv.getContext('2d').drawImage(im,0,0,4,4);
        const d=cv.getContext('2d').getImageData(2,2,1,1).data;res([d[0],d[1],d[2]]);};
        im.onerror=()=>res(null);im.src=g.src;}):null;
      return {ghost:!!g,op:g?g.style.opacity:'',px:px,
        lbl:(document.getElementById('wl-pfrev-ghostlbl')||{}).textContent||''};});
    test('the review overlays the PINNED same-pose reference at the saved strength',()=>{
      ok(s.ghost,'no ghost overlay');eq(s.op,'0.48','opacity: '+s.op);
      ok(/Ghost: pinned/.test(s.lbl),'label: '+s.lbl);
      ok(s.px&&s.px[1]>90&&s.px[0]<90,'ghost is not the pinned GREEN photo: '+JSON.stringify(s.px));});
    const t=await page.evaluate(async()=>{
      document.querySelector('[data-act="pfrev:ghost"]').click();
      await new Promise(r=>setTimeout(r,300));
      return {ghost:!!document.querySelector('#wl-pfrev-std .wl-pfrev-ghost'),
        prefs:JSON.parse(localStorage.getItem('wl_pf_overlay')||'{}')};});
    test('the Ghost toggle hides the overlay and remembers the shared preference',()=>{
      eq(t.ghost,false,'ghost still shown');eq(t.prefs.on,false);});
    const u=await page.evaluate(async()=>{
      const prefs=JSON.parse(localStorage.getItem('wl_pf_overlay')||'{}');prefs.on=true;
      localStorage.setItem('wl_pf_overlay',JSON.stringify(prefs));
      for(const p of (await idbAll()).filter(x=>x.pose==='back'&&x.id!=='bk-ref'))await idbDelete(p.id);
      localStorage.removeItem('wl_pf_refs');
      const rec=(await idbAll()).find(x=>x.id==='bk-ref');
      const base=pfAutoSuggest(600,800);
      pfReviewClose();
      state.pfReview={blob:rec.blob,pose:'back',week:rec.week,base:base,
        revId:(typeof pfRevSeq!=='undefined')?++pfRevSeq:undefined,
        adj:{panX:0,panY:0,zoom:1,rot:0},cap:null,srcUrl:'',legacyId:'bk-ref',legacyLeft:1};
      render();pfReviewPreview();
      await new Promise(r=>setTimeout(r,600));
      return {ghost:!!document.querySelector('#wl-pfrev-std .wl-pfrev-ghost'),
        lbl:(document.getElementById('wl-pfrev-ghostlbl')||{}).textContent||''};});
    test('standardizing a pose\'s ONLY photo never ghosts against itself',()=>{
      eq(u.ghost,false,'self-ghost shown');eq(u.lbl,'','label should be empty: '+u.lbl);});
    await page.evaluate(()=>{pfReviewClose();render();});
  }

  test('no page errors across the whole flow',()=>eq(errs.length,0,errs.join(';')));

  await ctx.close();await browser.close();server.close();
  console.log(failures.length?`FAILED — ${passed} passed, ${failures.length} failed`:`OK — ${passed} passed`);
  process.exit(failures.length?1:0);
})().catch(e=>{console.error('SUITE ERROR',e);process.exit(2);});
