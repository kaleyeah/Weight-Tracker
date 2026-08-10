/* C39 (browser) — every export button asks CSV-or-HTML before building
   anything (Owner, 2026-08-10: "When I export ask me if I want csv or html").

   The share sheet is stubbed by replacing the global shareOrDownloadMulti —
   valid only because the app is a classic script whose top-level functions
   live on window. What matters:
     - the first tap opens a chooser and shares NOTHING;
     - each choice shares exactly ONE file of exactly that type;
     - the chooser dies on cancel, on week navigation, and on leaving the view;
     - the no-fmt call still bundles both files (old callers unchanged).

       CF_SRC=<file> node tests/browser/c39-export-format-ask.browser.test.js */
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
  const ctx=await browser.newContext({viewport:{width:390,height:844}});
  /* grant the writer lease (c24's mock) — the export actions sit behind the
     M10 gate, and an ungranted device would be refused at the first tap */
  await ctx.route('**/api/**',r=>{
    const u=r.request().url();
    if(/cf\/writer\/lease/.test(u)){
      let b={};try{b=JSON.parse(r.request().postData()||'{}');}catch(e){}
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,exists:true,granted:true,
        fence:1,holderDeviceId:b.deviceId||'dev',deviceName:'x',active:true,serverNow:Date.now(),ttlMs:86400000})});}
    return r.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({items:[],token:'tok',record:{id:'userA'}})});});
  await ctx.addInitScript(()=>{
    const iso=d=>{const t=new Date(d);t.setHours(12,0,0,0);
      return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');};
    const today=new Date();today.setHours(12,0,0,0);
    const weights=[],steps={},food={};
    for(let k=0;k<14;k++){const d=new Date(today);d.setDate(today.getDate()-k);
      weights.push({date:iso(d),weight:190-k*0.1});steps[iso(d)]=9000;
      food[iso(d)]={calories:2100,protein:175};}
    localStorage.setItem('wl_pb',JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok',email:'a@x.com'}));
    localStorage.setItem('wl_last_owner','userA');
    localStorage.setItem('wl_v1',JSON.stringify({settings:{onboarded:true,units:'lbs',weekStart:'1',name:'G'},
      weights,food,workouts:{},steps,notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},
      statuses:[],presets:[],skips:{},nightlyLog:{}}));
  });
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  await page.waitForFunction(()=>window.M10&&window.M10.booted===true,null,{timeout:15000});
  const run=(fn,arg)=>page.evaluate(fn,arg);

  console.log('C39 — export format chooser');

  await run(()=>{
    window.__shared=[];
    window.shareOrDownloadMulti=function(list){window.__shared.push(list.map(f=>({name:f.name,mime:f.mime,len:(f.text||'').length,head:(f.text||'').slice(0,400)})));};
  });

  /* ---- Summary: Export this week ---------------------------------------- */
  await run(()=>{state.view='summary';state.weekOffset=0;render();});
  const step1=await run(()=>{
    document.querySelector('[data-act="sum:exportweek"]').click();
    return {ask:state.exportAsk,shared:window.__shared.length,
      chooser:!!document.querySelector('[data-act="exp:go"][data-kind="week"]'),
      cancel:!!document.querySelector('[data-act="exp:cancel"]')};
  });
  test('tapping Export this week opens the chooser, shares nothing',()=>{
    eq(step1.ask,'week');eq(step1.shared,0,'files shared');
    ok(step1.chooser,'chooser buttons rendered');ok(step1.cancel,'cancel rendered');
  });

  const csvPick=await run(()=>{
    document.querySelector('[data-act="exp:go"][data-fmt="csv"][data-kind="week"]').click();
    return {ask:state.exportAsk,shared:window.__shared.slice(),
      chooserGone:!document.querySelector('[data-act="exp:go"]')};
  });
  test('choosing CSV shares exactly one CSV and closes the chooser',()=>{
    eq(csvPick.shared.length,1,'share calls');
    eq(csvPick.shared[0].length,1,'files in the share');
    ok(/\.csv$/.test(csvPick.shared[0][0].name),csvPick.shared[0][0].name);
    ok(/^text\/csv/.test(csvPick.shared[0][0].mime),csvPick.shared[0][0].mime);
    ok(csvPick.shared[0][0].len>0,'file has content');
    eq(csvPick.ask,null);ok(csvPick.chooserGone,'chooser still visible');
  });

  const htmlPick=await run(()=>{
    window.__shared=[];
    document.querySelector('[data-act="sum:exportweek"]').click();
    document.querySelector('[data-act="exp:go"][data-fmt="html"][data-kind="week"]').click();
    return window.__shared.slice();
  });
  test('choosing HTML shares exactly one HTML file — and it IS the progress report',()=>{
    eq(htmlPick.length,1,'share calls');eq(htmlPick[0].length,1,'files');
    /* Owner, 2026-08-10: the week's HTML is the progress report, not the old
       repHTML week document. Pinned by filename AND by the document's title. */
    ok(/^progress-report-.*\.html$/.test(htmlPick[0][0].name),htmlPick[0][0].name);
    ok(/^text\/html/.test(htmlPick[0][0].mime),htmlPick[0][0].mime);
    ok(/Compound — Progress report/.test(htmlPick[0][0].head),'document head was: '+htmlPick[0][0].head.slice(0,120));
  });

  /* ---- Summary: Export progress report ----------------------------------- */
  const coach=await run(()=>{
    window.__shared=[];
    document.querySelector('[data-act="sum:coachreport"]').click();
    const opened=!!document.querySelector('[data-act="exp:go"][data-kind="coach"]');
    document.querySelector('[data-act="exp:go"][data-fmt="html"][data-kind="coach"]').click();
    const first=window.__shared.slice();
    document.querySelector('[data-act="sum:coachreport"]').click();
    document.querySelector('[data-act="exp:go"][data-fmt="csv"][data-kind="coach"]').click();
    return {opened:opened,first:first,second:window.__shared.slice(1)};
  });
  test('progress report: HTML choice shares the report alone',()=>{
    ok(coach.opened,'chooser opened');
    eq(coach.first.length,1);eq(coach.first[0].length,1,'files');
    ok(/^progress-report-.*\.html$/.test(coach.first[0][0].name),coach.first[0][0].name);
  });
  test('progress report: CSV choice shares the week CSV alone',()=>{
    eq(coach.second.length,1);eq(coach.second[0].length,1,'files');
    ok(/^weight-summary-.*\.csv$/.test(coach.second[0][0].name),coach.second[0][0].name);
  });

  /* ---- chooser lifetime --------------------------------------------------- */
  const cancel=await run(()=>{
    window.__shared=[];
    document.querySelector('[data-act="sum:exportweek"]').click();
    document.querySelector('[data-act="exp:cancel"]').click();
    return {ask:state.exportAsk,shared:window.__shared.length,
      gone:!document.querySelector('[data-act="exp:go"]')};
  });
  test('cancel closes the chooser and shares nothing',()=>{
    eq(cancel.ask,null);eq(cancel.shared,0);ok(cancel.gone,'chooser gone');
  });

  const nav=await run(()=>{
    document.querySelector('[data-act="sum:exportweek"]').click();
    const open=state.exportAsk;
    document.querySelector('[data-act="sum:prev"]').click();
    return {open:open,after:state.exportAsk,shared:window.__shared.length};
  });
  test('changing the displayed week closes an open chooser',()=>{
    eq(nav.open,'week');eq(nav.after,null);eq(nav.shared,0);
  });
  await run(()=>{document.querySelector('[data-act="sum:tocur"]').click();});

  /* ---- Profile: Export all data ------------------------------------------ */
  const all=await run(()=>{
    window.__shared=[];
    state.view='settings';state.setPage='data';state.open={exportdata:true,backup:true};render();
    document.querySelector('[data-act="sum:exportall"]').click();
    const opened=!!document.querySelector('[data-act="exp:go"][data-kind="all"]');
    document.querySelector('[data-act="exp:go"][data-fmt="csv"][data-kind="all"]').click();
    return {opened:opened,shared:window.__shared.slice()};
  });
  test('Export all data asks too; CSV choice shares the history CSV alone',()=>{
    ok(all.opened,'chooser opened in the profile card');
    eq(all.shared.length,1);eq(all.shared[0].length,1,'files');
    ok(/^weight-history-.*\.csv$/.test(all.shared[0][0].name),all.shared[0][0].name);
  });

  /* ---- compatibility: a fmt-less call still bundles both ------------------ */
  const both=await run(()=>{
    window.__shared=[];
    exportWeekFiles();srExport();exportAllFiles();
    return window.__shared.slice();
  });
  test('calls without a format still share the old two-file bundle',()=>{
    eq(both.length,3,'share calls');
    both.forEach(list=>{
      eq(list.length,2,'files in bundle');
      ok(list.some(f=>/\.csv$/.test(f.name))&&list.some(f=>/\.html$/.test(f.name)),
        'bundle holds one CSV and one HTML: '+list.map(f=>f.name).join(', '));
    });
  });

  test('no page errors',()=>eq(errs.length,0,errs.join(' | ')));

  console.log('\n'+passed+' passed, '+failures.length+' failed');
  await browser.close();server.close();
  process.exit(failures.length?1:0);
})();
