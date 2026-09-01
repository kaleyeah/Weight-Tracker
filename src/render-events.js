/* ---------------- render ---------------- */
var NAV=[["overview","Home"],["train","Activity"],["weight","Progress"],["summary","Summary"]];
function askConfirm(message,fn,opts){opts=opts||{};state.pendingConfirm={message:message,fn:fn,danger:opts.danger!==false,label:opts.label||"Delete"};render();}
function confirmOverlayHTML(){var c=state.pendingConfirm;if(!c)return "";
  /* z-index above .wl-confirm's own 2000: the m10cx review sheet REUSES the
     wl-confirm class and lives in #m10-cx, a LATER body sibling than #app --
     equal z-index means the sheet always painted over this dialog. The Owner
     hit that live (.461 canary): tapping "Take over on this device" inside
     the review opened this confirm INVISIBLY underneath it; only closing the
     review revealed the stack. A confirmation dialog is the innermost modal
     by definition -- it outranks every sheet. */
  return '<div class="wl-confirm" style="z-index:2500"><div class="wl-confirm-card"><div class="wl-confirm-msg">'+esc(c.message)+'</div><div class="wl-confirm-btns"><button class="wl-btn wl-btn-ghost wl-full" data-act="confirm:no">Cancel</button><button class="wl-btn wl-full" style="background:'+(c.danger?"var(--bad)":"var(--accent)")+';color:#fff;border:none" data-act="confirm:yes">'+esc(c.label)+'</button></div></div></div>';}
function render(){
  clearPhotoURLs();
  var title=state.view==="settings"?"Settings":state.view==="diary"?"Food Diary":state.view==="exlib"?"":state.view==="routine"?"":state.view==="rlaunch"?"Workout":state.view==="quicklog"?"Quick log":state.view==="workout"?"Workout":state.view==="liftview"?"Workout":state.view==="wtadd"?"Weight Training":state.view==="cardioadd"?((state.cardioForm&&state.cardioForm.id)?"Edit Cardio":"Add Cardio"):state.view==="actadd"?(state.actPick==="rest"?"Add Recovery":state.actPick==="supp"?"Add Supplement":"Add"):state.view==="photos"?"Progress Photos":state.view==="checkin"?"Weekly check-in":state.view==="glptimeline"?"Weight & dose":state.view==="glpcompare"?"Compare by dose":(NAV.filter(function(n){return n[0]===state.view;})[0]||["","" ])[1];var hsub=state.view==="workout"?((state.workout&&state.workout.name)||""):state.view==="liftview"?(((getLiftSession()||{}).name)||""):state.view==="quicklog"?(((state.liftForm&&getRoutine(state.liftForm.routineId))||{}).name||""):state.view==="rlaunch"?(((getRoutine(state.routineId))||{}).name||""):"";
  var body=state.view==="overview"?view_overview():(state.view==="food"||state.view==="calendar")?view_overview():state.view==="weight"?view_weight():state.view==="summary"?view_summary():state.view==="diary"?view_diary():state.view==="train"?view_train():state.view==="exlib"?view_exlib():state.view==="routine"?view_routine():state.view==="rlaunch"?view_rlaunch():state.view==="quicklog"?view_quicklog():state.view==="workout"?view_workout():state.view==="liftview"?view_liftview():state.view==="wtadd"?view_wtadd():state.view==="cardioadd"?view_cardio():state.view==="actadd"?view_actadd():state.view==="photos"?view_photos():state.view==="checkin"?view_checkin():state.view==="glptimeline"?view_glptimeline():state.view==="glpcompare"?view_glpcompare():view_settings();
  var nav='<nav class="wl-nav">'+NAV.map(function(n){return '<button class="wl-navbtn '+(state.view===n[0]||(n[0]==="overview"&&(state.view==="food"||state.view==="diary"))||(n[0]==="weight"&&(state.view==="photos"||state.view==="glptimeline"))?"on":"")+'" data-act="go" data-view="'+n[0]+'">'+I[n[0]]+'<span>'+n[1]+'</span></button>';/* unread-recap nudge now lives on the M avatar, not the Home tab */}).join("")+'</nav>';
  var avatar='<button class="wl-avatar'+(state.view==="settings"?" on":"")+'" data-act="go" data-view="settings" aria-label="Settings"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>';
  var hdrRight=syncOn()?'<button class="wl-syncdot" data-act="syncdot" aria-label="Sync status"><span class="wl-sdot '+syncDotClass()+'" id="wl-sdot"></span></button>':'';
  var maxBtn=isOwner()?'<button class="wl-maxb'+((coachUnreadW()||coachUnreadT())?" hot":"")+'" data-act="max:open" aria-label="Messages from Coach Max">M</button>':'';
  var backBtn=state.view==="checkin"?'<button class="wl-hdr-back" data-act="ci:close" aria-label="Back">‹</button>':(state.view==="photos"||state.view==="glptimeline"||state.view==="glpcompare")?'<button class="wl-hdr-back" data-act="go" data-view="weight" aria-label="Back">‹</button>':state.view==="diary"?'<button class="wl-hdr-back" data-act="go" data-view="overview" aria-label="Back">‹</button>':'';
  var _navH=headerNav();var _brand='<span class="wl-mark">'+BRANDMARK+'</span>';var _md=statusFor(todayISO());var _mbanner=_md?('<button class="wl-modebanner" data-act="go" data-view="settings"><span class="wl-mb-em">'+(_md.status.type==="vacation"?"\ud83c\udfd6\ufe0f":"\ud83e\udd12")+'</span><span>'+(_md.status.type==="vacation"?"Vacation Mode":"Recovery Mode")+'</span><span class="wl-mb-go">Settings \u203a</span></button>'):'';
  document.getElementById("app").innerHTML='<div class="wl-shell"><header class="wl-header'+(_md?" hasbanner":"")+'">'+_mbanner+'<div class="wl-hdr-brand"><div class="wl-brandrow">'+_brand+'<span class="wl-eyebrow">Compound</span></div>'+hdrRight+'</div><div class="wl-hdr-main">'+backBtn+'<div class="wl-title-slot">'+(title?('<h1 class="wl-title">'+title+'</h1>'):'')+(hsub?'<div class="wl-hsub">'+esc(hsub)+'</div>':'')+'</div><div class="wl-hdr-actions">'+maxBtn+avatar+'</div></div>'+(_navH?'<div class="wl-hdr-datebar">'+_navH+'</div>':'')+'</header>'+m10RoBarHTML()+'<main class="wl-main">'+m10cxShellBannerHTML()+body+'</main>'+nav+'</div>'+confirmOverlayHTML()+woOverlaysHTML()+quickEntryHTML()+statusSheetHTML()+obOverlayHTML()+maxSheetHTML()+infoSheetHTML()+glpSheetHTML()+pfReviewHTML()+pfChooseHTML();
  var hdr=document.querySelector(".wl-header");if(hdr)document.documentElement.style.setProperty("--headh",hdr.offsetHeight+"px");
  if(document.getElementById("wl-photostrip"))renderPhotosStrip(state.selDate);
  if(state.view==="diary")renderDiary();
  if(state.view==="photos")renderProgressPhotos();
  if(state.view==="checkin")renderCheckinPhotos();
  navKbdSync();
  /* warm the coach-report photo cache while Summary is on screen, so the export
     tap can stay synchronous (iOS share-sheet activation — see srPhotoPrefetch) */
  if(state.view==="summary")srPhotoPrefetch();
  if(document.getElementById("wl-pbk-count"))refreshPbkCount();
}

