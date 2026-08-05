/* C25 (browser) — D1 fence enforcement, Stage 1 CLIENT half, real Chromium.

       CF_SRC=<file> node tests/browser/c25-fence-stage1.browser.test.js

   Stage 1 makes the client honest about the writer pen BEFORE the server flag
   flips (FENCING_ENFORCED_DEFAULT, cf_m10_shared.js:16). Every arm here asserts
   client behaviour that must already hold with enforcement OFF, so the suite is
   a release gate today and the precondition for the Stage 2 flip.

   F1  the training commit carries fence + deviceId, proven at dispatch
   F2  a 409 fenceStale is classified as displacement, never keyReused
   F3  a device without the pen does not push training at all
   F4  the strict core gate fails closed when the lease never settled
   F5  a captured fence that no longer matches terminalizes instead of dispatching
   F6  losing the pen offers takeover instead of a dead-end toast

   The real-server counterpart (an enforce-mode disposable PocketBase actually
   rejecting an unfenced training commit) is docs/D1-ENFORCE-EVIDENCE.md. */
const path=require('path'),http=require('http'),fs=require('fs');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const SRC=process.env.CF_SRC||path.join(process.env.HOME,'projects','compound-app','index.html');
let passed=0;const failures=[];
const test=(n,f)=>{try{f();passed++;console.log('  ✓ '+n);}catch(e){failures.push(n);console.log('  ✗ '+n+'\n      '+(e&&e.message));}};
const ok=(v,m)=>{if(!v)throw new Error(m||'expected truthy');};
const eq=(a,b,m)=>{if(a!==b)throw new Error((m||'eq')+': '+JSON.stringify(a)+' !== '+JSON.stringify(b));};

const EMPTY={settings:{onboarded:true,units:'lbs'},weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},statuses:[],presets:[],skips:{},nightlyLog:{}};
/* the canonical base bytes the seed pins as "already synced at rev 4" */
const TRAIN_BASE='{"cardioTypes":[],"exercises":[],"liftSessions":{},"routines":[],"sessions":{}}';

/* st controls the mocked server; every training commit is recorded verbatim so
   an arm can assert what the client actually put on the wire. */
function mock(st){
  return async(route)=>{
    const url=route.request().url();
    const reply=(s2,b)=>route.fulfill({status:s2,contentType:'application/json',body:JSON.stringify(b)});
    if(/cf\/writer\/lease/.test(url)){
      const b=JSON.parse(route.request().postData()||'{}');
      if(st.leaseHeld&&b.op!=='steal')
        return reply(b.op==='status'?200:409,{ok:b.op==='status',held:true,exists:true,
          fence:9,holderDeviceId:'other-device',deviceName:'iPad',active:true,
          serverNow:Date.now(),ttlMs:86400000});
      if(b.op==='acquire'||b.op==='steal'){
        st.fence=st.fence||3;st.holderDev=b.deviceId;
        return reply(200,{ok:true,exists:true,granted:true,fence:st.fence,holderDeviceId:b.deviceId,
          deviceName:b.deviceName,active:true,serverNow:Date.now(),ttlMs:86400000});}
      return reply(200,{ok:true,exists:true,fence:st.fence||3,holderDeviceId:st.holderDev||null,
        deviceName:'x',active:true,serverNow:Date.now(),ttlMs:86400000});}
    if(/collections\/appdata\/records/.test(url))
      return reply(200,{items:[{id:'rec1',user:'userA',data:EMPTY,coreRev:1,training:JSON.parse(TRAIN_BASE),trainingRev:4}]});
    if(/cf\/appdata\/commit/.test(url)){
      let body={};try{body=JSON.parse(route.request().postData()||'{}');}catch(e){}
      st.commits=(st.commits||0)+1;
      st.bodies=st.bodies||[];st.bodies.push(body);
      if(body.subsystem==='training'){
        st.training=st.training||[];st.training.push(body);
        if(st.trainingFenceStale)return reply(409,{ok:false,fenceStale:true,fence:st.trainingFenceStale});
        if(st.conflictOnce){st.conflictOnce=false;
          /* a conflict whose payload EQUALS the client's base: the one shape
             that authorizes the single in-journal retry (m8AckOutcome) */
          return reply(409,{ok:false,conflict:true,subsystem:'training',
            serverRev:(body.expectedRev||0)+1,payload:JSON.parse(TRAIN_BASE)});}}
      st.rev=(st.rev||4)+1;
      return reply(200,{ok:true,newRev:st.rev});}
    if(/collections\/photos\/records/.test(url))return reply(200,{items:[]});
    if(/auth-with-password/.test(url))return reply(200,{token:'tok',record:{id:'userA',email:'a@x.com'}});
    return reply(200,{items:[],token:'tok',record:{id:'userA'}});};}

