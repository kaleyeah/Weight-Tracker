/* SR-VIEW-START */
var SRDASH="—";
function srEsc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
function srFin(n){return typeof n==="number"&&isFinite(n);}
function srInt(n){if(!srFin(n))return SRDASH;n=Math.round(n);var neg=n<0,s=String(Math.abs(n)),o="";while(s.length>3){o=","+s.slice(-3)+o;s=s.slice(0,-3);}return (neg?"−":"")+s+o;}
/* weights can be fractional (2.5 kg plates): print the decimal only when real */
function srW(n){if(!srFin(n))return SRDASH;var r=Math.round(n*10)/10;return r===Math.round(r)?srInt(r):String(r);}
/* one decimal at most, printed the way the app's r1() displays it (190.2, 190) */
function srR1(n){return srFin(n)?String(Math.round(n*10)/10):SRDASH;}
function srRangeTxt(g){return srInt(g.lo)+"–"+srInt(g.hi);}
/* the set-target verdict icons, copied character-for-character from the app's
   I.trend / I.trenddn / I.target so the report speaks the workout screen's own
   visual language (setTargetIcon): green trend-up 18px above the range, red
   trend-down 18px below it, amber bullseye 17px inside it */
var SR_ICON_UP='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/></svg>';
var SR_ICON_DN='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 17-8.5-8.5-5 5L2 7"/><path d="M16 17h6v-6"/></svg>';
var SR_ICON_TGT='<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.6" fill="currentColor"/></svg>';
/* same thresholds as setTargetIcon's range branch: below the bottom of the
   set's OWN range first, then above the top, else inside */
function srSetIconHTML(r,lo,hi){
  if(!srFin(r)||(lo==null&&hi==null))return "";
  if(lo!=null&&r<lo)return '<span class="tgt" style="color:#ef4444">'+SR_ICON_DN+'</span>';
  if(hi!=null&&r>hi)return '<span class="tgt" style="color:#22c55e">'+SR_ICON_UP+'</span>';
  return '<span class="tgt" style="color:#eab308">'+SR_ICON_TGT+'</span>';}
/* the prescription at a glance: the whole ladder for reverse pyramid,
   sets × range for one shared range, nothing when nothing was set
   (the RPT/PO chip carries the progression name, so no prefix here) */
function srSchemeTxt(x){
  if(x.mode==="rpt"&&x.ranges&&x.ranges.length)return x.ranges.map(srRangeTxt).join(" / ");
  if(x.mode==="single"&&x.ranges&&x.ranges.length)return srInt(x.sets.length)+" × "+srRangeTxt(x.ranges[0]);
  return "";}
/* one exercise: name, progression chip + prescription, then the set grid.
   Target ranges arrive PER SET, already resolved against the reverse-pyramid
   slot the set was logged in, so a skipped opener never slides the ladder.
   A PR tag rides its set. */
function srExerciseHTML(x,first){
  var h='<div class="ex"><div class="ex-name">'+srEsc(x.name)+'</div>';
  var sch=srSchemeTxt(x);
  h+='<div class="ex-scheme"><span class="ptag'+(x.mode==="rpt"?" rpt":"")+'">'+(x.mode==="rpt"?"RPT":"PO")+'</span>'+srEsc(sch)+(x.assumed?'<span class="dag">&dagger;</span>':'')+'</div>';
  /* the header repeats per exercise (Owner, 2026-08-03: "It only lists it
     at the very top") — five columns is more than anyone holds in their head
     while scrolling a report. `first` still controls the leading gap only. */
  h+='<div class="setgrid sethead"><span>Set</span><span>Weight &times; Reps</span><span style="text-align:center">Target</span><span style="text-align:center">Range</span><span style="text-align:right">RIR</span></div>';
  (x.sets||[]).forEach(function(st,i){
    if(st.skipped){
      h+='<div class="setgrid setrow'+((!first&&i===0)?' pad':'')+'">'+
        '<span class="set-n">'+srInt(st.n)+'</span>'+
        '<span class="set-wr" style="color:#6C7686;font-style:italic;font-weight:500">skipped</span>'+
        '<span class="set-tgt">'+((st.lo!=null&&st.hi!=null)?srRangeTxt({lo:st.lo,hi:st.hi}):SRDASH)+'</span>'+
        '<span class="set-rng" style="color:#6C7686">'+SRDASH+'</span>'+
        '<span class="set-rir">'+SRDASH+'</span></div>';
      return;}
    /* the multiply sign gets its own spacing and is dimmed, so the two numbers
       read as two numbers (Owner, 2026-08-03: "very tight ... hard to read") */
    var wr=(st.w!=null?srW(st.w):"BW")+'<span class="wr-x">&times;</span>'+srInt(st.r)+(st.pr?'<span class="pr">'+srEsc(st.pr)+'</span>':'');
    h+='<div class="setgrid setrow'+((!first&&i===0)?' pad':'')+'">'+
      '<span class="set-n">'+srInt(st.n)+'</span>'+
      '<span class="set-wr">'+wr+'</span>'+
      '<span class="set-tgt">'+((st.lo!=null&&st.hi!=null)?srRangeTxt({lo:st.lo,hi:st.hi}):SRDASH)+'</span>'+
      '<span class="set-rng">'+srSetIconHTML(st.r,st.lo,st.hi)+'</span>'+
      '<span class="set-rir">'+(st.rir!=null?srInt(st.rir):SRDASH)+'</span></div>';});
  return h+'</div>';}
