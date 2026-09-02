/* ---- WHOOP ------------------------------------------------------------------
   Compound is a static page, so it cannot hold an OAuth secret or call WHOOP
   directly. compound-whoop (on the VPS, tailnet-only) holds the credentials and
   hands back already-normalised JSON; this file is only the client and the
   fill rules.

   WHY THE APP PULLS RATHER THAN THE SERVER PUSHING. The Apple Health bridge
   fills the app through a server-written mailbox on the PocketBase record. That
   would work here too, but it needs a PocketBase credential for the service
   (still Owner-gated) and it makes the server a SECOND writer against the M10
   single-writer lease. Pulling keeps the app the only thing that ever writes.

   THE STANDING RULE (Owner, 2026-09-01): WHOOP NEVER OVERWRITES A TYPED VALUE.
   That is guaranteed structurally, not by care: WHOOP's own numbers live in
   their own store (state.whoop), so they physically cannot displace anything
   the athlete entered. The single exception is sleep — which already has a home
   wired to the goal, the day-completeness gate and the coach snapshot — and
   even there it is written ONLY into a blank, never over a number, and never
   over a day deliberately skipped. Edit a filled figure once and it stops being
   blank, so it is never touched again. */

var WHOOP_DEFAULT_BASE = "https://compound-1.tail8b20e0.ts.net:8451";
function whoopBase(){var b=(state.settings.whoopBase||"").trim();return b||WHOOP_DEFAULT_BASE;}
function whoopOn(){return !!state.settings.whoopOn;}
function whoopDay(iso){return (state.whoop||{})[iso]||null;}

/* Days to ask for. Enough to backfill after a week away, small enough that a
   sync is one quick call — WHOOP allows 100/min, so this is never the limit. */
function whoopWindow(){
  var to=todayISO();
  var n=num(state.settings.whoopDays);if(n==null||!(n>0))n=14;
  var from=new Date(Date.parse(to+"T00:00:00Z")-Math.min(n,60)*864e5).toISOString().slice(0,10);
  return {from:from,to:to};
}

function whoopFetch(path,opts,cb){
  var url=whoopBase()+path;
  var done=false;var t=setTimeout(function(){if(done)return;done=true;cb({ok:false,error:"timed out — is the tailnet up?"});},15000);
  try{
    fetch(url,opts||{}).then(function(r){return r.json().catch(function(){return {ok:false,error:"bad response ("+r.status+")"};});})
      .then(function(j){if(done)return;done=true;clearTimeout(t);cb(j);})
      .catch(function(e){if(done)return;done=true;clearTimeout(t);cb({ok:false,error:(e&&e.message)||"could not reach the WHOOP service"});});
  }catch(e){if(!done){done=true;clearTimeout(t);cb({ok:false,error:"could not reach the WHOOP service"});}}
}

function whoopCheck(cb){whoopFetch("/whoop/status",null,cb);}

/* ---- applying a sync ------------------------------------------------------ */

/* Returns a plain-language account of what changed, so the settings screen can
   say what happened rather than just "done". */
function whoopApply(data){
  var days=(data&&data.days)||{};
  state.whoop=state.whoop||{};
  var nd=0,nsleep=0,skipped=0;
  Object.keys(days).forEach(function(d){
    var row=days[d];if(!row)return;
    if(!state.whoop[d])nd++;
    state.whoop[d]=row;
    /* Sleep is the one metric with an existing home. Fill a BLANK only. */
    if(row.sleepMin>0){
      var cur=state.sleep&&state.sleep[d];
      var skippedDay=((state.skips||{})[d]||{}).sleep;
      if(skippedDay){skipped++;}
      else if(cur==null||cur===""||!(num(cur)>0)){state.sleep[d]=row.sleepMin;nsleep++;}
    }
  });
  state.settings.whoopLast=Date.now();
  if(data&&data.fake)state.settings.whoopFake=true;else delete state.settings.whoopFake;
  /* Max HR is a value WHOOP STORES and recalculates as fitness changes (its own
     spec calls it "the max heart rate WHOOP calculated"), so it tracks rather
     than being adopted once and frozen. The change is applied, then announced —
     it moves every zone boundary, so it must never happen invisibly.
     Resting HR is deliberately NOT written: WHOOP exposes no stored value, only
     a daily reading, so there is nothing authoritative to defer to. The profile
     field is offered WHOOP's 30-day average instead (whoopRestingAvg). */
  var mh=data&&data.body&&data.body.max_heart_rate;
  if(mh){
    var cur=num(state.settings.maxHR);
    if(cur==null){state.settings.maxHR=String(mh);}
    else if(cur!==mh&&state.settings.whoopMaxHR!==false){
      state.settings.maxHR=String(mh);
      state.whoopNotice={kind:"maxhr",from:cur,to:mh,at:Date.now()};
    }
  }
  save();
  return {days:nd,sleep:nsleep,skipped:skipped,total:Object.keys(days).length};
}

