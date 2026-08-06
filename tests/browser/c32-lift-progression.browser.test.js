/* C32 (browser) — the lifting progression logic, from the Owner's live report
   (2026-08-05): "15 reps with 15 lb on every set of lateral raises — never a
   go-up suggestion. Bumped to 20 lb and it suggested 4 reps."

       CF_SRC=<file> node tests/browser/c32-lift-progression.browser.test.js

   Bug A: the workout screen displays a DEFAULT 8–12 target when no rep range
   was typed, but analyzeSession skipped empty-range entries entirely — the
   go-up cue could never fire on them. Double progression now judges against
   the same default 12 it displays; explicit ranges still rule; RPT stays out.
   Bug B: Epley 1RM inversion out of its domain — above ~10 total reps the
   predictor now scales reps by load ratio. Heavy-set behavior unchanged. */
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

  /* ---- Bug A: the Owner's exact case — 15×15 every set, NO typed range ---- */
  {
    const s=await page.evaluate(()=>{
      const mkSet=(w,r)=>({weight:String(w),reps:String(r),rir:null,status:'done'});
      state.training.liftSessions['2026-08-05']=[{id:'s1',ts:1,mode:'full',name:'Shoulders',
        entries:[{exerciseId:'ex-latr',name:'Dumbbell Lateral Raise',muscle:'shoulders',
          progression:'double',repLow:null,repHigh:null,
          sets:[mkSet(15,15),mkSet(15,15),mkSet(15,15)]}]}];
      const an=analyzeSession('2026-08-05','s1');
      return {n:an.progress.length,name:(an.progress[0]||{}).name,next:(an.progress[0]||{}).next};});
    test('OWNER CASE: 15×15 with an empty rep range now fires the go-up cue',()=>{
      eq(s.n,1,'no cue');eq(s.name,'Dumbbell Lateral Raise');});
    test('the cue suggests a concrete heavier weight',()=>ok(s.next>15,'next: '+s.next));
  }

  /* ---- Bug A guards: explicit ranges still rule; RPT stays out ---- */
  {
    const s=await page.evaluate(()=>{
      const mkSet=(w,r)=>({weight:String(w),reps:String(r),rir:null,status:'done'});
      state.training.liftSessions['2026-08-04']=[{id:'s2',ts:1,mode:'full',name:'X',
        entries:[
          {exerciseId:'e1',name:'HighRange',muscle:'shoulders',progression:'double',
            repLow:12,repHigh:20,sets:[mkSet(15,15)]},          /* 15 < explicit 20 */
          {exerciseId:'e2',name:'RptLift',muscle:'chest',progression:'rpt',
            repLow:null,repHigh:null,sets:[mkSet(100,15)]}]}];   /* RPT: no double cue */
      const an=analyzeSession('2026-08-04','s2');
      return an.progress.map(p=>p.name);});
    test('an EXPLICIT 12–20 range is respected — 15 reps stays quiet',()=>
      eq(s.indexOf('HighRange'),-1,'cued: '+s.join(',')));
    test('RPT entries keep their own ladder — no double-progression cue',()=>
      eq(s.indexOf('RptLift'),-1,'cued: '+s.join(',')));
  }

  /* ---- Bug B: the Owner's 15 lb ×15 → 20 lb prediction ---- */
  {
    const s=await page.evaluate(()=>{
      const en={exerciseId:'ex-none',progression:'rpt',
        sets:[{weight:'15',reps:'15',rir:null,status:'done'},
              {weight:'20',reps:'',status:'todo'}]};
      return {cap:rptCapAt(15,15,20),tgt:rptPredictReps(en,0)};});
    test('OWNER CASE: 15×15 → 20 lb predicts a sane high-rep target, never 4',()=>{
      ok(s.tgt>=7&&s.tgt<=12,'target: '+s.tgt);});
    test('the raw capacity model gives ~11 (load-ratio), not Epley\'s 3.75',()=>
      ok(Math.abs(s.cap-11.25)<0.01,'cap: '+s.cap));
  }

  /* ---- Bug B guard: heavy-set Epley domain is UNCHANGED ---- */
  {
    const s=await page.evaluate(()=>({
      cap:rptCapAt(100,6,90),
      tgt:rptPredictReps({exerciseId:'ex-none',progression:'rpt',
        sets:[{weight:'100',reps:'6',rir:null,status:'done'},{weight:'90',reps:'',status:'todo'}]},0)}));
    test('heavy sets keep the exact Epley prediction (100×6 → 90 lb ⇒ cap 10)',()=>{
      ok(Math.abs(s.cap-10)<0.01,'cap: '+s.cap);eq(s.tgt,7,'tgt with default fatigue 3');});
  }

  test('no page errors',()=>eq(errs.length,0,errs.join(';')));

  await ctx.close();await browser.close();server.close();
  console.log(failures.length?`FAILED — ${passed} passed, ${failures.length} failed`:`OK — ${passed} passed`);
  process.exit(failures.length?1:0);
})().catch(e=>{console.error('SUITE ERROR',e);process.exit(2);});
