function maxMoodHTML(mood){
  var m=String(mood||"").toLowerCase();
  if(!MAXFACE[m])return "";
  return '<div class="wl-maxmood"><img src="'+MAXFACE[m]+'" alt="Coach Max" class="wl-maxmood-img"></div>';}
function renderSummary(t){var o=esc(t);o=o.replace(/\*\*(.+?)\*\*/g,"<b>$1</b>");o=o.replace(/^\s*[-*]\s+/gm,"• ");o=o.replace(/\n/g,"<br>");return o;}
function weeklyAIText(){
  var u=state.settings.units;
  var avg=function(a){return a.length?Math.round(a.reduce(function(x,y){return x+y;},0)/a.length):null;};
  function summ(off){var days=weekDays(off).map(dayRow);
    return {days:days,
      wv:days.map(function(d){return d.weight;}).filter(function(x){return x!=null;}),
      steps:days.map(function(d){return d.steps;}).filter(function(x){return x!=null;}),
      sleep:days.map(function(d){return d.sleep;}).filter(function(x){return x!=null;}),
      cals:days.map(function(d){return d.calories;}).filter(function(x){return x!=null;}),
      prot:days.map(function(d){return d.protein;}).filter(function(x){return x!=null;}),
      fat:days.map(function(d){return d.fat;}).filter(function(x){return x!=null;}),
      carb:days.map(function(d){return d.carbs;}).filter(function(x){return x!=null;})};}
  function acts(days){var a={};days.forEach(function(d){d.activities.forEach(function(x){a[x]=(a[x]||0)+1;});});return a;}
  function loggedCount(days){return days.filter(function(d){return d.weight!=null||d.steps!=null||d.sleep!=null||d.calories!=null||d.activities.length;}).length;}
  var t=summ(0),p=summ(-1);
  var s=weekStartFor(0),e=addDays(s,6);
  var curW=t.wv.length?t.wv[t.wv.length-1]:null;var wChange=t.wv.length>=2?(t.wv[t.wv.length-1]-t.wv[0]):null;
  var al=Object.keys(acts(t.days)).map(function(a){return a+" x"+acts(t.days)[a];});
  var L=[];
  L.push("Weekly check-in for "+(state.settings.name||"me")+" — "+fmtShort(s)+" to "+fmtShort(e)+". Units: "+u+".");
  L.push("Goals: target weight "+(num(state.settings.goalWeight)!=null?r1(num(state.settings.goalWeight))+" "+u:"not set")+"; steps "+(state.settings.stepsGoal||"not set")+"/day; sleep "+(sleepGoalMin()!=null?minToHM(sleepGoalMin()):"not set")+"; calories "+(num(state.settings.targetCalories)!=null?num(state.settings.targetCalories):"not set")+"/day.");
  L.push("Weight: "+(curW!=null?curW+" "+u:"not logged")+(wChange!=null?" ("+(wChange<=0?"down ":"up ")+Math.abs(r1(wChange))+" "+u+" over the week)":"")+". Weekly avg "+(avg(t.wv)!=null?avg(t.wv)+" "+u:"n/a")+" vs "+(avg(p.wv)!=null?avg(p.wv)+" "+u:"n/a")+" last week.");
  L.push("Steps: avg "+(avg(t.steps)!=null?avg(t.steps).toLocaleString():"none")+"/day vs "+(avg(p.steps)!=null?avg(p.steps).toLocaleString():"none")+" last week ("+t.steps.length+"/7 days logged).");
  L.push("Sleep: avg "+(avg(t.sleep)!=null?minToHM(avg(t.sleep)):"none")+"/night vs "+(avg(p.sleep)!=null?minToHM(avg(p.sleep)):"none")+" last week.");
  L.push("Calories: avg "+(avg(t.cals)!=null?avg(t.cals).toLocaleString():"none")+"/day; macros avg protein "+(avg(t.prot)!=null?avg(t.prot)+"g":"n/a")+", carbs "+(avg(t.carb)!=null?avg(t.carb)+"g":"n/a")+", fat "+(avg(t.fat)!=null?avg(t.fat)+"g":"n/a")+" ("+t.cals.length+"/7 days logged).");
  L.push("Activities: "+(al.length?al.join(", "):"none logged")+". Days logged: "+loggedCount(t.days)+"/7.");
  L.push("");
  L.push("Please give a short, encouraging but honest weekly check-in: what went well, one or two things to watch, and one concrete suggestion for next week. Keep it motivating and practical — no medical advice or diagnosis.");
  return L.join("\n");
}
function ckRow(done,label,val,sec,optional){
  var ic=done?'<span class="wl-ck-ic done"></span>':(optional?'<span class="wl-ck-ic opt">◦</span>':'<span class="wl-ck-ic miss">!</span>');
  return '<button class="wl-ck-row" data-act="dl:open" data-sec="'+sec+'"><span class="wl-ck-l">'+ic+'<span class="wl-ck-lab">'+label+'</span></span><span class="wl-ck-val'+(done?"":" empty")+'">'+esc(val)+'</span><span class="wl-ck-go">›</span></button>';
}
function ckCalories(sel){
  var f=state.food[sel]||{};var cal=num(f.calories),p=num(f.protein),cb=num(f.carbs),ft=num(f.fat);
  var has=cal!=null||p!=null||cb!=null||ft!=null;
  if(!has)return '<button class="wl-ck-row" data-act="dl:open" data-sec="calories"><span class="wl-ck-l"><span class="wl-ck-ic miss">!</span><span class="wl-ck-lab">Calories</span></span><span class="wl-ck-val empty">Add</span><span class="wl-ck-go">›</span></button>';
  var tg=num(state.settings.targetCalories);
  var tCarb=num(state.settings.targetCarbs),tFat=num(state.settings.targetFat),tProt=num(state.settings.targetProtein);
  var calOver=(tg!=null&&cal!=null&&cal>tg);
  var carbOver=calOver&&(tCarb!=null&&cb!=null&&cb>tCarb);
  var fatOver=calOver&&(tFat!=null&&ft!=null&&ft>tFat);
  var protLow=(tProt!=null&&p!=null&&p<tProt*0.9);
  var calWayOver=(tg!=null&&cal!=null&&cal>tg*1.15);
  var calStyle=calWayOver?' style="color:var(--bad)"':(calOver?' style="color:var(--accent)"':'');
  var h='<button class="wl-ck-row col" data-act="dl:open" data-sec="calories"><div class="wl-ck-top"><span class="wl-ck-l"><span class="wl-ck-ic done"></span><span class="wl-ck-lab">Calories</span></span><span class="wl-ck-val"'+calStyle+'>'+(cal!=null?Math.round(cal).toLocaleString():"—")+(tg!=null?' <span style="color:var(--faint);font-weight:600">/ '+tg.toLocaleString()+'</span>':'')+'</span><span class="wl-ck-go">›</span></div>';
  if(p!=null||cb!=null||ft!=null){var P=(p||0)*4,C=(cb||0)*4,F=(ft||0)*9;var tot=(P+C+F)||1;
    var pCol=protLow?"var(--bad)":"var(--mac-p)",cCol=carbOver?"var(--accent)":"var(--mac-c)",fCol=fatOver?"var(--accent)":"var(--mac-f)";
    h+='<div class="wl-mbar"><i style="width:'+(P/tot*100)+'%;background:'+pCol+'"></i><i style="width:'+(C/tot*100)+'%;background:'+cCol+'"></i><i style="width:'+(F/tot*100)+'%;background:'+fCol+'"></i></div>';
    h+='<div class="wl-mlegend"><div class="wl-mseg"><div class="k" style="color:'+pCol+'">Protein</div><div class="v"'+(protLow?' style="color:var(--bad)"':'')+'>'+(p!=null?p+"g":"—")+'</div></div><div class="wl-mseg"><div class="k" style="color:'+cCol+'">Carbs</div><div class="v"'+(carbOver?' style="color:var(--accent)"':'')+'>'+(cb!=null?cb+"g":"—")+'</div></div><div class="wl-mseg"><div class="k" style="color:'+fCol+'">Fat</div><div class="v"'+(fatOver?' style="color:var(--accent)"':'')+'>'+(ft!=null?ft+"g":"—")+'</div></div></div>';}
  return h+'</button>';
}
/* ============================================================================
   How you felt — six daily subjective ratings (Owner-approved 2026-08-03)
   Stored on state.ratings[iso] as stable enum strings, never the visible label,
   so wording can change without a data migration. An unset rating is null and
   NEVER blocks "Complete today". Each option carries a goodness score 1..5
   (1 worst, 5 best) so scales that are best-in-the-middle (Hunger) or
   best-at-zero (Stress) chart in the same direction as the rest.
   ==========================================================================*/
var RATINGS=[
  ["hunger","Hunger",[["too_low","Too low","Too low",1],["slightly_low","Slightly low","Low",3],["just_right","Just right","Right",5],["slightly_high","Slightly high","High",3],["too_high","Too high","Too high",1]],"off target"],
  ["sleepQuality","Sleep quality",[["very_poor","Very poor","V. poor",1],["poor","Poor","Poor",2],["okay","Okay","Okay",3],["good","Good","Good",4],["excellent","Excellent","Great",5]],"okay or worse"],
  ["stress","Stress",[["none","None","None",5],["a_little","A little","Little",4],["some","Some","Some",3],["high","High","High",2],["very_high","Very high","V. high",1]],"elevated"],
  ["recovery","Recovery",[["very_poor","Very poor","V. poor",1],["poor","Poor","Poor",2],["okay","Okay","Okay",3],["good","Good","Good",4],["excellent","Excellent","Great",5]],"okay or worse"],
  ["energy","Energy",[["very_low","Very low","V. low",1],["low","Low","Low",2],["okay","Okay","Okay",3],["good","Good","Good",4],["excellent","Excellent","Great",5]],"okay or worse"],
  ["digestion","Digestion",[["very_poor","Very poor","V. poor",1],["poor","Poor","Poor",2],["okay","Okay","Okay",3],["good","Good","Good",4],["excellent","Excellent","Great",5]],"okay or worse"]
];
function ratQ(key){for(var i=0;i<RATINGS.length;i++){if(RATINGS[i][0]===key)return RATINGS[i];}return null;}
function ratOpt(key,val){var q=ratQ(key);if(!q||!val)return null;for(var i=0;i<q[2].length;i++){if(q[2][i][0]===val)return q[2][i];}return null;}
function ratLabel(key,val){var o=ratOpt(key,val);return o?o[1]:null;}
function ratGood(key,val){var o=ratOpt(key,val);return o?o[3]:null;}
function ratFor(iso){var r=(state.ratings||{})[iso];return (r&&typeof r==="object")?r:{};}
function ratCount(iso){var r=ratFor(iso),n=0;RATINGS.forEach(function(q){if(ratOpt(q[0],r[q[0]]))n++;});return n;}
/* Tapping the chosen chip again clears it — a mis-tap must be correctable, and
   an unanswered question is a legitimate final state. */
function ratSet(iso,key,val){
  if(!ratOpt(key,val))return;
  var all=state.ratings||(state.ratings={});
  var r=all[iso]||(all[iso]={});
  r[key]=(r[key]===val)?null:val;
  var any=false;RATINGS.forEach(function(q){if(r[q[0]])any=true;});
  if(!any)delete all[iso];
  save();
}
/* The collapsed row. Opening it raises the same sheet the other check-in rows
   use (Owner 2026-08-03: a screen like Calories, not an accordion). */