function whoopSync(cb){
  var w=whoopWindow();
  whoopFetch("/whoop/sync?from="+w.from+"&to="+w.to,null,function(r){
    if(!r||!r.ok)return cb(r||{ok:false,error:"no response"});
    state.whoopWorkouts=(r.workouts||[]).slice(-120);   /* enough to match recent sessions */
    var n=whoopApply(r);
    /* "always import" brings deliberate WHOOP workouts across without a tap.
       Lifting is never auto-imported — that record belongs to the routine. */
    if(whoopCardioMode()==="auto"){var imp=whoopImportAllPending();if(imp)n.cardio=imp;}
    cb({ok:true,applied:n,fake:!!r.fake});
  });
}

/* ---- matching a WHOOP workout to a Compound session -----------------------
   WHOOP records the lift independently, so the two have to be paired by time.
   Overlap, not proximity: a session that ran 18:30–19:52 and a WHOOP workout
   that ran 18:33–19:49 are obviously the same thing, while yesterday's lift at
   the same clock time is not. Requires a real overlap, so no match is returned
   rather than a wrong one. */
function whoopMatchWorkout(startTs,endTs,dateISO){
  var list=state.whoopWorkouts||[];if(!list.length)return null;
  if(!startTs||!endTs){
    /* No timer window (a quick log). Fall back to the day, and only when that
       day has exactly one candidate — otherwise we would be guessing. */
    var sameDay=list.filter(function(w){return w.date===dateISO;});
    return sameDay.length===1?sameDay[0]:null;
  }
  var best=null,bestOv=0;
  list.forEach(function(w){
    var s=Date.parse(w.start),e=Date.parse(w.end);
    if(!(s>0)||!(e>0))return;
    var ov=Math.min(endTs,e)-Math.max(startTs,s);
    if(ov>bestOv){bestOv=ov;best=w;}
  });
  /* at least five minutes of genuine overlap */
  return bestOv>=300000?best:null;
}

/* Fill the finish sheet's blanks from the matched WHOOP workout. Never touches
   a field the athlete has already typed into. */
function whoopFillFinish(w){
  if(!whoopOn()||!w||!w.finishForm)return null;
  var b=(typeof woBuckets==="function")?woBuckets():null;
  var end=Date.now();
  var start=w.startTs||(b?end-b.total:null);
  var m=whoopMatchWorkout(start,end,w.date);
  if(!m)return null;
  var ff=w.finishForm,filled=[];
  function blank(k){var v=ff[k];return v==null||String(v).trim()==="";}
  if(m.avgHr!=null&&blank("hr")){ff.hr=String(m.avgHr);filled.push("avg HR");}
  if(m.maxHr!=null&&blank("hrMax")){ff.hrMax=String(m.maxHr);filled.push("peak HR");}
  if(m.cal!=null&&blank("cal")){ff.cal=String(m.cal);filled.push("calories");}
  if(!filled.length)return null;
  w.whoopFill={id:m.id,fields:filled,strain:m.strain,pct:m.pctRecorded,zones:m.zones||null};
  if(m.zones)w.whoopZones=m.zones;      /* carried onto the saved session */
  return w.whoopFill;
}

/* ---- display -------------------------------------------------------------- */

function whoopRecoveryTone(v){return v==null?"":(v>=67?"good":(v>=34?"mid":"low"));}
function whoopAgo(ts){
  if(!ts)return "never";
  var m=Math.round((Date.now()-ts)/60000);
  if(m<1)return "just now";if(m<60)return m+" min ago";
  var h=Math.round(m/60);if(h<24)return h+" hr ago";
  return Math.round(h/24)+" d ago";
}

/* The daily card: recovery / HRV / resting HR / strain for a given day. Shown
   only when WHOOP actually has that day. */
function whoopDayCardHTML(iso){
  if(!whoopOn())return "";
  var d=whoopDay(iso);if(!d)return "";
  var bits=[];
  if(d.recovery!=null)bits.push('<div class="wl-wh-cell"><span class="wl-wh-k">Recovery</span><b class="wl-wh-v '+whoopRecoveryTone(d.recovery)+'">'+d.recovery+'%</b></div>');
  if(d.strain!=null)bits.push('<div class="wl-wh-cell"><span class="wl-wh-k">Day strain</span><b class="wl-wh-v">'+d.strain+'</b></div>');
  if(d.hrv!=null)bits.push('<div class="wl-wh-cell"><span class="wl-wh-k">HRV</span><b class="wl-wh-v">'+d.hrv+'<em>ms</em></b></div>');
  if(d.restingHr!=null)bits.push('<div class="wl-wh-cell"><span class="wl-wh-k">Resting HR</span><b class="wl-wh-v">'+d.restingHr+'<em>bpm</em></b></div>');
  if(!bits.length)return "";
  var note=d.calibrating?'<div class="wl-hint" style="margin-top:8px">WHOOP is still calibrating — it says this recovery figure isn’t reliable yet.</div>':"";
  return '<div class="wl-card"><div class="wl-card-head"><span>'+I.trend.replace("<svg","<svg width=15 height=15")+' WHOOP</span></div><div class="wl-wh-grid">'+bits.join("")+'</div>'+note+'</div>';
}

