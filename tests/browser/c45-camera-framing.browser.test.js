/* C45 (browser) — the viewfinder asks for the right SHAPE, and the shutter
   does not hand him four sliders.

   Owner, 2026-08-11, two complaints in one message:

     "the photo option when taking body pics seems to be set at a zoom. Is
      there a way to use regular iOS camera and still do the ghost?"

     "while we are taking the photo we don't need to move it up and down or
      left and right. That's only for after we go back and edit."

   ON THE ZOOM. The native iOS camera cannot carry the ghost — that is a
   different surface and nothing can be drawn over it — so the fix has to be
   inside our own viewfinder. It was never a zoom control: pfCamShot
   centre-crops the frame to 3:4, and the old constraints asked only for a SIZE
   (1440x1920). A phone that answers with a 16:9 mode (1080x1920) then loses a
   quarter of its height to that crop — precisely the head and the feet, under
   guides labelled "top of head" and "feet". Asking for aspectRatio 3:4 gets the
   sensor's native 4:3 frame instead, which is what the iOS Camera app shows.

   The crop arithmetic below is asserted directly, because it is the thing that
   decides how much of him fits in the picture, and Chromium's fake device will
   not reproduce an iPhone's mode list.

       CF_SRC=<file> node tests/browser/c45-camera-framing.browser.test.js */
