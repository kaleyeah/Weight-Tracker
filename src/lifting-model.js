/* ============================================================
   LIFTING DATA MODEL FOR THE COACH REPORT
   lrModel() digests state.training.liftSessions + state.weights
   into one plain model per displayed week: sessions with per-set
   reverse-pyramid judging (lrPrescription), PRs via analyzeSession,
   all-time e1RM history, and weekly bodyweight averages. The simple
   coach report below is its only consumer today; the retired
   Ledger / Dashboard / Muscle-Preservation documents read it too
   (removed 2026-07 — git history holds them).
   ============================================================ */
function lrPlanLabel(){return ({lose:"Fat Loss",maintain:"Maintenance",gain:"Lean Bulk"})[strategyMode()]||"Fat Loss";}
function lrTodayLong(){return new Date().toLocaleDateString(undefined,{month:"long",day:"numeric",year:"numeric"});}
function lrUnits(){return state.settings.units||"lbs";}
function lrWho(){return (state.settings.name||"").trim()||"Athlete";}
/* A working set: logged, not skipped, not a warm-up, and it has reps.
   Weight may legitimately be absent (bodyweight work), which costs tonnage
   but still counts as a hard set — the coach cares about the set count. */
function lrIsWork(st){if(!st)return false;
  if(st.status==="skipped"||st.status==="warmup")return false;
  var r=num(st.reps);return r!=null&&r>=1;}
function lrSetTon(st){var w=num(st.weight),r=num(st.reps);return (w!=null&&r!=null)?w*r:0;}
function lrConf(r){if(r==null)return {c:"lo",t:"No data"};
  if(r<=6)return {c:"hi",t:"High"};
  if(r<=10)return {c:"md",t:"Moderate"};
  return {c:"lo",t:"Low"};}
/* position of a logged set inside its prescribed range: 0 = the low (heavy)
   end, 1 = the high (light) end. Clamped, so an out-of-range set still shows
   WHICH side it fell off — that is the information a binary tick throws away. */
function lrRangePos(r,lo,hi){
  if(r==null||lo==null||hi==null||!(hi>lo))return null;
  var t=(r-lo)/(hi-lo);return t<0?0:(t>1?1:t);}
/* What a logged entry should actually be judged against.
   Reverse-pyramid work prescribes a DIFFERENT range per set — heaviest and
   fewest reps first, e.g. 6–8 / 8–10 / 10–12 — so a single repLow–repHigh pair
   cannot describe it, and a 12-rep third set read against 6–8 looks like a
   failure when it is exactly the plan. Resolution order:
     1. the progression + per-set ranges saved with the session (authoritative)
     2. RPT recorded but no per-set ranges saved — derive the default ladder
     3. neither recorded, because the session predates the app storing them —
        read the scheme off the routine AS IT STANDS TODAY
     4. the single repLow–repHigh pair
     5. nothing prescribed
   Anything reconstructed under 2 or 3 comes back assumed:true and is daggered in
   the document; a reconstruction is never passed off as a record.
   A half-open pair (one bound left blank, which the routine editor permits) is
   not a range: it falls to case 5 rather than rendering as "10–" or NaN. */
function lrPrescription(en,n,rt){
  n=Math.max(1,n|0);
  var prog=(en&&en.progression)||null,it=null,inferred=false;
  /* Resolve the routine item ALWAYS, not only when the entry lacks a
     progression. Reverse pyramid already fell back to the item's setRanges,
     but double progression only ever read the entry's own repLow/repHigh — so
     a session logged before the item's range was set, or an exercise swapped in
     ad hoc, printed no range at all on the report while its neighbours printed
     theirs (Owner, 2026-08-03: seated cable row, day 1). */
  if(rt)it=(rt.items||[]).filter(function(x){return x.exerciseId===(en&&en.exerciseId);})[0]||null;
  if(!prog){
    prog=(it&&it.progression)||(rt&&rt.progression)||null;
    if(prog)inferred=true;}
  if(prog==="rpt"){
    var mv=(en&&en.movement)||(it&&it.movement)||"compound";
    var sr=Array.isArray(en&&en.setRanges)?en.setRanges:((it&&Array.isArray(it.setRanges))?it.setRanges:null);
    var def=rptDefRanges(mv,n);
    var rg=rptRangesFor({movement:mv,setRanges:sr},n);
    var full=!!sr;
    for(var i=0;i<n;i++){
      if(!sr||!sr[i]||num(sr[i].lo)==null||num(sr[i].hi)==null)full=false;
      /* an inverted or unusable saved pair is discarded, not rendered */
      if(!(rg[i]&&rg[i].lo!=null&&rg[i].hi!=null&&rg[i].hi>=rg[i].lo)){rg[i]=def[i];full=false;}}
    return {mode:"rpt",ranges:rg,assumed:(inferred||!full)};}
  var lo=num(en&&en.repLow),hi=num(en&&en.repHigh);
  /* the entry's own range wins; the routine item is the fallback, and taking it
     is an inference, so it is flagged assumed rather than passed off as logged */
  if(!(lo!=null&&hi!=null&&hi>=lo)&&it){
    var ilo=num(it.repLow),ihi=num(it.repHigh);
    if(ilo!=null&&ihi!=null&&ihi>=ilo){lo=ilo;hi=ihi;inferred=true;}}
  if(lo!=null&&hi!=null&&hi>=lo){
    var one=[];for(var k=0;k<n;k++)one.push({lo:lo,hi:hi});
    return {mode:"single",ranges:one,assumed:inferred};}
  return {mode:"none",ranges:[],assumed:false};}
