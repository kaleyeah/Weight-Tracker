/* The MP document view (MPCSS … mpReportHTML) was retired 2026-07 in favour of
   the simple coach report; git history holds it. The MP-CALC engine above stays. */










/* The ONLY impure function in this feature: it reads `state` once and hands the
   calculator a frozen plain-object snapshot. Everything downstream is a pure
   function of this object, which is what makes the whole report testable under
   node with no browser. Source records are copied, never mutated. */
function mpBuildInput(offset,reviewWindow){
  var ws=weekStartFor(offset||0),we=addDays(ws,6);
  var end=toISO(we);
  var today=todayISO();
  if(end>today)end=today;   /* never count days that have not happened */
  var ls=(state.training||{}).liftSessions||{};
  var sessions=[];
  Object.keys(ls).sort().forEach(function(d){
    (ls[d]||[]).forEach(function(s){
      if(!s)return;
      sessions.push({date:d,ts:s.ts||0,name:s.name||"Workout",mins:s.mins,rpe:s.rpe,
        notes:(s.notes||""),mfb:s.mfb||null,
        entries:(s.entries||[]).map(function(en){
          return {exerciseId:en.exerciseId,name:en.name,muscle:en.muscle,
            fb:en.fb||null,progression:en.progression,
            sets:(en.sets||[]).map(function(st){
              return {weight:st.weight,reps:st.reps,rir:st.rir,status:st.status};})};})});});});
  var exMap={};
  ((state.training||{}).exercises||[]).forEach(function(x){
    if(x&&x.id)exMap[x.id]={name:x.name,muscle:x.muscle,equipment:x.equipment||"",
      bodyweight:!!x.bodyweight};});
  var s=state.settings||{};
  var tr=null;try{tr=tdeeTargetRate();}catch(e){tr=null;}
  return {
    today:today,windowEnd:end,weekStartDay:(parseInt(s.weekStart,10)||0),
    /* null means "use the default preset"; the picker supplies the rest */
    reviewWindow:(reviewWindow||null),
    units:s.units||"lbs",who:lrWho(),plan:lrPlanLabel(),planMode:strategyMode(),
    settings:{targetProtein:s.targetProtein,targetCalories:s.targetCalories,
      proteinAuto:s.proteinAuto,sleepGoalMin:sleepGoalMin(),
      liftSessGoal:s.liftSessGoal,goalWeight:s.goalWeight,
      startingWeight:s.startingWeight,targetWeeklyRate:tr,
      /* the profile's own phase start — Current Phase reads this first */
      startDate:s.startDate,strategy:strategyMode()},
    weights:(state.weights||[]).map(function(x){return {date:x.date,weight:x.weight};}),
    food:state.food||{},sleep:state.sleep||{},skips:state.skips||{},
    sessions:sessions,exercises:exMap,
    glp:{enabled:!!(state.glp&&state.glp.settings&&state.glp.settings.enabled),
      compound:(state.glp&&state.glp.compound)||null,
      doses:((state.glp&&state.glp.doses)||[]).slice(),
      symptoms:((state.glp&&state.glp.symptoms)||[]).slice(),
      symptomTypes:((state.glp&&state.glp.symptomTypes)||[]).slice()}};}
function pad2(n){return ("0"+n).slice(-2);}
function reminderICS(hhmm){
  var p=(hhmm||"19:00").split(":");var hh=pad2(parseInt(p[0]||"19",10)||0),mm=pad2(parseInt(p[1]||"0",10)||0);
  var now=new Date();var dt=now.getFullYear()+pad2(now.getMonth()+1)+pad2(now.getDate())+"T"+hh+mm+"00";
  var stamp=new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d+Z$/,"Z");
  return ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//WeightTracker//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH",
    "BEGIN:VEVENT","UID:wl-reminder-"+Date.now()+"@weighttracker","DTSTAMP:"+stamp,"DTSTART:"+dt,"DURATION:PT10M","RRULE:FREQ=DAILY",
    "SUMMARY:Log your activity time","DESCRIPTION:Open your tracker and log today's activity.",
    "BEGIN:VALARM","ACTION:DISPLAY","DESCRIPTION:Log your activity time","TRIGGER:PT0S","END:VALARM",
    "END:VEVENT","END:VCALENDAR"].join("\r\n");
}

/* ---------------- photos (on-device, IndexedDB) ---------------- */
function idb(){return new Promise(function(res,rej){
  if(photoDB)return res(photoDB);
  if(typeof indexedDB==="undefined")return rej("no idb");
  function mkStore(db){if(!db.objectStoreNames.contains("photos")){var os=db.createObjectStore("photos",{keyPath:"id"});os.createIndex("date","date",{unique:false});}}
  /* Open with NO version so we get whatever exists. A device may already hold a
     wl_photos database stuck at version 1 with no object store (an older build
     opened it without an upgrade handler and created it empty) — opening at
     version 1 again would succeed with no upgrade event and leave it broken
     forever. Detect that and bump the version, which is the only way to obtain an
     upgrade transaction in which the store can be added. Self-heals; a healthy
     database takes the fast path and never bumps. */
  var r=indexedDB.open("wl_photos");
  r.onupgradeneeded=function(){mkStore(r.result);};
  r.onsuccess=function(){var db=r.result;
    if(db.objectStoreNames.contains("photos")){photoDB=db;res(db);return;}
    var v=db.version+1;db.close();
    var r2=indexedDB.open("wl_photos",v);
    r2.onupgradeneeded=function(){mkStore(r2.result);};
    r2.onsuccess=function(){photoDB=r2.result;res(photoDB);};
    r2.onerror=function(){rej(r2.error);};};
  r.onerror=function(){rej(r.error);};});}
function idbAdd(rec){srPhotoInvalidate();return idb().then(function(db){return new Promise(function(res,rej){var tx=db.transaction("photos","readwrite");tx.objectStore("photos").put(rec);tx.oncomplete=function(){res();};tx.onerror=function(){rej(tx.error);};});});}
function idbByDate(date){return idb().then(function(db){return new Promise(function(res,rej){var out=[];var tx=db.transaction("photos","readonly");var rq=tx.objectStore("photos").index("date").openCursor(IDBKeyRange.only(date));rq.onsuccess=function(){var c=rq.result;if(c){out.push(c.value);c.continue();}else res(out.sort(function(a,b){return a.ts-b.ts;}));};rq.onerror=function(){rej(rq.error);};});});}
function idbAll(){return idb().then(function(db){return new Promise(function(res,rej){var out=[];var tx=db.transaction("photos","readonly");var rq=tx.objectStore("photos").openCursor();rq.onsuccess=function(){var c=rq.result;if(c){out.push(c.value);c.continue();}else res(out);};rq.onerror=function(){rej(rq.error);};});});}
function idbDelete(id){srPhotoInvalidate();return idb().then(function(db){return new Promise(function(res,rej){var tx=db.transaction("photos","readwrite");tx.objectStore("photos").delete(id);tx.oncomplete=function(){res();};tx.onerror=function(){rej(tx.error);};});});}
function idbClearAll(){srPhotoInvalidate();return idb().then(function(db){return new Promise(function(res){var tx=db.transaction("photos","readwrite");tx.objectStore("photos").clear();tx.oncomplete=function(){res();};tx.onerror=function(){res();};});}).catch(function(){});}
function processImage(file){return new Promise(function(res){
  try{var url=URL.createObjectURL(file);var img=new Image();
    img.onload=function(){URL.revokeObjectURL(url);var max=1600;var scale=Math.min(1,max/Math.max(img.width,img.height));
      var cw=Math.max(1,Math.round(img.width*scale)),ch=Math.max(1,Math.round(img.height*scale));
      var cv=document.createElement("canvas");cv.width=cw;cv.height=ch;cv.getContext("2d").drawImage(img,0,0,cw,ch);
      cv.toBlob(function(b){res(b||file);},"image/jpeg",0.85);};
    img.onerror=function(){URL.revokeObjectURL(url);res(file);};img.src=url;
  }catch(e){res(file);}});}

/* ==== Milestone 1 (progress-photo package): deterministic 3:4 derivative ====
   Reads the AUTHORITATIVE source blob + a validated normalization and renders
   the standardized view. The source is never re-encoded or written back —
   association protection is that the normalization lives ON the record and
   the derivative exists only in this session cache, keyed by pfDerivKey so an
   edited normalization can never be served a stale derivative. No call sites
   render this yet (legacy display is deliberately unchanged in M1); the
   upload-review flow (M2) and the pose timeline (M4) consume it. */
var _pfCache={},_pfCacheKeys=[];
function pfDerivative(rec,maxH,cb){
  if(!pfHasNorm(rec)||!rec.blob){cb(null);return;}
  var key=pfDerivKey(rec.id,rec.normalization);
  if(_pfCache[key]){cb(_pfCache[key],key);return;}
  var url=URL.createObjectURL(rec.blob);var img=new Image();
  img.onload=function(){URL.revokeObjectURL(url);
    try{
      var rect=pfCropRect(rec.normalization.crop,img.width,img.height);
      if(!rect){cb(null);return;}
      var outH=Math.min(maxH||1024,rect.height),outW=Math.round(outH*3/4);
      var cv=document.createElement("canvas");cv.width=outW;cv.height=outH;
      var cx=cv.getContext("2d");
      var rot=(rec.normalization.rotationDegrees||0)*Math.PI/180;
      cx.save();cx.translate(outW/2,outH/2);if(rot)cx.rotate(rot);
      cx.drawImage(img,rect.x,rect.y,rect.width,rect.height,-outW/2,-outH/2,outW,outH);
      cx.restore();
      var du=cv.toDataURL("image/jpeg",0.85);
      _pfCache[key]=du;_pfCacheKeys.push(key);
      while(_pfCacheKeys.length>60)delete _pfCache[_pfCacheKeys.shift()];
      cb(du,key);
    }catch(e){cb(null);}};
  img.onerror=function(){URL.revokeObjectURL(url);cb(null);};
  img.src=url;}
/* ==== Milestone 2 (progress-photo package): upload standardization review ====
   The picker no longer saves directly: processImage() → review sheet
   (original vs standardized 3:4, adjust sliders, explicit accept). The save
   itself is the UNCHANGED X2 add-then-delete chain, extracted here verbatim
   so review-accept and any future capture flow share one audited path.
   Authority: captured at the picker (W4), revalidated before EVERY mutation
   here — the review pause is exactly the async boundary those rules exist for. */
function pfSaveProgress(blob,pose,wk,norm,m10ok){
  return idbAll().then(function(all){
    if(!m10ok()){toast("This device is no longer the active writer — nothing was changed");return null;}
    var old=all.filter(function(p){return p.kind==="progress"&&p.week===wk&&p.pose===pose;});
    var rec={id:"prog-"+wk+"-"+pose+"-"+Date.now(),date:wk,week:wk,pose:pose,kind:"progress",blob:blob,ts:Date.now()+Math.random()};
    if(norm&&pfValidNorm(norm))rec.normalization=norm;
    return idbAdd(rec)
      .then(function(){
        var chain=Promise.resolve();
        old.forEach(function(p){chain=chain.then(function(){
          if(!m10ok())return null;                 /* stop: the pre-image stays */
          return idbDelete(p.id).catch(function(){});});});
        return chain;})
      .then(function(){
        if(state.view==="photos")renderProgressPhotos();else render();
        return m10pRetakeLeft(old);})
      .then(function(left){
        toast(left?"Photo saved — the earlier photo is still on this device and needs review":"Photo saved");
        if(state.view==="photos")renderProgressPhotos();});}
  );}

var pfRevSeq=0;   /* unique per-review preview identity — a constant id made
                     same-size captures collide in the derivative cache and
                     the review showed ANOTHER photo's standardized preview
                     (Owner screenshot IMG_2898, 2026-08-06) */
function pfReviewNorm(){
  var r=state.pfReview;if(!r)return null;
  var a=r.adj;
  var n={schemaVersion:1,algorithmVersion:PF_ALGO,aspectRatio:"3:4",
    crop:pfAdjust(r.base.crop,a.panX,a.panY,a.zoom),
    rotationDegrees:a.rot,confidence:r.base.confidence,
    mode:(a.panX||a.panY||a.rot||a.zoom!==1)?"manual":"auto"};
  return pfValidNorm(n)?n:null;}

function pfReviewHTML(){
  var r=state.pfReview;if(!r)return "";
  /* the original preview's URL is owned by the REVIEW, not the shared
     photoURLs pool — the pose card's async refresh calls clearPhotoURLs()
     mid-review and would revoke it out from under the open sheet (found by
     screenshot: the original rendered as its alt text). Created once at open,
     revoked once at close. */
  var srcUrl=r.srcUrl;
  var n=pfReviewNorm();
  var status=n?(r.base.confidence>=0.5?"Ready":"Suggested frame — adjust if it looks off")
             :"Adjustment out of bounds — reset a slider";
  var h='<div class="wl-confirm" style="z-index:2400"><div class="wl-confirm-card" style="max-height:86vh;overflow:auto;text-align:left">';
  h+='<div style="font-weight:800;font-size:16px;margin-bottom:2px">'+(r.legacyId?"Standardize existing photo":"Standardize this photo")+'</div>';
  h+='<div class="wl-hint" style="margin-bottom:10px">'+esc(POSES.filter(function(x){return x[0]===r.pose;}).map(function(x){return x[1];})[0]||r.pose)+' · week of '+esc(fmtShort(parseISO(r.week)))+(r.legacyId&&!r.solo?' · '+r.legacyLeft+' to review':'')+' · your original is kept untouched</div>';
  if(r.legacyId&&r.narrow)h+='<div class="wl-hint" style="margin-bottom:8px;color:var(--accent)">This photo was already cropped tall — the 3:4 frame can only show what’s still in it.</div>';
  /* Owner 2026-08-06: 'so small it's hard to see when editing' — the
     Standardized pane is the work surface (the ghost lives on it); it gets
     the full sheet width, the original becomes a small reference thumb. */
  h+='<div class="wl-pfrev-origrow"><img class="wl-pfrev-srcsm" src="'+srcUrl+'" alt="Original photo"><span class="wl-pfrev-cap">Original · untouched</span></div>';
  h+='<div class="wl-pfrev-cap" style="margin-top:8px">Standardized 3:4</div><div id="wl-pfrev-std" class="wl-pfrev-std"><div class="wl-hint">Preparing…</div></div>';
  var _gp=pfOvPrefs();
  h+='<div class="wl-pfrev-ghostrow"><button class="pfcam-ovtgl'+(_gp.on?" on":"")+'" data-act="pfrev:ghost" aria-pressed="'+(_gp.on?"true":"false")+'">Ghost</button>'
    +'<input type="range" data-pfrevov="strength" min="10" max="75" step="1" value="'+_gp.strength+'" aria-label="Ghost strength"'+(_gp.on?"":" disabled")+'>'
    +'<span id="wl-pfrev-ovval" class="pfcam-ovval">'+_gp.strength+'%</span>'
    +'<span id="wl-pfrev-ghostlbl"></span></div>';
  h+='<div class="wl-hint" style="margin:8px 0 2px">'+esc(status)+'</div>';
  var sl=function(k,lbl,min,max,step,val){return '<label class="wl-field wl-field-full" style="margin-top:8px"><span>'+lbl+'</span><input type="range" data-pfadj="'+k+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+val+'" aria-label="'+lbl+'"></label>';};
  h+=sl("zoom","Zoom",1,3,0.01,r.adj.zoom)+sl("panY","Up / down",-0.5,0.5,0.005,r.adj.panY)
    +sl("panX","Left / right",-0.5,0.5,0.005,r.adj.panX)+sl("rot","Level (°)",-7,7,0.1,r.adj.rot);
  h+='<button class="wl-btn wl-btn-primary wl-full" style="margin-top:12px" '+(n?'data-act="pf:use"':'disabled style="opacity:.4"')+'>Use this photo</button>';
  h+='<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px" data-act="pf:reset">Reset to suggestion</button>';
  h+=r.solo?''
    :r.legacyId?'<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px" data-act="pf:skiplegacy">Skip this photo</button>'
    :'<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px" data-act="pf:choose">'+(r.fromCam?"Retake":"Choose another")+'</button>';
  h+='<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px" data-act="pf:cancel">Cancel</button>';
  return h+'</div></div>';}

/* the standardized preview, drawn AFTER render (needs the DOM node). The
   preview is a derivative of a throwaway in-memory record — the cache key
   includes the crop, so slider moves regenerate and the byte-identical
   source is never involved beyond reading. */
function pfReviewClose(){
  var r=state.pfReview;
  if(r&&r.srcUrl){try{URL.revokeObjectURL(r.srcUrl);}catch(e){}}
  if(r&&r.ghostUrl){try{URL.revokeObjectURL(r.ghostUrl);}catch(e){}}
  state.pfReview=null;}

function pfReviewPreview(){
  var r=state.pfReview;if(!r)return;
  var host=document.getElementById("wl-pfrev-std");if(!host)return;
  var n=pfReviewNorm();if(!n){host.innerHTML='<div class="wl-hint">—</div>';return;}
  pfDerivative({id:"pf-preview-"+(r.revId||0),blob:r.blob,normalization:n},480,function(du){
    var h2=document.getElementById("wl-pfrev-std");if(!h2||!state.pfReview)return;
    h2.innerHTML=du?'<img class="wl-pfrev-img" src="'+du+'" alt="Standardized preview">':'<div class="wl-hint">Preview unavailable — you can still save</div>';
    if(du)pfReviewGhost();});}
/* Owner 2026-08-06: the review is where the crop is FRAMED — overlay the
   same pinned-else-latest reference the camera uses, so upload and
   standardize align against it too (never composited; display layer only). */
function pfReviewGhost(){
  var r=state.pfReview;if(!r)return;
  var prefs=pfOvPrefs();
  idbAll().then(function(all){
    var r2=state.pfReview;if(!r2||r2!==r)return;
    var host=document.getElementById("wl-pfrev-std");if(!host)return;
    var mine=all.filter(function(p){return p.kind==="progress"&&p.pose===r.pose&&p.blob&&p.id!==r.legacyId;})
      .sort(pfNewestFirst);
    var lbl=document.getElementById("wl-pfrev-ghostlbl");
    if(!mine.length){if(lbl)lbl.textContent="";return;}
    var res=pfRefResolve(r.pose,mine);
    var rec=res.rec||mine[0];
    if(lbl)lbl.textContent="Ghost: "+(res.pinned?("pinned · "+fmtShort(parseISO(rec.week||rec.date)))
      :(res.broken?("pinned photo unavailable — using latest · "+fmtShort(parseISO(rec.week||rec.date)))
      :("last photo · "+fmtShort(parseISO(rec.week||rec.date)))));
    if(!prefs.on)return;
    var put=function(src){
      var h2=document.getElementById("wl-pfrev-std");if(!h2||!state.pfReview||state.pfReview!==r)return;
      var g=h2.querySelector(".wl-pfrev-ghost");
      if(!g){g=document.createElement("img");g.className="wl-pfrev-ghost";g.alt="";h2.appendChild(g);}
      g.style.opacity=String(prefs.strength/100);g.src=src;};
    if(pfHasNorm(rec))pfDerivative(rec,480,function(du){
      if(du)put(du);
      else{if(r.ghostUrl){try{URL.revokeObjectURL(r.ghostUrl);}catch(e){}}
        r.ghostUrl=URL.createObjectURL(rec.blob);put(r.ghostUrl);}});
    else{if(r.ghostUrl){try{URL.revokeObjectURL(r.ghostUrl);}catch(e){}}
      r.ghostUrl=URL.createObjectURL(rec.blob);put(r.ghostUrl);}
  }).catch(function(){});}

/* ==== Milestone 3 (progress-photo package): guided four-pose camera ====
   One continuous session: ONE permission grant, ONE stream, Front → Left →
   Right → Back with retake via the pose tabs. The shutter is the only thing
   that captures; each capture feeds the SAME M2 standardization review, and
   an accepted capture saves through the same audited pfSaveProgress chain.
   The previous same-pose photo can be ghosted over the viewfinder as an
   alignment aid only — it is never composited into the captured image (it is
   a separate <img> the canvas never sees). Camera tracks stop promptly on
   close, error, save-of-last-pose, or the page being hidden. */
var pfCam=null;
var PF_POSE_TIPS={front:"Face the camera, arms slightly out, whole body between the lines",
  left:"Turn 90° — your LEFT side to the camera",right:"Turn 90° — your RIGHT side to the camera",
  back:"Back to the camera, arms slightly out"};
function pfOvPrefs(){try{var v=JSON.parse(localStorage.getItem("wl_pf_overlay")||"{}");
  return {on:v.on!==false,strength:Math.min(75,Math.max(10,v.strength!=null?v.strength:48)),
    facing:v.facing==="user"?"user":"environment",
    timer:[3,5,10].indexOf(v.timer)>=0?v.timer:0};}
  catch(e){return {on:true,strength:48,facing:"environment",timer:0};}}
function pfOvSave(pr){try{localStorage.setItem("wl_pf_overlay",JSON.stringify(pr));}catch(e){}}
/* Pinned alignment reference (Owner, 2026-08-06): a per-pose photo the ghost
   ALWAYS uses, so alignment errors never chain week-to-week and a mid-session
   retake never switches the ghost to today's shot. Device-local like the
   overlay prefs. No pin → the most recent same-pose photo (prior behavior). */
function pfRefs(){try{return JSON.parse(localStorage.getItem("wl_pf_refs")||"{}");}catch(e){return {};}}
function pfRefSave(m){try{localStorage.setItem("wl_pf_refs",JSON.stringify(m));}catch(e){}}
/* v2 pins are {id,week}; v1 pins were bare id strings (Owner's devices carry
   them) — normalize on read, and resolve by id FIRST then week, so a record
   re-keyed by sync/retake still finds the same week's photo (Owner report
   2026-08-06: pin resolution failed silently and the ghost fell back) */
function pfRefGet(pose){var v=pfRefs()[pose];
  if(!v)return null;
  if(typeof v==="string")return {id:v,week:null};
  return {id:v.id||null,week:v.week||null};}
function pfRefResolve(pose,list){var ref=pfRefGet(pose);
  if(!ref)return {rec:null,pinned:false,broken:false};
  var byId=list.filter(function(p){return p.id===ref.id;})[0];
  if(byId)return {rec:byId,pinned:true,broken:false};
  var byWk=ref.week?list.filter(function(p){return (p.week||p.date)===ref.week;})[0]:null;
  if(byWk)return {rec:byWk,pinned:true,broken:false};
  return {rec:null,pinned:false,broken:true};}
/* newest-first that does not trust ts: server-adopted records carry ts as a
   string (often empty), which made “most recent” degrade to storage order
   and hand the ghost the OLDEST photo */
function pfNewestFirst(a,b){
  var wa=a.week||a.date||"",wb=b.week||b.date||"";
  if(wa!==wb)return wa<wb?1:-1;
  var ta=+a.ts||0,tb=+b.ts||0;
  if(ta!==tb)return tb-ta;
  return (a.id||"")<(b.id||"")?1:-1;}
function pfCamStop(){
  if(!pfCam)return;
  if(pfCam.timerTick){try{clearInterval(pfCam.timerTick);}catch(e){}pfCam.timerTick=null;}
  try{((pfCam.stream&&pfCam.stream.getTracks())||[]).forEach(function(t){try{t.stop();}catch(e){}});}catch(e){}
  if(pfCam.prevUrl){try{URL.revokeObjectURL(pfCam.prevUrl);}catch(e){}}
  window.removeEventListener("deviceorientation",pfCamTilt);
  var d=document.getElementById("pf-cam");if(d)d.remove();
  pfCam=null;}
function pfCamFallback(pose,week){
  state.pendingPose=pose;state.pendingProgWeek=week;
  var el=document.getElementById("wl-photo-input");if(el)el.click();}
function pfCamOpen(pose,week,cap){
  if(!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia)){
    toast("No camera here — choose a file instead");pfCamFallback(pose,week);return;}
  var facing=pfOvPrefs().facing;
  navigator.mediaDevices.getUserMedia({video:{facingMode:facing,width:{ideal:1440},height:{ideal:1920}},audio:false})
  .then(function(stream){
    if(pfCam)pfCamStop();
    pfCam={stream:stream,pose:pose,week:week,cap:cap,facing:facing,
      order:POSES.map(function(x){return x[0];}),shots:{},prevUrl:null,video:null,tiltSeen:false};
    window.addEventListener("deviceorientation",pfCamTilt);
    pfCamRender();pfCamPrev();})
  .catch(function(){
    toast("Camera unavailable or denied — choose a file instead");
    pfCamFallback(pose,week);});}
/* Owner 2026-08-06: selfie support — flip to the FRONT camera with the ghost
   and guides still working. The preview (and the ghost, so alignment holds)
   mirrors like a normal selfie; the SAVED photo stays true-orientation —
   drawImage reads the raw frame, CSS transforms never reach the canvas — so
   selfie weeks compare honestly against rear-camera weeks. */
function pfCamFlip(){
  var c=pfCam;if(!c)return;
  var want=c.facing==="user"?"environment":"user";
  navigator.mediaDevices.getUserMedia({video:{facingMode:want,width:{ideal:1440},height:{ideal:1920}},audio:false})
  .then(function(stream){
    var c2=pfCam;if(!c2){try{stream.getTracks().forEach(function(t){t.stop();});}catch(e){}return;}
    try{c2.stream.getTracks().forEach(function(t){t.stop();});}catch(e){}
    c2.stream=stream;c2.facing=want;
    var pv=pfOvPrefs();pv.facing=want;pfOvSave(pv);
    pfCamRender();pfCamPrev();})
  .catch(function(){toast("Couldn\u2019t switch cameras \u2014 staying on this one");});}
function pfCamTilt(e){
  var c=pfCam;if(!c)return;
  var el=document.getElementById("pfcam-tilt");if(!el)return;
  var g=e&&e.gamma;
  if(typeof g!=="number"||!isFinite(g)){return;}
  c.tiltSeen=true;
  var a=Math.round(Math.abs(g));
  el.textContent=a<=2?"Level \u2713":("Tilt "+a+"\u00b0 "+(g>0?"right":"left"));
  el.className="pfcam-tilt"+(a<=2?" ok":"");}
