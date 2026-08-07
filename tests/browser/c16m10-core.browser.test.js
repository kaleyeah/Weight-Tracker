/* C16-M10 (browser) — increment 2: the core durability protocol, real Chromium.

   The CAS mock implements the REAL reviewed route semantics (idempotency
   ledger with replay, expectedRev conflicts, fenceStale) so the client is
   exercised against the disposable-PB-proven contract.

       CF_SRC=<file> node tests/browser/c16m10-core.browser.test.js

   Round-16 evidence list: fault injection at every journal transition;
   replay + idempotency; stale-fence displacement WITHOUT data loss;
   account-switch isolation; storage-write failure; reload/bootstrap
   recovery; server adoption cannot overwrite unresolved local dirty. */
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

const EMPTY_PAYLOAD={settings:{onboarded:true,units:'lbs'},weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},statuses:[],presets:[],skips:{},nightlyLog:{}};
const SERVER_DATA={settings:{onboarded:true,units:'kg'},weights:[{date:'2026-08-01',weight:200}],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},statuses:[],presets:[],skips:{},nightlyLog:{},unknownFutureField:{keep:'me'}};

function casMock(st){
  return async(route)=>{
    const url=route.request().url();const method=route.request().method();
    const reply=(status,body)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(/cf\/appdata\/commit/.test(url)){
      if(st.commitDelay)await new Promise(r=>setTimeout(r,st.commitDelay));
      if(st.forceCommit){const f=st.forceCommit;st.forceCommit=null;return reply(f.status,f.body);}
      if(st.dropCommits){st.dropped=(st.dropped||0)+1;
        // commit LANDS server-side but the response is lost (transport ambiguity)
        const b=JSON.parse(route.request().postData());
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
      const items=st.hasRow?[{id:'rec1',user:'userA',data:st.data,coreRev:st.rev,training:null,trainingRev:0}]:[];
      return reply(200,{items});}
    if(/cf\/writer\/lease/.test(url)){
      const b=JSON.parse(route.request().postData());
      if(b.op==='acquire'||b.op==='steal'){st.fence=st.fence||1;st.holderDev=b.deviceId;
        return reply(200,{ok:true,exists:true,granted:true,fence:st.fence,holderDeviceId:b.deviceId,deviceName:b.deviceName,active:true,serverNow:Date.now(),ttlMs:86400000});}
      if(b.op==='renew')return reply(200,{ok:true,exists:true,fence:st.fence,holderDeviceId:st.holderDev,deviceName:'x',active:true,serverNow:Date.now(),ttlMs:86400000});
      return reply(200,{ok:true,exists:true,fence:st.fence||1,holderDeviceId:st.holderDev||null,deviceName:'x',active:true,serverNow:Date.now(),ttlMs:86400000});}
    return reply(200,{items:[],token:'tok',record:{id:'userA'}});};}

async function boot(browser,srv,st,init,uid,initArg){
  const ctx=await browser.newContext();
  await ctx.exposeFunction('__bump',()=>{st.fence=(st.fence||1)+1;});
  await ctx.exposeFunction('__setRev',(r,dataName)=>{st.rev=r;if(dataName==='server')st.data=SERVER_DATA;});
  await ctx.exposeFunction('__setRecordsDelay',(ms)=>{st.recordsDelay=ms;});
  await ctx.exposeFunction('__forceCommit',(status,body)=>{st.forceCommit={status,body};});
  await ctx.route('**/api/**',casMock(st));
  if(init)await ctx.addInitScript(init,initArg);
  await ctx.addInitScript((u)=>{
    localStorage.setItem('wl_pb',JSON.stringify({uid:u,base:'https://pb.test',token:'tok',email:'a@x.com'}));
    localStorage.setItem('wl_last_owner',u);
    if(!localStorage.getItem('wl_v1'))localStorage.setItem('wl_v1',JSON.stringify({settings:{onboarded:true,units:'lbs'},weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},statuses:[],presets:[],skips:{},nightlyLog:{}}));
  },uid||'userA');
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://127.0.0.1:'+srv.address().port,{waitUntil:'load'});
  await page.waitForTimeout(700);
  return {ctx,page,errs};}