function lrWeekStartISO(iso){
  var ws=parseInt(state.settings.weekStart,10)||0;
  var d=parseISO(iso);var diff=(d.getDay()-ws+7)%7;d.setDate(d.getDate()-diff);return toISO(d);}
function lrBwAvg(a,b){var t=0,n=0;
  (state.weights||[]).forEach(function(x){if(!x||!x.date||x.date<a||x.date>b)return;
    var w=num(x.weight);if(w!=null){t+=w;n++;}});
  return n?t/n:null;}
/* ---- one pass over ALL lifting history, keyed by exercise ---- */
function lrHistory(){
  var ls=(state.training||{}).liftSessions||{},map={};
  Object.keys(ls).sort().forEach(function(d){
    (ls[d]||[]).forEach(function(s){
      ((s&&s.entries)||[]).forEach(function(en){
        var k=en.exerciseId||en.name;if(!k)return;
        var m=map[k];
        if(!m)m=map[k]={key:k,name:en.name||"Exercise",muscle:en.muscle||"other",days:{},sets:0,pts:[],bestE:null,bestW:null,first:null,last:null};
        if(en.name)m.name=en.name;
        if(en.muscle)m.muscle=en.muscle;
        var any=false;
        (en.sets||[]).forEach(function(st){
          if(!lrIsWork(st))return;
          any=true;m.sets++;
          var w=num(st.weight),r=num(st.reps);
          if(w==null)return;
          if(m.bestW==null||w>m.bestW.w||(w===m.bestW.w&&r>m.bestW.r))m.bestW={w:w,r:r,date:d};
          var e=e1rm(w,r);
          if(e==null)return;
          m.pts.push({date:d,e:e,w:w,r:r});
          if(m.bestE==null||e>m.bestE.e)m.bestE={e:e,w:w,r:r,date:d};});
        if(any){m.days[d]=1;if(!m.first||d<m.first)m.first=d;if(!m.last||d>m.last)m.last=d;}});});});
  return map;}
/* best e1RM per training WEEK, oldest first — one point per week the lift was
   actually trained, all-time. Capped so a multi-year log still draws a chart. */
function lrWeeklyPts(m,cap){
  var by={};(m.pts||[]).forEach(function(p){
    var w=lrWeekStartISO(p.date);
    if(!by[w]||p.e>by[w].e)by[w]={ws:w,e:p.e,w:p.w,r:p.r,date:p.date};});
  var out=Object.keys(by).sort().map(function(k){return by[k];});
  out.forEach(function(p){p.label=(parseISO(p.ws).getMonth()+1)+"/"+parseISO(p.ws).getDate();});
  if(cap&&out.length>cap)out=out.slice(out.length-cap);
  return out;}
function lrWeeks(offset,n){var out=[];
  for(var k=n-1;k>=0;k--){var s=weekStartFor(offset-k),e=addDays(s,6);
    out.push({start:s,startISO:toISO(s),endISO:toISO(e),label:(s.getMonth()+1)+"/"+s.getDate()});}
  return out;}