function ckFeel(sel){
  var n=ratCount(sel),tot=RATINGS.length;
  var ic=(n===tot)?'<span class="wl-ck-ic done"></span>':'<span class="wl-ck-ic opt">◦</span>';
  return '<button class="wl-ck-row" data-act="dl:open" data-sec="feel"><span class="wl-ck-l">'+ic+'<span class="wl-ck-lab">How you felt</span></span><span class="wl-ck-val'+(n?'':' empty')+'">'+(n?n+" of "+tot:"Add")+'</span><span class="wl-ck-go">›</span></button>';
}
/* The body of that sheet — six questions, five chips each. */
function feelSheetBody(sel){
  var r=ratFor(sel);
  var h='';
  RATINGS.forEach(function(q){
    var cur=r[q[0]]||null,lab=ratLabel(q[0],cur),qid="feelq-"+q[0];
    h+='<div class="wl-feelq" role="group" aria-labelledby="'+qid+'"><div class="wl-feelq-h"><span id="'+qid+'">'+q[1]+'</span><span class="'+(lab?"a":"na")+'">'+(lab||"Not answered")+'</span></div><div class="wl-feelchips">';
    q[2].forEach(function(o){
      h+='<button class="wl-feelchip'+(cur===o[0]?" on":"")+'" data-act="rat:set" data-date="'+sel+'" data-q="'+q[0]+'" data-v="'+o[0]+'" aria-pressed="'+(cur===o[0]?"true":"false")+'"><span class="dot"></span><span class="lg">'+o[1]+'</span><span class="sm">'+o[2]+'</span></button>';
    });
    h+='</div></div>';
  });
  return h+'<div class="wl-hint" style="margin-top:16px">Optional — this never blocks completing your day. Coach Max reads the trend, not any single day.</div>';
}
/* ---- trend maths ---- */
function feelDays(n,endISO){var out=[],d=parseISO(endISO||todayISO());d.setDate(d.getDate()-(n-1));
  for(var i=0;i<n;i++){out.push(toISO(d));d.setDate(d.getDate()+1);}return out;}
function feelGoodOn(key,iso){return ratGood(key,ratFor(iso)[key]);}
var FEELCOL=["#F26D5B","#EF9A5A","#E9C55E","#A8D77E","#5CD6A0"];
function feelColor(g){return FEELCOL[Math.max(1,Math.min(5,g))-1];}
function feelMean(key,isos){var sum=0,n=0;isos.forEach(function(d){var g=feelGoodOn(key,d);if(g!=null){sum+=g;n++;}});return n?{avg:sum/n,n:n}:null;}
/* improving / steady / falling from the trailing 7-day mean against the prior 7 */
function feelTrend(key,endISO){
  var d14=feelDays(14,endISO),cur=feelMean(key,d14.slice(7)),prev=feelMean(key,d14.slice(0,7));
  if(!cur||cur.n<2)return {dir:"none",cur:cur,prev:prev};
  if(!prev||prev.n<2)return {dir:"new",cur:cur,prev:prev};
  var d=cur.avg-prev.avg;
  return {dir:(d>=0.35?"up":(d<=-0.35?"dn":"flat")),cur:cur,prev:prev};
}
function feelTagHTML(t){
  if(t.dir==="up")return '<span class="wl-ftag up">improving</span>';
  if(t.dir==="dn")return '<span class="wl-ftag dn">falling</span>';
  if(t.dir==="flat")return '<span class="wl-ftag fl">steady</span>';
  if(t.dir==="new")return '<span class="wl-ftag fl">first week</span>';
  return '<span class="wl-ftag fl">—</span>';
}
function feelAnyAnswered(isos){for(var i=0;i<isos.length;i++){if(ratCount(isos[i]))return true;}return false;}
/* The colour-bar block: one row per question, oldest -> today, tallest = best,
   flat grey = not answered. Used in the coach recap, on the Progress tab and in
   the weekly check-in form so all three read identically. */
function feelBarsHTML(endISO,n){
  n=n||14;var isos=feelDays(n,endISO);
  var h='';
  RATINGS.forEach(function(q){
    var t=feelTrend(q[0],endISO),bars='';
    isos.forEach(function(d){var g=feelGoodOn(q[0],d);
      bars+=(g==null)?'<i style="height:3px" title="'+d+' — not answered"></i>'
                     :'<i style="height:'+Math.round(g/5*100)+'%;background:'+feelColor(g)+'" title="'+d+' — '+ratLabel(q[0],ratFor(d)[q[0]])+'"></i>';});
    h+='<div class="wl-frow"><span class="k">'+q[1]+'</span><span class="wl-fbars">'+bars+'</span>'+feelTagHTML(t)+'</div>';
  });
  return h;
}
/* Plain language for the coach: which ratings are low or falling, and for how
   long, cross-referenced with the current compound step. Ranked worst first and
   capped at three — a line that names everything names nothing. */
var FEEL_WATCH_MAX=3;
function feelWatchHTML(endISO){
  var isos=feelDays(14,endISO),low=[],falling=[];
  RATINGS.forEach(function(q){
    var run=0,sum=0;
    for(var i=isos.length-1;i>=0;i--){var g=feelGoodOn(q[0],isos[i]);if(g==null)continue;if(g<=3){run++;sum+=g;}else break;}
    if(run>=3)low.push({q:q,run:run,avg:sum/run});
    if(feelTrend(q[0],endISO).dir==="dn")falling.push(q);
  });
  low.sort(function(a,b){return (a.avg-b.avg)||(b.run-a.run);});
  var shown=low.slice(0,FEEL_WATCH_MAX),extra=low.length-shown.length;
  var parts=shown.map(function(x){return "<b>"+x.q[1].toLowerCase()+"</b> "+x.q[3]+" "+x.run+" days running";});
  if(extra)parts.push(extra+" other"+(extra>1?"s":"")+" also low");
  var fOnly=falling.filter(function(q){return !low.some(function(x){return x.q[0]===q[0];});})
                   .slice(0,FEEL_WATCH_MAX).map(function(q){return q[1].toLowerCase();});
  if(fOnly.length)parts.push("<b>"+fOnly.join(" and ")+"</b> "+(fOnly.length>1?"are":"is")+" trending down");
  var ph=feelPhase();
  if(!parts.length){
    if(!feelAnyAnswered(isos))return '';
    return '<div class="wl-fwatch">Nothing standing out — no rating has sat low for three days or more.'+(ph&&ph.label?' Current step: <b>'+esc(ph.label)+'</b>.':'')+'</div>';
  }
  return '<div class="wl-fwatch"><b>Watch:</b> '+parts.join("; ")+"."+(ph&&ph.label?' Current step <b>'+esc(ph.label)+'</b>, day '+ph.day+'.':'')+'</div>';
}
/* The current compound step: the most recent dose whose amount differs from the
   one before it. A titration is what makes a fortnight of ratings worth reading. */
function feelPhase(){
  var g=state.glp;if(!g||!g.compound)return null;
  var doses=(g.doses||[]).filter(function(d){return !d.skipped&&d.takenAt!=null;}).sort(function(a,b){return a.takenAt-b.takenAt;});
  if(!doses.length)return null;
  var startIdx=0;
  for(var i=doses.length-1;i>0;i--){if(String(doses[i].dose)!==String(doses[i-1].dose)){startIdx=i;break;}}
  var st=doses[startIdx];
  var startISO=toISO(new Date(st.takenAt));
  var day=Math.max(1,Math.round((parseISO(todayISO())-parseISO(startISO))/86400000)+1);
  var amt=(st.dose!=null&&st.dose!=="")?(st.dose+" "+(st.unit||"mg")):"";
  return {startISO:startISO,day:day,label:amt?(amt+" since "+fmtShort(parseISO(startISO))):null};
}
function feelPhaseStripHTML(){
  var ph=feelPhase();if(!ph)return '';
  var isos=[],d=parseISO(ph.startISO),end=parseISO(todayISO()),guard=0;
  while(d<=end&&guard++<120){isos.push(toISO(d));d.setDate(d.getDate()+1);}
  if(isos.length>42)isos=isos.slice(isos.length-42);
  if(!feelAnyAnswered(isos))return '';
  var bars='';
  isos.forEach(function(iso){
    var sum=0,n=0;RATINGS.forEach(function(q){var g=feelGoodOn(q[0],iso);if(g!=null){sum+=g;n++;}});
    bars+=n?'<i style="background:'+feelColor(Math.round(sum/n))+'" title="'+iso+'"></i>':'<i title="'+iso+' — not answered"></i>';
  });
  return '<div style="margin-top:16px"><div style="display:flex;justify-content:space-between;font-size:11.5px;font-weight:700;color:var(--muted)"><span>This compound phase</span><span>'+esc(ph.label||("day "+ph.day))+'</span></div><div class="wl-fphase">'+bars+'</div><div class="wl-hint" style="margin-top:6px">Each bar is one day’s average across the six questions, since your current dose step.</div></div>';
}
/* Progress tab card: this week per question, then the phase strip. */
function feelCardHTML(){
  var wk=toISO(weekStartFor(0)),isos=[],d=weekStartFor(0);
  for(var i=0;i<7;i++){isos.push(toISO(d));d.setDate(d.getDate()+1);}
  var today=todayISO();
  var h='<div class="wl-card"><div class="wl-card-head"><span>How you’ve felt</span><span class="wl-count">week of '+fmtShort(parseISO(wk))+'</span></div>';
  if(!feelAnyAnswered(feelDays(28,today)))
    return h+'<div class="wl-empty">Nothing logged yet. Open <b>How you felt</b> in your daily check-in — a few days is enough to show a trend.</div></div>';
  var dow=["S","M","T","W","T","F","S"];
  h+='<div class="wl-fgrid"><span></span><div class="wl-fdow">'+isos.map(function(x){return '<span>'+dow[parseISO(x).getDay()]+'</span>';}).join("")+'</div>';
  RATINGS.forEach(function(q){
    var cells='';
    isos.forEach(function(x){
      var g=(x<=today)?feelGoodOn(q[0],x):null;
      cells+=(g==null)?'<div class="wl-fcell na" title="'+x+' — not answered">–</div>'
                      :'<div class="wl-fcell" style="background:'+feelColor(g)+'" title="'+x+' — '+ratLabel(q[0],ratFor(x)[q[0]])+'">'+g+'</div>';
    });
    h+='<span class="k">'+q[1]+'</span><div class="wl-fcells">'+cells+'</div>';
  });
  h+='</div><div class="wl-hint" style="margin-top:8px">5 is best, 1 is worst. “–” means the day wasn’t answered — a gap is never read as a bad day.</div>';
  h+=feelPhaseStripHTML();
  return h+'</div>';
}
/* The daily recap deliberately does NOT render this trend (Owner, 2026-08-03:
   "Coach can have the data and comment, but no need to display it"). The
   ratings ride along in the synced record, so the coach reads them and writes
   about them in his own words; the charts live on the Progress tab and in the
   weekly check-in form, where they are asked for rather than pushed. */

/* ============================================================================
   Weekly check-in — the athlete answers only what the app cannot know.
   The entry point is the top of Home on the check-in day, taking the slot the
   progress-photo prompt used to hold (the photos are captured in the form now).
   The day comes from the EXISTING profile preference, settings.weekStart.
   ==========================================================================*/