/* ---- settings page -------------------------------------------------------- */

function whoopSettingsHTML(){
  var st=state.whoopStatus||null;
  var on=whoopOn();
  var last=state.settings.whoopLast;
  var nDays=Object.keys(state.whoop||{}).length;
  var h=whoopNoticeHTML();
  h+='<div class="wl-card">';
  h+='<div class="wl-card-head"><span>WHOOP</span></div>';
  h+='<div class="wl-hint" style="margin-bottom:10px">Pulls recovery, HRV, resting heart rate, day strain, sleep, and your lift’s heart rate and calories. It never overwrites a number you typed — it only fills blanks.</div>';
  h+='<div class="wl-glp-list">'+glpToggleRow(I.trend,"Use WHOOP",(on?"Filling blanks from your strap":"Off"),"whoop:toggle",on,false)+'</div>';
  if(on){
    h+='<div class="wl-wh-status">';
    if(st===null)h+='<span class="wl-hint">Checking…</span>';
    else if(!st.ok)h+='<span class="wl-wh-bad">Can’t reach the WHOOP service — '+esc(st.error||"no answer")+'</span>';
    else if(st.fake)h+='<span class="wl-wh-warn">Demo data — no WHOOP credentials on the server yet. Everything below is wired and working; paste real credentials to go live.</span>';
    else if(!st.connected)h+='<span class="wl-wh-warn">Not linked to your WHOOP account yet.</span>';
    else h+='<span class="wl-wh-ok">Connected'+(st.connectedAt?" · since "+fmtShort(new Date(st.connectedAt)):"")+'</span>';
    h+='</div>';
    h+='<div class="wl-hint" style="margin-top:8px">Last sync: <b>'+whoopAgo(last)+'</b>'+(nDays?' · '+nDays+' day'+(nDays===1?"":"s")+' stored':"")+'</div>';
    h+='<div style="display:flex;gap:8px;margin-top:12px">';
    h+='<button class="wl-btn wl-btn-primary" style="flex:1" data-act="whoop:sync">Sync now</button>';
    if(st&&st.ok&&!st.fake&&!st.connected)h+='<button class="wl-btn wl-btn-ghost" style="flex:1" data-act="whoop:connect">Link account</button>';
    else if(st&&st.ok&&st.connected&&!st.fake)h+='<button class="wl-btn wl-btn-ghost" style="flex:1" data-act="whoop:disconnect">Unlink</button>';
    h+='</div>';
    var _cm=whoopCardioMode();
    h+='<div class="wl-cf-label" style="margin:14px 0 6px">Cardio WHOOP records</div>'+
       '<div class="wl-seg2" style="display:grid;grid-template-columns:1fr 1fr 1fr">'+
       ['off','ask','auto'].map(function(m){return '<button class="wl-seg2btn'+(_cm===m?" on":"")+'" data-act="whoop:cardiomode" data-m="'+m+'">'+(m==="off"?"Ignore":m==="ask"?"Ask me":"Always add")+'</button>';}).join("")+
       '</div><div class="wl-hint" style="margin-top:6px">Runs, walks and rides you start on WHOOP become cardio sessions here. Weightlifting is never imported — your Compound routine is the record, and WHOOP just supplies its heart rate and zones.</div>';
    h+=whoopRestingOfferHTML();
    h+='<label class="wl-field wl-field-full" style="margin-top:12px"><span>Days to pull each sync</span><input class="wl-num" data-set="whoopDays" type="text" inputmode="numeric" value="'+esc(state.settings.whoopDays!=null?state.settings.whoopDays:"14")+'" placeholder="14"></label>';
    h+='<label class="wl-field wl-field-full" style="margin-top:8px"><span>Service address <em>leave blank for the default</em></span><input data-set="whoopBase" type="text" autocapitalize="off" autocorrect="off" spellcheck="false" value="'+esc(state.settings.whoopBase||"")+'" placeholder="'+esc(WHOOP_DEFAULT_BASE)+'"></label>';
  }
  return h+'</div>';
}

/* ---- charts ----------------------------------------------------------------
   One generic renderer for every WHOOP series, following the app's existing
   chart idiom exactly (same viewBox, padding, CH palette, and the same axis
   labelling rules as buildSleepChart/buildBars) so these sit beside Steps,
   Calories and Sleep without looking imported from somewhere else.
   Series are bucketed by bucketValues(), so they follow the period picker
   already on the Progress screen rather than inventing a second one. */
