/* C29 (browser) — progress-photo Milestone 3: the guided four-pose camera,
   real Chromium with a FAKE camera device (--use-fake-device-for-media-stream
   provides a synthetic video feed; --use-fake-ui-for-media-stream grants the
   permission without a prompt).

       CF_SRC=<file> node tests/browser/c29-guided-camera.browser.test.js

   M3 gate evidence: explicit chooser before any permission ask; one stream
   for the whole session; guides + ghost overlay (default on, 48%, 10–75
   slider remembered locally, never composited into the capture); shutter →
   the SAME M2 review; accept saves and advances the pose sequence; retake
   returns to the live camera; close/denial paths stop every track and fall
   back to upload. The REAL-DEVICE iPhone PWA test remains the Owner's part
   of the definition of done. */
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
  const browser=await chromium.launch({args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
  const ctx=await browser.newContext({viewport:{width:390,height:844},permissions:['camera']});
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

  /* seed TWO front photos: an older BROWN one (pinned as the reference) and a
     newer GREEN one — the ghost must honor the pin, not recency */
  await page.evaluate(async()=>{
    const mk=async(color)=>{const cv=document.createElement('canvas');cv.width=900;cv.height=1200;
      const cx=cv.getContext('2d');cx.fillStyle=color;cx.fillRect(0,0,900,1200);
      return await new Promise(r=>cv.toBlob(r,'image/jpeg',0.85));};
    await idbAdd({id:'prog-prev-front',date:'2026-07-27',week:'2026-07-27',pose:'front',kind:'progress',blob:await mk('#884400'),ts:Date.now()-6e8});
    await idbAdd({id:'prog-new-front',date:'2026-08-03',week:'2026-08-03',pose:'front',kind:'progress',blob:await mk('#00aa44'),ts:Date.now()-1e6});
    localStorage.setItem('wl_pf_refs',JSON.stringify({front:'prog-prev-front'}));
    state.view='photos';render();});
  await page.waitForTimeout(400);

  /* ---- the chooser precedes any camera permission ---- */
  {
    await page.click('[data-act="pphoto:add"][data-pose="front"]');
    await page.waitForTimeout(150);
    const s=await page.evaluate(()=>({
      chooser:!!document.querySelector('[data-act="pfsrc:cam"]'),
      upload:!!document.querySelector('[data-act="pfsrc:upload"]'),
      cam:!!document.getElementById('pf-cam')}));
    test('an empty slot offers Take guided photo AND Upload existing',()=>{
      ok(s.chooser,'no camera option');ok(s.upload,'no upload option');});
    test('no camera exists before the explicit choice',()=>eq(s.cam,false));
  }

  /* ---- the session opens: live video, guides, ghost overlay ---- */
  {
    await page.click('[data-act="pfsrc:cam"]');
    await page.waitForFunction(()=>{const v=document.getElementById('pfcam-video');
      return !!v&&v.videoWidth>0;},null,{timeout:10000});
    await page.waitForTimeout(300);
    const s=await page.evaluate(()=>({
      pose:pfCam.pose,order:pfCam.order.join(','),
      live:pfCam.stream.getTracks().every(t=>t.readyState==='live'),
      guides:document.querySelectorAll('.pfcam-guides line').length,
      tabs:document.querySelectorAll('.pfcam-tabs button').length,
      ghostShown:(()=>{const g=document.getElementById('pfcam-prev');
        return !!g&&g.style.display!=='none'&&!!g.src;})(),
      ghostOpacity:parseFloat((document.getElementById('pfcam-prev')||{}).style.opacity||'0'),
      slider:(document.querySelector('[data-pfov]')||{}).value}));
    test('the session starts on Front with all four pose tabs',()=>{
      eq(s.pose,'front');eq(s.order,'front,left,right,back');eq(s.tabs,4);});
    test('one live stream, head/foot/center guides drawn',()=>{
      ok(s.live,'tracks not live');eq(s.guides,3,'guide lines');});
    test('the previous same-pose photo ghosts at the default 48%',()=>{
      ok(s.ghostShown,'no ghost');eq(Math.round(s.ghostOpacity*100),48);eq(String(s.slider),'48');});
    const gh=await page.evaluate(async()=>{
      const g=document.getElementById('pfcam-prev');
      const px=await new Promise(res=>{const im=new Image();im.onload=()=>{
        const c2=document.createElement('canvas');c2.width=im.width;c2.height=im.height;
        const x2=c2.getContext('2d');x2.drawImage(im,0,0);
        res(Array.from(x2.getImageData(Math.round(im.width/2),Math.round(im.height/2),1,1).data.slice(0,3)));};
        im.onerror=()=>res(null);im.src=g.src;});
      return {px:px,label:(document.getElementById('pfcam-ghostsrc')||{}).textContent||''};});
    test('PINNED reference wins over recency — the ghost is the older photo',()=>{
      ok(gh.px&&gh.px[0]>90&&gh.px[1]<90,'ghost center px: '+JSON.stringify(gh.px)+' (expected brown, not green)');});
    test('the camera says which ghost it is using',()=>
      ok(/Ghost: pinned/.test(gh.label),'label: '+gh.label));
  }

  /* ---- pin durability + honest fallback (Owner report 2026-08-06: pins
     resolved against a re-keyed id failed SILENTLY, and the "latest" fallback
     trusted ts — which server-adopted records carry as a string — handing the
     ghost the OLDEST photo) ---- */
  {
    const readGhost=async()=>await page.evaluate(async()=>{
      const g=document.getElementById('pfcam-prev');
      const px=await new Promise(res=>{const im=new Image();im.onload=()=>{
        const c2=document.createElement('canvas');c2.width=im.width;c2.height=im.height;
        const x2=c2.getContext('2d');x2.drawImage(im,0,0);
        res(Array.from(x2.getImageData(Math.round(im.width/2),Math.round(im.height/2),1,1).data.slice(0,3)));};
        im.onerror=()=>res(null);im.src=g.src;});
      return {px:px,label:(document.getElementById('pfcam-ghostsrc')||{}).textContent||''};});
    /* A: the pinned id is GONE but the pin carries its week — resolve by week */
    await page.evaluate(()=>{localStorage.setItem('wl_pf_refs',
      JSON.stringify({front:{id:'rekeyed-away',week:'2026-07-27'}}));pfCamPrev();});
    await page.waitForTimeout(400);
    const a=await readGhost();
    test('a re-keyed pin still resolves by its week — ghost stays the pinned photo',()=>{
      ok(/Ghost: pinned/.test(a.label),'label: '+a.label);
      ok(a.px&&a.px[0]>90&&a.px[1]<90,'expected the brown Jul 27 photo: '+JSON.stringify(a.px));});
    /* B: the pin points at nothing — the ghost SAYS so instead of silently falling back */
    await page.evaluate(()=>{localStorage.setItem('wl_pf_refs',
      JSON.stringify({front:{id:'gone',week:'2099-01-01'}}));pfCamPrev();});
    await page.waitForTimeout(400);
    const b=await readGhost();
    test('an unresolvable pin is ANNOUNCED, not silent',()=>
      ok(/pinned photo unavailable/.test(b.label),'label: '+b.label));
    /* C: no pin + string ts on every record (server-adopted shape) — the
       fallback must pick the newest WEEK, not storage order */
    await page.evaluate(async()=>{
      const mk=async(color)=>{const cv=document.createElement('canvas');cv.width=900;cv.height=1200;
        const cx=cv.getContext('2d');cx.fillStyle=color;cx.fillRect(0,0,900,1200);
        return await new Promise(r=>cv.toBlob(r,'image/jpeg',0.85));};
      /* EVERY record with string ts (an all-adopted device); the oldest id
         sorts FIRST in IndexedDB — the old code's mine[0] */
      const brown=await idbGetLocal('prog-prev-front'),green=await idbGetLocal('prog-new-front');
      await idbDelete('prog-prev-front');await idbDelete('prog-new-front');
      await idbAdd({id:'prog-a-oldest-front',date:'2026-07-20',week:'2026-07-20',pose:'front',kind:'progress',blob:await mk('#2233CC'),ts:''});
      await idbAdd(Object.assign({},brown,{ts:''}));
      await idbAdd(Object.assign({},green,{ts:''}));
      localStorage.removeItem('wl_pf_refs');pfCamPrev();});
    await page.waitForTimeout(400);
    const c3=await readGhost();
    test('with string ts everywhere, the fallback is the newest week — never the oldest record',()=>{
      ok(/last photo/.test(c3.label)&&/Aug 3/.test(c3.label),'label: '+c3.label);
      ok(c3.px&&c3.px[1]>90&&c3.px[2]<90,'expected the green Aug 3 photo, got: '+JSON.stringify(c3.px));});
    /* restore the original pin for the arms below */
    await page.evaluate(async()=>{await idbDelete('prog-a-oldest-front');
      localStorage.setItem('wl_pf_refs',JSON.stringify({front:'prog-prev-front'}));pfCamPrev();});
    await page.waitForTimeout(400);
  }

  /* ---- overlay strength: live, clamped 10–75, remembered locally ---- */
  {
    await page.evaluate(()=>{const sl=document.querySelector('[data-pfov]');
      sl.value='65';sl.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.waitForTimeout(100);
    const s=await page.evaluate(()=>({
      op:parseFloat(document.getElementById('pfcam-prev').style.opacity),
      lbl:(document.getElementById('pfcam-ovval')||{}).textContent,
      stored:JSON.parse(localStorage.getItem('wl_pf_overlay')||'{}').strength}));
    test('the strength slider updates the ghost live with its numeric value',()=>{
      eq(Math.round(s.op*100),65);eq(s.lbl,'65%');});
    test('the strength is remembered locally on this device',()=>eq(s.stored,65));
  }

  /* ---- shutter → the SAME M2 review; the ghost is NOT in the capture ---- */
  {
    await page.click('[data-act="pfcam:shot"]');
    await page.waitForFunction(()=>!!document.querySelector('[data-act="pf:use"]'),null,{timeout:10000});
    const s=await page.evaluate(async()=>{
      const r=state.pfReview;
      /* the seeded ghost is solid #884400 brown; the fake device's feed is
         not — sample the captured blob's center pixel */
      const du=await blobToDataURL(r.blob);
      const px=await new Promise(res=>{const im=new Image();im.onload=()=>{
        const c2=document.createElement('canvas');c2.width=im.width;c2.height=im.height;
        const x2=c2.getContext('2d');x2.drawImage(im,0,0);
        res(Array.from(x2.getImageData(Math.round(im.width/2),Math.round(im.height/2),1,1).data.slice(0,3)));};
        im.src=du;});
      return {sheet:/Standardize this photo/.test(document.body.innerText),
        fromCam:!!r.fromCam,pose:r.pose,
        camStillOpen:!!document.getElementById('pf-cam'),
        streamLive:pfCam.stream.getTracks().every(t=>t.readyState==='live'),
        centerPx:px,retakeLabel:/Retake/.test((document.querySelector('[data-act="pf:choose"]')||{}).textContent||'')};});
    test('the shutter feeds the SAME standardization review',()=>{
      ok(s.sheet,'no review');ok(s.fromCam);eq(s.pose,'front');});
    test('the stream stays alive beneath the review (one grant, one session)',()=>{
      ok(s.camStillOpen,'camera closed');ok(s.streamLive,'tracks stopped');});
    test('the ghost overlay is NOT composited into the capture',()=>{
      const [r,g,b]=s.centerPx;
      ok(!(r>100&&r<170&&g>40&&g<100&&b<40),'capture center matches the ghost color: '+s.centerPx);});
    test('the review offers Retake for a camera capture',()=>ok(s.retakeLabel));
  }

  /* ---- Retake returns to the live camera on the same pose ---- */
  {
    await page.click('[data-act="pf:choose"]');
    await page.waitForTimeout(200);
    const s=await page.evaluate(()=>({review:!!document.querySelector('[data-act="pf:use"]'),
      cam:!!document.getElementById('pf-cam'),pose:pfCam&&pfCam.pose}));
    test('Retake closes the review and stays on the same pose, camera live',()=>{
      eq(s.review,false);ok(s.cam);eq(s.pose,'front');});
  }

  /* ---- accept saves and the session advances to the next pose ---- */
  {
    await page.click('[data-act="pfcam:shot"]');
    await page.waitForFunction(()=>!!document.querySelector('[data-act="pf:use"]'),null,{timeout:10000});
    await page.click('[data-act="pf:use"]');
    await page.waitForTimeout(700);
    const s=await page.evaluate(async()=>({
      pose:pfCam&&pfCam.pose,done:pfCam&&!!pfCam.shots.front,
      saved:(await idbAll()).filter(p=>p.kind==='progress'&&p.pose==='front'&&pfHasNorm(p)).length}));
    test('accepting saves the pose with normalization and advances to Left',()=>{
      eq(s.pose,'left');ok(s.done,'front not marked done');ok(s.saved>=1,'no normalized front record');});
  }

  /* ---- closing stops every track ---- */
  {
    const s=await page.evaluate(async()=>{
      const tracks=pfCam.stream.getTracks();
      document.querySelector('[data-act="pfcam:close"]').click();
      await new Promise(r=>setTimeout(r,200));
      return {gone:!document.getElementById('pf-cam'),
        stopped:tracks.every(t=>t.readyState==='ended'),camNull:pfCam===null};});
    test('Close removes the session and stops every camera track',()=>{
      ok(s.gone,'overlay still present');ok(s.stopped,'tracks still live');ok(s.camNull);});
  }

  /* ---- denial falls back to the upload path ---- */
  {
    const s=await page.evaluate(async()=>{
      const orig=navigator.mediaDevices.getUserMedia;
      navigator.mediaDevices.getUserMedia=function(){return Promise.reject(new DOMException('denied','NotAllowedError'));};
      let pickerClicked=false;
      const inp=document.getElementById('wl-photo-input');
      const oClick=inp.click;inp.click=function(){pickerClicked=true;};
      pfCamOpen('back','2026-08-03',null);
      await new Promise(r=>setTimeout(r,300));
      const out={cam:!!document.getElementById('pf-cam'),pickerClicked:pickerClicked,
        pendingPose:state.pendingPose};
      navigator.mediaDevices.getUserMedia=orig;inp.click=oClick;state.pendingPose=null;
      return out;});
    test('permission denial opens the upload fallback, no dead end',()=>{
      eq(s.cam,false,'camera UI appeared');ok(s.pickerClicked,'picker not offered');
      eq(s.pendingPose,'back');});
  }

  test('no page errors across the whole session',()=>eq(errs.length,0,errs.join(';')));

  await ctx.close();await browser.close();server.close();
  console.log(failures.length?`FAILED — ${passed} passed, ${failures.length} failed`:`OK — ${passed} passed`);
  process.exit(failures.length?1:0);
})().catch(e=>{console.error('SUITE ERROR',e);process.exit(2);});
