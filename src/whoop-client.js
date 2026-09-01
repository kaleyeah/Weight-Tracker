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
  /* WHOOP measures max HR directly; adopt it only if nothing is set, since the
     zone model is the athlete's to own. */
  if(data&&data.body&&data.body.max_heart_rate&&!num(state.settings.maxHR))
    state.settings.maxHR=String(data.body.max_heart_rate);
  save();
  return {days:nd,sleep:nsleep,skipped:skipped,total:Object.keys(days).length};
}

function whoopSync(cb){
  var w=whoopWindow();
  whoopFetch("/whoop/sync?from="+w.from+"&to="+w.to,null,function(r){
    if(!r||!r.ok)return cb(r||{ok:false,error:"no response"});
    state.whoopWorkouts=(r.workouts||[]).slice(-120);   /* enough to match recent sessions */
    var n=whoopApply(r);
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
  w.whoopFill={id:m.id,fields:filled,strain:m.strain,pct:m.pctRecorded};
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
  var h='<div class="wl-card">';
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