function pfCamRender(){
  var c=pfCam;if(!c)return;
  var d=document.getElementById("pf-cam");
  if(!d){d=document.createElement("div");d.id="pf-cam";document.body.appendChild(d);}
  var prefs=pfOvPrefs();
  var lbl=(POSES.filter(function(x){return x[0]===c.pose;})[0]||["",c.pose])[1];
  var idx=c.order.indexOf(c.pose)+1;
  d.innerHTML=
    '<div class="pfcam-wrap">'
    +'<div class="pfcam-head"><span><b>'+esc(lbl)+'</b> \u00b7 '+idx+' of 4</span>'
    +'<button class="pfcam-flip" data-act="pfcam:flip" aria-label="Switch camera">\ud83d\udd04</button>'
    +'<button class="pfcam-x" data-act="pfcam:close" aria-label="Close camera">\u2715</button></div>'
    +'<div class="pfcam-tabs">'+c.order.map(function(pz){
      var pl=(POSES.filter(function(x){return x[0]===pz;})[0]||["",pz])[1];
      return '<button class="'+(pz===c.pose?"on":"")+'" data-act="pfcam:pose" data-pose="'+pz+'">'
        +esc(pl)+(c.shots[pz]?" \u2713":"")+'</button>';}).join("")+'</div>'
    +'<div class="pfcam-view'+(c.facing==="user"?" pfcam-selfie":"")+'">'
    +'<video id="pfcam-video" autoplay playsinline muted></video>'
    +'<img id="pfcam-prev" alt="" style="display:none;opacity:'+(prefs.on?(prefs.strength/100):0)+'">'
    +'<svg class="pfcam-guides" viewBox="0 0 300 400" preserveAspectRatio="none" aria-hidden="true">'
    +'<line x1="0" y1="30" x2="300" y2="30" stroke="rgba(245,181,68,.75)" stroke-width="1.4" stroke-dasharray="6 5"/>'
    +'<line x1="0" y1="378" x2="300" y2="378" stroke="rgba(245,181,68,.75)" stroke-width="1.4" stroke-dasharray="6 5"/>'
    +'<line x1="150" y1="0" x2="150" y2="400" stroke="rgba(245,181,68,.45)" stroke-width="1" stroke-dasharray="3 6"/>'
    /* Owner 2026-08-06: unlabeled lines didn't explain themselves — say what
       each one is for, on the line itself */
    +'<text x="5" y="26" fill="rgba(245,181,68,.9)" font-size="10" font-weight="700">top of head</text>'
    +'<text x="5" y="374" fill="rgba(245,181,68,.9)" font-size="10" font-weight="700">feet</text>'
    +'<text x="155" y="12" fill="rgba(245,181,68,.6)" font-size="9">center</text>'
    +'</svg>'
    +'<div id="pfcam-tilt" class="pfcam-tilt"></div>'
    +'<div id="pfcam-count" class="pfcam-count" style="display:none"></div>'
    +'</div>'
    +'<div class="pfcam-ovrow">'
    +'<button class="pfcam-ovtgl'+(prefs.on?" on":"")+'" data-act="pfcam:ov" aria-pressed="'+(prefs.on?"true":"false")+'">Ghost</button>'
    +'<input type="range" data-pfov="strength" min="10" max="75" step="1" value="'+prefs.strength+'" aria-label="Overlay strength"'+(prefs.on?"":" disabled")+'>'
    +'<span id="pfcam-ovval" class="pfcam-ovval">'+prefs.strength+'%</span></div>'
    +'<div class="pfcam-timerrow"><span class="pfcam-timerlbl">Timer</span>'+[0,3,5,10].map(function(t){
      return '<button class="pfcam-timerchip'+(prefs.timer===t?" on":"")+'" data-act="pfcam:timer" data-t="'+t+'">'+(t===0?"Off":t+"s")+'</button>';}).join("")+'</div>'
    +'<div id="pfcam-ghostsrc" class="pfcam-ghostsrc"></div>'
    +'<div class="pfcam-tip">'+esc(PF_POSE_TIPS[c.pose]||"")+'</div>'
    +'<div class="pfcam-foot"><button class="pfcam-shutter" data-act="pfcam:shot" aria-label="Take photo"></button></div>'
    +'</div>';
  var v=document.getElementById("pfcam-video");
  try{v.srcObject=c.stream;}catch(e){}
  c.video=v;}
function pfCamPrev(){
  var c=pfCam;if(!c)return;
  idbAll().then(function(all){
    if(!pfCam||pfCam!==c)return;
    var img=document.getElementById("pfcam-prev");if(!img)return;
    var mine=all.filter(function(p){return p.kind==="progress"&&p.pose===c.pose&&p.blob;})
      .sort(pfNewestFirst);
    if(c.prevUrl){try{URL.revokeObjectURL(c.prevUrl);}catch(e){}c.prevUrl=null;}
    var gsrc=document.getElementById("pfcam-ghostsrc");
    if(!mine.length){img.style.display="none";img.removeAttribute("src");
      if(gsrc)gsrc.textContent="";return;}
    var res=pfRefResolve(c.pose,mine);
    var rec=res.rec||mine[0];
    if(gsrc)gsrc.textContent="Ghost: "+(res.pinned?("pinned \u00b7 "+fmtShort(parseISO(rec.week||rec.date)))
      :(res.broken?("pinned photo unavailable \u2014 using latest \u00b7 "+fmtShort(parseISO(rec.week||rec.date)))
      :("last photo \u00b7 "+fmtShort(parseISO(rec.week||rec.date)))));
    var show=function(src){if(!pfCam||pfCam!==c)return;var i2=document.getElementById("pfcam-prev");
      if(i2){i2.src=src;i2.style.display="";}};
    if(pfHasNorm(rec))pfDerivative(rec,720,function(du){
      if(du)show(du);else{c.prevUrl=URL.createObjectURL(rec.blob);show(c.prevUrl);}});
    else{c.prevUrl=URL.createObjectURL(rec.blob);show(c.prevUrl);}
  }).catch(function(){});}
/* Owner 2026-08-06: shutter timer (3/5/10s) for selfie / step-back shots.
   Tap starts the countdown; tapping again cancels. The countdown lives on
   the session and dies with it (close/flip-safe). */
function pfCamShutter(){
  var c=pfCam;if(!c)return;
  if(c.timerTick){clearInterval(c.timerTick);c.timerTick=null;
    var el0=document.getElementById("pfcam-count");if(el0)el0.style.display="none";
    toast("Timer cancelled");return;}
  var t=pfOvPrefs().timer;
  if(!t){pfCamShot();return;}
  var left=t;var el=document.getElementById("pfcam-count");
  if(el){el.textContent=String(left);el.style.display="";}
  c.timerTick=setInterval(function(){
    var c2=pfCam;if(!c2||c2!==c){clearInterval(c.timerTick);return;}
    left--;
    var e2=document.getElementById("pfcam-count");
    if(left<=0){clearInterval(c2.timerTick);c2.timerTick=null;
      if(e2)e2.style.display="none";
      pfCamShot();return;}
    if(e2)e2.textContent=String(left);},1000);}
function pfCamShot(){
  var c=pfCam;if(!c||!c.video||!c.video.videoWidth){toast("Camera not ready yet");return;}
  var v=c.video,vw=v.videoWidth,vh=v.videoHeight,ar=3/4,cw,ch;
  if(vw/vh>ar){ch=vh;cw=vh*ar;}else{cw=vw;ch=vw/ar;}
  var x0=(vw-cw)/2,y0=(vh-ch)/2;
  var cv=document.createElement("canvas");cv.width=Math.round(cw);cv.height=Math.round(ch);
  /* the ghost overlay and guides live in DOM layers the canvas never sees —
     only the video frame is drawn (spec: alignment aid, never composited) */
  cv.getContext("2d").drawImage(v,x0,y0,cw,ch,0,0,cv.width,cv.height);
  cv.toBlob(function(b){
    if(!b){toast("Capture failed — try again");return;}
    processImage(b).then(function(blob){
      var c2=pfCam;if(!c2)return;
      var url=URL.createObjectURL(blob);var img=new Image();
      img.onload=function(){
        var base=pfAutoSuggest(img.width,img.height);
        if(!base){URL.revokeObjectURL(url);toast("Capture failed — try again");return;}
        state.pfReview={blob:blob,pose:c2.pose,week:c2.week,base:base,revId:++pfRevSeq,
          adj:{panX:0,panY:0,zoom:1,rot:0},cap:c2.cap,srcUrl:url,fromCam:true};
        render();pfReviewPreview();};
      img.onerror=function(){URL.revokeObjectURL(url);toast("Capture failed — try again");};
      img.src=url;});
  },"image/jpeg",0.92);}
function pfCamAdvance(donePose){
  var c=pfCam;if(!c)return;
  c.shots[donePose]=true;
  var next=null;
  for(var i=0;i<c.order.length;i++)if(!c.shots[c.order[i]]){next=c.order[i];break;}
  if(next===null){pfCamStop();toast("All four poses captured");
    if(state.view==="photos")renderProgressPhotos();return;}
  c.pose=next;pfCamRender();pfCamPrev();}
document.addEventListener("visibilitychange",function(){
  if(document.visibilityState==="hidden"&&pfCam)pfCamStop();});
window.addEventListener("pagehide",function(){if(pfCam)pfCamStop();});

/* the take-or-upload chooser (spec §4: an empty slot offers both; camera
   permission is requested only after the EXPLICIT guided-photo tap) */
function pfChooseHTML(){
  var pc=state.pfChoose;if(!pc)return "";
  var lbl=(POSES.filter(function(x){return x[0]===pc.pose;})[0]||["",pc.pose])[1];
  var occ=pc.existing;
  return '<div class="wl-confirm" style="z-index:2400"><div class="wl-confirm-card">'
    +'<div class="wl-confirm-msg">'+esc(lbl)+(occ?' \u2014 replace the photo for this week':' \u2014 add this week\u2019s photo')+'</div>'
    +(occ?'<div class="wl-hint" style="margin-bottom:10px;color:var(--bad)">This slot already holds your '
       +esc(fmtShort(parseISO(occ.date)))+' '+esc(lbl.toLowerCase())+' photo. Saving a new one REPLACES it \u2014 the old photo is removed from this device and the server. Your camera roll is untouched.</div>':'')
    +'<button class="wl-btn wl-btn-primary wl-full" data-act="pfsrc:cam">\ud83d\udcf7 '+(occ?'Retake with the guided camera':'Take guided photo')+'</button>'
    +'<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px" data-act="pfsrc:upload">'+(occ?'Upload a replacement':'Upload existing photo')+'</button>'
    +(occ?'<div class="wl-hint" style="margin-top:10px">Wrong date on the existing photo? Close this and use <b>Edit date</b> on the timeline instead \u2014 that moves it without replacing anything.</div>':'')
    +'<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px" data-act="pfsrc:cancel">Cancel</button>'
    +'</div></div>';}

/* ---- progress-photo backup / restore (device-only, never synced) ---- */
function progressPhotos(){return idbAll().then(function(all){return all.filter(function(p){return p.kind==="progress";});});}
function blobToDataURL(blob){return new Promise(function(res,rej){var r=new FileReader();r.onload=function(){res(r.result);};r.onerror=function(){rej(r.error);};r.readAsDataURL(blob);});}
function refreshPbkCount(){var el=document.getElementById("wl-pbk-count");if(!el)return;
  progressPhotos().then(function(list){if(!list.length){el.textContent="None yet";return;}
    var wks={};list.forEach(function(p){wks[p.week||p.date]=1;});var nw=Object.keys(wks).length;
    el.textContent=list.length+" photo"+(list.length===1?"":"s")+" · "+nw+" week"+(nw===1?"":"s");
  }).catch(function(){el.textContent="";});}
function exportProgressPhotos(){
  progressPhotos().then(function(list){
    if(!list.length){toast("No progress photos to export");return;}
    toast("Preparing "+list.length+" photo"+(list.length===1?"":"s")+"…");
    Promise.all(list.map(function(p){return blobToDataURL(p.blob).then(function(du){var o={id:p.id,week:p.week||p.date,pose:p.pose,date:p.date,ts:p.ts,dataUrl:du};if(pfHasNorm(p))o.normalization=p.normalization;return o;});})).then(function(recs){
      var out={app:"compound",kind:"progress-photos",version:2,exported:new Date().toISOString(),count:recs.length,photos:recs};
      shareOrDownload("compound-progress-photos-"+todayISO()+".json","application/json",JSON.stringify(out));
    }).catch(function(){toast("Couldn't prepare photos");});
  }).catch(function(){toast("Photos aren't available on this device");});}
function importProgressPhotos(text,m10cap){
  /* X3 (round-30 ruling 3): the capture is taken by the CALLER at the file
     boundary and threaded through confirmation, idbAll, deletes, blob fetches
     and adds; every mutation revalidates it. */
  var _icap=(m10cap!==undefined)?m10cap:((typeof m10Capture==="function")?m10Capture():null);
  var _iok=function(){return (typeof m10StillValid==="function")?m10StillValid(_icap):true;};
  var data;try{data=JSON.parse(text);}catch(e){toast("That file isn't a valid photo backup");return;}
  var list=(data&&data.photos)||[];
  if(!data||data.kind!=="progress-photos"||!list.length){toast("No progress photos found in that file");return;}
  askConfirm("Import "+list.length+" progress photo"+(list.length===1?"":"s")+" from this file? Any photo for the same week and pose on this device will be replaced.",function(){
    if(!_iok()){toast("This device is no longer the active writer — nothing was imported");return;}
    toast("Importing "+list.length+" photo"+(list.length===1?"":"s")+"…");
    idbAll().then(function(all){
      if(!_iok()){toast("This device is no longer the active writer — nothing was imported");return;}
      var existingProg=all.filter(function(p){return p.kind==="progress";});
      var chain=Promise.resolve();var added=0;
      list.forEach(function(rec){
        if(!rec||!rec.dataUrl||!rec.pose)return;
        var wk=rec.week||rec.date;
        chain=chain.then(function(){
          if(!_iok())return null;
          var dupes=existingProg.filter(function(p){return (p.week||p.date)===wk&&p.pose===rec.pose;});
          /* ADD first, then retire the superseded copies — never leave a slot
             empty if authority is lost mid-import */
          return fetch(rec.dataUrl).then(function(r){return r.blob();}).then(function(blob){
            if(!_iok())return null;
            /* Y7 (round-31 ruling 7): idbAdd is a PUT — reusing an incoming
               rec.id would overwrite existing bytes in place, destroying the
               pre-image before the old record could be retired. Imported
               photos are always staged under a fresh unique id. */
            var stagedId="prog-"+wk+"-"+rec.pose+"-"+Date.now()+"-"+Math.random().toString(36).slice(2,8);
            var staged={id:stagedId,date:wk,week:wk,pose:rec.pose,kind:"progress",blob:blob,ts:rec.ts||(Date.now()+Math.random())};
            if(rec.normalization&&pfValidNorm(rec.normalization))staged.normalization=rec.normalization;
            return idbAdd(staged).then(function(){
              added++;
              var dchain=Promise.resolve();
              dupes.forEach(function(p){dchain=dchain.then(function(){
                if(!_iok())return null;
                return idbDelete(p.id).catch(function(){});});});
              return dchain;});
          });
        });
      });
      chain.then(function(){toast("Imported "+added+" photo"+(added===1?"":"s"));if(state.view==="photos")renderProgressPhotos();if(document.getElementById("wl-pbk-count"))refreshPbkCount();}).catch(function(){toast("Some photos couldn't be imported");});
    }).catch(function(){toast("Couldn't import — photos unavailable");});
  },{label:"Import",danger:false});}
function clearPhotoURLs(){photoURLs.forEach(function(u){try{URL.revokeObjectURL(u);}catch(e){}});photoURLs=[];photoMap={};}
function pfThumbInto(elId,rec,maxH){
  var el=document.getElementById(elId);if(!el)return;
  var put=function(src,fit){el.style.backgroundImage="url("+src+")";el.style.backgroundSize=fit||"cover";el.style.backgroundRepeat="no-repeat";el.style.backgroundPosition="center";};
  if(pfHasNorm(rec))pfDerivative(rec,maxH,function(du){
    var el2=document.getElementById(elId);if(!el2)return;
    el2.style.backgroundRepeat="no-repeat";el2.style.backgroundPosition="center";
    if(du){el2.style.backgroundImage="url("+du+")";el2.style.backgroundSize="cover";}
    else{var u=URL.createObjectURL(rec.blob);photoURLs.push(u);el2.style.backgroundImage="url("+u+")";el2.style.backgroundSize="contain";}});
  else{var u2=URL.createObjectURL(rec.blob);photoURLs.push(u2);put(u2,"contain");}}

/* ==== Milestone 5: legacy re-standardization queue ====
   One photo at a time through the SAME M2 review; accepting writes ONLY the
   normalization metadata onto the existing record (the blob is untouched —
   idbAdd is a keyed put). Skip parks the photo for this session; Cancel ends
   the queue. Never a bulk rewrite. */
function pfLegacyNext(cap){
  idbAll().then(function(all){
    var skip=state.pfLegSkip||[];
    var legacy=all.filter(function(p){return p.kind==="progress"&&!pfHasNorm(p)&&skip.indexOf(p.id)<0&&p.blob;})
      .sort(function(a,b){return (a.week||a.date||"")<(b.week||b.date||"")?-1:1;});
    if(!legacy.length){toast(skip.length?"Done — skipped photos stay as they were":"All photos standardized");
      state.pfLegSkip=null;if(state.view==="photos")renderProgressPhotos();return;}
    var rec=legacy[0];
    var url=URL.createObjectURL(rec.blob);var img=new Image();
    img.onload=function(){
      var base=pfAutoSuggest(img.width,img.height);
      if(!base){URL.revokeObjectURL(url);state.pfLegSkip=(state.pfLegSkip||[]).concat([rec.id]);pfLegacyNext(cap);return;}
      state.pfReview={blob:rec.blob,pose:rec.pose,week:rec.week||rec.date,base:base,revId:++pfRevSeq,
        adj:{panX:0,panY:0,zoom:1,rot:0},cap:cap,srcUrl:url,
        legacyId:rec.id,legacyLeft:legacy.length,
        narrow:(img.width/img.height)<0.72};
      render();pfReviewPreview();};
    img.onerror=function(){URL.revokeObjectURL(url);state.pfLegSkip=(state.pfLegSkip||[]).concat([rec.id]);pfLegacyNext(cap);};
    img.src=url;
  }).catch(function(){toast("Photos aren’t available right now");});}

var POSES=[["front","Front"],["left","Left Side"],["right","Right Side"],["back","Back"]];
function view_photos(){
  var h='<div class="wl-stack">';
  h+='<div class="wl-card"><div class="wl-card-head"><span>This Week '+infoBtn("photos")+'</span><span class="wl-count">'+fmtShort(weekStartFor(0))+'</span></div><div id="wl-progweek" class="wl-poserow"><div class="wl-hint">Loading\u2026</div></div><div class="wl-hint" style="margin-top:10px">Tap a slot to add or retake.</div></div>';
  h+=photoDiagHTML();h+='<div id="wl-progtimeline"></div>';
  return h+'</div>';
}
function renderProgressPhotos(){clearPhotoURLs();var curWk=toISO(weekStartFor(0));
  idbAll().then(function(all){var progs=all.filter(function(p){return p.kind==="progress";});
    var host=document.getElementById("wl-progweek");
    if(host){var html="";POSES.forEach(function(ps){var found=progs.filter(function(p){return p.week===curWk&&p.pose===ps[0];})[0];
      if(found){var url=URL.createObjectURL(found.blob);photoURLs.push(url);html+='<div class="wl-poseslot"><button class="wl-poseimg" data-act="photo:view" data-id="'+found.id+'" style="background-image:url('+url+')"></button><span class="wl-poselbl">'+ps[1]+'</span></div>';}
      else{html+='<div class="wl-poseslot"><button class="wl-poseadd" data-act="pphoto:add" data-pose="'+ps[0]+'"><span>\uff0b</span></button><span class="wl-poselbl">'+ps[1]+'</span></div>';}});
      host.innerHTML=html;}
    var tl=document.getElementById("wl-progtimeline");
    if(tl){
      /* ==== Milestone 4: pose timeline + two-photo comparison ==== */
      var pose=state.pfTlPose||"front";
      var sel=state.pfSel||[];
      var items=progs.filter(function(p){return p.pose===pose;})
        .sort(function(a,b){return (a.week||a.date||"")<(b.week||b.date||"")?-1:1;});
      var legacyN=progs.filter(function(p){return !pfHasNorm(p);}).length;
      var html2='<div class="wl-card"><div class="wl-card-head"><span>Timeline</span><span class="wl-count">'+items.length+'</span></div>';
      html2+='<div class="wl-seg wl-seg-wide" style="margin-bottom:10px">'+POSES.map(function(ps){
        return '<button class="'+(pose===ps[0]?"on":"")+'" data-act="pftl:pose" data-pose="'+ps[0]+'">'+ps[1]+'</button>';}).join("")+'</div>';
      if(!items.length){
        html2+='<div class="wl-hint">No '+((POSES.filter(function(x){return x[0]===pose;})[0]||["",pose])[1])+' photos yet — add one from the weekly card above.</div>';
      }else{
        html2+='<div class="wl-posetimeline">';
        items.forEach(function(p){
          var si=sel.indexOf(p.id);
          var _ref=pfRefGet(pose);
          var isRef=!!(_ref&&_ref.id===p.id);
          html2+='<div class="wl-tlitem"><button class="wl-tlimg pftl'+(si>=0?" sel":"")+'" data-act="pftl:sel" data-id="'+p.id+'" id="pftl-'+p.id+'" aria-pressed="'+(si>=0)+'">'
            +(isRef?'<span class="pftl-pin" title="Camera alignment reference">📌</span>':"")
            +(si>=0?'<span class="pftl-badge">'+(si+1)+' ✓</span>':"")
            +'</button><span class="wl-tllbl">'+fmtShort(parseISO(p.week||p.date))+'</span></div>';});
        html2+='<div class="wl-tlitem"><button class="wl-tladd" data-act="pphoto:add" data-pose="'+pose+'" aria-label="Add next check-in"><span>＋</span></button><span class="wl-tllbl">Add next</span></div>';
        html2+='</div>';
        var _tref=pfRefGet(pose);var refId=_tref?_tref.id:null;
        var _selRec=sel.length===1?items.filter(function(p){return p.id===sel[0];})[0]:null;
        html2+='<div class="wl-pftl-actions"><button class="wl-btn '+(sel.length===2?"wl-btn-primary":"wl-btn-ghost")+'" '+(sel.length===2?'data-act="pftl:compare"':'disabled style="opacity:.4"')+'>Compare</button>'
          +(sel.length===1?'<button class="wl-btn wl-btn-ghost" data-act="pftl:pinref" data-id="'+sel[0]+'" data-week="'+esc((_selRec&&(_selRec.week||_selRec.date))||"")+'">'+(refId===sel[0]?"Unpin reference":"Pin as camera reference")+'</button>'
            +'<button class="wl-btn wl-btn-ghost" data-act="pftl:editdate" data-id="'+sel[0]+'">Edit date</button>'
            +'<button class="wl-btn wl-btn-ghost" data-act="pftl:restd" data-id="'+sel[0]+'">Re-standardize</button>':"")
          +(sel.length?'<button class="wl-btn wl-btn-ghost" data-act="pftl:clear">Clear</button>':"")
          +'<span class="wl-hint" style="margin-left:auto">Tap two dates to compare</span></div>';
      }
      if(state.pfDateEdit){
        var _der=items.filter(function(p){return p.id===state.pfDateEdit.id;})[0];
        var _dcur=(_der&&(_der.week||_der.date))||toISO(weekStartFor(0));
        html2+='<div class="wl-confirm" style="z-index:2400"><div class="wl-confirm-card" style="text-align:left">'
          +'<div style="font-weight:800;font-size:16px;margin-bottom:2px">Edit photo date</div>'
          +'<div class="wl-hint" style="margin-bottom:10px">Progress photos are filed by week — the date you pick snaps to the week it belongs to. Syncs to every device.</div>'
          +'<label class="wl-field wl-field-full"><span>Date</span><input type="date" id="wl-pfdate" value="'+esc(_dcur)+'"></label>'
          +'<button class="wl-btn wl-btn-primary wl-full" style="margin-top:12px" data-act="pfdate:save" data-id="'+esc(state.pfDateEdit.id)+'">Save date</button>'
          +'<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px" data-act="pfdate:cancel">Cancel</button>'
          +'</div></div>';}
      if(legacyN)html2+='<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:10px" data-act="pfleg:start">Standardize existing photos ('+legacyN+')</button>'
        +'<div class="wl-hint" style="margin-top:6px">One at a time — accept, adjust, or skip. Originals are never changed.</div>';
      html2+='</div>';
      if(state.pfCompare&&sel.length===2){
        var pair=sel.map(function(id){return progs.filter(function(p){return p.id===id;})[0];}).filter(Boolean);
        if(pair.length===2){
          /* Owner 2026-08-06: 'barely bigger than a thumbnail' — compare is
             a FULL-SCREEN edge-to-edge overlay now, both photos at once */
          html2+='<div class="pfcmp-fs">'
            +'<div class="pfcmp-fs-head"><span>'+((POSES.filter(function(x){return x[0]===pose;})[0]||["",""])[1])+' — compare</span><button class="pfcam-x" data-act="pfcmp:close" aria-label="Close compare">\u2715</button></div>'
            +'<div class="pfcmp-row pfcmp-row-fs">'+pair.map(function(p){
              return '<div><div class="wl-tllbl" style="margin-bottom:5px">'+fmtShort(parseISO(p.week||p.date))+'</div><div class="pfcmp-img" id="pfcmp-'+p.id+'"></div></div>';}).join("")
            +'</div>'
            +'<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:auto" data-act="pfcmp:close">Close</button>'
            +'</div>';
        }
      }
      if(!progs.length)html2='<div class="wl-card"><div class="wl-hint">No progress photos yet. Add your first set above — then each week’s photos line up here by pose so you can see the change over time.</div></div>';
      tl.innerHTML=html2;
      items.forEach(function(p){pfThumbInto("pftl-"+p.id,p,320);});
      if(state.pfCompare&&sel.length===2)sel.forEach(function(id){
        var rec=progs.filter(function(p){return p.id===id;})[0];
        if(rec)pfThumbInto("pfcmp-"+id,rec,720);});
    }
  }).catch(function(){});
}
function renderPhotosStrip(date){var host=document.getElementById("wl-photostrip");if(!host)return;
  idbByDate(date).then(function(list){var h2=document.getElementById("wl-photostrip");if(!h2)return;clearPhotoURLs();list=list.filter(function(p){return p.kind!=="progress";});
    if(!list.length){h2.innerHTML='<div class="wl-hint" style="padding:0 0 8px">No meals added yet today.</div>';return;}
    var html='<div class="wl-photostrip-row">';
    list.slice(0,6).forEach(function(p){var url=URL.createObjectURL(p.blob);photoURLs.push(url);photoMap[p.id]=url;html+='<button class="wl-photo-sm" data-act="photo:view" data-id="'+p.id+'" style="background-image:url('+url+')"></button>';});
    if(list.length>6)html+='<button class="wl-photo-more" data-act="go" data-view="diary">+'+(list.length-6)+'</button>';
    html+='</div>';h2.innerHTML=html;
  }).catch(function(){var h2=document.getElementById("wl-photostrip");if(h2)h2.innerHTML='';});}
function renderPhotos(date){var host=document.getElementById("wl-photos");if(!host)return;
  idbByDate(date).then(function(list){var h2=document.getElementById("wl-photos");if(!h2)return;list=list.filter(function(p){return p.kind!=="progress";});
    clearPhotoURLs();
    if(!list.length){h2.innerHTML='<div class="wl-empty" style="padding:6px 0">No food photos yet — add a meal below.</div>';return;}
    var MEALS=[["breakfast","Breakfast"],["lunch","Lunch"],["snack","Snack"],["dinner","Dinner"],["","Other"]];
    var html="";
    MEALS.forEach(function(m){var items=list.filter(function(p){return (p.meal||"")===m[0];});if(!items.length)return;
      html+='<div class="wl-meal-label">'+m[1]+'</div><div class="wl-photos">';
      items.forEach(function(p){var url=URL.createObjectURL(p.blob);photoURLs.push(url);photoMap[p.id]=url;
        html+='<button class="wl-photo" data-act="photo:view" data-id="'+p.id+'" style="background-image:url('+url+')"></button>';});
      html+='</div>';});
    h2.innerHTML=html;
  }).catch(function(){var h2=document.getElementById("wl-photos");if(h2)h2.innerHTML='<div class="wl-empty" style="padding:6px 0">Photos aren\u2019t available on this device.</div>';});}