var CI_ADHERENCE=[["off","Off plan"],["mostly_off","Mostly off"],["partly","Partly on"],["mostly_on","Mostly on"],["on","Fully on plan"]];
/* Adherence is MEASURED, not asked (Owner, 2026-08-03: "based on the data and
   not subjective to the user"). Each strand scores days-hit / days-with-a-goal,
   and only strands the athlete actually has a target for are counted — a member
   with no steps goal is not marked down for it. The breakdown is always shown
   next to the verdict, so it is never a black box. */
function ciAdherence(wk){
  var days=ciCoveredDays(wk).filter(function(x){return x<=todayISO();});
  if(!days.length)return null;
  var st=state.settings,strands=[];
  var tCal=num(st.targetCalories),tPro=num(st.targetProtein),tStep=num(st.stepsGoal),tSleep=sleepGoalMin();
  var count=function(f){var n=0;days.forEach(function(d){if(f(d))n++;});return n;};
  var mean=function(get){var t=0,n=0;days.forEach(function(d){var v=get(d);if(v!=null){t+=v;n++;}});return n?t/n:null;};
  if(tCal!=null){
    /* "lose" rewards being at or under target; a big overshoot is the miss */
    var lose=(st.strategy||"lose")==="lose";
    strands.push({key:"Calories",hit:count(function(d){var c=num((state.food[d]||{}).calories);
      return c!=null&&(lose?c<=tCal*1.05:Math.abs(c-tCal)<=tCal*0.1);}),
      of:days.length,
      avg:mean(function(d){return num((state.food[d]||{}).calories);}),
      fmt:function(v){return Math.round(v).toLocaleString();},
      goal:"target "+Math.round(tCal).toLocaleString()});
  }
  if(tPro!=null)strands.push({key:"Protein",hit:count(function(d){var p=num((state.food[d]||{}).protein);return p!=null&&p>=tPro*0.9;}),
    of:days.length,
    avg:mean(function(d){return num((state.food[d]||{}).protein);}),
    fmt:function(v){return Math.round(v)+"g";},
    goal:"target "+Math.round(tPro)+"g"});
  if(tStep!=null)strands.push({key:"Steps",hit:count(function(d){var s2=num(state.steps[d]);return s2!=null&&s2>=tStep;}),
    of:days.length,
    avg:mean(function(d){return num(state.steps[d]);}),
    fmt:function(v){return Math.round(v).toLocaleString();},
    goal:"goal "+Math.round(tStep).toLocaleString()});
  if(tSleep!=null)strands.push({key:"Sleep",hit:count(function(d){var s3=num(state.sleep[d]);return s3!=null&&s3>=tSleep*0.9;}),
    of:days.length,
    avg:mean(function(d){return num(state.sleep[d]);}),
    fmt:function(v){return minToHM(Math.round(v));},
    goal:"goal "+minToHM(Math.round(tSleep))});
  strands.push({key:"Logged",hit:count(function(d){
    return num(state.steps[d])!=null||num(state.sleep[d])!=null||num((state.food[d]||{}).calories)!=null||
      state.weights.some(function(w){return w.date===d;});}),of:days.length,count:true});
  var hit=0,of=0;strands.forEach(function(s4){hit+=s4.hit;of+=s4.of;});
  if(!of)return null;
  var pct=hit/of;
  var band=pct>=0.9?"on":pct>=0.75?"mostly_on":pct>=0.5?"partly":pct>=0.25?"mostly_off":"off";
  var label=(CI_ADHERENCE.filter(function(o){return o[0]===band;})[0]||["",""])[1];
  /* Owner 2026-08-03: say what to fix, not "Partly on". Name the strands that
     actually fell short, worst first, and say nothing clever when none did. */
  var weak=strands.filter(function(x){return x.of&&(x.hit/x.of)<0.7;})
    .sort(function(a2,b2){return (a2.hit/a2.of)-(b2.hit/b2.of);})
    .map(function(x){return x.key==="Logged"?"logging":x.key.toLowerCase();});
  var summary;
  if(!weak.length)summary=(pct>=0.99?"Everything on target":"On target");
  else{var nm=weak.slice(0,2);
    summary=nm.join(" and ").replace(/^./,function(c){return c.toUpperCase();})+" can improve";}
  return {band:band,label:label,summary:summary,pct:pct,hit:hit,of:of,strands:strands,days:days.length};
}
/* The live object carries fmt() closures for rendering. NOTHING with a function
   in it may reach the record: payload() feeds the M8 canonicaliser, which
   rejects a function outright and would fail the sync. Store a flat copy. */
function ciAdherenceStored(wk){
  var a=ciAdherence(wk);if(!a)return null;
  return {band:a.band,label:a.label,summary:a.summary,
    pct:Math.round(a.pct*1000)/1000,hit:a.hit,of:a.of,days:a.days,
    strands:a.strands.map(function(x){
      return {key:x.key,hit:x.hit,of:x.of,
        avg:(x.avg!=null?Math.round(x.avg*10)/10:null),
        goal:(x.goal||null),count:!!x.count};})};
}
var CI_TEXT=[
  ["win","Biggest win this week","What went well — a lift, a habit, a hard day you got through…"],
  ["challenge","Biggest challenge","What got in the way — be honest, this is what Max can actually help with."],
  ["training","How did training feel?","Heavy, easy, flat, strong… how your sessions actually felt."],
  ["discomfort","Any discomfort or pain?","Anything nagging — joints, gut, injection sites. Leave blank if nothing."]
];
function ciRec(wk){var c=(state.checkins||{})[wk];return (c&&typeof c==="object")?c:null;}
function ciResolved(wk){var r=ciRec(wk);return !!(r&&(r.status==="sent"||r.status==="skipped"));}
function ciSince(){return state.settings.ciSince||toISO(weekStartFor(0));}
/* Merge 2026-08-03 (M10): anchoring is an in-memory normalisation ALWAYS; the
   durable part goes through save(), which the M10 source gate refuses on a
   device that is not the writer — and also at boot, because the lease has not
   settled yet. That is deliberate and is the same shape as the neighbouring
   `if(resyncAllActivityTags())save();`: the value stands in memory and the
   holder's next accepted write persists it with the rest of the payload.

   Two further M10 constraints on this one line:
     - it AMENDS an existing record and never CREATES one. A device that has
       just completed an interrupted-logout wipe has no wl_v1, and a boot-time
       write here would resurrect the store the wipe had verified as gone
       (C19 T15c).
     - it is NOT re-run after m10Boot() settles. A delayed write would land
       after a recovery screen had already cleared the store, for the same
       reason. */
function ciAnchorSince(){
  if(state.settings.ciSince!=null)return;
  state.settings.ciSince=toISO(weekStartFor(0));
  var have=false;try{have=localStorage.getItem(KEY)!=null;}catch(e){have=false;}
  if(have)save();}
/* Check-in days from the current one backwards, newest first, never earlier
   than the week the feature first ran — a fresh install must not open with
   months of "late" check-ins. */
function ciWeekList(){
  var out=[],d=weekStartFor(0),since=ciSince();
  for(var i=0;i<12;i++){var iso=toISO(d);if(iso<since)break;out.push(iso);d.setDate(d.getDate()-7);}
  return out;
}
function ciOpenWeeks(){return ciWeekList().filter(function(w){return !ciResolved(w);});}
function ciDaysLate(wk){return Math.round((parseISO(todayISO())-parseISO(wk))/86400000);}
function ciDayName(wk){return ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][parseISO(wk).getDay()];}
function ciStatusLine(wks){
  if(wks.length>1)return wks.length+" weeks open · "+wks.slice(0,2).map(function(w){return fmtShort(parseISO(w));}).join(" and ")+(wks.length>2?" …":"");
  var n=ciDaysLate(wks[0]);
  if(n<=0)return "Due today · "+ciDayName(wks[0]);
  if(n===1)return "Due yesterday";
  return "Due "+ciDayName(wks[0])+" · "+n+" days late";
}
function ciTimeStr(ts){var d=new Date(ts);var h=d.getHours()%12;if(h===0)h=12;var m=(d.getMinutes()<10?"0":"")+d.getMinutes();
  return ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getDay()]+" "+h+":"+m+(d.getHours()<12?" AM":" PM");}
function ciAnswered(r){if(!r||!r.answers)return 0;var n=0;CI_TEXT.forEach(function(q){if((r.answers[q[0]]||"").trim())n++;});return n;}
/* The card that replaces the progress-photo prompt at the top of Home. */
function ciCardHTML(){
  var open=ciOpenWeeks(),cur=toISO(weekStartFor(0));
  if(open.length){
    var wk=open[0],late=ciDaysLate(wk)>=1;
    var r=ciRec(wk),draft=(r&&r.status==="draft")?ciAnswered(r):0;
    return '<div class="wl-card wl-ci'+(late?" late":"")+'">'+
      '<div class="wl-ci-top"><span class="wl-ci-t">Weekly check-in</span><span class="wl-ci-st'+(late?" late":"")+'">'+ciStatusLine(open)+'</span></div>'+
      '<button class="wl-btn wl-btn-primary wl-full" data-act="ci:open" data-week="'+wk+'">'+I.camera+(draft?"Finish check-in":"Start check-in")+'</button>'+
      '<div class="wl-hint" style="margin-top:8px">'+(draft?"Picked up where you left off — "+draft+" of "+CI_TEXT.length+" answered. ":"Four photos and five quick questions for Coach Max. ")+'Everything else is filled in from your logs.</div>'+
      (open.length>1?'<div class="wl-hint" style="margin-top:6px">Older week still open: '+fmtShort(parseISO(open[1]))+'. Finish this one and it comes up next.</div>':'')+
      '</div>';
  }
  var rc=ciRec(cur);
  if(rc&&rc.status==="sent")
    return '<div class="wl-card wl-ci done"><div class="wl-ci-top"><span class="wl-ci-t">Weekly check-in</span><span class="wl-ci-st ok">✓ Sent '+ciTimeStr(rc.updated||rc.ts)+'</span></div>'+
      '<button class="wl-btn wl-btn-ghost wl-full" data-act="ci:open" data-week="'+cur+'">Edit this week’s check-in</button></div>';
  if(rc&&rc.status==="skipped")
    return '<div class="wl-card wl-ci done"><div class="wl-ci-top"><span class="wl-ci-t">Weekly check-in</span><span class="wl-ci-st" style="color:var(--faint)">Skipped this week</span></div>'+
      '<button class="wl-btn wl-btn-ghost wl-full" data-act="ci:unskip" data-week="'+cur+'">Undo — I’ll do it after all</button></div>';
  return '';
}
/* The week a check-in REPORTS ON is the one that just closed: the previous
   check-in day through the day before this one. A Monday check-in on Aug 3
   covers Mon Jul 27 → Sun Aug 2 (Owner, 2026-08-03). The record stays keyed by
   the check-in day itself, which is what the due/late logic counts from. */
