function tdeeCalPerUnit(){return state.settings.units==="kg"?7700:3500;}
/* Measured TDEE window (rewritten 2026-08-05).
   WHAT WAS WRONG. The old version framed a fixed 21-day calendar window and
   took a 7-DAY BAND at each end as the "before" and "after" clusters. Two
   consequences, both arbitrary rather than principled — the 21 and the bands
   were written in one unexplained commit (13ea026, 2026-07-19) with no
   recorded rationale anywhere:
     1. someone who started weighing in partway through the window had their
        earliest weigh-ins fall outside the leading band, so they read as
        "not enough data" while holding an unbroken daily streak;
     2. worse, on any stretch shorter than ~24 days the two 7-day bands nearly
        meet in the middle, so their CENTRES land under 10 days apart and the
        function failed its own >=10-day guard using data that easily
        satisfied it. Measured on real data: 16 weigh-ins over 16 days gave a
        9.0-day gap with 7-day bands, and 13.0 with 3-weigh-in clusters. Same
        data, same window; only the cluster width differed.
   WHAT THIS DOES NOW. Anchor the window to the data that exists (first
   weigh-in -> today, capped at MAXW so an old streak cannot drag ancient
   weights in), and take a FIXED SMALL CLUSTER at each end. The >=10-day
   separation guard is UNCHANGED and still load-bearing: it is what stops
   day-to-day water noise being read as fat loss, and it is the one rule here
   that was doing real work.
   Robustness check on real data — 2v2 gave 2.47 lb/wk, 3v3 2.46, 5v5 2.47.
   The estimate is insensitive to cluster size; only the 7-day band broke it. */
/* Measured TDEE window — now a THIN ADAPTER over TDEECore (src/tdee-core.js).
   The maths, tiers and audit output live in that module, which is spec-built
   and covered by 27 acceptance tests; this function only translates app state
   into the module's input shape and its result into the fields this card
   already consumes.

   Owner rulings encoded here, 2026-08-05:
   - a LOGGED calorie day counts as complete ("only as honest as the input");
     an explicitly skipped day and an absent day are both NOT complete;
   - vacation/sick days stay VISIBLE as gaps and are flagged as context —
     they are no longer silently dropped from the average, which is what used
     to hide a coverage problem rather than report it.
   TDEE V2 spec §1 (Owner, 2026-08-13): the CURRENT day is complete only once
   it is FINALIZED — the same dayRecap() principle the Summary averages
   already use (Owner rule 2026-08-02). A half-logged today read as a full
   day and dragged the average (and the TDEE) down every afternoon; it now
   stays visible in the diary and simply does not enter the calculation
   until the day is completed or has passed. Historical days are untouched:
   a genuinely low past day still counts — completeness is never inferred
   from the calorie VALUE. */
function tdeeWindow(){
  var calorieDays={},d,_td=todayISO();
  /* finalization must FAIL CLOSED: if dayRecap throws (coach cache broken,
     malformed report), today reads as not-finalized and stays out of the
     average — the safe direction. It must never take the card down. */
  var _fin=function(iso){try{return !!dayRecap(iso);}catch(_){return false;}};
  for(d in state.food){if(!Object.prototype.hasOwnProperty.call(state.food,d))continue;
    var c=num((state.food[d]||{}).calories);
    if(c!=null&&!isSkip(d,"calories")&&(d!==_td||_fin(d)))calorieDays[d]={calories:c,complete:true};}
  var offPlan=[];
  (state.statuses||[]).forEach(function(st){if(!st||!st.start)return;
    var cur=st.start,end=st.end||st.start,guard=0;
    while(cur<=end&&guard++<400){offPlan.push(cur);cur=toISO(addDays(parseISO(cur),1));}});
  var res=TDEECore.calculate({
    todayLocalDate:todayISO(),
    units:state.settings.units==="kg"?"kg":"lb",
    weights:(state.weights||[]).map(function(x){return {date:x.date,weight:num(x.weight)};}),
    calorieDays:calorieDays, offPlanDates:offPlan,
    formulaTdee:maintenanceCals()
  });
  /* shape the existing card already reads, plus the full result for the
     coverage lines and status chip */
  return {foodN:res.completeCalorieDays,foodAvg:res.averageDailyCalories,
          totalW:res.acceptedWeightDays,ok:res.status!=="insufficient",
          effDays:null,headN:null,tailN:null,core:res};}
/* Delegates so the one remaining caller (the strategy card) and the proposal
   engine cannot drift apart. tdeeBuildProp lived here too and is gone — its
   only caller was the proposal logic that moved into the module. */
function tdeeTargetRate(){var s=state.settings;
  return TDEEProposal.targetRate({targetValue:s.targetValue,targetType:s.targetType,
    currentWeightAvg:currentWeightAvg()},strategyMode());}
function tdeeAnalysis(){var w=tdeeWindow();var res={win:w,state:"gathering"};if(!w.ok)return res;
  /* rate and tdee come from TDEECore: OLS regression across every accepted
     weigh-in, not a two-point comparison. Raw precision is preserved in the
     module; only the display value is rounded (spec §7). */
  var rate=w.core.weeklyWeightChangeLb;
  /* `var cpu` used to live here for the proposal branches below. Those moved
     into TDEEProposal, which derives it from units itself, so the declaration
     is gone with its last use rather than left dangling. */
  res.rate=rate;res.tdee=w.core.measuredTdeeDisplay;res.intake=Math.round(w.foodAvg);
  res.status=w.core.status;res.flags=w.core.confidenceFlags;
  /* The decision itself lives in TDEEProposal so Coach Max can quote the SAME
     recommendation instead of doing his own arithmetic — he once told the
     athlete 2,700 while this card said 2,205. Inputs are passed explicitly;
     the module never reads state. */
  var s=state.settings;
  var p=TDEEProposal.analyze({
    rate:rate,foodAvg:w.foodAvg,units:s.units,strategy:strategyMode(),
    targetCalories:s.targetCalories,targetType:s.targetType,targetValue:s.targetValue,
    currentWeightAvg:currentWeightAvg(),sex:s.sex,stepsGoal:s.stepsGoal,
    cardioMinGoal:s.cardioMinGoal,targetProtein:s.targetProtein,
    targetCarbs:s.targetCarbs,targetFat:s.targetFat,
    tdeeApplied:s.tdeeApplied,tdeeSnooze:s.tdeeSnooze,todayLocalDate:todayISO()});
  res.targetRate=p.targetRate;res.state=p.state;
  if(p.gapDay!=null)res.gapDay=p.gapDay;
  if(p.over!=null)res.over=p.over;
  if(p.prop)res.prop=p.prop;
  return res;}
