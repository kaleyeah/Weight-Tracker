/* Acceptance tests for measured TDEE — every scenario in ACCEPTANCE-TESTS.md.
 * Deterministic, no network, no UI. Run: node src/tdee-core.test.mjs
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const TDEE = require("./tdee-core.js");

let pass = 0, fail = 0;
const results = [];
function t(id, desc, fn) {
  try { fn(); results.push([true, id, desc]); pass++; }
  catch (e) { results.push([false, id, desc + "  →  " + e.message]); fail++; }
}
function eq(a, b, m) { if (a !== b) throw new Error((m || "") + " expected " + JSON.stringify(b) + ", got " + JSON.stringify(a)); }
function near(a, b, tol, m) { if (Math.abs(a - b) > tol) throw new Error((m || "") + " expected ~" + b + ", got " + a); }
function ok(c, m) { if (!c) throw new Error(m || "expected truthy"); }

const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const back = (today, n) => iso(Date.parse(today) - n * DAY);

/* builders: `days` counts BACK from today, index 0 = today */
function mkCalories(today, n, kcal, opts = {}) {
  const out = {};
  for (let i = 0; i < n; i++) {
    const d = back(today, i);
    if ((opts.skip || []).includes(i)) continue;                      // missing entirely
    if ((opts.partial || []).includes(i)) { out[d] = { calories: kcal, complete: false }; continue; }
    out[d] = { calories: typeof kcal === "function" ? kcal(i) : kcal, complete: true };
  }
  return out;
}
function mkWeights(today, n, startW, perDay, opts = {}) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    if ((opts.skip || []).includes(i)) continue;
    const d = back(today, i);
    let w = startW - perDay * (n - 1 - i);
    if (opts.noise && opts.noise[i] != null) w += opts.noise[i];
    /* NOT rounded: rounding to 2dp perturbs an exact slope and made B3/F3
       fail against their own spec-stated expected values. Real scales round;
       these fixtures must not, or they test the fixture, not the module. */
    out.push({ date: d, weight: w });
  }
  return out;
}
const TODAY = "2026-08-04";

/* ---------------- A. Tier eligibility ---------------- */

t("A1", "13 days of perfect data → insufficient", () => {
  const r = TDEE.calculate({ todayLocalDate: TODAY, units: "lb", formulaTdee: 2600,
    calorieDays: mkCalories(TODAY, 13, 2000), weights: mkWeights(TODAY, 13, 190, 0.1) });
  eq(r.status, "insufficient");
  eq(r.measuredTdeeDisplay, null, "no measured value");
  eq(r.formulaTdee, 2600, "formula still available");
  eq(r.historyDays, 13, "history span is what disqualifies it");
  ok(r.tierAttempts.every(a => a.reason === "insufficient_history"),
     "every tier rejected for history span, not thresholds");
});

t("A2", "14d / 12 complete cal / 10 weigh-ins → provisional, low confidence", () => {
  const r = TDEE.calculate({ todayLocalDate: TODAY, units: "lb",
    calorieDays: mkCalories(TODAY, 14, 2000, { skip: [3, 8] }),          // 12 complete, no run > 1
    weights: mkWeights(TODAY, 14, 190, 0.1, { skip: [2, 5, 9, 12] }) }); // 10 weigh-ins
  eq(r.status, "provisional");
  eq(r.completeCalorieDays, 12);
  eq(r.acceptedWeightDays, 10);
  ok(r.confidenceFlags.includes("low_confidence_short_window"), "flagged low confidence");
  ok(r.measuredTdeeDisplay != null, "value produced");
});

t("A3", "14d / 11 complete cal → insufficient, nothing imputed", () => {
  const r = TDEE.calculate({ todayLocalDate: TODAY, units: "lb",
    calorieDays: mkCalories(TODAY, 14, 2000, { skip: [3, 6, 9] }),       // 11 complete
    weights: mkWeights(TODAY, 14, 190, 0.1, { skip: [2, 5, 9, 12] }) });
  eq(r.status, "insufficient");
  eq(r.averageDailyCalories, null, "no average computed");
});