function ciCovered(wk){
  var end=new Date(parseISO(wk).getTime()-86400000);
  var start=new Date(end.getTime()-6*86400000);
  return {start:toISO(start),end:toISO(end)};
}
function ciCoveredDays(wk){
  var c=ciCovered(wk),out=[],d=parseISO(c.start);
  for(var i=0;i<7;i++){out.push(toISO(d));d.setDate(d.getDate()+1);}
  return out;
}
function ciCoveredLabel(wk){var c=ciCovered(wk);return fmtShort(parseISO(c.start))+" – "+fmtShort(parseISO(c.end));}
/* What the app already knows, shown so the athlete never retypes it. */
function ciFacts(wk){
  var u=state.settings.units,today=todayISO();
  /* the closed week is entirely in the past, but clamp anyway so an early or
     back-dated check-in can never average days that have not happened */
  var past=ciCoveredDays(wk).filter(function(x){return x<=today;});
  var wmap={};(state.weights||[]).forEach(function(x){wmap[x.date]=x.weight;});
  var ws=past.map(function(x){return num(wmap[x]);}).filter(function(v){return v!=null;});
  var stp=past.map(function(x){return num(state.steps[x]);}).filter(function(v){return v!=null;});
  var slp=past.map(function(x){return num(state.sleep[x]);}).filter(function(v){return v!=null;});
  var cal=past.map(function(x){return num((state.food[x]||{}).calories);}).filter(function(v){return v!=null;});
  var waist=null;for(var j=past.length-1;j>=0;j--){var wv=num(state.waist[past[j]]);if(wv!=null){waist=wv;break;}}
  var avg=function(a){return a.length?a.reduce(function(x,y){return x+y;},0)/a.length:null;};
  var tgt=num(state.settings.targetCalories);
  var rated=past.filter(function(x){return ratCount(x)>0;}).length;
  var tracked=past.filter(function(x){return num(wmap[x])!=null||num(state.steps[x])!=null||num((state.food[x]||{}).calories)!=null||num(state.sleep[x])!=null;}).length;
  var rows=[];
  rows.push(["Weight",ws.length?(r1(ws[ws.length-1])+" "+u+(ws.length>1?" · "+(ws[ws.length-1]-ws[0]<=0?"▼ ":"▲ ")+Math.abs(r1(ws[ws.length-1]-ws[0]))+" this week":"")):"—"]);
  rows.push(["Waist",waist!=null?(r1(waist)+" "+(u==="kg"?"cm":"in")):"—"]);
  rows.push(["Steps",stp.length?Math.round(avg(stp)).toLocaleString()+" avg":"—"]);
  rows.push(["Sleep",slp.length?minToHM(Math.round(avg(slp)))+" avg":"—"]);
  rows.push(["Calories",cal.length?(Math.round(avg(cal)).toLocaleString()+" avg"+(tgt!=null?" vs "+tgt.toLocaleString()+" target":"")):"—"]);
  rows.push(["Days tracked",tracked+" of "+past.length]);
  rows.push(["Daily ratings",rated?rated+" of "+past.length+" days answered":"none yet"]);
  return {rows:rows,tracked:tracked,days:past.length,calAvg:avg(cal),tgt:tgt};
}
function view_checkin(){
  var wk=state.ciWeek||toISO(weekStartFor(0));
  var r=ciRec(wk)||{},a=r.answers||{};
  var sent=(r.status==="sent");
  var f=ciFacts(wk);
  var cov=ciCovered(wk);
  var h='<div class="wl-stack">';
  h+='<div class="wl-card"><div class="wl-ci-top"><span class="wl-ci-t">'+ciCoveredLabel(wk)+'</span><span class="wl-ci-st'+(sent?" ok":(ciDaysLate(wk)>=1?" late":""))+'">'+(sent?"✓ Sent "+ciTimeStr(r.updated||r.ts):ciStatusLine([wk]))+'</span></div>'+
    '<div class="wl-hint">'+(sent?"Editing a sent check-in re-sends the corrected version to Max. The original stays in your record.":"This covers the week that just closed — "+ciDayName(cov.start)+" through "+ciDayName(cov.end)+". Answer what you can — nothing here is required.")+'</div></div>';
  if(feelAnyAnswered(feelDays(14,todayISO())))
    h+='<div class="wl-card"><div class="wl-card-head"><span>How you’ve felt</span><span class="wl-count">14 days</span></div>'+feelBarsHTML(todayISO(),14)+feelWatchHTML(todayISO())+'</div>';
  h+='<div class="wl-card"><div class="wl-card-head"><span>This week’s photos</span><span class="wl-count" id="wl-ciphoto-n">—</span></div>'+
     '<div id="wl-ciphotos" class="wl-citiles"></div>'+
     '<div class="wl-hint" style="margin-top:10px">Tap a slot to add or retake. Same light, same time of day, same distance — that is what makes them comparable.</div>'+
     photoDiagHTML()+'</div>';
  h+='<div class="wl-card"><div class="wl-card-head"><span>Your week</span></div>';
  var adh=ciAdherence(wk);
  if(adh){
    var _hp=Math.round(adh.pct*100);
    h+='<div class="wl-feelq"><div class="wl-feelq-h"><span>How well you stuck to the plan</span><span class="a">'+esc(adh.summary)+'</span></div>'+
       '<div class="wl-adhbar"><i class="hit" style="width:'+_hp+'%"></i><i class="miss" style="width:'+(100-_hp)+'%"></i></div>'+
       '<div class="wl-cifill" style="margin-top:10px">'+
       adh.strands.map(function(x){
         var val=x.count?(x.hit+" of "+x.of+" days")
               :(x.avg!=null?(x.fmt(x.avg)+" avg"):"—");
         var sub=x.count?"days logged":esc(x.goal||"");
         return '<span class="k">'+esc(x.key)+' <em style="color:var(--faint);font-style:normal">'+sub+'</em></span>'+
                '<span class="v"'+(x.of&&(x.hit/x.of)<0.7?' style="color:var(--accent)"':'')+'>'+esc(val)+'</span>';
       }).join("")+
       '</div><div class="wl-hint" style="margin-top:10px">Worked out from your logs across '+adh.days+' days, not a self-rating.</div></div>';
  }
  CI_TEXT.forEach(function(q){
    h+='<label class="wl-field wl-field-full" style="margin-top:16px"><span>'+q[1]+' <em>optional</em></span><textarea class="wl-ci-input" data-ci="'+q[0]+'" data-week="'+wk+'" placeholder="'+esc(q[2])+'" style="width:100%;min-height:64px;background:var(--bg2);border:1px solid var(--line);border-radius:10px;color:var(--text);font-family:var(--sans);font-size:14px;padding:11px 12px;box-sizing:border-box;outline:none;resize:vertical">'+esc(a[q[0]]||"")+'</textarea></label>';
  });
  h+='</div>';
  h+='<div class="wl-card"><div class="wl-card-head"><span>Sent automatically</span></div><div class="wl-cifill">';
  f.rows.forEach(function(row){h+='<span class="k">'+esc(String(row[0]))+'</span><span class="v">'+esc(String(row[1]))+'</span>';});
  h+='</div><div class="wl-hint" style="margin-top:10px">Your photos and the 14-day rating trends go with it. You never retype what the app already logged.</div></div>';
  h+='<button class="wl-btn wl-btn-primary wl-full" data-act="ci:send" data-week="'+wk+'">'+(sent?"Update weekly check-in":"Complete Weekly Check-in")+'</button>';
  h+='<div class="wl-ciskip">';
  if(state.ciSkipAsk===wk){
    h+='<div class="wl-card" style="border:1px solid var(--bad)"><div class="wl-ci-t" style="margin-bottom:8px">Skip this week’s check-in?</div>'+
       '<div class="wl-hint">Nothing is sent to Max for '+ciCoveredLabel(wk)+' — no photos, no answers. Your daily logs keep flowing as normal, and you can undo this until your next check-in day.</div>'+
       '<div class="wl-ck-reopen-btns" style="margin-top:12px"><button class="wl-btn wl-btn-ghost" data-act="ci:skipcancel">Cancel</button><button class="wl-btn wl-btn-primary" data-act="ci:skipyes" data-week="'+wk+'">Yes, skip this week</button></div></div>';
  }else if(!sent){
    h+='<button class="wl-btn wl-btn-ghost wl-full" data-act="ci:skipask" data-week="'+wk+'">Skip this week’s check-in</button>';
  }
  h+='</div>';
  return h+'</div>';
}
/* On-device photo diagnostic: what the last download actually did, and a way to
   run it again. Added because progress photos were present on the server with
   valid localIds and still absent on a reinstalled iPad, and the code alone did
   not say which step failed (Owner, 2026-08-04). */
function photoDiagHTML(){
  var r=psReport();
  var line;
  if(!r)line="Photo sync hasn’t run yet on this device.";
  else if(r.ok){
    var sn=r.seen||{};
    line="Last photo sync: "+r.down+" downloaded, "+r.up+" uploaded"+(r.rm?", "+r.rm+" removed":"")+
      ". Server had "+(sn.server==null?"?":sn.server)+" photo"+(sn.server===1?"":"s")+
      " ("+(sn.serverProgress==null?"?":sn.serverProgress)+" progress); this device had "+
      (sn.local==null?"?":sn.local)+" ("+(sn.localProgress==null?"?":sn.localProgress)+" progress).";
  }
  else line="Photo sync did not run — "+(r.why||"reason unknown")+".";
  return '<div class="wl-hint" style="margin-top:8px">'+esc(line)+
    ' <button class="wl-link" data-act="photo:resync">Download photos now</button></div>';
}
function renderCheckinPhotos(){
  var host=document.getElementById("wl-ciphotos");if(!host)return;
  var wk=state.ciWeek||toISO(weekStartFor(0));
  idbAll().then(function(all){
    var host2=document.getElementById("wl-ciphotos");if(!host2)return;
    clearPhotoURLs();
    var progs=all.filter(function(p){return p.kind==="progress"&&p.week===wk;});
    var html="",n=0;
    POSES.forEach(function(ps){
      var found=progs.filter(function(p){return p.pose===ps[0];})[0];
      if(found){n++;var url=URL.createObjectURL(found.blob);photoURLs.push(url);photoMap[found.id]=url;
        html+='<div><button class="wl-citile has" data-act="pphoto:add" data-pose="'+ps[0]+'" data-week="'+wk+'" style="background-image:url('+url+')" aria-label="Retake '+ps[1]+'"></button><span class="wl-citlbl">'+ps[1]+'</span></div>';}
      else html+='<div><button class="wl-citile" data-act="pphoto:add" data-pose="'+ps[0]+'" data-week="'+wk+'" aria-label="Add '+ps[1]+'">＋</button><span class="wl-citlbl">'+ps[1]+'</span></div>';
    });
    host2.innerHTML=html;
    var c=document.getElementById("wl-ciphoto-n");if(c)c.textContent=n+" of "+POSES.length;
  }).catch(function(){
    var host2=document.getElementById("wl-ciphotos");
    if(host2)host2.innerHTML='<div class="wl-hint">Photos aren’t available on this device.</div>';});
}
/* A part-filled form is kept as a draft, so a mis-tap out of the view never
   loses what was typed. Only send/skip resolve the week. */