function metabolismCardHTML(){var s=state.settings;if(num(s.targetCalories)==null&&maintenanceCals()==null)return "";
  var an=tdeeAnalysis();var w=an.win;var form=maintenanceCals();var u=s.units;
  var _st=(w.core&&w.core.status)||"insufficient";
  var _chip={insufficient:"measuring",provisional:"provisional",reliable:"reliable",high_confidence:"high confidence"}[_st]||"measuring";
  var h='<div class="wl-card"><div class="wl-card-head"><span>Metabolism '+infoBtn("metabolism")+'</span><span class="wl-count">'+_chip+'</span></div>';
  h+='<div class="wl-forecast-grid"><div class="wl-fc"><div class="wl-fc-label">Formula estimate</div><div class="wl-fc-sub">Mifflin\u2013St Jeor \u00d7 activity</div><div class="wl-fc-weeks" style="color:var(--text)">'+(form!=null?form.toLocaleString():"\u2014")+'<span> cal</span></div></div>';
  h+='<div class="wl-fc wl-mz-meas"><div class="wl-fc-label">Measured TDEE</div><div class="wl-fc-sub">from your logs</div>'+(an.tdee!=null?'<div class="wl-fc-weeks">'+an.tdee.toLocaleString()+'<span> cal</span></div>':'<div class="wl-fc-weeks"><span class="wl-mzsoon">measuring\u2026</span></div>')+'</div></div>';
  if(an.state==="gathering"){
    /* one row per requirement so it is obvious WHICH one is holding the measurement back */
    /* show the requirements of the NEXT tier that history can actually reach,
       so the bars track the real target rather than a fixed 14/6 */
    var _next=null,_ta=(w.core&&w.core.tierAttempts)||[];
    for(var _i=_ta.length-1;_i>=0;_i--){if(_ta[_i].reason!=="insufficient_history"){_next=_ta[_i];break;}}
    var _reqs=_next?[["Days of food logged",_next.completeCalorieDays,_next.requiredCalorieDays],
                     ["Weigh-ins",_next.acceptedWeightDays,_next.requiredWeightDays]]
                  :[["Days of history",(w.core&&w.core.historyDays)||0,14]];
    h+='<div class="wl-mzreq">'+_reqs.map(function(r){var _dn=r[1]>=r[2];var _p=Math.round(Math.min(1,r[1]/r[2])*100);
      return '<div><div class="wl-mzr-top"><span class="wl-mzr-t">'+(_dn?I.check:'')+r[0]+'</span><span class="wl-mzr-n'+(_dn?' done':'')+'">'+r[1]+' / '+r[2]+'</span></div><div class="wl-mzr-bar"><i class="'+(_dn?'done':'')+'" style="width:'+_p+'%"></i></div></div>';}).join("")+'</div>';
    /* name the ACTUAL blocker rather than guessing at one */
    var _why='Keep logging. Your real burn rate appears here the moment there\u2019s enough clean data to trust it.';
    if(_next&&_next.longestMissingRun>2)_why='A '+_next.longestMissingRun+'-day run of unlogged days sits inside the window \u2014 more than two in a row can\u2019t be measured through. It clears as those days age out.';
    else if(!_next)_why='Not enough history yet \u2014 the shortest measurement needs 14 days of logging behind it.';
    h+='<div class="wl-mzline">'+_why+'</div>';
  }else{
    h+='<div class="wl-mzline" style="color:var(--faint)">Based on your last '+w.core.windowDays+' days \u00b7 '+w.core.completeCalorieDays+' of '+w.core.windowDays+' days logged \u00b7 '+w.core.acceptedWeightDays+' weigh-ins'+(an.status==="provisional"?' \u00b7 low confidence, short window':'')+((w.core.confidenceFlags||[]).indexOf("off_plan_days_in_window")>=0?' \u00b7 includes off-plan days':'')+'</div>';
    h+='<div class="wl-mzline">Intake averaged <b>'+an.intake.toLocaleString()+'</b> \u00b7 trend '+(an.rate<=0?"fell ":"rose ")+'<b>'+r1(Math.abs(an.rate))+' '+u+'/wk</b> \u2192 your body burns ~<b>'+an.tdee.toLocaleString()+'/day</b>.</div>';
    /* OUTLIERS. Spec \u00a75 and the Owner ruling both require this to be VISIBLE:
       a reading may leave the trend line, but the athlete is told which one and
       it is never removed from their data. Saying "still in your log" matters \u2014
       a silent correction is the thing the spec actually forbids. */
    var _out=(w.core.weightOutliers||[]);
    if(_out.length){
      var _exc=_out.filter(function(o){return o.excluded;});
      var _fmtd=function(list){return list.map(function(o){return fmtShort(parseISO(o.date))+" ("+r1(o.weight)+")";}).join(", ");};
      if(_exc.length){
        h+='<div class="wl-mzline" style="color:var(--warn,#E0A33E)">\u26a0 '+_exc.length+' weigh-in'+(_exc.length>1?'s':'')+' left out of the trend \u2014 <b>'+_fmtd(_exc)+'</b>. Still in your log; too far off the line to trust as fat change.</div>';
      }else{
        h+='<div class="wl-mzline" style="color:var(--faint)">'+_out.length+' weigh-in'+(_out.length>1?'s':'')+' stood out ('+_fmtd(_out)+') but '+((w.core.confidenceFlags||[]).indexOf("weight_trend_regime_shift")>=0?'look like a real change of pace, not bad readings':'were kept in the trend')+'.</div>';
      }
    }
    if(an.state==="ok"){h+='<div class="wl-mz-ok"><b>No changes needed.</b> '+(an.targetRate?('Moving at '+r1(Math.abs(an.rate))+' '+u+'/wk against a '+r1(an.targetRate)+' target \u2014 inside the band. Targets hold.'):'Trend and targets agree \u2014 keep going.')+'</div>';}
    else if(an.state==="comply"){h+='<div class="wl-mz-warn"><b>Hit the current plan first.</b> Intake averaged '+an.over+' cal over your '+num(s.targetCalories).toLocaleString()+' target \u2014 numbers don\u2019t change until the plan\u2019s been run. No cuts proposed.</div>';}
    else if(an.state==="cooldown"){h+='<div class="wl-mzline" style="color:var(--faint)">An adjustment may be due, but recent changes need a full 14 days to show in the trend \u2014 check back after the settling period.</div>';}
    else{var p=an.prop;
      var title=an.state==="toofast"?"Losing faster than planned \u2014 raise calories":"Proposed adjustment";
      var why=an.state==="toofast"?('You\u2019re ahead of the '+r1(an.targetRate)+' '+u+'/wk plan. Bringing calories up protects muscle \u2014 smallest deficit that works.'):('You hit your targets but the trend is ~'+r1(Math.abs(an.rate))+' '+u+'/wk vs the '+r1(an.targetRate)+' goal \u2014 a ~'+an.gapDay+' cal/day gap. Adjust the plan, not the effort.');
      h+='<div class="wl-mz-prop"><div class="wl-mz-ptitle">'+title+'</div><div class="wl-mz-pwhy">'+why+'</div>';
      function row(k,em,val){return '<div class="wl-mz-prow"><span class="wl-mz-pk">'+k+(em?'<em>'+em+'</em>':'')+'</span><span class="wl-mz-pv">'+val+'</span></div>';}
      h+=row("Daily calories","",'<span class="old">'+(p.oldCal!=null?p.oldCal.toLocaleString():"\u2014")+'</span><span class="new">'+p.cal.toLocaleString()+'</span>');
      if(p.protein!=null)h+=row("Protein","never drops",'<span class="same">'+p.protein+'g \u00b7 unchanged</span>');
      if(p.carbs!=null)h+=row("Carbs / Fat","recomputed from new calories",'<span class="old">'+(p.oldCarbs!=null?p.oldCarbs:"\u2014")+'/'+(p.oldFat!=null?p.oldFat:"\u2014")+'</span><span class="new">'+p.carbs+'/'+p.fat+'</span>');
      if(p.steps!=null)h+=row("Steps goal","\u2248 +45 cal/day",'<span class="old">'+p.oldSteps.toLocaleString()+'</span><span class="new up">'+p.steps.toLocaleString()+'</span>');
      if(p.cardio!=null)h+=row("Cardio minutes / wk","zone 2+ \u00b7 \u2248 +21 cal/day",'<span class="old">'+p.oldCardio+'</span><span class="new up">'+p.cardio+'</span>');
      h+='<button class="wl-btn wl-btn-primary wl-full" style="margin-top:12px" data-act="tdee:apply">Apply all changes</button>';
      h+='<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px" data-act="tdee:later">Not now</button>';
      h+='<div class="wl-mz-cool">Reviews every 14 days \u00b7 floor '+(s.sex==="female"?"1,500":"1,800")+' cal \u00b7 off-plan weeks never trigger cuts</div></div>';}
  }
  return h+'</div>';}
