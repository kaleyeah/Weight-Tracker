/* C44 (browser) — an unloaded training store never empties the server.

   THE INCIDENT (Owner, 2026-08-10). His routines vanished. cf_commit_log holds
   the write that did it:

       07:17:49.493Z  subsystem: training   clientBuild: ""
       expectedRev: 36 -> resultingRev: 37   fileByteLength: 0   status: 200

   Every neighbouring commit says .478; this one says nothing, because the
   training route is the one push path that never sent clientBuild. Sometime in
   the .478 update reload the app pushed an EMPTY training over a base holding
   3 routines, 25 exercises, 9 lift sessions and 14 cardio sessions, and got a
   200. Recovered from a Synology snapshot.

   WHAT THE EVIDENCE RULES OUT. A store whose reads THROW does not produce this
   record: boot's recovery capture fails to secure the pre-sync bytes,
   recoveryState goes "blocked", and m8Push returns on its very first line
   (trainingQuarantined). That path was already safe, and the throwing case
   below asserts that it is — by that gate, not this one. The commit therefore
   went out on a device where storage was working and loadTraining() still
   produced nothing: unparseable stored bytes, or a push that ran before
   loadTraining() had.

   Both leave state.training at its empty default, and the old
   `catch(e){}` said nothing about either. The distinction this suite pins is
   not "is training empty" but "do we KNOW it is empty" — identical bytes,
   opposite meaning:

       loaded, and genuinely empty  -> a real state; pushing it is correct
       never loaded, so empty       -> ignorance; pushing it destroys

   So the two halves below matter equally. A guard that refused every empty
   push would also stop the athlete deleting his own routines, and would pass a
   test that only checked the first half.

       CF_SRC=<file> node tests/browser/c44-empty-training-refusal.browser.test.js */
const path=require('path'),http=require('http'),fs=require('fs');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const SRC=process.env.CF_SRC||'/home/griffin/projects/compound-app/index.html';

/* what he actually had, in miniature */
const TRAINING={cardioTypes:['Peloton','Rowing'],
  exercises:[{id:'e1',name:'Squat',muscle:'legs',movement:'compound'},
             {id:'e2',name:'Bench',muscle:'chest',movement:'compound'}],
  routines:[{id:'r-1',name:'Full Body Day 3',items:[{exId:'e1',sets:3,progression:'double'}]}],
  sessions:{'2026-08-07':[{kind:'cardio',type:'Peloton',mins:30,kcal:320}]},
  liftSessions:{'2026-08-08':[{name:'Deadlift',sets:[{w:140,r:5}]}]}};

let passed=0;const failures=[];
const test=(n,f)=>{try{f();passed++;console.log('  ✓ '+n);}catch(e){failures.push(n);console.log('  ✗ '+n+'\n      '+(e&&e.message));}};
const ok=(v,m)=>{if(!v)throw new Error(m||'expected truthy');};
const notOk=(v,m)=>{if(v)throw new Error(m||'expected falsy');};
const eq=(a,b,m)=>{if(a!==b)throw new Error((m||'eq')+': '+JSON.stringify(a)+' !== '+JSON.stringify(b));};

/* Boot a page whose training store is seeded, then broken in the chosen way
   BEFORE the app's own scripts run — the same ordering as the real reload. */
async function boot(browser,origin,mode){
  const ctx=await browser.newContext();
  const commits=[];
  await ctx.route('**/api/**',route=>{
    const req=route.request(),url=req.url();
    if(/\/api\/cf\/appdata\/commit/.test(url)){
      let body=null;try{body=JSON.parse(req.postData()||'{}');}catch(e){}
      commits.push(body);
      return route.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify({ok:true,newRev:(body&&body.expectedRev|0)+1})});
    }
    return route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({items:[],token:'tok',record:{id:'userA'}})});
  });
  await ctx.addInitScript(({t,mode})=>{
    localStorage.setItem('wl_pb',JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok',email:'a@x.com'}));
    localStorage.setItem('wl_last_owner','userA');
    localStorage.setItem('wl_v1',JSON.stringify({settings:{onboarded:true,units:'lbs',weekStart:'1',name:'G'},
      weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},
      statuses:[],presets:[],skips:{},nightlyLog:{},checkins:{}}));
    if(mode!=='absent')localStorage.setItem('wl_training_v1',JSON.stringify(t));
    if(mode==='corrupt')localStorage.setItem('wl_training_v1','{"routines":[{trunc');
    /* parses fine, is not a training document at all */
    if(mode==='wrongshape')localStorage.setItem('wl_training_v1','"a string"');
    if(mode==='throws'){
      /* the failure the incident implies: the store is there, the read refuses */
      const real=Storage.prototype.getItem;
      Storage.prototype.getItem=function(k){
        if(k==='wl_training_v1')throw new Error('SecurityError: storage unavailable');
        return real.call(this,k);};
    }
  },{t:TRAINING,mode});
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto(origin,{waitUntil:'load'});
  await page.waitForTimeout(800);
  return {ctx,page,commits,errs};
}

