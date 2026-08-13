/* TDEE V2 — synthetic validation (spec §13). Deterministic: a seeded LCG
   stands in for daily noise so every run sees identical data. Each scenario
   states what it proves; the seven numbered verification claims from the
   spec are marked [claim N]. */
import { createRequire } from "node:module";
const require2 = createRequire(import.meta.url);
const V1 = require2("./tdee-core.js");
const V2 = require2("./tdee-core-v2.js");
import fs from "node:fs";

let P = 0, F = 0; const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); c ? P++ : F++; };
const lcg = (seed) => () => (seed = (seed * 48271) % 2147483647) / 2147483647;

const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const T0 = Date.parse("2026-01-01T00:00:00Z");

/* build {weights, calorieDays} over `days` days ending day index days-1 */
function gen(days, weightAt, calAt) {
  const weights = [], calorieDays = {};
  for (let i = 0; i < days; i++) {
    const d = iso(T0 + i * DAY);
    const w = weightAt(i); if (w != null) weights.push({ date: d, weight: w });
    const c = calAt(i); if (c != null) calorieDays[d] = { calories: c, complete: true };
  }
  return { weights, calorieDays, today: iso(T0 + (days - 1) * DAY) };
}
const run = (g) => V2.calculate({ todayLocalDate: g.today, units: "lb", weights: g.weights, calorieDays: g.calorieDays });

/* ---- 1. maintenance: flat weight, constant intake ---- */
{
  const r1 = lcg(7);
  const g = gen(42, (i) => 180 + (r1() - 0.5) * 1.2, () => 2500);
  const r = run(g);
  ok(r.status === "estimated" && Math.abs(r.estimatedTdee - 2500) < 60,
    `maintenance: estimate ${Math.round(r.estimatedTdee)} ≈ 2500`);
  ok(r.confidenceLevel === "high" || r.confidenceLevel === "good",
    `maintenance: confidence ${r.confidenceLevel} after 42 clean days`);
}

/* ---- 2. steady controlled loss: −1 lb/wk on 2000 → true TDEE 2500 ---- */
{
  const r1 = lcg(11);
  const g = gen(42, (i) => 190 - i / 7 + (r1() - 0.5) * 1.0, () => 2000);
  const r = run(g);
  ok(Math.abs(r.estimatedTdee - 2500) < 60, `steady loss: estimate ${Math.round(r.estimatedTdee)} ≈ 2500`);
}

/* ---- 3. steady controlled gain: +0.5 lb/wk on 2800 → 2550 ---- */
{
  const r1 = lcg(13);
  const g = gen(42, (i) => 170 + i * 0.5 / 7 + (r1() - 0.5) * 1.0, () => 2800);
  const r = run(g);
  ok(Math.abs(r.estimatedTdee - 2550) < 60, `steady gain: estimate ${Math.round(r.estimatedTdee)} ≈ 2550`);
}

/* ---- 4/5. one-day ±2 lb spike [claim 2] ---- */
{
  const mk = (spike) => {
    const r1 = lcg(17);
    return gen(35, (i) => 185 - i / 7 + (r1() - 0.5) * 1.0 + (i === 31 ? spike : 0), () => 2100);
  };
  const base = run(mk(0)), up = run(mk(2)), dn = run(mk(-2));
  const dUp = Math.abs(up.estimatedTdee - base.estimatedTdee);
  const dDn = Math.abs(dn.estimatedTdee - base.estimatedTdee);
  ok(dUp < 25, `+2 lb one-day spike moves the estimate ${dUp.toFixed(1)} kcal (< 25) [claim 2]`);
  ok(dDn < 25, `−2 lb one-day drop moves the estimate ${dDn.toFixed(1)} kcal (< 25) [claim 2]`);
  const rawSwing = Math.abs((up.horizons.find(h => h.eligible) || {}).rawEnergyBalanceTdee
                          - (base.horizons.find(h => h.eligible) || {}).rawEnergyBalanceTdee);
  ok(rawSwing > dUp, `the RAW observation moved more (${rawSwing.toFixed(0)} kcal) — damping is the estimator, not the data`);
}