function whoopSeries(key){
  var m={};var w=state.whoop||{};
  Object.keys(w).forEach(function(d){var v=w[d]&&w[d][key];if(v!=null&&v!=="")m[d]=v;});
  return m;
}
function whoopChartSVG(bk,o){
  o=o||{};
  var n=bk.length;if(!n)return '<div class="wl-empty">Nothing from WHOOP for this period.</div>';
  var logged=bk.filter(function(b){return b.value!=null;});
  if(!logged.length)return '<div class="wl-empty">Nothing from WHOOP for this period.</div>';
  var W=340,H=176,padL=30,padR=8,padT=16,padB=32;
  var vals=logged.map(function(b){return b.value;});
  var lo=(o.min!=null)?o.min:Math.min.apply(null,vals);
  var hi=(o.max!=null)?o.max:Math.max.apply(null,vals);
  if(o.min==null){lo=Math.max(0,lo-(hi-lo)*0.18||lo*0.9);}          /* breathing room, never below 0 */
  if(o.max==null){hi=hi+(hi-lo)*0.18||hi*1.1;}
  if(!(hi>lo))hi=lo+1;
  var plotW=W-padL-padR;
  function sy(v){return (H-padB)-((v-lo)/(hi-lo))*(H-padT-padB);}
  function cx(i){return padL+(i+0.5)*(plotW/n);}
  var s='<svg class="wl-chart" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" style="height:'+H+'px">';
  /* WHOOP's own recovery bands, drawn faintly so the number has context */
  (o.bands||[]).forEach(function(b){
    var y0=sy(Math.min(b.to,hi)),y1=sy(Math.max(b.from,lo));
    if(y1>y0)s+='<rect x="'+padL+'" y="'+y0.toFixed(1)+'" width="'+plotW+'" height="'+(y1-y0).toFixed(1)+'" fill="'+b.color+'" opacity="0.07"/>';
  });
  [0,0.5,1].forEach(function(fr){
    var yv=lo+(hi-lo)*fr,y=sy(yv);
    s+='<line x1="'+padL+'" y1="'+y.toFixed(1)+'" x2="'+(W-padR)+'" y2="'+y.toFixed(1)+'" stroke="'+CH.grid+'"/>'+
       '<text x="'+(padL-4)+'" y="'+(y+3).toFixed(1)+'" fill="'+CH.axis+'" font-size="9" text-anchor="end">'+(o.fmt?o.fmt(yv):Math.round(yv))+'</text>';
  });
  var col=o.color||CH.reg;
  if(o.kind==="bar"){
    var bw=Math.min(18,plotW/n*0.62);
    logged.forEach(function(b){
      var X=cx(bk.indexOf(b)),Y=sy(b.value),base=sy(lo);
      var c=o.colorFor?o.colorFor(b.value):col;
      s+='<rect x="'+(X-bw/2).toFixed(1)+'" y="'+Y.toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+Math.max(1,base-Y).toFixed(1)+'" rx="2.5" fill="'+c+'"/>';
    });
  }else{
    var path="";logged.forEach(function(b,k){path+=(k?"L":"M")+cx(bk.indexOf(b)).toFixed(1)+" "+sy(b.value).toFixed(1)+" ";});
    s+='<path d="'+path+'" fill="none" stroke="'+col+'" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>';
    logged.forEach(function(b){
      var c=o.colorFor?o.colorFor(b.value):col;
      s+='<circle cx="'+cx(bk.indexOf(b)).toFixed(1)+'" cy="'+sy(b.value).toFixed(1)+'" r="3" fill="'+c+'"/>';
    });
  }
  var showLbl=n<=10;var every=n<=10?1:Math.ceil(n/6);
  bk.forEach(function(b,i){if(i%every===0||i===n-1){var X=cx(i).toFixed(1);
    if(b.month)s+='<text x="'+X+'" y="'+(H-9)+'" fill="'+CH.axis+'" font-size="9" text-anchor="middle">'+MONTHS3[b.date.getMonth()]+'</text>';
    else if(showLbl)s+='<text x="'+X+'" y="'+(H-16)+'" fill="'+CH.axis+'" font-size="9" text-anchor="middle">'+DAYS3[b.date.getDay()]+'</text><text x="'+X+'" y="'+(H-5)+'" fill="'+CH.axis+'" font-size="8.5" text-anchor="middle">'+b.date.getDate()+'</text>';
    else s+='<text x="'+X+'" y="'+(H-9)+'" fill="'+CH.axis+'" font-size="8.5" text-anchor="middle">'+(b.date.getMonth()+1)+'/'+b.date.getDate()+'</text>';
  }});
  return s+'</svg>';
}
/* WHOOP's published recovery bands */
var WH_GOOD="#5CD6A0",WH_MID="#F5B544",WH_LOW="#F26D5B",WH_BLUE="#7C93F5";
function whoopRecColor(v){return v>=67?WH_GOOD:(v>=34?WH_MID:WH_LOW);}