/* the silhouette drawn in a photo slot whose pose was not taken this week */
var SR_SILH='<svg viewBox="0 0 100 150" aria-hidden="true"><g fill="#2E3949"><circle cx="52" cy="18" r="12"/><path d="M44 34 C50 31 58 32 60 36 L62 66 C63 76 61 84 60 88 L63 138 L51 138 L50 100 L47 138 L37 138 L42 88 C40 80 40 70 42 60 Z"/></g></svg>';
/* progress photos: real embedded images per pose; a missing pose keeps its slot
   with the silhouette and a "not taken" label. `empty` marks a week with no
   photos at all (dashed slots, no silhouette). Photos arrive as data URIs in
   the input — this renderer never reads storage. */
function srPhotosHTML(ph){
  if(!ph||!ph.slots||!ph.slots.length)return "";
  var h='<div class="wl-card"><div class="wl-card-head"><span>Progress Photos</span>'+(ph.count?'<span class="wl-count">'+srEsc(ph.count)+'</span>':'')+'</div>';
  h+='<div class="ph-row" style="grid-template-columns:repeat('+srInt(ph.slots.length)+',1fr)">';
  ph.slots.forEach(function(sl){
    if(sl.dataUri)h+='<div class="ph-slot"><img src="'+srEsc(sl.dataUri)+'" alt="'+srEsc(sl.pose)+' progress photo"><span class="ph-pose">'+srEsc(sl.pose)+'</span></div>';
    else if(ph.empty)h+='<div class="ph-slot empty"><span class="ph-pose">'+srEsc(sl.pose)+' &middot; not taken</span></div>';
    else h+='<div class="ph-slot">'+SR_SILH+'<span class="ph-pose">'+srEsc(sl.pose)+' &middot; not taken</span></div>';});
  h+='</div>';
  if(ph.caption)h+='<div class="wl-hint">'+srEsc(ph.caption)+'</div>';
  return h+'</div>';}
/* Body fat, lean mass and waist (Owner, 2026-08-03). These are logged only
   when measured, so the card reports the latest reading and how it moved since
   the previous one, and says plainly when the newest reading predates the week
   rather than passing a stale number off as this week's. Held or rising lean
   mass while weight falls is the whole point of the training. */
function srBodyCompHTML(inp){
  var rows=(inp.bodycomp||[]).filter(function(r){return r.val!=null;});
  if(!rows.length)return "";
  var h='<div class="wl-card"><div class="wl-card-head"><span>Body composition</span></div>';
  rows.forEach(function(r){
    var chg;
    if(r.chg!=null&&r.chg!==0){
      var good=r.goodUp?(r.chg>0):(r.chg<0);
      /* the unit rides on the change too (Owner, 2026-08-10: "Is it percent?
         There's no label") — ↓ 1.8 alone made lbs look like it might be % */
      chg='<span class="bc-chg '+(good?"good":"bad")+'">'+(r.chg>0?"&#8593;":"&#8595;")+' '+srR1(Math.abs(r.chg))+' '+srEsc(r.unit)+'</span>';
    }else if(r.chg===0)chg='<span class="bc-chg flat">&mdash;</span>';
    /* an empty cell, never an absent one: the column must hold its width or the
       rows below stop lining up (Owner, 2026-08-03) */
    else chg='<span class="bc-chg"></span>';
    h+='<div class="bc-row"><span class="bc-k">'+srEsc(r.key)+'</span>'+
       '<span class="bc-v">'+srR1(r.val)+'<em> '+srEsc(r.unit)+'</em></span>'+
       chg+'<span class="bc-d">'+srEsc(r.stale?("last logged "+r.dateLabel):r.dateLabel)+'</span></div>';});
  h+='<div class="wl-hint">Dates show the last entry for each metric. Change is against the previous entry before this week. Lean mass holding or rising while weight falls means muscle is being kept.</div>';
  return h+'</div>';}
/* Lean body mass on the report (Owner, 2026-08-06): weekly average with the
   week-over-week move, plus the full history as a chart — the fat-vs-muscle
   question lives here. Chart comes from the same tcChartSVG the app uses, so
   the export can never disagree with the Progress tab. */
function srLbmHTML(inp){
  var L=inp.lbm;if(!L||!L.series.length)return "";
  var u=srEsc(inp.units);
  var win=L.win||{points:[]};
  var h='<div class="wl-card"><div class="wl-card-head"><span>Lean body mass</span>'+
    '<span class="wl-count">'+win.points.length+' reading'+(win.points.length===1?'':'s')+' this week</span></div>';
  if(L.cur.avg!=null){
    var chg="";
    if(L.chg!=null&&L.chg!==0)chg=' <span class="bc-chg '+(L.chg>0?"good":"bad")+'">'+(L.chg>0?"&#8593;":"&#8595;")+' '+srR1(Math.abs(L.chg))+' '+u+' vs last week</span>';
    else if(L.chg===0)chg=' <span class="bc-chg flat">level with last week</span>';
    h+='<div class="bc-row"><span class="bc-k">This week avg</span><span class="bc-v">'+srR1(L.cur.avg)+'<em> '+u+'</em></span>'+chg+'<span class="bc-d">'+L.cur.n+' reading'+(L.cur.n===1?'':'s')+(L.cur.derived?' ('+L.cur.derived+' calculated)':'')+'</span></div>';
    if(L.prev.avg!=null)h+='<div class="bc-row"><span class="bc-k">Last week avg</span><span class="bc-v">'+srR1(L.prev.avg)+'<em> '+u+'</em></span><span class="bc-chg"></span><span class="bc-d">'+L.prev.n+' reading'+(L.prev.n===1?'':'s')+'</span></div>';
  }else h+='<div class="wl-hint">No lean-mass readings this week yet.</div>';
  /* W mode, so the axis is labelled by day like the app's own weekly chart.
     One reading draws a lone point and no line — that is the honest picture of
     a week with one measurement, and it is not padded out with earlier days. */
  if(win.points.length)
    h+='<div class="spark">'+tcChartSVG({mode:"W",startISO:win.startISO,endISO:win.endISO,
      points:win.points,avg:null,dec:1,unit:inp.units,
      colors:{axis:"#5A6474",grid:"#252D3A",line:"#F5B944",accent:"#F5B944",fill:"rgba(245,181,68,0.08)",pointFill:"#10151E"},
      ariaLabel:"Lean body mass, "+(inp.range||"this week")})+'</div>';
  h+='<div class="wl-hint">Held or rising lean mass while weight falls means the loss is FAT and muscle is being kept — the whole point. Calculated readings come from that day\u2019s weight and body-fat pair; scale readings are used as logged.</div>';
  return h+'</div>';}