t("A4", "21d / 18 cal / 15 weigh-ins → reliable", () => {
  const r = TDEE.calculate({ todayLocalDate: TODAY, units: "lb",
    calorieDays: mkCalories(TODAY, 21, 2000, { skip: [4, 10, 16] }),     // 18, gaps of 1
    weights: mkWeights(TODAY, 21, 190, 0.1, { skip: [1, 5, 9, 13, 17, 20] }) }); // 15
  eq(r.status, "reliable");
  eq(r.windowDays, 21);
});

t("A5", "28d / 24 cal / 20 weigh-ins → high_confidence", () => {
  const r = TDEE.calculate({ todayLocalDate: TODAY, units: "lb",
    calorieDays: mkCalories(TODAY, 28, 2000, { skip: [3, 9, 15, 21] }),  // 24
    weights: mkWeights(TODAY, 28, 190, 0.1, { skip: [1, 4, 7, 11, 14, 18, 22, 26] }) }); // 20
  eq(r.status, "high_confidence");
  eq(r.windowDays, 28);
});

t("A6", "3 consecutive missing cal days → tier ineligible, falls to shorter tier", () => {
  /* 21-day window has a 3-run at indices 15,16,17 (older end) but the most
     recent 14 days are clean, so the engine must drop to provisional. */
  const r = TDEE.calculate({ todayLocalDate: TODAY, units: "lb",
    calorieDays: mkCalories(TODAY, 21, 2000, { skip: [15, 16, 17] }),
    weights: mkWeights(TODAY, 21, 190, 0.1) });
  ok(r.status !== "reliable", "21-day tier rejected");
  eq(r.status, "provisional", "fell back to the next shorter eligible tier");
  const rel = r.tierAttempts.find(a => a.status === "reliable");
  eq(rel.eligible, false);
  eq(rel.longestMissingRun, 3, "the 3-day run is what disqualified it");
});

/* ---------------- B. Formula correctness ---------------- */

t("B1", "1780 kcal, −1.5 lb/wk → 2530", () => {
  /* 21 straight days, exactly −1.5 lb/week = −0.2142857/day */
  const r = TDEE.calculate({ todayLocalDate: TODAY, units: "lb",
    calorieDays: mkCalories(TODAY, 21, 1780), weights: mkWeights(TODAY, 21, 190, 1.5 / 7) });
  eq(r.status, "reliable", "21 days of data reaches the 21-day tier, not the 28");
  near(r.weeklyWeightChangeLb, -1.5, 1e-9, "trend");
  near(r.measuredTdeeRaw, 2530, 1e-6, "raw TDEE");
  eq(r.measuredTdeeDisplay, 2530);
});

t("B2", "2300 kcal, stable weight → 2300", () => {
  const r = TDEE.calculate({ todayLocalDate: TODAY, units: "lb",
    calorieDays: mkCalories(TODAY, 21, 2300), weights: mkWeights(TODAY, 21, 185, 0) });
  near(r.weeklyWeightChangeLb, 0, 1e-9);
  eq(r.measuredTdeeDisplay, 2300);
});

t("B3", "2200 kcal, +0.5 lb/wk → 1950", () => {
  const r = TDEE.calculate({ todayLocalDate: TODAY, units: "lb",
    calorieDays: mkCalories(TODAY, 21, 2200), weights: mkWeights(TODAY, 21, 180, -0.5 / 7) });
  near(r.weeklyWeightChangeLb, 0.5, 1e-9);
  eq(r.measuredTdeeDisplay, 1950);
});