const path=require('path'),http=require('http'),fs=require('fs');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const SRC=process.env.CF_SRC||'/home/griffin/projects/compound-app/index.html';
let passed=0;const failures=[];
const test=(n,f)=>{try{f();passed++;console.log('  ✓ '+n);}catch(e){failures.push(n);console.log('  ✗ '+n+'\n      '+(e&&e.message));}};
const ok=(v,m)=>{if(!v)throw new Error(m||'expected truthy');};
const notOk=(v,m)=>{if(v)throw new Error(m||'expected falsy');};
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

  console.log('C45 — camera framing, and no sliders mid-shoot');

  /* ---- 1. the constraints ask for a 3:4 SHAPE, not only a size ---- */
  {
    const asked=await page.evaluate(()=>{
      const seen=[];
      const orig=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia=function(c){seen.push(JSON.parse(JSON.stringify(c)));return orig(c);};
      return pfCamOpen('front','2026-08-10',null),new Promise(r=>setTimeout(()=>{
        navigator.mediaDevices.getUserMedia=orig;r(seen);},600));
    });
    test('the camera is asked for a 3:4 frame, not just 1440x1920',()=>{
      ok(asked.length,'getUserMedia was never called');
      const v=asked[0].video;
      ok(v.aspectRatio,'no aspectRatio constraint — the device picks the shape');
      const want=3/4;
      const got=(typeof v.aspectRatio==='object')?v.aspectRatio.ideal:v.aspectRatio;
      ok(Math.abs(got-want)<1e-9,'aspectRatio should be 0.75, got '+got);
    });
    await page.evaluate(()=>pfCamStop());
  }

  /* ---- 2. the crop arithmetic — what the shutter actually keeps ----
     pfCamCropPct answers "how much of the frame does the 3:4 crop throw away",
     using the same maths as pfCamShot. These are the real mode sizes phones
     hand back. */
  {
    const r=await page.evaluate(()=>({
      /* a 3:4 portrait frame: nothing is lost, which is the point of the fix */
      p1440x1920:pfCamCropPct(1440,1920),
      /* 16:9 portrait — the old default, and the reported symptom */
      p1080x1920:pfCamCropPct(1080,1920),
      /* 4:3 landscape: the sides go instead */
      p1920x1440:pfCamCropPct(1920,1440),
      /* 16:9 landscape, the worst case */
      p1920x1080:pfCamCropPct(1920,1080),
      degenerate:pfCamCropPct(0,0)}));

    test('a true 3:4 frame is not cropped at all',()=>eq(r.p1440x1920,0));
    test('a 16:9 portrait frame loses 25% of its HEIGHT — the reported zoom',()=>{
      /* 1080 wide needs 1440 of height for 3:4; 1920-1440 = 480, and
         480/1920 = 25%. Head and feet, exactly where his guides are. */
      eq(r.p1080x1920,25);
    });
    test('a landscape frame loses its sides instead',()=>{
      eq(r.p1920x1440,44);   /* 1440*0.75 = 1080 kept of 1920 */
      eq(r.p1920x1080,58);   /* 1080*0.75 =  810 kept of 1920 */
    });
    test('no camera yet is 0, never NaN',()=>eq(r.degenerate,0));
  }

  /* ---- 3. the note only speaks when it costs him something ---- */
  {
    await page.evaluate(()=>{
      pfCam={pose:'front',week:'2026-08-10',cap:null,facing:'environment',
             order:['front'],shots:{},prevUrl:null,video:null,stream:{getTracks:()=>[]}};
      const d=document.createElement('div');d.id='pfcam-crop';document.body.appendChild(d);
    });
    const silent=await page.evaluate(()=>{
      pfCam.video={videoWidth:1440,videoHeight:1920};
      pfCamCropNote();return document.getElementById('pfcam-crop').textContent;});
    test('a 3:4 camera says nothing — no clutter when there is no problem',()=>eq(silent,''));

    const loud=await page.evaluate(()=>{
      pfCam.video={videoWidth:1080,videoHeight:1920};
      pfCamCropNote();return document.getElementById('pfcam-crop').textContent;});
    test('a cropping camera names the frame and the loss, on screen',()=>{
      ok(/1080×1920/.test(loud),'the actual frame size must be readable back: '+loud);
      ok(/25%/.test(loud),'the amount lost must be stated: '+loud);
      ok(/top and bottom/.test(loud),'and WHICH edges: '+loud);
    });
    await page.evaluate(()=>{const d=document.getElementById('pfcam-crop');if(d)d.remove();pfCam=null;});
  }

  /* ---- 4. straight from the shutter: a yes/no, not a workbench ---- */
  {
    const cam=await page.evaluate(async()=>{
      const cv=document.createElement('canvas');cv.width=900;cv.height=1200;
      const cx=cv.getContext('2d');cx.fillStyle='#345';cx.fillRect(0,0,900,1200);
      const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',0.9));
      const base=pfAutoSuggest(900,1200);
      state.pfReview={blob:blob,pose:'front',week:'2026-08-10',base:base,revId:++pfRevSeq,
        adj:{panX:0,panY:0,zoom:1,rot:0},cap:null,srcUrl:URL.createObjectURL(blob),fromCam:true};
      render();
      return {sliders:document.querySelectorAll('[data-pfadj]').length,
              use:!!document.querySelector('[data-act="pf:use"]'),
              retake:!!document.querySelector('[data-act="pf:choose"]'),
              reset:!!document.querySelector('[data-act="pf:reset"]'),
              copy:document.body.innerText};
    });
    test('no Up/down, Left/right, Zoom or Level after the shutter',()=>eq(cam.sliders,0));
    test('what is left is the decision: keep it, or retake',()=>{
      ok(cam.use,'no Use this photo');ok(cam.retake,'no Retake');
    });
    test('and no Reset to suggestion, which without sliders means nothing',()=>notOk(cam.reset));
    test('the copy does not point at controls that are not on screen',()=>{
      notOk(/adjust if it looks off/.test(cam.copy),'stale copy still sends him to sliders');
      ok(/adjust the framing later/i.test(cam.copy),'it should say when framing IS available');
    });
  }

  /* ---- 5. the edit pass still has every control ----
     This is the half that makes the change a MOVE rather than a removal. */
  {
    const edit=await page.evaluate(()=>{
      state.pfReview.fromCam=false;state.pfReview.legacyId='prog-x';state.pfReview.solo=true;
      render();
      const keys=[].map.call(document.querySelectorAll('[data-pfadj]'),e=>e.getAttribute('data-pfadj'));
      return {keys:keys.sort().join(','),reset:!!document.querySelector('[data-act="pf:reset"]')};
    });
    test('going back to edit restores Zoom, Up/down, Left/right and Level',()=>
      eq(edit.keys,'panX,panY,rot,zoom'));
    test('and Reset to suggestion comes back with them',()=>ok(edit.reset));
    await page.evaluate(()=>{pfReviewClose();render();});
  }

  test('no page errors',()=>eq(errs.length,0,errs.join(' | ')));

  console.log('\n'+passed+' passed, '+failures.length+' failed');
  await browser.close();server.close();
  process.exit(failures.length?1:0);
})();
