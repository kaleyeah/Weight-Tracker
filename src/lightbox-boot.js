function openLightbox(id){
  var ids=[].slice.call(document.querySelectorAll('[data-act="photo:view"]')).map(function(b){return b.getAttribute("data-id");});
  if(ids.indexOf(id)<0)ids=[id];
  var MEALS=[["breakfast","Breakfast"],["lunch","Lunch"],["snack","Snack"],["dinner","Dinner"]];
  var ov=document.createElement("div");ov.className="wl-lightbox";
  ov.innerHTML='<div class="wl-lb-count"></div><button class="wl-lb-nav prev" data-lb="prev">‹</button><img class="wl-lb-img" alt=""><button class="wl-lb-nav next" data-lb="next">›</button>'+
    '<div class="wl-lb-meals" style="display:none"></div>'+
    '<div class="wl-lb-bar"><button class="wl-btn wl-btn-ghost" data-lb="close">Close</button><button class="wl-btn wl-btn-ghost" data-lb="mealedit" style="display:none">Edit</button><button class="wl-btn wl-btn-danger" data-lb="del">Delete</button></div>';
  var img=ov.querySelector(".wl-lb-img"),countEl=ov.querySelector(".wl-lb-count"),prevB=ov.querySelector(".wl-lb-nav.prev"),nextB=ov.querySelector(".wl-lb-nav.next");
  var mealsRow=ov.querySelector(".wl-lb-meals"),mealBtn=ov.querySelector('[data-lb="mealedit"]');
  var urls={},recs={},idx=Math.max(0,ids.indexOf(id)),dirty=false;
  function curRec(){return recs[ids[idx]]||null;}
  function isFood(r){return !!r&&r.kind!=="progress";}
  function renderMeals(){
    var r=curRec();if(!r){mealsRow.style.display="none";return;}
    mealsRow.innerHTML=MEALS.map(function(m){
      return '<button class="wl-lb-mealchip'+((r.meal||"")===m[0]?" on":"")+'" data-lb="meal" data-meal="'+m[0]+'">'+m[1]+'</button>';}).join("");}
  function show(){
    img.src=urls[ids[idx]]||"";countEl.textContent=ids.length>1?(idx+1)+" / "+ids.length:"";
    prevB.style.visibility=idx>0?"visible":"hidden";nextB.style.visibility=idx<ids.length-1?"visible":"hidden";
    var food=isFood(curRec());
    mealBtn.style.display=food?"":"none";
    mealsRow.style.display="none"; /* collapse when navigating between photos */
  }
  function go(d){var ni=idx+d;if(ni<0||ni>=ids.length)return;idx=ni;show();}
  function close(){document.removeEventListener("keydown",key);Object.keys(urls).forEach(function(k){try{URL.revokeObjectURL(urls[k]);}catch(e){}});if(ov.parentNode)document.body.removeChild(ov);if(dirty){if(state.view==="diary")renderDiary();
    if(state.view==="photos")renderProgressPhotos();else renderPhotosStrip(state.selDate);}}
  function key(e){if(e.key==="ArrowLeft")go(-1);else if(e.key==="ArrowRight")go(1);else if(e.key==="Escape")close();}
  document.addEventListener("keydown",key);
  ov.addEventListener("click",function(e){var b=e.target.closest("[data-lb]");
  if(!b){if(e.target===ov)close();return;}
  var act=b.getAttribute("data-lb");
  if(act==="close")close();
  else if(act==="prev")go(-1);
  else if(act==="next")go(1);
  else if(act==="mealedit"){
    if(mealsRow.style.display==="none"){renderMeals();mealsRow.style.display="";}
    else mealsRow.style.display="none";}
  else if(act==="meal"){
    var r=curRec();if(!r)return;
    var m=b.getAttribute("data-meal");
    if((r.meal||"")===m){mealsRow.style.display="none";return;}
    if(ownershipAmbiguous()){toast("Paused — this device holds data from another account");return;}
    /* M10 (round-23 ruling 2): the relabel is a CONTENT mutation. The durable
       queue entry carrying old+new metadata is written and VERIFIED before the
       local store changes, and the server side rides the reviewed
       transactional route — never a raw collection PATCH. */
    var oldMeal=r.meal||"";
    var sid=pbPhotoMap()[r.id];
    var applyLocal=function(){
      r.meal=m;
      return idbAddLocal(r).then(function(){
        dirty=true;
        var label="";MEALS.forEach(function(x){if(x[0]===m)label=x[1];});
        toast("Moved to "+label);
        renderMeals();
        setTimeout(function(){mealsRow.style.display="none";},350);
      });};
    if(syncOn()&&sid&&!ownershipAmbiguous()){
      /* S2: the queue owns BOTH sides — it applies the local metadata in its
         own verified phase, then dispatches. The UI just re-renders when the
         local phase has landed. */
      var qd=m10pQueueMeta(sid,r.id,
        {kind:r.kind==="progress"?"progress":"food",date:String(r.date||"").slice(0,10),
         week:String(r.week||"").slice(0,10),pose:String(r.pose||"").slice(0,20),
         meal:String(oldMeal).slice(0,20),ts:String(r.ts||"")},
        {kind:r.kind==="progress"?"progress":"food",date:String(r.date||"").slice(0,10),
         week:String(r.week||"").slice(0,10),pose:String(r.pose||"").slice(0,20),
         meal:String(m).slice(0,20),ts:String(r.ts||"")});
      if(!qd){toast("Couldn’t record the change — try again");return;}
      /* U6 (ruling 6): the result is bound to THIS operation's own outcome —
         the local record must actually carry the new label. A busy dispatcher
         returning early can no longer produce a false "Moved". */
      var report=function(tries){
        idbGetLocal(r.id).then(function(fresh){
          var applied=!!fresh&&(fresh.meal||"")===m;
          if(applied){
            r.meal=fresh.meal;dirty=true;
            var label="";MEALS.forEach(function(x){if(x[0]===m)label=x[1];});
            toast("Moved to "+label);
            renderMeals();
            setTimeout(function(){mealsRow.style.display="none";},350);
            return;}
          if(tries>0){setTimeout(function(){report(tries-1);},250);return;}
          toast("Couldn’t move the photo — it stays where it was");
          renderMeals();
        }).catch(function(){toast("Couldn’t move the photo");});};
      m10pDispatch(function(){report(6);});
      return;}
    applyLocal().catch(function(){toast("Couldn’t move the photo");});}
  else if(act==="del"){var pid=ids[idx];askConfirm("Delete this photo?",function(){idbDelete(pid).then(function(){dirty=true;try{URL.revokeObjectURL(urls[pid]);}catch(e){}delete urls[pid];ids.splice(idx,1);if(!ids.length){close();return;}if(idx>=ids.length)idx=ids.length-1;show();});});}});
  var sx=0,sy=0;
  ov.addEventListener("touchstart",function(e){if(!e.touches.length)return;sx=e.touches[0].clientX;sy=e.touches[0].clientY;},{passive:true});
  ov.addEventListener("touchend",function(e){if(!e.changedTouches||!e.changedTouches.length)return;var dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)+10){if(dx<0)go(1);else go(-1);}},{passive:true});
  document.body.appendChild(ov);
  idbAll().then(function(all){var map={};all.forEach(function(p){map[p.id]=p.blob;recs[p.id]=p;});ids=ids.filter(function(i){return map[i];});idx=Math.max(0,ids.indexOf(id));ids.forEach(function(i){urls[i]=URL.createObjectURL(map[i]);});if(!ids.length){close();return;}show();}).catch(function(){});
}