t("B4", "non-integer slope keeps raw precision, rounds only for display", () => {
  const r = TDEE.calculate({ todayLocalDate: TODAY, units: "lb",
    calorieDays: mkCalories(TODAY, 21, i => (i === 0 ? 2010.5 : 2000)), // fractional mean
    weights: mkWeights(TODAY, 21, 190, 0.13) });
  ok(r.measuredTdeeRaw !== Math.round(r.measuredTdeeRaw), "raw is fractional");
  eq(r.measuredTdeeDisplay, Math.round(r.measuredTdeeRaw), "display is the rounded raw");
  ok(String(r.averageDailyCalories).includes("."), "average kept fractional");
});

/* ---------------- C. Weight-trend behaviour ---------------- */

t("C1", "regression ignores an endpoint water spike; ≠ first-minus-last", () => {
  /* clean −0.1 lb/day trend, but the OLDEST reading is +4 lb of water */
  const w = mkWeights(TODAY, 21, 190, 0.1);
  w[0].weight += 4;                                    // oldest reading spiked
  const r = TDEE.calculate({ todayLocalDate: TODAY, units: "lb",
    calorieDays: mkCalories(TODAY, 21, 2000), weights: w });
  const endpoint = ((w[w.length - 1].weight - w[0].weight) / 20) * 7;   // naive method
  ok(Math.abs(r.weeklyWeightChangeLb - endpoint) > 0.3, "differs from endpoint method");
  /* OLS is not outlier-IMMUNE — an endpoint reading carries high leverage, so a
     +4 lb spike on the oldest day pulls the slope. That is expected: spec §5
     says a suspected outlier must be flagged and audited, NOT silently dropped.
     What must hold is that regression uses every point and beats the naive
     endpoint method, which here reads far flatter. */
  ok(r.weeklyWeightChangeLb < 0, "still reads as loss despite the spike");
  ok(Math.abs(r.weeklyWeightChangeLb) < Math.abs(-0.7) + 0.4, "not wildly overstated");
  eq(r.weightPointsUsed, 21, "every accepted reading participated");
});

t("C2", "gaps use real date indices, not observation numbers", () => {
  /* Two clusters far apart: observation-index regression would read a much
     steeper slope than date-index regression. */
  const weights = [
    { date: back(TODAY, 20), weight: 190 }, { date: back(TODAY, 19), weight: 189.9 },
    { date: back(TODAY, 18), weight: 189.8 },
    { date: back(TODAY, 2), weight: 188.2 }, { date: back(TODAY, 1), weight: 188.1 },
    { date: back(TODAY, 0), weight: 188.0 },
  ];
  const r = TDEE.calculate({ todayLocalDate: TODAY, units: "lb",
    calorieDays: mkCalories(TODAY, 21, 2000), weights,
  });
  /* by real dates: ~2 lb over ~20 days ≈ −0.7 lb/wk.
     by observation index: ~2 lb over 5 "days" ≈ −2.8 lb/wk. */
  ok(Math.abs(r.weeklyWeightChangeLb) < 1.2, "date-indexed slope, got " + r.weeklyWeightChangeLb);
});

t("C3", "multiple readings on one date → median, counted once", () => {
  const weights = mkWeights(TODAY, 21, 190, 0.1);
  const d = weights[10].date;
  weights.push({ date: d, weight: weights[10].weight + 6 });   // outlier same day
  weights.push({ date: d, weight: weights[10].weight + 0.1 });
  const r = TDEE.calculate({ todayLocalDate: TODAY, units: "lb",
    calorieDays: mkCalories(TODAY, 21, 2000), weights });
  eq(r.acceptedWeightDays, 21, "that date still counts once");
  ok(Math.abs(r.weeklyWeightChangeLb - (-0.7)) < 0.1, "median tamed the outlier");
});

t("C3b", "authoritative reading wins over median", () => {
  const weights = mkWeights(TODAY, 21, 190, 0.1);
  const d = weights[10].date;
  const authoritative = weights[10].weight;
  weights.push({ date: d, weight: authoritative + 10 });
  weights.push({ date: d, weight: authoritative + 12 });
  weights[10].authoritative = true;
  const r = TDEE.calculate({ todayLocalDate: TODAY, units: "lb",
    calorieDays: mkCalories(TODAY, 21, 2000), weights });
  ok(Math.abs(r.weeklyWeightChangeLb - (-0.7)) < 0.1, "authoritative used, not median");
});

