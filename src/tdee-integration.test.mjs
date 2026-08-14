/* Exercise the built code path: TDEECore as inlined in index.html, driven
   through the tdeeWindow adapter's logic against the SYNTHETIC owner-shaped
   snapshot (src/fixtures/owner-snapshot.json — invented values on a fake
   profile; regenerated 2026-08-13 when the original real-data fixture was
   removed from the public repository). Expected values below were captured
   mechanically from this fixture. */
import fs from "node:fs";
const html=fs.readFileSync("index.html","utf8");
const b=html.indexOf("/* ==BUILD:tdee-core.js== */"), e=html.indexOf("/* ==BUILD-END:tdee-core.js== */");
const mod=html.slice(b,e);
const globalObj={};
new Function("globalThis_", mod.replace("typeof globalThis !== \"undefined\" ? globalThis : this","globalThis_"))(globalObj);
const TDEECore=globalObj.TDEECore;
if(!TDEECore) throw new Error("TDEECore did not attach from the inlined build");
console.log("module loaded from index.html:", typeof TDEECore.calculate === "function");

const raw=JSON.parse(fs.readFileSync("src/fixtures/owner-snapshot.json","utf8"));
const isSkip=(d,k)=>!!((raw.skips||{})[d]&&(raw.skips||{})[d][k]);
const calorieDays={};
for(const [d,v] of Object.entries(raw.food)) if(v.calories!=null && !isSkip(d,"calories")) calorieDays[d]={calories:v.calories,complete:true};
const offPlan=[];
for(const s of raw.statuses){ if(!s||!s.start)continue; let cur=s.start; const end=s.end||s.start;
  while(cur<=end){offPlan.push(cur); const dd=new Date(cur+"T00:00:00Z"); dd.setUTCDate(dd.getUTCDate()+1); cur=dd.toISOString().slice(0,10);} }
const r=TDEECore.calculate({todayLocalDate:"2019-03-04",units:raw.units==="kg"?"kg":"lb",
  weights:raw.weights.map(x=>({date:x.date,weight:x.weight})),calorieDays,offPlanDates:offPlan,
  formulaTdee:2600,now:"2019-03-05T00:00:00.000Z"});

let P=0,F=0; const ok=(c,m)=>{console.log((c?"  PASS  ":"  FAIL  ")+m);c?P++:F++;};
ok(r.status==="provisional","status provisional (matches the preview)");
ok(r.measuredTdeeDisplay===2874,"measured TDEE 2874, got "+r.measuredTdeeDisplay);
ok(Math.abs(r.weeklyWeightChangeLb-(-2.2431))<0.01,"trend -2.24/wk");
ok(r.confidenceFlags.includes("low_confidence_short_window"),"low-confidence flag present");
ok(r.measuredTdeeRaw!==r.measuredTdeeDisplay,"raw precision retained separately");
const rel=r.tierAttempts.find(a=>a.status==="reliable");
ok(rel&&rel.eligible===false&&rel.longestMissingRun===3,"reliable blocked by the 3-day gap");
// the card's own derived values
ok(Math.round(r.averageDailyCalories)===1752,"intake 1752");
/* the SELECTED tier is 14/14 complete, so zero exclusions is correct here —
   the 3-day gap lives in the rejected 21-day window, which tierAttempts
   records. Assert the audit surface exists and the rejection is explained. */
ok(Array.isArray(r.excludedOrIncompleteDays),"exclusions array present");
ok(r.excludedOrIncompleteDays.length===0,"none in the selected window (14/14 complete)");
ok(r.tierAttempts.some(a=>a.longestMissingRun===3),"the 3-day gap is recorded against the tier it blocked");
ok(typeof r.calculatedAt==="string"&&r.windowStartLocalDate&&r.windowEndLocalDate,"audit fields populated");
console.log(`\n${P} passed, ${F} failed`);
process.exit(F?1:0);