/* the Summary tab's weekly-average hero, change pill included */
function srHeroHTML(inp){
  var u=srEsc(inp.units),he=inp.hero;
  var h='<div class="wl-card wl-hero">';
  if(!he||he.avg==null)return h+'<div class="wl-hint" style="margin-top:0">No weigh-ins logged this week.</div></div>';
  h+='<div class="wl-hero-top"><div><div class="wl-mini-label">Weekly Average</div><div class="wl-bignum">'+srR1(he.avg)+'<span class="wl-unit">'+u+'</span></div></div>';
  if(he.dir==="maintained")h+='<span class="wl-change">Maintained</span>';
  else if(he.dir==="lost")h+='<span class="wl-change good">&#8595; Lost '+srR1(Math.abs(he.chg))+' '+u+'</span>';
  else if(he.dir==="gained")h+='<span class="wl-change bad">&#8593; Gained '+srR1(Math.abs(he.chg))+' '+u+'</span>';
  h+='</div>';
  if(he.prev!=null)h+='<div class="wl-hero-sub">vs last week&rsquo;s average of '+srR1(he.prev)+' '+u+'</div>';
  else h+='<div class="wl-hero-sub">no weigh-ins last week to compare</div>';
  return h+'</div>';}
/* The week's weight chart, drawn by the SAME tcChartSVG in the SAME W-mode
   dress as the Progress tab (blue line, open day-labelled points) — the report
   never gets its own chart dialect. Colors are the dark-theme CH tokens,
   hard-coded because the exported document has no THEMES to read. */
function srWeightChartHTML(inp){
  var W=inp.weightChart;if(!W||!W.points.length)return "";
  var h='<div class="wl-card"><div class="wl-card-head"><span>Weight</span>'+
    '<span class="wl-count">'+srInt(W.points.length)+' weigh-in'+(W.points.length===1?'':'s')+'</span></div>';
  h+='<div class="spark">'+tcChartSVG({mode:"W",startISO:W.startISO,endISO:W.endISO,
    points:W.points,avg:null,dec:1,unit:inp.units,
    colors:{axis:"#5A6474",grid:"#252D3A",line:"#7C93F5",accent:"#7C93F5",fill:"rgba(124,147,245,0.10)",pointFill:"#10151E"},
    ariaLabel:"Weight, "+(inp.range||"this week")})+'</div>';
  return h+'</div>';}
/* The athlete's own words about the week — the part of the report the coach
   reads first, and the only part the numbers cannot supply.

   Matched to the week the check-in COVERS, not the day it was submitted, so a
   check-in filled in late still lands on the right report (Owner, 2026-08-11).
   The submission date is shown when it was written after the check-in day,
   because "biggest win this week" reads differently written the morning after
   than written nine days later — and hiding that would be dishonest to a coach
   who is trying to judge how fresh the account is. */
function srCheckinHTML(inp){
  var c=inp.checkin;
  if(!c)return "";
  var h='<div class="wl-card"><div class="wl-card-head"><span>In his own words</span>'+
    '<span class="wl-count">'+srEsc(c.covers)+'</span></div>';

  if(c.status==="skipped"){
    return h+'<div class="wl-hint" style="margin-top:0">Check-in skipped for this week.</div></div>';}

  if(!c.answers.length){
    return h+'<div class="wl-hint" style="margin-top:0">Check-in started but no questions answered.</div></div>';}

  c.answers.forEach(function(a){
    h+='<div class="ci-q">'+srEsc(a.label)+'</div>'+
       '<div class="ci-a">'+srEsc(a.text)+'</div>';});

  var meta=c.answered+' of '+c.of+' answered';
  if(c.lateDays>0&&c.submittedLabel)
    meta+=' · written '+srEsc(c.submittedLabel)+', '+
      (c.lateDays===1?'a day':c.lateDays+' days')+' after the week closed';
  else if(c.submittedLabel)
    meta+=' · '+srEsc(c.submittedLabel);
  h+='<div class="wl-hint">'+meta+'</div>';
  return h+'</div>';}

/* The How-you've-felt grid, carried over from the Progress tab so the coach
   reads the same picture the athlete does: six strands down, the week across,
   5 best and 1 worst. An unanswered day is a dash, never a low score. */