function view_diary(){
  var h='<div class="wl-stack">';
      h+='<div id="wl-diary"><div class="wl-empty" style="padding:20px 0">Loading…</div></div>';
  h+='</div>';
  return h;
}
function weekStartOf(iso){var ws=parseInt(state.settings.weekStart,10)||0;var d=parseISO(iso);var diff=(d.getDay()-ws+7)%7;d.setDate(d.getDate()-diff);d.setHours(0,0,0,0);return d;}
function renderDiary(){var host=document.getElementById("wl-diary");if(!host)return;
  idbAll().then(function(all){all=all.filter(function(p){return p.kind!=="progress";});var host2=document.getElementById("wl-diary");if(!host2)return;
    clearPhotoURLs();
    if(!all.length){host2.innerHTML='<div class="wl-empty" style="padding:20px 0">No food photos yet. Open a day\u2019s Food diary to add meals.</div>';return;}
    var byDate={};all.forEach(function(p){(byDate[p.date]=byDate[p.date]||[]).push(p);});
    var weekSet={};Object.keys(byDate).forEach(function(d){weekSet[toISO(weekStartOf(d))]=true;});
    var weeks=Object.keys(weekSet).sort().reverse();
    var show=Math.min(state.diaryWeeks||1,weeks.length);var shown=weeks.slice(0,show);
    var MEALS=[["breakfast","Breakfast"],["lunch","Lunch"],["snack","Snack"],["dinner","Dinner"],["","Other"]];
    var html="";
    shown.forEach(function(wkISO){var ws0=parseISO(wkISO),we=addDays(ws0,6);
      html+='<div class="wl-diary-weekhead">'+fmtShort(ws0)+' – '+fmtShort(we)+(toISO(weekStartFor(0))===wkISO?' · This week':'')+'</div>';
      for(var i=0;i<7;i++){var dISO=toISO(addDays(ws0,i));var photos=byDate[dISO];if(!photos)continue;
        var f=state.food[dISO]||{};var cal=num(f.calories),p=num(f.protein),c=num(f.carbs),ft=num(f.fat);
        html+='<div class="wl-card wl-diary-day"><div class="wl-diary-dayhead"><span class="wl-diary-date">'+fmtLong(parseISO(dISO))+(dISO===todayISO()?' · Today':'')+'</span></div>';
        if(cal!=null||p!=null||c!=null||ft!=null){html+='<div class="wl-diary-macros">'+(cal!=null?'<b>'+Math.round(cal).toLocaleString()+'</b> cal':'<span style="color:var(--faint)">calories not logged</span>')+(p!=null?'  ·  P: '+p+'g':'')+(ft!=null?'  ·  F: '+ft+'g':'')+(c!=null?'  ·  C: '+c+'g':'')+'</div>';
          var mc=(p||0)*4+(c||0)*4+(ft||0)*9;if((p!=null||c!=null||ft!=null)&&cal!=null&&Math.abs(cal-mc)>2)html+='<div class="wl-diary-partial">⚠️ Partial log — macros don\u2019t total the calories</div>';}
        MEALS.forEach(function(m){var items=photos.filter(function(x){return (x.meal||"")===m[0];});if(!items.length)return;
          html+='<div class="wl-meal-label">'+m[1]+'</div><div class="wl-photos">';
          items.forEach(function(x){var url=URL.createObjectURL(x.blob);photoURLs.push(url);photoMap[x.id]=url;html+='<button class="wl-photo" data-act="photo:view" data-id="'+x.id+'" style="background-image:url('+url+')"></button>';});
          html+='</div>';});
        html+='</div>';
      }
    });
    if(weeks.length>show)html+='<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:4px" data-act="diary:older">↓ Load older week</button>';
    host2.innerHTML=html;
  }).catch(function(){var host2=document.getElementById("wl-diary");if(host2)host2.innerHTML='<div class="wl-empty" style="padding:20px 0">Photos aren\u2019t available on this device.</div>';});}
function themeGrid(){var cur=state.settings.theme||"dark";
  return Object.keys(THEMES).map(function(id){var t=THEMES[id];var on=id===cur;
    return '<button class="wl-theme'+(on?" on":"")+'" data-act="set:theme" data-theme="'+id+'"><span class="wl-theme-sw"><i style="background:'+t.v.bg+'"></i><i style="background:'+t.v.card+'"></i><i style="background:'+t.v.accent+'"></i><i style="background:'+t.v.good+'"></i></span><span class="wl-theme-name">'+t.label+" mode"+'</span>'+(on?'<span class="wl-theme-check">'+I.check.replace("<svg","<svg width=14 height=14")+'</span>':'')+'</button>';}).join("");
}
function zoneFromHR(hr,mx){if(hr==null||mx==null||mx<=0)return null;var p=hr/mx;if(p<0.60)return 1;if(p<0.70)return 2;if(p<0.80)return 3;if(p<0.90)return 4;return 5;}
function estMaxHR(){var age=num(state.settings.age);if(age==null)return null;return Math.round(208-0.7*age);}
function effMaxHR(){var m=num(state.settings.maxHR);return m!=null?m:estMaxHR();}
/* Where the zone lines sit. Three ways, in order of authority:
   manual (a lab test or a watch's own table beats any formula), Karvonen —
   effort measured above RESTING heart rate, which needs a resting HR — and
   plain percent of max, which is what the app has always used and stays the
   answer for anyone who has not entered one. The fractions are the same in
   every method, so nobody's zones shift until they add resting HR themselves. */
var ZONE_FRACTIONS=[0.60,0.70,0.80,0.90];   /* lower bound of zones 2,3,4,5 */
function restHR(){var r=num(state.settings.restingHR);return (r!=null&&r>0)?r:null;}
function manualZoneBounds(){var out=[],i,v;
  for(i=2;i<=5;i++){v=num(state.settings["zoneB"+i]);if(v==null||v<=0)return null;out.push(Math.round(v));}
  for(i=1;i<out.length;i++){if(out[i]<=out[i-1])return null;}   /* must ascend, or it is not a table */
  return out;}
function zoneModel(){
  var wantManual=state.settings.zoneMethod==="manual";
  if(wantManual){var mb=manualZoneBounds();if(mb)return {method:"manual",bounds:mb,max:effMaxHR(),rest:restHR()};}
  var mx=effMaxHR();if(mx==null)return null;
  var rest=restHR();
  /* Bounds stay unrounded: rounding them would move zone edges by a beat for
     some athletes, which would silently change what counts as zone 2. */
  if(rest!=null&&rest<mx){var res=mx-rest;
    return {method:"hrr",max:mx,rest:rest,reserve:res,incomplete:wantManual,
      bounds:ZONE_FRACTIONS.map(function(f){return rest+f*res;})};}
  return {method:"pctmax",max:mx,rest:rest,incomplete:wantManual,
    bounds:ZONE_FRACTIONS.map(function(f){return f*mx;})};}
function zoneForHR(hr){var h=num(hr);if(h==null)return null;var m=zoneModel();if(!m)return null;
  var z=1;for(var i=0;i<m.bounds.length;i++){if(h>=m.bounds[i])z=i+2;}return z;}
function zoneBasisText(hr,m){
  if(m.method==="manual")return "your own zone table";
  if(m.method==="hrr")return Math.max(0,Math.round((hr-m.rest)/m.reserve*100))+"% of heart-rate reserve";
  return Math.round(hr/m.max*100)+"% of max "+Math.round(m.max)+" bpm";}
function zoneTableHTML(){var m=zoneModel();
  if(!m)return "Add your age or max heart rate to place the zones.";
  var b=m.bounds.map(function(x){return Math.round(x);});
  var basis=m.method==="manual"?"Your own zone table."
    :m.method==="hrr"?("Karvonen — heart-rate reserve of "+Math.round(m.reserve)+" bpm ("+Math.round(m.max)+" max − "+Math.round(m.rest)+" resting).")
    :("Percent of max heart rate ("+Math.round(m.max)+" bpm). Add a resting heart rate above and these move to heart-rate reserve.");
  var rows=[["Zone 1","under "+b[0]],["Zone 2",b[0]+"–"+(b[1]-1)],["Zone 3",b[1]+"–"+(b[2]-1)],
            ["Zone 4",b[2]+"–"+(b[3]-1)],["Zone 5",b[3]+"+"]];
  var h=(m.incomplete?'<b>Manual is on but the table is incomplete</b> — the four numbers must ascend. Showing the automatic zones until they do.<br>':'')+basis;
  h+='<div style="display:grid;grid-template-columns:auto 1fr;gap:3px 14px;margin-top:8px">';
  rows.forEach(function(r){h+='<span>'+r[0]+'</span><span style="font-family:'+"var(--mono)"+';color:var(--text)">'+r[1]+' bpm</span>';});
  return h+'</div>';}
function zoneAreaHTML(cf,pfx){pfx=pfx||"cf";var m=zoneModel();var hr=num(cf.hr);
  if(m&&hr!=null){var z=zoneForHR(hr);return '<div class="wl-cf-label">Zone</div><div class="wl-hint">From your avg HR: <b>Zone '+z+'</b> ('+zoneBasisText(hr,m)+') — set automatically.</div>';}
  var label=m?'Zone <em>enter avg HR above to auto-detect</em>':'Zone';
  return '<div class="wl-cf-label">'+label+'</div><div class="wl-seg wl-seg-wide">'+[1,2,3,4,5].map(function(z){return '<button class="'+(cf.zone===z?"on":"")+'" data-act="'+pfx+':zone" data-zone="'+z+'">'+z+'</button>';}).join("")+'</div>';}
function weekTrainingStats(ws){var out={cardioSessions:0,cardioZ2Sessions:0,cardioMins:0,cardioZ2Mins:0,liftSessions:0,liftMins:0,totalMins:0};
  for(var i=0;i<7;i++){var iso=toISO(addDays(ws,i));
    ((state.training.sessions||{})[iso]||[]).forEach(function(x){if(x.kind==="cardio"){out.cardioSessions++;var m=(num(x.mins)||0);out.cardioMins+=m;var z=num(x.zone);if(z==null||z>=2){out.cardioZ2Mins+=m;out.cardioZ2Sessions++;}}});
    ((state.training.liftSessions||{})[iso]||[]).forEach(function(x){out.liftSessions++;out.liftMins+=(num(x.mins)||0);});}
  out.totalMins=out.cardioMins+out.liftMins;return out;}
function goalBarHTML(label,val,goal,unit,soon){var pct=goal>0?Math.min(100,Math.round(val/goal*100)):0;var done=goal>0&&val>=goal;
  return '<div class="wl-goalrow"><div class="wl-goalrow-top"><span>'+label+(soon?' <em style="color:var(--faint);font-style:normal">· logging soon</em>':'')+'</span><span class="wl-goalrow-val'+(done?" done":"")+'">'+(val||0).toLocaleString()+' / '+(goal||0).toLocaleString()+(unit?' '+unit:'')+(done?' ✓':'')+'</span></div><div class="wl-goalbar"><div class="wl-goalbar-fill'+(done?" done":"")+'" style="width:'+pct+'%"></div></div></div>';}
function trainingGoalsHTML(ws){var st=weekTrainingStats(ws);var f=state.settings;
  var cmGoal=num(f.cardioMinGoal),liftGoal=num(f.liftSessGoal),stG=num(f.stepsGoal);
  if(cmGoal==null&&liftGoal==null&&stG==null)return '<div class="wl-hint">Set weekly goals in Settings → Goals to track them here.</div>';
  var h='';
  if(liftGoal!=null)h+=goalBarHTML("Lifting Sessions",st.liftSessions,liftGoal,"",false);
  if(cmGoal!=null)h+=goalBarHTML("Cardio Minutes (Zone 2+)",st.cardioZ2Mins,cmGoal,"min",false);
  if(stG!=null){var _stw=0;for(var _i=0;_i<7;_i++){var _iso=toISO(addDays(ws,_i));var _v=num(state.steps[_iso]);if(_v!=null)_stw+=_v;}h+=goalBarHTML("Steps",_stw,stG*7,"",false);}
  return h;}
var MUSCLES=[["chest","Chest","#d926b8"],["back","Back","#3aa0c9"],["shoulders","Shoulders","#a855f7"],["biceps","Biceps","#f59e0b"],["triceps","Triceps","#ec4899"],["quads","Quads","#22c55e"],["hamstrings","Hamstrings","#10b981"],["glutes","Glutes","#14b8a6"],["calves","Calves","#84cc16"],["core","Core","#eab308"],["forearms","Forearms","#f97316"],["other","Other","#9ca3af"]];
function muscleInfo(k){for(var i=0;i<MUSCLES.length;i++)if(MUSCLES[i][0]===k)return {label:MUSCLES[i][1],color:MUSCLES[i][2]};return {label:"Other",color:"#9ca3af"};}
var EXSEED=[
{n:"Smith Machine Bench Press (Medium Grip)",m:"chest",e:"Smith Machine"},{n:"Smith Machine Press (Incline, Medium Grip)",m:"chest",e:"Smith Machine"},{n:"Dumbbell Press (Low Incline)",m:"chest",e:"Dumbbell"},{n:"Dip (Chest-Focused)",m:"chest",bw:true},
{n:"Pullup (Parallel Grip)",m:"back",bw:true},{n:"Pullup (Neutral Grip)",m:"back",bw:true},{n:"Pullup (Wide Grip)",m:"back",bw:true},{n:"Pulldown (Normal Grip)",m:"back",e:"Cable"},{n:"Pulldown (Wide Grip)",m:"back",e:"Cable"},{n:"Seated Cable Row",m:"back",e:"Cable"},{n:"Dumbbell Row (2-Arm, Incline)",m:"back",e:"Dumbbell"},
{n:"Dumbbell Shoulder Press (Seated)",m:"shoulders",e:"Dumbbell"},{n:"Dumbbell Shoulder Press (Standing)",m:"shoulders",e:"Dumbbell"},{n:"Dumbbell Lateral Raise",m:"shoulders",e:"Dumbbell"},{n:"Dumbbell Lateral Raise (Top Hold)",m:"shoulders",e:"Dumbbell"},
{n:"Dumbbell Curl (2-Arm)",m:"biceps",e:"Dumbbell"},
{n:"Cable Overhead Triceps Extension (Rope)",m:"triceps",e:"Cable"},{n:"Cable Triceps Pushdown (Rope)",m:"triceps",e:"Cable"},{n:"Cable Triceps Pushdown (Bar)",m:"triceps",e:"Cable"},
{n:"Goblet Squat",m:"quads",e:"Dumbbell"},{n:"Smith Machine Squat (Feet Forward)",m:"quads",e:"Smith Machine"},
{n:"Romanian Deadlift (Smith Machine)",m:"hamstrings",e:"Smith Machine"}
];
function muscleTagHTML(k){var m=muscleInfo(k);return '<span class="wl-mtag on" style="--mc:'+m.color+'"><span class="wl-mtag-bars">▎▎▎</span>'+m.label.toUpperCase()+'</span>';}
function exFormHTML(xf){
  var h='<div class="wl-card" style="border:1px solid var(--accent)"><div class="wl-card-head"><span>'+(xf.id?"Edit Exercise":"New Exercise")+'</span></div>';
  h+='<label class="wl-field wl-field-full"><span>Name</span><input class="wl-ex-input" data-xf="name" type="text" placeholder="e.g. Smith Machine Bench Press" value="'+esc(xf.name||"")+'"></label>';
  h+='<div class="wl-cf-label" style="margin-top:14px">Muscle Group</div><div class="wl-preset-list">'+MUSCLES.map(function(m){return '<button class="wl-mtag'+(xf.muscle===m[0]?" on":"")+'" data-act="ex:muscle" data-muscle="'+m[0]+'" style="--mc:'+m[2]+'">'+m[1]+'</button>';}).join("")+'</div>';
  var _xmv=xf.movement||guessMovement(xf.muscle);
  h+='<div class="wl-cf-label" style="margin-top:14px">Movement <em style="text-transform:none;letter-spacing:0">— info only, doesn\u2019t change targets</em></div><div class="wl-seg2"><button class="wl-seg2btn'+(_xmv==="compound"?" on":"")+'" data-act="ex:mv" data-mv="compound">Compound</button><button class="wl-seg2btn'+(_xmv==="isolation"?" on":"")+'" data-act="ex:mv" data-mv="isolation">Isolation</button></div>';
  h+='<label class="wl-field wl-field-full" style="margin-top:14px"><span>Equipment <em>optional</em></span><input class="wl-ex-input" data-xf="equipment" type="text" placeholder="e.g. Dumbbell, Cable, Smith Machine" value="'+esc(xf.equipment||"")+'"></label>';
  h+='<div style="margin-top:12px"><button class="wl-achip'+(xf.bodyweight?" on":"")+'" data-act="ex:bw">'+(xf.bodyweight?"✓ ":"")+'Bodyweight Exercise</button></div>';
  h+='<div class="wl-hint" style="margin-top:6px">Turn on for pull-ups, dips, etc. — sets will use your bodyweight (plus any added load) when logging.</div>';
  h+='<div class="wl-row" style="margin-top:14px"><button class="wl-btn wl-btn-primary wl-full" data-act="ex:save">'+(xf.id?"Save Changes":"Add Exercise")+'</button><button class="wl-btn wl-btn-ghost" data-act="ex:cancel">Cancel</button></div>';
  if(xf.id)h+='<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:10px;color:var(--bad);border-color:var(--bad)" data-act="ex:del" data-id="'+xf.id+'">'+I.trash.replace("<svg","<svg width=15 height=15")+'Delete Exercise</button>';
  return h+'</div>';
}
function view_exlib(){
  var xf=state.exForm;
  var h='<div class="wl-stack">';
  if(state.browseOpen){
    h+='<div class="wl-cal-head"><button class="wl-icon-btn" data-act="browse:close">‹</button><span class="wl-cal-title">Common Exercises</span><span style="width:36px;display:inline-block"></span></div>';
    h+='<div class="wl-hint" style="text-align:center;margin-bottom:4px">Tap to add to your library. Add what you use — you can edit or remove any of them afterward.</div>';
    h+='<button class="wl-btn wl-btn-ghost wl-full" style="margin-bottom:4px" data-act="ex:seedall">Add All of These</button>';
    MUSCLES.forEach(function(mm){var seeds=EXSEED.map(function(s,i){return {s:s,i:i};}).filter(function(x){return x.s.m===mm[0];});if(!seeds.length)return;
      h+='<div class="wl-card"><div style="margin-bottom:8px">'+muscleTagHTML(mm[0])+'</div><div class="wl-preset-list">';
      seeds.forEach(function(x){var added=(state.training.exercises||[]).some(function(e){return e.name.toLowerCase()===x.s.n.toLowerCase();});
        h+='<button class="wl-achip wl-seedchip'+(added?" on":"")+'" style="'+(added?'background:'+mm[2]+';border-color:'+mm[2]+';color:#fff':'border-color:'+mm[2]+';color:'+mm[2])+'" data-act="exseed:add" data-idx="'+x.i+'"><span class="wl-chip-ic">'+(added?"✓":"＋")+'</span>'+esc(x.s.n)+'</button>';});
      h+='</div></div>';});
    h+='<button class="wl-btn wl-btn-primary wl-full" data-act="browse:close">Done</button>';
    return h+'</div>';
  }
  h+='<div class="wl-cal-head"><button class="wl-icon-btn" data-act="go" data-view="'+(state.exlibFrom||"train")+'">‹</button><span class="wl-cal-title">Exercise Library</span><span style="width:36px;display:inline-block"></span></div>';
  var exs=state.training.exercises||[];
  if(!exs.length&&!xf)h+='<div class="wl-card"><div class="wl-hint">No exercises yet. Tap <b>Browse common exercises</b> to add popular ones fast, or <b>Add exercise</b> to enter your own.</div></div>';
  if(exs.length){MUSCLES.forEach(function(m){
    var items=exs.map(function(e,i){return {e:e,i:i};}).filter(function(x){return (x.e.muscle||"other")===m[0];}).sort(function(a,b){return (a.e.name||"").toLowerCase().localeCompare((b.e.name||"").toLowerCase());});
    if(!items.length)return;
    h+='<div class="wl-card"><div style="margin-bottom:8px">'+muscleTagHTML(m[0])+'</div>';
    items.forEach(function(x){var sub=[((x.e.movement||guessMovement(x.e.muscle))==="isolation")?"Isolation":"Compound"];if(x.e.equipment)sub.push(esc(x.e.equipment));if(x.e.bodyweight)sub.push("Bodyweight");
      h+='<div class="wl-exrow"><button class="wl-exrow-main" data-act="ex:edit" data-id="'+x.e.id+'"><span class="wl-exrow-name">'+esc(x.e.name)+'</span>'+(sub.length?'<span class="wl-exrow-sub">'+sub.join(" · ")+'</span>':'')+'</button><button class="wl-exrow-del" data-act="ex:del" data-id="'+x.e.id+'">'+I.trash.replace("<svg","<svg width=17 height=17")+'</button></div>';});
    h+='</div>';});}
  if(xf)h+=exFormHTML(xf);
  else{h+='<button class="wl-btn wl-btn-primary wl-full" data-act="ex:add">'+I.plus.replace("<svg","<svg width=16 height=16")+'Add Exercise</button>';
    h+='<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px" data-act="browse:open">Browse Common Exercises</button>';
    if(exs.length)h+='<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px;color:var(--bad);border-color:var(--bad)" data-act="ex:clearall">Clear All Exercises</button>';}
  return h+'</div>';
}
function exById(id){return (state.training.exercises||[]).filter(function(e){return e.id===id;})[0];}
function getRoutine(id){return (state.training.routines||[]).filter(function(r){return r.id===id;})[0];}
function rItem(rt,iid){return (rt.items||[]).filter(function(i){return i.id===iid;})[0];}
function noteEditorHTML(){var ne=state.noteEdit;
  var nm="";
  if(ne.woEi!=null&&state.workout&&state.workout.entries[ne.woEi])nm=state.workout.entries[ne.woEi].name||"";
  else{var _rt0=getRoutine(state.routineId);var _it0=_rt0&&rItem(_rt0,ne.iid);var _ex0=_it0&&exById(_it0.exerciseId);nm=(_ex0&&_ex0.name)||"";}
  var h='<div class="wl-note-editor">';
  h+='<div style="display:flex;justify-content:flex-end"><button class="wl-maxx" data-act="note:cancel">\u2715</button></div>';
  h+='<div class="wl-ne-title">Exercise Note</div>';
  if(nm)h+='<div class="wl-ne-sub">'+esc(nm)+'</div>';
  h+='<textarea class="wl-noteinput wl-ne-area" id="wl-noteinput" placeholder="Add a note\u2026">'+esc(ne.text||"")+'</textarea>';
  h+='<button class="wl-ne-pin" data-act="note:pin"><span class="wl-ne-check'+(ne.pinned?" on":"")+'">'+(ne.pinned?"\u2713":"")+'</span>Pin note to exercise</button>';
  h+='<div class="wl-ne-foot">'+(ne.nid?'<button class="wl-link" style="color:var(--bad)" data-act="note:del">Delete</button>':'<span></span>')+'<span class="wl-ne-actions"><button class="wl-link" data-act="note:cancel">Cancel</button><button class="wl-btn wl-btn-primary" style="padding:11px 24px" data-act="note:save">Save</button></span></div>';
  return h+'</div>';}
function routineNotesHTML(rt,it,ex){var h='';
  (ex.notes||[]).forEach(function(n){h+='<button class="wl-note" data-act="note:edit" data-iid="'+it.id+'" data-nid="'+n.id+'" data-pinned="1"><span class="wl-note-txt">'+esc(n.text)+'</span><span class="wl-note-pin">📌</span></button>';});
  (it.notes||[]).forEach(function(n){h+='<button class="wl-note" data-act="note:edit" data-iid="'+it.id+'" data-nid="'+n.id+'" data-pinned="0"><span class="wl-note-txt">'+esc(n.text)+'</span></button>';});
  if(state.noteEdit&&state.noteEdit.iid===it.id&&!state.noteEdit.forHeader)h+=noteEditorHTML();
  else h+='<button class="wl-note-add" data-act="note:add" data-iid="'+it.id+'">＋ note</button>';
  return h;}
