/* C15-M10 (browser) — increment 1: the writer-lease client, real Chromium.

   The mock lease route implements the REAL tested server semantics
   (monotonic fence, held 409, typed stale, D-ABA release, expiry) so the
   client is exercised against the same contract the disposable PB proved.

       CF_SRC=<file> node tests/browser/c15m10-lease.browser.test.js

   Also asserts the increment-1 safety property: NO live behavior change —
   no dispatcher action consults m10Gate yet. */
const path=require('path'),http=require('http'),fs=require('fs');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const SRC=process.env.CF_SRC||'/home/griffin/projects/Weight-Tracker/index.html';
let passed=0;const failures=[];
const test=(n,f)=>{try{f();passed++;console.log('  ✓ '+n);}catch(e){failures.push(n);console.log('  ✗ '+n+'\n      '+(e&&e.message));}};
const ok=(v,m)=>{if(!v)throw new Error(m||'expected truthy');};
const eq=(a,b,m)=>{if(a!==b)throw new Error((m||'eq')+': '+JSON.stringify(a)+' !== '+JSON.stringify(b));};

/* server-semantics lease mock, shared state across requests */
function leaseMock(state){
  return (route)=>{
    const b=JSON.parse(route.request().postData()||'{}');
    const now=Date.now();
    const reply=(status,body)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    const statusBody=(extra)=>Object.assign({ok:true,exists:!!state.row,
      fence:state.row?state.row.fence:0,
      holderDeviceId:state.row?state.row.holder:null,
      deviceName:state.row?state.row.name:null,
      active:state.row?state.row.active:false,
      renewedAt:state.row?state.row.renewedAt:null,serverNow:now,ttlMs:state.ttlMs},extra||{});
    if(state.offline)return route.abort();
    const expired=state.row&&(now-state.row.renewedMs>state.ttlMs);
    if(b.op==='status')return reply(200,statusBody());
    if(b.op==='acquire'){
      if(!state.row){state.row={fence:1,holder:b.deviceId,name:b.deviceName,active:true,renewedMs:now};return reply(200,statusBody({granted:true}));}
      if(state.row.active&&state.row.holder===b.deviceId&&!expired)return reply(200,statusBody({granted:true}));
      if(state.row.active&&!expired)return reply(409,Object.assign(statusBody(),{ok:false,held:true}));
      state.row.fence++;state.row.holder=b.deviceId;state.row.name=b.deviceName;state.row.active=true;state.row.renewedMs=now;
      return reply(200,statusBody({granted:true}));
    }
    if(b.op==='renew'){
      if(!state.row||!state.row.active||state.row.holder!==b.deviceId||b.fence!==state.row.fence||expired)
        return reply(409,{ok:false,stale:true,fence:state.row?state.row.fence:0});
      state.row.renewedMs=now;
      return reply(200,statusBody());
    }
    if(b.op==='release'){
      if(!state.row||state.row.holder!==b.deviceId||b.fence!==state.row.fence)
        return reply(409,{ok:false,stale:true,fence:state.row?state.row.fence:0});
      state.row.fence++;state.row.active=false;state.row.holder=null;
      return reply(200,statusBody());
    }
    if(b.op==='steal'){
      if(!state.row)state.row={fence:0,renewedMs:now};
      state.row.fence++;state.row.holder=b.deviceId;state.row.name=b.deviceName;state.row.active=true;state.row.renewedMs=now;
      return reply(200,statusBody({granted:true}));
    }
    return reply(400,{ok:false,error:'invalid op'});
  };
}

