/* C15-M10 (browser) — increment 1 REVISED (round-13 items), real Chromium.

   The mock lease route implements the REAL tested server semantics
   (monotonic fence, held 409, typed stale, D-ABA release, expiry).

       CF_SRC=<file> node tests/browser/c15m10-lease.browser.test.js

   Round-13 coverage: account-bound authority + A→B switch mid-acquire (K1),
   the reset primitive on session teardown (K2), lease-settles-before-adoption
   boot ordering (K3), send-time deadline conservatism (K4), device-id
   validation incl. malformed/oversized persisted bytes (K5), grant validation
   incl. foreign uid/device + unsafe fence/ttl + malformed success bodies +
   diagnostic-write failure honesty (K6), classified renew outcomes (K7),
   real-dispatcher evidence + renamed direct-write compatibility (K9). */
const path=require('path'),http=require('http'),fs=require('fs');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const SRC=process.env.CF_SRC||'/home/griffin/projects/compound-app/index.html';
let passed=0;const failures=[];
const test=(n,f)=>{try{f();passed++;console.log('  ✓ '+n);}catch(e){failures.push(n);console.log('  ✗ '+n+'\n      '+(e&&e.message));}};
const ok=(v,m)=>{if(!v)throw new Error(m||'expected truthy');};
const eq=(a,b,m)=>{if(a!==b)throw new Error((m||'eq')+': '+JSON.stringify(a)+' !== '+JSON.stringify(b));};

function leaseMock(state){
  return async(route)=>{
    const b=JSON.parse(route.request().postData()||'{}');
    const now=Date.now();
    const d=(state.delaySeq&&state.delaySeq.length)?state.delaySeq.shift():state.delayMs;
    if(d)await new Promise(r=>setTimeout(r,d));
    const reply=(status,body)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(state.forceStatus)return reply(state.forceStatus,state.forceBody||{ok:false});
    if(state.mutateBody&&(!state.mutateFor||state.mutateFor===b.op)){
      const m=state.mutateBody;state.mutateBody=null;state.mutateFor=null;return reply(200,m);}
    const statusBody=(extra)=>Object.assign({ok:true,exists:!!state.row,
      fence:state.row?state.row.fence:0,
      holderDeviceId:state.row?state.row.holder:null,
      deviceName:state.row?state.row.name:null,
      active:state.row?state.row.active:false,
      renewedAt:null,serverNow:now,ttlMs:state.ttlMs},extra||{});
    if(state.offline)return route.abort();
    const expired=state.row&&(now-state.row.renewedMs>state.ttlMs);
    state.log&&state.log.push({op:b.op,at:Date.now()});
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
      state.row.renewedMs=now;return reply(200,statusBody());
    }
    if(b.op==='steal'){
      if(!state.row)state.row={fence:0,renewedMs:now};
      state.row.fence++;state.row.holder=b.deviceId;state.row.name=b.deviceName;state.row.active=true;state.row.renewedMs=now;
      return reply(200,statusBody({granted:true}));
    }
    return reply(400,{ok:false,error:'invalid op'});
  };
}

async function boot(browser,srv,st,init,uid){
  const ctx=await browser.newContext();
  await ctx.exposeFunction('__st_mutate',(b,op)=>{st.mutateBody=b;st.mutateFor=op||null;});
  await ctx.exposeFunction('__st_delays',(a)=>{st.delaySeq=a;});
  await ctx.exposeFunction('__delaySeqSet',()=>{st.delaySeq=[500,50];});
  const appdataLog=[];
  await ctx.route('**/api/**',r=>{
    if(/collections\/appdata\/records/.test(r.request().url()))appdataLog.push(Date.now());
    r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],token:'tok',record:{id:uid||'userA'}})});});
  await ctx.route('**/api/cf/writer/lease',leaseMock(st));
  if(init)await ctx.addInitScript(init);
  await ctx.addInitScript((u)=>{
    localStorage.setItem('wl_pb',JSON.stringify({uid:u,base:'https://pb.test',token:'tok',email:'a@x.com'}));
    localStorage.setItem('wl_last_owner',u);
  },uid||'userA');
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://127.0.0.1:'+srv.address().port,{waitUntil:'load'});
  await page.waitForTimeout(500+(st.delayMs||0));
  return {ctx,page,errs,appdataLog};
}