/* login-screen styling */
(function(){
  var css=document.createElement("style");
  css.textContent=".wl-login{min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}"+
    ".wl-login-inner{width:100%;max-width:360px}"+
    ".wl-login-brand{display:flex;align-items:center;gap:10px;justify-content:center}"+
    ".wl-login-brand .wl-mark{display:inline-flex}"+
    ".wl-login-word{font-size:22px;font-weight:700;letter-spacing:-.02em;color:var(--text)}"+
    ".wl-login-tag{margin:10px 0 26px;text-align:center;color:var(--muted);font-size:13.5px;line-height:1.45}"+
    ".wl-login-form{display:block}"+
    ".wl-login-go{margin-top:16px}"+
    ".wl-login-err{margin-top:12px;padding:10px 12px;border-radius:10px;background:color-mix(in srgb,var(--bad) 14%,transparent);border:1px solid color-mix(in srgb,var(--bad) 40%,transparent);color:var(--bad);font-size:13px;line-height:1.4}"+
    ".wl-login-adv{display:block;margin:18px auto 0;background:none;border:0;color:var(--faint);font-size:12.5px;text-decoration:underline;text-underline-offset:3px;cursor:pointer;font-family:inherit}"+
    ".wl-pbrow{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:7px 0;border-bottom:1px solid var(--line)}"+
    ".wl-pbrow:last-of-type{border-bottom:0}"+
    ".wl-pbrow-k{color:var(--muted);font-size:13px}"+
    ".wl-pbrow-v{color:var(--text);font-size:13px;font-weight:600;text-align:right;word-break:break-all}"+
    ".wl-remember{display:flex;align-items:center;gap:9px;margin-top:14px;cursor:pointer;user-select:none}"+
    ".wl-remember input{width:18px;height:18px;accent-color:var(--accent);flex:0 0 auto;margin:0}"+
    ".wl-remember span{color:var(--muted);font-size:13px;line-height:1.3}"+
    ".wl-pwbox{margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}"+
    ".wl-pwok{margin-top:12px;padding:10px 12px;border-radius:10px;background:color-mix(in srgb,var(--good) 14%,transparent);border:1px solid color-mix(in srgb,var(--good) 40%,transparent);color:var(--good);font-size:13px}"+
    ".wl-lb-meals{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:12px}"+
    ".wl-lb-mealchip{background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.22);color:#e8ecf2;font-size:13.5px;font-weight:650;border-radius:18px;padding:8px 15px;cursor:pointer;font-family:inherit}"+
    ".wl-lb-mealchip.on{background:var(--accent);border-color:var(--accent);color:#111}";
  document.head.appendChild(css);
})();