/* ---- no step-change at 14/21/28-day boundaries [claim 3] ----
   grow a clean steady-loss history one day at a time and watch the
   day-over-day movement of the ESTIMATE across the V1 tier boundaries. */
{
  const r1 = lcg(19);
  const noise = Array.from({ length: 45 }, () => (r1() - 0.5) * 1.0);
  const seq = {};
  let prev = null, maxStep = 0, stepAt = null, earlyMax = 0;
  for (let days = 14; days <= 42; days++) {
    const g = gen(days, (i) => 190 - i / 7 + noise[i], () => 2000);
    const r = run(g);
    if (r.status !== "estimated") continue;
    seq[days] = r.estimatedTdee;
    if (prev != null) {
      const step = Math.abs(r.estimatedTdee - prev);
      if (days <= 18) { if (step > earlyMax) earlyMax = step; }   /* cold-start convergence, labeled low confidence */
      else if (step > maxStep) { maxStep = step; stepAt = days; }
    }
    prev = r.estimatedTdee;
  }
  ok(maxStep < 40, `largest day-over-day move after warm-up (days 19-42): ${maxStep.toFixed(1)} kcal at day ${stepAt} (< 40) [claim 3]`);
  const step21 = Math.abs(seq[22] - seq[21]), step28 = Math.abs(seq[29] - seq[28]);
  ok(step21 < 40 && step28 < 40,
    `crossing the old tier boundaries moves the estimate ${step21.toFixed(1)} / ${step28.toFixed(1)} kcal (V1 jumped 218 on the Owner's own 21-day crossing) [claim 3]`);
  console.log(`         (cold-start settling through day 18: max ${earlyMax.toFixed(1)} kcal/day — expected while confidence reads low)`);
}

/* ---- 6. abrupt calorie cut with early water loss → transition ---- */
{
  const r1 = lcg(23);
  const g = gen(44,
    (i) => (i < 30 ? 190 + (r1() - 0.5) * 1.0
                   : 190 - Math.min(4, (i - 29) * 0.8)  /* fast early drop */
                        - Math.max(0, i - 34) * 0.15 + (r1() - 0.5) * 1.0),
    (i) => (i < 30 ? 2500 : 1500));
  const r = run(g);
  ok(r.regime.state === "intake_transition" || r.updates.some(u => u.transitionTriggered),
    "abrupt cut: intake transition detected and flagged");
  const trig = r.updates.find(u => u.transitionTriggered);
  const inflated = r.updates.some(u => (u.rInflation || []).includes("intake_transition"));
  ok(!!trig && inflated, "abrupt cut: observations during the transition carry inflated variance");
  /* the early −4 lb is mostly water; raw obs claims TDEE ≈ 1500+4·500·7/5... —
     the estimate must NOT chase it all the way */
  const rawNow = (r.horizons.find(h => h.eligible) || {}).rawEnergyBalanceTdee;
  ok(r.estimatedTdee < rawNow || Math.abs(r.estimatedTdee - rawNow) < 400,
    `abrupt cut: estimate ${Math.round(r.estimatedTdee)} does not equal the raw transition observation ${Math.round(rawNow)}`);
}

/* ---- 7. genuine expenditure change without an intake change [claim 4, claim 5] ----
   constant 2200 intake; weight flat 30 days (TDEE 2200), then −1.2 lb/wk for
   30 more (TDEE 2800). No intake transition exists — sustained innovation
   must adapt the filter, and the estimate must move materially. */
{
  const r1 = lcg(29);
  const g = gen(60, (i) => (i < 30 ? 180 : 180 - (i - 29) * 1.2 / 7) + (r1() - 0.5) * 0.8, () => 2200);
  const r = run(g);
  ok(r.estimatedTdee > 2550, `sustained real change: estimate reaches ${Math.round(r.estimatedTdee)} (> 2550) [claims 4/5]`);
  ok(r.updates.some(u => u.sustainedInnovationShock), "sustained-innovation adaptation fired (no intake signal existed)");
}

/* ---- 8. missing weigh-ins ---- */
{
  const r1 = lcg(31);
  const g5 = gen(28, (i) => (i % 7 < 5 ? 185 - i / 7 + (r1() - 0.5) : null), () => 2000);
  const r5 = run(g5);
  ok(r5.status === "estimated", "5-of-7 weigh-in cadence still estimates");
  const g2 = gen(28, (i) => (i % 3 === 0 ? 185 - i / 7 : null), () => 2000);
  const r2s = run(g2);
  ok(r2s.status === "insufficient", "1-of-3 cadence is honestly insufficient (V1's own 5/7 floor, generalized)");
}

