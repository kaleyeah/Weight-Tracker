/* C33 (browser) — the Max message INBOX (Owner, 2026-08-06: "like an email —
   click it"). List of every message kind newest-first with mood, date+time,
   preview and unread pills; tapping opens ONE message; reading the message —
   not opening the sheet — is what marks it seen; back returns to the list.

       CF_SRC=<file> node tests/browser/c33-max-inbox.browser.test.js */
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
  await ctx.route('**/api/**',r=>{
    const url=r.request().url();
    const reply=(st,b)=>r.fulfill({status:st,contentType:'application/json',body:JSON.stringify(b)});
    if(/cf\/writer\/lease/.test(url)){
      const b=JSON.parse(r.request().postData()||'{}');
      return reply(200,{ok:true,exists:true,granted:true,fence:1,holderDeviceId:b.deviceId,
        deviceName:b.deviceName||'x',active:true,serverNow:Date.now(),ttlMs:86400000});}
    if(/coach_reports/.test(url))return reply(200,{items:[]});   /* cache drives the test */
    if(/collections\/appdata\/records/.test(url))return reply(200,{items:[]});
    return reply(200,{items:[],token:'tok',record:{id:'userA'}});});
  await ctx.addInitScript(()=>{
    const wk='2026-08-03';
    localStorage.setItem('wl_pb',JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok',email:'a@x.com'}));
    localStorage.setItem('wl_last_owner','userA');
    localStorage.setItem('wl_v1',JSON.stringify({settings:{onboarded:true,units:'lbs',weekStart:'0'},
      weights:[],food:{},workouts:{},steps:{},notes:{},sleep:{},bodyfat:{},waist:{},leanmass:{},
      statuses:[],presets:[],skips:{},nightlyLog:{}}));
    localStorage.setItem('wl_coach_reports',JSON.stringify({
      weekly:{week:wk,text:'**Strong week.** Weight trending down, protein solid — keep the bar moving.',
        mood:'proud',generated:'2026-08-03T13:00:00.000Z'},
      tdee:{period:'2026-08-05',tdee:3328,text:'Provisional metabolism read — measuring until the full window lands.',
        mood:'thinking',generated:'2026-08-05T04:59:00.000Z'},
      nightly:{'2026-08-04':{date:'2026-08-04',text:'Solid Tuesday: calories on target and a good lift.',
          mood:'happy',generated:'2026-08-05T04:55:00.000Z'},
        '2026-08-05':{date:'2026-08-05',text:'Squats and Incline Press both hit the top of their ranges at 1 RIR — next time add a little weight.',
          mood:'focused',generated:'2026-08-06T03:32:00.000Z'}}}));
  });
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  await page.waitForTimeout(900);

  /* ---- opening the sheet shows the LIST, everything unread stays unread ---- */
  {
    await page.evaluate(()=>{
      /* seed the report state DIRECTLY — the boot sync already saved the
         mock's empty coach_reports over the localStorage cache */
      state.coachRpt={
        weekly:{week:'2026-08-03',text:'**Strong week.** Weight trending down, protein solid — keep the bar moving.',mood:'proud',generated:'2026-08-03T13:00:00.000Z'},
        tdee:{period:'2026-08-05',tdee:3328,text:'Provisional metabolism read — measuring until the full window lands.',mood:'thinking',generated:'2026-08-05T04:59:00.000Z'},
        nightly:{'2026-08-04':{date:'2026-08-04',text:'Solid Tuesday: calories on target and a good lift.',mood:'happy',generated:'2026-08-05T04:55:00.000Z'},
          '2026-08-05':{date:'2026-08-05',text:'Squats and Incline Press both hit the top of their ranges at 1 RIR — next time add a little weight.',mood:'focused',generated:'2026-08-06T03:32:00.000Z'}}};
      state.settings.seenWeekly=null;state.settings.seenTdee=null;
      state.maxOpen=true;state.maxMsg=null;render();});
    await page.waitForTimeout(200);
    const s=await page.evaluate(()=>({
      rows:[...document.querySelectorAll('.wl-inbox-row')].map(r=>({
        title:(r.querySelector('.wl-inbox-title')||{}).textContent,
        unread:r.classList.contains('unread'),
        prev:(r.querySelector('.wl-inbox-prev')||{}).textContent||''})),
      fullMsgOpen:!!document.querySelector('.wl-ai-summary')}));
    test('the sheet opens as an inbox list, not a message wall',()=>{
      eq(s.fullMsgOpen,false,'a full message rendered in list mode');
      eq(s.rows.length,4,'rows: '+JSON.stringify(s.rows.map(r=>r.title)));});
    test('newest first by generated stamp: recap, metabolism, older recap, weekly',()=>{
      eq(s.rows[0].title,'Daily recap');eq(s.rows[1].title,'Your measured metabolism');
      eq(s.rows[2].title,'Daily recap');eq(s.rows[3].title,'Weekly check-in');});
    test('rows carry previews',()=>ok(/Squats and Incline/.test(s.rows[0].prev),'prev: '+s.rows[0].prev));
    test('opening the SHEET no longer marks anything read',()=>{
      ok(s.rows[0].unread,'latest recap should be unread');
      ok(s.rows[1].unread,'tdee should be unread');});
    test('only the LATEST daily recap can be unread — history stays quiet',()=>
      eq(s.rows[2].unread,false,'old recap flagged New'));
  }

  /* ---- tap → one message opens and becomes read ---- */
  {
    await page.click('.wl-inbox-row');       /* the newest recap */
    await page.waitForTimeout(200);
    const s=await page.evaluate(()=>({
      msg:(document.querySelector('.wl-ai-summary')||{}).textContent||'',
      title:(document.querySelector('.wl-mtitle')||{}).textContent||'',
      back:!!document.querySelector('[data-act="max:back"]'),
      read:JSON.parse(localStorage.getItem('wl_max_read')||'{}')}));
    test('tapping a row opens that ONE message like an email',()=>{
      ok(/Squats and Incline/.test(s.msg),'msg: '+s.msg.slice(0,60));
      ok(/Daily recap/.test(s.title));ok(s.back,'no back button');});
    test('READING marks it read (device-local for recaps)',()=>
      ok(s.read['nightly:2026-08-05'],'read map: '+JSON.stringify(s.read)));
    await page.click('[data-act="max:back"]');
    await page.waitForTimeout(200);
    const t=await page.evaluate(()=>({
      list:document.querySelectorAll('.wl-inbox-row').length,
      firstUnread:document.querySelector('.wl-inbox-row').classList.contains('unread')}));
    test('back returns to the list with the read pill cleared',()=>{
      eq(t.list,4);eq(t.firstUnread,false,'still marked unread after reading');});
  }

  /* ---- weekly/TDEE use their synced seen fields, set on READ ---- */
  {
    await page.evaluate(()=>{
      const rows=[...document.querySelectorAll('.wl-inbox-row')];
      rows.find(r=>/metabolism/.test(r.textContent)).click();});
    await page.waitForTimeout(200);
    const s=await page.evaluate(()=>({seenTdee:state.settings.seenTdee,
      msg:(document.querySelector('.wl-ai-summary')||{}).textContent||''}));
    test('reading the metabolism message sets the synced seenTdee',()=>{
      eq(s.seenTdee,'2026-08-05');ok(/Provisional metabolism/.test(s.msg));});
    await page.click('[data-act="max:back"]');
    await page.waitForTimeout(150);
    await page.evaluate(()=>{
      const rows=[...document.querySelectorAll('.wl-inbox-row')];
      rows.find(r=>/Weekly check-in/.test(r.textContent)).click();});
    await page.waitForTimeout(200);
    const t=await page.evaluate(()=>({seenWeekly:state.settings.seenWeekly}));
    test('reading the weekly sets the synced seenWeekly',()=>eq(t.seenWeekly,'2026-08-03'));
  }

  test('no page errors',()=>eq(errs.length,0,errs.join(';')));

  await ctx.close();await browser.close();server.close();
  console.log(failures.length?`FAILED — ${passed} passed, ${failures.length} failed`:`OK — ${passed} passed`);
  process.exit(failures.length?1:0);
})().catch(e=>{console.error('SUITE ERROR',e);process.exit(2);});