(async()=>{
  const html=fs.readFileSync(SRC,'utf8');
  const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch();

  /* T1a bootstrap: equal copies → base established, clean */
  {
    const st={rev:5,data:EMPTY_PAYLOAD,ledger:{},hasRow:true};
    const {ctx,page,errs}=await boot(browser,server,st);
    const s=await page.evaluate(()=>({state:m10cState(),base:m10cRead('base')}));
    test('T1a equal copies: base established at server rev, clean',()=>{
      eq(s.state,'clean');eq(s.base.val.rev,5);});
    test('T1a no page errors',()=>eq(errs.length,0,errs.join(';')));
    await ctx.close();
  }

  /* T1b bootstrap: local empty + server nonempty → journaled adoption, unknown fields intact */
  {
    const st={rev:7,data:SERVER_DATA,ledger:{},hasRow:true};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(()=>({state:m10cState(),base:m10cRead('base'),
      local:JSON.parse(localStorage.getItem('wl_v1')),weights:state.weights.length}));
    test('T1b fresh device adopts the server copy (journaled, applied)',()=>{
      eq(s.state,'clean');eq(s.base.val.rev,7);eq(s.local.weights.length,1);eq(s.weights,1);});
    test('T1b unknown fields survive adoption',()=>eq(s.local.unknownFutureField.keep,'me'));
    await ctx.close();
  }

  /* T1c bootstrap: differing nonempty copies → conflict preserved, local untouched */
  {
    const localData=JSON.parse(JSON.stringify(EMPTY_PAYLOAD));localData.weights=[{date:'2026-08-02',weight:199}];
    const st={rev:7,data:SERVER_DATA,ledger:{},hasRow:true};
    const {ctx,page}=await boot(browser,server,st,(ld)=>{localStorage.setItem('wl_v1',ld);},undefined,JSON.stringify(localData));
    const s=await page.evaluate(()=>({state:m10cState(),j:m10cRead('journal'),
      local:JSON.parse(localStorage.getItem('wl_v1'))}));
    test('T1c differing copies: bootstrap-conflict, BOTH copies preserved',()=>{
      eq(s.state,'review-pending');eq(s.j.val.outcome,'bootstrap-conflict');
      eq(s.local.weights[0].weight,199,'local untouched');
      ok(JSON.parse(s.j.val.expect.serverCanon).weights[0].weight===200,'server copy captured');});
    await ctx.close();
  }

  /* T1d bootstrap: no row → rev-0 base; first push creates */
  {
    const st={rev:0,data:null,ledger:{},hasRow:false};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      const st0=m10cState();const b0=m10cRead('base');
      state.weights.push({date:'2026-08-02',weight:201});save();
      await new Promise(r=>{cloudPush(false);setTimeout(r,600);});
      return {st0,b0rev:b0.val?b0.val.rev:null,after:m10cState(),base:m10cRead('base').val.rev};
    });
    test('T1d no server row: rev-0 base, first push lands at rev 1',()=>{
      eq(s.st0,'clean');eq(s.b0rev,0);eq(s.after,'clean');eq(s.base,1);});
    test('T1d server holds the created row',()=>{eq(st.rev,1);ok(st.data.weights.length===1);});
    await ctx.close();
  }

  /* T1e bootstrap: absent data with POSITIVE rev → review, never first push */
  {
    const st={rev:4,data:null,ledger:{},hasRow:true};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(()=>({state:m10cState(),j:m10cRead('journal')}));
    test('T1e absent data at positive rev: bootstrap-conflict (deletion evidence)',()=>{
      eq(s.state,'review-pending');eq(s.j.val.outcome,'bootstrap-conflict');});
    await ctx.close();
  }

  /* T2 ordinary push: dirty → 200 → base advanced, dirty cleared, journal gone */
  {
    const st={rev:5,data:EMPTY_PAYLOAD,ledger:{},hasRow:true};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      state.weights.push({date:'2026-08-02',weight:202});save();
      const dirtyAfterSave=m10cState();
      await new Promise(r=>{cloudPush(false);setTimeout(r,600);});
      return {dirtyAfterSave,state:m10cState(),base:m10cRead('base').val.rev,
        dirty:m10cRead('dirty').st,journal:m10cRead('journal').st};
    });
    test('T2 push happy path: dirty→clean, base rev 6, journal cleared',()=>{
      eq(s.dirtyAfterSave,'dirty');eq(s.state,'clean');eq(s.base,6);
      eq(s.dirty,'absent');eq(s.journal,'absent');});
    test('T2 exactly one server commit',()=>eq(st.commits,1));
    await ctx.close();
  }

  /* T3 replay-first: lost response, reload → SAME requestId replays, no double commit */
  {
    const st={rev:5,data:EMPTY_PAYLOAD,ledger:{},hasRow:true,dropCommits:true};
    const {ctx,page}=await boot(browser,server,st);
    const rid=await page.evaluate(async()=>{
      state.weights.push({date:'2026-08-02',weight:203});save();
      await new Promise(r=>{cloudPush(false);setTimeout(r,500);});
      const j=m10cRead('journal');
      return j.st==='ok'?j.val.expect.requestId:null;
    });
    ok(rid,'journal survived the lost response');
    st.dropCommits=false;                        // transport heals
    await page.reload({waitUntil:'load'});
    await page.waitForTimeout(900);
    const s=await page.evaluate(()=>({state:m10cState(),base:m10cRead('base').val.rev,
      dirty:m10cRead('dirty').st,journal:m10cRead('journal').st}));
    test('T3 reload replays the captured request: completed without loss',()=>{
      eq(s.state,'clean');eq(s.base,6);eq(s.dirty,'absent');eq(s.journal,'absent');});
    test('T3 idempotent: server committed EXACTLY once (ledger replay answered the rerun)',()=>{
      eq(st.rev,6);eq(Object.keys(st.ledger).length,1);ok(st.ledger[rid],'same requestId');});
    await ctx.close();
  }

  /* T4 crash recovery at EVERY journal transition (seeded states + reload) */
  {
    const mkBase={owner:'userA',mark:'m10.1',canon:1,rev:5,body:JSON.stringify(EMPTY_PAYLOAD)};
    const pushed=JSON.parse(JSON.stringify(EMPTY_PAYLOAD));pushed.weights=[{date:'2026-08-02',weight:204}];
    const pcanon=JSON.stringify(pushed);           // canonical enough for seeding (sorted keys not required by validator)
    const arms=[
      {name:'intent',j:{op:'core-ack',phase:'intent'},serverCommitted:false},
      {name:'net-done',j:{op:'core-ack',phase:'net-done',newRev:6},serverCommitted:true},
      {name:'k1',j:{op:'core-ack',phase:'k1',newRev:6},serverCommitted:true,baseAdvanced:true},
      {name:'k2',j:{op:'core-ack',phase:'k2',newRev:6},serverCommitted:true,baseAdvanced:true,dirtyCleared:true}];
    for(const arm of arms){
      const st={rev:arm.serverCommitted?6:5,data:arm.serverCommitted?pushed:EMPTY_PAYLOAD,
        ledger:arm.serverCommitted?{'m10c-seedreq0000000000000000':{rev:6}}:{},hasRow:true};
      const seed={
        base:arm.baseAdvanced?Object.assign({},mkBase,{rev:6,body:pcanon}):mkBase,
        dirty:arm.dirtyCleared?null:{owner:'userA',mark:'m10.1',gen:3,persistedGen:3,ts:1},
        journal:{owner:'userA',mark:'m10.1',op:'core-ack',phase:arm.j.phase,startedAt:1,
          expect:Object.assign({oldBaseCanon:mkBase.body,expectedRev:5,pushedCanon:pcanon,gen:3,fence:null,
            requestId:'m10c-seedreq0000000000000000'},arm.j.newRev?{newRev:arm.j.newRev}:{})}};
      const {ctx,page}=await boot(browser,server,st,(sd)=>{
        const s2=JSON.parse(sd);
        localStorage.setItem('wl_core_base__userA',JSON.stringify(s2.base));
        if(s2.dirty)localStorage.setItem('wl_core_dirty__userA',JSON.stringify(s2.dirty));
        localStorage.setItem('wl_core_ack_journal__userA',JSON.stringify(s2.journal));
        localStorage.setItem('wl_v1',s2.journal.expect.pushedCanon);
      });
      await page.evaluate((sd)=>{const s2=JSON.parse(sd);
        localStorage.setItem('wl_core_base__userA',JSON.stringify(s2.base));
        if(s2.dirty)localStorage.setItem('wl_core_dirty__userA',JSON.stringify(s2.dirty));
        else localStorage.removeItem('wl_core_dirty__userA');
        localStorage.setItem('wl_core_ack_journal__userA',JSON.stringify(s2.journal));
        localStorage.setItem('wl_v1',s2.journal.expect.pushedCanon);
        location.reload();},JSON.stringify(seed));
      await page.waitForTimeout(900);
      const s=await page.evaluate(()=>({state:m10cState(),base:m10cRead('base').val,
        dirty:m10cRead('dirty').st,journal:m10cRead('journal').st,blocked:window.m8StorageBlocked}));
      test(`T4 crash at ${arm.name}: recovered to clean base rev 6, no loss, no block`,()=>{
        eq(s.state,'clean','state');eq(s.base.rev,6,'base rev');
        eq(s.dirty,'absent','dirty');eq(s.journal,'absent','journal');ok(!s.blocked,'not blocked');});
      test(`T4 crash at ${arm.name}: server state consistent (rev 6, single ledger key)`,()=>{
        eq(st.rev,6);eq(Object.keys(st.ledger).length,1);});
      await ctx.close();
    }
  }

  /* T5 revision conflict: dirty PRESERVED, wl_v1 untouched, review-pending */
  {
    const st={rev:5,data:EMPTY_PAYLOAD,ledger:{},hasRow:true};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      await window.__setRev(9,'server');          // another writer advanced the server
      state.weights.push({date:'2026-08-02',weight:205});save();
      const localBefore=localStorage.getItem('wl_v1');
      await new Promise(r=>{cloudPush(false);setTimeout(r,600);});
      return {state:m10cState(),j:m10cRead('journal').val,dirty:m10cRead('dirty').st,
        localSame:localStorage.getItem('wl_v1')===localBefore,weights:state.weights.length};
    });
    test('T5 conflict: terminal journal, dirty preserved, local bytes untouched',()=>{
      eq(s.state,'review-pending');eq(s.j.outcome,'conflict');eq(s.j.expect.serverRev,9);
      eq(s.dirty,'ok');ok(s.localSame);eq(s.weights,1);});
    await ctx.close();
  }

  /* T6 stale-fence displacement WITHOUT data loss */
  {
    const st={rev:5,data:EMPTY_PAYLOAD,ledger:{},hasRow:true,fenceRequired:true,fence:1};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      state.weights.push({date:'2026-08-02',weight:206});save();
      window.__bump&&window.__bump();
      await new Promise(r=>setTimeout(r,50));
      const localBefore=localStorage.getItem('wl_v1');
      await new Promise(r=>{cloudPush(false);setTimeout(r,600);});
      return {state:m10cState(),j:m10cRead('journal').val,dirty:m10cRead('dirty').st,
        localSame:localStorage.getItem('wl_v1')===localBefore};
    });
    test('T6 fenceStale: fence-displaced terminal, dirty + local preserved',()=>{
      eq(s.state,'review-pending');eq(s.j.outcome,'fence-displaced');
      eq(s.dirty,'ok');ok(s.localSame);});
    test('T6 zero server mutation under the stale fence',()=>{eq(st.rev,5);eq(Object.keys(st.ledger).length,0);});
    await ctx.close();
  }

  /* T7 adoption can NEVER overwrite unresolved dirty */
  {
    const st={rev:5,data:EMPTY_PAYLOAD,ledger:{},hasRow:true};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      await window.__setRev(9,'server');          // server moved ahead while we hold local edits
      state.weights.push({date:'2026-08-02',weight:207});save();
      const localBefore=localStorage.getItem('wl_v1');
      const r=await new Promise(r2=>{cloudPull(false,r2);});
      return {pulled:r,localSame:localStorage.getItem('wl_v1')===localBefore,
        dirty:m10cRead('dirty').st,weights:state.weights.length,base:m10cRead('base').val.rev};
    });
    test('T7 pull refused while dirty: zero adoption, dirty intact, base unchanged',()=>{
      ok(s.pulled===false);ok(s.localSame);eq(s.dirty,'ok');eq(s.weights,1);eq(s.base,5);});
    await ctx.close();
  }

  /* T8 account-switch isolation: A's core keys untouched by B's session */
  {
    const st={rev:5,data:EMPTY_PAYLOAD,ledger:{},hasRow:true};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      state.weights.push({date:'2026-08-02',weight:208});save();
      const aKeys={};['wl_core_dirty__userA','wl_core_base__userA'].forEach(k=>aKeys[k]=localStorage.getItem(k));
      // switch to userB (fresh session)
      pbClearSession(true);
      localStorage.setItem('wl_pb',JSON.stringify({uid:'userB',base:'https://pb.test',token:'tok',email:'b@x.com'}));
      const bState=m10cState();
      const aSame=Object.keys(aKeys).every(k=>localStorage.getItem(k)===aKeys[k]);
      return {bState,aSame,bDirty:m10cRead('dirty').st,bBase:m10cRead('base').st};
    });
    test("T8 account switch: B sees its own fresh namespace, A's bytes untouched",()=>{
      eq(s.bState,'bootstrap');ok(s.aSame,'A keys byte-identical');
      eq(s.bDirty,'absent');eq(s.bBase,'absent');});
    await ctx.close();
  }

  /* T9 storage-write failure: fail closed, no network, nothing lost */
  {
    const st={rev:5,data:EMPTY_PAYLOAD,ledger:{},hasRow:true};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      const orig=localStorage.setItem.bind(localStorage);
      // journal intent write fails
      localStorage.setItem=function(k,v){if(/wl_core_ack_journal__/.test(k))throw new Error('quota');return orig(k,v);};
      state.weights.push({date:'2026-08-02',weight:209});save();
      const commitsBefore=window.__commits?window.__commits():null;
      await new Promise(r=>{cloudPush(false);setTimeout(r,400);});
      localStorage.setItem=orig;
      const afterIntentFail={state:m10cState(),dirty:m10cRead('dirty').st};
      // dirty marker write fails → soft block (unproven)
      localStorage.setItem=function(k,v){if(/wl_core_dirty__/.test(k))throw new Error('quota');return orig(k,v);};
      state.weights.push({date:'2026-08-02',weight:210});save();
      localStorage.setItem=orig;
      return {afterIntentFail,softBlocked:m10cUnprovenBlocked,union:window.m8StorageBlocked};
    });
    test('T9 journal-write failure: push aborted, dirty preserved, no commit',()=>{
      eq(s.afterIntentFail.dirty,'ok');eq(st.commits||0,0,'zero commits');});
    test('T9 dirty-write failure: soft block raised, shared union reports blocked',()=>{
      ok(s.softBlocked);ok(s.union);});
    await ctx.close();
  }

  /* T10 clean pull: newer server adopted (journaled), unknown fields intact */
  {
    const st={rev:9,data:SERVER_DATA,ledger:{},hasRow:true};
    const {ctx,page}=await boot(browser,server,st,()=>{
      localStorage.setItem('wl_core_base__userA',JSON.stringify({owner:'userA',mark:'m10.1',canon:1,rev:5,
        body:JSON.stringify({settings:{onboarded:true,units:'lbs'},weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},statuses:[],presets:[],skips:{},nightlyLog:{}})}));
      localStorage.setItem('wl_v1',JSON.stringify({settings:{onboarded:true,units:'lbs'},weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},statuses:[],presets:[],skips:{},nightlyLog:{}}));
    });
    const s=await page.evaluate(async()=>{
      const r=await new Promise(r2=>{cloudPull(false,r2);});
      const local=JSON.parse(localStorage.getItem('wl_v1'));
      return {pulled:r,base:m10cRead('base').val.rev,journal:m10cRead('journal').st,
        weights:local.weights.length,unknown:local.unknownFutureField?local.unknownFutureField.keep:null};
    });
    test('T10 clean adoption: base rev 9, journal cleared, unknown fields intact',()=>{
      ok(s.pulled===true);eq(s.base,9);eq(s.journal,'absent');eq(s.weights,1);eq(s.unknown,'me');});
    await ctx.close();
  }

  /* T11 newer generation during flight: base advances, NEWER dirty survives */
  {
    const st={rev:5,data:EMPTY_PAYLOAD,ledger:{},hasRow:true,commitDelay:400};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      state.weights.push({date:'2026-08-02',weight:211});save();
      const p=new Promise(r=>{cloudPush(false);setTimeout(r,900);});
      await new Promise(r=>setTimeout(r,100));
      state.weights.push({date:'2026-08-02',weight:212});save();   // newer gen mid-flight
      await p;
      return {state:m10cState(),base:m10cRead('base').val.rev,dirty:m10cRead('dirty'),
        journal:m10cRead('journal').st};
    });
    test('T11 newer gen in flight: base advanced, newer dirty SURVIVES for the next push',()=>{
      eq(s.state,'dirty');eq(s.base,6);eq(s.dirty.st,'ok');
      ok(s.dirty.val.gen>s.dirty.val.persistedGen-1,'newer generation kept');eq(s.journal,'absent');});
    await ctx.close();
  }

  /* T12 (ruling 4): account switch DURING core network operations */
  {
    // a) switch A→B while the push response is in flight
    const st={rev:5,data:EMPTY_PAYLOAD,ledger:{},hasRow:true,commitDelay:500};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      state.weights.push({date:'2026-08-02',weight:220});save();
      const p=new Promise(r=>{cloudPush(false);setTimeout(r,900);});
      await new Promise(r=>setTimeout(r,120));
      const aJournal=localStorage.getItem('wl_core_ack_journal__userA');
      pbClearSession(true);
      localStorage.setItem('wl_pb',JSON.stringify({uid:'userB',base:'https://pb.test',token:'tok',email:'b@x.com'}));
      await p;
      const bKeys=Object.keys(localStorage).filter(k=>/wl_core_.*__userB/.test(k));
      return {aJournalSame:localStorage.getItem('wl_core_ack_journal__userA')===aJournal,
        aJournalPhase:JSON.parse(localStorage.getItem('wl_core_ack_journal__userA')).phase,
        aDirty:localStorage.getItem('wl_core_dirty__userA')!==null,bKeys:bKeys.length};
    });
    test('T12a switch mid-push: A journal byte-identical at intent (replayable), zero B writes',()=>{
      ok(s.aJournalSame,'journal untouched');eq(s.aJournalPhase,'intent');
      ok(s.aDirty,'A dirty preserved');eq(s.bKeys,0,'no wl_core_*__userB keys');});
    await ctx.close();
  }
  {
    // b) A→B→A: the ORIGINAL session's response must not complete under the new A session
    const st={rev:5,data:EMPTY_PAYLOAD,ledger:{},hasRow:true,commitDelay:500};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      state.weights.push({date:'2026-08-02',weight:221});save();
      const p=new Promise(r=>{cloudPush(false);setTimeout(r,900);});
      await new Promise(r=>setTimeout(r,120));
      pbClearSession(true);                                    // away (gen bump)
      const c=JSON.parse(localStorage.getItem('wl_pb')||'{}');
      localStorage.setItem('wl_pb',JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok2',email:'a@x.com'}));
      // back as A — but a NEW session (no boot run; gen differs from the op's)
      await p;
      return {phase:JSON.parse(localStorage.getItem('wl_core_ack_journal__userA')).phase,
        dirty:localStorage.getItem('wl_core_dirty__userA')!==null,
        base:JSON.parse(localStorage.getItem('wl_core_base__userA')).rev};
    });
    test('T12b A→B→A: original-session response discarded (journal still intent, base unmoved)',()=>{
      eq(s.phase,'intent');ok(s.dirty);eq(s.base,5);});
    await ctx.close();
  }
  {
    // c) switch during the bootstrap GET and the clean-pull GET
    for(const arm of ['bootstrap','pull']){
      const st={rev:9,data:SERVER_DATA,ledger:{},hasRow:true,recordsDelay:500};
      const init=arm==='pull'?()=>{
        localStorage.setItem('wl_core_base__userA',JSON.stringify({owner:'userA',mark:'m10.1',canon:1,rev:5,
          body:JSON.stringify({settings:{onboarded:true,units:'lbs'},weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},statuses:[],presets:[],skips:{},nightlyLog:{}})}));
      }:null;
      const {ctx:c2,page:p2}=await boot(browser,server,st,init);
      const s2=await p2.evaluate(async()=>{
        // relaunch the operation with a delayed GET, switch mid-flight
        const before=localStorage.getItem('wl_v1');
        const p=new Promise(r=>{cloudPull(false,r);});
        await new Promise(r=>setTimeout(r,120));
        pbClearSession(true);
        localStorage.setItem('wl_pb',JSON.stringify({uid:'userB',base:'https://pb.test',token:'tok',email:'b@x.com'}));
        const pulled=await p;
        const bKeys=Object.keys(localStorage).filter(k=>/wl_core_.*__userB/.test(k));
        return {pulled,localSame:localStorage.getItem('wl_v1')===before,bKeys:bKeys.length};
      });
      test(`T12c switch during ${arm} GET: zero adoption, zero B writes`,()=>{
        ok(s2.pulled===false);ok(s2.localSame);eq(s2.bKeys,0);});
      await c2.close();
    }
  }

  /* T13 (ruling 7): edit lands while the pull GET is in flight → zero adoption */
  {
    const st={rev:5,data:EMPTY_PAYLOAD,ledger:{},hasRow:true};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(async()=>{
      await window.__setRev(9,'server');
      window.__setRecordsDelay(500);
      const p=new Promise(r=>{cloudPull(false,r);});
      await new Promise(r=>setTimeout(r,120));
      state.weights.push({date:'2026-08-02',weight:222});save();   // the mid-flight edit
      const localAfterEdit=localStorage.getItem('wl_v1');
      const pulled=await p;
      return {pulled,localSame:localStorage.getItem('wl_v1')===localAfterEdit,
        dirty:m10cRead('dirty').st,base:m10cRead('base').val.rev,weights:state.weights.length};
    });
    test('T13 edit during pull GET: adoption refused, edit + dirty preserved, base unchanged',()=>{
      ok(s.pulled===false);ok(s.localSame);eq(s.dirty,'ok');eq(s.base,5);eq(s.weights,1);});
    await ctx.close();
  }

  /* T14 (ruling 8): strict pre-projection validation */
  {
    const st={rev:5,data:EMPTY_PAYLOAD,ledger:{},hasRow:true};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(()=>{
      const r={};
      r.autoUndef=m10cCanon({a:1,tag:{name:'x',auto:undefined}}).ok;          // permitted omission
      r.nan=m10cCanon({a:NaN}).ok;
      r.inf=m10cCanon({a:Infinity}).ok;
      r.fn=m10cCanon({a:function(){}}).ok;
      r.arrUndef=m10cCanon({a:[1,undefined]}).ok;
      const holey=[1];holey[3]=2;r.hole=m10cCanon({a:holey}).ok;
      const cyc={};cyc.self=cyc;r.cycle=m10cCanon(cyc).ok;
      r.date=m10cCanon({a:new Date()}).ok;
      return r;
    });
    test('T14 canon: auto:undefined permitted; every lossy category rejected',()=>{
      ok(s.autoUndef===true,'auto:undefined');
      for(const k of ['nan','inf','fn','arrUndef','hole','cycle','date'])
        ok(s[k]===false,k+' must be rejected');});
    // and a push-path case: invalid state fails closed with dirty preserved
    const s2=await page.evaluate(async()=>{
      state.weights.push({date:'2026-08-02',weight:NaN});save();
      await new Promise(r=>{cloudPush(false);setTimeout(r,400);});
      return {blocked:m10cHardBlocked,reason:m10cBlockReason,dirty:m10cRead('dirty').st};
    });
    test('T14 push with invalid value: hard block, dirty preserved, no commit',()=>{
      ok(s2.blocked);ok(/failed validation/.test(s2.reason));eq(s2.dirty,'ok');eq(st.commits||0,0);});
    await ctx.close();
  }

  /* T15 (ruling 9): malformed SUCCESS must not advance the base */
  {
    for(const [name,body] of [
      ['fractional newRev',{ok:true,subsystem:'core',newRev:5.5}],
      ['missing newRev',{ok:true,subsystem:'core'}],
      ['wrong increment',{ok:true,subsystem:'core',newRev:9}]]){
      const st={rev:5,data:EMPTY_PAYLOAD,ledger:{},hasRow:true};
      const {ctx:c3,page:p3}=await boot(browser,server,st);
      const s3=await p3.evaluate(async(fb)=>{
        window.__forceCommit(200,fb);
        state.weights.push({date:'2026-08-02',weight:223});save();
        await new Promise(r=>{cloudPush(false);setTimeout(r,400);});
        return {blocked:m10cHardBlocked,journal:m10cRead('journal'),dirty:m10cRead('dirty').st,
          base:m10cRead('base').val.rev};
      },body);
      test(`T15 ${name}: blocked, journal at intent, dirty preserved, base unmoved`,()=>{
        ok(s3.blocked,'blocked');eq(s3.journal.st,'ok');eq(s3.journal.val.phase,'intent');
        eq(s3.dirty,'ok');eq(s3.base,5);});
      await c3.close();
    }
  }

  /* T16 (round-18 ruling 3): REAL plain-object validation */
  {
    const st={rev:5,data:EMPTY_PAYLOAD,ledger:{},hasRow:true};
    const {ctx,page}=await boot(browser,server,st);
    const s=await page.evaluate(()=>{
      class Thing{constructor(){this.a=1;}}
      const custom=Object.create({inherited:true});custom.a=1;
      const nul=Object.create(null);nul.a=1;
      return {cls:m10cCanon({x:new Thing()}).ok,
        proto:m10cCanon({x:custom}).ok,
        nullProto:m10cCanon({x:nul}).ok,
        plain:m10cCanon({x:{a:1}}).ok};
    });
    test('T16 class instance / custom prototype / null-prototype all fail closed; plain passes',()=>{
      ok(s.cls===false,'class');ok(s.proto===false,'custom proto');
      ok(s.nullProto===false,'null proto (documented rejection)');ok(s.plain===true);});
    await ctx.close();
  }

  /* T17 (round-18 ruling 4): a stale adoption intent (crash artifact) with a
     dirty local copy — annul removal FAILS on the first boot (fault
     injection) → durable block, no adoption; the reload (fault cleared)
     annuls durably; the local edit survives throughout. */
  {
    const localEdited=JSON.parse(JSON.stringify(EMPTY_PAYLOAD));localEdited.weights=[{date:'2026-08-02',weight:230}];
    const seed={
      journal:{owner:'userA',mark:'m10.1',op:'core-adopt',phase:'intent',startedAt:1,
        expect:{serverRev:9,serverCanon:JSON.stringify(SERVER_DATA)}},
      dirty:{owner:'userA',mark:'m10.1',gen:2,persistedGen:2,ts:1},
      base:{owner:'userA',mark:'m10.1',canon:1,rev:5,body:JSON.stringify(EMPTY_PAYLOAD)},
      local:JSON.stringify(localEdited)};
    const st={rev:9,data:SERVER_DATA,ledger:{},hasRow:true};
    const {ctx,page}=await boot(browser,server,st,(sd)=>{
      const z=JSON.parse(sd);
      localStorage.setItem('wl_core_ack_journal__userA',JSON.stringify(z.journal));
      localStorage.setItem('wl_core_dirty__userA',JSON.stringify(z.dirty));
      localStorage.setItem('wl_core_base__userA',JSON.stringify(z.base));
      localStorage.setItem('wl_v1',z.local);
      if(!localStorage.getItem('t17_fault_done')){
        localStorage.setItem('t17_fault_done','1');
        const orig=localStorage.removeItem.bind(localStorage);
        localStorage.removeItem=function(k){if(/wl_core_ack_journal__/.test(k))return;return orig(k);};}
    },undefined,JSON.stringify(seed));
    const s=await page.evaluate(()=>({blocked:m10cHardBlocked,reason:m10cBlockReason,
      journal:m10cRead('journal').st,weights:JSON.parse(localStorage.getItem('wl_v1')).weights.length}));
    test('T17 failed annul removal: hard block, no adoption, edit preserved',()=>{
      ok(s.blocked,'blocked: '+s.reason);ok(/annul/.test(s.reason),s.reason);
      eq(s.journal,'ok');eq(s.weights,1);});
    // reload with the fault cleared: recovery annuls DURABLY; still no adoption
    await page.evaluate((sd)=>{const z=JSON.parse(sd);
      localStorage.setItem('wl_core_ack_journal__userA',JSON.stringify(z.journal));
      localStorage.setItem('wl_core_dirty__userA',JSON.stringify(z.dirty));
      location.reload();},JSON.stringify(seed));
    await page.waitForTimeout(900);
    const s2=await page.evaluate(()=>{
      const j=m10cRead('journal');
      return {jSt:j.st,jOp:j.st==='ok'?j.val.op:null,jOutcome:j.st==='ok'?j.val.outcome:null,
        weights:JSON.parse(localStorage.getItem('wl_v1')).weights.length,
        dirty:m10cRead('dirty').st,blocked:m10cHardBlocked};});
    test('T17 reload: adopt intent durably annulled (no adoption); boot push finds the real conflict',()=>{
      /* the stale ADOPT intent is gone; the journal now present is the boot
         push's own core-ack, terminalized as a genuine rev conflict (local
         dirty at base rev 5 vs server rev 9) — dirty and the edit intact */
      ok(s2.jOp!=='core-adopt','adopt intent gone');
      eq(s2.jOp,'core-ack');eq(s2.jOutcome,'conflict');
      eq(s2.weights,1);eq(s2.dirty,'ok');ok(!s2.blocked);});
    await ctx.close();
  }

  /* T18 (round-18 ruling 5): malformed 409 bodies never become review state */
  {
    for(const [name,body] of [
      ['fenceStale without fence',{ok:false,fenceStale:true}],
      ['fenceStale fractional fence',{ok:false,fenceStale:true,fence:2.5}],
      ['conflict without serverRev',{ok:false,conflict:true}],
      ['conflict non-integer serverRev',{ok:false,conflict:true,serverRev:'nine'}]]){
      const st={rev:5,data:EMPTY_PAYLOAD,ledger:{},hasRow:true};
      const {ctx:c4,page:p4}=await boot(browser,server,st);
      const s4=await p4.evaluate(async(fb)=>{
        window.__forceCommit(409,fb);
        state.weights.push({date:'2026-08-02',weight:231});save();
        await new Promise(r=>{cloudPush(false);setTimeout(r,400);});
        return {state:m10cState(),j:m10cRead('journal').val,dirty:m10cRead('dirty').st};
      },body);
      test(`T18 ${name}: journal stays at intent (recoverable), dirty preserved, NOT review state`,()=>{
        eq(s4.state,'journal-recovery');eq(s4.j.phase,'intent');ok(!s4.j.outcome);
        eq(s4.dirty,'ok');});
      await c4.close();
    }
  }

  /* T19 (round-19 ruling 4): unsafe integers rejected everywhere */
  {
    const UNSAFE=9007199254740992;      // Number.MAX_SAFE_INTEGER + 1
    // a) live 409 with an unsafe serverRev → NOT review state
    {
      const st={rev:5,data:EMPTY_PAYLOAD,ledger:{},hasRow:true};
      const {ctx:c5,page:p5}=await boot(browser,server,st);
      const s5=await p5.evaluate(async(u)=>{
        window.__forceCommit(409,{ok:false,conflict:true,serverRev:u});
        state.weights.push({date:'2026-08-02',weight:240});save();
        await new Promise(r=>{cloudPush(false);setTimeout(r,400);});
        const j=m10cRead('journal');
        return {phase:j.val.phase,outcome:j.val.outcome,dirty:m10cRead('dirty').st};
      },UNSAFE);
      test('T19a live 409 with unsafe serverRev: journal stays at intent, dirty preserved',()=>{
        eq(s5.phase,'intent');ok(!s5.outcome);eq(s5.dirty,'ok');});
      await c5.close();
    }
    // b/c) seeded terminal journals with unsafe values → quarantine + block, never review
    for(const [name,outcome,field] of [['conflict terminal','conflict','serverRev'],
                                        ['displacement terminal','fence-displaced','staleFence']]){
      const st={rev:5,data:EMPTY_PAYLOAD,ledger:{},hasRow:true};
      const expect={oldBaseCanon:JSON.stringify(EMPTY_PAYLOAD),expectedRev:5,
        pushedCanon:JSON.stringify(EMPTY_PAYLOAD),gen:1,fence:null,requestId:'m10c-seedterm000000000000000'};
      expect[field]=UNSAFE;
      const seed={owner:'userA',mark:'m10.1',op:'core-ack',phase:'done',outcome,startedAt:1,expect};
      const {ctx:c6,page:p6}=await boot(browser,server,st,(sd)=>{
        localStorage.setItem('wl_core_ack_journal__userA',sd);
        localStorage.setItem('wl_core_base__userA',JSON.stringify({owner:'userA',mark:'m10.1',canon:1,rev:5,
          body:'{}'}));
      },undefined,JSON.stringify(seed));
      const s6=await p6.evaluate(()=>({state:m10cState(),blocked:window.m8StorageBlocked,
        journalGone:m10cRead('journal').st==='absent',
        quarantined:Object.keys(localStorage).some(k=>/^wl_core_corrupt__userA\.journal/.test(k))}));
      test(`T19 seeded ${name} with unsafe ${field}: quarantined + blocked, never review state`,()=>{
        ok(s6.state!=='review-pending','not review state: '+s6.state);
        ok(s6.blocked,'blocked');ok(s6.journalGone,'journal removed from its key');
        ok(s6.quarantined,'preserved in the corrupt namespace');});
      await c6.close();
    }
  }

  await browser.close();server.close();
  console.log(`\nC16-M10 increment 2: ${passed} passed, ${failures.length} failed`);
  process.exit(failures.length?1:0);
})().catch(e=>{console.error('SUITE ERROR',e);process.exit(2);});
