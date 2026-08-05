/* MP-CALC-START */
var MPCFG={
  version:"glp1-report-v3",
  /* 1.1.0 is an ADDITIVE bump: no existing formula's arithmetic changed. The new
     ids (review.windowSelection, insight.relationship, correlation.pearson,
     summary.narrative) are new expressions, and every old id still computes
     exactly what it computed at 1.0.0, so an archived v2 report and a v3 report
     of the same window agree.
     NOTE for anyone adding another: a formula id must never be namespaced as
     the word "window" followed by a dot and a letter. mp-formulas.test.mjs (M3)
     proves this module touches no browser globals by scanning its own source
     for exactly that shape, and an id spelled that way is indistinguishable
     from a real browser-global reference. Namespace review-window ids under
     "review." instead, as review.windowSelection.v1 does. */
  formulaVersion:"1.1.0",
  /* The review window. 42 days is the spec's own top claim tier
     ("42+ days: higher-confidence phase-level conclusions"), so nothing
     beyond it buys extra claim power — it only dilutes coverage
     denominators for a long-running user. It stays the DEFAULT for that
     reason; 28 and 56 are offered because a coach may want a tighter or a
     wider read, and the choice is made at export time. Named `assessment`,
     not `window`, so nothing in this module ever reads as a browser global. */
  assessment:{maxDays:42,defaultPreset:"42",presets:["28","42","56"],
    presetDays:{"28":28,"42":42,"56":56},maxWindowDays:400},
  /* Relationship gates. Deliberately severe: with four sessions and nine days
     any pairing of two measures is noise, so a relationship is only STATED
     when both sides are established, the window is long enough, and enough
     paired observations exist. Everything below the gate is still exposed as a
     candidate carrying its own blocker, so a reader sees what was considered
     and why it was refused. */
  insight:{minWindowDays:28,minPairedDays:21,minPairedSessions:6,minPairedDoseDays:14},
  correlation:{minPairedPoints:24,minWindowDays:42,minAbsR:0.5},
  protein:{hitThreshold:0.90,minimumValidDays:7,minimumCoverage:0.80},
  calories:{defaultTolerancePct:0.10,minimumValidDays:7,minimumCoverage:0.80},
  sleep:{lowNightThreshold:0.80,minimumValidNights:7,minimumCoverage:0.80},
  strength:{minCompletedReps:3,maxCompletedReps:10,maxIndexAdjustedReps:10,
    maxDisplayAdjustedReps:12,maxRir:3,stableBandPct:2.5,minimumCategories:3,
    minEligibleWeeks:4,minSpanWeeks:3,minBaselineObs:2,minCurrentObs:2},
  bodyweight:{minimumWeighIns:7,minimumTrendDays:21,minimumVerdictDays:28,
    minimumEndpointWeekWeights:5,minimumCoverage:0.80,minRollingPoints:4,
    projectionMinR2:0.5,minimumVerdictWeighIns:21},
  glp1:{projectionSuppressionDaysAfterDoseChange:14,materialSeverity:4},
  rpe:{riseThreshold:1.0,minSessions:2},
  soreness:{consecutiveForPersistent:3,highValue:"still"},
  joint:{consecutiveForPersistent:2,alertRank:2},
  verdict:{minDays:28,minWeighIns:21,minCategories:3,minNutritionCoverage:0.80,
    disruptedCompletionPct:70}
};

/* ---- tiny pure helpers (deliberately self-contained) ---- */
function mpNum(v){if(v===""||v===null||v===undefined)return null;var n=parseFloat(v);return isFinite(n)?n:null;}
function mpPad(n){return (n<10?"0":"")+n;}
function mpToISO(d){return d.getFullYear()+"-"+mpPad(d.getMonth()+1)+"-"+mpPad(d.getDate());}
function mpParseISO(s){var p=String(s).split("-");return new Date(parseInt(p[0],10),parseInt(p[1],10)-1,parseInt(p[2],10));}
function mpIsISO(s){return /^\d{4}-\d{2}-\d{2}$/.test(String(s));}
function mpAddDays(iso,n){var d=mpParseISO(iso);d.setDate(d.getDate()+n);return mpToISO(d);}
/* whole days from a to b; Math.round absorbs the one-hour DST wobble that
   local-midnight Date arithmetic introduces twice a year */
function mpDayDiff(a,b){return Math.round((mpParseISO(b).getTime()-mpParseISO(a).getTime())/86400000);}
function mpDaysBetween(a,b){return mpDayDiff(a,b)+1;}
function mpISOList(a,b){var out=[],d=a,guard=0;
  while(d<=b&&guard<4000){out.push(d);d=mpAddDays(d,1);guard++;}
  return out;}
function mpWeekKey(iso,weekStartDay){var d=mpParseISO(iso);var ws=parseInt(weekStartDay,10)||0;
  var diff=(d.getDay()-ws+7)%7;d.setDate(d.getDate()-diff);return mpToISO(d);}
function mpFinite(arr){var o=[];for(var i=0;i<arr.length;i++){var v=arr[i];
  if(typeof v==="number"&&isFinite(v))o.push(v);}return o;}
function mpMean(arr){var a=mpFinite(arr);if(!a.length)return null;
  var t=0;for(var i=0;i<a.length;i++)t+=a[i];return t/a.length;}
/* population SD, used only as a noise yardstick for interpretation confidence —
   never as an input to any measured value */
function mpSd(arr){var a=mpFinite(arr);if(a.length<2)return null;
  var m=mpMean(a),s=0;for(var i=0;i<a.length;i++)s+=(a[i]-m)*(a[i]-m);
  return Math.sqrt(s/a.length);}
function mpMedian(arr){var a=mpFinite(arr).sort(function(x,y){return x-y;});
  if(!a.length)return null;var m=a.length>>1;
  return (a.length%2)?a[m]:(a[m-1]+a[m])/2;}