function routineItemHTML(rt,it,idx){
  var ex=exById(it.exerciseId);if(!ex)return '<div class="wl-card"><div class="wl-hint">Missing exercise. <button class="wl-link" data-act="ri:remove" data-iid="'+it.id+'">Remove</button></div></div>';
  var u=state.settings.units;
  var h='<div class="wl-card wl-ritem">';
  h+='<div style="margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">'+muscleTagHTML(ex.muscle||"other")+'<span class="wl-ri-actions">'+(idx>0?'<button class="wl-icon-btn" data-act="ri:up" data-iid="'+it.id+'">'+I.up.replace("<svg","<svg width=17 height=17")+'</button>':'')+(idx<rt.items.length-1?'<button class="wl-icon-btn" data-act="ri:down" data-iid="'+it.id+'">'+I.down.replace("<svg","<svg width=17 height=17")+'</button>':'')+'<button class="wl-icon-btn" data-act="ri:remove" data-iid="'+it.id+'">'+I.trash.replace("<svg","<svg width=16 height=16")+'</button></span></div>';
  h+='<div class="wl-exrow-name">'+esc(ex.name)+'</div>'+((ex.equipment||ex.bodyweight)?'<div class="wl-exrow-sub" style="margin-bottom:8px">'+esc(ex.equipment||"")+(ex.bodyweight?(ex.equipment?" · ":"")+"Bodyweight":"")+'</div>':'<div style="height:6px"></div>');
  h+=routineNotesHTML(rt,it,ex);
  h+='<div class="wl-cf-label" style="margin:12px 0 6px">Progression '+infoBtn("progression")+'</div><div class="wl-seg2"><button class="wl-seg2btn'+(it.progression==="double"?" on":"")+'" data-act="ri:prog" data-iid="'+it.id+'" data-prog="double">Progressive Overload</button><button class="wl-seg2btn'+(it.progression==="rpt"?" on":"")+'" data-act="ri:prog" data-iid="'+it.id+'" data-prog="rpt">Reverse Pyramid</button></div>';
  if(!it.progression){h+='<div class="wl-hint" style="margin-top:8px;color:var(--accent)">Choose how this exercise progresses — required before saving.</div>';}
  else if(it.progression==="rpt"){
    var _n=Math.max(1,it.sets||3);var _mv=it.movement||guessMovement(ex.muscle);var _rgs=rptRangesFor(it,_n);
    if(!ex.bodyweight)h+='<label class="wl-field wl-field-full" style="margin-top:10px"><span>Top set weight ('+u+')</span><input class="wl-ri-input wl-num" data-iid="'+it.id+'" data-field="weight" type="text" inputmode="decimal" value="'+esc(it.weight!=null?it.weight:"")+'" placeholder="—"></label>';
    h+='<div class="wl-cf-label" style="margin:12px 0 2px">Reps per set '+infoBtn("reprange")+'</div>';
    for(var _si=0;_si<_n;_si++){h+='<div class="wl-setrng"><span class="wl-setrng-n">Set '+(_si+1)+'</span><input class="wl-ri-srng wl-num" data-iid="'+it.id+'" data-si="'+_si+'" data-end="lo" type="text" inputmode="numeric" value="'+_rgs[_si].lo+'"><span style="color:var(--faint)">–</span><input class="wl-ri-srng wl-num" data-iid="'+it.id+'" data-si="'+_si+'" data-end="hi" type="text" inputmode="numeric" value="'+_rgs[_si].hi+'"><span class="wl-setrng-tag">'+(_si===0?"heaviest":"−10%")+'</span></div>';}
  }else if(it.progression==="double"){
  h+='<div class="wl-row" style="margin-top:12px"><label class="wl-field"><span>Rep range '+infoBtn("reprange")+'</span><div style="display:flex;align-items:center;gap:6px"><input class="wl-ri-input wl-num" data-iid="'+it.id+'" data-field="repLow" type="text" inputmode="numeric" value="'+esc(it.repLow!=null?it.repLow:"")+'" placeholder="8" style="text-align:center"><span style="color:var(--faint)">–</span><input class="wl-ri-input wl-num" data-iid="'+it.id+'" data-field="repHigh" type="text" inputmode="numeric" value="'+esc(it.repHigh!=null?it.repHigh:"")+'" placeholder="12" style="text-align:center"></div></label>';
  h+='<label class="wl-field"><span>'+(ex.bodyweight?"Added wt <em>optional</em>":"Weight ("+u+")")+'</span><input class="wl-ri-input wl-num" data-iid="'+it.id+'" data-field="weight" type="text" inputmode="decimal" value="'+esc(it.weight!=null?it.weight:"")+'" placeholder="'+(ex.bodyweight?"0 = BW":"0")+'"></label></div>';
  }
  h+='<div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px"><span class="wl-cf-label" style="margin:0">Sets</span><div class="wl-stepper"><button data-act="ri:setdec" data-iid="'+it.id+'">−</button><span>'+(it.sets||0)+'</span><button data-act="ri:setinc" data-iid="'+it.id+'">+</button></div></div>';
  return h+'</div>';
}
function routinePickHTML(rt){
  var h='<div class="wl-stack">';
  h+='<div class="wl-cal-head"><button class="wl-icon-btn" data-act="ri:pickclose">‹</button><span class="wl-cal-title">Add Exercise</span><span style="width:36px;display:inline-block"></span></div>';
  var exs=state.training.exercises||[];
  if(!exs.length)h+='<div class="wl-card"><div class="wl-hint">Your library is empty. <button class="wl-link" data-act="go" data-view="exlib">Add exercises first</button>.</div></div>';
  MUSCLES.forEach(function(m){var items=exs.filter(function(e){return (e.muscle||"other")===m[0];}).sort(function(a,b){return (a.name||"").toLowerCase().localeCompare((b.name||"").toLowerCase());});
    if(!items.length)return;
    h+='<div class="wl-card"><div style="margin-bottom:8px">'+muscleTagHTML(m[0])+'</div>';
    items.forEach(function(e){var already=(rt.items||[]).some(function(i){return i.exerciseId===e.id;});
      h+='<div class="wl-exrow"><button class="wl-exrow-main" data-act="ri:pick" data-eid="'+e.id+'"><span class="wl-exrow-name">'+esc(e.name)+'</span>'+((e.equipment||e.bodyweight)?'<span class="wl-exrow-sub">'+esc(e.equipment||"")+(e.bodyweight?(e.equipment?" · ":"")+"Bodyweight":"")+'</span>':'')+'</button>'+(already?'<span class="wl-note-pin" style="font-size:13px;color:var(--good)">✓ added</span>':'<button class="wl-btn wl-btn-ghost" data-act="ri:pick" data-eid="'+e.id+'" style="padding:6px 12px">Add</button>')+'</div>';});
    h+='</div>';});
  h+='<div class="wl-hint" style="text-align:center;margin-top:2px">Not in the list? Add it to your library first.</div>';
h+='<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:6px" data-act="go" data-view="exlib">Exercise Library'+(exs.length?' <span class="wl-count">'+exs.length+'</span>':'')+'</button>';
h+='<button class="wl-btn wl-btn-primary wl-full" style="margin-top:8px" data-act="ri:pickclose">Done</button>';
  return h+'</div>';
}
function view_routine(){
  var rt=getRoutine(state.routineId);
  var h='<div class="wl-stack">';
  if(!rt){h+='<div class="wl-cal-head"><button class="wl-icon-btn" data-act="go" data-view="train">‹</button><span class="wl-cal-title">Routine</span></div><div class="wl-card"><div class="wl-hint">Routine not found.</div></div>';return h+'</div>';}
  if(state.riPickOpen)return routinePickHTML(rt);
  h+='<div class="wl-cal-head"><button class="wl-icon-btn" data-act="rt:save">‹</button><span class="wl-cal-title">Edit Routine</span><span style="width:36px;display:inline-block"></span></div>';
  h+='<div class="wl-card"><label class="wl-field wl-field-full"><span>Routine Name</span><input class="wl-rt-name" type="text" value="'+esc(rt.name||"")+'" placeholder="e.g. Day 1 – Push"></label></div>';
  if(!(rt.items||[]).length)h+='<div class="wl-card"><div class="wl-hint">No exercises yet. Add them from your library below — they\u2019ll group by muscle automatically.</div></div>';
  (rt.items||[]).forEach(function(it,idx){h+=routineItemHTML(rt,it,idx);});
  h+='<button class="wl-btn wl-btn-ghost wl-full" data-act="ri:add">'+I.plus.replace("<svg","<svg width=16 height=16")+'Add Exercise</button>';
  h+='<button class="wl-btn wl-btn-primary wl-full" style="margin-top:8px" data-act="rt:save">'+I.check.replace("<svg","<svg width=16 height=16")+'Save Routine</button>';
  h+='<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px;color:var(--bad);border-color:var(--bad)" data-act="rt:del" data-id="'+rt.id+'">Delete Routine</button>';
  return h+'</div>';
}
function routinePreviewHTML(rt){var h='';
  (rt.items||[]).forEach(function(it){var ex=exById(it.exerciseId);if(!ex)return;
    var rng=(it.repLow||it.repHigh)?((it.repLow||"?")+"–"+(it.repHigh||"?")):"";
    var _prog=it.progression||rt.progression||"double";
    var _scheme;
    var _setn=function(n){return n+(n===1?" set":" sets");};
    if(_prog==="rpt"){var _pn=Math.max(1,it.sets||3);_scheme=_setn(_pn)+" · "+rptRangesFor(it,_pn).map(function(r){return r.lo+"–"+r.hi;}).join(" / ")+" reps";}
    else _scheme=_setn(it.sets||0)+(rng?" · "+rng+" reps":"");
    var wt=ex.bodyweight?("BW"+(num(it.weight)?" +"+it.weight:"")):(num(it.weight)!=null?it.weight+" "+state.settings.units:"");
    var _mi=muscleInfo(ex.muscle);
    h+='<div class="wl-exrow wl-prow"><div class="wl-prow-in">'+
       '<div class="wl-prow-top"><span class="wl-mtag on wl-prow-mtag" style="--mc:'+_mi.color+';background:'+_mi.color+';border-color:'+_mi.color+'">'+_mi.label.toUpperCase()+'</span><span class="wl-exrow-name wl-prow-name">'+esc(ex.name)+'</span></div>'+
       '<div class="wl-prow-bot"><span class="wl-progtag'+(_prog==="rpt"?" rpt":"")+'">'+(_prog==="rpt"?"RPT":"PO")+'</span><span class="wl-exrow-sub">'+_scheme+(wt?' · '+wt:'')+'</span></div>'+
       '</div></div>';});
  return h;}
function view_rlaunch(){
  var rt=getRoutine(state.routineId);var h='<div class="wl-stack">';
  if(!rt){h+='<div class="wl-cal-head"><button class="wl-icon-btn" data-act="go" data-view="train">‹</button><span class="wl-cal-title">Routine</span></div>';return h+'</div>';}
  h+='<div class="wl-card">'+(rt.items&&rt.items.length?routinePreviewHTML(rt):'<div class="wl-hint">No exercises in this routine yet.</div>')+'</div>';
  if(rt.items&&rt.items.length)h+='<button class="wl-btn wl-btn-primary wl-full" data-act="wo:start" data-id="'+rt.id+'">▶ Start Workout</button>';
  h+='<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px" data-act="wo:quick" data-id="'+rt.id+'">Quick Log <em style="color:var(--faint);font-style:normal">— just the summary</em></button>';
  h+='<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px" data-act="rt:openedit" data-id="'+rt.id+'">Edit Routine</button>';
h+='<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px;color:var(--bad);border-color:var(--bad)" data-act="rt:del" data-id="'+rt.id+'">Delete Routine</button>';
  h+='<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px" data-act="go" data-view="train">Cancel</button>';
  return h+'</div>';
}
function liftFormHTML(lf){
  var h='<div class="wl-card"><div class="wl-card-head"><span>Quick log</span></div><div class="wl-hint" style="margin-bottom:12px">Log the session summary without per-set detail. Feeds your weekly training goals and the AI coach.</div>';
  h+='<div class="wl-row"><label class="wl-field"><span>Duration <em>min</em></span><input class="wl-lf-input wl-num" data-lf="mins" type="text" inputmode="numeric" placeholder="—" value="'+(lf.mins!=null?esc(String(lf.mins)):"")+'"></label><label class="wl-field"><span>Avg HR <em>bpm, optional</em></span><input class="wl-lf-input wl-num" data-lf="hr" type="text" inputmode="numeric" placeholder="—" value="'+(lf.hr!=null?esc(String(lf.hr)):"")+'"></label></div>';
  h+='<div class="wl-row" style="margin-top:12px"><label class="wl-field"><span>Peak HR <em>bpm, optional</em></span><input class="wl-lf-input wl-num" data-lf="hrMax" type="text" inputmode="numeric" placeholder="—" value="'+(lf.hrMax!=null?esc(String(lf.hrMax)):"")+'"></label><label class="wl-field"><span>Est. calories <em>optional</em></span><input class="wl-lf-input wl-num" data-lf="cal" type="text" inputmode="numeric" placeholder="—" value="'+(lf.cal!=null?esc(String(lf.cal)):"")+'"></label></div>';
  h+='<div class="wl-row" style="margin-top:12px"><label class="wl-field"><span>RPE <em>1-10, optional</em></span><input class="wl-lf-input wl-num" data-lf="rpe" type="text" inputmode="numeric" placeholder="—" value="'+(lf.rpe!=null?esc(String(lf.rpe)):"")+'"></label><label class="wl-field" style="visibility:hidden"><span>.</span><input></label></div>';
  h+='<div id="wl-zonearea" style="margin-top:12px">'+zoneAreaHTML(lf,"lf")+'</div>';
  h+='<label class="wl-field wl-field-full" style="margin-top:12px"><span>Notes <em>optional</em></span><textarea class="wl-lf-input" data-lf="notes" style="width:100%;min-height:60px;background:var(--bg2);border:1px solid var(--line);border-radius:10px;color:var(--text);font-family:var(--sans);font-size:14px;padding:11px 12px;box-sizing:border-box;outline:none;resize:vertical">'+esc(lf.notes||"")+'</textarea></label>';
  h+='<button class="wl-btn wl-btn-primary wl-full" style="margin-top:14px" data-act="lift:save">Log workout</button><button class="wl-btn wl-btn-ghost wl-full" style="margin-top:10px" data-act="lift:cancel">Cancel</button>';
  return h+'</div>';
}
/* ---- exercise feedback (joint pain per exercise; soreness/pump/volume per muscle) ---- */
var FB_JOINT=[["none","None"],["low","Low pain"],["mod","Moderate pain"],["alot","A lot of pain"]];
var FB_SORE=[["never","Never got sore"],["early","Healed a while ago"],["ontime","Healed just on time"],["still","I\u2019m still sore!"]];
var FB_PUMP=[["low","Low pump"],["mod","Moderate pump"],["amazing","Amazing pump"]];
var FB_VOL=[["low","Not enough"],["right","Just right"],["limit","Pushed my limits"],["much","Too much"]];
function fbLabel(scale,v){var out="";scale.forEach(function(o){if(o[0]===v)out=o[1];});return out;}
/* Which muscles still have unfinished work? Used to decide whether this exercise
   is the last one for its muscle, i.e. the moment to ask the muscle questions. */
function fbMuscleDone(w,muscle,exceptEi){
  var done=true;
  (w.entries||[]).forEach(function(en,i){
    if(i===exceptEi||(en.muscle||"other")!==muscle)return;
    if((en.sets||[]).some(function(s){return s.status!=="done"&&s.status!=="skipped";}))done=false;});
  return done;}
/* Show a muscle-level note once per muscle, on its first exercise in the session. */
function _fbFirstOfMuscle(w,ei){
  var mus=(w.entries[ei]||{}).muscle||"other";
  for(var i=0;i<ei;i++){if(((w.entries[i]||{}).muscle||"other")===mus)return false;}
  return true;}
/* Every question currently on the sheet has an answer. */
/* Which questions a given sheet shows. kind "sore" is the early, one-question
   prompt; kind "end" is joint pain plus the day's verdicts. */
function fbNeeds(){
  var fs_=state.fbSheet;var w=state.workout;
  if(!fs_||!w)return null;
  var en=w.entries[fs_.ei];if(!en)return null;
  var mus=en.muscle||"other";
  var m=(w.mfb||{})[mus]||{};
  if(fs_.kind==="sore")return {muscle:mus,joint:false,sore:true,pump:false,vol:false};
  return {muscle:mus,joint:true,sore:!m.sore&&fs_.askMuscle,pump:!!fs_.askMuscle,vol:!!fs_.askMuscle};}
function fbAnswered(){
  var fs_=state.fbSheet;var w=state.workout;if(!fs_||!w)return false;
  var en=w.entries[fs_.ei];if(!en)return false;
  var need=fbNeeds();if(!need)return false;
  var m=(w.mfb||{})[need.muscle]||{};
  if(need.joint&&!(en.fb&&en.fb.joint))return false;
  if(need.sore&&!m.sore)return false;
  if(need.pump&&!m.pump)return false;
  if(need.vol&&!m.vol)return false;
  return true;}
/* Trained, not merely finished: a set has to have been logged for feedback to mean
   anything, so an all-skipped exercise never asks. */
function fbEntryTrained(en){return (en.sets||[]).some(function(s){return s.status==="done";});}
/* "warmup" counts as resolved for completeness, like "skipped" */
function fbEntryComplete(en){return (en.sets||[]).length>0&&(en.sets||[]).every(function(s){return s.status==="done"||s.status==="skipped"||s.status==="warmup";});}
/* Most recent logged feedback for an exercise / muscle, newest session first. */
function fbLastFor(exId){
  var ls=state.training.liftSessions||{};var ds=Object.keys(ls).sort().reverse();
  for(var i=0;i<ds.length;i++){var arr=ls[ds[i]]||[];
    for(var j=arr.length-1;j>=0;j--){var s=arr[j];if(!s||!s.entries)continue;
      for(var k=0;k<s.entries.length;k++){var e=s.entries[k];
        if(e.exerciseId===exId&&e.fb&&e.fb.joint)return {date:ds[i],joint:e.fb.joint};}}}
  return null;}
function fbLastMuscle(muscle){
  var ls=state.training.liftSessions||{};var ds=Object.keys(ls).sort().reverse();
  for(var i=0;i<ds.length;i++){var arr=ls[ds[i]]||[];
    for(var j=arr.length-1;j>=0;j--){var s=arr[j];
      if(s&&s.mfb&&s.mfb[muscle])return Object.assign({date:ds[i]},s.mfb[muscle]);}}
  return null;}
function fbOptsHTML(kind,scale,cur,muscle){
  var h='<div class="wl-fbopts">';
  scale.forEach(function(o){
    h+='<button class="wl-fbopt'+(cur===o[0]?" on":"")+'" data-act="fb:set" data-kind="'+kind+'" data-val="'+o[0]+'"'+(muscle?' data-muscle="'+muscle+'"':'')+'>'+esc(o[1])+'</button>';});
  return h+'</div>';}
function warmupAskHTML(){
  var a=state.warmupAsk;if(!a)return "";
  var w=state.workout;if(!w)return "";
  var en=w.entries[a.ei];if(!en)return "";
  var c=warmupCandidate(en,a.si);if(!c)return "";
  var sw=warmupSuggestWeight(en,a.si);
  var u=state.settings.units;
  var h='<div class="wl-confirm"><div class="wl-confirm-card wl-fbcard">';
  h+='<div class="wl-fbtitle">That looked like a warm-up</div>';
  h+='<div class="wl-wusub">You did <b>'+c.reps+' reps at '+esc(en.sets[a.si].weight)+' '+u+'</b> with <b>'+c.rir+' left in reserve</b>, against a target of '+c.lo+'\u2013'+c.hi+'. That is a lot lighter than a working set.</div>';
  h+='<div class="wl-wusub" style="margin-top:10px">'+(sw!=null?'Mark it as a warm-up and go again at the weight below \u2014 or override and count it as a real set.':'Mark it as a warm-up and go again heavier \u2014 or override and count it as a real set.')+'</div>';
  if(sw!=null)h+='<div class="wl-wusug">Suggested working weight <b>'+sw+' '+u+'</b></div>';
  h+='<div class="wl-fbbtns"><button class="wl-btn wl-btn-ghost" data-act="wu:no">No, it counts</button><button class="wl-btn wl-btn-primary" data-act="wu:yes">Warm-up</button></div>';
  return h+'</div></div>';}
function fbSheetHTML(){
  var fs_=state.fbSheet;if(!fs_)return "";
  var w=state.workout;if(!w)return "";
  var en=w.entries[fs_.ei];if(!en)return "";
  var need=fbNeeds();if(!need)return "";
  var muscle=need.muscle;
  var mlab=muscleInfo(muscle).label;
  var m=(w.mfb||{})[muscle]||{};
  var first=true;
  var h='<div class="wl-confirm"><div class="wl-confirm-card wl-fbcard">';
  h+='<div class="wl-fbtitle">Feedback</div>';
  if(need.joint){
    h+='<div class="wl-fbq">Joint pain '+infoBtn("fbjoint")+'</div>';
    h+='<div class="wl-fbsub">How did your joints feel during '+esc(en.name)+'?</div>';
    h+=fbOptsHTML("joint",FB_JOINT,(en.fb||{}).joint);first=false;}
  if(need.sore){
    h+='<div class="wl-fbq"'+(first?'':' style="margin-top:16px"')+'>'+esc(mlab)+' soreness '+infoBtn("fbsore")+'</div>';
    h+='<div class="wl-fbsub">How sore did you get in your '+esc(mlab.toLowerCase())+' AFTER training them LAST TIME?</div>';
    h+=fbOptsHTML("sore",FB_SORE,m.sore,muscle);first=false;}
  if(need.pump){
    h+='<div class="wl-fbq"'+(first?'':' style="margin-top:16px"')+'>'+esc(mlab)+' pump '+infoBtn("fbpump")+'</div>';
    h+='<div class="wl-fbsub">How much of a pump did you get today?</div>';
    h+=fbOptsHTML("pump",FB_PUMP,m.pump,muscle);first=false;}
  if(need.vol){
    h+='<div class="wl-fbq"'+(first?'':' style="margin-top:16px"')+'>'+esc(mlab)+' volume '+infoBtn("fbvol")+'</div>';
    h+='<div class="wl-fbsub">How was the amount of work (number of hard sets)?</div>';
    h+=fbOptsHTML("vol",FB_VOL,m.vol,muscle);}
  var _ok=fbAnswered();
  h+='<div class="wl-fbreq">'+(_ok?"Thanks \u2014 this shapes what I show you next session.":"Answer every question to continue.")+'</div>';
  h+='<div class="wl-fbbtns"><button class="wl-btn wl-btn-primary wl-full'+(_ok?"":" off")+'" data-act="fb:done">Done</button></div>';
  return h+'</div></div>';}
/* ---- live workout ---- */
var WOKEY="wl_workout_v1";
function saveWorkout(){if(localWritesFrozen())return;try{if(state.workout)localStorage.setItem(WOKEY,JSON.stringify(state.workout));else localStorage.removeItem(WOKEY);}catch(e){}}
function loadWorkout(){try{var w=JSON.parse(localStorage.getItem(WOKEY));if(w&&w.entries)state.workout=w;}catch(e){}}
function currentBW(){if(state.weights&&state.weights.length){var s=state.weights.slice().sort(function(a,b){return a.date<b.date?1:-1;});return s[0].weight;}return num(state.settings.startingWeight);}
function lastFullSetsFor(exId){var ls=state.training.liftSessions||{};var dates=Object.keys(ls).sort().reverse();
  for(var i=0;i<dates.length;i++){var arr=ls[dates[i]]||[];for(var j=arr.length-1;j>=0;j--){var s=arr[j];if(s.mode==="full"&&s.entries){var e=s.entries.filter(function(x){return x.exerciseId===exId;})[0];if(e&&e.sets&&e.sets.length)return e.sets;}}}
  return null;}
function buildWorkoutEntries(rt,bw){return (rt.items||[]).map(function(it){var ex=exById(it.exerciseId);if(!ex)return null;
  var last=lastFullSetsFor(it.exerciseId);var n=Math.max(1,it.sets||3);var sets=[];
  for(var k=0;k<n;k++){var w,r;
    if(last&&last[k]){w=last[k].weight;r=last[k].reps;}
    else if(last&&last.length){w=last[last.length-1].weight;r=last[last.length-1].reps;}
    else{w=ex.bodyweight?((bw!=null?bw:0)+(num(it.weight)||0)):(num(it.weight)>0?it.weight:"");r=(it.repHigh!=null&&it.repHigh!=="")?it.repHigh:"";}
    /* A bodyweight exercise's "weight" is the athlete, and the athlete changed
       since last session. History used to pre-fill the OLD bodyweight (a 7-29
       pull-up suggested 186.8 against a same-day 184.0 weigh-in). Reps still
       come from history; the load is always today's body plus any added. */
    if(ex.bodyweight)w=(bw!=null?bw:0)+(num(it.weight)||0);
    sets.push({weight:(w===""||w==null)?"":String(w),reps:(r===""||r==null)?"":String(r),rir:"",status:"pending"});}
  /* Copies must keep the SOURCE note id: the workout view's tap handler looks
     the note up by id in the exercise/item store, and an id-less copy resolved
     to nothing -- a blank editor over a note that exists. */
  var notes=[];(ex.notes||[]).forEach(function(nn){notes.push({id:nn.id,text:nn.text,pinned:true});});(it.notes||[]).forEach(function(nn){notes.push({id:nn.id,text:nn.text,pinned:false});});
  var _lf=fbLastFor(it.exerciseId);
    var _lm=fbLastMuscle(ex.muscle||"other");
    return {itemId:it.id,progression:it.progression||rt.progression||"double",lastJoint:(_lf&&(_lf.joint==="mod"||_lf.joint==="alot"))?_lf:null,lastMus:_lm,exerciseId:it.exerciseId,name:ex.name,muscle:ex.muscle,equipment:ex.equipment,bodyweight:!!ex.bodyweight,repLow:it.repLow,repHigh:it.repHigh,movement:it.movement||guessMovement(ex.muscle),setRanges:rptRangesFor(it,n),addedWt:num(it.weight)||0,notes:notes,sets:sets};
}).filter(Boolean);}
function rebuildEntryNotes(ei){var w=state.workout;if(!w)return;var en=w.entries[ei];if(!en)return;var rt=getRoutine(w.routineId);var it=rt&&rItem(rt,en.itemId);var ex=exById(en.exerciseId);var notes=[];if(ex)(ex.notes||[]).forEach(function(n){notes.push({id:n.id,text:n.text,pinned:true});});if(it)(it.notes||[]).forEach(function(n){notes.push({id:n.id,text:n.text,pinned:false});});en.notes=notes;saveWorkout();}
function sugInvertReps(E,w){E=num(E);w=num(w);if(E==null||w==null||w<=0)return null;var r=Math.round(30*(E/w-1));if(r<1)r=1;if(r>30)r=30;return r;}
/* PO weight-edit prediction from the REAL reference set (w0,r0) — the same
   two-regime capacity model as RPT: Epley inside its heavy domain, load-ratio
   above ~10 reps. This is what turns 'bumped 15→20 lb' into ~11 instead of
   Epley's 4 (Owner, 2026-08-05). Falls back to the e1RM inversion when no
   reference set is known. */
function sugPredictAt(w0,r0,wNew){
  w0=num(w0);r0=num(r0);wNew=num(wNew);
  if(w0==null||r0==null||wNew==null||w0<=0||r0<=0||wNew<=0)return null;
  var r=Math.round(rptCapAt(w0,r0,wNew));
  if(r<1)r=1;if(r>30)r=30;return r;}
/* ---- Reverse Pyramid (RPT) progression helpers ---- */
function rptInc(){return state.settings.units==="kg"?2.5:5;}
function rptRound(w){var i=rptInc();return Math.round(num(w)/i)*i;}
function guessMovement(muscle){return (muscle==="biceps"||muscle==="triceps")?"isolation":"compound";}
function rptDefRanges(movement,n){var out=[];n=Math.max(1,n|0);
  if(movement==="isolation"){for(var i=0;i<n;i++)out.push({lo:6+2*i,hi:8+2*i});}
  else{for(var i=0;i<n;i++)out.push({lo:6+2*i,hi:8+2*i});}
  return out;}
function rptRangesFor(it,n){n=Math.max(1,n|0);var def=rptDefRanges((it&&it.movement)||"compound",n);
  var sr=it&&it.setRanges;if(Array.isArray(sr)){for(var i=0;i<n;i++){if(sr[i]){var lo=num(sr[i].lo),hi=num(sr[i].hi);if(lo!=null)def[i].lo=lo;if(hi!=null)def[i].hi=hi;}}}
  return def;}
/* How many reps of capacity this lifter loses from one set to the next, learned
   from their own consecutive sets. Each pair contributes one estimate: predict the
   second set's capacity from the first via Epley, then see how far short it fell.
   Newest sessions first, capped at 6 samples so it tracks current conditioning.
   Default 3 — Griffin's measured average across six exercises before any RPT data
   existed. */
/* Rep capacity at weight wb, given tfa total reps done at wa. Epley's linear
   1RM model is calibrated for heavy sets — ABOVE ~10 total reps it collapses
   ('15 reps at 15 lb → try 4 at 20', Owner, 2026-08-05: est. 1RM 22.5 makes
   20 lb read as 89% of max, which is nonsense for light isolation work).
   Inside its domain Epley stands untouched; beyond it, reps scale by load
   ratio — conservative, matches observed high-rep behavior, and degrades
   gracefully instead of absurdly. */
function rptCapAt(wa,tfa,wb){
  if(tfa<=10){var E=wa*(1+tfa/30);return 30*(E/wb-1);}
  return tfa*wa/wb;}
var FB_FATIGUE_DEFAULT=3;
function rptFatigueFor(exId){
  var ls=state.training.liftSessions||{};var ds=Object.keys(ls).sort().reverse();
  var vals=[];
  for(var i=0;i<ds.length&&vals.length<6;i++){
    var arr=ls[ds[i]]||[];
    for(var j=arr.length-1;j>=0&&vals.length<6;j--){
      var s=arr[j];if(!s||!s.entries)continue;
      for(var k=0;k<s.entries.length&&vals.length<6;k++){
        var e=s.entries[k];if(e.exerciseId!==exId)continue;
        var done=(e.sets||[]).filter(function(d){return d.status==="done"&&num(d.reps)!=null;});
        for(var p=0;p+1<done.length&&vals.length<6;p++){
          var a=done[p],b=done[p+1];
          var wa=num(a.weight),wb=num(b.weight);
          var tfa=num(a.reps)+(num(a.rir)||0),tfb=num(b.reps)+(num(b.rir)||0);
          if(wa==null||wb==null||wa<=0||wb<=0||!(tfa>0))continue;
          var cap=rptCapAt(wa,tfa,wb);
          var drop=cap-tfb;
          if(isFinite(drop)&&drop>-4&&drop<14)vals.push(drop);}}}}
  if(!vals.length)return FB_FATIGUE_DEFAULT;
  var sum=0;vals.forEach(function(v){sum+=v;});
  var avg=sum/vals.length;
  if(avg<0)avg=0;if(avg>8)avg=8;
  return Math.round(avg*2)/2;}
