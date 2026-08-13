/* Compound Fitness — TDEE estimator V2. NOT production primary.
 *
 * Implements TDEE-V2-IMPLEMENTATION-SPEC.md; every constant and formula is
 * documented in src/TDEE-V2-MATH.md, written before this file. V1
 * (src/tdee-core.js) is unchanged and still drives the Metabolism card; V2
 * runs alongside for validation and review.
 *
 * Three separated concepts (spec §2): the scale-weight trend (V1's OLS
 * pipeline, reused literally via V1's exports), the raw energy-balance
 * observation per horizon (intake − trend × 3,500/lb — an observation, not
 * truth), and the ESTIMATED TDEE — a scalar Kalman filter over the raw
 * observations, recomputed as a deterministic fold over the whole history:
 * one update per calendar day, no stored mutable state to desync or
 * double-update (the fold IS the persistence; see MATH §1).
 *
 * Pure function, UMD, same discipline as V1: no UI, no AI, no storage, no
 * medication awareness of any kind (spec: tirzepatide is context, never a
 * term — nothing in here reads or infers medication).
 */
(function (root, factory) {
  var dep = (typeof module === "object" && module.exports)
    ? require("./tdee-core.js")
    : root.TDEECore;
  var api = factory(dep);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TDEECoreV2 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (V1) {
  "use strict";

  /* ---- constants (MATH §2-§4; design constants, not fits) ---- */
  var HORIZONS = [42, 28, 21, 14];          // longest first = most authority
  var CAL_RATIO = 6 / 7;                    // V1's own tier ratios, generalized
  var WEIGH_RATIO = 5 / 7;
  var Q = 25;                               // kcal²/day drift (σ = 5 kcal/day/day)
  var TRANSITION = {
    recentDays: 7, priorDays: 14,           // intake comparison windows (complete days)
    minRecent: 5, minPrior: 10,             // fewer than this: no signal either way
    absKcal: 300, relFrac: 0.15,            // trigger threshold: max(300, 15%)
    activeDays: 14,                         // the water/glycogen settling window
    rInflate: 4,                            // observation variance ×4 while active
    pShock: 75 * 75,                        // one-time variance shock at trigger
  };
  var DISAGREE = { z: 2, rInflate: 4 };     // horizons differ beyond 2·√(R₁+R₂)
  var SUSTAINED = { z: 2, days: 5, pShock: 75 * 75 };
  var RANGE_Z = 1.28;                       // "estimated range", ~80% if assumptions held
  var DISPLAY_STEP = 10;                    // round the shown estimate to 10 kcal

  var DAY_MS = 86400000;
  function parseDate(iso) { var p = String(iso).split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function isoOf(ms) {
    var d = new Date(ms), z = function (n) { return String(n).padStart(2, "0"); };
    return d.getUTCFullYear() + "-" + z(d.getUTCMonth() + 1) + "-" + z(d.getUTCDate());
  }
  function r2(x) { return x == null ? null : Math.round(x * 100) / 100; }

  /* ---- one horizon's fit, observation and variance (MATH §2) ----
     Reuses V1's exported pipeline pieces (dailyWeights was applied by the
     caller; detectWeightOutliers and regressionSlope are V1's own), and
     restates V1's exclusion guard ladder compactly. Parity with V1's
     selected tier is asserted by test, not assumed. */
  function fitHorizon(endMs, H, ctx) {
    var startMs = endMs - (H - 1) * DAY_MS;
    var out = { horizon: H, eligible: false, reason: null };
    if (ctx.historyDaysAt(endMs) < H) { out.reason = "insufficient_history"; return out; }

    var complete = [], missRun = 0, longestRun = 0, wPoints = [], d, ms, iso;
    for (var i = 0; i < H; i++) {
      ms = startMs + i * DAY_MS; iso = isoOf(ms);
      var c = ctx.cal[iso];
      if (c && c.complete === true && isFinite(Number(c.calories))) {
        complete.push(Number(c.calories)); missRun = 0;
      } else { missRun++; if (missRun > longestRun) longestRun = missRun; }
      if (ctx.wByDate[iso] != null) wPoints.push({ x: i, y: ctx.wByDate[iso], date: iso });
    }
    var needCal = Math.ceil(CAL_RATIO * H), needW = Math.ceil(WEIGH_RATIO * H);
    out.completeCalorieDays = complete.length; out.requiredCalorieDays = needCal;
    out.acceptedWeightDays = wPoints.length; out.requiredWeightDays = needW;
    out.longestMissingRun = longestRun;
    if (complete.length < needCal) { out.reason = "calorie_days"; return out; }
    if (wPoints.length < needW) { out.reason = "weigh_ins"; return out; }
    if (longestRun > V1.MAX_CONSECUTIVE_MISSING) { out.reason = "missing_run"; return out; }

    /* V1's outlier machinery + guard ladder (compact; parity-tested) */
    var cap = Math.min(V1.OUTLIER.maxCount, Math.floor(V1.OUTLIER.maxFraction * wPoints.length));
    var det = V1.detectWeightOutliers(wPoints, ctx.units, cap);
    var fitPoints = wPoints, withheld = null;
    if (det.applicable && det.candidateCount) {
      var removable = det.candidates.filter(function (c) { return !c.reason; });
      var retained = wPoints.length - removable.length;
      if (det.capExceeded) withheld = "cap_exceeded";
      else if (removable.length && retained < 2) withheld = "below_minimum_points";
      else if (removable.length && retained < needW) withheld = "below_tier_minimum";
      if (!withheld && removable.length) {
        var drop = {}; removable.forEach(function (c) { c.excluded = true; drop[c.index] = true; });
        fitPoints = wPoints.filter(function (p, ix) { return !drop[ix]; });
        var xs = {}, nx = 0;
        fitPoints.forEach(function (p) { if (!xs[p.x]) { xs[p.x] = 1; nx++; } });
        if (nx < 2) { removable.forEach(function (c) { c.excluded = false; }); fitPoints = wPoints; withheld = "no_x_variance"; }
      }
    }
    var slope = V1.regressionSlope(fitPoints);
    if (slope == null && fitPoints !== wPoints) { fitPoints = wPoints; withheld = "degenerate_after_exclusion"; slope = V1.regressionSlope(wPoints); }
    if (slope == null) { out.reason = "degenerate_fit"; return out; }

    /* OLS slope standard error over the fit points (MATH §2) */
    var n = fitPoints.length, sx = 0, sy = 0;
    fitPoints.forEach(function (p) { sx += p.x; sy += p.y; });
    var mx = sx / n, my = sy / n, ssx = 0, ssr = 0;
    fitPoints.forEach(function (p) {
      var dx = p.x - mx; ssx += dx * dx;
      var resid = p.y - (my + slope * dx); ssr += resid * resid;
    });
    var seSlope = (n > 2 && ssx > 0) ? Math.sqrt((ssr / (n - 2)) / ssx) : null;

    var m = complete.length, sum = 0;
    complete.forEach(function (c) { sum += c; });
    var avg = sum / m, sv = 0;
    complete.forEach(function (c) { var dc = c - avg; sv += dc * dc; });
    var sdCal = m > 1 ? Math.sqrt(sv / (m - 1)) : 0;
    var f = 1 - m / H;
    var calPerUnit = V1.CAL_PER_UNIT[ctx.units];

    var trendVar = seSlope == null ? Math.pow(150, 2) : Math.pow(seSlope * calPerUnit, 2);
    var intakeVar = Math.pow(sdCal / Math.sqrt(m), 2);
    var coverVar = Math.pow(f * sdCal, 2);

    out.eligible = true;
    out.slopePerDay = slope;
    out.weeklyTrend = slope * 7;
    out.avgIntake = avg;
    out.sdCal = sdCal;
    out.coverageGapFraction = f;
    out.rawEnergyBalanceTdee = avg - slope * calPerUnit;
    out.seSlope = seSlope;
    out.rComponents = { trend: trendVar, intake: intakeVar, coverage: coverVar };
    out.rBase = trendVar + intakeVar + coverVar;
    out.weightPointsUsed = fitPoints.length;
    out.excludedWeights = det.applicable ? det.candidates.filter(function (c) { return c.excluded; })
      .map(function (c) { return { date: c.date, weight: c.weight, residual: r2(c.residual) }; }) : [];
    out.outlierWithheld = withheld;
    return out;
  }

  /* ---- intake-transition detector (MATH §4): recent 7 complete days vs
     the 14 complete days before them, as of endMs ---- */
  function intakeShift(endMs, ctx) {
    var recent = [], prior = [], ms = endMs, iso;
    while (ms >= ctx.earliestMs && prior.length < TRANSITION.priorDays) {
      iso = isoOf(ms);
      var c = ctx.cal[iso];
      if (c && c.complete === true && isFinite(Number(c.calories))) {
        if (recent.length < TRANSITION.recentDays) recent.push(Number(c.calories));
        else prior.push(Number(c.calories));
      }
      ms -= DAY_MS;
    }
    if (recent.length < TRANSITION.minRecent || prior.length < TRANSITION.minPrior) return null;
    var ra = recent.reduce(function (a, b) { return a + b; }, 0) / recent.length;
    var pa = prior.reduce(function (a, b) { return a + b; }, 0) / prior.length;
    var delta = ra - pa;
    var threshold = Math.max(TRANSITION.absKcal, TRANSITION.relFrac * pa);
    return { recentAvg: ra, priorAvg: pa, delta: delta, threshold: threshold,
             triggered: Math.abs(delta) >= threshold };
  }

  /**
   * @param {object} input — same shape as V1.calculate:
   *   todayLocalDate, weights, calorieDays, units, offPlanDates?, formulaTdee?
   *   (the adapter's completeness rules — including the finalized-today rule —
   *    arrive already applied inside calorieDays, exactly as for V1)
   */
  function calculate(input) {
    input = input || {};
    var units = input.units === "kg" ? "kg" : "lb";
    var today = input.todayLocalDate;
    var base = {
      model: "v2", status: "insufficient", estimatedTdee: null, estimatedTdeeDisplay: null,
      confidence: null, confidenceLevel: "insufficient", estimatedRange: null,
      flags: [], updates: [], horizons: [], regime: { state: "normal", since: null },
      units: units, calculatedAt: input.now || new Date().toISOString(),
    };
    if (!today) { base.flags.push("no_local_date"); return base; }

    var ctx = {
      units: units,
      wByDate: V1.dailyWeights(input.weights),
      cal: input.calorieDays || {},
    };
    var endMs = parseDate(today);
    var earliestMs = null;
    Object.keys(ctx.cal).forEach(function (d) { var ms = parseDate(d); if (ms <= endMs && (earliestMs == null || ms < earliestMs)) earliestMs = ms; });
    Object.keys(ctx.wByDate).forEach(function (d) { var ms = parseDate(d); if (ms <= endMs && (earliestMs == null || ms < earliestMs)) earliestMs = ms; });
    if (earliestMs == null) { base.flags.push("no_history"); return base; }
    ctx.earliestMs = earliestMs;
    ctx.historyDaysAt = function (ms) { return Math.round((ms - earliestMs) / DAY_MS) + 1; };

    /* ---- the fold: one filter update per calendar day (MATH §1) ---- */
    var T = null, P = null, lastObsMs = null;
    var regimeSince = null;                   // ms of last intake-transition trigger
    var innovationStreak = 0, streakShocked = false;
    var trail = [];
    var startMs = earliestMs + 13 * DAY_MS;   // nothing can be eligible before 14 days of history

    for (var ms = startMs; ms <= endMs; ms += DAY_MS) {
      var iso = isoOf(ms);
      var entry = { date: iso };

      /* transition detection first — its shock must precede today's gain */
      var shift = intakeShift(ms, ctx);
      var transitionActive = regimeSince != null && (ms - regimeSince) / DAY_MS < TRANSITION.activeDays;
      if (shift && shift.triggered && !transitionActive) {
        regimeSince = ms; transitionActive = true;
        if (P != null) P += TRANSITION.pShock;
        entry.transitionTriggered = true;
        entry.intakeDelta = r2(shift.delta);
      }

      /* prediction: uncertainty grows every elapsed day */
      if (P != null) P += Q;

      /* observation: horizons, longest eligible is primary */
      var fits = [], primary = null, hz;
      for (var h = 0; h < HORIZONS.length; h++) {
        hz = fitHorizon(ms, HORIZONS[h], ctx);
        fits.push(hz);
        if (hz.eligible && !primary) primary = hz;
      }
      if (primary) {
        var R = primary.rBase, rInfl = [], disagree = false;
        for (var g = 0; g < fits.length; g++) {
          var s = fits[g];
          if (!s.eligible || s === primary || s.horizon >= primary.horizon) continue;
          var gap = Math.abs(s.rawEnergyBalanceTdee - primary.rawEnergyBalanceTdee);
          if (gap > DISAGREE.z * Math.sqrt(s.rBase + primary.rBase)) disagree = true;
        }
        if (disagree) { R *= DISAGREE.rInflate; rInfl.push("horizon_disagreement"); }
        if (transitionActive) { R *= TRANSITION.rInflate; rInfl.push("intake_transition"); }

        var Z = primary.rawEnergyBalanceTdee;
        if (T == null) { T = Z; P = R; entry.coldStart = true; entry.K = 1; entry.adjustment = null; }
        else {
          var innov = Z - T;
          if (Math.abs(innov) > SUSTAINED.z * Math.sqrt(P + R)) {
            innovationStreak++;
            if (innovationStreak >= SUSTAINED.days && !streakShocked) {
              P += SUSTAINED.pShock; streakShocked = true; entry.sustainedInnovationShock = true;
            }
          } else { innovationStreak = 0; streakShocked = false; }
          var K = P / (P + R);
          entry.K = r2(K); entry.innovation = r2(innov); entry.adjustment = r2(K * innov);
          T = T + K * innov;
          P = (1 - K) * P;
        }
        lastObsMs = ms;
        entry.primaryHorizon = primary.horizon;
        entry.Z = r2(Z); entry.R = Math.round(R); entry.rInflation = rInfl;
        entry.T = r2(T); entry.sd = r2(Math.sqrt(P));
      } else {
        entry.noObservation = true;
        if (T != null) { entry.T = r2(T); entry.sd = r2(Math.sqrt(P)); }
      }
      trail.push(entry);
    }

    if (T == null) { base.flags.push("insufficient_data"); base.updates = trail; return base; }

    /* ---- confidence and presentation (MATH §6) ---- */
    var sd = Math.sqrt(P);
    var historyDays = ctx.historyDaysAt(endMs);
    var sdLevel = sd <= 50 ? "high" : sd <= 90 ? "good" : sd <= 140 ? "moderate" : "low";
    var histLevel = historyDays >= 42 ? "high" : historyDays >= 28 ? "good" : historyDays >= 21 ? "moderate" : historyDays >= 14 ? "low" : "insufficient";
    var order = { insufficient: 0, low: 1, moderate: 2, good: 3, high: 4 };
    var level = order[sdLevel] < order[histLevel] ? sdLevel : histLevel;
    var todayEntry = trail[trail.length - 1] || {};
    var lastFits = null;
    /* recompute today's horizon snapshot for the audit (cheap relative to the fold) */
    lastFits = HORIZONS.map(function (H) { return fitHorizon(endMs, H, ctx); });

    var transitionNow = regimeSince != null && (endMs - regimeSince) / DAY_MS < TRANSITION.activeDays;
    var flags = [];
    if (transitionNow) flags.push("intake_transition");
    if ((todayEntry.rInflation || []).indexOf("horizon_disagreement") >= 0) flags.push("horizon_disagreement");
    if (todayEntry.noObservation) flags.push("no_observation_today");
    if (lastObsMs != null && (endMs - lastObsMs) / DAY_MS > 3) flags.push("stale_evidence");

    return Object.assign({}, base, {
      status: level === "insufficient" ? "insufficient" : "estimated",
      estimatedTdee: T,
      estimatedTdeeDisplay: Math.round(T / DISPLAY_STEP) * DISPLAY_STEP,
      estimatedTdeeSd: r2(sd),
      confidence: r2(1 / (1 + sd / 80)),
      confidenceLevel: level,
      confidenceLevels: { fromSd: sdLevel, fromHistory: histLevel },
      estimatedRange: [Math.round(T - RANGE_Z * sd), Math.round(T + RANGE_Z * sd)],
      historyDays: historyDays,
      regime: { state: transitionNow ? "intake_transition" : "normal",
                since: regimeSince == null ? null : isoOf(regimeSince) },
      horizons: lastFits.map(function (hz) {
        return {
          horizon: hz.horizon, eligible: hz.eligible, reason: hz.reason || null,
          weeklyTrend: r2(hz.weeklyTrend), avgIntake: r2(hz.avgIntake),
          rawEnergyBalanceTdee: r2(hz.rawEnergyBalanceTdee),
          completeCalorieDays: hz.completeCalorieDays, acceptedWeightDays: hz.acceptedWeightDays,
          weightPointsUsed: hz.weightPointsUsed, excludedWeights: hz.excludedWeights || [],
          rComponents: hz.rComponents ? { trend: Math.round(hz.rComponents.trend),
            intake: Math.round(hz.rComponents.intake), coverage: Math.round(hz.rComponents.coverage) } : null,
        };
      }),
      updates: trail,
      flags: flags,
    });
  }

  return { calculate: calculate, HORIZONS: HORIZONS, Q: Q, TRANSITION: TRANSITION,
           DISAGREE: DISAGREE, SUSTAINED: SUSTAINED, fitHorizon: fitHorizon };
});
