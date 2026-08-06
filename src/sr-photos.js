
/* the ONLY impure part: snapshot state into the renderer's input. The summary
   numbers are computed with the SAME helpers and the SAME rules view_summary
   uses (weekDays/dayRow, weekTrainingStats, dayMissing, fnum/minToHM, gcol/acol,
   the Weekly Macros pro-rating), so the report always matches the Summary tab
   for the displayed week. Workouts come from lrModel: per-set reverse-pyramid
   targets via lrPrescription, PRs via analyzeSession, tonnage per session. */
function srInput(offset){
  var M=lrModel(offset);
  var days=weekDays(offset).map(dayRow);
  var s=weekStartFor(offset);
  var u=state.settings.units;
  var _tI=todayISO();
  var mkeys=["steps","calories","protein","fat","carbs"];var tot={},cnt={};
  mkeys.forEach(function(k){tot[k]=0;cnt[k]=0;days.forEach(function(r){if(r[k]!=null){tot[k]+=r[k];cnt[k]++;}});});
  function avg(k){return cnt[k]?tot[k]/cnt[k]:null;}
  var wv=days.filter(function(r){return r.weight!=null;}).map(function(r){return r.weight;});
  var slv=days.map(function(r){return num(state.sleep[r.date]);}).filter(function(x){return x!=null;});
  var slAvg=slv.length?Math.round(slv.reduce(function(a,b){return a+b;},0)/slv.length):null;
  var ts=weekTrainingStats(s);
  var tCal=num(state.settings.targetCalories),tStep=num(state.settings.stepsGoal),tProt=num(state.settings.targetProtein),tFat=num(state.settings.targetFat),tCarb=num(state.settings.targetCarbs),tSleep=sleepGoalMin();
  /* hero: same previous-week direction rule as the Summary card, offset-1 */
  var _prevWv=weekDays(offset-1).map(dayRow).filter(function(r){return r.weight!=null;}).map(function(r){return r.weight;});
  var _thisAvg=wv.length?wv.reduce(function(a,b){return a+b;},0)/wv.length:null;
  var _lastAvg=_prevWv.length?_prevWv.reduce(function(a,b){return a+b;},0)/_prevWv.length:null;
  var _wChg=(_thisAvg!=null&&_lastAvg!=null)?_thisAvg-_lastAvg:null;
  var hero=null;
  if(_thisAvg!=null){var _mThr=(u==="kg"?0.1:0.2);
    hero={avg:_thisAvg,prev:_lastAvg,chg:_wChg,
      dir:(_wChg==null?null:(Math.abs(_wChg)<_mThr?"maintained":(_wChg<0?"lost":"gained")))};}
  var chips=days.map(function(r){var dISO=r.date;var dow=parseISO(dISO).toLocaleDateString(undefined,{weekday:"short"});
    if(dISO>_tI)return {dow:dow,cls:"fut"};
    var missN=dayMissing(dISO).length;
    return {dow:dow,cls:(missN===0?"ok":(dISO===_tI?"prog":(missN<4?"part":"miss")))};});
  var totals=[
    {label:"Calories",v:tot.calories||null},{label:"Steps",v:tot.steps||null},{label:"Weigh-ins",v:wv.length},
    {label:"Cardio min (Zone 2+)",v:ts.cardioZ2Mins||null},{label:"Lifting min",v:ts.liftMins||null},{label:"Cardio sessions (Zone 2+)",v:ts.cardioZ2Sessions||null}];
  /* Weekly Macros: totals vs a goal pro-rated to the days elapsed in the
     displayed week — the same window rule as the app card; fiber rides along
     with no goal, so it prints its total without a bar */
  var _elapsedDays=days.filter(function(r){return r.date<=_tI;});
  var _elapsed=_elapsedDays.length;
  function _macTot(k){var t=0;_elapsedDays.forEach(function(r){if(r[k]!=null)t+=r[k];});return t;}
  var macRows=[];
  [["Calories","calories",tCal,""],["Protein","protein",tProt,"g"],["Carbs","carbs",tCarb,"g"],["Fat","fat",tFat,"g"],["Fiber","fiber",null,"g"]].forEach(function(m){
    var v=Math.round(_macTot(m[1])||0),daily=m[2];
    if(daily!=null&&_elapsed>0){var goal=Math.round(daily*_elapsed);
      macRows.push({label:m[0],val:v,goal:goal,unit:m[3],pct:(goal>0?Math.min(100,Math.round(v/goal*100)):0),done:(goal>0&&v>=goal)});}
    else macRows.push({label:m[0],val:v,goal:null,unit:m[3],pct:0,done:false});});
  var avgCal=avg("calories"),avgStep=avg("steps"),avgProt=avg("protein"),avgFat=avg("fat"),avgCarb=avg("carbs");
  var calOverGoal=(tCal!=null&&avgCal!=null&&avgCal>tCal);
  var averages=[
    {label:"Calories",disp:fnum(avgCal),sub:(tCal!=null?"goal "+fnum(tCal):""),cls:gcol(avgCal,tCal,true,100)},
    {label:"Steps",disp:fnum(avgStep),sub:(tStep!=null?"goal "+fnum(tStep):""),cls:gcol(avgStep,tStep,false,0)},
    {label:"Sleep",disp:(slAvg!=null?minToHM(slAvg):"—"),sub:(tSleep!=null?"goal "+minToHM(tSleep):""),cls:gcol(slAvg,tSleep,false,30)},
    {label:"Protein",disp:(avgProt!=null?fnum(avgProt)+"g":"—"),sub:(tProt!=null?"goal "+tProt+"g":""),cls:gcol(avgProt,tProt,false,10)},
    {label:"Fat",disp:(avgFat!=null?fnum(avgFat)+"g":"—"),sub:(tFat!=null?"goal "+tFat+"g":""),cls:acol(tFat!=null&&avgFat!=null,avgFat>tFat&&calOverGoal)},
    {label:"Carbs",disp:(avgCarb!=null?fnum(avgCarb)+"g":"—"),sub:(tCarb!=null?"goal "+tCarb+"g":""),cls:acol(tCarb!=null&&avgCarb!=null,avgCarb>tCarb&&calOverGoal)}];
  var cardioN=ts.cardioSessions||0,liftN=ts.liftSessions||0,recN=0;
  for(var _wi=0;_wi<7;_wi++){normActs(toISO(addDays(s,_wi))).forEach(function(a){if(a.cat==="rest")recN++;});}
  var activity=[{label:"Cardio",n:cardioN,color:"#3b82f6"},{label:"Weight Training",n:liftN,color:"#22c55e"},{label:"Recovery",n:recN,color:"#6b7280"}];
  var dailyRows=days.map(function(r){var sl=num(state.sleep[r.date]);var cal=r.calories,pp=r.protein,ff=r.fat,cc=r.carbs,st=r.steps,wt=r.weight;var calOverD=(tCal!=null&&cal!=null&&cal>tCal);
    function c(v,fm,cls){return v==null?{d:null,cls:""}:{d:fm(v),cls:(cls||"")};}
    return {dow:r.dow.slice(0,3),cells:[
      c(sl,function(v){return minToHM(v);},gcol(sl,tSleep,false,30)),
      c(wt,function(v){return String(r1(v));},""),
      c(st,function(v){return Math.round(v).toLocaleString();},gcol(st,tStep,false,0)),
      c(cal,function(v){return Math.round(v).toLocaleString();},gcol(cal,tCal,true,100)),
      c(pp,function(v){return String(v);},gcol(pp,tProt,false,10)),
      c(ff,function(v){return String(v);},(tFat!=null&&ff!=null)?((ff>tFat&&calOverD)?"bad":"good"):""),
      c(cc,function(v){return String(v);},(tCarb!=null&&cc!=null)?((cc>tCarb&&calOverD)?"bad":"good"):"")]};});
  var sessions=M.sessions.map(function(sn){return {name:sn.name,dateLabel:sn.dateLabel,mins:sn.mins,rpe:sn.rpe,ton:sn.ton,note:sn.notes,
    ex:sn.ex.map(function(e){return {name:e.name,mode:e.rxMode,assumed:e.assumed,ranges:e.ranges||[],
      sets:e.rows.map(function(r){return {n:r.i,skipped:!!r.skipped,w:r.w,r:r.r,rir:r.rir,lo:r.lo,hi:r.hi,pr:r.pr};})};})};});
  return {
    who:M.who,plan:M.plan,units:M.units,
    weekTitle:"Week of "+M.ws.toLocaleDateString(undefined,{month:"long",day:"numeric"}),
    range:M.range,today:M.today,exported:fmtShort(new Date()),
    photos:srPhotoInput(offset),
    hero:hero,chips:chips,totals:totals,
    macros:{note:((_elapsed>0&&_elapsed<7)?(_elapsed+" of 7 days so far"):"7 of 7 days"),rows:macRows},
    averages:averages,activity:activity,
    daily:{label:fmtShort(M.ws)+" – "+fmtShort(M.we),rows:dailyRows},
    bodycomp:srBodyCompInput(offset),
    lbm:srLbmInput(offset),
    cardio:srCardioInput(offset),
    sessions:sessions,assumed:!!M.anyAssumed};}