/* Predict reps for the set after si, from what was actually just done. */
function rptPredictReps(en,si){
  var a=en.sets[si],b=en.sets[si+1];
  if(!a||!b)return null;
  var wa=num(a.weight),wb=num(b.weight),ra=num(a.reps),ia=num(a.rir);
  if(wa==null||wb==null||wa<=0||wb<=0||ra==null||ra<=0)return null;
  var tfa=ra+(ia||0);
  var cap=rptCapAt(wa,tfa,wb);
  var tgt=Math.round(cap-rptFatigueFor(en.exerciseId)-(ia||0));
  if(!isFinite(tgt))return null;
  if(tgt<1)tgt=1;if(tgt>40)tgt=40;
  return tgt;}
/* After a set is logged, give the next one a target based on it. The prediction
   takes over from the configured rep range (Griffin's call), and a rep count he
   has already typed himself is never overwritten. */
function rptRetarget(en,si){
  /* Owner rulings 2026-08-05: RPT honors its ladder — the prediction never
     overrides targets or pre-fills reps (his set 2 collapsed to '7' instead
     of the 8–10 he holds the ladder to). It survives as a HINT ('8–10 · ~9')
     beside the range, which he asked to keep. */
  if(!en||(en.progression||"double")!=="rpt")return;
  var nx=en.sets[si+1];
  if(!nx||nx.status==="done"||nx.status==="skipped")return;
  nx.predR=rptPredictReps(en,si);}
/* Bring an in-progress workout's targets up to date — used after a reload, since
   applying an app update mid-session drops you back here with sets already logged. */
/* The next exercise with unfinished sets, in the order they appear. Returns null
   when it is the same exercise you are resting inside, or when nothing is left. */
function woUpNext(){
  var w=state.workout;if(!w||!w.entries)return null;
  for(var i=0;i<w.entries.length;i++){
    var en=w.entries[i];var sets=en.sets||[];
    for(var si=0;si<sets.length;si++){
      var st=sets[si];
      if(st.status==="done"||st.status==="skipped")continue;
      var reps="";
      if((en.progression||"double")==="rpt"){
        var rgs=(en.setRanges&&en.setRanges.length)?en.setRanges:rptDefRanges(en.movement||"compound",sets.length);
        var rg=rgs[si]||rgs[rgs.length-1];
        if(rg&&(rg.lo!=null||rg.hi!=null))reps=(rg.lo!=null?rg.lo:"?")+"\u2013"+(rg.hi!=null?rg.hi:"?");
      }else if((en.repLow!=null&&en.repLow!=="")||(en.repHigh!=null&&en.repHigh!=="")){
        reps=(en.repLow!=null&&en.repLow!==""?en.repLow:"?")+"\u2013"+(en.repHigh!=null&&en.repHigh!==""?en.repHigh:"?");
      }else if(st.reps!==""&&st.reps!=null){reps=String(st.reps);}
      return {name:en.name||"",setNo:si+1,setTotal:sets.length,reps:reps,weight:(st.weight!==""&&st.weight!=null)?String(st.weight):""};
    }}
  return null;}
/* Reps needed to call a set a warm-up: RIR >= 2 and >= 5 reps past the range top. */
var WARMUP_RIR_MIN=2,WARMUP_OVER=5;
function warmupCandidate(en,si){
  if(!en||(en.progression||"double")!=="rpt")return null;
  var st=en.sets[si];if(!st||st.status!=="done")return null;
  var r=num(st.reps),i=num(st.rir);
  if(r==null||i==null||i<WARMUP_RIR_MIN)return null;
  var rgs=(en.setRanges&&en.setRanges.length)?en.setRanges:rptDefRanges(en.movement||"compound",en.sets.length);
  var rg=rgs[si]||rgs[rgs.length-1];if(!rg)return null;
  var top=num(rg.hi);if(top==null)return null;
  if(r<top+WARMUP_OVER)return null;
  return {reps:r,rir:i,lo:num(rg.lo),hi:top};}
/* The weight that WOULD have put this set inside its range at ~1 RIR, from the
   warm-up's own numbers. Rounded to the bar's increment. */
function warmupSuggestWeight(en,si){
  var st=en.sets[si];var w=num(st.weight),r=num(st.reps),i=num(st.rir);
  if(w==null||w<=0||r==null)return null;
  var rgs=(en.setRanges&&en.setRanges.length)?en.setRanges:rptDefRanges(en.movement||"compound",en.sets.length);
  var rg=rgs[si]||{lo:6,hi:8};
  var aim=Math.round(((num(rg.lo)||6)+(num(rg.hi)||8))/2);
  var E=w*(1+(r+(i||0))/30);
  var nw=rptRound(E/(1+(aim+1)/30));
  if(!isFinite(nw)||nw<=0)return null;
  return nw;}
function markWarmup(ei,si){
  var w=state.workout;if(!w)return;var en=w.entries[ei];if(!en)return;
  var st=en.sets[si];if(!st)return;
  st.status="warmup";st.tgtLo=null;st.tgtHi=null;
  /* keep the planned working sets intact — session only, never persisted */
  var fresh={weight:"",reps:"",rir:"",status:"pending"};
  var sw=warmupSuggestWeight(en,si);
  var nx=en.sets[si+1];
  if(nx&&nx.status!=="done"&&nx.status!=="skipped"){
    if(sw!=null){nx.weight=String(sw);nx.repsTouched=false;}
    nx.reps="";nx.tgtLo=null;nx.tgtHi=null;
    en.sets.splice(en.sets.length,0,fresh);
  }else{
    if(sw!=null)fresh.weight=String(sw);
    en.sets.splice(si+1,0,fresh);}
  /* show the rest of the pyramid off the suggested weight right away; logging the
     real top set recomputes it from what actually happened */
  if(sw!=null){var prev=sw;
    for(var q=si+2;q<en.sets.length;q++){var qs=en.sets[q];
      if(qs.status==="done"||qs.status==="skipped"||qs.status==="warmup")continue;
      prev=rptRound(prev*0.9);qs.weight=String(prev);qs.reps="";qs.tgtLo=null;qs.tgtHi=null;}}
  state.warmupAsk=null;saveWorkout();
  toast(sw!=null?("Marked as warm-up \u2014 try "+sw+" "+state.settings.units):"Marked as warm-up");
  render();}
function rptRetargetAll(){
  var w=state.workout;if(!w||!w.entries)return;
  w.entries.forEach(function(en){
    if((en.progression||"double")!=="rpt")return;
    for(var i=0;i+1<(en.sets||[]).length;i++){
      if(en.sets[i].status!=="done")continue;
      var nx=en.sets[i+1];
      if(nx.status==="done"||nx.status==="skipped")continue;
      if(num(nx.tgtLo)!=null&&num(nx.tgtLo)===num(nx.tgtHi))continue; /* already predicted */
      rptRetarget(en,i);}});}
/* Recompute back-off weights after Set 1 is logged (RPT): bump with Set 1, or hold last week's on a compound jump where Set 1 fell below its range bottom. */
/* The first set that actually counts — warm-ups sit in front of it. */
function rptTopIndex(en){
  var s=(en&&en.sets)||[];
  for(var i=0;i<s.length;i++){if(s[i].status!=="warmup")return i;}
  return 0;}
function rptAfterSet1(en){
  if(!en||en.bodyweight)return;var w=state.workout;if(!w)return;
  var rt=getRoutine(w.routineId);if(!rt)return;if((en.progression||rt.progression||"double")!=="rpt")return;
  var n=en.sets.length;var t=rptTopIndex(en);if(n-t<2)return;
  var ranges=(en.setRanges&&en.setRanges.length)?en.setRanges:rptRangesFor(rItem(rt,en.itemId),n);
  var s1w=num(en.sets[t].weight),s1r=num(en.sets[t].reps);if(s1w==null)return;
  var last=sugLastEntry(en.exerciseId,w.routineId);
  var lastDone=last?(last.sets||[]).filter(function(d){return d.status==="done"&&num(d.reps)!=null;}):[];
  var lastS1W=lastDone.length?num(lastDone[0].weight):null;
  var lastBackoff=lastDone.slice(1).map(function(d){return num(d.weight);});
  var jumped=lastS1W!=null&&s1w>lastS1W;
  var below=s1r!=null&&s1r<((ranges[0]&&ranges[0].lo)||6);
  var hold=jumped&&below&&lastBackoff.length>=(n-t-1);
  for(var i=t+1;i<n;i++){var st=en.sets[i];if(st.status==="done"||st.status==="skipped"||st.status==="warmup")continue;
    var nw=hold?lastBackoff[i-t-1]:rptRound((i===t+1?s1w:num(en.sets[i-1].weight))*0.9);
    if(nw!=null&&isFinite(nw))st.weight=String(nw);}
  saveWorkout();}
/* Mid-workout progression switch — PERMANENT (the workout is also an editor).
   Completed sets never change. Remaining sets re-target from the agreed seed rule:
   the last completed set is the reference — to RPT it becomes the top set and
   back-offs chain at −10% from it; to PO remaining sets hold its weight at the
   exercise's rep range. With nothing completed yet, the first pending set keeps its
   suggested weight as the anchor. */
function switchEntryProgression(ei){var w=state.workout;if(!w)return;var en=w.entries[ei];if(!en)return;
  var to=(en.progression==="rpt")?"double":"rpt";
  en.progression=to;
  var rt=getRoutine(w.routineId);var it=rt&&rItem(rt,en.itemId);
  if(it){it.progression=to;saveTraining();}
  var n=en.sets.length;
  var lastDone=-1;for(var i=0;i<n;i++){if(en.sets[i].status==="done")lastDone=i;}
  var refW=lastDone>=0?num(en.sets[lastDone].weight):null;
  if(to==="rpt"){
    en.movement=en.movement||guessMovement(en.muscle);
    if(!en.setRanges||!en.setRanges.length)en.setRanges=rptDefRanges(en.movement,n);
    var chain=refW;
    for(var j=lastDone+1;j<n;j++){var st=en.sets[j];if(st.status==="skipped")continue;
      var rg=en.setRanges[j]||en.setRanges[en.setRanges.length-1]||{lo:6,hi:8};
      st.tgtLo=rg.lo;st.tgtHi=rg.hi;
      if(!en.bodyweight){
        if(chain==null){chain=num(st.weight);}
        else{chain=rptRound(chain*0.9);if(chain!=null&&isFinite(chain))st.weight=String(chain);}
      }}
  }else{
    var lo=num(en.repLow);if(lo==null)lo=8;var hi=num(en.repHigh);if(hi==null)hi=12;
    var wgt=refW;
    for(var k=lastDone+1;k<n;k++){var st2=en.sets[k];if(st2.status==="skipped")continue;
      st2.tgtLo=lo;st2.tgtHi=hi;
      if(!en.bodyweight){if(wgt==null)wgt=num(st2.weight);else st2.weight=String(wgt);}}
  }
  state.exMenu=null;saveWorkout();
  toast(to==="rpt"?"Now Reverse Pyramid — heaviest set first, −10% each set":"Now Progressive Overload — same weight across sets");
  render();}
/* One-time: stamp the old routine-level type onto each exercise, then drop it. */
/* Z1 (round-33 item 6): the in-memory normalisation ALWAYS runs — the rest of
   the app reads the current shape and a read-only device must still display
   correctly. PERSISTING it is a different thing: writing wl_training_v1 puts
   bytes on the device, and under STRICT single-writer a device without the pen
   performs ZERO durable content writes. Calling this "pure local normalisation"
   (and therefore substrate) was wrong: substrate is the journal/queue machinery
   recovery is built from, not the athlete's training store. The migration is
   idempotent, so it simply re-runs and persists once the pen is held — boot
   calls it again after m10Boot() settles the lease.

   `migrationPersistOwed` is why that second call is not a no-op: the FIRST
   call already normalised the in-memory copy, so a naive re-run would compute
   ch=false and never write the disk at all. The debt is remembered until a
   write actually succeeds. */
var migrationPersistOwed=false;
function migrateProgressionTypes(){var ch=false;
  (state.training.exercises||[]).forEach(function(ex){if(!ex.movement){ex.movement=guessMovement(ex.muscle);ch=true;}});
  (state.training.routines||[]).forEach(function(rt){var m=rt.progression;
    (rt.items||[]).forEach(function(it){if(!it.progression){it.progression=m||"double";ch=true;}});
    if(m!==undefined){delete rt.progression;ch=true;}});
  if(ch)migrationPersistOwed=true;
  if(!migrationPersistOwed)return;
  var a=(typeof m10AuthNow==="function")?m10AuthNow():{ok:true};
  if(!a.ok){
    try{if(!window.__m10WriteRefused)window.__m10WriteRefused=0;window.__m10WriteRefused++;}catch(e){}
    return;}
  if(saveTrainingLocal())migrationPersistOwed=false;}
/* Mid-workout set add/remove writes the new count back to the saved routine. */
function persistSetCount(en){var w=state.workout;if(!w||!en)return;
  var rt=getRoutine(w.routineId);var it=rt&&rItem(rt,en.itemId);
  if(it&&it.sets!==en.sets.length){it.sets=en.sets.length;
    if(Array.isArray(it.setRanges))it.setRanges=rptRangesFor(it,it.sets);
    saveTraining();}}
function sugLastEntry(exId,routineId){var ls=state.training.liftSessions||{};var dates=Object.keys(ls).sort().reverse();var fallback=null;
  for(var i=0;i<dates.length;i++){var arr=ls[dates[i]]||[];for(var j=arr.length-1;j>=0;j--){var s=arr[j];if(s.mode!=="full"||!s.entries)continue;
    var e=s.entries.filter(function(x){return x.exerciseId===exId&&(x.sets||[]).some(function(d){return d.status==="done"&&num(d.reps)!=null;});})[0];
    if(!e)continue;
    if(routineId&&s.routineId===routineId)return e;
    if(!fallback)fallback=e;}}
  return fallback;}
function sugForEntry(en,routineId){
  var rt=getRoutine(routineId);var mode=en.progression||((rt&&rt.progression)||"double");
  var last=sugLastEntry(en.exerciseId,routineId);if(!last)return null;
  var done=(last.sets||[]).filter(function(d){return d.status==="done"&&num(d.reps)!=null;});
  if(!done.length)return null;
  var bw=!!en.bodyweight;var inc=rptInc();
  /* Reverse Pyramid — weighted lifts: heaviest set first, descend ~10%/set, Set 1 drives the bump. */
  if(mode==="rpt"&&!bw){
    var n=en.sets.length;var ranges=(en.setRanges&&en.setRanges.length)?en.setRanges:rptRangesFor(rt&&rItem(rt,en.itemId),n);
    var lastS1W=num(done[0].weight),lastS1R=num(done[0].reps),lastS1RIR=num(done[0].rir);
    if(lastS1W==null||lastS1W<=0)return en.sets.map(function(){return null;});
    var s1=ranges[0]||{lo:6,hi:8};
    /* Owner refinement 2026-08-05: the bump requires the top set at ANY
       LOGGED RIR — presence, not value, matching the cue exactly */
    var jumped=lastS1R!=null&&lastS1R>=s1.hi&&lastS1RIR!=null;
    var s1w=jumped?lastS1W+inc:lastS1W;
    var rout=[];
    for(var i=0;i<n;i++){var rg=ranges[i]||ranges[ranges.length-1]||{lo:6,hi:8};
      var w=(i===0)?s1w:rptRound(rout[i-1].w*0.9);
      rout.push({w:w,r:rg.lo,tgtLo:rg.lo,tgtHi:rg.hi});}
    return rout;}
  /* Double progression (never-blank: default 8-12 when unset). */
  var lo=num(en.repLow);if(lo==null)lo=8;var hi=num(en.repHigh);if(hi==null)hi=12;
  function rr(d){return num(d.rir);}
  /* up path: ANY logged RIR (Owner refinement); the deload path below keeps
     RIR ≤1 — dropping below range only means 'too heavy' when it was hard */
  var allTop=done.every(function(d){return num(d.reps)>=hi&&rr(d)!=null;});
  var allBelow=done.every(function(d){return num(d.reps)<lo&&rr(d)!=null&&rr(d)<=1;});
  var lastW=null;done.forEach(function(d){var w=num(d.weight);if(w!=null&&(lastW==null||w>lastW))lastW=w;});
  var out=[];
  en.sets.forEach(function(st,si){var base=done[Math.min(si,done.length-1)];var br=num(base.reps);var w,r;
    if(bw){w=num(base.weight);r=Math.min(hi,br+1);}
    else if(lastW==null){out.push(null);return;}
    else if(allTop){w=lastW+inc;r=lo;}
    else if(allBelow){w=Math.max(inc,lastW-inc);r=lo;}
    else{w=lastW;r=Math.min(hi,br+1);}
    out.push({w:w,r:r,e:(w!=null&&!bw)?e1rm(w,r):null});});
  return out;}
function applySuggestions(entries,routineId){entries.forEach(function(en){if(!en)return;
  var sg=sugForEntry(en,routineId);
  if(!sg){en.firstTime=true;return;}
  var any=false;
  en.sets.forEach(function(st,si){var g=sg[si];if(!g)return;any=true;
    /* For bodyweight entries the historical weight is a stale bodyweight, so
       the suggestion neither overwrites today's default load nor advertises the
       old number as sugW. Rep suggestions still apply. */
    if(g.w!=null&&!en.bodyweight)st.weight=String(g.w);
    if(g.r!=null)st.reps=String(g.r);
    if(g.tgtLo!=null){st.tgtLo=g.tgtLo;st.tgtHi=g.tgtHi;st.sugR=null;st.sugW=null;st.sugE=null;}
    else{st.sugR=g.r;if(g.w!=null&&!en.bodyweight)st.sugW=g.w;if(en.bodyweight)st.sugW=null;if(g.e!=null)st.sugE=g.e;st.tgtLo=null;st.tgtHi=null;}});
  if(any)en.sug=true;});}
function startWorkout(rt){var bw=currentBW();var _ents=buildWorkoutEntries(rt,bw);applySuggestions(_ents,rt.id);
  state.workout={routineId:rt.id,name:rt.name||"Weight training",date:todayISO(),startTs:null,tState:"ready",stateStartTs:null,warmupMs:0,workMs:0,restMs:0,bw:bw,entries:_ents,finishing:false,restHidden:false};
  state.setMenu=null;state.woPrompt=false;state.view="workout";saveWorkout();render();startWoTick();}
function woTransition(ns){var w=state.workout;if(!w)return;var now=Date.now();var seg=now-w.stateStartTs;if(w.tState==="warmup")w.warmupMs+=seg;else if(w.tState==="working")w.workMs+=seg;else w.restMs+=seg;w.tState=ns;w.stateStartTs=now;saveWorkout();}
function pauseWorkout(){var w=state.workout;if(!w)return;if(w.tState!=="ready"&&w.stateStartTs){var now=Date.now();var seg=now-w.stateStartTs;if(w.tState==="warmup")w.warmupMs+=seg;else if(w.tState==="working")w.workMs+=seg;else w.restMs+=seg;}w.paused=true;w.stateStartTs=null;saveWorkout();}
function woBuckets(){var w=state.workout;if(!w)return null;if(w.tState==="ready")return {warmup:0,work:0,rest:0,total:0,segMs:0};if(w.paused||!w.stateStartTs){var tot=w.warmupMs+w.workMs+w.restMs;return {warmup:w.warmupMs,work:w.workMs,rest:w.restMs,total:tot,segMs:0};}var now=Date.now();var seg=now-w.stateStartTs;var b={warmup:w.warmupMs,work:w.workMs,rest:w.restMs};if(w.tState==="warmup")b.warmup+=seg;else if(w.tState==="working")b.work+=seg;else b.rest+=seg;b.total=b.warmup+b.work+b.rest;b.segMs=seg;return b;}
function fmtDur(ms){var s=Math.max(0,Math.floor(ms/1000));var h=Math.floor(s/3600);var m=Math.floor((s%3600)/60);var ss=s%60;return (h?h+":"+("0"+m).slice(-2):m)+":"+("0"+ss).slice(-2);}
var woTimer=null;
function startWoTick(){if(woTimer)clearInterval(woTimer);woTimer=setInterval(function(){if(!state.workout||state.view!=="workout"){return;}var w=state.workout;var b=woBuckets();var t=document.getElementById("wl-tb-total");if(t)t.textContent=fmtDur(b.total);var s=document.getElementById("wl-tb-seg");if(s)s.textContent=(w.tState==="ready"?"Ready":w.tState==="warmup"?"Warmup":w.tState==="working"?"Working":"Resting")+(w.tState==="ready"?"":" · "+fmtDur(b.segMs));var rt=document.getElementById("wl-rest-time");if(rt&&w.tState==="resting")rt.textContent=fmtDur(b.segMs);},1000);}
function setTargetIcon(st,en){var reps=num(st.reps);if(reps==null)return "";
  var up,dn;var tlo=num(st.tgtLo),thi=num(st.tgtHi);
  if(tlo!=null||thi!=null){up=(thi!=null&&reps>thi);dn=(tlo!=null&&reps<tlo);}
  else{var tr=num(st.sugR);
    if(tr!=null){up=reps>tr;dn=reps<tr;}
    else{var lo=num(en.repLow),hi=num(en.repHigh);if(lo==null&&hi==null)return "";up=(hi!=null&&reps>hi);dn=(lo!=null&&reps<lo);}}
  if(dn)return '<span class="wl-tgt" style="color:#ef4444">'+I.trenddn.replace("<svg","<svg width=18 height=18")+'</span>';
  if(up)return '<span class="wl-tgt" style="color:#22c55e">'+I.trend.replace("<svg","<svg width=18 height=18")+'</span>';
  return '<span class="wl-tgt" style="color:#eab308">'+I.target.replace("<svg","<svg width=17 height=17")+'</span>';}
function timerBarHTML(){var w=state.workout;var b=woBuckets();
  var lbl=w.tState==="ready"?"Ready":w.tState==="warmup"?"Warmup":w.tState==="working"?"Working":"Resting";
  var h='<div class="wl-timerbar"><div class="wl-tb-left"><div class="wl-tb-total" id="wl-tb-total">'+fmtDur(b.total)+'</div><div class="wl-tb-seg wl-tb-'+w.tState+'" id="wl-tb-seg">'+lbl+(w.tState==="ready"?"":' · '+fmtDur(b.segMs))+'</div></div><div class="wl-tb-btns">';
  if(w.tState==="ready")h+='<button class="wl-btn wl-btn-primary" data-act="wo:begin" style="padding:9px 16px">Start</button>';
  else if(w.tState==="warmup")h+='<button class="wl-btn wl-btn-primary" data-act="wo:startroutine" style="padding:9px 14px">End warmup</button>';
  h+='</div></div>';
  return h;}
function setRowHTML(en,ei,st,si){var done=st.status==="done",sk=st.status==="skipped",wu=st.status==="warmup";
  if(wu)done=true;
  var h='<div class="wl-setgrid wl-setrow'+(done?" done":"")+(sk?" skipped":"")+'">';
  h+='<button class="wl-set-menu" data-act="wo:setmenu" data-ei="'+ei+'" data-si="'+si+'">⋮</button>';
  h+='<input class="wl-set-input" data-wo="weight" data-ei="'+ei+'" data-si="'+si+'" type="text" inputmode="decimal" value="'+esc(st.weight||"")+'"'+((sk||done)?" disabled":"")+'>';
  var _rp="";
if(!done&&!sk&&!(st.reps!=null&&st.reps!=="")){
  var _lo=null,_hi=null;
  if((en.progression||"double")==="rpt"&&en.setRanges&&en.setRanges[si]){_lo=num(en.setRanges[si].lo);_hi=num(en.setRanges[si].hi);}
  else{_lo=num(en.repLow);_hi=num(en.repHigh);}
  if(_lo!=null&&_hi!=null)_rp=_lo+"–"+_hi;else if(_lo!=null)_rp=String(_lo);else if(_hi!=null)_rp=String(_hi);
  /* the capacity hint rides BESIDE the range, never instead of it (Owner #1) */
  if(_rp&&num(st.predR)!=null)_rp+=" · ~"+num(st.predR);}
if(sk)h+='<span class="wl-set-skip">skipped</span>';else h+='<input class="wl-set-input" data-wo="reps" data-ei="'+ei+'" data-si="'+si+'" type="text" inputmode="numeric"'+(_rp?' placeholder="'+_rp+'"':'')+' value="'+esc(st.reps||"")+'"'+(done?" disabled":"")+'>';
  h+='<input class="wl-set-input wl-set-rir" data-wo="rir" data-ei="'+ei+'" data-si="'+si+'" type="text" inputmode="numeric" placeholder="–" value="'+esc(st.rir||"")+'"'+((sk||done)?" disabled":"")+'>';
  h+='<span class="wl-set-tgt">'+(done&&!sk?setTargetIcon(st,en):"")+'</span>';
  h+='<button class="wl-set-log'+(done&&!wu?" done":"")+(sk?" skipped":"")+(wu?" warmup":"")+'" data-act="wo:log" data-ei="'+ei+'" data-si="'+si+'">'+(wu?"W":done?"✓":sk?"–":"")+'</button>';
  var _rw=(state.logWarn&&state.logWarn.ei===ei&&state.logWarn.si===si)?'<div class="wl-rirwarn"><span class="wl-rirwarn-ic">!</span><span>'+esc(state.logWarn.msg)+'</span></div>':'';
  return h+'</div>'+_rw;}
