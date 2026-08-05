/* ARCHIVED — the pre-spec measured-TDEE implementation.
 *
 * Kept verbatim for reference and rollback. This is the code that shipped as
 * 2026-08-04.449-tdeewindow, superseded on 2026-08-05 by src/tdee-core.js,
 * which implements TDEE-MEASUREMENT-SPEC.md.
 *
 * NOT LOADED. Nothing references this file; it exists so the previous
 * behaviour can be read or restored without archaeology through git.
 *
 * Two lineages are preserved below:
 *   1. tdeeWindow  as of .449  — anchored window, 3-weigh-in clusters
 *   2. tdeeAnalysis as of .449 — the proposal/cooldown/comply state machine,
 *      which the new core deliberately does NOT contain (spec §11: the
 *      engine must never alter or propose targets)
 *
 * Why it was replaced: the trend was computed by comparing two cluster
 * averages, which the spec forbids (§5 — "Do not use lastWeight - firstWeight
 * as the trend"); it had a single eligibility bar rather than confidence
 * tiers; and it emitted no audit record.
 */

function tdeeWindow(){var MAXW=35,CL=3;
  var today=todayISO(),t=parseISO(today);
  var wAll=[];state.weights.forEach(function(x){var wv=num(x.weight);if(wv==null)return;
    var age=Math.round((t.getTime()-parseISO(x.date).getTime())/DAY);
    if(age<0||age>MAXW)return;wAll.push({d:x.date,w:wv,ts:parseISO(x.date).getTime()});});
  wAll.sort(function(a,b){return a.ts-b.ts;});
  /* the analysis stretch is the data's own span, not a fixed calendar frame */
  var startTs=wAll.length?wAll[0].ts:t.getTime();
  var spanDays=Math.round((t.getTime()-startTs)/DAY);
  var foodVals=[];
  for(var i=0;i<=spanDays;i++){var iso=toISO(new Date(startTs+i*DAY));
    if(dayStatus(iso))continue;                    /* vacation/sick days never count */
    var e=state.food[iso];var c=e?num(e.calories):null;if(c!=null)foodVals.push(c);}
  var head=wAll.slice(0,CL),tail=wAll.slice(-CL);
  function avgW(a){if(!a.length)return null;var s=0;a.forEach(function(x){s+=x.w;});return s/a.length;}
  function avgI(a){if(!a.length)return null;var s=0;a.forEach(function(x){s+=(x.ts-startTs)/DAY;});return s/a.length;}
  var headW=avgW(head),tailW=avgW(tail),headI=avgI(head),tailI=avgI(tail);
  /* with fewer than 2*CL weigh-ins the clusters would overlap and share
     readings, which would flatter the gap; require them to be disjoint */
  var disjoint=wAll.length>=CL*2;
  var effDays=(headI!=null&&tailI!=null&&disjoint)?(tailI-headI):null;
  var foodAvg=foodVals.length?foodVals.reduce(function(a,b){return a+b;},0)/foodVals.length:null;
  var ok=foodVals.length>=14&&head.length>=2&&tail.length>=2&&wAll.length>=6&&effDays!=null&&effDays>=10;
  return {foodN:foodVals.length,foodAvg:foodAvg,headW:headW,tailW:tailW,headN:head.length,tailN:tail.length,totalW:wAll.length,effDays:effDays,ok:ok};}

function tdeeAnalysis(){var w=tdeeWindow();var res={win:w,state:"gathering"};if(!w.ok)return res;
  var cpu=tdeeCalPerUnit();var rate=(w.tailW-w.headW)/w.effDays*7;
  res.rate=rate;res.tdee=Math.round(w.foodAvg-rate*cpu/7);res.intake=Math.round(w.foodAvg);
  var s=state.settings;var mode=strategyMode();var tgtCal=num(s.targetCalories);var tR=tdeeTargetRate();res.targetRate=tR;
  if(tgtCal==null||tR==null){res.state="ok";return res;}
  var today=todayISO();
  function within(ds,n){if(!ds)return false;return today<toISO(addDays(parseISO(ds),n));}
  var blocked=within(s.tdeeApplied,14)||within(s.tdeeSnooze,7);
  var dirGood=(mode==="gain")?rate:-rate;
  var over=w.foodAvg-tgtCal;
  if(mode!=="gain"&&over>100&&dirGood<tR*0.75){res.state="comply";res.over=Math.round(over);return res;}
  if(mode==="gain"&&over<-100&&dirGood<tR*0.75){res.state="comply";res.over=Math.round(over);return res;}
  if(mode==="maintain"){var band=(s.units==="kg"?0.12:0.25);
    if(Math.abs(rate)<=band){res.state="ok";return res;}
    if(blocked){res.state="cooldown";return res;}
    var gm=Math.min(150,Math.max(100,Math.round(Math.abs(rate)*cpu/7/10)*10));
    res.state="propose";res.gapDay=Math.round(Math.abs(rate)*cpu/7);res.prop=tdeeBuildProp(tgtCal+(rate>0?-gm:gm),0,0);return res;}
  if(dirGood>=tR*0.75&&dirGood<=tR*1.5){res.state="ok";return res;}
  if(blocked){res.state="cooldown";return res;}
  if(dirGood>tR*1.5){var gap1=(dirGood-tR)*cpu/7;var add=Math.min(200,Math.max(100,Math.round(gap1/2/10)*10));
    res.state="toofast";res.gapDay=Math.round(gap1);res.prop=tdeeBuildProp(tgtCal+(mode==="gain"?-add:add),0,0);return res;}
  var gap2=(tR-dirGood)*cpu/7;var stepsG=num(s.stepsGoal),cardG=num(s.cardioMinGoal);
  var stepAdd=(stepsG!=null)?1000:0;var cardAdd=(cardG!=null)?15:0;
  var offset=(stepAdd?45:0)+(cardAdd?21:0);
  var trim=Math.max(0,Math.min(200,Math.round((gap2-offset)/10)*10));
  res.state="propose";res.gapDay=Math.round(gap2);
  res.prop=tdeeBuildProp(tgtCal+(mode==="gain"?trim:-trim),stepAdd,cardAdd);return res;}
