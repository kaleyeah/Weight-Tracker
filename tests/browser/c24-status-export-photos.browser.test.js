/* C24 — review-round coverage: three gaps named by the Architect
   (2026-08-05 round 2, rulings 5/6/7).

   5. UTF-8 export: ported from the retired export-utf8 suite — the shipping
      backup blob must declare charset=utf-8 and round-trip multibyte content.
   6. Status display: setSync/syncStatusHTML render the right state, and a
      blocked recovery is DURABLE — an ordinary "ok" cannot paint over it.
   7. The 500-photo boundary: pbPhotoList caps at perPage=500 with no
      pagination. PIN the safe behaviour: records beyond the cap are simply
      not adopted, and nothing local is EVER deleted because of a listing.

       node tests/browser/c24-status-export-photos.browser.test.js */
const path=require('path'),http=require('http'),fs=require('fs');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const SRC=process.env.CF_SRC||'/home/griffin/projects/compound-app/index.html';

let passed=0;const failures=[];
const test=(n,f)=>{try{f();passed++;console.log('  ✓ '+n);}catch(e){failures.push(n);console.log('  ✗ '+n+'\n      '+(e&&e.message));}};
const eq=(a,b,m)=>{const x=JSON.stringify(a),y=JSON.stringify(b);if(x!==y)throw new Error((m?m+': ':'')+`expected ${y}, got ${x}`);};
const ok=(v,m)=>{if(!v)throw new Error(m||'expected truthy');};

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
      weights:[{date:'2026-08-01',weight:184.0}],food:{},workouts:{},steps:{},notes:{'2026-08-01':'Résumé — 現在 92 kg → ✓'},
      sleep:{},bodyfat:{},waist:{},statuses:[],presets:[],skips:{},nightlyLog:{}}));
    localStorage.setItem('wl_training_v1',JSON.stringify({cardioTypes:[],exercises:[],routines:[],sessions:{},liftSessions:{}}));
    /* capture every Blob the app constructs */
    window.__blobs=[];
    const RealBlob=window.Blob;
    window.Blob=function(parts,opts){try{window.__blobs.push({type:(opts&&opts.type)||'',text:String((parts&&parts[0])||'')});}catch(e){}
      return new RealBlob(parts,opts);};
    window.Blob.prototype=RealBlob.prototype;
  });
  /* 501 server photos; the client asks perPage=500 and the server honours it —
     exactly the production truncation being pinned */
  const serverPhotos=[];for(let i=1;i<=501;i++)serverPhotos.push({id:'srv'+i,localId:'loc'+i,file:'f'+i+'.jpg',kind:'food',date:'2026-07-01'});
  await ctx.route('**/api/**',r=>{
    const u=r.request().url();
    if(/cf\/writer\/lease/.test(u)){
      let b={};try{b=JSON.parse(r.request().postData()||'{}');}catch(e){}
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,exists:true,granted:true,
        fence:1,holderDeviceId:b.deviceId||'dev',deviceName:'x',active:true,serverNow:Date.now(),ttlMs:86400000})});}
    if(/collections\/photos\/records/.test(u)){
      const m=/perPage=(\d+)/.exec(u);const per=m?+m[1]:30;
      return r.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify({page:1,perPage:per,totalItems:serverPhotos.length,totalPages:Math.ceil(serverPhotos.length/per),
          items:serverPhotos.slice(0,per)})});}
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],token:'tok',record:{id:'userA'}})});});
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  await page.waitForFunction(()=>window.M10&&window.M10.booted===true,null,{timeout:15000});
  console.log('\nC24 — status display, UTF-8 export, 500-photo boundary');

  /* ============ 5. UTF-8 export ============ */
  await page.evaluate(()=>{try{delete navigator.canShare;delete navigator.share;}catch(e){}
    window.__blobs=[];window.exportData();});
  const blobs=await page.evaluate(()=>window.__blobs.filter(b=>/json/i.test(b.type)));
  test('EXPORT: the backup blob declares application/json;charset=utf-8',()=>{
    ok(blobs.length>=1,'no JSON blob created');
    ok(/application\/json;\s*charset=utf-8/i.test(blobs[0].type),'type was: '+blobs[0].type);});
  test('EXPORT: multibyte content survives verbatim (é, 現在, →, ✓)',()=>{
    const t=blobs[0].text;
    ok(t.indexOf('Résumé — 現在 92 kg → ✓')>=0,'multibyte note mangled or missing');});
  test('EXPORT: the payload parses back and carries the note',()=>{
    const j=JSON.parse(blobs[0].text);
    eq((j.notes||{})['2026-08-01'],'Résumé — 現在 92 kg → ✓');});

  /* ============ 6. status display ============ */
  const st=await page.evaluate(()=>{
    const out={};
    const grab=()=>{const el=document.createElement('div');el.innerHTML=syncStatusHTML();return el.textContent;};
    window.setSync('ok');out.ok=grab();out.okState=syncState.s;
    window.setSync('syncing');out.syncing=grab();out.syncingState=syncState.s;
    window.setSync('error','another device is the active writer');out.err=grab();out.errMsg=syncState.msg;
    /* durability: a blocked recovery must not be painted over by an ok */
    window.recoveryBlocked=true;window.recoveryBlockReason='recovery copy could not be written';
    window.setSync('ok');
    out.blockedState=syncState.s;out.blockedMsg=syncState.msg;
    window.recoveryBlocked=false;window.recoveryBlockReason='';
    window.setSync('ok');out.recovered=syncState.s;
    return out;});
  test('STATUS: ok / syncing / error states render distinctly',()=>{
    eq(st.okState,'ok');eq(st.syncingState,'syncing');
    ok(st.err.indexOf('another device is the active writer')>=0,'error message not shown: '+st.err);});
  test('STATUS: a blocked recovery is durable — "ok" cannot paint over it',()=>{
    eq(st.blockedState,'error');
    ok(st.blockedMsg.indexOf('recovery copy')>=0,'block reason lost: '+st.blockedMsg);});
  test('STATUS: clearing the block lets ordinary status through again',()=>eq(st.recovered,'ok'));

  /* ============ 7. the 500-photo boundary ============ */
  const photo=await page.evaluate(async()=>{
    const out={};
    await window.idbAdd({id:'localKeep',date:'2026-07-02',kind:'food',blob:new Blob(['x'],{type:'image/jpeg'}),ts:1});
    const before=(await window.idbAll()).length;
    await new Promise(res=>{window.photoSync(res);});
    out.localAfter=(await window.idbAll()).length;
    out.localBefore=before;
    out.keepSurvives=(await window.idbAll()).some(p=>p.id==='localKeep');
    const ops=window.m10pOps?window.m10pOps('userA'):[];
    out.adoptOps=ops.filter(o=>o.op==='adopt').length;
    out.deleteOps=ops.filter(o=>o.op==='delete').length;
    return out;});
  test('PHOTOS: adoption stops at the 500-record listing cap (501st not adopted)',()=>{
    ok(photo.adoptOps<=500,'adopted '+photo.adoptOps);
    ok(photo.adoptOps>=1,'no adoption happened at all — the sweep did not run');});
  test('PHOTOS: an incomplete listing NEVER deletes local photos',()=>{
    eq(photo.deleteOps,0,'deletion ops were queued');
    ok(photo.keepSurvives,'a local-only photo was removed');
    ok(photo.localAfter>=photo.localBefore,'local store shrank');});

  await browser.close();server.close();
  test('no page errors across the run',()=>eq([...new Set(errs)],[]));

  console.log('\n----------------------------------------------------');
  if(failures.length){console.log('FAILED — '+passed+' passed, '+failures.length+' failed');process.exit(1);}
  console.log('OK — '+passed+' passed');
})().catch(e=>{console.error('SUITE CRASH: '+(e&&e.stack||e));process.exit(1);});
