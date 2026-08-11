/* Unit tests for the extracted macro core.
 *
 * These cover the properties that matter on their own. The proof that the
 * extraction did not CHANGE anything lives in proposal-parity.mjs (live page vs
 * MacroCore); the proof that the Python port matches lives in the golden file.
 *
 *   node src/macro-core.test.mjs
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const M = require("./macro-core.js");

let passed = 0; const failures = [];
const test = (n, f) => { try { f(); passed++; console.log("  ✓ " + n); }
  catch (e) { failures.push(n); console.log("  ✗ " + n + "\n      " + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || "eq") + ": " + JSON.stringify(a) + " !== " + JSON.stringify(b)); };
const ok = (v, m) => { if (!v) throw new Error(m || "expected truthy"); };

console.log("macro-core");

/* --- protein: the half of the answer that needs no profile --------------- */
test("1 g per lb of TARGET weight, and nothing else is required", () => {
  eq(M.suggestedProteinG({ goalWeight: 175, units: "lbs" }), 175);
});
test("a kg goal converts with the app's own constant", () => {
  eq(M.suggestedProteinG({ goalWeight: 79, units: "kg" }), Math.round(79 * 2.20462));
});
test("no goal weight means no protein figure — never the current weight", () => {
  eq(M.suggestedProteinG({ units: "lbs" }), null);
  eq(M.suggestedProteinG({ goalWeight: null, units: "lbs" }), null);
});

/* --- null propagation: a missing input can never become a number --------- */
test("bmr returns null for each individually missing input", () => {
  const full = { sex: "male", ageYears: 40, heightFt: 5, heightIn: 10, weight: 195, units: "lbs" };
  ok(M.bmr(full) !== null, "the complete case must compute");
  for (const k of ["sex", "ageYears", "heightFt", "weight"]) {
    const partial = Object.assign({}, full); delete partial[k];
    eq(M.bmr(partial), null, "missing " + k);
  }
});
test("null propagates through maintenance and targetIntake", () => {
  eq(M.maintenance({ bmrValue: null, activityLevel: "moderate" }), null);
  eq(M.maintenance({ bmrValue: 1800, activityLevel: undefined }), null);
  eq(M.targetIntake({ maintenanceValue: null, strategy: "lose" }), null);
});
test("an unknown activity level is null, not a silent default", () => {
  eq(M.activityMult("brisk"), null);
  eq(M.activityMult(undefined), null);
  /* guards against Object.prototype keys resolving as levels */
  eq(M.activityMult("constructor"), null);
});

/* --- macros -------------------------------------------------------------- */
test("fat is 20% of calories by default, carbs take the remainder", () => {
  const r = M.suggestedMacros({ calories: 2500, proteinG: 175 });
  eq(r.fat, Math.round(2500 * 0.20 / 9));
  eq(r.carbs, Math.round(Math.max(0, 2500 - 175 * 4 - r.fat * 9) / 4));
  eq(r.fatFloorApplied, false);
});
test("the fat FLOOR engages on a small intake — and says that it did", () => {
  const r = M.suggestedMacros({ calories: 1500, proteinG: 175 });
  eq(r.fat, M.FAT_FLOOR_G);
  /* the floor is Compound's guardrail, not Max's; a caller must be able to
     tell that it moved the number so it can be attributed correctly (R3) */
  eq(r.fatFloorApplied, true);
});
test("the fat band is expressible — 30% is Max's upper end", () => {
  const lo = M.suggestedMacros({ calories: 2500, proteinG: 175, fatPct: 0.20 });
  const hi = M.suggestedMacros({ calories: 2500, proteinG: 175, fatPct: 0.30 });
  ok(hi.fat > lo.fat, "30% must yield more fat than 20%");
  ok(hi.carbs < lo.carbs, "and correspondingly fewer carbs");
});
test("carbs clamp at zero and never go negative", () => {
  const r = M.suggestedMacros({ calories: 800, proteinG: 175 });
  ok(r.carbs >= 0, "carbs were " + r.carbs);
});
test("macros need both calories and protein, or nothing", () => {
  eq(M.suggestedMacros({ calories: null, proteinG: 175 }), null);
  eq(M.suggestedMacros({ calories: 2500, proteinG: null }), null);
});

/* --- the rate → calories path -------------------------------------------- */
test("maintain means no delta, gain is positive, lose is negative", () => {
  const base = { targetType: "lbs_per_week", targetValue: 1, units: "lbs" };
  eq(M.dailyDelta(Object.assign({ strategy: "maintain" }, base)), 0);
  ok(M.dailyDelta(Object.assign({ strategy: "gain" }, base)) > 0);
  ok(M.dailyDelta(Object.assign({ strategy: "lose" }, base)) < 0);
});
test("percent-of-bodyweight needs a current weight, and yields 0 without one", () => {
  eq(M.dailyDeficit({ targetType: "percent_bw_per_week", targetValue: 1, units: "lbs" }), 0);
  ok(M.dailyDeficit({ targetType: "percent_bw_per_week", targetValue: 1, units: "lbs", currentWeight: 195 }) > 0);
});

/* --- the Owner's question, end to end ------------------------------------ */
test("195 lb, goal 175 → 175 g protein regardless of everything else", () => {
  eq(M.suggestedProteinG({ goalWeight: 175, units: "lbs" }), 175);
  const b = M.bmr({ sex: "male", ageYears: 40, heightFt: 5, heightIn: 10, weight: 195, units: "lbs" });
  const m = M.maintenance({ bmrValue: b, activityLevel: "moderate" });
  ok(m > 0, "maintenance computed");
  const t = M.targetIntake({ maintenanceValue: m, strategy: "lose",
    targetType: "percent_bw_per_week", targetValue: 0.75, units: "lbs", currentWeight: 195 });
  ok(t < m, "a lose target must sit under maintenance");
  const mac = M.suggestedMacros({ calories: t, proteinG: 175 });
  eq(mac.protein, 175);
  eq(mac.protein * 4 + mac.carbs * 4 + mac.fat * 9 <= t + 12, true, "macros must add up to the target within rounding");
});

console.log("\n" + passed + " passed, " + failures.length + " failed");
process.exit(failures.length ? 1 : 0);