/* ---------------- init ---------------- */
/* FIRST, before anything reads, migrates or normalises training: secure the raw
   pre-sync copy. migrateProgressionTypes() rewrites wl_training_v1 on this very
   line, so capturing after it would preserve the migrated form rather than what
   the previous build actually left on disk. */
/* Boot branches HARD on unresolved state. When a gate is active, the ordinary
   application never initialises: no user-data load, no migration, no identity
   work, no photo refresh, no auth refresh, no sync. The gate screen is the whole
   app until the state is resolved. */
checkLogoutJournal();
if(!logoutRecoveryPending())runRecoveryCapture();
if(bootGated()){
  renderGate();
}else{
load();loadTraining();migrateProgressionTypes();loadWorkout();rptRetargetAll();if(resyncAllActivityTags())save();
/* Anchor the weekly check-in at the week it first ran, so an existing account
   never opens with months of retroactively "late" check-ins. */
ciAnchorSince();{/* GitHub-era #setup= links retired (.460); onboarding decides normally */if(state.settings.onboarded==null)state.settings.onboarded=(state.weights.length>0||num(state.settings.goalWeight)!=null||num(state.settings.startingWeight)!=null||!!(state.settings.name&&(""+state.settings.name).trim()));if(!state.settings.onboarded){
  /* A signed-in account may simply not have pulled yet. Offering first-time
     setup here — and letting a skip stamp `onboarded` plus default settings —
     is what put an empty core on a second device and collided it with the
     server (Owner, 2026-08-03, iPad). If we are signed in with nothing local
     yet, WAIT: the pull decides. onboardingGate() reopens it if the account
     really is new. */
  if(syncOn()&&!state.weights.length){state.obDeferred=true;}
  else{state.onboarding=true;state.obStep=0;}
}}applyTheme(state.settings.theme||"dark");makeIcon();if(state.workout)state.view="train";render();if(syncOn()){pbRefresh(function(){m10Boot().then(function(){try{migrateProgressionTypes();}catch(e){}m10cBoot(function(){autoSync();photoSync();});});});}/* M10 wiring (K3+incr2): lease settles, core journal recovers, then adoption. Z1: the boot migration is re-run once the lease has settled — it is refused durably while this device is not the writer, and it is idempotent, so this is where it actually persists on the device that holds the pen. */if(state.workout)startWoTick();/* setup-link importer retired with the GitHub-era link format (.460) */
endRecoveryFreeze();
/* Everything below belongs ONLY to the clean path. A gated page is terminal:
   no persistence request, no announcement write, no update check, no visibility
   or pull-to-refresh handlers. checkForUpdate() in particular can call
   location.replace() when it sees another build -- which would swap the
   recovery gate for an artifact whose journal behaviour is unestablished, in
   the middle of an unresolved destructive operation. The gate renders, its two
   buttons work through the document-level click handler, and nothing else in
   this file executes. */
try{if(navigator.storage&&navigator.storage.persist)navigator.storage.persist();}catch(e){}
try{
  var wlraw=localStorage.getItem("wl_announced")||"";
  var wlseen=wlraw?wlraw.split(","):[];
  if(wlseen.indexOf(APP_BUILD)<0){showAppliedBanner(APP_BUILD);wlseen.push(APP_BUILD);if(wlseen.length>15)wlseen=wlseen.slice(wlseen.length-15);localStorage.setItem("wl_announced",wlseen.join(","));}
}catch(e){}
checkForUpdate();
document.addEventListener("visibilitychange",function(){if(!document.hidden){checkForUpdate();hkTryFetch();}});

/* ---------------- pull-to-refresh ---------------- */
(function(){
  var startY=0,pulling=false,dist=0,THRESH=64,ind=null;
  function scrollTop(){return window.scrollY||document.documentElement.scrollTop||0;}
  function el(){if(!ind){ind=document.createElement("div");ind.className="wl-ptr";ind.innerHTML='<div class="wl-ptr-ring"></div>';document.body.appendChild(ind);}return ind;}
  function move(px,dragging){var e=el();e.style.transition=dragging?"none":"transform .25s ease,opacity .25s ease";e.style.transform="translateX(-50%) translateY("+px+"px)";e.style.opacity=String(Math.min(1,px/40));if(px>=THRESH)e.classList.add("ready");else e.classList.remove("ready");}
  document.addEventListener("touchstart",function(e){
    pulling=false;
    if(!syncOn()||scrollTop()>0)return;
    if(e.target.closest&&e.target.closest("input,textarea,select"))return;
    /* The coach window scrolls ITSELF (.wl-maxsheet, overflow-y:auto), but
       the page behind it sits at scrollTop 0 — so this armed on every
       upward swipe inside a long report and hijacked the scroll into a
       refresh (Owner, 2026-08-04: don't let that motion refresh the app
       while the coach window is open). The sheet owns its own scrolling;
       pull-to-refresh stays out of it entirely. */
    if(state.maxOpen)return;
    if(e.target.closest&&e.target.closest(".wl-maxsheet"))return;
    startY=e.touches[0].clientY;pulling=true;dist=0;
  },{passive:true});
  document.addEventListener("touchmove",function(e){
    if(!pulling)return;
    if(scrollTop()>0){pulling=false;move(0,false);return;}
    dist=e.touches[0].clientY-startY;
    if(dist<=0){move(0,true);return;}
    if(dist>8)e.preventDefault();
    move(Math.min(dist*0.5,84),true);
  },{passive:false});
  document.addEventListener("touchend",function(){
    if(!pulling)return;pulling=false;
    if(dist*0.5>=THRESH){var e=el();e.classList.add("spin");e.classList.remove("ready");e.style.transition="transform .2s ease";e.style.transform="translateX(-50%) translateY(48px)";e.style.opacity="1";
      cloudPull(true,function(){setTimeout(function(){e.classList.remove("spin");move(0,false);},350);});}
    else move(0,false);
    dist=0;
  });
})();
}   /* end of the clean-boot path; a gated boot renders its screen and stops */