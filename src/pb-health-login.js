function cloudTest(){
  if(ownershipAmbiguous()){toast("Paused — this device holds data from another account");return;}
  setSync("syncing");
  cloudGet(function(d,err){
    if(err){setSync(err==="offline"?"offline":"error",err==="auth"?"session expired":"");
      toast(err==="offline"?"No connection":err==="auth"?"Please log in again":"Failed");return;}
    var n=(d.weights||[]).length,fd=Object.keys(d.food||{}).length;
    setLastSync();setSync("ok","server has "+n+" weigh-ins, "+fd+" food days");
    toast("Connected to your server");render();});}

function pushDataPromise(){
  /* Was pbSave({data:payload()}) — a RAW PATCH of the whole record that
     bypassed the fenced commit route: no revision check, no ledger row.
     The server bumps coreRev on any raw `data` write, so every check-in
     submit and every "Complete today" silently moved the record to a
     revision this device's protocol never saw — whose very next fenced
     push then 409'd into "Body data needs your review". It also carried
     the stale coach fields wholesale, which is what kept erasing the
     weekly report around the containment patch (observed 22:50, coreRev
     339, no ledger row). One function, every symptom tonight.

     Now it rides the fenced protocol like every other core write. save()
     has already marked the device dirty on these paths; "clean" means
     there is nothing to push and that is success, not failure. */
  return new Promise(function(res,rej){
    var st=m10cState();
    if(st==="clean"){res();return;}
    if(st!=="dirty"&&st!=="dirty-unproven"){rej(new Error("Couldn't save your data first"));return;}
    m10cPush(false,function(ok){ok?res():rej(new Error("Couldn't save your data first"));});});}

/* ---- Apple Health bridge (from-scratch, 2026-07) ----
   A PWA cannot read HealthKit, so the iOS Shortcut is still the only reader. What
   changed: the Shortcut asks Health for per-day TOTALS (Find Health Samples with
   Group by Day) and PATCHes them to this record's health field as lines of
   "YYYY-MM-DD,total" per metric, authenticating with the app's own short-lived
   session token handed over at launch — never a baked-in credential. The app parses,
   files each day, and clears the inbox so nothing is applied twice. Covered metrics:
   food macros, steps, sleep, weight, body fat, waist, and lean body mass. */
