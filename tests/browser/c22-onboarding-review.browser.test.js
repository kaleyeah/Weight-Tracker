/* C22 — the two faults the Owner hit on his iPad, 2026-08-03.

       CF_SRC=$PWD/index.html node tests/browser/c22-onboarding-review.browser.test.js

   1. A signed-in account with server data was offered FIRST-TIME SETUP before
      the cloud pull landed. Skipping it stamped `onboarded` plus default
      settings, producing an empty local core that then collided with the real
      server copy.
   2. `review-pending` rendered no banner at all. The sync dot said "core needs
      review", sync stopped and logout was blocked, with nothing on screen to
      act on.                                                                  */
const path=require('path'),http=require('http'),fs=require('fs');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const SRC=process.env.CF_SRC||'/home/griffin/projects/Weight-Tracker/index.html';

let passed=0;const failures=[];
const test=(n,f)=>{try{f();passed++;console.log('  ✓ '+n);}catch(e){failures.push(n);console.log('  ✗ '+n+'\n      '+(e&&e.message));}};
const eq=(a,b,m)=>{const x=JSON.stringify(a),y=JSON.stringify(b);if(x!==y)throw new Error((m?m+': ':'')+`expected ${y}, got ${x}`);};
const ok=(v,m)=>{if(!v)throw new Error(m||'expected truthy');};
const notOk=(v,m)=>{if(v)throw new Error(m||'expected falsy');};

const html=fs.readFileSync(SRC,'utf8');

