/* C17-M10 (browser) — increment 3: displaced-core review, real Chromium.

       CF_SRC=<file> node tests/browser/c17m10-displaced.browser.test.js

   Round-20 requirement list: state machine + actions; both-copy
   preservation/export guarantees; journal phases + crash recovery per
   resolution action; account-switch and A→B→A isolation; edit-during-review
   and lease-change; storage-failure injection; no destructive default. */
const path=require('path'),http=require('http'),fs=require('fs');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const SRC=process.env.CF_SRC||'/home/griffin/projects/Weight-Tracker/index.html';
let passed=0;const failures=[];
const test=(n,f)=>{try{f();passed++;console.log('  ✓ '+n);}catch(e){failures.push(n);console.log('  ✗ '+n+'\n      '+(e&&e.message));}};
const ok=(v,m)=>{if(!v)throw new Error(m||'expected truthy');};
const eq=(a,b,m)=>{if(a!==b)throw new Error((m||'eq')+': '+JSON.stringify(a)+' !== '+JSON.stringify(b));};

const EMPTY={settings:{onboarded:true,units:'lbs'},weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},statuses:[],presets:[],skips:{},nightlyLog:{}};
const SERVER={...EMPTY,weights:[{date:'2026-08-01',weight:200}],unknownFutureField:{keep:'me'}};
const LOCAL_EDIT={...EMPTY,weights:[{date:'2026-08-02',weight:199}]};

const seedConflict=(over)=>Object.assign({
  terminal:{owner:'userA',mark:'m10.1',op:'core-ack',phase:'done',outcome:'conflict',startedAt:1,
    expect:{oldBaseCanon:JSON.stringify(EMPTY),expectedRev:5,pushedCanon:JSON.stringify(EMPTY),
      gen:1,fence:null,requestId:'m10c-seedreq0000000000000000',serverRev:9}},
  base:{owner:'userA',mark:'m10.1',canon:1,rev:5,body:JSON.stringify(EMPTY)},
  dirty:{owner:'userA',mark:'m10.1',gen:1,persistedGen:1,ts:1},
  local:JSON.stringify(LOCAL_EDIT)},over||{});

function casMock(st){
  return async(route)=>{
    const url=route.request().url();const method=route.request().method();
    const reply=(status,body)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(/cf\/appdata\/commit/.test(url)){
      if(st.commitDelay)await new Promise(r=>setTimeout(r,st.commitDelay));
      if(st.forceCommit){const f=st.forceCommit;st.forceCommit=null;return reply(f.status,f.body);}
      if(st.dropCommits){const b=JSON.parse(route.request().postData());
        if(!st.ledger[b.idempotencyKey]&&b.expectedRev===st.rev){st.rev++;st.data=b.payload;st.ledger[b.idempotencyKey]={rev:st.rev};}
        return route.abort();}
      const b=JSON.parse(route.request().postData());
      st.commits=(st.commits||0)+1;
      const led=st.ledger[b.idempotencyKey];
      if(led)return reply(200,{ok:true,replay:true,subsystem:'core',newRev:led.rev});
      if(st.fenceRequired&&(typeof b.fence!=='number'||b.fence!==st.fence))
        return reply(409,{ok:false,fenceStale:true,fence:st.fence});
      if(b.expectedRev!==st.rev)
        return reply(409,{ok:false,conflict:true,subsystem:'core',serverRev:st.rev,payload:st.data});
      st.rev++;st.data=b.payload;st.ledger[b.idempotencyKey]={rev:st.rev};
      return reply(200,{ok:true,subsystem:'core',newRev:st.rev});}
    if(/collections\/appdata\/records/.test(url)&&method==='GET'){
      if(st.recordsDelay)await new Promise(r=>setTimeout(r,st.recordsDelay));
      if(st.recordsFail)return route.abort();
      const items=st.hasRow?[{id:'rec1',user:'userA',data:st.data,coreRev:st.rev,training:null,trainingRev:0}]:[];
      return reply(200,{items});}
    if(/cf\/writer\/lease/.test(url)){
      const b=JSON.parse(route.request().postData());
      if(st.leaseHeld)return reply(b.op==='status'?200:409,{ok:b.op==='status',held:true,exists:true,
        fence:st.fence||3,holderDeviceId:'other-dev',deviceName:'iPad',active:true,serverNow:Date.now(),ttlMs:86400000});
      if(b.op==='acquire'||b.op==='steal'){st.fence=st.fence||1;st.holderDev=b.deviceId;
        return reply(200,{ok:true,exists:true,granted:true,fence:st.fence,holderDeviceId:b.deviceId,deviceName:b.deviceName,active:true,serverNow:Date.now(),ttlMs:86400000});}
      return reply(200,{ok:true,exists:true,fence:st.fence||1,holderDeviceId:st.holderDev||null,deviceName:'x',active:true,serverNow:Date.now(),ttlMs:86400000});}
    return reply(200,{items:[],token:'tok',record:{id:'userA'}});};}

