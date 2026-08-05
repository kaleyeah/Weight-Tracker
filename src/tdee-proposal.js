/* Compound Fitness — the target-adjustment proposal, deterministic core.
 *
 * This is the logic behind the Progress tab's Metabolism recommendation:
 * given the measured trend and the athlete's own target, decide whether they
 * are on pace, off pace, non-compliant, or in a cooldown — and if a change is
 * warranted, size it.
 *
 * WHY IT IS SHARED. Coach Max's TDEE message told the athlete a number he had
 * worked out himself: "a sustainable 200-500 under your measured TDEE." That
 * arithmetic ignores the athlete's actual target RATE, the app's capped
 * adjustment step, the compliance check and the cooldown — and it produced
 * 2,700 where the Progress tab said 2,205. Two different numbers from the same
 * app is worse than no number at all. The coach now imports this module and
 * quotes its answer instead of doing its own maths, exactly as it already does
 * for tdee-core.
 *
 * Pure: no UI, no storage, no network, no `state`. Same file runs in the
 * browser and in Node.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TDEEProposal = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* Mirrors the app's num(): parseFloat, and anything non-finite (including
     "" and null) becomes null. Do not "improve" this — the branches below
     depend on its exact behaviour. */
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }

  var DAY_MS = 86400000;
  function parseISO(s) { var p = String(s).split("-").map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); }
  function isoOf(ms) {
    var d = new Date(ms), p = function (n) { return String(n).padStart(2, "0"); };
    return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate());
  }
  /* "is `today` still inside `n` days of `ds`" — the app's
     `today < toISO(addDays(parseISO(ds), n))`, done on ISO strings. */
  function within(today, ds, n) {
    if (!ds) return false;
    return String(today) < isoOf(parseISO(ds) + n * DAY_MS);
  }

  function calPerUnit(units) { return units === "kg" ? 7700 : 3500; }

  function targetRate(i, mode) {
    if (mode === "maintain") return 0;
    var tv = num(i.targetValue);
    if (tv == null || tv <= 0) return null;
    if (i.targetType === "percent_bw_per_week") {
      var cw = num(i.currentWeightAvg);
      if (cw == null) return null;
      return tv / 100 * cw;
    }
    return tv;
  }

  function buildProp(i, newCal, stepAdd, cardAdd) {
    var floor = i.sex === "female" ? 1500 : 1800;
    if (newCal < floor) newCal = floor;
    var p = num(i.targetProtein), fat = null, carb = null;
    if (p != null) {
      fat = Math.round(newCal * 0.20 / 9);
      if (fat < 40) fat = 40;
      carb = Math.round(Math.max(0, newCal - p * 4 - fat * 9) / 4);
    }
    var stepsG = num(i.stepsGoal), cardG = num(i.cardioMinGoal);
    return {
      cal: newCal, oldCal: num(i.targetCalories), protein: p, fat: fat, carbs: carb,
      oldCarbs: num(i.targetCarbs), oldFat: num(i.targetFat),
      steps: (stepAdd && stepsG != null) ? stepsG + stepAdd : null, oldSteps: stepsG,
      cardio: (cardAdd && cardG != null) ? cardG + cardAdd : null, oldCardio: cardG,
    };
  }

  /**
   * @param {object} i
   *   rate              weekly weight change, signed (negative = losing)
   *   foodAvg           mean daily intake across the measured window
   *   units strategy targetCalories targetType targetValue currentWeightAvg
   *   sex stepsGoal cardioMinGoal targetProtein targetCarbs targetFat
   *   tdeeApplied tdeeSnooze   ISO dates, drive the cooldown
   *   todayLocalDate           the athlete's local date
   * @returns {{state,targetRate,gapDay?,over?,prop?}}
   *   state: "ok" | "comply" | "cooldown" | "toofast" | "propose"
   */
  function analyze(i) {
    i = i || {};
    var rate = i.rate;
    var cpu = calPerUnit(i.units);
    var mode = i.strategy || "lose";
    var tgtCal = num(i.targetCalories);
    var tR = targetRate(i, mode);
    var out = { state: "ok", targetRate: tR };

    if (tgtCal == null || tR == null) return out;

    var today = i.todayLocalDate;
    var blocked = within(today, i.tdeeApplied, 14) || within(today, i.tdeeSnooze, 7);
    var dirGood = (mode === "gain") ? rate : -rate;
    var over = i.foodAvg - tgtCal;

    /* COMPLIANCE FIRST. If they are not eating to the target they already
       have, the answer is not a new target — changing the number would just
       move the goalposts. */
    if (mode !== "gain" && over > 100 && dirGood < tR * 0.75) { out.state = "comply"; out.over = Math.round(over); return out; }
    if (mode === "gain" && over < -100 && dirGood < tR * 0.75) { out.state = "comply"; out.over = Math.round(over); return out; }

    if (mode === "maintain") {
      var band = (i.units === "kg" ? 0.12 : 0.25);
      if (Math.abs(rate) <= band) { out.state = "ok"; return out; }
      if (blocked) { out.state = "cooldown"; return out; }
      var gm = Math.min(150, Math.max(100, Math.round(Math.abs(rate) * cpu / 7 / 10) * 10));
      out.state = "propose";
      out.gapDay = Math.round(Math.abs(rate) * cpu / 7);
      out.prop = buildProp(i, tgtCal + (rate > 0 ? -gm : gm), 0, 0);
      return out;
    }

    /* On pace: anywhere from 75% to 150% of target rate. Deliberately wide —
       weekly weight is noisy and re-tuning on noise is how people end up
       chasing the scale. */
    if (dirGood >= tR * 0.75 && dirGood <= tR * 1.5) { out.state = "ok"; return out; }
    if (blocked) { out.state = "cooldown"; return out; }

    if (dirGood > tR * 1.5) {
      /* Losing (or gaining) faster than intended. Give calories BACK, capped
         at 200/day so a noisy week cannot swing the target wildly. */
      var gap1 = (dirGood - tR) * cpu / 7;
      var add = Math.min(200, Math.max(100, Math.round(gap1 / 2 / 10) * 10));
      out.state = "toofast";
      out.gapDay = Math.round(gap1);
      out.prop = buildProp(i, tgtCal + (mode === "gain" ? -add : add), 0, 0);
      return out;
    }

    /* Off pace the slow way: take part of the gap from activity rather than
       all of it from food — 1,000 steps and 15 min of cardio are credited at
       45 and 21 cal, and only the remainder is trimmed from intake. */
    var gap2 = (tR - dirGood) * cpu / 7;
    var stepsG = num(i.stepsGoal), cardG = num(i.cardioMinGoal);
    var stepAdd = (stepsG != null) ? 1000 : 0;
    var cardAdd = (cardG != null) ? 15 : 0;
    var offset = (stepAdd ? 45 : 0) + (cardAdd ? 21 : 0);
    var trim = Math.max(0, Math.min(200, Math.round((gap2 - offset) / 10) * 10));
    out.state = "propose";
    out.gapDay = Math.round(gap2);
    out.prop = buildProp(i, tgtCal + (mode === "gain" ? trim : -trim), stepAdd, cardAdd);
    return out;
  }

  return { analyze: analyze, targetRate: targetRate, buildProp: buildProp };
});
