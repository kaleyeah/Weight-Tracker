/* C32 (browser) — lifting progression, per the Owner's rulings of 2026-08-05:

   1. RPT honors its ladder (6–8/8–10/10–12, HIS call); the capacity
      prediction is a HINT beside the range, never an override.
   2. RPT moves up on SET 1 hitting the top of its range — set 1 decides.
   3. RIR is REQUIRED — 0 or 1 progresses; a blank NEVER does, anywhere.
   4. Progression AUTO-APPLIES: next session's top set is pre-loaded heavier,
      back-offs re-derived; the post-workout card announces it.
   PO predicts (his ruling: "Progressive Overload SHOULD predict") — with the
   capacity model in its domain: Epley for heavy sets, load-ratio above ~10
   reps ("15×15 → 20 lb" predicts ~11, never Epley's 4).

       CF_SRC=<file> node tests/browser/c32-lift-progression.browser.test.js */
const path=require('path'),http=require('http'),fs=require('fs');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const SRC=process.env.CF_SRC||'/home/griffin/projects/compound-app/index.html';
let passed=0;const failures=[];
const test=(n,f)=>{try{f();passed++;console.log('  ✓ '+n);}catch(e){failures.push(n);console.log('  ✗ '+n+'\n      '+(e&&e.message));}};
const ok=(v,m)=>{if(!v)throw new Error(m||'expected truthy');};
const eq=(a,b,m)=>{if(a!==b)throw new Error((m||'eq')+': '+JSON.stringify(a)+' !== '+JSON.stringify(b));};

