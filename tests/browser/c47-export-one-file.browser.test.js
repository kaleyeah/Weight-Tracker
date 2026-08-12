/* C47 (browser) — one file, and the report opens instead of being handed over.

   Owner, 2026-08-12, two complaints one after the other:

     "how come when I download anything from the app, it is always 2 files.
      It's never just one. It's a text file that says what was exported. Like
      just the file name."

     "Ideally id love to export my progress report as an html and have it open
      the page. But I can't since there's 2 files."

   THE SECOND FILE. Every navigator.share call passed `title` alongside
   `files`. iOS treats the title as its own shareable item, so Save to Files
   wrote it out as a .txt whose entire contents were the filename. Five call
   sites did it: the week/all export, the M8 conflict copies, the M10 core
   conflict copies, a shared photo, and the recovery backup. `title` is only a
   hint and nothing depended on it, so it is gone everywhere — asserted here
   for ALL of them, because fixing the one he happened to notice would leave
   the same bug in the paths that matter most (his conflict copies are the
   thing he exports before choosing which copy of his training to keep).

   THE OPEN. A progress report is something to read. Handing it to the share
   sheet means saving to Files and then finding it again — two steps to look at
   his own week. HTML on its own now opens; if the open is refused (standalone
   PWA, popup blocker) it falls back to the share sheet, so the file route is
   never lost.

       CF_SRC=<file> node tests/browser/c47-export-one-file.browser.test.js */
const path=require('path'),http=require('http'),fs=require('fs');
const {chromium}=require(path.join(process.env.HOME,'staging-cas','node_modules','playwright'));
const SRC=process.env.CF_SRC||'/home/griffin/projects/compound-app/index.html';
let passed=0;const failures=[];
const test=(n,f)=>{try{f();passed++;console.log('  ✓ '+n);}catch(e){failures.push(n);console.log('  ✗ '+n+'\n      '+(e&&e.message));}};
const ok=(v,m)=>{if(!v)throw new Error(m||'expected truthy');};
const notOk=(v,m)=>{if(v)throw new Error(m||'expected falsy');};
const eq=(a,b,m)=>{if(a!==b)throw new Error((m||'eq')+': '+JSON.stringify(a)+' !== '+JSON.stringify(b));};

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
    localStorage.setItem('wl_v1',JSON.stringify({settings:{onboarded:true,units:'lbs',weekStart:'1',name:'G',
      targetCalories:'2180',targetProtein:'175',targetCarbs:'232',targetFat:'48'},
      weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},
      statuses:[],presets:[],skips:{},nightlyLog:{},checkins:{}}));
  });
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  await page.waitForTimeout(900);

  console.log('C47 — one file, and the report opens');

  /* capture every share call, and pretend the platform accepts files */
  await page.evaluate(()=>{
    window.__shares=[];window.__opens=[];
    navigator.canShare=function(d){return !!(d&&d.files&&d.files.length);};
    navigator.share=function(d){
      window.__shares.push({keys:Object.keys(d).sort(),
        files:(d.files||[]).map(f=>f.name),
        title:d.title,text:d.text,url:d.url});
      return Promise.resolve();};
    window.open=function(u,t){window.__opens.push(String(u).slice(0,5));return null;};  /* refuse, to exercise the fallback */
  });

  /* ---- 1. the share sheet is handed FILES and nothing else ---- */
  const wk=await page.evaluate(()=>{
    window.__shares=[];
    exportWeekFiles('html');            /* window.open refuses, so it falls back */
    return window.__shares;
  });
  test('the week HTML export shares exactly one file',()=>{
    eq(wk.length,1,'one share call');
    eq(wk[0].files.length,1,'one file: '+JSON.stringify(wk[0].files));
  });
  test('and passes NO title — the field iOS turned into a second .txt',()=>{
    eq(wk[0].keys.join(','),'files','share payload keys: '+wk[0].keys);
    eq(wk[0].title,undefined);eq(wk[0].text,undefined);
  });

  const both=await page.evaluate(()=>{window.__shares=[];exportWeekFiles();return window.__shares;});
  test('CSV+HTML together still deliver both, still with no title',()=>{
    eq(both.length,1);eq(both[0].files.length,2,JSON.stringify(both[0].files));
    eq(both[0].keys.join(','),'files');
  });

  /* ---- 2. EVERY share path, not just the one he noticed ---- */
  const all=await page.evaluate(()=>{
    const out={};
    const grab=(fn)=>{window.__shares=[];try{fn();}catch(e){}return window.__shares[0]||null;};
    out.weekCsv=grab(()=>exportWeekFiles('csv'));
    out.allExport=grab(()=>exportAllFiles('csv'));
    out.srReport=grab(()=>srExport('csv'));
    return out;
  });
  test('no export path passes a title any more',()=>{
    Object.keys(all).forEach(k=>{
      const s=all[k];
      if(!s)return;                       /* path not reachable in this fixture */
      eq(s.keys.join(','),'files',k+' passed: '+s.keys);
    });
  });
  const srcHasTitle=await page.evaluate(()=>{
    /* the remaining call sites are behind flows this fixture cannot drive
       (a live conflict, a queued photo, a recovery backup), so assert on the
       shipped source instead of pretending to exercise them */
    const s=document.documentElement.outerHTML;
    const m=s.match(/navigator\.share\(\{[^}]*\}/g)||[];
    return m.map(x=>x.replace(/\s+/g,''));
  });
  test('every navigator.share in the shipped build passes files only',()=>{
    ok(srcHasTitle.length>=4,'expected several share sites, found '+srcHasTitle.length);
    srcHasTitle.forEach(c=>{
      ok(!/title:/.test(c),'a share call still carries a title: '+c);
      ok(!/text:/.test(c),'a share call still carries text: '+c);
    });
  });

  /* ---- 3. HTML alone OPENS; the share sheet is the fallback ---- */
  const opened=await page.evaluate(()=>{
    window.__shares=[];window.__opens=[];
    window.open=function(u){window.__opens.push(String(u).slice(0,5));return {closed:false};};  /* accept */
    exportWeekFiles('html');
    return {opens:window.__opens,shares:window.__shares.length};
  });
  test('choosing HTML opens the report instead of exporting a file',()=>{
    eq(opened.opens.length,1,'should have opened once');
    eq(opened.opens[0],'blob:','opened a blob URL, got '+opened.opens[0]);
    eq(opened.shares,0,'nothing should reach the share sheet when it opened');
  });

  const refused=await page.evaluate(()=>{
    window.__shares=[];window.__opens=[];
    window.open=function(u){window.__opens.push(String(u).slice(0,5));return null;};  /* refused */
    exportWeekFiles('html');
    return {opens:window.__opens.length,shares:window.__shares.length,
            files:(window.__shares[0]||{}).files};
  });
  test('and when the open is refused, the file route still works',()=>{
    eq(refused.opens,1,'it tried');
    eq(refused.shares,1,'and fell back to sharing');
    eq((refused.files||[]).length,1);
  });

  test('CSV is unaffected — it is data, not something to read',()=>{
    /* asserted via the earlier csv grab: it shared rather than opened */
    ok(all.weekCsv,'csv should still deliver a file');
    ok(/\.csv$/.test(all.weekCsv.files[0]),'got '+all.weekCsv.files[0]);
  });

  test('no page errors',()=>eq(errs.length,0,errs.join(' | ')));

  console.log('\n'+passed+' passed, '+failures.length+' failed');
  await browser.close();server.close();
  process.exit(failures.length?1:0);
})();