/* Latest body-composition readings for the week, with the move since the
   previous reading. Falls back to the most recent reading ever, flagged stale,
   so a coach still sees where the athlete stands. */
/* Lean-mass series under the SAME canonical rule as the trend chart: a
   stored (scale) reading wins its date; otherwise weight×(1−bf%) from the
   same-day pair, marked derived. (Owner, 2026-08-06: weekly average, the
   week-over-week move, and the full history belong on the progress report —
   "is it body fat I'm losing or muscle mass".) */
function srLbmSeries(){
  var wObs=(state.weights||[]).map(function(x){return {date:x.date,value:num(x.weight)};})
    .filter(function(x){return x.value!=null;});
  return tcLbmObs(wObs,t2MapObs(state.bodyfat),t2MapObs(state.leanmass));}
function srLbmInput(offset){
  var series=srLbmSeries();
  if(!series.length)return null;
  var wk=function(off){var ds=weekDays(off).map(function(d){return toISO(d);});
    var pts=series.filter(function(o){return ds.indexOf(o.date)>=0;});
    var sum=0;pts.forEach(function(o){sum+=o.value;});
    return {n:pts.length,derived:pts.filter(function(o){return o.derived;}).length,
      avg:pts.length?sum/pts.length:null};};
  var cur=wk(offset),prev=wk(offset-1);
  return {series:series,cur:cur,prev:prev,
    chg:(cur.avg!=null&&prev.avg!=null)?Math.round((cur.avg-prev.avg)*10)/10:null};}
