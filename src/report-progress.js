/* ============================================================
   HTML PROGRESS REPORT  --  design: "The Progress Card"
   A STANDALONE document: its own doctype/head/style, every byte inline, and
   deliberately ZERO external references (no web fonts, no CDN, no images, no
   script). It is downloaded once and then opened OFFLINE, usually in iPhone
   Safari and sometimes printed to PDF, so anything it can't carry itself simply
   would not render. Charts and rings are inline SVG with coordinates computed
   here in JS -- no library and no runtime layout.
   Every piece of user text (name, check-in notes, activity and session names)
   goes through esc(); notes are free text and routinely contain quotes.
   COVERAGE is the reason this report exists: a period average that divides by 7
   when food was logged on 6 days reads as under-eating when nothing of the sort
   happened. Every metric therefore carries its logged-day count, and logged-day
   averages sit next to period ones.
   ============================================================ */
var REPCSS=[
  ":root{--tx:#15181D;--tx2:#5B6270;--tx3:#98A0AE;--bg:#F6F4F1;--srf:#FFFFFF;--ln:#E8E4DE;--am:#E09B1F;--amS:#FDF3DE;--gd:#2E9E75;--gdS:#E6F5EF;--bd:#D9563F;--sans:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,system-ui,sans-serif;--mono:ui-monospace,'SF Mono','Cascadia Code',Menlo,Consolas,monospace}",
  "*{box-sizing:border-box}html,body{margin:0;padding:0}",
  "body{background:var(--bg);color:var(--tx);font-family:var(--sans);font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;padding:0 0 30px;max-width:600px;margin:0 auto}",
  "p,h1,h2,h3,h4{margin:0;padding:0}svg{max-width:100%}",
  ".wrap{padding:0 16px}",
  ".hero{background:linear-gradient(158deg,#1D242F 0%,#2A2116 62%,#3A2A11 100%);color:#fff;padding:22px 20px 26px;border-radius:0 0 26px 26px}",
  ".hTop{display:flex;align-items:center;gap:8px;margin-bottom:20px}",
  ".word{font-size:12.5px;font-weight:800;letter-spacing:.28em}",
  ".hTop .r{margin-left:auto;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#F5B944;background:rgba(245,185,68,.16);padding:4px 9px;border-radius:20px}",
  ".who{font-size:13px;font-weight:600;color:rgba(255,255,255,.72);display:flex;gap:7px;flex-wrap:wrap;align-items:center}",
  ".who .s{color:rgba(255,255,255,.32)}",
  ".big{font-size:46px;font-weight:800;letter-spacing:-.035em;line-height:1.05;margin:12px 0 6px}",
  ".big em{font-style:normal;color:#5CD6A0}.big em.off{color:#F5B944}",
  ".sub{font-size:14px;color:rgba(255,255,255,.66);line-height:1.45;max-width:290px}",
  ".per{font-family:var(--mono);font-size:10.5px;color:rgba(255,255,255,.42);margin-top:16px;letter-spacing:.04em}",
  ".jr{margin-top:18px;padding-top:16px;border-top:1px solid rgba(255,255,255,.13)}",
  ".jrE{display:flex;justify-content:space-between;font-family:var(--mono);font-size:10px;color:rgba(255,255,255,.5)}",
  ".jrB{position:relative;height:8px;background:rgba(255,255,255,.11);border-radius:5px;margin:10px 0 9px}",
  ".jrF{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,#F5B944,#5CD6A0);border-radius:5px}",
  ".jrD{position:absolute;top:50%;width:14px;height:14px;border-radius:50%;background:#fff;border:3px solid #5CD6A0;transform:translate(-50%,-50%)}",
  ".jrT{font-size:12.5px;color:rgba(255,255,255,.7)}.jrT b{color:#fff;font-weight:700}",
  ".sec{padding-top:24px}",
  ".secH{font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--tx3);margin-bottom:12px}",
  ".card{background:var(--srf);border:1px solid var(--ln);border-radius:20px;padding:18px;box-shadow:0 1px 2px rgba(20,20,20,.04)}",
  ".rings{display:flex;justify-content:space-between;gap:6px}",
  ".ring{text-align:center;flex:1;min-width:0}",
  ".ring svg{width:100%;max-width:66px;height:auto;display:block;margin:0 auto}",
  ".ring .rk{font-size:9.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--tx3);margin-top:8px}",
  ".ring .rv{font-family:var(--mono);font-size:11.5px;font-weight:600;margin-top:3px}",
  ".ring .rg{font-family:var(--mono);font-size:9.5px;color:var(--tx3);margin-top:2px}",
  ".rnote{font-size:13px;color:var(--tx2);line-height:1.55;margin-top:16px;padding-top:14px;border-top:1px solid var(--ln);overflow-wrap:anywhere}",
  ".rnote b{color:var(--tx);font-weight:700}",
  ".rnote.bare{margin-top:0;padding-top:0;border-top:0}",
  ".wins{display:flex;flex-direction:column;gap:9px}",
  ".win{display:flex;gap:12px;align-items:center;background:var(--srf);border:1px solid var(--ln);border-radius:16px;padding:13px 15px}",
  ".wIc{width:36px;height:36px;border-radius:11px;flex:none;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700}",
  ".wIc.g{background:var(--gdS);color:#1F7A58}.wIc.a{background:var(--amS);color:#96650A}",
  ".wB{flex:1;min-width:0}",
  ".wT{font-size:14px;font-weight:700}",
  ".wS{font-size:12.5px;color:var(--tx2);margin-top:2px}",
  ".wV{font-family:var(--mono);font-size:13px;font-weight:600;flex:none}",
  ".wV.g{color:var(--gd)}.wV.a{color:#B57A0C}",
  ".spark{margin-top:4px}.spark svg{width:100%;height:auto;display:block}",
  ".axis{display:flex;justify-content:space-between;font-family:var(--mono);font-size:9.5px;color:var(--tx3);margin-top:6px}",
  ".dayC{background:var(--srf);border:1px solid var(--ln);border-radius:16px;padding:13px 15px;margin-bottom:9px}",
  ".dTop{display:flex;align-items:baseline;gap:10px}",
  ".dDay{font-size:13px;font-weight:800;letter-spacing:.02em}",
  ".dDate{font-family:var(--mono);font-size:10.5px;color:var(--tx3)}",
  ".dW{margin-left:auto;font-family:var(--mono);font-size:17px;font-weight:600;letter-spacing:-.01em;white-space:nowrap}",
  ".dW s{text-decoration:none;font-size:10px;color:var(--tx3);margin-left:2px}",
  ".chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}",
  ".chip{font-family:var(--mono);font-size:10.5px;padding:4px 8px;border-radius:7px;background:#F4F2EF;color:var(--tx2);white-space:nowrap}",
  ".chip b{color:var(--tx);font-weight:600}",
  ".chip.g{background:var(--gdS);color:#1F7A58}.chip.g b{color:#1F7A58}",
  ".chip.a{background:var(--amS);color:#96650A}.chip.a b{color:#96650A}",
  ".chip.act{font-family:var(--sans);white-space:normal;overflow-wrap:anywhere}",
  ".dNote{font-size:13px;color:var(--tx2);font-style:italic;margin-top:10px;padding-left:12px;border-left:3px solid var(--amS);line-height:1.45;overflow-wrap:anywhere}",
  ".dEmpty{font-size:12.5px;color:var(--tx3);margin-top:9px;padding:9px 11px;background:#F4F2EF;border-radius:9px}",
  ".trn{display:flex;gap:13px;align-items:flex-start;background:var(--srf);border:1px solid var(--ln);border-radius:16px;padding:15px;margin-bottom:9px}",
  ".tIc{width:42px;height:42px;border-radius:13px;background:var(--amS);flex:none;display:flex;align-items:center;justify-content:center}",
  ".tB{flex:1;min-width:0}",
  ".tK{font-size:9.5px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:#B57A0C}",
  ".tT{font-size:15px;font-weight:700;margin-top:3px;overflow-wrap:anywhere}",
  ".tD{font-family:var(--mono);font-size:11.5px;color:var(--tx2);margin-top:5px;overflow-wrap:anywhere}",
  ".tN{font-size:13px;font-style:italic;color:var(--tx2);margin-top:9px;padding-left:12px;border-left:3px solid var(--amS);overflow-wrap:anywhere}",
  ".trunc{font-size:12px;color:var(--tx3);margin:-4px 0 10px}",
  ".close{margin-top:22px;background:#15181D;color:#fff;border-radius:20px;padding:20px}",
  ".close .k{font-size:9.5px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#F5B944}",
  ".close p{font-size:15px;line-height:1.5;margin-top:9px;color:rgba(255,255,255,.86)}",
  ".close p b{color:#fff}",
  ".foot{text-align:center;font-size:10.5px;color:var(--tx3);margin-top:20px;line-height:1.6}",
  /* Printed to PDF the dark hero/closing panels are the whole point of the design,
     so force their colours through; everything else prints on plain white. */
  "@media print{body{background:#fff;max-width:none;padding:0}",
  ".hero,.close{-webkit-print-color-adjust:exact;print-color-adjust:exact}",
  ".card,.win,.dayC,.trn{box-shadow:none}",
  ".sec,.card,.win,.dayC,.trn,.close{break-inside:avoid;page-break-inside:avoid}}"
].join("");
/* the Compound bar mark, redrawn at report scale */
var REPMARK='<svg width="15" height="18" viewBox="0 0 17 20" aria-hidden="true"><rect x="0" y="11" width="4" height="8" rx="1" fill="#fff"/><rect x="6" y="8" width="4" height="11" rx="1" fill="#fff"/><rect x="12" y="1" width="4" height="18" rx="1" fill="#F5B944"/></svg>';
var REPICON={
  cardio:'<svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="#B57A0C" stroke-width="1.6"/><path d="M8 4.5V8l2.4 1.6" fill="none" stroke="#B57A0C" stroke-width="1.6" stroke-linecap="round"/></svg>',
  lift:'<svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="6" width="2.5" height="4" rx="1" fill="#B57A0C"/><rect x="12.5" y="6" width="2.5" height="4" rx="1" fill="#B57A0C"/><rect x="4" y="7.2" width="8" height="1.6" rx=".8" fill="#B57A0C"/></svg>'};