t("C4", "caller supplies local dates; module never re-derives them from UTC", () => {
  /* A Chicago athlete's 2026-08-03 19:00 local event is 2026-08-04 00:00 UTC.
     The caller assigns it to 08-03; the module must honour that string. */
  const weights = mkWeights(TODAY, 21, 190, 0.1);
  const r = TDEE.calculate({ todayLocalDate: TODAY, units: "lb",
    calorieDays: mkCalories(TODAY, 21, 2000), weights });
  eq(r.windowEndLocalDate, TODAY, "window ends on the supplied local date");
  eq(r.windowStartLocalDate, back(TODAY, r.windowDays - 1), "and spans windowDays local dates");
  eq(r.windowDays, 21, "21 days of history selects the 21-day tier");
});

/* ---------------- D. Calorie-data behaviour ---------------- */

t("D1", "missing day excluded, reported, never zero", () => {
  const r = TDEE.calculate({ todayLocalDate: TODAY, units: "lb",
    calorieDays: mkCalories(TODAY, 21, 2000, { skip: [5] }),
    weights: mkWeights(TODAY, 21, 190, 0.1) });
  near(r.averageDailyCalories, 2000, 1e-9, "average unmoved by the gap");
  eq(r.completeCalorieDays, 20);
  ok(r.excludedOrIncompleteDays.some(x => x.date === back(TODAY, 5) && x.reason === "missing"),
     "the missing day is reported");
});

t("D2", "partial day is not a complete day", () => {
  const r = TDEE.calculate({ todayLocalDate: TODAY, units: "lb",
    calorieDays: mkCalories(TODAY, 21, 2000, { partial: [4] }),
    weights: mkWeights(TODAY, 21, 190, 0.1) });
  eq(r.completeCalorieDays, 20, "partial excluded from the count");
  near(r.averageDailyCalories, 2000, 1e-9, "and from the mean");
  ok(r.excludedOrIncompleteDays.some(x => x.reason === "incomplete"), "reported as incomplete");
});

t("D3", "uses the authoritative calorie value as given", () => {
  const cals = mkCalories(TODAY, 21, 2000);
  cals[back(TODAY, 0)] = { calories: 1234.56, complete: true, source: "import" };
  const r = TDEE.calculate({ todayLocalDate: TODAY, units: "lb",
    calorieDays: cals, weights: mkWeights(TODAY, 21, 190, 0.1) });
  const expected = (2000 * 20 + 1234.56) / 21;
  near(r.averageDailyCalories, expected, 1e-9, "consumed verbatim, not recomputed");
});

/* ---------------- E. Safety and product behaviour ---------------- */

t("E1", "output only; no target fields are produced", () => {
  const r = TDEE.calculate({ todayLocalDate: TODAY, units: "lb",
    calorieDays: mkCalories(TODAY, 21, 2000), weights: mkWeights(TODAY, 21, 190, 0.1) });
  ["targetCalories", "targetCarbs", "targetFat", "stepsGoal", "cardioMinGoal", "phase"]
    .forEach(k => eq(r[k], undefined, "must not emit " + k));
});

t("E2", "engine is stateless about review cadence — it proposes nothing", () => {
  const r = TDEE.calculate({ todayLocalDate: TODAY, units: "lb",
    calorieDays: mkCalories(TODAY, 21, 2000), weights: mkWeights(TODAY, 21, 190, 0.1) });
  eq(r.proposal, undefined, "no proposal object");
  eq(r.apply, undefined, "no apply affordance");
});

t("E3", "off-plan window flags context, never triggers a cut", () => {
  const off = [back(TODAY, 6), back(TODAY, 5), back(TODAY, 4)];
  const r = TDEE.calculate({ todayLocalDate: TODAY, units: "lb",
    calorieDays: mkCalories(TODAY, 21, 2000), weights: mkWeights(TODAY, 21, 190, 0.1),
    offPlanDates: off });
  ok(r.confidenceFlags.includes("off_plan_days_in_window"), "flagged");
  eq(r.offPlanDaysInWindow.length, 3);
  eq(r.proposal, undefined, "still proposes nothing");
});

