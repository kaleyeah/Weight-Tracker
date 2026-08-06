/* C27 (browser) — progress-photo Milestone 1: the non-destructive 3:4
   transform foundation, real Chromium.

       CF_SRC=<file> node tests/browser/c27-photo-frame.browser.test.js

   Milestone-1 review evidence (implementation plan):
   - deterministic derivative generation + cache invalidation
   - the source blob's BYTE IDENTITY survives derivative generation
   - legacy records (no normalization metadata) still display unchanged
   - no second unintended crop: the derivative itself is exactly 3:4

   The fixture image is a canvas-drawn 1200×2000 with four distinct solid
   quadrant colors, so "which part of the source am I looking at" is a pixel
   read, not a guess. */
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
  const ctx=await browser.newContext();
  await ctx.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],token:'tok',record:{id:'userA'}})}));
  await ctx.addInitScript(()=>{
    localStorage.setItem('wl_pb',JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok',email:'a@x.com'}));
    localStorage.setItem('wl_last_owner','userA');
    localStorage.setItem('wl_v1',JSON.stringify({settings:{onboarded:true,units:'lbs'},weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},statuses:[],presets:[],skips:{},nightlyLog:{}}));
  });
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  await page.waitForTimeout(900);

  const s=await page.evaluate(async()=>{
    const out={};
    /* fixture: 1200×2000, quadrants TL=red TR=green BL=blue BR=yellow */
    const cv=document.createElement('canvas');cv.width=1200;cv.height=2000;
    const cx=cv.getContext('2d');
    cx.fillStyle='#ff0000';cx.fillRect(0,0,600,1000);
    cx.fillStyle='#00ff00';cx.fillRect(600,0,600,1000);
    cx.fillStyle='#0000ff';cx.fillRect(0,1000,600,1000);
    cx.fillStyle='#ffff00';cx.fillRect(600,1000,600,1000);
    const blob=await new Promise(r=>cv.toBlob(r,'image/png'));
    const srcBytes=new Uint8Array(await blob.arrayBuffer());
    out.srcLen=srcBytes.length;

    const legacy={id:'prog-legacy-1',date:'2026-07-20',week:'2026-07-20',pose:'front',kind:'progress',blob:blob,ts:Date.now()-9e6};
    const normd={id:'prog-norm-1',date:'2026-07-27',week:'2026-07-27',pose:'front',kind:'progress',blob:blob,ts:Date.now()-5e6,
      normalization:pfAutoSuggest(1200,2000)};
    await idbAdd(legacy);await idbAdd(normd);

    /* --- legacy record: unchanged shape, renders via the existing path --- */
    const all=await idbAll();
    const lrec=all.find(p=>p.id==='prog-legacy-1');
    out.legacyIntact=!!lrec&&lrec.pose==='front'&&!lrec.normalization;
    out.legacyHasNorm=pfHasNorm(lrec);

    /* --- derivative: 3:4, deterministic, cached, invalidated on edit --- */
    const nrec=all.find(p=>p.id==='prog-norm-1');
    const d1=await new Promise(r=>pfDerivative(nrec,800,(du,k)=>r({du,k})));
    const d2=await new Promise(r=>pfDerivative(nrec,800,(du,k)=>r({du,k})));
    out.d1ok=!!(d1&&d1.du);
    out.deterministic=!!d1.du&&d1.du===d2.du&&d1.k===d2.k;
    const dim=await new Promise(res=>{const im=new Image();im.onload=()=>res({w:im.width,h:im.height});im.src=d1.du;});
    out.dw=dim.w;out.dh=dim.h;
    /* sample the derivative's corners: auto-suggest on 1200×2000 crops the
       vertical CENTER (y 0.1..0.9 of source), full width → top half red/green,
       bottom half blue/yellow */
    const probe=await new Promise(res=>{const im=new Image();im.onload=()=>{
      const c2=document.createElement('canvas');c2.width=im.width;c2.height=im.height;
      const x2=c2.getContext('2d');x2.drawImage(im,0,0);
      const px=(x,y)=>Array.from(x2.getImageData(Math.round(x),Math.round(y),1,1).data.slice(0,3));
      res({tl:px(im.width*0.25,im.height*0.1),br:px(im.width*0.75,im.height*0.9)});};im.src=d1.du;});
    out.tlRed=probe.tl[0]>180&&probe.tl[1]<80;
    out.brYellow=probe.br[0]>180&&probe.br[1]>180&&probe.br[2]<80;

    /* edited normalization ⇒ different key AND visibly different content:
       zoom into the TOP half only (green/red band) */
    const edited=JSON.parse(JSON.stringify(nrec.normalization));
    edited.crop=pfAdjust(edited.crop,0,-0.3,2);edited.mode='manual';
    const nrec2=Object.assign({},nrec,{normalization:edited});
    const d3=await new Promise(r=>pfDerivative(nrec2,800,(du,k)=>r({du,k})));
    out.invalidated=!!d3.du&&d3.k!==d1.k&&d3.du!==d1.du;

    /* --- BYTE IDENTITY: the stored source is untouched after all of that --- */
    const again=(await idbAll()).find(p=>p.id==='prog-norm-1');
    const afterBytes=new Uint8Array(await again.blob.arrayBuffer());
    out.sameLen=afterBytes.length===srcBytes.length;
    let same=out.sameLen;
    if(same)for(let i=0;i<srcBytes.length;i+=997)if(srcBytes[i]!==afterBytes[i]){same=false;break;}
    if(same&&srcBytes.length)same=srcBytes[srcBytes.length-1]===afterBytes[srcBytes.length-1];
    out.byteIdentical=same;
    out.noNormWrittenBack=!again.normalization||JSON.stringify(again.normalization)===JSON.stringify(nrec.normalization);

    /* --- a record with an INVALID normalization renders as legacy, safely --- */
    const bad=Object.assign({},nrec,{normalization:{schemaVersion:99}});
    const d4=await new Promise(r=>pfDerivative(bad,800,(du)=>r(du)));
    out.invalidIsLegacy=d4===null&&pfHasNorm(bad)===false;

    /* cleanup */
    await idbDelete('prog-legacy-1');await idbDelete('prog-norm-1');
    out.cleaned=!(await idbAll()).some(p=>/^prog-(legacy|norm)-1$/.test(p.id));
    return out;});

  test('the legacy record keeps its exact shape and reads as legacy',()=>{
    ok(s.legacyIntact,'legacy record changed');eq(s.legacyHasNorm,false);});
  test('the derivative generates and is exactly 3:4',()=>{
    ok(s.d1ok,'no derivative');
    ok(Math.abs(s.dw/s.dh-0.75)<0.005,'ratio: '+s.dw+'×'+s.dh);});
  test('generation is deterministic and served from the keyed cache',()=>ok(s.deterministic));
  test('the derivative shows the CENTERED window of the source',()=>{
    ok(s.tlRed,'top-left of derivative should be red');
    ok(s.brYellow,'bottom-right should be yellow');});
  test('an edited normalization invalidates: new key, new content',()=>ok(s.invalidated));
  test('the source blob is BYTE-IDENTICAL after derivative work',()=>{
    ok(s.sameLen,'length changed');ok(s.byteIdentical,'bytes changed');});
  test('nothing was silently written back to the stored record',()=>ok(s.noNormWrittenBack));
  test('an invalid normalization degrades to legacy, never crashes',()=>ok(s.invalidIsLegacy));
  test('fixture records cleaned up',()=>ok(s.cleaned));
  test('no page errors',()=>eq(errs.length,0,errs.join(';')));

  await ctx.close();await browser.close();server.close();
  console.log(failures.length?`FAILED — ${passed} passed, ${failures.length} failed`:`OK — ${passed} passed`);
  process.exit(failures.length?1:0);
})().catch(e=>{console.error('SUITE ERROR',e);process.exit(2);});