/* ---- small formatters (report-local so app formatting is never disturbed) ---- */
function repInt(v){return v==null?"—":Math.round(v).toLocaleString();}
function repWt(v){return v==null?"—":String(r1(v));}
function repDelta(v){if(v==null)return "";return (v>0?"+":(v<0?"−":""))+Math.abs(Math.round(v)).toLocaleString();}
function repDeltaHM(v){if(v==null)return "";return (v>=0?"+":"−")+minToHM(Math.abs(Math.round(v)));}
function repPlural(n,one,many){return n+" "+(n===1?one:many);}
/* higher-is-better ("up") or lower-is-better ("down") against a goal; no goal = no colour */
function repTone(v,goal,dir){if(goal==null||v==null)return "";return ((dir==="down")?(v<=goal):(v>=goal))?"g":"a";}
/* calories are only "over" or "under" relative to the PLAN, not universally */
function repCalTone(v,goal,strategy){
  if(goal==null||v==null)return "";
  if(strategy==="gain")return v>=goal?"g":"a";
  if(strategy==="maintain")return Math.abs(v-goal)<=100?"g":"a";
  return v<=goal?"g":"a";}
function repChip(inner,tone){return '<span class="chip'+(tone?" "+tone:"")+'">'+inner+'</span>';}
function repWin(icon,tone,title,sub,val){
  return '<div class="win"><div class="wIc '+tone+'">'+icon+'</div><div class="wB"><div class="wT">'+title+'</div>'+
    (sub?'<div class="wS">'+sub+'</div>':'')+'</div>'+(val?'<div class="wV '+tone+'">'+val+'</div>':'')+'</div>';}