/* THE FIXTURE MUST REACH THE GUARD, and by default it does not.

   m8Push refuses long before the emptiness check for two unrelated reasons in
   a bare harness: boot enters a `conflict` (the mocked server has no training
   field, local has content — the strict bootstrap rule), and m10AuthNow says
   `not-holder`, so m8HasPen() is false. Either one alone makes "no commit was
   sent" true for a reason that has nothing to do with this fix, and tests 1
   and 2 would pass against an app with no guard in it at all.

   So the harness clears the bootstrap conflict and puts the device in the
   NO-LEASE configuration — a real supported mode, the one m8CommitFence names
   "no account: no lease concept" — which is the narrowest way to isolate the
   emptiness rule from the single-writer rule. Tests 3 and 4 are the proof this
   worked: if the fixture were still inert they would find zero commits and
   fail, so a vacuous run cannot be mistaken for a green one. */
/* Put the device in the exact state the incident reached: a BASE recording the
   server's real content at rev 36, and a dirty marker — then run the push. */
async function pushFrom(page,baseTraining){
  return page.evaluate((bt)=>{
    m10AuthNow=function(){return {ok:true,local:true};};
    m8StorageBlocked=false;m8HardBlocked=false;m8UnprovenBlocked=false;
    const uid=pbUid();
    m8Remove('conflict',uid);
    m8Write('base',{canon:M8_CANON_VER,body:m8Canon(bt).canon,rev:36},uid);
    m8Write('dirty',{gen:1,persistedGen:1},uid);
    m8Gen=1;
    const stateBefore=m8State();
    m8Push();
    const c=m8Read('conflict',uid);
    return {trainingLoaded:trainingLoaded,
            loadState:trainingLoadState,
            stateBefore:stateBefore,
            quarantined:trainingQuarantined(),
            localEmpty:m8LocalTrainingEmpty(),
            conflict:(c.st==='ok'?{reason:c.val.reason,serverRev:c.val.serverRev,
                                   serverAtEntry:c.val.serverAtEntry}:null),
            baseStillThere:(m8Read('base',uid).st==='ok')};
  },baseTraining);
}
const settle=(page)=>page.waitForTimeout(400);