async function boot(browser,srv,st,seed,uid){
  const ctx=await browser.newContext();
  await ctx.exposeFunction('__setRev',(r,which)=>{st.rev=r;if(which==='server')st.data=SERVER;});
  await ctx.exposeFunction('__forceCommit',(status,body)=>{st.forceCommit={status,body};});
  await ctx.exposeFunction('__setLeaseHeld',(v)=>{st.leaseHeld=v;});
  await ctx.route('**/api/**',casMock(st));
  if(seed)await ctx.addInitScript((sd)=>{
    if(localStorage.getItem('c17_seeded'))return;
    localStorage.setItem('c17_seeded','1');
    const z=JSON.parse(sd);
    if(z.terminal)localStorage.setItem('wl_core_ack_journal__userA',JSON.stringify(z.terminal));
    if(z.dx)localStorage.setItem('wl_core_dx_journal__userA',JSON.stringify(z.dx));
    if(z.envelope)localStorage.setItem('wl_core_displaced__userA',JSON.stringify(z.envelope));
    if(z.base)localStorage.setItem('wl_core_base__userA',JSON.stringify(z.base));
    if(z.dirty)localStorage.setItem('wl_core_dirty__userA',JSON.stringify(z.dirty));
    if(z.local)localStorage.setItem('wl_v1',z.local);
  },JSON.stringify(seed));
  await ctx.addInitScript((u)=>{
    localStorage.setItem('wl_pb',JSON.stringify({uid:u,base:'https://pb.test',token:'tok',email:'a@x.com'}));
    localStorage.setItem('wl_last_owner',u);
  },uid||'userA');
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://127.0.0.1:'+srv.address().port,{waitUntil:'load'});
  await page.waitForTimeout(900);
  return {ctx,page,errs};}

/* run the export flow to open the gate (download fallback + confirm) */
const doExport=async(page)=>page.evaluate(async()=>{
  m10cxExport();
  await new Promise(r=>setTimeout(r,300));
  if(state.pendingConfirm){const fn=state.pendingConfirm.fn;state.pendingConfirm=null;fn();}
  await new Promise(r=>setTimeout(r,200));
  return m10cxExportGateOpen(m10cxEnvelope().val);
});