function srFeelHTML(inp){
  var F=inp.feel;if(!F||!F.rows.length)return "";
  var h='<div class="wl-card"><div class="wl-card-head"><span>How the week felt</span>'+
    '<span class="wl-count">'+srInt(F.answered)+' of '+srInt(F.of)+' days answered</span></div>';
  h+='<div class="fgrid"><span></span><div class="fdow">'+
    F.dow.map(function(d){return '<span>'+srEsc(d)+'</span>';}).join("")+'</div>';
  F.rows.forEach(function(r){
    var cells='';
    r.cells.forEach(function(c){
      cells+=(c.g==null)
        ? '<div class="fcell na">&ndash;</div>'
        : '<div class="fcell" style="background:'+srEsc(c.color)+'" title="'+srEsc(c.label||"")+'">'+c.g+'</div>';});
    h+='<span class="fk">'+srEsc(r.label)+'</span><div class="fcells">'+cells+'</div>';});
  h+='</div><div class="wl-hint">5 is best, 1 is worst. &ldquo;&ndash;&rdquo; means the day wasn&rsquo;t answered &mdash; a gap is never read as a bad day.</div>';
  return h+'</div>';}
function srChipsHTML(inp){
  var h='<div class="wl-card"><div class="wl-card-head"><span>Completed Check-ins</span></div><div class="wl-cichips">';
  (inp.chips||[]).forEach(function(c){h+='<span class="wl-cichip '+srEsc(c.cls)+'">'+srEsc(c.dow)+'</span>';});
  return h+'</div><div class="wl-legend"><span><i style="background:var(--good)"></i>Completed</span><span><i style="background:var(--accent)"></i>Partial</span><span><i style="background:var(--bad)"></i>Missed</span></div></div>';}
function srTotalsHTML(inp){
  var h='<div class="wl-card"><div class="wl-card-head"><span>Weekly Totals</span></div><div class="wl-statrow">';
  (inp.totals||[]).forEach(function(t){h+='<div class="wl-stat"><div class="wl-stat-label">'+srEsc(t.label)+'</div><div class="wl-stat-val">'+(t.v!=null?srInt(t.v):SRDASH)+'</div></div>';});
  return h+'</div></div>';}
/* the Summary tab's Weekly Macros bars, fiber included — pct and done are
   computed upstream with the same pro-rating rule the app card uses; a row
   with no goal shows its total without a bar, exactly like the app */
function srMacrosHTML(inp){
  var m=inp.macros;if(!m)return "";
  var h='<div class="wl-card"><div class="wl-card-head"><span>Weekly Macros</span>'+(m.note?'<span class="wl-count">'+srEsc(m.note)+'</span>':'')+'</div>';
  (m.rows||[]).forEach(function(r){
    var vTxt=srInt(r.val)+(r.goal!=null?' / '+srInt(r.goal):'')+(r.unit?' '+srEsc(r.unit):'')+(r.done?' &#10003;':'');
    h+='<div class="wl-goalrow"><div class="wl-goalrow-top"><span>'+srEsc(r.label)+'</span><span class="wl-goalrow-val'+(r.done?' done':'')+'">'+vTxt+'</span></div>';
    if(r.goal!=null)h+='<div class="wl-goalbar"><div class="wl-goalbar-fill'+(r.done?' done':'')+'" style="width:'+srInt(r.pct)+'%"></div></div>';
    h+='</div>';});
  return h+'</div>';}
/* Weekly Averages tiles: display strings and good/warn/bad classes arrive
   pre-computed by the SAME fnum/gcol helpers the Summary tab uses */
function srAvgsHTML(inp){
  var h='<div class="wl-card"><div class="wl-card-head"><span>Weekly Averages</span><span class="wl-count">Per logged day</span></div><div class="wl-statrow">';
  (inp.averages||[]).forEach(function(a){
    h+='<div class="wl-stat"><div class="wl-stat-label">'+srEsc(a.label)+'</div><div class="wl-stat-val'+(a.cls?' '+srEsc(a.cls):'')+'">'+srEsc(a.disp)+'</div><div class="wl-stat-sub">'+(a.sub?srEsc(a.sub):'&nbsp;')+'</div></div>';});
  return h+'</div></div>';}
/* The daily targets the week was eaten against (Owner, 2026-08-12). Replaces
   the Weekly Activity counts, which repeated what Weekly Totals already says in
   minutes and sessions. A coach cannot read "2,050 calories" without knowing
   what it was aiming at. */
function srTargetsHTML(inp){
  var t=inp.targets;if(!t)return "";
  if(t.cal==null&&t.protein==null&&t.carbs==null&&t.fat==null)return "";
  var cell=function(label,v,unit){
    return '<div class="wl-stat"><div class="wl-stat-label">'+srEsc(label)+'</div><div class="wl-stat-val">'
      +(v==null?SRDASH:srInt(v))+(v!=null&&unit?'<span style="font-size:11px;color:var(--faint)">'+unit+'</span>':'')+'</div></div>';};
  return '<div class="wl-card"><div class="wl-card-head"><span>Daily Targets</span>'
    +'<span class="wl-count">'+(t.auto?"auto":"set by athlete")+'</span></div>'
    +'<div class="wl-statrow" style="grid-template-columns:repeat(4,1fr)">'
    +cell("Calories",t.cal,"")+cell("Protein",t.protein,"g")
    +cell("Carbs",t.carbs,"g")+cell("Fat",t.fat,"g")
    +'</div></div>';}