function view_workout(){var w=state.workout;
  if(!w)return '<div class="wl-stack"><div class="wl-card"><div class="wl-hint">No active workout.</div></div></div>';
  if(w.finishing)return finishSheetHTML();
  var h='<div class="wl-stack wl-workout">';
  
  h+=timerBarHTML();
  if(w.tState==="ready")h+='<div class="wl-hint" style="text-align:center;margin:2px 0 4px">Review your workout below, then tap <b>Start</b> — your warmup begins first. Tap <b>End warmup</b> when you\u2019re ready to lift.</div>';
  w.entries.forEach(function(en,ei){var _pg=(en.progression||"double")==="rpt"?"rpt":"double";
  h+='<div class="wl-card" id="wo-ex-'+ei+'"><div style="margin-bottom:6px;display:flex;align-items:center;justify-content:space-between">'+
  '<span style="display:inline-flex;align-items:center;gap:7px;min-width:0">'+muscleTagHTML(en.muscle||"other")+'<span class="wl-progtag'+(_pg==="rpt"?" rpt":"")+'">'+(_pg==="rpt"?"RPT":"PO")+'</span></span>'+
  '<span style="display:inline-flex;gap:2px"><button class="wl-icon-btn" data-act="wo:hist" data-ei="'+ei+'">'+I.history.replace("<svg","<svg width=18 height=18")+'</button><button class="wl-icon-btn" data-act="wo:exmenu" data-ei="'+ei+'" style="font-size:20px">⋮</button></span></div>';
    h+='<div class="wl-exrow-name">'+esc(en.name)+'</div>';
    if(en.lastJoint)h+='<div class="wl-fbwarn">'+I.info.replace("<svg","<svg width=13 height=13")+' Joint pain last time \u2014 <b>'+esc(fbLabel(FB_JOINT,en.lastJoint.joint))+'</b> on '+fmtShort(parseISO(en.lastJoint.date))+'. Ease in and stop if it bites.</div>';
    if(en.lastMus&&(en.lastMus.vol==="much"||en.lastMus.vol==="low"||en.lastMus.sore==="still")&&_fbFirstOfMuscle(w,ei))h+='<div class="wl-fbnote">'+I.info.replace("<svg","<svg width=13 height=13")+' Last time: '+(en.lastMus.sore==="still"?'still sore from the session before':'')+((en.lastMus.sore==="still"&&en.lastMus.vol!=="right"&&en.lastMus.vol)?' \u00b7 ':'')+(en.lastMus.vol==="much"?'volume felt like too much \u2014 consider fewer sets':(en.lastMus.vol==="low"?'volume felt light \u2014 you could add a set':''))+'.</div>';
    if(en.bodyweight)h+='<div class="wl-exrow-sub">Bodyweight @ <button class="wl-link" data-act="wo:bw" style="display:inline">'+(w.bw!=null?w.bw+" "+state.settings.units:"set weight")+'</button></div>';
    else if(en.equipment)h+='<div class="wl-exrow-sub">'+esc(en.equipment)+'</div>';
    if(en.firstTime){var _rr=(en.progression==="rpt"&&en.setRanges&&en.setRanges[0])?en.setRanges[0]:{lo:en.repLow,hi:en.repHigh};if(num(_rr.lo)!=null||num(_rr.hi)!=null)h+='<div class="wl-exrow-sub" style="color:var(--accent)">First time: work up to a weight where '+(_rr.lo||"?")+'\u2013'+(_rr.hi||"?")+' reps leaves 0\u20131 RIR.</div>';}
    (en.notes||[]).forEach(function(n){h+='<button class="wl-note" data-act="note:edit" data-woei="'+ei+'" data-iid="'+en.itemId+'" data-nid="'+(n.id||"")+'" data-pinned="'+(n.pinned?"1":"0")+'"><span class="wl-note-txt">'+esc(n.text)+'</span>'+(n.pinned?'<span class="wl-note-pin">📌</span>':'')+'</button>';});
    h+='<div class="wl-setgrid wl-sethead" style="margin-top:10px"><span></span><span>WEIGHT</span><span>REPS</span><span>RIR '+infoBtn("rir")+'</span><span>'+infoBtn("targeticons")+'</span><span>LOG</span></div>';
    en.sets.forEach(function(st,si){h+=setRowHTML(en,ei,st,si);});
    h+='</div>';});
  if(w.tState!=="ready")h+='<button class="wl-btn wl-btn-primary wl-full" style="margin-top:6px" data-act="wo:finish">End workout</button>';
  h+='<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px;color:var(--faint)" data-act="wo:discard">Discard workout</button>';
  h+='<div style="height:16px"></div>';
  return h+'</div>';}
function finishSheetHTML(){var w=state.workout;var b=woBuckets();var ff=w.finishForm||{};
  var h='<div class="wl-stack">';
  h+='<div class="wl-cal-head"><button class="wl-icon-btn" data-act="wo:finishback">‹</button><span class="wl-cal-title">Finish workout</span><span style="width:36px;display:inline-block"></span></div>';
  h+='<div class="wl-card"><div class="wl-card-head"><span>'+esc(w.name)+'</span></div><div class="wl-diary-macros" style="border:none;padding:0"><b>'+fmtDur(b.total)+'</b> total · work '+fmtDur(b.work)+' · rest '+fmtDur(b.rest)+(b.warmup>2000?' · warmup '+fmtDur(b.warmup):"")+'</div></div>';
  h+='<div class="wl-card"><div class="wl-card-head"><span>Session summary</span></div>';
  h+='<div class="wl-row"><label class="wl-field"><span>Avg HR <em>optional</em></span><input class="wl-wof-input wl-num" data-wof="hr" type="text" inputmode="numeric" placeholder="—" value="'+(ff.hr!=null?esc(String(ff.hr)):"")+'"></label><label class="wl-field"><span>Peak HR <em>optional</em></span><input class="wl-wof-input wl-num" data-wof="hrMax" type="text" inputmode="numeric" placeholder="—" value="'+(ff.hrMax!=null?esc(String(ff.hrMax)):"")+'"></label></div>';
  h+='<div class="wl-row" style="margin-top:12px"><label class="wl-field"><span>Est. calories <em>optional</em></span><input class="wl-wof-input wl-num" data-wof="cal" type="text" inputmode="numeric" placeholder="—" value="'+(ff.cal!=null?esc(String(ff.cal)):"")+'"></label><label class="wl-field"><span>RPE <em>1-10, optional</em></span><input class="wl-wof-input wl-num" data-wof="rpe" type="text" inputmode="numeric" placeholder="—" value="'+(ff.rpe!=null?esc(String(ff.rpe)):"")+'"></label></div>';
  h+='<div id="wl-zonearea" style="margin-top:12px">'+zoneAreaHTML({hr:ff.hr,zone:ff.zone||2},"wof")+'</div>';
  h+='<label class="wl-field wl-field-full" style="margin-top:12px"><span>Notes <em>optional</em></span><textarea class="wl-wof-input" data-wof="notes" style="width:100%;min-height:60px;background:var(--bg2);border:1px solid var(--line);border-radius:10px;color:var(--text);font-family:var(--sans);font-size:14px;padding:11px 12px;box-sizing:border-box;outline:none;resize:vertical">'+esc(ff.notes||"")+'</textarea></label>';
  h+='<button class="wl-btn wl-btn-primary wl-full" style="margin-top:14px" data-act="wo:savesession">Save workout</button>';
  h+='<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px;color:var(--bad);border-color:var(--bad)" data-act="wo:discard">Discard workout</button></div>';
  return h+'</div>';}
function getLiftSession(){var arr=(state.training.liftSessions||{})[state.liftViewDate]||[];return arr.filter(function(s){return s.id===state.liftViewId;})[0];}
function liftSummaryFieldsHTML(s){var h='';
  /* Date and start time are editable so a session logged on the wrong day (a
     late-night entry, a reconstruction after a loss) can be moved by the
     athlete in-app -- through the same reviewed write path as everything else,
     instead of anyone hand-editing the database. */
  var _d=(s.date||state.liftViewDate||todayISO());
  var _t=(function(){var dt=new Date(num(s.ts)||Date.now());return pad(dt.getHours())+":"+pad(dt.getMinutes());})();
  h+='<div class="wl-row"><label class="wl-field"><span>Date</span><input class="wl-sv-input" data-sv="date" type="date" value="'+esc(_d)+'"></label>'+
     '<label class="wl-field"><span>Start time</span><input class="wl-sv-input" data-sv="time" type="time" value="'+esc(_t)+'"></label></div>';
  h+='<div class="wl-row" style="margin-top:12px"><label class="wl-field"><span>Duration <em>min</em></span><input class="wl-sv-input wl-num" data-sv="mins" type="text" inputmode="numeric" value="'+esc(s.mins!=null?String(s.mins):"")+'"></label><label class="wl-field"><span>Avg HR</span><input class="wl-sv-input wl-num" data-sv="hr" type="text" inputmode="numeric" value="'+esc(s.hr!=null?String(s.hr):"")+'"></label></div>';
  h+='<div class="wl-row" style="margin-top:12px"><label class="wl-field"><span>Peak HR</span><input class="wl-sv-input wl-num" data-sv="hrMax" type="text" inputmode="numeric" value="'+esc(s.hrMax!=null?String(s.hrMax):"")+'"></label><label class="wl-field"><span>Est. calories</span><input class="wl-sv-input wl-num" data-sv="cal" type="text" inputmode="numeric" value="'+esc(s.cal!=null?String(s.cal):"")+'"></label></div>';
  h+='<div class="wl-row" style="margin-top:12px"><label class="wl-field"><span>RPE</span><input class="wl-sv-input wl-num" data-sv="rpe" type="text" inputmode="numeric" value="'+esc(s.rpe!=null?String(s.rpe):"")+'"></label><label class="wl-field" style="visibility:hidden"><span>.</span><input></label></div>';
  h+='<label class="wl-field wl-field-full" style="margin-top:12px"><span>Notes</span><textarea class="wl-sv-input" data-sv="notes" style="width:100%;min-height:56px;background:var(--bg2);border:1px solid var(--line);border-radius:10px;color:var(--text);font-family:var(--sans);font-size:14px;padding:11px 12px;box-sizing:border-box;outline:none;resize:vertical">'+esc(s.notes||"")+'</textarea></label>';
  return h;}
function e1rm(w,r){w=num(w);r=num(r);if(w==null||r==null||r<1)return null;return w*(1+r/30);}
function progStep(){return state.settings.units==="kg"?2.5:5;}
function exPriorBest(exId,beforeDate,beforeTs){var ls=state.training.liftSessions||{};var mw=null,me=null;
  Object.keys(ls).forEach(function(d){(ls[d]||[]).forEach(function(s){if(!s.entries)return;
    if(d>beforeDate)return;if(d===beforeDate&&(s.ts||0)>=(beforeTs||0))return;
    s.entries.forEach(function(en){if(en.exerciseId!==exId)return;(en.sets||[]).forEach(function(st){if(st.status==="skipped")return;var w=num(st.weight),r=num(st.reps);if(w==null||r==null||r<1)return;if(mw==null||w>mw)mw=w;var e=e1rm(w,r);if(e!=null&&(me==null||e>me))me=e;});});});});
  return {maxWeight:mw,maxE1rm:me};}
function analyzeSession(date,sessId){var arr=(state.training.liftSessions||{})[date]||[];var s=null;for(var i=0;i<arr.length;i++){if(arr[i].id===sessId){s=arr[i];break;}}
  if(!s||!s.entries)return {prs:[],progress:[]};
  var prs=[],progress=[];
  s.entries.forEach(function(en){
    var pb=exPriorBest(en.exerciseId,date,s.ts||0);
    var bestW=null,bestE=null,bestEw=null,bestEr=null,repsAtTopW=null;
    (en.sets||[]).forEach(function(st){if(st.status==="skipped")return;var w=num(st.weight),r=num(st.reps);if(w==null||r==null||r<1)return;
      if(bestW==null||w>bestW){bestW=w;repsAtTopW=r;}else if(w===bestW&&r>repsAtTopW){repsAtTopW=r;}
      var e=e1rm(w,r);if(e!=null&&(bestE==null||e>bestE)){bestE=e;bestEw=w;bestEr=r;}});
    if(bestW!=null&&(pb.maxWeight!=null||pb.maxE1rm!=null)){
      if(pb.maxWeight!=null&&bestW>pb.maxWeight)prs.push({name:en.name,type:"weight",w:bestW,r:repsAtTopW});
      else if(pb.maxE1rm!=null&&bestE!=null&&bestE>pb.maxE1rm*1.004)prs.push({name:en.name,type:"e1rm",e:Math.round(bestE),w:bestEw,r:bestEr});
    }
    if((en.progression||"double")==="rpt"){
      /* Owner rulings 2026-08-05: SET 1 is the decision-maker — top of the
         top set's range (8, on his held 6–8/8–10/10–12 ladder) at an RIR of
         0 or 1 moves the lift up. Blanks never qualify: no RIR logged, no
         progression. This cue ANNOUNCES what the next-session seeding
         (sugForEntry) auto-applies under the same gate. */
      var top=null,wi=0;
      (en.sets||[]).forEach(function(st){if(st.status==="warmup")return;
        if(wi++===0&&st.status!=="skipped")top=st;});
      /* Owner refinement 2026-08-05: topping the range progresses at ANY
         logged RIR — the RIR must exist (his hard rule), its value does not
         gate the bump. Warm-ups stay out via the catcher above. */
      if(top){var r=num(top.reps),w=num(top.weight),rir=num(top.rir);
        if(r!=null&&w!=null&&r>=8&&rir!=null)
          progress.push({name:en.name,next:w+progStep()});}
    }else{
    var rh=num(en.repHigh);
    /* Owner report 2026-08-05: 15 reps at the same weight for weeks, never a
       go-up cue. The workout screen DISPLAYS a default 8–12 target when no
       range was typed, but this analysis silently skipped any entry whose
       repHigh field was empty — two parts of the app disagreeing about what
       an empty range means. Double progression now judges against the same
       default 12 it displays. */
    if(rh==null)rh=12;
    if(rh!=null){var done=(en.sets||[]).filter(function(st){return st.status!=="skipped"&&st.status!=="warmup"&&num(st.reps)!=null&&num(st.weight)!=null;});
      /* Owner refinement 2026-08-05: top of range at ANY logged RIR counts
         (presence required — blanks never progress; value never gates) */
      if(done.length>=1&&done.every(function(st){return num(st.reps)>=rh&&num(st.rir)!=null;})){var mw2=null;done.forEach(function(st){var w=num(st.weight);if(mw2==null||w>mw2)mw2=w;});progress.push({name:en.name,next:(mw2!=null?mw2+progStep():null)});}
    }}
  });
  return {prs:prs,progress:progress};}
function allTimeBests(){var ls=state.training.liftSessions||{};var map={};
  Object.keys(ls).sort().forEach(function(d){(ls[d]||[]).forEach(function(s){(s.entries||[]).forEach(function(en){
    (en.sets||[]).forEach(function(st){if(st.status==="skipped")return;var w=num(st.weight),r=num(st.reps);if(w==null||r==null||r<1)return;
      var k=en.exerciseId||en.name;var m=map[k];if(!m){m=map[k]={exId:en.exerciseId,name:en.name,bestW:null,bestWr:null,bestE:null};}
      m.name=en.name;
      if(m.bestW==null||w>m.bestW){m.bestW=w;m.bestWr=r;m.dateW=d;}else if(w===m.bestW&&r>(m.bestWr||0)){m.bestWr=r;m.dateW=d;}
      var e=e1rm(w,r);if(e!=null&&(m.bestE==null||e>m.bestE))m.bestE=e;});});});});
  var arr=[];for(var k in map)arr.push(map[k]);
  arr.sort(function(a,b){return (b.bestE||0)-(a.bestE||0);});
  return arr;}
function prSummaryHTML(){var bests=allTimeBests();if(!bests.length)return "";var u=state.settings.units;
  var h='<div class="wl-card"><div class="wl-card-head"><span>Personal Records</span><span class="wl-count">'+bests.length+'</span></div><div class="wl-prlist">';
  bests.forEach(function(b){var ex=b.exId?exById(b.exId):null;var bw=ex&&ex.bodyweight;var main,sub="";
    if(bw){main=(b.bestW>0?("BW +"+b.bestW+" "+u):"BW")+" \u00d7 "+b.bestWr;}
    else{main=b.bestW+" "+u+" \u00d7 "+b.bestWr;var _e9=e1rm(b.bestW,b.bestWr);if(_e9!=null)sub="est. 1RM "+Math.round(_e9)+" "+u;}
    h+='<div class="wl-prrow"><div class="wl-prrow-top"><span class="wl-prrow-name">'+esc(b.name)+'</span>'+(b.dateW?'<span class="wl-prrow-date">'+fmtShort(parseISO(b.dateW))+'</span>':'')+'</div><div class="wl-prrow-val">'+esc(main)+(sub?' <span class="wl-prrow-e">'+esc(sub)+'</span>':'')+'</div></div>';});
  return h+'</div></div>';}
function trainingHistoryHTML(ctx){var tab=state.histTab||"all";
  var s0=toISO(ctx.start),e0=toISO(ctx.end);var items=[];
  var ss=state.training.sessions||{},ls=state.training.liftSessions||{};
  Object.keys(ss).forEach(function(d){if(d<s0||d>e0)return;(ss[d]||[]).forEach(function(x){if(x.kind!=="cardio")return;var m=[];if(x.mins!=null)m.push(x.mins+" min");if(x.zone)m.push("Zone "+x.zone);if(x.hr!=null)m.push("HR "+x.hr);if(x.cal!=null)m.push("~"+x.cal+" cal");items.push({d:d,ts:x.ts||0,cat:"car",name:x.type||"Cardio",meta:m.join(" \u00b7 ")});});});
  Object.keys(ls).forEach(function(d){if(d<s0||d>e0)return;(ls[d]||[]).forEach(function(x){var m=[];if(x.mins!=null)m.push(x.mins+" min");m.push(x.mode==="full"?"logged":"quick");if(x.mode==="full"&&x.entries){var n=0;x.entries.forEach(function(en){(en.sets||[]).forEach(function(st){if(st.status==="done")n++;});});if(n)m.push(n+" sets");}if(x.rpe!=null)m.push("RPE "+x.rpe);items.push({d:d,ts:x.ts||0,cat:"lift",name:x.name||"Weight training",meta:m.join(" \u00b7 ")});});});
  Object.keys(state.workouts||{}).forEach(function(d){if(d<s0||d>e0)return;normActs(d).forEach(function(a){if(a.cat!=="rest")return;items.push({d:d,ts:0,cat:a.cat,name:a.name||CATLABEL[a.cat],meta:CATLABEL[a.cat]});});});
  var want={car:"car",lift:"lift",rest:"rest"}[tab]||null;
  if(want)items=items.filter(function(i){return i.cat===want;});
  items.sort(function(a,b){return a.d===b.d?(b.ts-a.ts):(a.d<b.d?1:-1);});
  var segs=[["all","All"],["car","Cardio"],["lift","Lifts"],["rest","Rest"]];
  var h='<div class="wl-card"><div class="wl-card-head"><span>Training History</span>'+(items.length?'<span class="wl-count">'+items.length+'</span>':'')+'</div>';
  h+='<div class="wl-seg wl-seg-wide wl-seg-hist">'+segs.map(function(t){return '<button class="'+(tab===t[0]?"on":"")+'" data-act="hist:tab" data-tab="'+t[0]+'">'+t[1]+'</button>';}).join("")+'</div>';
  if(!items.length){var nm={all:"activity",car:"cardio",lift:"lifting",rest:"recovery"}[tab];return h+'<div class="wl-empty">No '+nm+' in this period. Log it on the Activity tab.</div></div>';}
  var CAP=8;var showAll=state.histMore===true;var shown=showAll?items:items.slice(0,CAP);
  var grouped=ctx.mode!=="W";var lastWk=null;
  shown.forEach(function(it){
    if(grouped){var wk=toISO(weekStartOf(it.d));if(wk!==lastWk){lastWk=wk;var we=addDays(parseISO(wk),6);h+='<div class="wl-hwk">'+fmtShort(parseISO(wk))+' \u2013 '+fmtShort(we)+'</div>';}}
    var dd=parseISO(it.d);
    h+='<button class="wl-hrow" data-act="hist:day" data-date="'+it.d+'"><span class="wl-hdate"><span class="wl-hdow">'+DAYS3[dd.getDay()]+'</span><span class="wl-hday">'+dd.getDate()+'</span></span><span class="wl-hmain"><span class="wl-hname"><span class="wl-hdotc '+it.cat+'"></span>'+esc(it.name)+'</span>'+(it.meta?'<span class="wl-hmeta">'+esc(it.meta)+'</span>':'')+'</span><span class="wl-hgo">\u203a</span></button>';
  });
  if(items.length>CAP&&!showAll)h+='<button class="wl-hmore" data-act="hist:more">Show '+(items.length-CAP)+' more \u2193</button>';
  return h+'</div>';}
function view_liftview(){var s=getLiftSession();var u=state.settings.units;var mode=state.liftEdit;var h='<div class="wl-stack">';
  if(!s){h+='<div class="wl-cal-head"><button class="wl-icon-btn" data-act="lift:back">‹</button><span class="wl-cal-title">Session</span></div><div class="wl-card"><div class="wl-hint">Session not found.</div></div>';return h+'</div>';}
  if(mode==="summary"){
    h+='<div class="wl-cal-head"><button class="wl-icon-btn" data-act="lift:summaryback">‹</button><span class="wl-cal-title">Edit summary</span><span style="width:36px;display:inline-block"></span></div>';
    h+='<div class="wl-card"><div class="wl-card-head"><span>'+esc(s.name||"Session")+'</span></div><div class="wl-hint" style="margin-bottom:12px">Your saved values are filled in — write over anything you want to change.</div>'+liftSummaryFieldsHTML(s)+'</div>';
    h+='<button class="wl-btn wl-btn-primary wl-full" data-act="lift:savedetail">Save workout</button>';
    return h+'</div>';}
  var editing=mode==="sets";
  if(editing)h+='<div class="wl-cal-head"><button class="wl-icon-btn" data-act="lift:editcancel">‹</button><span class="wl-cal-title">'+esc(s.name||"Session")+'</span><span style="width:36px;display:inline-block"></span></div>';
  if(!editing&&s.mode==="full"){var _an=analyzeSession(s.date,s.id);
    if(_an.prs.length||_an.progress.length){h+='<div class="wl-card" style="border:1px solid var(--good)">';
      if(_an.prs.length){h+='<div class="wl-card-head"><span>🎉 New PR'+(_an.prs.length>1?"s":"")+'</span></div>';
        _an.prs.forEach(function(p){h+='<div class="wl-pr-row">'+(p.type==="weight"?'🏆 <b>'+esc(p.name)+'</b> — new top weight: '+p.w+' '+u+(p.r!=null?' × '+p.r:""):'💪 <b>'+esc(p.name)+'</b> — strength PR, ~'+p.e+' '+u+' est. 1RM'+(p.w!=null&&p.r!=null?' ('+p.w+' × '+p.r+')':""))+'</div>';});}
      if(_an.progress.length){h+='<div class="wl-card-head" style="margin-top:'+(_an.prs.length?"12px":"0")+'"><span>📈 Ready to add weight</span></div><div class="wl-hint" style="margin:2px 0 6px">You hit the top of your rep range at ≤1 RIR — Max\u2019s cue to go up.</div>';
        _an.progress.forEach(function(p){h+='<div class="wl-pr-row">'+esc(p.name)+(p.next!=null?' → try <b>'+p.next+' '+u+'</b> next time':"")+'</div>';});}
      h+='</div>';}
  }
  h+='<div class="wl-card"><div class="wl-card-head"><span>Summary <span class="wl-count">'+(s.mode==="full"?"logged":"quick")+'</span></span></div>';
  if(s.mode==="full")h+='<div class="wl-diary-macros" style="border:none;padding:0;margin-bottom:6px">'+(s.mins!=null?'<b>'+s.mins+' min</b> · ':"")+'work '+fmtDur((s.workSec||0)*1000)+' · rest '+fmtDur((s.restSec||0)*1000)+(s.warmupSec>2?' · warmup '+fmtDur((s.warmupSec||0)*1000):"")+'</div>';
  var sm=[];if(s.mins!=null&&s.mode!=="full")sm.push(s.mins+" min");if(s.hr!=null)sm.push("HR "+s.hr+(s.hrMax!=null?"/"+s.hrMax:""));else if(s.hrMax!=null)sm.push("peak "+s.hrMax);if(s.zone)sm.push("Zone "+s.zone);if(s.cal!=null)sm.push("~"+s.cal+" cal");if(s.rpe!=null)sm.push("RPE "+s.rpe);
  h+='<div class="wl-exrow-sub" style="line-height:1.6">'+(sm.length?sm.join("  ·  "):"No HR / calories / RPE recorded")+'</div>';
  if(s.notes)h+='<div class="wl-note" style="cursor:default;margin-top:8px"><span class="wl-note-txt" style="white-space:normal">'+esc(s.notes)+'</span></div>';
  h+='</div>';
  if(s.mode==="full"&&s.entries){s.entries.forEach(function(en,ei){h+='<div class="wl-card"><div style="margin-bottom:6px">'+muscleTagHTML(en.muscle||"other")+'</div><div class="wl-exrow-name">'+esc(en.name)+'</div>';
    h+='<div class="wl-setgrid wl-sethead" style="grid-template-columns:1fr 1fr 46px 60px;margin-top:8px"><span>WEIGHT</span><span>REPS</span><span>RIR '+infoBtn("rir")+'</span><span></span></div>';
    en.sets.forEach(function(st,si){var stat=st.status==="skipped"?"skipped":st.status==="done"?"✓":"";
      if(editing)h+='<div class="wl-setgrid wl-setrow" style="grid-template-columns:1fr 1fr 46px 60px"><input class="wl-sv-set wl-set-input" data-ei="'+ei+'" data-si="'+si+'" data-field="weight" type="text" inputmode="decimal" value="'+esc(st.weight!=null?String(st.weight):"")+'"><input class="wl-sv-set wl-set-input" data-ei="'+ei+'" data-si="'+si+'" data-field="reps" type="text" inputmode="numeric" value="'+esc(st.reps!=null?String(st.reps):"")+'"><input class="wl-sv-set wl-set-input wl-set-rir" data-ei="'+ei+'" data-si="'+si+'" data-field="rir" type="text" inputmode="numeric" placeholder="–" value="'+esc(st.rir!=null?String(st.rir):"")+'"><span class="wl-exrow-sub" style="text-align:center">'+stat+'</span></div>';
      else h+='<div class="wl-setgrid" style="grid-template-columns:1fr 1fr 46px 60px;padding:7px 0;border-top:1px solid var(--line)"><span style="text-align:center;font-size:15px">'+(st.weight!=null?st.weight:"–")+'</span><span style="text-align:center;font-size:15px">'+(st.reps!=null?st.reps:"–")+'</span><span style="text-align:center;color:var(--faint)">'+(st.rir!=null?st.rir:"–")+'</span><span class="wl-exrow-sub" style="text-align:center;display:inline-flex;align-items:center;justify-content:center;gap:6px">'+(st.status==="done"?setTargetIcon(st,en):"")+stat+'</span></div>';});
    h+='</div>';});}
  if(editing){h+='<button class="wl-btn wl-btn-primary wl-full" data-act="lift:tofinish">Finish → edit summary</button>';h+='<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px" data-act="lift:editcancel">Cancel edits</button>';}
  else{h+='<button class="wl-btn wl-btn-primary wl-full" data-act="lift:back">Done</button>';h+='<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px" data-act="lift:edit">Edit workout</button>';h+='<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px;color:var(--bad);border-color:var(--bad)" data-act="lift:del" data-id="'+s.id+'">Delete session</button>';}
  return h+'</div>';}
function openHistory(exId,name){state.histView={exId:exId,name:name};render();}
function histOverlayHTML(){var hv=state.histView;var ls=state.training.liftSessions||{};var dates=Object.keys(ls).sort().reverse();var rows=[];
  dates.forEach(function(d){(ls[d]||[]).forEach(function(s){if(s.mode==="full"&&s.entries){var e=s.entries.filter(function(x){return x.exerciseId===hv.exId;})[0];if(e&&e.sets)e.sets.forEach(function(st){if(st.status==="done"&&st.weight!=null)rows.push({w:st.weight,r:st.reps,d:d,name:s.name});});}});});
  var u=state.settings.units;var bestE=null,bestW=null;
  rows.forEach(function(r){var e=e1rm(r.w,r.r);if(e!=null&&(bestE==null||e>bestE))bestE=e;if(r.w!=null&&(bestW==null||r.w>bestW))bestW=r.w;});
  var h='<div class="wl-confirm"><div class="wl-confirm-card" style="max-height:74vh;overflow:auto"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><div style="font-weight:800;font-size:18px">History</div><button class="wl-icon-btn" data-act="wo:histclose">✕</button></div><div class="wl-exrow-sub" style="margin-bottom:12px">'+esc(hv.name)+'</div>';
  if(!rows.length)h+='<div class="wl-hint">No logged sets yet — finish a workout with this exercise and it\u2019ll show here.</div>';
  else h+='<div class="wl-card" style="padding:10px 12px;margin-bottom:12px;background:var(--bg2)"><div class="wl-exrow-sub">Personal best</div><div style="font-size:15px;margin-top:2px">🏆 top weight <b>'+bestW+' '+u+'</b>'+(bestE!=null?'  ·  est. 1RM <b>~'+Math.round(bestE)+' '+u+'</b>':"")+'</div></div>';
  rows.forEach(function(r){var e=e1rm(r.w,r.r);var isPR=(bestE!=null&&e!=null&&Math.abs(e-bestE)<0.01);h+='<div style="display:flex;justify-content:space-between;align-items:baseline;padding:10px 0;border-bottom:1px solid var(--line)"><span style="font-size:16px">'+(isPR?'⭐ ':"")+'<b>'+r.w+'</b> <span style="font-size:12px;color:var(--faint)">'+u+'</span> × <b>'+(r.r!=null?r.r:"–")+'</b></span><span class="wl-exrow-sub" style="text-align:right">'+fmtShort(parseISO(r.d))+'<br>'+esc(r.name||"")+'</span></div>';});
  return h+'</div></div>';}