(async()=>{
  const html=fs.readFileSync(SRC,'utf8');
  const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch();

  /* T1: handoff for each terminal kind */
  {
    const st={rev:9,data:SERVER,ledger:{},hasRow:true};
    const {ctx,page,errs}=await boot(browser,server,st,seedConflict());
    const s=await page.evaluate(()=>{
      const env=m10cxEnvelope();
      return {state:m10cState(),ack:m10cRead('journal').st,dx:m10cRead('dxjournal').st,
        envSt:env.st,reason:env.val&&env.val.reason,rev:env.val&&env.val.coreRevSeen,
        localW:env.val?JSON.parse(env.val.localData).weights[0].weight:null,
        serverW:env.val&&env.val.serverData?JSON.parse(env.val.serverData).weights[0].weight:null,
        banner:/needs your review/.test(view_overview()),dirty:m10cRead('dirty').st,
        localBytes:JSON.parse(localStorage.getItem('wl_v1')).weights[0].weight};
    });
    test('T1a conflict terminal → envelope (fresh server fetched), journals cleaned, banner',()=>{
      eq(s.state,'displaced');eq(s.ack,'absent');eq(s.dx,'absent');eq(s.envSt,'ok');
      eq(s.reason,'conflict');eq(s.rev,9);eq(s.localW,199);eq(s.serverW,200);
      ok(s.banner);eq(s.dirty,'ok');eq(s.localBytes,199,'local bytes untouched');});
    test('T1a no page errors',()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }
  {
    const seed=seedConflict();
    seed.terminal.outcome='fence-displaced';
    seed.terminal.expect.staleFence=2;delete seed.terminal.expect.serverRev;
    const st={rev:7,data:SERVER,ledger:{},hasRow:true};
    const {ctx,page}=await boot(browser,server,st,seed);
    const s=await page.evaluate(()=>({state:m10cState(),reason:m10cxEnvelope().val.reason,
      rev:m10cxEnvelope().val.coreRevSeen}));
    test('T1b fence-displaced terminal → envelope with the FETCHED server state',()=>{
      eq(s.state,'displaced');eq(s.reason,'fence-displaced');eq(s.rev,7);});
    await ctx.close();
  }
  {
    const seed=seedConflict();
    seed.terminal={owner:'userA',mark:'m10.1',op:'core-bootstrap',phase:'done',outcome:'bootstrap-conflict',
      startedAt:1,expect:{serverRev:9,serverCanon:JSON.stringify(SERVER)}};
    delete seed.base;                    // bootstrap: no base yet
    const st={rev:9,data:SERVER,ledger:{},hasRow:true};
    const {ctx,page}=await boot(browser,server,st,seed);
    const s=await page.evaluate(()=>({state:m10cState(),reason:m10cxEnvelope().val.reason}));
    test('T1c bootstrap-conflict terminal → envelope (reason preserved)',()=>{
      eq(s.state,'displaced');eq(s.reason,'bootstrap-conflict');});
    await ctx.close();
  }
  {
    const seed=seedConflict();
    seed.terminal.outcome='auth';delete seed.terminal.expect.serverRev;
    const st={rev:5,data:EMPTY,ledger:{},hasRow:true};
    const {ctx,page}=await boot(browser,server,st,seed);
    const s=await page.evaluate(()=>({state:m10cState(),ack:m10cRead('journal').st,dirty:m10cRead('dirty').st}));
    test('T1d auth terminal: cleanup-only, never review — the kept dirty re-pushed under the live session',()=>{
      ok(s.state!=='displaced'&&s.state!=='review-pending','not review: '+s.state);
      eq(s.ack,'absent');
      /* cleanup preserved dirty for a fresh push; with a live session the
         boot push then succeeds — the server now holds the local copy */
      eq(s.state,'clean');eq(st.rev,6);ok(st.data.weights[0].weight===199,'server holds the local copy');});
    await ctx.close();
  }

  /* T2: crash arms in the handoff + displace op */
  {
    const arms=[
      {name:'terminal+dx-intent gap (G8)',mk:(seed)=>{seed.dx={owner:'userA',mark:'m10.1',op:'core-displace',phase:'intent',startedAt:1,expect:{reason:'conflict',origRequestId:'m10c-seedreq0000000000000000'}};}},
      {name:'dx net-done (identity captured)',mk:(seed)=>{delete seed.terminal;
        seed.dx={owner:'userA',mark:'m10.1',op:'core-displace',phase:'net-done',startedAt:1,
          expect:{reason:'conflict',coreRevSeen:9,serverCanon:JSON.stringify(SERVER),origRequestId:null}};}},
      {name:'envelope written, dx not cleared',mk:(seed)=>{delete seed.terminal;
        seed.dx={owner:'userA',mark:'m10.1',op:'core-displace',phase:'done',startedAt:1,
          expect:{reason:'conflict',coreRevSeen:9,serverCanon:JSON.stringify(SERVER),origRequestId:null}};
        seed.envelope={owner:'userA',mark:'m10.1',canon:1,enteredAt:1,reason:'conflict',coreRevSeen:9,
          serverData:JSON.stringify(SERVER),localData:JSON.stringify(LOCAL_EDIT),exports:null};}}];
    for(const arm of arms){
      const seed=seedConflict();arm.mk(seed);
      const st={rev:9,data:SERVER,ledger:{},hasRow:true};
      const {ctx,page}=await boot(browser,server,st,seed);
      const s=await page.evaluate(()=>({state:m10cState(),ack:m10cRead('journal').st,
        dx:m10cRead('dxjournal').st,env:m10cxEnvelope().st,dirty:m10cRead('dirty').st}));
      test(`T2 crash at ${arm.name}: boot completes to displaced, no loss`,()=>{
        eq(s.state,'displaced');eq(s.ack,'absent');eq(s.dx,'absent');eq(s.env,'ok');eq(s.dirty,'ok');});
      await ctx.close();
    }
  }

  /* T3: edit during review — envelope follows the live copy; gate closes */
  {
    const st={rev:9,data:SERVER,ledger:{},hasRow:true};
    const {ctx,page}=await boot(browser,server,st,seedConflict());
    const gate1=await doExport(page);
    const s=await page.evaluate(async()=>{
      state.weights.push({date:'2026-08-03',weight:198});save();
      await new Promise(r=>setTimeout(r,300));
      const env=m10cxEnvelope().val;
      return {envW:JSON.parse(env.localData).weights.length,gate:m10cxExportGateOpen(env),
        state:m10cState(),dx:m10cRead('dxjournal').st};
    });
    test('T3 edit during review: envelope local copy refreshed (journaled), gate closed by the edit',()=>{
      ok(gate1===true,'gate was open after export');
      eq(s.envW,2,'refresh captured the edit');ok(s.gate===false,'stale export gate closed');
      eq(s.state,'displaced');eq(s.dx,'absent');});
    await ctx.close();
  }

  /* T4/T5: export gate + Keep-this-device's-copy end to end */
  {
    const st={rev:9,data:SERVER,ledger:{},hasRow:true};
    const {ctx,page}=await boot(browser,server,st,seedConflict());
    const gate=await doExport(page);
    ok(gate===true,'export gate open');
    const s=await page.evaluate(async()=>{
      m10cxPushMine();
      await new Promise(r=>setTimeout(r,600));
      return {state:m10cState(),env:m10cxEnvelope().st,dx:m10cRead('dxjournal').st,
        dirty:m10cRead('dirty').st,base:m10cRead('base').val.rev};
    });
    test('T5 Keep local: pushed at fresh rev, envelope+journal+dirty cleaned, clean at rev 10',()=>{
      eq(s.state,'clean');eq(s.env,'absent');eq(s.dx,'absent');eq(s.dirty,'absent');eq(s.base,10);});
    test('T5 server took the local copy exactly once',()=>{
      eq(st.rev,10);ok(st.data.weights.length===1&&st.data.weights[0].weight===199,'server holds the local copy');
      eq(Object.keys(st.ledger).length,1);});
    await ctx.close();
  }

  /* T6: freshness drift before push-mine → envelope refreshed, NO push */
  {
    const st={rev:9,data:SERVER,ledger:{},hasRow:true};
    const {ctx,page}=await boot(browser,server,st,seedConflict());
    await doExport(page);
    const s=await page.evaluate(async()=>{
      await window.__setRev(12,'server');           // drift after export
      m10cxPushMine();
      await new Promise(r=>setTimeout(r,600));
      const env=m10cxEnvelope().val;
      return {state:m10cState(),rev:env.coreRevSeen,gate:m10cxExportGateOpen(env),commitsNone:true};
    });
    test('T6 drift on the in-action fresh check: envelope re-captured (rev 12), gate reset, zero push',()=>{
      eq(s.state,'displaced');eq(s.rev,12);ok(s.gate===false);eq(st.commits||0,0,'no commit');});
    await ctx.close();
  }

  /* T7: conflict DURING push-mine dispatch → envelope replaced, review stays */
  {
    const st={rev:9,data:SERVER,ledger:{},hasRow:true};
    const {ctx,page}=await boot(browser,server,st,seedConflict());
    await doExport(page);
    const s=await page.evaluate(async()=>{
      window.__forceCommit(409,{ok:false,conflict:true,serverRev:13,payload:{settings:{onboarded:true},weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},statuses:[],presets:[],skips:{},nightlyLog:{}}});
      m10cxPushMine();
      await new Promise(r=>setTimeout(r,600));
      const env=m10cxEnvelope().val;
      return {state:m10cState(),rev:env.coreRevSeen,dx:m10cRead('dxjournal').st,
        gate:m10cxExportGateOpen(env),dirty:m10cRead('dirty').st,
        localW:JSON.parse(localStorage.getItem('wl_v1')).weights[0].weight};
    });
    test('T7 conflict mid-push-mine: envelope replaced (rev 13), gate reset, dirty + local intact',()=>{
      eq(s.state,'displaced');eq(s.rev,13);eq(s.dx,'absent');ok(s.gate===false);
      eq(s.dirty,'ok');eq(s.localW,199);});
    await ctx.close();
  }

  /* T8: fenceStale during push-mine → envelope retained */
  {
    const st={rev:9,data:SERVER,ledger:{},hasRow:true};
    const {ctx,page}=await boot(browser,server,st,seedConflict());
    await doExport(page);
    const s=await page.evaluate(async()=>{
      window.__forceCommit(409,{ok:false,fenceStale:true,fence:4});
      m10cxPushMine();
      await new Promise(r=>setTimeout(r,600));
      return {state:m10cState(),env:m10cxEnvelope().st,dx:m10cRead('dxjournal').st,
        localW:JSON.parse(localStorage.getItem('wl_v1')).weights[0].weight};
    });
    test('T8 fenceStale mid-push-mine: envelope retained, journal cleaned, nothing lost',()=>{
      eq(s.state,'displaced');eq(s.env,'ok');eq(s.dx,'absent');eq(s.localW,199);});
    await ctx.close();
  }

  /* T9: Take the server's copy end to end (unknown fields survive) */
  {
    const st={rev:9,data:SERVER,ledger:{},hasRow:true};
    const {ctx,page}=await boot(browser,server,st,seedConflict());
    await doExport(page);
    const s=await page.evaluate(async()=>{
      m10cxTakeServer();
      await new Promise(r=>setTimeout(r,200));
      if(state.pendingConfirm){const fn=state.pendingConfirm.fn;state.pendingConfirm=null;fn();}
      await new Promise(r=>setTimeout(r,600));
      const local=JSON.parse(localStorage.getItem('wl_v1'));
      return {state:m10cState(),env:m10cxEnvelope().st,dx:m10cRead('dxjournal').st,
        dirty:m10cRead('dirty').st,base:m10cRead('base').val.rev,
        w:local.weights[0].weight,unknown:local.unknownFutureField&&local.unknownFutureField.keep,
        stateW:state.weights[0].weight};
    });
    test('T9 Take server: local replaced verified (unknown fields intact), cleanup, clean at rev 9',()=>{
      eq(s.state,'clean');eq(s.env,'absent');eq(s.dx,'absent');eq(s.dirty,'absent');
      eq(s.base,9);eq(s.w,200);eq(s.unknown,'me');eq(s.stateW,200,'live state reloaded');});
    await ctx.close();
  }

  /* T10: no destructive default — reload + logout leave review unresolved */
  {
    const st={rev:9,data:SERVER,ledger:{},hasRow:true};
    const {ctx,page}=await boot(browser,server,st,seedConflict());
    await page.reload({waitUntil:'load'});
    await page.waitForTimeout(900);
    const s=await page.evaluate(()=>{
      pbLogout();
      const blocked=!!state.pendingConfirm&&/resolve that first/.test(state.pendingConfirm.message);
      state.pendingConfirm=null;
      return {state:m10cState(),env:m10cxEnvelope().st,signedIn:!!pbUid(),logoutBlocked:blocked,
        localW:JSON.parse(localStorage.getItem('wl_v1')).weights[0].weight};
    });
    test('T10 reload keeps the review; logout is blocked; nothing auto-selected',()=>{
      eq(s.state,'displaced');eq(s.env,'ok');ok(s.signedIn,'still signed in');
      ok(s.logoutBlocked,'logout blocked with review prompt');eq(s.localW,199);});
    await ctx.close();
  }

  /* T11: account isolation + A→B→A during push-mine dispatch */
  {
    const st={rev:9,data:SERVER,ledger:{},hasRow:true,commitDelay:500};
    const {ctx,page}=await boot(browser,server,st,seedConflict());
    await doExport(page);
    const s=await page.evaluate(async()=>{
      const envBytes=localStorage.getItem('wl_core_displaced__userA');
      m10cxPushMine();
      await new Promise(r=>setTimeout(r,150));
      const dxBytes=localStorage.getItem('wl_core_dx_journal__userA');
      pbClearSession(true);
      localStorage.setItem('wl_pb',JSON.stringify({uid:'userB',base:'https://pb.test',token:'tok',email:'b@x.com'}));
      const bState=m10cState();
      localStorage.setItem('wl_pb',JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok2',email:'a@x.com'}));
      await new Promise(r=>setTimeout(r,700));
      const bKeys=Object.keys(localStorage).filter(k=>/wl_core_.*__userB/.test(k));
      return {bState,bKeys:bKeys.length,
        envSame:localStorage.getItem('wl_core_displaced__userA')===envBytes,
        dxSame:localStorage.getItem('wl_core_dx_journal__userA')===dxBytes,
        dxPhase:JSON.parse(localStorage.getItem('wl_core_dx_journal__userA')).phase};
    });
    test('T11 A→B→A mid-push-mine: response discarded, dx journal intact for replay, zero B keys, envelope byte-identical',()=>{
      eq(s.bState,'bootstrap');eq(s.bKeys,0);ok(s.envSame,'envelope untouched');
      ok(s.dxSame,'dx journal byte-identical');eq(s.dxPhase,'intent');});
    await ctx.close();
  }

  /* T12: crash injection at every push-mine and take-server phase */
  {
    const pmArms=['net-done','k1','k2','k3'];
    for(const ph of pmArms){
      const seed={
        envelope:ph==='k2'||ph==='k3'?undefined:{owner:'userA',mark:'m10.1',canon:1,enteredAt:1,reason:'conflict',coreRevSeen:9,
          serverData:JSON.stringify(SERVER),localData:JSON.stringify(LOCAL_EDIT),exports:null},
        dx:{owner:'userA',mark:'m10.1',op:'core-push-mine',phase:ph,startedAt:1,
          expect:{expectedRev:9,pushedCanon:JSON.stringify(LOCAL_EDIT),gen:1,fence:1,
            requestId:'m10c-seedpm00000000000000000',newRev:10}},
        base:ph==='net-done'?{owner:'userA',mark:'m10.1',canon:1,rev:5,body:JSON.stringify(EMPTY)}
          :{owner:'userA',mark:'m10.1',canon:1,rev:10,body:JSON.stringify(LOCAL_EDIT)},
        dirty:ph==='k2'||ph==='k3'?undefined:{owner:'userA',mark:'m10.1',gen:1,persistedGen:1,ts:1},
        local:JSON.stringify(LOCAL_EDIT)};
      const st={rev:10,data:LOCAL_EDIT,ledger:{'m10c-seedpm00000000000000000':{rev:10}},hasRow:true};
      const {ctx:c2,page:p2}=await boot(browser,server,st,seed);
      const s2=await p2.evaluate(()=>({state:m10cState(),env:m10cRead('displaced').st,
        dx:m10cRead('dxjournal').st,base:m10cRead('base').val.rev,dirty:m10cRead('dirty').st}));
      test(`T12 push-mine crash at ${ph}: completes to clean, base 10, all cleaned`,()=>{
        eq(s2.state,'clean');eq(s2.env,'absent');eq(s2.dx,'absent');eq(s2.base,10);eq(s2.dirty,'absent');});
      await c2.close();
    }
    const tsArms=['intent','k1','k2','k3'];
    for(const ph of tsArms){
      const adopted=ph!=='intent';
      const seed={
        envelope:ph==='k2'||ph==='k3'?undefined:{owner:'userA',mark:'m10.1',canon:1,enteredAt:1,reason:'conflict',coreRevSeen:9,
          serverData:JSON.stringify(SERVER),localData:JSON.stringify(LOCAL_EDIT),exports:null},
        dx:{owner:'userA',mark:'m10.1',op:'core-take-server',phase:ph,startedAt:1,
          expect:{serverRev:9,serverCanon:JSON.stringify(SERVER)}},
        base:ph==='k2'||ph==='k3'?{owner:'userA',mark:'m10.1',canon:1,rev:9,body:JSON.stringify(SERVER)}
          :{owner:'userA',mark:'m10.1',canon:1,rev:5,body:JSON.stringify(EMPTY)},
        dirty:ph==='k3'?undefined:{owner:'userA',mark:'m10.1',gen:1,persistedGen:1,ts:1},
        local:JSON.stringify(adopted?SERVER:LOCAL_EDIT)};
      const st={rev:9,data:SERVER,ledger:{},hasRow:true};
      const {ctx:c3,page:p3}=await boot(browser,server,st,seed);
      const s3=await p3.evaluate(()=>({state:m10cState(),env:m10cRead('displaced').st,
        dx:m10cRead('dxjournal').st,base:m10cRead('base').val.rev,
        w:JSON.parse(localStorage.getItem('wl_v1')).weights[0].weight}));
      test(`T12 take-server crash at ${ph}: completes to clean at rev 9, server copy live`,()=>{
        eq(s3.state,'clean');eq(s3.env,'absent');eq(s3.dx,'absent');eq(s3.base,9);eq(s3.w,200);});
      await c3.close();
    }
  }

  /* T13: lease change during review — non-holder actions gate; takeover offered */
  {
    const st={rev:9,data:SERVER,ledger:{},hasRow:true,leaseHeld:true};
    const {ctx,page}=await boot(browser,server,st,seedConflict());
    await doExport(page);
    const s=await page.evaluate(async()=>{
      m10cxOpen=true;render();
      const html=m10cxViewHTML();
      const before=localStorage.getItem('wl_core_displaced__userA');
      m10cxPushMine();
      await new Promise(r=>setTimeout(r,300));
      return {offersTakeover:/m10cx:takeover/.test(html),mineDisabled:/disabled/.test(html),
        state:m10cState(),envSame:localStorage.getItem('wl_core_displaced__userA')===before,
        commits:0};
    });
    test('T13 non-holder review: actions disabled, takeover offered, push refused, state unresolved',()=>{
      ok(s.offersTakeover);ok(s.mineDisabled);eq(s.state,'displaced');
      ok(s.envSame);eq(st.commits||0,0,'zero commits');});
    await ctx.close();
  }

  /* T14: storage-failure injection at review transitions */
  {
    // a) envelope write fails during displace k1 → block, dx journal survives
    const st={rev:9,data:SERVER,ledger:{},hasRow:true};
    const seed=seedConflict();
    const {ctx,page}=await boot(browser,server,st,Object.assign(seed,{__noop:1}),undefined);
    const s=await page.evaluate(async()=>{
      // reset to a fresh terminal and re-run the handoff with a blocked envelope write
      m10cRemove('displaced');m10cRemove('dxjournal');
      localStorage.setItem('wl_core_ack_journal__userA',JSON.stringify({owner:'userA',mark:'m10.1',op:'core-ack',phase:'done',outcome:'conflict',startedAt:1,
        expect:{oldBaseCanon:'{}',expectedRev:5,pushedCanon:'{}',gen:1,fence:null,requestId:'m10c-seedreq2000000000000000',serverRev:9}}));
      const orig=localStorage.setItem.bind(localStorage);
      localStorage.setItem=function(k,v){if(/wl_core_displaced__/.test(k))throw new Error('quota');return orig(k,v);};
      m10cHardBlocked=false;
      await new Promise(r=>m10cxHandoff(r));
      localStorage.setItem=orig;
      return {blocked:m10cHardBlocked,reason:m10cBlockReason,dx:m10cRead('dxjournal').st};
    });
    test('T14a envelope write failure: hard block, dx journal survives for retry',()=>{
      ok(s.blocked);ok(/review copies/.test(s.reason),s.reason);eq(s.dx,'ok');});
    await ctx.close();
  }
  {
    // b) refresh write failure → block (edit is still safe in wl_v1)
    const st={rev:9,data:SERVER,ledger:{},hasRow:true};
    const {ctx,page}=await boot(browser,server,st,seedConflict());
    const s=await page.evaluate(async()=>{
      const orig=localStorage.setItem.bind(localStorage);
      localStorage.setItem=function(k,v){if(/wl_core_displaced__/.test(k))throw new Error('quota');return orig(k,v);};
      state.weights.push({date:'2026-08-03',weight:198});save();
      await new Promise(r=>setTimeout(r,300));
      localStorage.setItem=orig;
      return {blocked:window.m8StorageBlocked,
        localW:JSON.parse(localStorage.getItem('wl_v1')).weights.length};
    });
    test('T14b refresh write failure: block raised, the edit itself is safe in wl_v1',()=>{
      ok(s.blocked);eq(s.localW,2);});
    await ctx.close();
  }
  {
    // c) cleanup failure at push-mine k2→k3 (displaced removal blocked) → block, nothing lost
    const st={rev:9,data:SERVER,ledger:{},hasRow:true};
    const {ctx,page}=await boot(browser,server,st,seedConflict());
    await doExport(page);
    const s=await page.evaluate(async()=>{
      const orig=localStorage.removeItem.bind(localStorage);
      localStorage.removeItem=function(k){if(/wl_core_displaced__/.test(k))return;return orig(k);};
      m10cxPushMine();
      await new Promise(r=>setTimeout(r,600));
      localStorage.removeItem=orig;
      return {blocked:m10cHardBlocked,reason:m10cBlockReason,
        base:m10cRead('base').val.rev,serverRev:null};
    });
    test('T14c cleanup failure mid-resolution: hard block (fail closed), base already durable at 10',()=>{
      ok(s.blocked);ok(/resolved review/.test(s.reason),s.reason);eq(s.base,10);});
    await ctx.close();
  }

  /* T15: lost-response push-mine replays with the SAME requestId */
  {
    const st={rev:9,data:SERVER,ledger:{},hasRow:true,dropCommits:true};
    const {ctx,page}=await boot(browser,server,st,seedConflict());
    await doExport(page);
    const rid=await page.evaluate(async()=>{
      m10cxPushMine();
      await new Promise(r=>setTimeout(r,500));
      const j=m10cRead('dxjournal');
      return j.st==='ok'?j.val.expect.requestId:null;
    });
    ok(rid,'dx journal survived the lost response');
    st.dropCommits=false;
    await page.reload({waitUntil:'load'});
    await page.waitForTimeout(1100);
    const s=await page.evaluate(()=>({state:m10cState(),base:m10cRead('base').val.rev,
      env:m10cRead('displaced').st,dx:m10cRead('dxjournal').st}));
    test('T15 lost-response push-mine: reload replays the captured request, single commit, clean',()=>{
      eq(s.state,'clean');eq(s.base,10);eq(s.env,'absent');eq(s.dx,'absent');
      eq(st.rev,10);eq(Object.keys(st.ledger).length,1);ok(st.ledger[rid],'same requestId');});
    await ctx.close();
  }

  await browser.close();server.close();
  console.log(`\nC17-M10 increment 3: ${passed} passed, ${failures.length} failed`);
  process.exit(failures.length?1:0);
})().catch(e=>{console.error('SUITE ERROR',e);process.exit(2);});