function whoopStatBlock(title,bk,avgTxt,svg){
  return '<div class="wl-substat"><div class="wl-substat-h"><span>'+title+'</span><span class="v">'+avgTxt+'</span></div>'+svg+'</div>';
}
function whoopChartsHTML(){
  if(!whoopOn())return "";
  var w=state.whoop||{};
  if(!Object.keys(w).length)return "";
  var open=state.whoopStatsOpen!==false;
  var h='<div class="wl-card"><button class="wl-collapse-head" data-act="whoopstats"><span>WHOOP</span><span class="wl-chevron'+(open?" open":"")+'">›</span></button>';
  if(open){
    function blk(title,key,opts,fmtAvg){
      var bk=bucketValues(whoopSeries(key));
      var a=bucketAvg(bk);
      if(a==null&&!bk.some(function(b){return b.value!=null;}))return "";
      return whoopStatBlock(title,bk,(a!=null?"avg "+fmtAvg(a):"—"),whoopChartSVG(bk,opts));
    }
    h+=blk("Recovery","recovery",
      {kind:"bar",min:0,max:100,colorFor:whoopRecColor,fmt:function(v){return Math.round(v)+"%";},
       bands:[{from:67,to:100,color:WH_GOOD},{from:34,to:67,color:WH_MID},{from:0,to:34,color:WH_LOW}]},
      function(a){return Math.round(a)+"%";});
    h+=blk("Day strain","strain",
      {kind:"bar",min:0,max:21,color:WH_BLUE,fmt:function(v){return (Math.round(v*10)/10).toString();}},
      function(a){return (Math.round(a*10)/10).toString();});
    h+=blk("HRV","hrv",{kind:"line",color:WH_BLUE,fmt:function(v){return Math.round(v);}},
      function(a){return Math.round(a)+" ms";});
    h+=blk("Resting heart rate","restingHr",{kind:"line",color:CH.avg,fmt:function(v){return Math.round(v);}},
      function(a){return Math.round(a)+" bpm";});
    h+=blk("Sleep performance","sleepPerf",
      {kind:"line",min:0,max:100,color:WH_GOOD,fmt:function(v){return Math.round(v)+"%";}},
      function(a){return Math.round(a)+"%";});
    h+=blk("Blood oxygen","spo2",{kind:"line",color:WH_BLUE,fmt:function(v){return (Math.round(v*10)/10);}},
      function(a){return (Math.round(a*10)/10)+"%";});
    h+=blk("Skin temperature","skinTempC",
      {kind:"line",color:WH_LOW,fmt:function(v){return (Math.round(v*10)/10);}},
      function(a){return (Math.round(a*10)/10)+"°C";});
    h+='<div class="wl-hint" style="margin-top:4px">From WHOOP. Days you didn’t wear it are gaps, not zeros.</div>';
  }
  return h+'</div>';
}

/* ---- automatic sync ---------------------------------------------------------
   A PWA cannot run in the background, so "automatic" means "the moment the app
   is looked at". Opening it, or returning to it after the phone was locked,
   pulls anything new. In practice that is the first glance of the morning —
   last night's sleep is filed before the day is even opened.
   Silent by design: no toast on success, because a sync that announces itself
   every single time you open the app is noise. Failures are silent too (the
   tailnet may simply be unreachable); the Settings screen is where you go to
   find out what happened. */
var WHOOP_AUTO_MIN=20;
function whoopAutoSync(){
  if(!whoopOn()||state.whoopSyncing)return;
  if(typeof navigator!=="undefined"&&navigator.onLine===false)return;
  var last=num(state.settings.whoopLast)||0;
  if(Date.now()-last < WHOOP_AUTO_MIN*60000)return;
  state.whoopSyncing=true;
  whoopSync(function(r){
    state.whoopSyncing=false;
    /* only repaint when something actually landed, so a no-op sync can never
       yank the screen out from under a set being logged */
    if(r&&r.ok&&r.applied&&(r.applied.days||r.applied.sleep))render();
  });
}
document.addEventListener("visibilitychange",function(){if(!document.hidden)whoopAutoSync();});
window.addEventListener("pageshow",whoopAutoSync);
window.addEventListener("focus",whoopAutoSync);
setTimeout(whoopAutoSync,2500);   /* and once shortly after boot */

/* ---- what WHOOP has for a day's sleep ---------------------------------------
   Shown beside the sleep fields. When the entry is blank this is just
   confirmation of where the number came from; when it DIFFERS from what was
   typed it offers the figure rather than taking it, which is the whole
   never-overwrite rule expressed as a button. */