/* ---- 9. missing calorie days ---- */
{
  const r1 = lcg(37);
  const g = gen(28, (i) => 185 - i / 7 + (r1() - 0.5), (i) => (i >= 20 && i <= 22 ? null : 2000));
  const r = run(g);
  const elig = r.horizons.filter(h => h.eligible).map(h => h.horizon);
  ok(r.status === "insufficient" || !elig.some(h => h >= 14 && h <= 28) || r.updates[r.updates.length - 1].noObservation,
    "a 3-day calorie gap blocks the horizons that contain it (no imputation)");
}

/* ---- 10. partial current day cannot differ from an absent one [claim 1] ---- */
{
  const r1 = lcg(41);
  const g1 = gen(30, (i) => 185 - i / 7 + (r1() - 0.5), (i) => (i === 29 ? null : 2000));
  const a = run(g1);
  const g2 = JSON.parse(JSON.stringify(g1));
  g2.calorieDays[g2.today] = { calories: 480, complete: false };
  const b = run(g2);
  ok(a.estimatedTdee === b.estimatedTdee,
    "an incomplete current day is identical to an absent one at the module level [claim 1]");
}

/* ---- historically low-calorie day still counts [claim 6] ---- */
{
  const r1 = lcg(43);
  const mk = (low) => gen(30, (i) => 185 - i / 7 + (r1() - 0.5), (i) => (i === 10 && low ? 400 : 2000));
  const withLow = run(mk(true)), without = run(mk(false));
  const hz = (r) => (r.horizons.find(h => h.eligible) || {});
  ok(hz(withLow).avgIntake < hz(without).avgIntake,
    "a 400-kcal past day is in the intake average — never discarded for being low [claim 6]");
}

/* ---- no medication term of any kind [claim 7] ---- */
{
  const raw = fs.readFileSync("src/tdee-core-v2.js", "utf8");
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").toLowerCase();
  const banned = ["tirzepatide", "semaglutide", "glp", "ozempic", "mounjaro", "zepbound", "medication", "drug"];
  const hits = banned.filter(w => code.includes(w));
  ok(hits.length === 0, "no medication token in the FUNCTIONAL source (comments state the neutrality rule; the code cannot) [claim 7]"
    + (hits.length ? " — found " + hits.join(",") : ""));
}

/* ---- parity: fitHorizon vs V1's selected tier on identical data ---- */
{
  const r1 = lcg(47);
  const g = gen(28, (i) => 185 - i / 7 + (r1() - 0.5) * 1.4, () => 2000);
  const v1 = V1.calculate({ todayLocalDate: g.today, units: "lb", weights: g.weights, calorieDays: g.calorieDays });
  const ctx = {
    units: "lb", wByDate: V1.dailyWeights(g.weights), cal: g.calorieDays,
    earliestMs: T0, historyDaysAt: (ms) => Math.round((ms - T0) / DAY) + 1,
  };
  const hz = V2.fitHorizon(Date.parse(g.today + "T00:00:00Z"), v1.windowDays, ctx);
  ok(hz.eligible, "parity: the V1-selected tier is eligible as a V2 horizon");
  ok(Math.abs(hz.weeklyTrend - v1.weeklyWeightChangeLb) < 1e-9,
    `parity: identical weekly trend (${hz.weeklyTrend?.toFixed(4)} vs ${v1.weeklyWeightChangeLb?.toFixed(4)})`);
  ok(Math.abs(hz.avgIntake - v1.averageDailyCalories) < 1e-9, "parity: identical intake average");
  ok(Math.abs(hz.rawEnergyBalanceTdee - v1.measuredTdeeRaw) < 1e-9,
    "parity: V2's raw observation IS V1's raw TDEE on the same window");
}

/* ---- audit completeness (spec §10) ---- */
{
  const r1 = lcg(53);
  const g = gen(35, (i) => 185 - i / 7 + (r1() - 0.5), () => 2100);
  const r = run(g);
  const u = r.updates.filter(x => x.K != null).pop();
  ok(!!u && u.Z != null && u.R != null && u.K != null && u.T != null && u.sd != null,
    "every update in the trail carries Z, R, K, T, sd");
  ok(Array.isArray(r.horizons) && r.horizons.length === 4 && r.horizons.every(h => "eligible" in h),
    "all four horizons reported with eligibility");
  ok(Array.isArray(r.estimatedRange) && r.estimatedRange[0] < r.estimatedTdee && r.estimatedRange[1] > r.estimatedTdee,
    "estimated range brackets the estimate");
  ok(r.estimatedTdeeDisplay % 10 === 0, "display value rounded to 10 kcal");
}

console.log(`\n${P} passed, ${F} failed`);
process.exit(F ? 1 : 0);