/* ---- the derived model: everything the template needs, computed once ---- */
function repModel(days,opts){
  opts=opts||{};
  var s=state.settings,m={},tI=todayISO();
  /* Future days of the CURRENT week carry no data and would drag every average
     toward zero, so the reporting window stops at today -- exactly the window the
     CSV's totals block uses, which keeps the two files reconcilable. */
  var rows=days.filter(function(r){return r.date<=tI;});
  if(!rows.length)rows=days.slice();
  m.mode=opts.mode==="all"?"all":"week";
  m.rows=rows;m.n=rows.length;
  m.units=s.units||"lbs";
  m.name=s.name||"";
  m.strategy=strategyMode();
  m.plan=({lose:"Fat Loss",maintain:"Maintenance",gain:"Lean Bulk"})[m.strategy]||"Fat Loss";
  m.startD=parseISO(rows[0].date);m.endD=parseISO(rows[rows.length-1].date);
  m.today=new Date().toLocaleDateString(undefined,{month:"long",day:"numeric",year:"numeric"});
  m.periodWord=(m.n===1)?"day":(m.mode==="week"?"week":"period");
  m.tag=(m.mode==="week")?("Week of "+fmtShort(m.startD)):"Full history";
  /* ---- totals, logged-day counts, and both flavours of average ---- */
  m.tot={};m.cnt={};
  ["steps","calories","protein","fat","carbs","fiber","sleep"].forEach(function(k){
    var t=0,c=0;rows.forEach(function(r){if(r[k]!=null){t+=r[k];c++;}});m.tot[k]=t;m.cnt[k]=c;});
  m.wts=rows.filter(function(r){return r.weight!=null;});
  m.cnt.weight=m.wts.length;
  m.cnt.food=rows.filter(function(r){return r.calories!=null||r.protein!=null||r.fat!=null||r.carbs!=null;}).length;
  m.checkins=0;
  rows.forEach(function(r){try{if(dayMissing(r.date).length===0)m.checkins++;}catch(e){}});
  m.pAvg=function(k){return m.n>0?m.tot[k]/m.n:null;};          /* over the whole period */
  m.lAvg=function(k){return m.cnt[k]>0?m.tot[k]/m.cnt[k]:null;};/* over logged days only */
  m.goal={calories:num(s.targetCalories),protein:num(s.targetProtein),fat:num(s.targetFat),
    carbs:num(s.targetCarbs),steps:num(s.stepsGoal),sleep:sleepGoalMin()};
  /* ---- weight ---- */
  var wv=m.wts.map(function(r){return r.weight;});
  m.wAvg=wv.length?wv.reduce(function(a,b){return a+b;},0)/wv.length:null;
  m.wMin=wv.length?Math.min.apply(null,wv):null;
  m.wMax=wv.length?Math.max.apply(null,wv):null;
  m.wFirst=wv.length?wv[0]:null;m.wLast=wv.length?wv[wv.length-1]:null;
  m.wLowRow=null;m.wts.forEach(function(r){if(m.wLowRow==null||r.weight<m.wLowRow.weight)m.wLowRow=r;});
  m.moveThr=(m.units==="kg")?0.1:0.2;
  m.chg=null;m.prevAvg=null;m.chgBasis=null;
  if(m.mode==="week"&&opts.weekOffset!=null){
    /* week over week, measured the same way the Summary screen measures it */
    var pv=weekDays(opts.weekOffset-1).map(dayRow).filter(function(r){return r.weight!=null;}).map(function(r){return r.weight;});/* previous week = offset-1 (past weeks are negative) */
    if(pv.length&&m.wAvg!=null){m.prevAvg=pv.reduce(function(a,b){return a+b;},0)/pv.length;m.chg=m.wAvg-m.prevAvg;m.chgBasis="week";}}
  /* No previous week to compare against (a first week, or one with no weigh-ins
     before it) still has a story: fall back to first reading vs last WITHIN the
     window rather than reporting no movement at all. */
  if(m.chg==null&&wv.length>1){m.chg=m.wLast-m.wFirst;m.chgBasis="period";}
  m.goodDir=(m.strategy==="gain")?1:(m.strategy==="maintain"?0:-1);
  m.chgGood=(m.chg==null)?null:(m.goodDir===0?Math.abs(m.chg)<m.moveThr:(m.goodDir<0?m.chg<0:m.chg>0));
  /* ---- the journey rail (start -> goal), independent of the reporting window ---- */
  var sw=sortedWeights();
  m.jStart=num(s.startingWeight);m.jGoal=num(s.goalWeight);
  m.jCur=sw.length?sw[sw.length-1].weight:m.jStart;
  m.jProg=null;
  if(m.jStart!=null&&m.jGoal!=null&&m.jCur!=null&&m.jStart!==m.jGoal)m.jProg=(m.jStart-m.jCur)/(m.jStart-m.jGoal);
  m.jDone=(m.jStart!=null&&m.jCur!=null)?Math.abs(m.jStart-m.jCur):null;
  m.jToGo=(m.jGoal!=null&&m.jCur!=null)?Math.abs(m.jCur-m.jGoal):null;
  m.jReached=(m.jProg!=null&&m.jProg>=1);   /* goal met or passed -- rail pins at 100% */
  /* ---- training ---- */
  m.cardio=[];m.lift=[];
  rows.forEach(function(r){
    (r.cardioSess||[]).filter(csvIsZ2).forEach(function(x){m.cardio.push({row:r,s:x});});
    (r.liftSess||[]).forEach(function(x){m.lift.push({row:r,s:x});});});
  function mins(list){var t=0;list.forEach(function(x){var v=num(x.s.mins);if(v!=null)t+=v;});return t;}
  if(opts.ws){var ts=weekTrainingStats(opts.ws);m.cardioMins=ts.cardioZ2Mins;m.liftMins=ts.liftMins;}
  else{m.cardioMins=mins(m.cardio);m.liftMins=mins(m.lift);}
  return m;}
