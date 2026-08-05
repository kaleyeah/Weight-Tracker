
/* ---------------- storage ---------------- */
var KEY="wl_v1";
var DEFAULT_SETTINGS={units:"lbs",startingWeight:"",startDate:todayISO(),goalWeight:"",
  targetType:"lbs_per_week",targetValue:"1",targetCalories:"",targetProtein:"",targetCarbs:"",targetFat:"",theme:"dark",name:"",reminderTime:"19:00",connections:[],sex:"",age:"",heightFt:"",heightIn:"",activityLevel:"",stepsGoal:"",sleepGoal:"",weekStart:"0",strategy:"lose"};
var SANS="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,system-ui,sans-serif";
var MONO="ui-monospace,'SF Mono','Cascadia Code',Menlo,Consolas,monospace";
var THEMES={
  dark:{label:"Dark",scheme:"dark",v:{bg:"#0F1218",bg2:"#141922",card:"#1A2029",card2:"#212836",line:"#2A3340",line2:"#333E4E",text:"#EDF1F7",muted:"#8791A3",faint:"#5A6474",accent:"#F5B544","accent-dim":"rgba(245,181,68,.14)",good:"#5CD6A0",bad:"#F26D5B",reg:"#7C93F5","on-accent":"#20160A","on-good":"#0C1A14","mac-p":"#A9C0DE","mac-c":"#7C9AC0","mac-f":"#566F92",sans:SANS,mono:MONO},
    chart:{grid:"#252D3A",axis:"#5A6474",actual:"#AEB7C7",actualLine:"#6B7688",avg:"#F5B544",reg:"#7C93F5",goal:"#5CD6A0"}},
  light:{label:"Light",scheme:"light",v:{bg:"#E1E4EA",bg2:"#141922",card:"#1A2029",card2:"#212836",line:"#2A3340",line2:"#333E4E",text:"#EDF1F7",muted:"#8791A3",faint:"#5A6474",accent:"#F5B544","accent-dim":"rgba(245,181,68,.14)",good:"#5CD6A0",bad:"#F26D5B",reg:"#7C93F5","on-accent":"#20160A","on-good":"#0C1A14","mac-p":"#A9C0DE","mac-c":"#7C9AC0","mac-f":"#566F92",sans:SANS,mono:MONO},
    chart:{grid:"#252D3A",axis:"#5A6474",actual:"#AEB7C7",actualLine:"#6B7688",avg:"#F5B544",reg:"#7C93F5",goal:"#5CD6A0"}}};
var CH=THEMES.dark.chart;
function applyTheme(id){var t=THEMES[id]||THEMES.dark;var root=document.documentElement;root.setAttribute("data-theme",THEMES[id]?id:"dark");
  for(var k in t.v){root.style.setProperty("--"+k,t.v[k]);}
  root.style.colorScheme=t.scheme;CH=t.chart;
  var meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute("content",t.v.bg);}
var DEFAULT_PRESETS=[{name:"Peloton",cat:"cardio"},{name:"Treadmill",cat:"cardio"},{name:"Rowing",cat:"cardio"},{name:"Bike",cat:"cardio"},{name:"Elliptical",cat:"cardio"},{name:"Outdoor run",cat:"cardio"},{name:"Weight training",cat:"lifting"},{name:"Rest day",cat:"rest"}];
var CARDIO_W=["cardio","peloton","treadmill","row","run","jog","bike","cycle","cycling","spin","elliptical","stair","swim","hiit","zone 2","zone2","zone 3","zone3","incline","sprint"];
var LIFT_W=["lift","weight","strength","resistance","gym","squat","deadlift","bench","push","pull","leg day","upper","lower","hypertrophy","dumbbell","barbell"];
var SUPP_W=["glp","semaglutide","tirzepatide","ozempic","wegovy","mounjaro","zepbound","creatine","electrolyte","pre-workout","preworkout","protein powder","supplement","vitamin","medication"];
var REST_W=["rest","recovery","off day","day off","walk","walking","massage","stretch","mobility","yoga","sauna","foam roll"];
function catFromName(s){var n=(s||"").toLowerCase();
  if(REST_W.some(function(k){return n.indexOf(k)>=0;}))return "rest";
  if(SUPP_W.some(function(k){return n.indexOf(k)>=0;}))return "supp";
  if(CARDIO_W.some(function(k){return n.indexOf(k)>=0;}))return "cardio";
  if(LIFT_W.some(function(k){return n.indexOf(k)>=0;}))return "lifting";
  return "other";}
var CATLABEL={cardio:"Cardio",lifting:"Weight Training",supp:"Supp/Med",rest:"Recovery",other:"Other"};
var CATPH={cardio:"e.g. Peloton (optional)",lifting:"e.g. Push day (optional)",supp:"e.g. GLP-1",rest:"e.g. Walk, massage",other:"name (optional)"};
/* ---------------- GLP-1 & Peptides (feature data model — Part 1) ----------------
   Per-user, independent, persisted inside the same data blob as everything else
   (payload/applyCloud/load). Parts 2 (Activity card + sheets) and 3 (Progress
   charts) read from this same shape. Cadence is ROLLING: next due = last dose
   takenAt + cadenceDays. No notifications, no scheduling — showDueDate is on-screen
   display only. */
var GLP_SITES=[["l_abdomen","L abdomen"],["r_abdomen","R abdomen"],["l_thigh","L thigh"],["r_thigh","R thigh"],["l_arm","L arm"],["r_arm","R arm"],["l_glute","L glute"],["r_glute","R glute"]];
var GLP_BUILTIN_SYMPTOMS=["Nausea","Fatigue","Constipation","Heartburn","Headache","Appetite drop","Site reaction","Sulfur burps"];
function glpNewId(p){return (p||"g")+"-"+Date.now()+"-"+Math.random().toString(36).slice(2,6);}
function glpDefault(){return {settings:{enabled:false,showDueDate:true,titration:false,siteRotation:true,symptomLogging:true},compound:null,doses:[],symptoms:[],symptomTypes:[]};}
/* Repairs shape on load/pull AND lazily seeds the 8 built-in symptom types the first
   time they're missing, so existing users pick them up without a migration step. */
function glpNormalize(){
  if(!state.glp||typeof state.glp!=="object")state.glp=glpDefault();
  var g=state.glp;
  g.settings=Object.assign({enabled:false,showDueDate:true,titration:false,siteRotation:true,symptomLogging:true},g.settings||{});
  if(g.compound!==null&&typeof g.compound!=="object")g.compound=null;
  if(!Array.isArray(g.doses))g.doses=[];
  if(!Array.isArray(g.symptoms))g.symptoms=[];
  if(!Array.isArray(g.symptomTypes))g.symptomTypes=[];
  if(!g.symptomTypes.length)g.symptomTypes=GLP_BUILTIN_SYMPTOMS.map(function(lbl){return {id:glpNewId("sym"),label:lbl,isBuiltIn:true,archived:false};});
  return g;}