/* ---------------- events ---------------- */
function toast(msg){var t=document.getElementById("wl-toast");t.textContent=msg;t.classList.add("show");clearTimeout(t._t);t._t=setTimeout(function(){t.classList.remove("show");},1600);}
/* long-press to archive a custom symptom chip (data-glplong) */
var glpLPfired=false;
(function(){var lpT=null;function clr(){if(lpT){clearTimeout(lpT);lpT=null;}}
  document.addEventListener("pointerdown",function(e){var el=e.target&&e.target.closest?e.target.closest("[data-glplong]"):null;if(!el)return;clr();var id=el.getAttribute("data-glplong");lpT=setTimeout(function(){lpT=null;glpLPfired=true;if(navigator.vibrate){try{navigator.vibrate(15);}catch(_e){}}glpArchiveType(id);},550);},{passive:true});
  document.addEventListener("pointerup",clr,{passive:true});
  document.addEventListener("pointermove",clr,{passive:true});
  document.addEventListener("pointercancel",clr,{passive:true});
})();
document.addEventListener("click",function(e){
  if(glpLPfired){glpLPfired=false;return;}
  var el=e.target.closest("[data-act]");if(!el)return;var a=el.getAttribute("data-act");
  if(a==="set:page"){var _pgv=el.getAttribute("data-page");state.setPage=_pgv;
    if(_pgv==="whoop"&&state.settings.whoopOn){state.whoopStatus=null;whoopCheck(function(r){state.whoopStatus=r;render();});}state.open=state.open||{};({profile:["profile"],strategy:["strategy"],goals:["goals"],coach:["reminder"],appearance:["theme"],data:["exportdata","backup"],sync:["sync","share"],whoop:["whoop"]}[_pgv]||[]).forEach(function(k){state.open[k]=true;});render();return;}
  if(a==="set:back"){state.setPage=null;render();return;}
  if(a==="glp:enable"){glpNormalize();state.glp.settings.enabled=!state.glp.settings.enabled;save();render();return;}
  if(a==="glp:showdue"){glpNormalize();if(!state.glp.settings.enabled)return;state.glp.settings.showDueDate=!state.glp.settings.showDueDate;save();render();return;}
  if(a==="glp:titration"){glpNormalize();if(!state.glp.settings.enabled)return;state.glp.settings.titration=!state.glp.settings.titration;save();render();return;}
  if(a==="glp:siterot"){glpNormalize();if(!state.glp.settings.enabled)return;state.glp.settings.siteRotation=!state.glp.settings.siteRotation;save();render();return;}
  if(a==="glp:sitetoggle"){glpNormalize();if(!state.glp.settings.enabled)return;var _sid=el.getAttribute("data-site");var _arr=(state.glp.settings.activeSites||[]).slice();var _ix=_arr.indexOf(_sid);if(_ix>=0){if(_arr.length<=1){toast("Keep at least one site active");return;}_arr.splice(_ix,1);}else _arr.push(_sid);state.glp.settings.activeSites=_arr;save();render();return;}
  if(a==="glp:symptoms"){glpNormalize();if(!state.glp.settings.enabled)return;state.glp.settings.symptomLogging=!state.glp.settings.symptomLogging;save();render();return;}
  if(a==="glp:compound"){glpNormalize();var _gc=state.glp.compound||{};state.glpDraft={name:_gc.name||"",dose:(_gc.dose!=null?_gc.dose:""),unit:_gc.unit||"mg",cadenceDays:(_gc.cadenceDays!=null?_gc.cadenceDays:7)};state.setPage="glpcompound";render();return;}
  if(a==="glp:compoundback"){state.glpDraft=null;state.setPage="glp";render();return;}
  if(a==="glp:unit"){glpSyncDraft();state.glpDraft=state.glpDraft||{};state.glpDraft.unit=el.getAttribute("data-unit");render();return;}
  if(a==="glp:compoundsave"){glpNormalize();glpSyncDraft();var _d=state.glpDraft||{};var _nm=(_d.name||"").trim();if(!_nm){toast("Enter a compound name");return;}var _dose=num(_d.dose);var _cad=parseInt(_d.cadenceDays,10);if(!_cad||_cad<=0)_cad=7;state.glp.compound={name:_nm,dose:(_dose!=null?_dose:""),unit:_d.unit||"mg",cadenceDays:_cad};save();state.glpDraft=null;state.setPage="glp";render();toast("Compound saved");return;}
  /* --- GLP-1 Part 2: Activity card + sheets --- */
  if(a==="glp:setup"){state.setFrom=state.view;state.view="settings";state.setPage="glp";render();return;}
  if(a==="glp:dose:open"){glpNormalize();var _g=state.glp;if(!_g.compound){toast("Set up a compound first");return;}var _at=el.getAttribute("data-at");var _atMs=_at?parseInt(_at,10):Date.now();var _sug=glpSiteSuggestion();state.glpSheet={mode:"dose",dose:(_g.compound.dose!=null?String(_g.compound.dose):""),siteId:(_g.settings.siteRotation?_sug.suggested:null),at:_atMs,note:""};render();return;}
  if(a==="glp:site"){glpSheetSync();if(state.glpSheet)state.glpSheet.siteId=el.getAttribute("data-site");render();return;}
  if(a==="glp:dose:save"){glpNormalize();glpSheetSync();var _s=state.glpSheet;if(!_s)return;var _g2=state.glp;if(!_g2.compound){toast("Set up a compound first");return;}var _dv=num(_s.dose);state.glp.doses.push({id:glpNewId("dose"),dose:(_dv!=null?_dv:""),unit:(_g2.compound.unit||"mg"),siteId:(_g2.settings.siteRotation?(_s.siteId||null):null),takenAt:(_s.at||Date.now()),note:(_s.note||"").trim(),skipped:false});save();state.glpSheet=null;render();toast("Dose logged");return;}
  if(a==="glp:dose:del"){glpNormalize();var _id=el.getAttribute("data-id");state.glp.doses=state.glp.doses.filter(function(d){return d.id!==_id;});save();render();return;}
  if(a==="glp:skip"){glpNormalize();var _g3=state.glp;var _at2=el.getAttribute("data-at");var _atMs2=_at2?parseInt(_at2,10):Date.now();state.glp.doses.push({id:glpNewId("dose"),dose:(_g3.compound?_g3.compound.dose:""),unit:(_g3.compound?_g3.compound.unit:"mg"),siteId:null,takenAt:_atMs2,note:"",skipped:true});save();render();toast("Marked skipped");return;}
  if(a==="glp:sym:open"){glpNormalize();if(!state.glp.settings.symptomLogging)return;state.glpSheet={mode:"sym",symptomTypeId:null,severity:null,at:Date.now(),note:"",newOpen:false,newLabel:""};render();return;}
  if(a==="glp:sym:edit"){glpNormalize();var _sid=el.getAttribute("data-id");var _sl=(state.glp.symptoms||[]).filter(function(x){return x.id===_sid;})[0];if(!_sl)return;state.glpSheet={mode:"sym",editId:_sl.id,symptomTypeId:_sl.symptomTypeId,severity:parseInt(_sl.severity,10)||null,at:_sl.occurredAt,note:_sl.note||"",newOpen:false,newLabel:""};render();return;}
  if(a==="glp:sym:del"){var _did=el.getAttribute("data-id");askConfirm("Delete this symptom log? This can\u2019t be undone.",function(){state.glp.symptoms=(state.glp.symptoms||[]).filter(function(x){return x.id!==_did;});save();state.glpSheet=null;toast("Symptom log deleted");},{label:"Delete"});return;}
  /* The sheet used to open with the FIRST type (Nausea) preselected. On iOS,
     tapping a chip while the note keyboard is up only dismisses the keyboard --
     the tap never lands -- so the default was saved silently: a real headache
     went into the record as a third "nausea". No preselection means the save
     guard ("Pick a symptom") makes a silent wrong type impossible. */
  if(a==="glp:sym:pick"){glpSheetSync();if(state.glpSheet){state.glpSheet.symptomTypeId=el.getAttribute("data-id");state.glpSheet.newOpen=false;}render();return;}
  if(a==="glp:sev"){glpSheetSync();if(state.glpSheet)state.glpSheet.severity=parseInt(el.getAttribute("data-sev"),10);render();return;}
  if(a==="glp:sym:new"){glpSheetSync();if(state.glpSheet)state.glpSheet.newOpen=true;render();var _ni=document.getElementById("wl-glpnewin");if(_ni)_ni.focus();return;}
  if(a==="glp:sym:newsave"){glpNormalize();glpSheetSync();var _s2=state.glpSheet;if(!_s2)return;var _lbl=(_s2.newLabel||"").trim();if(!_lbl){toast("Enter a symptom name");return;}var _nid=glpNewId("sym");state.glp.symptomTypes.push({id:_nid,label:_lbl,isBuiltIn:false,archived:false});_s2.symptomTypeId=_nid;_s2.newOpen=false;_s2.newLabel="";save();render();return;}
  if(a==="glp:sym:save"){glpNormalize();glpSheetSync();var _s3=state.glpSheet;if(!_s3)return;if(!_s3.symptomTypeId){toast("Pick a symptom");return;}if(!_s3.severity){toast("Pick a severity");return;}
    if(_s3.editId){var _hit=(state.glp.symptoms||[]).filter(function(x){return x.id===_s3.editId;})[0];if(!_hit){state.glpSheet=null;render();return;}
      _hit.symptomTypeId=_s3.symptomTypeId;_hit.severity=parseInt(_s3.severity,10);_hit.occurredAt=(_s3.at||_hit.occurredAt);_hit.note=(_s3.note||"").trim();
      save();state.glpSheet=null;render();toast("Updated: "+glpSymLabel(_hit.symptomTypeId)+" \u00b7 severity "+_hit.severity);return;}
    state.glp.symptoms.push({id:glpNewId("slog"),symptomTypeId:_s3.symptomTypeId,severity:parseInt(_s3.severity,10),occurredAt:(_s3.at||Date.now()),note:(_s3.note||"").trim()});save();state.glpSheet=null;render();toast("Logged: "+glpSymLabel(_s3.symptomTypeId)+" \u00b7 severity "+_s3.severity);return;}
  if(a==="glp:sheetclose"){state.glpSheet=null;render();return;}
  if(a==="glp:prog:mode"){state.glpProgMode=el.getAttribute("data-mode");render();return;}
  if(a==="glp:timeline"){if(!glpProgEnabled())return;state.view="glptimeline";render();return;}
  if(a==="go"){var _gv=el.getAttribute("data-view");if(_gv==="exlib"&&state.view!=="exlib")state.exlibFrom=state.view;if(_gv==="settings"){if(state.view==="settings"){_gv=state.setFrom||"overview";}else{state.setFrom=state.view;state.setPage=null;}}state.view=_gv;if(state.view==="diary")state.diaryWeeks=1;if(state.view==="settings"){state.open={};state.manageOpen=false;}state.alertDismissed=false;state.confirmReset=false;state.exportAsk=null;state.pasteOpen=false;state.syncPasteOpen=false;state.inviteCode=null;state.joinOpen=false;render();return;}
  if(a==="confirm:yes"){var pc=state.pendingConfirm;state.pendingConfirm=null;if(pc&&pc.fn)pc.fn();render();return;}
  if(a==="confirm:no"){state.pendingConfirm=null;render();return;}
  if(a==="alert:dismiss"){state.alertDismissed=true;render();return;}
  if(a==="chart:pt"){var ts=+el.getAttribute("data-ts"),w=+el.getAttribute("data-w"),av=el.getAttribute("data-avg");
    var r=document.getElementById("wl-readout");if(r)r.innerHTML='<b>'+r1(w)+'</b> '+state.settings.units+' · '+fmtFull(new Date(ts))+(av!=="null"?' · avg '+av:'');return;}
  if(a==="weight:add"){var dt=document.getElementById("wl-wdate").value,vv=num(document.getElementById("wl-wval").value);
    if(vv==null){toast("Enter a weight");return;}state.weights=state.weights.filter(function(x){return x.date!==dt;});state.weights.push({date:dt,weight:vv});save();render();return;}
  if(a==="weight:del"){var dd=el.getAttribute("data-date");askConfirm("Delete this weigh-in?",function(){state.weights=state.weights.filter(function(x){return x.date!==dd;});save();});return;}
  if(a==="food:pick"){state.selDate=el.getAttribute("data-date");state.view="food";render();return;}
  if(a==="dl:open"){state.quickEntry=el.getAttribute("data-sec");render();var _f=document.querySelector(".wl-confirm-card input,.wl-confirm-card textarea");if(_f)_f.focus();return;}
  if(a==="skip:weight"){var sd=state.selDate;var on=!isSkip(sd,"weight");setSkip(sd,"weight",on);if(on)state.weights=state.weights.filter(function(x){return x.date!==sd;});save();render();return;}
  if(a==="skip:steps"){var sd=state.selDate;var on=!isSkip(sd,"steps");setSkip(sd,"steps",on);if(on)delete state.steps[sd];save();render();return;}
  if(a==="skip:sleep"){var sd=state.selDate;var on=!isSkip(sd,"sleep");setSkip(sd,"sleep",on);if(on)delete state.sleep[sd];save();render();return;}
  if(a==="skip:calories"){var sd=state.selDate;var on=!isSkip(sd,"calories");setSkip(sd,"calories",on);if(on)delete state.food[sd];save();render();return;}
  if(a==="ob:next"){var _cs=state.obStep||0;var _vm=obStepMsg(_cs);if(_vm){toast(_vm);return;}state.obStep=_cs+1;if(state.obStep===6&&!state.obMacrosDone){var _f=state.settings;_f.targetValue=(_f.strategy==="gain"?"0.5":_f.strategy==="maintain"?"0":"1");if(!_f.targetType)_f.targetType="lbs_per_week";if(maintenanceCals()!=null){applyAutoMacros();state.obMacrosDone=true;}}render();return;}
  if(a==="ob:recalc"){var _rf=state.settings;_rf.targetValue=(_rf.strategy==="gain"?"0.5":_rf.strategy==="maintain"?"0":"1");if(!_rf.targetType)_rf.targetType="lbs_per_week";applyAutoMacros();save();render();return;}
  if(a==="ob:back"){state.obStep=Math.max(0,(state.obStep||0)-1);render();return;}
  if(a==="ob:skip"||a==="ob:finish"){state.onboarding=false;
    /* only record "set up" once there is something to be set up FROM — a skip on
       a signed-in account with no data yet must not stamp a default core */
    if(!(syncOn()&&!state.weights.length&&!state.settings.name))state.settings.onboarded=true;
    save();render();return;}
  if(a==="ob:start"){state.onboarding=true;state.obStep=0;state.obMacrosDone=false;render();return;}
  if(a==="ob:install"){if(deferredPrompt){deferredPrompt.prompt();deferredPrompt.userChoice.then(function(){deferredPrompt=null;});}return;}
  if(a==="status:open"){var _s=statusFor(state.selDate);state.statusForm=_s?{idx:_s.idx,type:_s.status.type,start:_s.status.start,end:_s.status.end||"",hasEnd:!!_s.status.end}:{idx:-1,type:"vacation",start:state.selDate,end:"",hasEnd:false};state.statusOpen=true;render();return;}
  if(a==="status:type"){state.statusForm=state.statusForm||{};state.statusForm.type=el.getAttribute("data-type");render();return;}
  if(a==="status:close"){state.statusOpen=false;render();return;}
  if(a==="status:save"){var _f=state.statusForm||{};var _st=_f.start,_en=null;if(!_st){toast("Pick a start date");return;}if(_en&&_en<_st){toast("End is before start");return;}var _o={type:_f.type||"vacation",start:_st,end:_en};state.statuses=state.statuses||[];if(_f.idx>=0)state.statuses[_f.idx]=_o;else state.statuses.push(_o);state.statusOpen=false;save();render();return;}
  if(a==="status:end"){var _f=state.statusForm||{};if(_f.idx>=0&&state.statuses)state.statuses.splice(_f.idx,1);state.statusOpen=false;save();render();return;}
  if(a==="status:endnow"){var _es=statusFor(todayISO());if(_es&&state.statuses){var _yd=toISO(addDays(parseISO(todayISO()),-1));if(_es.status.start>_yd)state.statuses.splice(_es.idx,1);else _es.status.end=_yd;save();}render();return;}
  if(a==="qe:close"){state.quickEntry=null;render();window.scrollTo(0,0);return;}
  if(a==="opentoday"){state.selDate=todayISO();state.calY=new Date().getFullYear();state.calM=new Date().getMonth();state.cardioForm=null;render();return;}
  if(a==="ai:copy"){copyText(weeklyAIText(),"Copied your week — paste into your AI to generate");return;}
  if(a==="ai:gen"){genSummary();return;}
  if(a==="whoop:useresting"){var v=num(el.getAttribute("data-v"));if(v==null)return;
    state.settings.restingHR=String(v);save();render();toast("Resting heart rate set to "+v);return;}
  if(a==="whoop:undomax"){var v2=num(el.getAttribute("data-v"));if(v2==null)return;
    state.settings.maxHR=String(v2);state.settings.whoopMaxHR=false;state.whoopNotice=null;save();render();
    toast("Max heart rate back to "+v2+" \u2014 WHOOP won\u2019t change it again");return;}
  if(a==="whoop:noticeok"){state.whoopNotice=null;render();return;}
  if(a==="whoop:usesleep"){var d=el.getAttribute("data-d");var row=whoopDay(d);
    if(!row||row.sleepMin==null)return;
    state.sleep[d]=row.sleepMin;setSkip(d,"sleep",false);save();render();
    toast("Sleep set to WHOOP\u2019s "+minToHM(row.sleepMin));return;}
  if(a==="whoop:toggle"){state.settings.whoopOn=!state.settings.whoopOn;save();
    if(state.settings.whoopOn){state.whoopStatus=null;render();whoopCheck(function(r){state.whoopStatus=r;render();});}
    else render();return;}
  if(a==="whoop:sync"){if(state.whoopSyncing)return;state.whoopSyncing=true;toast("Syncing WHOOP…");
    whoopSync(function(r){state.whoopSyncing=false;
      if(!r||!r.ok){toast("WHOOP sync failed — "+((r&&r.error)||"no answer"));render();return;}
      var n=r.applied||{};
      var bits=[];if(n.total)bits.push(n.total+" day"+(n.total===1?"":"s"));
      if(n.sleep)bits.push(n.sleep+" sleep filled");
      if(n.skipped)bits.push(n.skipped+" skipped day"+(n.skipped===1?"":"s")+" left alone");
      toast((r.fake?"Demo sync — ":"WHOOP synced — ")+(bits.join(" · ")||"nothing new"));
      whoopCheck(function(st){state.whoopStatus=st;render();});});
    render();return;}
  if(a==="whoop:connect"){var u=whoopBase()+"/whoop/auth";
    /* the athlete has to approve on WHOOP's own page; we hand off and they
       come back to the app via the service's callback */
    try{location.href=u;}catch(e){toast("Couldn't open WHOOP");}
    return;}
  if(a==="whoop:disconnect"){askConfirm("Unlink your WHOOP account? Data already pulled stays; nothing new arrives until you link again.",function(){
      whoopFetch("/whoop/disconnect",{method:"POST"},function(){whoopCheck(function(st){state.whoopStatus=st;render();});});
    },{label:"Unlink",danger:true});return;}
  if(a==="hk:import"){var _hkd=state.selDate;state.hkDone=null;
    /* Y1 (round-31 ruling 1): the capture is taken HERE, at the click, and
       carried on state.hkWait — the initial mailbox clear below is itself a
       server write and must be covered by it. hkTryFetch never manufactures a
       missing capture. */
    var _hkCap=(typeof m10Capture==="function")?m10Capture():null;
    if(typeof m10Capture==="function"&&!_hkCap){toast("This device is not the active writer");return;}
    var _hkOk=function(){return (typeof m10StillValid==="function")?m10StillValid(_hkCap):true;};
    var _hkLaunch=function(){state.hkWait={date:_hkd,ts:Date.now(),m10cap:_hkCap};render();
      if(!_hkOk()){state.hkWait=null;toast("This device is no longer the active writer");render();return;}
      pbSave({health:null},function(){
        /* hand the Shortcut only the fresh session token as its input; the Shortcut
           holds the (non-secret) server URL and record id itself */
        location.href="shortcuts://run-shortcut?name="+encodeURIComponent("Macro fact")+"&input=text&text="+encodeURIComponent(pbTok());
        setTimeout(hkTryFetch,3000);});};
    if(pbRecId)_hkLaunch();else pbGetRecord(function(){_hkLaunch();});
    return;}
  if(a==="hk:cancel"){state.hkWait=null;render();return;}
  if(a==="max:open"){state.maxOpen=true;state.maxMsg=null;/* inbox list first;
    READING a message is what marks it seen now (Owner inbox, 2026-08-06) */
    fetchCoachReports(function(ch){if(ch)render();});
    var _mtd=coachTdee();if(_mtd&&_mtd.period&&state.settings.seenTdee!==_mtd.period){state.settings.seenTdee=_mtd.period;save();}
    render();return;}
  if(a==="max:read"){var _mk=el.getAttribute("data-key");state.maxMsg=_mk;
    if(_mk.indexOf("weekly:")===0){var _w9=coachWeekly();if(_w9&&_w9.week&&state.settings.seenWeekly!==_w9.week){state.settings.seenWeekly=_w9.week;save();}}
    else if(_mk.indexOf("tdee:")===0){var _t9=coachTdee();if(_t9&&_t9.period&&state.settings.seenTdee!==_t9.period){state.settings.seenTdee=_t9.period;save();}}
    else{var _r9=maxRead();_r9[_mk]=Date.now();maxReadSave(_r9);}
    render();return;}
  if(a==="max:back"){state.maxMsg=null;render();return;}
  if(a==="max:close"){state.maxOpen=false;render();return;}
  if(a==="info"){state.infoOpen=el.getAttribute("data-info");render();return;}
  if(a==="info:close"){state.infoOpen=null;render();return;}
  if(a==="noop"){return;}
  if(a==="noop"){return;}
  if(a==="sum:toggle"){var _ws1=state.weeklySummary;if(_ws1&&_ws1.week&&state.settings.seenWeekly!==_ws1.week){state.settings.seenWeekly=_ws1.week;state.sumOpen=true;try{localStorage.setItem("wl_sumopen","1");}catch(e){}save();render();return;}state.sumOpen=(state.sumOpen===false);try{localStorage.setItem("wl_sumopen",state.sumOpen?"1":"0");}catch(e){}render();return;}
  if(a==="night:toggle"){var _ns1=state.nightlySummary;if(_ns1&&_ns1.date&&state.settings.seenNightly!==_ns1.date){state.settings.seenNightly=_ns1.date;state.nightOpen=true;if(state.selDate!==_ns1.date){state.selDate=_ns1.date;var _np=parseISO(_ns1.date);state.calY=_np.getFullYear();state.calM=_np.getMonth();}save();render();return;}state.nightOpen=(state.nightOpen===false);render();return;}
  if(a==="diary:older"){state.diaryWeeks=(state.diaryWeeks||1)+1;renderDiary();return;}
  if(a==="browse:open"){state.browseOpen=true;state.exForm=null;render();return;}
  if(a==="browse:close"){state.browseOpen=false;render();return;}
  if(a==="exseed:add"){var sd=EXSEED[+el.getAttribute("data-idx")];if(!sd)return;var xl=(state.training.exercises||[]);
    var existing=xl.filter(function(e){return e.name.toLowerCase()===sd.n.toLowerCase();})[0];
    if(existing){state.training.exercises=xl.filter(function(e){return e.id!==existing.id;});saveTraining();render();return;}
    xl.push({id:"x-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),name:sd.n,muscle:sd.m,equipment:sd.e||"",bodyweight:!!sd.bw,notes:[]});state.training.exercises=xl;saveTraining();render();return;}
  if(a==="rt:save"){var rt=getRoutine(state.routineId);
    if(rt){var _noprog=(rt.items||[]).filter(function(i){return !i.progression;});
      if(_noprog.length){var _ex1=exById(_noprog[0].exerciseId);toast("Choose a progression type for "+((_ex1&&_ex1.name)||"each exercise"));return;}}
    if(rt&&!(rt.name||"").trim()&&!(rt.items||[]).length){state.training.routines=(state.training.routines||[]).filter(function(r){return r.id!==rt.id;});saveTraining();state.view="train";state.routineId=null;state.noteEdit=null;state.riPickOpen=false;render();return;}
    if(rt&&!(rt.name||"").trim())rt.name="Untitled routine";
    saveTraining();state.view="train";state.routineId=null;state.noteEdit=null;state.riPickOpen=false;toast("Routine saved");render();return;}
  if(a==="rt:new"){var rid="r-"+Date.now()+"-"+Math.random().toString(36).slice(2,6);var rl=(state.training.routines||[]).slice();rl.push({id:rid,name:"",items:[]});state.training.routines=rl;saveTraining();state.routineId=rid;state.riPickOpen=false;state.noteEdit=null;state.view="routine";render();return;}
  if(a==="rt:open"){state.routineId=el.getAttribute("data-id");state.riPickOpen=false;state.noteEdit=null;state.view="rlaunch";render();return;}
  if(a==="rt:openedit"){state.routineId=el.getAttribute("data-id");state.riPickOpen=false;state.noteEdit=null;state.view="routine";render();return;}
  if(a==="wo:start"){if(state.workout){state.view="train";toast("Finish or discard your current workout first");state.woResume=true;render();return;}var rt=getRoutine(el.getAttribute("data-id"));if(rt)startWorkout(rt);return;}
  if(a==="wo:begin"){var w=state.workout;if(!w)return;w.tState="warmup";w.startTs=Date.now();w.stateStartTs=Date.now();saveWorkout();render();startWoTick();return;}
  if(a==="wo:startroutine"){woTransition("working");render();return;}
  if(a==="wo:endrest"){woTransition("working");render();if(typeof woScrollCurrent==="function")setTimeout(woScrollCurrent,40);return;}
  if(a==="wo:pause"){var w=state.workout;if(!w||w.tState!=="working")return;w.pausedRest=true;woTransition("resting");if(typeof startWoTick==="function")startWoTick();render();return;}
  if(a==="wo:resumeset"){var w=state.workout;if(!w)return;woTransition("working");if(typeof startWoTick==="function")startWoTick();render();if(typeof woScrollCurrent==="function")setTimeout(woScrollCurrent,40);return;}
  if(a==="wo:log"){var w=state.workout;if(!w)return;if(w.tState==="ready"){toast("Tap Start to begin your warmup first");return;}if(w.tState==="warmup"){toast("Finish your warmup — tap End warmup to start the routine");return;}var ei=+el.getAttribute("data-ei"),si=+el.getAttribute("data-si");var stt=w.entries[ei].sets[si];
    if(stt.status==="done"){askConfirm("Reopen this set? It goes back to unlogged, and time counts as working until you check it again.",function(){var w2=state.workout;if(!w2)return;var s2=w2.entries[ei].sets[si];s2.status="pending";if(w2.tState==="resting"){var now=Date.now();w2.workMs+=(now-w2.stateStartTs);w2.tState="working";w2.stateStartTs=now;}saveWorkout();},{label:"Reopen",danger:false});return;}
    var en=w.entries[ei];var need=[];var vw=num(stt.weight),vr=num(stt.reps),vi=num(stt.rir);
    if(!en.bodyweight&&(vw==null||vw<=0))need.push("a weight");
    if(vr==null||vr<=0)need.push("reps above 0");
    if(vi==null||vi<0)need.push("RIR");
    if(need.length){state.logWarn={ei:ei,si:si,msg:"Enter "+need.join(", ")+" before you can log this set"};render();return;}
    stt.status="done";w.lastEi=ei;if(si===rptTopIndex(en))rptAfterSet1(en);rptRetarget(en,si);state.logWarn=null;
  var _wu=warmupCandidate(en,si);
  if(_wu&&!en.warmupAsked){en.warmupAsked=true;state.warmupAsk={ei:ei,si:si};}
  /* SUPERSET: mid-round, walk straight into the paired exercise with no rest
     (Owner 2026-09-01). Rest only when the round closes. */
  var _ssn=(typeof ssStraightNext==="function")?ssStraightNext(ei,si):null;
  if(!_ssn)woTransition("resting");
  var _mus=en.muscle||"other";
  if(fbEntryComplete(en)&&fbEntryTrained(en)&&!(en.fb&&en.fb.joint)){
    state.fbSheet={ei:ei,kind:"end",askMuscle:fbMuscleDone(w,_mus,ei)};}
  else if(!((w.mfb||{})[_mus]||{}).sore&&_fbFirstOfMuscle(w,ei)){
    /* how sore you arrived is knowable now, not at the end of the session */
    state.fbSheet={ei:ei,kind:"sore"};}
  saveWorkout();render();
  /* no sheet in the way? bring the next exercise of the superset into view */
  if(_ssn&&!state.fbSheet&&!state.warmupAsk&&typeof woScrollCurrent==="function")setTimeout(woScrollCurrent,40);
  return;}
  if(a==="fb:set"){var w=state.workout;var fsx=state.fbSheet;if(!w||!fsx)return;
    var kind=el.getAttribute("data-kind"),val=el.getAttribute("data-val"),mus=el.getAttribute("data-muscle");
    var en=w.entries[fsx.ei];if(!en)return;
    if(kind==="joint"){en.fb=en.fb||{};en.fb.joint=(en.fb.joint===val)?null:val;}
    else{w.mfb=w.mfb||{};w.mfb[mus]=w.mfb[mus]||{};w.mfb[mus][kind]=(w.mfb[mus][kind]===val)?null:val;}
    saveWorkout();render();return;}
  if(a==="wu:yes"){var aw=state.warmupAsk;if(aw)markWarmup(aw.ei,aw.si);return;}
  if(a==="wu:no"){state.warmupAsk=null;saveWorkout();render();return;}
  if(a==="fb:done"){if(!fbAnswered()){toast("Answer every question first");return;}state.fbSheet=null;state.infoOpen=null;saveWorkout();render();return;}
  if(a==="wo:fbopen"){var w=state.workout;if(!w)return;var ei=+el.getAttribute("data-ei");var en=w.entries[ei];if(!en)return;
    if(!fbEntryComplete(en)||!fbEntryTrained(en)){state.exMenu=null;toast("Log this exercise first \u2014 then you can answer for it");render();return;}
    var mu=en.muscle||"other";
    state.fbSheet={ei:ei,kind:"end",askMuscle:fbMuscleDone(w,mu,ei)};state.exMenu=null;render();return;}
  if(a==="wo:setmenu"){state.setMenu={ei:+el.getAttribute("data-ei"),si:+el.getAttribute("data-si")};render();return;}
  if(a==="wo:setmenu:close"){state.setMenu=null;render();return;}
  if(a==="wo:addset"){var w=state.workout,sm=state.setMenu;if(!w||!sm)return;var s0=w.entries[sm.ei].sets[sm.si];w.entries[sm.ei].sets.splice(sm.si+1,0,{weight:s0?s0.weight:"",reps:"",rir:"",status:"pending"});state.setMenu=null;saveWorkout();render();persistSetCount(w.entries[sm.ei]);return;}
  if(a==="wo:delset"){var w=state.workout,sm=state.setMenu;if(!w||!sm)return;if(w.entries[sm.ei].sets.length>1)w.entries[sm.ei].sets.splice(sm.si,1);state.setMenu=null;saveWorkout();render();persistSetCount(w.entries[sm.ei]);return;}
  if(a==="wo:skipset"){var w=state.workout,sm=state.setMenu;if(!w||!sm)return;var stt=w.entries[sm.ei].sets[sm.si];stt.status=stt.status==="skipped"?"pending":"skipped";state.setMenu=null;saveWorkout();render();return;}
  if(a==="wo:bw"){state.bwEdit=true;render();return;}
  if(a==="wo:bwsave"){var w=state.workout;var inp=document.getElementById("wl-bwinput");var v=num(inp&&inp.value);if(v!=null&&w){var old=w.bw;w.bw=v;w.entries.forEach(function(en){if(en.bodyweight)en.sets.forEach(function(s){s.weight=String(v+(en.addedWt||0));});});}state.bwEdit=false;saveWorkout();render();return;}
  if(a==="wo:bwcancel"){state.bwEdit=false;render();return;}
  if(a==="wo:finish"){if(typeof restNotifyCancel==="function")restNotifyCancel();var w=state.workout;if(!w)return;var pending=0;w.entries.forEach(function(en){en.sets.forEach(function(s){if(s.status==="pending")pending++;});});
    if(pending>0){state.woPrompt=true;render();return;}
    w.finishing=true;w.finishForm=w.finishForm||{hr:"",hrMax:"",cal:"",rpe:"",zone:2,notes:""};if(typeof whoopFillFinish==="function")whoopFillFinish(w);saveWorkout();render();return;}
  if(a==="wo:completethem"){state.woPrompt=false;var w=state.workout;var tid=null;if(w){for(var ei=0;ei<w.entries.length&&tid==null;ei++){for(var si=0;si<w.entries[ei].sets.length;si++){if(w.entries[ei].sets[si].status==="pending"){tid="wo-ex-"+ei;break;}}}}render();if(tid){var elx=document.getElementById(tid);if(elx)elx.scrollIntoView({behavior:"smooth",block:"start"});}return;}
  if(a==="wo:skipthem"){var w=state.workout;if(w)w.entries.forEach(function(en){en.sets.forEach(function(s){if(s.status==="pending")s.status="skipped";});});state.woPrompt=false;w.finishing=true;w.finishForm=w.finishForm||{hr:"",hrMax:"",cal:"",rpe:"",zone:2,notes:""};if(typeof whoopFillFinish==="function")whoopFillFinish(w);saveWorkout();render();return;}
  if(a==="wo:promptcancel"){state.woPrompt=false;render();return;}
  if(a==="wo:finishback"){var w=state.workout;if(w)w.finishing=false;saveWorkout();render();return;}
  if(a==="wof:zone"){var w=state.workout;if(w&&w.finishForm)w.finishForm.zone=+el.getAttribute("data-zone");render();return;}
  if(a==="wo:discard"){if(typeof restNotifyCancel==="function")restNotifyCancel();askConfirm("Discard this workout? Nothing will be saved.",function(){state.workout=null;saveWorkout();if(woTimer)clearInterval(woTimer);state.view="train";},{label:"Discard"});return;}
  if(a==="wo:exmenu"){state.exMenu={ei:+el.getAttribute("data-ei")};render();return;}
  if(a==="wo:exmenu:close"){state.exMenu=null;render();return;}
  if(a==="wo:exprog"){switchEntryProgression(+el.getAttribute("data-ei"));return;}
  if(a==="wo:exmove"){var w=state.workout;if(!w)return;var ei=+el.getAttribute("data-ei");var dir=el.getAttribute("data-dir");var ni=dir==="up"?ei-1:ei+1;if(ni<0||ni>=w.entries.length){state.exMenu=null;render();return;}var tmp=w.entries[ei];w.entries[ei]=w.entries[ni];w.entries[ni]=tmp;ssNormalize(w.entries);state.exMenu=null;saveWorkout();render();return;}
  if(a==="wo:sslink"||a==="wo:ssunlink"){var w=state.workout;if(!w||!w.entries)return;var ei=+el.getAttribute("data-ei");
    var es=w.entries;if(ei<0||ei>=es.length-1)return;state.exMenu=null;
    var link=(a==="wo:sslink");
    if(link){
      var g=es[ei].groupId||es[ei+1].groupId||("g-"+Date.now()+"-"+Math.random().toString(36).slice(2,6));
      var oldg=es[ei+1].groupId;
      es[ei].groupId=g;es[ei+1].groupId=g;
      if(oldg&&oldg!==g)for(var k=0;k<es.length;k++)if(es[k].groupId===oldg)es[k].groupId=g;
    }else{
      var sp=ssSpan(es,ei);if(!sp.g)return;
      var ng="g-"+Date.now()+"-"+Math.random().toString(36).slice(2,6);
      for(var k2=ei+1;k2<sp.e;k2++)es[k2].groupId=ng;
    }
    ssNormalize(es);saveWorkout();render();
    /* Same once/forward choice as the per-exercise rest interval: this session
       by default, or push it into the routine for every future workout. Only
       offered when the two items are still adjacent in the routine, so saying
       yes can never silently reorder it. */
    var rt=getRoutine(w.routineId);
    var ia=rt&&rItem(rt,es[ei].itemId),ib=rt&&rItem(rt,es[ei+1].itemId);
    if(rt&&ia&&ib){
      var arr=rt.items||[],xa=arr.indexOf(ia),xb=arr.indexOf(ib);
      if(xa>=0&&xb===xa+1){
        var _gv=link?es[ei].groupId:null;
        askConfirm(link?"Superset saved for this session. Also keep it in “"+((rt.name||"this routine"))+"” for future workouts?"
                       :"Superset broken for this session. Also break it in “"+((rt.name||"this routine"))+"” for future workouts?",
          function(){var r2=getRoutine(w.routineId);if(!r2)return;var a2=rItem(r2,es[ei].itemId),b2=rItem(r2,es[ei+1].itemId);if(!a2||!b2)return;
            if(link){var gg=a2.groupId||b2.groupId||_gv||("g-"+Date.now()+"-"+Math.random().toString(36).slice(2,6));var og=b2.groupId;a2.groupId=gg;b2.groupId=gg;
              if(og&&og!==gg)for(var q=0;q<(r2.items||[]).length;q++)if(r2.items[q].groupId===og)r2.items[q].groupId=gg;}
            else{var s2=ssSpan(r2.items,r2.items.indexOf(a2));if(s2.g){var n2="g-"+Date.now()+"-"+Math.random().toString(36).slice(2,6);for(var q2=r2.items.indexOf(a2)+1;q2<s2.e;q2++)r2.items[q2].groupId=n2;}}
            ssNormalize(r2.items);saveTraining();render();},
          {label:"Save to routine",danger:false});
        return;
      }
    }
    toast(link?"Supersetted for this session":"Superset broken for this session");return;}
  if(a==="wo:exaddset"){var w=state.workout;if(!w)return;var en=w.entries[+el.getAttribute("data-ei")];var last=en.sets[en.sets.length-1];en.sets.push({weight:last?last.weight:"",reps:"",rir:"",status:"pending"});state.exMenu=null;saveWorkout();render();persistSetCount(en);return;}
  if(a==="wo:exremove"){var w=state.workout;var ei=+el.getAttribute("data-ei");var en=w&&w.entries[ei];askConfirm("Remove "+((en&&en.name)||"this exercise")+" from this workout? (Your routine isn\u2019t changed.)",function(){var w2=state.workout;if(w2){w2.entries.splice(ei,1);ssNormalize(w2.entries);}state.exMenu=null;saveWorkout();},{label:"Remove"});return;}
  if(a==="wo:exreplace"){state.woReplaceEi=+el.getAttribute("data-ei");state.exMenu=null;render();return;}
  if(a==="wo:replacecancel"){state.woReplaceEi=null;render();return;}
  if(a==="wo:replacepick"){var w=state.workout;var ei=state.woReplaceEi;var ex=exById(el.getAttribute("data-eid"));if(w&&ei!=null&&ex){var en=w.entries[ei];var _prevN=en.name;en.exerciseId=ex.id;en.name=ex.name;en.muscle=ex.muscle;en.equipment=ex.equipment;en.bodyweight=!!ex.bodyweight;en.notes=[];(ex.notes||[]).forEach(function(nn){en.notes.push({id:nn.id,text:nn.text,pinned:true});});
    /* Owner spec: swapping mid-workout asks whether the routine keeps the change */
    var _rt=getRoutine(w.routineId);var _it=_rt&&en.itemId?rItem(_rt,en.itemId):null;
    if(_it&&_it.exerciseId!==ex.id)state.woReplSave={rtId:w.routineId,itemId:en.itemId,exId:ex.id,prev:_prevN,next:ex.name};
  }state.woReplaceEi=null;saveWorkout();render();return;}
  if(a==="wo:replsave:once"){state.woReplSave=null;render();return;}
  if(a==="wo:replsave:fwd"){var _rs=state.woReplSave;state.woReplSave=null;if(_rs){var _rt2=getRoutine(_rs.rtId);var _it2=_rt2?rItem(_rt2,_rs.itemId):null;var _ex2=exById(_rs.exId);if(_it2&&_ex2){_it2.exerciseId=_ex2.id;saveTraining();toast("Routine updated: "+_ex2.name+" going forward");}else{toast("Couldn't update the routine");}}render();return;}
  if(a==="wo:exnote"){var w=state.workout;var en=w&&w.entries[+el.getAttribute("data-ei")];if(!en)return;state.routineId=w.routineId;state.noteEdit={iid:en.itemId,nid:null,text:"",pinned:false,woEi:+el.getAttribute("data-ei")};state.exMenu=null;render();return;}
  if(a==="wo:hist"){var w=state.workout;var en=w&&w.entries[+el.getAttribute("data-ei")];if(en)openHistory(en.exerciseId,en.name);return;}
  if(a==="wo:histclose"){state.histView=null;render();return;}
  if(a==="wo:savesession"){var w=state.workout;if(!w)return;var b=woBuckets();var ff=w.finishForm||{};var hrv=num(ff.hr);var zone=zoneForHR(hrv);if(zone==null)zone=(ff.zone||null);
    /* Persist the scheme the session was actually trained under, not just a single
       rep range. Reverse pyramid prescribes a different range per set, so dropping
       setRanges here left every report judging a 12-rep third set against 6-8.
       setRanges is stored for RPT only — under double progression all sets share
       repLow/repHigh and a per-set copy would be noise. Sized to the sets actually
       logged, since sets can be added or removed mid-workout. */
    var _srt=getRoutine(w.routineId);
    var entries=w.entries.map(function(en){
      var prog=en.progression||(_srt&&_srt.progression)||"double";
      var o={exerciseId:en.exerciseId,name:en.name,muscle:en.muscle,groupId:en.groupId||null,fb:en.fb||null,progression:prog,repLow:en.repLow,repHigh:en.repHigh,sets:en.sets.map(function(s){return {weight:num(s.weight),reps:num(s.reps),rir:num(s.rir),status:s.status,sugR:num(s.sugR),sugW:num(s.sugW),tgtLo:num(s.tgtLo),tgtHi:num(s.tgtHi)};})};
      if(prog==="rpt")o.setRanges=rptRangesFor({movement:en.movement,setRanges:en.setRanges},Math.max(1,en.sets.length));
      return o;});
    var sess={id:"l-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),routineId:w.routineId,name:w.name,mode:"full",date:w.date,mins:Math.round(b.total/60000),warmupSec:Math.round(b.warmup/1000),workSec:Math.round(b.work/1000),restSec:Math.round(b.rest/1000),mfb:w.mfb||null,hr:num(ff.hr),hrMax:num(ff.hrMax),zone:zone,whoopZones:(w.whoopZones||null),cal:num(ff.cal),rpe:num(ff.rpe),notes:(ff.notes||"").trim(),bw:w.bw,entries:entries,ts:Date.now()};
    state.training.liftSessions=state.training.liftSessions||{};var d=w.date;var list=(state.training.liftSessions[d]||[]).slice();list.push(sess);state.training.liftSessions[d]=list;
    syncLiftTags(d);saveTraining();save();state.workout=null;saveWorkout();if(woTimer)clearInterval(woTimer);state.liftViewDate=d;state.liftViewId=sess.id;state.liftEdit=null;state.view="liftview";toast("Workout saved");render();return;}
  if(a==="lift:view"){state.liftViewDate=state.selDate;state.liftViewId=el.getAttribute("data-id");state.liftEdit=null;state.view="liftview";render();return;}
  if(a==="lift:back"){state.view="train";state.liftViewId=null;state.liftEdit=null;render();return;}
  if(a==="lift:edit"){state.liftEdit=(getLiftSession()&&getLiftSession().mode==="full")?"sets":"summary";render();return;}
  if(a==="lift:editcancel"){state.liftEdit=null;render();return;}
  if(a==="lift:tofinish"){state.liftEdit="summary";render();return;}
  if(a==="lift:summaryback"){state.liftEdit=(getLiftSession()&&getLiftSession().mode==="full")?"sets":null;render();return;}
  if(a==="lift:del"){var sid=el.getAttribute("data-id");var ls=state.training.liftSessions||{};var vic=null,vd=null;Object.keys(ls).forEach(function(dt){(ls[dt]||[]).forEach(function(s){if(s.id===sid){vic=s;vd=dt;}});});if(!vd){toast("Session not found");return;}askConfirm("Delete this "+((vic&&vic.name)||"workout")+" session? This can\u2019t be undone.",function(){var a2=(ls[vd]||[]).filter(function(s){return s.id!==sid;});if(a2.length)ls[vd]=a2;else delete ls[vd];syncLiftTags(vd);saveTraining();save();if(state.view==="liftview"){state.view="train";state.liftEdit=null;}},{label:"Delete"});return;}
  if(a==="lift:savedetail"){
    var _es=getLiftSession();
    if(_es){
      var _old=state.liftViewDate;
      var _nd=(typeof _es.date==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(_es.date))?_es.date:_old;
      /* Rebuild ts from the (possibly edited) date + start time, local. */
      var _tm=(typeof _es.time==="string"&&/^\d{1,2}:\d{2}$/.test(_es.time))?_es.time:null;
      var _base=new Date(num(_es.ts)||Date.now());
      var _hh=_tm?parseInt(_tm.split(":")[0],10):_base.getHours();
      var _mm2=_tm?parseInt(_tm.split(":")[1],10):_base.getMinutes();
      var _pp=_nd.split("-");
      _es.ts=new Date(parseInt(_pp[0],10),parseInt(_pp[1],10)-1,parseInt(_pp[2],10),_hh,_mm2).getTime();
      delete _es.time;   /* transient editor field; ts is the stored truth */
      _es.date=_nd;
      if(_nd!==_old){
        var _ls=state.training.liftSessions;
        var _rest=(_ls[_old]||[]).filter(function(x){return x.id!==_es.id;});
        if(_rest.length)_ls[_old]=_rest;else delete _ls[_old];
        _ls[_nd]=(_ls[_nd]||[]).slice();_ls[_nd].push(_es);
        /* Re-derive the auto activity tags on BOTH days, through the app's own
           derivation -- never by hand-editing core. */
        syncLiftTags(_old);syncLiftTags(_nd);
        state.liftViewDate=_nd;}}
    saveTraining();save();state.view="train";state.liftViewId=null;state.liftEdit=null;toast("Saved");render();return;}
  if(a==="wt:add"){state.view="wtadd";render();return;}
  if(a==="wo:resumeask"){state.woResume=true;render();return;}
  if(a==="wo:resumecancel"){state.woResume=false;render();return;}
  if(a==="wo:resume"){state.woResume=false;var w=state.workout;if(w&&w.paused){w.paused=false;w.tState="working";w.stateStartTs=Date.now();if(w.startTs==null)w.startTs=Date.now();saveWorkout();}state.view="workout";render();startWoTick();return;}
  if(a==="wo:finishlater"){pauseWorkout();state.woPrompt=false;state.woResume=false;state.view="train";toast("Saved to finish later");render();return;}
  if(a==="wo:endnow"){if(typeof restNotifyCancel==="function")restNotifyCancel();state.woResume=false;state.view="workout";var w=state.workout;if(w){var pending=0;w.entries.forEach(function(en){en.sets.forEach(function(s){if(s.status==="pending")pending++;});});if(pending>0){state.woPrompt=true;}else{w.finishing=true;w.finishForm=w.finishForm||{hr:"",hrMax:"",cal:"",rpe:"",zone:2,notes:""};if(typeof whoopFillFinish==="function")whoopFillFinish(w);}saveWorkout();}render();return;}
  if(a==="wo:discardnow"){if(typeof restNotifyCancel==="function")restNotifyCancel();state.woResume=false;askConfirm("Discard this workout? Nothing will be saved.",function(){state.workout=null;saveWorkout();if(woTimer)clearInterval(woTimer);state.view="train";},{label:"Discard"});return;}
  if(a==="wo:quick"){var rid=el.getAttribute("data-id");state.liftForm={routineId:rid,id:null,date:state.selDate||todayISO(),mins:"",hr:"",hrMax:"",cal:"",zone:2,rpe:"",notes:""};state.view="quicklog";render();return;}
  if(a==="lf:zone"){if(state.liftForm)state.liftForm.zone=+el.getAttribute("data-zone");render();return;}
  if(a==="lift:cancel"){state.liftForm=null;state.view="rlaunch";render();return;}
  if(a==="lift:save"){var lf=state.liftForm;if(!lf)return;var mins=num(lf.mins);if(mins==null||mins<=0){toast("Enter a duration in minutes");return;}
    var rt=getRoutine(lf.routineId);var d=lf.date||todayISO();var hrv=num(lf.hr);var zone=zoneForHR(hrv);if(zone==null)zone=(lf.zone||null);
    var sess={id:lf.id||("l-"+Date.now()+"-"+Math.random().toString(36).slice(2,6)),routineId:lf.routineId,name:(rt&&rt.name)||"Weight training",mode:"quick",mins:Math.round(mins),hr:num(lf.hr),hrMax:num(lf.hrMax),zone:zone,cal:num(lf.cal),rpe:num(lf.rpe),notes:(lf.notes||"").trim(),ts:Date.now()};
    state.training.liftSessions=state.training.liftSessions||{};var list=(state.training.liftSessions[d]||[]).slice();list.push(sess);state.training.liftSessions[d]=list;
    syncLiftTags(d);saveTraining();save();state.liftForm=null;state.view="train";toast("Workout logged");render();return;}
  if(a==="rt:openedit_dummy"){return;}
  if(a==="rt:del"){var rid=el.getAttribute("data-id");var rr=getRoutine(rid);var _fromView=(state.view==="rlaunch"||state.view==="routine");askConfirm("Delete the routine \""+((rr&&rr.name)||"Untitled")+"\"? This can\u2019t be undone. (Your exercise library is unaffected.)",function(){
    if(_fromView){state.view="wtadd";state.routineId=null;state.riPickOpen=false;}state.training.routines=(state.training.routines||[]).filter(function(r){return r.id!==rid;});saveTraining();if(state.view!=="wtadd"){state.view="train";}state.routineId=null;});return;}
  if(a==="ri:add"){state.riPickOpen=true;state.noteEdit=null;render();return;}
  if(a==="ri:pickclose"){state.riPickOpen=false;render();return;}
  if(a==="ri:pick"){var rt=getRoutine(state.routineId);if(!rt)return;var eid=el.getAttribute("data-eid");if((rt.items||[]).some(function(i){return i.exerciseId===eid;}))return;rt.items=rt.items||[];rt.items.push({id:"i-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),exerciseId:eid,repLow:"8",repHigh:"12",sets:3,weight:"",movement:guessMovement((exById(eid)||{}).muscle),notes:[]});saveTraining();render();return;}
  if(a==="ri:remove"){var rt=getRoutine(state.routineId);if(!rt)return;var iid=el.getAttribute("data-iid");var itm=rItem(rt,iid);var exn=itm&&exById(itm.exerciseId);askConfirm("Remove "+((exn&&exn.name)||"this exercise")+" from this routine?",function(){var r2=getRoutine(state.routineId);if(r2){r2.items=(r2.items||[]).filter(function(i){return i.id!==iid;});ssNormalize(r2.items);}saveTraining();},{label:"Remove"});return;}
  if(a==="ri:up"||a==="ri:down"){var rt=getRoutine(state.routineId);if(!rt)return;var iid=el.getAttribute("data-iid");var arr=rt.items||[];var ix=-1;for(var i=0;i<arr.length;i++){if(arr[i].id===iid){ix=i;break;}}if(ix<0)return;
    /* Supersets must stay contiguous. Inside a group the arrows reorder the
       members (A/B swap); at a group edge they move the WHOLE group past the
       neighbouring block, and an ungrouped item likewise hops a whole group
       rather than landing in the middle of one. */
    var sp=ssSpan(arr,ix);var up=(a==="ri:up");
    if(sp.g&&((up&&ix>sp.s)||(!up&&ix<sp.e-1))){var ni=up?ix-1:ix+1;var t=arr[ix];arr[ix]=arr[ni];arr[ni]=t;saveTraining();render();return;}
    var blk=arr.slice(sp.s,sp.e);
    var nb=up?ssSpan(arr,sp.s-1):ssSpan(arr,sp.e);
    if((up&&sp.s===0)||(!up&&sp.e>=arr.length))return;
    var other=arr.slice(nb.s,nb.e);
    var rest=arr.slice();
    if(up){rest.splice(nb.s,(sp.e-nb.s),...blk,...other);}
    else{rest.splice(sp.s,(nb.e-sp.s),...other,...blk);}
    rt.items=rest;ssNormalize(rt.items);saveTraining();render();return;}
  if(a==="ri:sslink"||a==="ri:ssunlink"){var rt=getRoutine(state.routineId);if(!rt)return;var arr=rt.items||[];var iid=el.getAttribute("data-iid");var ix=-1;for(var i=0;i<arr.length;i++){if(arr[i].id===iid){ix=i;break;}}
    if(ix<0||ix>=arr.length-1)return;
    if(a==="ri:sslink"){
      /* join this item to the one below: adopt whichever side already has a
         group, else mint one; if both have (different) groups, merge them. */
      var g=arr[ix].groupId||arr[ix+1].groupId||("g-"+Date.now()+"-"+Math.random().toString(36).slice(2,6));
      var oldg=arr[ix+1].groupId;
      arr[ix].groupId=g;arr[ix+1].groupId=g;
      if(oldg&&oldg!==g)for(var k=0;k<arr.length;k++)if(arr[k].groupId===oldg)arr[k].groupId=g;
    }else{
      /* split the group between ix and ix+1 — the tail becomes its own group */
      var sp=ssSpan(arr,ix);if(!sp.g)return;
      var ng="g-"+Date.now()+"-"+Math.random().toString(36).slice(2,6);
      for(var k2=ix+1;k2<sp.e;k2++)arr[k2].groupId=ng;
    }
    ssNormalize(arr);saveTraining();render();return;}
  if(a==="ri:setinc"||a==="ri:setdec"){var rt=getRoutine(state.routineId);if(!rt)return;var it=rItem(rt,el.getAttribute("data-iid"));if(!it)return;var s=(+it.sets||0)+(a==="ri:setinc"?1:-1);if(s<1)s=1;if(s>15)s=15;it.sets=s;if(Array.isArray(it.setRanges))it.setRanges=rptRangesFor(it,s);saveTraining();render();return;}
  if(a==="ri:prog"){var rt=getRoutine(state.routineId);if(!rt)return;var it=rItem(rt,el.getAttribute("data-iid"));if(!it)return;it.progression=el.getAttribute("data-prog");saveTraining();render();return;}
  if(a==="ri:mv"){var rt=getRoutine(state.routineId);if(!rt)return;var it=rItem(rt,el.getAttribute("data-iid"));if(!it)return;it.movement=el.getAttribute("data-mv");it.setRanges=rptDefRanges(it.movement,Math.max(1,it.sets||3));saveTraining();render();return;}
  if(a==="note:add"){state.noteEdit={iid:el.getAttribute("data-iid"),nid:null,text:"",pinned:false};render();return;}
  if(a==="note:edit"){var iid=el.getAttribute("data-iid");var nid=el.getAttribute("data-nid");var pinned=el.getAttribute("data-pinned")==="1";var _woei=el.getAttribute("data-woei");if(_woei!=null&&_woei!==""&&state.workout)state.routineId=state.workout.routineId;var rt=getRoutine(state.routineId);var it=rItem(rt,iid);var ex=it&&exById(it.exerciseId);var src=pinned?(ex&&ex.notes):(it&&it.notes);var note=(src||[]).filter(function(n){return n.id===nid;})[0];state.noteEdit={iid:iid,nid:nid,text:(note&&note.text)||"",pinned:pinned,woEi:(_woei!=null&&_woei!=="")?+_woei:undefined};render();return;}
  if(a==="note:pin"){if(state.noteEdit){var ip=document.getElementById("wl-noteinput");if(ip)state.noteEdit.text=ip.value;state.noteEdit.pinned=!state.noteEdit.pinned;}render();return;}
  if(a==="note:cancel"){state.noteEdit=null;render();return;}
  if(a==="note:save"){var ne=state.noteEdit;if(!ne)return;var ip=document.getElementById("wl-noteinput");var txt=((ip&&ip.value)||ne.text||"").trim();var rt=getRoutine(state.routineId);var it=rItem(rt,ne.iid);var ex=it&&exById(it.exerciseId);if(!it||!ex){state.noteEdit=null;render();return;}
    if(ne.nid){ex.notes=(ex.notes||[]).filter(function(n){return n.id!==ne.nid;});it.notes=(it.notes||[]).filter(function(n){return n.id!==ne.nid;});}
    if(txt){var note={id:ne.nid||("n-"+Date.now()+"-"+Math.random().toString(36).slice(2,6)),text:txt};if(ne.pinned){ex.notes=ex.notes||[];ex.notes.push(note);}else{it.notes=it.notes||[];it.notes.push(note);}}
    saveTraining();if(ne.woEi!=null)rebuildEntryNotes(ne.woEi);state.noteEdit=null;render();return;}
  if(a==="note:del"){var ne=state.noteEdit;if(!ne||!ne.nid){state.noteEdit=null;render();return;}var rt=getRoutine(state.routineId);var it=rItem(rt,ne.iid);var ex=it&&exById(it.exerciseId);if(ex)ex.notes=(ex.notes||[]).filter(function(n){return n.id!==ne.nid;});if(it)it.notes=(it.notes||[]).filter(function(n){return n.id!==ne.nid;});saveTraining();if(ne.woEi!=null)rebuildEntryNotes(ne.woEi);state.noteEdit=null;render();return;}
  if(a==="ex:seedall"){var xa=(state.training.exercises||[]);EXSEED.forEach(function(sd,ix){if(!xa.some(function(e){return e.name.toLowerCase()===sd.n.toLowerCase();}))xa.push({id:"x-"+Date.now()+"-"+ix+"-"+Math.random().toString(36).slice(2,6),name:sd.n,muscle:sd.m,equipment:sd.e||"",bodyweight:!!sd.bw,notes:[]});});state.training.exercises=xa;saveTraining();render();return;}
  if(a==="ex:clearall"){if(!(state.training.exercises||[]).length)return;askConfirm("Remove ALL exercises from your library? You can re-add them from Browse.",function(){state.training.exercises=[];saveTraining();},{label:"Remove all"});return;}
  if(a==="ex:add"){state.exForm={id:null,name:"",muscle:"chest",equipment:"",bodyweight:false};render();return;}
  if(a==="ex:newfromwt"){state.exlibFrom="wtadd";state.view="exlib";state.exForm={id:null,name:"",muscle:"chest",equipment:"",bodyweight:false};render();return;}
  if(a==="ex:edit"){var xid=el.getAttribute("data-id");var xe=(state.training.exercises||[]).filter(function(e){return e.id===xid;})[0];if(xe)state.exForm={id:xe.id,name:xe.name,muscle:xe.muscle||"other",equipment:xe.equipment||"",bodyweight:!!xe.bodyweight,movement:xe.movement||guessMovement(xe.muscle)};render();return;}
  if(a==="ex:mv"){if(state.exForm){state.exForm.movement=el.getAttribute("data-mv");render();}return;}
  if(a==="ex:cancel"){state.exForm=null;render();return;}
  if(a==="ex:muscle"){if(state.exForm)state.exForm.muscle=el.getAttribute("data-muscle");render();return;}
  if(a==="ex:bw"){if(state.exForm)state.exForm.bodyweight=!state.exForm.bodyweight;render();return;}
  if(a==="ex:save"){var xf=state.exForm;if(!xf)return;var nm=(xf.name||"").trim();if(!nm){toast("Name the exercise");return;}
    var list=(state.training.exercises||[]).slice();
    if(xf.id){for(var i=0;i<list.length;i++){if(list[i].id===xf.id){list[i]=Object.assign({},list[i],{name:nm,muscle:xf.muscle||"other",equipment:(xf.equipment||"").trim(),bodyweight:!!xf.bodyweight,movement:xf.movement||guessMovement(xf.muscle)});break;}}}
    else{if(list.some(function(e){return e.name.toLowerCase()===nm.toLowerCase();})){toast("That exercise already exists");return;}list.push({id:"x-"+Date.now()+"-"+Math.random().toString(36).slice(2,6),name:nm,muscle:xf.muscle||"other",equipment:(xf.equipment||"").trim(),bodyweight:!!xf.bodyweight,movement:xf.movement||guessMovement(xf.muscle),notes:[]});}
    state.training.exercises=list;saveTraining();state.exForm=null;toast("Saved");render();return;}
  if(a==="ex:del"){var did=el.getAttribute("data-id");var dex=(state.training.exercises||[]).filter(function(e){return e.id===did;})[0];if(!dex)return;askConfirm("Remove \""+dex.name+"\" from your library? This can\u2019t be undone.",function(){state.training.exercises=(state.training.exercises||[]).filter(function(e){return e.id!==did;});saveTraining();if(state.exForm&&state.exForm.id===did)state.exForm=null;});return;}
  if(a==="cardio:add"){state.cardioForm={kind:"cardio",id:null,picking:true,type:"",mins:"",zone:2,rpe:"",cal:"",hr:"",hrMax:"",notes:"",newOpen:false};state.view="cardioadd";render();return;}
  if(a==="cardio:edit"){var eid=el.getAttribute("data-id");var es=((state.training.sessions[state.selDate])||[]).filter(function(s){return s.id===eid;})[0];if(es)state.cardioForm={kind:"cardio",id:es.id,type:es.type,mins:es.mins,zone:es.zone||2,rpe:es.rpe!=null?es.rpe:"",cal:es.cal!=null?es.cal:"",hr:es.hr!=null?es.hr:"",hrMax:es.hrMax!=null?es.hrMax:"",notes:es.notes!=null?es.notes:"",picking:false,newOpen:false};state.view="cardioadd";render();return;}
  if(a==="cardio:pick"){state.cardioTypeEdit=false;if(state.cardioForm){state.cardioForm.type=el.getAttribute("data-type");state.cardioForm.picking=false;}render();return;}
  if(a==="cardio:repick"){if(state.cardioForm)state.cardioForm.picking=true;render();return;}
  if(a==="cardio:cancel"){state.cardioForm=null;state.view="train";render();return;}
  if(a==="cf:type"){if(state.cardioForm)state.cardioForm.type=el.getAttribute("data-type");render();return;}
  if(a==="cf:zone"){if(state.cardioForm)state.cardioForm.zone=+el.getAttribute("data-zone");render();return;}
  if(a==="cf:newtype-toggle"){if(state.cardioForm)state.cardioForm.newOpen=!state.cardioForm.newOpen;render();return;}
  if(a==="cf:newtype"){var ni=document.getElementById("wl-newcardio");var nv=((ni&&ni.value)||"").trim();if(!nv)return;var prc=normPresets();if(!prc.some(function(p){return p.name.toLowerCase()===nv.toLowerCase()&&p.cat==="cardio";})){prc.push({name:nv,cat:"cardio"});state.presets=prc;save();}if(state.cardioForm){state.cardioForm.type=nv;state.cardioForm.newOpen=false;state.cardioForm.picking=false;}render();return;}
  if(a==="act:addopen"){state.actAddCat=el.getAttribute("data-cat");render();var _ai=document.getElementById("wl-addact-"+state.actAddCat);if(_ai)_ai.focus();return;}
  if(a==="act:addcat"){var ac=el.getAttribute("data-cat");var ai=document.getElementById("wl-addact-"+ac);var av=((ai&&ai.value)||"").trim();if(!av){state.actAddCat=null;render();return;}var prA=normPresets();if(!prA.some(function(p){return p.name.toLowerCase()===av.toLowerCase()&&p.cat===ac;})){prA.push({name:av,cat:ac});state.presets=prA;save();}state.actAddCat=null;render();return;}
  if(a==="cardio:save"){var cf=state.cardioForm;if(!cf)return;var mins=num(cf.mins);
    if(!cf.type){toast("Pick a cardio type");return;}if(mins==null||mins<=0){toast("Enter a duration in minutes");return;}
    var d=state.selDate;var list=((state.training.sessions[d])||[]).slice();
    var hrv=num(cf.hr);var zone=zoneForHR(hrv);if(zone==null)zone=(cf.zone||null);
    var sess={id:cf.id||("c-"+Date.now()+"-"+Math.random().toString(36).slice(2,6)),kind:"cardio",type:cf.type,mins:Math.round(mins),zone:zone,rpe:num(cf.rpe),cal:num(cf.cal),hr:num(cf.hr),hrMax:num(cf.hrMax),notes:(cf.notes||"").trim(),ts:Date.now()};
    if(cf.id){for(var i=0;i<list.length;i++){if(list[i].id===cf.id){list[i]=sess;break;}}}else list.push(sess);
    state.training.sessions[d]=list;syncCardioTags(d);saveTraining();save();state.cardioForm=null;state.view="train";toast("Cardio logged");render();return;}
  if(a==="cardio:del"){var did=el.getAttribute("data-id");var dd2=state.selDate;var sList=(state.training.sessions[dd2])||[];var victim=sList.filter(function(s){return s.id===did;})[0];askConfirm("Delete this "+((victim&&victim.type)||"cardio")+" session"+(victim&&victim.mins?" ("+victim.mins+" min)":"")+"? This can\u2019t be undone.",function(){var l2=((state.training.sessions[dd2])||[]).filter(function(s){return s.id!==did;});if(l2.length)state.training.sessions[dd2]=l2;else delete state.training.sessions[dd2];syncCardioTags(dd2);saveTraining();save();if(state.cardioForm&&state.cardioForm.id===did)state.cardioForm=null;});return;}
  if(a==="day:reopenask"){state.reopenAsk=el.getAttribute("data-date")||state.selDate;render();return;}
  if(a==="day:reopencancel"){state.reopenAsk=null;render();return;}
  if(a==="day:reopendo"){reopenDay(el.getAttribute("data-date")||state.selDate);return;}
  if(a==="night:gen"){genNightly();return;}
  if(a==="tdee:apply"){var _ta=tdeeAnalysis();var _tp=_ta&&_ta.prop;if(!_tp){toast("Nothing to apply");render();return;}var _s=state.settings;_s.targetCalories=String(_tp.cal);_s.calTargetAuto=false;if(_tp.carbs!=null){_s.targetCarbs=String(_tp.carbs);_s.targetFat=String(_tp.fat);_s.macroAuto=false;}if(_tp.steps!=null)_s.stepsGoal=String(_tp.steps);if(_tp.cardio!=null)_s.cardioMinGoal=String(_tp.cardio);_s.tdeeApplied=todayISO();delete _s.tdeeSnooze;save();toast("Plan updated \u2014 targets adjusted");render();return;}
  if(a==="tdee:later"){state.settings.tdeeSnooze=todayISO();save();render();return;}
  if(a==="hist:tab"){state.histTab=el.getAttribute("data-tab");state.histMore=false;render();return;}
  if(a==="hist:more"){state.histMore=true;render();return;}
  if(a==="hist:day"){var hd=el.getAttribute("data-date");state.selDate=hd;var hp=parseISO(hd);state.calY=hp.getFullYear();state.calM=hp.getMonth();state.view="train";render();return;}
  if(a==="bc:tab"){state.bcTab=el.getAttribute("data-tab");render();return;}
  /* measurement trend component (Owner package 2026-08-06): metric switching
     (bc:tab above) deliberately PRESERVES t2Mode/t2Off per the spec */
  if(a==="t2:mode"){state.t2Mode=el.getAttribute("data-mode");state.t2Off=0;state.t2Pt=null;state.histMore=false;render();return;}
  if(a==="t2:prev"){state.t2Off=(state.t2Off||0)+1;state.t2Pt=null;state.histMore=false;render();return;}
  if(a==="t2:next"){if((state.t2Off||0)>0){state.t2Off=state.t2Off-1;state.t2Pt=null;state.histMore=false;render();}return;}
  if(a==="t2:tocur"){state.t2Off=0;state.t2Pt=null;render();return;}
  if(a==="t2:pt"){state.t2Pt={tab:state.bcTab||"weight",date:el.getAttribute("data-date"),value:num(el.getAttribute("data-value"))};render();return;}
  if(a==="whoopstats"){state.whoopStatsOpen=(state.whoopStatsOpen===false);render();return;}
  if(a==="morestats"){state.moreStats=(state.moreStats===false);render();return;}
  if(a==="syncdot"){var _sr=syncIdleReason();if(_sr){toast("Sync: "+_sr);return;}
var lt=getLastSync();toast((syncLabel()||"Sync")+(lt?" \u00b7 "+fmtClock(lt):"")+(syncState.msg?" \u2014 "+syncState.msg:""));return;}
  if(a==="photo:add"){state.pendingMeal=el.getAttribute("data-meal")||"";state.pendingPose=null;document.getElementById("wl-photo-input").click();return;}
  if(a==="photo:resync"){
    toast("Downloading photos…");
    try{photoSync(function(r){
      if(r&&(r.downloaded||r.uploaded))toast(r.downloaded+" downloaded, "+r.uploaded+" uploaded");
      else{var q=psReport();toast(q&&!q.ok?("Photo sync: "+q.why):"Nothing new to download");}
      try{if(state.view==="checkin")renderCheckinPhotos();else if(state.view==="photos")renderProgressPhotos();render();}catch(e){}
    });}catch(e){toast("Photo sync failed to start");}
    return;}
  if(a==="pf:use"){var _pr=state.pfReview;if(!_pr)return;
    var _ok=function(){return (typeof m10StillValid==="function")?m10StillValid(_pr.cap):true;};
    if(!_ok()){toast("This device is no longer the active writer — nothing was changed");pfReviewClose();render();return;}
    var _norm=pfReviewNorm();if(!_norm){toast("Adjust back into bounds first");return;}
    pfReviewClose();render();
    if(_pr.legacyId){
      /* Milestone 5: metadata-ONLY update of the existing record — the blob
         is carried through untouched (idbAdd is a keyed put), authority
         revalidated immediately before the write */
      idbAll().then(function(all){
        var rec=all.filter(function(p){return p.id===_pr.legacyId;})[0];
        if(!rec){if(_pr.solo){toast("That photo is no longer on this device");if(state.view==="photos")renderProgressPhotos();return;}pfLegacyNext(_pr.cap);return;}
        if(!_ok()){toast("This device is no longer the active writer — nothing was changed");return;}
        rec.normalization=_norm;
        idbAdd(rec).then(function(){
          if(_pr.solo){toast("Framing updated");if(state.view==="photos")renderProgressPhotos();return;}
          pfLegacyNext(_pr.cap);})
          .catch(function(){toast("Couldn’t save the framing");});
      }).catch(function(){toast("Couldn’t save the framing");});
      return;}
    pfSaveProgress(_pr.blob,_pr.pose,_pr.week,_norm,_ok).catch(function(){toast("Couldn\u2019t save the photo");});
    if(_pr.fromCam)pfCamAdvance(_pr.pose);
    return;}
  if(a==="pf:reset"){if(state.pfReview){state.pfReview.adj={panX:0,panY:0,zoom:1,rot:0};render();pfReviewPreview();}return;}
  if(a==="pf:choose"){var _pp=state.pfReview;if(!_pp)return;
    if(_pp.fromCam){pfReviewClose();render();return;}   /* back to the live camera beneath */
    pfReviewClose();state.pendingPose=_pp.pose;state.pendingProgWeek=_pp.week;render();
    document.getElementById("wl-photo-input").click();return;}
  if(a==="pf:cancel"){pfReviewClose();render();toast("Nothing was saved");return;}
  if(a==="pphoto:add"){
    var _apose=el.getAttribute("data-pose"),_aweek=el.getAttribute("data-week")||toISO(weekStartFor(0));
    state.pendingMeal=null;
    /* P4 (Architect verdict, data-loss protection): a slot upload REPLACES
       that week's photo — the X2 chain deletes the one standing there. The
       Owner lost a photo to exactly this in Aug 2026. Resolve occupancy
       BEFORE offering the sources so the sheet can say so plainly. */
    state.pfChoose={pose:_apose,week:_aweek,existing:null};
    render();
    idbAll().then(function(all){
      var pc=state.pfChoose;if(!pc||pc.pose!==_apose||pc.week!==_aweek)return;
      var hit=all.filter(function(p){return p.kind==="progress"&&p.pose===_apose&&(p.week||p.date)===_aweek;})[0];
      if(!hit)return;
      pc.existing={id:hit.id,date:hit.week||hit.date};
      render();
    }).catch(function(){});
    return;}
  if(a==="pftl:pose"){state.pfTlPose=el.getAttribute("data-pose");state.pfSel=[];state.pfCompare=false;renderProgressPhotos();return;}
  if(a==="pftl:sel"){var _id=el.getAttribute("data-id");var _s=state.pfSel||[];
    var _i=_s.indexOf(_id);
    if(_i>=0)_s.splice(_i,1);else{if(_s.length>=2)_s.shift();_s.push(_id);}
    state.pfSel=_s;renderProgressPhotos();return;}
  if(a==="pftl:pinref"){var _rid=el.getAttribute("data-id");var _rp2=pfRefs();
    var _pz=state.pfTlPose||"front";
    var _cur=pfRefGet(_pz);
    if(_cur&&_cur.id===_rid){delete _rp2[_pz];toast("Reference unpinned \u2014 ghost follows your latest photo");}
    else{_rp2[_pz]={id:_rid,week:el.getAttribute("data-week")||null};toast("Pinned \u2014 the camera ghost for this pose now always uses this photo");}
    pfRefSave(_rp2);renderProgressPhotos();return;}
  if(a==="pftl:editdate"){state.pfDateEdit={id:el.getAttribute("data-id")};renderProgressPhotos();return;}
  if(a==="pfdate:cancel"){state.pfDateEdit=null;renderProgressPhotos();return;}
  if(a==="pfdate:save"){var _did=el.getAttribute("data-id");
    var _din=document.getElementById("wl-pfdate");
    var _dv=_din&&_din.value;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(_dv||"")){toast("Pick a date first");return;}
    var _dwk=toISO(weekStartOf(_dv));
    idbAll().then(function(all){
      var rec=all.filter(function(p){return p.id===_did;})[0];
      if(!rec){toast("That photo is no longer on this device");state.pfDateEdit=null;renderProgressPhotos();return;}
      if((rec.week||rec.date)===_dwk){toast("Already filed under that week");state.pfDateEdit=null;renderProgressPhotos();return;}
      var _sid=(pbPhotoMap()||{})[rec.id];
      var _mk=function(wk){return {kind:rec.kind==="progress"?"progress":"food",
        date:String(wk).slice(0,10),week:String(wk).slice(0,10),
        pose:String(rec.pose||"").slice(0,20),meal:String(rec.meal||"").slice(0,20),ts:String(rec.ts||"")};};
      if(syncOn()&&_sid&&!ownershipAmbiguous()){
        /* the queue owns BOTH sides (S2), same as the meal relabel */
        if(!m10pQueueMeta(_sid,rec.id,_mk(rec.week||rec.date),_mk(_dwk))){
          toast("Couldn’t record the change — try again");return;}
        state.pfDateEdit=null;
        toast("Date updated — filing under the week of "+fmtShort(parseISO(_dwk)));
        var _dpoll=0,_dtick=function(){
          var still=(typeof m10pOps==="function")&&m10pOps().some(function(o){return o.localId===rec.id&&o.op==="meta";});
          if(!still||_dpoll++>20){renderProgressPhotos();return;}
          setTimeout(_dtick,300);};
        _dtick();return;}
      /* never uploaded — a plain gated local update */
      rec.date=_dwk;rec.week=_dwk;
      idbAdd(rec).then(function(){state.pfDateEdit=null;
        toast("Date updated — filing under the week of "+fmtShort(parseISO(_dwk)));
        renderProgressPhotos();})
        .catch(function(){toast("Couldn’t save the date");});
    }).catch(function(){toast("Couldn’t read that photo");});
    return;}
  if(a==="pftl:restd"){var _rsid=el.getAttribute("data-id");
    idbAll().then(function(all){
      var rec=all.filter(function(p){return p.id===_rsid;})[0];
      if(!rec||!rec.blob){toast("That photo is no longer on this device");return;}
      var url=URL.createObjectURL(rec.blob);var img=new Image();
      img.onload=function(){
        var base=pfAutoSuggest(img.width,img.height);
        if(!base){URL.revokeObjectURL(url);toast("Couldn’t read that photo");return;}
        state.pfReview={blob:rec.blob,pose:rec.pose,week:rec.week||rec.date,base:base,
          revId:(typeof pfRevSeq!=="undefined")?++pfRevSeq:undefined,
          adj:{panX:0,panY:0,zoom:1,rot:0},cap:(typeof m10Capture==="function")?m10Capture():null,
          srcUrl:url,legacyId:rec.id,solo:true,
          narrow:(img.width/img.height)<0.72};
        render();pfReviewPreview();};
      img.onerror=function(){URL.revokeObjectURL(url);toast("Couldn’t read that photo");};
      img.src=url;
    }).catch(function(){toast("Couldn’t read that photo");});
    return;}
  if(a==="pftl:compare"){if((state.pfSel||[]).length===2){state.pfCompare=true;renderProgressPhotos();}return;}
  if(a==="pftl:clear"){state.pfSel=[];state.pfCompare=false;renderProgressPhotos();return;}
  if(a==="pfcmp:close"){state.pfCompare=false;renderProgressPhotos();return;}
  if(a==="pfleg:start"){state.pfLegSkip=[];
    pfLegacyNext((typeof m10Capture==="function")?m10Capture():null);return;}
  if(a==="pf:skiplegacy"){var _pl=state.pfReview;if(!_pl)return;
    state.pfLegSkip=(state.pfLegSkip||[]).concat([_pl.legacyId]);
    var _cap2=_pl.cap;pfReviewClose();render();pfLegacyNext(_cap2);return;}
  if(a==="pfsrc:cam"){var _pc=state.pfChoose;if(!_pc)return;state.pfChoose=null;render();
    pfCamOpen(_pc.pose,_pc.week,(typeof m10Capture==="function")?m10Capture():null);return;}
  if(a==="pfsrc:upload"){var _pu=state.pfChoose;if(!_pu)return;state.pfChoose=null;
    state.pendingPose=_pu.pose;state.pendingProgWeek=_pu.week;render();
    document.getElementById("wl-photo-input").click();return;}
  if(a==="pfsrc:cancel"){state.pfChoose=null;render();return;}
  if(a==="pfcam:shot"){pfCamShutter();return;}
  if(a==="pfcam:timer"){var _tv=parseInt(el.getAttribute("data-t"),10)||0;
    var _pv4=pfOvPrefs();_pv4.timer=_tv;pfOvSave(_pv4);
    if(pfCam)pfCamRender();return;}
  if(a==="pfcam:close"){pfCamStop();toast("Camera closed — nothing was saved beyond accepted poses");return;}
  if(a==="pfcam:pose"){if(pfCam){pfCam.pose=el.getAttribute("data-pose");pfCamRender();pfCamPrev();}return;}
  if(a==="pfcam:flip"){if(typeof pfCamFlip==="function")pfCamFlip();return;}
  if(a==="pfcam:ov"){var _pv=pfOvPrefs();_pv.on=!_pv.on;pfOvSave(_pv);if(pfCam){pfCamRender();pfCamPrev();}return;}
  if(a==="pfrev:ghost"){var _pv3=pfOvPrefs();_pv3.on=!_pv3.on;pfOvSave(_pv3);
    if(state.pfReview){render();pfReviewPreview();}return;}
  /* ---- daily ratings ---- */
  if(a==="rat:set"){ratSet(el.getAttribute("data-date"),el.getAttribute("data-q"),el.getAttribute("data-v"));render();return;}
  /* ---- weekly check-in ---- */
  if(a==="ci:open"){state.ciWeek=el.getAttribute("data-week")||toISO(weekStartFor(0));state.ciSkipAsk=null;state.ciFrom=state.view;state.view="checkin";render();return;}
  if(a==="ci:close"){state.view=(state.ciFrom==="weight")?"weight":"overview";state.ciSkipAsk=null;render();return;}
  if(a==="ci:skipask"){state.ciSkipAsk=el.getAttribute("data-week");render();return;}
  if(a==="ci:skipcancel"){state.ciSkipAsk=null;render();return;}
  if(a==="ci:skipyes"){var _sw=el.getAttribute("data-week");var _sr=ciDraft(_sw);_sr.status="skipped";_sr.updated=Date.now();
    state.ciSkipAsk=null;save();state.view=(state.ciFrom==="weight")?"weight":"overview";render();toast("Check-in skipped for that week");return;}
  if(a==="ci:unskip"){var _uw=el.getAttribute("data-week");var _ur=ciDraft(_uw);_ur.status="draft";_ur.updated=Date.now();save();render();return;}
  if(a==="ci:send"){
    var _nw=el.getAttribute("data-week");var _nr=ciDraft(_nw);
    var _was=(_nr.status==="sent");
    if(!_was)_nr.ts=Date.now();
    _nr.status="sent";_nr.updated=Date.now();
    _nr.adherence=ciAdherenceStored(_nw);
    _nr.ratings14=feelDays(14,todayISO()).map(function(d){var o={date:d};RATINGS.forEach(function(q){var v=ratFor(d)[q[0]];if(v)o[q[0]]=v;});return o;}).filter(function(o){return Object.keys(o).length>1;});
    save();
    if(syncOn()){try{photoSync();}catch(e){}
      /* The weekly report is a REPLY to this submission, never a scheduled
         artifact: push the check-in first, then leave the request on the
         record for the coach watcher. Same shape as "Complete today". The
         push MUST land first or the coach would answer a check-in the
         server has not seen yet. */
      var _prevGen=(coachWeekly()&&coachWeekly().generated)||null;
      pushDataPromise().then(function(){
        toast(_was?"Check-in updated — asking your coach":"Check-in complete — asking your coach");
        return new Promise(function(res){
          pbSave({coachreq:{week:_nw,ts:Date.now()}},function(ok){
            /* a failed request is not a failed check-in: the check-in is
               saved and synced either way, so say so plainly rather than
               implying the submission was lost */
            if(!ok)toast("Check-in saved, but your coach couldn't be reached — reopen it to ask again");
            res(ok);});});
      }).then(function(asked){
        if(!asked)return null;
        /* WAIT FOR THE REPLY — as a pure READ of the reports service.
           Reports live in their own collection now; fetching them touches no
           synced state, no revision, no journal. There is nothing to race
           and nothing to conflict with. */
        return new Promise(function(resolve){
          var n=0,MAX=70;
          function tick(){n++;
            fetchCoachReports(function(){
              var got=coachWeekly();
              if(got&&got.text&&got.week===_nw&&got.generated!==_prevGen){resolve(true);return;}
              if(n>=MAX){resolve(false);return;}
              setTimeout(tick,6000);});}
          setTimeout(tick,8000);});
      }).then(function(arrived){
        if(arrived){
          /* PRESENT the report, don't just note it (Owner: "shouldn't I get
             a message showing the report?"). Previously this pre-marked the
             week as SEEN, so the "New" pill never showed and a missed toast
             meant no signal at all. Now: the coach sheet opens itself with
             the report, and seenWeekly is left UNSET — max:open marks it
             read when he actually taps it, so the New pill survives a quick
             dismiss. A regenerated same-week report re-arms the pill. */
          if(state.settings.seenWeekly===_nw){state.settings.seenWeekly=null;save();}
          state.maxOpen=true;toast("Your check-in is ready");render();}
      }).catch(function(){toast("Saved — it will sync when you're back online");});
    }else toast("Saved — log in to sync it");
    state.view=(state.ciFrom==="weight")?"weight":"overview";render();return;}
  if(a==="photo:view"){openLightbox(el.getAttribute("data-id"));return;}
  if(a==="openday"){var od=el.getAttribute("data-date");state.selDate=od;var pd=parseISO(od);state.calY=pd.getFullYear();state.calM=pd.getMonth();state.view="overview";render();return;}
  if(a==="day:clear"){var fdd=state.selDate;
    askConfirm("Clear ALL entries for this day — weight, steps, sleep, calories, macros, activities, cardio & workout sessions, note, and photos? This can\u2019t be undone.",function(){
      delete state.food[fdd];delete state.steps[fdd];delete state.sleep[fdd];delete state.workouts[fdd];delete state.notes[fdd];delete state.bodyfat[fdd];delete state.waist[fdd];delete state.leanmass[fdd];
      state.weights=state.weights.filter(function(x){return x.date!==fdd;});
      if(state.training){if(state.training.sessions)delete state.training.sessions[fdd];if(state.training.liftSessions)delete state.training.liftSessions[fdd];saveTraining();}
      save();toast("Day cleared");
      try{idbByDate(fdd).then(function(list){list=list.filter(function(p){return p.kind!=="progress";});var t=list.map(function(p){return idbDelete(p.id);});Promise.all(t).then(function(){if(state.selDate===fdd)renderPhotos(fdd);});});}catch(e){}
    },{label:"Clear day"});
    return;}
  if(a==="cal:prev"){state.calM--;if(state.calM<0){state.calM=11;state.calY--;}render();return;}
  if(a==="cal:next"){state.calM++;if(state.calM>11){state.calM=0;state.calY++;}render();return;}
  if(a==="cal:sel"){state.selDate=el.getAttribute("data-date");var cd=parseISO(state.selDate);state.calY=cd.getFullYear();state.calM=cd.getMonth();state.calOpen=false;try{localStorage.setItem("wl_calopen","0");}catch(e){}render();return;}
  if(a==="day:prev"){var _dp=parseISO(state.selDate);_dp.setDate(_dp.getDate()-1);state.selDate=toISO(_dp);state.calY=_dp.getFullYear();state.calM=_dp.getMonth();render();return;}
  if(a==="day:next"){var _dn=parseISO(state.selDate);_dn.setDate(_dn.getDate()+1);var _ni=toISO(_dn);if(_ni>todayISO())return;state.selDate=_ni;state.calY=_dn.getFullYear();state.calM=_dn.getMonth();render();return;}
  if(a==="cal:expand"){state.calOpen=!state.calOpen;try{localStorage.setItem("wl_calopen",state.calOpen?"1":"0");}catch(e){}if(state.calOpen){var pd=parseISO(state.selDate);state.calY=pd.getFullYear();state.calM=pd.getMonth();}render();return;}
  if(a==="cal:overwrite"){var d=state.selDate;var e2=Object.assign({},state.food[d]||{});var p=num(e2.protein),c=num(e2.carbs),f=num(e2.fat);e2.calories=String(Math.round((p||0)*4+(c||0)*4+(f||0)*9));e2.calAuto=true;delete e2.calDismiss;state.food[d]=e2;save();render();return;}
  if(a==="cal:ignore"){var d2=state.selDate;var e3=Object.assign({},state.food[d2]||{});e3.calDismiss=true;state.food[d2]=e3;save();var n=document.getElementById("wl-calnotice");if(n)n.innerHTML="";return;}
  if(a==="act:pick"){state.actPick=el.getAttribute("data-cat");state.actAddCat=null;state.actEdit=false;state.view="actadd";render();return;}
  if(a==="act:editmode"){state.actEdit=!state.actEdit;render();return;}
  if(a==="cf:typeedit"){state.cardioTypeEdit=!state.cardioTypeEdit;render();return;}
  if(a==="actpick:close"){state.actPick=null;state.actAddCat=null;state.view="train";render();return;}
  if(a==="act:toggle"){var d0=el.getAttribute("data-date")||state.selDate;var pr=normPresets()[+el.getAttribute("data-idx")];if(!pr)return;var list=normActs(d0);var found=-1;for(var i=0;i<list.length;i++){if(list[i].name===pr.name&&list[i].cat===pr.cat){found=i;break;}}if(found>=0)list.splice(found,1);else list.push({cat:pr.cat,name:pr.name});if(list.length)state.workouts[d0]=list;else delete state.workouts[d0];save();render();refreshClearBtn();return;}
  if(a==="act:del"){var d1=el.getAttribute("data-date")||state.selDate;var i1=+el.getAttribute("data-idx");var l0=normActs(d1);var vic1=l0[i1];askConfirm("Remove "+((vic1&&vic1.name)||"this item")+"?",function(){var l1=normActs(d1);l1.splice(i1,1);if(l1.length)state.workouts[d1]=l1;else delete state.workouts[d1];save();render();refreshClearBtn();},{label:"Remove"});return;}
  if(a==="set:units"){var nu=el.getAttribute("data-units");var ou=state.settings.units;if(nu===ou)return;
    var hasData=state.weights.length||num(state.settings.startingWeight)!=null||num(state.settings.goalWeight)!=null;
    var doConv=function(){var factor=nu==="kg"?0.45359237:2.2046226218;
      state.weights.forEach(function(w){w.weight=Math.round(w.weight*factor*10)/10;});
      ["startingWeight","goalWeight"].forEach(function(k){var vv=num(state.settings[k]);if(vv!=null)state.settings[k]=String(Math.round(vv*factor*10)/10);});
      if(state.settings.targetType==="lbs_per_week"){var tv=num(state.settings.targetValue);if(tv!=null)state.settings.targetValue=String(Math.round(tv*factor*100)/100);}
      state.settings.units=nu;save();};
    if(hasData){askConfirm("Convert your weigh-ins and weight goals to "+nu+"?",doConv,{label:"Convert",danger:false});return;}
    state.settings.units=nu;save();render();return;}
  if(a==="set:sex"){state.settings.sex=el.getAttribute("data-sex");save();render();return;}
  if(a==="set:weekstart"){state.settings.weekStart=el.getAttribute("data-day");save();render();return;}
  if(a==="set:zonemethod"){var zm=el.getAttribute("data-zm")==="manual"?"manual":"auto";
    /* Switching to Manual seeds the fields with the zones he already had, so
       he edits four real numbers instead of facing four empty boxes. */
    if(zm==="manual"&&!manualZoneBounds()){var zm0=zoneModel();
      if(zm0)zm0.bounds.forEach(function(v,i){state.settings["zoneB"+(i+2)]=String(Math.round(v));});}
    state.settings.zoneMethod=zm;save();render();return;}
  if(a==="macro:suggest"){state.settings.macroAuto=true;delete state.settings.macroDismiss;applyAutoMacros();save();render();return;}
  if(a==="macro:keep"){state.settings.macroDismiss=true;save();var mn=document.getElementById("wl-macronotice");if(mn)mn.innerHTML="";return;}
  if(a==="set:strategy"){var _ns=el.getAttribute("data-strat");state.settings.strategy=_ns;state.settings.targetValue=(_ns==="gain"?"0.5":_ns==="maintain"?"0":"1");if(!state.settings.targetType)state.settings.targetType="lbs_per_week";state.settings.calTargetAuto=true;state.settings.macroAuto=true;state.obMacrosDone=false;if(maintenanceCals()!=null)applyAutoMacros();save();render();return;}
  if(a==="set:activity"){state.settings.activityLevel=el.getAttribute("data-level");state.actLevelOpen=false;applyAutoMacros();save();render();return;}
  if(a==="al:change"){state.actLevelOpen=true;render();return;}
  if(a==="cal:usecalc"){state.settings.calTargetAuto=true;var okc=applyAutoCalTarget();applyAutoMacros();save();render();toast(okc?"Calorie target set to "+state.settings.targetCalories:"Add your Profile details first");return;}
  if(a==="set:theme"){state.settings.theme=el.getAttribute("data-theme");save();applyTheme(state.settings.theme);render();return;}
  if(a==="card:toggle"){state.open=state.open||{};var cd=el.getAttribute("data-card");state.open[cd]=!state.open[cd];render();return;}
  if(a==="restnotify:set"){var _on=el.getAttribute("data-on")==="1";if(_on){if(typeof restPushOn==="function"&&restPushOn()){state.settings.restNotify=true;save();if(state.workout&&state.workout.tState==="resting"&&typeof restNotifySchedule==="function")restNotifySchedule();render();}else{restNotifyEnable();}}else{state.settings.restNotify=false;save();if(typeof restNotifyCancel==="function")restNotifyCancel();render();}return;}
  if(a==="restnotify:enable"){restNotifyEnable();return;}
  if(a==="rest:settings"){state.restSetOpen=true;render();return;}
  if(a==="rest:info"){state.restInfoOpen=!state.restInfoOpen;render();return;}
  if(a==="rest:exsave"){var _sc=el.getAttribute("data-scope");var _inp=document.getElementById("wl-rest-exmin");var _v=_inp?_inp.value.trim():"";var _w=state.workout;var _en=(typeof _restNextEntry==="function")?_restNextEntry():null;if(!_w||!_en)return;
    _en.restMin=_v;saveWorkout();var _savedRt=false;
    if(_sc==="routine"){var _rt=getRoutine(_w.routineId);var _it=_rt&&rItem(_rt,_en.itemId);if(_it){_it.restMin=_v;saveTraining();_savedRt=true;}}
    if(state.workout&&state.workout.tState==="resting"&&typeof restPushOn==="function"&&restPushOn()&&typeof restNotifySchedule==="function")restNotifySchedule();
    toast(_savedRt?"Saved to routine ✓":"Set for this workout ✓");render();return;}
  if(a==="rest:settings:close"){state.restSetOpen=false;if(state.workout&&state.workout.tState==="resting"&&typeof restPushOn==="function"&&restPushOn()&&typeof restNotifySchedule==="function")restNotifySchedule();render();return;}
  if(a==="reminder:add"){var ti=document.getElementById("wl-remind-time");var tv=(ti&&ti.value)||"19:00";state.settings.reminderTime=tv;save();shareOrDownload("activity-reminder.ics","text/calendar",reminderICS(tv));return;}
  if(a==="set:ttype"){state.settings.targetType=el.getAttribute("data-type");save();render();return;}
  if(a==="lrec:restore"){logoutRecoveryRestore();return;}
  if(a==="lrec:finish"){askConfirm("Finish clearing this device? The data saved during the interrupted log-out will be erased for good.",function(){logoutRecoveryFinish();},{label:"Erase it",danger:true});return;}
  if(a==="adopt:ask"){renderAdoptionGate();return;}
  if(a==="adopt:yes"){adoptLocalData();return;}
  if(a==="export"){exportData();return;}
  if(a==="preset:del"){var pr2=normPresets();var pi=+el.getAttribute("data-idx");var pn=(pr2[pi]&&pr2[pi].name)||"";askConfirm("Remove \""+pn+"\" from your activities? It won't be tap-loggable anymore. Days you already logged it on keep it.",function(){var p3=normPresets();p3.splice(pi,1);state.presets=p3;save();},{label:"Remove"});return;}
  if(a==="import"){document.getElementById("wl-import").click();return;}
  if(a==="pbk:export"){exportProgressPhotos();return;}
  if(a==="pbk:import"){document.getElementById("wl-pbk-import").click();return;}
  if(a==="copy"){copyBackup();return;}
  if(a==="paste"){state.pasteOpen=!state.pasteOpen;render();return;}
  if(a==="paste:cancel"){state.pasteOpen=false;render();return;}
  if(a==="paste:do"){var ta=document.getElementById("wl-paste");applyImport(ta?ta.value:"");return;}
  if(a==="sync:test"){cloudTest();return;}
  if(a==="sync:pull"){askConfirm("Download your data from the server and replace this device\u2019s copy?",function(){cloudPull(true);},{label:"Pull",danger:false});return;}
  if(a==="sync:push"){cloudPush(true);return;}
  if(a==="sync:paste"){state.syncPasteOpen=!state.syncPasteOpen;render();return;}
  if(a==="sync:pastecancel"){state.syncPasteOpen=false;render();return;}
  if(a==="app:update"){updateApp();return;}
  /* changing the displayed week closes an open format chooser — the export
     must be for the week that was on screen when Export was tapped */
  if(a==="sum:tocur"){state.weekOffset=0;state.exportAsk=null;render();return;}
  if(a==="sum:prev"){state.weekOffset--;state.exportAsk=null;render();return;}
  if(a==="sum:next"){if(state.weekOffset<0){state.weekOffset++;state.exportAsk=null;render();}return;}
  if(a==="sum:day"){var sdd=el.getAttribute("data-date");state.selDate=sdd;var sp=parseISO(sdd);state.calY=sp.getFullYear();state.calM=sp.getMonth();state.view="overview";render();return;}
  /* Exports ask first (Owner, 2026-08-10). The original act names open the
     chooser — keeping them means the M10 gate refuses the same first tap it
     always did — and exp:go (also gated) does the actual build-and-share. */
  if(a==="sum:exportweek"){state.exportAsk=(state.exportAsk==="week")?null:"week";render();return;}
  if(a==="sum:coachreport"){state.exportAsk=(state.exportAsk==="coach")?null:"coach";render();return;}
  if(a==="sum:exportall"){state.exportAsk=(state.exportAsk==="all")?null:"all";render();return;}
  if(a==="exp:cancel"){state.exportAsk=null;render();return;}
  if(a==="exp:go"){var _ek=el.getAttribute("data-kind"),_ef=el.getAttribute("data-fmt");state.exportAsk=null;
    if(_ek==="week")exportWeekFiles(_ef);else if(_ek==="coach")srExport(_ef);else if(_ek==="all")exportAllFiles(_ef);
    render();return;}
  if(a==="reset:ask"){state.confirmReset=true;render();return;}
  if(a==="reset:cancel"){state.confirmReset=false;render();return;}
  if(a==="reset:do"){state.settings=Object.assign({},DEFAULT_SETTINGS);state.weights=[];state.food={};state.workouts={};state.steps={};state.notes={};state.sleep={};state.bodyfat={};state.waist={};state.leanmass={};state.weeklySummary=null;state.nightlySummary=null;state.nightlyLog={};state.presets=DEFAULT_PRESETS.slice();state.confirmReset=false;state.view="overview";idbClearAll();save();render();toast("All data erased");return;}
});
document.addEventListener("focusin",function(e){var el=e.target;
  if(el&&el.classList&&el.classList.contains("wl-set-input")&&!el.disabled&&el.value){
    try{el.select();}catch(_e){}
    setTimeout(function(){try{if(document.activeElement===el)el.setSelectionRange(0,(el.value||"").length);}catch(_e){}},0);
  }
});
/* ---- keep the fixed nav out of the way of the soft keyboard ---- */
function navIsTextEl(el){return !!(el&&(el.tagName==="INPUT"||el.tagName==="TEXTAREA"||el.isContentEditable));}
function navKbdSync(){var n=document.querySelector(".wl-nav");if(!n)return;
  if(navIsTextEl(document.activeElement))n.classList.add("kbd");else n.classList.remove("kbd");}
var _navKbdT=null;
document.addEventListener("focusin",function(e){if(navIsTextEl(e.target)){clearTimeout(_navKbdT);navKbdSync();}});
document.addEventListener("focusout",function(e){if(!navIsTextEl(e.target))return;
  clearTimeout(_navKbdT);
  /* a short delay so moving between two fields never flashes the bar */
  _navKbdT=setTimeout(navKbdSync,120);});

addEventListener("input",function(e){
  var el=e.target;
  if(el.classList&&el.classList.contains("wl-num")){var isInt=el.hasAttribute("data-int");var cv=isInt?el.value.replace(/[^\d]/g,""):el.value.replace(/[^\d.]/g,"").replace(/(\..*)\./g,"$1");if(cv!==el.value)el.value=cv;}
  if(el.classList&&(el.classList.contains("wl-goalsleep-h")||el.classList.contains("wl-goalsleep-m"))){var gh=document.querySelector(".wl-goalsleep-h"),gm=document.querySelector(".wl-goalsleep-m");var hh=gh?num(gh.value):null,mm=gm?num(gm.value):null;if(hh==null&&mm==null)state.settings.sleepGoal="";else state.settings.sleepGoal=String((hh||0)*60+(mm||0));save();return;}
  if(el.classList&&(el.classList.contains("wl-sleep-h")||el.classList.contains("wl-sleep-m"))){var sl=state.selDate;var hE=document.querySelector(".wl-sleep-h"),mE=document.querySelector(".wl-sleep-m");var hh=hE?num(hE.value):null,mm=mE?num(mE.value):null;if(hh==null&&mm==null)delete state.sleep[sl];else{state.sleep[sl]=(hh||0)*60+(mm||0);setSkip(sl,"sleep",false);}save();refreshClearBtn();return;}
  if(el.classList&&el.classList.contains("wl-sv-input")){var s=getLiftSession();if(s){s[el.getAttribute("data-sv")]=el.value;saveTraining();}return;}
  if(el.classList&&el.classList.contains("wl-sv-set")){var s=getLiftSession();if(s&&s.entries){var en=s.entries[+el.getAttribute("data-ei")];if(en){var st=en.sets[+el.getAttribute("data-si")];if(st){var v=el.value;var _f=el.getAttribute("data-field");
        /* Owner hard rule 2026-08-05: RIR is REQUIRED — the live logger has
           always refused a blank, and the after-the-fact editor no longer
           lets one be created either */
        if(_f==="rir"&&st.status==="done"&&(v===""||num(v)==null||num(v)<0)){el.value=(st.rir!=null?String(st.rir):"");toast("RIR is required on a logged set");return;}
        st[_f]=(v===""?null:num(v));saveTraining();}}}return;}
  if(el.classList&&el.classList.contains("wl-set-input")){var w=state.workout;if(w){var en=w.entries[+el.getAttribute("data-ei")];if(en){var st=en.sets[+el.getAttribute("data-si")];if(st){var _fld=el.getAttribute("data-wo");st[_fld]=el.value;
        if(_fld==="reps")st.repsTouched=true;
        if(_fld==="weight"&&!en.bodyweight&&num(st.sugE)!=null&&!st.repsTouched){var _nw=num(el.value);var _nr=(num(st.sugW)!=null&&num(st.sugR)!=null)?sugPredictAt(st.sugW,st.sugR,_nw):sugInvertReps(st.sugE,_nw);if(_nr!=null){st.reps=String(_nr);st.sugR=_nr;st.sugW=_nw;var _ri=document.querySelector('input[data-wo="reps"][data-ei="'+el.getAttribute("data-ei")+'"][data-si="'+el.getAttribute("data-si")+'"]');if(_ri)_ri.value=String(_nr);}}
        saveWorkout();}}}if(state.logWarn){state.logWarn=null;var _rw=document.querySelector(".wl-rirwarn");if(_rw)_rw.remove();}return;}
  if(el.classList&&el.classList.contains("wl-wof-input")){var w=state.workout;if(w){w.finishForm=w.finishForm||{};w.finishForm[el.getAttribute("data-wof")]=el.value;if(el.getAttribute("data-wof")==="hr"){var za=document.getElementById("wl-zonearea");if(za)za.innerHTML=zoneAreaHTML({hr:el.value,zone:w.finishForm.zone||2},"wof");}}return;}
  if(el.classList&&el.classList.contains("wl-ci-input")){var _cr=ciDraft(el.getAttribute("data-week"));_cr.answers[el.getAttribute("data-ci")]=el.value;save();return;}
  if(el.classList&&el.classList.contains("wl-lf-input")){if(state.liftForm)state.liftForm[el.getAttribute("data-lf")]=el.value;if(el.getAttribute("data-lf")==="hr"){var za=document.getElementById("wl-zonearea");if(za&&state.liftForm)za.innerHTML=zoneAreaHTML(state.liftForm,"lf");}return;}
  if(el.classList&&el.classList.contains("wl-rt-name")){var rt=getRoutine(state.routineId);if(rt){rt.name=el.value;saveTraining();}return;}
  if(el.classList&&el.classList.contains("wl-ri-srng")){var rt=getRoutine(state.routineId);if(rt){var it=rItem(rt,el.getAttribute("data-iid"));if(it){var _n=Math.max(1,it.sets||3);if(!Array.isArray(it.setRanges)||it.setRanges.length!==_n)it.setRanges=rptRangesFor(it,_n);var _si=+el.getAttribute("data-si");it.setRanges[_si]=it.setRanges[_si]||{};it.setRanges[_si][el.getAttribute("data-end")]=(el.value===""?null:num(el.value));saveTraining();}}return;}
  if(el.classList&&el.classList.contains("wl-ri-input")){var rt=getRoutine(state.routineId);if(rt){var it=rItem(rt,el.getAttribute("data-iid"));if(it){it[el.getAttribute("data-field")]=el.value;saveTraining();}}return;}
  if(el.classList&&el.classList.contains("wl-noteinput")){if(state.noteEdit)state.noteEdit.text=el.value;return;}
  if(el.classList&&el.classList.contains("wl-ex-input")){if(state.exForm)state.exForm[el.getAttribute("data-xf")]=el.value;return;}
  if(el.classList&&el.classList.contains("wl-cf-input")){if(state.cardioForm)state.cardioForm[el.getAttribute("data-cf")]=el.value;if(el.getAttribute("data-cf")==="hr"){var za=document.getElementById("wl-zonearea");if(za&&state.cardioForm)za.innerHTML=zoneAreaHTML(state.cardioForm);}return;}
  if(el.classList&&el.classList.contains("wl-note-input")){var nd=state.selDate;if(el.value.trim())state.notes[nd]=el.value;else delete state.notes[nd];save();refreshClearBtn();return;}
  if(el.hasAttribute&&el.hasAttribute("data-sync")){var c=syncCfg();c[el.getAttribute("data-sync")]=el.value.trim();setSyncCfg(c);var st=document.getElementById("wl-sync-status");if(st)st.innerHTML=syncStatusHTML();return;}
  if(el.hasAttribute&&el.hasAttribute("data-set")){var sk=el.getAttribute("data-set");state.settings[sk]=el.value;
    if(sk==="targetProtein"){state.settings.proteinAuto=false;delete state.settings.macroDismiss;applyAutoMacros();syncMacroInputs();}
    else if(sk==="targetCarbs"||sk==="targetFat"){state.settings.macroAuto=false;delete state.settings.macroDismiss;}
    else if(sk==="targetCalories"){state.settings.calTargetAuto=false;applyAutoMacros();syncMacroInputs();}
    else{applyAutoMacros();syncMacroInputs();}
    var sibs=document.querySelectorAll('[data-set="'+sk+'"]');for(var si=0;si<sibs.length;si++){if(sibs[si]!==el)sibs[si].value=state.settings[sk]||"";}
    save();var ce=document.getElementById("wl-calread");if(ce)ce.innerHTML=calSummaryHTML();var mp=document.getElementById("wl-macropct");if(mp)mp.innerHTML=macroPctHTML();var mn=document.getElementById("wl-macronotice");if(mn)mn.innerHTML=macroNoticeHTML();return;}
  if(el.classList&&el.classList.contains("wl-food-input")){
    var key=el.getAttribute("data-food");var d=state.selDate;var entry=Object.assign({},state.food[d]||{});
    entry[key]=el.value;
    if(key==="calories"){entry.calAuto=false;delete entry.calDismiss;}
    else{delete entry.calDismiss;
      var autoOK=entry.calAuto===true||(entry.calAuto!==false&&num(entry.calories)==null);
      if(autoOK){var pv=num(entry.protein),cv=num(entry.carbs),fv=num(entry.fat);
        if(pv!=null||cv!=null||fv!=null){entry.calories=String(Math.round((pv||0)*4+(cv||0)*4+(fv||0)*9));entry.calAuto=true;}
        else{delete entry.calories;delete entry.calAuto;}
        var cEl=document.querySelector('.wl-food-input[data-food="calories"]');if(cEl)cEl.value=(entry.calories!=null?entry.calories:"");
        var tc=num(state.settings.targetCalories);var cbar=document.getElementById("bar-calories");if(cbar&&tc!=null)cbar.innerHTML=barInner(num(entry.calories),tc);
      }
    }
    var anyv=["calories","protein","carbs","fat","fiber"].some(function(k){return num(entry[k])!=null;});
    if(anyv){state.food[d]=entry;setSkip(d,"calories",false);}else delete state.food[d];save();
    var t=num(state.settings["target"+key.charAt(0).toUpperCase()+key.slice(1)]);
    var bar=document.getElementById("bar-"+key);if(bar&&t!=null)bar.innerHTML=barInner(num(el.value),t);
    var noteEl=document.getElementById("wl-calnotice");if(noteEl)noteEl.innerHTML=calNoticeHTML(d);
    refreshClearBtn();
    return;}
  if(el.classList&&el.classList.contains("wl-steps-input")){
    var sd=state.selDate;var sv=el.value;if(num(sv)!=null){state.steps[sd]=num(sv);setSkip(sd,"steps",false);}else delete state.steps[sd];save();refreshClearBtn();return;}
  if(el.classList&&el.classList.contains("wl-daywt-input")){
    var wd=state.selDate;var wvv=num(el.value);state.weights=state.weights.filter(function(x){return x.date!==wd;});if(wvv!=null){state.weights.push({date:wd,weight:wvv});setSkip(wd,"weight",false);}save();refreshClearBtn();return;}
  if(el.classList&&el.classList.contains("wl-bf-input")){var bd=state.selDate;var bv=num(el.value);if(bv!=null)state.bodyfat[bd]=bv;else delete state.bodyfat[bd];save();refreshClearBtn();return;}
  if(el.classList&&el.classList.contains("wl-waist-input")){var wad=state.selDate;var wav=num(el.value);if(wav!=null)state.waist[wad]=wav;else delete state.waist[wad];save();refreshClearBtn();return;}
  if(el.classList&&el.classList.contains("wl-lbm-input")){var lmd=state.selDate;var lmv=num(el.value);if(lmv!=null)state.leanmass[lmd]=lmv;else delete state.leanmass[lmd];save();refreshClearBtn();return;}
});
function sanityWarn(el){
  if(!el||!el.classList)return;var v=num(el.value);if(v==null)return;
  var u=state.settings.units;var wlo=u==="kg"?23:50,whi=u==="kg"?450:1000;
  var n=Math.round(v).toLocaleString();
  if(el.classList.contains("wl-daywt-input")){if(v<wlo||v>whi)toast("That weight looks off ("+v+" "+u+") \u2014 double-check it.");return;}
  if(el.classList.contains("wl-steps-input")){if(v>60000)toast("That\u2019s a lot of steps ("+n+") \u2014 double-check.");return;}
  if(el.classList.contains("wl-sleep-h")||el.classList.contains("wl-goalsleep-h")){if(v>16)toast("That\u2019s a lot of sleep ("+v+"h) \u2014 double-check.");return;}
  if(el.classList.contains("wl-sleep-m")||el.classList.contains("wl-goalsleep-m")){if(v>59)toast("Minutes should be under 60 \u2014 put the rest in the hours field.");return;}
  if(el.classList.contains("wl-food-input")){var fd=el.getAttribute("data-food");
    if(fd==="calories"){if(v>10000)toast("That\u2019s a lot of calories ("+n+") \u2014 double-check.");}
    else if(fd==="protein"){if(v>500)toast("That\u2019s a lot of protein ("+n+"g) \u2014 double-check.");}
    else if(fd==="carbs"){if(v>1200)toast("That\u2019s a lot of carbs ("+n+"g) \u2014 double-check.");}
    else if(fd==="fat"){if(v>500)toast("That\u2019s a lot of fat ("+n+"g) \u2014 double-check.");}
    return;}
  var ds=el.getAttribute&&el.getAttribute("data-set");if(!ds)return;
  if(ds==="targetCalories"){if(v>10000)toast("That calorie target looks high \u2014 double-check.");}
  else if(ds==="startingWeight"||ds==="goalWeight"){if(v<wlo||v>whi)toast("That weight looks off ("+v+" "+u+") \u2014 double-check it.");}
  else if(ds==="age"){if(v<13||v>100)toast("That age looks off ("+v+") \u2014 double-check.");}
  else if(ds==="stepsGoal"){if(v>40000)toast("That steps goal looks high \u2014 double-check.");}
  else if(ds==="targetProtein"){if(v>400)toast("That protein target looks high \u2014 double-check.");}
  else if(ds==="cardioMinGoal"){if(v>1200)toast("That cardio goal looks high (minutes/week) \u2014 double-check.");}
  else if(ds==="maxHR"){if(v<120||v>230)toast("That max heart rate looks off ("+v+") \u2014 double-check.");}
  else if(ds==="restingHR"){var _mx=effMaxHR();
    if(v<30||v>110)toast("That resting heart rate looks off ("+v+") \u2014 double-check.");
    else if(_mx!=null&&v>=_mx)toast("Resting heart rate is at or above your max ("+Math.round(_mx)+") \u2014 zones stay on percent of max until that is fixed.");}
  else if(/^zoneB[2-5]$/.test(ds)){if(v<60||v>230)toast("That zone boundary looks off ("+v+" bpm) \u2014 double-check.");}
}

document.addEventListener("change",function(e){var el=e.target;sanityWarn(el);
  if(el.classList&&el.classList.contains("wl-status-start")){state.statusForm=state.statusForm||{};state.statusForm.start=el.value;return;}
  if(el.classList&&el.classList.contains("wl-status-end")){state.statusForm=state.statusForm||{};state.statusForm.end=el.value;return;}
  if(el&&el.hasAttribute&&el.hasAttribute("data-set")){state.settings[el.getAttribute("data-set")]=el.value;save();var ce=document.getElementById("wl-calread");if(ce)ce.innerHTML=calSummaryHTML();var mp=document.getElementById("wl-macropct");if(mp)mp.innerHTML=macroPctHTML();var ze=document.getElementById("wl-zoneread");if(ze)ze.innerHTML=zoneTableHTML();}
});
document.getElementById("wl-import").addEventListener("change",function(e){
  var file=e.target.files[0];if(!file)return;var rd=new FileReader();
  /* W4: the mutation happens after FileReader — revalidate there, not here */
  var _cap=(typeof m10Capture==="function")?m10Capture():null;
  var _ok=function(){return (typeof m10StillValid==="function")?m10StillValid(_cap):true;};
  rd.onload=function(){
    if(!_ok()){toast("This device is no longer the active writer — nothing was imported");return;}
    applyImport(rd.result);};
  rd.onerror=function(){toast("Couldn't read that file");};
  rd.readAsText(file);e.target.value="";
});
document.getElementById("wl-pbk-import").addEventListener("change",function(e){
  var file=e.target.files[0];if(!file){return;}var rd=new FileReader();
  var _cap2=(typeof m10Capture==="function")?m10Capture():null;
  var _ok2=function(){return (typeof m10StillValid==="function")?m10StillValid(_cap2):true;};
  rd.onload=function(){
    if(!_ok2()){toast("This device is no longer the active writer — nothing was imported");return;}
    importProgressPhotos(rd.result,_cap2);};
  rd.onerror=function(){toast("Couldn't read that file");};
  rd.readAsText(file);e.target.value="";
});
/* Y1 (round-33 item 1): a retake stages new bytes and then RETIRES the earlier
   photo through the increment-4 queue, which is asynchronous and multi-phase.
   "Photo saved" was therefore said before anything had been retired, and it was
   said identically whether the retirement completed, stalled or was refused for
   lack of authority — a claim the code had never checked. This waits, bounded,
   for the earlier bytes to actually leave the device and returns how many are
   still here, so the report can be true. Same idiom as the lightbox relabel's
   report(tries). */
function m10pRetakeLeft(old,tries){
  if(!old||!old.length)return Promise.resolve(0);
  if(tries===undefined)tries=10;
  return idbAll().then(function(all){
    var left=old.filter(function(p){return all.some(function(q){return q.id===p.id;});}).length;
    if(!left||tries<=0)return left;
    return new Promise(function(r){setTimeout(r,200);}).then(function(){return m10pRetakeLeft(old,tries-1);});
  }).catch(function(){return old.length;});}
document.addEventListener("input",function(e){
  var el=e.target;if(!el||!el.getAttribute)return;
  var k=el.getAttribute("data-pfadj");
  if(k&&state.pfReview){state.pfReview.adj[k]=parseFloat(el.value)||0;pfReviewPreview();return;}
  if(el.getAttribute("data-pfov")){
    var pv=pfOvPrefs();pv.strength=Math.min(75,Math.max(10,parseInt(el.value,10)||48));pfOvSave(pv);
    var gi=document.getElementById("pfcam-prev");if(gi&&pv.on)gi.style.opacity=String(pv.strength/100);
    var lb=document.getElementById("pfcam-ovval");if(lb)lb.textContent=pv.strength+"%";
    return;}
  if(el.getAttribute("data-pfrevov")){
    var pv2=pfOvPrefs();pv2.strength=Math.min(75,Math.max(10,parseInt(el.value,10)||48));pfOvSave(pv2);
    var g2=document.querySelector("#wl-pfrev-std .wl-pfrev-ghost");if(g2&&pv2.on)g2.style.opacity=String(pv2.strength/100);
    var l2=document.getElementById("wl-pfrev-ovval");if(l2)l2.textContent=pv2.strength+"%";
    return;}
});
document.getElementById("wl-photo-input").addEventListener("change",function(e){
  /* W4: authority captured at this boundary is revalidated again immediately
     before every local mutation later in the chain (processImage, idbAll,
     deletes and adds all await first). */
  var _m10cap=(typeof m10Capture==="function")?m10Capture():null;
  var _m10ok=function(){return (typeof m10StillValid==="function")?m10StillValid(_m10cap):true;};
  window.__m10PhotoCap=_m10cap;
  var files=e.target.files;if(!files||!files.length){return;}
  if(state.pendingPose){var _pf=files[0];var _pose=state.pendingPose;var _wk=state.pendingProgWeek||toISO(weekStartFor(0));e.target.value="";state.pendingPose=null;toast("Preparing photo\u2026");
    /* Milestone 2 (progress-photo package): the picker now feeds the
       STANDARDIZATION REVIEW instead of saving directly. The X2 add-then-
       delete chain is unchanged — extracted to pfSaveProgress() and executed
       only on the review's explicit accept, with THIS capture revalidated
       there (the review pause is exactly the async boundary W4 covers). */
    processImage(_pf).then(function(blob){
      if(!_m10ok()){toast("This device is no longer the active writer — nothing was changed");return;}
      var url=URL.createObjectURL(blob);var img=new Image();
      img.onload=function(){URL.revokeObjectURL(url);
        var base=pfAutoSuggest(img.width,img.height);
        if(!base){toast("Couldn\u2019t read that image");return;}
        state.pfReview={blob:blob,pose:_pose,week:_wk,base:base,revId:++pfRevSeq,
          adj:{panX:0,panY:0,zoom:1,rot:0},cap:_m10cap,
          srcUrl:URL.createObjectURL(blob)};
        render();pfReviewPreview();};
      img.onerror=function(){URL.revokeObjectURL(url);toast("Couldn\u2019t read that image");};
      img.src=url;});
    return;}
  var date=state.selDate;var arr=Array.prototype.slice.call(files);e.target.value="";var meal=state.pendingMeal||"";
  toast("Adding "+arr.length+" photo"+(arr.length>1?"s":"")+"…");
  var chain=Promise.resolve();
  arr.forEach(function(f){chain=chain.then(function(){return processImage(f).then(function(blob){
    if(!_m10ok()){toast("This device is no longer the active writer — nothing was changed");return null;}
    var id=date+"-"+Date.now()+"-"+Math.random().toString(36).slice(2,7);
    return idbAdd({id:id,date:date,blob:blob,ts:Date.now()+Math.random(),meal:meal});});});});
  chain.then(function(){if(document.getElementById("wl-photostrip")&&state.selDate===date)renderPhotosStrip(date);toast("Photos saved");}).catch(function(){toast("Couldn't save photos");});
});
/* The application-data JSON backup.

   payload() is deliberately NOT extended to carry training: it defines both the
   core localStorage record and the server's `data` field, and training is a
   separate subsystem with its own field and its own revision counter. Mixing
   them would change what every sync writes. The backup is assembled here
   instead, which touches nothing else.

   Repository history shows backupJSON() originated as payload() and contains no
   training addition before this change, so backups produced by the current
   lineage carry no exercises, routines, cardio sessions or lift sessions.

   This is NOT a complete device backup: progress photos have their own export
   (`pbk:export`) and are not included here.

   `__backup` is metadata about the file, not application data. The double
   underscore keeps it from colliding with any app field, and the format version
   means future restore code can dispatch on a number instead of guessing
   semantics from which keys happen to be present. */
var BACKUP_FORMAT=2;   /* 1 = core only (implicit, pre-2026-08-01); 2 = core + training */