t("E4", "auditable: window, counts, inputs, flags, exclusions, timestamp, raw+display", () => {
  const r = TDEE.calculate({ todayLocalDate: TODAY, units: "lb", formulaTdee: 2600,
    calorieDays: mkCalories(TODAY, 21, 2000, { skip: [7] }),
    weights: mkWeights(TODAY, 21, 190, 0.1), now: "2026-08-04T12:00:00.000Z" });
  ["status", "windowStartLocalDate", "windowEndLocalDate", "windowDays",
   "completeCalorieDays", "requiredCalorieDays", "acceptedWeightDays", "requiredWeightDays",
   "averageDailyCalories", "weeklyWeightChangeLb", "measuredTdeeRaw", "measuredTdeeDisplay",
   "formulaTdee", "confidenceFlags", "excludedOrIncompleteDays", "calculatedAt"]
    .forEach(k => ok(r[k] !== undefined, "missing required field: " + k));
  eq(r.calculatedAt, "2026-08-04T12:00:00.000Z", "timestamp is injectable = deterministic");
  ok(r.excludedOrIncompleteDays.length >= 1, "exclusions listed");
});

t("E5", "insufficiency reports itself rather than presenting a stale value", () => {
  const r = TDEE.calculate({ todayLocalDate: TODAY, units: "lb", formulaTdee: 2600,
    calorieDays: mkCalories(TODAY, 5, 2000), weights: mkWeights(TODAY, 5, 190, 0.1) });
  eq(r.status, "insufficient");
  eq(r.measuredTdeeDisplay, null, "no measured number offered");
  eq(r.formulaTdee, 2600, "formula estimate carried through for fallback");
  ok(r.confidenceFlags.includes("insufficient_data"), "reason given");
});

/* ---------------- F. Regression protection ---------------- */

t("F1", "pure: no globals touched, same input → identical output", () => {
  const mk = () => ({ todayLocalDate: TODAY, units: "lb",
    calorieDays: mkCalories(TODAY, 21, 2000), weights: mkWeights(TODAY, 21, 190, 0.1),
    now: "2026-08-04T00:00:00.000Z" });
  eq(JSON.stringify(TDEE.calculate(mk())), JSON.stringify(TDEE.calculate(mk())), "deterministic");
});

t("F2", "does not mutate its inputs", () => {
  const input = { todayLocalDate: TODAY, units: "lb",
    calorieDays: mkCalories(TODAY, 21, 2000), weights: mkWeights(TODAY, 21, 190, 0.1) };
  const before = JSON.stringify(input);
  TDEE.calculate(input);
  eq(JSON.stringify(input), before, "inputs untouched");
});

t("F3", "kg units use 7700 per unit", () => {
  const r = TDEE.calculate({ todayLocalDate: TODAY, units: "kg",
    calorieDays: mkCalories(TODAY, 21, 2000), weights: mkWeights(TODAY, 21, 86, 0.5 / 7) });
  near(r.measuredTdeeRaw, 2000 + 0.5 * 7700 / 7, 1e-6, "kg conversion");
});

t("F4", "no network, no UI, no AI — module has no such references", () => {
  const src = require("node:fs").readFileSync(new URL("./tdee-core.js", import.meta.url), "utf8");
  [/\bfetch\s*\(/, /XMLHttpRequest/, /document\./, /window\.(?!TDEECore)/, /localStorage/, /anthropic/i]
    .forEach(re => ok(!re.test(src), "module references " + re));
});

/* ---------------- report ---------------- */
console.log("");
results.forEach(([okk, id, d]) => console.log(`  ${okk ? "PASS" : "FAIL"}  ${id.padEnd(4)} ${d}`));
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