function forecastCardHTML(){var u=state.settings.units;var sw=sortedWeights();var st=num(state.settings.startingWeight),g=num(state.settings.goalWeight);
  var cur=sw.length?sw[sw.length-1].weight:st;if(st==null||g==null||cur==null)return "";
  var pc=prepChart(),fc=computeForecasts(cur,g,pc.slope);
  var h='<div class="wl-card"><div class="wl-card-head"><span>Forecast to goal</span></div>';
  var _fcWhy=sw.length<PACE_MIN_WEIGHINS?("Needs "+PACE_MIN_WEIGHINS+" weigh-ins before a pace means anything \u2014 you have "+sw.length+"."):"Not enough downward trend yet \u2014 keep logging weigh-ins.";
  if(fc.done)h+='<div class="wl-empty">You\u2019re at or below your goal weight. Nice work.</div>';
  else h+='<div class="wl-forecast-grid">'+fcCell("At your target",state.settings.targetType==="percent_bw_per_week"?state.settings.targetValue+"% / week":state.settings.targetValue+" "+u+" / week",fc.target,"")+fcCell("At your current pace",(fc.observed&&fc.observed.rate!=null)?r1(fc.observed.rate)+" "+u+" / week":"based on your data",fc.observed,_fcWhy)+'</div>';
  return h+'</div>';}
/* ===== Measurement trend component (Owner package 2026-08-06) =====
   One reusable W/M/6M trend body for Weight / Body fat / Waist / LBM,
   powered by the pure trend-core module. Deliberately SELF-CONTAINED:
   its rolling windows (7d / 30d / 6 calendar months ending today) are the
   package's semantics and do not touch trendCtx(), which continues to drive
   steps, calories, sleep and training history unchanged. */
function t2Cfg(tab,u){
  if(tab==="bodyfat")return {id:"bodyfat",label:"Body fat",labelLower:"body fat",unit:"%",dec:1,pp:true};
  if(tab==="leanmass")return {id:"leanmass",label:"Lean body mass",labelLower:"lean body mass",unit:u,dec:1,pp:false};
  if(tab==="waist")return {id:"waist",label:"Waist",labelLower:"waist",unit:u==="kg"?"cm":"in",dec:1,pp:false,showPct:false};
  return {id:"weight",label:"Weight",labelLower:"weight",unit:u,dec:1,pp:false};}
function t2MapObs(map){return Object.keys(map||{}).map(function(d){return {date:d,value:num(map[d])};})
  .filter(function(x){return x.value!=null;});}
function t2Obs(tab){
  var wObs=sortedWeights().map(function(x){return {date:x.date,value:num(x.weight)};})
    .filter(function(x){return x.value!=null;});
  if(tab==="weight")return wObs;
  if(tab==="bodyfat")return t2MapObs(state.bodyfat);
  if(tab==="waist")return t2MapObs(state.waist);
  /* LBM: stored entries win per date; otherwise derived from the SAME-DATE
     weight+bodyfat pair (the app's pairing convention is the shared date key) */
  return tcLbmObs(wObs,t2MapObs(state.bodyfat),t2MapObs(state.leanmass));}
function t2InnerHTML(tab,u){
  var cfg=t2Cfg(tab,u);
  var mode=state.t2Mode||"M";var off=state.t2Off||0;
  var p=tcPeriod(mode,off,todayISO(),weekStartDow());
  var obs=t2Obs(tab);
  var cur=tcWindow(obs,p.startISO,p.endISO);
  var prev=tcWindow(obs,p.prevStartISO,p.prevEndISO);
  /* strong-claim gate: the PACE_MIN_WEIGHINS discipline; a 7-day window uses
     3 because 7-of-7 would silence the comparison for nearly everyone.
     Stated product default, flagged in the package handoff. */
  var minC=mode==="W"?3:PACE_MIN_WEIGHINS;
  var cmp=tcCompare(cur,prev,minC);
  var badge=tcBadge(cfg,mode,cmp);
  var h="";
  /* headline: period average */
  h+='<div class="wl-t2-head"><div><div class="wl-t2-cap">Average</div>'
    +'<div class="wl-t2-avg">'+(cur.avg!=null?tcNum(cur.avg,cfg.dec):"\u2014")
    +(cur.avg!=null?'<span class="wl-t2-unit">'+esc(cfg.unit)+'</span>':"")+'</div>'
    +(badge?'<span class="wl-t2-badge '+badge.dir+'">'+badge.arrow+' '+esc(badge.text)+'</span>':"")
    +'</div>'
    +'<div class="wl-seg wl-t2-seg">'+["W","M","6M"].map(function(m){return '<button class="'+(mode===m?"on":"")+'" data-act="t2:mode" data-mode="'+m+'" aria-pressed="'+(mode===m)+'">'+m+'</button>';}).join("")+'</div></div>';
  /* period navigation — Next disabled at the current period, never future */
  h+='<div class="wl-hnav" style="justify-content:center;margin-top:8px"><button class="wl-hnav-arw" data-act="t2:prev" aria-label="Previous period">\u2039</button>'
    +'<button class="wl-hnav-lbl" data-act="t2:tocur"><span>'+esc(p.label)+'</span></button>'
    +'<button class="wl-hnav-arw'+(off>0?'':' off')+'" '+(off>0?'data-act="t2:next" aria-label="Next period"':'disabled')+'>\u203a</button></div>';
  /* plain-language summary generated from the displayed numbers */
  h+='<div class="wl-hint wl-t2-copy">'+esc(tcSummary(cfg,mode,cur,prev,cmp))+'</div>';
  /* chart */
  if(cur.points.length){
    var buckets=mode==="6M"?tcMonthBuckets(obs,p.startISO,p.endISO):null;
    h+=tcChartSVG({mode:mode,startISO:p.startISO,endISO:p.endISO,points:cur.points,
      monthBuckets:buckets,avg:mode==="M"?cur.avg:null,dec:cfg.dec,unit:cfg.unit,
      /* Owner 2026-08-05: the data layer reads BLUE like the approved reference
      — the existing CH.reg token, so no new palette; amber stays on the app
      chrome (tabs, buttons, badges) */
      colors:{axis:CH.axis,grid:CH.grid,line:CH.reg,accent:CH.reg,fill:"rgba(124,147,245,0.10)",pointFill:"#10151E"},
      ariaLabel:esc(cfg.label)+" trend, "+cur.count+" measurement"+(cur.count===1?"":"s")+", average "+tcNum(cur.avg,cfg.dec)+" "+esc(cfg.unit)});
    /* text alternative + tapped-point details */
    var pt=state.t2Pt;
    var ptIn=pt&&pt.tab===tab&&pt.date>=p.startISO&&pt.date<=p.endISO;
    /* honesty in the details (Owner, 2026-08-06): a derived LBM point must
       say so — 'logged entry' was claiming scale data for arithmetic */
    var ptObs=ptIn?(obs.filter(function(o){return o.date===pt.date;})[0]||{}):{};
    h+='<div class="wl-readout">'+(ptIn
      ?('<b>'+tcNum(pt.value,cfg.dec)+'</b> '+esc(cfg.unit)+' · '+esc(fmtShort(parseISO(pt.date)))+' · '+(ptObs.derived?'calculated from weight + body fat':'logged entry'))
      :(cur.count+' measurement'+(cur.count===1?"":"s")+' \u00b7 tap a point for details'))+'</div>';
  }else{
    h+='<div class="wl-empty">'+(obs.length?('No '+esc(cfg.labelLower)+' entries in this period.')
      :('No '+esc(cfg.labelLower)+' logged yet \u2014 add it from the Weight check-in when you measure.'))+'</div>';
  }
  /* source + recency: honest about what the store actually records — entries
     carry no per-record source/time metadata (flagged in the handoff) */
  var lastObs=obs.length?obs[obs.length-1].date:null;
  h+='<div class="wl-t2-src"><span>Manual & imported entries</span><span>'+(lastObs?('Latest: '+esc(fmtShort(parseISO(lastObs)))):"\u2014")+'</span></div>';
  /* existing flows, unchanged targets */
  h+='<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:10px" data-act="go" data-view="overview">+ Add a measurement (Home tab)</button>';
  return h;}