function ciDraft(wk){
  var all=state.checkins||(state.checkins={});
  var r=all[wk];
  if(!r||typeof r!=="object"){r={status:"draft",ts:Date.now(),answers:{}};all[wk]=r;}
  if(!r.answers)r.answers={};
  return r;
}
function ciHistoryHTML(){
  var wks=ciWeekList().filter(function(w){var r=ciRec(w);return r&&r.status&&r.status!=="draft";});
  if(!wks.length)return '';
  var h='<div class="wl-card"><div class="wl-card-head"><span>Weekly check-ins</span><span class="wl-count">'+wks.length+'</span></div>';
  wks.forEach(function(w,i){
    var r=ciRec(w),sent=(r.status==="sent");
    h+='<div class="wl-cihist"'+(i===0?' style="border-top:0"':'')+'><div><div class="w">'+ciCoveredLabel(w)+'</div><div class="s '+(sent?"ok":"sk")+'">'+
      (sent?"✓ Sent "+ciTimeStr(r.updated||r.ts)+" · "+ciAnswered(r)+" of "+CI_TEXT.length+" answered":"Skipped")+'</div></div>'+
      '<button class="wl-link" data-act="ci:open" data-week="'+w+'">'+(sent?"Edit":"Open")+' ›</button></div>';
  });
  return h+'</div>';
}
function ckNotes(sel){
  var note=(state.notes[sel]||"").trim();
  if(note){var snip=note.length>58?note.slice(0,58)+"…":note;
    return '<button class="wl-ck-row" data-act="dl:open" data-sec="notes"><span class="wl-ck-l"><span class="wl-ck-ic done"></span><span class="wl-ck-lab">Notes</span></span><span class="wl-ck-note">'+esc(snip)+'</span><span class="wl-ck-go">›</span></button>';}
  return '<button class="wl-ck-row" data-act="dl:open" data-sec="notes"><span class="wl-ck-l"><span class="wl-ck-ic opt">◦</span><span class="wl-ck-lab">Notes</span></span><span class="wl-ck-val empty">Optional</span><span class="wl-ck-go">›</span></button>';
}
function ckRowSkip(label,val,sec){return '<button class="wl-ck-row" data-act="dl:open" data-sec="'+sec+'"><span class="wl-ck-l"><span class="wl-ck-ic"></span><span class="wl-ck-lab">'+label+'</span></span><span class="wl-ck-val" style="color:var(--faint);font-style:italic">'+val+'</span><span class="wl-ck-go">›</span></button>';}
function skipBtn(sec,on,word){return '<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:10px" data-act="skip:'+sec+'">'+(on?"Un-skip \u2014 I\u2019ll log "+word:"Not tracking "+word+" today")+'</button>'+(on?'<div class="wl-hint" style="margin-top:8px">Marked skipped \u2014 still counts as checked in. Logging when you can gives your coach a truer read over time.</div>':'');}
/* The recap for a given day, wherever it lives: the per-day log first, then the
   "latest recap" slot. A day having a recap is what makes it Completed. */
/* ---- coach reports: a read-only service feed (Owner, 2026-08-04) ------
   Reports live in their own server collection, keyed to the user. The app
   only ever READS them, into state.coachRpt — which is deliberately NOT in
   payload(), so a report can never be pushed, synced, conflicted or erased
   by this device. Legacy in-record copies remain as a fallback for history
   written before the split. */
var COACHRPT_KEY="wl_coach_reports";
function coachRptLoad(){try{state.coachRpt=JSON.parse(localStorage.getItem(COACHRPT_KEY))||{weekly:null,nightly:{},tdee:null};}catch(e){state.coachRpt={weekly:null,nightly:{},tdee:null};}
  if(state.coachRpt&&!("tdee" in state.coachRpt))state.coachRpt.tdee=null;/* cache written before tdee existed */}
function coachRptSave(){try{localStorage.setItem(COACHRPT_KEY,JSON.stringify(state.coachRpt||{weekly:null,nightly:{},tdee:null}));}catch(e){}}
function fetchCoachReports(cb){
  if(!syncOn()||ownershipAmbiguous()){cb&&cb(false);return;}
  fetch(pbBase()+"/api/collections/coach_reports/records?perPage=200&sort=-period&t="+Date.now(),{headers:pbHeaders(),cache:"no-store"})
    .then(function(r){if(!r.ok)return Promise.reject();return r.json();})
    .then(function(p){var items=(p&&p.items)||[];var w=null,n={},t=null;
      for(var i=0;i<items.length;i++){var it=items[i];var rep=it.report||null;if(!rep)continue;
        if(it.kind==="weekly"){if(!w||String(it.period)>String(w.week||""))w=rep;}
        else if(it.kind==="nightly"&&it.period)n[it.period]=rep;
        /* TDEE: keep the latest window-end. Compare on period rather than
           trusting sort order, since one bad row must not hide a newer one. */
        else if(it.kind==="tdee"&&it.period){if(!t||String(it.period)>String(t.period||""))t=rep;}}
      state.coachRpt={weekly:w,nightly:n,tdee:t};coachRptSave();cb&&cb(true);})
    .catch(function(){cb&&cb(false);});}
function coachWeekly(){var w=state.coachRpt&&state.coachRpt.weekly;if(w&&w.text)return w;return state.weeklySummary;}
function coachNightly(iso){var n=state.coachRpt&&state.coachRpt.nightly&&state.coachRpt.nightly[iso];if(n&&n.text)return n;
  var l=(state.nightlyLog||{})[iso];if(l&&l.text)return l;var ns=state.nightlySummary;return (ns&&ns.date===iso&&ns.text)?ns:null;}
function coachNightlyLatest(){var n=(state.coachRpt&&state.coachRpt.nightly)||{};var ks=Object.keys(n).sort();
  for(var i=ks.length-1;i>=0;i--){if(n[ks[i]]&&n[ks[i]].text)return n[ks[i]];}
  return state.nightlySummary;}
function dayRecap(iso){return coachNightly(iso);}
/* Reopen a completed day: drop its recap from both stores so the day reverts to
   not-completed (Complete today + Health import return). Destructive by design. */
function reopenDay(iso){var lg=state.nightlyLog||{};if(lg[iso])delete lg[iso];state.nightlyLog=lg;
  var ns=state.nightlySummary;if(ns&&ns.date===iso)state.nightlySummary=null;
  if(state.settings&&state.settings.seenNightly===iso)state.settings.seenNightly=null;
  state.reopenAsk=null;save();render();toast("Day reopened");}
function completeBtnHTML(sel){var selToday=sel===todayISO();if(state.nightBusy)return '<div class="wl-hint" style="margin-top:12px;text-align:center">⏳ Completing… generating your recap.</div>';var hasRecap=!!dayRecap(sel);if(hasRecap)return '';/* regenerate moved into the recap card header (wl-recaplink) */return '<button class="wl-btn wl-btn-primary wl-full" style="margin-top:12px" data-act="night:gen">Complete '+(selToday?"today":"this day")+'</button>';}
function hkButtonHTML(sel){
  if(!isOwner())return "";
  if(state.hkDone&&state.hkDone.date===sel){var _hd=new Date(state.hkDone.ts);var _hh=_hd.getHours()%12;if(_hh===0)_hh=12;var _hm=(_hd.getMinutes()<10?"0":"")+_hd.getMinutes();
    return '<button class="wl-hkbtn" data-act="hk:import" style="margin-top:14px">✓ Imported '+_hh+':'+_hm+(_hd.getHours()<12?" AM":" PM")+' · tap to import again</button>';}
  if(state.hkWait&&state.hkWait.date===sel)return '<div class="wl-hkwait" style="margin-top:14px"><span>⏳ Waiting for Health data… swipe back after the shortcut finishes.</span><button class="wl-link" data-act="hk:cancel" style="flex:none">Cancel</button></div>';
  return '<button class="wl-hkbtn" data-act="hk:import" style="margin-top:14px">⤓ Import from Apple Health</button>';
}
function todayChecklistHTML(sel){
  var u=state.settings.units;var f=state.food[sel]||{};
  var wt=null;for(var i=0;i<state.weights.length;i++){if(state.weights[i].date===sel){wt=state.weights[i].weight;break;}}
  var steps=num(state.steps[sel]),sleep=num(state.sleep[sel]);
  var hasCal=num(f.calories)!=null||num(f.protein)!=null||num(f.carbs)!=null||num(f.fat)!=null;
  var modeType=dayStatus(sel);
  var _completed=!!dayRecap(sel); /* day is Completed (a recap exists for it) -> lock it, hide Health import */
  if(modeType){var mh='<div class="wl-card wl-check"><div class="wl-ck-head"><span class="wl-ck-title">'+(sel===todayISO()?"Today":"This day")+'\u2019s Check-in</span><span class="wl-ck-cnt">'+(modeType==="sick"?"Resting up":"Resting easy")+'</span></div>';
    mh+=(wt!=null)?ckRow(true,"Weight",r1(wt)+" "+u,"weight",false):ckRowSkip("Weight","Optional","weight");
    mh+=(steps!=null)?ckRow(true,"Steps",Math.round(steps).toLocaleString(),"steps",false):ckRowSkip("Steps","Optional","steps");
    mh+=hasCal?ckCalories(sel):ckRowSkip("Calories","Optional","calories");
    mh+=(sleep!=null)?ckRow(true,"Sleep",minToHM(sleep),"sleep",false):ckRowSkip("Sleep","Optional","sleep");
    mh+=ckFeel(sel);mh+=ckNotes(sel);if(!_completed)mh+=hkButtonHTML(sel);return mh+'</div>';}
  var wSkip=isSkip(sel,"weight"),stSkip=isSkip(sel,"steps"),slSkip=isSkip(sel,"sleep"),calSkip=isSkip(sel,"calories");
  var done=((wt!=null||wSkip)?1:0)+((steps!=null||stSkip)?1:0)+((hasCal||calSkip)?1:0)+((sleep!=null||slSkip)?1:0);
  var _allDone=_completed; /* completion state = day Completed via "Complete today" (a recap exists), not merely 4/4 filled */
  var h='<div class="wl-card wl-check'+(_allDone?' wl-check-done':'')+'"><div class="wl-ck-head"><span class="wl-ck-title">'+(sel===todayISO()?"Today":"This day")+'\u2019s Check-in</span><span class="wl-ck-cnt'+(_allDone?' allgood':'')+'">'+(_allDone?'All done':done+' of 4 done')+'</span></div>';
  h+=(sleep!=null)?ckRow(true,"Sleep",minToHM(sleep),"sleep",false):(slSkip?ckRowSkip("Sleep","Skipped","sleep"):ckRow(false,"Sleep","Add","sleep",false));
  h+=(wt!=null)?ckRow(true,"Weight",r1(wt)+" "+u,"weight",false):(wSkip?ckRowSkip("Weight","Skipped","weight"):ckRow(false,"Weight","Add","weight",false));
  h+=(hasCal||!calSkip)?ckCalories(sel):ckRowSkip("Calories","Skipped","calories");
  h+=(steps!=null)?ckRow(true,"Steps",Math.round(steps).toLocaleString(),"steps",false):(stSkip?ckRowSkip("Steps","Skipped","steps"):ckRow(false,"Steps","Add","steps",false));
  h+=ckFeel(sel);h+=ckNotes(sel);if(!_completed)h+=hkButtonHTML(sel); /* hide Health import only once the day is Completed (recap generated), not merely when 4/4 are filled */
  if(_allDone){
    if(state.reopenAsk===sel){
      h+='<div class="wl-ck-done-banner ask"><div class="wl-ck-reopen-q">Reopen this day? Its coach recap will be cleared.</div>'+
         '<div class="wl-ck-reopen-btns"><button class="wl-btn wl-btn-ghost" data-act="day:reopencancel">Cancel</button><button class="wl-btn wl-btn-primary" data-act="day:reopendo" data-date="'+sel+'">Reopen</button></div></div>';
    }else{
      h+='<div class="wl-ck-done-banner"><span class="wl-ck-done-check">✓</span><span class="wl-ck-done-txt">'+(sel===todayISO()?"You’re logged for today — nice work.":"This day is complete.")+'</span>'+
         '<button class="wl-ck-reopen" data-act="day:reopenask" data-date="'+sel+'">Reopen</button></div>';
    }
  }
  return h+'</div>';
}
function activitySummaryHTML(sel){
  var log=[],seen={};
  function _al(cat,name){var k=cat+":"+(name||"");if(!seen[k]){seen[k]=1;log.push({cat:cat,name:name});}}
  (((state.training.sessions||{})[sel])||[]).forEach(function(s){if(s.kind==="cardio")_al("cardio",s.type||"Cardio");});
  (((state.training.liftSessions||{})[sel])||[]).forEach(function(s){_al("lifting",s.name||"Weight training");});
  normActs(sel).forEach(function(a){if(a.cat!=="cardio"&&a.cat!=="lifting")_al(a.cat,a.name);});
  var h='<div class="wl-card"><div class="wl-card-head"><span>Activity</span><button class="wl-link" data-act="go" data-view="train">Activity tab →</button></div>';
  if(log.length){h+='<div class="wl-preset-list" style="padding-top:2px">';log.forEach(function(a){h+='<span class="wl-achip-ro '+a.cat+'">'+esc(a.name||CATLABEL[a.cat])+'</span>';});h+='</div>';}
  else h+='<div class="wl-hint">No activity logged. Add cardio, lifting, or recovery from the Activity tab.</div>';
  return h+'</div>';
}
/* wkPhotoHave / refreshWeekPhotos retired 2026-08-03: they existed only to
   decide whether to show the "This Week's Progress Photos" prompt, which the
   weekly check-in card replaced. Nothing reads that state now. */

