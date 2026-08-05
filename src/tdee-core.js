/* Compound Fitness — measured TDEE, deterministic core.
 *
 * Implements TDEE-MEASUREMENT-SPEC.md. Per spec §11 this module must not:
 * read or write UI, call AI models, alter coaching targets, mutate raw logs,
 * or assume a persistence provider. It is a pure function: normalized daily
 * data in, structured result out. Same file runs in the browser and in Node
 * so the phone and the coach can never disagree about the number.
 *
 * TIMEZONE (spec §3): this module takes dates that are ALREADY the athlete's
 * local calendar dates ("YYYY-MM-DD"). Assigning events to local dates is the
 * caller's job — doing it here would require assuming a persistence shape.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TDEECore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* Spec §4. Longest window first; if a tier is ineligible we fall to the
     next shorter one rather than manufacturing data (§4 last bullet, A6). */
  var TIERS = [
    { status: "high_confidence", windowDays: 28, requiredCalorieDays: 24, requiredWeightDays: 20 },
    { status: "reliable",        windowDays: 21, requiredCalorieDays: 18, requiredWeightDays: 15 },
    { status: "provisional",     windowDays: 14, requiredCalorieDays: 12, requiredWeightDays: 10 },
  ];
  var MAX_CONSECUTIVE_MISSING = 2;          // spec §4: "more than two" is ineligible
  var CAL_PER_UNIT = { lb: 3500, kg: 7700 };

  var DAY_MS = 86400000;
  function parseDate(iso) {
    var p = String(iso).split("-");
    return Date.UTC(+p[0], +p[1] - 1, +p[2]);   // UTC purely as a stable day counter
  }
  function isoOf(ms) {
    var d = new Date(ms), p = function (n) { return String(n).padStart(2, "0"); };
    return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate());
  }
  function median(a) {
    var s = a.slice().sort(function (x, y) { return x - y; }), n = s.length;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  }

  /* Spec §5: ordinary least squares over (dayIndex, weight). Explicitly NOT
     last-minus-first (C1), and indices are real local-date offsets so gaps
     are respected rather than treated as consecutive observations (C2). */
  function regressionSlope(points) {
    var n = points.length;
    if (n < 2) return null;
    var sx = 0, sy = 0;
    for (var i = 0; i < n; i++) { sx += points[i].x; sy += points[i].y; }
    var mx = sx / n, my = sy / n, num = 0, den = 0;
    for (var j = 0; j < n; j++) {
      var dx = points[j].x - mx;
      num += dx * (points[j].y - my);
      den += dx * dx;
    }
    if (den === 0) return null;                 // every reading on one date
    return num / den;                           // units per day
  }

  /* One accepted weight per local date (spec §4). An authoritative value wins;
     otherwise the median of that date's valid readings (C3). */
  function dailyWeights(weights) {
    var byDate = {};
    (weights || []).forEach(function (w) {
      if (!w || !w.date) return;
      var v = Number(w.weight);
      if (!isFinite(v)) return;
      var slot = byDate[w.date] || (byDate[w.date] = { authoritative: null, values: [] });
      if (w.authoritative) slot.authoritative = v;
      slot.values.push(v);
    });
    var out = {};
    Object.keys(byDate).forEach(function (d) {
      var s = byDate[d];
      out[d] = s.authoritative != null ? s.authoritative : median(s.values);
    });
    return out;
  }

  /**
   * @param {object} input
   *   todayLocalDate  "YYYY-MM-DD" — the athlete's local date
   *   weights         [{date, weight, authoritative?}]
   *   calorieDays     { "YYYY-MM-DD": { calories:Number, complete:Boolean } }
   *   units           "lb" | "kg"
   *   formulaTdee     Number|null — Mifflin-St Jeor x activity, for comparison
   *   offPlanDates    ["YYYY-MM-DD"] — vacation/sick etc. Flag only; see below.
   */
  function calculate(input) {
    input = input || {};
    var units = input.units === "kg" ? "kg" : "lb";
    var calPerUnit = CAL_PER_UNIT[units];
    var today = input.todayLocalDate;
    var wByDate = dailyWeights(input.weights);
    var cal = input.calorieDays || {};
    var offPlan = {};
    (input.offPlanDates || []).forEach(function (d) { offPlan[d] = true; });

    var base = {
      status: "insufficient",
      windowStartLocalDate: null, windowEndLocalDate: null, windowDays: null,
      completeCalorieDays: 0, requiredCalorieDays: null,
      acceptedWeightDays: 0, requiredWeightDays: null,
      averageDailyCalories: null, weeklyWeightChangeLb: null,
      measuredTdeeRaw: null, measuredTdeeDisplay: null,
      formulaTdee: input.formulaTdee == null ? null : input.formulaTdee,
      confidenceFlags: [], excludedOrIncompleteDays: [],
      calculatedAt: input.now || new Date().toISOString(),
      units: units,
    };
    if (!today) { base.confidenceFlags.push("no_local_date"); return base; }

    var endMs = parseDate(today);
    var attempts = [];

    /* Spec §4, first table row: "Insufficient | Fewer than 14 days". A tier
       requires the athlete to actually HAVE that much history — otherwise 13
       perfect days satisfy the 14-day tier's 12/10 thresholds and report as
       provisional, which the spec rejects outright (A1). History span is the
       earliest logged date of either kind through today. */
    var earliestMs = null;
    Object.keys(cal).forEach(function (d) {
      var ms = parseDate(d);
      if (ms <= endMs && (earliestMs === null || ms < earliestMs)) earliestMs = ms;
    });
    Object.keys(wByDate).forEach(function (d) {
      var ms = parseDate(d);
      if (ms <= endMs && (earliestMs === null || ms < earliestMs)) earliestMs = ms;
    });
    var historyDays = earliestMs === null ? 0 : Math.round((endMs - earliestMs) / DAY_MS) + 1;
    base.historyDays = historyDays;

    for (var t = 0; t < TIERS.length; t++) {
      var tier = TIERS[t];
      if (historyDays < tier.windowDays) {
        attempts.push({ status: tier.status, windowDays: tier.windowDays, eligible: false,
                        reason: "insufficient_history", historyDays: historyDays });
        continue;
      }
      var startMs = endMs - (tier.windowDays - 1) * DAY_MS;
      var dates = [];
      for (var i = 0; i < tier.windowDays; i++) dates.push(isoOf(startMs + i * DAY_MS));

      var complete = [], incomplete = [], run = 0, longestRun = 0;
      dates.forEach(function (d) {
        var c = cal[d];
        /* Spec §4/D1/D2: a day counts only if EXPLICITLY complete. Missing and
           partial days are excluded and never imputed as zero or as target. */
        var isComplete = !!(c && c.complete === true && isFinite(Number(c.calories)));
        if (isComplete) { complete.push({ date: d, calories: Number(c.calories) }); run = 0; }
        else {
          incomplete.push({ date: d, reason: !c ? "missing" : (c.complete === false ? "incomplete" : "no_calories") });
          run++; if (run > longestRun) longestRun = run;
        }
      });

      var wDates = dates.filter(function (d) { return wByDate[d] != null; });
      var gapOk = longestRun <= MAX_CONSECUTIVE_MISSING;
      var calOk = complete.length >= tier.requiredCalorieDays;
      var wOk = wDates.length >= tier.requiredWeightDays;

      attempts.push({
        status: tier.status, windowDays: tier.windowDays,
        completeCalorieDays: complete.length, requiredCalorieDays: tier.requiredCalorieDays,
        acceptedWeightDays: wDates.length, requiredWeightDays: tier.requiredWeightDays,
        longestMissingRun: longestRun, eligible: calOk && wOk && gapOk,
      });
      if (!(calOk && wOk && gapOk)) continue;

      var points = wDates.map(function (d) {
        return { x: Math.round((parseDate(d) - startMs) / DAY_MS), y: wByDate[d] };
      });
      var slope = regressionSlope(points);                 // units/day
      if (slope == null) continue;                          // cannot fit a trend
      var weeklyChange = slope * 7;
      var avgCal = complete.reduce(function (s, x) { return s + x.calories; }, 0) / complete.length;
      var raw = avgCal - (weeklyChange * calPerUnit / 7);   // §7

      var flags = [];
      if (tier.status === "provisional") flags.push("low_confidence_short_window");
      if (longestRun > 0) flags.push("calorie_gaps_present");
      var offPlanInWindow = dates.filter(function (d) { return offPlan[d]; });
      /* Spec §10: an off-plan stretch is visible CONTEXT that lowers confidence
         and routes for review — never a hidden correction to the maths. */
      if (offPlanInWindow.length) flags.push("off_plan_days_in_window");
      if (wDates.length < tier.windowDays * 0.8) flags.push("sparse_weigh_ins");

      var res = Object.assign({}, base, {
        status: tier.status,
        windowStartLocalDate: dates[0], windowEndLocalDate: dates[dates.length - 1],
        windowDays: tier.windowDays,
        completeCalorieDays: complete.length, requiredCalorieDays: tier.requiredCalorieDays,
        acceptedWeightDays: wDates.length, requiredWeightDays: tier.requiredWeightDays,
        averageDailyCalories: avgCal,
        weeklyWeightChangeLb: weeklyChange,
        measuredTdeeRaw: raw,                                // §7: unrounded
        measuredTdeeDisplay: Math.round(raw),                // §7: rounded only here
        confidenceFlags: flags,
        excludedOrIncompleteDays: incomplete,
        offPlanDaysInWindow: offPlanInWindow,
        tierAttempts: attempts,
        regressionSlopePerDay: slope,
        weightPointsUsed: points.length,
      });
      return res;
    }

    base.confidenceFlags.push("insufficient_data");
    base.tierAttempts = attempts;
    return base;
  }

  return { calculate: calculate, TIERS: TIERS, MAX_CONSECUTIVE_MISSING: MAX_CONSECUTIVE_MISSING };
});