function hkNum(v){if(v==null)return null;var s=String(v).replace(/[^0-9.\-]/g,"");if(!s||s==="."||s==="-")return null;var n=parseFloat(s);return isFinite(n)?n:null;}
function hkDayLines(text){var out={};if(text==null)return out;var lines=String(text).split(/[\r\n]+/);for(var i=0;i<lines.length;i++){var line=lines[i].trim();if(!line)continue;var c=line.indexOf(",");if(c<0)continue;var day=line.slice(0,c).trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(day))continue;var v=hkNum(line.slice(c+1));if(v==null||v<=0)continue;out[day]=(out[day]||0)+v;}return out;}
function hkLabelToField(name){var n=String(name).toLowerCase().replace(/[^a-z]/g,"");if(n.indexOf("lean")>=0||n==="lbm")return "leanmass";if(n.indexOf("bodyfat")>=0)return "bodyfat";if(n.indexOf("protein")>=0)return "protein";if(n.indexOf("fiber")>=0||n.indexOf("fibre")>=0)return "fiber";if(n.indexOf("carb")>=0)return "carbs";if(n.indexOf("fat")>=0)return "fat";if(n.indexOf("calor")>=0||n.indexOf("energy")>=0)return "calories";if(n.indexOf("step")>=0)return "steps";if(n.indexOf("weight")>=0)return "weight";if(n.indexOf("waist")>=0)return "waist";if(n.indexOf("sleep")>=0||n.indexOf("asleep")>=0)return "sleep";return null;}
function hkParseLabeled(text){var out={};var re=/([^\r\n,:]+?)\s*:\s*(-?[0-9][0-9.,]*)/g;var m;while((m=re.exec(String(text)))!==null){var field=hkLabelToField(m[1]);if(field&&out[field]===undefined)out[field]=m[2];}return out;}
function hkMetricDays(value,forDay){var byDay=hkDayLines(value);var has=false;for(var k in byDay){has=true;break;}if(has)return byDay;if(forDay){var v=hkNum(value);if(v!=null&&v>0){var o={};o[forDay]=v;return o;}}return {};}
function hkPlan(payload,fallbackFor){var out={food:{},steps:{},sleep:{},weight:{},bodyfat:{},waist:{},leanmass:{},count:0};var hkR1=function(v){return Math.round(v*10)/10;};if(typeof payload==="string"){try{payload=JSON.parse(payload);}catch(e){payload=hkParseLabeled(payload);}}if(!payload||typeof payload!=="object")return out;
  /* JSON keys go through the same label map as text lines, so the Shortcut may say
     "leanmass" or "Lean Body Mass", "waist" or "Waist Circumference" \u2014 first key wins */
  var _norm={};for(var _k in payload){var _f=hkLabelToField(_k)||_k;if(_norm[_f]===undefined)_norm[_f]=payload[_k];}payload=_norm;var forDay=(payload["for"]!=null?String(payload["for"]).trim():"")||(fallbackFor||"");if(!/^\d{4}-\d{2}-\d{2}$/.test(forDay))forDay="";
  var macros=["carbs","protein","fat","fiber","calories"],perDay={};/* fiber stored alongside macros; never part of the 4/4/9 calorie math */
  macros.forEach(function(k){var byDay=hkMetricDays(payload[k],forDay);for(var day in byDay){if(!perDay[day])perDay[day]={};perDay[day][k]=byDay[day];}});
  for(var d in perDay){var vals=perDay[d],entry={},touched=false;
    ["carbs","protein","fat","fiber"].forEach(function(k){if(vals[k]!=null){entry[k]=String(Math.round(vals[k]));touched=true;out.count++;}});
    if(vals.calories!=null){entry.calories=String(Math.round(vals.calories));entry.calAuto=false;touched=true;out.count++;}
    if(touched)out.food[d]=entry;}
  var st=hkMetricDays(payload.steps,forDay);for(var sd in st){out.steps[sd]=Math.round(st[sd]);out.count++;}
  var sl=hkMetricDays(payload.sleep,forDay);for(var ld in sl){out.sleep[ld]=Math.round(sl[ld]);out.count++;}
  var wt=hkMetricDays(payload.weight,forDay);for(var wd in wt){out.weight[wd]=hkR1(wt[wd]);out.count++;}
  var bf=hkMetricDays(payload.bodyfat,forDay);for(var bd in bf){var b=bf[bd];if(b<=1)b=b*100;out.bodyfat[bd]=hkR1(b);out.count++;}
  var wa=hkMetricDays(payload.waist,forDay);for(var ad in wa){out.waist[ad]=hkR1(wa[ad]);out.count++;}
  var lm=hkMetricDays(payload.leanmass,forDay);for(var md in lm){out.leanmass[md]=hkR1(lm[md]);out.count++;}
  return out;}
function hkTryFetch(){
  var w=state.hkWait;if(!w)return;
  if(Date.now()-w.ts>5*60*1000){state.hkWait=null;toast("Health import timed out - run the shortcut and come back");render();return;}
  if(!syncOn())return;
  /* W3 (round-29 ruling 3): this callback can land seconds later and mutates
     food, steps, sleep, weight, bodyfat, waist, leanmass AND clears the server
     mailbox. Authority is captured now and REVALIDATED immediately before the
     local mutation and again before the mailbox clear. */
  /* X1 (round-30 ruling 1): the capture is taken ONCE, when the import
     begins, and stored with the wait — every later poll revalidates that
     IMMUTABLE identity, so an A→B→A round trip across polls cannot import
     under replacement authority. */
  /* Y1: never manufacture a capture here — an import that began without one
     cannot be authorised retroactively */
  if(typeof m10Capture==="function"&&!w.m10cap){
    state.hkWait=null;toast("Health import could not be verified — start it again");render();return;}
  var hkCap=w.m10cap||null;
  var hkStill=function(){return (typeof m10StillValid==="function")?m10StillValid(hkCap):true;};
  if(typeof m10Capture==="function"&&!hkStill()){
    state.hkWait=null;toast("This device is no longer the active writer — nothing was imported");render();return;}
  pbGetRecord(function(rec,err){
    var w2=state.hkWait;if(!w2)return;
    var h=(!err&&rec&&rec.health)||null;
    if(!h){setTimeout(hkTryFetch,2000);return;}
    if(!hkStill()){state.hkWait=null;toast("This device is no longer the active writer — nothing was imported");render();return;}
    var plan=hkPlan(h,state.selDate);
    if(!plan.count){
      if(hkStill())pbSave({health:null},function(){});
      state.hkWait=null;toast("Nothing to import from Health");render();return;}
    for(var d in plan.food){state.food[d]=Object.assign({},state.food[d]||{},plan.food[d]);}
    for(var sd in plan.steps){state.steps[sd]=plan.steps[sd];try{setSkip(sd,"steps",false);}catch(e){}}
    for(var ld in plan.sleep){state.sleep[ld]=plan.sleep[ld];try{setSkip(ld,"sleep",false);}catch(e){}}
    for(var wgd in plan.weight){(function(dd){state.weights=(state.weights||[]).filter(function(x){return x.date!==dd;});state.weights.push({date:dd,weight:plan.weight[dd]});try{setSkip(dd,"weight",false);}catch(e){}})(wgd);}
    for(var bfd in plan.bodyfat){state.bodyfat=state.bodyfat||{};state.bodyfat[bfd]=plan.bodyfat[bfd];try{setSkip(bfd,"bodyfat",false);}catch(e){}}
    for(var wsd in plan.waist){state.waist=state.waist||{};state.waist[wsd]=plan.waist[wsd];try{setSkip(wsd,"waist",false);}catch(e){}}
    for(var lmd in plan.leanmass){state.leanmass=state.leanmass||{};state.leanmass[lmd]=plan.leanmass[lmd];try{setSkip(lmd,"leanmass",false);}catch(e){}}
    state.hkDone={date:state.selDate,ts:Date.now()};state.hkWait=null;
    save();
    /* the mailbox clear is a server write: revalidate once more */
    if(hkStill())pbSave({health:null},function(){});
    toast("Imported "+plan.count+" value"+(plan.count===1?"":"s")+" from Health");render();});}
