/* C44 (browser) — an unloaded training store never empties the server.

   THE INCIDENT (Owner, 2026-08-10). His routines vanished. cf_commit_log holds
   the write that did it:

       07:17:49.493Z  subsystem: training   clientBuild: ""
       expectedRev: 36 -> resultingRev: 37   fileByteLength: 0   status: 200

   Every neighbouring commit says .478; this one says nothing, because the
   training route was the one push path that never sent clientBuild. An empty
   training replaced 3 routines, 25 exercises, 9 lift sessions and 14 cardio
   sessions, and the server returned 200. Recovered from a Synology snapshot.

   **THE HISTORICAL TRIGGER IS UNKNOWN, and this suite does not assert one.**
   An earlier version of this header narrowed it to two causes and placed it
   "in the .478 update reload"; the evidence does not support that and the
   incident record says so. What is established: a loader that swallowed every
   failure was present, and is sufficient to produce that row. What is ruled
   out: the throwing-read boot path, because recoveryState blocks it before
   m8Push ever runs — asserted below so the two layers stay distinguishable.
   Everything else remains hypothesis: a push before the store loaded, corrupt
   or wrong-shaped bytes, an evicted key, or a path nobody has thought of.

   Since build 484 the question is no longer load-bearing. The Owner was asked
   whether he ever clears out all his training and said "No, never", so an
   empty training is refused over a non-empty server WHATEVER produced it. The
   consequence, stated plainly because it is the honest one: **Compound has no
   supported delete-all-training operation** — not through the sync path and
   not through the conflict banner, which refuses an empty local copy for the
   same reason.

   What the three-state load contract still buys is the ANSWER to "why", which
   the conflict record carries so a later reader can tell a device that read
   its own store from one that could not.

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
      /* the reason carries the load state, so a later reader can tell whether
         this device had read its own store — it no longer DECIDES anything,
         but it is still the honest answer to "why" */
      eq(r.conflict.reason,'training-not-loaded-unknown');
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

  /* ---- 3. EVEN A REAL DELETE-EVERYTHING IS REFUSED ----
     Owner, 2026-08-11, asked directly whether he ever clears out all his
     training: "No, never." So the app does not have to tell a genuine delete
     from a failed load — it refuses the transition outright, which is the
     stronger rule and needs no intent record, no confirmation dialog and no
     hashing. He is not blocked: the refusal raises the conflict banner, which
     shows both copies, makes him export them, and then takes his choice. That
     is the clean slate, and it is a better one than a silent sync. */
  {
    const b=await boot(browser,origin,'normal');
    const r=await b.page.evaluate((bt)=>{
      m10AuthNow=function(){return {ok:true,local:true};};
      m8StorageBlocked=false;m8HardBlocked=false;m8UnprovenBlocked=false;
      const uid=pbUid();
      m8Remove('conflict',uid);
      /* the base records what the server holds, BEFORE he deletes anything */
      m8Write('base',{canon:M8_CANON_VER,body:m8Canon(bt).canon,rev:36},uid);
      /* he loaded fine, then deleted every routine, exercise and session,
         through saveTraining() — the path a real delete actually takes */
      state.training={cardioTypes:['Peloton'],exercises:[],routines:[],sessions:{},liftSessions:{}};
      saveTraining();
      m8Push();
      const c=m8Read('conflict',uid);
      return {loadState:trainingLoadState,localEmpty:m8LocalTrainingEmpty(),
              conflict:(c.st==='ok'?c.val.reason:null),
              serverHeld:(c.st==='ok'?c.val.serverAtEntry:null)};
    },TRAINING);await settle(b.page);

    test('the device knows perfectly well that it is empty',()=>{
      eq(r.loadState,'ok');eq(r.localEmpty,true);
    });
    test('and it STILL does not upload emptiness over his training',()=>{
      eq(b.commits.filter(c=>c&&c.subsystem==='training').length,0);
    });
    test('the refusal is named for what it is, not for a failed load',()=>{
      eq(r.conflict,'training-empty-refused');
    });
    test('and his training is held, in full, for him to choose',()=>{
      ok(/Full Body Day 3/.test(r.serverHeld||''),'the server copy must be in the conflict record');
    });
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

  /* ---- 6. THE CHOKE POINT (Architect ruling 5) ----
     The refusal in m8Push only guards a push being BORN. m8CasCommit is what
     every commit passes — new push, journal replay, conflict resolution — and
     m8CommitFence, the file's own wire invariant, lives there for exactly that
     reason. These drive the choke point directly, with no journal and no
     m8Push, which is the only way to show the second layer exists at all. */
  {
    const b=await boot(browser,origin,'normal');
    const r=await b.page.evaluate(async(bt)=>{
      m10AuthNow=function(){return {ok:true,local:true};};
      m8StorageBlocked=false;m8HardBlocked=false;m8UnprovenBlocked=false;
      const uid=pbUid();
      m8Remove('conflict',uid);
      const baseCanon=m8Canon(bt).canon;
      m8Write('base',{canon:M8_CANON_VER,body:baseCanon,rev:36},uid);
      const empty={cardioTypes:['Peloton'],exercises:[],routines:[],sessions:{},liftSessions:{}};
      const oneRoutine={cardioTypes:['Peloton'],exercises:[],routines:[{id:'r-9',name:'Legs',items:[]}],
                        sessions:{},liftSessions:{}};
      let n=0;
      const call=(payload,prior)=>new Promise(res=>
        m8CasCommit(36,payload,'k-'+(++n),r=>res(r.st),prior));

      return {
        emptyOverFull:   await call(empty),
        emptyOverEmpty:  await call(empty,m8Canon(empty).canon),
        emptyNoBase:     await call(empty,null),
        contentOverFull: await call(oneRoutine,baseCanon),
        /* ruling 6: no caller may commit without saying what it replaces */
        contentNoPrior:  await call(oneRoutine),
        emptyNoPrior:    await call(empty),
        /* the conflict path's prior is the captured SERVER copy, not the base */
        emptyOverServer: await call(empty,baseCanon),
      };
    },TRAINING);await settle(b.page);

    test('the choke point refuses emptiness over content',()=>eq(r.emptyOverFull,'emptyRefused'));
    test('empty over an already-empty prior is not a destruction',()=>eq(r.emptyOverEmpty,'ok'));
    test('and neither is empty with no prior at all — that is bootstrap',()=>eq(r.emptyNoBase,'ok'));
    test('ordinary content passes untouched',()=>eq(r.contentOverFull,'ok'));
    test('a caller that does not say what it replaces cannot commit at all',()=>{
      /* the default this replaces was a live bug: m8ResolveJournal dispatched
         without a prior, so a stored request was judged against the CURRENT
         base rather than the one it was written to replace */
      eq(r.contentNoPrior,'emptyRefused','even a harmless payload must declare its prior');
      eq(r.emptyNoPrior,'emptyRefused');
    });
    test('a caller-supplied prior is honoured — the conflict path checks the SERVER copy',()=>
      eq(r.emptyOverServer,'emptyRefused'));
    await b.ctx.close();
  }

  /* ---- 7. A STORED EMPTYING JOURNAL (Architect rulings 9 and 10) ----
     A journal written before this guard existed, or by any future caller, must
     not be dispatched. Ruling 9 requires ONE named disposition and evidence for
     it — not "preserved or quarantined, either is fine", which is what the
     previous version of this test accepted and which proved neither.

     The disposition chosen: the journal stays at its own key, byte-identical,
     and the disagreement surfaces as a conflict. Asserted exactly. */
  {
    const b=await boot(browser,origin,'normal');
    const seeded=await b.page.evaluate((bt)=>{
      m10AuthNow=function(){return {ok:true,local:true};};
      m8StorageBlocked=false;m8HardBlocked=false;m8UnprovenBlocked=false;
      const uid=pbUid();
      m8Remove('conflict',uid);
      const baseCanon=m8Canon(bt).canon;
      const empty={cardioTypes:['Peloton'],exercises:[],routines:[],sessions:{},liftSessions:{}};
      m8Write('base',{canon:M8_CANON_VER,body:baseCanon,rev:36},uid);
      const legacy={op:'ack',phase:'intent',startedAt:Date.now()-1000,
        expect:{oldBaseCanon:baseCanon,expectedRev:36,pushedCanon:m8Canon(empty).canon,
                gen:3,requestId:'legacy-req-1'}};
      m8Write('journal',legacy,uid);
      return {key:m8Key('journal',uid),
              bytes:localStorage.getItem(m8Key('journal',uid)),
              validator:m8ValidateJournal(m8Read('journal',uid).val)};
    },TRAINING);

    test('such a journal is VALID — it is refused at dispatch, not by shape',()=>{
      eq(seeded.validator,null,'validation must not preempt the dispatch refusal (ruling 10)');
    });

    const after=await b.page.evaluate((k)=>{
      m8Push();
      return {bytes:localStorage.getItem(k),
              conflict:(m8Read('conflict',pbUid()).st==='ok'
                ? m8Read('conflict',pbUid()).val.reason : null),
              quarantined:(function(){for(let i=0;i<localStorage.length;i++){
                const kk=localStorage.key(i);
                if(kk&&kk.indexOf('wl_training_corrupt__')===0)return kk;}return null;})()};
    },seeded.key);await settle(b.page);

    test('it is NOT dispatched — nothing reaches the server',()=>{
      eq(b.commits.filter(c=>c&&c.subsystem==='training').length,0);
    });
    test('it stays at its OWN key, byte-for-byte — not moved, not quarantined',()=>{
      eq(after.bytes,seeded.bytes,'the journal bytes must be untouched');
      eq(after.quarantined,null,'nothing should have been quarantined');
    });
    test('and the refusal is visible to him, as a conflict he can resolve',()=>{
      eq(after.conflict,'training-empty-refused-replay');
    });
    await b.ctx.close();
  }

  /* ---- 7b. THE JOURNAL'S PRIOR, NOT THE CURRENT ONE (Architect rulings 4-7)
     The previous version of this suite left the current base equal to the
     journal's oldBaseCanon, so it could not tell the two apart — and a real
     bug hid in that gap: m8ResolveJournal dispatched without passing a prior
     at all, and the choke point silently read the current base. A stored
     request must be judged against what it was WRITTEN to replace.

     Here the two deliberately disagree. */
  {
    const b=await boot(browser,origin,'normal');
    const r=await b.page.evaluate(async(bt)=>{
      m10AuthNow=function(){return {ok:true,local:true};};
      m8StorageBlocked=false;m8HardBlocked=false;m8UnprovenBlocked=false;
      const uid=pbUid();
      m8Remove('conflict',uid);
      const fullCanon=m8Canon(bt).canon;
      const empty={cardioTypes:['Peloton'],exercises:[],routines:[],sessions:{},liftSessions:{}};
      const emptyCanon=m8Canon(empty).canon;
      let n=0;
      const call=(payload,prior)=>new Promise(res=>
        m8CasCommit(36,payload,'jb-'+(++n),r=>res(r.st),prior));

      /* the base NOW is empty; the journal says this request was written to
         replace a FULL document. Judged on the journal, it is a destruction. */
      m8Write('base',{canon:M8_CANON_VER,body:emptyCanon,rev:36},uid);
      const journalSaysDestructive=await call(empty,fullCanon);
      const wouldHavePassedOnCurrentBase=await call(empty,emptyCanon);

      /* and the reverse: the base NOW is full, the journal says empty->empty.
         The destructive check follows the journal; the server's own CAS on
         expectedRev is what still protects the current state. */
      m8Write('base',{canon:M8_CANON_VER,body:fullCanon,rev:36},uid);
      const journalSaysHarmless=await call(empty,emptyCanon);
      return {journalSaysDestructive,wouldHavePassedOnCurrentBase,journalSaysHarmless};
    },TRAINING);await settle(b.page);

    test('a stored request is refused on ITS OWN prior, though the base is now empty',()=>{
      eq(r.journalSaysDestructive,'emptyRefused');
      eq(r.wouldHavePassedOnCurrentBase,'ok',
         'proof the two really disagree — reading the current base would have let it through');
    });
    test('and an empty->empty journal is not reclassified by a base that has since filled',()=>{
      eq(r.journalSaysHarmless,'ok','the captured transition decides, not today\'s base');
    });
    test('no commit escaped during any of it',()=>{
      /* the two 'ok' results above are choke-point verdicts; the fetch that
         follows is stubbed, so what matters is that the refused one sent
         nothing */
      ok(b.commits.filter(c=>c&&c.subsystem==='training'&&
         JSON.stringify(c.payload.routines)==='[]'&&c.expectedRev===36).length<=2);
    });
    await b.ctx.close();
  }

  /* ---- 7c. A REPLAY THAT SHOULD GO, MUST GO ----
     The discriminating case. Sections 7 and 7b both assert REFUSAL, which the
     mandatory-prior rule produces on its own — so dropping the journal's prior
     from the replay call passed both. Here the journal's captured transition is
     harmless (empty -> content) while the current base is FULL. Correct code
     passes oldBaseCanon and the request goes out; code that omits it is refused
     by the mandatory rule and sends nothing. */
  {
    const b=await boot(browser,origin,'normal');
    await b.page.evaluate((bt)=>{
      m10AuthNow=function(){return {ok:true,local:true};};
      m8StorageBlocked=false;m8HardBlocked=false;m8UnprovenBlocked=false;
      const uid=pbUid();
      m8Remove('conflict',uid);
      const empty={cardioTypes:['Peloton'],exercises:[],routines:[],sessions:{},liftSessions:{}};
      const emptyCanon=m8Canon(empty).canon;
      const fullCanon=m8Canon(bt).canon;
      /* base NOW is full; the stored request was written when it was empty */
      m8Write('base',{canon:M8_CANON_VER,body:fullCanon,rev:36},uid);
      m8Write('journal',{op:'ack',phase:'intent',startedAt:Date.now()-1000,
        expect:{oldBaseCanon:emptyCanon,expectedRev:36,pushedCanon:fullCanon,
                gen:3,requestId:'replay-should-go-1'}},uid);
      m8Push();
    },TRAINING);await settle(b.page);

    test('a harmless stored request still reaches the server',()=>{
      const t=b.commits.filter(c=>c&&c.subsystem==='training'&&c.idempotencyKey==='replay-should-go-1');
      eq(t.length,1,'the replay must dispatch — it destroys nothing');
    });
    await b.ctx.close();
  }

  /* ---- 8. THE CORE SUBSYSTEM (Architect ruling 9) ----
     "This is not training-specific until proven otherwise." It was not:
     load() had the identical swallow-everything shape, and payload() is built
     from the state it fills. */
  {
    const b=await boot(browser,origin,'normal');
    const r=await b.page.evaluate(()=>({
      /* settings must NOT count as content, or a fresh install with default
         settings looks non-empty and could never adopt from the server */
      emptyWithSettings:coreStateEmpty({settings:{units:'lbs',onboarded:true}}),
      oneWeighIn:coreStateEmpty({settings:{},weights:[{date:'2026-08-10',weight:183}]}),
      oneFoodDay:coreStateEmpty({settings:{},food:{'2026-08-10':{calories:2100}}}),
      oneCheckin:coreStateEmpty({settings:{},checkins:{'2026-08-10':{status:'sent'}}}),
      canonUnreadable:m10cCanonEmpty('{not json'),
      canonNull:m10cCanonEmpty(null),
    }));
    test('core emptiness ignores settings, which every device has',()=>eq(r.emptyWithSettings,true));
    test('a single weigh-in, food day or check-in is content',()=>{
      eq(r.oneWeighIn,false);eq(r.oneFoodDay,false);eq(r.oneCheckin,false);});
    test('unreadable core bytes count as CONTENT — it fails toward keeping',()=>
      eq(r.canonUnreadable,false));
    test('a null core canon is genuinely nothing',()=>eq(r.canonNull,true));

    const st=await b.page.evaluate(()=>{
      /* the shape the guard exists for: the server holds an account, this boot
         loaded nothing */
      const full=m10cCanon({settings:{units:'lbs'},weights:[{date:'2026-08-09',weight:184}],
        food:{},workouts:{},steps:{},notes:{},ratings:{},checkins:{},sleep:{},bodyfat:{},
        waist:{},leanmass:{},statuses:[],presets:[],skips:{},glp:{},scriptVer:{}}).canon;
      state.weights=[];state.food={};state.steps={};state.notes={};state.sleep={};
      state.bodyfat={};state.waist={};state.leanmass={};state.statuses=[];
      state.ratings={};state.checkins={};state.nightlyLog={};state.workouts={};state.skips={};
      return {baseNonEmpty:!m10cCanonEmpty(full),localEmpty:coreStateEmpty(payload())};
    });
    test('an unloaded core presents as empty against a server that has data',()=>{
      ok(st.baseNonEmpty,'the base must hold content for this to matter');
      ok(st.localEmpty,'and this boot must look empty');
    });

    /* THE BYPASS (Architect ruling 8). The first version of this fix put the
       core refusal only in m10cPush — but a journal that survived a reload
       replays through m10cRecover straight into m10cDispatch, going around it.
       Exactly the gap that made the training guard incomplete one layer up,
       repeated. m10cDispatch is driven directly here, with no m10cPush, which
       is the only way to show the second layer exists. */
    const dispatched=await b.page.evaluate(async()=>{
      const full=m10cCanon({settings:{units:'lbs'},weights:[{date:'2026-08-09',weight:184}],
        food:{},workouts:{},steps:{},notes:{},ratings:{},checkins:{},sleep:{},bodyfat:{},
        waist:{},leanmass:{},statuses:[],presets:[],skips:{},glp:{},scriptVer:{}}).canon;
      const emptyObj={settings:{units:'lbs'},weights:[],food:{},workouts:{},steps:{},notes:{},
        ratings:{},checkins:{},sleep:{},bodyfat:{},waist:{},leanmass:{},statuses:[],
        presets:[],skips:{},glp:{},scriptVer:{}};
      const emptyCanon=m10cCanon(emptyObj).canon;
      const j={op:'core-ack',phase:'intent',startedAt:Date.now()-1000,
        expect:{oldBaseCanon:full,expectedRev:12,pushedCanon:emptyCanon,
                gen:2,fence:1,requestId:'core-legacy-1'}};
      const ok=await new Promise(res=>m10cDispatch(j,emptyObj,res,m10cCtx()));
      return {ok:ok,
              predicate:coreCanonWouldEmpty(full,emptyCanon),
              notADestruction:coreCanonWouldEmpty(emptyCanon,emptyCanon)};
    });await settle(b.page);

    test('the core transition predicate names content-becoming-nothing',()=>{
      eq(dispatched.predicate,true);
      eq(dispatched.notADestruction,false,'empty over empty is not a destruction');
    });
    test('a stored core upload that would empty the account is refused at DISPATCH',()=>{
      eq(dispatched.ok,false,'m10cDispatch must refuse, not just m10cPush');
      eq(b.commits.filter(c=>c&&c.subsystem==='core').length,0,'nothing may reach the server');
    });

    /* and the early half, driven through m10cPush itself — otherwise disabling
       that guard changes no test, which is the vacuous-coverage trap this
       project keeps finding */
    const pushed=await b.page.evaluate(async()=>{
      const uid=m8Uid();
      const full=m10cCanon({settings:{units:'lbs'},weights:[{date:'2026-08-09',weight:184}],
        food:{},workouts:{},steps:{},notes:{},ratings:{},checkins:{},sleep:{},bodyfat:{},
        waist:{},leanmass:{},statuses:[],presets:[],skips:{},glp:{},scriptVer:{}}).canon;
      /* the server holds an account; this boot has nothing logged */
      state.weights=[];state.food={};state.steps={};state.notes={};state.sleep={};
      state.bodyfat={};state.waist={};state.leanmass={};state.statuses=[];
      state.ratings={};state.checkins={};state.nightlyLog={};state.workouts={};state.skips={};
      m10cWrite('base',{canon:1,rev:12,body:full},uid);
      m10cWrite('dirty',{gen:4,persistedGen:4,ts:Date.now()},uid);
      m10cRemove&&m10cRemove('journal',uid);
      try{localStorage.removeItem('wl_core_ack_journal__'+uid);}catch(e){}
      /* hold the pen so the STRICT gate above is not what refuses */
      M10.booted=true;M10.holder=true;M10.uid=uid;M10.fence=1;
      M10.deadline=performance.now()+600000;
      m10cPushing=false;
      m10cHardBlocked=false;m10cBlockReason='';
      const ok=await new Promise(res=>m10cPush(false,res));
      return {ok:ok,reason:m10cBlockReason,
              /* the early guard returns BEFORE m10cJournalWrite; the dispatch
                 layer only refuses after a journal exists. That difference is
                 what makes this test specific to the push layer rather than
                 passing on the layer beneath it. */
              journal:localStorage.getItem('wl_core_ack_journal__'+uid)};
    });await settle(b.page);

    test('and m10cPush refuses it too, before a request is ever built',()=>{
      eq(pushed.ok,false,'m10cPush must refuse an empty core over a non-empty base');
      eq(b.commits.filter(c=>c&&c.subsystem==='core').length,0);
      eq(pushed.reason,'this device has no logged data but your account does — nothing was uploaded',
         'the PUSH-layer message, not the dispatch one — otherwise this passes on the layer below');
      eq(pushed.journal,null,'no journal may be written for a push refused this early');
    });
    await b.ctx.close();
  }

  console.log('\n'+passed+' passed, '+failures.length+' failed');
  await browser.close();server.close();
  process.exit(failures.length?1:0);
})();