/* ---- hero ---- */
function repHeadline(m){
  var u=m.units;
  if(m.wAvg==null)return 'No weigh-ins<br/>'+((m.n===1)?"that day.":("this "+m.periodWord+"."));
  if(m.chg==null||Math.abs(m.chg)<m.moveThr)
    return 'Holding at<br/><em'+(m.chgGood===false?' class="off"':'')+'>'+repWt(m.wAvg)+" "+u+'</em>.';
  var word=(m.chg<0)?"Down ":"Up ";
  var tail=(m.mode==="week")?"this week.":((m.n===1)?"that day.":"this period.");
  return word+'<em'+(m.chgGood?"":' class="off"')+'>'+repWt(Math.abs(m.chg))+" "+u+'</em><br/>'+tail;}
function repSubline(m){
  var bits=[];
  if(m.wAvg!=null)bits.push("Averaged "+repWt(m.wAvg)+" "+m.units+(m.prevAvg!=null?(", against "+repWt(m.prevAvg)+" the week before"):""));
  if(m.wLowRow&&m.wts.length>1)bits.push("lowest reading "+repWt(m.wLowRow.weight)+" on "+esc(m.wLowRow.dow));
  var lead=bits.length?(bits.join(", ")+"."):("Nothing was weighed in this "+m.periodWord+".");
  var ci=(m.checkins===m.n)?(repPlural(m.n,"day","days")+" logged in full — a clean sheet.")
    :(m.checkins+" of "+m.n+" days logged in full.");
  return lead+" "+ci;}
function repHeroHTML(m){
  var h='<div class="hero"><div class="hTop">'+REPMARK+'<span class="word">COMPOUND</span><span class="r">'+esc(m.tag)+'</span></div>';
  h+='<div class="who"><span>'+esc(m.name||"Compound")+'</span><span class="s">·</span><span>'+esc(m.today)+'</span><span class="s">·</span><span>'+esc(m.plan)+'</span></div>';
  h+='<div class="big">'+repHeadline(m)+'</div>';
  h+='<div class="sub">'+repSubline(m)+'</div>';
  h+='<div class="per">'+esc(repPeriodLabel(m))+'</div>';
  /* the rail needs BOTH ends of the journey; with either missing it would be a bar
     measured against nothing, so it is omitted rather than faked */
  if(m.jStart!=null&&m.jGoal!=null&&m.jCur!=null){
    var pct=(m.jProg==null)?0:Math.max(0,Math.min(1,m.jProg))*100;
    h+='<div class="jr"><div class="jrE"><span>'+repWt(m.jStart)+' START</span><span>'+repWt(m.jGoal)+' GOAL</span></div>';
    h+='<div class="jrB"><div class="jrF" style="width:'+r1(pct)+'%"></div><div class="jrD" style="left:'+r1(pct)+'%"></div></div>';
    h+='<div class="jrT">'+(m.jReached
      ? '<b>Goal reached</b> · '+repWt(m.jDone)+' '+m.units+' from where you started'
      : '<b>'+repWt(m.jDone)+' '+m.units+(m.jCur<=m.jStart?" down":" gained")+'</b> · '+Math.round(pct)+'% of the way · <b>'+repWt(m.jToGo)+' to go</b>')+'</div></div>';}
  return h+'</div>';}
function repRangeText(m){
  var a=m.startD,b=m.endD;
  return (a.getFullYear()===b.getFullYear())?(fmtShort(a)+" – "+fmtShort(b)+", "+b.getFullYear()):(fmtFull(a)+" – "+fmtFull(b));}