function view_weight(){
  var u=state.settings.units;var ctx=trendCtx();var off=state.trendOffset||0;var perLbl=ctx.gran==="month"?"/mo":"/day";
  var h='<div class="wl-stack">';h+=forecastCardHTML();h+=metabolismCardHTML();
  h+='<div class="wl-card"><button class="wl-btn wl-btn-primary wl-full" data-act="go" data-view="photos">'+I.camera+'Progress Photos</button><div class="wl-hint" style="margin-top:8px">Weekly Front, Left/Right Side, and Back photos \u2014 compare your change over time.</div></div>';
  /* the page-level W/M/6M control is retired — the measurement component's
     selector drives the whole page (Owner, 2026-08-06) */
  var sw=sortedWeights();var startISO=toISO(ctx.start),endISO=toISO(ctx.end);
  var goal=num(state.settings.goalWeight);
  function bcHas(m){return m&&Object.keys(m).length>0;}
  var bcTabs=[["weight","Weight"],["bodyfat","Body fat"],["waist","Waist"],["leanmass","LBM"]];
  var bcTab=state.bcTab||"weight";if(!bcTabs.some(function(t){return t[0]===bcTab;}))bcTab="weight";
  h+='<div class="wl-card"><div class="wl-card-head"><span>Body composition</span></div>';
  if(bcTabs.length>1)h+='<div class="wl-seg wl-seg-wide" style="margin-bottom:12px">'+bcTabs.map(function(t){return '<button class="'+(bcTab===t[0]?"on":"")+'" data-act="bc:tab" data-tab="'+t[0]+'">'+t[1]+'</button>';}).join("")+'</div>';
  h+=t2InnerHTML(bcTab,u);
  h+='</div>';
  h+=feelCardHTML();
  h+=ciHistoryHTML();
  h+=glpProgressHTML();
  if(typeof whoopChartsHTML==="function")h+=whoopChartsHTML();
  var moreOpen=state.moreStats!==false; /* Owner 2026-08-02: Progress sections start open */
  h+='<div class="wl-card"><button class="wl-collapse-head" data-act="morestats"><span>More stats</span><span class="wl-chevron'+(moreOpen?" open":"")+'">\u203a</span></button>';
  if(moreOpen){
    var stepMap={};Object.keys(state.steps).forEach(function(d){var v=num(state.steps[d]);if(v!=null)stepMap[d]=v;});var sbk=bucketValues(stepMap,true);var savg=bucketAvg(sbk);
    h+='<div class="wl-substat"><div class="wl-substat-h"><span>Steps</span><span class="v">'+(savg!=null?"avg "+savg.toLocaleString()+perLbl:"\u2014")+'</span></div>'+buildBars(sbk,num(state.settings.stepsGoal),true)+'</div>';
    var calMap={};Object.keys(state.food).forEach(function(d){var c=num(state.food[d]&&state.food[d].calories);if(c!=null)calMap[d]=c;});var cbk=bucketValues(calMap,true);var cavg=bucketAvg(cbk);
    h+='<div class="wl-substat"><div class="wl-substat-h"><span>Calories</span><span class="v">'+(cavg!=null?"avg "+cavg.toLocaleString()+perLbl:"\u2014")+'</span></div>'+buildBars(cbk,num(state.settings.targetCalories),false)+'</div>';
    var sleepMap={};Object.keys(state.sleep).forEach(function(d){var v=num(state.sleep[d]);if(v!=null)sleepMap[d]=v;});var slbk=bucketValues(sleepMap);var slavg=bucketAvg(slbk);var sgm=sleepGoalMin();
    h+='<div class="wl-substat"><div class="wl-substat-h"><span>Sleep</span><span class="v">'+(slavg!=null?"avg "+minToHM(slavg):"\u2014")+(sgm!=null?" \u00b7 goal "+minToHM(sgm):"")+'</span></div>'+buildSleepChart(slbk,sgm)+'</div>';
  }
  h+='</div>';
  h+=prSummaryHTML();h+=trainingHistoryHTML(ctx);h+='<div class="wl-card" style="padding:13px 16px"><button class="wl-link" data-act="go" data-view="overview">+ Log or edit on the Home tab →</button></div>';
  return h+'</div>';
}
function stat(l,v,u){return '<div class="wl-stat"><div class="wl-stat-label">'+l+'</div><div class="wl-stat-val">'+v+'<span>'+(v!=="—"?" "+u:"")+'</span></div></div>';}
function barInner(val,target){if(val==null||!target)return '<div class="wl-tbar-fill" style="width:0%"></div><span class="wl-tbar-text">— of '+target+'</span>';
  var pct=Math.min(1.15,val/target);var over=val>target*1.05;
  return '<div class="wl-tbar-fill'+(over?" over":"")+'" style="width:'+Math.min(100,pct*100)+'%"></div><span class="wl-tbar-text">'+Math.round(val/target*100)+'% of '+target+'</span>';}
function dayHasAny(iso){var f=state.food[iso];var w=false;for(var i=0;i<state.weights.length;i++){if(state.weights[i].date===iso){w=true;break;}}
  return !!(w||num(state.steps[iso])!=null||num(state.sleep[iso])!=null||(state.workouts[iso]&&state.workouts[iso].length)||(f&&(num(f.calories)!=null||num(f.protein)!=null||num(f.carbs)!=null||num(f.fat)!=null))||(state.notes[iso]&&state.notes[iso].trim()));}
function clearDayBtnHTML(sel){return dayHasAny(sel)?'<button class="wl-btn wl-btn-danger wl-full" style="margin-top:12px" data-act="day:clear" data-date="'+sel+'">'+I.trash.replace("<svg","<svg width=16 height=16")+'Clear all entries for this day</button>':'';}
function refreshClearBtn(){var c=document.getElementById("wl-clearday");if(c)c.innerHTML=clearDayBtnHTML(state.selDate);}
function calNoticeHTML(iso){var e=state.food[iso];if(!e)return "";
  if(e.calAuto===true)return "";
  var p=num(e.protein),c=num(e.carbs),f=num(e.fat);if(p==null&&c==null&&f==null)return "";
  var mt=Math.round((p||0)*4+(c||0)*4+(f||0)*9);var cal=num(e.calories);
  if(cal==null)return '<div class="wl-calnote"><span>Macros add up to <b>'+mt.toLocaleString()+' cal</b>.</span><span class="wl-calnote-actions"><button class="wl-calnote-btn" data-act="cal:overwrite">Use as calories</button></span></div>';
  /* Owner 2026-08-06: the macros-vs-calories mismatch warning is RETIRED
     ("no point anymore") — his calories come from scale/import flows and the
     nag was noise. The cal==null fill-in offer above stays: it feeds the
     calAuto disclosure the muscle-preservation math relies on. */
  return "";}