function srBodyCompInput(offset){
  var days=weekDays(offset).map(function(d){return toISO(d);});
  var startISO=days[0],u=state.settings.units;
  /* weight leads (Owner, 2026-08-03), and follows the same rule as the rest:
     latest reading in the week against the latest reading before it, which for
     a daily-logged metric is exactly "compared to previous week" */
  var wmap={};(state.weights||[]).forEach(function(x){if(num(x.weight)!=null)wmap[x.date]=x.weight;});
  var gainUp=((state.settings.strategy||"lose")==="gain");
  var defs=[["__weight","Weight",u,gainUp],["bodyfat","Body fat","%",false],
            ["leanmass","Lean mass",u,true],["waist","Waist",(u==="kg"?"cm":"in"),false]];
  var out=[],any=false;
  defs.forEach(function(d){
    var map=(d[0]==="__weight")?wmap:(state[d[0]]||{});
    var keys=Object.keys(map).filter(function(k){return num(map[k])!=null;}).sort();
    if(!keys.length){out.push({key:d[1],unit:d[2],val:null});return;}
    var inWk=null;
    keys.forEach(function(k){if(days.indexOf(k)>=0)inWk=k;});
    var prior=null;
    keys.forEach(function(k){if(k<startISO)prior=k;});
    var useK=inWk||keys[keys.length-1];
    var chg=(inWk&&prior)?(num(map[inWk])-num(map[prior])):null;
    any=true;
    out.push({key:d[1],unit:d[2],goodUp:d[3],val:num(map[useK]),
      dateLabel:fmtShort(parseISO(useK)),stale:!inWk,
      chg:(chg!=null?Math.round(chg*10)/10:null)});});
  return any?out:[];}