function repPeriodLabel(m){return repRangeText(m).toUpperCase()+" · "+repPlural(m.n,"DAY","DAYS");}
/* ---- the week at a glance: flags, coverage first-class ---- */
function repGlanceHTML(m){
  var w=[],g=m.goal;
  var ciAll=(m.checkins===m.n);
  w.push(repWin(ciAll?"✓":"·",ciAll?"g":"a",
    ciAll?"Every check-in, logged":"Some days went unfinished",
    "Weight, food, steps and sleep on "+m.checkins+" of "+repPlural(m.n,"day","days"),m.checkins+"/"+m.n));
  if(g.steps!=null&&m.cnt.steps>0){
    var sA=m.lAvg("steps"),sd=sA-g.steps,ok=sd>=0;
    w.push(repWin(ok?"↑":"↓",ok?"g":"a",ok?"Steps beat the daily target":"Steps came up short",
      repInt(m.tot.steps)+" total · "+repInt(sA)+" a day across "+repPlural(m.cnt.steps,"logged day","logged days"),repDelta(sd)));}
  if(g.sleep!=null&&m.cnt.sleep>0){
    var slA=m.lAvg("sleep"),sld=slA-g.sleep,slOk=sld>=0;
    w.push(repWin(slOk?"✓":"·",slOk?"g":"a",slOk?"Sleep held the goal":"Sleep came up short",
      minToHM(Math.round(slA))+" average against a "+minToHM(g.sleep)+" goal",repDeltaHM(sld)));}
  if(g.calories!=null&&m.cnt.calories>0){
    var cA=m.lAvg("calories"),cd=cA-g.calories,cTone=repCalTone(cA,g.calories,m.strategy);
    w.push(repWin(cTone==="g"?"✓":"·",cTone||"a",
      cTone==="g"?"Calories landed on plan":"Calories drifted off plan",
      repInt(cA)+" a day across "+repPlural(m.cnt.calories,"logged day","logged days")+" against a "+repInt(g.calories)+" target",repDelta(cd)));}
  if(m.cardio.length||m.lift.length)
    w.push(repWin("✓","g","You trained "+repPlural(m.cardio.length+m.lift.length,"time","times"),
      (m.lift.length?repPlural(m.lift.length,"lifting session","lifting sessions"):"no lifting")+" · "+repInt(m.cardioMins)+" min of zone 2+ cardio",
      repInt(m.cardioMins+m.liftMins)+"m"));
  /* Coverage callouts -- the whole reason this report exists. A gap in ANY metric
     is stated plainly so nobody reads a low average as a low effort. */
  var gaps=[["food",m.cnt.food,"Food"],["steps",m.cnt.steps,"Steps"],["sleep",m.cnt.sleep,"Sleep"],["weight",m.cnt.weight,"Weigh-ins"]];
  var any=false;
  gaps.forEach(function(x){
    if(x[1]>=m.n)return;
    any=true;
    w.push(repWin("!","a",x[2]+" missing on "+repPlural(m.n-x[1],"day","days"),
      "Period averages divide by "+m.n+", so they read low — the logged-day figures below are the fair ones",x[1]+"/"+m.n));});
  if(!any&&m.n>1)w.push(repWin("✓","g","Nothing missing","Every metric has an entry on every day of the "+m.periodWord,"100%"));
  return '<div class="sec"><div class="secH">The '+esc(m.periodWord)+' at a glance</div><div class="wins">'+w.join("")+'</div></div>';}
/* ---- weight, day by day (inline SVG, coordinates precomputed here) ---- */
function repChartSVG(m){
  var X0=8,X1=292,Y0=20,Y1=68,rows=m.rows;
  var idx=[];rows.forEach(function(r,i){if(r.weight!=null)idx.push(i);});
  if(!idx.length)return "";
  /* a multi-year history would otherwise emit thousands of points into a 284px-wide
     polyline; sample down to a shape the eye can still read and the file can carry */
  var MAXP=140;
  if(idx.length>MAXP){var keep=[],seen={};
    for(var j=0;j<MAXP;j++){var k=idx[Math.round(j*(idx.length-1)/(MAXP-1))];if(!seen[k]){seen[k]=1;keep.push(k);}}
    idx=keep;}
  var lo=m.wMin,hi=m.wMax,span=(hi-lo)||1;
  var denom=(rows.length>1)?(rows.length-1):1;
  function px(i){return (rows.length>1)?r1(X0+(X1-X0)*i/denom):r1((X0+X1)/2);}
  function py(w){return (hi===lo)?44:r1(Y0+(Y1-Y0)*(hi-w)/span);}
  var pts=idx.map(function(i){return px(i)+","+py(rows[i].weight);});
  var lastX=px(idx[idx.length-1]),lastY=py(rows[idx[idx.length-1]].weight);
  var avgY=(m.wAvg==null)?44:py(m.wAvg);
  var h='<svg viewBox="0 0 300 96" role="img" aria-label="Weight over the reporting period">';
  h+='<defs><linearGradient id="repGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#E09B1F"/><stop offset="100%" stop-color="#2E9E75"/></linearGradient></defs>';
  h+='<line x1="8" y1="'+avgY+'" x2="292" y2="'+avgY+'" stroke="#E8E4DE" stroke-width="1.5" stroke-dasharray="4 4"/>';
  if(pts.length>1)h+='<polyline points="'+pts.join(" ")+'" fill="none" stroke="url(#repGrad)" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/>';
  h+='<circle cx="'+lastX+'" cy="'+lastY+'" r="9" fill="#2E9E75" opacity=".18"/>';
  h+='<circle cx="'+lastX+'" cy="'+lastY+'" r="5" fill="#2E9E75" stroke="#fff" stroke-width="2"/>';
  if(m.wAvg!=null)h+='<text x="8" y="'+r1(Math.max(11,avgY-3))+'" font-family="ui-monospace,Menlo,monospace" font-size="9" fill="#98A0AE">AVG '+repWt(m.wAvg)+'</text>';
  return h+'</svg>';}
function repAxisHTML(m){
  var rows=m.rows,out=[];
  if(m.mode==="week"&&rows.length<=8){
    rows.forEach(function(r){out.push('<span>'+esc(r.dow.slice(0,1))+'</span>');});
  }else{
    out.push('<span>'+esc(fmtShort(m.startD))+'</span>');
    if(rows.length>2)out.push('<span>'+esc(fmtShort(parseISO(rows[Math.floor(rows.length/2)].date)))+'</span>');
    out.push('<span>'+esc(fmtShort(m.endD))+'</span>');}
  return '<div class="axis">'+out.join("")+'</div>';}
