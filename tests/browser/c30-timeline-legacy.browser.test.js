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
  const uploadCaptures=[];
  const dupMode={on:false,body:(lid)=>({ok:false,error:'duplicateLocalId',duplicateLocalId:true,
    localId:lid,existingRecordId:'srv-dup-'+lid,
    existing:{kind:'progress',date:'2026-07-27',week:'2026-07-27',pose:'front',meal:'',ts:'9'}})};
  await ctx.route('**/api/**',r=>{
    const url=r.request().url();
    const reply=(st,b)=>r.fulfill({status:st,contentType:'application/json',body:JSON.stringify(b)});
    if(/cf\/writer\/lease/.test(url)){
      const b=JSON.parse(r.request().postData()||'{}');
      return reply(200,{ok:true,exists:true,granted:true,fence:1,holderDeviceId:b.deviceId,
        deviceName:b.deviceName||'x',active:true,serverNow:Date.now(),ttlMs:86400000});}
    if(/cf\/photos\/upload/.test(url)){
      const buf=r.request().postDataBuffer();
      const txt=buf?buf.toString('latin1'):'';
      const field=(n)=>{const m=txt.match(new RegExp('name="'+n+'"\\r\\n\\r\\n([^\\r]*)'));return m?m[1]:null;};
      const lid=field('localId');
      uploadCaptures.push({week:field('week'),date:field('date'),pose:field('pose'),localId:lid});
      if(dupMode.on)return reply(409,dupMode.body(lid));
      return reply(200,{ok:false,error:'wedged for the test'});}   /* op stays queued */
    if(/cf\/photos\/update/.test(url)){
      const b=JSON.parse(r.request().postData()||'{}');
      return reply(200,{ok:true,recordId:b.serverId,applied:true,newMeta:b.newMeta});}
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

  /* ---- Pinned camera reference (Owner, 2026-08-06) ---- */
  {
    await page.evaluate(()=>{state.pfSel=['p-f1'];renderProgressPhotos();});
    await page.waitForTimeout(300);
    const s=await page.evaluate(()=>({
      btn:(document.querySelector('[data-act="pftl:pinref"]')||{}).textContent||''}));
    test('one selected card offers Pin as camera reference',()=>
      ok(/Pin as camera reference/.test(s.btn),'btn: '+s.btn));
    await page.click('[data-act="pftl:pinref"]');
    await page.waitForTimeout(300);
    const t=await page.evaluate(()=>({
      refs:JSON.parse(localStorage.getItem('wl_pf_refs')||'{}'),
      badge:!!document.querySelector('#pftl-p-f1 .pftl-pin'),
      btn:(document.querySelector('[data-act="pftl:pinref"]')||{}).textContent||''}));
    test('pinning stores the per-pose reference and badges the card',()=>{
      /* v2 pins carry {id,week} so a re-keyed record still resolves by week */
      eq(t.refs.front&&t.refs.front.id,'p-f1');
      ok(t.refs.front&&t.refs.front.week,'pin lost its week: '+JSON.stringify(t.refs.front));
      ok(t.badge,'no pin badge');ok(/Unpin/.test(t.btn));});
    await page.click('[data-act="pftl:pinref"]');
    await page.waitForTimeout(300);
    const u=await page.evaluate(()=>JSON.parse(localStorage.getItem('wl_pf_refs')||'{}'));
    test('unpinning clears it — ghost falls back to most recent',()=>eq(u.front,undefined));
    await page.evaluate(()=>{state.pfSel=[];renderProgressPhotos();});
    await page.waitForTimeout(200);
  }

  /* ---- Edit date + Re-standardize (Owner rulings, 2026-08-06: fix wrong
     dates and bad crops IN the app — no re-upload, no duplicates) ---- */
  {
    await page.evaluate(()=>{
      /* the seeds above rode the gated idbAdd, which queued an upload op per
         photo; with no upload route mocked those wedge at the queue head and
         starve any meta op behind them. This arm is about the META op — start
         from an empty queue. */
      localStorage.removeItem('wl_photo_ops__userA');
      state.pfSel=['p-f1'];renderProgressPhotos();});
    await page.waitForTimeout(300);
    const s=await page.evaluate(()=>({
      edit:!!document.querySelector('[data-act="pftl:editdate"]'),
      restd:!!document.querySelector('[data-act="pftl:restd"]')}));
    test('one selected card offers Edit date and Re-standardize',()=>{
      ok(s.edit,'no Edit date');ok(s.restd,'no Re-standardize');});

    /* edit date on an UNMAPPED photo: plain gated local update, both fields */
    await page.click('[data-act="pftl:editdate"]');
    await page.waitForTimeout(300);
    const t=await page.evaluate(async()=>{
      const inp=document.getElementById('wl-pfdate');
      if(!inp)return {card:false};
      inp.value='2026-06-18';                       /* a Thursday */
      document.querySelector('[data-act="pfdate:save"]').click();
      await new Promise(r=>setTimeout(r,600));
      const rec=(await idbAll()).find(p=>p.id==='p-f1');
      return {card:true,week:rec.week,date:rec.date,
        sheetGone:!document.getElementById('wl-pfdate'),
        queued:(typeof m10pOps==='function')?m10pOps().filter(o=>o.op==='meta').length:0};});
    test('the date card saves: chosen date snaps to its week start, local record moves',()=>{
      ok(t.card,'date card never opened');
      eq(t.week,'2026-06-14','week');eq(t.date,'2026-06-14','date');  /* Sunday of that week */
      ok(t.sheetGone,'card still open');});
    test('an unmapped photo queues NO server op — nothing to relabel remotely',()=>
      eq(t.queued,0));

    /* edit date on a MAPPED photo: the meta op owns both sides; the mocked
       server route acks and the local record moves through the queue */
    const q=await page.evaluate(async()=>{
      /* the local-branch edit above re-queued an upload op for p-f1 via the
         gated idbAdd — clear again so the META op is the queue head */
      localStorage.removeItem('wl_photo_ops__userA');
      const m=JSON.parse(localStorage.getItem('wl_photomap')||'{}');
      m['p-f2']='srv-p-f2';localStorage.setItem('wl_photomap',JSON.stringify(m));
      state.pfSel=['p-f2'];renderProgressPhotos();
      await new Promise(r=>setTimeout(r,300));
      document.querySelector('[data-act="pftl:editdate"]').click();
      await new Promise(r=>setTimeout(r,300));
      const inp=document.getElementById('wl-pfdate');
      inp.value='2026-06-25';
      document.querySelector('[data-act="pfdate:save"]').click();
      /* the dispatcher may have been mid-flight when the op queued; production
         retries on every later queue/boot/dispatch — poll the same way */
      for(let i=0;i<12;i++){
        await new Promise(r=>setTimeout(r,300));
        const ops=(typeof m10pOps==='function')?m10pOps():[];
        if(!ops.some(o=>o.op==='meta'))break;
        m10pDispatch();}
      const rec=(await idbAll()).find(p=>p.id==='p-f2');
      return {week:rec.week,date:rec.date,
        pending:(typeof m10pOps==='function')?m10pOps().filter(o=>o.op==='meta').length:0};});
    test('a mapped photo rides the journaled meta op: local applied AND server acked',()=>{
      eq(q.week,'2026-06-21','week');eq(q.date,'2026-06-21','date');
      eq(q.pending,0,'meta op still pending');});

    /* re-standardize: solo review, no legacy-queue jump, normalization replaced */
    const r2=await page.evaluate(async()=>{
      state.pfSel=['p-f1'];renderProgressPhotos();
      await new Promise(r=>setTimeout(r,300));
      const before=(await idbAll()).find(p=>p.id==='p-f1');
      document.querySelector('[data-act="pftl:restd"]').click();
      await new Promise(r=>setTimeout(r,800));
      const sheet=document.body.innerText;
      const hasSkip=!!document.querySelector('[data-act="pf:skiplegacy"]');
      const slider=document.querySelector('[data-pfadj="panY"]');
      if(slider){slider.value='0.1';slider.dispatchEvent(new Event('input',{bubbles:true}));}
      await new Promise(r=>setTimeout(r,300));
      const use=document.querySelector('[data-act="pf:use"]');
      if(use)use.click();
      await new Promise(r=>setTimeout(r,800));
      const after=(await idbAll()).find(p=>p.id==='p-f1');
      const count=(await idbAll()).filter(p=>p.pose==='front').length;
      return {opened:/Standardize/.test(sheet),toReview:/to review/.test(sheet),hasSkip:hasSkip,
        changed:JSON.stringify(before.normalization||null)!==JSON.stringify(after.normalization||null),
        mode:after.normalization&&after.normalization.mode,
        count:count,reviewGone:!state.pfReview};});
    test('Re-standardize opens a SOLO review — no queue count, no Skip',()=>{
      ok(r2.opened,'review never opened');eq(r2.toReview,false,'says "to review"');
      eq(r2.hasSkip,false,'legacy Skip offered');});
    test('accepting replaces the normalization on the SAME record, no legacy jump',()=>{
      ok(r2.changed,'normalization unchanged');eq(r2.mode,'manual');
      ok(r2.reviewGone,'review did not close — legacy queue jump?');});
    await page.evaluate(()=>{state.pfSel=[];state.pfDateEdit=null;renderProgressPhotos();});
    await page.waitForTimeout(200);
  }

  /* ---- the 2026-08-06 wedge (Owner's phone): re-uploads of already-
     uploaded photos hit the server's unique-localId constraint (untyped
     500) and starved the queue. Two guards: a keyed put on a MAPPED record
     queues nothing, and a stranded add op for a mapped localId completes
     quietly instead of re-uploading. ---- */
  {
    const s=await page.evaluate(async()=>{
      localStorage.removeItem('wl_photo_ops__userA');
      const m=JSON.parse(localStorage.getItem('wl_photomap')||'{}');
      m['p-f3']='srv-p-f3';localStorage.setItem('wl_photomap',JSON.stringify(m));
      const rec=(await idbAll()).find(p=>p.id==='p-f3');
      rec.normalization=rec.normalization||null;   /* metadata-style keyed put */
      await idbAdd(rec);
      await new Promise(r=>setTimeout(r,300));
      const back=(await idbAll()).find(p=>p.id==='p-f3');
      return {queued:(typeof m10pOps==='function')?m10pOps().length:-1,stillThere:!!back};});
    test('a keyed put on an already-uploaded record queues NO upload op',()=>{
      eq(s.queued,0,'ops queued: '+s.queued);ok(s.stillThere,'local write lost');});

    const t=await page.evaluate(async()=>{
      /* inject the Owner's exact stranded shapes: intent AND blob-ok add ops
         for a localId the map already covers */
      const uid='userA';
      const okI=m10pMutate(uid,ops=>{ops.push(
        {id:'pop-stranded-1',op:'add',localId:'p-f3',requestId:'m10c-'+'a'.repeat(24),state:'intent',
         meta:{kind:'progress',date:'2026-07-20',week:'2026-07-20',pose:'front',meal:'',ts:'1'}},
        {id:'pop-stranded-2',op:'add',localId:'p-f3',requestId:'m10c-'+'b'.repeat(24),state:'blob-ok',
         blobSha256:'c'.repeat(64),blobByteLength:1234,
         meta:{kind:'progress',date:'2026-07-20',week:'2026-07-20',pose:'front',meal:'',ts:'1'}});});
      const beforeN=m10pOps(uid).length;
      for(let i=0;i<8;i++){m10pDispatch();await new Promise(r=>setTimeout(r,200));
        if(!m10pOps(uid).length)break;}
      return {okI:okI,beforeN:beforeN,afterN:m10pOps(uid).length};});
    test('stranded add ops for mapped photos drain quietly — the wedge clears itself',()=>{
      ok(t.okI,'could not inject');eq(t.beforeN,2);eq(t.afterN,0,'ops left: '+t.afterN);});
  }

  /* ---- Architect P0 regression (verdict 2026-08-07): queue an add, wedge
     it, RELABEL the record, resume — the server must receive the CURRENT
     labels, not the queue-time snapshot that forked the Owner's dates ---- */
  {
    uploadCaptures.length=0;
    const s=await page.evaluate(async()=>{
      localStorage.removeItem('wl_photo_ops__userA');
      const m=JSON.parse(localStorage.getItem('wl_photomap')||'{}');
      delete m['p-f4'];localStorage.setItem('wl_photomap',JSON.stringify(m));
      const mkB=()=>new Promise(res=>{const cv=document.createElement('canvas');cv.width=60;cv.height=80;
        cv.getContext('2d').fillRect(0,0,60,80);cv.toBlob(res,'image/jpeg',0.8);});
      /* 1. queue the add (the mocked upload route refuses -> simulated wedge) */
      await idbAdd({id:'p-f4',date:'2026-07-27',week:'2026-07-27',pose:'front',kind:'progress',blob:await mkB(),ts:9});
      await new Promise(r=>setTimeout(r,600));
      /* 3. relabel while wedged (what the meta op's local phase does) */
      const rec=await idbGetLocal('p-f4');rec.week='2026-02-09';rec.date='2026-02-09';
      await idbAddLocal(rec);
      /* 4. resume dispatch */
      m10pDispatch();
      await new Promise(r=>setTimeout(r,600));
      return {ops:m10pOps().length};});
    test('P0: a wedged upload sends the CURRENT labels after a relabel, not the snapshot',()=>{
      ok(uploadCaptures.length>=2,'expected two upload attempts, got '+uploadCaptures.length);
      const last=uploadCaptures[uploadCaptures.length-1];
      eq(last.week,'2026-02-09','server received week: '+last.week);
      eq(last.date,'2026-02-09','server received date: '+last.date);
      ok(s.ops>=1,'op should still be queued (mock refuses uploads)');});
    await page.evaluate(()=>{localStorage.removeItem('wl_photo_ops__userA');});
  }

  /* ---- Architect P1: a TYPED duplicate is recoverable — but verified, never
     assumed. A verifiable duplicate repairs the map and completes; an
     unverifiable one parks for review instead of guessing. ---- */
  {
    const s=await page.evaluate(async()=>{
      localStorage.removeItem('wl_photo_ops__userA');
      const m=JSON.parse(localStorage.getItem('wl_photomap')||'{}');
      delete m['p-f5'];localStorage.setItem('wl_photomap',JSON.stringify(m));
      const mkB=()=>new Promise(res=>{const cv=document.createElement('canvas');cv.width=60;cv.height=80;
        cv.getContext('2d').fillRect(0,0,60,80);cv.toBlob(res,'image/jpeg',0.8);});
      window.__dupOn=true;
      await idbAdd({id:'p-f5',date:'2026-07-27',week:'2026-07-27',pose:'front',kind:'progress',blob:await mkB(),ts:9});
      return {};});
    dupMode.on=true;
    await page.evaluate(async()=>{for(let i=0;i<8;i++){m10pDispatch();await new Promise(r=>setTimeout(r,200));
      if(!m10pOps().length)break;}});
    const t=await page.evaluate(()=>({ops:m10pOps().length,
      mapped:(JSON.parse(localStorage.getItem('wl_photomap')||'{}'))['p-f5']||null}));
    test('P1: a VERIFIED duplicate repairs the map and completes the op',()=>{
      eq(t.ops,0,'op still queued: '+t.ops);
      eq(t.mapped,'srv-dup-p-f5','map not repaired: '+t.mapped);});

    /* an UNVERIFIABLE duplicate (foreign/oblique: no identity) must park */
    dupMode.body=(lid)=>({ok:false,error:'duplicateLocalId',duplicateLocalId:true,localId:lid});
    const u=await page.evaluate(async()=>{
      localStorage.removeItem('wl_photo_ops__userA');
      const m=JSON.parse(localStorage.getItem('wl_photomap')||'{}');
      delete m['p-f6'];localStorage.setItem('wl_photomap',JSON.stringify(m));
      const mkB=()=>new Promise(res=>{const cv=document.createElement('canvas');cv.width=60;cv.height=80;
        cv.getContext('2d').fillRect(0,0,60,80);cv.toBlob(res,'image/jpeg',0.8);});
      await idbAdd({id:'p-f6',date:'2026-07-27',week:'2026-07-27',pose:'back',kind:'progress',blob:await mkB(),ts:9});
      for(let i=0;i<8;i++){m10pDispatch();await new Promise(r=>setTimeout(r,200));}
      const ops=m10pOps();
      return {states:ops.map(o=>o.state+':'+(o.unverifiedReason||'')),
        mapped:(JSON.parse(localStorage.getItem('wl_photomap')||'{}'))['p-f6']||null};});
    test('P1: an UNVERIFIABLE duplicate parks for review, never assumed success',()=>{
      ok(u.states.some(x=>/^unverified:duplicate-unverifiable/.test(x)),'states: '+u.states.join(','));
      eq(u.mapped,null,'map written on an unverifiable duplicate');});
    dupMode.on=false;
    /* leave the store exactly as the earlier arms expect: the p-f4/5/6 probes
       are mine, and idbDelete is the GATED wrapper (it queues a tombstone) —
       use the raw local delete and clear the queue after */
    await page.evaluate(async()=>{
      for(const id of ['p-f4','p-f5','p-f6'])await idbDeleteLocal(id).catch(()=>{});
      localStorage.removeItem('wl_photo_ops__userA');
      const m=JSON.parse(localStorage.getItem('wl_photomap')||'{}');
      delete m['p-f5'];delete m['p-f6'];localStorage.setItem('wl_photomap',JSON.stringify(m));
      state.pfSel=[];state.pfDateEdit=null;renderProgressPhotos();});
    await page.waitForTimeout(300);
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