function mpE1rm(w,r){w=mpNum(w);r=mpNum(r);if(w==null||r==null||r<1)return null;return w*(1+r/30);}
function mpEsc(s){return String(s).replace(/[&<>"']/g,function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
var MP_MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
/* fixed month table, not toLocaleDateString: a report the test renders must be
   byte-identical on Griffin's phone and on a CI box in another locale */
function mpDateLabel(iso){if(!mpIsISO(iso))return "—";var p=String(iso).split("-");
  return MP_MONTHS[parseInt(p[1],10)-1]+" "+parseInt(p[2],10);}
function mpDateFull(iso){if(!mpIsISO(iso))return "—";var p=String(iso).split("-");
  return MP_MONTHS[parseInt(p[1],10)-1]+" "+parseInt(p[2],10)+", "+p[0];}

/* Every number that reaches the page goes through one of these. They return an
   em dash for null/NaN/Infinity, so "NaN", "undefined" and "Infinity" cannot be
   printed even if a calculation upstream goes wrong. */
function mpFmt(n,dp){if(n==null||typeof n!=="number"||!isFinite(n))return "—";
  return n.toFixed(dp==null?0:dp);}
function mpPct(n,dp){if(n==null||typeof n!=="number"||!isFinite(n))return "—";
  return n.toFixed(dp==null?1:dp)+"%";}
function mpSigned(n,dp){if(n==null||typeof n!=="number"||!isFinite(n))return "—";
  var d=(dp==null?1:dp);return (n<0?"−":"+")+Math.abs(n).toFixed(d);}
function mpSignedPct(n,dp){if(n==null||typeof n!=="number"||!isFinite(n))return "—";
  return mpSigned(n,dp)+"%";}
function mpC(n){return (typeof n==="number"&&isFinite(n))?String(Math.round(n*100)/100):"0";}
function mpInt(n){if(n==null||typeof n!=="number"||!isFinite(n))return "—";return String(Math.round(n));}
function mpPlural(n,one,many){return (n===1)?one:many;}

/* ============================================================
   SPLIT CONFIDENCE
   ------------------------------------------------------------
   Two questions that a single word could never answer at once:

     DATA confidence          — how much of the window was actually measured.
                                Coverage, valid n, recency, measurement gaps.
     INTERPRETATION confidence — whether the number that came out can be READ.
                                Effect size against noise, agreement between the
                                parts, comparability integrity, window adequacy.

   They come apart constantly and legitimately. Forty-two days of perfect
   weigh-ins that fit a slope explaining almost none of the scatter is HIGH data
   confidence and LOW interpretation confidence: the measurement is sound and
   the reading of it is not. Both are printed, always, side by side.

   `confidence` is KEPT, unmigrated, and is always identical to dataConfidence.
   Existing callers, archived reports and the current tests all read it and mean
   exactly what it has always meant; the new axis is added beside it rather than
   redefined underneath it.
   ============================================================ */
var MP_INTERP_MIN_DAYS={protein:14,calories:14,nutritionCoverage:7,sleep:14,
  training:14,strength:28,relative:28,bodyweight:21,projection:28,rpe:28,
  soreness:21,joint:0,glp:0};
function mpInterpret(o){
  var reasons=(o.notes||[]).slice();
  if(o.state==="missing"||o.state==="not_applicable")
    return {level:"insufficient",
      reasons:reasons.concat(["No value is established, so there is nothing to interpret."])};
  var need=(MP_INTERP_MIN_DAYS[o.key]==null?0:MP_INTERP_MIN_DAYS[o.key]);
  var days=(typeof o.windowDays==="number"&&isFinite(o.windowDays))?o.windowDays:0;
  var winOk=(days>=need);
  if(!winOk)reasons.push("The window is "+days+" "+mpPlural(days,"day","days")+
    "; reading this measure needs at least "+need+".");
  if(o.comparable===false)reasons.push("A comparability break sits inside the window, so the two ends of the comparison are not the same measurement.");
  if(o.effectClear===false)reasons.push("The measured difference is not separable from the run-to-run noise of this measure, so its DIRECTION is not readable even though the measurement itself is sound.");
  if(o.consistent===false)reasons.push("The parts this measure is built from do not agree with one another.");
  var level;
  if(!winOk||o.comparable===false)level="insufficient";
  else if(o.state==="provisional")level="low";
  else if(o.effectClear===false)level="low";
  else if(o.effectClear===true&&o.consistent!==false)level=(days>=MPCFG.assessment.maxDays?"high":"moderate");
  else level="moderate";
  return {level:level,reasons:reasons};}

/* ---- the data-state object every metric returns ---- */
function mpResult(o){
  var valid=(o.valid==null?0:o.valid),expected=(o.expected==null?0:o.expected);
  var wd=(mpIsISO(o.start)&&mpIsISO(o.end))?mpDaysBetween(o.start,o.end):0;
  var interp=mpInterpret({key:(o.key||""),state:o.state,windowDays:wd,
    effectClear:(o.effectClear===undefined?null:o.effectClear),
    consistent:(o.consistent===undefined?null:o.consistent),
    comparable:(o.comparable===undefined?null:o.comparable),
    notes:(o.interpNotes||[])});
  var dataConf=o.confidence||"insufficient";
  return {
    key:o.key||"",
    title:o.title||"",
    state:o.state,
    value:(o.value===undefined?null:o.value),
    unit:(o.unit==null?"":o.unit),
    label:(o.label===undefined?null:o.label),
    /* retained verbatim for compatibility; always === dataConfidence */
    confidence:dataConf,
    dataConfidence:dataConf,
    interpretationConfidence:interp.level,
    interpretationReasons:interp.reasons,
    /* the three judgements the interpretation level was assembled from, kept on
       the object so the audit drawer prints them rather than re-deriving them */
    interpretationInputs:{
      effectClear:(o.effectClear===undefined?null:o.effectClear),
      consistent:(o.consistent===undefined?null:o.consistent),
      comparable:(o.comparable===undefined?null:o.comparable),
      minimumDays:(MP_INTERP_MIN_DAYS[o.key||""]==null?0:MP_INTERP_MIN_DAYS[o.key||""])},
    windowDays:wd,
    /* stable handle for a future coach annotation. Nothing reads it yet. */
    anchorId:"mp:metric:"+(o.key||"unknown"),
    coverage:{valid:valid,expected:expected,
      percentage:(expected>0?(100*valid/expected):null)},
    blockers:(o.blockers||[]).slice(),
    exclusions:(o.exclusions||[]).slice(),
    sourceWindow:{start:(o.start==null?null:o.start),end:(o.end==null?null:o.end)},
    formulaId:o.formulaId||"unknown",
    formulaVersion:MPCFG.formulaVersion,
    configVersion:MPCFG.version,
    detail:o.detail||{}};}

/* Human-readable expression for every formulaId, printed in the audit drawer so
   a coach can redo the arithmetic by hand (acceptance G1). */
var MP_FORMULA_TEXT={
  "protein.meanAttainment.v1":"MeanProteinAttainment = 100 × Σ min(Protein_d / Target_d, 1.0) / N_valid · HitRate = 100 × count(Protein_d ≥ 0.90 × Target_d) / N_valid · Coverage = 100 × N_valid / N_days",
  "calories.withinTolerance.v1":"WithinTolerance = 100 × count(|Calories_d − Target| ≤ tolerance × Target) / N_valid · MeanAbsDeviation = Σ |Calories_d − Target| / N_valid",
  "sleep.goalAttainment.v1":"MeanAttainment = 100 × Σ min(SleepMinutes_d / GoalMinutes, 1.0) / N_valid · LowNights = count(SleepMinutes_d < 0.80 × Goal)",
  "rpe.windowDelta.v1":"Δ = mean(session RPE, current half of window) − mean(session RPE, prior half). Limitation flag only if Δ ≥ 1.0 AND comparable strength is flat or falling AND ≥ 2 sessions in the current half.",
  "soreness.persistence.v1":"Persistent alert = ≥ 3 consecutive check-ins reporting the highest soreness grade for the same muscle group. Ratings are never averaged.",
  "joint.persistence.v1":"Alert = any rating of Moderate or above. Persistent = the same exercise rated Moderate+ on two consecutive exposures. Rising = severity increased between consecutive exposures.",
  "glp1.symptomContext.v1":"No score is computed. Symptoms are listed with type, severity (1–5), date and days since the preceding dose.",
  "strength.exerciseChange.v1":"e1RM = Epley on RIR-adjusted reps: load × (1 + (reps + RIR) / 30). WeeklyValue = median(qualifying top-set e1RM in that week). Baseline = median(first two eligible weeks). Current = median(latest two eligible weeks). Change = 100 × (Current / Baseline − 1).",
  "strength.globalChange.v1":"CategoryChange = median(eligible exercise changes in the category). GlobalChange = median(eligible CategoryChange values). Needs ≥ 3 categories including ≥ 1 upper-body and ≥ 1 lower-body.",
  "strength.relative.v1":"RelativeStrength = ExerciseValue / mean bodyweight of the same weeks. Change is aggregated by the same median-of-categories rule as the absolute index.",
  "bodyweight.rawOnly.v1":"Raw weigh-ins and their mean. No rate is calculated at this window length.",
  "bodyweight.provisionalPattern.v1":"7-day rolling means over the window, shown as a provisional pattern only. No rate, no projection.",
  "bodyweight.endpointBlocks.v1":"Change = mean(last 7 days) − mean(first 7 days). WeeklyRate = Change / (windowDays − 7) × 7, the two block centres being windowDays − 7 days apart. Needs ≥ 5 valid weights in each endpoint week.",
  "bodyweight.rollingSlope.v1":"Daily 7-day rolling means, then a least-squares slope over those means, × 7 for a weekly rate. R² and coverage are reported alongside.",
  "bodyweight.projection.v1":"WeeksToGoal = (current − goal) / weekly rate. Requires ≥ 28 days, ≥ 80% coverage, R² ≥ 0.5, a rate in the goal direction, and no GLP-1 dose change in the last 14 days.",
  "training.completion.v1":"Completion = 100 × CompletedSessions / (weekly session goal × windowDays / 7). The denominator is never inferred.",
  "nutrition.coverage.v1":"Coverage = 100 × count(days with any logged calorie or macro value, not marked skipped) / N_days",
  "review.windowSelection.v1":"The review window is chosen at export: a 28 / 42 / 56-day preset, Current Phase, or a custom range. A preset starts at the first logged day, moves forward to the first GLP-1 dose if one exists, and is then capped at the preset length. Current Phase starts at the profile start date, else the first GLP-1 dose, else the first logged day. Every threshold in this report is expressed in days and is applied against the window actually chosen.",
  "insight.relationship.v1":"No coefficient is computed. Two established measures are reported side by side over one window with the paired count that supports them. A relationship is STATED only when both sides are Available, the window clears its minimum and the paired count clears its minimum; otherwise the candidate is listed with the blocker that stopped it. Direction is described as coinciding or opposing, never as causing.",
  "correlation.pearson.v1":"r = Σ((x−x̄)(y−ȳ)) / √(Σ(x−x̄)² × Σ(y−ȳ)²) over days where BOTH series have a value. Computed only when n ≥ 24 paired points and the window is ≥ 42 days; below either gate no coefficient is calculated and the candidate reports its blocker. |r| < 0.5 is reported as no relationship established. r is association over one window and is never read as cause.",
  "summary.narrative.v1":"The narrative is assembled by rule from the metric objects above — there is no language model and no network call anywhere in this document. Each sentence is emitted only when the metric it rests on carries the state that sentence claims, and each carries the metric keys, formula ids and values it was built from. The same input produces the same bytes."};

/* ============================================================
   CLAIM VOCABULARY GATE
   The tiers are product claim thresholds, not physiology. The gate is
   structural, not editorial: judgement words exist ONLY inside MP_PHRASES,
   each behind a minimum window length, so a forbidden word is unreachable
   below its threshold no matter what the renderer asks for.
   ============================================================ */
var MP_BANNED_ALWAYS=["muscle loss detected","excellent","poor","losing muscle"];
var MP_TIERS=[
  {min:0,  id:"t0",name:"Early observation",
   forbidden:MP_BANNED_ALWAYS.concat(["improving","declining","preserved","retained","on track"])},
  {min:14, id:"t1",name:"Provisional pattern",
   forbidden:MP_BANNED_ALWAYS.concat(["improving","declining","preserved","retained","on track"])},
  {min:21, id:"t2",name:"Emerging trend",
   forbidden:MP_BANNED_ALWAYS.concat(["improving","declining","preserved","retained"])},
  {min:28, id:"t3",name:"Established window",forbidden:MP_BANNED_ALWAYS.concat(["preserved"])},
  {min:42, id:"t4",name:"Phase-level window",forbidden:MP_BANNED_ALWAYS.concat(["preserved"])}
];
/* "Preserved" is banned at every tier on purpose: strength data can never
   establish that lean mass was preserved, only that measured strength held. */
function mpTierFor(days){var d=(typeof days==="number"&&isFinite(days))?days:0;
  var t=MP_TIERS[0];
  for(var i=0;i<MP_TIERS.length;i++){if(d>=MP_TIERS[i].min)t=MP_TIERS[i];}
  return t;}
function mpVocab(windowDays){
  var d=(typeof windowDays==="number"&&isFinite(windowDays))?windowDays:0;
  var t=mpTierFor(d);
  return {tier:t.id,tierName:t.name,days:d,forbidden:t.forbidden.slice(),
    allows:function(w){return t.forbidden.indexOf(String(w).toLowerCase())<0;},
    term:function(k){return mpTerm(k,d);}};}
/* Ordered high-to-low; the first row whose threshold the window clears wins. */
var MP_PHRASES={
  "strength.up":[[28,"Improving"],[21,"Emerging upward trend"],[14,"Provisional upward pattern"],[0,"Early observation"]],
  "strength.flat":[[28,"Retained — measured strength held"],[21,"Strength appears stable"],[14,"Provisional flat pattern"],[0,"Early observation"]],
  "strength.down":[[28,"Declining"],[21,"Emerging downward trend"],[14,"Provisional downward pattern"],[0,"Early observation"]],
  "strength.none":[[0,"Not established"]],
  "bw.down":[[28,"Bodyweight decreasing"],[21,"Bodyweight appears to be decreasing"],[14,"Provisional downward pattern"],[0,"Current values only"]],
  "bw.up":[[28,"Bodyweight increasing"],[21,"Bodyweight appears to be increasing"],[14,"Provisional upward pattern"],[0,"Current values only"]],
  "bw.flat":[[28,"Bodyweight stable"],[21,"Bodyweight appears stable"],[14,"Provisional flat pattern"],[0,"Current values only"]],
  "bw.none":[[0,"Not established"]],
  "rate.within":[[28,"Weight-loss rate within target"]],
  "rate.above":[[28,"Weight-loss rate above target"]],
  "rate.below":[[28,"Weight-loss rate below target"]],
  "rate.none":[[0,"Rate not established"]],
  "verdict.favorable":[[28,"Muscle-preservation indicators favourable"]],
  "verdict.mixed":[[28,"Muscle-preservation indicators mixed"]],
  "verdict.concerning":[[28,"Muscle-preservation indicators concerning"]],
  "verdict.none":[[0,"Not yet established"]],
  "confidence.note":[[42,"Higher-confidence phase-level reading"],[28,"Established window"],[21,"Moderate confidence — confirm with further data"],[14,"Early trend, low confidence — requires confirmation"],[0,"Not enough data to establish a trend"]]
};
function mpTerm(key,days){
  var rows=MP_PHRASES[key];if(!rows)return "";
  var d=(typeof days==="number"&&isFinite(days))?days:0;
  for(var i=0;i<rows.length;i++){if(d>=rows[i][0])return rows[i][1];}
  return "";}
/* Exported for the test suite: scans arbitrary text for words this window has
   not earned. Word-boundary matched, so "preservation" never trips "preserved". */
function mpVocabViolations(text,windowDays){
  var t=mpTierFor(windowDays),s=String(text),out=[];
  for(var i=0;i<t.forbidden.length;i++){
    var w=t.forbidden[i];
    var re=new RegExp("\\b"+w.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\b","i");
    if(re.test(s))out.push(w);}
  return out;}

/* ============================================================
   THE REVIEW WINDOW
   ------------------------------------------------------------
   Five shapes, chosen at EXPORT time and frozen into the document: 28 / 42 /
   56 days, Current Phase, or a custom range. The report itself is static HTML
   with no script, so it cannot carry a selector — the choice travels in
   input.reviewWindow and the document prints which one it was built with.

   A day-preset window starts at the first day anything was logged, moves
   forward to the first GLP-1 dose if one exists (this is a GLP-1 phase report:
   data from before the drug started is not part of the phase), and is then
   capped at the chosen length. With no choice supplied the preset is 42 days,
   which is byte-for-byte what this report did before the presets existed.

   Every gating threshold elsewhere in this module is expressed in days and is
   applied against win.days — the window the coach actually chose. Choosing 56
   days therefore cannot weaken a minimum; it can only make one easier to clear.
   ============================================================ */
function mpWindowChoice(input){
  var A=MPCFG.assessment;
  var c=(input&&input.reviewWindow)||null;
  if(!c||!c.mode)return {mode:"days",days:A.presetDays[A.defaultPreset],
    preset:A.defaultPreset,label:A.presetDays[A.defaultPreset]+" days"};
  if(c.mode==="phase")return {mode:"phase",days:null,preset:null,label:"Current phase"};
  if(c.mode==="custom")return {mode:"custom",days:null,preset:null,label:"Custom range",
    start:(mpIsISO(c.start)?c.start:null),end:(mpIsISO(c.end)?c.end:null)};
  var d=mpNum(c.days);
  if(d==null||d<1)d=A.presetDays[A.defaultPreset];
  d=Math.round(d);
  if(d>A.maxWindowDays)d=A.maxWindowDays;
  return {mode:"days",days:d,preset:(A.presetDays[String(d)]!=null?String(d):null),
    label:d+" days"};}

/* The phase start, resolved down an explicit chain and never inferred.
   1. settings.startDate — the profile's own "Start date", set beside starting
      weight. It is the athlete's statement of when the phase began, so nothing
      needs deriving. A date in the future is not a start that has happened, so
      it is refused rather than used.
   2. the first GLP-1 dose, if one was logged.
   3. the first day anything was logged.
   Compound still stores no history of strategy changes, so anything BEYOND this
   chain — an earlier phase boundary, a cut that became a maintenance block — is
   invisible and is not guessed at. */
function mpPhaseStart(input,firstData,doseStart,end){
  var S=input.settings||{};
  var sd=S.startDate;
  if(mpIsISO(sd)&&(!mpIsISO(end)||sd<=end))
    return {start:sd,basis:"your start date",source:"startDate",limitations:[]};
  var lim=[];
  if(sd!=null&&sd!==""){
    lim.push(mpIsISO(sd)
      ? "The profile start date ("+mpDateFull(sd)+") is in the future, so it is not the start of a phase that has happened and was not used."
      : "The profile start date is not a usable date, so it was not used.");}
  else lim.push("No start date is set in the profile (Settings › Starting weight and start date), so the phase start was taken from the data instead.");
  if(doseStart!=null)
    return {start:doseStart,basis:"first GLP-1 dose",source:"doseStart",limitations:lim};
  return {start:firstData,basis:"first logged day",source:"firstData",limitations:lim};}

function mpWindow(input){
  var choice=mpWindowChoice(input);
  var end=input.windowEnd;
  var first=null;
  function lo(d){if(mpIsISO(d)&&(first==null||d<first))first=d;}
  (input.weights||[]).forEach(function(w){if(w&&mpNum(w.weight)!=null)lo(w.date);});
  var fo=input.food||{};for(var fk in fo)lo(fk);
  var sl=input.sleep||{};for(var sk in sl)lo(sk);
  (input.sessions||[]).forEach(function(s){if(s)lo(s.date);});
  var doseStart=null;
  var doses=((input.glp||{}).doses)||[];
  doses.forEach(function(d){
    if(!d||d.skipped||d.takenAt==null)return;
    var iso=mpToISO(new Date(d.takenAt));
    if(doseStart==null||iso<doseStart)doseStart=iso;});
  if(first!=null&&doseStart!=null&&doseStart<first)lo(doseStart);
  if(first==null&&doseStart!=null)first=doseStart;
  function shell(o){
    return {start:o.start,end:o.end,days:o.days,dates:o.dates,basis:o.basis,
      mode:choice.mode,label:choice.label,preset:(choice.preset||null),
      requestedDays:(choice.days==null?null:choice.days),
      limitations:(o.limitations||[]),choice:choice,
      firstData:first,doseStart:doseStart,phaseSource:(o.phaseSource||null)};}
  /* --- custom range: exactly the dates asked for, never extended past today --- */
  if(choice.mode==="custom"){
    var cs=choice.start,ce=choice.end;
    if(mpIsISO(ce)&&mpIsISO(end)&&ce>end)ce=end;   /* never count days that have not happened */
    if(!mpIsISO(cs)||!mpIsISO(ce)||cs>ce)
      return shell({start:null,end:(mpIsISO(ce)?ce:(mpIsISO(end)?end:null)),days:0,dates:[],
        basis:"custom range (not a usable pair of dates)",
        limitations:["The custom range supplied is not a usable pair of dates, so no window was assessed."]});
    return shell({start:cs,end:ce,days:mpDaysBetween(cs,ce),dates:mpISOList(cs,ce),
      basis:"custom range",
      limitations:["This is a custom range chosen at export. Every threshold in this report is expressed in days and is applied against this range, so a longer range never lowers a minimum."]});}
  if(first==null||!mpIsISO(end)||first>end)
    return shell({start:null,end:(mpIsISO(end)?end:null),days:0,dates:[],basis:"nothing logged"});
  /* --- current phase: explicit start date first, then the fallback chain --- */
  if(choice.mode==="phase"){
    var ph=mpPhaseStart(input,first,doseStart,end);
    var ps=ph.start;
    if(!mpIsISO(ps)||ps>end)
      return shell({start:null,end:end,days:0,dates:[],basis:"current phase (no usable start)",
        limitations:ph.limitations.concat(["No usable phase start could be resolved, so no window was assessed."])});
    return shell({start:ps,end:end,days:mpDaysBetween(ps,end),dates:mpISOList(ps,end),
      basis:"current phase — "+ph.basis,phaseSource:ph.source,
      limitations:ph.limitations.concat(
        ["Compound stores the current strategy but no history of when it changed, so no phase BOUNDARY has been inferred: this window runs from the start above to the export date and nothing inside it has been split."])});}
  /* --- day presets --- */
  var start=first,basis="first logged day";
  if(doseStart!=null&&doseStart>start){start=doseStart;basis="first GLP-1 dose";}
  var cap=mpAddDays(end,-(choice.days-1));
  if(cap>start){start=cap;basis=choice.days+"-day assessment cap";}
  var lims=[];
  if(choice.days>MPCFG.assessment.maxDays)
    lims.push("Beyond "+MPCFG.assessment.maxDays+" days the claim vocabulary does not strengthen any further — "+
      MPCFG.assessment.maxDays+"+ days is already the top tier. A longer window changes coverage denominators and how much history each trend is fitted over, not what this report is allowed to say.");
  return shell({start:start,end:end,days:mpDaysBetween(start,end),dates:mpISOList(start,end),
    basis:basis,limitations:lims});}

function mpSkipped(input,d,field){
  var s=input.skips||{};return !!(s[d]&&s[d][field]);}
function mpSessionsInWindow(input,win){
  if(!win.days)return [];
  return (input.sessions||[]).filter(function(s){
    return s&&mpIsISO(s.date)&&s.date>=win.start&&s.date<=win.end;})
    .slice().sort(function(a,b){
      return (a.date===b.date)?((a.ts||0)-(b.ts||0)):(a.date<b.date?-1:1);});}

/* ============================================================
   1. PROTEIN
   The app's stored gram target is canonical and is never recalculated here.
   An unlogged day is UNKNOWN, not zero — it lowers coverage and nothing else.
   Daily attainment is capped at 1.0, which is the whole point of C1: one
   double-protein day cannot buy back six missed ones.
   ============================================================ */
function mpProtein(input,win){
  var S=input.settings||{};
  var base={key:"protein",title:"Protein target attainment",unit:"%",
    formulaId:"protein.meanAttainment.v1",start:win.start,end:win.end,expected:win.days};
  if(!win.days){base.state="missing";base.blockers=["Nothing has been logged, so there is no window to assess."];return mpResult(base);}
  var target=mpNum(S.targetProtein);
  if(target==null||target<=0){
    base.state="missing";
    base.blockers=["No daily protein target is stored (Settings › Nutrition). The report will not derive one, because a target derived here would not be the target that was trained against."];
    return mpResult(base);}
  var rows=[],skipped=0,unlogged=0;
  win.dates.forEach(function(d){
    var f=(input.food||{})[d]||null;
    var p=f?mpNum(f.protein):null;
    if(mpSkipped(input,d,"calories")){skipped++;return;}
    if(p==null){unlogged++;return;}
    rows.push({date:d,protein:p,target:target,
      attainment:Math.min(p/target,1),hit:(p>=MPCFG.protein.hitThreshold*target)});});
  var n=rows.length;
  var att=[],hits=0;
  rows.forEach(function(r){att.push(r.attainment);if(r.hit)hits++;});
  var mean=n?(100*mpMean(att)):null;
  var hitRate=n?(100*hits/n):null;
  var cov=100*n/win.days;
  var eligible=(n>=MPCFG.protein.minimumValidDays&&cov>=MPCFG.protein.minimumCoverage*100);
  var blockers=[],exclusions=[];
  if(n<MPCFG.protein.minimumValidDays)
    blockers.push("Only "+n+" valid protein "+mpPlural(n,"day","days")+" — classification needs at least "+MPCFG.protein.minimumValidDays+".");
  if(cov<MPCFG.protein.minimumCoverage*100)
    blockers.push("Log coverage is "+mpPct(cov)+" — classification needs at least "+mpPct(MPCFG.protein.minimumCoverage*100,0)+".");
  if(unlogged)exclusions.push(unlogged+" "+mpPlural(unlogged,"day has","days have")+" no protein logged and "+mpPlural(unlogged,"is","are")+" treated as unknown, never as zero intake.");
  if(skipped)exclusions.push(skipped+" "+mpPlural(skipped,"day was","days were")+" marked skipped; they stay in the window denominator.");
  base.state=(n===0)?"missing":(eligible?"available":"provisional");
  base.value=mean;
  base.valid=n;
  base.label=eligible?mpProteinLabel(mean,hitRate):null;
  base.confidence=eligible?(cov>=90?"high":"moderate"):(n>0?"low":"insufficient");
  /* readable when the bands actually resolve to a label; the two inputs to that
     label disagree when a high mean sits on a low hit rate (a few huge days
     carrying many short ones) or the reverse */
  base.effectClear=(eligible&&base.label!=null);
  base.consistent=(mean!=null&&hitRate!=null)?
    !((mean>=90&&hitRate<50)||(mean<80&&hitRate>=85)):null;
  base.blockers=blockers;base.exclusions=exclusions;
  base.detail={target:target,targetBasis:(S.proteinAuto===false?"entered by hand":"calculated by Compound from the profile"),
    hitRate:hitRate,hits:hits,rows:rows,unlogged:unlogged,skipped:skipped,
    hitThreshold:MPCFG.protein.hitThreshold,eligible:eligible};
  return mpResult(base);}
/* Bands exactly as written in the spec, evaluated top-down; the first band whose
   condition holds wins. The bands overlap by design, so order is the rule. */
function mpProteinLabel(mean,hit){
  if(mean==null||hit==null)return null;
  if(mean>=95&&hit>=85)return "Consistently meeting target";
  if((mean>=90&&mean<95)||(hit>=70&&hit<85))return "Generally meeting target";
  if((mean>=80&&mean<90)||(hit>=50&&hit<70))return "Inconsistent";
  if(mean<80||hit<50)return "Frequently below target";
  return null;}

/* ============================================================
   2. CALORIES
   Days inside tolerance and mean absolute deviation. There is deliberately no
   behavioural label: the spec defines no calorie classification, so inventing
   one here would be the UI deriving a verdict the model never made.
   ============================================================ */
function mpCalories(input,win){
  var S=input.settings||{};
  var base={key:"calories",title:"Calorie-plan adherence",unit:"%",
    formulaId:"calories.withinTolerance.v1",start:win.start,end:win.end,expected:win.days};
  if(!win.days){base.state="missing";base.blockers=["Nothing has been logged, so there is no window to assess."];return mpResult(base);}
  var target=mpNum(S.targetCalories);
  if(target==null||target<=0){
    base.state="missing";
    base.blockers=["No daily calorie target is stored (Settings › Nutrition), so adherence cannot be measured."];
    return mpResult(base);}
  var tol=MPCFG.calories.defaultTolerancePct;
  var rows=[],skipped=0,unlogged=0,within=0,devs=[];
  win.dates.forEach(function(d){
    var f=(input.food||{})[d]||null;
    var c=f?mpNum(f.calories):null;
    if(mpSkipped(input,d,"calories")){skipped++;return;}
    if(c==null){unlogged++;return;}
    var dev=c-target,inside=(Math.abs(dev)<=tol*target);
    if(inside)within++;
    devs.push(Math.abs(dev));
    rows.push({date:d,calories:c,deviation:dev,within:inside,
      auto:(f&&f.calAuto===true)});});
  var n=rows.length,cov=100*n/win.days;
  var eligible=(n>=MPCFG.calories.minimumValidDays&&cov>=MPCFG.calories.minimumCoverage*100);
  var blockers=[],exclusions=[];
  if(n<MPCFG.calories.minimumValidDays)blockers.push("Only "+n+" valid calorie "+mpPlural(n,"day","days")+" in the window.");
  if(cov<MPCFG.calories.minimumCoverage*100)blockers.push("Log coverage is "+mpPct(cov)+", below the "+mpPct(MPCFG.calories.minimumCoverage*100,0)+" this metric needs.");
  blockers.push("Compound stores no minimum-intake threshold, so “days below a minimum intake” is not applicable and is not estimated.");
  if(unlogged)exclusions.push(unlogged+" "+mpPlural(unlogged,"day has","days have")+" no calorie value logged and "+mpPlural(unlogged,"is","are")+" treated as unknown.");
  if(skipped)exclusions.push(skipped+" "+mpPlural(skipped,"day was","days were")+" marked skipped.");
  var autoN=0;rows.forEach(function(r){if(r.auto)autoN++;});
  if(autoN)exclusions.push(autoN+" "+mpPlural(autoN,"day’s calorie total was","days’ calorie totals were")+" computed by the app from logged macros rather than logged directly.");
  base.state=(n===0)?"missing":(eligible?"available":"provisional");
  base.value=n?(100*within/n):null;
  base.valid=n;
  base.label=null;
  base.confidence=eligible?(cov>=90?"high":"moderate"):(n>0?"low":"insufficient");
  base.effectClear=eligible;
  base.blockers=blockers;base.exclusions=exclusions;
  base.detail={target:target,tolerancePct:tol*100,within:within,rows:rows,
    meanAbsDeviation:mpMean(devs),unlogged:unlogged,skipped:skipped,
    belowMinimumState:"not_applicable",eligible:eligible};
  return mpResult(base);}

/* Nutrition coverage for the headline gate: any calorie OR macro value counts,
   which is the app's own definition of a logged food day. */
function mpNutritionCoverage(input,win){
  var base={key:"nutritionCoverage",title:"Nutrition log coverage",unit:"%",
    formulaId:"nutrition.coverage.v1",start:win.start,end:win.end,expected:win.days};
  if(!win.days){base.state="missing";base.blockers=["Nothing has been logged."];return mpResult(base);}
  var valid=0,skipped=0;
  win.dates.forEach(function(d){
    if(mpSkipped(input,d,"calories")){skipped++;return;}
    var f=(input.food||{})[d];if(!f)return;
    if(mpNum(f.calories)!=null||mpNum(f.protein)!=null||mpNum(f.carbs)!=null||mpNum(f.fat)!=null)valid++;});
  var cov=100*valid/win.days;
  base.state=valid?"available":"missing";
  base.value=cov;base.valid=valid;
  base.confidence=(cov>=80)?"high":(valid?"low":"insufficient");
  base.effectClear=(valid>0);
  base.detail={skipped:skipped,threshold:MPCFG.verdict.minNutritionCoverage*100};
  if(cov<MPCFG.verdict.minNutritionCoverage*100)
    base.blockers=["Nutrition coverage is "+mpPct(cov)+"; a headline verdict needs at least "+mpPct(MPCFG.verdict.minNutritionCoverage*100,0)+"."];
  return mpResult(base);}

/* ============================================================
   3. SLEEP  —  reported, never folded into a recovery score (A2/D1)
   ============================================================ */
function mpSleep(input,win){
  var S=input.settings||{};
  var base={key:"sleep",title:"Sleep sufficiency",unit:"%",
    formulaId:"sleep.goalAttainment.v1",start:win.start,end:win.end,expected:win.days};
  if(!win.days){base.state="missing";base.blockers=["Nothing has been logged."];return mpResult(base);}
  var goal=mpNum(S.sleepGoalMin);
  if(goal==null||goal<=0){
    base.state="missing";
    base.blockers=["No sleep goal is set (Settings › Goals), so goal attainment cannot be calculated. No default goal is assumed."];
    return mpResult(base);}
  var rows=[],low=0,skipped=0,unlogged=0;
  win.dates.forEach(function(d){
    if(mpSkipped(input,d,"sleep")){skipped++;return;}
    var m=mpNum((input.sleep||{})[d]);
    if(m==null){unlogged++;return;}
    var att=Math.min(m/goal,1),isLow=(m<MPCFG.sleep.lowNightThreshold*goal);
    if(isLow)low++;
    rows.push({date:d,minutes:m,attainment:att,low:isLow});});
  var n=rows.length,cov=100*n/win.days;
  var eligible=(n>=MPCFG.sleep.minimumValidNights&&cov>=MPCFG.sleep.minimumCoverage*100);
  var blockers=[],exclusions=[];
  if(n<MPCFG.sleep.minimumValidNights)blockers.push("Only "+n+" logged "+mpPlural(n,"night","nights")+" in the window.");
  if(cov<MPCFG.sleep.minimumCoverage*100)blockers.push("Sleep coverage is "+mpPct(cov)+".");
  if(unlogged)exclusions.push(unlogged+" "+mpPlural(unlogged,"night has","nights have")+" no sleep logged.");
  if(skipped)exclusions.push(skipped+" "+mpPlural(skipped,"night was","nights were")+" marked skipped.");
  var atts=[];rows.forEach(function(r){atts.push(r.attainment);});
  base.state=(n===0)?"missing":(eligible?"available":"provisional");
  base.value=n?(100*mpMean(atts)):null;
  base.valid=n;base.label=null;
  base.confidence=eligible?(cov>=90?"high":"moderate"):(n>0?"low":"insufficient");
  base.effectClear=eligible;
  /* nights scattered either side of the threshold are a real reading of
     inconsistency, not of a level — say so rather than average it away */
  base.consistent=n?!(low>0&&low<n):null;
  base.blockers=blockers;base.exclusions=exclusions;
  var mins=[];rows.forEach(function(r){mins.push(r.minutes);});
  base.detail={goalMinutes:goal,meanMinutes:mpMean(mins),lowNights:low,
    lowThresholdPct:MPCFG.sleep.lowNightThreshold*100,rows:rows,eligible:eligible};
  return mpResult(base);}

/* ============================================================
   7. TRAINING COMPLETION
   The denominator is the stored weekly lifting-session goal. With no goal
   stored there is no programme to complete against, so the metric is
   not_applicable — inferring a schedule from what was done would make the
   figure 100% by construction, which is worse than saying nothing.
   ============================================================ */
function mpTrainingCompletion(input,win){
  var S=input.settings||{};
  var base={key:"training",title:"Training completion",unit:"%",
    formulaId:"training.completion.v1",start:win.start,end:win.end};
  var sessions=mpSessionsInWindow(input,win).filter(function(s){
    return (s.entries||[]).some(function(en){
      return (en.sets||[]).some(function(st){
        return st&&st.status!=="skipped"&&st.status!=="warmup"&&mpNum(st.reps)!=null;});});});
  var goal=mpNum(S.liftSessGoal);
  if(goal==null||goal<=0||!win.days){
    base.state="not_applicable";
    base.valid=sessions.length;base.expected=0;
    base.blockers=["No weekly lifting-session goal is configured, so the number of PROGRAMMED sessions is unknown. Completion is not calculated and is not inferred from the sessions that happened."];
    base.detail={completed:sessions.length,weeklyGoal:null,
      sessions:sessions.map(function(s){return {date:s.date,name:s.name||"Workout"};})};
    return mpResult(base);}
  var weeks=win.days/7;
  var expected=Math.round(goal*weeks);
  if(expected<1)expected=1;
  base.state="available";
  base.value=100*sessions.length/expected;
  base.valid=sessions.length;base.expected=expected;
  base.confidence=(win.days>=28)?"high":(win.days>=14?"moderate":"low");
  base.effectClear=true;
  base.detail={completed:sessions.length,programmed:expected,weeklyGoal:goal,
    weeks:weeks,sessions:sessions.map(function(s){return {date:s.date,name:s.name||"Workout"};})};
  return mpResult(base);}

/* ============================================================
   4. STRENGTH
   ------------------------------------------------------------
   MOVEMENT IDENTITY — the honest position.
   The spec wants ten identity fields (grip, ROM, tempo, pause, assistance,
   load convention, top-set protocol …). Compound stores two: the exercise
   record (id, name, muscle, equipment, bodyweight flag) and nothing about how
   a given set was executed. So comparability is keyed on exerciseId, which is
   exactly right for the variants Griffin actually logs — Smith bench and
   free-bar bench are separate exercise records, so they can never be combined
   (E1), and an incline variant is its own record (E2). What CANNOT be seen is
   a change of execution INSIDE one exercise. That is stated as a standing
   caveat on every strength figure rather than papered over.

   LOAD CONVENTION. Bodyweight-flagged exercises are logged by the app as
   total system load (bodyweight + added), everything else as external load.
   Both conventions are consistent WITHIN an exercise, which is the only place
   a comparison is ever made, and each series prints which convention it uses
   so the two are never silently mixed.
   ============================================================ */
var MP_CATEGORIES={
  "horizontal-press":{label:"Horizontal press",region:"upper",global:true},
  "vertical-press":{label:"Vertical press",region:"upper",global:true},
  "horizontal-pull":{label:"Horizontal pull",region:"upper",global:true},
  "vertical-pull":{label:"Vertical pull",region:"upper",global:true},
  "knee-dominant":{label:"Knee-dominant lower body",region:"lower",global:true},
  "hip-dominant":{label:"Hip-dominant lower body",region:"lower",global:true},
  "isolation":{label:"Isolation",region:"other",global:false},
  "other":{label:"Uncategorised",region:"other",global:false}};
/* HEURISTIC, and labelled as one wherever it is used. Compound's own
   guessMovement() only answers compound-vs-isolation, so the movement pattern
   is derived from the muscle group, with the one place that is genuinely
   ambiguous — back — split on a name keyword. A back exercise matching neither
   keyword is left UNCATEGORISED rather than assigned to a pattern by guess. */
function mpCategoryFor(muscle,name){
  var m=String(muscle||"other").toLowerCase(),n=String(name||"").toLowerCase();
  if(m==="chest")return "horizontal-press";
  if(m==="shoulders")return "vertical-press";
  if(m==="back"){
    if(/pulldown|pull-?up|pullup|chin/.test(n))return "vertical-pull";
    if(/row/.test(n))return "horizontal-pull";
    return "other";}
  if(m==="quads")return "knee-dominant";
  if(m==="hamstrings"||m==="glutes")return "hip-dominant";
  if(m==="biceps"||m==="triceps")return "isolation";
  return "other";}

/* E5 HOOK. The spec requires a qualifying set to carry no pain-stop and no
   invalid-technique flag. Compound records NEITHER at set level. The hook is
   implemented and wired into the selector so the exclusion works the moment
   such a flag exists; against real data it always returns null, so acceptance
   test E5 is NOT satisfiable in production. The per-exercise joint-pain rating
   is deliberately not used as a stand-in: it is asked once, after the fact,
   about the whole exercise, and says nothing about which set was terminated. */
function mpSetInvalidated(st){
  if(!st)return null;
  if(st.painStopped===true)return "pain-stopped";
  if(st.invalidTechnique===true)return "invalid technique";
  return null;}
var MP_E5={acceptance:"E5",state:"not_applicable",
  blocker:"Compound does not record a pain-stop or invalid-technique flag on individual sets, so no observation can be excluded on those grounds. The exclusion hook exists and is wired in; it has nothing to read."};

/* Rep-range evidence weight. Affects CONFIDENCE, never the measured change. */
function mpEvidenceWeight(adj){
  if(adj>=3&&adj<=5)return {weight:1.00,index:true,note:"3–5 adjusted reps"};
  if(adj<=8)return {weight:0.90,index:true,note:"6–8 adjusted reps"};
  if(adj<=MPCFG.strength.maxIndexAdjustedReps)return {weight:0.75,index:true,note:"9–10 adjusted reps"};
  if(adj<=MPCFG.strength.maxDisplayAdjustedReps)return {weight:0.50,index:false,note:"11–12 adjusted reps — display only, excluded from the strength index"};
  return {weight:0,index:false,note:"more than 12 adjusted reps — excluded from the strength index"};}

/* One observation per exercise per session: the FIRST set that qualifies, in
   the order it was performed. Never the best e1RM among the back-offs (E3). */
function mpObservations(input,win){
  var obs=[],excluded=[],exMap=input.exercises||{};
  mpSessionsInWindow(input,win).forEach(function(s){
    (s.entries||[]).forEach(function(en){
      if(!en)return;
      var key=en.exerciseId||en.name;if(!key)return;
      var meta=exMap[en.exerciseId]||{};
      var sets=en.sets||[],chosen=null,tried=[];
      for(var i=0;i<sets.length;i++){
        var st=sets[i];if(!st)continue;
        if(st.status==="skipped"||st.status==="warmup")continue;
        var w=mpNum(st.weight),r=mpNum(st.reps),rir=mpNum(st.rir);
        var bad=mpSetInvalidated(st);
        if(bad){tried.push({set:i+1,reason:bad});continue;}
        if(w==null||w<=0){tried.push({set:i+1,reason:"no load recorded"});continue;}
        if(r==null||r<MPCFG.strength.minCompletedReps||r>MPCFG.strength.maxCompletedReps){
          tried.push({set:i+1,reason:"completed reps "+(r==null?"not recorded":mpInt(r))+", outside the "+MPCFG.strength.minCompletedReps+"–"+MPCFG.strength.maxCompletedReps+" qualifying band"});continue;}
        if(rir==null||rir<0||rir>MPCFG.strength.maxRir){
          tried.push({set:i+1,reason:(rir==null?"no RIR recorded":"RIR "+mpInt(rir)+", outside 0–"+MPCFG.strength.maxRir)});continue;}
        chosen={index:i,load:w,reps:r,rir:rir};break;}
      if(!chosen){
        if(tried.length)excluded.push({date:s.date,exercise:en.name||"Exercise",
          exerciseKey:key,reasons:tried,note:"no qualifying top set in this session"});
        return;}
      var adj=chosen.reps+chosen.rir;
      var ev=mpEvidenceWeight(adj);
      var e=mpE1rm(chosen.load,adj);
      var rec={date:s.date,week:mpWeekKey(s.date,input.weekStartDay),
        exerciseKey:key,exerciseName:en.name||"Exercise",muscle:en.muscle||"other",
        category:mpCategoryFor(en.muscle,en.name),
        equipment:(meta.equipment||""),
        loadConvention:(meta.bodyweight?"total system load (bodyweight + added)":"external load"),
        setIndex:chosen.index+1,load:chosen.load,reps:chosen.reps,rir:chosen.rir,
        adjReps:adj,e1rm:e,evidenceWeight:ev.weight,evidenceNote:ev.note,
        indexEligible:(ev.index&&e!=null),sessionName:s.name||"Workout",
        skippedSets:tried};
      obs.push(rec);
      if(!rec.indexEligible)excluded.push({date:s.date,exercise:rec.exerciseName,
        exerciseKey:key,reasons:[{set:rec.setIndex,reason:ev.note}],
        note:"observation kept for display, excluded from the index"});});});
  return {observations:obs,exclusions:excluded};}

/* Detectable comparability BREAKS — real, material events, not the standing
   caveat. Two things are visible in the data and both invalidate a series:
   an exerciseId whose name changed mid-window (the record was edited into a
   different movement), and two different exerciseIds sharing a name (the same
   movement logged against two records, so neither series is complete). */
function mpComparabilityBreaks(obs){
  var byKey={},byName={},breaks=[];
  obs.forEach(function(o){
    if(!byKey[o.exerciseKey])byKey[o.exerciseKey]={};
    byKey[o.exerciseKey][o.exerciseName]=1;
    var nm=String(o.exerciseName).trim().toLowerCase();
    if(!byName[nm])byName[nm]={};
    byName[nm][o.exerciseKey]=1;});
  for(var k in byKey){
    var names=Object.keys(byKey[k]);
    if(names.length>1)breaks.push({type:"renamed",exerciseKey:k,
      detail:"Logged under more than one name inside the window ("+names.join(", ")+"). The exercise record was edited, so observations before and after that edit are not the same movement.",
      names:names});}
  for(var nm2 in byName){
    var keys=Object.keys(byName[nm2]);
    if(keys.length>1)breaks.push({type:"duplicate",name:nm2,
      detail:"The same exercise name is logged against "+keys.length+" different exercise records, so neither series holds all of the work.",
      keys:keys});}
  return breaks;}

/* Per-exercise baseline / current. Baseline and current week sets must be
   DISJOINT: with only three eligible weeks the "first two" and "latest two"
   share a week, and a value cannot be its own baseline and its own current. */
function mpExerciseSeries(obs,windowDays){
  var byKey={};
  obs.forEach(function(o){
    if(!o.indexEligible)return;
    var g=byKey[o.exerciseKey]=byKey[o.exerciseKey]||{key:o.exerciseKey,name:o.exerciseName,
      muscle:o.muscle,category:o.category,equipment:o.equipment,
      loadConvention:o.loadConvention,weeks:{},all:[]};
    g.name=o.exerciseName;
    (g.weeks[o.week]=g.weeks[o.week]||[]).push(o);
    g.all.push(o);});
  var out=[];
  for(var k in byKey){
    var g=byKey[k];
    var weekKeys=Object.keys(g.weeks).sort();
    var weeks=weekKeys.map(function(wk){
      var vals=g.weeks[wk].map(function(o){return o.e1rm;});
      return {week:wk,value:mpMedian(vals),n:g.weeks[wk].length,observations:g.weeks[wk]};});
    var blockers=[],eligible=true;
    var baseWeeks=weeks.slice(0,2),curWeeks=weeks.slice(-2);
    var baseObs=0,curObs=0;
    baseWeeks.forEach(function(w){baseObs+=w.n;});
    curWeeks.forEach(function(w){curObs+=w.n;});
    var spanWeeks=weeks.length?Math.round(mpDayDiff(weeks[0].week,weeks[weeks.length-1].week)/7):0;
    if(weeks.length<MPCFG.strength.minEligibleWeeks){
      eligible=false;
      blockers.push("Only "+weeks.length+" training "+mpPlural(weeks.length,"week","weeks")+" carry a qualifying top set; baseline and current need "+MPCFG.strength.minEligibleWeeks+" separate weeks so the two windows do not overlap.");}
    if(baseObs<MPCFG.strength.minBaselineObs){eligible=false;
      blockers.push("Only "+baseObs+" qualifying baseline "+mpPlural(baseObs,"observation","observations")+"; at least "+MPCFG.strength.minBaselineObs+" are required.");}
    if(curObs<MPCFG.strength.minCurrentObs){eligible=false;
      blockers.push("Only "+curObs+" qualifying current "+mpPlural(curObs,"observation","observations")+"; at least "+MPCFG.strength.minCurrentObs+" are required.");}
    if(spanWeeks<MPCFG.strength.minSpanWeeks){eligible=false;
      blockers.push("First and latest observations are "+spanWeeks+" calendar "+mpPlural(spanWeeks,"week","weeks")+" apart; at least "+MPCFG.strength.minSpanWeeks+" are required.");}
    var baseVal=eligible?mpMedian(baseWeeks.map(function(w){return w.value;})):null;
    var curVal=eligible?mpMedian(curWeeks.map(function(w){return w.value;})):null;
    var change=(eligible&&baseVal!=null&&curVal!=null&&baseVal>0)?(100*(curVal/baseVal-1)):null;
    var ws=[];g.all.forEach(function(o){ws.push(o.evidenceWeight);});
    var meanW=mpMean(ws);
    var conf="insufficient";
    if(eligible){
      if(meanW!=null&&meanW>=0.95&&g.all.length>=4)conf="high";
      else if(meanW!=null&&meanW>=0.85)conf="moderate";
      else conf="low";}
    var status=mpTerm("strength.none",windowDays);
    if(eligible&&change!=null){
      if(change>MPCFG.strength.stableBandPct)status=mpTerm("strength.up",windowDays);
      else if(change<-MPCFG.strength.stableBandPct)status=mpTerm("strength.down",windowDays);
      else status=mpTerm("strength.flat",windowDays);}
    out.push({key:g.key,name:g.name,muscle:g.muscle,category:g.category,
      categoryLabel:(MP_CATEGORIES[g.category]||MP_CATEGORIES.other).label,
      equipment:g.equipment,loadConvention:g.loadConvention,
      weeks:weeks,baselineWeeks:baseWeeks,currentWeeks:curWeeks,
      baselineValue:baseVal,currentValue:curVal,changePct:change,
      observationCount:g.all.length,baselineObs:baseObs,currentObs:curObs,
      spanWeeks:spanWeeks,eligible:eligible,blockers:blockers,
      confidence:conf,meanEvidenceWeight:meanW,status:status,
      observations:g.all.slice()});}
  out.sort(function(a,b){
    if(a.eligible!==b.eligible)return a.eligible?-1:1;
    return (a.name<b.name)?-1:((a.name>b.name)?1:0);});
  return out;}

function mpStrength(input,win,series,breaks){
  var base={key:"strength",title:"Comparable strength trend",unit:"%",
    formulaId:"strength.globalChange.v1",start:win.start,end:win.end};
  var eligibleEx=series.filter(function(x){return x.eligible&&x.changePct!=null;});
  base.expected=series.length;base.valid=eligibleEx.length;
  var cats={};
  eligibleEx.forEach(function(x){(cats[x.category]=cats[x.category]||[]).push(x);});
  var catRows=[];
  for(var c in cats){
    var meta=MP_CATEGORIES[c]||MP_CATEGORIES.other;
    catRows.push({category:c,label:meta.label,region:meta.region,global:meta.global,
      change:mpMedian(cats[c].map(function(x){return x.changePct;})),
      exercises:cats[c].map(function(x){return x.name;})});}
  catRows.sort(function(a,b){return (a.label<b.label)?-1:1;});
  var globalCats=catRows.filter(function(r){return r.global&&r.change!=null;});
  var hasUpper=globalCats.some(function(r){return r.region==="upper";});
  var hasLower=globalCats.some(function(r){return r.region==="lower";});
  var blockers=[],exclusions=[];
  if(globalCats.length<MPCFG.strength.minimumCategories)
    blockers.push("Only "+globalCats.length+" movement "+mpPlural(globalCats.length,"category","categories")+" has an eligible result; the global figure needs "+MPCFG.strength.minimumCategories+".");
  if(!hasUpper)blockers.push("No upper-body movement category is eligible.");
  if(!hasLower)blockers.push("No lower-body movement category is eligible.");
  breaks.forEach(function(b){blockers.push("Movement comparability break: "+b.detail);});
  var isoCats=catRows.filter(function(r){return !r.global;});
  isoCats.forEach(function(r){
    exclusions.push(r.label+" is excluded from the global index ("+r.exercises.join(", ")+"): isolation and uncategorised work is not a movement pattern the index is defined over.");});
  series.filter(function(x){return !x.eligible;}).forEach(function(x){
    exclusions.push(x.name+" is not eligible — "+x.blockers.join(" "));});
  var ok=(globalCats.length>=MPCFG.strength.minimumCategories&&hasUpper&&hasLower&&!breaks.length);
  var change=ok?mpMedian(globalCats.map(function(r){return r.change;})):null;
  base.state=ok?"available":(eligibleEx.length?"provisional":(series.length?"provisional":"missing"));
  if(!series.length)blockers.push("No exercise has a qualifying top set inside the window.");
  base.value=change;
  base.blockers=blockers;base.exclusions=exclusions;
  var confs=eligibleEx.map(function(x){return x.confidence;});
  var conf="insufficient";
  if(ok){
    if(confs.indexOf("low")<0&&win.days>=42)conf="high";
    else if(confs.indexOf("low")<0)conf="moderate";
    else conf="low";}
  base.confidence=conf;
  var status=mpTerm("strength.none",win.days);
  if(ok&&change!=null){
    if(change>MPCFG.strength.stableBandPct)status=mpTerm("strength.up",win.days);
    else if(change<-MPCFG.strength.stableBandPct)status=mpTerm("strength.down",win.days);
    else status=mpTerm("strength.flat",win.days);}
  base.label=status;
  /* Interpretation, kept separate from measurement quality on purpose. A global
     change sitting inside the ±2.5% stable band is a perfectly good measurement
     whose DIRECTION cannot be read — the honest split is high data confidence,
     low interpretation confidence, and that is exactly what this produces. */
  base.comparable=!breaks.length;
  base.effectClear=(ok&&change!=null)?(Math.abs(change)>MPCFG.strength.stableBandPct):false;
  if(ok&&change!=null&&Math.abs(change)<=MPCFG.strength.stableBandPct)
    base.interpNotes=["The global change of "+mpSignedPct(change)+" sits inside the ±"+
      mpFmt(MPCFG.strength.stableBandPct,1)+"% stable band. The reading is that measured strength held, not that it moved in either direction."];
  if(ok){
    var signs={};
    globalCats.forEach(function(r){
      signs[(r.change>MPCFG.strength.stableBandPct)?"up":((r.change<-MPCFG.strength.stableBandPct)?"down":"flat")]=1;});
    base.consistent=!(signs.up&&signs.down);}
  var declining=globalCats.filter(function(r){return r.change<-MPCFG.strength.stableBandPct;});
  base.detail={categories:catRows,globalCategories:globalCats,hasUpper:hasUpper,
    hasLower:hasLower,eligible:ok,eligibleExercises:eligibleEx.length,
    decliningCategories:declining,breaks:breaks,
    comparabilityCaveat:"Comparability is keyed on the exercise record. Compound does not store grip, range of motion, tempo, pause, assistance or top-set protocol, so a change in HOW an exercise was performed is invisible to this report and would not start a new comparison series."};
  return mpResult(base);}

/* Relative strength — secondary evidence, and only when BOTH inputs are
   eligible. Each exercise is divided by the mean bodyweight of the very weeks
   its baseline and current values came from, never by a global average. */
function mpRelativeStrength(input,win,series,strengthRes,bwRes){
  var base={key:"relative",title:"Relative strength trend",unit:"%",
    formulaId:"strength.relative.v1",start:win.start,end:win.end};
  var blockers=[];
  if(strengthRes.state!=="available")blockers.push("Comparable strength is not established, so relative strength is not calculated.");
  if(bwRes.state!=="available")blockers.push("Bodyweight trend is not established, so relative strength is not calculated.");
  if(blockers.length){base.state="not_applicable";base.blockers=blockers;
    base.detail={secondary:true};return mpResult(base);}
  var byDate={};
  (input.weights||[]).forEach(function(w){
    if(!w||!mpIsISO(w.date))return;var v=mpNum(w.weight);if(v!=null)byDate[w.date]=v;});
  function bwForWeeks(weeks){
    var vals=[];
    weeks.forEach(function(wk){
      for(var i=0;i<7;i++){var d=mpAddDays(wk.week,i);
        if(byDate[d]!=null)vals.push(byDate[d]);}});
    return mpMean(vals);}
  var rows=[];
  series.filter(function(x){return x.eligible;}).forEach(function(x){
    var b=bwForWeeks(x.baselineWeeks),c=bwForWeeks(x.currentWeeks);
    if(b==null||c==null||b<=0||c<=0||x.baselineValue==null||x.currentValue==null)return;
    var rb=x.baselineValue/b,rc=x.currentValue/c;
    rows.push({name:x.name,category:x.category,
      categoryLabel:x.categoryLabel,global:(MP_CATEGORIES[x.category]||MP_CATEGORIES.other).global,
      baselineBw:b,currentBw:c,baseline:rb,current:rc,
      changePct:(rb>0?(100*(rc/rb-1)):null)});});
  var cats={};
  rows.forEach(function(r){if(r.global&&r.changePct!=null)(cats[r.category]=cats[r.category]||[]).push(r.changePct);});
  var catChanges=[];for(var c2 in cats)catChanges.push(mpMedian(cats[c2]));
  var change=catChanges.length?mpMedian(catChanges):null;
  base.state=(change!=null)?"available":"provisional";
  base.value=change;base.valid=rows.length;base.expected=series.length;
  base.confidence=strengthRes.confidence;
  base.comparable=(strengthRes.detail.breaks||[]).length===0;
  base.effectClear=(change!=null)?(Math.abs(change)>MPCFG.strength.stableBandPct):false;
  base.label=null;
  base.detail={rows:rows,secondary:true,
    note:"Relative strength is secondary evidence. It says strength per unit of bodyweight held or moved; it does not measure lean mass and cannot prove muscle was kept."};
  if(!rows.length)base.blockers=["No eligible exercise has a bodyweight average in both its baseline and its current weeks."];
  return mpResult(base);}

/* ============================================================
   6. BODYWEIGHT — gated hard by window length
   ============================================================ */
function mpSlope(points){
  var n=points.length;if(n<2)return null;
  var sx=0,sy=0,i;
  for(i=0;i<n;i++){sx+=points[i].x;sy+=points[i].y;}
  var mx=sx/n,my=sy/n,sn=0,sd=0;
  for(i=0;i<n;i++){sn+=(points[i].x-mx)*(points[i].y-my);sd+=(points[i].x-mx)*(points[i].x-mx);}
  if(sd===0)return null;
  var slope=sn/sd,ssRes=0,ssTot=0;
  for(i=0;i<n;i++){var pred=my+slope*(points[i].x-mx);
    ssRes+=(points[i].y-pred)*(points[i].y-pred);
    ssTot+=(points[i].y-my)*(points[i].y-my);}
  if(!isFinite(slope))return null;
  return {slope:slope,intercept:my-slope*mx,n:n,
    r2:(ssTot>0?(1-ssRes/ssTot):null)};}

function mpBodyweight(input,win){
  var base={key:"bodyweight",title:"Bodyweight trend",
    unit:(input.units||"lbs")+"/week",formulaId:"bodyweight.rawOnly.v1",
    start:win.start,end:win.end,expected:win.days};
  if(!win.days){base.state="missing";base.blockers=["Nothing has been logged."];return mpResult(base);}
  var byDate={},rows=[];
  (input.weights||[]).forEach(function(w){
    if(!w||!mpIsISO(w.date)||w.date<win.start||w.date>win.end)return;
    var v=mpNum(w.weight);if(v==null)return;
    byDate[w.date]=v;});
  win.dates.forEach(function(d){if(byDate[d]!=null)rows.push({date:d,weight:byDate[d]});});
  var n=rows.length,cov=100*n/win.days;
  var vals=rows.map(function(r){return r.weight;});
  base.valid=n;
  base.detail={weighIns:n,rows:rows,mean:mpMean(vals),
    first:(n?rows[0].weight:null),last:(n?rows[n-1].weight:null),
    coveragePct:cov,windowDays:win.days,rolling:[],weeklyRate:null,
    projection:null,r2:null,tier:null};
  var blockers=[];
  if(n<MPCFG.bodyweight.minimumWeighIns){
    base.state=(n?"provisional":"missing");
    base.detail.tier="fewer-than-7";
    blockers.push("Only "+n+" "+mpPlural(n,"weigh-in","weigh-ins")+" in the window; no trend is calculated below "+MPCFG.bodyweight.minimumWeighIns+".");
    base.blockers=blockers;base.label=mpTerm("bw.none",win.days);
    return mpResult(base);}
  /* 7–13 days: raw values and their mean. No weekly rate at any cost. */
  if(win.days<14){
    base.state="provisional";base.detail.tier="7-13";
    base.confidence="low";base.label=mpTerm("bw.none",win.days);
    blockers.push("The window is "+win.days+" days. Raw weigh-ins and their mean only — a weekly rate needs at least "+MPCFG.bodyweight.minimumTrendDays+" days.");
    base.blockers=blockers;return mpResult(base);}
  /* rolling means are shown from 14 days as a PATTERN, nothing more */
  var rolling=[];
  win.dates.forEach(function(d,i){
    if(i<6)return;
    var got=[];
    for(var k=0;k<7;k++){var v=byDate[win.dates[i-k]];if(v!=null)got.push(v);}
    if(got.length>=MPCFG.bodyweight.minRollingPoints)
      rolling.push({date:d,value:mpMean(got),n:got.length});});
  base.detail.rolling=rolling;
  if(win.days<MPCFG.bodyweight.minimumTrendDays){
    base.state="provisional";base.detail.tier="14-20";
    base.formulaId="bodyweight.provisionalPattern.v1";
    base.confidence="low";base.label=mpTerm("bw.none",win.days);
    blockers.push("The window is "+win.days+" days. A provisional smoothed pattern only — no weekly rate and no goal-date projection below "+MPCFG.bodyweight.minimumTrendDays+" days.");
    base.blockers=blockers;return mpResult(base);}
  /* 21–27 days: endpoint blocks, each needing 5 valid weights */
  if(win.days<MPCFG.bodyweight.minimumVerdictDays){
    base.formulaId="bodyweight.endpointBlocks.v1";base.detail.tier="21-27";
    var firstBlock=[],lastBlock=[];
    for(var i=0;i<7;i++){
      var fd=win.dates[i],ld=win.dates[win.dates.length-7+i];
      if(byDate[fd]!=null)firstBlock.push(byDate[fd]);
      if(byDate[ld]!=null)lastBlock.push(byDate[ld]);}
    base.detail.firstBlock=firstBlock.length;base.detail.lastBlock=lastBlock.length;
    var need=MPCFG.bodyweight.minimumEndpointWeekWeights;
    if(firstBlock.length<need||lastBlock.length<need){
      base.state="provisional";base.confidence="insufficient";
      base.label=mpTerm("bw.none",win.days);
      blockers.push("Endpoint weeks hold "+firstBlock.length+" and "+lastBlock.length+" valid weights; each needs at least "+need+" before a change can be read off them.");
      base.blockers=blockers;return mpResult(base);}
    var change=mpMean(lastBlock)-mpMean(firstBlock);
    var elapsed=win.days-7; /* the two block centres are windowDays−7 days apart */
    var rate=elapsed>0?(change/elapsed*7):null;
    base.state="available";base.value=rate;base.confidence="moderate";
    base.detail.weeklyRate=rate;base.detail.change=change;base.detail.elapsedDays=elapsed;
    /* signal against noise: the move between the two block means, versus the
       day-to-day spread inside those same blocks */
    var noise=mpMean([mpSd(firstBlock),mpSd(lastBlock)]);
    base.detail.endpointNoise=noise;
    base.effectClear=(noise!=null)?(Math.abs(change)>=noise):null;
    base.label=mpBwLabel(rate,win.days);
    base.blockers=["Emerging trend, moderate confidence. No goal-date projection below "+MPCFG.bodyweight.minimumVerdictDays+" days."];
    return mpResult(base);}
  /* 28+ days: least-squares slope over the rolling means */
  base.formulaId="bodyweight.rollingSlope.v1";base.detail.tier="28+";
  var pts=rolling.map(function(r){return {x:mpDayDiff(win.start,r.date),y:r.value};});
  var fit=mpSlope(pts);
  if(!fit){
    base.state="provisional";base.confidence="insufficient";
    base.label=mpTerm("bw.none",win.days);
    base.blockers=["Not enough distinct rolling means to fit a slope."];
    return mpResult(base);}
  var weekly=fit.slope*7;
  base.value=weekly;base.detail.weeklyRate=weekly;base.detail.r2=fit.r2;
  base.detail.rollingPoints=fit.n;
  base.state=(cov>=MPCFG.bodyweight.minimumCoverage*100)?"available":"provisional";
  base.confidence=(cov>=90&&win.days>=42)?"high":(cov>=MPCFG.bodyweight.minimumCoverage*100?"moderate":"low");
  /* R² is already this report's stated noise test for a bodyweight slope — the
     projection gate uses the same number — so interpretation reuses it rather
     than inventing a second one. */
  base.effectClear=(fit.r2!=null)?(fit.r2>=MPCFG.bodyweight.projectionMinR2):null;
  base.label=mpBwLabel(weekly,win.days);
  if(cov<MPCFG.bodyweight.minimumCoverage*100)
    blockers.push("Weigh-in coverage is "+mpPct(cov)+", below the "+mpPct(MPCFG.bodyweight.minimumCoverage*100,0)+" an established trend needs.");
  base.blockers=blockers;
  return mpResult(base);}
function mpBwLabel(rate,days){
  if(rate==null)return mpTerm("bw.none",days);
  if(rate<-0.05)return mpTerm("bw.down",days);
  if(rate>0.05)return mpTerm("bw.up",days);
  return mpTerm("bw.flat",days);}

/* Projection. Suppressed for 14 days after a GLP-1 start or dose change (I1),
   and refused outright without 28 days, 80% coverage, a rate in the goal
   direction and a fit that actually explains the scatter. */
function mpProjection(input,win,bwRes,glpCtx){
  var S=input.settings||{};
  var base={key:"projection",title:"Goal-date projection",unit:"weeks",
    formulaId:"bodyweight.projection.v1",start:win.start,end:win.end};
  var blockers=[];
  var goal=mpNum(S.goalWeight);
  if(win.days<MPCFG.bodyweight.minimumVerdictDays)blockers.push("The window is "+win.days+" days; a projection needs at least "+MPCFG.bodyweight.minimumVerdictDays+".");
  if(bwRes.state!=="available")blockers.push("The bodyweight trend is not established.");
  var cov=bwRes.coverage.percentage;
  if(cov==null||cov<MPCFG.bodyweight.minimumCoverage*100)blockers.push("Weigh-in coverage is below "+mpPct(MPCFG.bodyweight.minimumCoverage*100,0)+".");
  var r2=bwRes.detail.r2;
  if(r2==null||r2<MPCFG.bodyweight.projectionMinR2)blockers.push("The trend line explains too little of the day-to-day scatter (R² "+(r2==null?"—":mpFmt(r2,2))+", needs "+mpFmt(MPCFG.bodyweight.projectionMinR2,2)+") to be called a stable rate.");
  if(goal==null)blockers.push("No goal weight is set.");
  if(glpCtx.suppressProjection)blockers.push(glpCtx.suppressReason);
  var rate=bwRes.detail.weeklyRate,cur=bwRes.detail.last;
  if(blockers.length||rate==null||cur==null||goal==null){
    base.state=blockers.length?"missing":"provisional";
    base.blockers=blockers.length?blockers:["Insufficient inputs."];
    base.detail={suppressed:!!glpCtx.suppressProjection};
    return mpResult(base);}
  /* (goal − current) / rate, so the sign works out in both directions: losing
     toward a lower goal and gaining toward a higher one both give positive
     weeks, and a rate pointing away from the goal gives a negative number that
     is refused rather than printed. */
  var weeks=(rate===0)?null:((goal-cur)/rate);
  if(weeks==null||!isFinite(weeks)||weeks<=0){
    base.state="missing";
    base.blockers=["The measured rate is not moving toward the goal, so no arrival date is projected."];
    base.detail={weeklyRate:rate,current:cur,goal:goal};
    return mpResult(base);}
  base.state="available";base.value=weeks;base.confidence=bwRes.confidence;
  base.effectClear=(r2!=null)?(r2>=MPCFG.bodyweight.projectionMinR2):null;
  base.detail={weeklyRate:rate,current:cur,goal:goal,r2:r2,
    caveat:"A projection is an estimate built on the rate measured so far. Rates change — with GLP-1 dose changes especially — so treat the date as a checkpoint, not a promise."};
  return mpResult(base);}

/* ============================================================
   3b. SESSION RPE — a limitation flag only when all three legs hold
   ============================================================ */
function mpSessionRpe(input,win,strengthRes){
  var base={key:"rpe",title:"Session RPE trend",unit:"points",
    formulaId:"rpe.windowDelta.v1",start:win.start,end:win.end};
  var sessions=mpSessionsInWindow(input,win).filter(function(s){return mpNum(s.rpe)!=null;});
  base.expected=mpSessionsInWindow(input,win).length;
  base.valid=sessions.length;
  if(!sessions.length){base.state="missing";
    base.blockers=["No session RPE was recorded in the window."];return mpResult(base);}
  var mid=mpAddDays(win.start,Math.floor(win.days/2));
  var prior=[],cur=[];
  sessions.forEach(function(s){
    (s.date<mid?prior:cur).push({date:s.date,rpe:mpNum(s.rpe),name:s.name||"Workout"});});
  var pAvg=mpMean(prior.map(function(x){return x.rpe;}));
  var cAvg=mpMean(cur.map(function(x){return x.rpe;}));
  var diff=(pAvg!=null&&cAvg!=null)?(cAvg-pAvg):null;
  var blockers=[];
  if(prior.length<MPCFG.rpe.minSessions||cur.length<MPCFG.rpe.minSessions)
    blockers.push("The two halves of the window hold "+prior.length+" and "+cur.length+" rated sessions; the comparison needs at least "+MPCFG.rpe.minSessions+" in each.");
  var perfFlatOrDown=null;
  if(strengthRes.state==="available"&&strengthRes.value!=null)perfFlatOrDown=(strengthRes.value<=0);
  else blockers.push("Comparable strength is not established, so the limitation rule cannot be applied — a rise in RPE on its own is not a flag.");
  var flag=(diff!=null&&diff>=MPCFG.rpe.riseThreshold&&perfFlatOrDown===true&&
    cur.length>=MPCFG.rpe.minSessions&&prior.length>=MPCFG.rpe.minSessions);
  base.state=(diff!=null&&!blockers.length)?"available":"provisional";
  base.value=diff;
  base.confidence=(!blockers.length)?"moderate":"low";
  base.effectClear=(diff!=null)?(Math.abs(diff)>=MPCFG.rpe.riseThreshold):false;
  base.blockers=blockers;
  base.detail={priorAvg:pAvg,currentAvg:cAvg,prior:prior,current:cur,
    midpoint:mid,flag:flag,riseThreshold:MPCFG.rpe.riseThreshold,
    performanceFlatOrDeclining:perfFlatOrDown};
  base.label=flag?"Possible limitation — effort rose while measured strength did not":null;
  return mpResult(base);}

/* ============================================================
   3c. SORENESS — never averaged, never scored
   Compound asks "how sore did you get AFTER training this muscle LAST time?",
   so each answer is a retrospective check-in on the previous exposure. The
   persistence rule counts consecutive check-ins for the same muscle.
   ============================================================ */
function mpSoreness(input,win){
  var base={key:"soreness",title:"Persistent soreness",unit:"alerts",
    formulaId:"soreness.persistence.v1",start:win.start,end:win.end};
  var seq={},any=0;
  mpSessionsInWindow(input,win).forEach(function(s){
    var mf=s.mfb||{};
    for(var mus in mf){
      var v=mf[mus]&&mf[mus].sore;if(!v)continue;
      any++;
      (seq[mus]=seq[mus]||[]).push({date:s.date,value:v,
        high:(v===MPCFG.soreness.highValue)});}});
  base.expected=mpSessionsInWindow(input,win).length;
  base.valid=any;
  if(!any){base.state="missing";
    base.blockers=["No soreness check-in was recorded in the window."];
    base.detail={sequences:{},alerts:[]};return mpResult(base);}
  var alerts=[];
  for(var m in seq){
    var run=0,runDates=[];
    seq[m].forEach(function(e){
      if(e.high){run++;runDates.push(e.date);}
      else{run=0;runDates=[];}
      if(run===MPCFG.soreness.consecutiveForPersistent)
        alerts.push({muscle:m,dates:runDates.slice(),count:run});});}
  base.state="available";base.value=alerts.length;
  base.confidence="moderate";
  /* a count of rule hits on raw ratings — there is no effect size to be lost in
     noise, so the count is readable as soon as the window is long enough */
  base.effectClear=true;
  base.detail={sequences:seq,alerts:alerts,
    highValue:MPCFG.soreness.highValue,
    rule:"Persistent = "+MPCFG.soreness.consecutiveForPersistent+" consecutive check-ins at the highest soreness grade for the same muscle. A single high reading is not an alert."};
  base.label=alerts.length?(alerts.length+" persistent "+mpPlural(alerts.length,"pattern","patterns")):null;
  return mpResult(base);}

/* ============================================================
   3d. JOINT PAIN — a safety flag, never averaged away
   Compound records pain per EXERCISE, not per joint, so "the same joint on
   two consecutive exposures" is read as the same exercise. Stated as a
   heuristic wherever it is shown.
   ============================================================ */
var MP_JOINT_RANK={none:0,low:1,mod:2,alot:3};
var MP_JOINT_LABEL={none:"None",low:"Low pain",mod:"Moderate pain",alot:"A lot of pain"};
function mpJointPain(input,win){
  var base={key:"joint",title:"Joint-pain alerts",unit:"alerts",
    formulaId:"joint.persistence.v1",start:win.start,end:win.end};
  var seq={},names={},any=0;
  mpSessionsInWindow(input,win).forEach(function(s){
    (s.entries||[]).forEach(function(en){
      if(!en)return;
      var v=en.fb&&en.fb.joint;if(!v)return;
      var k=en.exerciseId||en.name;if(!k)return;
      any++;names[k]=en.name||"Exercise";
      (seq[k]=seq[k]||[]).push({date:s.date,value:v,
        rank:(MP_JOINT_RANK[v]==null?0:MP_JOINT_RANK[v])});});});
  base.valid=any;base.expected=any;
  if(!any){base.state="missing";
    base.blockers=["No joint-pain rating was recorded in the window."];
    base.detail={sequences:{},alerts:[],current:[]};return mpResult(base);}
  var current=[],persistent=[],rising=[];
  for(var k in seq){
    var list=seq[k];
    list.forEach(function(e,i){
      if(e.rank>=MPCFG.joint.alertRank)current.push({exercise:names[k],date:e.date,
        value:e.value,label:MP_JOINT_LABEL[e.value]||e.value});
      if(i>0){
        var p=list[i-1];
        if(p.rank>=MPCFG.joint.alertRank&&e.rank>=MPCFG.joint.alertRank)
          persistent.push({exercise:names[k],dates:[p.date,e.date],
            labels:[MP_JOINT_LABEL[p.value],MP_JOINT_LABEL[e.value]]});
        if(e.rank>p.rank&&e.rank>=MPCFG.joint.alertRank)
          rising.push({exercise:names[k],from:MP_JOINT_LABEL[p.value],
            to:MP_JOINT_LABEL[e.value],date:e.date});}});}
  base.state="available";
  base.value=current.length;
  base.confidence="high";
  base.effectClear=true;
  base.blockers=["Compound records joint pain per exercise, not per joint, and does not record whether a set was terminated. “The same joint on two consecutive exposures” is therefore read as the same EXERCISE, and the urgent-review rule uses rising severity alone."];
  base.detail={sequences:seq,names:names,current:current,persistent:persistent,
    rising:rising,alertRank:MPCFG.joint.alertRank};
  base.label=current.length?(current.length+" "+mpPlural(current.length,"rating","ratings")+" at Moderate or above"):null;
  return mpResult(base);}

/* ============================================================
   GLP-1 CONTEXT — listed, never scored (I2)
   ============================================================ */
function mpGlp(input,win){
  var g=input.glp||{};
  var base={key:"glp",title:"GLP-1 symptom context",unit:"",
    formulaId:"glp1.symptomContext.v1",start:win.start,end:win.end};
  var types={};
  (g.symptomTypes||[]).forEach(function(t){if(t&&t.id)types[t.id]=t.label||"Symptom";});
  var doses=(g.doses||[]).filter(function(d){return d&&d.takenAt!=null;})
    .map(function(d){return {date:mpToISO(new Date(d.takenAt)),dose:mpNum(d.dose),
      unit:d.unit||"",skipped:!!d.skipped};})
    .sort(function(a,b){return a.date<b.date?-1:1;});
  var taken=doses.filter(function(d){return !d.skipped;});
  /* last change = the first dose ever (initiation) or the latest dose whose
     amount differs from the one before it */
  var lastChange=null,lastChangeKind=null;
  if(taken.length){lastChange=taken[0].date;lastChangeKind="initiation";
    for(var i=1;i<taken.length;i++){
      if(taken[i].dose!=null&&taken[i-1].dose!=null&&taken[i].dose!==taken[i-1].dose){
        lastChange=taken[i].date;lastChangeKind="dose change";}}}
  var suppress=false,suppressReason="";
  if(lastChange!=null&&win.end){
    var since=mpDayDiff(lastChange,win.end);
    if(since<MPCFG.glp1.projectionSuppressionDaysAfterDoseChange){
      suppress=true;
      suppressReason="A GLP-1 "+lastChangeKind+" was logged on "+mpDateLabel(lastChange)+", "+since+" "+mpPlural(since,"day","days")+" ago. Projections are suppressed for "+MPCFG.glp1.projectionSuppressionDaysAfterDoseChange+" days after a start or dose change while intake and weight settle.";}}
  var syms=(g.symptoms||[]).filter(function(s){
    if(!s||s.occurredAt==null)return false;
    var d=mpToISO(new Date(s.occurredAt));
    return win.start&&d>=win.start&&d<=win.end;})
    .map(function(s){
      var d=mpToISO(new Date(s.occurredAt));
      var prev=null;
      taken.forEach(function(t){if(t.date<=d&&(prev==null||t.date>prev))prev=t.date;});
      return {date:d,type:(types[s.symptomTypeId]||"Symptom"),
        severity:mpNum(s.severity),note:(s.note||""),
        daysSinceDose:(prev!=null?mpDayDiff(prev,d):null),doseDate:prev};})
    .sort(function(a,b){return a.date<b.date?-1:1;});
  base.valid=syms.length;base.expected=syms.length;
  base.state=(g.enabled===false&&!syms.length&&!taken.length)?"not_applicable":(syms.length?"available":"missing");
  base.value=null;base.label=null;
  base.confidence=syms.length?"moderate":"insufficient";
  /* a list, not a measurement: nothing here is a trend that noise could swallow */
  base.effectClear=(syms.length>0);
  if(!syms.length)base.blockers=["No GLP-1 symptom was logged inside the window."];
  base.blockers=(base.blockers||[]).concat(["Compound does not record whether a symptom affected food intake, hydration or training, so that impact is not applicable and is never assumed. Severity alone is reported."]);
  base.detail={symptoms:syms,doses:doses,taken:taken,lastChange:lastChange,
    lastChangeKind:lastChangeKind,suppressProjection:suppress,suppressReason:suppressReason,
    compound:(g.compound||null),materialSeverity:MPCFG.glp1.materialSeverity,
    impactState:"not_applicable"};
  return mpResult(base);}

/* ============================================================
   HEADLINE ELIGIBILITY AND VERDICT
   Every requirement is a hard gate. One missing required component and the
   verdict is withheld with the blocker named (A3).
   ============================================================ */
function mpVerdict(m,win){
  var blockers=[];
  if(win.days<MPCFG.verdict.minDays)
    blockers.push("The assessment window is "+win.days+" "+mpPlural(win.days,"day","days")+"; a headline verdict needs at least "+MPCFG.verdict.minDays+".");
  var weighIns=m.bodyweight.detail.weighIns||0;
  if(weighIns<MPCFG.verdict.minWeighIns)
    blockers.push("Only "+weighIns+" valid "+mpPlural(weighIns,"weigh-in","weigh-ins")+"; a verdict needs at least "+MPCFG.verdict.minWeighIns+".");
  if(m.bodyweight.state!=="available")
    blockers.push("The bodyweight trend is not established.");
  if(m.strength.state!=="available")
    blockers.push("Comparable strength is not established: "+(m.strength.blockers[0]||"insufficient observations")+"");
  var nc=m.nutrition.value;
  if(nc==null||nc<MPCFG.verdict.minNutritionCoverage*100)
    blockers.push("Nutrition coverage is "+mpPct(nc)+"; a verdict needs at least "+mpPct(MPCFG.verdict.minNutritionCoverage*100,0)+".");
  if(m.protein.state!=="available")
    blockers.push("Protein adherence is not established, so the nutrition leg of the verdict cannot be read.");
  if(m.training.state==="not_applicable")
    blockers.push("Programmed-session data is insufficient to calculate training completion.");
  if(m.strength.detail.breaks&&m.strength.detail.breaks.length)
    blockers.push("An unresolved movement-comparability break is present.");
  var eligible=!blockers.length;
  var res={eligible:eligible,blockers:blockers,key:null,label:mpTerm("verdict.none",win.days),
    rationale:[],rate:mpTerm("rate.none",win.days)};
  if(!eligible)return res;
  var bwRate=m.bodyweight.detail.weeklyRate;
  var gs=m.strength.value;
  var proteinOk=(m.protein.label==="Consistently meeting target"||m.protein.label==="Generally meeting target");
  var persistentJoint=(m.joint.detail.persistent||[]).length>0;
  var persistentSore=(m.soreness.detail.alerts||[]).length>0;
  var materialSymptom=(m.glp.detail.symptoms||[]).some(function(s){
    return s.severity!=null&&s.severity>=MPCFG.glp1.materialSeverity;});
  var declining=(m.strength.detail.decliningCategories||[]).length;
  var disrupted=(m.training.state==="available"&&m.training.value!=null&&
      m.training.value<MPCFG.verdict.disruptedCompletionPct)||
    (m.protein.label==="Frequently below target");
  var concerning=(declining>=2)||disrupted||persistentJoint||
    (persistentSore&&materialSymptom);
  var favorable=(bwRate!=null&&bwRate<0)&&(gs!=null&&gs>=-MPCFG.strength.stableBandPct)&&
    proteinOk&&!persistentJoint&&!materialSymptom&&!persistentSore;
  if(concerning){res.key="concerning";res.label=mpTerm("verdict.concerning",win.days);}
  else if(favorable){res.key="favorable";res.label=mpTerm("verdict.favorable",win.days);}
  else {res.key="mixed";res.label=mpTerm("verdict.mixed",win.days);}
  res.rationale=[
    "Bodyweight rate "+mpSigned(bwRate,2)+" "+(m.units||"lbs")+"/week.",
    "Global comparable strength "+mpSignedPct(gs)+" across "+(m.strength.detail.globalCategories||[]).length+" movement categories.",
    "Protein: "+(m.protein.label||"not classified")+".",
    (persistentJoint?"Persistent joint-pain alert present.":"No persistent joint-pain alert."),
    (materialSymptom?"A GLP-1 symptom was logged at severity "+MPCFG.glp1.materialSeverity+" or above.":"No GLP-1 symptom at severity "+MPCFG.glp1.materialSeverity+" or above.")];
  /* weight-loss rate vs the stored plan rate, only once a verdict is on the table */
  var target=mpNum((m.settings||{}).targetWeeklyRate);
  if(target!=null&&target>0&&bwRate!=null&&bwRate<0){
    var mag=Math.abs(bwRate);
    if(mag>target*1.15)res.rate=mpTerm("rate.above",win.days);
    else if(mag<target*0.85)res.rate=mpTerm("rate.below",win.days);
    else res.rate=mpTerm("rate.within",win.days);}
  return res;}

function mpAssessmentState(m,win,verdict){
  if(!win.days)return {key:"missing",label:"Assessment limited by missing data"};
  if(m.strength.detail.breaks&&m.strength.detail.breaks.length)
    return {key:"comparability",label:"Assessment limited by movement comparability"};
  if(verdict.eligible)return {key:"eligible",label:"Eligible for assessment"};
  /* Below the minimum window the period is genuinely still running, and saying
     "limited by missing data" would blame the athlete for time not having
     passed. Above it, the window is long enough and something really is absent. */
  if(win.days<MPCFG.verdict.minDays)return {key:"inprogress",label:"Assessment period in progress"};
  return {key:"missing",label:"Assessment limited by missing data"};}

/* ---- Biggest Wins: evidence-backed or clearly factual only, max five ---- */
function mpWins(m,series,win){
  var out=[];
  series.filter(function(x){return x.eligible&&x.changePct!=null&&x.changePct>MPCFG.strength.stableBandPct;})
    .sort(function(a,b){return b.changePct-a.changePct;})
    .slice(0,2).forEach(function(x){
      out.push({text:x.name+" e1RM "+mpSignedPct(x.changePct)+" across "+x.observationCount+" comparable "+mpPlural(x.observationCount,"observation","observations")+".",
        source:"strength"});});
  var pd=m.protein.detail;
  if(m.protein.state!=="missing"&&pd.rows&&pd.rows.length>=MPCFG.protein.minimumValidDays&&pd.hits>0)
    out.push({text:"Protein target reached on "+pd.hits+" of "+pd.rows.length+" valid "+mpPlural(pd.rows.length,"day","days")+".",source:"protein"});
  if(m.training.state==="available"&&m.training.value!=null&&m.training.value>=100)
    out.push({text:"All "+m.training.detail.programmed+" programmed "+mpPlural(m.training.detail.programmed,"session","sessions")+" completed.",source:"training"});
  var sd=m.sleep.detail;
  if(m.sleep.state==="available"&&sd.rows&&sd.rows.length&&sd.lowNights===0)
    out.push({text:"No night fell below "+mpPct(MPCFG.sleep.lowNightThreshold*100,0)+" of the sleep goal across "+sd.rows.length+" logged "+mpPlural(sd.rows.length,"night","nights")+".",source:"sleep"});
  if(m.bodyweight.state==="available"&&m.bodyweight.detail.weeklyRate!=null&&m.bodyweight.detail.weeklyRate<0&&win.days>=MPCFG.bodyweight.minimumTrendDays)
    out.push({text:"Bodyweight moving at "+mpSigned(m.bodyweight.detail.weeklyRate,2)+" "+(m.units||"lbs")+" per week over "+win.days+" days, from "+m.bodyweight.detail.weighIns+" weigh-ins.",source:"bodyweight"});
  return out.slice(0,5);}

/* ---- Watch List: rule-generated, priority-ordered ---- */
function mpWatch(m,series,win){
  var out=[];
  (m.joint.detail.rising||[]).forEach(function(r){
    out.push({p:1,text:"Joint pain rose from "+r.from+" to "+r.to+" on "+r.exercise+" ("+mpDateLabel(r.date)+") — worth a look before the next exposure."});});
  (m.joint.detail.persistent||[]).forEach(function(r){
    out.push({p:1,text:"Joint pain at "+r.labels[0]+" then "+r.labels[1]+" on two consecutive "+r.exercise+" sessions ("+mpDateLabel(r.dates[0])+", "+mpDateLabel(r.dates[1])+")."});});
  (m.glp.detail.symptoms||[]).forEach(function(s){
    if(s.severity==null||s.severity<MPCFG.glp1.materialSeverity)return;
    var extra="";
    if(m.foodDayValid&&m.foodDayValid[s.date]===false)extra=" No food was logged that day.";
    out.push({p:2,text:s.type+" logged at severity "+mpInt(s.severity)+" of 5 on "+mpDateLabel(s.date)+
      (s.daysSinceDose!=null?(", "+s.daysSinceDose+" "+mpPlural(s.daysSinceDose,"day","days")+" after a dose"):"")+"."+extra+
      " Compound does not record whether intake or training were affected — check with the athlete."});});
  (m.strength.detail.decliningCategories||[]).forEach(function(c){
    out.push({p:3,text:c.label+" measured "+mpSignedPct(c.change)+" across "+c.exercises.length+" "+mpPlural(c.exercises.length,"exercise","exercises")+" ("+c.exercises.join(", ")+")."});});
  if(m.nutrition.value!=null&&m.nutrition.value<MPCFG.verdict.minNutritionCoverage*100)
    out.push({p:4,text:"Nutrition log coverage is "+mpPct(m.nutrition.value)+" of the window — below the "+mpPct(MPCFG.verdict.minNutritionCoverage*100,0)+" this report needs to read adherence at all."});
  if(m.protein.state==="available"&&m.protein.label==="Frequently below target")
    out.push({p:4,text:"Protein averaged "+mpPct(m.protein.value)+" of target and hit it on "+m.protein.detail.hits+" of "+m.protein.detail.rows.length+" valid days."});
  var sd=m.sleep.detail;
  if(m.sleep.state!=="missing"&&sd.rows&&sd.lowNights>=Math.ceil(sd.rows.length*0.4)&&sd.lowNights>0)
    out.push({p:5,text:"Sleep fell below "+mpPct(MPCFG.sleep.lowNightThreshold*100,0)+" of goal on "+sd.lowNights+" of "+sd.rows.length+" logged "+mpPlural(sd.rows.length,"night","nights")+"."});
  (m.soreness.detail.alerts||[]).forEach(function(a){
    out.push({p:5,text:"Soreness reported at the top grade on "+a.count+" consecutive check-ins for "+a.muscle+" ("+a.dates.map(mpDateLabel).join(", ")+")."});});
  if(m.rpe.detail.flag)
    out.push({p:5,text:"Session RPE rose "+mpSigned(m.rpe.value,1)+" points between the two halves of the window while measured strength did not improve."});
  (m.strength.detail.breaks||[]).forEach(function(b){
    out.push({p:6,text:"Movement comparability: "+b.detail});});
  out.sort(function(a,b){return a.p-b.p;});
  return out;}

/* ============================================================
   COACH INTELLIGENCE — relationships, not isolated callouts
   ------------------------------------------------------------
   The previous milestone spoke in single-metric callouts. This one is allowed
   to speak in RELATIONSHIPS: sleep against strength, protein against strength,
   effort against completion, a dose change against what followed it.

   That is the most dangerous sentence type in the whole report, so this is the
   strictest gate in the file. A relationship is STATED only when both sides are
   Available in their own right, the window clears MPCFG.insight.minWindowDays,
   and the paired count clears its own minimum. Everything that fails is still
   EXPOSED — as a candidate carrying the blocker that stopped it — because "this
   was considered and here is why it was refused" is information, and silence is
   not. Griffin's real data (four sessions, nine days) clears none of these, by
   design: at that size any pairing of two measures is noise wearing a sentence.

   No candidate asserts causation, ever. The only relations available to one are
   "coincides with", "points the other way", "followed" and "no relationship
   established".
   ============================================================ */
var MP_DIRECTION_LABEL={coincides:"coincides with",opposes:"points the other way from",
  followed:"was followed by",none:"shows no established relationship to"};

function mpCandidate(o){
  var blockers=(o.blockers||[]).slice();
  var elig=!blockers.length;
  var dir=(o.direction||"none");
  return {id:o.id,title:o.title,kind:(o.kind||"insight"),
    pair:(o.pair||[]).slice(),left:(o.left||null),right:(o.right||null),
    n:(o.n==null?0:o.n),nUnit:(o.nUnit||"days"),
    minimumN:(o.minimumN==null?0:o.minimumN),
    direction:(elig?dir:null),
    directionLabel:(elig?(MP_DIRECTION_LABEL[dir]||MP_DIRECTION_LABEL.none):null),
    eligible:elig,verdict:(elig?"evaluated":"not evaluated"),
    blockers:blockers,
    claim:(elig?(o.claim||null):null),
    metrics:(o.metrics||[]).slice(),
    formulaIds:(o.formulaIds||[]).slice(),
    values:(o.values||[]).slice(),
    coefficient:(o.coefficient===undefined?null:o.coefficient),
    anchorId:"mp:"+((o.kind==="correlation")?"correlation":"insight")+":"+o.id};}

/* Both sides established, window long enough, enough paired observations.
   Returns the blockers; an empty array is the only thing that unlocks a claim. */
function mpPairGate(win,sides,n,nUnit,minN){
  var b=[];
  sides.forEach(function(s){
    if(!s.res||s.res.state!=="available")
      b.push(s.label+" is not established"+
        ((s.res&&s.res.blockers&&s.res.blockers.length)?(" — "+s.res.blockers[0]):".")); });
  if(win.days<MPCFG.insight.minWindowDays)
    b.push("The window is "+win.days+" "+mpPlural(win.days,"day","days")+
      "; a stated relationship needs at least "+MPCFG.insight.minWindowDays+".");
  if(n<minN)
    b.push("Only "+n+" paired "+nUnit+" support the pairing; a stated relationship needs at least "+minN+".");
  return b;}

function mpStrengthSide(m){
  var v=m.strength.value,band=MPCFG.strength.stableBandPct;
  if(v==null)return "none";
  return (v>band)?"up":((v<-band)?"down":"flat");}

function mpInsightCandidates(input,win,m){
  var out=[],u=m.units||"lbs",band=MPCFG.strength.stableBandPct;
  var strSide=mpStrengthSide(m);
  /* ---- 1. sleep sufficiency against the strength trend ---- */
  (function(){
    var sd=m.sleep.detail||{},nights=(sd.rows||[]).length;
    var blockers=mpPairGate(win,[{label:"Sleep sufficiency",res:m.sleep},
      {label:"Comparable strength",res:m.strength}],nights,"nights",MPCFG.insight.minPairedDays);
    var sleepSide=(sd.lowNights===0)?"high":
      ((nights&&sd.lowNights>=Math.ceil(nights*0.4))?"low":"mixed");
    var dir="none";
    if(sleepSide==="high"&&(strSide==="up"||strSide==="flat"))dir="coincides";
    else if(sleepSide==="low"&&strSide==="down")dir="coincides";
    else if(sleepSide==="high"&&strSide==="down")dir="opposes";
    else if(sleepSide==="low"&&strSide==="up")dir="opposes";
    out.push(mpCandidate({id:"sleep-vs-strength",title:"Sleep sufficiency and the strength trend",
      pair:["sleep","strength"],left:"Sleep goal attainment",right:"Comparable strength change",
      n:nights,nUnit:"nights",minimumN:MPCFG.insight.minPairedDays,direction:dir,
      blockers:blockers,metrics:["sleep","strength"],
      formulaIds:["sleep.goalAttainment.v1","strength.globalChange.v1","insight.relationship.v1"],
      values:[{label:"Sleep goal attainment",value:mpPct(m.sleep.value)},
        {label:"Nights below threshold",value:String(sd.lowNights==null?0:sd.lowNights)+" of "+nights},
        {label:"Comparable strength",value:mpSignedPct(m.strength.value)}],
      claim:"Sleep goal attainment averaged "+mpPct(m.sleep.value)+" across "+nights+" logged "+
        mpPlural(nights,"night","nights")+" ("+(sd.lowNights==null?0:sd.lowNights)+" below "+
        mpPct(MPCFG.sleep.lowNightThreshold*100,0)+" of goal), and comparable strength measured "+
        mpSignedPct(m.strength.value)+" over the same window. The sleep reading "+
        (MP_DIRECTION_LABEL[dir]||MP_DIRECTION_LABEL.none)+" the strength reading. "+
        "Two measurements over one window is a coincidence in time; it is not a test of whether either moved the other."}));})();
  /* ---- 2. protein coverage against the strength trend ---- */
  (function(){
    var pd=m.protein.detail||{},days=(pd.rows||[]).length;
    var blockers=mpPairGate(win,[{label:"Protein target attainment",res:m.protein},
      {label:"Comparable strength",res:m.strength}],days,"days",MPCFG.insight.minPairedDays);
    var lab=m.protein.label;
    var pSide=(lab==="Consistently meeting target"||lab==="Generally meeting target")?"high":
      ((lab==="Frequently below target")?"low":"mixed");
    var dir="none";
    if(pSide==="high"&&(strSide==="up"||strSide==="flat"))dir="coincides";
    else if(pSide==="low"&&strSide==="down")dir="coincides";
    else if(pSide==="high"&&strSide==="down")dir="opposes";
    else if(pSide==="low"&&strSide==="up")dir="opposes";
    out.push(mpCandidate({id:"protein-vs-strength",title:"Protein attainment and the strength trend",
      pair:["protein","strength"],left:"Protein target attainment",right:"Comparable strength change",
      n:days,nUnit:"days",minimumN:MPCFG.insight.minPairedDays,direction:dir,
      blockers:blockers,metrics:["protein","strength"],
      formulaIds:["protein.meanAttainment.v1","strength.globalChange.v1","insight.relationship.v1"],
      values:[{label:"Protein attainment",value:mpPct(m.protein.value)},
        {label:"Target-hit rate",value:mpPct(pd.hitRate)},
        {label:"Comparable strength",value:mpSignedPct(m.strength.value)}],
      claim:"Protein attainment averaged "+mpPct(m.protein.value)+" of a "+mpFmt(pd.target,0)+
        " g target across "+days+" valid "+mpPlural(days,"day","days")+", hitting the target on "+
        mpPct(pd.hitRate)+" of them, and comparable strength measured "+mpSignedPct(m.strength.value)+
        " over the same window. The protein reading "+(MP_DIRECTION_LABEL[dir]||MP_DIRECTION_LABEL.none)+
        " the strength reading. Neither figure explains the other, and nothing in this report tries to make one do so."}));})();
  /* ---- 3. session RPE against training completion ---- */
  (function(){
    var rd=m.rpe.detail||{};
    var rated=((rd.prior||[]).length+(rd.current||[]).length);
    var blockers=mpPairGate(win,[{label:"Session RPE trend",res:m.rpe},
      {label:"Training completion",res:m.training}],rated,"rated sessions",MPCFG.insight.minPairedSessions);
    var rSide=(m.rpe.value==null)?"flat":
      ((m.rpe.value>=MPCFG.rpe.riseThreshold)?"up":((m.rpe.value<=-MPCFG.rpe.riseThreshold)?"down":"flat"));
    var cVal=m.training.value;
    var cSide=(cVal==null)?"mixed":((cVal>=90)?"high":((cVal<MPCFG.verdict.disruptedCompletionPct)?"low":"mixed"));
    var dir="none";
    if(rSide==="up"&&cSide==="low")dir="coincides";
    else if(rSide==="up"&&cSide==="high")dir="opposes";
    else if(rSide==="down"&&cSide==="high")dir="coincides";
    out.push(mpCandidate({id:"rpe-vs-completion",title:"Session effort and training completion",
      pair:["rpe","training"],left:"Session RPE change between window halves",right:"Training completion",
      n:rated,nUnit:"rated sessions",minimumN:MPCFG.insight.minPairedSessions,direction:dir,
      blockers:blockers,metrics:["rpe","training"],
      formulaIds:["rpe.windowDelta.v1","training.completion.v1","insight.relationship.v1"],
      values:[{label:"RPE change",value:mpSigned(m.rpe.value,1)+" points"},
        {label:"Completion",value:mpPct(cVal)},
        {label:"Sessions",value:String((m.training.detail||{}).completed||0)+" of "+
          String((m.training.detail||{}).programmed==null?"—":(m.training.detail||{}).programmed)}],
      claim:"Session RPE moved "+mpSigned(m.rpe.value,1)+" points between the two halves of the window, while "+
        String((m.training.detail||{}).completed||0)+" of "+
        String((m.training.detail||{}).programmed==null?"—":(m.training.detail||{}).programmed)+
        " programmed sessions were completed ("+mpPct(cVal)+"). The effort reading "+
        (MP_DIRECTION_LABEL[dir]||MP_DIRECTION_LABEL.none)+" the completion reading over these "+
        rated+" rated "+mpPlural(rated,"session","sessions")+". Which came first is not recorded and is not assumed."}));})();
  /* ---- 4. a GLP-1 dose change against the intake and weight that followed ----
     The dose change is an EVENT out of the dose ledger, not a metric with a
     state, so the two sides that have to be established are the ones being
     described: intake and bodyweight. The event itself is gated separately —
     no recorded change means there is nothing for anything to follow. */
  (function(){
    var gd=m.glp.detail||{},cd=m.calories.detail||{};
    var change=gd.lastChange||null;
    var before=[],after=[];
    (cd.rows||[]).forEach(function(r){
      if(change==null)return;
      if(r.date<change)before.push(r.calories);else after.push(r.calories);});
    var n=Math.min(before.length,after.length);
    var blockers=mpPairGate(win,[{label:"Calorie-plan adherence",res:m.calories},
      {label:"Bodyweight trend",res:m.bodyweight}],
      n,"valid days on the shorter side of the change",MPCFG.insight.minPairedDoseDays);
    if(change==null)blockers.unshift("No GLP-1 start or dose change is recorded inside the window, so there is no event for intake or weight to follow.");
    var mb=mpMean(before),ma=mpMean(after);
    var dir=(mb!=null&&ma!=null&&Math.abs(ma-mb)>=0.02*(mb||1))?"followed":"none";
    var rate=(m.bodyweight.detail||{}).weeklyRate;
    out.push(mpCandidate({id:"dosechange-vs-intake",title:"GLP-1 dose change and what followed it",
      pair:["calories","bodyweight"],left:"GLP-1 dose change (event)",right:"Mean daily calories and weekly weight change either side",
      n:n,nUnit:"valid days each side",minimumN:MPCFG.insight.minPairedDoseDays,direction:dir,
      blockers:blockers,metrics:["calories","bodyweight"],
      formulaIds:["glp1.symptomContext.v1","calories.withinTolerance.v1","bodyweight.rollingSlope.v1","insight.relationship.v1"],
      values:[{label:"Change date",value:(change?mpDateFull(change):"—")},
        {label:"Mean intake before",value:mpFmt(mb,0)+" over "+before.length+" valid days"},
        {label:"Mean intake after",value:mpFmt(ma,0)+" over "+after.length+" valid days"},
        {label:"Weekly weight change",value:mpSigned(rate,2)+" "+u+"/week"}],
      claim:"The GLP-1 "+(gd.lastChangeKind||"change")+" logged on "+(change?mpDateFull(change):"—")+
        " was followed by mean intake of "+mpFmt(ma,0)+" calories across "+after.length+" valid "+
        mpPlural(after.length,"day","days")+", against "+mpFmt(mb,0)+" across "+before.length+" valid "+
        mpPlural(before.length,"day","days")+" before it, with bodyweight over the whole window at "+
        mpSigned(rate,2)+" "+u+" per week. This is timing and nothing more: Compound records no link between "+
        "a dose and an intake, so the two are set beside each other rather than joined."}));})();
  return out;}

/* Pearson r. Only ever reached behind the correlation gate; it exists so the
   candidate structure has something real to hold once a window is long enough,
   not so that a coefficient can be printed early. */
function mpPearson(pairs){
  var n=pairs.length;if(n<2)return null;
  var sx=0,sy=0,i;
  for(i=0;i<n;i++){sx+=pairs[i][0];sy+=pairs[i][1];}
  var mx=sx/n,my=sy/n,sxy=0,sxx=0,syy=0;
  for(i=0;i<n;i++){var a=pairs[i][0]-mx,b=pairs[i][1]-my;sxy+=a*b;sxx+=a*a;syy+=b*b;}
  if(sxx<=0||syy<=0)return null;
  var r=sxy/Math.sqrt(sxx*syy);
  if(!isFinite(r))return null;
  return {r:r,n:n};}
function mpDayMap(rows,valFn){
  var out={};
  (rows||[]).forEach(function(r){
    if(!r||!mpIsISO(r.date))return;
    var v=valFn(r);
    if(typeof v==="number"&&isFinite(v))out[r.date]=v;});
  return out;}

function mpCorrelationCandidates(input,win,m){
  var dates=win.dates||[];
  var maps={
    proteinAttainment:mpDayMap((m.protein.detail||{}).rows,function(r){return 100*r.attainment;}),
    calorieDeviation:mpDayMap((m.calories.detail||{}).rows,function(r){return Math.abs(r.deviation);}),
    calories:mpDayMap((m.calories.detail||{}).rows,function(r){return r.calories;}),
    sleepMinutes:mpDayMap((m.sleep.detail||{}).rows,function(r){return r.minutes;}),
    bwRolling:mpDayMap((m.bodyweight.detail||{}).rolling,function(r){return r.value;}),
    sessionRpe:mpDayMap(((m.rpe.detail||{}).prior||[]).concat((m.rpe.detail||{}).current||[]),
      function(r){return r.rpe;}),
    daysSinceDose:{}};
  /* days since the last dose ACTUALLY taken, walked forward over the window so
     the series is deterministic and never interpolated backwards */
  (function(){
    var taken=((m.glp.detail||{}).taken||[]).map(function(t){return t.date;}).sort();
    var last=null,ti=0;
    dates.forEach(function(d){
      while(ti<taken.length&&taken[ti]<=d){last=taken[ti];ti++;}
      if(last!=null)maps.daysSinceDose[d]=mpDayDiff(last,d);});})();
  function pairUp(a,b){
    var out=[];
    dates.forEach(function(d){if(a[d]!=null&&b[d]!=null)out.push([a[d],b[d]]);});
    return out;}
  var defs=[
    {id:"protein-vs-bodyweight",title:"Protein attainment against the 7-day bodyweight mean",
     left:"Protein attainment (%)",right:"7-day rolling mean bodyweight",
     a:"proteinAttainment",b:"bwRolling",metrics:["protein","bodyweight"],
     formulaIds:["protein.meanAttainment.v1","bodyweight.rollingSlope.v1","correlation.pearson.v1"]},
    {id:"calorie-deviation-vs-bodyweight",title:"Calorie deviation against the 7-day bodyweight mean",
     left:"Absolute deviation from the calorie target",right:"7-day rolling mean bodyweight",
     a:"calorieDeviation",b:"bwRolling",metrics:["calories","bodyweight"],
     formulaIds:["calories.withinTolerance.v1","bodyweight.rollingSlope.v1","correlation.pearson.v1"]},
    {id:"sleep-vs-session-rpe",title:"Sleep duration against session RPE",
     left:"Sleep (minutes)",right:"Session RPE",
     a:"sleepMinutes",b:"sessionRpe",metrics:["sleep","rpe"],
     formulaIds:["sleep.goalAttainment.v1","rpe.windowDelta.v1","correlation.pearson.v1"]},
    {id:"dose-gap-vs-calories",title:"Days since the last dose against calories logged",
     left:"Days since the last GLP-1 dose",right:"Calories logged",
     a:"daysSinceDose",b:"calories",metrics:["glp","calories"],
     formulaIds:["glp1.symptomContext.v1","calories.withinTolerance.v1","correlation.pearson.v1"]}];
  return defs.map(function(def){
    var pairs=pairUp(maps[def.a],maps[def.b]);
    var n=pairs.length,blockers=[];
    if(win.days<MPCFG.correlation.minWindowDays)
      blockers.push("The window is "+win.days+" "+mpPlural(win.days,"day","days")+
        "; a coefficient is not calculated below "+MPCFG.correlation.minWindowDays+".");
    if(n<MPCFG.correlation.minPairedPoints)
      blockers.push("Only "+n+" paired "+mpPlural(n,"day","days")+" carry both series; a coefficient needs at least "+
        MPCFG.correlation.minPairedPoints+".");
    var fit=blockers.length?null:mpPearson(pairs);
    if(!blockers.length&&!fit)blockers.push("One of the two series does not vary inside this window, so no coefficient is defined.");
    var r=fit?fit.r:null;
    var dir=(r==null)?"none":((r>=MPCFG.correlation.minAbsR)?"coincides":
      ((r<=-MPCFG.correlation.minAbsR)?"opposes":"none"));
    var claim=null;
    if(r!=null){
      claim=(dir==="none")
        ? ("Across "+n+" paired days no relationship is established between "+def.left.toLowerCase()+
           " and "+def.right.toLowerCase()+" (r = "+mpSigned(r,2)+", below the "+mpFmt(MPCFG.correlation.minAbsR,2)+
           " magnitude this report treats as readable).")
        : ("Across "+n+" paired days "+def.left.toLowerCase()+" "+MP_DIRECTION_LABEL[dir]+" "+
           def.right.toLowerCase()+" (r = "+mpSigned(r,2)+"). A coefficient is association inside one window. "+
           "It does not establish direction of cause, and no third factor has been controlled for.");}
    return mpCandidate({id:def.id,title:def.title,kind:"correlation",
      pair:def.metrics.slice(),left:def.left,right:def.right,
      n:n,nUnit:"paired days",minimumN:MPCFG.correlation.minPairedPoints,
      direction:dir,blockers:blockers,metrics:def.metrics,formulaIds:def.formulaIds,
      values:[{label:"Paired days",value:String(n)},
        {label:"Coefficient",value:(r==null?"not calculated":mpSigned(r,2))}],
      coefficient:r,claim:claim});});}

/* ============================================================
   THE AI COACH SUMMARY — rule-generated, and deliberately not a model
   ------------------------------------------------------------
   Griffin's decision, and the right one for this document: no network call, no
   language model, no free text anywhere. Every sentence below is assembled by
   rule from the metric objects above, which means the report still generates on
   a plane, still generates in five years when an API has been retired, and
   generates the SAME BYTES from the same input every time. A model would give
   nicer prose and would take the audit trail with it.

   Three movements: what happened, what matters, what should happen next.
   A sentence is emitted only when the metric under it carries the state that
   sentence claims — value sentences need Available, provisional sentences say
   "provisional" in their own words, and a limitation sentence quotes the
   blocker verbatim. Each carries the metric keys, formula ids and formatted
   values it was built from, and those travel out as aiSummaryEvidence so a
   reader can walk any clause back to the arithmetic.

   "What should happen next" is conditional on evidence without exception. When
   no rule fires it says so plainly. Generic coaching advice is exactly the
   failure mode this whole report exists to avoid.
   ============================================================ */
function mpSent(o){
  return {id:o.id,kind:o.kind,text:o.text,anchorId:"mp:sentence:"+o.id,
    metrics:(o.metrics||[]).slice(),
    formulaIds:(o.formulaIds||[]).slice(),
    values:(o.values||[]).slice()};}

function mpCoachSummary(m,win,verdict,insights,corrs){
  var u=m.units||"lbs";
  var happened=[],matters=[],next=[];
  var FW=["review.windowSelection.v1"];
  /* ---------- what happened ---------- */
  happened.push(mpSent({id:"wh-window",kind:"window",metrics:[],formulaIds:FW,
    values:[{label:"Window",value:(win.start?(mpDateFull(win.start)+" to "+mpDateFull(win.end)):"none")},
      {label:"Days",value:String(win.days)},{label:"Basis",value:win.basis}],
    text:(win.days
      ? ("This review covers "+win.days+" "+mpPlural(win.days,"day","days")+", "+mpDateFull(win.start)+
         " to "+mpDateFull(win.end)+", set by the "+win.basis+".")
      : "Nothing has been logged, so there is no window to review yet.")}));
  var bd=m.bodyweight.detail||{};
  if(m.bodyweight.state==="available"&&bd.weeklyRate!=null){
    happened.push(mpSent({id:"wh-bodyweight",kind:"value",metrics:["bodyweight"],
      formulaIds:[m.bodyweight.formulaId],
      values:[{label:"Weekly rate",value:mpSigned(bd.weeklyRate,2)+" "+u+"/week"},
        {label:"Weigh-ins",value:String(bd.weighIns)+" of "+String(win.days)+" days"},
        {label:"Coverage",value:mpPct(bd.coveragePct)}],
      text:"Bodyweight moved at "+mpSigned(bd.weeklyRate,2)+" "+u+" per week, measured from "+
        bd.weighIns+" "+mpPlural(bd.weighIns,"weigh-in","weigh-ins")+" covering "+
        mpPct(bd.coveragePct)+" of the window."}));}
  else if(m.bodyweight.state==="provisional"){
    happened.push(mpSent({id:"wh-bodyweight-prov",kind:"provisional",metrics:["bodyweight"],
      formulaIds:[m.bodyweight.formulaId],
      values:[{label:"Weigh-ins",value:String(bd.weighIns||0)},{label:"Window tier",value:String(bd.tier||"—")}],
      text:"Bodyweight is provisional at this window length: "+(bd.weighIns||0)+" "+
        mpPlural(bd.weighIns||0,"weigh-in","weigh-ins")+" are recorded. "+
        (m.bodyweight.blockers[0]||"No weekly rate is calculated yet.")}));}
  var sd=m.strength.detail||{};
  if(m.strength.state==="available"&&m.strength.value!=null){
    happened.push(mpSent({id:"wh-strength",kind:"value",metrics:["strength"],
      formulaIds:[m.strength.formulaId],
      values:[{label:"Global change",value:mpSignedPct(m.strength.value)},
        {label:"Categories",value:String((sd.globalCategories||[]).length)},
        {label:"Eligible exercises",value:String(sd.eligibleExercises||0)}],
      text:"Comparable strength measured "+mpSignedPct(m.strength.value)+" across "+
        (sd.globalCategories||[]).length+" movement "+
        mpPlural((sd.globalCategories||[]).length,"category","categories")+", built from "+
        (sd.eligibleExercises||0)+" eligible "+mpPlural(sd.eligibleExercises||0,"exercise","exercises")+"."}));}
  else{
    happened.push(mpSent({id:"wh-strength-blocked",kind:"limitation",metrics:["strength"],
      formulaIds:[m.strength.formulaId],
      values:[{label:"State",value:String(m.strength.state)},
        {label:"Eligible exercises",value:String(sd.eligibleExercises||0)}],
      text:"Comparable strength is not established for this window: "+
        (m.strength.blockers[0]||"no exercise has a qualifying top set inside the window.")}));}
  var td=m.training.detail||{};
  if(m.training.state==="available"&&m.training.value!=null){
    happened.push(mpSent({id:"wh-training",kind:"value",metrics:["training"],
      formulaIds:[m.training.formulaId],
      values:[{label:"Completed",value:String(td.completed||0)},
        {label:"Programmed",value:String(td.programmed==null?"—":td.programmed)},
        {label:"Completion",value:mpPct(m.training.value)}],
      text:(td.completed||0)+" of "+(td.programmed==null?"—":td.programmed)+" programmed "+
        mpPlural(td.programmed||0,"session","sessions")+" were completed, "+mpPct(m.training.value)+"."}));}
  var pd=m.protein.detail||{};
  if(m.protein.state==="available"&&m.protein.value!=null){
    happened.push(mpSent({id:"wh-protein",kind:"value",metrics:["protein"],
      formulaIds:[m.protein.formulaId],
      values:[{label:"Mean attainment",value:mpPct(m.protein.value)},
        {label:"Target",value:mpFmt(pd.target,0)+" g"},
        {label:"Hit rate",value:mpPct(pd.hitRate)},
        {label:"Valid days",value:String((pd.rows||[]).length)}],
      text:"Protein attainment averaged "+mpPct(m.protein.value)+" of a "+mpFmt(pd.target,0)+
        " g target across "+(pd.rows||[]).length+" valid "+mpPlural((pd.rows||[]).length,"day","days")+
        ", reaching the target on "+pd.hits+" of them."+
        (m.protein.label?(" That falls in the "+m.protein.label.toLowerCase()+" band."):"")}));}
  var sl=m.sleep.detail||{};
  if(m.sleep.state==="available"&&m.sleep.value!=null){
    happened.push(mpSent({id:"wh-sleep",kind:"value",metrics:["sleep"],
      formulaIds:[m.sleep.formulaId],
      values:[{label:"Goal attainment",value:mpPct(m.sleep.value)},
        {label:"Nights logged",value:String((sl.rows||[]).length)},
        {label:"Nights below threshold",value:String(sl.lowNights==null?0:sl.lowNights)}],
      text:"Sleep reached "+mpPct(m.sleep.value)+" of goal on average across "+(sl.rows||[]).length+
        " logged "+mpPlural((sl.rows||[]).length,"night","nights")+", with "+(sl.lowNights==null?0:sl.lowNights)+
        " "+mpPlural(sl.lowNights==null?0:sl.lowNights,"night","nights")+" below "+
        mpPct(MPCFG.sleep.lowNightThreshold*100,0)+" of goal."}));}
  /* ---------- what matters ---------- */
  if(verdict.eligible){
    matters.push(mpSent({id:"wm-verdict",kind:"value",metrics:["strength","bodyweight","protein","nutrition"],
      formulaIds:["strength.globalChange.v1",m.bodyweight.formulaId,"protein.meanAttainment.v1","nutrition.coverage.v1"],
      values:[{label:"Headline",value:verdict.label},{label:"Rate reading",value:verdict.rate}],
      text:"The headline reading for this window is: "+verdict.label+"."+
        (verdict.rate?(" "+verdict.rate+"."):"")}));}
  else{
    /* names only the legs that are actually short — a verdict can be blocked by
       window length alone while every metric under it is fine, and saying
       "protein is not established" in that case would be a lie of attribution */
    var vkeys=["strength","bodyweight","protein","nutrition"].filter(function(k){
      return m[k]&&m[k].state!=="available";});
    matters.push(mpSent({id:"wm-verdict-blocked",kind:"limitation",metrics:vkeys,
      formulaIds:(vkeys.length?vkeys.map(function(k){return m[k].formulaId;}):FW),
      values:[{label:"Gates unmet",value:String(verdict.blockers.length)},
        {label:"Legs not established",value:(vkeys.length?vkeys.join(", "):"none — the gate is window length or record count")}],
      text:"No headline verdict is calculated for this window. "+
        (verdict.blockers.length===1?"One gate is unmet":(verdict.blockers.length+" gates are unmet"))+
        ", the first being: "+(verdict.blockers[0]||"the window is too short.")}));}
  if(m.strength.state!=="missing"&&m.strength.state!=="not_applicable"){
    matters.push(mpSent({id:"wm-confidence-strength",kind:(m.strength.state==="available"?"value":"limitation"),
      metrics:["strength"],formulaIds:[m.strength.formulaId],
      values:[{label:"Data confidence",value:m.strength.dataConfidence},
        {label:"Interpretation confidence",value:m.strength.interpretationConfidence}],
      text:"On the strength reading, data confidence is "+m.strength.dataConfidence+
        " and interpretation confidence is "+m.strength.interpretationConfidence+
        (m.strength.interpretationReasons.length?(" — "+m.strength.interpretationReasons[0]):
          ". The measurement and the reading of it are rated separately throughout this report.")}));}
  var jd=m.joint.detail||{};
  if(m.joint.state==="available"&&((jd.current||[]).length||(jd.rising||[]).length)){
    matters.push(mpSent({id:"wm-joint",kind:"value",metrics:["joint"],formulaIds:[m.joint.formulaId],
      values:[{label:"Ratings at Moderate or above",value:String((jd.current||[]).length)},
        {label:"Rising",value:String((jd.rising||[]).length)},
        {label:"Persistent",value:String((jd.persistent||[]).length)}],
      text:"Joint pain was rated Moderate or above "+(jd.current||[]).length+" "+
        mpPlural((jd.current||[]).length,"time","times")+", rose in severity on "+(jd.rising||[]).length+" "+
        mpPlural((jd.rising||[]).length,"exposure","exposures")+" and persisted across consecutive exposures "+
        (jd.persistent||[]).length+" "+mpPlural((jd.persistent||[]).length,"time","times")+"."}));}
  var so=m.soreness.detail||{};
  if(m.soreness.state==="available"&&(so.alerts||[]).length){
    matters.push(mpSent({id:"wm-soreness",kind:"value",metrics:["soreness"],formulaIds:[m.soreness.formulaId],
      values:[{label:"Persistent patterns",value:String((so.alerts||[]).length)}],
      text:(so.alerts||[]).length+" persistent soreness "+mpPlural((so.alerts||[]).length,"pattern","patterns")+
        " met the "+MPCFG.soreness.consecutiveForPersistent+"-consecutive-check-in rule ("+
        (so.alerts||[]).map(function(a){return a.muscle;}).join(", ")+")."}));}
  if(m.rpe.state==="available"&&(m.rpe.detail||{}).flag){
    matters.push(mpSent({id:"wm-rpe",kind:"value",metrics:["rpe","strength"],
      formulaIds:[m.rpe.formulaId,"strength.globalChange.v1"],
      values:[{label:"RPE change",value:mpSigned(m.rpe.value,1)+" points"}],
      text:"Session effort rose "+mpSigned(m.rpe.value,1)+" points between the halves of the window while measured "+
        "strength did not rise with it, which is the one combination this report treats as a limitation signal."}));}
  var elig=insights.filter(function(c){return c.eligible&&c.claim;});
  if(elig.length){
    elig.slice(0,2).forEach(function(c,i){
      matters.push(mpSent({id:"wm-insight-"+c.id,kind:"relationship",metrics:c.metrics,
        formulaIds:c.formulaIds,values:c.values,text:c.claim}));});}
  else{
    matters.push(mpSent({id:"wm-insight-none",kind:"limitation",metrics:[],
      formulaIds:["insight.relationship.v1"],
      values:[{label:"Candidates considered",value:String(insights.length)},
        {label:"Candidates eligible",value:"0"}],
      text:"None of the "+insights.length+" relationships this report knows how to look for clears its gate on "+
        "this window, so none is stated. Each one is listed further down with the blocker that stopped it."}));}
  /* ---------- what should happen next ---------- */
  (jd.rising||[]).slice(0,1).forEach(function(r){
    next.push(mpSent({id:"wn-joint",kind:"action",metrics:["joint"],formulaIds:[m.joint.formulaId],
      values:[{label:"Exercise",value:r.exercise},{label:"Change",value:r.from+" to "+r.to},
        {label:"Date",value:mpDateFull(r.date)}],
      text:"Look at "+r.exercise+" before the next exposure: joint pain rose from "+r.from+" to "+r.to+
        " on "+mpDateFull(r.date)+", and rising severity is the one safety rule this report acts on by itself."}));});
  if(m.nutrition.value!=null&&m.nutrition.value<MPCFG.verdict.minNutritionCoverage*100){
    next.push(mpSent({id:"wn-nutrition-coverage",kind:"action",metrics:["nutrition"],
      formulaIds:[m.nutrition.formulaId],
      values:[{label:"Coverage",value:mpPct(m.nutrition.value)},
        {label:"Required",value:mpPct(MPCFG.verdict.minNutritionCoverage*100,0)}],
      text:"Nutrition coverage is "+mpPct(m.nutrition.value)+" of the window against the "+
        mpPct(MPCFG.verdict.minNutritionCoverage*100,0)+" a headline verdict needs. Logging more days is the "+
        "single change that unlocks the most of this report, because adherence cannot be read at all below that line."}));}
  if(win.days&&win.days<MPCFG.verdict.minDays){
    next.push(mpSent({id:"wn-window-short",kind:"action",metrics:[],formulaIds:FW,
      values:[{label:"Window",value:String(win.days)+" days"},
        {label:"Required",value:String(MPCFG.verdict.minDays)+" days"}],
      text:"This window is "+win.days+" "+mpPlural(win.days,"day","days")+" and a headline verdict needs "+
        MPCFG.verdict.minDays+". "+(MPCFG.verdict.minDays-win.days)+" more "+
        mpPlural(MPCFG.verdict.minDays-win.days,"day","days")+" at the current logging pattern would make one "+
        "calculable — nothing else is required for that particular gate."}));}
  else if(win.days&&(bd.weighIns||0)<MPCFG.verdict.minWeighIns){
    next.push(mpSent({id:"wn-weighins",kind:"action",metrics:["bodyweight"],
      formulaIds:[m.bodyweight.formulaId],
      values:[{label:"Weigh-ins",value:String(bd.weighIns||0)},
        {label:"Required",value:String(MPCFG.verdict.minWeighIns)}],
      text:"Weigh-ins stand at "+(bd.weighIns||0)+" against the "+MPCFG.verdict.minWeighIns+
        " a verdict needs; "+(MPCFG.verdict.minWeighIns-(bd.weighIns||0))+" more inside a window this length "+
        "would clear that gate on its own."}));}
  if(m.strength.state!=="available"&&m.strength.blockers.length&&win.days>=MPCFG.verdict.minDays){
    next.push(mpSent({id:"wn-strength",kind:"action",metrics:["strength"],
      formulaIds:[m.strength.formulaId],
      values:[{label:"First blocker",value:m.strength.blockers[0]}],
      text:"For comparable strength to become readable, the blocking condition is exactly this: "+
        m.strength.blockers[0]+" Nothing about the training itself is being judged here — this is a measurement gate."}));}
  if(m.protein.state==="available"&&m.protein.label==="Frequently below target"){
    next.push(mpSent({id:"wn-protein",kind:"action",metrics:["protein"],
      formulaIds:[m.protein.formulaId],
      values:[{label:"Mean attainment",value:mpPct(m.protein.value)},
        {label:"Hit rate",value:mpPct(pd.hitRate)}],
      text:"Protein averaged "+mpPct(m.protein.value)+" of target and reached it on "+pd.hits+" of "+
        (pd.rows||[]).length+" valid "+mpPlural((pd.rows||[]).length,"day","days")+", which is the lowest-reading "+
        "leg of the nutrition evidence in this window."}));}
  if(m.training.state==="available"&&m.training.value!=null&&
     m.training.value<MPCFG.verdict.disruptedCompletionPct){
    next.push(mpSent({id:"wn-training",kind:"action",metrics:["training"],
      formulaIds:[m.training.formulaId],
      values:[{label:"Completion",value:mpPct(m.training.value)},
        {label:"Threshold",value:mpPct(MPCFG.verdict.disruptedCompletionPct,0)}],
      text:"Training completion is "+mpPct(m.training.value)+", under the "+
        mpPct(MPCFG.verdict.disruptedCompletionPct,0)+" this report treats as a disrupted block. That is a "+
        "scheduling fact from the session log, not a judgement about effort."}));}
  next=next.slice(0,4);
  if(!next.length){
    next.push(mpSent({id:"wn-none",kind:"limitation",metrics:[],formulaIds:FW,
      values:[{label:"Rules fired",value:"0"}],
      text:"Nothing in this window establishes an action. No recommendation is made here on purpose: a "+
        "recommendation this report cannot point at a metric for would be advice, and advice is the one thing "+
        "this document is built not to invent."}));}
  var sections=[
    {id:"what-happened",title:"What happened",anchorId:"mp:summary:what-happened",sentences:happened},
    {id:"what-matters",title:"What matters",anchorId:"mp:summary:what-matters",sentences:matters},
    {id:"what-next",title:"What should happen next",anchorId:"mp:summary:what-next",sentences:next}];
  var evidence=[],text=[];
  sections.forEach(function(sec){
    sec.sentences.forEach(function(s){
      text.push(s.text);
      evidence.push({sentenceId:s.id,claim:s.text,
        formulaIds:s.formulaIds.slice(),values:s.values.slice(),
        metrics:s.metrics.slice(),kind:s.kind,section:sec.id});});});
  return {sections:sections,evidence:evidence,text:text.join(" "),
    formulaId:"summary.narrative.v1",generator:"rule-based, deterministic, offline",
    anchorId:"mp:summary"};}

/* ============================================================
   THE VIEW MODEL — one pure call, everything the document renders
   ============================================================ */
function mpReport(input){
  var win=mpWindow(input);
  var days=win.days;
  var obs=mpObservations(input,win);
  var breaks=mpComparabilityBreaks(obs.observations);
  var series=mpExerciseSeries(obs.observations,days);
  var m={};
  m.units=input.units||"lbs";
  m.settings=input.settings||{};
  m.protein=mpProtein(input,win);
  m.calories=mpCalories(input,win);
  m.nutrition=mpNutritionCoverage(input,win);
  m.sleep=mpSleep(input,win);
  m.training=mpTrainingCompletion(input,win);
  m.strength=mpStrength(input,win,series,breaks);
  m.bodyweight=mpBodyweight(input,win);
  m.relative=mpRelativeStrength(input,win,series,m.strength,m.bodyweight);
  m.rpe=mpSessionRpe(input,win,m.strength);
  m.soreness=mpSoreness(input,win);
  m.joint=mpJointPain(input,win);
  m.glp=mpGlp(input,win);
  m.projection=mpProjection(input,win,m.bodyweight,m.glp.detail);
  /* which days had ANY food logged — used only to state a fact beside a symptom,
     never to infer that the symptom caused the gap */
  m.foodDayValid={};
  win.dates.forEach(function(d){
    var f=(input.food||{})[d];
    m.foodDayValid[d]=!!(f&&(mpNum(f.calories)!=null||mpNum(f.protein)!=null||
      mpNum(f.carbs)!=null||mpNum(f.fat)!=null));});
  var verdict=mpVerdict(m,win);
  var assess=mpAssessmentState(m,win,verdict);
  var insights=mpInsightCandidates(input,win,m);
  var corrs=mpCorrelationCandidates(input,win,m);
  var summary=mpCoachSummary(m,win,verdict,insights,corrs);
  /* ============================================================
     ANNOTATION ANCHORS — architecture only, nothing is drawn yet.
     Every block a coach might one day mark up already carries a stable id, in
     one flat namespace, so an annotation record can be {anchorId, kind, payload}
     and nothing about this view model has to be reshaped to accept it:

       mp:metric:<key>            a metric card          (protein, strength …)
       mp:exercise:<exerciseId>   one exercise series
       mp:session:<date>:<index>  one logged session in the ledger
       mp:sentence:<sentenceId>   one summary sentence
       mp:insight:<id>            one relationship candidate
       mp:correlation:<id>        one correlation candidate
       mp:summary[:<sectionId>]   the narrative, or one of its three movements
       mp:photo:<photoId>         RESERVED for the progress-photo milestone

     The ids are derived from data, not from render order, so they survive a
     re-render, a re-export and a change of window. They are emitted as
     data-anchor attributes on the rendered blocks and listed here.
     ============================================================ */
  var anchors=[summary.anchorId];
  summary.sections.forEach(function(sec){
    anchors.push(sec.anchorId);
    sec.sentences.forEach(function(s){anchors.push(s.anchorId);});});
  ["protein","calories","nutrition","sleep","training","strength","bodyweight",
   "relative","rpe","soreness","joint","glp","projection"].forEach(function(k){
    if(m[k]&&m[k].anchorId)anchors.push(m[k].anchorId);});
  series.forEach(function(x){anchors.push("mp:exercise:"+x.key);});
  insights.forEach(function(c){anchors.push(c.anchorId);});
  corrs.forEach(function(c){anchors.push(c.anchorId);});
  return {
    input:input,window:win,vocab:mpVocab(days),
    metrics:m,series:series,observations:obs.observations,
    exclusions:obs.exclusions,breaks:breaks,
    verdict:verdict,assessment:assess,
    wins:mpWins(m,series,win),watch:mpWatch(m,series,win),
    summary:summary,aiSummaryEvidence:summary.evidence,
    insightCandidates:insights,correlationCandidates:corrs,
    anchors:anchors,
    e5:MP_E5,
    who:input.who||"Athlete",today:input.today,plan:input.plan||"Fat Loss",
    units:m.units,config:MPCFG};}
/* MP-CALC-END */