function whoopSleepNoteHTML(iso){
  if(!whoopOn())return "";
  var d=whoopDay(iso);if(!d||d.sleepMin==null)return "";
  var cur=num((state.sleep||{})[iso]);
  var same=(cur!=null&&Math.abs(cur-d.sleepMin)<=1);
  var bits=[];
  if(d.deepMin!=null||d.remMin!=null){
    var st=[];if(d.deepMin!=null)st.push(minToHM(d.deepMin)+" deep");if(d.remMin!=null)st.push(minToHM(d.remMin)+" REM");if(d.lightMin!=null)st.push(minToHM(d.lightMin)+" light");
    bits.push(st.join(" · "));
  }
  if(d.sleepPerf!=null)bits.push(d.sleepPerf+"% performance");
  if(d.sleepNeedMin!=null&&d.sleepMin!=null&&d.sleepNeedMin>d.sleepMin)
    bits.push("needed "+minToHM(d.sleepNeedMin)+", short by "+minToHM(d.sleepNeedMin-d.sleepMin));
  else if(d.sleepDebtMin)bits.push(minToHM(d.sleepDebtMin)+" sleep debt");
  if(d.awakeMin)bits.push(minToHM(d.awakeMin)+" awake");
  if(d.disturbances!=null)bits.push(d.disturbances+" disturbance"+(d.disturbances===1?"":"s"));
  if(d.bedTime&&d.wakeTime)bits.push(d.bedTime+"\u2013"+d.wakeTime);
  if(d.napMin)bits.push("plus a "+minToHM(d.napMin)+" nap");
  var h='<div class="wl-whoopfill" style="margin:8px 0 0">'+I.trend.replace("<svg","<svg width=14 height=14")+'<span>';
  if(cur==null)h+='WHOOP recorded <b>'+minToHM(d.sleepMin)+'</b>';
  else if(same)h+='From WHOOP: <b>'+minToHM(d.sleepMin)+'</b>';
  else h+='WHOOP recorded <b>'+minToHM(d.sleepMin)+'</b>, you logged '+minToHM(cur);
  if(bits.length)h+=' · '+esc(bits.join(' · '));
  h+='.';
  if(cur!=null&&!same)h+=' <button class="wl-link" data-act="whoop:usesleep" data-d="'+iso+'" style="display:inline">Use WHOOP’s</button>';
  return h+'</span></div>';
}

/* ---- resting heart rate ------------------------------------------------------
   WHOOP has no stored resting HR — only a nightly reading — so nothing here is
   written automatically. A 30-day median (not a mean: one feverish night should
   not drag the zone model) is offered beside the profile field to accept. */
function whoopRestingAvg(days){
  days=days||30;
  var w=state.whoop||{};var cut=new Date(Date.now()-days*864e5).toISOString().slice(0,10);
  var v=[];Object.keys(w).forEach(function(d){if(d>=cut&&w[d].restingHr!=null)v.push(w[d].restingHr);});
  if(v.length<5)return null;                     /* too thin to mean anything */
  v.sort(function(a,b){return a-b;});
  var m=v.length%2?v[(v.length-1)/2]:Math.round((v[v.length/2-1]+v[v.length/2])/2);
  return {median:m,n:v.length,lo:v[0],hi:v[v.length-1]};
}
function whoopRestingOfferHTML(){
  if(!whoopOn())return "";
  var a=whoopRestingAvg(30);if(!a)return "";
  var cur=num(state.settings.restingHR);
  if(cur!=null&&Math.abs(cur-a.median)<=1)return "";
  return '<div class="wl-whoopfill" style="margin-top:8px">'+I.trend.replace("<svg","<svg width=14 height=14")+
    '<span>WHOOP’s resting heart rate over '+a.n+' nights: <b>'+a.median+' bpm</b> (median, '+a.lo+'–'+a.hi+')'+
    (cur!=null?'. Yours says '+cur+'.':'.')+
    ' <button class="wl-link" data-act="whoop:useresting" data-v="'+a.median+'" style="display:inline">Use it</button></span></div>';
}
/* a one-off notice when WHOOP moved a setting that changes other numbers */
function whoopNoticeHTML(){
  var n=state.whoopNotice;if(!n||n.kind!=="maxhr")return "";
  return '<div class="wl-whoopfill" style="margin:0 0 10px">'+I.trend.replace("<svg","<svg width=14 height=14")+
    '<span>WHOOP updated your <b>max heart rate</b> to '+n.to+' (was '+n.from+'), so your heart-rate zones have shifted. '+
    '<button class="wl-link" data-act="whoop:undomax" data-v="'+n.from+'" style="display:inline">Put it back</button> · '+
    '<button class="wl-link" data-act="whoop:noticeok" style="display:inline">Got it</button></span></div>';
}