/* a fresh signed-in device with NO local data, exactly like the iPad */
async function freshDevice(browser,routeHandler){
  const ctx=await browser.newContext({viewport:{width:390,height:844}});
  await ctx.addInitScript(()=>{
    localStorage.setItem('wl_pb',JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok',email:'a@x.com'}));
    localStorage.setItem('wl_last_owner','userA');
    /* deliberately NO wl_v1 — this is a device that has never held data */
  });
  await ctx.route('**/api/**',routeHandler);
  const page=await ctx.newPage();
  return {ctx,page};
}

(async()=>{
  const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const URL='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch();
  const errs=[];
  console.log('\nC22 (browser) — onboarding gate + review dead end\n  source: '+SRC);

  /* ---------- T1: setup is NOT offered before the pull answers ---------- */
  const slowServer=async r=>{
    const u=r.request().url();
    if(/cf\/writer\/lease/.test(u)){
      let b={};try{b=JSON.parse(r.request().postData()||'{}');}catch(e){}
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,exists:true,granted:true,
        fence:1,holderDeviceId:b.deviceId||'dev',deviceName:'x',active:true,serverNow:Date.now(),ttlMs:86400000})});
    }
    /* the account HAS data on the server, but the answer is slow */
    if(/collections\/appdata\/records/.test(u)){
      await new Promise(res=>setTimeout(res,900));
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[{
        id:'rec1',user:'userA',coreRev:300,trainingRev:28,
        data:{settings:{onboarded:true,units:'lbs',weekStart:'1',name:'Griffin'},
          weights:[{date:'2026-07-20',weight:189.2},{date:'2026-08-03',weight:183.6}],
          food:{},steps:{'2026-08-01':9000},sleep:{},notes:{},bodyfat:{},waist:{},leanmass:{},
          statuses:[],presets:[],skips:{},nightlyLog:{}}}]})});
    }
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],token:'tok',record:{id:'userA'}})});
  };
  const d1=await freshDevice(browser,slowServer);
  d1.page.on('pageerror',e=>errs.push(String(e)));
  await d1.page.goto(URL,{waitUntil:'load'});
  await d1.page.waitForFunction(()=>typeof window.render==='function',null,{timeout:20000});
  await d1.page.waitForTimeout(350);
  const early=await d1.page.evaluate(()=>({onboarding:!!state.onboarding,deferred:!!state.obDeferred,
    setupVisible:!!document.querySelector('[data-act="ob:skip"]')}));
  test('T1 a signed-in device with no local data yet is NOT shown first-time setup',()=>{
    notOk(early.onboarding,'onboarding opened before the pull could answer');
    notOk(early.setupVisible,'the Skip control was on screen — this is the trap the iPad hit');
    ok(early.deferred,'the decision should be deferred, not silently dropped');
  });

  /* ---------- T2: once the pull lands with data, setup never appears ---- */
  await d1.page.waitForTimeout(4200);
  const late=await d1.page.evaluate(()=>({onboarding:!!state.onboarding,deferred:!!state.obDeferred,
    onboarded:state.settings.onboarded,weighIns:state.weights.length,
    setupVisible:!!document.querySelector('[data-act="ob:skip"]')}));
  test('T2 when the pull brings data the account is marked set up, setup never shows',()=>{
    ok(late.weighIns>0,'the fixture data did not arrive; got '+late.weighIns+' weigh-ins');
    notOk(late.onboarding,'setup opened even though the account has data');
    notOk(late.setupVisible);
    eq(late.onboarded,true);
    notOk(late.deferred,'the gate must resolve rather than stay pending');
  });
  await d1.ctx.close();

  /* ---------- T3: a genuinely new account still gets setup ------------- */
  const emptyServer=r=>{
    const u=r.request().url();
    if(/cf\/writer\/lease/.test(u)){
      let b={};try{b=JSON.parse(r.request().postData()||'{}');}catch(e){}
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,exists:true,granted:true,
        fence:1,holderDeviceId:b.deviceId||'dev',deviceName:'x',active:true,serverNow:Date.now(),ttlMs:86400000})});
    }
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],token:'tok',record:{id:'userA'}})});
  };
  const d2=await freshDevice(browser,emptyServer);
  d2.page.on('pageerror',e=>errs.push(String(e)));
  await d2.page.goto(URL,{waitUntil:'load'});
  await d2.page.waitForFunction(()=>typeof window.render==='function',null,{timeout:20000});
  await d2.page.waitForTimeout(5000);
  const t3=await d2.page.evaluate(()=>({onboarding:!!state.onboarding,
    setupVisible:!!document.querySelector('[data-act="ob:skip"]'),deferred:!!state.obDeferred}));
  test('T3 a genuinely empty account DOES still get first-time setup',()=>{
    ok(t3.onboarding,'a new user must still be onboarded — the gate must not swallow it');
    ok(t3.setupVisible);
    notOk(t3.deferred);
  });

  /* ---------- T4: skipping on an empty signed-in account does not stamp - */
  const t4=await d2.page.evaluate(()=>{
    const btn=document.querySelector('[data-act="ob:skip"]');
    if(btn)btn.click();
    const raw=localStorage.getItem('wl_v1');
    return {onboarded:state.settings.onboarded,
      storedOnboarded:raw?((JSON.parse(raw).settings||{}).onboarded):null};
  });
  test('T4 skipping while signed in with no data does not claim the account is set up',()=>{
    notOk(t4.onboarded===true,'skip stamped onboarded=true — this is what created the empty core');
    notOk(t4.storedOnboarded===true,'and it reached storage');
  });
  await d2.ctx.close();

  /* ---------- T5: review-pending shows a banner and a control ---------- */
  const d3=await freshDevice(browser,emptyServer);
  d3.page.on('pageerror',e=>errs.push(String(e)));
  await d3.page.goto(URL,{waitUntil:'load'});
  await d3.page.waitForFunction(()=>typeof window.m10cState==='function',null,{timeout:20000});
  const t5=await d3.page.evaluate(()=>{
    /* forge exactly the terminal journal the iPad was stuck on */
    const uid=(typeof m8Uid==='function')?m8Uid():'userA';
    /* a VALID terminal core-bootstrap record: the exact shape the client writes
       when the server has data a fresh device cannot reconcile (index.html's
       "core-bootstrap" + bootstrap-conflict path), so m10cValidateJournal
       accepts it and the state is review-pending rather than corrupt */
    const j={op:'core-bootstrap',phase:'done',outcome:'bootstrap-conflict',
      startedAt:Date.now(),expect:{serverRev:300,serverCanon:null}};
    /* write it through the product's OWN verified writer — these keys carry an
       integrity envelope, so a raw localStorage.setItem reads back as malformed */
    m10cJournalWrite(j,uid);
    const st=m10cState();
    const html2=m10cxBannerHTML();
    const holder=document.createElement('div');holder.innerHTML=html2;
    return {state:st,bannerEmpty:html2==='',
      title:(holder.querySelector('.wl-card-head span')||{}).textContent||null,
      action:(holder.querySelector('button')||{}).getAttribute?holder.querySelector('button').getAttribute('data-act'):null};
  });
  test('T5 review-pending renders a banner with an actionable control',()=>{
    eq(t5.state,'review-pending','the fixture did not reproduce the stuck state');
    notOk(t5.bannerEmpty,'review-pending rendered NOTHING — the dead end the Owner hit');
    eq(t5.title,'Body data needs your review');
    eq(t5.action,'m10cx:prepare');
  });

  /* ---------- T6: the displaced banner is unchanged -------------------- */
  const t6=await d3.page.evaluate(()=>{
    localStorage.removeItem(m10cKey('journal',(typeof m8Uid==='function')?m8Uid():'userA'));
    return {clean:m10cState(),banner:m10cxBannerHTML()};
  });
  test('T6 with no journal there is no banner and the state is not stuck',()=>{
    notOk(t6.clean==='review-pending');
    eq(t6.banner,'','a device with nothing wrong must show no banner');
  });
  await d3.ctx.close();

  /* ---------- T8: THE OWNER'S ACTUAL FLOW ------------------------------
       A brand-new device boots SIGNED OUT — so the boot-time gate never sees
       it and first-time setup is already on screen. He then logs in. Setup
       must close on sign-in and never reappear, because signing in is proof
       this is not a first run. This is the case .430 missed. ------------- */
  const d4ctx=await browser.newContext({viewport:{width:390,height:844}});
  await d4ctx.addInitScript(()=>{ /* NO wl_pb, NO wl_v1: a virgin device */ });
  await d4ctx.route('**/api/**',async r=>{
    const u=r.request().url();
    if(/auth-with-password/.test(u))
      return r.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify({token:'tok',record:{id:'userA',email:'a@x.com'}})});
    if(/cf\/writer\/lease/.test(u)){
      let b={};try{b=JSON.parse(r.request().postData()||'{}');}catch(e){}
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,exists:true,granted:true,
        fence:1,holderDeviceId:b.deviceId||'dev',deviceName:'x',active:true,serverNow:Date.now(),ttlMs:86400000})});
    }
    if(/collections\/appdata\/records/.test(u))
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[{
        id:'rec1',user:'userA',coreRev:300,trainingRev:28,
        data:{settings:{onboarded:true,units:'lbs',weekStart:'1',name:'Griffin'},
          weights:[{date:'2026-07-20',weight:189.2},{date:'2026-08-03',weight:183.6}],
          food:{},steps:{'2026-08-01':9000},sleep:{},notes:{},bodyfat:{},waist:{},leanmass:{},
          statuses:[],presets:[],skips:{},nightlyLog:{}}}]})});
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],token:'tok',record:{id:'userA'}})});
  });
  const p4=await d4ctx.newPage();
  p4.on('pageerror',e=>errs.push(String(e)));
  await p4.goto(URL,{waitUntil:'load'});
  await p4.waitForFunction(()=>typeof window.pbDoLogin==='function',null,{timeout:20000});
  await p4.waitForTimeout(600);
  const signedOut=await p4.evaluate(()=>({loginVisible:!!document.getElementById('wl-pb-email'),
    onboarding:!!state.onboarding}));
  /* now sign in through the REAL form, exactly as he did */
  await p4.evaluate(()=>{
    document.getElementById('wl-pb-email').value='a@x.com';
    document.getElementById('wl-pb-pass').value='pw';
    const b=document.getElementById('wl-pb-base');if(b)b.value='https://pb.test';
    pbDoLogin();
  });
  await p4.waitForTimeout(5000);
  const afterLogin=await p4.evaluate(()=>({
    onboarding:!!state.onboarding,
    setupVisible:!!document.querySelector('[data-act="ob:skip"]'),
    weighIns:state.weights.length,
    onboarded:state.settings.onboarded,
    name:state.settings.name||null,
    deferred:!!state.obDeferred}));
  test('T8 signing in on a virgin device closes first-time setup and never re-shows it',()=>{
    ok(signedOut.loginVisible,'the fixture did not reach the login screen');
    ok(afterLogin.weighIns>0,'the account data never arrived; got '+afterLogin.weighIns);
    notOk(afterLogin.onboarding,'first-time setup was STILL showing after sign-in — the Owner\'s exact complaint');
    notOk(afterLogin.setupVisible,'the Skip control was still on screen after sign-in');
    eq(afterLogin.onboarded,true);
    eq(afterLogin.name,'Griffin','the account settings must have been adopted');
    notOk(afterLogin.deferred,'the gate must resolve, not stay pending');
  });
  await d4ctx.close();

  /* ---------- T9: the read-only bar ------------------------------------
       Owner, 2026-08-03: a non-holder must carry a persistent bar naming the
       other device, offering takeover, and warning to save there first. ---- */
  const heldServer=r=>{
    const u=r.request().url();
    if(/auth-with-password/.test(u))
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({token:'tok',record:{id:'userA',email:'a@x.com'}})});
    if(/cf\/writer\/lease/.test(u))            /* someone else holds it */
      return r.fulfill({status:409,contentType:'application/json',body:JSON.stringify({ok:false,held:true,exists:true,active:true,
        fence:7,holderDeviceId:'dev-other',deviceName:'iPhone',serverNow:Date.now(),ttlMs:86400000})});
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],token:'tok',record:{id:'userA'}})});
  };
  const d5=await freshDevice(browser,heldServer);
  d5.page.on('pageerror',e=>errs.push(String(e)));
  await d5.page.goto(URL,{waitUntil:'load'});
  await d5.page.waitForFunction(()=>typeof window.render==='function',null,{timeout:20000});
  await d5.page.waitForTimeout(4000);
  const t9=await d5.page.evaluate(()=>{
    const bar=document.querySelector('.wl-robar');
    const views=['overview','weight','train','summary'];
    const perView=views.map(v=>{state.view=v;render();return !!document.querySelector('.wl-robar');});
    state.view='overview';render();
    return {holder:M10.holder,present:!!bar,
      title:bar?bar.querySelector('.wl-robar-t').textContent:null,
      sub:bar?bar.querySelector('.wl-robar-s').textContent:null,
      act:bar?bar.getAttribute('data-act'):null,
      cta:bar?bar.querySelector('.wl-robar-go').textContent:null,
      perView};
  });
  test('T9 a read-only device carries a persistent takeover bar on every tab',()=>{
    notOk(t9.holder,'fixture failed: this device should NOT hold the pen');
    ok(t9.present,'no bar — the device is read-only and says nothing persistent');
    ok(/already logged in/.test(t9.title||''),'title was: '+t9.title);
    ok(/iPhone/.test(t9.title||''),'it should name the other device: '+t9.title);
    ok(/take over/i.test(t9.sub||''),'sub was: '+t9.sub);
    ok(/save any progress/i.test(t9.sub||''),'it must warn to save on the other device first: '+t9.sub);
    eq(t9.act,'m10:takeover');
    ok(/take over/i.test(t9.cta||''));
    eq(t9.perView,[true,true,true,true],'the bar must show on every tab, not just Home');
  });

  /* ---------- T10: the holder never sees it --------------------------- */
  const t10=await d5.page.evaluate(()=>{
    M10.holder=true;render();
    const asHolder=!!document.querySelector('.wl-robar');
    M10.holder=false;render();
    const asNonHolder=!!document.querySelector('.wl-robar');
    return {asHolder,asNonHolder};
  });
  test('T10 the active writer is never nagged by the bar',()=>{
    notOk(t10.asHolder,'the holder must not see a takeover bar');
    ok(t10.asNonHolder,'and it must come back when the pen is lost');
  });
  await d5.ctx.close();

  /* ---------- T11: a read-only device keeps pulling ---------------------
       Owner, 2026-08-03: "the readonly does not sync again after initial load.
       i cant get it to resync by refreshing." The renew timer and the
       visibility handler both ran only for the HOLDER. ------------------- */
  let pulls=0, statuses=0;
  const countingServer=r=>{
    const u=r.request().url();
    if(/auth-with-password/.test(u))
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({token:'tok',record:{id:'userA',email:'a@x.com'}})});
    if(/cf\/writer\/lease/.test(u)){
      let b={};try{b=JSON.parse(r.request().postData()||'{}');}catch(e){}
      if(b.op==='status')statuses++;
      return r.fulfill({status:409,contentType:'application/json',body:JSON.stringify({ok:false,held:true,exists:true,active:true,
        fence:7,holderDeviceId:'dev-other',deviceName:'iPhone',serverNow:Date.now(),ttlMs:86400000})});
    }
    if(/collections\/appdata\/records/.test(u)&&r.request().method()==='GET'){pulls++;
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[{
        id:'rec1',user:'userA',coreRev:9,trainingRev:1,
        data:{settings:{onboarded:true,units:'lbs',weekStart:'1'},weights:[{date:'2026-08-03',weight:183.6}],
          food:{},steps:{},sleep:{},notes:{},bodyfat:{},waist:{},leanmass:{},statuses:[],presets:[],skips:{},nightlyLog:{}}}]})});}
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],token:'tok',record:{id:'userA'}})});
  };
  const d6=await freshDevice(browser,countingServer);
  d6.page.on('pageerror',e=>errs.push(String(e)));
  await d6.page.goto(URL,{waitUntil:'load'});
  /* a build without the capability must FAIL the assertion, not abort the run */
  await d6.page.waitForFunction(()=>typeof window.m10RoRefresh==='function',null,{timeout:8000}).catch(()=>{});
  await d6.page.waitForTimeout(4000);
  const afterBoot={pulls,statuses};
  const t11=await d6.page.evaluate(async()=>{
    const before=M10.holder;
    const hasFn=(typeof m10RoRefresh==='function');
    /* simulate coming back to the app, the way returning to the iPad does */
    if(hasFn)m10RoRefresh(true);
    else document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(r=>setTimeout(r,2500));
    return {holder:before,hasFn:hasFn};
  });
  test('T11 a read-only device re-checks the lease and pulls again after boot',()=>{
    notOk(t11.holder,'fixture failed: should be a non-holder');
    ok(t11.hasFn,'the read-only refresh path must exist');
    ok(statuses>afterBoot.statuses,'it must re-check the lease; status calls '+afterBoot.statuses+' -> '+statuses);
    ok(pulls>afterBoot.pulls,'it must pull again; record GETs '+afterBoot.pulls+' -> '+pulls);
  });
  await d6.ctx.close();

  /* ---------- T12: taking over refreshes before you use it ------------- */
  let grantNow=false, pulls2=0;
  const takeoverServer=r=>{
    const u=r.request().url();
    if(/auth-with-password/.test(u))
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({token:'tok',record:{id:'userA',email:'a@x.com'}})});
    if(/cf\/writer\/lease/.test(u)){
      let b={};try{b=JSON.parse(r.request().postData()||'{}');}catch(e){}
      if(b.op==='steal'||grantNow){grantNow=true;
        return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,exists:true,granted:true,active:true,
          fence:8,holderDeviceId:b.deviceId||'dev',deviceName:'iPad',serverNow:Date.now(),ttlMs:86400000})});}
      return r.fulfill({status:409,contentType:'application/json',body:JSON.stringify({ok:false,held:true,exists:true,active:true,
        fence:7,holderDeviceId:'dev-other',deviceName:'iPhone',serverNow:Date.now(),ttlMs:86400000})});
    }
    if(/collections\/appdata\/records/.test(u)&&r.request().method()==='GET'){pulls2++;
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[{
        id:'rec1',user:'userA',coreRev:9,trainingRev:1,
        data:{settings:{onboarded:true,units:'lbs',weekStart:'1'},weights:[{date:'2026-08-03',weight:183.6}],
          food:{},steps:{},sleep:{},notes:{},bodyfat:{},waist:{},leanmass:{},statuses:[],presets:[],skips:{},nightlyLog:{}}}]})});}
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],token:'tok',record:{id:'userA'}})});
  };
  const d7=await freshDevice(browser,takeoverServer);
  d7.page.on('pageerror',e=>errs.push(String(e)));
  await d7.page.goto(URL,{waitUntil:'load'});
  await d7.page.waitForFunction(()=>typeof window.m10TakeoverSheet==='function',null,{timeout:8000}).catch(()=>{});
  await d7.page.waitForTimeout(4000);
  const beforeTakeover=pulls2;
  const t12=await d7.page.evaluate(async()=>{
    m10TakeoverSheet();
    await new Promise(r=>setTimeout(r,300));
    const y=[].slice.call(document.querySelectorAll('.wl-confirm button')).slice(-1)[0];
    if(y)y.click();
    await new Promise(r=>setTimeout(r,3000));
    return {holder:M10.holder,fence:M10.fence};
  });
  test('T12 taking over pulls fresh data instead of handing you a stale copy',()=>{
    ok(t12.holder,'the takeover did not grant the pen');
    ok(pulls2>beforeTakeover,'no pull followed the takeover; record GETs '+beforeTakeover+' -> '+pulls2);
  });
  await d7.ctx.close();

  /* ---------- T13: a SLOW server must never trigger setup ---------------
       The regression the Owner hit twice: the gate ran on a timer and, with the
       pull still in flight, declared him a new user. Setup may open only on a
       CONFIRMED empty read. Here the record takes 6s — longer than any timer —
       and setup must never appear, before or after. ---------------------- */
  let served=false;
  const verySlowServer=async r=>{
    const u=r.request().url();
    if(/auth-with-password/.test(u))
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({token:'tok',record:{id:'userA',email:'a@x.com'}})});
    if(/cf\/writer\/lease/.test(u)){
      let b={};try{b=JSON.parse(r.request().postData()||'{}');}catch(e){}
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,exists:true,granted:true,
        fence:1,holderDeviceId:b.deviceId||'dev',deviceName:'x',active:true,serverNow:Date.now(),ttlMs:86400000})});
    }
    if(/collections\/appdata\/records/.test(u)){
      await new Promise(res=>setTimeout(res,6000));   /* far slower than any timer */
      served=true;
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[{
        id:'rec1',user:'userA',coreRev:301,trainingRev:28,
        data:{settings:{onboarded:true,units:'lbs',weekStart:'1',name:'Griffin'},
          weights:[{date:'2026-07-20',weight:189.2},{date:'2026-08-03',weight:183.6}],
          food:{},steps:{},sleep:{},notes:{},bodyfat:{},waist:{},leanmass:{},
          statuses:[],presets:[],skips:{},nightlyLog:{}}}]})});
    }
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],token:'tok',record:{id:'userA'}})});
  };
  const d8=await freshDevice(browser,verySlowServer);
  d8.page.on('pageerror',e=>errs.push(String(e)));
  await d8.page.goto(URL,{waitUntil:'load'});
  await d8.page.waitForFunction(()=>typeof window.render==='function',null,{timeout:20000});
  /* sample right through the window the old timer fired in */
  const samples=[];
  for(let i=0;i<10;i++){
    await d8.page.waitForTimeout(500);
    samples.push(await d8.page.evaluate(()=>!!state.onboarding||!!document.querySelector('[data-act="ob:skip"]')));
  }
  await d8.page.waitForTimeout(4000);
  const t13=await d8.page.evaluate(()=>({onboarding:!!state.onboarding,
    setupVisible:!!document.querySelector('[data-act="ob:skip"]'),
    weighIns:state.weights.length,onboarded:state.settings.onboarded}));
  test('T13 a slow pull never makes the app decide you are a new user',()=>{
    ok(served,'the fixture never served the record');
    eq(samples.filter(Boolean).length,0,'setup appeared while the pull was still in flight');
    notOk(t13.onboarding,'setup was open after the pull landed');
    notOk(t13.setupVisible);
    ok(t13.weighIns>0,'the data should have arrived; got '+t13.weighIns);
    eq(t13.onboarded,true);
  });
  await d8.ctx.close();

  /* ---------- T14: the review banner is REACHABLE, on every tab ---------
       Owner, 2026-08-03: the app knew it needed review and showed nothing —
       the state changed in the background and the screen was never redrawn, and
       the banner only existed on Home anyway. --------------------------- */
  const d9=await freshDevice(browser,emptyServer);
  d9.page.on('pageerror',e=>errs.push(String(e)));
  await d9.page.goto(URL,{waitUntil:'load'});
  await d9.page.waitForFunction(()=>typeof window.m10cState==='function',null,{timeout:20000});
  await d9.page.waitForTimeout(2000);
  const t14=await d9.page.evaluate(()=>{
    const uid=(typeof m8Uid==='function')?m8Uid():'userA';
    const j={op:'core-bootstrap',phase:'done',outcome:'bootstrap-conflict',
      startedAt:Date.now(),expect:{serverRev:300,serverCanon:null}};
    m10cJournalWrite(j,uid);
    const seen={};
    ['overview','weight','train','summary'].forEach(v=>{
      state.view=v;render();
      seen[v]={shown:/Body data needs your review/.test(document.body.textContent||''),
        count:document.querySelectorAll('[data-act="m10cx:prepare"]').length,
        prepare:!!document.querySelector('[data-act="m10cx:prepare"]')};
    });
    state.view='overview';render();
    return {state:m10cState(),seen};
  });
  const d9x=d9;
  test('T14 the review banner appears on every tab, exactly once',()=>{
    eq(t14.state,'review-pending');
    ['overview','weight','train','summary'].forEach(v=>{
      ok(t14.seen[v].shown,'no review banner on the '+v+' tab');
      eq(t14.seen[v].count,1,'the banner is duplicated on '+v);
      ok(t14.seen[v].prepare,'no Prepare control on '+v);
    });
  });

  /* ---------- T15: SOURCE-LEVEL check -----------------------------------
       I could not build a clean fixture for the in-place redraw (the review
       state is sticky across renders in the harness), so this asserts the
       weaker thing I can actually verify: every path that enters the review
       state redraws. Stated as a source check, not dressed up as behavioural. */
  const t15=await d9.page.evaluate(()=>{
    const src=document.documentElement.outerHTML;
    const hits=(src.match(/setSync\("error","core needs review"\);try\{render\(\);\}catch/g)||[]).length;
    const total=(src.match(/setSync\("error","core needs review"\)/g)||[]).length;
    return {hits,total};
  });
  test('T15 [source] every path entering the review state redraws the screen',()=>{
    ok(t15.total>0,'no review-entry sites found at all');
    eq(t15.hits,t15.total,'only '+t15.hits+' of '+t15.total+' review-entry sites redraw');
  });

  /* ---------- T16: a READ-ONLY device can resolve its own conflict ------
       Owner, 2026-08-03: "it tells me i need to take the pen first". Taking the
       SERVER's copy writes only locally, so requiring the pen made a conflicted
       read-only device unrecoverable — it could not review, and could not take
       the pen without reviewing. Keeping THIS device's copy still needs the pen,
       because that one writes to the server. --------------------------- */
  const t16=await d9x.page.evaluate(()=>{
    const src=m10cxTakeServer.toString();
    const mine=m10cxPushMine.toString()+
      (typeof m10cxPushMineComplete==='function'?m10cxPushMineComplete.toString():'');
    return {
      takeServerDemandsPen:/Take over as the active writer first/.test(src),
      pushMineDemandsPen:/Take over as the active writer first/.test(mine),
      takeServerWritesLocallyOnly:/m10cWrite\("base"|markDirty\(false\)/.test(src)};
  });
  test('T16 a read-only device may adopt the server copy; only pushing needs the pen',()=>{
    notOk(t16.takeServerDemandsPen,'taking the SERVER copy still demands the pen — the deadlock');
    ok(t16.pushMineDemandsPen,'pushing THIS device up must still require the pen');
    ok(t16.takeServerWritesLocallyOnly,'taking the server copy should install it locally');
  });
  /* ---------- T17: the BUTTON, not just the function --------------------
       .436 removed the pen check inside m10cxTakeServer but left the UI gate
       shared between both choices, so a read-only device still saw both greyed
       out — the deadlock survived at the button (Owner, 2026-08-03, screenshot
       showing both disabled). The two choices need different gates. --- */
  const t17=await d9.page.evaluate(()=>{
    const src=m10cxViewHTML.toString();
    return {
      hasSharedGate:/var unlocked\s*=\s*exported\s*&&\s*holder/.test(src),
      mineNeedsPen:/unlockedMine\s*=\s*exported\s*&&\s*holder/.test(src),
      serverNeedsExportOnly:/unlockedServer\s*=\s*exported\b/.test(src)&&
                            !/unlockedServer\s*=\s*exported\s*&&\s*holder/.test(src),
      mineButtonUsesMineGate:/unlockedMine\?'data-act="m10cx:mine"/.test(src),
      serverButtonUsesServerGate:/unlockedServer&&v\.serverData!==null\?'data-act="m10cx:server"/.test(src),
      penCopyStillClaimsBoth:/resolving needs the pen/.test(src)};
  });
  test('T17 the two review choices have DIFFERENT gates, so read-only is not stuck',()=>{
    notOk(t17.hasSharedGate,'both choices still share one gate — the deadlock');
    ok(t17.mineNeedsPen,'keeping THIS device\'s copy must still require the pen');
    ok(t17.serverNeedsExportOnly,'taking the SERVER copy must need the export only');
    ok(t17.mineButtonUsesMineGate,'the keep-mine button is not wired to its own gate');
    ok(t17.serverButtonUsesServerGate,'the take-server button is not wired to its own gate');
    notOk(t17.penCopyStillClaimsBoth,'the copy still tells the user BOTH choices need the pen');
  });

  /* ---------- T18: the review must say which copy is NEWER ---------------
       Owner, 2026-08-04: "The info isn't helpful to select. It needs the time
       stamp of the last saved states." Counts alone cannot separate two copies
       holding the same number of entries. ------------------------------- */
  const t18=await d9.page.evaluate(()=>{
    const mk=o=>JSON.stringify(o);
    const older=mk({weights:[{date:'2026-08-01',weight:184}],food:{'2026-08-01':{calories:2000}},
      steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},workouts:{}});
    const newer=mk({weights:[{date:'2026-08-03',weight:183}],food:{'2026-08-03':{calories:2100}},
      steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},workouts:{}});
    return {
      summaryHasDate:/newest entry/.test(m10cxSummary(newer)),
      serverAhead:m10cxAheadLine({localData:older,serverData:newer}),
      deviceAhead:m10cxAheadLine({localData:newer,serverData:older}),
      tie:m10cxAheadLine({localData:newer,serverData:newer})};
  });
  test('T18 the review names the newest entry on each side and which is ahead',()=>{
    ok(t18.summaryHasDate,'the per-side summary must carry a date');
    ok(/server copy/i.test(t18.serverAhead)&&/more recent/i.test(t18.serverAhead),
      'server-ahead line was: '+t18.serverAhead);
    ok(/device/i.test(t18.deviceAhead)&&/more recent/i.test(t18.deviceAhead),
      'device-ahead line was: '+t18.deviceAhead);
    ok(/same day/i.test(t18.tie),'a tie must say so rather than pick one: '+t18.tie);
  });

  /* ---------- T19: a NON-HOLDER must not push -------------------------
       The cause of the false conflicts: a device without the pen still sent a
       commit with fence:null, and with enforcement off the server took it. Two
       devices writing the same data at different revisions then "conflicted"
       (Owner, 2026-08-04, twice). ------------------------------------- */
  let commits=0;
  const commitCounting=r=>{
    const u=r.request().url();
    if(/auth-with-password/.test(u))
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({token:'tok',record:{id:'userA',email:'a@x.com'}})});
    if(/cf\/writer\/lease/.test(u))
      return r.fulfill({status:409,contentType:'application/json',body:JSON.stringify({ok:false,held:true,exists:true,active:true,
        fence:7,holderDeviceId:'dev-other',deviceName:'iPhone',serverNow:Date.now(),ttlMs:86400000})});
    if(/cf\/appdata\/commit/.test(u)){commits++;
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,newRev:9,subsystem:'core'})});}
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],token:'tok',record:{id:'userA'}})});
  };
  const d10=await freshDevice(browser,commitCounting);
  d10.page.on('pageerror',e=>errs.push(String(e)));
  await d10.page.goto(URL,{waitUntil:'load'});
  await d10.page.waitForFunction(()=>typeof window.m10cPush==='function',null,{timeout:20000});
  await d10.page.waitForTimeout(3500);
  const t19=await d10.page.evaluate(async()=>{
    /* A non-holder cannot BECOME dirty — save() is gated too. The real case is
       a device that WAS the writer, made changes, then lost the pen: its
       changes are already local and must not go up unfenced. */
    M10.holder=true;M10.uid=pbUid();M10.fence=7;M10.deadline=performance.now()+600000;
    state.steps[todayISO()]=12345;save();
    const dirtyAsHolder=m10cState();
    M10.holder=false;M10.fence=0;          /* the other device took over */
    const before=m10cState();
    let pushed=null;
    await new Promise(res=>{m10cPush(true,function(ok){pushed=ok;res();});});
    return {holder:M10.holder,dirtyAsHolder,stateBefore:before,pushed,stateAfter:m10cState()};
  });
  test('T19 a device without the pen does not push, and keeps its changes locally',()=>{
    notOk(t19.holder,'fixture failed: this device should not hold the pen');
    ok(/^dirty/.test(t19.dirtyAsHolder),'fixture failed: the holder edit did not make it dirty, got '+t19.dirtyAsHolder);
    ok(/^dirty/.test(t19.stateBefore),'fixture failed: expected dirty after losing the pen, got '+t19.stateBefore);
    notOk(t19.pushed,'the push should refuse');
    eq(commits,0,'a fence-less commit reached the server anyway ('+commits+')');
    ok(/^dirty/.test(t19.stateAfter),'the changes must stay local, not be discarded');
  });
  await d10.ctx.close();

  /* ---------- T20: the conflict export must be READABLE ------------------
       Both exports did Object.assign({}, backupJSON(), {...}) — and backupJSON
       returns a STRING, so the file came out as ~150k numbered character keys
       instead of the data. It is the safety artifact taken BEFORE choosing
       which copy to keep, so a broken one is worse than none (Owner, 2026-08-04,
       who had to have it reconstructed character by character). ---------- */
  const t20=await d9.page.evaluate(()=>{
    const txt=conflictExportText('core-local');
    let obj=null,err=null;
    try{obj=JSON.parse(txt);}catch(e){err=String(e);}
    const keys=obj?Object.keys(obj):[];
    const numericKeys=keys.filter(k=>/^\d+$/.test(k)).length;
    return {parsed:!!obj,err,marker:obj&&obj.__conflict,
      totalKeys:keys.length,numericKeys,
      hasRealSections:keys.some(k=>['weights','food','steps','settings','sleep'].includes(k)),
      sample:keys.slice(0,10)};
  });
  test('T20 the conflict export is real JSON, not a string spread into characters',()=>{
    ok(t20.parsed,'the export did not parse: '+t20.err);
    eq(t20.marker,'core-local');
    eq(t20.numericKeys,0,'character-indexed keys are back ('+t20.numericKeys+' of '+t20.totalKeys+')');
    ok(t20.totalKeys<200,'suspiciously many keys ('+t20.totalKeys+') — looks spread again');
    ok(t20.hasRealSections,'no recognisable data sections; keys were '+JSON.stringify(t20.sample));
  });

  await d9x.ctx.close();

  test('T7 no uncaught page errors',()=>{eq(errs,[],'page errors');});

  console.log('\nC22 — onboarding gate + review dead end: '+passed+' passed, '+failures.length+' failed');
  if(failures.length)console.log('  failed: '+failures.join(', '));
  await browser.close();server.close();
  process.exit(failures.length?1:0);
})();