/* ==== Max INBOX (Owner, 2026-08-06: "like an email — click it") ====
   The sheet is a message LIST — every kind of Max message in one place,
   newest first — and tapping a row opens that one message. A message counts
   as read when IT is opened, not when the sheet is (unread pills and the
   avatar cue now mean "you haven't read this", which is what they claimed).
   Read-state for daily recaps is device-local (wl_max_read); weekly/TDEE
   keep their existing synced seen fields, now set on message-open. */
function maxRead(){try{return JSON.parse(localStorage.getItem("wl_max_read")||"{}");}catch(e){return {};}}
function maxReadSave(m){try{localStorage.setItem("wl_max_read",JSON.stringify(m));}catch(e){}}
function maxMsgs(){
  var msgs=[];var _when=function(g,d){return g||((d||"")+"T00:00:00.000Z");};
  var ws=coachWeekly();
  if(ws&&ws.text){var _wst=coachStamp(ws.generated,null);
    msgs.push({key:"weekly:"+(ws.week||""),title:"Weekly check-in",
      sub:"week of "+fmtShort(parseISO(ws.week))+(_wst?" \u00b7 "+_wst:""),
      when:_when(ws.generated,ws.week),mood:ws.mood,text:ws.text,unread:coachUnreadW()});}
  var _td=coachTdee();
  if(_td)msgs.push({key:"tdee:"+(_td.period||""),title:"Your measured metabolism",
    sub:(_td.tdee?_td.tdee+" cal/day \u00b7 ":"")+coachStamp(_td.generated,_td.period),
    when:_when(_td.generated,_td.period),mood:_td.mood,text:_td.text,unread:coachUnreadT()});
  var n=(state.coachRpt&&state.coachRpt.nightly)||{};var rd=maxRead();
  var nk=Object.keys(n).sort().reverse();
  nk.slice(0,60).forEach(function(iso,idx){var r=n[iso];if(!r||!r.text)return;
    var st=coachStamp(r.generated,null);
    msgs.push({key:"nightly:"+iso,title:"Daily recap",
      sub:fmtShort(parseISO(iso))+(st?" \u00b7 "+st:""),
      when:_when(r.generated,iso),mood:r.mood,text:r.text,
      /* only the LATEST recap can be unread — history never floods "New" */
      unread:idx===0&&!rd["nightly:"+iso]});});
  msgs.sort(function(a,b){return String(b.when).localeCompare(String(a.when));});
  return msgs;}
function maxPreview(t){return esc(String(t||"").replace(/\*\*/g,"").replace(/\s+/g," ").slice(0,78))+(String(t||"").length>78?"\u2026":"");}
function maxSheetHTML(){if(!state.maxOpen)return "";
  var inner;var msgs=maxMsgs();
  var open=state.maxMsg?msgs.filter(function(m){return m.key===state.maxMsg;})[0]:null;
  if(state.genBusy&&!open){inner='<div class="wl-mhead"><span class="wl-mav">M</span><span style="min-width:0"><span class="wl-mtitle">Weekly check-in</span><span class="wl-msub">from Coach Max</span></span><button class="wl-maxx" data-act="max:close">\u2715</button></div><div class="wl-hint">\u23f3 Generating your check-in\u2026 this takes about a minute. You can close this and keep using the app.</div>';}
  else if(open){
    inner='<div class="wl-mhead"><button class="wl-maxback" data-act="max:back" aria-label="Back to messages">\u2039</button><span class="wl-mav">M</span><span style="min-width:0"><span class="wl-mtitle">'+open.title+'</span><span class="wl-msub">from Coach Max \u00b7 '+open.sub+'</span></span><button class="wl-maxx" data-act="max:close">\u2715</button></div>'
      +'<div class="wl-ai-summary" style="margin-top:6px">'+maxMoodHTML(open.mood)+renderSummary(open.text)+'</div>';}
  else if(msgs.length){
    inner='<div class="wl-mhead" style="margin-bottom:6px"><span class="wl-mav">M</span><span style="min-width:0"><span class="wl-mtitle">Messages</span><span class="wl-msub">from Coach Max</span></span><button class="wl-maxx" data-act="max:close">\u2715</button></div>'
      +'<div class="wl-inbox">'+msgs.map(function(m){
        return '<button class="wl-inbox-row'+(m.unread?' unread':'')+'" data-act="max:read" data-key="'+esc(m.key)+'">'
          +'<span class="wl-inbox-dot'+(m.unread?'':' off')+'"></span>'
          +'<span class="wl-inbox-mood">'+(MAXFACE[String(m.mood||"").toLowerCase()]?'<img src="'+MAXFACE[String(m.mood||"").toLowerCase()]+'" alt="">':'M')+'</span>'
          +'<span class="wl-inbox-main"><span class="wl-inbox-top"><span class="wl-inbox-title">'+m.title+'</span></span>'
          +'<span class="wl-inbox-sub">'+m.sub+'</span>'
          +'<span class="wl-inbox-prev">'+maxPreview(m.text)+'</span></span>'
          +'<span class="wl-inbox-go">\u203a</span></button>';}).join("")+'</div>';}
  else{var dn=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][(parseInt(state.settings.weekStart,10)||0)];
    inner='<div class="wl-mhead"><span style="flex:1"></span><button class="wl-maxx" data-act="max:close">\u2715</button></div><div class="wl-maxempty"><div class="bigav">M</div><div class="t">No messages yet</div><div class="s">This is where Coach Max delivers your check-ins and recaps.<br>Your next weekly lands <b style="color:var(--text)">'+dn+' morning</b>.</div></div>';}
  return '<div class="wl-maxbg top" data-act="max:close"><div class="wl-maxsheet'+(msgs.length||state.genBusy?'':' plain')+'" data-act="noop">'+inner+'</div></div>';}
/* ---- Coach Max info sheets (tap an ⓘ to learn a concept) ---- */
var INFO={
  progression:{title:"Double vs Reverse Pyramid",body:[
    "Two ways to get stronger over time — you pick one per routine. Both work; it's about which fits the lift and how you like to train.",
    "<b>Double progression</b> is the simple default. Same weight across all your sets, inside a rep range like 8–12. Add reps each week until you hit the top of the range on every set, then add a little weight and start climbing again. Forgiving and hard to mess up.",
    "<b>Reverse Pyramid</b> puts your heaviest set first, when you're fresh: low reps, pushed close to failure. Then drop the weight about 10% and add reps on each set after. Your first set drives the weight up — hit the top of its range and you add weight there next time.",
    "My take: newer, or want simple? Use Double. Like going heavy and can grind a hard first set? Reverse Pyramid is excellent. Either way, the method isn't the magic — showing up and adding a little over months is."]},
  fbjoint:{title:"Joint pain ratings",body:[
"<b>None</b> — my joints felt great, no problems.",
"<b>Low pain</b> — my joints felt ok, but I can definitely feel them being loaded.",
"<b>Moderate pain</b> — my joints are taking a bit of a beating. They don\u2019t love this exercise right now.",
"<b>A lot of pain</b> — my joints hurt BAD, something is up.",
"Moderate or worse shows up as a caution next time you run this routine. It never changes your weights on its own \u2014 that call stays yours."]},
fbsore:{title:"Soreness ratings",body:[
"<b>Never got sore</b> — no soreness at all last time, and I could have trained it hard the next day.",
"<b>Healed a while ago</b> — a tiny bit sore, but healed well before this session.",
"<b>Healed just on time</b> — recovered right on time and the muscle feels good.",
"<b>I\u2019m still sore!</b> — still sore, fatigued, or weak from last time.",
"Still sore each week usually means too much volume, not enough recovery, or both."]},
fbpump:{title:"Pump ratings",body:[
"<b>Low pump</b> — about as full as usual; on pump alone I couldn\u2019t tell I trained.",
"<b>Moderate pump</b> — definitely tighter and fuller than if I hadn\u2019t trained.",
"<b>Amazing pump</b> — unreal, tight even without flexing.",
"Pump is the softest of these signals. It\u2019s context for your coach rather than something the app acts on."]},
fbvol:{title:"Volume ratings",body:[
"<b>Not enough</b> — barely felt like work; I could easily have done more sets.",
"<b>Just right</b> — a good amount; I could have done more if I had to.",
"<b>Pushed my limits</b> — right at my limit; not sure I could have done more sets.",
"<b>Too much</b> — way too much; quality and focus would have been better with fewer sets.",
"Too much or not enough comes back as a suggestion next time. Changing the set count is still your call."]},
rir:{title:"RIR — Reps in Reserve",body:[
    "RIR is how many reps you had left in the tank when you stopped. 2 RIR means you could have done two more with clean form; 0 means nothing left.",
    "It's how we measure effort. To build and keep muscle — especially in a deficit — your working sets should land around <b>0–2 RIR</b>: hard, but good form.",
    "Log it honestly after each set; it's what tells the app you're ready for more weight. If you're not sure, you probably had more in reserve than you think."]},
  reprange:{title:"Rep ranges",body:[
    "A range like <b>6–8</b> is your target window for a set. Fall under the bottom and the weight is too heavy; sail past the top and it's too light.",
    "Work up through the range week to week, and when you hit the top with real effort, add weight and start over. Ranges keep you progressing without ego-lifting or spinning your wheels."]},
  metabolism:{title:"Metabolism (your real burn)",body:[
    "After about 3 weeks of logging food and weigh-ins, I can measure your <b>actual</b> daily burn from your own data — not a generic formula.",
    "When your trend says your target should change, I'll propose exact new numbers you can apply in one tap. It's the most honest read you'll get, and it sharpens the more you log."]},
  strategy:{title:"Strategy and your calorie target",body:[
    "Your strategy (Lose, Maintain, Gain) sets the direction; your weekly rate sets the size of the change.",
    "Fat loss runs on a <b>small, sustainable deficit</b> — usually 200–500 calories a day, about a pound a week. Bigger isn't better: crash deficits cost you muscle, energy, and adherence. Slow and steady is what actually sticks."]},
  protein:{title:"Protein target",body:[
    "Aim for about <b>1 gram per pound of your goal bodyweight</b>. Protein is the priority — it protects muscle while you lose fat, keeps you full, and costs a few calories just to digest.",
    "Hit protein first each day; your carbs and fat are flexible around it."]},
  cardiozone:{title:"Cardio zones and the goal",body:[
    "Zones describe how hard the cardio is. <b>Zone 2–3</b> is the sweet spot — steady, conversational effort. Only zone 2 and up counts toward your weekly cardio-minute goal (zone 1 is fine, it just doesn't count).",
    "Split cardio across <b>2–3 shorter sessions</b> instead of one long grind — it spares recovery and keeps hunger down."]},
  steps:{title:"Steps (everyday movement)",body:[
    "Steps are your free burn — the movement outside the gym. 8,000–10,000 a day quietly adds up to more than any single cardio session, and it helps recovery.",
    "It's the easiest lever most people ignore."]},
  targeticons:{title:"Target icons",body:[
    "The little marks by a logged set show how you did against the target: a <b>green up-arrow</b> means you beat the top of the range (weight is coming up soon), a <b>gold bullseye</b> means right in the range, and a <b>red down-arrow</b> means under the range (the weight may be a touch heavy).",
    "A quick glance, not a grade."]},
  modes:{title:"Vacation and Sick mode",body:[
    "Flip these on when life happens. On <b>Vacation</b> I ease up — a week off won't undo months, and a scale bump is mostly water and travel.",
    "On <b>Sick</b> days, rest and health come first: I won't push training or a deficit, or read an illness weigh-in as progress or backslide. Turn it off when you're back."]},
  photos:{title:"Progress photos",body:[
    "When the scale stalls, they're the truest read on real change.",
    "Same four angles, same light, weekly. And back them up (Settings → Data) before you ever switch phones."]},
  coach:{title:"What is Coach Max",body:[
    "That's me. Each night I write a short recap of your day; once a week, a fuller debrief — wins, what to watch, and where you're headed.",
    "I coach the fundamentals: lift hard, eat your protein, keep a small deficit, move often, sleep well. I'll hold you accountable — but I won't shame a slip. One off-day is nothing; showing up again is everything."]}
};
function infoBtn(key){return '<button class="wl-info" data-act="info" data-info="'+key+'" aria-label="What is this?">i</button>';}
function infoSheetHTML(){if(!state.infoOpen)return "";var d=INFO[state.infoOpen];if(!d)return "";
  var body=(d.body||[]).map(function(p){return '<p>'+p+'</p>';}).join("");
  return '<div class="wl-maxbg wl-infobg'+(state.fbSheet?" top":"")+'" data-act="info:close"><div class="wl-infosheet" data-act="noop"><div class="wl-infogrip"></div><div class="wl-inforow"><span class="wl-coachav">M</span><span style="flex:1;min-width:0"><span class="wl-coachwho" style="display:block">Coach Max</span><span class="wl-infotitle">'+esc(d.title)+'</span></span><button class="wl-maxx" data-act="info:close">✕</button></div><div class="wl-infobody">'+body+'</div></div></div>';}