/* ---- HR zones on a workout ---------------------------------------------------
   WHOOP reports minutes in each of six zones. Compound already thinks in zones,
   so this is shown as a single stacked bar rather than a table of numbers —
   where the session's time actually went, at a glance. */
/* WHOOP publishes FIVE zones (1-5) on % of HEART-RATE RESERVE, not max HR:
   Z1 40-60 recovery, Z2 60-70 aerobic base, Z3 70-80 aerobic, Z4 80-90
   anaerobic, Z5 90-100 max. The API's sixth bucket, zone_zero, is everything
   BELOW zone 1 — not a training zone, just un-zoned time, which in a lifting
   session is the rest between sets. Labelled "Rest" rather than "Z0" so it is
   never read as a zone.
   Note this lines up with Compound's own model: with a resting HR set, the app
   uses Karvonen too, so its Z2-Z5 bounds (60/70/80/90% HRR) are WHOOP's exactly.
   Compound's Z1 is WHOOP's Z0+Z1 combined. */
var WH_ZONE_COL=["#5A6474","#7C93F5","#5CD6A0","#F5B544","#F2874B","#F26D5B"];
var WH_ZONE_NAME=["Below zone 1 — un-zoned / rest","Zone 1 — active recovery (40-60% HRR)","Zone 2 — aerobic base (60-70%)","Zone 3 — aerobic (70-80%)","Zone 4 — anaerobic (80-90%)","Zone 5 — max effort (90-100%)"];
var WH_ZONE_LBL=["Rest","Z1","Z2","Z3","Z4","Z5"];
function whoopZoneBarHTML(z,opts){
  if(!z||!z.length)return "";
  opts=opts||{};
  var tot=z.reduce(function(a,b){return a+b;},0);if(!tot)return "";
  var h='<div class="wl-zbar-wrap">';
  if(opts.label!==false)h+='<div class="wl-zbar-h"><span>Time in heart-rate zones</span><span>'+fmtDur(tot*60000)+'</span></div>';
  h+='<div class="wl-zbar">';
  z.forEach(function(m,i){if(!m)return;
    h+='<span class="wl-zseg" style="width:'+(m/tot*100).toFixed(2)+'%;background:'+WH_ZONE_COL[i]+'" title="'+WH_ZONE_NAME[i]+' \u2014 '+m+' min"></span>';});
  h+='</div><div class="wl-zkey">';
  z.forEach(function(m,i){if(!m)return;
    h+='<span class="wl-zk" title="'+WH_ZONE_NAME[i]+'"><i style="background:'+WH_ZONE_COL[i]+'"></i>'+WH_ZONE_LBL[i]+' <b>'+m+'m</b></span>';});
  return h+'</div></div>';
}

/* Zones for a SAVED session. Prefers what was stored at save time, but falls
   back to matching the WHOOP workout by time — so sessions saved before zones
   existed still get them, and a re-sync can fill in a session logged while the
   strap data was still being scored. */
function whoopZonesForSession(s){
  if(!s)return null;
  if(s.whoopZones&&s.whoopZones.length)return s.whoopZones;
  if(!whoopOn())return null;
  var end=num(s.ts);var mins=num(s.mins);
  if(end&&mins){
    var m=whoopMatchWorkout(end-mins*60000,end,s.date);
    if(m&&m.zones)return m.zones;
  }
  /* no usable window (an old record, or a quick log): accept a lone workout
     on that day rather than guessing between several */
  var same=(state.whoopWorkouts||[]).filter(function(w){return w.date===s.date&&w.zones;});
  return same.length===1?same[0].zones:null;
}

/* ---- importing WHOOP workouts as cardio -------------------------------------
   Starting a workout on the strap is a deliberate act, so a WHOOP workout is a
   real session — not incidental movement. Bringing them across kills the double
   entry for cardio.

   LIFTING IS DELIBERATELY EXCLUDED. The routine is logged in Compound, which is
   the better record; a WHOOP weightlifting workout matches that session for its
   heart-rate and zone data instead (whoopFillFinish / whoopZonesForSession).
   Anything overlapping a logged lift session is skipped on the same principle,
   whatever WHOOP called it. */

var WHOOP_SPORT_MAP={
  running:"Outdoor run", walking:"Walking", hiking:"Hiking", cycling:"Bike",
  rowing:"Rowing", elliptical:"Elliptical", swimming:"Swimming", stairmaster:"Stairmaster",
  "functional fitness":"Functional fitness", "jump rope":"Jump rope"
};
function whoopIsLifting(w){return /weight|lifting|powerlift|strength/i.test(w.sport||"");}
function whoopCardioType(w){
  var n=(w.sport||"").toLowerCase().trim();
  if(WHOOP_SPORT_MAP[n])return WHOOP_SPORT_MAP[n];
  if(!n)return "Cardio";
  return n.charAt(0).toUpperCase()+n.slice(1);
}
function whoopWoMins(w){var a=Date.parse(w.start),b=Date.parse(w.end);
  return (a>0&&b>a)?Math.max(1,Math.round((b-a)/60000)):null;}