/* the Daily Totals table, one row per day — cell text and coloring classes are
   pre-computed upstream with view_summary's own formatting and gcol rules */
function srDailyHTML(inp){
  var dl=inp.daily;if(!dl)return "";
  var h='<div class="wl-card" style="padding:14px 12px"><div class="wl-card-head" style="padding:0 4px"><span>Daily Totals</span>'+(dl.label?'<span class="wl-count">'+srEsc(dl.label)+'</span>':'')+'</div>';
  h+='<table class="wl-byday-grid"><thead><tr><th>Day</th><th>Sleep</th><th>Wt</th><th>Steps</th><th>Cal</th><th>P</th><th>F</th><th>C</th></tr></thead><tbody>';
  (dl.rows||[]).forEach(function(r){
    h+='<tr><td>'+srEsc(r.dow)+'</td>';
    (r.cells||[]).forEach(function(c){h+='<td class="'+srEsc(c.cls||"")+'">'+(c.d!=null?srEsc(c.d):'<span class="mut">–</span>')+'</td>';});
    h+='</tr>';});
  return h+'</tbody></table></div>';}
/* one card per lifting session: day chip, duration · session RPE · total lifted,
   then each exercise with its progression chip and set grid, then the note */
/* Cardio leads the workouts section (Owner, 2026-08-03), and unlike the weekly
   zone-2+ goal this lists EVERY session whatever its zone — the coach wants the
   whole picture, not just what counts toward a target. */
function srCardioHTML(inp){
  var list=inp.cardio||[];
  if(!list.length)return '<div class="wl-card"><div class="wl-card-head"><span>Cardio</span></div><div class="wl-hint" style="margin-top:0">No cardio logged this week.</div></div>';
  var h='<div class="wl-card"><div class="wl-card-head"><span>Cardio</span><span class="wl-count">'+srInt(list.length)+'</span></div>';
  h+='<div class="cd-row cd-hd"><span>Day</span><span>Type</span><span>Zone</span><span>Time</span><span>Cals</span></div>';
  list.forEach(function(c){
    h+='<div class="cd-row">'+
       '<span>'+srEsc(c.dayLabel)+'</span>'+
       '<span class="cd-ty">'+srEsc(c.type)+'</span>'+
       '<span>'+(c.zone!=null?'Z'+srInt(c.zone):SRDASH)+'</span>'+
       '<span>'+(c.mins!=null?srInt(c.mins)+' min':SRDASH)+'</span>'+
       '<span>'+(c.cal!=null?srInt(c.cal):SRDASH)+'</span></div>';
    if(c.hr!=null||c.hrMax!=null)h+='<div class="cd-note">'+(c.hr!=null?'avg HR '+srInt(c.hr):'')+(c.hrMax!=null?(c.hr!=null?' &middot; ':'')+'peak '+srInt(c.hrMax):'')+'</div>';
    if(c.zones)h+=srZonesHTML(c.zones);
    if(c.note)h+='<div class="cd-note">'+srEsc(c.note)+'</div>';});
  return h+'</div>';}
/* The WHOOP heart-rate zone split for one activity. The exported report is a
   standalone file with its own CSS, so this draws with inline styles rather
   than reaching for the app's classes. */
var SRZC=["#5A6474","#7C93F5","#5CD6A0","#F5B544","#F2874B","#F26D5B"];
/* WHOOP's zones are 1-5 on heart-rate reserve; the API's sixth bucket is time
   BELOW zone 1 — un-zoned, i.e. rest between sets. Named, not numbered. */
var SRZL=["Rest","Z1","Z2","Z3","Z4","Z5"];
function srZonesHTML(z){
  if(!z||!z.length)return "";
  var tot=0;for(var i=0;i<z.length;i++)tot+=(z[i]||0);
  if(!tot)return "";
  /* uses the report's OWN css variables — hardcoding light-theme colours here
     rendered the minute figures near-invisible against the dark report card */
  var work=tot-(z[0]||0);
  var h='<div style="margin:9px 0 4px"><div style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);margin-bottom:5px">Heart-rate zones &middot; '+srInt(work)+' min working of '+srInt(tot)+'</div>';
  h+='<div style="display:flex;height:12px;border-radius:6px;overflow:hidden;background:var(--bg2);border:1px solid var(--line)">';
  z.forEach(function(m,i){if(!m)return;h+='<span style="display:block;height:100%;width:'+(m/tot*100).toFixed(2)+'%;background:'+SRZC[i]+'"></span>';});
  h+='</div><div style="display:flex;flex-wrap:wrap;gap:3px 11px;margin-top:7px">';
  z.forEach(function(m,i){if(!m)return;
    h+='<span style="display:inline-flex;align-items:center;gap:4px;font-size:10.5px;color:var(--muted);font-family:var(--mono)"><i style="width:8px;height:8px;border-radius:2px;background:'+SRZC[i]+';display:inline-block"></i>'+SRZL[i]+' <b style="color:var(--text)">'+m+'m</b></span>';});
  return h+'</div></div>';
}
function srWorkoutsHTML(inp){
  var h='<div class="secLbl">This week&rsquo;s workouts</div>';
  h+=srCardioHTML(inp);
  h+='<div class="secLbl" style="margin-top:16px">Weightlifting</div>';
  if(!(inp.sessions||[]).length)return h+'<div class="wl-card"><div class="wl-hint" style="margin-top:0">No lifting sessions logged this week.</div></div>';
  inp.sessions.forEach(function(s){
    h+='<div class="wl-card"><div class="wl-card-head"><span>'+srEsc(s.name)+'</span><span class="wl-count">'+srEsc(s.dateLabel)+'</span></div>';
    var meta=[];
    if(s.mins!=null)meta.push(srInt(s.mins)+' min');
    if(s.rpe!=null)meta.push('session RPE '+srR1(s.rpe));
    if(s.ton)meta.push(srInt(s.ton)+' '+srEsc(inp.units)+' lifted');
    if(s.hr!=null)meta.push('avg HR '+srInt(s.hr)+(s.hrMax!=null?' / peak '+srInt(s.hrMax):''));
    else if(s.hrMax!=null)meta.push('peak HR '+srInt(s.hrMax));
    if(s.cal!=null)meta.push(srInt(s.cal)+' cal');
    if(meta.length)h+='<div class="sess-meta">'+meta.join(' &middot; ')+'</div>';
    h+=srZonesHTML(s.zones);
    (s.ex||[]).forEach(function(x,xi){h+=srExerciseHTML(x,xi===0);});
    if(s.note)h+='<div class="sess-note"><em>Note</em>'+srEsc(s.note)+'</div>';
    h+='</div>';});
  return h;}
