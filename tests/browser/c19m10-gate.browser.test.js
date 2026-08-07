/* C19-M10 (browser) — increment 5: the gate surface, real Chromium.

       CF_SRC=<file> node tests/browser/c19m10-gate.browser.test.js

   Round-28 list: complete m10Gate coverage of the enumerated action surface;
   fresh account/generation/holder/deadline/fence validation at delayed
   asynchronous boundaries; logout coupling with every M10 journal and pending
   obligation; fail-closed behavior when gate state or storage is unavailable.
   The inventory itself (action → gate → test) is INCR5-ACTION-INVENTORY.md. */
const path=require('path'),http=require('http'),fs=require('fs');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const SRC=process.env.CF_SRC||'/home/griffin/projects/compound-app/index.html';
/* ---- artifact self-verification (Architect Stage 2A preflight item 7,
   2026-08-07): every M10 suite must PROVE which artifact it loaded. Prints
   the resolved path, build id and sha256; when the runner supplies
   CF_EXPECT_BUILD, a mismatch is a hard exit — this is the guard that would
   have caught the parked-artifact defect on 2026-08-04. */
const _SRCBUF=require('fs').readFileSync(SRC);
const SRC_SHA=require('crypto').createHash('sha256').update(_SRCBUF).digest('hex');
const SRC_BUILD=((_SRCBUF.toString('utf8').match(/APP_BUILD="([^"]+)"/)||[])[1])||'UNKNOWN';
console.log('ARTIFACT '+SRC+'\n         build='+SRC_BUILD+' sha256='+SRC_SHA.slice(0,16));
if(process.env.CF_EXPECT_BUILD&&SRC_BUILD!==process.env.CF_EXPECT_BUILD){
  console.error('ARTIFACT MISMATCH: runner expected '+process.env.CF_EXPECT_BUILD+', suite loaded '+SRC_BUILD);
  process.exit(3);
}

let passed=0;const failures=[];
const test=(n,f)=>{try{f();passed++;console.log('  ✓ '+n);}catch(e){failures.push(n);console.log('  ✗ '+n+'\n      '+(e&&e.message));}};
const ok=(v,m)=>{if(!v)throw new Error(m||'expected truthy');};
const eq=(a,b,m)=>{if(a!==b)throw new Error((m||'eq')+': '+JSON.stringify(a)+' !== '+JSON.stringify(b));};
const EMPTY={settings:{onboarded:true,units:'lbs'},weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},statuses:[],presets:[],skips:{},nightlyLog:{}};

function mock(st){
  return async(route)=>{
    const url=route.request().url();
    const reply=(s2,b)=>route.fulfill({status:s2,contentType:'application/json',body:JSON.stringify(b)});
    if(/cf\/writer\/lease/.test(url)){
      const b=JSON.parse(route.request().postData());
      if(st.leaseHeld)return reply(b.op==='status'?200:409,{ok:b.op==='status',held:true,exists:true,
        fence:3,holderDeviceId:'other',deviceName:'iPad',active:true,serverNow:Date.now(),ttlMs:86400000});
      if(b.op==='acquire'||b.op==='steal'){st.fence=st.fence||1;st.holderDev=b.deviceId;
        return reply(200,{ok:true,exists:true,granted:true,fence:st.fence,holderDeviceId:b.deviceId,deviceName:b.deviceName,active:true,serverNow:Date.now(),ttlMs:86400000});}
      return reply(200,{ok:true,exists:true,fence:st.fence||1,holderDeviceId:st.holderDev||null,deviceName:'x',active:true,serverNow:Date.now(),ttlMs:86400000});}
    if(/collections\/appdata\/records/.test(url))
      return reply(200,{items:[{id:'rec1',user:'userA',data:EMPTY,coreRev:1,training:null,trainingRev:0}]});
    if(/cf\/appdata\/commit/.test(url)){st.commits=(st.commits||0)+1;st.rev=(st.rev||1)+1;
      /* round-34: the training and core subsystems share this route, so count
         them separately — a T17 arm asserting "zero network writes" must not
         be satisfied or broken by unrelated core traffic */
      try{if(JSON.parse(route.request().postData()||'{}').subsystem==='training')
        st.trainingCommits=(st.trainingCommits||0)+1;}catch(e){}
      return reply(200,{ok:true,newRev:st.rev});}
    if(/collections\/photos\/records/.test(url))return reply(200,{items:[]});
    return reply(200,{items:[],token:'tok',record:{id:'userA'}});};}

async function boot(browser,srv,st,uid){
  const ctx=await browser.newContext();
  await ctx.route('**/api/**',mock(st));
  await ctx.addInitScript((u)=>{
    localStorage.setItem('wl_pb',JSON.stringify({uid:u,base:'https://pb.test',token:'tok',email:'a@x.com'}));
    localStorage.setItem('wl_last_owner',u);
    localStorage.setItem('wl_v1',JSON.stringify({settings:{onboarded:true,units:'lbs'},weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},statuses:[],presets:[],skips:{},nightlyLog:{}}));
  },uid||'userA');
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://127.0.0.1:'+srv.address().port,{waitUntil:'load'});
  await page.waitForTimeout(900);
  return {ctx,page,errs};}

/* boot with an EXACT localStorage seed, applied once (so a reload performed by
   a recovery screen does not re-seed the keys under test) */
async function bootSeed(browser,srv,st,seed){
  const ctx=await browser.newContext();
  await ctx.route('**/api/**',mock(st));
  await ctx.addInitScript((sd)=>{
    if(localStorage.getItem('c19_seeded'))return;
    localStorage.setItem('c19_seeded','1');
    const z=JSON.parse(sd);
    Object.keys(z).forEach((k)=>{
      if(z[k]===null)localStorage.removeItem(k);else localStorage.setItem(k,z[k]);});
  },JSON.stringify(seed));
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://127.0.0.1:'+srv.address().port,{waitUntil:'load'});
  await page.waitForTimeout(900);
  return {ctx,page,errs};}

/* round-34: a boot with controllable localStorage faults on top of an exact
   seed. Same mechanism the accepted c11m8-faults suite uses — Storage.prototype
   is patched in the PAGE, before the app loads, so the product's own writes
   fail the way a full/faulty store makes them fail. Nothing product-side. */
async function bootFaulty(browser,srv,st,seed){
  const ctx=await browser.newContext();
  await ctx.route('**/api/**',mock(st));
  await ctx.addInitScript((sd)=>{
    window.__denySet=[];window.__denyOnce={};
    const oSet=Storage.prototype.setItem;
    Storage.prototype.setItem=function(k,v){
      if((window.__denySet||[]).some(rx=>new RegExp(rx).test(k)))
        throw new DOMException('quota','QuotaExceededError');
      const n=window.__denyOnce&&window.__denyOnce[k];
      if(typeof n==='number'){
        window.__denyOnce[k]=n-1;
        if(n<=0)throw new DOMException('quota','QuotaExceededError');}
      return oSet.call(this,k,v);};
    const z=JSON.parse(sd);
    Object.keys(z).forEach((k)=>{
      if(z[k]===null)localStorage.removeItem(k);else localStorage.setItem(k,z[k]);});
  },JSON.stringify(seed));
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://127.0.0.1:'+srv.address().port,{waitUntil:'load'});
  await page.waitForTimeout(900);
  return {ctx,page,errs};}

/* a device whose LAST edit was never proven to reach disk: m8Boot derives the
   SOFT (unproven) block from these exact bytes, for real, with no test hook. */
const TRAIN0='{"cardioTypes":["Peloton"],"exercises":[],"liftSessions":{},"routines":[],"sessions":{}}';
function softSeed(uid){
  uid=uid||'userA';
  const s={};
  s['wl_pb']=JSON.stringify({uid:uid,base:'https://pb.test',token:'tok',email:'a@x.com'});
  s['wl_last_owner']=uid;
  s['wl_v1']=JSON.stringify(EMPTY);
  s['wl_training_v1']=TRAIN0;
  s['wl_training_dirty__'+uid]=JSON.stringify({owner:uid,mark:'m8.1',gen:7,persistedGen:5,ts:1});
  return s;}

