/* C41 (browser) — the live page and MacroCore agree, case for case.
 *
 * state-glp-calc.js's calculators were reduced to adapters over MacroCore so a
 * Python port on the codex VPS can be held to the same arithmetic. That is only
 * safe if the refactor changed NOTHING the app computes. Asserting it did is not
 * evidence; this drives the real page's own functions — bmr(), maintenanceCals(),
 * targetIntake(), suggestedProteinG(), suggestedMacros() — over the golden
 * vectors and requires exact equality with the module.
 *
 * Reading the app's globals only works because the browser build is a classic
 * script (Owner ruling R2 in the architecture package). If that ever changes,
 * this test breaks loudly, which is the correct outcome.
 *
 * Note it compares the page against the COMMITTED golden file rather than
 * against MacroCore at runtime. That is deliberate: the same file is what the
 * Python port is held to, so page, module and port are all pinned to one
 * artifact instead of two of them agreeing with each other while the third
 * drifts.
 *
 *     CF_SRC=<file> node tests/browser/c41-macro-core-parity.browser.test.js */
const path=require('path'),http=require('http'),fs=require('fs');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const SRC=process.env.CF_SRC||'/home/griffin/projects/compound-app/index.html';
const GOLDEN=require('/home/griffin/projects/compound-app/src/fixtures/macro-golden.json');
let passed=0;const failures=[];
const test=(n,f)=>{try{f();passed++;console.log('  ✓ '+n);}catch(e){failures.push(n);console.log('  ✗ '+n+'\n      '+(e&&e.message));}};
const eq=(a,b,m)=>{if(a!==b)throw new Error((m||'eq')+': '+JSON.stringify(a)+' !== '+JSON.stringify(b));};
const ok=(v,m)=>{if(!v)throw new Error(m||'expected truthy');};

(async()=>{
  const html=fs.readFileSync(SRC,'utf8');
  const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch();
  const ctx=await browser.newContext({viewport:{width:390,height:844}});
  await ctx.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({items:[],token:'tok',record:{id:'userA'}})}));
  await ctx.addInitScript(()=>{
    localStorage.setItem('wl_pb',JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok',email:'a@x.com'}));
    localStorage.setItem('wl_last_owner','userA');
    localStorage.setItem('wl_v1',JSON.stringify({settings:{onboarded:true,units:'lbs'},
      weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},
      leanmass:{},statuses:[],presets:[],skips:{},nightlyLog:{}}));
  });
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  await page.waitForTimeout(900);

  console.log('C41 — live page vs MacroCore over '+GOLDEN.cases.length+' golden cases');

  const present=await page.evaluate(()=>typeof MacroCore==='object'&&typeof MacroCore.suggestedMacros==='function');
  test('MacroCore reached the browser build',()=>ok(present,'MacroCore missing from index.html'));

  /* Only the cases with a complete profile can be driven through the page —
     the page's bmr() also needs a weight in the log, which the incomplete
     cases deliberately lack. Those are covered by the node unit tests. */
  const drivable=GOLDEN.cases.filter(c=>{
    const i=c.inputs;
    return !i._dropped && i.caloriesOverride===undefined && i.heightCm===undefined
      && i.sex && i.ageYears!=null && i.heightFt!=null && i.weight!=null
      && i.goalWeight!=null && i.activityLevel;
  });

  const result=await page.evaluate(cases=>{
    const out=[];
    for(const c of cases){
      const i=c.inputs;
      /* drive the REAL page: set settings and a weigh-in exactly as the app
         would have them, then call the app's own functions */
      state.settings=Object.assign({},state.settings,{
        sex:i.sex, age:String(i.ageYears),
        heightFt:String(i.heightFt), heightIn:String(i.heightIn||0),
        units:i.units, goalWeight:String(i.goalWeight),
        activityLevel:i.activityLevel, strategy:i.strategy,
        targetType:i.targetType,
        targetValue:i.targetValue==null?'':String(i.targetValue),
        targetCalories:'', proteinAuto:true,
      });
      state.weights=[{date:'2026-08-10',weight:i.weight}];
      out.push({
        bmr:bmr(),
        maintenance:maintenanceCals(),
        targetIntake:targetIntake(),
        proteinG:suggestedProteinG(),
        macros:suggestedMacros(),
      });
    }
    return out;
  },drivable);

  let mismatches=[];
  for(let k=0;k<drivable.length;k++){
    const want=drivable[k].outputs, got=result[k];
    const fields=['bmr','maintenance','targetIntake','proteinG'];
    for(const f of fields){
      if(want[f]!==got[f]){mismatches.push({case:k,field:f,want:want[f],got:got[f],inputs:drivable[k].inputs});break;}
    }
    if(mismatches.length&&mismatches[mismatches.length-1].case===k)continue;
    const wm=want.macros, gm=got.macros;
    if((wm===null)!==(gm===null)){mismatches.push({case:k,field:'macros',want:wm,got:gm});continue;}
    if(wm){
      for(const f of ['protein','carbs','fat','cal']){
        if(wm[f]!==gm[f]){mismatches.push({case:k,field:'macros.'+f,want:wm[f],got:gm[f],inputs:drivable[k].inputs});break;}
      }
    }
  }

  test(drivable.length+' drivable cases: the live page matches the committed vectors',()=>{
    if(mismatches.length){
      const m=mismatches[0];
      throw new Error(mismatches.length+' mismatch(es); first: case '+m.case+' field '+m.field
        +' want '+JSON.stringify(m.want)+' got '+JSON.stringify(m.got)
        +'\n      inputs: '+JSON.stringify(m.inputs));
    }
  });

  /* the headline case, asserted against the golden file rather than by hand */
  const owner=GOLDEN.cases.find(c=>c.inputs.weight===195&&c.inputs.goalWeight===175
    &&c.inputs.sex==='male'&&c.inputs.activityLevel==='moderate'&&c.inputs.strategy==='lose'
    &&c.inputs.targetType==='percent_bw_per_week'&&!c.inputs._dropped);
  test("the Owner's own case is in the golden file and yields 175 g protein",()=>{
    ok(owner,'no 195→175 case found in the golden vectors');
    eq(owner.outputs.proteinG,175);
  });

  test('no page errors',()=>eq(errs.length,0,errs.join(' | ')));

  console.log('\n'+passed+' passed, '+failures.length+' failed');
  await browser.close();server.close();
  process.exit(failures.length?1:0);
})();
