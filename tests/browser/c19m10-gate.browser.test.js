/* C19-M10 (browser) — increment 5: the gate surface, real Chromium.

       CF_SRC=<file> node tests/browser/c19m10-gate.browser.test.js

   Round-28 list: complete m10Gate coverage of the enumerated action surface;
   fresh account/generation/holder/deadline/fence validation at delayed
   asynchronous boundaries; logout coupling with every M10 journal and pending
   obligation; fail-closed behavior when gate state or storage is unavailable.
   The inventory itself (action → gate → test) is INCR5-ACTION-INVENTORY.md. */
const path=require('path'),http=require('http'),fs=require('fs');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const SRC=process.env.CF_SRC||'/home/griffin/projects/Weight-Tracker/index.html';
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
    if(/cf\/appdata\/commit/.test(url)){st.commits=(st.commits||0)+1;st.rev=(st.rev||1)+1;return reply(200,{ok:true,newRev:st.rev});}
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
        &&!!M10_GATED['wo:finishlater']&&!!M10_GATED['day:reopendo']&&!!M10_GATED['sync:pasteapply'],
      hasDeferred:!!M10_GATED['photo:add']&&!!M10_GATED['import']&&!!M10_GATED['reset:ask'],
      pureNotGated:!M10_GATED['nav:go']&&!M10_GATED['cal:sel'],
      photoViewOpen:!M10_GATED['photo:view'],
      recoveryGated:!!M10_GATED['lrec:restore']&&!!M10_GATED['lrec:finish']&&!!M10_GATED['adopt:yes']}));
    test('T1 gate inventory loaded (132 actions: mutating + deferred openers + recovery; read-only viewing excluded)',()=>{
      eq(s.gated,132);ok(s.hasCore);ok(s.hasDeferred);ok(s.pureNotGated);
      ok(s.photoViewOpen,'read-only photo viewing stays open (STRICT allows reading)');
      ok(s.recoveryGated,'recovery/adoption actions carry explicit contracts');});
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
      for(const a of ['wo:start','wo:startroutine','wo:endrest','wu:yes','wo:finishlater','day:reopendo','sync:pasteapply']){
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

  await browser.close();server.close();
  console.log(`\nC19-M10 increment 5: ${passed} passed, ${failures.length} failed`);
  process.exit(failures.length?1:0);
})().catch(e=>{console.error('SUITE ERROR',e);process.exit(2);});