function repWeightHTML(m){
  var h='<div class="sec"><div class="secH">Weight, day by day</div><div class="card">';
  if(!m.wts.length)return h+'<div class="rnote bare">No weigh-ins were logged in this '+esc(m.periodWord)+', so there is no line to draw. Everything below still counts.</div></div></div>';
  if(m.wts.length===1)
    return h+'<div class="rnote bare">A single weigh-in this '+esc(m.periodWord)+': <b>'+repWt(m.wts[0].weight)+' '+esc(m.units)+'</b> on '+esc(m.wts[0].dow)+'. Two or more readings and this becomes a trend.</div></div></div>';
  h+='<div class="spark">'+repChartSVG(m)+repAxisHTML(m)+'</div>';
  var dirTxt,basis=(m.chgBasis==="week")?"on last week’s average":"from the first reading to the last";
  if(m.chg==null||Math.abs(m.chg)<m.moveThr)dirTxt="Effectively flat "+basis+" — inside "+repWt(m.moveThr)+" "+esc(m.units)+", which is scale noise.";
  else dirTxt=(m.chg<0?"Down ":"Up ")+"<b>"+repWt(Math.abs(m.chg))+" "+esc(m.units)+"</b> "+basis+".";
  h+='<div class="rnote">'+dirTxt+' Ranged <b>'+repWt(m.wMin)+'</b> to <b>'+repWt(m.wMax)+'</b> across '+repPlural(m.wts.length,"weigh-in","weigh-ins")+
    (m.wLowRow?(", with the lowest reading on "+esc(m.wLowRow.dow)+" "+esc(fmtShort(parseISO(m.wLowRow.date)))):"")+'.</div>';
  return h+'</div></div>';}
/* ---- nutrition: four rings against the period goal, plus the honest caption ---- */
function repRingSVG(pct,color){
  var C=163.4,frac=(pct==null)?0:Math.max(0,Math.min(1,pct/100));
  var label=(pct==null)?"no goal set":(pct+" percent of the period goal");
  var h='<svg viewBox="0 0 64 64" role="img" aria-label="'+label+'">';
  h+='<circle cx="32" cy="32" r="26" fill="none" stroke="#EFEBE4" stroke-width="7"/>';
  if(frac>0)h+='<circle cx="32" cy="32" r="26" fill="none" stroke="'+color+'" stroke-width="7" stroke-linecap="round" stroke-dasharray="'+r1(C*frac)+' '+C+'" transform="rotate(-90 32 32)"/>';
  h+='<text x="32" y="36" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-size="'+((pct!=null&&pct>=1000)?11:14)+'" font-weight="600" fill="#15181D">'+((pct==null)?"—":(pct+"%"))+'</text>';
  return h+'</svg>';}
function repRingHTML(m,key,label,unit,statusColoured){
  var goal=m.goal[key],tot=m.tot[key],periodGoal=(goal!=null)?goal*m.n:null;
  /* No goal set -> an empty track and a dash. Dividing by a missing goal would
     print Infinity%, which is worse than saying nothing. */
  var pct=(periodGoal>0)?Math.round(tot/periodGoal*100):null;
  var color="#B8BEC9";
  if(statusColoured&&pct!=null){
    var tone=(key==="calories")?repCalTone(m.lAvg(key),goal,m.strategy):repTone(m.lAvg(key),goal,"up");
    color=(tone==="g")?"#2E9E75":"#E09B1F";}
  return '<div class="ring">'+repRingSVG(pct,color)+'<div class="rk">'+esc(label)+'</div>'+
    '<div class="rv">'+repInt(tot)+(unit?" "+unit:"")+'</div>'+
    '<div class="rg">'+(periodGoal!=null?("/ "+repInt(periodGoal)):"no goal")+'</div></div>';}
function repNutritionHTML(m){
  var h='<div class="sec"><div class="secH">Nutrition</div><div class="card">';
  if(!m.cnt.food)return h+'<div class="rnote bare">No food was logged in this '+esc(m.periodWord)+'. Nothing here is a judgement — there is simply nothing to measure.</div></div></div>';
  h+='<div class="rings">'+
    repRingHTML(m,"calories","Cals","",true)+
    repRingHTML(m,"protein","Protein","g",true)+
    repRingHTML(m,"fat","Fat","g",false)+
    repRingHTML(m,"carbs","Carbs","g",false)+'</div>';
  /* The rings divide by the whole period. Where days are missing that understates
     everything, so the caption states BOTH averages side by side: the period one
     (what the rings show) and the logged-day one (what actually happened). */
  var lines=[];
  ["calories","protein"].forEach(function(k){
    if(!m.cnt[k])return;
    var nm=(k==="calories")?"Calories":"Protein",un=(k==="calories")?"":" g",g=m.goal[k];
    var la=m.lAvg(k),vs=(g!=null)?(" — "+repInt(Math.abs(la-g))+un+" "+((la-g)>=0?"over":"under")+" target"):"";
    if(m.cnt[k]<m.n)lines.push(nm+" averaged <b>"+repInt(m.pAvg(k))+un+"</b> a day across all "+m.n+
      ", but <b>"+repInt(la)+un+"</b> across the "+m.cnt[k]+" you logged"+vs+".");
    else lines.push(nm+" averaged <b>"+repInt(la)+un+"</b> a day"+vs+".");});
  var note=(m.cnt.food<m.n)
    ? ('Those rings measure against a '+m.n+'-day goal, and food was logged on <b>'+m.cnt.food+'</b> of those days, so they read low. '+lines.join(" "))
    : ('Food was logged on <b>every one of the '+m.n+' days</b>, so these rings are the whole picture. '+lines.join(" "));
  return h+'<div class="rnote">'+note+'</div></div></div>';}
/* ---- training ---- */
function repSessDetail(s){
  /* csvSessLine owns the "what is worth printing about a session" rule; pass an
     empty name so we get only the detail half, since the title already shows it */
  return csvSessLine("",s).replace(/^,\s*/,"");}
