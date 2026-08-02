/* ================= M8 RECOVERY BUILD (SYNC_SAFE) =================
   Contract §7 (B8): ZERO training network activity — no pushes, no pulls,
   no adoption, no CAS traffic, and no m8-originated record READS. Local
   editing fully functional; dirty accumulates; a visible banner explains. */
var SYNC_SAFE=true;
m8Push=function(){try{setSync("error","recovery build — training sync paused");}catch(e){}};
m8Pull=function(cb){try{setSync("error","recovery build — training sync paused");}catch(e){}cb&&cb();};
m8Bootstrap=function(cb){cb&&cb(false);};
m8CasCommit=function(er,t,k,cb){cb({st:"transport"});};
m8ResolveJournal=function(j,cb){cb&&cb();/* journal preserved untouched; no fetch */};
m8Boot=function(cb){cb&&cb();/* no reconciliation reads or writes in recovery */};
trainingPull=function(cb){cb&&cb();/* the training path performs NO fetch at all */};
trainingPush=function(){};
(function(){
  var origRender=render;
  render=function(){origRender();
    if(!document.getElementById("m8-recovery-banner")){
      var b=document.createElement("div");b.id="m8-recovery-banner";
      b.style.cssText="position:fixed;top:0;left:0;right:0;z-index:9999;background:#b45309;color:#fff;font:700 12px/1.4 -apple-system,sans-serif;text-align:center;padding:6px 10px";
      b.textContent="Recovery build — training saves stay on this device until a fixed version ships";
      document.body.appendChild(b);}};
})();
/* =============== end M8 RECOVERY BUILD =============== */