/* TDEE V2 spec §1 — the in-progress-day bug, tested against the SHIPPED
   bytes: both TDEECore and the tdeeWindow adapter are read out of
   index.html's inlined build, so what passes here is what the phone runs.

   The claims under test (spec §13, verification 1 and 6):
     1. an unfinished current day cannot change measured TDEE — not through
        the average, not through the complete-day count;
     2. finalizing the day (a live recap) admits it;
     3. a historically low-calorie PAST day still counts — completeness is
        never inferred from the value;
     4. skip semantics are unchanged. */
import fs from "node:fs";

const html = fs.readFileSync("index.html", "utf8");
function inlined(name) {
  const b = html.indexOf(`/* ==BUILD:${name}== */`), e = html.indexOf(`/* ==BUILD-END:${name}== */`);
  if (b < 0 || e < 0) throw new Error(`marker ${name} not found`);
  return html.slice(b, e);
}

/* TDEECore from the build */
const coreObj = {};
new Function("globalThis_", inlined("tdee-core.js")
  .replace('typeof globalThis !== "undefined" ? globalThis : this', "globalThis_"))(coreObj);
const TDEECore = coreObj.TDEECore;
if (!TDEECore) throw new Error("TDEECore did not attach");

/* the adapter from the build, instantiated with stubbed app globals.
   Only the globals tdeeWindow/tdeeAnalysis actually touch are provided —
   if the adapter grows a new dependency this test fails loudly. */
const TODAY = "2026-03-30";
function makeApp(state, recapDates) {
  const sandbox = {
    state,
    TDEECore,
    num: (v) => { const n = parseFloat(v); return isFinite(n) ? n : null; },
    isSkip: (d, f) => !!(state.skips && state.skips[d] && state.skips[d][f]),
    dayRecap: (iso) => (recapDates.has(iso) ? { text: "recap" } : null),
    todayISO: () => TODAY,
    toISO: (dd) => dd.toISOString().slice(0, 10),
    parseISO: (s) => new Date(s + "T00:00:00Z"),
    addDays: (dd, n) => { const d2 = new Date(dd); d2.setUTCDate(d2.getUTCDate() + n); return d2; },
    maintenanceCals: () => null,
  };
  const src = inlined("views-weight-summary.js");
  const names = Object.keys(sandbox);
  const fn = new Function(...names, src + "\nreturn { tdeeWindow: tdeeWindow };");
  return fn(...names.map((k) => sandbox[k]));
}

/* fixture: 21 past days of clean logging ending YESTERDAY, plus today */
function fixture() {
  const weights = [], food = {};
  for (let k = 21; k >= 1; k--) {
    const d = new Date(TODAY + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - k);
    const iso = d.toISOString().slice(0, 10);
    weights.push({ date: iso, weight: 190 - (21 - k) * 0.15 });
    food[iso] = { calories: 2000 };
  }
  return { settings: { units: "lbs" }, weights, food, statuses: [], skips: {} };
}

let P = 0, F = 0; const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); c ? P++ : F++; };

/* 1. baseline: today has no entry at all */
const s1 = fixture();
const r1 = makeApp(s1, new Set()).tdeeWindow().core;
ok(r1.status !== "insufficient", "baseline computes (" + r1.status + ")");

/* 2. a partial today (300 cal, no recap) changes NOTHING */
const s2 = fixture(); s2.food[TODAY] = { calories: 300 };
const r2 = makeApp(s2, new Set()).tdeeWindow().core;
ok(r2.measuredTdeeDisplay === r1.measuredTdeeDisplay,
  "unfinished today does not move TDEE (" + r1.measuredTdeeDisplay + " -> " + r2.measuredTdeeDisplay + ")");
ok(r2.completeCalorieDays === r1.completeCalorieDays,
  "unfinished today does not satisfy the complete-day count");
ok(Math.abs(r2.averageDailyCalories - r1.averageDailyCalories) < 1e-9,
  "unfinished today is not in the average");

/* 3. the partial value is irrelevant while unfinished */
const s3 = fixture(); s3.food[TODAY] = { calories: 5000 };
const r3 = makeApp(s3, new Set()).tdeeWindow().core;
ok(r3.measuredTdeeDisplay === r1.measuredTdeeDisplay, "the partial value cannot leak (5000 cal ignored too)");

/* 4. FINALIZING today admits it */
const s4 = fixture(); s4.food[TODAY] = { calories: 300 };
const r4 = makeApp(s4, new Set([TODAY])).tdeeWindow().core;
ok(r4.completeCalorieDays === r1.completeCalorieDays + 1, "a finalized today counts");
ok(r4.averageDailyCalories < r1.averageDailyCalories, "and its calories enter the average");

/* 5. a historically LOW past day still counts — value never infers incompleteness */
const s5 = fixture();
const past = Object.keys(s5.food)[5];
s5.food[past] = { calories: 400 };
const r5 = makeApp(s5, new Set()).tdeeWindow().core;
ok(r5.completeCalorieDays === r1.completeCalorieDays, "a 400-cal past day still counts as complete");
ok(r5.averageDailyCalories < r1.averageDailyCalories, "and genuinely lowers the average");

/* 6. skip semantics unchanged: a skipped past day is out */
const s6 = fixture();
const skipD = Object.keys(s6.food)[3];
s6.skips = { [skipD]: { calories: 1 } };
const r6 = makeApp(s6, new Set()).tdeeWindow().core;
ok(r6.completeCalorieDays === r1.completeCalorieDays - 1, "an explicitly skipped day is not complete");

console.log(`\n${P} passed, ${F} failed`);
process.exit(F ? 1 : 0);