/* ---------------- the model both documents render ---------------- */
function lrModel(offset){
  var M={};
  M.offset=offset;
  M.ws=weekStartFor(offset);M.we=addDays(M.ws,6);
  M.startISO=toISO(M.ws);M.endISO=toISO(M.we);
  M.units=lrUnits();M.who=lrWho();M.today=lrTodayLong();M.plan=lrPlanLabel();
  M.weekOf=fmtShort(M.ws);
  M.range=fmtShort(M.ws)+" – "+fmtShort(M.we)+", "+M.we.getFullYear();
  M.hist=lrHistory();
  M.weeks=lrWeeks(offset,8);
  M.winStart=M.weeks[0].startISO;

  /* ---- this week's sessions, in the order they happened ---- */
  var ls=(state.training||{}).liftSessions||{},raw=[];
  for(var i=0;i<7;i++){var iso=toISO(addDays(M.ws,i));
    (ls[iso]||[]).forEach(function(s){if(s)raw.push({iso:iso,s:s});});}
  raw.sort(function(a,b){return a.iso===b.iso?((a.s.ts||0)-(b.s.ts||0)):(a.iso<b.iso?-1:1);});

  M.weekKeys=[];var seenKey={};
  M.prs=[];M.pain=[];M.anyRpt=false;M.anyAssumed=false;
  M.sessions=raw.map(function(rw,si){
    var s=rw.s,d=rw.iso,dt=parseISO(d);
    var an={prs:[]};try{an=analyzeSession(d,s.id)||{prs:[]};}catch(e){an={prs:[]};}
    /* only consulted for sessions logged before the scheme was stored with them */
    var sRt=null;try{sRt=getRoutine(s.routineId)||null;}catch(e3){sRt=null;}
    var prByName={};(an.prs||[]).forEach(function(p){prByName[p.name]=p;});
    var ses={n:si+1,iso:d,
      dateLabel:dt.toLocaleDateString(undefined,{weekday:"short"})+" "+fmtShort(dt),
      name:(s.name||"Workout"),mins:num(s.mins),rpe:num(s.rpe),notes:(s.notes||"").trim(),
      mfb:s.mfb||null,ton:0,sets:0,rirSum:0,rirN:0,inR:0,rngN:0,ex:[]};
    (s.entries||[]).forEach(function(en){
      var all=(en.sets||[]);
      /* keep each working set's ORIGINAL slot index — a skipped opening set must
         not slide the remaining sets onto the wrong reverse-pyramid targets */
      var work=[];all.forEach(function(st,ix){if(lrIsWork(st))work.push({st:st,ix:ix});});
      /* skipped sets stay VISIBLE (Griffin: "skipped needs to say skipped") but never
         count as hard sets, tonnage, PRs or range stats; warm-ups stay hidden */
      var anyRow=all.some(function(st){return st&&st.status!=="warmup";});
      if(!anyRow)return;
      var key=en.exerciseId||en.name;
      if(work.length&&key&&!seenKey[key]){seenKey[key]=1;M.weekKeys.push(key);}
      var px=lrPrescription(en,all.length,sRt);
      var hasR=(px.mode!=="none");
      if(px.mode==="rpt")M.anyRpt=true;
      if(px.assumed)M.anyAssumed=true;
      var lo=hasR?px.ranges[0].lo:null,hi=hasR?px.ranges[0].hi:null;
      var ton=0,inR=0,workN=0,bestW=null,bestWi=-1,bestE=null,bestEi=-1;
      var rows=[];
      all.forEach(function(st,ix){
        if(!st||st.status==="warmup")return;
        var g=hasR?(px.ranges[ix]||px.ranges[px.ranges.length-1]):null;
        if(!lrIsWork(st)){
          rows.push({i:rows.length+1,skipped:true,w:null,r:null,rir:null,
            lo:(g?g.lo:null),hi:(g?g.hi:null),t:null,out:false,pr:null});
          return;}
        var k=rows.length;workN++;
        var w=num(st.weight),r=num(st.reps),rir=num(st.rir);
        ton+=lrSetTon(st);
        var out=false;
        if(g){if(r>=g.lo&&r<=g.hi)inR++;else out=true;}
        if(w!=null){
          if(bestW==null||w>bestW){bestW=w;bestWi=k;}
          var e=e1rm(w,r);
          if(e!=null&&(bestE==null||e>bestE)){bestE=e;bestEi=k;}}
        if(rir!=null){ses.rirSum+=rir;ses.rirN++;}
        rows.push({i:k+1,w:w,r:r,rir:rir,lo:(g?g.lo:null),hi:(g?g.hi:null),
          t:(g?lrRangePos(r,g.lo,g.hi):null),out:out,pr:null});});
      var pr=(workN?prByName[en.name]:null)||null;
      if(pr){
        var pi=(pr.type==="weight")?bestWi:bestEi;
        if(pi>=0&&rows[pi])rows[pi].pr=(pr.type==="weight")?"PR":"e1RM PR";
        var pb={maxWeight:null,maxE1rm:null};
        try{pb=exPriorBest(en.exerciseId,d,s.ts||0)||pb;}catch(e2){}
        M.prs.push({ex:en.name||"Exercise",type:pr.type,date:d,dateLabel:ses.dateLabel,
          w:pr.w,r:pr.r,e:bestE,prevW:pb.maxWeight,prevE:pb.maxE1rm});}
      var jt=(en.fb&&en.fb.joint)||null;
      var jLabel=(jt==="mod"||jt==="alot")?fbLabel(FB_JOINT,jt):null;
      var ee={name:en.name||"Exercise",muscle:en.muscle||"other",
        mLabel:muscleInfo(en.muscle||"other").label,
        lo:lo,hi:hi,hasR:hasR,rxMode:px.mode,ranges:px.ranges,assumed:px.assumed,
        ton:ton,inR:inR,n:workN,rows:rows,joint:jLabel};
      if(jLabel)M.pain.push({ex:ee.name,label:jLabel,dateLabel:ses.dateLabel,sets:workN});
      ses.ton+=ton;ses.sets+=workN;
      if(hasR){ses.inR+=inR;ses.rngN+=workN;}
      ses.ex.push(ee);});
    ses.avgRir=ses.rirN?(ses.rirSum/ses.rirN):null;
    return ses;}).filter(function(ses){return ses.ex.length>0;});
  /* a session whose every set was skipped drops out above, so renumber after the
     filter — otherwise the printed sequence reads 1, 3 with no explanation */
  M.sessions.forEach(function(ses,ix){ses.n=ix+1;});

  /* ---- week rollups ---- */
  M.ton=0;M.setCount=0;M.mins=0;M.rirSum=0;M.rirN=0;M.failSets=0;M.inR=0;M.rngN=0;
  M.rirBuckets={};M.muscle={};
  M.sessions.forEach(function(ses){
    M.ton+=ses.ton;M.setCount+=ses.sets;M.inR+=ses.inR;M.rngN+=ses.rngN;
    if(ses.mins!=null)M.mins+=ses.mins;
    M.rirSum+=ses.rirSum;M.rirN+=ses.rirN;
    ses.ex.forEach(function(e){
      M.muscle[e.muscle]=(M.muscle[e.muscle]||0)+e.n;
      e.rows.forEach(function(r){
        if(r.rir==null)return;
        M.rirBuckets[r.rir]=(M.rirBuckets[r.rir]||0)+1;
        if(r.rir===0)M.failSets++;});});});
  M.avgRir=M.rirN?(M.rirSum/M.rirN):null;
  M.muscleRows=Object.keys(M.muscle).map(function(k){
    return {key:k,label:muscleInfo(k).label,n:M.muscle[k]};})
    .sort(function(a,b){return (b.n-a.n)||(a.label<b.label?-1:1);});
  M.rpeList=M.sessions.map(function(s){return s.rpe;}).filter(function(x){return x!=null;});

  /* ---- bodyweight ---- */
  M.bwAvg=lrBwAvg(M.startISO,M.endISO);
  var pw=weekStartFor(offset-1);
  M.bwPrev=lrBwAvg(toISO(pw),toISO(addDays(pw,6)));
  M.bwChg=(M.bwAvg!=null&&M.bwPrev!=null)?(M.bwAvg-M.bwPrev):null;
  M.bwStart=num(state.settings.startingWeight);
  M.bwGoal=num(state.settings.goalWeight);

  /* ---- "MAIN LIFTS": data-driven, no hardcoded list ----
     A main lift is one trained on >=3 DISTINCT DAYS inside the 8-week window
     ending with the reported week — i.e. a staple of the programme, not a
     one-off. Ranked by training days, then total working sets, then e1RM.
     Main lifts NOT trained this week are shown with an explicit
     "not trained in N wks" state rather than silently disappearing. */
  var rank=[];
  for(var k in M.hist){var m=M.hist[k],days=0;
    for(var dd in m.days){if(dd>=M.winStart&&dd<=M.endISO)days++;}
    if(days>0)rank.push({m:m,days:days});}
  rank.sort(function(a,b){return (b.days-a.days)||(b.m.sets-a.m.sets)||
    (((b.m.bestE&&b.m.bestE.e)||0)-((a.m.bestE&&a.m.bestE.e)||0));});
  M.rank=rank;
  M.mainLifts=rank.filter(function(x){return x.days>=3;});
  M.mainUntrained=M.mainLifts.filter(function(x){return seenKey[x.m.key]!==1;}).slice(0,4);

  /* ---- the headline lift for the strength-vs-bodyweight chart ----
     the most-trained lift of the reported week (ties: more sets, then heavier
     e1RM); if nothing was trained, the most-trained lift of the window. */
  var trained=rank.filter(function(x){return seenKey[x.m.key]===1;});
  M.hero=(trained[0]||rank[0]||null);
  M.heroPts=[];M.rel=null;
  if(M.hero){
    var hm=M.hero.m;
    M.weeks.forEach(function(wk){
      var best=null;
      (hm.pts||[]).forEach(function(p){
        if(p.date>=wk.startISO&&p.date<=wk.endISO&&(best==null||p.e>best))best=p.e;});
      if(best!=null)M.heroPts.push({label:wk.label,e:best,bw:lrBwAvg(wk.startISO,wk.endISO)});});
    var withBw=M.heroPts.filter(function(p){return p.bw!=null&&p.bw>0;});
    if(withBw.length>1){
      var f=withBw[0],l=withBw[withBw.length-1];
      M.rel={from:f.e/f.bw,to:l.e/l.bw,eFrom:f.e,eTo:l.e,bwFrom:f.bw,bwTo:l.bw,
        eChg:l.e-f.e,ePct:(f.e>0?((l.e-f.e)/f.e*100):null),bwChg:l.bw-f.bw,n:withBw.length};}}

  /* ---- e1RM standings + all-time progression charts ---- */
  function standing(m,trainedThisWeek,weeksSince){
    var be=m.bestE;
    var cf=lrConf(be?be.r:null);
    return {name:m.name,muscle:m.muscle,mLabel:muscleInfo(m.muscle).label,
      e:(be?be.e:null),basisR:(be?be.r:null),basisW:(be?be.w:null),
      bestDate:(be?be.date:null),last:m.last,conf:cf,
      trained:trainedThisWeek,weeksSince:weeksSince,
      pts:lrWeeklyPts(m,30)};}
  M.stand=[];M.progItems=[];
  M.weekKeys.forEach(function(k){var m=M.hist[k];if(!m)return;
    var st=standing(m,true,0);M.stand.push(st);M.progItems.push(st);});
  M.mainUntrained.forEach(function(x){
    var m=x.m,wsn=null;
    if(m.last){var diff=M.ws.getTime()-parseISO(lrWeekStartISO(m.last)).getTime();
      wsn=Math.max(0,Math.round(diff/604800000));}
    var st=standing(m,false,wsn);M.stand.push(st);M.progItems.push(st);});
  /* everything else that has ever been logged still belongs in the e1RM table */
  var inTable={};M.stand.forEach(function(s){inTable[s.name]=1;});
  Object.keys(M.hist).forEach(function(k){
    var m=M.hist[k];if(inTable[m.name])return;inTable[m.name]=1;
    var wsn=null;
    if(m.last){var d2=M.ws.getTime()-parseISO(lrWeekStartISO(m.last)).getTime();
      wsn=Math.max(0,Math.round(d2/604800000));}
    M.stand.push(standing(m,false,wsn));});
  M.stand.sort(function(a,b){return (b.e||0)-(a.e||0);});
  return M;}