function glpSiteLabel(id){for(var i=0;i<GLP_SITES.length;i++){if(GLP_SITES[i][0]===id)return GLP_SITES[i][1];}return id||"";}
function glpCadenceLabel(n){n=parseInt(n,10);if(!n||n<=0)return "";return n===7?"weekly":("every "+n+"d");}
function glpCompoundSummary(){var g=state.glp;if(!g||!g.compound||!g.compound.name)return null;var c=g.compound;var parts=[esc(c.name)];if(c.dose!=null&&c.dose!=="")parts.push(esc(c.dose)+" "+(c.unit||"mg"));var cl=glpCadenceLabel(c.cadenceDays);if(cl)parts.push(cl);return parts.join(" · ");}
/* one settings row = icon + title + subtitle + a pill toggle (green master / amber sub) */
function glpToggleRow(icon,title,sub,act,on,amber){return '<button class="wl-glptogrow" data-act="'+act+'"><span class="wl-glpic">'+icon+'</span><span class="wl-glptxt"><span class="wl-glpt">'+title+'</span><span class="wl-glps">'+sub+'</span></span><span class="wl-glptog'+(amber?" amber":"")+(on?" on":"")+'"></span></button>';}
/* pull the compound-edit text fields into the draft before any re-render blanks them */
function glpSyncDraft(){var d=state.glpDraft;if(!d)return;var q=function(k){var el=document.querySelector('[data-glpc="'+k+'"]');return el?el.value:undefined;};var n=q("name");if(n!==undefined)d.name=n;var ds=q("dose");if(ds!==undefined)d.dose=ds;var cd=q("cadenceDays");if(cd!==undefined)d.cadenceDays=cd;}
/* ---------- GLP-1 Part 2: Activity card + Log Dose / Log Symptom sheets ---------- */
function glpSymLabel(id){var ts=(state.glp&&state.glp.symptomTypes)||[];for(var i=0;i<ts.length;i++){if(ts[i].id===id)return ts[i].label;}return "";}
function glpDayKey(ms){var d=new Date(ms);return d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate();}
function glpToLocalInput(ms){var d=new Date(ms);function p(n){return (n<10?"0":"")+n;}return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+"T"+p(d.getHours())+":"+p(d.getMinutes());}
function glpFromLocalInput(s){if(!s)return null;var m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s);if(!m)return null;return new Date(+m[1],+m[2]-1,+m[3],+m[4],+m[5]).getTime();}
function glpFmtWhen(ms){var d=new Date(ms);var t=d.toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"});return fmtLong(d)+" · "+t;}
/* rolling due date + overdue, computed at render time (nothing is scheduled) */
function glpDueInfo(){var g=state.glp;if(!g||!g.compound)return null;var cad=parseInt(g.compound.cadenceDays,10)||7;var doses=g.doses||[];var lastReal=null,lastAny=null;doses.forEach(function(d){if(d.takenAt==null)return;if(!lastAny||d.takenAt>lastAny.takenAt)lastAny=d;if(!d.skipped&&(!lastReal||d.takenAt>lastReal.takenAt))lastReal=d;});if(!lastAny)return {lastReal:null,due:null,cad:cad,overdue:false};/* anchor the schedule on the most recent event (dose OR skip) so a skip rolls the next due forward one cadence and a later miss can nag again */var due=lastAny.takenAt+cad*86400000;var overdue=(Date.now()>due);return {lastReal:lastReal,due:due,cad:cad,overdue:overdue};}
/* least-recently-used site (never-used ranks oldest); 2 most-recent distinct = "recent"; mutually exclusive */
function glpSiteSuggestion(){var used=(state.glp.doses||[]).filter(function(d){return !d.skipped&&d.siteId;}).slice().sort(function(a,b){return b.takenAt-a.takenAt;});var recent=[];for(var i=0;i<used.length&&recent.length<2;i++){if(recent.indexOf(used[i].siteId)<0)recent.push(used[i].siteId);}var lastUsed={};used.forEach(function(d){if(lastUsed[d.siteId]==null)lastUsed[d.siteId]=d.takenAt;});var ids=GLP_SITES.map(function(s){return s[0];});var pool=ids.filter(function(id){return recent.indexOf(id)<0;});if(!pool.length)pool=ids.slice();var best=pool[0],bestT=(lastUsed[pool[0]]!=null?lastUsed[pool[0]]:-Infinity);pool.forEach(function(id){var t=(lastUsed[id]!=null?lastUsed[id]:-Infinity);if(t<bestT){bestT=t;best=id;}});if(!used.length)best="l_abdomen";return {suggested:best,recent:recent};}
/* pull sheet text/time fields into the scratch object before any chip-driven re-render */
function glpSheetSync(){var s=state.glpSheet;if(!s)return;var q=function(k){return document.querySelector('[data-glps="'+k+'"]');};var d=q("dose");if(d)s.dose=d.value;var n=q("note");if(n)s.note=n.value;var at=q("at");if(at){var t=glpFromLocalInput(at.value);if(t!=null)s.at=t;}var nl=q("newlabel");if(nl)s.newLabel=nl.value;}
function glpArchiveType(id){glpNormalize();var changed=false;state.glp.symptomTypes.forEach(function(t){if(t.id===id&&!t.isBuiltIn&&!t.archived){t.archived=true;changed=true;}});if(!changed)return;if(state.glpSheet&&state.glpSheet.symptomTypeId===id){var rem=state.glp.symptomTypes.filter(function(t){return !t.archived;});state.glpSheet.symptomTypeId=rem[0]?rem[0].id:null;}save();render();toast("Symptom archived");}
function glpCardHTML(){
  var g=state.glp;if(!g||!g.settings||!g.settings.enabled)return "";
  var icon='<span class="wl-caticon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 3.5 3.5 10.5a5 5 0 0 0 7 7l7-7a5 5 0 0 0-7-7zM7 7l7 7"/></svg></span>';
  var plus=I.plus.replace("<svg","<svg width=15 height=15");
  var h="";
  if(!g.compound){
    h+='<div class="wl-card catcard glp"><div class="wl-cathead">'+icon+'<div class="wl-catmeta"><div class="wl-cattype">GLP-1 &amp; Peptides</div><div class="wl-catsum">No compound set</div></div></div>';
    h+='<button class="wl-btn wl-btn-supp wl-full" style="margin-top:4px" data-act="glp:setup">'+plus+'Set up compound</button>';
    return h+'</div>';
  }
  var info=glpDueInfo();
  var overdue=!!(info&&info.overdue&&g.settings.showDueDate);
  var sug=glpSiteSuggestion();
  var summary=glpCompoundSummary()||esc(g.compound.name||"");
  var dueLine="";
  if(g.settings.showDueDate&&info&&info.due&&!overdue){
    var days=Math.ceil((info.due-Date.now())/86400000);
    if(days>=0){var when=days===0?"today":(days===1?"in 1 day":("in "+days+" days"));dueLine="Next dose "+when+(g.settings.siteRotation?(" · "+esc(glpSiteLabel(sug.suggested))):"");}
  }
  h+='<div class="wl-card catcard glp'+(overdue?" late":"")+'"><div class="wl-cathead">'+icon+'<div class="wl-catmeta"><div class="wl-cattype">GLP-1 &amp; Peptides</div><div class="wl-catsum">'+summary+(dueLine?'<span class="wl-glpdue">'+dueLine+'</span>':'')+'</div></div></div>';
  if(overdue){
    var ago=Math.floor((Date.now()-info.due)/86400000);
    h+='<div class="wl-glpnag"><div class="wl-glpnag-top"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.01"/></svg><span>Dose overdue</span></div>';
    h+='<div class="wl-glpnag-sub">Due '+esc(fmtLong(new Date(info.due)))+' · '+(ago<=0?"today":(ago===1?"1 day ago":ago+" days ago"))+'</div>';
    h+='<div class="wl-glpnag-btns"><button class="wl-glpnag-prim" data-act="glp:dose:open" data-at="'+info.due+'">Log now</button><button class="wl-glpnag-sec" data-act="glp:skip" data-at="'+info.due+'">Skip this week</button></div></div>';
  }
  /* The Activity card answers "what happened THIS day" -- it used to list the
     three most-recent shots regardless of the day being viewed (Owner bug #4).
     The full journal lives under the Weight & dose chart. NOTE: comparisons use
     the PADDED iso day (toISO), not glpDayKey, whose "2026-8-1" format can
     never equal a selDate like "2026-08-01". */
  var _day=state.selDate||todayISO();
  var _iso=function(ms){return toISO(new Date(ms));};
  var doses=(g.doses||[]).filter(function(d){return _iso(d.takenAt)===_day;}).sort(function(a,b){return a.takenAt-b.takenAt;});
  var syms=(g.symptoms||[]).filter(function(x){return _iso(x.occurredAt)===_day;}).sort(function(a,b){return a.occurredAt-b.occurredAt;});
  if(!doses.length){
    var _prev=null;(g.doses||[]).forEach(function(d){if(!d.skipped&&_iso(d.takenAt)<=_day&&(!_prev||d.takenAt>_prev.takenAt))_prev=d;});
    if(_prev){var _ago=Math.round((new Date(_day+"T12:00").getTime()-_prev.takenAt)/86400000);
      h+='<div class="wl-glpentry"><div class="wl-glpentry-lines"><div class="wl-glpentry-l2">No shot this day · last was '+(_ago<=0?"today":(_ago===1?"1 day ago":_ago+" days ago"))+' ('+esc(glpFmtWhen(_prev.takenAt))+')</div></div></div>';}
  }
  doses.forEach(function(d){
    h+='<div class="wl-glpentry"><div class="wl-glpentry-lines">';
    if(d.skipped){
      h+='<div class="wl-glpentry-l1">Dose skipped</div><div class="wl-glpentry-l2">'+esc(glpFmtWhen(d.takenAt))+'</div>';
    }else{
      var dl=esc(g.compound.name||"")+((d.dose!=null&&d.dose!=="")?(" "+esc(d.dose)+" "+esc(d.unit||"mg")):"");
      h+='<div class="wl-glpentry-l1">'+dl+'</div><div class="wl-glpentry-l2">'+esc(glpFmtWhen(d.takenAt))+(d.siteId?(" · "+esc(glpSiteLabel(d.siteId))):"")+'</div>';
    }
    h+='</div><button class="wl-icon-btn" data-act="glp:dose:del" data-id="'+esc(d.id)+'">'+I.trash.replace("<svg","<svg width=15 height=15")+'</button></div>';
  });
  syms.forEach(function(x){
    var sev=parseInt(x.severity,10)||0;var pips="";for(var i=1;i<=5;i++)pips+='<span class="wl-glppip'+(i<=sev?" on":"")+'"></span>';
    h+='<button class="wl-glpsev" style="width:100%;background:none;border:none;padding:0;font:inherit;color:inherit;text-align:left" data-act="glp:sym:edit" data-id="'+esc(x.id)+'"><b>'+esc(glpSymLabel(x.symptomTypeId))+'</b>'+pips+'</button>';
  });
  h+='<div class="wl-glpbtnrow"><button class="wl-btn wl-btn-supp" data-act="glp:dose:open">'+plus+'Log Dose</button>';
  if(g.settings.symptomLogging)h+='<button class="wl-btn wl-btn-supp" data-act="glp:sym:open">'+plus+'Symptom</button>';
  h+='</div>';
  return h+'</div>';
}
function glpDoseSheetInner(s,g){var c=g.compound||{};var unit=c.unit||"mg";
  var h='<h4 class="wl-glpsheet-h">Log dose</h4><div class="wl-glpsheet-sub">'+esc(c.name||"")+' · '+esc(fmtLong(new Date(s.at||Date.now())))+'</div>';
  h+='<div class="wl-glpfield"><div class="wl-glpflabel">Dose</div><div class="wl-glpinbox"><input class="wl-glpbare" data-glps="dose" type="text" inputmode="decimal" value="'+esc(s.dose!=null?s.dose:"")+'" placeholder="'+esc(c.dose!=null?c.dose:"—")+'"><span class="wl-glpunit">'+esc(unit)+'</span></div></div>';
  if(g.settings.siteRotation){
    var sug=glpSiteSuggestion();
    h+='<div class="wl-glpfield"><div class="wl-glpflabel">Injection site</div><div class="wl-glpchips">';
    GLP_SITES.forEach(function(site){var id=site[0];var cls="wl-glpchip";if(s.siteId===id)cls+=" sel";else if(id===sug.suggested)cls+=" next";else if(sug.recent.indexOf(id)>=0)cls+=" recent";h+='<button class="'+cls+'" data-act="glp:site" data-site="'+id+'">'+esc(site[1])+'</button>';});
    h+='</div><div class="wl-glplegend"><span><i style="background:var(--accent)"></i>Suggested</span><span><i style="background:var(--faint)"></i>Used recently</span></div></div>';
  }
  h+='<div class="wl-glpfield"><div class="wl-glpflabel">Time</div><input class="wl-glpinbox" data-glps="at" type="datetime-local" value="'+glpToLocalInput(s.at||Date.now())+'"></div>';
  h+='<div class="wl-glpfield"><div class="wl-glpflabel">Note <span class="wl-glpopt">— optional</span></div><input class="wl-glpinbox" data-glps="note" type="text" value="'+esc(s.note||"")+'" placeholder="Anything worth noting"></div>';
  h+='<button class="wl-glpcta" data-act="glp:dose:save">Save dose</button>';
  return h;
}
function glpSymSheetInner(s,g){var types=(g.symptomTypes||[]).filter(function(t){return !t.archived;});
  var h='<h4 class="wl-glpsheet-h">'+(s.editId?'Edit symptom':'Log symptom')+'</h4><div class="wl-glpsheet-sub">'+esc(glpFmtWhen(s.at||Date.now()))+'</div>';
  h+='<div class="wl-glpfield"><div class="wl-glpflabel">Symptom</div><div class="wl-glpchips">';
  types.forEach(function(t){var cls="wl-glpchip"+(s.symptomTypeId===t.id?" sel":"");var extra=t.isBuiltIn?"":(' data-glplong="'+t.id+'"');h+='<button class="'+cls+'" data-act="glp:sym:pick" data-id="'+t.id+'"'+extra+'>'+esc(t.label)+'</button>';});
  if(s.newOpen)h+='<span class="wl-glpchip add"><input class="wl-glpnewin" data-glps="newlabel" id="wl-glpnewin" placeholder="name…" value="'+esc(s.newLabel||"")+'" autocomplete="off"><button class="wl-glpnewok" data-act="glp:sym:newsave">✓</button></span>';
  else h+='<button class="wl-glpchip add" data-act="glp:sym:new">＋ New</button>';
  h+='</div>';
  if(types.some(function(t){return !t.isBuiltIn;}))h+='<div class="wl-glplegend"><span>Long-press a custom symptom to archive it</span></div>';
  h+='</div>';
  h+='<div class="wl-glpfield"><div class="wl-glpflabel">Severity</div><div class="wl-seg wl-seg-wide" style="margin-bottom:0">'+[1,2,3,4,5].map(function(n){return '<button class="'+(s.severity===n?"on":"")+'" data-act="glp:sev" data-sev="'+n+'">'+n+'</button>';}).join("")+'</div></div>';
  h+='<div class="wl-glpfield"><div class="wl-glpflabel">Time</div><input class="wl-glpinbox" data-glps="at" type="datetime-local" value="'+glpToLocalInput(s.at||Date.now())+'"></div>';
  h+='<div class="wl-glpfield"><div class="wl-glpflabel">Note <span class="wl-glpopt">— optional</span></div><input class="wl-glpinbox" data-glps="note" type="text" value="'+esc(s.note||"")+'" placeholder="Anything worth noting"></div>';
  h+='<button class="wl-glpcta" data-act="glp:sym:save">'+(s.editId?'Save changes':'Save symptom')+'</button>';
  if(s.editId)h+='<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px;color:var(--bad);border-color:var(--bad)" data-act="glp:sym:del" data-id="'+esc(s.editId)+'">Delete this log</button>';
  return h;
}
function glpSheetHTML(){var s=state.glpSheet;if(!s)return "";glpNormalize();var g=state.glp;
  var h='<div class="wl-confirm wl-glpsheetwrap"><div class="wl-glpsheetdim" data-act="glp:sheetclose"></div><div class="wl-glpsheet"><div class="wl-glpgrab"></div><button class="wl-glpsheet-x" data-act="glp:sheetclose" aria-label="Cancel">\u2715</button>';
  h+=(s.mode==="sym")?glpSymSheetInner(s,g):glpDoseSheetInner(s,g);
  return h+'</div></div>';
}
/* The full shot journal, under the Weight & dose chart (Owner design ruling). */
function glpJournalHTML(){
  var g=state.glp;if(!g||!g.settings||!g.settings.enabled)return "";
  var doses=(g.doses||[]).slice().sort(function(a,b){return b.takenAt-a.takenAt;});
  if(!doses.length)return "";
  var h='<div class="wl-card"><div class="wl-card-head"><span>Shot journal</span></div>';
  doses.forEach(function(d){
    h+='<div class="wl-glpentry"><div class="wl-glpentry-lines">';
    if(d.skipped){h+='<div class="wl-glpentry-l1">Dose skipped</div><div class="wl-glpentry-l2">'+esc(glpFmtWhen(d.takenAt))+'</div>';}
    else{
      var dl=esc((g.compound&&g.compound.name)||"")+((d.dose!=null&&d.dose!=="")?(" "+esc(d.dose)+" "+esc(d.unit||"mg")):"");
      h+='<div class="wl-glpentry-l1">'+dl+'</div><div class="wl-glpentry-l2">'+esc(glpFmtWhen(d.takenAt))+(d.siteId?(" · "+esc(glpSiteLabel(d.siteId))):"")+'</div>';
      if(d.note)h+='<div class="wl-glpentry-l2" style="margin-top:2px;color:var(--muted)">'+esc(d.note)+'</div>';
    }
    h+='</div></div>';
  });
  return h+'</div>';}
function normActs(iso){var raw=state.workouts[iso];if(!Array.isArray(raw))return [];
  return raw.map(function(a){if(typeof a==="string")return {cat:catFromName(a),name:a};return {cat:(a&&a.cat)||catFromName(a&&a.name)||"other",name:(a&&a.name)||"",auto:a&&a.auto};});}
var TKEY="wl_training_v1";
var DEFAULT_CARDIO_TYPES=["Peloton","Treadmill","Rowing","Bike","Elliptical","Outdoor run"];
/* recoveryFreeze is set when boot could not secure the pre-sync bytes. It stops
   BOOT-time normalisation (migrateProgressionTypes and friends) from rewriting
   the very key we failed to protect -- which is what made the old notice's
   "your local training has not been changed" a false statement. It is released
   once boot completes, so the athlete's own later edits still save locally. */
/* Local writes are refused, not merely un-synced, while ownership is unanswered
   or a wipe is unresolved. Without this the app stayed fully usable after Cancel
   and could keep changing data it had just told the athlete it would not touch. */
function localWritesFrozen(){return recoveryFreeze||recoveryState==="adoption"||logoutRecoveryPending();}
function saveTrainingLocal(){if(localWritesFrozen())return false;
  var ser;try{ser=JSON.stringify(state.training);}catch(e){return false;}
  try{localStorage.setItem(TKEY,ser);}catch(e){return false;}
  var back;try{back=localStorage.getItem(TKEY);}catch(e){return false;}
  return back===ser;}
function loadTraining(){try{var t=JSON.parse(localStorage.getItem(TKEY));if(t&&typeof t==="object"){state.training={cardioTypes:(Array.isArray(t.cardioTypes)&&t.cardioTypes.length)?t.cardioTypes:DEFAULT_CARDIO_TYPES.slice(),sessions:t.sessions||{},exercises:t.exercises||[],routines:t.routines||[],liftSessions:t.liftSessions||{}};}}catch(e){}}
function syncCardioTags(date){var kept=normActs(date).filter(function(a){return !(a.cat==="cardio"&&a.auto);});
  var types={};((state.training.sessions||{})[date]||[]).forEach(function(s){if(s.kind==="cardio"&&s.type)types[s.type]=1;});
  Object.keys(types).forEach(function(t){if(!kept.some(function(a){return a.cat==="cardio"&&a.name===t;}))kept.push({cat:"cardio",name:t,auto:true});});
  if(kept.length)state.workouts[date]=kept;else delete state.workouts[date];}
function syncLiftTags(date){var kept=normActs(date).filter(function(a){return !(a.cat==="lifting"&&a.auto);});
  var names={};((state.training.liftSessions||{})[date]||[]).forEach(function(s){names[s.name||"Weight training"]=1;});
  Object.keys(names).forEach(function(nm){if(!kept.some(function(a){return a.cat==="lifting"&&a.name===nm;}))kept.push({cat:"lifting",name:nm,auto:true});});
  if(kept.length)state.workouts[date]=kept;else delete state.workouts[date];}
function migrateOrphanLiftTags(){var changed=false;var ls=(state.training&&state.training.liftSessions)||{};
  Object.keys(state.workouts||{}).forEach(function(d){var arr=state.workouts[d];if(!Array.isArray(arr))return;
    var sn={};((ls[d]||[])).forEach(function(x){sn[x.name||"Weight training"]=1;});
    var filt=arr.filter(function(a){var c=(a&&a.cat)||catFromName(a&&a.name)||"other";if(c!=="lifting")return true;return !!sn[(a&&a.name)||""];});
    if(filt.length!==arr.length){changed=true;if(filt.length)state.workouts[d]=filt;else delete state.workouts[d];}});
  return changed;}
function resyncAllActivityTags(){
  /* This derives CORE activity tags from training. While ownership of the
     training bytes is unestablished, deriving from them would copy possibly
     someone else's sessions into core -- which then reaches both the backup and,
     via cloudPush, the signed-in account's server record. Guarded here rather
     than at each call site so no caller can reintroduce the exposure. */
  if(trainingQuarantined())return false;
  var before=JSON.stringify(state.workouts||{});var ds={};
  var ss=(state.training&&state.training.sessions)||{},ls=(state.training&&state.training.liftSessions)||{};
  Object.keys(ss).forEach(function(d){ds[d]=1;});Object.keys(ls).forEach(function(d){ds[d]=1;});Object.keys(state.workouts||{}).forEach(function(d){ds[d]=1;});
  Object.keys(ds).forEach(function(d){syncCardioTags(d);syncLiftTags(d);});
  return JSON.stringify(state.workouts||{})!==before;}
function actLabel(a){return a.name?(CATLABEL[a.cat]+": "+a.name):CATLABEL[a.cat];}
function normPresets(){var raw=state.presets;if(!Array.isArray(raw))return [];
  return raw.map(function(p){if(typeof p==="string")return {name:p,cat:catFromName(p)};return {name:(p&&p.name)||"",cat:(p&&p.cat)||catFromName(p&&p.name)||"other"};});}
function dayDots(iso){var seen={},cats=[];function _ad(c){if(!seen[c]){seen[c]=1;cats.push(c);}}
  if((((state.training.sessions||{})[iso])||[]).some(function(s){return s.kind==="cardio";}))_ad("cardio");
  if(((((state.training.liftSessions||{})[iso])||[]).length))_ad("lifting");
  normActs(iso).forEach(function(a){if(a.cat!=="cardio"&&a.cat!=="lifting")_ad(a.cat);});
  if(cats.length)return '<span class="wl-cell-dots">'+cats.map(function(c){return '<i class="dot-'+c+'"></i>';}).join("")+'</span>';
  if(dayHasAny(iso))return '<span class="wl-cell-dots"><i class="dot-data"></i></span>';
  return '';}
var state={settings:Object.assign({},DEFAULT_SETTINGS),weights:[],food:{},workouts:{},steps:{},notes:{},ratings:{},checkins:{},sleep:{},bodyfat:{},waist:{},leanmass:{},statuses:[],weeklySummary:null,nightlySummary:null,nightlyLog:{},presets:DEFAULT_PRESETS.slice(),
  view:"overview",calY:new Date().getFullYear(),calM:new Date().getMonth(),weekOffset:0,trendMode:"W",trendOffset:0,calOpen:false,sumOpen:true,nightOpen:true,genBusy:false,nightBusy:false,diaryWeeks:1,
  training:{cardioTypes:DEFAULT_CARDIO_TYPES.slice(),sessions:{},exercises:[],routines:[],liftSessions:{}},cardioForm:null,manageOpen:false,actAddCat:null,actPick:null,exForm:null,routineId:null,riPickOpen:false,noteEdit:null,liftForm:null,workout:null,setMenu:null,woPrompt:false,bwEdit:false,histView:null,exMenu:null,woReplaceEi:null,woReplSave:null,liftViewId:null,liftViewDate:null,woResume:false,liftEdit:null,quickEntry:null,
  selDate:todayISO(),foodDate:todayISO(),alertDismissed:false,confirmReset:false,skips:{},glp:glpDefault(),glpDraft:null,glpSheet:null,reopenAsk:null};

function load(){
  try{var raw=localStorage.getItem(KEY);if(raw){var d=JSON.parse(raw);
    state.settings=Object.assign({},DEFAULT_SETTINGS,d.settings||{});
    state.weights=Array.isArray(d.weights)?d.weights:[];
    state.food=d.food||{};state.workouts=d.workouts||{};state.steps=d.steps||{};state.notes=d.notes||{};state.sleep=d.sleep||{};state.bodyfat=d.bodyfat||{};state.waist=d.waist||{};state.leanmass=d.leanmass||{};state.statuses=d.statuses||[];state.weeklySummary=d.weeklySummary||null;state.nightlySummary=d.nightlySummary||null;state.nightlyLog=d.nightlyLog||{};state.scriptVer=d.scriptVer||{};coachRptLoad();if(migrateCoachSeen())save();
    state.presets=(Array.isArray(d.presets)&&d.presets.length)?d.presets:DEFAULT_PRESETS.slice();state.skips=d.skips||{};state.glp=d.glp||glpDefault();state.ratings=(d.ratings&&typeof d.ratings==="object")?d.ratings:{};state.checkins=(d.checkins&&typeof d.checkins==="object")?d.checkins:{};
  }}catch(e){}
  glpNormalize();
  if(state.settings.macroAuto===undefined&&(num(state.settings.targetProtein)!=null||num(state.settings.targetCarbs)!=null||num(state.settings.targetFat)!=null))state.settings.macroAuto=false;
  if(state.settings.calTargetAuto===undefined&&num(state.settings.targetCalories)!=null)state.settings.calTargetAuto=false;
  applyAutoMacros();
  if(!THEMES[state.settings.theme])state.settings.theme=(state.settings.theme==="clinic"||state.settings.theme==="bloom")?"light":"dark";
  if((state.settings.cardioMinGoal==null||state.settings.cardioMinGoal==="")&&num(state.settings.exerciseMinGoal)!=null)state.settings.cardioMinGoal=state.settings.exerciseMinGoal;
  try{state.sumOpen=localStorage.getItem("wl_sumopen")!=="0";}catch(e){}
  try{state.calOpen=localStorage.getItem("wl_calopen")==="1";}catch(e){}
}
function payload(){return {settings:state.settings,weights:state.weights,food:state.food,workouts:state.workouts,steps:state.steps,notes:state.notes,ratings:state.ratings,checkins:state.checkins,sleep:state.sleep,bodyfat:state.bodyfat,waist:state.waist,leanmass:state.leanmass,statuses:state.statuses,weeklySummary:state.weeklySummary,nightlySummary:state.nightlySummary,nightlyLog:state.nightlyLog,presets:state.presets,skips:state.skips,glp:state.glp,scriptVer:state.scriptVer};}
function saveLocal(){if(localWritesFrozen())return;try{localStorage.setItem(KEY,JSON.stringify(payload()));}catch(e){toast("Couldn't save — storage full or blocked");}}

/* ---------------- cloud sync (private GitHub repo via Contents API) ---------------- */
var SYNC_KEY="wl_sync",DIRTY_KEY="wl_dirty",LAST_KEY="wl_lastsync",GH_PATH="data.json",DEFAULT_REPO="kaleyeah/weight-data",DEFAULT_BRANCH="main";
var syncState={s:"idle",msg:""},pushTimer=null,pushing=false,ghSha=null;
function normRepo(s){return (s||"").trim().replace(/^https?:\/\/github\.com\//i,"").replace(/\.git$/i,"").replace(/^\/+|\/+$/g,"");}
function markDirty(v){try{localStorage.setItem(DIRTY_KEY,v?"1":"0");}catch(e){}}
function isDirty(){return localStorage.getItem(DIRTY_KEY)==="1";}
function setLastSync(){try{localStorage.setItem(LAST_KEY,String(Date.now()));}catch(e){}}
function getLastSync(){var v=+localStorage.getItem(LAST_KEY);return v>0?v:null;}
function fmtClock(ts){return new Date(ts).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"});}
function lastSyncText(){var t=getLastSync();return t?("synced "+fmtClock(t)):"";}
function syncLabel(){return {ok:"Synced",saving:"Saving…",syncing:"Syncing…",offline:"Offline",error:"Sync error"}[syncState.s]||"";}
function syncDotClass(){var s=syncState.s;return s==="ok"?"good":(s==="saving"||s==="syncing")?"warn":(s==="offline"||s==="error")?"bad":"idle";}
function setSync(s,msg){
  /* Core and training share this one indicator. A blocked recovery is a durable
     safety state, not a transient status, so an ordinary core save landing a
     moment later must not be able to report "Synced" over the top of it. */
  if(recoveryBlocked){s="error";msg=recoveryBlockReason;}
  syncState={s:s,msg:msg||""};
  var el=document.getElementById("wl-sync");if(el){el.className="wl-sync "+s;el.textContent=syncLabel();}
  var sd=document.getElementById("wl-sdot");if(sd)sd.className="wl-sdot "+syncDotClass();
  var tt=document.getElementById("wl-synctime");if(tt)tt.textContent=lastSyncText();
  var st=document.getElementById("wl-sync-status");if(st)st.innerHTML=syncStatusHTML();}
function syncStatusHTML(){if(!syncOn())return '<span style="color:var(--faint)">Not signed in on this device.</span>';
  var m={ok:"var(--good)",saving:"var(--accent)",syncing:"var(--accent)",offline:"var(--bad)",error:"var(--bad)",idle:"var(--muted)"}[syncState.s]||"var(--muted)";
  return '<span style="color:'+m+'">'+(syncLabel()||"Connected")+'</span>'+(syncState.msg?' <span style="color:var(--faint)">· '+esc(syncState.msg)+'</span>':'')+(getLastSync()?' <span style="color:var(--faint)">· '+lastSyncText()+'</span>':'');}
function b64enc(str){return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,function(_,h){return String.fromCharCode(parseInt(h,16));}));}
function b64dec(b64){b64=(b64||"").replace(/\s/g,"");if(!b64)return "";return decodeURIComponent(Array.prototype.map.call(atob(b64),function(c){return "%"+("00"+c.charCodeAt(0).toString(16)).slice(-2);}).join(""));}
function fileForUid(uid){return (!uid||uid==="owner")?"data.json":(uid==="partner"?"data-partner.json":"u-"+uid+".json");}
function applyCloud(d){if(!d)return;
  /* server data landing settles any deferred first-run question immediately */
  try{if(state.obDeferred)setTimeout(function(){onboardingGate(true);},0);}catch(e){}
  state.settings=Object.assign({},DEFAULT_SETTINGS,d.settings||{});
  state.weights=Array.isArray(d.weights)?d.weights:[];
  state.food=d.food||{};state.workouts=d.workouts||{};state.steps=d.steps||{};state.notes=d.notes||{};state.sleep=d.sleep||{};state.bodyfat=d.bodyfat||{};state.waist=d.waist||{};state.leanmass=d.leanmass||{};state.statuses=d.statuses||[];state.weeklySummary=d.weeklySummary||null;state.nightlySummary=d.nightlySummary||null;state.nightlyLog=d.nightlyLog||{};state.scriptVer=d.scriptVer||{};coachRptLoad();if(migrateCoachSeen())save();
  state.presets=(Array.isArray(d.presets)&&d.presets.length)?d.presets:DEFAULT_PRESETS.slice();state.skips=d.skips||{};state.glp=d.glp||glpDefault();state.ratings=(d.ratings&&typeof d.ratings==="object")?d.ratings:{};state.checkins=(d.checkins&&typeof d.checkins==="object")?d.checkins:{};glpNormalize();
  if(state.settings.macroAuto===undefined&&(num(state.settings.targetProtein)!=null||num(state.settings.targetCarbs)!=null||num(state.settings.targetFat)!=null))state.settings.macroAuto=false;
  if(state.settings.calTargetAuto===undefined&&num(state.settings.targetCalories)!=null)state.settings.calTargetAuto=false;
  applyAutoMacros();
  saveLocal();markDirty(false);applyTheme(state.settings.theme||"dark");}
function scheduleCloudPush(){if(!syncOn())return;markDirty(true);setSync("saving");clearTimeout(pushTimer);pushTimer=setTimeout(function(){cloudPush();},1400);}
var trainingSha=null,trainingPushTimer=null;
function trainingFile(){var uid=syncCfg().uid;return uid?("t-"+uid+".json"):"training.json";}
function localHasData(){return state.weights.length>0||Object.keys(state.food).length>0||Object.keys(state.workouts).length>0||num(state.settings.startingWeight)!=null;}
function cloudEmpty(d){return !d||((d.weights||[]).length===0&&Object.keys(d.food||{}).length===0&&Object.keys(d.workouts||{}).length===0&&(!d.settings||Object.keys(d.settings).length===0));}
function isSkip(date,field){return !!(state.skips&&state.skips[date]&&state.skips[date][field]);}
function setSkip(date,field,on){state.skips=state.skips||{};if(on){state.skips[date]=state.skips[date]||{};state.skips[date][field]=1;}else if(state.skips[date]){delete state.skips[date][field];if(!Object.keys(state.skips[date]).length)delete state.skips[date];}}
function dayStatus(iso){var arr=state.statuses||[];var t=todayISO();for(var i=0;i<arr.length;i++){var s=arr[i];if(!s||!s.start)continue;var end=s.end||t;if(iso>=s.start&&iso<=end)return s.type;}return null;}
function statusFor(iso){var arr=state.statuses||[];var t=todayISO();for(var i=0;i<arr.length;i++){var s=arr[i];if(!s||!s.start)continue;var end=s.end||t;if(iso>=s.start&&iso<=end)return {idx:i,status:s};}return null;}
function statusBannerHTML(sel){var sf=statusFor(sel);
  if(sf){var st=sf.status;var isVac=st.type==="vacation";var range=st.end?(fmtShort(parseISO(st.start))+" \u2013 "+fmtShort(parseISO(st.end))):("Since "+fmtShort(parseISO(st.start)));
    var msg=isVac?"Enjoy it \u2014 logging\u2019s optional, and a week won\u2019t undo months. Back to routine after.":"Rest is the priority. No pressure to train or hit targets \u2014 the scale will bounce and that\u2019s expected.";
    return '<button class="wl-statusban '+(isVac?"vac":"sick")+'" data-act="status:open"><span class="wl-sb-em">'+(isVac?"\ud83c\udfd6\ufe0f":"\ud83e\udd12")+'</span><span class="wl-sb-t"><span class="wl-sb-h">'+(isVac?"Vacation":"Recovering")+' <span class="wl-sb-pill">'+range+'</span></span><span class="wl-sb-s">'+msg+'</span><span class="wl-sb-edit">Tap to edit or end \u203a</span></span></button>';}
  return '<button class="wl-status-link" data-act="status:open">\ud83c\udfd6\ufe0f Going away or under the weather? Set a status \u203a</button>';}
function obStepMsg(st){var f=state.settings;if(st===1){if(!(f.name&&(""+f.name).trim()))return "Add your name";return "";}if(st===2){if(!f.sex)return "Select male or female";if(num(f.age)==null)return "Add your age";if(num(f.heightFt)==null)return "Add your height";return "";}if(st===3){if(num(f.startingWeight)==null)return "Add your current weight";if(num(f.goalWeight)==null)return "Add your target weight";return "";}if(st===5){if(!f.activityLevel)return "Pick your activity level";return "";}return "";}
function _b64url(str){return b64enc(str).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");}
function _b64urldec(str){str=(str||"").replace(/-/g,"+").replace(/_/g,"/");while(str.length%4)str+="=";return b64dec(str);}
/* Called once the first pull has had a chance to land. If the account really
   has no data, first-time setup opens as before; if data arrived, the account
   is marked onboarded and setup is never shown. Either way the DECISION is made
   with the server's answer in hand rather than before it. */
/* Resolve a deferred first-run decision — and ONLY on evidence.
   The first version of this ran on a 1200ms timer after boot and opened setup
   whenever the pull had not landed yet, which on a real device over Tailscale
   is most of the time. It turned "we don't know yet" into "you're a new user"
   and put the setup screen back on the Owner's iPad (2026-08-03).
   serverAnswered must be TRUE — a confirmed read — before setup can ever open.
   With no answer we stay quiet: an empty app is recoverable, a stamped default
   core is what caused the original collision. */
function onboardingGate(serverAnswered){
  if(!state.obDeferred)return;
  var hasData=(state.weights.length>0)||Object.keys(state.food||{}).length>0||
    Object.keys(state.steps||{}).length>0||Object.keys(state.sleep||{}).length>0||
    num(state.settings.goalWeight)!=null||num(state.settings.startingWeight)!=null||
    !!(state.settings.name&&(""+state.settings.name).trim());
  if(hasData){state.obDeferred=false;state.settings.onboarded=true;save();render();return;}
  if(serverAnswered!==true)return;          /* no answer yet — decide nothing */
  state.obDeferred=false;
  state.onboarding=true;state.obStep=0;render();
}
function obnav(last){return '<div class="wl-ob-nav"><button class="wl-btn wl-btn-ghost" style="flex:1" data-act="ob:back">Back</button><button class="wl-btn wl-btn-primary" style="flex:2" data-act="ob:next">'+(last?"Finish":"Continue")+'</button></div>';}
function obDots(active){var d='';for(var i=1;i<=7;i++)d+='<span class="wl-obdot'+(i===active?" on":(i<active?" done":""))+'"></span>';return '<div class="wl-ob-brandbar">'+BRANDMARK.replace('width="18" height="18"','width="30" height="30"')+'<span class="wl-ob-bw">COMPOUND</span></div><div class="wl-obdots">'+d+'</div>';}
function obOverlayHTML(){
  if(!state.onboarding)return '';
  var step=state.obStep||0;var f=state.settings;var u=f.units||"lbs";
  var big=BRANDMARK.replace('width="18" height="18"','width="54" height="54"');
  var h='<div class="wl-ob"><div class="wl-ob-inner">';
  if(step===0){
    h+='<div class="wl-ob-hero">'+big+'<div class="wl-ob-brand">COMPOUND</div><div class="wl-ob-tag">Strength \u00b7 in reps \u00b7 over years</div></div>';
    h+='<div class="wl-ob-body"><div class="wl-ob-h">Welcome</div><div class="wl-ob-sub">Answer a few quick questions and we\u2019ll build your plan. First, what Compound believes:</div><div class="wl-ob-princ">'+[["Protein first","then calories, then the rest."],["Think in years","consistency beats intensity \u2014 the trend matters, not one day."],["The smallest deficit that works","lose fat without crashing your energy or muscle."],["Lift to keep what you build","the scale isn\u2019t the whole story."]].map(function(p){return '<div class="wl-ob-pr"><span class="wl-ob-prd"></span><span><b>'+p[0]+'</b> \u2014 '+p[1]+'</span></div>';}).join("")+'</div></div>';
    h+='<div class="wl-ob-nav"><button class="wl-btn wl-btn-primary wl-full" data-act="ob:next">Get started</button></div>';
    h+='<button class="wl-ob-skip" data-act="ob:skip">Skip for now</button>';
  }else if(step===1){
    h+=obDots(1)+'<div class="wl-ob-body"><div class="wl-ob-h">Your name</div><div class="wl-ob-sub">What should I call you? Your coach <b>Max</b> uses this to greet you in your check-ins.</div>';
    h+='<label class="wl-field wl-field-full" style="margin-top:16px"><span>First name</span><input data-set="name" type="text" value="'+esc(f.name||"")+'" placeholder="First name" autocapitalize="words"></label></div>'+obnav();
  }else if(step===2){
    h+=obDots(2)+'<div class="wl-ob-body"><div class="wl-ob-h">About you</div>';
    h+='<label class="wl-field wl-field-full" style="margin-top:16px"><span>Sex</span><div class="wl-seg"><button class="'+(f.sex==="male"?"on":"")+'" data-act="set:sex" data-sex="male">Male</button><button class="'+(f.sex==="female"?"on":"")+'" data-act="set:sex" data-sex="female">Female</button></div></label>';
    h+='<div class="wl-row" style="margin-top:12px"><label class="wl-field"><span>Age</span><input class="wl-num" data-int="1" data-set="age" type="text" inputmode="numeric" value="'+esc(f.age||"")+'" placeholder="\u2014"></label><label class="wl-field"><span>Height (ft)</span><input class="wl-num" data-int="1" data-set="heightFt" type="text" inputmode="numeric" value="'+esc(f.heightFt||"")+'" placeholder="ft"></label><label class="wl-field"><span>(in)</span><input class="wl-num" data-int="1" data-set="heightIn" type="text" inputmode="numeric" value="'+esc(f.heightIn||"")+'" placeholder="in"></label></div><div class="wl-ob-sub" style="margin-top:16px">We use these to estimate your calories and macros \u2014 you can change everything later in Settings.</div></div>'+obnav();
  }else if(step===3){
    h+=obDots(3)+'<div class="wl-ob-body"><div class="wl-ob-h">Your weight</div><div class="wl-ob-sub">Where you are now, and your goal.</div>';
    h+='<label class="wl-field wl-field-full" style="margin-top:16px"><span>Units</span><div class="wl-seg">'+["lbs","kg"].map(function(x){return '<button class="'+(u===x?"on":"")+'" data-act="set:units" data-units="'+x+'">'+x+'</button>';}).join("")+'</div></label>';
    h+='<div class="wl-row" style="margin-top:12px"><label class="wl-field"><span>Current <em>'+u+'</em></span><input class="wl-num" data-set="startingWeight" type="text" inputmode="decimal" value="'+esc(f.startingWeight)+'" placeholder="\u2014"></label><label class="wl-field"><span>Goal <em>'+u+'</em></span><input class="wl-num" data-set="goalWeight" type="text" inputmode="decimal" value="'+esc(f.goalWeight)+'" placeholder="\u2014"></label></div></div>'+obnav();
  }else if(step===4){
    h+=obDots(4)+'<div class="wl-ob-body"><div class="wl-ob-h">Your plan</div><div class="wl-ob-sub">What are you working toward right now?</div>';
    h+='<div class="wl-seg wl-seg-wide" style="margin-top:14px">'+[["lose","Fat Loss"],["maintain","Maintenance"],["gain","Lean Bulk"]].map(function(m){return '<button class="'+((f.strategy||"lose")===m[0]?"on":"")+'" data-act="set:strategy" data-strat="'+m[0]+'">'+m[1]+'</button>';}).join("")+'</div>';
    h+='<div class="wl-hint" style="margin-top:12px">Most people should get lean first. You\u2019ll move through phases over time \u2014 your coach will guide it.</div></div>'+obnav();
  }else if(step===5){
    h+=obDots(5)+'<div class="wl-ob-body"><div class="wl-ob-h">Activity level</div><div class="wl-ob-sub"><b>Pick what you\u2019ll actually be doing going forward</b> \u2014 not necessarily where you are today. This sets your calorie target, so choose the routine you\u2019re committing to.</div>';
    h+='<div class="wl-optlist" style="margin-top:14px">'+ALEVELS.filter(function(_a){return _a[0]!=="bmr"&&_a[0]!=="physical";}).map(function(x){var on=f.activityLevel===x[0];return '<button class="wl-opt'+(on?" on":"")+'" data-act="set:activity" data-level="'+x[0]+'"><span>'+x[1]+'</span>'+(on?'<span class="wl-opt-ck">'+I.check.replace("<svg","<svg width=15 height=15")+'</span>':'')+'</button>';}).join("")+'</div></div>'+obnav();
  }else if(step===6){
    h+=obDots(6)+'<div class="wl-ob-body"><div class="wl-ob-h">Calories &amp; macros</div>';
    var canCalc=maintenanceCals()!=null;
    h+='<div class="wl-ob-sub">'+(canCalc?"Estimated from your details, activity, and plan \u2014 tweak anything.":"Enter your daily targets. (Add sex, age &amp; height earlier to auto-estimate these.)")+'</div>';
    var _cw=num(f.startingWeight),_gw=num(f.goalWeight);if(_cw!=null&&_gw!=null&&(f.strategy||"lose")!=="maintain"){var _rt=num(f.targetValue)||1;var _wks=Math.abs(_cw-_gw)/_rt;var _pdt=addDays(parseISO(todayISO()),Math.round(_wks*7));h+='<div class="wl-ob-proj">On track to reach <b>'+r1(_gw)+' '+u+'</b> in about <b>'+Math.round(_wks)+' weeks</b> \u2014 around <b>'+_pdt.toLocaleDateString(undefined,{month:"long",year:"numeric"})+'</b>.</div>';}h+='<label class="wl-field wl-field-full" style="margin-top:14px"><span>Daily calories</span><input class="wl-num" data-int="1" data-set="targetCalories" type="text" inputmode="numeric" value="'+esc(f.targetCalories)+'" placeholder="\u2014"></label>';
    h+='<div class="wl-row" style="margin-top:10px"><label class="wl-field"><span>Protein <em>g</em></span><input class="wl-num" data-int="1" data-set="targetProtein" type="text" inputmode="numeric" value="'+esc(f.targetProtein)+'" placeholder="\u2014"></label><label class="wl-field"><span>Carbs <em>g</em></span><input class="wl-num" data-int="1" data-set="targetCarbs" type="text" inputmode="numeric" value="'+esc(f.targetCarbs)+'" placeholder="\u2014"></label><label class="wl-field"><span>Fat <em>g</em></span><input class="wl-num" data-int="1" data-set="targetFat" type="text" inputmode="numeric" value="'+esc(f.targetFat)+'" placeholder="\u2014"></label></div>';
    if(canCalc)h+='<div class="wl-hint" style="margin-top:10px"><button class="wl-link" data-act="ob:recalc" style="display:inline">\u21bb Recalculate from my info</button> \u00b7 protein anchored near 1g/lb of goal weight.</div>';
    h+='</div>'+obnav();
  }else if(step===7){
    h+=obDots(7)+'<div class="wl-ob-body"><div class="wl-ob-h">Weekly check-in</div><div class="wl-ob-sub">Which day should your coach recap your week?</div>';
    h+='<div class="wl-daypick" style="margin-top:14px">'+WEEKDAYS.map(function(dn,i){return '<button class="wl-day'+((parseInt(f.weekStart,10)||0)===i?" on":"")+'" data-act="set:weekstart" data-day="'+i+'">'+dn+'</button>';}).join("")+'</div></div>'+obnav();
  }else if(step===8){
    var _cw=num(f.startingWeight),_gw=num(f.goalWeight),_strat=f.strategy||"lose";
    var _stratLbl=(_strat==="gain"?"Lean Bulk":_strat==="maintain"?"Maintenance":"Fat Loss");
    var _cal=num(f.targetCalories),_prot=num(f.targetProtein);
    var _nm=(f.name&&(""+f.name).trim())?(""+f.name).trim():"";
    var _projStr="";if(_cw!=null&&_gw!=null&&_strat!=="maintain"){var _rt=num(f.targetValue)||1;var _wks=Math.abs(_cw-_gw)/_rt;var _pdt=addDays(parseISO(todayISO()),Math.round(_wks*7));_projStr=_pdt.toLocaleDateString(undefined,{month:"long",year:"numeric"});}
    h+='<div class="wl-ob-brandbar">'+BRANDMARK.replace('width="18" height="18"','width="30" height="30"')+'<span class="wl-ob-bw">COMPOUND</span></div>';
    h+='<div class="wl-coachrow"><div class="wl-coachav">M</div><div><div class="wl-coachwho">Your coach</div><div class="wl-coachname">Coach Max</div></div></div>';
    h+='<div class="wl-ob-body"><div class="wl-ob-h">Here\u2019s the plan'+(_nm?", "+esc(_nm):"")+'</div>';
    h+='<div class="wl-ob-sub">I\u2019m Max \u2014 I\u2019ll check in with you every night and run the numbers with you each week. Here\u2019s what we\u2019re working with:</div>';
    h+='<div class="wl-planbox">';
    if(_cw!=null)h+='<div class="wl-planrow"><span>Where you are</span><span>'+r1(_cw)+' '+u+'</span></div>';
    h+='<div class="wl-planrow"><span>'+(_strat==="maintain"?"Holding at":"Where we\u2019re headed")+'</span><span class="acc">'+(_gw!=null?r1(_gw)+" "+u:"\u2014")+' \u00b7 '+_stratLbl+'</span></div>';
    if(_cal!=null)h+='<div class="wl-planrow"><span>Daily calories</span><span>'+_cal.toLocaleString()+'</span></div>';
    if(_prot!=null)h+='<div class="wl-planrow"><span>Protein target</span><span>'+_prot+' g</span></div>';
    if(_projStr)h+='<div class="wl-planrow"><span>Projected goal</span><span>~ '+_projStr+'</span></div>';
    h+='</div>';
    h+='<div class="wl-ob-sub">'+(_strat==="gain"?"The plan is a small, controlled surplus \u2014 enough to build muscle without piling on fat. Protein first, keep lifting hard, be patient.":_strat==="maintain"?"The plan is to hold steady and keep the muscle you\u2019ve built. Protein first, keep lifting, let the habits run.":"The plan is the smallest deficit that actually works \u2014 enough to lose fat steadily, not so much that you burn out or lose muscle. Protein first, hit your calories, keep lifting. That\u2019s the whole game.")+'</div>';
    h+='<div class="wl-ob-proj" style="margin-top:16px"><b>One thing to be clear about:</b> those calories are an <b>estimate</b> \u2014 a smart starting point, not a law. For the next <b>2 weeks</b>, your only job is to hit protein, stay near calories, and <b>log honestly</b>. Don\u2019t read into the daily scale \u2014 water and food weight bounce it around.</div>';
    h+='<div class="wl-ob-sub" style="margin-top:14px">At your check-ins I\u2019ll look at what <b>actually</b> happened over those two weeks and adjust. If the scale isn\u2019t moving how we\u2019d expect, we change the <b>number</b>, not the effort \u2014 two weeks of real data beats any calculator.</div>';
    h+='<div class="wl-ob-sub" style="margin-top:14px">The app does this with me: once you\u2019ve logged ~3 weeks, the <b>Metabolism</b> card on the Progress tab measures your <b>real</b> burn rate from your own food logs and weigh-ins \u2014 and when the data says the plan should change, it proposes exact new targets (calories, macros, steps, cardio) you can apply with one tap.</div>';
    h+='<div class="wl-coachsig">Let\u2019s get to work. \u2014 <b>Max</b></div></div>';
    h+='<div class="wl-ob-nav"><button class="wl-btn wl-btn-primary wl-full" data-act="ob:next">Continue</button></div>';
  }else{
    h+='<div class="wl-ob-hero">'+big+'<div class="wl-ob-brand">COMPOUND</div><div class="wl-ob-tag">Strength \u00b7 in reps \u00b7 over years</div></div>';
    var _standalone=(window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches)||window.navigator.standalone===true;
    var _isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
    var _share='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:-3px"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-1"/></svg>';
    h+='<div class="wl-ob-body"><div class="wl-ob-h">You\u2019re all set'+(f.name?", "+esc(f.name):"")+'</div>';
    if(_standalone)h+='<div class="wl-ob-sub">You\u2019re on your Home Screen and ready to go. Log your first check-in whenever you like.</div>';
    else if(_isIOS)h+='<div class="wl-ob-sub">One last step \u2014 add Compound to your Home Screen so it opens full-screen like a real app. That\u2019s how it works best.</div><div class="wl-ob-steps"><div class="wl-ob-step"><span class="wl-ob-stepn">1</span><span class="wl-ob-stept">Tap the <b>Share</b> button '+_share+' in the Safari toolbar.</span></div><div class="wl-ob-step"><span class="wl-ob-stepn">2</span><span class="wl-ob-stept">Scroll down and tap <b>Add to Home Screen</b>.</span></div><div class="wl-ob-step"><span class="wl-ob-stepn">3</span><span class="wl-ob-stept">Tap <b>Add</b>, then open Compound from your Home Screen.</span></div></div>';
    else if(deferredPrompt)h+='<div class="wl-ob-sub">Add Compound to your home screen so it opens like an app \u2014 that\u2019s how it works best.</div><button class="wl-btn wl-btn-ghost wl-full" style="margin-top:16px" data-act="ob:install">Add to Home Screen</button>';
    else h+='<div class="wl-ob-sub">For the best experience, add Compound to your home screen from your browser menu \u2014 it opens like an app.</div>';
    h+='<div class="wl-hint" style="margin-top:16px">You can change any of this \u2014 your plan, targets, name, or check-in day \u2014 anytime in <b>Settings</b>.</div>';
    h+='</div>';
    h+='<div class="wl-ob-nav"><button class="wl-btn wl-btn-primary wl-full" data-act="ob:finish">Start using Compound</button></div>';
  }
  return h+'</div></div>';}
function statusSheetHTML(){if(!state.statusOpen)return "";var sf=state.statusForm||{};var editing=sf.idx>=0;
  var h='<div class="wl-confirm"><div class="wl-confirm-card">';
  h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px"><div style="font-weight:800;font-size:17px">'+(editing?"Edit status":"Set a status")+'</div><button class="wl-icon-btn" data-act="status:close">\u2715</button></div>';
  h+='<div class="wl-hint" style="margin-bottom:12px">Away, sick, or taking a break \u2014 tell your coach so it eases up, and the day still counts as checked in.</div>';
  h+='<div class="wl-seg wl-seg-wide" style="margin-bottom:12px">'+[["vacation","\ud83c\udfd6\ufe0f Vacation"],["sick","\ud83e\udd12 Sick"]].map(function(m){return '<button class="'+(sf.type===m[0]?"on":"")+'" data-act="status:type" data-type="'+m[0]+'">'+m[1]+'</button>';}).join("")+'</div>';
  h+='<label class="wl-field wl-field-full"><span>From</span><input type="date" class="wl-status-start wl-datein" value="'+(sf.start||"")+'"></label>';
  h+='<div class="wl-hint" style="margin-top:8px">Stays on until you end it from Settings \u2014 just tap End when you\u2019re back.</div>';
  h+='<button class="wl-btn wl-btn-primary wl-full" style="margin-top:14px" data-act="status:save">'+(editing?"Update":("Start "+(sf.type==="sick"?"sick":"vacation")+" mode"))+'</button>';
  if(editing)h+='<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px" data-act="status:end">End now</button>';
  return h+'</div></div>';}
function dayMissing(sel){sel=sel||state.selDate;if(dayStatus(sel))return [];var miss=[];
  if(!state.weights.some(function(x){return x.date===sel;})&&!isSkip(sel,"weight"))miss.push("weight");
  if(num(state.steps[sel])==null&&!isSkip(sel,"steps"))miss.push("steps");
  if(num(state.sleep[sel])==null&&!isSkip(sel,"sleep"))miss.push("sleep");
  var f=state.food[sel]||{};if(num(f.calories)==null&&num(f.protein)==null&&num(f.carbs)==null&&num(f.fat)==null&&!isSkip(sel,"calories"))miss.push("calories");
  return miss;}

/* ---------------- computations ---------------- */
function sortedWeights(){return state.weights.slice().sort(function(a,b){return a.date.localeCompare(b.date);});}
function currentWeightAvg(){var w=null;var pc=prepChart();
  if(pc.data&&pc.data.length)w=pc.data[pc.data.length-1].avg;
  if(w==null){var sw=sortedWeights();if(sw.length)w=sw[sw.length-1].weight;}
  if(w==null)w=num(state.settings.startingWeight);
  return w;}
function currentWeightKg(){var w=currentWeightAvg();if(w==null)return null;return state.settings.units==="kg"?w:w*0.45359237;}
function bmr(){var s=state.settings;
  if(s.sex!=="male"&&s.sex!=="female")return null;
  var age=num(s.age);if(age==null)return null;
  var ft=num(s.heightFt);if(ft==null)return null;
  var inch=num(s.heightIn)||0;var H=(ft*12+inch)*2.54;
  var wKg=currentWeightKg();if(wKg==null)return null;
  return Math.round(10*wKg+6.25*H-5*age+(s.sex==="male"?5:-161));}
function bmrText(){var b=bmr();return b!=null?(b.toLocaleString()+" cal/day"):"—";}
var ACTIVITY={bmr:1,sedentary:1.2,light:1.375,moderate:1.4625,active:1.55,intense:1.725,physical:1.9};
var ALEVELS=[["bmr","Basal Metabolic Rate (BMR)"],["sedentary","Little or no exercise"],["light","Exercise 1–3 times/week"],["moderate","Exercise 4–5 times/week"],["active","Daily exercise or intense 3–4×/week"],["intense","Intense exercise 6–7 times/week"],["physical","Very intense daily, or physical job"]];
function alLabel(k){for(var i=0;i<ALEVELS.length;i++)if(ALEVELS[i][0]===k)return ALEVELS[i][1];return "Not set";}
function profileComplete(){var s=state.settings;return !!(s.sex&&num(s.age)!=null&&num(s.heightFt)!=null&&num(s.startingWeight)!=null&&s.activityLevel);}
function activityMult(){return ACTIVITY[state.settings.activityLevel]||null;}
function maintenanceCals(){var b=bmr();var m=activityMult();return (b!=null&&m!=null)?Math.round(b*m):null;}
function dailyDeficit(){var s=state.settings;var tv=num(s.targetValue);if(tv==null||tv<=0)return 0;
  var weekly;
  if(s.targetType==="percent_bw_per_week"){var cw=currentWeightAvg();if(cw==null)return 0;weekly=(tv/100)*cw;}
  else weekly=tv;
  var weeklyLbs=s.units==="kg"?weekly*2.20462:weekly;
  return weeklyLbs*500;}
function strategyMode(){return state.settings.strategy||"lose";}
function dailyDelta(){var m=strategyMode();if(m==="maintain")return 0;var mag=dailyDeficit();return m==="gain"?mag:-mag;}
function targetIntake(){var m=maintenanceCals();if(m==null)return null;return Math.round(m+dailyDelta());}
function suggestedProteinG(){var gw=num(state.settings.goalWeight);if(gw==null)return null;var lbs=state.settings.units==="kg"?gw*2.20462:gw;return Math.round(lbs);}
function stratLabel(){var m=strategyMode();return m==="gain"?"To gain":m==="maintain"?"Maintain at":"To lose";}
function calSummaryHTML(){var b=bmr();if(b==null)return "Add sex, age &amp; height above to calculate.";
  var m=maintenanceCals(),t=targetIntake();
  var s='BMR <b>'+b.toLocaleString()+'</b> · Maintenance <b>'+m.toLocaleString()+'</b>';
  if(t!=null){s+=' · '+stratLabel()+' <b>'+t.toLocaleString()+'</b>';if(t<1200)s+=' <span style="color:var(--bad)">(under ~1200/day — consider a gentler goal)</span>';}
  var sp=suggestedProteinG();if(sp!=null)s+=' · protein target <b>'+sp+'g</b> (1g/lb of target weight)';
  return s+' cal/day';}
function suggestedMacros(){var cal=num(state.settings.targetCalories);if(cal==null)cal=targetIntake();if(cal==null)return null;var pro;if(state.settings.proteinAuto===false){pro=num(state.settings.targetProtein);}else{pro=suggestedProteinG();}if(pro==null)return null;var fat=Math.round(cal*0.20/9);if(fat<40)fat=40;var carb=Math.round(Math.max(0,cal-pro*4-fat*9)/4);return {protein:pro,carbs:carb,fat:fat,cal:cal};}
function applyAutoCalTarget(){if(state.settings.calTargetAuto===false)return false;var t=targetIntake();if(t==null)return false;state.settings.targetCalories=String(t);return true;}
function applyAutoMacros(){applyAutoCalTarget();if(state.settings.macroAuto===false)return false;var sm=suggestedMacros();if(!sm)return false;if(state.settings.proteinAuto!==false)state.settings.targetProtein=String(sm.protein);state.settings.targetCarbs=String(sm.carbs);state.settings.targetFat=String(sm.fat);return true;}
function syncMacroInputs(){["targetCalories","targetProtein","targetCarbs","targetFat"].forEach(function(k){var el=document.querySelector('[data-set="'+k+'"]');if(el&&document.activeElement!==el)el.value=state.settings[k]||"";});}
function macroNoticeHTML(){var sm=suggestedMacros();if(!sm)return "";if(state.settings.macroAuto!==false||state.settings.macroDismiss)return "";var p=num(state.settings.targetProtein),c=num(state.settings.targetCarbs),f=num(state.settings.targetFat);if(p===sm.protein&&c===sm.carbs&&f===sm.fat)return "";return '<div class="wl-calnote"><span>Suggested: <b>'+sm.protein+'g</b> P · <b>'+sm.carbs+'g</b> C · <b>'+sm.fat+'g</b> F <span style="color:var(--faint)">(protein anchored, fat 20% min 40g, rest carbs)</span>.</span><span class="wl-calnote-actions"><button class="wl-calnote-btn" data-act="macro:suggest">Use suggested</button><button class="wl-calnote-btn ghost" data-act="macro:keep">Keep mine</button></span></div>';}
function macroPctHTML(){var s=state.settings;
  var p=num(s.targetProtein),c=num(s.targetCarbs),ft=num(s.targetFat);
  if(p==null&&c==null&&ft==null)return "Enter gram targets to see their total calories and share of your daily total.";
  var total=(p||0)*4+(c||0)*4+(ft||0)*9;
  var cal=num(s.targetCalories);if(cal==null)cal=(targetIntake()||maintenanceCals());
  var out="";
  if(cal&&cal>0){var parts=[];[["Protein",p,4],["Carbs",c,4],["Fat",ft,9]].forEach(function(m){if(m[1]!=null)parts.push(m[0]+" <b>"+Math.round(m[1]*m[2]/cal*100)+"%</b>");});if(parts.length)out=parts.join(" · ")+" of your "+cal.toLocaleString()+"-cal target · ";}
  var out2=out+'macros total <b>'+Math.round(total).toLocaleString()+' cal</b>';
  var sp=suggestedProteinG();if(sp!=null)out2+='<br>💪 Suggested protein <b>'+sp+'g</b> (1g per lb of target weight) to protect muscle.';
  return out2;}
function prepChart(src){
  var sw=(src||state.weights).slice().sort(function(a,b){return a.date.localeCompare(b.date);});if(!sw.length)return {data:[],slope:null,intercept:null};
  var pts=sw.map(function(x){return {ts:parseISO(x.date).getTime(),weight:x.weight,date:x.date};});
  var slope=null,intercept=null;
  /* a regression needs real data behind it: 2 points always fit a line perfectly and report a
     confident weekly rate that is pure noise. Below PACE_MIN_WEIGHINS there is no slope at all,
     which blanks the pace chip, the chart trend line and the observed forecast together. */
  if(pts.length>=PACE_MIN_WEIGHINS){var n=pts.length,mx=0,my=0;
    pts.forEach(function(p){mx+=p.ts;my+=p.weight;});mx/=n;my/=n;
    var sxy=0,sxx=0;pts.forEach(function(p){sxy+=(p.ts-mx)*(p.weight-my);sxx+=(p.ts-mx)*(p.ts-mx);});
    if(sxx!==0){slope=sxy/sxx;intercept=my-slope*mx;}}
  var data=pts.map(function(p){var lo=p.ts-6*DAY;var win=pts.filter(function(q){return q.ts>=lo&&q.ts<=p.ts;});
    var avg=win.reduce(function(a,q){return a+q.weight;},0)/win.length;
    var reg=slope!=null?slope*p.ts+intercept:null;
    return {ts:p.ts,weight:p.weight,avg:r1(avg),reg:reg!=null?r1(reg):null,date:p.date};});
  return {data:data,slope:slope,intercept:intercept};
}
function computeForecasts(current,goal,slope){
  if(current==null||goal==null)return {target:null,observed:null,done:false};
  if(current<=goal)return {target:null,observed:null,done:true};
  var out={target:null,observed:null,done:false};
  var tv=num(state.settings.targetValue);
  if(tv&&tv>0){var weeks=null;
    if(state.settings.targetType==="percent_bw_per_week"){var p=tv/100;if(p>0&&p<1)weeks=Math.log(goal/current)/Math.log(1-p);}
    else weeks=(current-goal)/tv;
    if(weeks!=null&&weeks>0&&isFinite(weeks))out.target={weeks:weeks,date:new Date(Date.now()+weeks*7*DAY)};}
  if(slope!=null){var lossPerWeek=-slope*7*DAY;
    if(lossPerWeek>0){var w=(current-goal)/lossPerWeek;if(w>0&&isFinite(w))out.observed={weeks:w,date:new Date(Date.now()+w*7*DAY),rate:lossPerWeek};}
    else out.observed={stalled:true};}
  return out;
}
function missingDays(){var list=[];var ws=parseInt(state.settings.weekStart,10)||0;var now=new Date();now.setHours(0,0,0,0);var diff=(now.getDay()-ws+7)%7;
  for(var i=0;i<=diff;i++){var d=new Date(now.getFullYear(),now.getMonth(),now.getDate()-i);var iso=toISO(d);var e=state.food[iso];
    var empty=!e||(num(e.calories)==null&&num(e.protein)==null&&num(e.carbs)==null&&num(e.fat)==null);
    if(empty)list.push(iso);}return list;}

/* ---------------- chart (svg) ---------------- */
function buildChart(c,goal,unit,compact,rmin,rmax){
  var data=c.data;if(!data.length)return '<div class="wl-empty">No weigh-ins yet. Add your first one to see the chart.</div>';
  var W=340,H=compact?150:200,padL=34,padR=12,padT=14,padB=22;
  var ys=[];data.forEach(function(d){ys.push(d.weight);if(d.avg!=null)ys.push(d.avg);if(d.reg!=null)ys.push(d.reg);});
  if(goal!=null)ys.push(goal);
  var mn=Math.min.apply(null,ys),mx=Math.max.apply(null,ys);var padY=Math.max(1,(mx-mn)*0.14);
  var yMin=Math.floor(mn-padY),yMax=Math.ceil(mx+padY);if(yMin===yMax){yMax=yMin+2;}
  var xMin=(rmin!=null)?rmin:data[0].ts,xMax=(rmax!=null)?rmax:data[data.length-1].ts;if(xMin>data[0].ts)xMin=data[0].ts;if(xMax<data[data.length-1].ts)xMax=data[data.length-1].ts;if(xMin===xMax){xMin-=DAY;xMax+=DAY;}
  function sx(t){return padL+(t-xMin)/(xMax-xMin)*(W-padL-padR);}
  function sy(w){return (H-padB)-(w-yMin)/(yMax-yMin)*(H-padT-padB);}
  var s='<svg class="wl-chart" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" style="height:'+H+'px">';
  for(var i=0;i<=4;i++){var yv=yMin+(yMax-yMin)*i/4;var y=sy(yv);
    s+='<line x1="'+padL+'" y1="'+y+'" x2="'+(W-padR)+'" y2="'+y+'" stroke="'+CH.grid+'" stroke-dasharray="2 4"/>';
    s+='<text x="'+(padL-5)+'" y="'+(y+3)+'" fill="'+CH.axis+'" font-size="9" text-anchor="end">'+Math.round(yv)+'</text>';}
  [[xMin,"start"],[(xMin+xMax)/2,"middle"],[xMax,"end"]].forEach(function(pr){
    s+='<text x="'+sx(pr[0])+'" y="'+(H-6)+'" fill="'+CH.axis+'" font-size="9" text-anchor="'+pr[1]+'">'+fmtShort(new Date(pr[0]))+'</text>';});
  if(goal!=null){var gy=sy(goal);s+='<line x1="'+padL+'" y1="'+gy+'" x2="'+(W-padR)+'" y2="'+gy+'" stroke="'+CH.goal+'" stroke-width="1.3" stroke-dasharray="5 4"/>';
    s+='<text x="'+(W-padR)+'" y="'+(gy-4)+'" fill="'+CH.goal+'" font-size="9" text-anchor="end">Goal '+r1(goal)+'</text>';}
  if(c.slope!=null){var r0=sy(c.slope*xMin+c.intercept),r1e=sy(c.slope*xMax+c.intercept);
    s+='<line x1="'+sx(xMin)+'" y1="'+r0+'" x2="'+sx(xMax)+'" y2="'+r1e+'" stroke="'+CH.reg+'" stroke-width="1.6" stroke-dasharray="6 5"/>';}
  var actual="",avg="";data.forEach(function(d,i){var X=sx(d.ts);actual+=(i?"L":"M")+X+" "+sy(d.weight)+" ";avg+=(i?"L":"M")+X+" "+sy(d.avg)+" ";});
  s+='<path d="'+avg+'" fill="none" stroke="'+CH.avg+'" stroke-width="2.4" stroke-linejoin="round"/>';
  s+='<path d="'+actual+'" fill="none" stroke="'+CH.actualLine+'" stroke-width="1.1"/>';
  data.forEach(function(d){s+='<circle data-act="chart:pt" data-ts="'+d.ts+'" data-w="'+d.weight+'" data-avg="'+d.avg+'" cx="'+sx(d.ts)+'" cy="'+sy(d.weight)+'" r="3.2" fill="'+CH.actual+'"/>';});
  s+='</svg>';
  var last=data[data.length-1];
  s+='<div class="wl-readout" id="wl-readout"><b>'+r1(last.weight)+'</b> '+unit+' · '+fmtShort(new Date(last.ts))+' (latest)</div>';
  if(!compact)s+='<div class="wl-legend"><span><i style="background:'+CH.actual+'"></i>Actual</span><span><i style="background:'+CH.avg+'"></i>7-day avg</span>'+(c.slope!=null?'<span><i style="background:'+CH.reg+'"></i>Trend</span>':'')+'<span><i style="background:'+CH.goal+'"></i>Goal</span></div>';
  return s;
}

/* ---------------- GLP-1 progress views (§7) ---------------- */
/* Tunables (documented assumptions, not in the spec verbatim):
   GLP_WIN_DAYS  — how close a weigh-in must fall to a level boundary to count as that
                   boundary's weight. Beyond this the boundary is treated as "no weight",
                   and per §9 the whole level period is omitted rather than shown as 0.
   GLP_EXPECT_WK — the "expected weeks at a level" used only for the in-progress footnote
                   copy ("X of an expected Y weeks"). Spec suggests a fixed 4. */
var GLP_WIN_DAYS=14, GLP_EXPECT_WK=4;
function glpProgEnabled(){return !!(state.glp&&state.glp.settings&&state.glp.settings.enabled);}
function glpNonSkipDoses(){return (state.glp&&state.glp.doses?state.glp.doses:[]).filter(function(d){return !d.skipped&&d.takenAt!=null;}).slice().sort(function(a,b){return a.takenAt-b.takenAt;});}
/* Level periods: a maximal run of consecutive non-skipped doses at one value. The run ends
   when the dose value changes (the next value's first dose is the boundary), so periods are
   contiguous. The final open run is the current, in-progress level and ends "now". */
function glpLevelPeriods(){
  var ds=glpNonSkipDoses();if(!ds.length)return [];
  var out=[],cur=null;
  ds.forEach(function(d){var v=num(d.dose);
    if(cur&&cur.dose===v){cur.lastAt=d.takenAt;}
    else{if(cur){cur.end=d.takenAt;out.push(cur);}cur={dose:v,start:d.takenAt,lastAt:d.takenAt,end:null,inProgress:false};}});
  if(cur){cur.end=Date.now();cur.inProgress=true;out.push(cur);}
  return out;
}
/* Nearest weigh-in to a timestamp, or null if none within GLP_WIN_DAYS. */
function glpNearestWeight(ts){
  var sw=sortedWeights();if(!sw.length)return null;
  var best=null,bd=null;
  for(var i=0;i<sw.length;i++){var wt=parseISO(sw[i].date).getTime();var dist=Math.abs(wt-ts);
    if(bd==null||dist<bd){bd=dist;best=sw[i];}}
  if(best==null||bd>GLP_WIN_DAYS*DAY)return null;
  return {date:best.date,weight:best.weight,ts:parseISO(best.date).getTime()};
}
/* Per-period weight math. valid=false → omitted from 7b (no usable boundary weights,
   or both boundaries snap to the same single weigh-in so the delta would be a fake 0). */
function glpPeriodStats(){
  return glpLevelPeriods().map(function(p){
    var sW=glpNearestWeight(p.start),eW=glpNearestWeight(p.end);
    var weeks=(p.end-p.start)/(7*DAY);
    var lost=null,valid=false;
    if(sW&&eW&&sW.date!==eW.date){lost=sW.weight-eW.weight;valid=true;}
    return {dose:p.dose,start:p.start,end:p.end,weeks:weeks,lost:lost,valid:valid,inProgress:p.inProgress};
  });
}
/* Aggregate periods into one bar per distinct dose value (handles the rare case of a value
   recurring across separate periods). Completed periods with no usable weight are dropped;
   an in-progress level is always kept (dashed) even if its own delta isn't computable yet. */
function glpDoseBars(){
  var stats=glpPeriodStats(),by={},order=[];
  stats.forEach(function(s){if(s.dose==null)return;var k=String(s.dose);
    if(!by[k]){by[k]={dose:s.dose,weeks:0,lost:0,valid:false,inProgress:false};order.push(k);}
    var g=by[k];g.weeks+=s.weeks;if(s.valid){g.lost+=s.lost;g.valid=true;}if(s.inProgress)g.inProgress=true;});
  var bars=order.map(function(k){return by[k];}).filter(function(g){return g.valid||g.inProgress;});
  bars.sort(function(a,b){return a.dose-b.dose;});
  bars.forEach(function(g){g.rate=(g.valid&&g.weeks>0)?(g.lost/g.weeks):null;});
  return bars;
}
/* Ascending dose rank → band tint. Spec's fixed .10/.17/.25/.34 for the usual ≤4 levels;
   >4 levels interpolate across the same range so it degrades instead of breaking. */
function glpBandOpacity(rank,total){
  var steps=[0.10,0.17,0.25,0.34];
  if(total<=1)return steps[0];
  if(total<=4)return steps[rank];
  return 0.10+(rank/(total-1))*(0.34-0.10);
}
/* 7a — symptom severity vs dose timing */
/* The symptom severity chart was retired 2026-08-02 (Owner: "It isn't really
   saying anything"). Symptom LOGGING stays; the data (glp.symptoms) is kept,
   exported, and available to the coach or a future view. Git holds the chart. */
/* 7b — weight lost by dose level */
function glpWeightByDoseCardHTML(){
  if(!glpProgEnabled())return "";
  var bars=glpDoseBars();
  var completed=bars.filter(function(b){return !b.inProgress&&b.valid;});
  var h='<div class="wl-card"><div class="wl-card-head"><span>Weight lost by dose</span></div>';
  if(!bars.length||(!completed.length&&!bars.some(function(b){return b.inProgress;}))){
    h+='<div class="wl-empty">Log doses at more than one level, with weigh-ins around each change, to compare weight lost by dose.</div>';
    return h+'</div>';
  }
  var u=state.settings.units;
  var totLost=completed.reduce(function(a,b){return a+b.lost;},0);
  var totWeeks=completed.reduce(function(a,b){return a+b.weeks;},0);
  h+='<div class="wl-glpcsub">'+r1(totLost)+' '+u+' total across '+completed.length+' level'+(completed.length===1?"":"s")+' · '+Math.round(totWeeks)+' weeks</div>';
  var mode=(state.glpProgMode==="week")?"week":"total";
  h+='<div class="wl-seg wl-seg-wide" style="margin-top:12px">'+[["total","Total"],["week","Per week"]].map(function(m){return '<button class="'+(mode===m[0]?"on":"")+'" data-act="glp:prog:mode" data-mode="'+m[0]+'">'+m[1]+'</button>';}).join("")+'</div>';
  /* bar chart */
  function barVal(b){var v=(mode==="week")?b.rate:b.lost;return (v==null?0:Math.max(0,v));}
  var maxV=0;bars.forEach(function(b){var v=barVal(b);if(v>maxV)maxV=v;});
  var yMax=niceMax(maxV||1);
  var W=340,H=200,padL=28,padR=12,padT=24,padB=50;
  var n=bars.length,slot=(W-padL-padR)/n,bw=Math.min(52,slot*0.6);
  function sy(v){return (H-padB)-(v/yMax)*(H-padT-padB);}
  var s='<svg class="wl-chart" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" style="height:'+H+'px"><defs><linearGradient id="glpbar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#C063FF"/><stop offset="100%" stop-color="#7A25D0"/></linearGradient></defs>';
  [0,0.5,1].forEach(function(fr){var yv=yMax*fr,y=sy(yv);s+='<line x1="'+padL+'" y1="'+y+'" x2="'+(W-padR)+'" y2="'+y+'" stroke="'+CH.grid+'" stroke-dasharray="2 4"/><text x="'+(padL-4)+'" y="'+(y+3)+'" fill="'+CH.axis+'" font-size="9" text-anchor="end">'+r1(yv)+'</text>';});
  bars.forEach(function(b,i){var cx=padL+slot*i+slot/2,x=cx-bw/2,v=barVal(b),y=sy(v),bh=Math.max(1,(H-padB)-y);
    var lbl=(mode==="week")?(b.rate==null?"—":r1(b.rate)+"/wk"):(b.valid?r1(b.lost):"—");
    s+='<rect x="'+x+'" y="'+y+'" width="'+bw+'" height="'+bh+'" rx="8" fill="url(#glpbar)"'+(b.inProgress?' opacity=".45"':'')+'/>';
    if(b.inProgress)s+='<rect x="'+x+'" y="'+y+'" width="'+bw+'" height="'+bh+'" rx="8" fill="none" stroke="'+CH.avg+'" stroke-width="1.4" stroke-dasharray="4 3"/>';
    s+='<text x="'+cx+'" y="'+(y-7)+'" text-anchor="middle" font-size="12" font-weight="700" style="font-family:var(--mono)" fill="'+(b.inProgress?CH.avg:"#EDF1F7")+'">'+lbl+'</text>';
    s+='<text x="'+cx+'" y="'+(H-34)+'" text-anchor="middle" font-size="11" style="font-family:var(--mono)" fill="'+(b.inProgress?CH.avg:"#EDF1F7")+'">'+r1(b.dose)+' '+u2dose(b)+'</text>';
    s+='<text x="'+cx+'" y="'+(H-20)+'" text-anchor="middle" font-size="10" style="font-family:var(--mono)" fill="'+CH.axis+'">'+Math.round(b.weeks)+' wk</text>';
    s+='<text x="'+cx+'" y="'+(H-8)+'" text-anchor="middle" font-size="10" style="font-family:var(--mono)" fill="'+CH.axis+'">'+(b.rate==null?"—":r1(b.rate)+"/wk")+'</text>';
  });
  s+='<line x1="'+padL+'" y1="'+(H-padB)+'" x2="'+(W-padR)+'" y2="'+(H-padB)+'" stroke="'+CH.axis+'" stroke-width="1" opacity=".5"/></svg>';
  h+=s;
  var ip=bars.filter(function(b){return b.inProgress;})[0];
  if(ip){var wk=Math.max(0,Math.round(ip.weeks));h+='<div class="wl-glpnote"><b>'+r1(ip.dose)+' '+u2dose(ip)+' is still in progress</b> — '+wk+' of an expected '+GLP_EXPECT_WK+' weeks, so its bar is dashed and excluded from comparisons.</div>';}
  h+='<div class="wl-glpnote">Levels ran one after another, not side by side. Early levels tend to read high — water weight and the first appetite drop land there — so treat this as a record, not a verdict on which dose suits you.</div>';
  return h+'</div>';
}
/* unit label for a dose bar (denormalised at log time; fall back to compound unit) */
function u2dose(b){var c=state.glp&&state.glp.compound;return (c&&c.unit)||"mg";}
/* the two Progress cards + the timeline expander, injected into view_weight */
/* Symptom journal list on Progress, where the retired chart lived (Owner ask
   2026-08-02). Rows reuse the day pill's look and its edit action. */
function glpSymptomListHTML(){
  if(!glpProgEnabled()||!(state.glp.settings&&state.glp.settings.symptomLogging))return "";
  var syms=(state.glp.symptoms||[]).slice().sort(function(a,b){return b.occurredAt-a.occurredAt;});
  if(!syms.length)return "";
  var h='<div class="wl-card"><div class="wl-card-head"><span>Symptoms</span><span class="wl-count">'+syms.length+'</span></div>';
  syms.forEach(function(x){
    var sev=parseInt(x.severity,10)||0;var pips="";for(var i=1;i<=5;i++)pips+='<span class="wl-glppip'+(i<=sev?" on":"")+'"></span>';
    h+='<button class="wl-glpsev" style="width:100%;background:none;border:none;padding:6px 0;font:inherit;color:inherit;text-align:left;border-bottom:1px solid var(--line)" data-act="glp:sym:edit" data-id="'+esc(x.id)+'">'
      +'<b>'+esc(glpSymLabel(x.symptomTypeId))+'</b>'+pips
      +'<div class="wl-glpentry-l2" style="margin-top:2px">'+esc(glpFmtWhen(x.occurredAt))+(x.note?(' \u00b7 '+esc(x.note)):'')+'</div></button>';
  });
  return h+'<div class="wl-hint" style="margin-top:8px">Tap an entry to edit or delete it.</div></div>';}
function glpProgressHTML(){
  if(!glpProgEnabled())return "";
  var h=glpWeightByDoseCardHTML();
  if(glpDoseBars().length||glpNonSkipDoses().length){
    h+='<button class="wl-glpexpand" data-act="glp:timeline"><span>Weight timeline with dose bands</span><span class="wl-glpgo">›</span></button>';
  }
  h+=glpSymptomListHTML();
  return h;
}
/* 7c — weight timeline with dose bands (detail screen) */
function view_glptimeline(){
  var h='<div class="wl-stack">';
  if(!glpProgEnabled()){return h+'<div class="wl-card"><div class="wl-empty">GLP-1 tracking is off.</div></div></div>';}
  var u=state.settings.units;var goal=num(state.settings.goalWeight);
  var c=prepChart();var data=c.data;
  h+='<div class="wl-card">';
  if(!data.length){h+='<div class="wl-empty">No weigh-ins yet. Add a few to see your weight against dose levels.</div>';return h+'</div></div>';}
  var periods=glpLevelPeriods();
  var W=340,H=210,padL=34,padR=12,padT=26,padB=24;
  var ys=[];data.forEach(function(d){ys.push(d.weight);if(d.avg!=null)ys.push(d.avg);});if(goal!=null)ys.push(goal);
  var mn=Math.min.apply(null,ys),mx=Math.max.apply(null,ys);var padY=Math.max(1,(mx-mn)*0.14);
  var yMin=Math.floor(mn-padY),yMax=Math.ceil(mx+padY);if(yMin===yMax)yMax=yMin+2;
  var xMin=data[0].ts,xMax=data[data.length-1].ts;if(xMin===xMax){xMin-=DAY;xMax+=DAY;}
  function sx(t){return padL+(Math.max(xMin,Math.min(xMax,t))-xMin)/(xMax-xMin)*(W-padL-padR);}
  function sy(w){return (H-padB)-(w-yMin)/(yMax-yMin)*(H-padT-padB);}
  /* distinct dose values ascending → rank for band tint */
  var vals=[];periods.forEach(function(p){if(p.dose!=null&&vals.indexOf(p.dose)<0)vals.push(p.dose);});vals.sort(function(a,b){return a-b;});
  var bandTop=padT,bandBot=H-padB;
  var s='<svg class="wl-chart" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" style="height:'+H+'px">';
  /* bands */
  periods.forEach(function(p){if(p.dose==null)return;var x0=sx(p.start),x1=sx(p.end);if(x1-x0<=0.5)return;var rank=vals.indexOf(p.dose);var op=glpBandOpacity(rank,vals.length);
    s+='<rect x="'+x0+'" y="'+bandTop+'" width="'+(x1-x0)+'" height="'+(bandBot-bandTop)+'" fill="#A855F7" opacity="'+op.toFixed(3)+'"/>';
    if(p.inProgress)s+='<rect x="'+x0+'" y="'+bandTop+'" width="'+(x1-x0)+'" height="'+(bandBot-bandTop)+'" fill="none" stroke="'+CH.avg+'" stroke-width="1.2" stroke-dasharray="4 3" opacity=".85"/>';
    s+='<text x="'+((x0+x1)/2)+'" y="'+(bandTop-6)+'" text-anchor="middle" font-size="9.5" style="font-family:var(--mono)" fill="'+(p.inProgress?CH.avg:"#C9A6F0")+'">'+r1(p.dose)+'</text>';});
  /* dividers at level changes */
  periods.forEach(function(p,i){if(i===0)return;var X=sx(p.start);s+='<line x1="'+X+'" y1="'+bandTop+'" x2="'+X+'" y2="'+bandBot+'" stroke="'+CH.axis+'" stroke-width=".8" opacity=".55"/>';});
  /* gridlines + y labels */
  for(var gi=0;gi<=3;gi++){var yv=yMin+(yMax-yMin)*gi/3;var y=sy(yv);s+='<line x1="'+padL+'" y1="'+y+'" x2="'+(W-padR)+'" y2="'+y+'" stroke="'+CH.grid+'" stroke-dasharray="2 4"/><text x="'+(padL-5)+'" y="'+(y+3)+'" fill="'+CH.axis+'" font-size="9" text-anchor="end">'+Math.round(yv)+'</text>';}
  /* goal */
  if(goal!=null){var gy=sy(goal);s+='<line x1="'+padL+'" y1="'+gy+'" x2="'+(W-padR)+'" y2="'+gy+'" stroke="'+CH.goal+'" stroke-width="1.4" stroke-dasharray="6 4"/><text x="'+(W-padR)+'" y="'+(gy-4)+'" fill="'+CH.goal+'" font-size="9" text-anchor="end">Goal '+r1(goal)+'</text>';}
  /* amber weight line (reuse the 7-day avg line the user already knows) */
  var line="";data.forEach(function(d,i){line+=(i?"L":"M")+sx(d.ts)+" "+sy(d.avg)+" ";});
  s+='<path d="'+line+'" fill="none" stroke="'+CH.avg+'" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>';
  /* dots at level boundaries + big latest dot */
  periods.forEach(function(p,i){if(i===0)return;var bt=p.start;var near=null,nd=null;data.forEach(function(d){var dist=Math.abs(d.ts-bt);if(nd==null||dist<nd){nd=dist;near=d;}});if(near)s+='<circle cx="'+sx(near.ts)+'" cy="'+sy(near.avg)+'" r="3.2" fill="'+CH.avg+'"/>';});
  var last=data[data.length-1];
  s+='<circle cx="'+sx(last.ts)+'" cy="'+sy(last.avg)+'" r="4.6" fill="'+CH.avg+'" stroke="#0F1218" stroke-width="2"/>';
  [[xMin,"start"],[(xMin+xMax)/2,"middle"],[xMax,"end"]].forEach(function(pr){s+='<text x="'+sx(pr[0])+'" y="'+(H-7)+'" fill="'+CH.axis+'" font-size="9" text-anchor="'+pr[1]+'">'+fmtShort(new Date(pr[0]))+'</text>';});
  s+='</svg>';
  /* readout: down since start · lbs to goal */
  var down=data[0].weight-last.weight;
  var toGoal=(goal!=null)?(last.weight-goal):null;
  h+='<div class="wl-glpread" style="margin-top:0">Down <b>'+r1(Math.max(0,down))+' '+u+'</b> since '+fmtShort(new Date(data[0].ts))+(toGoal!=null?' · <b>'+r1(Math.max(0,toGoal))+' '+u+'</b> to goal':'')+'</div>';
  h+=s;
  h+='<div class="wl-readout"><b>'+r1(last.weight)+'</b> '+u+' · '+fmtShort(new Date(last.ts))+' (latest)</div>';
  h+='<div class="wl-glpnote"><b>Bands mark when each dose was active</b> — not what caused the change. Diet, training and sleep move this line too.</div>';
  h+='</div>';
  h+='<button class="wl-glpexpand" data-act="go" data-view="weight"><span>Compare by dose level</span><span class="wl-glpgo">›</span></button>';
  h+=glpJournalHTML();
  return h+'</div>';
}

/* ---------------- views ---------------- */
/* Coach Max's faces. The AI names the mood; anything unrecognised renders nothing,
   so a missing or unexpected value just falls back to the plain message. */