/* a signed-in device with ONE unsynced training generation, proven to disk */
function dirtySeed(uid){
  uid=uid||'userA';
  const s={};
  s['wl_pb']=JSON.stringify({uid:uid,base:'https://pb.test',token:'tok',email:'a@x.com'});
  s['wl_last_owner']=uid;
  s['wl_v1']=JSON.stringify(EMPTY);
  return s;}

/* Build the "one unsynced training generation" state with the PRODUCT's own
   canon/write primitives rather than hand-rolled seed bytes: a hand-written
   base whose canonical form differs by even a key order lands the device in
   `conflict`, and the arm then measures the wrong thing. */
async function makeTrainingDirty(page){
  return await page.evaluate(()=>{
    m8Remove('conflict');
    state.training={cardioTypes:[],exercises:[],liftSessions:{},routines:[],sessions:{}};
    const lc=m8Canon(state.training);
    m8Write('base',{canon:M8_CANON_VER,rev:4,body:lc.canon});
    state.training.exercises.push({id:'e1',name:'Squat',muscles:['quads']});
    saveTrainingLocal();
    m8MarkDirty();
    const d=m8Read('dirty');
    /* prove the generation reached disk, so this is `dirty`, not `dirty-unproven` */
    m8Write('dirty',{gen:d.val.gen,persistedGen:d.val.gen,ts:Date.now()});
    return m8State();});}

/* the same, for the CORE subsystem */
async function makeCoreDirty(page){
  return await page.evaluate(()=>{
    m10cWrite('base',{canon:M10C_CANON_VER,rev:1,body:'{}'});
    m10cWrite('dirty',{gen:1,persistedGen:1,ts:Date.now()});
    return m10cState();});}

async function bootSeed(browser,srv,st,seed,extraInit){
  const ctx=await browser.newContext();
  await ctx.route('**/api/**',mock(st));
  await ctx.addInitScript((sd)=>{
    const z=JSON.parse(sd);
    Object.keys(z).forEach((k)=>{if(z[k]===null)localStorage.removeItem(k);else localStorage.setItem(k,z[k]);});
  },JSON.stringify(seed||{}));
  if(extraInit)await ctx.addInitScript(extraInit);
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://127.0.0.1:'+srv.address().port,{waitUntil:'load'});
  await page.waitForTimeout(900);
  return {ctx,page,errs};}