function repTrainCard(kind,kicker,title,detail,note){
  return '<div class="trn"><div class="tIc">'+REPICON[kind]+'</div><div class="tB">'+
    '<div class="tK">'+esc(kicker)+'</div><div class="tT">'+esc(title)+'</div>'+
    (detail?'<div class="tD">'+esc(detail)+'</div>':'')+
    (note?'<div class="tN">“'+esc(note)+'”</div>':'')+'</div></div>';}
function repTrainingHTML(m){
  var h='<div class="sec"><div class="secH">Training</div>';
  if(!m.cardio.length&&!m.lift.length)
    return h+'<div class="card"><div class="rnote bare">No cardio or lifting sessions were logged in this '+esc(m.periodWord)+'.</div></div></div>';
  if(m.mode==="all"){
    /* a full history can hold hundreds of sessions; per-session cards would bury the
       report, so the long view summarises and the CSV keeps every row */
    if(m.cardio.length)h+=repTrainCard("cardio","Cardio · zone 2+","Cardio, "+repPlural(m.cardio.length,"session","sessions"),
      repInt(m.cardioMins)+" minutes in total"+(m.n?(" · "+repWt(m.cardioMins/m.n*7)+" min a week"):""),"");
    if(m.lift.length)h+=repTrainCard("lift","Lifting","Lifting, "+repPlural(m.lift.length,"session","sessions"),
      repInt(m.liftMins)+" minutes in total"+(m.n?(" · "+repWt(m.liftMins/m.n*7)+" min a week"):""),"");
    return h+'</div>';}
  m.cardio.forEach(function(x){
    var mn=num(x.s.mins);
    h+=repTrainCard("cardio","Cardio"+(mn!=null?(" · "+Math.round(mn)+" min"):"")+" · "+fmtShort(parseISO(x.row.date)),
      x.s.type||"Cardio",repSessDetail(x.s),(x.s.notes||"").trim());});
  m.lift.forEach(function(x){
    var mn2=num(x.s.mins);
    h+=repTrainCard("lift","Lifting"+(mn2!=null?(" · "+Math.round(mn2)+" min"):"")+" · "+fmtShort(parseISO(x.row.date)),
      x.s.name||"Weight training",repSessDetail(x.s),(x.s.notes||"").trim());});
  return h+'</div>';}
/* ---- every day ---- */
function repDayChipsHTML(m,r){
  var c=[],g=m.goal;
  if(r.steps!=null)c.push(repChip(repInt(r.steps)+' <b>steps</b>',repTone(r.steps,g.steps,"up")));
  if(r.sleep!=null)c.push(repChip(minToHM(r.sleep)+' <b>sleep</b>',repTone(r.sleep,g.sleep,"up")));
  if(r.calories!=null)c.push(repChip(repInt(r.calories)+' <b>kcal</b>'+((g.calories!=null)?(" "+repDelta(r.calories-g.calories)):""),
    repCalTone(r.calories,g.calories,m.strategy)));
  var mac=[];
  if(r.protein!=null)mac.push(Math.round(r.protein)+'<b>p</b>');
  if(r.fat!=null)mac.push(Math.round(r.fat)+'<b>f</b>');
  if(r.carbs!=null)mac.push(Math.round(r.carbs)+'<b>c</b>');
  if(mac.length)c.push(repChip(mac.join(" "),""));
  if(r.fiber!=null)c.push(repChip(Math.round(r.fiber)+' <b>fiber</b>',""));
  (r.activities||[]).forEach(function(a){c.push('<span class="chip act">'+esc(a)+'</span>');});
  return c.length?('<div class="chips">'+c.join("")+'</div>'):'';}
function repDaysHTML(m){
  var rows=m.rows,truncated=0,MAXD=60;
  if(rows.length>MAXD){truncated=rows.length-MAXD;rows=rows.slice(-MAXD);}
  var h='<div class="sec"><div class="secH">Every day</div>';
  if(truncated)h+='<div class="trunc">Showing the most recent '+MAXD+' days. The '+truncated+' earlier days are in the CSV exported alongside this file.</div>';
  rows.forEach(function(r){
    var d=parseISO(r.date);
    h+='<div class="dayC"><div class="dTop"><span class="dDay">'+esc(r.dow)+'</span><span class="dDate">'+esc(fmtShort(d))+'</span>'+
      (r.weight!=null?('<span class="dW">'+repWt(r.weight)+'<s>'+esc(m.units)+'</s></span>'):'')+'</div>';
    var chips=repDayChipsHTML(m,r);
    h+=chips;
    if(!chips){
      h+='<div class="dEmpty">'+(r.weight!=null
        ? "Weighed in — no food, steps or sleep recorded."
        : (r.note?"A check-in note only — nothing measured this day.":"Nothing logged on this day."))+'</div>';}
    if(r.note)h+='<div class="dNote">“'+esc(r.note)+'”</div>';
    h+='</div>';});
  return h+'</div>';}