function dayBarHTML(){
  var sel=state.selDate;var isToday=sel===todayISO();var open=state.calOpen;
  var h='';
  if(!isToday&&!open)h+='<div style="text-align:center;margin-bottom:8px"><button class="wl-jumptoday" data-act="opentoday">Jump to today</button></div>';
  if(open){var y=state.calY,m=state.calM;var dim=new Date(y,m+1,0).getDate();var lead=new Date(y,m,1).getDay();
    h+='<div class="wl-card" style="margin-bottom:8px;padding:12px"><div class="wl-cal-grid wl-cal-dow">';
    WEEKDAYS.forEach(function(dw){h+='<div class="wl-dow">'+dw+'</div>';});h+='</div><div class="wl-cal-grid">';
    for(var i=0;i<lead;i++)h+='<div class="wl-cell empty"></div>';
    for(var d=1;d<=dim;d++){var iso=toISO(new Date(y,m,d));var isT=iso===todayISO();var isS=iso===sel;
      h+='<button class="wl-cell'+(isS?" sel":"")+(isT?" today":"")+'" data-act="cal:sel" data-date="'+iso+'"><span class="wl-cell-num">'+d+'</span>'+dayDots(iso)+'</button>';}
    h+='</div></div>';}
  return h;
}
function headerNav(){var v=state.view;
  if(v==="overview"||v==="food"||v==="calendar"||v==="train"){
    var sel=state.selDate;var isToday=sel===todayISO();var open=state.calOpen;
    var yday=toISO(addDays(new Date(),-1));
    var lbl=open?(MONTHS[state.calM]):(isToday?'Today':sel===yday?'Yesterday':parseISO(sel).toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"}));
    if(!open){
      /* Owner design 2026-08-02 (mockup approved): bare chevrons, date centered,
         one day per tap, never past today */
      var h1='<div class="wl-hnav wl-hnav-daynav'+(!isToday?" off":"")+'">';
      h1+='<button class="wl-hnav-day" data-act="day:prev" aria-label="Previous day">‹</button>';
      h1+='<button class="wl-hnav-lbl" data-act="cal:expand"><span>'+lbl+'</span></button>';
      h1+=isToday?'<button class="wl-hnav-day off" disabled aria-label="Next day">›</button>'
                 :'<button class="wl-hnav-day" data-act="day:next" aria-label="Next day">›</button>';
      return h1+'</div>';}
    /* month view: same centered bare-chevron pattern as the day nav */
    var h='<div class="wl-hnav wl-hnav-daynav">';
    h+='<button class="wl-hnav-day" data-act="cal:prev" aria-label="Previous month">‹</button>';
    h+='<button class="wl-hnav-lbl month" data-act="cal:expand"><span>'+lbl+'</span></button>';
    h+='<button class="wl-hnav-day" data-act="cal:next" aria-label="Next month">›</button>';
    return h+'</div>';}
  if(v==="summary"){var s0=weekStartFor(state.weekOffset),e0=new Date(s0);e0.setDate(s0.getDate()+6);var isThis=state.weekOffset===0;
    var h='<div class="wl-hnav'+(isThis?"":" off")+'">';
    h+='<button class="wl-hnav-arw" data-act="sum:prev">‹</button>';
    h+='<button class="wl-hnav-lbl" data-act="sum:tocur"><span>'+fmtWkRange(s0,e0)+'</span></button>';
    if(!isThis)h+='<button class="wl-hnav-arw" data-act="sum:next">›</button>';
    return h+'</div>';}
  /* Progress trend window control moved to the chart card (not the header) */
  return '';
}

function quickEntryHTML(){
  var sec=state.quickEntry;if(!sec)return "";
  var sel=state.selDate;var u=state.settings.units;
  var titles={weight:"Weight",steps:"Steps",sleep:"Sleep",calories:"Calories & macros",notes:"Notes",feel:"How you felt"};
  var wmap={};state.weights.forEach(function(x){wmap[x.date]=x.weight;});
  var e=state.food[sel]||{};
  var t={calories:num(state.settings.targetCalories),protein:num(state.settings.targetProtein),carbs:num(state.settings.targetCarbs),fat:num(state.settings.targetFat)};
  var hasT=Object.keys(t).some(function(k){return t[k]!=null;});
  var body='';
  if(sec==="weight"){var _wsk=isSkip(sel,"weight");body='<label class="wl-field wl-field-full"><span>Weight <em>'+u+'</em></span><input class="wl-daywt-input wl-num" type="text" inputmode="decimal" placeholder="'+(_wsk?"skipped":"—")+'" value="'+(wmap[sel]!=null?wmap[sel]:"")+'"></label>';var waistU=u==="kg"?"cm":"in";body+='<div class="wl-row" style="margin-top:10px"><label class="wl-field"><span>Body fat <em>%</em></span><input class="wl-bf-input wl-num" type="text" inputmode="decimal" placeholder="\u2014" value="'+(state.bodyfat[sel]!=null?state.bodyfat[sel]:"")+'"></label><label class="wl-field"><span>Waist <em>'+waistU+'</em></span><input class="wl-waist-input wl-num" type="text" inputmode="decimal" placeholder="\u2014" value="'+(state.waist[sel]!=null?state.waist[sel]:"")+'"></label></div>';body+='<div class="wl-row" style="margin-top:10px"><label class="wl-field"><span>Lean mass <em>'+u+'</em></span><input class="wl-lbm-input wl-num" type="text" inputmode="decimal" placeholder="\u2014" value="'+(state.leanmass[sel]!=null?state.leanmass[sel]:"")+'"></label></div>';body+='<div class="wl-hint" style="margin-top:6px">Log body fat %, waist, or lean mass whenever you measure \u2014 it sharpens your coach\u2019s read.</div>';body+='<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:10px" data-act="skip:weight">'+(_wsk?"Un-skip — I’ll log a weight":"No scale today — skip weight")+'</button>';if(_wsk)body+='<div class="wl-hint" style="margin-top:8px">Marked skipped for this day. Add a note (e.g. “on vacation”) so your coach knows why.</div>';}
  else if(sec==="steps"){var _stk=isSkip(sel,"steps");body='<label class="wl-field wl-field-full"><span>Steps</span><input class="wl-steps-input wl-num" data-int="1" type="text" inputmode="numeric" placeholder="'+(_stk?"skipped":"\u2014")+'" value="'+(state.steps[sel]!=null?state.steps[sel]:"")+'"></label>';body+=skipBtn("steps",_stk,"steps");}
  else if(sec==="sleep"){var _slk=isSkip(sel,"sleep");body='<div class="wl-row"><label class="wl-field"><span>Hours</span><input class="wl-num wl-sleep-h" data-int="1" type="text" inputmode="numeric" placeholder="'+(_slk?"skip":"\u2014")+'" value="'+(state.sleep[sel]!=null?Math.floor(state.sleep[sel]/60):"")+'"></label><label class="wl-field"><span>Minutes</span><input class="wl-num wl-sleep-m" data-int="1" type="text" inputmode="numeric" placeholder="'+(_slk?"skip":"\u2014")+'" value="'+(state.sleep[sel]!=null?state.sleep[sel]%60:"")+'"></label></div>';body+=skipBtn("sleep",_slk,"sleep");if(typeof whoopSleepNoteHTML==="function")body+=whoopSleepNoteHTML(sel);}
  else if(sec==="calories"){body='<div class="wl-macro3">';
    [["protein","Protein","g"],["fat","Fat","g"],["carbs","Carbs","g"]].forEach(function(f){var val=e[f[0]]!=null?e[f[0]]:"";body+='<label class="wl-field"><span>'+f[1]+' <em>'+f[2]+'</em></span><input class="wl-food-input wl-num" data-food="'+f[0]+'" type="text" inputmode="decimal" placeholder="0" value="'+val+'">';if(hasT&&t[f[0]]!=null)body+='<div class="wl-tbar" id="bar-'+f[0]+'">'+barInner(num(val),t[f[0]])+'</div>';body+='</label>';});
    var _cv=e.calories!=null?e.calories:"";
    body+='</div><label class="wl-field wl-field-full" style="margin-top:14px"><span>Total Calories <em>cal</em></span><input class="wl-food-input wl-num" data-food="calories" type="text" inputmode="decimal" placeholder="0" value="'+_cv+'">';if(hasT&&t.calories!=null)body+='<div class="wl-tbar" id="bar-calories">'+barInner(num(_cv),t.calories)+'</div>';body+='</label>';
    var _fv=e.fiber!=null?e.fiber:"";
    body+='<label class="wl-field wl-field-full" style="margin-top:14px"><span>Fiber <em>g · optional</em></span><input class="wl-food-input wl-num" data-food="fiber" type="text" inputmode="decimal" placeholder="0" value="'+_fv+'"></label>';
    body+='<div id="wl-calnotice">'+calNoticeHTML(sel)+'</div>';var _clk=isSkip(sel,"calories");body+=skipBtn("calories",_clk,"food");
    }
  else if(sec==="feel")body=feelSheetBody(sel);
  else if(sec==="notes")body='<textarea class="wl-note-input" placeholder="Any notes for the AI summary (feeling sick, feeling good, on vacation…)" style="width:100%;min-height:96px;background:var(--bg2);border:1px solid var(--line);border-radius:10px;color:var(--text);font-family:var(--sans);font-size:14px;padding:11px 12px;box-sizing:border-box;outline:none;resize:vertical">'+esc(state.notes[sel]||"")+'</textarea>';
  var h='<div class="wl-confirm"><div class="wl-confirm-card">';
  h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px"><div style="font-weight:800;font-size:17px">'+titles[sec]+'</div><button class="wl-icon-btn" data-act="qe:close">✕</button></div>';
  h+='<div class="wl-hint" style="margin-bottom:14px">'+fmtLong(parseISO(sel))+(sel===todayISO()?" · Today":"")+'</div>';
  h+=body;
  h+='<button class="wl-btn wl-btn-primary wl-full" style="margin-top:16px" data-act="qe:close">Done</button>';
  return h+'</div></div>';
}
/* The athlete's check-in day, as a day-of-week index. This ONE anchor defines
   every weekly window in the app — the Summary week, the progress report, the
   check-in's covered range, and (since 2026-08-11) the Progress trend's W
   period. Read it from here rather than re-parsing the setting, so a week can
   never mean two different things on two different screens. */
function weekStartDow(){return parseInt(state.settings.weekStart,10)||0;}
function weekStartFor(offset){var ws=weekStartDow();var d=new Date();d.setHours(0,0,0,0);var diff=(d.getDay()-ws+7)%7;d.setDate(d.getDate()-diff+offset*7);return d;}
function weekDays(offset){var s=weekStartFor(offset),arr=[];for(var i=0;i<7;i++){var dd=new Date(s);dd.setDate(s.getDate()+i);arr.push(dd);}return arr;}
function dayRow(d){var iso=toISO(d);var w=null;for(var i=0;i<state.weights.length;i++){if(state.weights[i].date===iso){w=state.weights[i].weight;break;}}
  var f=state.food[iso]||{};return {date:iso,dow:d.toLocaleDateString(undefined,{weekday:"long"}),d:d,weight:w,steps:num(state.steps[iso]),sleep:num(state.sleep[iso]),
    calories:num(f.calories),fiber:num(f.fiber),protein:num(f.protein),fat:num(f.fat),carbs:num(f.carbs),activities:normActs(iso).map(actLabel),
    cardioSess:(((state.training||{}).sessions||{})[iso]||[]).filter(function(s){return s.kind==="cardio";}),
    liftSess:(((state.training||{}).liftSessions||{})[iso]||[]),
    note:state.notes[iso]||""};}
/* ---- CSV export cells for training ----
   One line per session: "Name, Duration: N mins, Zone: N, Avg HR: N, estimated cals burned: N".
   Parts with no logged value are omitted rather than left blank. Multiple sessions in a
   day are joined with " | ". Cardio is filtered to ZONE 2+ to match the app's weekly
   cardio-goal rule (weekTrainingStats), where an unset zone also counts. */
function csvIsZ2(s){var z=num(s.zone);return z==null||z>=2;}
function csvSessLine(name,s){var p=[name];
  var m=num(s.mins);if(m!=null)p.push("Duration: "+Math.round(m)+" mins");
  var z=num(s.zone);if(z!=null)p.push("Zone: "+z);
  var hr=num(s.hr);if(hr!=null)p.push("Avg HR: "+Math.round(hr));
  var c=num(s.cal);if(c!=null)p.push("estimated cals burned: "+Math.round(c));
  return p.join(", ");}
function csvCardioCell(r){return (r.cardioSess||[]).filter(csvIsZ2).map(function(s){return csvSessLine(s.type||"Cardio",s);}).join(" | ");}
function csvLiftCell(r){return (r.liftSess||[]).map(function(s){return csvSessLine(s.name||"Weight training",s);}).join(" | ");}
function csvActNotesCell(r){var out=[];
  (r.cardioSess||[]).filter(csvIsZ2).forEach(function(s){var n=(s.notes||"").trim();if(n)out.push((s.type||"Cardio")+" Notes: "+n);});
  (r.liftSess||[]).forEach(function(s){var n=(s.notes||"").trim();if(n)out.push((s.name||"Weight training")+" Notes: "+n);});
  return out.join(" | ");}
function fnum(v){return v==null?"—":(Math.abs(v)>=1000?Math.round(v).toLocaleString():(v%1===0?String(v):String(r1(v))));}
function avgStatF(label,disp,sub,color){return '<div class="wl-stat"><div class="wl-stat-label">'+label+'</div><div class="wl-stat-val'+(color?" "+color:"")+'">'+disp+'</div><div class="wl-stat-sub">'+(sub||"&nbsp;")+'</div></div>';}
function actStat(label,n,cat){var col={cardio:"#3b82f6",lifting:"#22c55e",rest:"#6b7280",supp:"#a855f7"}[cat]||"var(--text)";return '<div class="wl-stat"><div class="wl-stat-label">'+label+'</div><div class="wl-stat-val" style="color:'+col+'">'+n+'</div></div>';}
/* the four numbers he plans a day around. Absent targets show an em dash and
   say where to set them rather than rendering a confident zero. */
function dailyTargetsCardHTML(){
  var s=state.settings;
  var cal=num(s.targetCalories),pro=num(s.targetProtein),carb=num(s.targetCarbs),fat=num(s.targetFat);
  var t=function(label,v,unit){
    var disp=(v==null)?"\u2014":(Math.abs(v)>=1000?Math.round(v).toLocaleString():String(Math.round(v)));
    return '<div class="wl-stat"><div class="wl-stat-label">'+label+'</div><div class="wl-stat-val">'
      +disp+(v!=null&&unit?'<span>'+unit+'</span>':'')+'</div></div>';};
  var h='<div class="wl-card"><div class="wl-card-head"><span>Daily Targets</span>'
    +(s.macroAuto===false?'<em>set by you</em>':'<em>auto</em>')+'</div>'
    +'<div class="wl-statrow" style="grid-template-columns:repeat(4,1fr)">'
    +t("Calories",cal,"")+t("Protein",pro,"g")+t("Carbs",carb,"g")+t("Fat",fat,"g")
    +'</div>';
  if(cal==null&&pro==null&&carb==null&&fat==null)
    h+='<div class="wl-hint">No targets yet \u2014 set them in Settings \u2192 Calories &amp; macros.</div>';
  else if(s.macroAuto!==false)
    h+='<div class="wl-hint">Calculated from your goal weight and rate. Change them in Settings \u2192 Calories &amp; macros.</div>';
  return h+'</div>';}
function sumStat(label,v,unit){
  if(label==="")return '<div class="wl-stat" style="visibility:hidden"></div>';
  var disp=v==null?"—":(Math.abs(v)>=1000?Math.round(v).toLocaleString():(v%1===0?String(v):String(r1(v))));
  return '<div class="wl-stat"><div class="wl-stat-label">'+label+'</div><div class="wl-stat-val">'+disp+'<span>'+(v!=null&&unit?" "+unit:"")+'</span></div></div>';}
/* shared goal-coloring rules — the Summary cards and the exported coach report
   must judge a number identically, so these live at module level for both */
function acol(has,red){return has?(red?"bad":"good"):"";}
function gcol(v,goal,over,buf){if(goal==null||v==null)return "";if(over)return v<=goal?"good":(v<=goal+buf?"warn":"bad");return v>=goal?"good":(v>=goal-buf?"warn":"bad");}
function view_summary(){
  var days=weekDays(state.weekOffset).map(dayRow);
  var s=weekStartFor(state.weekOffset),e=new Date(s);e.setDate(s.getDate()+6);
  var isThis=state.weekOffset===0;var label=fmtShort(s)+" – "+fmtShort(e);var u=state.settings.units;
  var metrics=["steps","calories","protein","fat","carbs"];var tot={},cnt={};
  /* Weekly AVERAGES follow the Owner's 2026-08-02 rule (same as the Progress
     tab's bucketValues): an in-progress TODAY is excluded until the day is
     Completed (a recap exists) or has passed — a half-logged day reads as a
     bad day in an average. Weekly TOTALS below deliberately keep today: a
     running total including this morning's food is the honest "so far".
     Sleep is untouched either way — last night's number doesn't accumulate.
     (Owner report, 2026-08-05: Summary averages included the partial today.) */
  var _tdI=todayISO();var _tdPend=state.weekOffset===0&&!dayRecap(_tdI);
  var avgTot={},avgCnt={};
  metrics.forEach(function(k){tot[k]=0;cnt[k]=0;avgTot[k]=0;avgCnt[k]=0;
    days.forEach(function(r){if(r[k]==null)return;
      tot[k]+=r[k];cnt[k]++;
      if(_tdPend&&r.date===_tdI)return;
      avgTot[k]+=r[k];avgCnt[k]++;});});
  function avg(k){return avgCnt[k]?avgTot[k]/avgCnt[k]:null;}
  var wv=days.filter(function(r){return r.weight!=null;}).map(function(r){return r.weight;});
  var slv=days.map(function(r){return num(state.sleep[r.date]);}).filter(function(x){return x!=null;});
  var slAvg=slv.length?Math.round(slv.reduce(function(a,b){return a+b;},0)/slv.length):null;
  var ts=weekTrainingStats(s);var _tI=todayISO();
  var tCal=num(state.settings.targetCalories),tStep=num(state.settings.stepsGoal),tProt=num(state.settings.targetProtein),tFat=num(state.settings.targetFat),tCarb=num(state.settings.targetCarbs),tSleep=sleepGoalMin();
  var h='<div class="wl-stack">';
  /* PREVIOUS week is weekOffset-1: weekStartFor ADDS offset*7 and sum:prev decrements,
     so past weeks are NEGATIVE offsets. Using +1 pointed at the week AFTER the one shown,
     which never has data on the current week and inverted the sign on past weeks. */
  var _prevWv=weekDays(state.weekOffset-1).map(dayRow).filter(function(r){return r.weight!=null;}).map(function(r){return r.weight;});
  var _thisAvg=wv.length?wv.reduce(function(a,b){return a+b;},0)/wv.length:null;
  var _lastAvg=_prevWv.length?_prevWv.reduce(function(a,b){return a+b;},0)/_prevWv.length:null;
  var _wChg=(_thisAvg!=null&&_lastAvg!=null)?_thisAvg-_lastAvg:null;
  h+='<div class="wl-card">';
  if(_thisAvg==null)h+='<div class="wl-hint">No weigh-ins logged this week.</div>';
  else{var _mThr=(u==="kg"?0.1:0.2);
    h+='<div class="wl-hero-top" style="margin-bottom:'+(_wChg!=null?"10px":"0")+'"><div><div class="wl-mini-label">Weekly average</div><div class="wl-bignum" style="font-size:30px">'+r1(_thisAvg)+'<span class="wl-unit">'+u+'</span></div></div>';
    if(_wChg!=null){var _mnt=Math.abs(_wChg)<_mThr,_lostW=_wChg<0;h+='<div class="wl-change '+(_mnt?"":(_lostW?"good":"bad"))+'">'+(_mnt?"":(_lostW?I.down:I.up))+(_mnt?"Maintained":((_lostW?"Lost ":"Gained ")+Math.abs(r1(_wChg))+" "+u))+'</div>';}
    h+='</div>';
    if(_wChg!=null)h+='<div class="wl-hint">vs last week\u2019s average of '+r1(_lastAvg)+' '+u+'</div>';
    else h+='<div class="wl-hint">Log weigh-ins next week to see your week-over-week change.</div>';}
  h+='</div>';
  h+='<div class="wl-card"><div class="wl-card-head"><span>Completed Check-ins</span></div><div class="wl-chips wl-cichips">';
  days.forEach(function(r){var dISO=r.date;var dow=parseISO(dISO).toLocaleDateString(undefined,{weekday:"short"});
    if(dISO>_tI){h+='<span class="wl-cichip fut">'+dow+'</span>';return;}
    var missN=dayMissing(dISO).length;var cls=missN===0?"ok":(dISO===_tI?"prog":(missN<4?"part":"miss"));
    h+='<button class="wl-cichip '+cls+'" data-act="openday" data-date="'+dISO+'">'+dow+'</button>';});
  h+='</div><div class="wl-cilegend"><span class="wl-cileg"><i class="wl-cidot ok"></i>Completed</span><span class="wl-cileg"><i class="wl-cidot part"></i>Partial</span><span class="wl-cileg"><i class="wl-cidot miss"></i>Missed</span></div></div>';
  h+='<div class="wl-card"><div class="wl-card-head"><span>Weekly Totals</span></div><div class="wl-statrow" style="grid-template-columns:repeat(3,1fr)">'+
    sumStat("Calories",tot.calories||null,"")+sumStat("Steps",tot.steps||null,"")+sumStat("Weigh-ins",wv.length,"")+
    /* Owner, 2026-08-12: "Replace Cardio sessions with Lifting Sessions.
       Cardio minutes is zone 2+ minutes." Cardio sessions duplicated the
       cardio-minutes tile beside it — both counted the same zone-2+ work —
       while the lifting COUNT, which is the number he actually programmes
       against (3-4 sessions a week), was nowhere on this card. */
    sumStat("Cardio min (Z2+)",ts.cardioZ2Mins||null,"")+sumStat("Lifting min",ts.liftMins||null,"")+sumStat("Lifting sessions",ts.liftSessions||null,"")+'</div></div>';
  /* Weekly Macros — totals consumed vs a goal PRO-RATED to the days elapsed in the
     DISPLAYED week: all 7 for a finished week, through today for the current one, so
     a mid-week bar reads as true adherence rather than always looking behind. A macro
     with no goal set still shows its total, just without a bar. */
  var _elapsedDays=days.filter(function(r){return r.date<=_tI;});
  var _elapsed=_elapsedDays.length;
  /* Total over the SAME window the goal is pro-rated to, so numerator and denominator
     always cover the same days (a full week reads identically to before). */
  function _macTot(k){var t=0;_elapsedDays.forEach(function(r){if(r[k]!=null)t+=r[k];});return t;}
  var _macH="";
  [["Calories",_macTot("calories"),tCal,""],["Protein",_macTot("protein"),tProt,"g"],["Carbs",_macTot("carbs"),tCarb,"g"],["Fat",_macTot("fat"),tFat,"g"]].forEach(function(m){
    var v=Math.round(m[1]||0),daily=m[2],unit=m[3];
    if(daily!=null&&_elapsed>0){_macH+=goalBarHTML(m[0],v,Math.round(daily*_elapsed),unit,false);}
    else{_macH+='<div class="wl-goalrow"><div class="wl-goalrow-top"><span>'+m[0]+'</span><span class="wl-goalrow-val">'+v.toLocaleString()+(unit?' '+unit:'')+'</span></div></div>';}
  });
  h+='<div class="wl-card"><div class="wl-card-head"><span>Weekly Macros'+((_elapsed>0&&_elapsed<7)?' <em>'+_elapsed+' of 7 days so far</em>':'')+'</span></div>'+_macH+'</div>';
  var avgCal=avg("calories"),avgStep=avg("steps"),avgProt=avg("protein"),avgFat=avg("fat"),avgCarb=avg("carbs");
  var calOverGoal=(tCal!=null&&avgCal!=null&&avgCal>tCal);
  h+='<div class="wl-card"><div class="wl-card-head"><span>Weekly Averages <em>'+(_tdPend?'per completed day \u00b7 today counts once completed':'per logged day')+'</em></span></div><div class="wl-statrow" style="grid-template-columns:repeat(3,1fr)">'+
    avgStatF("Calories",fnum(avgCal),tCal!=null?"goal "+fnum(tCal):"",gcol(avgCal,tCal,true,100))+
    avgStatF("Steps",fnum(avgStep),tStep!=null?"goal "+fnum(tStep):"",gcol(avgStep,tStep,false,0))+
    avgStatF("Sleep",slAvg!=null?minToHM(slAvg):"—",tSleep!=null?"goal "+minToHM(tSleep):"",gcol(slAvg,tSleep,false,30))+
    avgStatF("Protein",avgProt!=null?fnum(avgProt)+"g":"—",tProt!=null?"goal "+tProt+"g":"",gcol(avgProt,tProt,false,10))+
    avgStatF("Fat",avgFat!=null?fnum(avgFat)+"g":"—",tFat!=null?"goal "+tFat+"g":"",acol(tFat!=null&&avgFat!=null,avgFat>tFat&&calOverGoal))+
    avgStatF("Carbs",avgCarb!=null?fnum(avgCarb)+"g":"—",tCarb!=null?"goal "+tCarb+"g":"",acol(tCarb!=null&&avgCarb!=null,avgCarb>tCarb&&calOverGoal))+'</div></div>';
  /* Owner, 2026-08-12: "there's no current macros on any of my screens like
     progress or summary. It should go where the weekly activity card is now
     and replace it... The weekly activity card doesn't tell me much."

     He is right on both counts. Every macro surface in the app showed what he
     HAD EATEN — weekly totals, weekly averages, the daily grid — and none of
     them showed what he is aiming at, so the number he plans his day around
     was only visible by opening Settings. Weekly Activity meanwhile counted
     cardio / lifting / recovery days, which the Weekly Totals card above
     already covers in minutes and sessions.

     These are the DAILY targets, not the week's, because that is the unit he
     eats against. They are the same values the diary and the day view grade
     against (state.settings.target*), kept current by applyAutoMacros when
     auto is on — read, never recomputed here, so this card can never disagree
     with the bars above it. */
  h+=dailyTargetsCardHTML();
  h+='<div class="wl-card" style="padding:12px 10px"><div class="wl-card-head"><span>Daily Totals</span><span class="wl-count">'+label+'</span></div><table class="wl-byday-grid"><thead><tr><th>Day</th><th>Sleep</th><th>Wt</th><th>Steps</th><th>Cal</th><th>P</th><th>F</th><th>C</th></tr></thead><tbody>';
  days.forEach(function(r){var sl=num(state.sleep[r.date]);var cal=r.calories,pp=r.protein,ff=r.fat,cc=r.carbs,st=r.steps,wt=r.weight;var calOverD=(tCal!=null&&cal!=null&&cal>tCal);
    function cl(disp,cls){return '<td class="'+(cls||"")+'">'+disp+'</td>';}
    function mv(v,fm){return v==null?'<span class="mut">–</span>':fm(v);}
    h+='<tr data-act="sum:day" data-date="'+r.date+'"><td>'+r.dow.slice(0,3)+'</td>'+
      cl(mv(sl,function(v){return minToHM(v);}),gcol(sl,tSleep,false,30))+
      cl(mv(wt,function(v){return r1(v);}),"")+
      cl(mv(st,function(v){return Math.round(v).toLocaleString();}),gcol(st,tStep,false,0))+
      cl(mv(cal,function(v){return Math.round(v).toLocaleString();}),gcol(cal,tCal,true,100))+
      cl(mv(pp,function(v){return v;}),gcol(pp,tProt,false,10))+
      cl(mv(ff,function(v){return v;}),(tFat!=null&&ff!=null)?((ff>tFat&&calOverD)?"bad":"good"):"")+
      cl(mv(cc,function(v){return v;}),(tCarb!=null&&cc!=null)?((cc>tCarb&&calOverD)?"bad":"good"):"")+
      '</tr>';});
  h+='</tbody></table>'+expBtnHTML("week","primary","Export this week",
    'CSV is the data — every logged metric, training, and notes. HTML is a readable report you can open on your phone.');
  h+=expBtnHTML("coach","ghost","Export progress report",
    'Your whole week in one file — photos, summary, and every workout — or the same week as CSV data. It stays with you; the coach never receives your photos.')+'</div>';
  h+='<div class="wl-card"><button class="wl-btn wl-btn-primary wl-full" data-act="go" data-view="diary">'+I.camera+'Food Diary</button><div class="wl-hint" style="margin-top:8px">A visual collage of your meal photos by day, with each day\u2019s calories and macros.</div></div>';
  return h+'</div>';}
/* Export buttons ask CSV-or-HTML in place before building anything (Owner,
   2026-08-10: "When I export ask me if I want csv or html") — the same
   swap-in-place idiom as the Erase confirm, no overlay. The chooser's tap is
   a fresh user gesture, so the iOS one-share-per-gesture rule stays satisfied.
   The ask keeps the ORIGINAL gated action names (sum:exportweek etc.), so a
   device the M10 gate refuses is refused at the same tap it always was. */
var EXP_ASK_ACT={week:"sum:exportweek",coach:"sum:coachreport",all:"sum:exportall"};
function expBtnHTML(kind,style,label,hint,tight){
  var h,mt=tight?"0":"14px";
  if(state.exportAsk===kind){
    h='<div class="wl-hint" style="margin-top:'+mt+'"><b>'+label+'</b> — which format?</div>'+
      '<div class="wl-row" style="margin-top:8px"><button class="wl-btn wl-btn-primary wl-full" data-act="exp:go" data-fmt="html" data-kind="'+kind+'">HTML report</button>'+
      '<button class="wl-btn wl-btn-primary wl-full" data-act="exp:go" data-fmt="csv" data-kind="'+kind+'">CSV data</button></div>'+
      '<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px" data-act="exp:cancel">Cancel</button>';
  }else{
    h='<button class="wl-btn wl-btn-'+style+' wl-full" style="margin-top:'+mt+'" data-act="'+EXP_ASK_ACT[kind]+'">'+label+'</button>';
  }
  return h+'<div class="wl-hint" style="margin-top:8px">'+hint+'</div>';
}
function csvCell(v){v=(v==null?"":String(v));return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}
function mdyy(iso){var d=parseISO(iso);return (d.getMonth()+1)+"/"+d.getDate()+"/"+String(d.getFullYear()).slice(-2);}
/* A second block a few lines below the daily rows: macro totals vs goals over the SAME
   window the rows cover (days up to today), so the figures reconcile with the app's
   Weekly Macros card — goals are pro-rated to the days elapsed, not a flat x7.
   `label` is "Weekly" for the single-week export, "Period" for the full-history one. */
function csvSummaryBlock(days,label){
  var _tI=todayISO();var el=days.filter(function(r){return r.date<=_tI;});var n=el.length;var s=state.settings;
  function tot(k){var t=0;el.forEach(function(r){if(r[k]!=null)t+=r[k];});return Math.round(t);}
  function goal(v){var d=num(v);return (d!=null&&n>0)?Math.round(d*n):"";}
  function dgoal(v){var d=num(v);return d!=null?d:"";}
  /* Daily average is over DAYS IN THE PERIOD (n), not just the days that had a value —
     so the block reconciles: avg x n = total, and daily goal x n = period goal. */
  function davg(k){return n>0?r1(tot(k)/n):"";}
  function row(name,k,g){return [name,tot(k),goal(g),dgoal(g),davg(k)];}
  return [[],[],[],[],["Name",label+" Totals",label+" Goals","Daily Goal","Daily Average"],
    row("Calories","calories",s.targetCalories),
    row("Protein","protein",s.targetProtein),
    row("Fat","fat",s.targetFat),
    row("Carbs","carbs",s.targetCarbs)];
}
function csvFor(days,sumLabel){var rows=[["Day","Date","Weight","Steps","Sleep","Calories","Fiber","Protein","Fat","Carbs","Check in notes","Cardio","Weight Training","Activity Notes"]];
  days.forEach(function(r){rows.push([r.dow,mdyy(r.date),r.weight!=null?r1(r.weight):"",r.steps!=null?Math.round(r.steps):"",r.sleep!=null?minToHM(r.sleep):"",r.calories!=null?Math.round(r.calories):"",r.fiber!=null?r.fiber:"",r.protein!=null?r.protein:"",r.fat!=null?r.fat:"",r.carbs!=null?r.carbs:"",r.note||"",csvCardioCell(r),csvLiftCell(r),csvActNotesCell(r)]);});
  if(sumLabel)csvSummaryBlock(days,sumLabel).forEach(function(r){rows.push(r);});
  return rows.map(function(row){return row.map(csvCell).join(",");}).join("\r\n");}