var SRMARK='<svg viewBox="0 0 17 20" aria-hidden="true" style="width:16px;height:19px;flex:none"><rect x="0" y="11" width="4" height="8" rx="1" fill="#6E7BE8"/><rect x="6" y="8" width="4" height="11" rx="1" fill="#9AA4F0"/><rect x="12" y="1" width="4" height="18" rx="1" fill="#F5B944"/></svg>';
var SRCSS=[
":root{--bg:#0B0F16;--bg2:#10151E;--card:#151B26;--card2:#1B2230;--line:#222A38;--line2:#2E3949;--text:#EDF1F7;--muted:#8892A4;--faint:#5F6B7E;--accent:#F5B944;--accent-dim:rgba(245,181,68,.14);--good:#5CD6A0;--bad:#F26D5B;--sans:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,system-ui,sans-serif;--mono:ui-monospace,'SF Mono','Cascadia Code','Segoe UI Mono',Menlo,Consolas,monospace}",
"*{box-sizing:border-box}html,body{margin:0;padding:0}",
"body{background:var(--bg);color:var(--text);font-family:var(--sans);font-size:16px;line-height:1.45;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%}",
"p,h1,h2,h3{margin:0}",
".num{font-family:var(--mono);font-variant-numeric:tabular-nums;font-feature-settings:'tnum' 1}",
".pg{max-width:430px;margin:0 auto;padding:20px 14px 44px;display:flex;flex-direction:column;gap:14px}",
".hdr{padding:2px 2px 4px}",
".brandrow{display:flex;align-items:center;gap:8px}",
".brandword{font-weight:900;letter-spacing:.2em;font-size:16px;color:var(--accent)}",
".stamp{margin-left:auto;font-family:var(--mono);font-size:10px;letter-spacing:.07em;color:var(--faint);text-transform:uppercase}",
".hdr h1{font-size:26px;font-weight:800;letter-spacing:-.01em;margin-top:14px}",
".ident{display:flex;flex-wrap:wrap;gap:5px 9px;align-items:center;font-size:13px;color:var(--muted);font-weight:600;margin-top:7px}",
".ident .sep{color:var(--line2)}",
".plan{font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;background:var(--accent-dim);color:var(--accent);padding:3px 9px;border-radius:6px}",
".wl-card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px}",
".wl-card-head{display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:16px;margin-bottom:12px}",
".wl-count{font-family:var(--mono);font-size:11px;color:var(--muted);background:var(--bg2);padding:3px 9px;border-radius:7px;font-weight:500;letter-spacing:.02em;text-transform:uppercase}",
".wl-hint{font-size:12px;color:var(--muted);line-height:1.45;margin-top:10px}",
".ph-row{display:grid;gap:9px}",
".bc-row{display:grid;grid-template-columns:1fr 96px 62px 66px;gap:8px;align-items:baseline;padding:7px 0;border-top:1px solid var(--line)}",
".bc-row:first-of-type{border-top:0}",
".bc-k{font-size:12.5px;color:var(--muted);font-weight:700}",
".bc-v{font-family:var(--mono);font-size:14px;color:var(--text);font-weight:700;text-align:right}",
".bc-v em{font-style:normal;font-size:11px;color:var(--faint);font-weight:600}",
".bc-chg{font-family:var(--mono);font-variant-numeric:tabular-nums;font-size:11.5px;font-weight:800;color:var(--muted);text-align:right}",
".bc-chg.flat{color:var(--faint);font-weight:600}",
".bc-chg.good{color:#22c55e}",
".bc-chg.bad{color:#ef4444}",
".bc-d{font-size:10.5px;color:var(--faint);text-align:right;white-space:nowrap}",
".cd-row{display:grid;grid-template-columns:1.1fr 2fr .7fr 1fr .8fr;gap:8px;align-items:baseline;padding:7px 0;border-top:1px solid var(--line);font-size:12.5px}",
".cd-row span:first-child{color:var(--muted);font-weight:700}",
".cd-row .cd-ty{color:var(--text);font-weight:700}",
".cd-hd{border-top:0;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);font-weight:800}",
".cd-hd span{color:var(--faint)!important;font-weight:800!important}",
".cd-note{font-size:11.5px;color:var(--muted);padding:0 0 7px;font-style:italic}",
".ph-slot{background:var(--bg2);border:1px solid var(--line);border-radius:12px;overflow:hidden;position:relative;aspect-ratio:3/4;display:flex;align-items:center;justify-content:center}",
/* contain, never cover: a cropped progress photo is a useless progress photo —
   the coach is comparing outlines week to week (Owner, 2026-08-03). */
".ph-slot img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block}",
".ph-slot svg{width:58%;height:auto;display:block}",
".ph-pose{position:absolute;left:0;right:0;bottom:0;text-align:center;font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);background:rgba(11,15,22,.72);padding:4px 0}",
".ph-slot.empty{border-style:dashed;border-color:var(--line2)}",
".ph-slot.empty .ph-pose{background:none;color:var(--faint)}",
".wl-hero{background:linear-gradient(150deg,var(--card2),var(--card))}",
".wl-hero-top{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px}",
".wl-mini-label{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--faint);font-weight:600}",
".wl-bignum{font-family:var(--mono);font-variant-numeric:tabular-nums;font-size:42px;font-weight:600;line-height:1.1;letter-spacing:-.02em;margin-top:6px}",
".wl-unit{font-size:16px;color:var(--muted);margin-left:6px;font-weight:500;font-family:var(--sans)}",
".wl-change{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;font-family:var(--mono);padding:7px 12px;border-radius:999px;margin-top:4px;color:var(--muted);background:var(--bg2)}",
".wl-change.good{color:var(--good);background:rgba(92,214,160,.12)}",
".wl-change.bad{color:var(--bad);background:rgba(242,109,91,.12)}",
".wl-hero-sub{font-size:12.5px;color:var(--muted);margin-top:4px}",
".wl-cichips{display:flex;flex-wrap:wrap;gap:7px}",
".wl-cichip{font-size:12px;font-weight:700;border-radius:9px;padding:7px 0;width:44px;text-align:center;border:1px solid var(--line);color:var(--muted);font-family:var(--sans)}",
".wl-cichip.ok{color:var(--good);border-color:var(--good);background:rgba(92,214,160,.12)}",
".wl-cichip.prog{color:var(--text);border-color:var(--text)}",
".wl-cichip.part{color:var(--accent);border-color:var(--accent);background:rgba(245,181,68,.12)}",
".wl-cichip.miss{color:var(--bad);border-color:var(--bad);background:rgba(242,109,91,.12)}",
".wl-cichip.fut{color:var(--faint);opacity:.5}",
".wl-legend{display:flex;flex-wrap:wrap;gap:14px;margin-top:12px;justify-content:center}",
".wl-legend span{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--muted)}",
".wl-legend i{width:9px;height:9px;border-radius:50%;display:inline-block}",
".wl-statrow{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}",
".wl-stat{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:11px 6px;text-align:center}",
".wl-stat-label{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--faint);font-weight:600}",
".wl-stat-val{font-family:var(--mono);font-variant-numeric:tabular-nums;font-size:16px;font-weight:600;margin-top:4px}",
".wl-stat-val.good{color:var(--good)}",
".wl-stat-val.warn{color:var(--accent)}",
".wl-stat-val.bad{color:var(--bad)}",
".wl-stat-sub{font-size:10px;color:var(--faint);margin-top:3px}",
".wl-goalrow{margin:12px 0}",
".wl-goalrow:first-of-type{margin-top:2px}",
".wl-goalrow:last-of-type{margin-bottom:2px}",
".wl-goalrow-top{display:flex;justify-content:space-between;align-items:baseline;font-size:14px;margin-bottom:5px}",
".wl-goalrow-val{color:var(--faint);font-weight:700;font-size:13px;font-family:var(--mono);font-variant-numeric:tabular-nums}",
".wl-goalrow-val.done{color:var(--good)}",
".wl-goalbar{height:7px;background:var(--bg2);border-radius:4px;overflow:hidden}",
".wl-goalbar-fill{height:100%;background:var(--accent);border-radius:4px}",
".wl-goalbar-fill.done{background:var(--good)}",
".wl-byday-grid{width:100%;border-collapse:collapse;font-family:var(--mono);font-variant-numeric:tabular-nums}",
".wl-byday-grid th,.wl-byday-grid td{padding:6px 2px;text-align:right;font-size:11px;white-space:nowrap}",
".wl-byday-grid th{font-family:var(--sans);font-size:9px;text-transform:uppercase;letter-spacing:.03em;color:var(--faint);font-weight:700;border-bottom:1px solid var(--line2)}",
".wl-byday-grid td:first-child,.wl-byday-grid th:first-child{text-align:left;font-family:var(--sans);font-weight:700;font-size:11.5px;color:var(--text)}",
".wl-byday-grid tbody tr{border-bottom:1px solid var(--line)}",
".wl-byday-grid tbody tr:last-child{border-bottom:none}",
".wl-byday-grid td.good{color:var(--good)}",
".wl-byday-grid td.warn{color:var(--accent)}",
".wl-byday-grid td.bad{color:var(--bad)}",
".mut{color:var(--faint)}",
".ci-q{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);margin-top:14px}",
".ci-q:first-of-type{margin-top:2px}",
".ci-a{font-size:14.5px;line-height:1.5;color:var(--text);margin-top:5px;white-space:pre-wrap;overflow-wrap:anywhere}",
".fgrid{display:grid;grid-template-columns:74px 1fr;gap:6px 8px;align-items:center}",
".fgrid .fk{font-size:11.5px;font-weight:700;color:var(--muted)}",
".fdow{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}",
".fdow span{text-align:center;font-size:9.5px;font-weight:700;color:var(--faint);letter-spacing:.4px}",
".fcells{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}",
".fcell{height:26px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:11px;font-weight:800;color:#0F1218}",
".fcell.na{background:var(--bg2);color:var(--faint);font-weight:600}",
".sess-meta{font-size:12.5px;color:var(--muted);margin:-6px 0 4px;font-family:var(--mono);font-variant-numeric:tabular-nums}",
".ex{margin-top:14px}",
".ex:first-of-type{margin-top:8px}",
".ex-name{font-weight:700;font-size:14.5px;overflow-wrap:anywhere}",
".ex-scheme{font-family:var(--mono);font-size:11px;color:var(--faint);margin-top:2px}",
".setgrid{display:grid;grid-template-columns:24px 1fr 52px 30px 30px;align-items:center;gap:10px}",
".sethead{margin-top:4px;margin-bottom:0}",
".sethead span{font-size:9px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--faint)}",
".setrow{padding:5px 0;border-top:1px solid var(--line)}",
".setrow.pad{margin-top:7px}",
".set-n{font-family:var(--mono);font-size:11px;color:var(--faint)}",
".set-wr{font-family:var(--mono);font-variant-numeric:tabular-nums;font-size:13px;color:var(--text);letter-spacing:.02em}",
".wr-x{padding:0 6px;color:var(--faint);font-weight:400}",
".set-tgt{font-family:var(--mono);font-size:11.5px;color:var(--muted);text-align:center}",
".set-rng{text-align:center}",
".set-rir{font-family:var(--mono);font-size:12px;color:var(--muted);text-align:right;padding-right:2px}",
".tgt{display:inline-flex;align-items:center;justify-content:center}",
".ptag{display:inline-flex;align-items:center;font-size:9.5px;line-height:1;font-weight:800;letter-spacing:.04em;padding:4px 7px;border-radius:6px;color:var(--muted);border:1px solid var(--line);margin-right:7px;vertical-align:1px}",
".ptag.rpt{color:var(--accent);border-color:var(--accent)}",
".pr{display:inline-block;font-family:var(--sans);font-size:9px;font-weight:800;letter-spacing:.1em;background:rgba(92,214,160,.16);color:var(--good);padding:1px 6px;border-radius:5px;margin-left:6px;vertical-align:1px}",
".dag{color:var(--faint);margin-left:4px}",
".sess-note{font-size:13px;color:var(--muted);padding-top:10px;margin-top:12px;border-top:1px solid var(--line)}",
".sess-note em{font-style:normal;font-size:9.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);margin-right:7px}",
".secLbl{font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);padding:8px 2px 0}",
".foot{font-size:12px;line-height:1.6;color:var(--faint);padding:6px 2px 0}",
"@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.wl-card,.wl-stat{break-inside:avoid;page-break-inside:avoid}}"
];
function srReportHTML(inp){
  var who=inp.who||"Athlete";
  var h='<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n';
  h+='<title>'+srEsc("Compound — Progress report — "+who+" — "+(inp.range||""))+'</title>\n';
  h+='<meta name="viewport" content="width=device-width, initial-scale=1">\n';
  h+='<style>'+SRCSS.join("")+'</style>\n</head>\n<body>\n<div class="pg">\n';
  h+='<div class="hdr"><div class="brandrow">'+SRMARK+'<span class="brandword">COMPOUND</span>'+
    '<span class="stamp">Progress report</span></div>'+
    '<h1>'+srEsc(inp.weekTitle||"This week")+'</h1>'+
    '<div class="ident"><span>'+srEsc(who)+'</span><span class="sep">·</span>'+
    '<span class="plan">'+srEsc(inp.plan||"")+'</span><span class="sep">·</span>'+
    '<span class="num" style="font-weight:500">'+srEsc(inp.range||"")+'</span>'+
    (inp.exported?('<span class="sep">·</span><span class="num" style="font-weight:500;color:var(--faint)">exported '+srEsc(inp.exported)+'</span>'):'')+
    '</div></div>\n';
  h+=srPhotosHTML(inp.photos)+"\n";
  h+=srHeroHTML(inp)+"\n";
  h+=srWeightChartHTML(inp)+"\n";
  h+=srCheckinHTML(inp)+"\n";
  h+=srBodyCompHTML(inp)+"\n";
  h+=srLbmHTML(inp)+"\n";
  h+=srChipsHTML(inp)+"\n";
  h+=srFeelHTML(inp)+"\n";
  h+=srTotalsHTML(inp)+"\n";
  h+=srMacrosHTML(inp)+"\n";
  h+=srAvgsHTML(inp)+"\n";
  h+=srTargetsHTML(inp)+"\n";
  h+=srDailyHTML(inp)+"\n";
  h+=srWorkoutsHTML(inp)+"\n";
  h+='<div class="foot"><p>&ldquo;Range&rdquo; shows where each set landed against its rep target &middot; RIR is reps left in the tank when the set ended.</p>'+
    (inp.assumed?'<p style="margin-top:6px">&dagger; target read from the routine as it stands today &mdash; the session predates stored targets.</p>':'')+
    '<p style="margin-top:6px">COMPOUND · exported '+srEsc(inp.today||"")+' · '+srEsc(who)+' · weights in '+srEsc(inp.units||"lbs")+'</p></div>\n';
  return h+'</div>\n</body>\n</html>\n';}
/* SR-VIEW-END */