/* ---- Settings > Sync becomes an Account card ---- */
function pbAccountCardHTML(op){
  var c=pbCfg();
  var host=pbBase().replace(/^https?:\/\//,"");
  return '<div class="wl-card"><button class="wl-collapse-head" data-act="card:toggle" data-card="sync"><span>Account <em>your server</em></span><span class="wl-chevron'+(op.sync?" open":"")+'">›</span></button>'+
    (op.sync?('<div class="wl-collapse-body">'+
      '<div class="wl-pbrow"><span class="wl-pbrow-k">Signed in as</span><span class="wl-pbrow-v">'+esc(pbEmail()||"—")+'</span></div>'+
      '<div class="wl-pbrow"><span class="wl-pbrow-k">Server</span><span class="wl-pbrow-v">'+esc(host)+'</span></div>'+
      '<div class="wl-hint" style="margin-top:10px"><b>Status:</b> <span id="wl-sync-status">'+syncStatusHTML()+'</span></div>'+
      '<div class="wl-row" style="margin-top:12px"><button class="wl-btn wl-btn-ghost wl-full" data-act="sync:test">Test</button><button class="wl-btn wl-btn-ghost wl-full" data-act="sync:pull">Pull</button><button class="wl-btn wl-btn-primary wl-full" data-act="sync:push">Save</button></div>'+
      '<div class="wl-row" style="margin-top:10px"><button class="wl-btn wl-btn-ghost wl-full" data-act="pb:pwtoggle">'+(state.pwOpen?"Cancel":"Change password")+'</button></div>'+
      (state.pwOpen?(
        '<div class="wl-pwbox">'+
          '<label class="wl-field wl-field-full"><span>Current password</span><input type="password" id="wl-pw-old" autocomplete="current-password"></label>'+
          '<label class="wl-field wl-field-full" style="margin-top:10px"><span>New password</span><input type="password" id="wl-pw-new" autocomplete="new-password"></label>'+
          '<label class="wl-field wl-field-full" style="margin-top:10px"><span>Confirm new password</span><input type="password" id="wl-pw-new2" autocomplete="new-password"></label>'+
          /* rendered once and updated in place — a re-render would blank all three
             fields and force the user to retype everything after any error */
          '<div class="wl-login-err" id="wl-pw-err" style="display:none"></div>'+
          '<div class="wl-hint" style="margin-top:10px">At least 8 characters. Your other devices will be signed out and will need the new password next time they open the app.</div>'+
          '<div class="wl-row" style="margin-top:12px"><button class="wl-btn wl-btn-primary wl-full" id="wl-pw-save" data-act="pb:pwsave">Save new password</button></div>'+
        '</div>'):'')+
      '<div class="wl-row" style="margin-top:10px"><button class="wl-btn wl-btn-ghost wl-full" data-act="pb:logout">Log out</button></div>'+
      '<div class="wl-hint" style="margin-top:10px">Your data lives on your own server. Only you can read it — every request is checked against your account, so no other user can ever see your numbers or photos.</div>'+
    '</div>'):'')+'</div>';}

/* Replaces the Sharing/invite card at cutover. Real accounts make invite codes
   meaningless — every user has their own login and their own isolated data — so all
   that's left worth keeping from that card is the name field. */
function pbProfileCardHTML(op,f){
  return '<div class="wl-card"><button class="wl-collapse-head" data-act="card:toggle" data-card="share"><span>Your profile</span><span class="wl-chevron'+(op.share?" open":"")+'">›</span></button>'+
    (op.share?('<div class="wl-collapse-body">'+
      '<label class="wl-field wl-field-full"><span>Your name</span><input type="text" data-set="name" value="'+esc((f&&f.name)||"")+'" placeholder="e.g. Alex" autocapitalize="words" autocorrect="off"></label>'+
      '<div class="wl-hint" style="margin-top:10px">Coach Max uses your name when he writes to you.</div>'+
    '</div>'):'')+'</div>';}

/* ---- login screen ---- */
var pbLoginState={busy:false,err:"",advanced:false,remember:true};
function pbLoginHTML(){
  var c=pbCfg();
  return '<div class="wl-login">'+
    '<div class="wl-login-inner">'+
      '<div class="wl-login-brand"><span class="wl-mark">'+BRANDMARK+'</span><span class="wl-login-word">Compound</span></div>'+
      '<div class="wl-login-tag">Log in to reach your data on any device.</div>'+
      /* method/action + name attributes are what make iOS offer to save this in
         iCloud Keychain — which is how you then get Face ID autofill for free. */
      '<form class="wl-login-form" id="wl-loginform" method="post" action="#" autocomplete="on">'+
        '<label class="wl-field wl-field-full"><span>Email</span><input type="email" id="wl-pb-email" name="username" value="'+esc(c.email||"")+'" placeholder="you@example.com" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="username"></label>'+
        '<label class="wl-field wl-field-full" style="margin-top:10px"><span>Password</span><input type="password" id="wl-pb-pass" name="password" placeholder="••••••••" autocomplete="current-password"></label>'+
        '<label class="wl-remember"><input type="checkbox" id="wl-pb-remember"'+(pbLoginState.remember?' checked':'')+'><span>Keep me signed in on this device</span></label>'+
        (pbLoginState.err?'<div class="wl-login-err">'+esc(pbLoginState.err)+'</div>':'')+
        '<button type="submit" class="wl-btn wl-btn-primary wl-full wl-login-go"'+(pbLoginState.busy?' disabled':'')+'>'+(pbLoginState.busy?"Signing in…":"Log in")+'</button>'+
      '</form>'+
      '<button class="wl-login-adv" data-act="pb:adv">'+(pbLoginState.advanced?"Hide server settings":"Server settings")+'</button>'+
      (pbLoginState.advanced?('<label class="wl-field wl-field-full"><span>Server URL</span><input type="url" id="wl-pb-base" value="'+esc(pbMigrateBase(c.base||PB_DEFAULT_BASE))+'" autocapitalize="off" autocorrect="off" spellcheck="false"></label>'+
        '<div class="wl-hint" style="margin-top:8px">Your device must be on the same Tailscale network as the server.</div>'):'')+
    '</div>'+
  '</div>';}

function pbRenderLogin(){
  document.getElementById("app").innerHTML=pbLoginHTML()+confirmOverlayHTML();
  var f=document.getElementById("wl-loginform");
  if(f)f.addEventListener("submit",function(e){e.preventDefault();pbDoLogin();});
  var em=document.getElementById("wl-pb-email");
  if(em&&!em.value)em.focus();}

function pbDoLogin(){
  if(pbLoginState.busy)return;
  var em=(document.getElementById("wl-pb-email")||{}).value||"";
  var pw=(document.getElementById("wl-pb-pass")||{}).value||"";
  var bs=(document.getElementById("wl-pb-base")||{}).value||"";
  var rmEl=document.getElementById("wl-pb-remember");
  var remember=rmEl?!!rmEl.checked:true;
  pbLoginState.remember=remember;
  em=em.trim();
  if(!em||!pw){pbLoginState.err="Enter your email and password.";pbRenderLogin();return;}
  if(bs){var c=pbCfg();c.base=bs.trim();setPbCfg(c);}
  pbLoginState.busy=true;pbLoginState.err="";pbRenderLogin();
  pbLogin(em,pw,function(ok,why){
    pbLoginState.busy=false;
    if(!ok){
      pbLoginState.err=(why==="bad")?"That email and password don’t match.":(why==="offline")?"Can’t reach the server. Is Tailscale on?":"Something went wrong. Try again.";
      pbRenderLogin();return;}
    pbLoginState.err="";
    /* Signing in is proof this is not a first run. A fresh device boots SIGNED
       OUT, so the boot-time gate never saw it and first-time setup is already on
       screen by now — which is exactly how an empty core got stamped onto the
       Owner's iPad (2026-08-03). Close setup here and let the pull below decide:
       onboardingGate() reopens it only if the account really has nothing. */
    if(state.onboarding||!state.settings.onboarded){
      state.onboarding=false;state.obDeferred=true;
    }
    /* Ownership FIRST, before a single user-data request.

       Authentication has just succeeded on this same page, so the session is new
       but the boot-time capture ran while signed out and took nothing. Without
       this, the continuation below goes straight to cloudGet -> trainingPull ->
       photoSync and can overwrite local training that was never snapshotted --
       the original 2026-07-31 loss, on the expired-session path.

       If the local bytes cannot be attributed to the account that just signed in,
       the whole continuation aborts rather than proceeding. */
    if(!establishOwnershipAfterLogin()){
      setSync("error",recoveryBlockReason);
      render();
      if(recoveryState==="adoption"){renderAdoptionGate();}
      else toast("Signed in, but syncing is paused — this device holds data that isn't yours");
      return;}
    setSync("syncing");
    /* D1/F4: settle the writer lease BEFORE the first write-capable moment of
       this new session. The page-load wiring (lightbox-boot.js) runs m10Boot()
       only inside `if(syncOn())`, so signing in mid-session left M10.booted
       false for the whole session: the strict gate was skipped and pushes went
       out unfenced. The continuation runs on either outcome — losing the race
       for the pen is a normal read-only session, not a login failure. */
    var afterLease=function(){
    cloudGet(function(d,err){
      function finish(answered){
        trainingPull(function(){
          setLastSync();setSync("ok");
          onboardingGate(answered===true);render();
          toast("Welcome back"+(state.settings.name?(", "+state.settings.name):""));
          /* pull this account's photos down onto this device in the background */
          photoSync(function(r){
            if(r&&r.downloaded)toast(r.downloaded+" photo"+(r.downloaded===1?"":"s")+" restored");});});}
      /* Normally the server is the truth on login. A device holding unsynced
         changes is only worth asking about when its data is at least as RECENT as
         the server's — a stale cache (an old Safari visit, a long-dormant device)
         must never be offered as something to upload. That path already destroyed
         the server copy once: months-old Safari storage + "Upload mine" as the
         primary button = the iPad stale-push disaster, reproduced. Recency check
         first, and the safe choice is the primary one. */
      function newestDate(w){var m="";(w||[]).forEach(function(x){if(x.date>m)m=x.date;});return m;}
      var localNewer=newestDate(state.weights)>newestDate(d&&d.weights);
      if(!err&&d&&isDirty()&&localHasData()&&!cloudEmpty(d)&&localNewer){
        askConfirm("This device has newer entries that were never saved to the server. Keep the server’s copy, or upload this device’s?",
          function(){applyCloud(d);finish(true);},
          {label:"Use server copy",danger:false,onNo:function(){cloudPush(false);finish(true);}});
        return;}
      if(!err&&d)applyCloud(d);
      /* a CONFIRMED read is the only thing that may declare this a new account */
      finish(!err);});};
    if(typeof m10Boot==="function"){
      var settled=false;
      var once=function(){if(settled)return;settled=true;afterLease();};
      try{m10Boot().then(once,once);}catch(e){once();}
    }else afterLease();
  },remember);}

/* gate the whole app behind login without duplicating render()'s body */
var _pbOrigRender=render;
render=function(){
  if(!syncOn()){pbRenderLogin();return;}
  _pbOrigRender();};

/* The app's confirm dialog only calls back on YES; "No" just closes. For a genuine
   two-way choice we need the No branch too, so wrap askConfirm and remember the
   handler ourselves — the app's own listener nulls state.pendingConfirm before our
   listener runs, so we can't read it from there.
   ⚠️ Assignment, not a function-declaration override — a hoisted declaration would
   capture itself on the line above and recurse forever. */
var _pbAskConfirm=askConfirm,pbOnNo=null;
askConfirm=function(msg,fn,opts){pbOnNo=(opts&&opts.onNo)||null;return _pbAskConfirm(msg,fn,opts);};

/* extra acts (the original listener ignores acts it doesn't know) */
document.addEventListener("click",function(e){
  var el=e.target.closest("[data-act]");if(!el)return;
  var a=el.getAttribute("data-act");
  if(a==="confirm:yes"){pbOnNo=null;return;}
  if(a==="confirm:no"){var _no=pbOnNo;pbOnNo=null;if(_no)setTimeout(_no,0);return;}
  if(a==="pb:logout"){pbLogout();return;}
  if(a==="pb:adv"){pbLoginState.advanced=!pbLoginState.advanced;pbRenderLogin();return;}
  if(a==="pb:pwtoggle"){state.pwOpen=!state.pwOpen;state.pwErr="";render();return;}
  if(a==="pb:pwsave"){
    if(state.pwBusy)return;
    var o=(document.getElementById("wl-pw-old")||{}).value||"";
    var n=(document.getElementById("wl-pw-new")||{}).value||"";
    var n2=(document.getElementById("wl-pw-new2")||{}).value||"";
    var btn=document.getElementById("wl-pw-save"),ev=document.getElementById("wl-pw-err");
    function pwErr(msg){state.pwErr=msg;if(ev){ev.textContent=msg;ev.style.display=msg?"":"none";}}
    function busy(b){state.pwBusy=b;if(btn){btn.disabled=b;btn.textContent=b?"Saving…":"Save new password";}}
    busy(true);pwErr("");
    pbChangePassword(o,n,n2,function(ok,msg){
      busy(false);
      if(ok){state.pwErr="";state.pwOpen=false;render();toast(msg||"Password changed");}
      else pwErr(msg||"Couldn’t change your password.");});
    return;}
});

/* ============================================================
   PHOTOS — server-backed sync on top of the existing IndexedDB store.
   IndexedDB stays the local cache so every existing photo view keeps
   working untouched; PocketBase becomes the backbone that makes photos
   appear on any device you log into.
   ============================================================ */
var PB_PMAP="wl_photomap";
function pbPhotoMap(){try{return JSON.parse(localStorage.getItem(PB_PMAP))||{};}catch(e){return {};}}
function setPbPhotoMap(m){try{localStorage.setItem(PB_PMAP,JSON.stringify(m));}catch(e){}}

/* protected files need a short-lived token — an unguessable URL is not enough */
function pbFileToken(){
  if(ownershipAmbiguous())return Promise.reject("ambiguous");
  return fetch(pbBase()+"/api/files/token",{method:"POST",headers:pbHeaders(true)})
    .then(function(r){return r.ok?r.json():Promise.reject(r.status);})
    .then(function(j){return j.token;});}

function pbPhotoList(){
  if(ownershipAmbiguous())return Promise.reject("ambiguous");
  return fetch(pbBase()+"/api/collections/photos/records?perPage=500&filter="
      +encodeURIComponent('user="'+pbUid()+'"')+"&t="+Date.now(),{headers:pbHeaders(),cache:"no-store"})
    .then(function(r){return r.ok?r.json():Promise.reject(r.status);})
    .then(function(p){return p.items||[];});}



function pbPhotoFetchBlob(srec,token){
  if(ownershipAmbiguous())return Promise.reject("ambiguous");
  return fetch(pbBase()+"/api/files/photos/"+srec.id+"/"+srec.file+"?token="+encodeURIComponent(token))
    .then(function(r){return r.ok?r.blob():Promise.reject(r.status);});}

/* ---- the sync itself ---- */
var pbPhotoSyncing=false;
var _psLast=null,_psSeen=null;   /* last photoSync outcome, for the on-device diagnostic */
function psReport(){return _psLast;}
var photoSync;

/* Keep the original local-only ops, then make the public ones sync through.
   ⚠️ These MUST be assignments, NOT function-declaration overrides. Declarations
   hoist, so a declared override would already own the name by the time this line ran
   and idbAddLocal would capture the override itself — infinite recursion. Same
   wrap-don't-redeclare pattern as the render() gate above. */
var idbAddLocal=idbAdd,idbDeleteLocal=idbDelete,idbClearAllLocal=idbClearAll;

/* M8-era pbPhoto* transport wrappers removed 2026-08-05 — provably dead:
   the capture above bound the RAW layer, so nothing referenced these
   closures once BLOCK-4 re-wrapped the names below. */