(async()=>{
  const html=fs.readFileSync(SRC,'utf8');
  const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch();

  /* A: fresh boot acquires; gate passes; grant persisted with uid+mark */
  {
    const st={ttlMs:24*3600*1000,row:null};
    const {ctx,page,errs}=await boot(browser,server,st);
    const s=await page.evaluate(()=>({holder:M10.holder,fence:M10.fence,uid:M10.uid,corrupt:M10.corrupt,
      gate:m10Gate('t'),grant:localStorage.getItem('wl_m10_grant__userA'),dev:localStorage.getItem('wl_m10_deviceid')}));
    test('A boot acquires (fence 1, holder, uid-bound)',()=>{ok(s.holder);eq(s.fence,1);eq(s.uid,'userA');});
    test('A gate passes for the bound holder',()=>ok(s.gate===true));
    test('A grant persisted with uid+mark+deviceId',()=>{const g=JSON.parse(s.grant);
      eq(g.uid,'userA');eq(g.mark,'m10.1');ok(g.deviceId===s.dev);});
    test('A deviceId matches the grammar',()=>ok(/^dev-[a-z0-9]{24}$/.test(s.dev),s.dev));
    test('A no page errors',()=>eq(errs.length,0,errs.join('; ')));
    await ctx.close();
  }

  /* B: held by other → read-only + sheet + steal (fence agreed) */
  {
    const st={ttlMs:24*3600*1000,row:{fence:6,holder:'other-dev',name:'iPad',active:true,renewedMs:Date.now()}};
    const {ctx,page}=await boot(browser,server,st);
    const s1=await page.evaluate(()=>({holder:M10.holder,uid:M10.uid,gate:m10Gate('t'),conf:state.pendingConfirm?state.pendingConfirm.message:null}));
    test('B non-holder read-only, uid still bound',()=>{ok(!s1.holder);eq(s1.uid,'userA');});
    test('B gate blocks + sheet names the session',()=>{ok(s1.gate===false);ok(/iPad/.test(s1.conf||''));});
    const s2=await page.evaluate(async()=>{state.pendingConfirm.fn();state.pendingConfirm=null;
      await new Promise(r=>setTimeout(r,250));return {holder:M10.holder,fence:M10.fence,gate:m10Gate('t')};});
    test('B takeover steals 6→7, gate passes',()=>{ok(s2.holder);eq(s2.fence,7);ok(s2.gate===true);});
    test('B mock agrees',()=>{eq(st.row.fence,7);});
    await ctx.close();
  }

  /* C: offline reload — persisted grant NEVER restores authority */
  {
    const st={ttlMs:24*3600*1000,row:{fence:3,holder:null,active:true,renewedMs:Date.now()},offline:true};
    const {ctx,page}=await boot(browser,server,st,()=>{
      localStorage.setItem('wl_m10_deviceid','dev-abcdefghij0123456789klmn');
      localStorage.setItem('wl_m10_grant__userA',JSON.stringify({mark:'m10.1',uid:'userA',fence:3,
        deviceId:'dev-abcdefghij0123456789klmn',grantedServerNow:Date.now(),ttlMs:86400000}));
    });
    const s=await page.evaluate(()=>({holder:M10.holder,reason:M10.revokeReason,gateBlocked:m10Gate('t')===false}));
    test('C offline reload: not holder (fail closed), reason=offline',()=>{ok(!s.holder);eq(s.reason,'offline');ok(s.gateBlocked);});
    await ctx.close();
  }

  /* D: corrupt persisted grant → read-only, no takeover offered, no acquire */
  {
    const st={ttlMs:24*3600*1000,row:null,log:[]};
    const {ctx,page}=await boot(browser,server,st,()=>{
      localStorage.setItem('wl_m10_grant__userA','{corrupt-not-json');});
    const s=await page.evaluate(()=>({corrupt:M10.corrupt,holder:M10.holder,gate:m10Gate('t'),sheet:!!state.pendingConfirm}));
    test('D corrupt grant: read-only, no sheet, no acquire attempted',()=>{
      ok(s.corrupt);ok(!s.holder);ok(s.gate===false);ok(!s.sheet);ok(st.row===null);});
    await ctx.close();
  }

  /* D2 (K5): malformed + oversized persisted deviceId → corrupt */
  for(const [label,val] of [['malformed','not!a$device'],['oversized','dev-'+'a'.repeat(200)]]){
    const st={ttlMs:24*3600*1000,row:null};
    const {ctx,page}=await boot(browser,server,st,(v)=>{localStorage.setItem('wl_m10_deviceid',v);},undefined);
    await page.evaluate(()=>{});
    const s=await page.evaluate((v)=>{localStorage.setItem('wl_m10_deviceid',v);M10.corrupt=false;
      const dev=m10DeviceId();return {dev,corrupt:M10.corrupt};},val);
    test(`D2 ${label} persisted deviceId → corrupt, never replaced`,()=>{ok(s.dev===null);ok(s.corrupt);});
    await ctx.close();
  }

  /* D3 (K6): grant for another uid / another deviceId → corrupt */
  {
    const st={ttlMs:24*3600*1000,row:null};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(()=>{
      const dev=localStorage.getItem('wl_m10_deviceid');
      const mk=(o)=>{M10.corrupt=false;localStorage.setItem('wl_m10_grant__userA',JSON.stringify(o));
        const g=m10ReadGrant('userA',dev);return {g,corrupt:M10.corrupt};};
      const foreignUid=mk({mark:'m10.1',uid:'userB',fence:2,deviceId:dev,grantedServerNow:1,ttlMs:1000});
      const foreignDev=mk({mark:'m10.1',uid:'userA',fence:2,deviceId:'dev-zzzzzzzzzzzzzzzzzzzzzzzz',grantedServerNow:1,ttlMs:1000});
      const badFence=mk({mark:'m10.1',uid:'userA',fence:1.5,deviceId:dev,grantedServerNow:1,ttlMs:1000});
      const badTtl=mk({mark:'m10.1',uid:'userA',fence:2,deviceId:dev,grantedServerNow:1,ttlMs:1e12});
      return {foreignUid,foreignDev,badFence,badTtl};
    });
    test('D3 foreign-uid grant rejected as corrupt',()=>{ok(s.foreignUid.g===null);ok(s.foreignUid.corrupt);});
    test('D3 foreign-device grant rejected as corrupt',()=>{ok(s.foreignDev.g===null);ok(s.foreignDev.corrupt);});
    test('D3 non-integer fence rejected',()=>{ok(s.badFence.g===null);ok(s.badFence.corrupt);});
    test('D3 unbounded ttl rejected',()=>{ok(s.badTtl.g===null);ok(s.badTtl.corrupt);});
    await ctx.close();
  }

  /* E (K7): classified renew outcomes */
  {
    const st={ttlMs:24*3600*1000,row:null};
    const {ctx,page}=await boot(browser,server,st);
    // typed stale
    st.row.fence++;st.row.holder='thief';st.row.renewedMs=Date.now();
    let s=await page.evaluate(async()=>{const r=await m10Renew();return {r,holder:M10.holder,reason:M10.revokeReason,uid:M10.uid};});
    test('E typed stale → revoked, reason=stale, uid kept',()=>{ok(s.r===false);ok(!s.holder);eq(s.reason,'stale');eq(s.uid,'userA');});
    // re-steal to become holder again, then a 500
    s=await page.evaluate(async()=>{const t0=performance.now();
      const r=await m10LeaseCall('steal',{});m10ApplyGrant(r.body,pbUid(),t0);return M10.holder;});
    ok(s===true,'resteal');
    st.forceStatus=500;st.forceBody={ok:false,error:'boom'};
    s=await page.evaluate(async()=>{const r=await m10Renew();return {r,holder:M10.holder,reason:M10.revokeReason,uid:M10.uid};});
    st.forceStatus=null;
    test('E server 5xx → revoked, reason=server-error (NOT stale)',()=>{ok(!s.holder);eq(s.reason,'server-error');eq(s.uid,'userA');});
    // become holder again, then 401 → FULL reset
    s=await page.evaluate(async()=>{const t0=performance.now();
      const r=await m10LeaseCall('steal',{});m10ApplyGrant(r.body,pbUid(),t0);m10StartTimer();return M10.holder;});
    st.forceStatus=401;st.forceBody={ok:false};
    s=await page.evaluate(async()=>{const r=await m10Renew();return {r,holder:M10.holder,uid:M10.uid,timer:M10.timer!==null,reason:M10.revokeReason};});
    st.forceStatus=null;
    test('E auth failure → FULL reset (uid null, timer cleared)',()=>{ok(!s.holder);ok(s.uid===null);ok(!s.timer);eq(s.reason,'auth-failed');});
    // malformed 200 body
    s=await page.evaluate(async()=>{const t0=performance.now();
      const r=await m10LeaseCall('steal',{});m10ApplyGrant(r.body,pbUid(),t0);return M10.holder;});
    st.mutateBody={ok:true,fence:'nine',ttlMs:-5};
    s=await page.evaluate(async()=>{const r=await m10Renew();return {holder:M10.holder,reason:M10.revokeReason};});
    test('E malformed 200 → revoked, reason=malformed-response',()=>{ok(!s.holder);eq(s.reason,'malformed-response');});
    await ctx.close();
  }

  /* F (K1): A→B account switch while A's acquire is in flight */
  {
    const st={ttlMs:24*3600*1000,row:null,delayMs:600};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      // relaunch boot for A with a delayed response; switch the session to B mid-flight
      const p=m10Boot();
      await new Promise(r=>setTimeout(r,100));
      const c=JSON.parse(localStorage.getItem('wl_pb'));c.uid='userB';
      localStorage.setItem('wl_pb',JSON.stringify(c));
      await p;
      return {holder:M10.holder,uid:M10.uid,reason:M10.revokeReason,gate:m10Gate('t')===false};
    });
    test('F A→B switch mid-acquire: authority NOT applied for B',()=>{
      ok(!s.holder,'holder');ok(s.uid===null,'uid cleared');eq(s.reason,'account-changed');ok(s.gate);});
    await ctx.close();
  }

  /* G (K2): pbClearSession revokes authority + timer synchronously */
  {
    const st={ttlMs:24*3600*1000,row:null};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(()=>{
      const before={holder:M10.holder,timer:M10.timer!==null};
      pbClearSession(true);
      return {before,after:{holder:M10.holder,uid:M10.uid,timer:M10.timer!==null,reason:M10.revokeReason}};
    });
    test('G session teardown: reset fired (holder false, uid null, timer cleared)',()=>{
      ok(s.before.holder&&s.before.timer,'was holder w/ timer');
      ok(!s.after.holder);ok(s.after.uid===null);ok(!s.after.timer);eq(s.after.reason,'session-cleared');});
    await ctx.close();
  }

  /* H (K4): deadline conservatism under response delay */
  {
    const st={ttlMs:5000,row:null,delayMs:700};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(()=>({holder:M10.holder,
      // deadline = t0 + ttl; now >= t0 + delay(700ms) → remaining <= ttl - delay
      remaining:M10.deadline-performance.now(),ttl:5000}));
    test('H deadline derives from SEND time (remaining ≤ ttl − delay)',()=>{
      ok(s.holder,'holder');ok(s.remaining<=s.ttl-600,'remaining='+s.remaining);ok(s.remaining>0);});
    await ctx.close();
  }

  /* I (K6): diagnostic grant-write failure recorded honestly, authority kept */
  {
    const st={ttlMs:24*3600*1000,row:{fence:2,holder:'other',name:'iPad',active:true,renewedMs:Date.now()}};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      const orig=localStorage.setItem.bind(localStorage);
      localStorage.setItem=function(k,v){if(/wl_m10_grant__/.test(k))throw new Error('quota');return orig(k,v);};
      const t0=performance.now();
      const r=await m10LeaseCall('steal',{});
      const applied=m10ApplyGrant(r.body,pbUid(),t0);
      localStorage.setItem=orig;
      return {applied,holder:M10.holder,failed:M10.grantWriteFailed};
    });
    test('I grant-write failure: holder retained, grantWriteFailed=true (diagnostic honesty)',()=>{
      ok(s.applied);ok(s.holder);ok(s.failed);});
    await ctx.close();
  }

  /* J (K3): boot ordering — adoption (appdata fetches) waits for the lease */
  {
    const st={ttlMs:24*3600*1000,row:null,delayMs:800,log:[]};
    const {ctx,page,appdataLog}=await boot(browser,server,st);
    await page.waitForTimeout(600);
    const leaseDone=st.log.length?st.log[0].at:0;   // the mock logs AFTER its delay — this IS release time
    test('J adoption ran only after the lease settled',()=>{
      ok(st.log.length>=1,'lease called');ok(appdataLog.length>=1,'adoption ran');
      ok(Math.min(...appdataLog)>=leaseDone-50,`first appdata ${Math.min(...appdataLog)} vs lease done ${leaseDone}`);});
    await ctx.close();
  }

  /* K (K9): REAL dispatcher path + direct-write compatibility (renamed) */
  {
    const st={ttlMs:24*3600*1000,row:{fence:9,holder:'other',name:'iPad',active:true,renewedMs:Date.now()}};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(()=>{
      const before=state.sumOpen;
      const b=document.createElement('button');b.setAttribute('data-act','sum:toggle');
      document.body.appendChild(b);b.click();
      const dispatched=state.sumOpen!==before;
      const w0=state.weights.length;
      state.weights.push({date:'2026-08-02',weight:201.5});save();
      return {dispatched,directWrite:state.weights.length===w0+1,holder:M10.holder};
    });
    /* increment 5 wired the gate: this is now the INVERSE assertion — a
       non-holder's mutating action is intercepted before the dispatcher */
    test('K real dispatcher action REFUSED for a NON-holder (gate wired in increment 5)',()=>{
      ok(!s.holder);ok(!s.dispatched,'the app dispatcher never ran');});
    test('K direct local-write compatibility (renamed per round-13 item 9)',()=>ok(s.directWrite));
    await ctx.close();
  }

  /* L2a: logout + login as the SAME uid while acquire is pending */
  {
    const st={ttlMs:24*3600*1000,row:null,delaySeq:[600]};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      m10Reset('t');const p=m10Boot();          // delayed acquire in flight
      await new Promise(r=>setTimeout(r,100));
      pbClearSession(true);                      // logout (reset, gen bump)
      const c=JSON.parse(localStorage.getItem('wl_pb')||'{}');
      localStorage.setItem('wl_pb',JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok2',email:'a@x.com'}));
      await p;                                   // stale same-uid response arrives
      return {holder:M10.holder,uid:M10.uid,reason:M10.revokeReason};
    });
    test('L2a same-uid relogin mid-acquire: stale response NOT installed',()=>{
      ok(!s.holder,'holder');ok(s.uid===null,'uid stays reset');eq(s.reason,'session-cleared');});
    await ctx.close();
  }

  /* L2b: two overlapping boots, same uid — the later boot owns the state */
  {
    const st={ttlMs:24*3600*1000,row:null,delaySeq:[500,50]};
    const {ctx,page}=await boot(browser,server,st,null,'userA');
    const s=await page.evaluate(async()=>{
      m10Reset('t');
      const p1=m10Boot();                        // slow response
      const p2=m10Boot();                        // fast response, later gen
      const genAfterStarts=M10.gen;
      await Promise.all([p1,p2]);
      return {holder:M10.holder,uid:M10.uid,gen:M10.gen,genAfterStarts};
    });
    test('L2b overlapping boots: later boot owns authority, earlier discarded',()=>{
      ok(s.holder,'holder from the later boot');eq(s.uid,'userA');eq(s.gen,s.genAfterStarts,'no post-hoc overwrite');});
    await ctx.close();
  }

  /* L2c: two overlapping takeovers, responses in reverse order */
  {
    const st={ttlMs:24*3600*1000,row:{fence:7,holder:'other',name:'iPad',active:true,renewedMs:Date.now()},delaySeq:[]};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      // open the sheet twice and fire both confirms; the second op supersedes
      m10Gate('t');const fn1=state.pendingConfirm.fn;state.pendingConfirm=null;
      m10Gate('t');const fn2=state.pendingConfirm?state.pendingConfirm.fn:fn1;state.pendingConfirm=null;
      window.__delaySeqSet&&window.__delaySeqSet();
      fn1();fn2();
      await new Promise(r=>setTimeout(r,900));
      return {fence:M10.fence,holder:M10.holder};
    });
    // mock: op1 delayed 500 (mutates second → fence 9), op2 delayed 50 (mutates first → fence 8)
    // client: op2 has the higher gen → its response (fence 8) owns the state;
    // op1's later response (fence 9) is superseded and must NOT install.
    test('L2c reversed takeover responses: superseded op cannot install (fence stays 8)',()=>{
      ok(s.holder,'holder');eq(s.fence,8);});
    await ctx.close();
  }

  /* L2d: valid renewal response arriving after a newer takeover */
  {
    const st={ttlMs:24*3600*1000,row:null,delaySeq:[]};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      const dev=localStorage.getItem('wl_m10_deviceid');
      // craft a delayed VALID 200 renew, then take over before it lands
      await window.__st_mutate({ok:true,fence:M10.fence,ttlMs:5000,serverNow:Date.now(),holderDeviceId:dev},'renew');
      await window.__st_delays([400,0]);
      const renewP=m10Renew();
      const g=++M10.gen;const t0=performance.now();
      const r=await m10LeaseCall('steal',{});
      if(M10.gen===g)m10ApplyGrant(r.body,pbUid(),t0);
      const renewed=await renewP;
      return {renewed,remaining:M10.deadline-performance.now(),holder:M10.holder,fence:M10.fence};
    });
    test('L2d late valid renew after takeover: neither installs nor revokes (deadline stays 24h-scale)',()=>{
      ok(s.renewed===false,'renew discarded');ok(s.holder);ok(s.remaining>3600*1000,'takeover deadline kept: '+Math.round(s.remaining));});
    await ctx.close();
  }

  /* L3: crypto.getRandomValues unavailable → fail closed, zero lease traffic */
  {
    const st={ttlMs:24*3600*1000,row:null,log:[]};
    const {ctx,page}=await boot(browser,server,st,()=>{
      Object.defineProperty(window,'crypto',{value:{},configurable:true});
    });
    const s=await page.evaluate(()=>({holder:M10.holder,corrupt:M10.corrupt,
      dev:localStorage.getItem('wl_m10_deviceid'),gate:m10Gate('t')===false}));
    test('L3 no crypto: read-only, no id created/persisted, NO lease request',()=>{
      ok(!s.holder);ok(s.dev===null,'no persisted id');ok(s.gate,'gate blocks');eq(st.log.length,0,'zero lease calls');});
    await ctx.close();
  }

  /* L4: valid-shaped 200 renew naming ANOTHER device must not extend */
  {
    const st={ttlMs:24*3600*1000,row:null,delaySeq:[]};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      await window.__st_mutate({ok:true,fence:M10.fence,ttlMs:86400000,serverNow:Date.now(),
        holderDeviceId:'dev-zzzzzzzzzzzzzzzzzzzzzzzz'},'renew');
      const r=await m10Renew();
      return {r,holder:M10.holder,reason:M10.revokeReason};
    });
    test('L4 renew 200 naming another device → revoked as malformed-response',()=>{
      ok(s.r===false);ok(!s.holder);eq(s.reason,'malformed-response');});
    await ctx.close();
  }

  /* L5: garbage held-409 body is malformed, not authoritative */
  {
    const st={ttlMs:24*3600*1000,row:null,forceStatus:409,
      forceBody:{ok:false,held:true,fence:'nine',ttlMs:-1,holderDeviceId:''}};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(()=>({holder:M10.holder,known:M10.known,reason:M10.revokeReason,uid:M10.uid}));
    test('L5 malformed held body: known=null, reason=malformed-response, uid bound',()=>{
      ok(!s.holder);ok(s.known===null);eq(s.reason,'malformed-response');eq(s.uid,'userA');});
    await ctx.close();
  }

  await browser.close();server.close();
  console.log(`\nC15-M10 increment 1 (revised): ${passed} passed, ${failures.length} failed`);
  process.exit(failures.length?1:0);
})().catch(e=>{console.error('SUITE ERROR',e);process.exit(2);});
