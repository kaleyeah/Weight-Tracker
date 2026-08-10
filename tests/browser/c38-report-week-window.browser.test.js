/* C38 (browser) — the coach progress report agrees with its own header.

   Two Owner asks, 2026-08-10:
     "I want on the export html the charts showing the same time frame as
      summary" — the lean-mass chart used to span the WHOLE series, so a report
      exported for a past week drew a line through days that week never held.
     "I also want the chart showing how I feel on there" — the Progress tab's
      How-you've-felt grid, pinned to the report's week, not to today's.

   The load-bearing property is containment: every point the report plots and
   every cell it colours falls inside the week named in the header. A report
   handed to a coach that quietly includes later days is worse than a thin one.

       CF_SRC=<file> node tests/browser/c38-report-week-window.browser.test.js */
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
  const ctx=await browser.newContext({viewport:{width:430,height:932}});
  await ctx.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({items:[],token:'tok',record:{id:'userA'}})}));
  await ctx.addInitScript(()=>{
    const iso=d=>{const t=new Date(d);t.setHours(12,0,0,0);
      return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');};
    const today=new Date();today.setHours(12,0,0,0);
    const weights=[],steps={},sleep={},food={},bodyfat={},ratings={};
    const FIVE=['very_poor','poor','okay','good','excellent'];
    const STR=['none','a_little','some','high','very_high'];
    const HUN=['too_low','slightly_low','just_right','slightly_high','too_high'];
    const ENE=['very_low','low','okay','good','excellent'];
    /* 60 days of history so the OLD whole-series chart would have spanned far
       outside any one week, and body fat on every day so a week is never
       accidentally empty of lean-mass readings. */
    for(let k=0;k<60;k++){
      const d=new Date(today);d.setDate(today.getDate()-k);const D=iso(d);
      weights.push({date:D,weight:Math.round((191-k*0.09)*10)/10});
      bodyfat[D]=Math.round((19.4-k*0.02)*10)/10;
      steps[D]=9000;sleep[D]=430;food[D]={calories:2100,protein:175};
      ratings[D]={hunger:HUN[(k*2)%5],sleepQuality:FIVE[(k+1)%5],stress:STR[k%5],
        recovery:FIVE[(k+3)%5],energy:ENE[(k+2)%5],digestion:FIVE[(k+4)%5]};
    }
    localStorage.setItem('wl_pb',JSON.stringify({uid:'userA',base:'https://pb.test',token:'tok',email:'a@x.com'}));
    localStorage.setItem('wl_last_owner','userA');
    localStorage.setItem('wl_v1',JSON.stringify({settings:{onboarded:true,units:'lbs',age:'40',sex:'male',
      name:'Griffin',weekStart:'1',stepsGoal:'10000',sleepGoal:'480',targetCalories:'2200',targetProtein:'175'},
      weights,food,workouts:{},steps,notes:{},sleep,bodyfat,waist:{},leanmass:{},ratings,
      training:{sessions:{},liftSessions:{}},statuses:[],presets:[],skips:{},nightlyLog:{},checkins:{}}));
  });
  const page=await ctx.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  await page.waitForTimeout(900);
  const run=(fn,arg)=>page.evaluate(fn,arg);

  console.log('C38 — report charts share the summary week');

  /* ---- 1. lean-mass chart is windowed, and to the RIGHT week -------------- */
  /* Checked at offset -3 as well as -1: a bug that pinned the window to the
     current week instead of the reported one passes at 0 and fails here. */
  for(const off of [0,-1,-3]){
    const r=await run(o=>{
      const inp=srInput(o);
      const days=weekDays(o).map(d=>toISO(d));
      const L=inp.lbm;
      return {start:days[0],end:days[6],win:L.win,
        seriesFirst:L.series[0].date,seriesLast:L.series[L.series.length-1].date,
        range:inp.range};
    },off);
    test('offset '+off+': chart window IS the report week',()=>{
      eq(r.win.startISO,r.start,'window start');
      eq(r.win.endISO,r.end,'window end');
    });
    test('offset '+off+': every plotted point falls inside that week',()=>{
      ok(r.win.points.length>0,'expected readings in the seeded week');
      r.win.points.forEach(p=>{
        ok(p.date>=r.start&&p.date<=r.end,'point '+p.date+' outside '+r.start+'..'+r.end);
      });
    });
    test('offset '+off+': the full series still extends past the window',()=>{
      /* proves the window is doing work — not that the athlete simply has
         seven days of history */
      ok(r.seriesFirst<r.start,'series should start before the week');
    });
  }

  /* ---- 1b. the weight chart: the app's W chart on the reported week ------- */
  /* "Show last week weight chart of Monday through Sunday. Just like it looks
     on the app. But with M-Sunday range." (Owner, 2026-08-10) */
  for(const off of [0,-1,-3]){
    const w=await run(o=>{
      const inp=srInput(o),days=weekDays(o).map(d=>toISO(d));
      const doc=srReportHTML(inp);
      const chart=(doc.match(/<svg[^>]*aria-label="Weight,[\s\S]*?<\/svg>/)||[''])[0];
      return {W:inp.weightChart,start:days[0],end:days[6],chart:chart,
        weekWeighins:state.weights.filter(x=>x.date>=days[0]&&x.date<=days[6]).length};
    },off);
    test('offset '+off+': weight chart spans exactly the reported week',()=>{
      eq(w.W.startISO,w.start,'start');eq(w.W.endISO,w.end,'end');
      w.W.points.forEach(p=>ok(p.date>=w.start&&p.date<=w.end,'point '+p.date+' outside the week'));
    });
    test('offset '+off+': every weigh-in of that week is plotted, none invented',()=>{
      eq(w.W.points.length,w.weekWeighins,'point count vs weigh-ins');
      ok(w.chart.length>0,'chart missing from the document');
    });
    test('offset '+off+': drawn in the app\'s W dress — blue line, W day labels',()=>{
      ok(/#7C93F5/.test(w.chart),'the app\'s blue (CH.reg) line');
      const dayNums=[];for(let i=0;i<7;i++){const d=new Date(w.start+'T12:00:00');d.setDate(d.getDate()+i);dayNums.push(d.getDate());}
      const labels=[...w.chart.matchAll(/>([A-Z][a-z]{2}) (\d{1,2})</g)].map(m=>Number(m[2]));
      ok(labels.length>0,'expected W-mode day labels');
      labels.forEach(n=>ok(dayNums.indexOf(n)>=0,'axis labels day '+n+' outside the week'));
    });
  }
  const noW=await run(()=>{
    const keep=state.weights;
    const days=weekDays(-1).map(d=>toISO(d));
    state.weights=keep.filter(x=>x.date<days[0]||x.date>days[6]);
    const inp=srInput(-1),doc=srReportHTML(inp);
    state.weights=keep;
    return {pts:inp.weightChart.points.length,inDoc:/aria-label="Weight,/.test(doc)};
  });
  test('a week with no weigh-ins omits the weight chart card',()=>{
    eq(noW.pts,0,'points');ok(!noW.inDoc,'an empty chart card was rendered');
  });

  /* ---- 2. the rendered SVG carries no point outside the week -------------- */
  const svg=await run(()=>{
    const inp=srInput(-1),days=weekDays(-1).map(d=>toISO(d));
    const doc=srReportHTML(inp);
    /* by aria-label, not by splitting on the card title — "Lean body mass"
       also appears INSIDE the label, so a split lands mid-element */
    const chart=(doc.match(/<svg[^>]*aria-label="Lean body mass[\s\S]*?<\/svg>/)||[''])[0];
    return {chart:chart,days:days,label:(chart.match(/aria-label="([^"]*)"/)||[])[1]||'',
      docHasOldAria:/Lean body mass history/.test(doc)};
  });
  test('the exported SVG is labelled with the reported week, not "history"',()=>{
    ok(!svg.docHasOldAria,'the whole-history aria label is gone');
    ok(/Aug|Jan|Feb|Mar|Apr|May|Jun|Jul|Sep|Oct|Nov|Dec/.test(svg.label),'label names dates: '+svg.label);
  });
  test('W-mode day labels name only days in the reported week',()=>{
    const dayNums=svg.days.map(d=>Number(d.slice(8,10)));
    const labels=[...svg.chart.matchAll(/>([A-Z][a-z]{2}) (\d{1,2})</g)].map(m=>Number(m[2]));
    ok(labels.length>0,'expected day labels on the axis');
    labels.forEach(n=>ok(dayNums.indexOf(n)>=0,'axis labels day '+n+' outside the week'));
  });

  /* ---- 3. the how-you-felt grid --------------------------------------- */
  const feel=await run(()=>{
    const inp=srInput(-1);
    const doc=srReportHTML(inp);
    return {feel:inp.feel,inDoc:/How the week felt/.test(doc),
      /* exact class match: "fcells" (the row container) shares the prefix */
      cells:(doc.match(/class="fcell(?: na)?"/g)||[]).length,
      styled:/\.fcell\{/.test(doc)};
  });
  test('the report carries the how-you-felt grid',()=>{
    ok(feel.inDoc,'card missing from the document');
    ok(feel.styled,'grid CSS missing — the cells would render unstyled');
  });
  test('six strands across seven days',()=>{
    eq(feel.feel.rows.length,6,'rating rows');
    feel.feel.rows.forEach(r=>eq(r.cells.length,7,'cells in '+r.label));
    eq(feel.cells,42,'rendered cells');
  });
  test('every scored cell carries a 1-5 score and its colour',()=>{
    feel.feel.rows.forEach(r=>r.cells.forEach(c=>{
      if(c.g==null)return;
      ok(c.g>=1&&c.g<=5,r.label+' scored '+c.g);
      ok(/^#[0-9A-F]{6}$/i.test(c.color),r.label+' colour '+c.color);
    }));
  });

  /* The point of the ask: the grid shows the REPORTED week's answers, not the
     current week's. Recomputed straight from state for each offset, so a grid
     pinned to weekStartFor(0) fails here even though it looks fine at 0. */
  const bound=await run(()=>{
    const bad=[];
    [0,-1,-3].forEach(o=>{
      const days=weekDays(o).map(d=>toISO(d)),t=todayISO();
      srInput(o).feel.rows.forEach(r=>r.cells.forEach((c,i)=>{
        const want=(days[i]<=t)?feelGoodOn(r.key,days[i]):null;
        if(c.g!==want)bad.push(o+' '+r.key+'@'+days[i]+' got '+c.g+' want '+want);
      }));
    });
    return bad;
  });
  test('each cell is that day of the REPORTED week',()=>
    eq(bound.length,0,'mismatches: '+bound.slice(0,4).join('; ')));

  /* a future day is never coloured — the report must not imply the athlete
     answered for a day that has not happened */
  const future=await run(()=>{
    const inp=srInput(0),days=weekDays(0).map(d=>toISO(d)),t=todayISO();
    const bad=[];
    inp.feel.rows.forEach(r=>r.cells.forEach((c,i)=>{
      if(days[i]>t&&c.g!=null)bad.push(r.label+'@'+days[i]);}));
    return {bad:bad,futureDays:days.filter(d=>d>t).length};
  });
  test('no future day is scored',()=>{
    ok(future.futureDays>0||true,'(a week ending today has none to check)');
    eq(future.bad.length,0,'scored future cells: '+future.bad.join(', '));
  });

  /* ---- 4. a week with no ratings at all omits the card, not an empty box -- */
  const none=await run(()=>{
    const keep=state.ratings;state.ratings={};
    const inp=srInput(-1),doc=srReportHTML(inp);
    state.ratings=keep;
    return {feel:inp.feel,inDoc:/How the week felt/.test(doc)};
  });
  test('no ratings in the week: the card is omitted entirely',()=>{
    eq(none.feel,null,'input');
    ok(!none.inDoc,'an empty grid was rendered');
  });

  /* ---- 5. a week with no lean-mass readings draws no chart --------------- */
  const noLbm=await run(()=>{
    const kw=state.weights,kb=state.bodyfat,kl=state.leanmass;
    const days=weekDays(-1).map(d=>toISO(d));
    state.weights=kw.filter(x=>days.indexOf(x.date)<0);
    state.bodyfat={};Object.keys(kb).forEach(k=>{if(days.indexOf(k)<0)state.bodyfat[k]=kb[k];});
    const inp=srInput(-1),doc=srReportHTML(inp);
    const card=(doc.split('Lean body mass')[1]||'').split('</div>\n')[0];
    const out={pts:inp.lbm.win.points.length,hasSvg:/<svg/.test(card),
      says:/No lean-mass readings this week yet/.test(doc)};
    state.weights=kw;state.bodyfat=kb;state.leanmass=kl;
    return out;
  });
  test('an empty week says so instead of plotting other weeks',()=>{
    eq(noLbm.pts,0,'points in the window');
    ok(!noLbm.hasSvg,'a chart was drawn for a week with no readings');
    ok(noLbm.says,'the card should state there were no readings');
  });

  test('no page errors',()=>eq(errs.length,0,errs.join(' | ')));

  console.log('\n'+passed+' passed, '+failures.length+' failed');
  await browser.close();server.close();
  process.exit(failures.length?1:0);
})();