/* does anything already logged cover this workout? */
function whoopAlreadyLogged(w){
  var s=Date.parse(w.start),e=Date.parse(w.end);
  var day=(((state.training||{}).sessions||{})[w.date]||[]);
  for(var i=0;i<day.length;i++){
    var c=day[i];if(c.kind!=="cardio")continue;
    if(c.whoopId===w.id)return true;
    /* a manually logged session covering the same clock time is the same thing */
    var ct=num(c.ts),cm=num(c.mins);
    if(ct&&cm){var cs=ct-cm*60000;if(Math.min(e,ct)-Math.max(s,cs)>300000)return true;}
  }
  /* a lift session over the same window is the routine, not cardio */
  var lifts=(((state.training||{}).liftSessions||{})[w.date]||[]);
  for(var j=0;j<lifts.length;j++){
    var L=lifts[j],lt=num(L.ts),lm=num(L.mins);
    if(lt&&lm){var ls=lt-lm*60000;if(Math.min(e,lt)-Math.max(s,ls)>300000)return true;}
  }
  return false;
}
function whoopPendingImports(){
  if(!whoopOn())return [];
  var skip=state.settings.whoopSkipIds||{};
  return (state.whoopWorkouts||[]).filter(function(w){
    if(!w.id||!w.date||whoopIsLifting(w))return false;
    if(skip[w.id])return false;
    if(!whoopWoMins(w))return false;
    return !whoopAlreadyLogged(w);
  });
}
/* Build the cardio session. Same shape cardio:save writes, plus the WHOOP id so
   it can never be imported twice, and the zone split for the report. */
function whoopImportWorkout(w){
  var mins=whoopWoMins(w);if(!mins)return false;
  var hr=w.avgHr!=null?w.avgHr:null;
  var zone=(typeof zoneForHR==="function"&&hr!=null)?zoneForHR(hr):null;
  var sess={id:"c-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),kind:"cardio",
    type:whoopCardioType(w),mins:mins,zone:zone,rpe:null,cal:(w.cal!=null?w.cal:null),
    hr:hr,hrMax:(w.maxHr!=null?w.maxHr:null),notes:"",ts:Date.parse(w.end)||Date.now(),
    whoopId:w.id,whoopZones:w.zones||null,whoopStrain:(w.strain!=null?w.strain:null)};
  state.training=state.training||{};state.training.sessions=state.training.sessions||{};
  var list=(state.training.sessions[w.date]||[]).slice();
  list.push(sess);state.training.sessions[w.date]=list;
  if(typeof syncCardioTags==="function")syncCardioTags(w.date);
  return true;
}
function whoopImportAllPending(){
  var p=whoopPendingImports(),n=0;
  p.forEach(function(w){if(whoopImportWorkout(w))n++;});
  if(n){if(typeof saveTraining==="function")saveTraining();save();}
  return n;
}
function whoopCardioMode(){var m=state.settings.whoopCardio;return (m==="auto"||m==="off")?m:"ask";}

/* the offer card — only when there is something to offer */
function whoopImportCardHTML(){
  if(!whoopOn()||whoopCardioMode()==="off")return "";
  var p=whoopPendingImports();if(!p.length)return "";
  var h='<div class="wl-card"><div class="wl-card-head"><span>'+I.trend.replace("<svg","<svg width=15 height=15")+' From WHOOP</span><span class="wl-count">'+p.length+'</span></div>';
  h+='<div class="wl-hint" style="margin-top:0">'+(p.length===1?'A workout':'Workouts')+' WHOOP recorded that '+(p.length===1?'isn’t':'aren’t')+' logged here yet.</div>';
  p.slice(0,6).forEach(function(w){
    /* three facts, so the line does not wrap under the buttons; strain is on the
       session itself once added */
    var bits=[whoopWoMins(w)+" min"];
    if(w.avgHr!=null)bits.push("HR "+w.avgHr);
    if(w.cal!=null)bits.push(w.cal+" cal");
    h+='<div class="wl-wimp"><div class="wl-wimp-l"><b>'+esc(whoopCardioType(w))+'</b><span>'+esc(fmtShort(parseISO(w.date)))+' · '+esc(bits.join(" · "))+'</span></div>'+
       '<div class="wl-wimp-b"><button class="wl-btn wl-btn-primary" data-act="whoop:import" data-id="'+esc(w.id)+'">Add</button>'+
       '<button class="wl-btn wl-btn-ghost" data-act="whoop:skipwo" data-id="'+esc(w.id)+'">No</button></div></div>';
  });
  if(p.length>1)h+='<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:10px" data-act="whoop:importall">Add all '+p.length+'</button>';
  return h+'</div>';
}