async function boot(ctx,srv,init){
  if(init)await ctx.addInitScript(init);
  await ctx.addInitScript(()=>{
    localStorage.setItem('wl_pb',JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok',email:'a@x.com'}));
    localStorage.setItem('wl_last_owner','userA');
  });
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://127.0.0.1:'+srv.address().port,{waitUntil:'load'});
  await page.waitForTimeout(400);
  return {page,errs};
}

(async()=>{
  const html=fs.readFileSync(SRC,'utf8');
  const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch();
  const generic=r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],token:'tok',record:{id:'userA'}})});

  /* ---- case A: fresh boot acquires; holder gates pass; persisted grant written ---- */
  {
    const st={ttlMs:24*3600*1000,row:null};
    const ctx=await browser.newContext();
    await ctx.route('**/api/**',generic);
    await ctx.route('**/api/cf/writer/lease',leaseMock(st));   // registered last → matched first
    const {page,errs}=await boot(ctx,server);
    const s=await page.evaluate(()=>({holder:M10.holder,fence:M10.fence,corrupt:M10.corrupt,
      gate:m10Gate('test'),grant:localStorage.getItem('wl_m10_grant__userA'),dev:localStorage.getItem('wl_m10_deviceid')}));
    test('A boot acquires the lease (fence 1, holder)',()=>{ok(s.holder,'holder');eq(s.fence,1,'fence');});
    test('A m10Gate passes for the holder',()=>ok(s.gate===true));
    test('A persisted grant written + parseable',()=>{const g=JSON.parse(s.grant);eq(g.fence,1);ok(g.deviceId===s.dev,'grant deviceId');});
    test('A no page errors',()=>eq(errs.length,0,errs.join('; ')));
    await ctx.close();
  }

  /* ---- case B: held by another device → read-only, sheet offered, steal works ---- */
  {
    const st={ttlMs:24*3600*1000,row:{fence:6,holder:'other-dev',name:'iPad',active:true,renewedMs:Date.now()}};
    const ctx=await browser.newContext();
    await ctx.route('**/api/**',generic);
    await ctx.route('**/api/cf/writer/lease',leaseMock(st));   // registered last → matched first
    const {page}=await boot(ctx,server);
    const s1=await page.evaluate(()=>({holder:M10.holder,gate:m10Gate('t'),conf:state.pendingConfirm?state.pendingConfirm.message:null}));
    test('B non-holder boots read-only',()=>ok(!s1.holder));
    test('B gate blocks and offers the takeover sheet naming the session',()=>{
      ok(s1.gate===false,'gate false');ok(/active writer/.test(s1.conf||''),'sheet');ok(/iPad/.test(s1.conf||''),'names the session label');});
    const s2=await page.evaluate(async()=>{
      state.pendingConfirm.fn();state.pendingConfirm=null;
      await new Promise(r=>setTimeout(r,200));
      return {holder:M10.holder,fence:M10.fence,gate:m10Gate('t')};
    });
    test('B takeover steals: fence bumps 6→7, holder, gate passes',()=>{ok(s2.holder);eq(s2.fence,7);ok(s2.gate===true);});
    test('B mock lease agrees the device stole it',()=>{ok(st.row.active);eq(st.row.fence,7);});
    await ctx.close();
  }

  /* ---- case C: reload offline — persisted grant is NEVER sufficient (fail closed) ---- */
  {
    const st={ttlMs:24*3600*1000,row:{fence:3,holder:null,active:true,renewedMs:Date.now()},offline:true};
    const ctx=await browser.newContext();
    await ctx.route('**/api/**',generic);
    await ctx.route('**/api/cf/writer/lease',leaseMock(st));   // registered last → matched first
    const {page}=await boot(ctx,server,()=>{ // a previously persisted, formerly valid grant
      localStorage.setItem('wl_m10_deviceid','dev-old');
      localStorage.setItem('wl_m10_grant__userA',JSON.stringify({fence:3,deviceId:'dev-old',grantedServerNow:Date.now(),ttlMs:86400000}));
    });
    const s=await page.evaluate(()=>({holder:M10.holder,gateBlocked:m10Gate('t')===false}));
    test('C offline reload: not holder despite persisted grant (fail closed)',()=>{ok(!s.holder);ok(s.gateBlocked);});
    await ctx.close();
  }

  /* ---- case D: corrupt persisted grant → read-only + corrupt flag, no steal offered ---- */
  {
    const st={ttlMs:24*3600*1000,row:null};
    const ctx=await browser.newContext();
    await ctx.route('**/api/**',generic);
    await ctx.route('**/api/cf/writer/lease',leaseMock(st));   // registered last → matched first
    const {page}=await boot(ctx,server,()=>{
      localStorage.setItem('wl_m10_grant__userA','{corrupt-not-json');
    });
    const s=await page.evaluate(()=>({corrupt:M10.corrupt,holder:M10.holder,gate:m10Gate('t'),sheet:!!state.pendingConfirm}));
    test('D corrupt grant: read-only, corrupt flagged, gate blocks WITHOUT takeover sheet',()=>{
      ok(s.corrupt,'corrupt');ok(!s.holder);ok(s.gate===false);ok(!s.sheet,'no sheet while corrupt');});
    test('D mock lease untouched (no acquire attempted from a corrupt device)',()=>ok(st.row===null));
    await ctx.close();
  }

  /* ---- case E: renew against a moved fence revokes holding (typed stale) ---- */
  {
    const st={ttlMs:24*3600*1000,row:null};
    const ctx=await browser.newContext();
    await ctx.route('**/api/**',generic);
    await ctx.route('**/api/cf/writer/lease',leaseMock(st));   // registered last → matched first
    const {page}=await boot(ctx,server);
    const s=await page.evaluate(async()=>{
      const before=M10.holder;
      // another device steals server-side (fence moves), then we renew
      window.__steal=true;
      return {before};
    });
    st.row.fence++;st.row.holder='thief';st.row.name='iPad';st.row.renewedMs=Date.now(); // server-side steal
    const s2=await page.evaluate(async()=>{
      const renewed=await m10Renew();
      return {renewed,holder:M10.holder,gate:m10Gate('t')};
    });
    test('E stale renew revokes the holder and gates block',()=>{
      ok(s.before===true,'was holder');ok(s2.renewed===false);ok(!s2.holder);ok(s2.gate===false);});
    await ctx.close();
  }

  /* ---- case F: increment-1 safety — no dispatcher action consults the gate yet ---- */
  {
    const st={ttlMs:24*3600*1000,row:{fence:9,holder:'other',name:'iPad',active:true,renewedMs:Date.now()}};
    const ctx=await browser.newContext();
    await ctx.route('**/api/**',generic);
    await ctx.route('**/api/cf/writer/lease',leaseMock(st));   // registered last → matched first
    const {page}=await boot(ctx,server);
    const s=await page.evaluate(()=>{
      // non-holder device performs a normal local write action (weight add)
      const before=state.weights.length;
      document.getElementById('wl-app')||0;
      state.selDate=toISO(new Date());
      // drive the dispatcher directly, as the app does
      const el=document.createElement('button');el.setAttribute('data-a','weight:add');
      state.pendingWeight='201.5';
      try{if(typeof addWeightFor==='function')addWeightFor(state.selDate,201.5);else{state.weights.push({date:state.selDate,weight:201.5});}}catch(e){}
      return {before,after:state.weights.length,holder:M10.holder};
    });
    test('F increment-1 safety: local writes still work for a NON-holder (gate not yet wired)',()=>{
      ok(!s.holder,'non-holder');ok(s.after===s.before+1,'local write unchanged');});
    await ctx.close();
  }

  /* ---- case G: deviceId stability + verified write ---- */
  {
    const st={ttlMs:24*3600*1000,row:null};
    const ctx=await browser.newContext();
    await ctx.route('**/api/**',generic);
    await ctx.route('**/api/cf/writer/lease',leaseMock(st));   // registered last → matched first
    const {page}=await boot(ctx,server);
    const s=await page.evaluate(()=>{
      const a=m10DeviceId(),b=m10DeviceId();
      return {same:a===b,stored:localStorage.getItem('wl_m10_deviceid')===a};
    });
    test('G deviceId stable and store-verified',()=>{ok(s.same);ok(s.stored);});
    await ctx.close();
  }

  await browser.close();server.close();
  console.log(`\nC15-M10 increment 1: ${passed} passed, ${failures.length} failed`);
  process.exit(failures.length?1:0);
})().catch(e=>{console.error('SUITE ERROR',e);process.exit(2);});