/* every cardio session in the week, in day order, regardless of zone */
function srCardioInput(offset){
  var out=[];
  weekDays(offset).forEach(function(d){
    var iso=toISO(d);
    var list=(((state.training||{}).sessions||{})[iso]||[]).filter(function(x){return x&&x.kind==="cardio";});
    list.forEach(function(c){
      out.push({dayLabel:DAYS3[d.getDay()],date:iso,
        type:(c.type||"Cardio"),zone:num(c.zone),mins:num(c.mins),
        cal:num(c.cal),hr:num(c.hr),note:(c.notes||"").trim()});});});
  return out;}
/* ---- progress photos for the report: prefetch, cache, never block the tap ----
   iOS requires transient user activation for navigator.share — awaiting slow
   async work (IndexedDB reads + canvas re-encoding) between the tap and share()
   voids it and the share sheet silently never opens. So the export tap NEVER
   touches storage: while the user is looking at Summary, srPhotoPrefetch()
   builds the displayed week's photos as small data URIs (canvas, ≤430px wide,
   JPEG q0.8) into state._srPhotoCache (a plain in-memory field — payload()
   whitelists what persists, so the cache never reaches localStorage or sync).
   Invalidation: every photo write (idbAdd / idbDelete / idbClearAll) calls
   srPhotoInvalidate(), and a week change misses the cache key, which re-runs
   the prefetch on the next Summary render. A generation counter makes an
   in-flight prefetch that raced a photo write throw its result away. */
function srShrinkPhoto(blob){return new Promise(function(res){
  try{var url=URL.createObjectURL(blob);var img=new Image();
    img.onload=function(){try{
      var w=Math.min(430,img.width||430);
      var hgt=Math.max(1,Math.round((img.height||1)*w/(img.width||1)));
      var cv=document.createElement("canvas");cv.width=w;cv.height=hgt;
      cv.getContext("2d").drawImage(img,0,0,w,hgt);
      var du=cv.toDataURL("image/jpeg",0.8);
      URL.revokeObjectURL(url);res(du);
    }catch(e){URL.revokeObjectURL(url);res(null);}};
    img.onerror=function(){URL.revokeObjectURL(url);res(null);};
    img.src=url;
  }catch(e){res(null);}});}
var _srPhotoJob=null,_srPhotoGen=0;
function srPhotoInvalidate(){_srPhotoGen++;_srPhotoJob=null;state._srPhotoCache=null;}
function srPhotoPrefetch(){
  var off=state.weekOffset||0;
  var wkISO=toISO(weekStartFor(off));
  /* A week's progress photos are taken at the check-in that CLOSES it, so they
     are filed under the FOLLOWING week's key. Reporting on Jul 27–Aug 2 must
     show the set captured on Aug 3 — those are the ones that show the result of
     that week (Owner, 2026-08-03). Fall back to the week's own key when the
     closing check-in has not happened yet, e.g. the in-progress week. */
  var closeISO=toISO(weekStartFor(off+1));
  var c=state._srPhotoCache;
  if(c&&c.week===wkISO)return;
  if(_srPhotoJob===wkISO)return;
  if(typeof indexedDB==="undefined"){state._srPhotoCache={week:wkISO,photos:[]};return;}
  _srPhotoJob=wkISO;var gen=_srPhotoGen;
  idbAll().then(function(all){
    var atClose=all.filter(function(p){return p.kind==="progress"&&(p.week||p.date)===closeISO;});
    var progs=atClose.length?atClose:all.filter(function(p){return p.kind==="progress"&&(p.week||p.date)===wkISO;});
    return Promise.all(POSES.map(function(ps){
      var found=progs.filter(function(p){return p.pose===ps[0];})[0]||null;
      if(!found)return Promise.resolve(null);
      return srShrinkPhoto(found.blob).then(function(du){
        return du?{pose:ps[0],dataUri:du,date:(found.ts?toISO(new Date(found.ts)):wkISO)}:null;});
    }));
  }).then(function(list){
    if(gen!==_srPhotoGen||_srPhotoJob!==wkISO)return;
    _srPhotoJob=null;
    state._srPhotoCache={week:wkISO,photos:list.filter(function(x){return !!x;})};
  }).catch(function(){
    if(gen!==_srPhotoGen||_srPhotoJob!==wkISO)return;
    _srPhotoJob=null;state._srPhotoCache={week:wkISO,photos:[]};});}