(async()=>{
  const html=fs.readFileSync(SRC,'utf8');
  const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch();
  const ctx=await browser.newContext();
  await ctx.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],token:'tok',record:{id:'userA'}})}));
  await ctx.addInitScript(()=>{
    localStorage.setItem('wl_pb',JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok',email:'a@x.com'}));
    localStorage.setItem('wl_last_owner','userA');
    localStorage.setItem('wl_v1',JSON.stringify({settings:{onboarded:true,units:'lbs'},weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},statuses:[],presets:[],skips:{},nightlyLog:{}}));
  });
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  await page.waitForTimeout(900);

  const mkSet=(w,r,rir)=>({weight:String(w),reps:String(r),rir:rir==null?null:String(rir),status:'done'});

  /* ---- PO cue: the Owner's lateral-raise case, WITH the required RIR ---- */
  {
    const s=await page.evaluate(async(mk)=>{
      const mkSet=eval('('+mk+')');
      state.training.liftSessions['2026-08-05']=[{id:'s1',ts:1,mode:'full',name:'Shoulders',
        entries:[{exerciseId:'ex-latr',name:'Dumbbell Lateral Raise',muscle:'shoulders',
          progression:'double',repLow:null,repHigh:null,
          sets:[mkSet(15,15,1),mkSet(15,15,0),mkSet(15,15,1)]}]}];
      const an=analyzeSession('2026-08-05','s1');
      return {n:an.progress.length,next:(an.progress[0]||{}).next};},mkSet.toString());
    test('OWNER CASE: 15×15 at RIR ≤1 with an empty range fires the go-up cue',()=>{
      eq(s.n,1,'no cue');eq(s.next,20);});
  }
  /* ---- Ruling 3: blanks NEVER progress ---- */
  {
    const s=await page.evaluate(async(mk)=>{
      const mkSet=eval('('+mk+')');
      state.training.liftSessions['2026-08-04']=[{id:'s2',ts:1,mode:'full',name:'X',
        entries:[{exerciseId:'e-po',name:'BlankRir',muscle:'shoulders',progression:'double',
          repLow:null,repHigh:null,sets:[mkSet(15,15,null),mkSet(15,15,null)]}]}];
      return analyzeSession('2026-08-04','s2').progress.length;},mkSet.toString());
    test('RULING 3: a blank RIR never progresses, even at 15 reps every set',()=>eq(s,0));
  }

  /* ---- Ruling 2: RPT — set 1 decides, alone ---- */
  {
    const s=await page.evaluate(async(mk)=>{
      const mkSet=eval('('+mk+')');
      state.training.liftSessions['2026-08-03']=[{id:'s3',ts:1,mode:'full',name:'RPT day',
        entries:[
          {exerciseId:'e-r1',name:'Bench RPT',muscle:'chest',progression:'rpt',
            sets:[mkSet(100,8,1),mkSet(90,10,0),mkSet(80,12,1)]},   /* set 1 tops 6–8 */
          {exerciseId:'e-r2',name:'Row RPT',muscle:'back',progression:'rpt',
            sets:[mkSet(100,7,0),mkSet(90,10,0),mkSet(80,12,0)]}]}]; /* set 1 short of 8 */
      const an=analyzeSession('2026-08-03','s3');
      return {names:an.progress.map(p=>p.name),next:(an.progress[0]||{}).next};},mkSet.toString());
    test('RULING 2: set 1 topping 6–8 at RIR ≤1 moves the lift up (→105)',()=>{
      eq(s.names.length,1,'cues: '+s.names.join(','));eq(s.names[0],'Bench RPT');eq(s.next,105);});
    test('RULING 2: back-off sets topping THEIR ranges do NOT drive progression',()=>
      eq(s.names.indexOf('Row RPT'),-1,'Row cued off a back-off set'));
  }

  /* ---- Ruling 4: the bump AUTO-APPLIES at the next session's seeding ---- */
  {
    const s=await page.evaluate(async(mk)=>{
      const mkSet=eval('('+mk+')');
      state.training.liftSessions['2026-08-02']=[{id:'s4',ts:1,mode:'full',name:'R',routineId:'rt1',
        entries:[{exerciseId:'e-auto',name:'OHP RPT',muscle:'shoulders',progression:'rpt',
          sets:[mkSet(100,8,1),mkSet(90,9,1),mkSet(80,11,1)]}]}];
      const en={exerciseId:'e-auto',name:'OHP RPT',muscle:'shoulders',progression:'rpt',
        bodyweight:false,itemId:'it1',setRanges:null,
        sets:[{weight:'',reps:'',rir:'',status:'pending'},{weight:'',reps:'',rir:'',status:'pending'},{weight:'',reps:'',rir:'',status:'pending'}]};
      applySuggestions([en],'rt1');
      return {w1:en.sets[0].weight,t1:en.sets[0].tgtLo+'–'+en.sets[0].tgtHi,
        w2:en.sets[1].weight,t2:en.sets[1].tgtLo+'–'+en.sets[1].tgtHi};},mkSet.toString());
    test('RULING 4: next session pre-loads the heavier top set (100→105)',()=>{
      eq(s.w1,'105');eq(s.t1,'6–8');});
    test('RULING 4: back-offs re-derive at −10% with their own ranges',()=>{
      eq(s.w2,'95');eq(s.t2,'8–10');});
  }
  /* ---- Ruling 4 + 3 combined: blank RIR on set 1 ⇒ NO auto-bump ---- */
  {
    const s=await page.evaluate(async(mk)=>{
      const mkSet=eval('('+mk+')');
      state.training.liftSessions['2026-08-01']=[{id:'s5',ts:1,mode:'full',name:'R',routineId:'rt2',
        entries:[{exerciseId:'e-hold',name:'Curl RPT',muscle:'biceps',progression:'rpt',
          sets:[mkSet(50,8,null),mkSet(45,10,1)]}]}];
      const en={exerciseId:'e-hold',name:'Curl RPT',muscle:'biceps',progression:'rpt',
        bodyweight:false,itemId:'it2',setRanges:null,
        sets:[{weight:'',reps:'',rir:'',status:'pending'},{weight:'',reps:'',rir:'',status:'pending'}]};
      applySuggestions([en],'rt2');
      return en.sets[0].weight;},mkSet.toString());
    test('RULING 3+4: set 1 topped but RIR blank ⇒ weight holds, no bump',()=>eq(s,'50'));
  }

  /* ---- Ruling 1: the range rules; the prediction is a labeled hint ---- */
  {
    const s=await page.evaluate(()=>{
      const en={progression:'rpt',exerciseId:'e-hint',bodyweight:false,
        setRanges:[{lo:6,hi:8},{lo:8,hi:10},{lo:10,hi:12}],
        sets:[{weight:'100',reps:'8',rir:'1',status:'done'},
              {weight:'90',reps:'',rir:'',status:'pending',tgtLo:8,tgtHi:10},
              {weight:'80',reps:'',rir:'',status:'pending'}]};
      rptRetarget(en,0);
      const st=en.sets[1];
      return {reps:st.reps,tgtLo:st.tgtLo,tgtHi:st.tgtHi,hint:st.predR!=null};});
    test('RULING 1: the range survives — no rep pre-fill, targets intact',()=>{
      eq(s.reps,'');eq(s.tgtLo,8);eq(s.tgtHi,10);});
    test('RULING 1: the prediction lives on as a hint beside the range',()=>ok(s.hint,'no predR hint'));
  }

  /* ---- PO predicts — in the right domain ---- */
  {
    const s=await page.evaluate(()=>({
      high:sugPredictAt(15,15,20),
      heavyCap:rptCapAt(100,6,90)}));
    test('PO OWNER CASE: 15×15 → 20 lb predicts ~11, never Epley\'s 4',()=>
      ok(s.high>=10&&s.high<=12,'predicted: '+s.high));
    test('heavy sets keep exact Epley (100×6 → 90 ⇒ capacity 10)',()=>
      ok(Math.abs(s.heavyCap-10)<0.01,'cap: '+s.heavyCap));
  }

  /* ---- the live logger's hard rule stands ---- */
  {
    const s=await page.evaluate(()=>{
      /* grant the pen so the write gate passes and the RIR rule is what speaks */
      M10.booted=true;M10.holder=true;M10.uid=pbUid();M10.fence=1;M10.deadline=performance.now()+1e6;
      state.workout={routineId:null,name:'W',date:todayISO(),tState:'working',stateStartTs:Date.now(),
        warmupMs:0,workMs:0,restMs:0,bw:null,entries:[{exerciseId:'e-x',name:'X',muscle:'chest',
          progression:'double',bodyweight:false,
          sets:[{weight:'100',reps:'8',rir:'',status:'pending'}]}],finishing:false};
      state.view='workout';render();
      const btn=document.querySelector('[data-act="wo:log"][data-ei="0"][data-si="0"]');
      if(btn)btn.click();
      return {warn:state.logWarn?state.logWarn.msg:null,
        status:state.workout.entries[0].sets[0].status};});
    test('HARD RULE: logging a set without RIR is refused with the warning',()=>{
      ok(s.warn&&/RIR/.test(s.warn),'warn: '+s.warn);eq(s.status,'pending');});
  }

  test('no page errors',()=>eq(errs.length,0,errs.join(';')));

  await ctx.close();await browser.close();server.close();
  console.log(failures.length?`FAILED — ${passed} passed, ${failures.length} failed`:`OK — ${passed} passed`);
  process.exit(failures.length?1:0);
})().catch(e=>{console.error('SUITE ERROR',e);process.exit(2);});