(async()=>{
  const html=fs.readFileSync(SRC,'utf8');
  const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch();

  /* T1: the inventory is complete — every mutating dispatcher branch is gated */
  {
    const st={};
    const {ctx,page,errs}=await boot(browser,server,st);
    const s=await page.evaluate(()=>({gated:Object.keys(M10_GATED).length,
      hasCore:!!M10_GATED['weight:add']&&!!M10_GATED['wo:log']&&!!M10_GATED['wo:finish']&&!!M10_GATED['day:clear']
        &&!!M10_GATED['wo:start']&&!!M10_GATED['wo:startroutine']&&!!M10_GATED['wo:endrest']&&!!M10_GATED['wu:yes']
        &&!!M10_GATED['wo:finishlater']&&!!M10_GATED['day:reopendo'],   /* sync:pasteapply retired with multi-athlete */
      hasDeferred:!!M10_GATED['photo:add']&&!!M10_GATED['import']&&!!M10_GATED['reset:ask'],
      pureNotGated:!M10_GATED['nav:go']&&!M10_GATED['cal:sel'],
      photoViewOpen:!M10_GATED['photo:view'],
      /* merge 2026-08-03: the ratings + weekly check-in actions that persist */
      hasFeelCi:!!M10_GATED['rat:set']&&!!M10_GATED['ci:send']&&!!M10_GATED['ci:skipyes']&&!!M10_GATED['ci:unskip'],
      ciViewOpen:!M10_GATED['ci:open']&&!M10_GATED['ci:close']&&!M10_GATED['ci:skipask']
        &&!M10_GATED['ci:skipcancel']&&!M10_GATED['dl:open'],
      recoveryExempt:!M10_GATED['lrec:restore']&&!M10_GATED['lrec:finish']&&!M10_GATED['adopt:yes']}));
    /* 128 since the multi-athlete retirement: conn:remove, invite:create,
       invite:join and sync:pasteapply were REMOVED from the app entirely
       (zero references in the artifact), so they cannot be gated. Verified
       2026-08-07 by diffing the inventory against the Aug 4 artifact this
       suite used to load by default. */
    test('T1 gate inventory loaded (128 actions; boot-recovery + read-only viewing deliberately excluded)',()=>{
      eq(s.gated,128);ok(s.hasCore);ok(s.hasDeferred);ok(s.pureNotGated);
      ok(s.hasFeelCi,'rat:set / ci:send / ci:skipyes / ci:unskip all persist and must be gated');
      ok(s.ciViewOpen,'opening, closing and the skip prompt persist nothing and stay open');
      ok(s.photoViewOpen,'read-only photo viewing stays open (STRICT allows reading)');
      ok(s.recoveryExempt,'terminal boot-recovery actions exempt — they run pre-lease (round-31 ruling 5)');});
    test('T1 no page errors',()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }

  /* T2: a non-holder's gated action never reaches the app dispatcher */
  {
    const st={leaseHeld:true};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      const before=state.weights.length;
      const b=document.createElement('button');
      b.setAttribute('data-act','weight:add');document.body.appendChild(b);
      b.click();
      await new Promise(r=>setTimeout(r,200));
      const sheet=state.pendingConfirm?state.pendingConfirm.message:'';
      return {holder:M10.holder,before,after:state.weights.length,sheet};
    });
    test('T2 non-holder: the gated action is intercepted and the takeover sheet is offered',()=>{
      ok(!s.holder);eq(s.after,s.before,'no mutation');ok(/active writer/.test(s.sheet));});
    await ctx.close();
  }

  /* T3: the holder's gated action proceeds normally */
  {
    const st={};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      const b=document.createElement('button');
      b.setAttribute('data-act','sum:toggle');document.body.appendChild(b);
      const before=state.sumOpen;
      b.click();
      await new Promise(r=>setTimeout(r,200));
      return {holder:M10.holder,changed:state.sumOpen!==before};
    });
    test('T3 holder: gated actions run unchanged',()=>{ok(s.holder);ok(s.changed);});
    await ctx.close();
  }

  /* T4: fail-closed when the gate state is unavailable */
  {
    for(const [name,setup] of [
      ['corrupt identity',()=>{M10.corrupt=true;}],
      ['storage blocked',()=>{m10cBlock('test');}],
      ['deadline expired',()=>{M10.deadline=performance.now()-1;}],
      ['fence missing',()=>{M10.fence=0;}]]){
      const st={};
      const {ctx,page}=await boot(browser,server,st);
      const s=await page.evaluate(async(fnSrc)=>{
        eval('('+fnSrc+')')();
        const before=state.weights.length;
        const b=document.createElement('button');
        b.setAttribute('data-act','weight:add');document.body.appendChild(b);
        b.click();
        await new Promise(r=>setTimeout(r,200));
        return {ok:m10AuthNow().ok,after:state.weights.length,before};
      },setup.toString());
      test(`T4 ${name}: gate fails closed, no mutation`,()=>{
        ok(!s.ok);eq(s.after,s.before);});
      await ctx.close();
    }
  }

  /* T5: delayed boundary — the pen is lost while a file picker is open */
  {
    const st={};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      const inp=document.getElementById('wl-photo-input');
      inp.click();                                  /* capture at open */
      await new Promise(r=>setTimeout(r,100));
      M10.holder=false;                             /* the pen is lost */
      let reached=false;
      inp.addEventListener('change',function(){reached=true;});
      inp.dispatchEvent(new Event('change'));
      await new Promise(r=>setTimeout(r,200));
      return {reached};
    });
    test('T5 picker open → pen lost → change event: the app handler never runs',()=>ok(!s.reached));
    await ctx.close();
  }
  {
    const st={};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      const inp=document.getElementById('wl-import');
      inp.click();
      await new Promise(r=>setTimeout(r,100));
      M10.fence=M10.fence+1;                        /* same account, new fence */
      let reached=false;
      inp.addEventListener('change',function(){reached=true;});
      inp.dispatchEvent(new Event('change'));
      await new Promise(r=>setTimeout(r,200));
      return {reached};
    });
    test('T5 import picker → fence replaced → change: handler blocked (fence identity checked)',()=>ok(!s.reached));
    await ctx.close();
  }

  /* T6: confirmation callbacks are revalidated at confirm time */
  {
    const st={};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      let ran=false;
      askConfirm('Do the thing?',function(){ran=true;},{label:'Do it'});
      await new Promise(r=>setTimeout(r,100));
      M10.deadline=performance.now()-1;             /* the grant expires while the sheet is up */
      state.pendingConfirm.fn();
      await new Promise(r=>setTimeout(r,150));
      return {ran};
    });
    test('T6 confirmation after the grant expires: the callback does NOT mutate',()=>ok(!s.ran));
    await ctx.close();
  }
  {
    const st={};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      let ran=false;
      askConfirm('Do the thing?',function(){ran=true;},{label:'Do it'});
      await new Promise(r=>setTimeout(r,100));
      state.pendingConfirm.fn();
      await new Promise(r=>setTimeout(r,150));
      return {ran};
    });
    test('T6 confirmation while still the holder: the callback runs',()=>ok(s.ran));
    await ctx.close();
  }
  {
    const st={};
    const {ctx,page}=await boot(browser,server,st,'userA');
    const s=await page.evaluate(async()=>{
      let ran=false;
      askConfirm('Do the thing?',function(){ran=true;},{label:'Do it'});
      await new Promise(r=>setTimeout(r,100));
      /* A→B→A: same uid, NEW session generation */
      pbClearSession(true);
      localStorage.setItem('wl_pb',JSON.stringify({uid:'userA',base:'https://pb.test',token:'t2',email:'a@x.com'}));
      state.pendingConfirm.fn();
      await new Promise(r=>setTimeout(r,150));
      return {ran};
    });
    test('T6 confirmation after a session change (A→B→A): the callback does NOT mutate',()=>ok(!s.ran));
    await ctx.close();
  }

  /* T7: logout coupling with each M10 obligation */
  {
    for(const [name,setup,expect] of [
      ['core dirty',()=>{m10cMarkDirty();},/hasn’t confirmed/],
      ['photo pending',()=>{
        m10pMutate(m8Uid(),function(ops){ops.push({id:'pop-block00001',op:'add',localId:'zz-1',
          meta:{kind:'food',date:'2026-08-02',week:'',pose:'',meal:'lunch',ts:'1'},
          requestId:'m10c-blk00000000000000000000',state:'blob-ok',
          blobSha256:'a'.repeat(64),blobByteLength:10});});},/photo change/],
      ['core review',()=>{
        m10cWrite('displaced',{canon:1,enteredAt:1,reason:'conflict',coreRevSeen:9,
          serverData:'{}',localData:'{}',exports:null});},/needs review/]]){
      const st={};
      const {ctx,page}=await boot(browser,server,st);
      const s=await page.evaluate(async(fnSrc)=>{
        eval('('+fnSrc+')')();
        pbLogout();
        await new Promise(r=>setTimeout(r,150));
        const msg=state.pendingConfirm?state.pendingConfirm.message:'';
        state.pendingConfirm=null;
        return {msg,signedIn:!!pbUid()};
      },setup.toString());
      test(`T7 logout blocked by ${name}`,()=>{
        ok(expect.test(s.msg),'message: '+s.msg);ok(s.signedIn,'still signed in');});
      await ctx.close();
    }
  }
  {
    const st={};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      const clean=m10cState();
      pbLogout();
      await new Promise(r=>setTimeout(r,200));
      return {clean,signedIn:!!pbUid(),sheet:state.pendingConfirm?state.pendingConfirm.message:''};
    });
    test('T7 clean state: logout is NOT blocked by M10',()=>{
      ok(!/body data|photo change/.test(s.sheet),'no M10 block: '+s.sheet);});
    await ctx.close();
  }

  /* T8 (round-29 ruling 1/7): DIRECT input/change persistence is gated —
     a non-holder's typing produces no in-memory and no durable change */
  {
    const st={leaseHeld:true};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      const inp=document.createElement('input');
      inp.type='number';inp.id='wl-sleep-h';document.body.appendChild(inp);
      inp.focus();inp.dispatchEvent(new Event('focusin',{bubbles:true}));
      const before=JSON.stringify({sleep:state.sleep,v:localStorage.getItem('wl_v1')});
      inp.value='7';
      inp.dispatchEvent(new Event('input',{bubbles:true}));
      inp.dispatchEvent(new Event('change',{bubbles:true}));
      await new Promise(r=>setTimeout(r,250));
      return {holder:M10.holder,same:JSON.stringify({sleep:state.sleep,v:localStorage.getItem('wl_v1')})===before,
        reverted:inp.value===''};
    });
    test('T8 non-holder input/change: no in-memory change, no durable change, value reverted',()=>{
      ok(!s.holder);ok(s.same,'state and storage byte-identical');ok(s.reverted,'field restored');});
    await ctx.close();
  }
  {
    const st={};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      const inp=document.createElement('input');inp.type='number';document.body.appendChild(inp);
      inp.dispatchEvent(new Event('focusin',{bubbles:true}));
      inp.value='7';
      let reached=false;
      document.addEventListener('input',function(){reached=true;});
      inp.dispatchEvent(new Event('input',{bubbles:true}));
      await new Promise(r=>setTimeout(r,150));
      return {holder:M10.holder,reached};
    });
    test('T8 holder input: the application handler still runs',()=>{ok(s.holder);ok(s.reached);});
    await ctx.close();
  }
  {
    const st={leaseHeld:true};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      /* sign-in and server-config fields must remain usable on a read-only
         device — they are how it recovers */
      const inp=document.createElement('input');inp.id='pb-email';document.body.appendChild(inp);
      let reached=false;
      document.addEventListener('input',function(){reached=true;});
      inp.dispatchEvent(new Event('input',{bubbles:true}));
      await new Promise(r=>setTimeout(r,150));
      return {holder:M10.holder,reached};
    });
    test('T8 sign-in fields stay usable for a non-holder',()=>{ok(!s.holder);ok(s.reached);});
    await ctx.close();
  }

  /* T9 (ruling 2): the newly reclassified action families are gated */
  {
    const st={leaseHeld:true};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      const out={};
      for(const a of ['wo:start','wo:startroutine','wo:endrest','wu:yes','wo:finishlater','day:reopendo']){
        const b=document.createElement('button');b.setAttribute('data-act',a);document.body.appendChild(b);
        let reached=false;
        const probe=function(){reached=true;};
        document.addEventListener('click',probe);
        b.click();
        document.removeEventListener('click',probe);
        out[a]={gated:!!M10_GATED[a],blocked:!reached};
        state.pendingConfirm=null;
      }
      return out;
    });
    for(const a of Object.keys(s))
      test(`T9 ${a}: in the inventory and intercepted for a non-holder`,()=>{
        ok(s[a].gated,'in M10_GATED');ok(s[a].blocked,'bubble-phase listener never reached');});
    await ctx.close();
  }

  /* T10 (ruling 3): the HealthKit callback revalidates before mutating */
  {
    const st={};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      state.hkWait={ts:Date.now()};
      const before=JSON.stringify(state.steps);
      /* the pen is lost between the Shortcut opening and the callback */
      M10.holder=false;
      hkTryFetch();
      await new Promise(r=>setTimeout(r,400));
      return {same:JSON.stringify(state.steps)===before,waitCleared:state.hkWait===null};
    });
    test('T10 HealthKit callback after pen loss: zero import, the wait is cleared honestly',()=>{
      ok(s.same,'health stores untouched');ok(s.waitCleared);});
    await ctx.close();
  }

  /* T11 (ruling 4): file flows revalidate AFTER the async work, not just at change */
  {
    const st={};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      const before=JSON.stringify(state.weights);
      const inp=document.getElementById('wl-import');
      const backup=JSON.stringify({weights:[{date:'2026-08-02',weight:999}],settings:{}});
      const file=new File([backup],'b.json',{type:'application/json'});
      const dt=new DataTransfer();dt.items.add(file);
      inp.files=dt.files;
      inp.dispatchEvent(new Event('change',{bubbles:true}));   /* authority captured here */
      M10.holder=false;                                        /* lost during FileReader */
      await new Promise(r=>setTimeout(r,600));
      return {same:JSON.stringify(state.weights)===before};
    });
    test('T11 import: pen lost after change but before FileReader.onload → zero mutation',()=>ok(s.same));
    await ctx.close();
  }

  /* T12 (ruling 5): a malformed photo queue blocks logout */
  {
    const st={};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      localStorage.setItem('wl_photo_ops__userA','{not json at all');
      const read=m10pRead('userA').st;
      pbLogout();
      await new Promise(r=>setTimeout(r,200));
      const msg=state.pendingConfirm?state.pendingConfirm.message:'';
      state.pendingConfirm=null;
      return {read,msg,signedIn:!!pbUid(),
        preserved:localStorage.getItem('wl_photo_ops__userA')==='{not json at all'};
    });
    test('T12 malformed photo queue: logout blocked, evidence preserved (never read as empty)',()=>{
      eq(s.read,'malformed');ok(/damaged|preserved/.test(s.msg),'message: '+s.msg);
      ok(s.signedIn);ok(s.preserved,'the damaged bytes are untouched');});
    await ctx.close();
  }

  /* T13 (round-33 item 6): the LAZY MIGRATION, with the policy contradiction
     resolved. INCR5-DURABLE-WRITERS called migrateProgressionTypes() "pure
     local normalisation" and therefore substrate; under STRICT that is wrong —
     writing wl_training_v1 is a durable content write and a non-holder performs
     ZERO of them. The migration now normalises IN MEMORY (so a read-only device
     still displays correctly) and refuses the persist; being idempotent, it
     re-runs and persists once the pen is held.

     The previous T13 called the migration after a normal boot, when it had
     already run and had nothing to do, so byte identity proved nothing. These
     seed a genuinely OLD-SHAPE record that forces the migration's `ch=true`. */
  const OLDSHAPE=JSON.stringify({cardioTypes:['Peloton'],sessions:{},liftSessions:{},
    exercises:[{id:'e1',name:'Bench',muscle:'chest'}],            /* no `movement` */
    routines:[{id:'r1',name:'A',progression:'rpt',                /* routine-level type */
      items:[{itemId:'i1',exerciseId:'e1',sets:3}]}]});           /* items with none */
  {
    const st={leaseHeld:true};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async(old)=>{
      localStorage.setItem('wl_training_v1',old);
      loadTraining();
      const before=localStorage.getItem('wl_training_v1');
      window.__m10WriteRefused=0;
      migrateProgressionTypes();
      const after=localStorage.getItem('wl_training_v1');
      const disk=JSON.parse(after),mem=state.training;
      return {holder:M10.holder,same:after===before,
        /* the migration genuinely had work to do — the disk is STILL old-shape */
        diskOldShape:disk.routines[0].progression==='rpt'&&!disk.exercises[0].movement
          &&!disk.routines[0].items[0].progression,
        /* …and it did that work in memory, so display is correct */
        memMigrated:mem.exercises[0].movement==='compound'
          &&mem.routines[0].progression===undefined
          &&mem.routines[0].items[0].progression==='rpt',
        refused:window.__m10WriteRefused};
    },OLDSHAPE);
    test('T13 non-holder + OLD-SHAPE training: the migration had real work to do',()=>{
      ok(!s.holder,'device does not hold the pen');
      ok(s.diskOldShape,'wl_training_v1 is still the pre-migration shape on disk');});
    test('T13 non-holder: ZERO durable content write, and the refusal is counted',()=>{
      ok(s.same,'wl_training_v1 byte-identical');eq(s.refused,1,'exactly one refused persist');});
    test('T13 non-holder: the in-memory normalisation still happens (display is not broken)',()=>{
      ok(s.memMigrated,'movement stamped, routine-level type folded into items and dropped');});
    await ctx.close();
  }
  {
    /* the contrast arm: the SAME old-shape record, this time with the pen. If
       the migration were simply a no-op, this would fail. */
    const st={};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async(old)=>{
      localStorage.setItem('wl_training_v1',old);
      loadTraining();
      const before=localStorage.getItem('wl_training_v1');
      window.__m10WriteRefused=0;
      migrateProgressionTypes();
      const after=localStorage.getItem('wl_training_v1');
      const disk=JSON.parse(after);
      return {holder:M10.holder,changed:after!==before,refused:window.__m10WriteRefused,
        persisted:disk.exercises[0].movement==='compound'
          &&disk.routines[0].progression===undefined
          &&disk.routines[0].items[0].progression==='rpt'};
    },OLDSHAPE);
    test('T13 HOLDER: the same migration DOES persist (the guard is what differs, not the work)',()=>{
      ok(s.holder,'device holds the pen');ok(s.changed,'wl_training_v1 rewritten');
      ok(s.persisted,'the migrated shape is on disk');eq(s.refused,0,'nothing refused');});
    await ctx.close();
  }
  {
    /* the original property, retained: a non-holder navigating every view —
       including paths that fire lazy migrations — writes nothing durable */
    const st={leaseHeld:true};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      const snap=()=>JSON.stringify({v:localStorage.getItem('wl_v1'),t:localStorage.getItem('wl_training_v1'),
        w:localStorage.getItem('wl_workout_v1')});
      const before=snap();
      window.__m10WriteRefused=0;
      try{migrateProgressionTypes();}catch(e){}
      try{resyncAllActivityTags();}catch(e){}
      for(const v of ['overview','train','weight','progress','photos','diary','food']){
        state.view=v;try{render();}catch(e){}
      }
      await new Promise(r=>setTimeout(r,300));
      return {holder:M10.holder,same:snap()===before,refused:window.__m10WriteRefused};
    });
    test('T13 non-holder navigation sweep: content stores byte-identical',()=>{
      ok(!s.holder);ok(s.same,'wl_v1 / wl_training_v1 / wl_workout_v1 all unchanged');});
    await ctx.close();
  }
  /* T13e: the END-TO-END policy, through a REAL boot with old-shape bytes on
     disk. Boot runs the migration once before the lease exists (in memory
     only) and again once m10Boot() has settled it — so the holder's disk ends
     up migrated and the non-holder's does not. This is what makes "it re-runs
     and persists once the device holds the pen" a fact rather than a promise;
     the first call already normalised memory, so the second would be a no-op
     without the remembered debt. */
  for(const [label,st,expectMigrated] of [
    ['HOLDER',{},true],
    ['non-holder',{leaseHeld:true},false]]){
    const {ctx,page,errs}=await bootSeed(browser,server,st,{
      wl_pb:JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok',email:'a@x.com'}),
      wl_last_owner:'userA',wl_v1:JSON.stringify(EMPTY),wl_training_v1:OLDSHAPE});
    await page.waitForTimeout(900);
    const s=await page.evaluate(()=>{
      const d=JSON.parse(localStorage.getItem('wl_training_v1'));
      return {holder:M10.holder,
        diskMigrated:d.exercises[0].movement==='compound'&&d.routines[0].progression===undefined
          &&d.routines[0].items[0].progression==='rpt',
        diskRaw:localStorage.getItem('wl_training_v1'),
        memMigrated:state.training.exercises[0].movement==='compound'};
    });
    test(`T13e real boot, ${label}: memory normalised either way, disk written only with the pen`,()=>{
      eq(s.holder,expectMigrated,'lease state as intended');
      ok(s.memMigrated,'the in-memory copy is always normalised');
      eq(s.diskMigrated,expectMigrated,
        expectMigrated?'the holder persisted it after the lease settled'
                      :'the non-holder left wl_training_v1 exactly as found: '+s.diskRaw);
      if(!expectMigrated)eq(s.diskRaw,OLDSHAPE,'byte-identical to the seeded old shape');});
    test(`T13e no page errors (${label})`,()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }

  /* T14 (ruling 1): HealthKit — the capture is taken at the click, so a pen
     change BEFORE the first poll cannot import, and the first mailbox clear
     is covered too */
  {
    const st={};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      const b=document.createElement('button');b.setAttribute('data-act','hk:import');document.body.appendChild(b);
      b.click();
      await new Promise(r=>setTimeout(r,150));
      const hasCap=!!(state.hkWait&&state.hkWait.m10cap);
      /* A→B→A before the first poll: same uid, NEW session generation */
      pbClearSession(true);
      localStorage.setItem('wl_pb',JSON.stringify({uid:'userA',base:'https://pb.test',token:'t2',email:'a@x.com'}));
      const before=JSON.stringify(state.steps);
      hkTryFetch();
      await new Promise(r=>setTimeout(r,400));
      return {hasCap,same:JSON.stringify(state.steps)===before,waitCleared:state.hkWait===null};
    });
    test('T14 HealthKit capture taken at the click, not the poll',()=>ok(s.hasCap));
    test('T14 A→B→A before the first poll: nothing imported, wait cleared',()=>{
      ok(s.same);ok(s.waitCleared);});
    await ctx.close();
  }
  {
    const st={leaseHeld:true};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      let mailboxWrites=0;
      const origSave=pbSave;pbSave=function(f,cb){if(f&&('health' in f))mailboxWrites++;return origSave(f,cb);};
      const b=document.createElement('button');b.setAttribute('data-act','hk:import');document.body.appendChild(b);
      b.click();
      await new Promise(r=>setTimeout(r,300));
      pbSave=origSave;
      return {holder:M10.holder,mailboxWrites,waiting:!!state.hkWait};
    });
    test('T14 non-holder hk:import: refused before the initial mailbox clear',()=>{
      ok(!s.holder);eq(s.mailboxWrites,0,'no health write');ok(!s.waiting);});
    await ctx.close();
  }

  /* T15 (round-33 item 5): the ACTUAL terminal boot-recovery screens.

     The previous T15 only proved four names are absent from M10_GATED — a
     structural claim about a list, not behaviour. These drive the real gate
     screens end to end. On a gated boot the ordinary app never initialises and
     m10Boot() never runs, so the device is a non-holder BY CONSTRUCTION: if
     these actions were behind the ordinary lease gate they would be refused
     and recovery would be impossible. */
  {
    const st={leaseHeld:true};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(()=>({
      adoptAsk:!M10_GATED['adopt:ask'],adoptYes:!M10_GATED['adopt:yes'],
      lrecR:!M10_GATED['lrec:restore'],lrecF:!M10_GATED['lrec:finish'],
      holder:M10.holder}));
    test('T15 boot-recovery actions exempt from the ordinary gate (recovery stays possible)',()=>{
      ok(!s.holder,'device is a non-holder');
      ok(s.adoptAsk&&s.adoptYes&&s.lrecR&&s.lrecF,'all four exempt');});
    await ctx.close();
  }

  /* T15a: the ADOPTION gate — confirmation records the verified owner and
     reaches the approved reload. */
  {
    const st={leaseHeld:true};
    const {ctx,page,errs}=await bootSeed(browser,server,st,{
      wl_pb:JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok',email:'a@x.com'}),
      wl_v1:JSON.stringify(EMPTY)});           /* local data, and NO wl_last_owner */
    const pre=await page.evaluate(()=>{
      window.__mark=1;
      return {gated:bootGated(),recovery:recoveryState,holder:M10.holder,
        btn:!!document.querySelector('[data-act="adopt:yes"]'),
        owner:localStorage.getItem('wl_last_owner'),
        title:(document.body.textContent||'').indexOf('One question first')>=0};
    });
    test('T15a the adoption gate really owns the screen, on a device with no lease',()=>{
      ok(pre.gated,'boot is gated');eq(pre.recovery,'adoption');
      ok(!pre.holder,'no pen — m10Boot never ran behind the gate');
      ok(pre.title,'the terminal screen is rendered');
      ok(pre.btn,'the real adopt:yes control is present');
      eq(pre.owner,null,'no verified owner recorded yet');});
    await page.evaluate(()=>{document.querySelector('[data-act="adopt:yes"]').click();}).catch(()=>{});
    await page.waitForTimeout(1600);
    const post=await page.evaluate(()=>({
      reloaded:window.__mark===undefined,
      owner:localStorage.getItem('wl_last_owner'),
      gated:bootGated(),recovery:recoveryState,
      btn:!!document.querySelector('[data-act="adopt:yes"]'),
      appRendered:!!document.querySelector('[data-act]')}));
    test('T15a adopt:yes records the VERIFIED owner and reaches the approved reload',()=>{
      eq(post.owner,'userA','wl_last_owner written and read back');
      ok(post.reloaded,'the document was replaced — location.reload() was reached');});
    test('T15a after the reload the gate is gone and the ordinary app boots',()=>{
      ok(!post.gated);ok(post.recovery!=='adoption');ok(!post.btn);ok(post.appRendered);});
    test('T15a no page errors',()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }

  /* T15b: interrupted-logout RESTORE completes its verified restoration. */
  {
    const st={leaseHeld:true};
    const saved={wl_v1:JSON.stringify(Object.assign({},EMPTY,{weights:[{date:'2026-07-30',weight:181}]})),
      wl_training_v1:JSON.stringify({cardioTypes:['Rowing'],sessions:{},exercises:[],routines:[],liftSessions:{}}),
      wl_workout_v1:null,wl_dirty:null,wl_lastsync:null,wl_last_owner:'userA',wl_training_recovery:null};
    const journal={v:1,at:'2026-08-02',account:'userA',appBuild:'test-build',phase:'wiping',
      vals:{wl_v1:saved.wl_v1,wl_training_v1:saved.wl_training_v1,wl_workout_v1:null,
        wl_dirty:null,wl_lastsync:null,wl_last_owner:'userA',wl_training_recovery:null},
      session:{local:JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok',email:'a@x.com'}),session:null}};
    const {ctx,page,errs}=await bootSeed(browser,server,st,{
      wl_logout_journal:JSON.stringify(journal)});   /* mid-wipe: targets already gone */
    const pre=await page.evaluate(()=>{
      window.__mark=1;
      return {gated:bootGated(),pending:logoutRecoveryPending(),holder:M10.holder,
        restore:!!document.querySelector('[data-act="lrec:restore"]'),
        finish:!!document.querySelector('[data-act="lrec:finish"]'),
        v1:localStorage.getItem('wl_v1'),t1:localStorage.getItem('wl_training_v1')};
    });
    test('T15b the interrupted-logout gate owns the screen and offers both real controls',()=>{
      ok(pre.gated&&pre.pending);ok(!pre.holder,'no pen behind the gate');
      ok(pre.restore&&pre.finish,'lrec:restore and lrec:finish rendered');
      eq(pre.v1,null,'the wipe had already removed the targets');eq(pre.t1,null);});
    await page.evaluate(()=>{document.querySelector('[data-act="lrec:restore"]').click();}).catch(()=>{});
    await page.waitForTimeout(1600);
    const post=await page.evaluate(()=>({
      reloaded:window.__mark===undefined,
      v1:localStorage.getItem('wl_v1'),t1:localStorage.getItem('wl_training_v1'),
      owner:localStorage.getItem('wl_last_owner'),
      journal:localStorage.getItem('wl_logout_journal'),
      pb:localStorage.getItem('wl_pb'),
      pending:logoutRecoveryPending(),gated:bootGated()}));
    test('T15b lrec:restore puts EVERY journalled value back, verified',()=>{
      eq(post.v1,saved.wl_v1,'wl_v1 restored byte-for-byte');
      eq(post.t1,saved.wl_training_v1,'wl_training_v1 restored byte-for-byte');
      eq(post.owner,'userA','the owner marker restored');
      /* the session slot is asserted by identity, not bytes: restoreFromJournal
         writes the journalled string verbatim (and verifies it), but the
         ordinary boot that follows the reload re-normalises the auth record —
         so byte equality here would be testing the boot, not the restore */
      const pb=JSON.parse(post.pb||'null')||{};
      eq(pb.uid,'userA','the session was restored — signed back in as the same account');
      eq(pb.token,'tok','with its token');});
    test('T15b lrec:restore clears the journal and reaches the reload; the gate is gone',()=>{
      eq(post.journal,null,'journal deleted (verified) — the device is resolved');
      ok(post.reloaded,'location.reload() was reached');
      ok(!post.pending&&!post.gated,'the app boots normally afterwards');});
    test('T15b no page errors',()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }

  /* T15c: interrupted-logout FINISH keeps its confirmation AND its verified
     postcondition — a removal that silently does not stick must NOT be
     reported as a finished wipe. */
  {
    const st={leaseHeld:true};
    const leftover={wl_v1:JSON.stringify(EMPTY),wl_training_v1:'{"exercises":[]}',wl_last_owner:'userA'};
    const journal={v:1,at:'2026-08-02',account:'userA',appBuild:'test-build',phase:'data-cleared',
      vals:{wl_v1:leftover.wl_v1,wl_training_v1:leftover.wl_training_v1,wl_workout_v1:null,
        wl_dirty:null,wl_lastsync:null,wl_last_owner:'userA',wl_training_recovery:null},
      session:{local:JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok',email:'a@x.com'}),session:null}};
    const {ctx,page,errs}=await bootSeed(browser,server,st,
      Object.assign({wl_logout_journal:JSON.stringify(journal)},leftover));
    const s=await page.evaluate(async()=>{
      window.__mark=1;
      const toasts=[];const t0=window.toast;window.toast=function(m){toasts.push(m);return t0(m);};
      const btn=document.querySelector('[data-act="lrec:finish"]');
      btn&&btn.click();
      await new Promise(r=>setTimeout(r,150));
      const asked=state.pendingConfirm?state.pendingConfirm.message:'';
      const stillThere={v1:localStorage.getItem('wl_v1'),t1:localStorage.getItem('wl_training_v1')};
      /* the postcondition check: one removal silently does not stick */
      const origRemove=localStorage.removeItem.bind(localStorage);
      localStorage.removeItem=function(k){if(k==='wl_training_v1')return;return origRemove(k);};
      const fn=state.pendingConfirm&&state.pendingConfirm.fn;state.pendingConfirm=null;
      let ret=null;if(fn)ret=fn();
      await new Promise(r=>setTimeout(r,250));
      localStorage.removeItem=origRemove;
      window.toast=t0;
      return {btnFound:!!btn,asked,stillThere,toasts,
        journal:localStorage.getItem('wl_logout_journal'),
        t1:localStorage.getItem('wl_training_v1'),
        pending:logoutRecoveryPending(),notReloaded:window.__mark===1};
    /* a navigation here IS the failure being tested for: it would mean the wipe
       was declared finished without its postcondition holding */
    }).catch(e=>({navigated:true,err:String(e&&e.message)}));
    test('T15c lrec:finish still requires an explicit, destructive confirmation',()=>{
      ok(!s.navigated,'the page reloaded — the wipe was declared done: '+(s.err||''));
      ok(s.btnFound,'the real control rendered');
      ok(/Finish clearing this device\?/.test(s.asked),'confirmation raised: '+s.asked);
      ok(/erased for good/.test(s.asked),'it says what it destroys');
      ok(s.stillThere.v1&&s.stillThere.t1,'nothing erased before the athlete confirmed');});
    test('T15c lrec:finish verifies its postcondition: an unstuck removal is NOT reported as done',()=>{
      ok(!s.navigated,'the page reloaded — the wipe was declared done: '+(s.err||''));
      ok(s.toasts.some(x=>/Couldn.t finish clearing this device/.test(x)),
        'honest failure: '+JSON.stringify(s.toasts));
      ok(s.t1!==null,'the key that would not clear is still present');
      eq(s.journal!==null,true,'the journal SURVIVES — the device is still unresolved');
      ok(s.pending,'still in interrupted-logout recovery');
      ok(s.notReloaded,'no reload: the device was never declared clear');});
    test('T15c no page errors',()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }
  {
    /* contrast: with the store behaving, the SAME control completes the wipe,
       verifies every postcondition and reaches the reload */
    const st={leaseHeld:true};
    const leftover={wl_v1:JSON.stringify(EMPTY),wl_training_v1:'{"exercises":[]}',wl_last_owner:'userA'};
    const journal={v:1,at:'2026-08-02',account:'userA',appBuild:'test-build',phase:'data-cleared',
      vals:{wl_v1:leftover.wl_v1,wl_training_v1:leftover.wl_training_v1,wl_workout_v1:null,
        wl_dirty:null,wl_lastsync:null,wl_last_owner:'userA',wl_training_recovery:null},
      session:{local:JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok',email:'a@x.com'}),session:null}};
    const {ctx,page}=await bootSeed(browser,server,st,
      Object.assign({wl_logout_journal:JSON.stringify(journal)},leftover));
    await page.evaluate(async()=>{
      window.__mark=1;
      document.querySelector('[data-act="lrec:finish"]').click();
      await new Promise(r=>setTimeout(r,150));
      const fn=state.pendingConfirm&&state.pendingConfirm.fn;state.pendingConfirm=null;if(fn)fn();
    }).catch(()=>{});
    await page.waitForTimeout(1600);
    const post=await page.evaluate(()=>({
      reloaded:window.__mark===undefined,
      keys:['wl_v1','wl_training_v1','wl_workout_v1','wl_dirty','wl_lastsync','wl_last_owner','wl_training_recovery']
        .map(k=>localStorage.getItem(k)),
      journal:localStorage.getItem('wl_logout_journal'),
      sess:(typeof sessionStorage!=='undefined')?sessionStorage.getItem('wl_pb'):null,
      pending:logoutRecoveryPending()}));
    test('T15c contrast: a working store lets lrec:finish complete — every target cleared, journal gone, reload reached',()=>{
      ok(post.keys.every(v=>v===null),'all seven targets absent: '+JSON.stringify(post.keys));
      eq(post.journal,null);eq(post.sess,null,'session slot empty');
      ok(!post.pending);ok(post.reloaded);});
    await ctx.close();
  }

  /* T15d: an UNREADABLE logout journal exposes no destructive finish path —
     neither as a control nor as a callable function. */
  {
    const st={leaseHeld:true};
    const leftover={wl_v1:JSON.stringify(EMPTY),wl_training_v1:'{"exercises":[]}',wl_last_owner:'userA'};
    const {ctx,page,errs}=await bootSeed(browser,server,st,
      Object.assign({wl_logout_journal:'{not json at all'},leftover));
    const s=await page.evaluate(async()=>{
      window.__mark=1;
      const snap=()=>JSON.stringify(['wl_v1','wl_training_v1','wl_last_owner','wl_logout_journal']
        .map(k=>localStorage.getItem(k)));
      const before=snap();
      const toasts=[];const t0=window.toast;window.toast=function(m){toasts.push(m);return t0(m);};
      /* no control anywhere on the terminal screen */
      const controls={finish:!!document.querySelector('[data-act="lrec:finish"]'),
        restore:!!document.querySelector('[data-act="lrec:restore"]'),
        anyAct:document.querySelectorAll('[data-act]').length};
      /* and the function itself refuses, so the absence of a button is not the
         only thing standing between an unreadable journal and a wipe */
      const finishRet=logoutRecoveryFinish();
      const restoreRet=logoutRecoveryRestore();
      await new Promise(r=>setTimeout(r,250));
      window.toast=t0;
      return {phase:logoutRecovery&&logoutRecovery.phase,gated:bootGated(),controls,
        finishRet,restoreRet,toasts,same:snap()===before,notReloaded:window.__mark===1,
        text:(document.body.textContent||'')};
    /* a navigation here IS the failure: an unreadable journal must expose no
       path that resolves or erases anything */
    }).catch(e=>({navigated:true,err:String(e&&e.message)}));
    test('T15d unreadable journal: terminal screen with NO destructive control at all',()=>{
      ok(!s.navigated,'the page reloaded from an unreadable journal: '+(s.err||''));
      eq(s.phase,'unreadable');ok(s.gated);
      ok(!s.controls.finish,'no Finish clearing control');
      ok(!s.controls.restore,'no Put my data back control');
      eq(s.controls.anyAct,0,'the screen offers no data-act controls whatsoever');
      ok(/cannot be read/.test(s.text),'and it says why');});
    test('T15d unreadable journal: the finish/restore functions themselves refuse and erase nothing',()=>{
      ok(!s.navigated,'the page reloaded from an unreadable journal: '+(s.err||''));
      eq(s.finishRet,false,'logoutRecoveryFinish() refuses');
      eq(s.restoreRet,false,'logoutRecoveryRestore() refuses');
      ok(s.toasts.some(x=>/can.t be erased from here/.test(x)),'honest refusal: '+JSON.stringify(s.toasts));
      ok(s.same,'wl_v1 / wl_training_v1 / wl_last_owner / the damaged journal all byte-identical');
      ok(s.notReloaded,'nothing was declared resolved');});
    test('T15d no page errors',()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }

  /* T16 (round-33 item 2): m10cx:mine is UNGATED at the click and proves
     authority INSIDE its handler. The previous T16 asserted
     `toasts.some(...)||true` — unconditionally true, so it would have passed
     even if the push had gone through. It also never built a displaced
     envelope, so m10cxPushMine() returned at its first line and nothing was
     exercised at all. This builds a REAL review (displaced envelope + a
     satisfied export gate) so the holder check is the only thing left, then
     asserts concrete negative postconditions. */
  const CXSETUP=`async function(){
    const rec=await new Promise(r=>pbGetRecord(function(rc){r(rc);}));
    const scanon=m10cCanon(rec.data).canon;
    const lc=m10cCanon(payload());
    const env={canon:1,enteredAt:1,reason:'conflict',coreRevSeen:rec.coreRev,
      serverData:scanon,localData:lc.canon,
      exports:{localGen:m10cGen,localCanon:lc.canon,serverCanon:scanon,serverDone:true,localDone:true}};
    const wrote=m10cWrite('displaced',env);
    const e2=m10cxEnvelope();
    return {wrote:wrote,envSt:e2.st,gateOpen:e2.st==='ok'&&m10cxExportGateOpen(e2.val),
      holder:M10.holder,gatedList:!!M10_GATED['m10cx:mine']};
  }`;
  const CXSNAP=`function(){
    const o={};Object.keys(localStorage).forEach(function(k){
      if(/^wl_core_|^wl_photo_ops__|^wl_photomap|^wl_v1$|^wl_training_v1$|^wl_workout/.test(k))
        o[k]=localStorage.getItem(k);});
    return JSON.stringify(o);
  }`;
  {
    const st={leaseHeld:true};
    const {ctx,page,errs}=await boot(browser,server,st);
    const setup=await page.evaluate(async(src)=>eval('('+src+')')(),CXSETUP);
    test('T16 setup: a REAL core review exists, its export gate is open, and this device has no pen',()=>{
      ok(setup.wrote,'displaced envelope written');eq(setup.envSt,'ok','envelope validates');
      ok(setup.gateOpen,'export gate satisfied — the holder check is the only remaining barrier');
      ok(!setup.holder,'device does not hold the pen');
      ok(!setup.gatedList,'m10cx:mine is deliberately NOT in M10_GATED');});
    const commitsBefore=st.commits||0;
    const s=await page.evaluate(async(snapSrc)=>{
      const snap=eval('('+snapSrc+')');
      const before=snap();
      const raw=(k)=>localStorage.getItem(k+m8Uid());
      const b4={base:raw('wl_core_base__'),dirty:raw('wl_core_dirty__'),
        journal:raw('wl_core_ack_journal__'),displaced:raw('wl_core_displaced__')};
      const toasts=[];const t0=window.toast;window.toast=function(m){toasts.push(m);return t0(m);};
      m10cxPushMine();
      await new Promise(r=>setTimeout(r,600));
      window.toast=t0;
      const env=m10cxEnvelope();
      return {holder:M10.holder,toasts,same:snap()===before,
        dx:m10cRead('dxjournal').st,
        baseSame:raw('wl_core_base__')===b4.base,dirtySame:raw('wl_core_dirty__')===b4.dirty,
        journalSame:raw('wl_core_ack_journal__')===b4.journal,
        displacedSame:raw('wl_core_displaced__')===b4.displaced,
        envStill:env.st,envSame:env.st==='ok'&&env.val.exports&&env.val.exports.serverDone===true};
    },CXSNAP);
    const commitsAfter=st.commits||0;
    test('T16 non-holder m10cx:mine: an ACTUAL refusal, from the handler, at the holder check',()=>{
      ok(!s.holder);
      ok(s.toasts.some(x=>/Take over as the active writer first/.test(x)),
        'the handler-enforced refusal: '+JSON.stringify(s.toasts));
      ok(!s.toasts.some(x=>/Export both copies first/.test(x)),
        'it did NOT bail out at the export gate — the holder check is what refused');});
    test('T16 non-holder m10cx:mine: no core route call',()=>{
      eq(commitsAfter,commitsBefore,'zero /cf/appdata/commit calls');});
    test('T16 non-holder m10cx:mine: no journal / base / dirty / displaced mutation',()=>{
      eq(s.dx,'absent','no dx review journal was opened');
      ok(s.baseSame,'wl_core_base__ byte-identical');
      ok(s.dirtySame,'wl_core_dirty__ byte-identical');
      ok(s.journalSame,'wl_core_ack_journal__ byte-identical');
      ok(s.displacedSame,'wl_core_displaced__ byte-identical');
      eq(s.envStill,'ok','the displaced review is still there, unresolved');
      ok(s.envSame,'its export evidence is untouched');});
    test('T16 non-holder m10cx:mine: no local snapshot replacement',()=>{
      ok(s.same,'core / training / workout / queue / map bytes all identical');});
    test('T16 no page errors',()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }
  {
    /* the contrast arm: with the pen, the SAME setup resolves. Without this,
       every T16 negative could be satisfied by a setup that never reaches the
       operative code — which is exactly what the previous T16 did. */
    const st={};
    const {ctx,page}=await boot(browser,server,st);
    const setup=await page.evaluate(async(src)=>eval('('+src+')')(),CXSETUP);
    ok(setup.gateOpen,'holder-arm setup reached the same point');
    const commitsBefore=st.commits||0;
    const s=await page.evaluate(async()=>{
      const raw=(k)=>localStorage.getItem(k+m8Uid());
      const baseBefore=raw('wl_core_base__');
      const toasts=[];const t0=window.toast;window.toast=function(m){toasts.push(m);return t0(m);};
      m10cxPushMine();
      await new Promise(r=>setTimeout(r,900));
      window.toast=t0;
      return {holder:M10.holder,toasts,env:m10cxEnvelope().st,
        dx:m10cRead('dxjournal').st,base:m10cRead('base').st,
        baseChanged:raw('wl_core_base__')!==baseBefore};
    });
    test('T16 HOLDER m10cx:mine: the same call DOES resolve the review (the negatives are real)',()=>{
      ok(s.holder,'holds the pen');
      eq((st.commits||0)-commitsBefore,1,'exactly one core route call');
      ok(s.toasts.some(x=>/Your copy is now the server copy/.test(x)),JSON.stringify(s.toasts));
      eq(s.env,'absent','the displaced review was cleared');
      eq(s.dx,'absent','the dx journal was cleared after completion');
      eq(s.base,'ok','the acknowledged copy was recorded');
      ok(s.baseChanged,'and its bytes actually moved — the negatives above measure a real path');});
    await ctx.close();
  }

  /* ================= round-34 rulings 1-3 =================
     T17: the ONE exemption from the source gate.

     M8 raises a SOFT (unproven) block when a dirty generation was never proven
     to reach disk, and its recovery design is that the athlete's next
     successful, VERIFIED re-save releases it. Round-30 gated saveTraining() on
     m10AuthNow(), which refuses on the whole m8StorageBlocked union — so the
     one action that could clear the block was the action that was refused, and
     the device stayed read-only until reinstall.

     The exemption is narrow by construction (m8SoftRecoveryAuth) and its
     contract is a single function (m8SoftBlockRecoverySave). These arms prove
     all four of the Architect's requirements. Every arm boots a REAL soft-only
     block, derived by m8Boot from seeded unproven bytes — no product hook. */
  const SOFTBASE=(uid)=>{
    const s=softSeed(uid||'userA');
    s['wl_training_base__'+(uid||'userA')]=JSON.stringify(
      {owner:uid||'userA',mark:'m8.1',canon:1,rev:1,body:TRAIN0});
    return s;};
  const SNAP17=`function(){
    const o={};Object.keys(localStorage).forEach(function(k){
      if(/^wl_v1$|^wl_training_|^wl_core_|^wl_workout|^wl_photomap|^wl_photo_ops__/.test(k))
        o[k]=localStorage.getItem(k);});
    return JSON.stringify(o);
  }`;

  /* ---- (a) a valid holder under ONLY the soft block re-saves, verifies, and
         clears it ---- */
  {
    const st={};
    const {ctx,page,errs}=await bootFaulty(browser,server,st,SOFTBASE());
    const pre=await page.evaluate(()=>({
      soft:m8UnprovenBlocked,hard:m8HardBlocked,
      coreHard:m10cHardBlocked,coreSoft:m10cUnprovenBlocked,
      union:window.m8StorageBlocked,holder:M10.holder,fence:M10.fence,
      auth:m10AuthNow(),exempt:m8SoftRecoveryAuth(),
      state:m8State(),dirty:localStorage.getItem('wl_training_dirty__userA')}));
    test('T17a setup: a REAL soft-only block, derived at boot from an unproven dirty generation',()=>{
      ok(pre.soft,'m8UnprovenBlocked was raised by m8Boot');
      ok(!pre.hard,'m8HardBlocked is NOT raised');
      ok(!pre.coreHard&&!pre.coreSoft,'the M10 core raises no block');
      ok(pre.union,'the shared union therefore reads blocked');
      ok(pre.holder,'this device holds the pen');ok(pre.fence>=1,'with a valid fence');
      ok(!pre.auth.ok,'the ordinary source gate refuses');
      eq(pre.auth.why,'blocked','and refuses precisely because of the block');
      ok(pre.exempt.ok,'the narrow exemption applies to exactly this device');});
    const commitsBefore=st.trainingCommits||0;
    const s=await page.evaluate(async()=>{
      const before=localStorage.getItem('wl_training_v1');
      const refused0=window.__m10WriteRefused||0;
      state.training.exercises.push({id:'recov',name:'Recovered',muscle:'back',notes:[]});
      const ret=saveTraining();
      const d=JSON.parse(localStorage.getItem('wl_training_dirty__userA')||'null');
      const now={ret:ret,
        soft:m8UnprovenBlocked,hard:m8HardBlocked,union:window.m8StorageBlocked,
        proof:!!(d&&typeof d.gen==='number'&&d.gen===d.persistedGen),
        onDisk:(localStorage.getItem('wl_training_v1')||'').indexOf('"recov"')>=0,
        changed:localStorage.getItem('wl_training_v1')!==before,
        refusedDelta:(window.__m10WriteRefused||0)-refused0,
        authAfter:m10AuthNow().ok};
      await new Promise(r=>setTimeout(r,2600));   /* past the 1600ms push debounce */
      now.stateAfter=m8State();
      return now;});
    test('T17a the exemption re-saves the snapshot AND its dirty-generation proof',()=>{
      eq(s.ret,true,'saveTraining() reported a completed recovery');
      ok(s.changed,'the training snapshot was actually rewritten');
      ok(s.onDisk,'and the new edit is on disk');
      ok(s.proof,'the dirty record now carries persistedGen === gen');
      eq(s.refusedDelta,0,'this was not counted as a refused write');});
    test('T17a the soft block is cleared only after both were read back and verified',()=>{
      ok(!s.soft,'m8UnprovenBlocked released');
      ok(!s.hard,'no hard block was raised');
      ok(!s.union,'the shared union is clear');
      ok(s.authAfter,'the ordinary gate now passes — the device is writable again');});
    test('T17a synchronisation resumes only once the proof exists',()=>{
      eq((st.trainingCommits||0)-commitsBefore,1,
        'exactly one training commit was issued, after the proof landed');});
    test('T17a no page errors',()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }

  /* ---- (b) every other condition refuses, each as its own arm. The device is
         soft-blocked in ALL of them, so the only thing under test is the extra
         condition. Nothing may be persisted and nothing may be pushed. ---- */
  for(const arm of [
    {name:'non-holder',                why:'not-holder',   fn:()=>{M10.holder=false;}},
    {name:'changed account',           why:'not-holder',   fn:()=>{
      const c=JSON.parse(localStorage.getItem('wl_pb'));c.uid='userB';
      localStorage.setItem('wl_pb',JSON.stringify(c));}},
    {name:'changed session',           why:'not-holder',   fn:()=>{m10Reset('another device took over');}},
    {name:'invalid fence',             why:'no-fence',     fn:()=>{M10.fence=0;}},
    {name:'expired lease',             why:'expired',      fn:()=>{M10.deadline=performance.now()-1;}},
    {name:'hard M8 block',             why:'hard-blocked', fn:()=>{m8Block('hard failure for the test');}},
    {name:'additional core hard block',why:'core-blocked', fn:()=>{m10cBlock('core failure for the test');}},
    {name:'additional core soft block',why:'core-blocked', fn:()=>{m10cSoftBlock('core unproven for the test');}},
    {name:'corrupt identity',          why:'corrupt',      fn:()=>{M10.corrupt=true;}},
    {name:'local writes frozen',       why:'frozen',       fn:()=>{recoveryFreeze=true;}}]){
    const st={};
    const {ctx,page,errs}=await bootFaulty(browser,server,st,SOFTBASE());
    const commitsBefore=st.trainingCommits||0;
    const s=await page.evaluate(async(args)=>{
      const [fnSrc,snapSrc]=args;
      const snap=eval('('+snapSrc+')');
      const soft0=m8UnprovenBlocked;
      const before=snap();
      const genBefore=M10.gen;
      eval('('+fnSrc+')')();
      const exempt=m8SoftRecoveryAuth();
      const refused0=window.__m10WriteRefused||0;
      state.training.exercises.push({id:'nope',name:'Must not persist',muscle:'back',notes:[]});
      const ret=saveTraining();
      const refusedDelta=(window.__m10WriteRefused||0)-refused0;
      await new Promise(r=>setTimeout(r,2400));   /* past the push debounce */
      return {soft0,exempt,ret,genBefore,genAfter:M10.gen,refusedDelta,
        same:snap()===before,
        stillBlocked:window.m8StorageBlocked,
        onDisk:(localStorage.getItem('wl_training_v1')||'').indexOf('"nope"')>=0};
    },[arm.fn.toString(),SNAP17]);
    test(`T17b [${arm.name}] cannot use the exemption`,()=>{
      ok(s.soft0,'the arm really did start from the soft block');
      ok(!s.exempt.ok,'m8SoftRecoveryAuth refuses');
      eq(s.exempt.why,arm.why,'for the stated reason');
      ok(s.ret!==true,'saveTraining() reported no recovery: '+JSON.stringify(s.ret));
      eq(s.refusedDelta,1,'and it was counted as an ordinary refused write');});
    test(`T17b [${arm.name}] persists nothing and pushes nothing`,()=>{
      ok(!s.onDisk,'the edit did not reach wl_training_v1');
      ok(s.same,'every training / core / workout / photo store is byte-identical');
      ok(s.stillBlocked,'the device is still blocked');
      eq((st.trainingCommits||0)-commitsBefore,0,'zero training network writes');});
    if(arm.name==='changed session')
      test('T17b [changed session] the session generation really did change',
        ()=>ok(s.genAfter>s.genBefore,'M10.gen '+s.genBefore+' -> '+s.genAfter));
    test(`T17b [${arm.name}] no page errors`,()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }

  /* ---- (c) a persistence or verification failure leaves the device blocked
         and issues ZERO network writes ---- */
  for(const arm of [
    {name:'snapshot write fails',
     setup:()=>{window.__denySet=['^wl_training_v1$'];},
     expectOnDisk:false},
    {name:'dirty-proof write fails',
     /* the FIRST dirty write (the generation marker) succeeds; the SECOND (the
        proof) fails — so the snapshot lands but the proof never does */
     setup:()=>{window.__denyOnce['wl_training_dirty__userA']=1;},
     expectOnDisk:true}]){
    const st={};
    const {ctx,page,errs}=await bootFaulty(browser,server,st,SOFTBASE());
    const commitsBefore=st.trainingCommits||0;
    const s=await page.evaluate(async(fnSrc)=>{
      const soft0=m8UnprovenBlocked,exempt0=m8SoftRecoveryAuth().ok;
      eval('('+fnSrc+')')();
      state.training.exercises.push({id:'fault',name:'Faulted',muscle:'back',notes:[]});
      const ret=saveTraining();
      const d=JSON.parse(localStorage.getItem('wl_training_dirty__userA')||'null');
      await new Promise(r=>setTimeout(r,2400));
      return {soft0,exempt0,ret,
        onDisk:(localStorage.getItem('wl_training_v1')||'').indexOf('"fault"')>=0,
        proofClaimed:!!(d&&typeof d.gen==='number'&&d.gen===d.persistedGen),
        soft:m8UnprovenBlocked,hard:m8HardBlocked,union:window.m8StorageBlocked,
        authAfter:m10AuthNow().ok};
    },arm.setup.toString());
    test(`T17c [${arm.name}] the exemption applied, then failed honestly`,()=>{
      ok(s.soft0&&s.exempt0,'the arm started from a soft-only block with the exemption available');
      ok(s.ret!==true,'no recovery was claimed: '+JSON.stringify(s.ret));
      ok(!s.proofClaimed,'no dirty-generation proof was recorded');
      eq(s.onDisk,arm.expectOnDisk,'snapshot persistence behaved as the arm intends');});
    test(`T17c [${arm.name}] the device stays blocked and writes nothing to the network`,()=>{
      ok(s.union,'still blocked');
      ok(s.hard,'the failure ESCALATED to a hard block rather than silently clearing');
      ok(!s.authAfter,'the ordinary gate still refuses');
      eq((st.trainingCommits||0)-commitsBefore,0,'ZERO network writes');});
    test(`T17c [${arm.name}] no page errors`,()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }

  /* ---- (d) the ordinary unblocked path is unchanged ---- */
  {
    const st={};
    const {ctx,page,errs}=await boot(browser,server,st);
    const commitsBefore=st.commits||0;
    const s=await page.evaluate(async()=>{
      const refused0=window.__m10WriteRefused||0;
      const pre={soft:m8UnprovenBlocked,hard:m8HardBlocked,union:window.m8StorageBlocked,
        holder:M10.holder,auth:m10AuthNow().ok,exempt:m8SoftRecoveryAuth()};
      state.training.exercises.push({id:'plain',name:'Plain',muscle:'back',notes:[]});
      const ret=saveTraining();
      const refusedDelta=(window.__m10WriteRefused||0)-refused0;
      const d=JSON.parse(localStorage.getItem('wl_training_dirty__userA')||'null');
      await new Promise(r=>setTimeout(r,2600));
      return {pre,ret,refusedDelta,
        onDisk:(localStorage.getItem('wl_training_v1')||'').indexOf('"plain"')>=0,
        proof:!!(d&&typeof d.gen==='number'&&d.gen===d.persistedGen),
        blockedAfter:window.m8StorageBlocked};});
    test('T17d the ordinary holder path is untouched by the exemption',()=>{
      ok(!s.pre.union,'no block at all');ok(s.pre.holder&&s.pre.auth,'ordinary authority');
      ok(!s.pre.exempt.ok,'the exemption does NOT apply here');
      eq(s.pre.exempt.why,'not-soft-blocked','it declines for the right reason');
      eq(s.ret,undefined,'saveTraining() took the ORIGINAL path, not the recovery path');
      ok(s.onDisk,'the edit persisted');ok(s.proof,'with its generation proof');
      eq(s.refusedDelta,0,'nothing was refused');
      ok(!s.blockedAfter,'and no block was invented');});
    test('T17d no page errors',()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }
  {
    const st={leaseHeld:true};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      const refused0=window.__m10WriteRefused||0;
      const before=localStorage.getItem('wl_training_v1');
      state.training.exercises.push({id:'nh',name:'NoPen',muscle:'back',notes:[]});
      const ret=saveTraining();
      return {holder:M10.holder,blocked:window.m8StorageBlocked,ret,
        exempt:m8SoftRecoveryAuth(),
        same:localStorage.getItem('wl_training_v1')===before,
        refusedDelta:(window.__m10WriteRefused||0)-refused0};});
    test('T17d a non-holder with NO block is refused exactly as before',()=>{
      ok(!s.holder,'no pen');ok(!s.blocked,'and no storage block — so this is the ordinary refusal');
      ok(!s.exempt.ok,'the exemption is unavailable');eq(s.exempt.why,'not-soft-blocked');
      eq(s.ret,undefined,'refused');ok(s.same,'wl_training_v1 byte-identical');
      eq(s.refusedDelta,1,'counted as a refused write');});
    await ctx.close();
  }

  /* ================= round-34 ruling 4 =================
     T18/T19: the two UNGATED export actions, `m10cx:export` and `m8:cx:export`.
     Round 33 classified them as ungated mutations from code reading and gave
     them no tests. Each is now driven through its REAL data-act control as a
     NON-HOLDER, and each proves the same four properties:
       (1) it creates only the intended export evidence;
       (2) athlete snapshots and unrelated journals stay byte-identical;
       (3) a failed/cancelled export does not falsely satisfy the export gate;
       (4) a stale account/session context is refused.
     The OS share is stubbed in the page (the harness owns navigator), because
     the whole point of the gate is that only EVIDENCED delivery may open it. */
  const EXPSNAP=`function(skip){
    const o={};Object.keys(localStorage).forEach(function(k){
      if(k===skip)return;
      if(/^wl_v1$|^wl_training_|^wl_core_|^wl_workout|^wl_photomap|^wl_photo_ops__|^wl_last_owner$/.test(k))
        o[k]=localStorage.getItem(k);});
    return JSON.stringify(o);
  }`;
  const CLICK=`function(act){
    const b=document.createElement('button');
    b.setAttribute('data-act',act);document.body.appendChild(b);b.click();
    return b;
  }`;
  /* a REAL displaced core review whose export gate is CLOSED */
  const CXNOEXP=`async function(){
    const rec=await new Promise(r=>pbGetRecord(function(rc){r(rc);}));
    const scanon=m10cCanon(rec.data).canon;
    const lc=m10cCanon(payload());
    const env={canon:1,enteredAt:1,reason:'conflict',coreRevSeen:rec.coreRev,
      serverData:scanon,localData:lc.canon,exports:null};
    const wrote=m10cWrite('displaced',env);
    const e2=m10cxEnvelope();
    return {wrote:wrote,envSt:e2.st,
      gateOpen:e2.st==='ok'&&m10cxExportGateOpen(e2.val),
      holder:M10.holder,gated:!!M10_GATED['m10cx:export']};
  }`;

  /* ---- T18a: m10cx:export delivered ---- */
  {
    const st={leaseHeld:true};
    const {ctx,page,errs}=await boot(browser,server,st);
    const setup=await page.evaluate(async(src)=>eval('('+src+')')(),CXNOEXP);
    test('T18 setup: a real core review with a CLOSED export gate, on a device with no pen',()=>{
      ok(setup.wrote,'displaced envelope written');eq(setup.envSt,'ok','envelope validates');
      ok(!setup.gateOpen,'the export gate starts closed');
      ok(!setup.holder,'device does not hold the pen');
      ok(!setup.gated,'m10cx:export is deliberately NOT in M10_GATED');});
    const commitsBefore=st.commits||0;
    const s=await page.evaluate(async(args)=>{
      const [snapSrc,clickSrc]=args;
      const snap=eval('('+snapSrc+')'),click=eval('('+clickSrc+')');
      const key='wl_core_displaced__'+m8Uid();
      const before=snap(key);
      navigator.canShare=()=>true;navigator.share=()=>Promise.resolve();
      const toasts=[];const t0=window.toast;window.toast=function(m){toasts.push(m);return t0(m);};
      click('m10cx:export');
      await new Promise(r=>setTimeout(r,700));
      window.toast=t0;
      const env=m10cxEnvelope();
      return {toasts,holder:M10.holder,same:snap(key)===before,
        envSt:env.st,gateOpen:env.st==='ok'&&m10cxExportGateOpen(env.val),
        exports:env.st==='ok'?env.val.exports:null,
        dx:m10cRead('dxjournal').st};
    },[EXPSNAP,CLICK]);
    test('T18a m10cx:export as a NON-HOLDER creates only the intended export evidence',()=>{
      ok(!s.holder,'no pen');
      ok(s.toasts.some(x=>/Both copies exported/.test(x)),JSON.stringify(s.toasts));
      eq(s.envSt,'ok','the review envelope is still valid');
      ok(s.gateOpen,'and its export gate is now satisfied');
      ok(!!(s.exports&&s.exports.serverDone&&s.exports.localDone),'export evidence recorded');});
    test('T18a it touches nothing else: snapshots and unrelated journals byte-identical',()=>{
      ok(s.same,'wl_v1 / wl_training_* / wl_core_base|dirty|journal / wl_workout / photo stores identical');
      eq(s.dx,'absent','no dx recovery journal was opened');
      eq((st.commits||0)-commitsBefore,0,'zero core route calls');});
    test('T18a no page errors',()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }
  /* ---- T18b: a CANCELLED m10cx:export must not satisfy the gate ---- */
  {
    const st={leaseHeld:true};
    const {ctx,page,errs}=await boot(browser,server,st);
    const setup=await page.evaluate(async(src)=>eval('('+src+')')(),CXNOEXP);
    ok(setup.wrote&&setup.envSt==='ok'&&!setup.gateOpen,'T18b setup reached the same point');
    const commitsBefore=st.commits||0;
    const s=await page.evaluate(async(args)=>{
      const [snapSrc,clickSrc]=args;
      const snap=eval('('+snapSrc+')'),click=eval('('+clickSrc+')');
      const before=snap(null);
      navigator.canShare=()=>true;navigator.share=()=>Promise.reject(new Error('cancelled'));
      const toasts=[];const t0=window.toast;window.toast=function(m){toasts.push(m);return t0(m);};
      click('m10cx:export');
      await new Promise(r=>setTimeout(r,700));
      const env=m10cxEnvelope();
      const gateAfter=env.st==='ok'&&m10cxExportGateOpen(env.val);
      /* the gate is not merely "not recorded": the resolution really refuses */
      m10cxPushMine();
      await new Promise(r=>setTimeout(r,600));
      window.toast=t0;
      return {toasts,gateAfter,same:snap(null)===before,
        envSt:m10cxEnvelope().st,dx:m10cRead('dxjournal').st};
    },[EXPSNAP,CLICK]);
    test('T18b a cancelled export records nothing and does NOT satisfy the export gate',()=>{
      ok(s.toasts.some(x=>/Share cancelled/.test(x)),JSON.stringify(s.toasts));
      ok(!s.toasts.some(x=>/Both copies exported/.test(x)),'no false success claim');
      ok(!s.gateAfter,'the export gate is still closed');
      ok(s.same,'EVERY store, including the review envelope, is byte-identical');});
    test('T18b and the resolution it guards still refuses at the export gate',()=>{
      ok(s.toasts.some(x=>/Export both copies first/.test(x)),JSON.stringify(s.toasts));
      eq(s.envSt,'ok','the review is still open and unresolved');
      eq(s.dx,'absent','no resolution journal was opened');
      eq((st.commits||0)-commitsBefore,0,'zero core route calls');});
    test('T18b no page errors',()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }
  /* ---- T18c: a session that changed mid-export is refused ---- */
  {
    const st={leaseHeld:true};
    const {ctx,page,errs}=await boot(browser,server,st);
    const setup=await page.evaluate(async(src)=>eval('('+src+')')(),CXNOEXP);
    ok(setup.wrote&&setup.envSt==='ok'&&!setup.gateOpen,'T18c setup reached the same point');
    const s=await page.evaluate(async(args)=>{
      const [snapSrc,clickSrc]=args;
      const snap=eval('('+snapSrc+')'),click=eval('('+clickSrc+')');
      const before=snap(null);
      navigator.canShare=()=>true;
      navigator.share=()=>new Promise(res=>{window.__releaseShare=res;});
      const toasts=[];const t0=window.toast;window.toast=function(m){toasts.push(m);return t0(m);};
      click('m10cx:export');
      await new Promise(r=>setTimeout(r,300));
      const genBefore=M10.gen;
      m10Reset('another device took over while the share sheet was open');
      window.__releaseShare&&window.__releaseShare();
      await new Promise(r=>setTimeout(r,600));
      window.toast=t0;
      const env=m10cxEnvelope();
      return {toasts,genBefore,genAfter:M10.gen,same:snap(null)===before,
        gateAfter:env.st==='ok'&&m10cxExportGateOpen(env.val)};
    },[EXPSNAP,CLICK]);
    test('T18c a session change during the export is refused — no evidence, no writes',()=>{
      ok(s.genAfter>s.genBefore,'the session generation really changed');
      ok(!s.gateAfter,'the export gate is still closed');
      ok(!s.toasts.some(x=>/Both copies exported/.test(x)),'no success claim: '+JSON.stringify(s.toasts));
      ok(s.same,'every store is byte-identical');});
    test('T18c no page errors',()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }

  /* ---- T19: m8:cx:export, the training-conflict export ---- */
  const M8CXSETUP=`function(){
    const srv={cardioTypes:['Peloton'],exercises:[{id:'s1',name:'Server Row',muscle:'back',notes:[]}],
      liftSessions:{},routines:[],sessions:{}};
    const entered=m8EnterConflict(srv,3,'test');
    const r=m8Read('conflict');
    return {entered:entered,st:r.st,
      exported:r.st==='ok'&&!!(r.val.exports&&r.val.exports.localDone),
      holder:M10.holder,gated:!!M10_GATED['m8:cx:export'],state:m8State()};
  }`;
  {
    const st={leaseHeld:true};
    const {ctx,page,errs}=await boot(browser,server,st);
    const setup=await page.evaluate((src)=>eval('('+src+')')(),M8CXSETUP);
    test('T19 setup: a real training conflict with NO export evidence, on a device with no pen',()=>{
      ok(setup.entered,'conflict record written');eq(setup.st,'ok','and it validates');
      ok(!setup.exported,'no export evidence yet');
      ok(!setup.holder,'device does not hold the pen');
      ok(!setup.gated,'m8:cx:export is deliberately NOT in M10_GATED');});
    const commitsBefore=st.trainingCommits||0;
    const s=await page.evaluate(async(args)=>{
      const [snapSrc,clickSrc]=args;
      const snap=eval('('+snapSrc+')'),click=eval('('+clickSrc+')');
      const key='wl_training_conflict__'+m8Uid();
      const before=snap(key);
      navigator.canShare=()=>true;navigator.share=()=>Promise.resolve();
      const toasts=[];const t0=window.toast;window.toast=function(m){toasts.push(m);return t0(m);};
      click('m8:cx:export');
      await new Promise(r=>setTimeout(r,700));
      window.toast=t0;
      const r=m8Read('conflict');
      return {toasts,holder:M10.holder,same:snap(key)===before,
        st:r.st,exports:r.st==='ok'?r.val.exports:null,
        gateOpen:r.st==='ok'&&!!(r.val.exports&&r.val.exports.serverDone&&
          r.val.exports.localDone&&r.val.exports.localGen===m8Gen),
        journal:m8Read('journal').st};
    },[EXPSNAP,CLICK]);
    test('T19a m8:cx:export as a NON-HOLDER creates only the intended export evidence',()=>{
      ok(!s.holder,'no pen');
      ok(s.toasts.some(x=>/Both copies exported/.test(x)),JSON.stringify(s.toasts));
      eq(s.st,'ok','the conflict record is still valid');
      ok(s.gateOpen,'and the choice gate is now satisfied for THIS generation');});
    test('T19a it touches nothing else: snapshots and unrelated journals byte-identical',()=>{
      ok(s.same,'wl_v1 / wl_training_v1 / base / dirty / core / workout / photo stores identical');
      eq(s.journal,'absent','no transition journal was opened');
      eq((st.trainingCommits||0)-commitsBefore,0,'zero training route calls');});
    test('T19a no page errors',()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }
  {
    const st={leaseHeld:true};
    const {ctx,page,errs}=await boot(browser,server,st);
    const setup=await page.evaluate((src)=>eval('('+src+')')(),M8CXSETUP);
    ok(setup.entered&&!setup.exported,'T19b setup reached the same point');
    const commitsBefore=st.trainingCommits||0;
    const s=await page.evaluate(async(args)=>{
      const [snapSrc,clickSrc]=args;
      const snap=eval('('+snapSrc+')'),click=eval('('+clickSrc+')');
      const before=snap(null);
      navigator.canShare=()=>true;navigator.share=()=>Promise.reject(new Error('cancelled'));
      const toasts=[];const t0=window.toast;window.toast=function(m){toasts.push(m);return t0(m);};
      click('m8:cx:export');
      await new Promise(r=>setTimeout(r,700));
      const r=m8Read('conflict');
      const gateAfter=r.st==='ok'&&!!(r.val.exports&&r.val.exports.localDone);
      /* called DIRECTLY, so what refuses is the action's OWN boundary and
         not the click interceptor. Two distinct refusals live here and the
         order matters (D1 round 1, finding 3): authority is checked FIRST
         and offers takeover — a pen-less device must never hit a dead end —
         and only a pen-HOLDING device reaches the export gate. Both are
         asserted; before 2026-08-07 this case only knew about the second. */
      /* the takeover offer IS the app's askConfirm sheet ("Take over") */
      const sheetText=()=>((document.querySelector('.wl-confirm')||{}).textContent||'');
      const sheetBefore=/Take over/.test(sheetText());
      m8CxChooseLocal();                                  /* no pen */
      await new Promise(r2=>setTimeout(r2,400));
      const noPenOffersTakeover=/active writer/.test(sheetText())&&/Take over/.test(sheetText())&&!sheetBefore;
      const cancel=document.querySelector('[data-act="confirm:no"]');if(cancel)cancel.click();
      await new Promise(r2=>setTimeout(r2,150));
      const toastsNoPen=toasts.slice();
      /* now WITH the pen, so the export gate itself is what answers */
      M10.holder=true;M10.uid=pbUid();M10.fence=1;M10.gen=(M10.gen||0);
      M10.deadline=performance.now()+3600000;
      m8CxChooseLocal();
      await new Promise(r2=>setTimeout(r2,600));
      window.toast=t0;
      return {toasts,toastsNoPen,noPenOffersTakeover,gateAfter,same:snap(null)===before,
        st:m8Read('conflict').st,journal:m8Read('journal').st};
    },[EXPSNAP,CLICK]);
    test('T19b a cancelled export records nothing and does NOT satisfy the export gate',()=>{
      ok(s.toasts.some(x=>/Share cancelled/.test(x)),JSON.stringify(s.toasts));
      ok(!s.toasts.some(x=>/Both copies exported/.test(x)),'no false success claim');
      ok(!s.gateAfter,'the export gate is still closed');
      ok(s.same,'EVERY store, including the conflict record, is byte-identical');});
    test('T19b a pen-less device is offered takeover, not a dead end',()=>{
      ok(s.noPenOffersTakeover,'no takeover surface appeared: '+JSON.stringify(s.toastsNoPen));});
    test('T19b and the choice it guards still refuses at the export gate',()=>{
      ok(s.toasts.some(x=>/Export both copies first/.test(x)),JSON.stringify(s.toasts));
      eq(s.st,'ok','the conflict is still open and unresolved');
      eq(s.journal,'absent','no transition journal was opened');
      eq((st.trainingCommits||0)-commitsBefore,0,'zero training route calls');});
    test('T19b no page errors',()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }
  {
    const st={leaseHeld:true};
    const {ctx,page,errs}=await boot(browser,server,st);
    const setup=await page.evaluate((src)=>eval('('+src+')')(),M8CXSETUP);
    ok(setup.entered&&!setup.exported,'T19c setup reached the same point');
    const s=await page.evaluate(async(args)=>{
      const [snapSrc,clickSrc]=args;
      const snap=eval('('+snapSrc+')'),click=eval('('+clickSrc+')');
      const key='wl_training_conflict__userA';
      const before=snap(null),cxBefore=localStorage.getItem(key);
      navigator.canShare=()=>true;
      navigator.share=()=>new Promise(res=>{window.__releaseShare=res;});
      const toasts=[];const t0=window.toast;window.toast=function(m){toasts.push(m);return t0(m);};
      click('m8:cx:export');
      await new Promise(r=>setTimeout(r,300));
      const c=JSON.parse(localStorage.getItem('wl_pb'));c.uid='userB';
      localStorage.setItem('wl_pb',JSON.stringify(c));
      window.__releaseShare&&window.__releaseShare();
      await new Promise(r=>setTimeout(r,600));
      window.toast=t0;
      const cxAfter=localStorage.getItem(key);
      let exported=false;try{exported=!!(JSON.parse(cxAfter).exports||{}).localDone;}catch(e){}
      return {toasts,uidNow:pbUid(),cxSame:cxAfter===cxBefore,exported,
        otherKey:localStorage.getItem('wl_training_conflict__userB'),
        same:snap(null)===before};
    },[EXPSNAP,CLICK]);
    test('T19c an account change during the export is refused — no evidence on either account',()=>{
      eq(s.uidNow,'userB','the account really changed mid-export');
      ok(!s.exported,'no export evidence was recorded');
      ok(s.cxSame,"userA's conflict record is byte-identical");
      eq(s.otherKey,null,'and nothing was written under the new account');
      ok(!s.toasts.some(x=>/Both copies exported/.test(x)),'no success claim: '+JSON.stringify(s.toasts));});
    test('T19c no page errors',()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }

  /* ---- T20 (merge 2026-08-03): the two features that arrived from main —
     the six daily subjective ratings (state.ratings) and the weekly check-in
     (state.checkins) — are durable writes and must obey the same gate.

     Every arm below is run twice: NON-HOLDER (must change nothing at all, and
     wl_v1 must stay byte-identical) and HOLDER (must actually work), so the
     refusal can never be mistaken for the feature simply being broken. ---- */
  const FEELCI=function(){
    /* click a synthesised control the same way the real chips/buttons do */
    return {
      click:function(act,attrs){
        const b=document.createElement('button');
        b.setAttribute('data-act',act);
        Object.keys(attrs||{}).forEach(function(k){b.setAttribute(k,attrs[k]);});
        document.body.appendChild(b);b.click();b.remove();},
      wk:function(){return toISO(weekStartFor(0));}};
  }.toString();

  for(const arm of [{name:'non-holder',st:{leaseHeld:true},holder:false},
                    {name:'holder',    st:{},               holder:true}]){
    const st=arm.st;
    const {ctx,page,errs}=await boot(browser,server,st);
    const s=await page.evaluate(async(src)=>{
      const H=eval('('+src+')')();
      const today=todayISO(),wk=H.wk();
      /* Every snapshot carries BOTH the in-memory objects and the stored bytes,
         so a holder assertion can name the exact durable record it expects
         instead of settling for "wl_v1 changed at some point" — which an
         earlier step in the same run would satisfy on its own. */
      const stored=()=>{try{return JSON.parse(localStorage.getItem('wl_v1'))||{};}catch(e){return {};}};
      const snap=()=>({ratings:JSON.stringify(state.ratings||{}),
                       checkins:JSON.stringify(state.checkins||{}),
                       sRatings:JSON.stringify(stored().ratings||{}),
                       sCheckins:JSON.stringify(stored().checkins||{}),
                       v:localStorage.getItem('wl_v1')});
      const before=snap();

      /* (1) a ratings chip */
      H.click('rat:set',{'data-date':today,'data-q':'energy','data-v':'good'});
      await new Promise(r=>setTimeout(r,150));
      const afterRat=snap();

      /* (2) the check-in draft textarea — the input/change boundary, not a click */
      const ta=document.createElement('textarea');
      ta.className='wl-ci-input';ta.setAttribute('data-ci','win');ta.setAttribute('data-week',wk);
      document.body.appendChild(ta);
      ta.focus();ta.dispatchEvent(new Event('focusin',{bubbles:true}));
      ta.value='a good week';
      ta.dispatchEvent(new Event('input',{bubbles:true}));
      await new Promise(r=>setTimeout(r,150));
      const afterDraft=Object.assign(snap(),{field:ta.value});
      ta.remove();

      /* (3) skip the week, (4) undo the skip, (5) send the check-in */
      H.click('ci:skipask',{'data-week':wk});
      H.click('ci:skipyes',{'data-week':wk});
      await new Promise(r=>setTimeout(r,150));
      const afterSkip=snap();
      H.click('ci:unskip',{'data-week':wk});
      await new Promise(r=>setTimeout(r,150));
      const afterUnskip=snap();
      H.click('ci:send',{'data-week':wk});
      await new Promise(r=>setTimeout(r,400));
      const afterSend=snap();

      /* (6) opening/closing the view persists nothing on EITHER arm */
      const vBeforeOpen=localStorage.getItem('wl_v1');
      H.click('ci:open',{'data-week':wk});
      const opened=state.view;
      H.click('ci:close',{});
      await new Promise(r=>setTimeout(r,150));

      const rec=(JSON.parse(afterSend.sCheckins)||{})[wk]||null;
      return {holder:M10.holder,before,afterRat,afterDraft,afterSkip,afterUnskip,afterSend,
        opened,openClosePersistedNothing:localStorage.getItem('wl_v1')===vBeforeOpen,
        sentStatus:rec&&rec.status,sentAnswers:rec&&rec.answers?rec.answers.win:null,
        gatedNames:['rat:set','ci:send','ci:skipyes','ci:unskip'].map(a=>!!M10_GATED[a])};
    },FEELCI);

    if(!arm.holder){
      test('T20 non-holder: the run really was read-only',()=>{
        ok(!s.holder,'the device must NOT hold the pen for this arm');
        eq(s.gatedNames.join(','),'true,true,true,true','all four actions are in M10_GATED');});
      test('T20 non-holder: rat:set changes no rating and no stored byte',()=>{
        eq(s.afterRat.ratings,s.before.ratings,'state.ratings unchanged');
        eq(s.afterRat.sRatings,s.before.sRatings,'stored ratings unchanged');
        eq(s.afterRat.v,s.before.v,'wl_v1 byte-identical');});
      test('T20 non-holder: the check-in draft textarea is refused and the field reverted',()=>{
        eq(s.afterDraft.checkins,s.before.checkins,'state.checkins unchanged');
        eq(s.afterDraft.sCheckins,s.before.sCheckins,'stored checkins unchanged');
        eq(s.afterDraft.v,s.before.v,'wl_v1 byte-identical');
        eq(s.afterDraft.field,'','the typed text is restored to the prior value');});
      test('T20 non-holder: ci:skipyes writes no check-in',()=>{
        eq(s.afterSkip.checkins,s.before.checkins);eq(s.afterSkip.v,s.before.v,'wl_v1 byte-identical');});
      test('T20 non-holder: ci:unskip writes no check-in',()=>{
        eq(s.afterUnskip.checkins,s.before.checkins);eq(s.afterUnskip.v,s.before.v,'wl_v1 byte-identical');});
      test('T20 non-holder: ci:send writes no check-in',()=>{
        eq(s.afterSend.checkins,s.before.checkins);eq(s.afterSend.v,s.before.v,'wl_v1 byte-identical');
        eq(s.sentStatus,null,'no record for the week exists at all');});
      test('T20 non-holder: opening and closing the check-in view is still allowed and persists nothing',()=>{
        eq(s.opened,'checkin','a read-only device may still read its check-in');
        ok(s.openClosePersistedNothing,'wl_v1 byte-identical across open/close');});
      test('T20 non-holder: no page errors',()=>eq(errs.length,0,errs.join(';')));
    }else{
      test('T20 holder: the contrast arm really does hold the pen',()=>ok(s.holder));
      /* every holder assertion names the DURABLE record it expects — asserting
         only "wl_v1 changed" would be satisfied by an earlier step in the run */
      test('T20 holder: rat:set records the rating in memory AND on disk',()=>{
        ok(/"energy":"good"/.test(s.afterRat.ratings),'state.ratings: '+s.afterRat.ratings);
        ok(/"energy":"good"/.test(s.afterRat.sRatings),'stored ratings: '+s.afterRat.sRatings);});
      test('T20 holder: the check-in draft textarea persists the answer',()=>{
        ok(/a good week/.test(s.afterDraft.checkins),'state.checkins: '+s.afterDraft.checkins);
        ok(/a good week/.test(s.afterDraft.sCheckins),'stored checkins: '+s.afterDraft.sCheckins);
        eq(s.afterDraft.field,'a good week','the typed text stands');});
      test('T20 holder: ci:skipyes then ci:unskip move the week skipped → draft',()=>{
        ok(/"status":"skipped"/.test(s.afterSkip.checkins),s.afterSkip.checkins);
        ok(/"status":"skipped"/.test(s.afterSkip.sCheckins),'stored: '+s.afterSkip.sCheckins);
        ok(/"status":"draft"/.test(s.afterUnskip.checkins),s.afterUnskip.checkins);
        ok(/"status":"draft"/.test(s.afterUnskip.sCheckins),'stored: '+s.afterUnskip.sCheckins);});
      test('T20 holder: ci:send marks the week sent and keeps the draft answer',()=>{
        eq(s.sentStatus,'sent','read back out of the stored record');
        eq(s.sentAnswers,'a good week');});
      test('T20 holder: no page errors',()=>eq(errs.length,0,errs.join(';')));
    }
    await ctx.close();
  }

  await browser.close();server.close();
  console.log(`\nC19-M10 increment 5: ${passed} passed, ${failures.length} failed`);
  process.exit(failures.length?1:0);
})().catch(e=>{console.error('SUITE ERROR',e);process.exit(2);});
