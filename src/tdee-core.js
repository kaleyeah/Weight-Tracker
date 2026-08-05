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

  /* Outlier detection (spec §5). Owner ruling 2026-08-05: FLAG AND EXCLUDE —
     a suspect reading is never deleted from the athlete's data, it is listed in
     the audit and shown on the card, it simply stops dragging the trend line.
     Measured motivation: on a 21-day window with a true -0.700 lb/wk trend, a
     +4 lb spike reports -1.064 on the oldest day or -0.336 on the newest —
     either way roughly a 180 cal/day error in the resulting TDEE. */
  var OUTLIER = {
    method: "repeated_median",
    k: 3.5,                                  // ~1 false flag per 75 windows at normal noise
    /* ABSOLUTE FLOOR, in weight units. Daily bodyweight noise is 0.5-2 lb of
       water, glycogen and gut content, so nothing under ~2.5 lb is diagnostic —
       this is what makes the rule match "should stick out easily" rather than
       chasing a refeed. It is also what keeps detection sane when MAD is 0
       (collinear data, or a scale that rounds to 0.5), where a pure MAD rule
       would flag ordinary variation. kg values are round kg, not conversions. */
    floor: { lb: 2.5, kg: 1.15 },
    highVariability: { lb: 1.5, kg: 0.68 },  // above this, say so rather than pretend
    maxCount: 4,
    maxFraction: 0.20,
    minPoints: 8,
    maxRunLength: 2,                         // longer same-sign run = regime shift, not outliers
    runGapDays: 2,
  };

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

  /* Siegel's repeated median. DETECTION ONLY — this line is never reported.
     50% breakdown point: up to half the readings could be arbitrary and the
     slope still holds, which is the whole point. Residuals measured against an
     OLS fit would be useless here, because the outlier has already dragged that
     fit toward itself (masking) — it shrinks its own residual while inflating
     everyone else's. O(n^2) with n<=28 is nothing. */
  function repeatedMedianSlope(points) {
    var n = points.length, inner = [], i, j, slopes, dx;
    if (n < 3) return null;
    for (i = 0; i < n; i++) {
      slopes = [];
      for (j = 0; j < n; j++) {
        if (j === i) continue;
        dx = points[j].x - points[i].x;
        if (dx === 0) continue;               // same date: impossible after dailyWeights, guarded anyway
        slopes.push((points[j].y - points[i].y) / dx);
      }
      if (slopes.length) inner.push(median(slopes));
    }
    if (inner.length < 2) return null;
    return median(inner);                     // units per day
  }

  /* Theil-Sen intercept: median(y - m*x). Deliberately NOT ybar - m*xbar, which
     would re-import the very leverage the robust slope just escaped. */
  function robustIntercept(points, slope) {
    var i, r = [];
    for (i = 0; i < points.length; i++) r.push(points[i].y - slope * points[i].x);
    return median(r);
  }

  function medianAbsoluteDeviation(values) {
    var m = median(values), i, d = [];
    for (i = 0; i < values.length; i++) d.push(Math.abs(values[i] - m));
    return median(d);
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

  /* Group flagged points into runs of the SAME residual sign that sit close
     together in time. A long same-sign run is not a set of bad readings — it is
     a stretch the straight line fails to describe (week-1 diet water loss is the
     real case: -1.2 lb/day for five days, then -0.15, produces three same-sign
     flags). Those must never be excluded, or the engine deletes real physiology.
     Two adjacent water-heavy mornings, by contrast, are ordinary and ARE
     excludable — and matter, because two adjacent edge spikes swing a -0.700
     trend to -0.055. The gap condition stops two isolated spikes ten days apart
     being merged into a spurious "run" just because nothing was logged between. */
  function sameSignRuns(candidates) {
    var runs = [], cur = null, i, c, prev;
    for (i = 0; i < candidates.length; i++) {
      c = candidates[i];
      if (cur && prev &&
          (c.residual > 0) === (prev.residual > 0) &&
          Math.abs(c.x - prev.x) <= OUTLIER.runGapDays) {
        cur.push(c);
      } else {
        cur = [c];
        runs.push(cur);
      }
      prev = c;
    }
    for (i = 0; i < runs.length; i++) {
      if (runs[i].length > OUTLIER.maxRunLength) {
        for (var j = 0; j < runs[i].length; j++) runs[i][j].reason = "same_sign_run";
      }
    }
    return runs;
  }

  /**
   * Flag weight readings that stick out from the robust trend.
   * DETECTION ONLY — the fit built here is never reported; spec §5 keeps
   * ordinary least squares as the reported estimator.
   * @param {Array<{x:Number,y:Number,date:String}>} points
   * @param {String} units "lb"|"kg"
   * @param {Number} cap   how many flags before the data set as a whole is suspect
   */
  function detectWeightOutliers(points, units, cap) {
    var n = points.length, i, out = {
      method: OUTLIER.method, applicable: false, reason: null, units: units,
      pointsExamined: n, robustSlopePerDay: null, robustIntercept: null,
      mad: null, sigmaHat: null, k: OUTLIER.k,
      thresholdFloor: OUTLIER.floor[units], threshold: null,
      candidates: [], candidateCount: 0, cap: cap, capExceeded: false,
      longestRun: 0, iterations: 1,
    };
    if (n < OUTLIER.minPoints) { out.reason = "too_few_points"; return out; }

    var m = repeatedMedianSlope(points);
    if (m == null) { out.reason = "degenerate_fit"; return out; }
    var b = robustIntercept(points, m);

    var res = [];
    for (i = 0; i < n; i++) res.push(points[i].y - (m * points[i].x + b));
    var mad = medianAbsoluteDeviation(res);
    var sigmaHat = 1.4826 * mad;
    var threshold = Math.max(OUTLIER.k * sigmaHat, OUTLIER.floor[units]);

    out.applicable = true;
    out.robustSlopePerDay = m;
    out.robustIntercept = b;
    out.mad = mad;
    out.sigmaHat = sigmaHat;
    out.threshold = threshold;

    for (i = 0; i < n; i++) {
      if (Math.abs(res[i]) <= threshold) continue;
      out.candidates.push({
        index: i, x: points[i].x, date: points[i].date, weight: points[i].y,
        expected: m * points[i].x + b, residual: res[i],
        /* null, never Infinity/NaN: F1 asserts JSON.stringify determinism. */
        robustZ: sigmaHat > 0 ? Math.abs(res[i]) / sigmaHat : null,
        excluded: false, reason: null,
      });
    }
    out.candidateCount = out.candidates.length;
    out.capExceeded = out.candidateCount > cap;
    var runs = sameSignRuns(out.candidates);
    for (i = 0; i < runs.length; i++) if (runs[i].length > out.longestRun) out.longestRun = runs[i].length;
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
    /* Owner ruling 2026-08-05: exclude by DEFAULT. Pass excludeOutliers:false to
       get flag-only behaviour (detection still runs and still reports — the
       audit requirement in spec §5 is unconditional). */
    var excludeMode = input.excludeOutliers !== false;
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
      /* mirrored on the insufficient path so consumers see one stable shape */
      weightOutliers: [], weightOutlierDates: [], weeklyWeightChangeRobust: null,
      outlierDetection: null,
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
        return { x: Math.round((parseDate(d) - startMs) / DAY_MS), y: wByDate[d], date: d };
      });

      /* OUTLIER DETECTION sits HERE — after eligibility, before the fit.
         Eligibility counts COVERAGE (did they weigh in); detection judges
         QUALITY (was the reading trustworthy). An outlier weigh-in is still a
         weigh-in, so acceptedWeightDays never changes and a flagged reading can
         never push the athlete down to a shorter tier. */
      var cap = Math.min(OUTLIER.maxCount, Math.floor(OUTLIER.maxFraction * points.length));
      var det = detectWeightOutliers(points, units, cap);
      det.mode = excludeMode ? "flag_and_exclude" : "flag_only";

      var fitPoints = points, withheld = null, di;
      if (excludeMode && det.applicable && det.candidateCount) {
        var removable = [];
        for (di = 0; di < det.candidates.length; di++) {
          if (!det.candidates[di].reason) removable.push(det.candidates[di]);
        }
        var retained = points.length - removable.length;
        /* GUARD LADDER. Every branch is a reason to WITHHOLD exclusion, never a
           reason to change the tier or manufacture a trend. */
        if (det.capExceeded) withheld = "cap_exceeded";
        else if (!removable.length) withheld = null;        // all runs; nothing to remove
        else if (retained < 2) withheld = "below_minimum_points";
        else if (retained < tier.requiredWeightDays) withheld = "below_tier_minimum";

        if (!withheld && removable.length) {
          var drop = {};
          for (di = 0; di < removable.length; di++) { removable[di].excluded = true; drop[removable[di].index] = true; }
          fitPoints = points.filter(function (p, ix) { return !drop[ix]; });
          var xs = {}, nx = 0;
          for (di = 0; di < fitPoints.length; di++) if (!xs[fitPoints[di].x]) { xs[fitPoints[di].x] = 1; nx++; }
          if (nx < 2) {                                     // removal made the fit degenerate
            for (di = 0; di < removable.length; di++) removable[di].excluded = false;
            fitPoints = points; withheld = "no_x_variance";
          }
        } else if (withheld) {
          for (di = 0; di < removable.length; di++) removable[di].reason = withheld;
        }
      }
      det.excludedCount = 0;
      for (di = 0; di < det.candidates.length; di++) if (det.candidates[di].excluded) det.excludedCount++;
      det.retainedPoints = fitPoints.length;
      det.withheld = withheld;

      var slope = regressionSlope(fitPoints);              // units/day
      if (slope == null && fitPoints !== points) {
        /* Never fall through to a shorter tier because of outlier removal —
           a silent tier downgrade caused by our own filtering is the worst
           possible outcome. Put the points back and report the withholding. */
        for (di = 0; di < det.candidates.length; di++) det.candidates[di].excluded = false;
        det.excludedCount = 0; det.retainedPoints = points.length;
        det.withheld = withheld = "degenerate_after_exclusion";
        fitPoints = points;
        slope = regressionSlope(points);
      }
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
      /* Spec §5: a suspected outlier lowers confidence and is reported — the
         athlete is told, never quietly corrected. */
      if (det.candidateCount) flags.push("weight_outliers_detected");
      if (det.excludedCount) flags.push("weight_outliers_excluded");
      if (det.longestRun > OUTLIER.maxRunLength) flags.push("weight_trend_regime_shift");
      if (det.capExceeded) flags.push("outlier_detection_inconclusive");
      if (withheld) flags.push("outlier_exclusion_withheld");
      if (det.sigmaHat != null && det.sigmaHat > OUTLIER.highVariability[units]) flags.push("high_weight_variability");

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
        /* weightPointsUsed is FIT PARTICIPATION; acceptedWeightDays is COVERAGE
           and feeds tier eligibility. They were equal only while nothing was
           ever excluded — they are not equal any more, and a consumer using
           weightPointsUsed as a coverage proxy is now wrong. */
        weightPointsUsed: fitPoints.length,
        weightOutliers: det.candidates.map(function (c) {
          return { date: c.date, weight: c.weight, expected: c.expected,
                   residual: c.residual, robustZ: c.robustZ,
                   excluded: c.excluded, reason: c.reason };
        }),
        weightOutlierDates: det.candidates.map(function (c) { return c.date; }),
        weeklyWeightChangeRobust: det.robustSlopePerDay == null ? null : det.robustSlopePerDay * 7,
        outlierDetection: {
          method: det.method, mode: det.mode, applicable: det.applicable, reason: det.reason,
          pointsExamined: det.pointsExamined, robustSlopePerDay: det.robustSlopePerDay,
          mad: det.mad, sigmaHat: det.sigmaHat, k: det.k,
          thresholdFloor: det.thresholdFloor, threshold: det.threshold,
          candidateCount: det.candidateCount, cap: det.cap, capExceeded: det.capExceeded,
          excludedCount: det.excludedCount, retainedPoints: det.retainedPoints,
          longestRun: det.longestRun, withheld: det.withheld, iterations: det.iterations,
        },
      });
      return res;
    }

    base.confidenceFlags.push("insufficient_data");
    base.tierAttempts = attempts;
    return base;
  }

  return { calculate: calculate, TIERS: TIERS, MAX_CONSECUTIVE_MISSING: MAX_CONSECUTIVE_MISSING,
           OUTLIER: OUTLIER, detectWeightOutliers: detectWeightOutliers };
});