(async()=>{
  const html=fs.readFileSync(SRC,'utf8');
  const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch();

  console.log('C44 — an unloaded training store never empties the server');

  /* ---- 1. THE INCIDENT: a push in the window before the store loaded ----
     Storage works; loadTraining() simply has not run yet, so state.training is
     its empty default and nothing has recorded that this is ignorance. This is
     the one shape no other gate catches, and it is the shape of the write that
     cost him his training. */
  {
    const b=await boot(browser,origin,'normal');
    const r=await b.page.evaluate((bt)=>{
      m10AuthNow=function(){return {ok:true,local:true};};
      m8StorageBlocked=false;m8HardBlocked=false;m8UnprovenBlocked=false;
      const uid=pbUid();
      m8Remove('conflict',uid);
      /* rewind to the pre-load moment: the store is intact on disk, this boot
         has not read it, and the sync layer is about to make a decision */
      state.training={cardioTypes:['Peloton'],sessions:{},exercises:[],routines:[],liftSessions:{}};
      trainingLoadState=TRAINING_LOAD_UNKNOWN;trainingLoaded=false;
      m8Write('base',{canon:M8_CANON_VER,body:m8Canon(bt).canon,rev:36},uid);
      m8Write('dirty',{gen:1,persistedGen:1},uid);
      m8Gen=1;
      const before={state:m8State(),pen:m8HasPen(),quarantined:trainingQuarantined(),
                    loadState:trainingLoadState};
      m8Push();
      const c=m8Read('conflict',uid);
      return {before:before,
              conflict:(c.st==='ok'?{reason:c.val.reason,serverRev:c.val.serverRev,
                                     serverAtEntry:c.val.serverAtEntry}:null),
              baseStillThere:(m8Read('base',uid).st==='ok')};
    },TRAINING);await settle(b.page);

    test('the push really was reachable — no other gate was going to stop it',()=>{
      eq(r.before.state,'dirty','m8Push only proceeds from dirty');
      eq(r.before.pen,true,'and only with the pen');
      eq(r.before.quarantined,false,'the recovery quarantine does NOT cover this case');
    });
    test('NO commit leaves the device — this is the write that wiped him',()=>{
      const t=b.commits.filter(c=>c&&c.subsystem==='training');
      eq(t.length,0,'training commits sent: '+JSON.stringify(t));
    });
    test('the server copy is preserved and offered, not overwritten',()=>{
      ok(r.conflict,'a conflict should have been recorded');
      eq(r.conflict.reason,'local-training-unloaded');
      eq(r.conflict.serverRev,36);
      ok(/Full Body Day 3/.test(r.conflict.serverAtEntry||''),'the routines must be held in the conflict record');
    });
    test('the base is untouched, so recovery has something to stand on',()=>ok(r.baseStillThere));
    test('no page errors',()=>eq(b.errs.length,0,b.errs.join(' | ')));
    await b.ctx.close();
  }

  /* ---- 1b. a store whose reads THROW was already safe, by another gate ----
     Asserted so the layering is on the record: if recoveryState ever stops
     blocking here, this test fails and says which gate went missing. */
  {
    const b=await boot(browser,origin,'throws');
    const r=await pushFrom(b.page,TRAINING);await settle(b.page);
    test('a throwing store leaves the app KNOWING nothing (not "empty")',()=>{
      eq(r.trainingLoaded,false,'trainingLoaded must stay false when the read threw');
      eq(r.localEmpty,true);
    });
    test('and it is refused by the recovery quarantine, before this guard',()=>{
      eq(r.quarantined,true,'trainingQuarantined() is what stops this one');
      eq(b.commits.filter(c=>c&&c.subsystem==='training').length,0);
    });
    await b.ctx.close();
  }

  /* ---- 2. the same shape, reached by unreadable bytes ---- */
  {
    const b=await boot(browser,origin,'corrupt');
    const r=await pushFrom(b.page,TRAINING);await settle(b.page);
    test('unparseable stored bytes are ignorance too, and refuse the same way',()=>{
      eq(r.trainingLoaded,false);
      eq(b.commits.filter(c=>c&&c.subsystem==='training').length,0);
      ok(r.conflict,'a conflict should have been recorded');
    });
    await b.ctx.close();
  }

  /* ---- 3. THE OTHER HALF: a real delete-everything must still go ----
     Without this the "fix" is just a wall, and the suite above would pass on a
     guard that refuses every empty push forever. */
  {
    const b=await boot(browser,origin,'normal');
    const r=await b.page.evaluate((bt)=>{
      m10AuthNow=function(){return {ok:true,local:true};};
      m8StorageBlocked=false;m8HardBlocked=false;m8UnprovenBlocked=false;
      const uid=pbUid();
      m8Remove('conflict',uid);
      /* he loaded fine, then deleted every routine, exercise and session */
      state.training={cardioTypes:['Peloton'],exercises:[],routines:[],sessions:{},liftSessions:{}};
      saveTrainingLocal();
      m8Write('base',{canon:M8_CANON_VER,body:m8Canon(bt).canon,rev:36},uid);
      m8Write('dirty',{gen:1,persistedGen:1},uid);
      m8Gen=1;
      m8Push();
      return {trainingLoaded:trainingLoaded,loadState:trainingLoadState,localEmpty:m8LocalTrainingEmpty(),
              conflict:(m8Read('conflict',uid).st==='ok')};
    },TRAINING);await settle(b.page);

    test('a device that DID read its store knows it is empty',()=>{
      eq(r.trainingLoaded,true);eq(r.localEmpty,true);
    });
    test('deleting everything still reaches the server — his data, his call',()=>{
      const t=b.commits.filter(c=>c&&c.subsystem==='training');
      eq(t.length,1,'expected exactly one training commit, got '+t.length);
      eq(JSON.stringify(t[0].payload.routines),'[]');
      eq(t[0].expectedRev,36);
    });
    test('and it is NOT diverted into a conflict',()=>notOk(r.conflict));
    await b.ctx.close();
  }

  /* ---- 4. an ordinary edit is untouched by any of this ---- */
  {
    const b=await boot(browser,origin,'normal');
    const sent=await b.page.evaluate((bt)=>{
      m10AuthNow=function(){return {ok:true,local:true};};
      m8StorageBlocked=false;m8HardBlocked=false;m8UnprovenBlocked=false;
      const uid=pbUid();
      m8Remove('conflict',uid);
      m8Write('base',{canon:M8_CANON_VER,body:m8Canon(bt).canon,rev:36},uid);
      state.training.routines.push({id:'r-2',name:'Push Day',items:[]});
      saveTrainingLocal();
      m8Write('dirty',{gen:1,persistedGen:1},uid);m8Gen=1;
      m8Push();
      return m8Read('conflict',uid).st==='ok';
    },TRAINING);await settle(b.page);
    test('a normal edit pushes exactly as before',()=>{
      const t=b.commits.filter(c=>c&&c.subsystem==='training');
      eq(t.length,1);
      eq(t[0].payload.routines.length,2);
      notOk(sent,'an ordinary edit must not raise a conflict');
    });
    await b.ctx.close();
  }

  /* ---- 5. AN ABSENT KEY IS NOT AUTHORITY TO DESTROY (Architect ruling 2) ----
     Build 480 first treated a missing key as a known-empty device, so first-run
     would not be blocked. The Architect refused that: an EVICTED key looks
     identical to a new device, and the base record survives eviction of the
     training key — so the exemption let storage eviction erase the server. */
  {
    const b=await boot(browser,origin,'absent');
    const r=await pushFrom(b.page,TRAINING);await settle(b.page);
    test('an absent key reads as ABSENT, never as a known-empty athlete',()=>{
      eq(r.loadState,'absent');
      eq(r.trainingLoaded,false,'absence is not a completed read');
    });
    test('absent key + non-empty base REFUSES — the eviction hole',()=>{
      eq(b.commits.filter(c=>c&&c.subsystem==='training').length,0);
      ok(r.conflict,'the server copy must be preserved and offered');
    });
    await b.ctx.close();
  }

  /* ---- 5b. and first-run is still not blocked, because it never gets here ----
     With no base, m8State is "fresh"/"bootstrap", not "dirty" — m8Push returns
     long before the refusal. This is the assertion that shows ruling 2 cost
     nothing: the exemption was never buying what it claimed to buy. */
  {
    const b=await boot(browser,origin,'absent');
    const r=await b.page.evaluate(()=>{
      m10AuthNow=function(){return {ok:true,local:true};};
      m8StorageBlocked=false;m8HardBlocked=false;m8UnprovenBlocked=false;
      const uid=pbUid();
      m8Remove('conflict',uid);m8Remove('base',uid);m8Remove('dirty',uid);
      return {state:m8State(),loadState:trainingLoadState};
    });
    test('a brand-new device is in bootstrap, where adoption happens',()=>{
      ok(r.state==='fresh'||r.state==='bootstrap','got '+r.state);
      eq(r.loadState,'absent');
    });
    await b.ctx.close();
  }

  /* ---- 5c. parseable, but not a training document (Architect ruling 12) ---- */
  {
    const b=await boot(browser,origin,'wrongshape');
    const r=await pushFrom(b.page,TRAINING);await settle(b.page);
    test('a parseable wrong SHAPE fails closed, like unreadable bytes',()=>{
      eq(r.loadState,'unknown');
      eq(b.commits.filter(c=>c&&c.subsystem==='training').length,0);
      ok(r.conflict);
    });
    await b.ctx.close();
  }

  console.log('\n'+passed+' passed, '+failures.length+' failed');
  await browser.close();server.close();
  process.exit(failures.length?1:0);
})();
