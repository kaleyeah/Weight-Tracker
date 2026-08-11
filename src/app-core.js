"use strict";
/* ---------------- helpers ---------------- */
var DAY=86400000;
var APP_BUILD="2026-08-11.482-camera-framing";
var PACE_MIN_WEIGHINS=7; /* weigh-ins required before a trend/pace is meaningful; below this a 2-point slope reads as a confident "2 lb/wk" that is pure noise */
var SHOW_TESTBTN=true; /* test-only: manual recap Complete/Regenerate button under the recap. Set false for release. */
var BRANDMARK='<svg viewBox="0 0 100 100" width="18" height="18" aria-hidden="true"><rect x="12" y="56" width="22" height="28" rx="8" fill="#7C93F5"/><rect x="39" y="40" width="22" height="44" rx="8" fill="#9FB0C9"/><rect x="66" y="16" width="22" height="68" rx="8" fill="#F5B544"/></svg>';
var deferredPrompt=null;window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();deferredPrompt=e;});
var photoURLs=[],photoMap={},photoDB=null;
function pad(n){return String(n).padStart(2,"0");}
function hmToMin(s){if(s==null||s==="")return null;var p=(""+s).split(":");var h=parseInt(p[0],10);if(isNaN(h))return null;var m=parseInt(p[1]||"0",10);return h*60+(isNaN(m)?0:m);}
function minToHM(min){if(min==null)return "—";var h=Math.floor(min/60),m=Math.round(min%60);return h+":"+pad(m);}
function minToHMpad(min){if(min==null)return "";var h=Math.floor(min/60),m=Math.round(min%60);return pad(h)+":"+pad(m);}
function sleepGoalMin(){return num(state.settings.sleepGoal);}
function toISO(d){return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());}
function todayISO(){return toISO(new Date());}
function parseISO(s){var p=s.split("-").map(Number);return new Date(p[0],p[1]-1,p[2]);}
function fmtShort(d){return d.toLocaleDateString(undefined,{month:"short",day:"numeric"});}
function fmtLong(d){return d.toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"});}
function fmtFull(d){return d.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});}
function fmtWkRange(s,e){var so=s.toLocaleDateString(undefined,{month:"long",day:"numeric"});return (s.getMonth()===e.getMonth())?(so+" – "+e.getDate()):(so+" – "+e.toLocaleDateString(undefined,{month:"long",day:"numeric"}));}
function num(v){var n=parseFloat(v);return isFinite(n)?n:null;}
function r1(n){return Math.round(n*10)/10;}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
var WEEKDAYS=["Su","Mo","Tu","We","Th","Fr","Sa"];
var DAYS3=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
var DAYFULL=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
var MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
var MONTHS3=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/* ---------------- icons (inline svg) ---------------- */