function migrateCoachSeen(){var st=state.settings;var ch=false;
  if(st.seenWeekly==null&&state.weeklySummary&&state.weeklySummary.week){st.seenWeekly=state.weeklySummary.week;ch=true;}
  if(st.seenNightly==null&&state.nightlySummary&&state.nightlySummary.date){st.seenNightly=state.nightlySummary.date;ch=true;}
  return ch;}
function coachTdee(){var t=state.coachRpt&&state.coachRpt.tdee;return (t&&t.text)?t:null;}
/* "Aug 4, 9:23 PM" — when the message was WRITTEN, rendered in the reader's
   local zone (generated is stored UTC). Falls back to the report's own date
   with no time for anything written before `generated` existed, rather than
   inventing a midnight that never happened. */
function coachStamp(gen,fallbackDate){
  if(gen){var d=new Date(gen);if(!isNaN(d.getTime()))return fmtShort(d)+", "+fmtClock(d);}
  return fallbackDate?fmtShort(parseISO(fallbackDate)):"";}
/* No week-currency check like coachUnreadW: a metabolism reading is not tied
   to a week, and the coach only writes one when the number is actually news,
   so an unread one stays unread until it is read. */
function coachUnreadT(){var t=coachTdee();return !!(t&&t.period&&state.settings.seenTdee!==t.period);}
function coachUnreadN(){var ns=coachNightlyLatest();return !!(ns&&ns.text&&ns.date&&state.settings.seenNightly!==ns.date);}
function coachUnreadW(){var ws=coachWeekly();return !!(ws&&ws.text&&ws.week&&ws.week===toISO(weekStartFor(0))&&state.settings.seenWeekly!==ws.week);}
function msgPreview(t){var x=(""+(t||"")).replace(/[#*_>`\u2022-]/g,"").replace(/\s+/g," ").trim();return x.length>110?x.slice(0,110)+"\u2026":x;}
function coachHeadHTML(title,dateStr,unread,open){var right=unread?'<span class="wl-newpill">New</span>':(open?'<span class="wl-chevron open" style="margin-left:auto">›</span>':'<span style="margin-left:auto;color:var(--accent);font-weight:600;font-size:13px;flex:none">View ›</span>');
  return '<span class="wl-mhead"><span class="wl-mav">M</span><span style="min-width:0"><span class="wl-mtitle">'+title+'</span><span class="wl-msub">from Coach Max · '+dateStr+'</span></span>'+right+'</span>';}
function view_overview(){
  var u=state.settings.units;
  var h='<div class="wl-stack">';h+=dayBarHTML();
  var _log=Object.assign({},state.nightlyLog||{},(state.coachRpt&&state.coachRpt.nightly)||{});
  var _sel=state.selDate;var _unrdN=coachUnreadN();var _lns=coachNightlyLatest();var _nsD=(_lns||{}).date;
  var _rcFor=function(d){return coachNightly(d);};
  var _rcDates=Object.keys(_log).filter(function(d){return _log[d]&&_log[d].text;});
  if(_lns&&_lns.text&&_nsD&&_rcDates.indexOf(_nsD)<0)_rcDates.push(_nsD);
  _rcDates.sort();
  var _rcDate=_rcFor(_sel)?_sel:null;/* recap shows only for the viewed day; no fallback to yesterday's recap on an uncompleted day */
  var _rc=_rcDate?_rcFor(_rcDate):null;var _recapCard="";var _atTop=false;
  if(_rc){var _unrdThis=_unrdN&&_rcDate===_nsD;_atTop=_unrdThis;var _no=_unrdThis?false:(state.nightOpen!==false);
    var _nav='';/* recap arrows retired 2026-08-02: the header day nav navigates days, and the recap follows the viewed day */
    var _canRegen=SHOW_TESTBTN&&!state.nightBusy&&_lns&&_lns.date===_rcDate&&_lns.text;
    var _regen=_canRegen?'<button class="wl-recaplink" data-act="night:gen" aria-label="Regenerate recap">↻ Regenerate</button>':'';
    _recapCard='<div class="wl-card'+(_unrdThis?' wl-recap-new':'')+'"><div class="wl-recaphead"><button class="wl-collapse-head" style="flex:1;min-width:0" data-act="night:toggle">'+coachHeadHTML("Daily recap",fmtShort(parseISO(_rcDate)),_unrdThis,_no)+'</button>'+_regen+_nav+'</div>'+(_no?'<div class="wl-ai-summary" style="margin-top:6px">'+maxMoodHTML(_rc.mood)+renderSummary(_rc.text)+'</div>':'')+'</div>';}
  var _recapUnit=_recapCard+(SHOW_TESTBTN?completeBtnHTML(_sel):"");
  var _hsw=sortedWeights(),_hstart=num(state.settings.startingWeight),_hgoal=num(state.settings.goalWeight);
  var _hcur=_hsw.length?_hsw[_hsw.length-1].weight:_hstart;
  var _hlost=(_hstart!=null&&_hcur!=null)?_hstart-_hcur:null;
  var _htoGo=(_hgoal!=null&&_hcur!=null)?_hcur-_hgoal:null;
  var _hprog=null;if(_hstart!=null&&_hgoal!=null&&_hcur!=null&&_hstart!==_hgoal){_hprog=Math.max(0,Math.min(1,(_hstart-_hcur)/(_hstart-_hgoal)));}
  if(_hstart!=null&&_hgoal!=null){var _hcAll=prepChart(),_hfc=computeForecasts(_hcur,_hgoal,_hcAll.slope);
    var _wN=(state.weights||[]).length;
    var _hrate=(_hcAll.slope!=null&&_wN>=PACE_MIN_WEIGHINS)?(-_hcAll.slope*7*DAY):null;
    var _paceHTML;
    if(_wN<PACE_MIN_WEIGHINS)_paceHTML='<span class="wl-pace dim">'+_wN+' of '+PACE_MIN_WEIGHINS+' weigh-ins</span>';
    else if(_hrate==null)_paceHTML='<span class="wl-pace dim">\u2014 '+u+'/wk</span>';
    else if(Math.abs(_hrate)<(u==="kg"?0.09:0.2))_paceHTML='<span class="wl-pace dim">holding steady</span>';
    else{var _losing=_hrate>0;_paceHTML='<span class="wl-pace'+(_losing?"":" dim")+'">'+(_losing?"\u25bc ":"\u25b2 ")+'<b>'+r1(Math.abs(_hrate))+'</b> '+u+'/wk</span>';}
    var _etaHTML=(_hfc.target&&_hfc.target.date)?'<span class="pe-eta">\u2248 '+fmtShort(_hfc.target.date)+'</span>':'';
    h+='<div class="wl-card wl-hero"><div class="wl-hero-top"><div><div class="wl-mini-label">Current</div><div class="wl-bignum">'+(_hcur!=null?r1(_hcur):"\u2014")+'<span class="wl-unit">'+u+'</span></div></div>';
    h+='<div class="wl-hero-right">';
    if(_hlost!=null)h+='<div class="wl-change '+(_hlost>=0?"good":"bad")+'">'+(_hlost>=0?I.down:I.up)+(_hlost>=0?"Lost ":"Gained ")+Math.abs(r1(_hlost))+' '+u+'</div>';
    h+=_paceHTML+'</div>';
    h+='</div><div class="wl-progress-track"><div class="wl-progress-fill" style="width:'+((_hprog||0)*100)+'%"></div>'+(_hprog!=null?'<div class="wl-progress-marker" style="left:'+(_hprog*100)+'%"></div>':'')+'</div><div class="wl-progress-ends"><span><b>'+r1(_hstart)+'</b> start</span><span class="wl-togo">'+(_htoGo!=null&&_htoGo>0?r1(_htoGo)+" "+u+" to go":"Goal reached")+'</span><span class="pe-r"><span><b>'+r1(_hgoal)+'</b> goal</span>'+_etaHTML+'</span></div></div>';
  }
  if(_atTop)h+=_recapUnit;
  /* The weekly check-in owns this slot now (Owner, 2026-08-03). It replaced the
     "This Week's Progress Photos" prompt because the four photos are captured
     inside the check-in form itself, and unlike that prompt it persists \u2014 with
     escalating lateness \u2014 until it is sent or deliberately skipped. */
  h+=ciCardHTML();
  h+=todayChecklistHTML(state.selDate);
  if(!_atTop)h+=_recapUnit;
  h+=activitySummaryHTML(state.selDate);
  h+='<div class="wl-card"><div class="wl-card-head"><span>This Week’s Goals</span></div>'+trainingGoalsHTML(weekStartOf(state.selDate))+'</div>';
  /* daily recap now rendered above via _recapUnit (dynamic placement) */
    h+='<div class="wl-card"><div class="wl-card-head"><span>Food diary</span><button class="wl-link" data-act="go" data-view="diary">Browse all →</button></div>';
  h+='<div id="wl-photostrip"></div>';
  h+='<div class="wl-mealadd">'+[["breakfast","Breakfast"],["lunch","Lunch"],["snack","Snack"],["dinner","Dinner"]].map(function(m){return '<button class="wl-btn wl-btn-ghost" data-act="photo:add" data-meal="'+m[0]+'">'+I.plus.replace("<svg","<svg width=14 height=14")+m[1]+'</button>';}).join("")+'</div>';
    h+='</div>';
  h+='</div>';return h;
}
function fcCell(label,sub,fc,stalledMsg){
  var h='<div class="wl-fc"><div class="wl-fc-label">'+label+'</div><div class="wl-fc-sub">'+sub+'</div>';
  if(fc&&!fc.stalled)h+='<div class="wl-fc-weeks">'+r1(fc.weeks)+'<span> wks</span></div><div class="wl-fc-date">≈ '+fmtFull(fc.date)+'</div>';
  else h+='<div class="wl-fc-na">'+(stalledMsg||"Add more data")+'</div>';/* stalledMsg now also covers "no forecast at all" (too few weigh-ins to fit a slope) */
  return h+'</div>';
}
function addDays(d,n){var x=new Date(d);x.setHours(0,0,0,0);x.setDate(x.getDate()+n);return x;}
function trendCtx(){
  /* ONE selector on the Progress page (Owner, 2026-08-06: 'redundant to have
     two date range selectors'). The measurement component's W/M/6M control
     now drives EVERYTHING — More stats, sleep, training history — with the
     component's rolling-window semantics (7d / 30d / 6 calendar months
     ending today, offset by whole periods). The old calendar-window control
     and its trend:* actions are retired. */
  var mode=state.t2Mode||"M",off=state.t2Off||0;
  var p=tcPeriod(mode,off,todayISO());
  return {mode:mode,off:off,start:parseISO(p.startISO),end:parseISO(p.endISO),
    gran:(mode==="6M")?"month":"day",label:p.label};
}
function bucketValues(map,pendToday){var ctx=trendCtx();var out=[];
  /* pendToday (Owner rule, 2026-08-02): today's in-progress number must not
     skew averages — it counts only once the day is Completed (a recap
     exists) or has passed. Applies to steps and calories; weight and sleep
     don't accumulate through the day and are left alone. */
  var _td=todayISO();var _tdPending=pendToday&&!dayRecap(_td);
  if(ctx.gran==="day"){for(var d=new Date(ctx.start);d<=ctx.end;d=addDays(d,1)){var _iso=toISO(d);
    out.push({value:num(map[_iso]),date:new Date(d),pending:(_tdPending&&_iso===_td)||undefined});}}
  else{var m=new Date(ctx.start.getFullYear(),ctx.start.getMonth(),1);var guard=0;
    while(m<=ctx.end&&guard++<8){var y=m.getFullYear(),mo=m.getMonth(),sum=0,cnt=0;
    Object.keys(map).forEach(function(k){if(_tdPending&&k===_td)return;var dt=parseISO(k);if(dt.getFullYear()===y&&dt.getMonth()===mo){var v=num(map[k]);if(v!=null){sum+=v;cnt++;}}});
    out.push({value:cnt?Math.round(sum/cnt):null,date:new Date(y,mo,1),month:true});m=new Date(y,mo+1,1);}}
  return out;
}
function bucketAvg(bk){var v=bk.filter(function(b){return !b.pending;}).map(function(b){return b.value;}).filter(function(x){return x!=null;});return v.length?Math.round(v.reduce(function(a,b){return a+b;},0)/v.length):null;}
function niceMax(v){if(v<=0)return 10;var mag=Math.pow(10,Math.floor(Math.log10(v)));var n=v/mag;var nice=n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10;return nice*mag;}
function buildSleepChart(bk,goalMin){
  var n=bk.length;if(!n)return '<div class="wl-empty">No sleep logged this period.</div>';
  var logged=bk.filter(function(b){return b.value!=null;});
  if(!logged.length)return '<div class="wl-empty">No sleep logged this period.</div>';
  var W=340,H=180,padL=28,padR=8,padT=16,padB=32;
  var top=Math.max.apply(null,bk.map(function(b){return b.value||0;}).concat([goalMin||0,60]));
  var yMax=Math.ceil(top/60)*60;if(yMax<60)yMax=60;var plotW=W-padL-padR;
  function sy(v){return (H-padB)-(v/yMax)*(H-padT-padB);}
  function cx(i){return padL+(i+0.5)*(plotW/n);}
  var s='<svg class="wl-chart" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" style="height:'+H+'px">';
  var hrs=yMax/60;var step=hrs<=6?1:hrs<=12?2:Math.ceil(hrs/5);
  for(var hh=0;hh<=hrs;hh+=step){var y=sy(hh*60);s+='<line x1="'+padL+'" y1="'+y+'" x2="'+(W-padR)+'" y2="'+y+'" stroke="'+CH.grid+'"/><text x="'+(padL-4)+'" y="'+(y+3)+'" fill="'+CH.axis+'" font-size="8.5" text-anchor="end">'+hh+'h</text>';}
  if(goalMin!=null){var gy=sy(goalMin);s+='<line x1="'+padL+'" y1="'+gy+'" x2="'+(W-padR)+'" y2="'+gy+'" stroke="'+CH.goal+'" stroke-width="1.2" stroke-dasharray="5 4"/><text x="'+(W-padR)+'" y="'+(gy-4)+'" fill="'+CH.goal+'" font-size="9" text-anchor="end">Goal '+minToHM(goalMin)+'</text>';}
  var path="";logged.forEach(function(b,k){var X=cx(bk.indexOf(b)),Y=sy(b.value);path+=(k?"L":"M")+X.toFixed(1)+" "+Y.toFixed(1)+" ";});
  s+='<path d="'+path+'" fill="none" stroke="'+CH.avg+'" stroke-width="2.2" stroke-linejoin="round"/>';
  logged.forEach(function(b){s+='<circle cx="'+cx(bk.indexOf(b)).toFixed(1)+'" cy="'+sy(b.value).toFixed(1)+'" r="3" fill="'+CH.avg+'"/>';});
  var showLbl=n<=10;var every=n<=10?1:Math.ceil(n/6);
  bk.forEach(function(b,i){if(i%every===0||i===n-1){var X=cx(i).toFixed(1);
    if(b.month)s+='<text x="'+X+'" y="'+(H-9)+'" fill="'+CH.axis+'" font-size="9" text-anchor="middle">'+MONTHS3[b.date.getMonth()]+'</text>';
    else if(showLbl)s+='<text x="'+X+'" y="'+(H-16)+'" fill="'+CH.axis+'" font-size="9" text-anchor="middle">'+DAYS3[b.date.getDay()]+'</text><text x="'+X+'" y="'+(H-5)+'" fill="'+CH.axis+'" font-size="9" font-weight="600" text-anchor="middle">'+b.date.getDate()+'</text>';
    else s+='<text x="'+X+'" y="'+(H-9)+'" fill="'+CH.axis+'" font-size="8.5" text-anchor="middle">'+(b.date.getMonth()+1)+'/'+b.date.getDate()+'</text>';
  }});
  s+='</svg>';return s;
}
function buildBars(bk,goal,higherBetter){
  var n=bk.length;if(!n)return '<div class="wl-empty">No data for this period.</div>';
  var W=340,H=196,padL=30,padR=8,padT=24,padB=32;
  var top=Math.max.apply(null,bk.map(function(b){return b.value||0;}).concat([goal||0,1]));
  var yMax=niceMax(top*1.12);var plotW=W-padL-padR;var showVals=n<=10;
  function sy(v){return (H-padB)-(v/yMax)*(H-padT-padB);}
  function cxc(i){return padL+(i+0.5)*(plotW/n);}
  var bw=Math.min(showVals?22:14,plotW/n*(showVals?0.5:0.72));
  function ylbl(v){return v>=1000?(Math.round(v/100)/10)+"k":Math.round(v);}
  var s='<svg class="wl-chart" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" style="height:'+H+'px">';
  [0,0.5,1].forEach(function(fr){var yv=yMax*fr;var y=sy(yv);s+='<line x1="'+padL+'" y1="'+y+'" x2="'+(W-padR)+'" y2="'+y+'" stroke="'+CH.grid+'"/><text x="'+(padL-4)+'" y="'+(y+3)+'" fill="'+CH.axis+'" font-size="8.5" text-anchor="end">'+ylbl(yv)+'</text>';});
  if(goal!=null){var gy=sy(goal);s+='<line x1="'+padL+'" y1="'+gy+'" x2="'+(W-padR)+'" y2="'+gy+'" stroke="'+CH.goal+'" stroke-width="1.2" stroke-dasharray="5 4"/>';}
  var every=n<=10?1:Math.ceil(n/6);
  bk.forEach(function(b,i){var x=cxc(i);
    if(b.value!=null){var y=sy(b.value);var bh=Math.max(1,(H-padB)-y);var good=goal!=null&&(higherBetter!==false?b.value>=goal:b.value<=goal);var col=good?CH.goal:CH.avg;
      if(b.pending){/* in progress: outlined, not counted in the average */
        s+='<rect x="'+(x-bw/2).toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+bh.toFixed(1)+'" rx="2.5" fill="none" stroke="'+col+'" stroke-width="1.5" stroke-dasharray="3 2"/>';
        if(showVals)s+='<text x="'+x.toFixed(1)+'" y="'+(y-4).toFixed(1)+'" fill="'+CH.axis+'" font-size="9.5" font-weight="700" text-anchor="middle">'+Math.round(b.value).toLocaleString()+'</text>';
      }else{
        s+='<rect x="'+(x-bw/2).toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+bh.toFixed(1)+'" rx="2.5" fill="'+col+'"/>';
        if(showVals)s+='<text x="'+x.toFixed(1)+'" y="'+(y-4).toFixed(1)+'" fill="'+col+'" font-size="9.5" font-weight="700" text-anchor="middle">'+Math.round(b.value).toLocaleString()+'</text>';}}
    if(i%every===0||i===n-1){
      if(b.month)s+='<text x="'+x.toFixed(1)+'" y="'+(H-9)+'" fill="'+CH.axis+'" font-size="9" text-anchor="middle">'+MONTHS3[b.date.getMonth()]+'</text>';
      else if(showVals)s+='<text x="'+x.toFixed(1)+'" y="'+(H-16)+'" fill="'+CH.axis+'" font-size="9" text-anchor="middle">'+DAYS3[b.date.getDay()]+'</text><text x="'+x.toFixed(1)+'" y="'+(H-5)+'" fill="'+CH.axis+'" font-size="9" font-weight="600" text-anchor="middle">'+b.date.getDate()+'</text>';
      else s+='<text x="'+x.toFixed(1)+'" y="'+(H-9)+'" fill="'+CH.axis+'" font-size="8.5" text-anchor="middle">'+(b.date.getMonth()+1)+'/'+b.date.getDate()+'</text>';
    }});
  s+='</svg>';return s;
}