(async()=>{
  const html=fs.readFileSync(SRC,'utf8');
  const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch();

  /* ---- F1: the holder's training commit is fenced ---- */
  {
    const st={};
    const {ctx,page,errs}=await bootSeed(browser,server,st,dirtySeed());
    const st0=await makeTrainingDirty(page);
    const s=await page.evaluate(async()=>{
      const before={booted:M10.booted,holder:M10.holder,fence:M10.fence,state:m8State()};
      m8Push();
      await new Promise(r=>setTimeout(r,600));
      return {before:before,dev:localStorage.getItem('wl_m10_deviceid')};});
    const sent=(st.training||[])[0];
    test('F1 the device booted, holds the pen, and starts dirty',()=>{
      eq(s.before.booted,true,'M10.booted');
      eq(s.before.holder,true,'M10.holder');
      eq(st0,'dirty','m8State after setup');
      eq(s.before.state,'dirty','m8State');});
    test('F1 the training commit reached the server',()=>ok(sent,'no training commit was sent'));
    test('F1 it carries the HELD fence',()=>eq(sent&&sent.fence,3,'body.fence'));
    test('F1 it carries THIS installation\'s deviceId',()=>{
      eq(sent&&sent.deviceId,s.dev,'body.deviceId vs wl_m10_deviceid');
      ok(/^dev-[a-z0-9]{24}$/.test(s.dev||''),'device id grammar: '+s.dev);});
    test('F1 no page errors',()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }

  /* ---- F1 fail-closed: no verified deviceId ⇒ no unfenced training write ----
     The id is made unreadable the way real storage damage makes it unreadable:
     a persisted value that fails the exact grammar, which m10DeviceId() must
     refuse to silently replace (K5). */
  {
    const st={};
    const seed=dirtySeed();seed['wl_m10_deviceid']='not-a-valid-device-id';
    const {ctx,page,errs}=await bootSeed(browser,server,st,seed);
    await makeTrainingDirty(page);
    const s=await page.evaluate(async()=>{
      const dev=(typeof m10DeviceId==='function')?m10DeviceId():'fn-missing';
      m8Push();
      await new Promise(r=>setTimeout(r,600));
      return {dev:dev,corrupt:M10.corrupt,why:m10AuthNow().why,
        dirty:localStorage.getItem('wl_training_dirty__userA'),
        hard:!!window.m8HardBlocked};});
    test('F1 a malformed stored device id is refused, not replaced',()=>eq(s.dev,null,'m10DeviceId()'));
    /* what ACTUALLY refuses the push here: an unverifiable installation
       identity marks the installation corrupt, and the pen gate refuses on
       corrupt before it ever reaches the holder test. Named explicitly because
       a mutation proved the deviceId re-check in m8HasPen() could never fire. */
    test('F1 an unverifiable identity marks the installation corrupt',()=>
      eq(s.corrupt,true,'M10.corrupt'));
    test('F1 the pen gate refuses for THAT reason',()=>eq(s.why,'corrupt','m10AuthNow().why'));
    test('F1 fail-closed: zero training commits without a device identity',()=>
      eq((st.training||[]).length,0,'training commits: '+JSON.stringify(st.training||[])));
    test('F1 fail-closed leaves the work local and dirty',()=>ok(s.dirty,'dirty marker was cleared'));
    test('F1 fail-closed does not hard-block the device',()=>eq(s.hard,false,'m8HardBlocked'));
    test('F1 fail-closed: no page errors',()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }

  /* ---- F3b (ruling, blocking finding 2): pen-less journal recovery under
     enforcement OFF — ZERO requests, journal BYTE-IDENTICAL, takeover
     surfaced. The round-1 design dispatched the replay unfenced and reasoned
     from the enforcement-ON server; the ruling is that while production
     enforcement is OFF such a replay is ACCEPTED and mutates data. ---- */
  {
    const st={leaseHeld:true};
    const {ctx,page,errs}=await bootSeed(browser,server,st,dirtySeed());
    const s=await page.evaluate(async()=>{
      m8Write('base',{canon:M8_CANON_VER,rev:4,body:'{}'});
      m8Write('journal',{op:'ack',phase:'intent',startedAt:Date.now(),
        expect:{oldBaseCanon:'{}',expectedRev:4,pushedCanon:'{"a":1}',gen:9,requestId:'replay-c25'}});
      const jBefore=localStorage.getItem('wl_training_journal__userA');
      const syncSeen=[];const oSet2=window.setSync;
      window.setSync=function(st2,msg){syncSeen.push(st2+':'+(msg||''));return oSet2&&oSet2.apply(this,arguments);};
      m8Push();
      await new Promise(r=>setTimeout(r,700));
      window.setSync=oSet2;
      return {holder:M10.holder,
        jBefore:jBefore,jAfter:localStorage.getItem('wl_training_journal__userA'),
        syncSeen:syncSeen,hard:!!window.m8HardBlocked};});
    test('F3b the recovering device does NOT hold the pen',()=>eq(s.holder,false,'M10.holder'));
    test('F3b ZERO requests leave the client',()=>
      eq((st.training||[]).length,0,'training commits: '+JSON.stringify(st.training||[])));
    test('F3b the journal is preserved BYTE-IDENTICAL',()=>{
      ok(s.jAfter,'journal deleted');eq(s.jAfter,s.jBefore,'journal bytes');});
    test('F3b the takeover path is surfaced, not a dead end',()=>
      ok(s.syncSeen.some(x=>/take over/i.test(x)),'setSync saw: '+s.syncSeen.join(' | ')));
    test('F3b refusing recovery is not a block',()=>eq(s.hard,false,'m8HardBlocked'));
    test('F3b no page errors',()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }

  /* ---- F3c (required evidence 3): after this installation reacquires the
     pen, EXACTLY ONE fenced replay resolves the journal. Both terminal
     histories (server-applied and server-not-applied) are pinned by
     c11m8-replay F7-1..F7-5, which now runs with a granted pen. ---- */
  {
    const st={leaseHeld:true};
    const {ctx,page,errs}=await bootSeed(browser,server,st,dirtySeed());
    const s=await page.evaluate(async()=>{
      m8Write('base',{canon:M8_CANON_VER,rev:4,body:'{}'});
      m8Write('journal',{op:'ack',phase:'intent',startedAt:Date.now(),
        expect:{oldBaseCanon:'{}',expectedRev:4,pushedCanon:'{"a":1}',gen:9,requestId:'replay-c25c'}});
      m8Push();
      await new Promise(r=>setTimeout(r,500));
      return {refusedStill:!!localStorage.getItem('wl_training_journal__userA')};});
    const before=(st.training||[]).length;
    st.leaseHeld=false;                    /* the other session releases */
    const s2=await page.evaluate(async()=>{
      /* the other session releases; this device takes the pen through the
         product's own boot path */
      await m10Boot();
      m8Push();
      await new Promise(r=>setTimeout(r,700));
      return {holder:M10.holder,fence:M10.fence,
        journal:localStorage.getItem('wl_training_journal__userA'),
        dev:localStorage.getItem('wl_m10_deviceid')};});
    const replays=(st.training||[]).slice(before).filter(b=>b.idempotencyKey==='replay-c25c');
    test('F3c the journal survived the refused window',()=>eq(s.refusedStill,true,'journal'));
    test('F3c the device then holds the pen',()=>{eq(s2.holder,true,'M10.holder');ok(s2.fence>=1,'fence');});
    test('F3c EXACTLY ONE replay was dispatched',()=>eq(replays.length,1,'replays: '+replays.length));
    test('F3c it carries fence AND this deviceId',()=>{
      eq(replays[0]&&replays[0].fence,s2.fence,'fence');
      eq(replays[0]&&replays[0].deviceId,s2.dev,'deviceId');});
    test('F3c the journal resolved',()=>eq(s2.journal,null,'journal: '+s2.journal));
    test('F3c no page errors',()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }

  /* ---- F2: a 409 fenceStale is displacement, NOT a reused request key ---- */
  {
    const st={trainingFenceStale:11};
    const {ctx,page,errs}=await bootSeed(browser,server,st,dirtySeed());
    const st2=await makeTrainingDirty(page);
    const s=await page.evaluate(async()=>{
      const seen=[];const t=window.toast;window.toast=function(m){seen.push(String(m));return t&&t.apply(this,arguments);};
      m8Push();
      await new Promise(r=>setTimeout(r,700));
      return {toasts:seen,hard:!!window.m8HardBlocked,blocked:!!window.m8StorageBlocked,
        dirty:localStorage.getItem('wl_training_dirty__userA'),
        journal:localStorage.getItem('wl_training_journal__userA'),
        sync:(document.body.innerText||'')};});
    test('F2 the device starts dirty and holding the pen',()=>eq(st2,'dirty','m8State'));
    test('F2 the fenced commit was attempted',()=>{
      eq((st.training||[]).length,1,'training commits');
      eq((st.training||[])[0].fence,3,'body.fence');});
    test('F2 a displaced writer is never hard-blocked',()=>{
      eq(s.hard,false,'m8HardBlocked');eq(s.blocked,false,'m8StorageBlocked');});
    test('F2 it is not reported as a request-key integrity fault',()=>
      ok(!/key reused|integrity error/i.test(s.toasts.join('|')+s.sync),'saw: '+s.toasts.join('|')));
    test('F2 the unsynced work survives for a later takeover',()=>ok(s.dirty,'dirty marker was cleared'));
    test('F2 nothing is left to recover — the journal ended',()=>eq(s.journal,null,'journal: '+s.journal));
    test('F2 no page errors',()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }

  /* ---- F3: another device holds the pen ⇒ no training push at all ---- */
  {
    const st={leaseHeld:true};
    const {ctx,page,errs}=await bootSeed(browser,server,st,dirtySeed());
    await makeTrainingDirty(page);
    const s=await page.evaluate(async()=>{
      /* a journal WRITE is the observable difference between "refused before
         minting a request identity" and "dispatched, rejected, then cleaned
         up" — both of which leave zero surviving journals behind */
      const writes=[];
      const oSet=Storage.prototype.setItem;
      Storage.prototype.setItem=function(k,v){writes.push(String(k));return oSet.call(this,k,v);};
      const before={holder:M10.holder,state:m8State()};
      m8Push();
      await new Promise(r=>setTimeout(r,600));
      Storage.prototype.setItem=oSet;
      return {before:before,dirty:localStorage.getItem('wl_training_dirty__userA'),
        journal:localStorage.getItem('wl_training_journal__userA'),
        journalWrites:writes.filter(k=>/wl_training_journal__/.test(k)).length,
        hard:!!window.m8HardBlocked};});
    test('F3 the device is dirty but does NOT hold the pen',()=>{
      eq(s.before.holder,false,'M10.holder');
      eq(s.before.state,'dirty','m8State');});
    test('F3 zero training commits from a read-only device',()=>
      eq((st.training||[]).length,0,'training commits: '+JSON.stringify(st.training||[])));
    test('F3 no request identity was minted and no journal written',()=>{
      eq(s.journalWrites,0,'journal writes observed: '+s.journalWrites);
      eq(s.journal,null,'journal: '+s.journal);});
    test('F3 the edit stays local and dirty',()=>ok(s.dirty,'dirty marker was cleared'));
    test('F3 refusing to push is not a block',()=>eq(s.hard,false,'m8HardBlocked'));
    test('F3 no page errors',()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }

  /* ---- F7 (ruling, blocking finding 3 + required evidence 4): DIRECT
     m8CxChooseLocal() without authority — zero request id, zero new journal,
     zero network mutation, conflict data preserved. The click-layer M10_GATED
     entry is UX; this proves the COMMAND boundary refuses a programmatic
     caller. ---- */
  {
    const st={leaseHeld:true};
    const {ctx,page,errs}=await bootSeed(browser,server,st,dirtySeed());
    const s=await page.evaluate(async()=>{
      /* a real conflict record with fresh export evidence, via the product's
         own write primitive */
      m8Write('conflict',{canon:M8_CANON_VER,enteredAt:1754400000000,reason:'t',
        serverRev:4,serverAtEntry:'{}',localAtEntry:'{}',
        exports:{serverDone:true,localDone:true,localGen:m8Gen}});
      const cxBefore=localStorage.getItem('wl_training_conflict__userA');
      const writes=[];const asks=[];
      const oSet=Storage.prototype.setItem;
      Storage.prototype.setItem=function(k,v){writes.push(String(k));return oSet.call(this,k,v);};
      const oAsk=window.askConfirm;window.askConfirm=function(m){asks.push(String(m));};
      m8CxChooseLocal();
      await new Promise(r=>setTimeout(r,500));
      Storage.prototype.setItem=oSet;window.askConfirm=oAsk;
      return {holder:M10.holder,
        journalWrites:writes.filter(k=>/wl_training_journal__/.test(k)).length,
        cxAfter:localStorage.getItem('wl_training_conflict__userA'),cxBefore:cxBefore,
        asks:asks};});
    test('F7 the direct caller does NOT hold the pen',()=>eq(s.holder,false,'M10.holder'));
    test('F7 zero request identity minted, zero journal written',()=>
      eq(s.journalWrites,0,'journal writes: '+s.journalWrites));
    test('F7 zero network mutation',()=>
      eq((st.training||[]).length,0,'training commits: '+JSON.stringify(st.training||[])));
    test('F7 the conflict record is preserved byte-identical',()=>
      eq(s.cxAfter,s.cxBefore,'conflict bytes'));
    test('F7 takeover is offered at the command boundary',()=>{
      eq(s.asks.length,1,'askConfirm calls: '+s.asks.length);
      ok(/take over/i.test(s.asks[0]||''),'prompt: '+s.asks[0]);});
    test('F7 no page errors',()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }

  /* ---- F7b (required evidence 5): m8CxChooseLocal WITH authority — the
     dispatch carries fence and this installation's deviceId ---- */
  {
    const st={};
    const {ctx,page,errs}=await bootSeed(browser,server,st,dirtySeed());
    const s=await page.evaluate(async()=>{
      m8Write('base',{canon:M8_CANON_VER,rev:4,body:'{}'});
      m8Write('conflict',{canon:M8_CANON_VER,enteredAt:1754400000000,reason:'t',
        serverRev:4,serverAtEntry:'{}',localAtEntry:'{}',
        exports:{serverDone:true,localDone:true,localGen:m8Gen}});
      m8CxChooseLocal();
      await new Promise(r=>setTimeout(r,600));
      return {holder:M10.holder,fence:M10.fence,dev:localStorage.getItem('wl_m10_deviceid')};});
    const sent=(st.training||[])[0];
    test('F7b the holder\'s choose-local commit went out',()=>ok(sent,'no commit sent'));
    test('F7b it carries the held fence and this deviceId',()=>{
      eq(sent&&sent.fence,s.fence,'fence');
      eq(sent&&sent.deviceId,s.dev,'deviceId');});
    test('F7b no page errors',()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }

  /* ---- F8 (required evidence 6, retry path): a push that conflicts against a
     server copy matching base retries ONCE with a fresh requestId — and BOTH
     attempts carry the wire proof ---- */
  {
    const st={};
    const {ctx,page,errs}=await bootSeed(browser,server,st,dirtySeed());
    const st0=await makeTrainingDirty(page);
    st.conflictOnce=true;                 /* mock: first training commit 409-conflicts
                                             with payload === current base ('{}'... ) */
    const s=await page.evaluate(async()=>{
      m8Push();
      await new Promise(r=>setTimeout(r,800));
      return {dev:localStorage.getItem('wl_m10_deviceid'),fence:M10.fence,
        state:m8State()};});
    const tr=(st.training||[]);
    test('F8 the conflict retry dispatched a second attempt',()=>
      eq(tr.length,2,'training commits: '+tr.length));
    test('F8 both attempts are fenced with this deviceId',()=>{
      tr.forEach((b,i)=>{eq(b.fence,s.fence,'fence #'+i);eq(b.deviceId,s.dev,'deviceId #'+i);});});
    test('F8 fresh request identity on the retry',()=>
      ok(tr.length===2&&tr[0].idempotencyKey!==tr[1].idempotencyKey,'requestIds: '+tr.map(b=>b.idempotencyKey).join(',')));
    test('F8 no page errors',()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }

  /* ---- F4: the strict core gate fails CLOSED when the lease never settled ----
     Reproduces the mid-session-login bug directly: booted false, so the old
     gate's `M10.booted &&` term made the whole refusal false and the push went
     out with fence:null. */
  {
    const st={};
    const {ctx,page,errs}=await bootSeed(browser,server,st,dirtySeed());
    const cst=await makeCoreDirty(page);
    const s=await page.evaluate(async()=>{
      const commitsBefore=(window.__c25commits||0);
      M10.booted=false;M10.holder=false;M10.fence=0;M10.deadline=0;
      let refused=null;
      m10cPush(false,function(okv){refused=okv;});
      await new Promise(r=>setTimeout(r,500));
      return {refused:refused,commitsBefore:commitsBefore};});
    test('F4 the core genuinely has something to push',()=>eq(cst,'dirty','m10cState'));
    test('F4 an unsettled lease refuses the core push',()=>eq(s.refused,false,'m10cPush result'));
    test('F4 no UNFENCED commit escaped while the lease was unsettled',()=>{
      const bad=(st.bodies||[]).filter(b=>b.fence===null||b.fence===undefined);
      eq(bad.length,0,'unfenced commits: '+JSON.stringify(bad));});
    test('F4 the unsettled session put nothing at all on the commit route',()=>
      eq((st.commits||0),0,'commits: '+(st.commits||0)));
    test('F4 no page errors',()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }

  /* ---- F4: signing in MID-SESSION settles the lease ---- */
  {
    const st={};
    const seed=dirtySeed();delete seed['wl_pb'];        /* boot signed out */
    const {ctx,page,errs}=await bootSeed(browser,server,st,seed);
    const s=await page.evaluate(async()=>{
      const bootedAtLoad=M10.booted;
      /* drive the product's own login submit path through its real inputs */
      const em=document.getElementById('wl-pb-email'),pw=document.getElementById('wl-pb-pass');
      if(em)em.value='a@x.com';if(pw)pw.value='pw-12345';
      if(typeof pbDoLogin==='function')pbDoLogin();
      await new Promise(r=>setTimeout(r,1500));
      return {bootedAtLoad:bootedAtLoad,booted:M10.booted,holder:M10.holder,fence:M10.fence,
        hasLogin:typeof pbDoLogin==='function'&&!!em&&!!pw,signedIn:syncOn()};});
    test('F4 the lease is unsettled while signed out',()=>eq(s.bootedAtLoad,false,'M10.booted at load'));
    test('F4 the login continuation settles the lease',()=>{
      ok(s.hasLogin,'pbDoLogin/login inputs not reachable — arm cannot run');
      eq(s.signedIn,true,'the login itself must have succeeded');
      eq(s.booted,true,'M10.booted after login');});
    test('F4 the freshly signed-in device holds a real fence',()=>{
      eq(s.holder,true,'M10.holder');ok(s.fence>=1,'fence: '+s.fence);});
    test('F4 login: no page errors',()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }

  /* ---- F5: a captured fence that no longer matches never goes on the wire ---- */
  {
    const st={};
    const {ctx,page,errs}=await bootSeed(browser,server,st,dirtySeed());
    const s=await page.evaluate(async()=>{
      const commitsBefore=window.__seenCore=0;
      /* the device holds fence 3; the journal was captured at fence 2 */
      const j={op:'core-ack',phase:'intent',startedAt:Date.now(),
        expect:{oldBaseCanon:'{}',expectedRev:1,pushedCanon:'{}',gen:1,fence:2,requestId:'req-c25'}};
      let res=null;
      const ctx2=m10cCtx();
      m10cDispatch(j,{},function(okv){res=okv;},ctx2);
      await new Promise(r=>setTimeout(r,500));
      return {held:M10.fence,res:res,commitsBefore:commitsBefore};});
    test('F5 the device holds a DIFFERENT fence than the journal captured',()=>eq(s.held,3,'M10.fence'));
    test('F5 the stale-fenced request is refused locally',()=>eq(s.res,false,'dispatch result'));
    test('F5 it never reached the commit route',()=>
      eq((st.commits||0),0,'commits: '+(st.commits||0)));
    test('F5 no page errors',()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }

  /* ---- F6: an expired pen offers takeover instead of a dead-end toast ---- */
  {
    const st={};
    const {ctx,page,errs}=await bootSeed(browser,server,st,dirtySeed());
    const s=await page.evaluate(async()=>{
      const toasts=[];const asks=[];
      const t=window.toast;window.toast=function(m){toasts.push(String(m));};
      const a=window.askConfirm;window.askConfirm=function(m){asks.push(String(m));};
      const reasonExpired=m10GateReason('expired');
      const reasonCorrupt=m10GateReason('corrupt');
      M10.deadline=0;                                   /* the pen lapsed */
      const why=m10AuthNow().why;
      const allowed=m10GateAction('weight:add');
      window.toast=t;window.askConfirm=a;
      return {reasonExpired:reasonExpired,reasonCorrupt:reasonCorrupt,why:why,
        allowed:allowed,toasts:toasts,asks:asks};});
    test('F6 an expired pen is diagnosed as expired',()=>eq(s.why,'expired','m10AuthNow().why'));
    test('F6 the action is still refused',()=>eq(s.allowed,false,'m10GateAction'));
    test('F6 expired no longer dead-ends in a toast',()=>{
      eq(s.reasonExpired,null,'m10GateReason("expired")');
      eq(s.toasts.length,0,'toasted: '+s.toasts.join('|'));});
    test('F6 it offers takeover instead',()=>{
      eq(s.asks.length,1,'askConfirm calls: '+s.asks.length);
      ok(/take over/i.test(s.asks[0]||''),'prompt: '+s.asks[0]);});
    test('F6 genuinely unrecoverable reasons still toast',()=>
      ok(/read-only/i.test(s.reasonCorrupt||''),'corrupt reason: '+s.reasonCorrupt));
    test('F6 no page errors',()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }

  await browser.close();server.close();
  console.log(`\nC25 fence Stage 1: ${passed} passed, ${failures.length} failed`);
  process.exit(failures.length?1:0);
})().catch(e=>{console.error('SUITE ERROR',e);process.exit(2);});