function woOverlaysHTML(){var h="";
  if(state.setMenu){h+='<div class="wl-confirm"><div class="wl-confirm-card"><div class="wl-confirm-msg" style="font-weight:700;margin-bottom:14px">Set</div><button class="wl-btn wl-btn-ghost wl-full" data-act="wo:addset">Add set below</button><button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px" data-act="wo:skipset">Skip / unskip set</button><button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px;color:var(--bad);border-color:var(--bad)" data-act="wo:delset">Delete set</button><button class="wl-btn wl-btn-ghost wl-full" style="margin-top:12px" data-act="wo:setmenu:close">Cancel</button></div></div>';}
  if(state.woPrompt){var w=state.workout;var pending=0;if(w)w.entries.forEach(function(en){en.sets.forEach(function(s){if(s.status==="pending")pending++;});});
    h+='<div class="wl-confirm"><div class="wl-confirm-card"><div class="wl-confirm-msg">You have <b>'+pending+'</b> unfinished set'+(pending===1?"":"s")+'. Complete them, skip them, or finish later?</div><button class="wl-btn wl-btn-primary wl-full" data-act="wo:completethem">Complete them</button><button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px" data-act="wo:skipthem">Skip them &amp; finish</button><button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px" data-act="wo:finishlater">Finish later <em style="color:var(--faint);font-style:normal">(save as partial)</em></button><button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px" data-act="wo:promptcancel">Cancel</button></div></div>';}
  if(state.bwEdit){var w=state.workout;h+='<div class="wl-confirm"><div class="wl-confirm-card"><div class="wl-confirm-msg" style="font-weight:700">Bodyweight</div><div class="wl-hint" style="margin-bottom:12px">Applied to every bodyweight exercise this session.</div><input class="wl-noteinput" id="wl-bwinput" type="text" inputmode="decimal" value="'+esc(w&&w.bw!=null?String(w.bw):"")+'"><div class="wl-row" style="margin-top:12px"><button class="wl-btn wl-btn-primary wl-full" data-act="wo:bwsave">Update</button><button class="wl-btn wl-btn-ghost" data-act="wo:bwcancel">Cancel</button></div></div></div>';}
  if(state.histView)h+=histOverlayHTML();
  if(state.exMenu){var w=state.workout;var ei=state.exMenu.ei;var en=w&&w.entries[ei];
    h+='<div class="wl-confirm"><div class="wl-confirm-card"><div class="wl-confirm-msg" style="font-weight:700;margin-bottom:6px">'+esc((en&&en.name)||"Exercise")+'</div>'+
    '<button class="wl-btn wl-btn-ghost wl-full" data-act="wo:exnote" data-ei="'+ei+'">New note</button>'+
    (ei>0?'<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px" data-act="wo:exmove" data-ei="'+ei+'" data-dir="up">Move up</button>':'')+
    (w&&ei<w.entries.length-1?'<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px" data-act="wo:exmove" data-ei="'+ei+'" data-dir="down">Move down</button>':'')+
    '<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px" data-act="wo:exreplace" data-ei="'+ei+'">Replace exercise</button>'+
    '<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px" data-act="wo:fbopen" data-ei="'+ei+'">Feedback</button>'+
    '<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px" data-act="wo:exprog" data-ei="'+ei+'">'+((en&&en.progression)==="rpt"?"Change to Progressive Overload":"Change to Reverse Pyramid")+'</button>'+
    '<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px" data-act="wo:exaddset" data-ei="'+ei+'">Add set</button>'+
    '<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px;color:var(--bad);border-color:var(--bad)" data-act="wo:exremove" data-ei="'+ei+'">Remove exercise</button>'+
    '<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:12px" data-act="wo:exmenu:close">Cancel</button></div></div>';}
  if(state.woReplaceEi!=null){var exs=state.training.exercises||[];
    h+='<div class="wl-confirm"><div class="wl-confirm-card" style="max-height:76vh;overflow:auto"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><div style="font-weight:800;font-size:17px">Replace with</div><button class="wl-icon-btn" data-act="wo:replacecancel">✕</button></div>';
    MUSCLES.forEach(function(m){var items=exs.filter(function(e){return (e.muscle||"other")===m[0];}).sort(function(a,b){return (a.name||"").toLowerCase().localeCompare((b.name||"").toLowerCase());});if(!items.length)return;
      h+='<div style="margin:10px 0 4px">'+muscleTagHTML(m[0])+'</div>';
      items.forEach(function(e){h+='<button class="wl-exrow-main" data-act="wo:replacepick" data-eid="'+e.id+'" style="width:100%;padding:9px 0;border-bottom:1px solid var(--line)"><span class="wl-exrow-name">'+esc(e.name)+'</span></button>';});});
    h+='</div></div>';}
  if(state.woReplSave){var _rs=state.woReplSave;
    h+='<div class="wl-confirm"><div class="wl-confirm-card"><div class="wl-confirm-msg">Swapped <b>'+esc(_rs.prev)+'</b> for <b>'+esc(_rs.next)+'</b>. Save it to the routine going forward, or keep it for today only?</div><div class="wl-confirm-btns"><button class="wl-btn wl-btn-ghost wl-full" data-act="wo:replsave:once">Just this once</button><button class="wl-btn wl-full" style="background:var(--accent);color:#fff;border:none" data-act="wo:replsave:fwd">Save to routine</button></div></div></div>';}
  if(state.workout&&state.workout.tState==="resting"){var b=woBuckets();
    h+='<div class="wl-confirm"><div class="wl-confirm-card" style="text-align:center"><div style="font-size:12px;color:var(--faint);text-transform:uppercase;letter-spacing:.1em;font-weight:800">Rest</div><div class="wl-tb-total" id="wl-rest-time" style="font-size:52px;margin:12px 0;color:#3b82f6">'+fmtDur(b.segMs)+'</div><div class="wl-restwhy"><div class="wl-restwhy-h">Rest long enough to</div><ol class="wl-restwhy-l"><li>No longer be breathing heavily.</li><li>Feel mentally ready for another hard set.</li><li>Not be crampy in a supporting muscle \u2014 a fatigued lower back before another squat set, say.</li><li>Have enough back in the target muscle for at least 5 reps.</li></ol></div><button class="wl-btn wl-btn-primary wl-full" data-act="wo:endrest">Begin next set</button>'+(function(){var _un=woUpNext();if(!_un)return "";var _u=state.settings.units;var _bits=['Set '+_un.setNo+' of '+_un.setTotal];if(_un.reps)_bits.push(_un.reps+' reps');if(_un.weight)_bits.push(esc(_un.weight)+' '+_u);return '<div class="wl-upnext"><span class="wl-upnext-l">Up next</span><b style="color:var(--text)">'+esc(_un.name)+'</b><br>'+_bits.join(' \u00b7 ')+'</div>';})()+'</div></div>';}
  h+=fbSheetHTML();
  h+=warmupAskHTML();
  if(state.woResume){var w=state.workout;var paused=w&&w.paused;
    h+='<div class="wl-confirm"><div class="wl-confirm-card"><div class="wl-confirm-msg" style="font-weight:700;margin-bottom:4px">'+esc((w&&w.name)||"Workout")+'</div><div class="wl-hint" style="margin-bottom:14px">'+(paused?"Paused — resume where you left off. The time in between isn\u2019t counted.":"You have a workout in progress.")+'</div><button class="wl-btn wl-btn-primary wl-full" data-act="wo:resume">Resume workout</button>'+(paused?"":'<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px" data-act="wo:finishlater">Finish later <em style="color:var(--faint);font-style:normal">(pause)</em></button><button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px" data-act="wo:endnow">End &amp; save</button>')+'<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px;color:var(--bad);border-color:var(--bad)" data-act="wo:discardnow">Discard</button><button class="wl-btn wl-btn-ghost wl-full" style="margin-top:12px" data-act="wo:resumecancel">Cancel</button></div></div>';}
  if(state.noteEdit&&state.noteEdit.woEi!=null)h+='<div class="wl-confirm"><div class="wl-confirm-card">'+noteEditorHTML()+'</div></div>';
  return h;}
/* Newest date carrying a logged session for this routine (full or quick), or null. */
function routineLastDone(rid){var ls=state.training.liftSessions||{};var ds=Object.keys(ls).sort().reverse();
  for(var i=0;i<ds.length;i++){var arr=ls[ds[i]]||[];
    for(var j=0;j<arr.length;j++){if(arr[j]&&arr[j].routineId===rid)return ds[i];}}
  return null;}
/* Today / Yesterday / weekday inside a week / "Jul 20" beyond it. */
function lastDoneLabel(iso){if(!iso)return "";
  var t=todayISO();if(iso===t)return "Today";
  var d=parseISO(iso),n=parseISO(t);
  var days=Math.round((n-d)/DAY);
  if(days===1)return "Yesterday";
  if(days>1&&days<7)return d.toLocaleDateString(undefined,{weekday:"long"});
  return fmtShort(d);}
function view_wtadd(){var h='<div class="wl-stack">';
  var rts=state.training.routines||[];
  h+='<div class="wl-card"><div class="wl-card-head"><span class="wl-cardtitle-accent">Your Saved Routines</span></div>';
  if(rts.length)h+='<div class="wl-hint" style="margin-bottom:10px">Tap one to see what\u2019s in it \u2014 then start it, edit it, or delete it.</div>';
  if(rts.length){h+='<div class="wl-rtlist">';rts.forEach(function(rt){var nEx=(rt.items||[]).length;var _ld=routineLastDone(rt.id);
h+='<button class="wl-rtrow" data-act="rt:open" data-id="'+rt.id+'"><span class="wl-rtrow-info"><span class="wl-rtrow-name">'+esc(rt.name||"Untitled Routine")+'</span><span class="wl-rtrow-sub">'+nEx+' exercise'+(nEx===1?"":"s")+'</span></span><span class="wl-rtrow-last"><span class="wl-rtrow-lastlab">last done</span><span class="wl-rtrow-lastval'+(_ld?"":" none")+'">'+(_ld?esc(lastDoneLabel(_ld)):"—")+'</span></span><span class="wl-rtrow-go">›</span></button>';});h+='</div>';}
  else h+='<div class="wl-hint">No routines yet — create one to get started.</div>';
  h+='</div>';
  h+='<div class="wl-card" style="margin-top:10px"><div class="wl-hint" style="margin-bottom:10px">Building something new? Create a routine once and it stays here for every session.</div><button class="wl-btn wl-btn-primary wl-full" data-act="rt:new">'+I.plus.replace("<svg","<svg width=16 height=16")+'Add New Routine</button></div>';
  h+='<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:10px" data-act="go" data-view="train">Cancel</button>';
  return h+'</div>';}
