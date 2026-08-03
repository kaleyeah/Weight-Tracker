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

  test('T7 no uncaught page errors',()=>{eq(errs,[],'page errors');});

  console.log('\nC22 — onboarding gate + review dead end: '+passed+' passed, '+failures.length+' failed');
  if(failures.length)console.log('  failed: '+failures.join(', '));
  await browser.close();server.close();
  process.exit(failures.length?1:0);
})();