/* the report's photo card input, read SYNCHRONOUSLY from the cache. A missing
   or stale cache exports placeholder slots with an honest caption rather than
   breaking the share. */
function srPhotoInput(offset){
  var wkISO=toISO(weekStartFor(offset));
  var c=state._srPhotoCache;
  var slots=POSES.map(function(ps){return {pose:ps[1],dataUri:null};});
  if(!c||c.week!==wkISO)
    return {count:null,slots:slots,empty:true,caption:"photos not loaded — reopen Summary and try again"};
  var have=0,latest=null;
  slots=POSES.map(function(ps){
    var p=(c.photos||[]).filter(function(x){return x.pose===ps[0]&&x.dataUri;})[0]||null;
    if(p){have++;if(latest==null||(p.date||"")>latest)latest=p.date||null;}
    return {pose:ps[1],dataUri:(p?p.dataUri:null)};});
  if(!have)return {count:null,slots:slots,empty:true,
    caption:"No photos this week — they’ll appear here when added on the Progress tab."};
  var cap=[],count=null,d=latest?parseISO(latest):null;
  if(d){count=d.toLocaleDateString(undefined,{weekday:"short"})+" "+fmtShort(d);
    cap.push("Taken "+d.toLocaleDateString(undefined,{weekday:"long"})+" "+fmtShort(d));
    var w=null;for(var i=0;i<state.weights.length;i++){if(state.weights[i].date===latest){w=num(state.weights[i].weight);break;}}
    if(w!=null)cap.push(r1(w)+" "+state.settings.units);}
  var missing=POSES.filter(function(ps){
    return !(c.photos||[]).some(function(x){return x.pose===ps[0]&&x.dataUri;});
  }).map(function(ps){return ps[1].toLowerCase();});
  if(missing.length)cap.push(missing.join(", ")+" not taken this week");
  return {count:count,slots:slots,empty:false,caption:cap.join(" · ")};}
/* one tap: build the displayed week's report and hand it straight to the share sheet */
function srExport(){
  /* Coach export = the report AND the week's CSV in one share sheet — the CSV's
     Cardio / Weight Training / Activity Notes columns exist for the coach too.
     Everything here is synchronous on purpose (see the prefetch note above). */
  var files;
  try{
    var off=state.weekOffset||0;var base=toISO(weekStartFor(off));
    files=[{name:"progress-report-"+base+".html",
      mime:"text/html;charset=utf-8",text:srReportHTML(srInput(off))},
      {name:"weight-summary-"+base+".csv",
      mime:"text/csv",text:csvFor(weekDays(off).map(dayRow),"Weekly")}];
  }catch(e){toast("Couldn’t build the report");return;}
  shareOrDownloadMulti(files);}

/* ============================================================
   MUSCLE PRESERVATION ENGINE  —  calculation module only
   ------------------------------------------------------------
   The deterministic engine behind a GLP-1 fat-loss phase review.
   Its standalone document view was retired with the simple coach
   report (2026-07, git history holds it); the engine stays because
   the phase-machine / coach-evaluator work builds on it and
   tools/mp-formulas.test.mjs keeps it proven.
   Governing rule, applied without exception: NEVER fabricate,
   substitute, redistribute or infer a missing input. A component
   that is not eligible renders its STATE (available / provisional /
   missing / not_applicable) and its blockers. Composites and
   verdicts are withheld rather than guessed.

   Everything between MP-CALC-START and MP-CALC-END is pure: no DOM,
   no `state`, no Date.now(), no locale formatting. It is extracted
   verbatim by tools/mp-formulas.test.mjs and run under node, which
   is why it carries its own tiny helpers instead of borrowing the
   app's — the tested code and the shipped code are then the same
   characters, not a copy that can drift.
   ============================================================ */