function view_wtadd_end(){}
function view_quicklog(){
  var lf=state.liftForm;var rt=lf&&getRoutine(lf.routineId);var h='<div class="wl-stack">';
  h+='<div class="wl-hint" style="text-align:center;margin-bottom:4px">Logging for '+fmtLong(parseISO(lf.date))+(lf.date===todayISO()?" · Today":"")+'</div>';
  if(lf)h+=liftFormHTML(lf);
  return h+'</div>';
}
function cardioFormHTML(cf){
  var h='<div class="wl-cardioform">';
  h+='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px"><div style="font-weight:800;font-size:16px">'+esc(cf.type||"Cardio")+'</div><button class="wl-link" data-act="cardio:repick">Change type</button></div>';
  h+='<div class="wl-row"><label class="wl-field"><span>Duration <em>min</em></span><input class="wl-cf-input wl-num" data-cf="mins" type="text" inputmode="numeric" placeholder="\u2014" value="'+(cf.mins!=null?esc(String(cf.mins)):"")+'"></label><label class="wl-field"><span>Avg HR <em>bpm, optional</em></span><input class="wl-cf-input wl-num" data-cf="hr" type="text" inputmode="numeric" placeholder="\u2014" value="'+(cf.hr!=null?esc(String(cf.hr)):"")+'"></label></div>';
  h+='<div class="wl-row" style="margin-top:12px"><label class="wl-field"><span>Peak HR <em>bpm, optional</em></span><input class="wl-cf-input wl-num" data-cf="hrMax" type="text" inputmode="numeric" placeholder="\u2014" value="'+(cf.hrMax!=null?esc(String(cf.hrMax)):"")+'"></label><label class="wl-field"><span>Est. calories <em>optional</em></span><input class="wl-cf-input wl-num" data-cf="cal" type="text" inputmode="numeric" placeholder="\u2014" value="'+(cf.cal!=null?esc(String(cf.cal)):"")+'"></label></div>';
  h+='<div class="wl-row" style="margin-top:12px"><label class="wl-field"><span>RPE <em>1-10, optional</em></span><input class="wl-cf-input wl-num" data-cf="rpe" type="text" inputmode="numeric" placeholder="\u2014" value="'+(cf.rpe!=null?esc(String(cf.rpe)):"")+'"></label><label class="wl-field" style="visibility:hidden"><span>.</span><input></label></div>';
  h+='<div id="wl-zonearea" style="margin-top:12px">'+zoneAreaHTML(cf)+'</div>';
  h+='<label class="wl-field wl-field-full" style="margin-top:12px"><span>Notes <em>optional</em></span><textarea class="wl-cf-input" data-cf="notes" placeholder="How it felt, incline, intervals \u2014 anything for your coach\u2026" style="width:100%;min-height:60px;background:var(--bg2);border:1px solid var(--line);border-radius:10px;color:var(--text);font-family:var(--sans);font-size:14px;padding:11px 12px;box-sizing:border-box;outline:none;resize:vertical">'+esc(cf.notes||"")+'</textarea></label>';
  h+='<button class="wl-btn wl-btn-primary wl-full" style="margin-top:14px" data-act="cardio:save">'+(cf.id?"Save changes":"Log cardio")+'</button><button class="wl-btn wl-btn-ghost wl-full" style="margin-top:10px" data-act="cardio:cancel">Cancel</button>';
  return h+'</div>';
}
function cardioPickHTML(cf){var ted=!!state.cardioTypeEdit;var types=normPresets().map(function(p,i){return {p:p,i:i};}).filter(function(x){return x.p.cat==="cardio";});
  var h='<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px"><span class="wl-hint" style="margin:0">'+(ted?'Remove types you don\u2019t use \u2014 logged history is kept.':'Choose a cardio type:')+'</span><button class="wl-link" data-act="cf:typeedit" style="flex:none'+(ted?';color:var(--accent)':'')+'">'+(ted?'Done':'Edit types')+'</button></div>';
  if(types.length){h+='<div class="wl-rtlist">';types.forEach(function(x){var t=x.p.name;if(ted){h+='<button class="wl-rtrow" data-act="preset:del" data-idx="'+x.i+'"><span class="wl-rtrow-info"><span class="wl-rtrow-name">'+esc(t)+'</span></span><span class="wl-typex">\u2715</span></button>';return;}h+='<button class="wl-rtrow" data-act="cardio:pick" data-type="'+esc(t)+'"><span class="wl-rtrow-info"><span class="wl-rtrow-name">'+esc(t)+'</span></span><span class="wl-rtrow-go">\u203a</span></button>';});h+='</div>';}
  else h+='<div class="wl-hint">No cardio types yet \u2014 add one below.</div>';
  if(cf.newOpen)h+='<div class="wl-row" style="margin-top:10px"><input class="wl-inline-input" id="wl-newcardio" placeholder="New cardio type (e.g. Stairmaster)"><button class="wl-btn wl-btn-ghost" data-act="cf:newtype">Add</button></div>';
  else h+='<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:10px" data-act="cf:newtype-toggle">'+I.plus.replace("<svg","<svg width=16 height=16")+'Add Cardio Type</button>';
  h+='<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:8px" data-act="cardio:cancel">Cancel</button>';
  return h;
}
function view_cardio(){var cf=state.cardioForm;
  var h='<div class="wl-stack">';
  if(!cf){h+='<div class="wl-card"><div class="wl-hint">Nothing to log.</div></div>';return h+'</div>';}
  h+='<div class="wl-card">'+(cf.picking?cardioPickHTML(cf):cardioFormHTML(cf))+'</div>';
  return h+'</div>';
}
function view_actadd(){var cat=state.actPick;
  var h='<div class="wl-stack">';
  if(!cat){h+='<div class="wl-card"><div class="wl-hint">Nothing to add.</div></div>';return h+'</div>';}
  var sel=state.selDate;var pre=normPresets(),log=normActs(sel);
  function onIdx(pr){for(var i=0;i<log.length;i++){if(log[i].name===pr.name&&log[i].cat===pr.cat)return i;}return -1;}
  var items=pre.map(function(p,i){return {p:p,i:i};}).filter(function(x){return x.p.cat===cat;}).sort(function(a,b){return (a.p.name||"").toLowerCase().localeCompare((b.p.name||"").toLowerCase());});
  var ed=!!state.actEdit;
  h+='<div class="wl-card"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px"><span class="wl-hint" style="margin:0">'+(ed?'Remove types you don\u2019t use \u2014 logged history is kept.':fmtLong(parseISO(sel))+(sel===todayISO()?" \u00b7 Today":"")+' \u2014 tap to add or remove.')+'</span><button class="wl-link" data-act="act:editmode" style="flex:none'+(ed?';color:var(--accent)':'')+'">'+(ed?'Done':'Edit')+'</button></div>';
  h+='<div class="wl-rtlist">';
  items.forEach(function(x){if(ed){h+='<button class="wl-rtrow" data-act="preset:del" data-idx="'+x.i+'"><span class="wl-rtrow-name">'+esc(x.p.name||CATLABEL[cat])+'</span><span class="wl-typex">\u2715</span></button>';return;}var on=onIdx(x.p)>=0;h+='<button class="wl-rtrow" data-act="act:toggle" data-idx="'+x.i+'" data-date="'+sel+'"><span class="wl-rtrow-name">'+esc(x.p.name||CATLABEL[cat])+'</span><span class="wl-actcheck'+(on?" on":"")+'">'+(on?"\u2713":"")+'</span></button>';});
  h+='</div>';
  if(state.actAddCat===cat)h+='<div class="wl-row" style="margin-top:12px"><input class="wl-inline-input" id="wl-addact-'+cat+'" placeholder="New '+(cat==="rest"?"recovery":"supplement")+' type" autocomplete="off"><button class="wl-btn wl-btn-ghost" data-act="act:addcat" data-cat="'+cat+'">Add</button></div>';
  else h+='<button class="wl-btn wl-btn-ghost wl-full" style="margin-top:12px" data-act="act:addopen" data-cat="'+cat+'">'+I.plus.replace("<svg","<svg width=16 height=16")+'Add '+(cat==="rest"?"recovery":"supplement")+' type</button>';
  h+='</div>';
  h+='<button class="wl-btn wl-btn-primary wl-full" data-act="actpick:close">Done</button>';
  return h+'</div>';
}function catIcon(c){var p=(c==="car"||c==="cardio")?'<path d="M3 12h4l2-5 4 10 2-5h6"/>':c==="lift"?'<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>':c==="rest"?'<path d="M20 14.5A8 8 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z"/>':'<path d="M10.5 3.5 3.5 10.5a5 5 0 0 0 7 7l7-7a5 5 0 0 0-7-7zM7 7l7 7"/>';return '<span class="wl-caticon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+p+'</svg></span>';}
function catHead(cat,title,sum){return '<div class="wl-cathead">'+catIcon(cat)+'<div class="wl-catmeta"><div class="wl-cattype">'+title+'</div><div class="wl-catsum">'+sum+'</div></div></div>';}
function actCatCardHTML(cat,title,date){
  var log=normActs(date);var mine=[];log.forEach(function(a,i){if(a.cat===cat)mine.push({a:a,i:i});});
  var btnClass=cat==="rest"?"wl-btn-rest":cat==="supp"?"wl-btn-supp":"wl-btn-primary";
  var addLabel=cat==="rest"?"Add Recovery":cat==="supp"?"Add Supplement":"Add";
  var noun=cat==="rest"?"recovery":"supplements";
  var catSum=mine.length?(mine.length+" logged"):"Nothing logged today";var h='<div class="wl-card catcard '+cat+'">'+catHead(cat,title,catSum);
  if(mine.length){mine.forEach(function(x){h+='<div class="wl-sess"><div class="wl-sess-main" style="cursor:default"><span class="wl-sess-type">'+esc(x.a.name||CATLABEL[cat])+'</span></div><button class="wl-icon-btn" data-act="act:del" data-idx="'+x.i+'" data-date="'+date+'">'+I.trash.replace("<svg","<svg width=15 height=15")+'</button></div>';});}

  h+='<button class="wl-btn '+btnClass+' wl-full" style="margin-top:10px" data-act="act:pick" data-cat="'+cat+'">'+I.plus.replace("<svg","<svg width=16 height=16")+addLabel+'</button>';
  return h+'</div>';
}
function actPickHTML(){
  var cat=state.actPick;if(!cat)return "";
  var sel=state.selDate;var pre=normPresets(),log=normActs(sel);
  function onIdx(pr){for(var i=0;i<log.length;i++){if(log[i].name===pr.name&&log[i].cat===pr.cat)return i;}return -1;}
  var items=pre.map(function(p,i){return {p:p,i:i};}).filter(function(x){return x.p.cat===cat;}).sort(function(a,b){return (a.p.name||"").toLowerCase().localeCompare((b.p.name||"").toLowerCase());});
  var h='<div class="wl-confirm"><div class="wl-confirm-card">';
  h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px"><div style="font-weight:800;font-size:17px">Add '+(cat==="rest"?"recovery":"supplement")+'</div><button class="wl-icon-btn" data-act="actpick:close">✕</button></div>';
  h+='<div class="wl-hint" style="margin-bottom:14px">'+fmtLong(parseISO(sel))+(sel===todayISO()?" · Today":"")+' — tap to add or remove.</div>';
  h+='<div class="wl-preset-list">';
  items.forEach(function(x){var on=onIdx(x.p)>=0;h+='<button class="wl-achip '+cat+(on?" on":"")+'" data-act="act:toggle" data-idx="'+x.i+'" data-date="'+sel+'"><span class="wl-chip-ic">'+(on?"✓":"")+'</span>'+esc(x.p.name||CATLABEL[cat])+'</button>';});
  if(state.actAddCat===cat)h+='<span class="wl-mgchip '+cat+'"><input class="wl-mgchip-input" id="wl-addact-'+cat+'" placeholder="name…" autocomplete="off"><button class="wl-mgchip-x" data-act="act:addcat" data-cat="'+cat+'">✓</button></span>';
  else h+='<button class="wl-achip other" data-act="act:addopen" data-cat="'+cat+'">＋ Add new</button>';
  h+='</div>';
  h+='<button class="wl-btn wl-btn-primary wl-full" style="margin-top:16px" data-act="actpick:close">Done</button>';
  return h+'</div></div>';
}
function view_train(){
  var d=state.selDate;var cf=state.cardioForm;
  var h='<div class="wl-stack">'+dayBarHTML();
  var sess=((state.training.sessions||{})[d]||[]).filter(function(s){return s.kind==="cardio";});
  var lsess=((state.training.liftSessions||{})[d]||[]);
  var carMins=0;sess.forEach(function(s){carMins+=(num(s.mins)||0);});
  var carSum=sess.length?(sess.length+(sess.length>1?" sessions":" session")+(carMins?" · "+carMins+" min":"")):"No cardio logged";
  var liftSum=state.workout?"Workout in progress":(lsess.length?(lsess.length+(lsess.length>1?" sessions":" session")):"No training logged");
  h+='<div class="wl-card catcard lift">'+catHead("lift","Weight Training",liftSum);
  if(state.workout){var wp=state.workout.paused;h+='<button class="wl-inprogress'+(wp?" partial":"")+'" data-act="wo:resumeask"><span><span class="wl-ip-dot'+(wp?" pauseddot":"")+'"></span>'+esc(state.workout.name||"Workout")+'</span><span class="wl-ip-badge'+(wp?" partial":"")+'">'+(wp?"Partial ›":"In Progress ›")+'</span></button>';}
  if(lsess.length){lsess.forEach(function(s){var meta=[];meta.push((s.mode==="full"?"logged":"quick"));if(s.mins)meta.push(s.mins+" min");if(s.hr)meta.push("HR "+s.hr+(s.hrMax?"/"+s.hrMax:""));if(s.rpe)meta.push("RPE "+s.rpe);if(s.cal)meta.push("~"+s.cal+" cal");
    h+='<div class="wl-sess"><button class="wl-sess-main" data-act="lift:view" data-id="'+s.id+'"><span class="wl-sess-type">'+esc(s.name||"Weight training")+'</span><span class="wl-sess-meta">'+meta.join("  ·  ")+'</span></button><button class="wl-icon-btn" data-act="lift:del" data-id="'+s.id+'">'+I.trash.replace("<svg","<svg width=15 height=15")+'</button></div>';});}
  h+='<button class="wl-btn wl-btn-lift wl-full" style="margin-top:10px" data-act="wt:add">'+I.plus.replace("<svg","<svg width=16 height=16")+'Add Weight Training</button></div>';
  h+='<div class="wl-card catcard car">'+catHead("car","Cardio",carSum);
  if(sess.length){sess.forEach(function(s){var meta=[];meta.push(s.mins+" min");if(s.zone)meta.push("Zone "+s.zone);if(s.hr)meta.push("HR "+s.hr+(s.hrMax?"/"+s.hrMax:""));else if(s.hrMax)meta.push("peak "+s.hrMax);if(s.rpe)meta.push("RPE "+s.rpe);if(s.cal)meta.push("~"+s.cal+" cal");
    h+='<div class="wl-sess"><button class="wl-sess-main" data-act="cardio:edit" data-id="'+s.id+'"><span class="wl-sess-type">'+esc(s.type||"Cardio")+'</span><span class="wl-sess-meta">'+meta.join("  ·  ")+'</span></button><button class="wl-icon-btn" data-act="cardio:del" data-id="'+s.id+'">'+I.trash.replace("<svg","<svg width=15 height=15")+'</button></div>';});}
  h+='<button class="wl-btn wl-btn-cardio wl-full" style="margin-top:10px" data-act="cardio:add">'+I.plus.replace("<svg","<svg width=16 height=16")+'Add Cardio</button></div>';

  h+=actCatCardHTML("rest","Recovery",d);
  h+=glpCardHTML();
  return h+'</div>';
}
function settingsHubHTML(){var f=state.settings;var strat=strategyMode();var sl=strat==="gain"?"Lean Bulk":strat==="maintain"?"Maintenance":"Fat Loss";var cal=num(f.targetCalories);
  var pv={};
  pv.profile=(f.name&&(""+f.name).trim())?esc((""+f.name).trim())+(num(f.age)!=null?" \u00b7 "+num(f.age):"")+" \u00b7 "+(f.units||"lbs"):"Set up your profile";
  var tv=num(f.targetValue);var paceStr=(tv!=null&&strat!=="maintain")?(f.targetType==="percent_bw_per_week"?tv+"%/wk":tv+" "+(f.units||"lbs")+"/wk"):null;
  pv.strategy=sl+(paceStr?" \u00b7 "+paceStr:"")+(cal!=null?" \u00b7 "+cal.toLocaleString()+" cal":"");
  var lg=num(f.liftSessGoal),cg=num(f.cardioMinGoal),sg=num(f.stepsGoal);var gp=[];
  if(lg!=null)gp.push(lg+" lifts");if(cg!=null)gp.push(cg+" min");if(sg!=null)gp.push(Math.round(sg/1000)+"k steps");
  pv.goals=gp.length?gp.join(" \u00b7 "):"Set weekly goals";
  pv.glp=(state.glp&&state.glp.settings&&state.glp.settings.enabled)?(glpCompoundSummary()||"On"):"Off";
  pv.coach="Coach Max"+(f.reminderTime?" \u00b7 reminder "+esc(f.reminderTime):"");
  var th=(THEMES[f.theme]||THEMES.dark||{});pv.appearance=(th.label||"Dark")+" mode";
  var st=statusFor(todayISO());pv.away=st?((st.status.type==="vacation"?"Vacation":"Recovery")+" mode active"):"No status set";
  pv.sync=syncOn()?"Connected":"Not set up";
  pv.data="Export \u00b7 import \u00b7 restore";
  pv.about="v"+APP_BUILD;
  var rows=[["profile",I.user,"Profile"],["strategy",I.compass,"Strategy"],["goals",I.target,"Goals"],["glp",I.syringe,"GLP-1 & Peptides"],["coach",I.coach,"Coach"],["appearance",I.palette,"Appearance"],["away",I.palm,"Away & Recovery"],["sync",I.sync,"Sync & Devices"],["data",I.database,"Data & Backup"],["about",I.info,"About & Reset"]];
  return '<div class="wl-card" style="padding:6px 4px">'+rows.map(function(r){return '<button class="wl-hubrow" data-act="set:page" data-page="'+r[0]+'"><span class="wl-hubic">'+r[1]+'</span><span class="wl-hubl"><span class="wl-hubt">'+r[2]+'</span><span class="wl-hubs">'+pv[r[0]]+'</span></span><span class="wl-hubgo">\u203a</span></button>';}).join("")+'</div>';}
function view_settings(){
  applyAutoMacros();
  var f=state.settings;var u=f.units;
  var op=state.open||{};
  var h='<div class="wl-stack">';
  var pg=state.setPage||"";
  if(!pg){h+=settingsHubHTML();}
  else{var _bk=(pg==="glpcompound")?{act:"glp:compoundback",lbl:"GLP-1 & Peptides"}:{act:"set:back",lbl:"Settings"};h+='<div><button class="wl-btn wl-btn-ghost" style="width:auto;padding:8px 14px;margin-bottom:2px" data-act="'+_bk.act+'">\u2039 '+_bk.lbl+'</button></div>';}
  if(pg==="profile"){
  var profOpen=!!op.profile;
  h+='<div class="wl-card"><button class="wl-collapse-head" data-act="card:toggle" data-card="profile"><span>My Profile'+(profileComplete()?'':' <span class="wl-req">Required</span>')+'</span><span class="wl-chevron'+(profOpen?" open":"")+'">›</span></button>';
  if(profOpen){h+='<div class="wl-collapse-body">';
    if(!profileComplete())h+='<div class="wl-hint" style="margin-bottom:12px">Fill this out first — calorie and macro targets need it.</div>';
    h+='<label class="wl-field wl-field-full"><span>Your name</span><input type="text" data-set="name" value="'+esc(f.name||"")+'" placeholder="e.g. Alex" autocapitalize="words" autocorrect="off"></label>';
    h+='<label class="wl-field wl-field-full" style="margin-top:12px"><span>Units</span><div class="wl-seg">'+["lbs","kg"].map(function(x){return '<button class="'+(u===x?"on":"")+'" data-act="set:units" data-units="'+x+'">'+x+'</button>';}).join("")+'</div></label>';
    h+='<label class="wl-field wl-field-full" style="margin-top:12px"><span>Sex</span><div class="wl-seg"><button class="'+(f.sex==="male"?"on":"")+'" data-act="set:sex" data-sex="male">Male</button><button class="'+(f.sex==="female"?"on":"")+'" data-act="set:sex" data-sex="female">Female</button></div></label>';
    h+='<div class="wl-row" style="margin-top:12px"><label class="wl-field"><span>Age</span><input class="wl-num" data-int="1" data-set="age" type="text" inputmode="numeric" value="'+esc(f.age||"")+'" placeholder="—"></label><label class="wl-field"><span>Height (ft)</span><input class="wl-num" data-int="1" data-set="heightFt" type="text" inputmode="numeric" value="'+esc(f.heightFt||"")+'" placeholder="ft"></label><label class="wl-field"><span>(in)</span><input class="wl-num" data-int="1" data-set="heightIn" type="text" inputmode="numeric" value="'+esc(f.heightIn||"")+'" placeholder="in"></label></div>';
    h+='<div class="wl-row" style="margin-top:12px"><label class="wl-field"><span>Starting weight ('+u+')</span><input class="wl-num" type="text" inputmode="decimal" data-set="startingWeight" value="'+esc(f.startingWeight)+'" placeholder="—"></label><label class="wl-field"><span>Start date</span><input type="date" data-set="startDate" max="'+todayISO()+'" value="'+esc(f.startDate)+'"></label></div>';
    h+='<label class="wl-field wl-field-full" style="margin-top:12px"><span>Max heart rate <em>bpm, optional</em></span><input class="wl-num" data-int="1" type="text" inputmode="numeric" data-set="maxHR" value="'+esc(f.maxHR||"")+'" placeholder="'+(estMaxHR()!=null?estMaxHR():"e.g. 185")+'"></label>';
    h+='<div class="wl-hint">'+(estMaxHR()!=null?"Estimated ~"+estMaxHR()+" bpm from your age (208 − 0.7 × age).":"Add your age above to estimate this.")+' Auto-assigns cardio zones from avg HR.</div>';
    h+='<label class="wl-field wl-field-full" style="margin-top:12px"><span>Resting heart rate <em>bpm, optional</em></span><input class="wl-num" data-int="1" type="text" inputmode="numeric" data-set="restingHR" value="'+esc(f.restingHR||"")+'" placeholder="e.g. 58"></label>';
    h+='<div class="wl-hint">Taken lying still, before you get up. With a max and a resting heart rate the zones are placed by heart-rate reserve (Karvonen) — effort above rest, not above zero.</div>';
    var zmManual=f.zoneMethod==="manual";
    h+='<div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--faint);font-weight:600;margin:16px 0 8px">Cardio zones</div>';
    h+='<div class="wl-seg wl-seg-wide">'+[["auto","Automatic"],["manual","Manual"]].map(function(x){return '<button class="'+(zmManual===(x[0]==="manual")?"on":"")+'" data-act="set:zonemethod" data-zm="'+x[0]+'">'+x[1]+'</button>';}).join("")+'</div>';
    if(zmManual){
      h+='<div class="wl-hint" style="margin-top:8px">The lowest heart rate that counts as each zone. Read them off your watch or your test.</div>';
      h+='<div class="wl-row" style="margin-top:8px">'+[2,3,4,5].map(function(z){return '<label class="wl-field"><span>Zone '+z+'</span><input class="wl-num" data-int="1" type="text" inputmode="numeric" data-set="zoneB'+z+'" value="'+esc(f["zoneB"+z]||"")+'" placeholder="bpm"></label>';}).join("")+'</div>';}
    h+='<div class="wl-hint" id="wl-zoneread" style="margin-top:10px">'+zoneTableHTML()+'</div>';
    h+='<div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--faint);font-weight:600;margin:16px 0 8px">Weekly check-in day</div><div class="wl-daypick">'+WEEKDAYS.map(function(dn,i){return '<button class="wl-day'+((parseInt(f.weekStart,10)||0)===i?" on":"")+'" data-act="set:weekstart" data-day="'+i+'">'+dn+'</button>';}).join("")+'</div><div class="wl-hint">Your week runs '+DAYFULL[parseInt(f.weekStart,10)||0]+' through '+DAYFULL[((parseInt(f.weekStart,10)||0)+6)%7]+'.</div>';
    h+='</div>';}
  h+='</div>';
  }
  if(pg==="strategy"){
  var stratOpen=!!op.strategy;
  h+='<div class="wl-card"><button class="wl-collapse-head" data-act="card:toggle" data-card="strategy"><span>Strategy</span><span class="wl-chevron'+(stratOpen?" open":"")+'">›</span></button>';
  if(stratOpen){h+='<div class="wl-collapse-body">';
    h+='<label class="wl-field wl-field-full"><span>Target weight ('+u+')</span><input class="wl-num" type="text" inputmode="decimal" data-set="goalWeight" value="'+esc(f.goalWeight)+'" placeholder="—"></label>';
    h+='<div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--faint);font-weight:600;margin:16px 0 8px">Activity level</div>';
    var alSel=f.activityLevel;var alOpen=state.actLevelOpen||!alSel;
    if(alOpen)h+='<div class="wl-optlist">'+ALEVELS.map(function(x){var on=alSel===x[0];return '<button class="wl-opt'+(on?" on":"")+'" data-act="set:activity" data-level="'+x[0]+'"><span>'+x[1]+'</span>'+(on?'<span class="wl-opt-ck">'+I.check.replace("<svg","<svg width=15 height=15")+'</span>':'')+'</button>';}).join("")+'</div>';
    else h+='<button class="wl-opt on" data-act="al:change"><span>'+alLabel(alSel)+'</span><span style="color:var(--accent);font-size:13px;font-weight:600">Change</span></button>';
    h+='<div class="wl-hint" style="margin-top:12px"><span id="wl-calread">'+calSummaryHTML()+'</span> <span style="color:var(--faint)">(Mifflin–St Jeor · info only)</span></div>';
    h+='<div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--faint);font-weight:600;margin:16px 0 8px">Strategy '+infoBtn("strategy")+'</div><div class="wl-seg wl-seg-wide">'+[["lose","Fat Loss"],["maintain","Maintenance"],["gain","Lean Bulk"]].map(function(x){return '<button class="'+(strategyMode()===x[0]?"on":"")+'" data-act="set:strategy" data-strat="'+x[0]+'">'+x[1]+'</button>';}).join("")+'</div>';
    h+='<div class="wl-hint" style="margin-top:8px">'+(strategyMode()==="gain"?"Targets a surplus — protein stays high to build muscle.":strategyMode()==="maintain"?"Targets maintenance — protein stays high to hold muscle.":"Targets a deficit — protein stays high to protect muscle.")+'</div>';
    if(strategyMode()!=="maintain"){var gain=strategyMode()==="gain";
      h+='<div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--faint);font-weight:600;margin:16px 0 8px">Weekly '+(gain?"gain":"loss")+' target</div><div class="wl-row" style="align-items:flex-end"><label class="wl-field" style="flex:1"><span>'+(f.targetType==="percent_bw_per_week"?"% / week":u+" / week")+'</span><input class="wl-num" type="text" inputmode="decimal" data-set="targetValue" value="'+esc(f.targetValue)+'" placeholder="—"></label><div class="wl-seg" style="flex:1.25"><button class="'+(f.targetType==="lbs_per_week"?"on":"")+'" data-act="set:ttype" data-type="lbs_per_week">'+u+'/wk</button><button class="'+(f.targetType==="percent_bw_per_week"?"on":"")+'" data-act="set:ttype" data-type="percent_bw_per_week">% BW/wk</button></div></div><div class="wl-hint">'+(f.targetType==="percent_bw_per_week"?"e.g. 1 = "+(gain?"gain":"lose")+" 1% of bodyweight/week.":"e.g. 1 = "+(gain?"gain":"lose")+" 1 "+u+"/week (0.5–1 common).")+'</div>';}
    h+='<label class="wl-field wl-field-full" style="margin-top:16px"><span>Daily calorie target</span><input class="wl-num" data-int="1" type="text" inputmode="numeric" data-set="targetCalories" value="'+esc(f.targetCalories)+'" placeholder="'+(targetIntake()!=null?targetIntake():"complete Profile")+'"></label>';
    h+='<div class="wl-hint" style="margin-top:6px">'+(f.calTargetAuto===false?'Manually set. <button class="wl-link" data-act="cal:usecalc" style="display:inline">Use calculated target</button>':(targetIntake()!=null?'Auto-calculated from your maintenance calories and strategy above. Edit it to override.':'Complete your Profile and target weight to auto-calculate this.'))+'</div>';
    h+='<div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--faint);font-weight:600;margin:16px 0 8px">Macro targets '+infoBtn("protein")+'</div><div class="wl-macrogrid">'+[["targetProtein","Protein","g"],["targetCarbs","Carbs","g"],["targetFat","Fat","g"]].map(function(x){return '<label class="wl-field"><span>'+x[1]+' <em>'+x[2]+'</em></span><input class="wl-num" type="text" inputmode="decimal" data-set="'+x[0]+'" value="'+esc(f[x[0]])+'" placeholder="—"></label>';}).join("")+'</div><div id="wl-macronotice">'+macroNoticeHTML()+'</div><div class="wl-hint"><span id="wl-macropct">'+macroPctHTML()+'</span></div>';
    h+='</div>';}
  h+='</div>';
  }
  if(pg==="goals"){
  h+='<div class="wl-card"><button class="wl-collapse-head" data-act="card:toggle" data-card="goals"><span>Goals</span><span class="wl-chevron'+(op.goals?" open":"")+'">›</span></button>';
  if(op.goals){h+='<div class="wl-collapse-body">';
    h+='<label class="wl-field wl-field-full"><span>Daily steps goal '+infoBtn("steps")+'</span><input class="wl-num" data-int="1" data-set="stepsGoal" type="text" inputmode="numeric" value="'+esc(f.stepsGoal||"")+'" placeholder="—"></label>';
    h+='<div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--faint);font-weight:600;margin:16px 0 8px">Sleep goal</div><div class="wl-row"><label class="wl-field"><span>Hours</span><input class="wl-num wl-goalsleep-h" data-int="1" type="text" inputmode="numeric" placeholder="—" value="'+(num(f.sleepGoal)!=null?Math.floor(num(f.sleepGoal)/60):"")+'"></label><label class="wl-field"><span>Minutes</span><input class="wl-num wl-goalsleep-m" data-int="1" type="text" inputmode="numeric" placeholder="—" value="'+(num(f.sleepGoal)!=null?num(f.sleepGoal)%60:"")+'"></label></div>';
    h+='<div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--faint);font-weight:600;margin:16px 0 8px">Weekly training goals</div>';
    h+='<div class="wl-row"><label class="wl-field"><span>Cardio minutes / week <em>zone 2+</em> '+infoBtn("cardiozone")+'</span><input class="wl-num" data-int="1" data-set="cardioMinGoal" type="text" inputmode="numeric" value="'+esc(f.cardioMinGoal||"")+'" placeholder="—"></label><label class="wl-field"><span>Lifting sessions / week</span><input class="wl-num" data-int="1" data-set="liftSessGoal" type="text" inputmode="numeric" value="'+esc(f.liftSessGoal||"")+'" placeholder="—"></label></div>';
    h+='<div class="wl-hint" style="margin-top:6px">Cardio minutes only count sessions whose average heart rate is zone 2 or higher (a session with no zone logged still counts).</div>';
    h+='</div>';}
  h+='</div>';
  }
  if(pg==="glp"){
  var g=glpNormalize();var gs=g.settings;var en=!!gs.enabled;var dim=en?"":" wl-glp-dim";
  /* master toggle — green, always interactive */
  h+='<div class="wl-glp-list">'+glpToggleRow(I.syringe,"Enable tracking","Replaces Supplements &amp; Meds","glp:enable",en,false)+'</div>';
  /* PROTOCOL — dimmed & inert while master is off, never deleted */
  h+='<div class="wl-glp-sect'+dim+'">Protocol</div>';
  h+='<div class="wl-glp-list'+dim+'">';
  var _cs=glpCompoundSummary();
  h+='<button class="wl-glprow" data-act="glp:compound"><span class="wl-glpic">'+I.pill+'</span><span class="wl-glptxt"><span class="wl-glpt">Compound</span><span class="wl-glps">'+(_cs||"Not set")+'</span></span><span class="wl-glpgo">›</span></button>';
  h+=glpToggleRow(I.history,"Show due date","Next dose shown on Activity","glp:showdue",!!gs.showDueDate,true);
  h+=glpToggleRow(I.summary,"Titration schedule",gs.titration?"On":"Off · doses stay at current level","glp:titration",!!gs.titration,true);
  h+='</div>';
  /* LOGGING */
  h+='<div class="wl-glp-sect'+dim+'">Logging</div>';
  h+='<div class="wl-glp-list'+dim+'">';
  h+=glpToggleRow(I.pin,"Site rotation","Suggests next site","glp:siterot",!!gs.siteRotation,true);
  h+=glpToggleRow(I.overview,"Symptom logging","Charts on Progress","glp:symptoms",!!gs.symptomLogging,true);
  h+='</div>';
  h+='<div class="wl-hint" style="padding:11px 8px 0">Turning this off keeps your history — the card and charts just stop appearing.</div>';
  }
  if(pg==="glpcompound"){
  glpNormalize();var gc=state.glpDraft||state.glp.compound||{};var gcu=gc.unit||"mg";
  h+='<div class="wl-card"><div class="wl-card-head"><span>Compound</span></div>';
  h+='<label class="wl-field wl-field-full"><span>Name</span><input type="text" data-glpc="name" value="'+esc(gc.name||"")+'" placeholder="e.g. Tirzepatide" autocapitalize="words" autocorrect="off"></label>';
  h+='<div class="wl-row" style="margin-top:12px"><label class="wl-field"><span>Dose</span><input class="wl-num" type="text" inputmode="decimal" data-glpc="dose" value="'+esc(gc.dose!=null?gc.dose:"")+'" placeholder="—"></label><label class="wl-field"><span>Cadence <em>days</em></span><input class="wl-num" type="text" inputmode="numeric" data-glpc="cadenceDays" value="'+esc(gc.cadenceDays!=null?gc.cadenceDays:"7")+'" placeholder="7"></label></div>';
  h+='<label class="wl-field wl-field-full" style="margin-top:12px"><span>Unit</span><div class="wl-seg">'+["mg","units","mL"].map(function(x){return '<button class="'+(gcu===x?"on":"")+'" data-act="glp:unit" data-unit="'+x+'">'+x+'</button>';}).join("")+'</div></label>';
  h+='<div class="wl-hint" style="margin-top:8px">One compound only — this is the active protocol. Cadence is rolling: the next dose is due this many days after your last one.</div>';
  h+='<button class="wl-btn wl-btn-primary wl-full" style="margin-top:14px" data-act="glp:compoundsave">Save compound</button>';
  h+='</div>';
  }
  if(pg==="away"){
  var _sf=statusFor(todayISO());
  if(_sf){var _iv=_sf.status.type==="vacation";var _em=_iv?"\ud83c\udfd6\ufe0f":"\ud83e\udd12";var _rng=_sf.status.end?("until "+fmtShort(parseISO(_sf.status.end))):"ongoing";
    h+='<div class="wl-card wl-modecard '+(_iv?"vac":"sick")+'"><div class="wl-card-head"><span>'+_em+' '+(_iv?"Vacation Mode":"Recovery Mode")+'</span><span class="wl-modeon">ON</span></div>';
    h+='<div class="wl-hint" style="margin-bottom:12px">Active '+_rng+' \u2014 check-ins are relaxed and your coach is easing up. '+(_iv?"Enjoy it.":"Rest up and feel better.")+'</div>';
    h+='<div class="wl-row"><button class="wl-btn wl-btn-ghost" style="flex:1" data-act="status:open">Edit</button><button class="wl-btn wl-btn-primary" style="flex:1" data-act="status:endnow">End '+(_iv?"vacation":"recovery")+'</button></div></div>';
  }else{h+='<div class="wl-card"><div class="wl-card-head"><span>Away &amp; recovery '+infoBtn("modes")+'</span></div><div class="wl-hint" style="margin-bottom:10px">Heading out or feeling sick? Set a status so your coach eases up and days still count as checked in.</div><button class="wl-btn wl-btn-ghost wl-full" data-act="status:open">Set a status</button></div>';}
  }
  if(pg==="coach"){
  h+='<div class="wl-card"><button class="wl-collapse-head" data-act="card:toggle" data-card="reminder"><span>Daily reminder</span><span class="wl-chevron'+(op.reminder?" open":"")+'">›</span></button>'+(op.reminder?('<div class="wl-collapse-body">'+
    '<label class="wl-field wl-field-full"><span>Remind me to log at</span><input type="time" id="wl-remind-time" value="'+esc(f.reminderTime||"19:00")+'"></label>'+
    '<button class="wl-btn wl-btn-primary wl-full" style="margin-top:12px" data-act="reminder:add">'+I.calendar.replace("<svg","<svg width=16 height=16")+'Add reminder to Calendar</button>'+
    '<div class="wl-hint" style="margin-top:10px">Tap <b>Add reminder to Calendar</b>, then choose <b>Add All</b> — this creates a daily repeating reminder in your Calendar that notifies you even when the app is closed. (iPhone &amp; iPad don\u2019t let a web app send its own scheduled notifications, so this uses your Calendar instead.) To change the time, pick a new one and add it again, then delete the old event.</div></div>'):'')+'</div>';
  }
  if(pg==="appearance"){
  h+='<div class="wl-card"><button class="wl-collapse-head" data-act="card:toggle" data-card="theme"><span>Appearance</span><span class="wl-chevron'+(op.theme?" open":"")+'">›</span></button>'+(op.theme?('<div class="wl-collapse-body"><div class="wl-theme-grid">'+themeGrid()+'</div></div>'):'')+'</div>';
  }
  if(pg==="data"){
  h+='<div class="wl-card"><button class="wl-collapse-head" data-act="card:toggle" data-card="exportdata"><span>Export data</span><span class="wl-chevron'+(op.exportdata?" open":"")+'">›</span></button>'+(op.exportdata?('<div class="wl-collapse-body">'+expBtnHTML("all","primary","Export all data",'Your full history. CSV is the data — every logged metric, training, and notes. HTML is a readable report.',true)+'</div>'):'')+'</div>';
  }
  var sc=syncCfg();
  if(pg==="sync"){
  if(isOwner()){
  h+=pbAccountCardHTML(op);
  }

  }
  if(pg==="data"){
  if(isOwner())
  h+='<div class="wl-card"><button class="wl-collapse-head" data-act="card:toggle" data-card="backup"><span>Backup &amp; transfer</span><span class="wl-chevron'+(op.backup?" open":"")+'">›</span></button>'+(op.backup?('<div class="wl-collapse-body">'+
    recoveryNoticeHTML()+
    '<div class="wl-row"><button class="wl-btn wl-btn-ghost wl-full" data-act="export">Export / share file</button><button class="wl-btn wl-btn-ghost wl-full" data-act="import">Import file</button></div>'+
    '<div class="wl-row" style="margin-top:10px"><button class="wl-btn wl-btn-ghost wl-full" data-act="copy">Copy backup text</button><button class="wl-btn wl-btn-ghost wl-full" data-act="paste">Restore from text</button></div>'+
    (state.pasteOpen?'<textarea id="wl-paste" placeholder="Paste backup JSON here, then tap Restore" style="width:100%;min-height:120px;margin-top:10px;background:var(--bg2);border:1px solid var(--line);border-radius:10px;color:var(--text);font-family:var(--mono);font-size:13px;padding:10px;box-sizing:border-box;outline:none"></textarea><div class="wl-row" style="margin-top:8px"><button class="wl-btn wl-btn-ghost wl-full" data-act="paste:cancel">Cancel</button><button class="wl-btn wl-btn-primary wl-full" data-act="paste:do">Restore</button></div>':'')+
    '<div class="wl-hint">Your data lives only on this device. To move or sync it: <b>Export</b> (or <b>Copy</b>) a backup, drop it in your Dropbox/Synology folder, then <b>Import</b> (or paste) it on your other device. On iPad, Export opens the Share sheet so you can pick Save to Files.</div></div>'):'')+'</div>';
  h+='<div class="wl-card"><button class="wl-collapse-head" data-act="card:toggle" data-card="pbkphotos"><span>Progress photos <em>device only</em></span><span class="wl-chevron'+(op.pbkphotos?" open":"")+'">›</span></button>'+(op.pbkphotos?('<div class="wl-collapse-body">'+
    '<div class="wl-hint" style="display:flex;justify-content:space-between;align-items:center;margin:0 0 12px"><span>On this device</span><span class="wl-count" id="wl-pbk-count">…</span></div>'+
    '<button class="wl-btn wl-btn-primary wl-full" data-act="pbk:export">Export progress photos</button>'+
    '<div class="wl-row" style="margin-top:10px"><button class="wl-btn wl-btn-ghost wl-full" data-act="pbk:import">Import progress photos</button></div>'+
    '<div class="wl-hint" style="margin-top:10px">Your progress photos sync privately to your own server, so they follow you to any device you log in on. Only you can see them — never the coach. <b>Export</b> bundles them into one file; tap <b>Save to Files</b> to keep it. <b>Import</b> restores them from that file on any device.</div>'+
    '</div>'):'')+'</div>';
  }
  if(pg==="about"){
  h+='<div class="wl-card"><div class="wl-card-head"><span>App <em>version '+APP_BUILD+'</em></span></div>'+
    '<button class="wl-btn wl-btn-primary wl-full" data-act="app:update">Update app to latest</button>'+
    '<div class="wl-hint" style="margin-top:10px">Loads the newest version published to GitHub without re-adding to your Home Screen. Publish your change, wait ~1 minute for GitHub to build, then tap this. Your data and login stay put. After it reloads, check the version number above changed.</div></div>';
  h+='<div class="wl-card wl-danger"><div class="wl-card-head"><span>Reset</span></div>';
  if(!state.confirmReset)h+='<button class="wl-btn wl-btn-danger wl-full" data-act="reset:ask">'+I.trash.replace("<svg","<svg width=16 height=16")+'Erase all data</button>';
  else h+='<div class="wl-hint">This permanently deletes every weigh-in, food entry, step count, activity, and setting. This can\'t be undone.</div><div class="wl-row"><button class="wl-btn wl-btn-ghost wl-full" data-act="reset:cancel">Cancel</button><button class="wl-btn wl-btn-danger wl-full" data-act="reset:do">Yes, erase everything</button></div>';
  h+='</div>';
  }
  h+='<div style="text-align:center;margin-top:6px"><button class="wl-btn wl-btn-ghost" style="display:inline-block;width:auto;padding:9px 18px" data-act="ob:start">Replay first-time setup</button></div>';
  h+='<div style="text-align:center;padding:26px 0 8px">'+'<div style="display:inline-flex;align-items:center;gap:9px">'+BRANDMARK.replace("width=\"18\" height=\"18\"","width=\"26\" height=\"26\"")+'<span class="wl-brandword">COMPOUND</span></div>'+'<div style="color:var(--faint);font-size:10px;margin-top:9px;letter-spacing:.22em;text-transform:uppercase">Strength · in reps · over years</div>'+'<div style="color:var(--faint);font-size:11px;margin-top:5px;letter-spacing:.02em;font-family:var(--mono)">v'+APP_BUILD+'</div></div>';
  return h+'</div>';
}