/* ---- the closing nudge: one lever, chosen from the data ---- */
function repCloseHTML(m){
  var g=m.goal,msg=null;
  if(g.sleep!=null&&m.cnt.sleep>0&&m.lAvg("sleep")<g.sleep-15)
    msg="The one lever left untouched is <b>sleep</b> — "+minToHM(Math.round(g.sleep-m.lAvg("sleep")))+" short a night against your "+minToHM(g.sleep)+" goal. Fix that first; it tends to drag steps and appetite along with it.";
  else if(m.cnt.food<m.n)
    msg="Food went unlogged on "+repPlural(m.n-m.cnt.food,"day","days")+". The days you logged were on plan — close the <b>logging gap</b> and the numbers will finally say what you actually did.";
  else if(g.steps!=null&&m.cnt.steps>0&&m.lAvg("steps")<g.steps)
    msg="Everything else is holding. The gap is <b>steps</b> — "+repInt(g.steps-m.lAvg("steps"))+" a day short of your "+repInt(g.steps)+" target, which is a walk, not a workout.";
  else if(g.protein!=null&&m.cnt.protein>0&&m.lAvg("protein")<g.protein)
    msg="Protein averaged "+repInt(m.lAvg("protein"))+" g against a "+repInt(g.protein)+" g target. In a "+m.plan.toLowerCase()+" phase that is the number that protects <b>muscle</b> — hold it and the rest follows.";
  else if(m.chgGood===false)
    msg="The scale moved the wrong way this "+m.periodWord+". One "+m.periodWord+" is noise, not a verdict — hold every target exactly where it is and read it again next time.";
  else
    msg="Nothing in this "+m.periodWord+" asks for a change. Hold the same targets, keep logging every day, and let it compound.";
  return '<div class="close"><div class="k">'+((m.mode==="week")?"Next week":"What’s next")+'</div><p>'+msg+'</p></div>';}
function repFootHTML(m){
  return '<div class="foot">COMPOUND · exported '+esc(m.today)+'<br/>Weight in '+esc(m.units)+
    ' · macros in grams · sleep as h:mm · days with no entry are called out, never blanked</div>';}
/* ---- the document ---- */
function repHTML(days,opts){
  var m=repModel(days,opts);
  var title="Compound — "+(m.name?(m.name+" — "):"")+repRangeText(m);
  var h='<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n';
  h+='<title>'+esc(title)+'</title>\n';
  h+='<meta name="viewport" content="width=device-width, initial-scale=1">\n';
  h+='<style>'+REPCSS+'</style>\n</head>\n<body>\n';
  h+=repHeroHTML(m)+'\n<div class="wrap">\n';
  h+=repGlanceHTML(m)+'\n'+repWeightHTML(m)+'\n'+repNutritionHTML(m)+'\n'+repTrainingHTML(m)+'\n'+repDaysHTML(m)+'\n';
  h+=repCloseHTML(m)+'\n'+repFootHTML(m)+'\n</div>\n</body>\n</html>\n';
  return h;}
/* Both export buttons now emit TWO files: the machine-readable CSV (unchanged) and
   a human-readable standalone HTML report. The CSV is the archive; the report is
   the thing you actually read on your phone. */
function exportWeekFiles(){var days=weekDays(state.weekOffset).map(dayRow);var ws=weekStartFor(state.weekOffset);var base="weight-summary-"+toISO(ws);
  shareOrDownloadMulti([{name:base+".csv",mime:"text/csv",text:csvFor(days,"Weekly")},
    {name:base+".html",mime:"text/html;charset=utf-8",text:repHTML(days,{mode:"week",weekOffset:state.weekOffset,ws:ws})}]);}
function exportAllFiles(){var set={};state.weights.forEach(function(x){set[x.date]=1;});Object.keys(state.food).forEach(function(k){set[k]=1;});Object.keys(state.steps).forEach(function(k){set[k]=1;});Object.keys(state.sleep).forEach(function(k){set[k]=1;});Object.keys(state.workouts).forEach(function(k){set[k]=1;});
  /* training-only days must appear too, now that cardio/lifting are exported */
  Object.keys(((state.training||{}).sessions)||{}).forEach(function(k){set[k]=1;});Object.keys(((state.training||{}).liftSessions)||{}).forEach(function(k){set[k]=1;});
  var days=Object.keys(set).sort().map(function(iso){return dayRow(parseISO(iso));});
  if(!days.length){toast("No data to export");return;}
  var base="weight-history-"+todayISO();
  shareOrDownloadMulti([{name:base+".csv",mime:"text/csv",text:csvFor(days,"Period")},
    {name:base+".html",mime:"text/html;charset=utf-8",text:repHTML(days,{mode:"all"})}]);}
/* One share sheet for the WHOLE bundle. iOS grants navigator.share exactly one call
   per user gesture, so calling it once per file silently drops everything after the
   first; passing both files to a single share is the only reliable sequencing. */
function shareOrDownloadMulti(list){
  var files=[];
  for(var i=0;i<list.length;i++){
    var it=list[i],text=it.text,mime=it.mime||"text/plain";
    /* Excel opens a BOM-less CSV as Windows-1252, so UTF-8 curly apostrophes (iOS
       autocorrects the typed quote to U+2019) come out garbled. A UTF-8 BOM makes
       Excel/Numbers detect the encoding correctly. CSV only - a BOM would break
       JSON parsers, ICS readers, and (as a stray glyph before <!doctype) HTML. */
    if(/^text\/csv/.test(mime)){text="\uFEFF"+text;mime="text/csv;charset=utf-8";}
    files.push({name:it.name,mime:mime,text:text});}
  try{var fl=files.map(function(f){return new File([f.text],f.name,{type:f.mime});});
    if(navigator.canShare&&navigator.canShare({files:fl})){navigator.share({files:fl,title:files[0].name}).catch(function(){});return;}}catch(e){}
  /* Download fallback (desktop, and iOS when the share sheet refuses a multi-file
     bundle): browsers drop back-to-back programmatic downloads, so stagger them. */
  files.forEach(function(f,i){setTimeout(function(){repDownloadFile(f);},i*400);});
  toast(files.length>1?("Exported "+files.length+" files"):"Exported");}
function repDownloadFile(f){
  var blob=new Blob([f.text],{type:f.mime});var url=URL.createObjectURL(blob);
  var a=document.createElement("a");a.href=url;a.download=f.name;document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(function(){URL.revokeObjectURL(url);},1000);}
function shareOrDownload(name,mime,text){shareOrDownloadMulti([{name:name,mime:mime,text:text}]);}