/* is the week-over-week bodyweight move the direction the plan wants? */
function lrBwGood(M){
  if(M.bwChg==null)return false;
  var sm=strategyMode();
  if(sm==="maintain")return Math.abs(M.bwChg)<0.5;
  return (sm==="gain")?(M.bwChg>0):(M.bwChg<0);}



/* ============================================================
   COACH REPORT v2 — "a scrolling capture of the Summary page"
   (2026-07, replaces the tile report). The export reads like the
   app itself: progress photos up top, then the Summary tab's own
   cards — weekly-average hero, check-in chips, weekly totals,
   macros incl. fiber, averages with goal coloring, activity,
   daily totals — then one card per lifting session with the
   workout screen's own visual language: RPT/PO progression chips
   and the per-set target icons (trend-up above range, bullseye
   in range, trend-down below), exactly as setTargetIcon draws
   them. The honest math still runs underneath (lrModel, per-set
   reverse-pyramid targets via lrPrescription, analyzeSession PR
   detection); nothing is fabricated — an unlogged input prints
   an em dash, never a substitute.
   Everything between SR-VIEW-START and SR-VIEW-END is pure: no
   DOM, no `state`, no Date.now(). tools/mp-formulas.test.mjs
   extracts it verbatim and renders it under node — the tested
   characters are the shipped characters. srInput() below is the
   impure part: it snapshots `state` (numbers computed with the
   SAME helpers view_summary uses, so the report always matches
   the Summary tab) into the plain object the renderer eats.
   Photos arrive pre-shrunk from the srPhotoPrefetch cache — the
   renderer never touches IndexedDB.
   ============================================================ */