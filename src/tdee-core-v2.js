/* Compound Fitness — TDEE estimator V2, revision 3. NOT production primary.
 *
 * REVISION 3 (Architect round 2, 2026-08-13). Rev2's defects, fixed here:
 *   - PREFIX-CAUSAL: every quantity used on day d (initialization, missing-
 *     intake prediction, intake variability, scale-noise scale, transition
 *     state) is computed from records dated <= d only. A negative control
 *     proves appending future data leaves every earlier trail entry
 *     byte-identical.
 *   - Missing-intake handling is NAMED for what it is: model-based
 *     substitution in the state transition — the running PAST-ONLY intake
 *     mean stands in, with added variance (300-kcal floor). It is not
 *     "no imputation"; non-random missingness still biases T (adversarially
 *     demonstrated and labeled).
 *   - The autocorrelation shortcut is GONE. Sticky water noise is an
 *     explicit colored state: scale = m + u + iid quantization noise,
 *     u an AR(1) with fixed phi (a stated design constant, swept) and
 *     stationary sd estimated prefix-causally from robust residuals.
 *   - Evidence counts come from the RECORDS, not filter control flow.
 *   - CUSUM constants were selected AGAINST PREDEFINED synthetic targets
 *     (delay/false-alarm distributions across seeds and regimes — see
 *     docs/TDEE-V2-CUSUM-CALIBRATION.md), never against Owner data.
 *
 * Model (TDEE-V2-MATH.md rev3):
 *   state  x = [ m   true body mass
 *                T   expenditure consistent with LOGGED intake (kcal/day)
 *                u   persistent fluctuation mass (water/glycogen/gut) ]
 *   dyn    m += (I − T)/ρ ;  T += w_T ;  u = φu + w_u
 *   meas   scale = m + u + ε        ε iid (scale quantization + posture)
 *
 * T is "expenditure consistent with your logs": systematic under-recording
 * lowers it one-for-one — stated, uncorrected, uncorrectable from this data.
 * Pure function, UMD, no UI, no AI, no storage, no medication awareness.
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

  var PARAMS = {
    sigmaT: 5,                  // kcal/day/day drift of T
    priorTsd: 400,              // initial T prior sd
    phiU: 0.5,                  // AR(1) daily persistence of fluctuation mass
    epsSd: { lb: 0.3, kg: 0.14 },      // iid scale noise (quantization etc.)
    uSdFloor: { lb: 0.6, kg: 0.27 },   // fluctuation sd floor
    missingIntakeFloorKcal: 300,       // substitution-variance floor
    transition: {
      recentDays: 7, priorDays: 14, minRecent: 5, minPrior: 10,
      absKcal: 300, relFrac: 0.15, activeDays: 14,
      tShock: 75 * 75,
      uNoise: { lb: 0.3, kg: 0.14 },   // extra fluctuation drive while active
    },
    /* Selected against PREDEFINED synthetic targets (median false alarms
       <= 1 AND 90th-pct <= 2 per 56 quiet days in every regime; median
       detection of a 600-kcal step <= 28 days) via the calibration harness:
       docs/TDEE-V2-CUSUM-CALIBRATION.md. Achieved: worst-regime FA median 1,
       90th-pct 1, worst-regime median detection 11 days. NOT tuned on
       Owner data. */
    cusum: { k: 0.125, h: 8, tShock: 75 * 75 },
    discrepancy: 250,           // heuristic window-disagreement flag, no sigma claim
    displayStep: 10,
  };
  var HORIZONS = [42, 28, 21, 14];
  var CAL_RATIO = 6 / 7, WEIGH_RATIO = 5 / 7;

  var DAY_MS = 86400000;
  function parseDate(iso) { var p = String(iso).split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function isoOf(ms) {
    var d = new Date(ms), z = function (n) { return String(n).padStart(2, "0"); };
    return d.getUTCFullYear() + "-" + z(d.getUTCMonth() + 1) + "-" + z(d.getUTCDate());
  }
  function r2(x) { return x == null ? null : Math.round(x * 100) / 100; }
  function med(a) { var s = a.slice().sort(function (x, y) { return x - y; }), n = s.length;
    return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; }

  /* ---- diagnostic window fit — V1's pipeline, unchanged from rev2 ---- */
  function fitHorizon(endMs, H, ctx) {
    var startMs = endMs - (H - 1) * DAY_MS;
    var out = { horizon: H, eligible: false, reason: null };
    if (ctx.historyDaysAt(endMs) < H) { out.reason = "insufficient_history"; return out; }
    var complete = [], missRun = 0, longestRun = 0, wPoints = [];
    for (var i = 0; i < H; i++) {
      var iso = isoOf(startMs + i * DAY_MS);
      var c = ctx.cal[iso];
      if (c && c.complete === true && isFinite(Number(c.calories))) { complete.push(Number(c.calories)); missRun = 0; }
      else { missRun++; if (missRun > longestRun) longestRun = missRun; }
      if (ctx.wByDate[iso] != null) wPoints.push({ x: i, y: ctx.wByDate[iso], date: iso });
    }
    var needCal = Math.ceil(CAL_RATIO * H), needW = Math.ceil(WEIGH_RATIO * H);
    out.completeCalorieDays = complete.length; out.requiredCalorieDays = needCal;
    out.acceptedWeightDays = wPoints.length; out.requiredWeightDays = needW;
    out.longestMissingRun = longestRun;
    if (complete.length < needCal) { out.reason = "calorie_days"; return out; }
    if (wPoints.length < needW) { out.reason = "weigh_ins"; return out; }
    if (longestRun > V1.MAX_CONSECUTIVE_MISSING) { out.reason = "missing_run"; return out; }
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
    var sum = 0; complete.forEach(function (c) { sum += c; });
    out.eligible = true;
    out.weeklyTrend = slope * 7;
    out.avgIntake = sum / complete.length;
    out.rawEnergyBalanceTdee = out.avgIntake - slope * V1.CAL_PER_UNIT[ctx.units];
    out.weightPointsUsed = fitPoints.length;
    out.excludedWeights = det.applicable ? det.candidates.filter(function (c) { return c.excluded; })
      .map(function (c) { return { date: c.date, weight: c.weight, residual: r2(c.residual) }; }) : [];
    out.outlierWithheld = withheld;
    return out;
  }

  /* ---- PREFIX-CAUSAL fluctuation-scale estimate as of endMs ---- */
  function fluctuationAt(ctx, endMs, prm) {
    var pts = [];
    Object.keys(ctx.wByDate).forEach(function (d) {
      var ms = parseDate(d);
      if (ms <= endMs) pts.push({ x: Math.round((ms - ctx.earliestMs) / DAY_MS), y: ctx.wByDate[d], date: d });
    });
    pts.sort(function (a, b) { return a.x - b.x; });
    var floor = prm.uSdFloor[ctx.units];
    if (pts.length < 8) return { uSd: floor, n: pts.length, defaulted: true, rho1: null, rho1Pairs: 0 };
    var det = V1.detectWeightOutliers(pts, ctx.units, pts.length);
    if (!det.applicable || det.robustSlopePerDay == null)
      return { uSd: floor, n: pts.length, defaulted: true, rho1: null, rho1Pairs: 0 };
    var m = det.robustSlopePerDay, b = det.robustIntercept;
    var res = pts.map(function (p) { return { x: p.x, r: p.y - (m * p.x + b) }; });
    var mad = med(res.map(function (o) { return Math.abs(o.r); })) || 0;
    var totalSd = 1.4826 * mad;
    /* split: iid component epsSd is fixed; the colored state u gets the rest */
    var eps = prm.epsSd[ctx.units];
    var uSd = Math.max(floor, Math.sqrt(Math.max(0, totalSd * totalSd - eps * eps)));
    /* DIAGNOSTIC lag-1 autocorrelation (round-2 ruling 4): centered pairs,
       adjacent dates only, both moments over the SAME pair sample, SIGNED,
       reported only with >= 8 pairs — otherwise null, no numeric claim. */
    var pairs = [];
    for (var i = 1; i < res.length; i++)
      if (res[i].x - res[i - 1].x === 1) pairs.push([res[i - 1].r, res[i].r]);
    var rho1 = null;
    if (pairs.length >= 8) {
      var xs = [], ys = [];
      pairs.forEach(function (p) { xs.push(p[0]); ys.push(p[1]); });
      var mx = xs.reduce(function (aa, cv) { return aa + cv; }, 0) / xs.length;
      var my = ys.reduce(function (aa, cv) { return aa + cv; }, 0) / ys.length;
      var num = 0, dx = 0, dy = 0;
      for (var j = 0; j < pairs.length; j++) {
        num += (xs[j] - mx) * (ys[j] - my);
        dx += (xs[j] - mx) * (xs[j] - mx); dy += (ys[j] - my) * (ys[j] - my);
      }
      rho1 = (dx > 0 && dy > 0) ? num / Math.sqrt(dx * dy) : null;
    }
    return { uSd: uSd, n: pts.length, defaulted: false,
             rho1: rho1 == null ? null : r2(rho1), rho1Pairs: pairs.length };
  }

  /* prefix-causal intake-shift detector (reads only records <= endMs) */
  function intakeShift(endMs, ctx, prm) {
    var recent = [], prior = [], ms = endMs, T = prm.transition;
    while (ms >= ctx.earliestMs && prior.length < T.priorDays) {
      var c = ctx.cal[isoOf(ms)];
      if (c && c.complete === true && isFinite(Number(c.calories))) {
        if (recent.length < T.recentDays) recent.push(Number(c.calories));
        else prior.push(Number(c.calories));
      }
      ms -= DAY_MS;
    }
    if (recent.length < T.minRecent || prior.length < T.minPrior) return null;
    var ra = recent.reduce(function (a, b) { return a + b; }, 0) / recent.length;
    var pa = prior.reduce(function (a, b) { return a + b; }, 0) / prior.length;
    return { delta: ra - pa, threshold: Math.max(T.absKcal, T.relFrac * pa),
             triggered: Math.abs(ra - pa) >= Math.max(T.absKcal, T.relFrac * pa) };
  }

  /**
   * Same input shape as V1.calculate; optional `params` override is used by
   * the test/calibration harnesses only (the app never passes it).
   */
  function calculate(input) {
    input = input || {};
    var units = input.units === "kg" ? "kg" : "lb";
    var prm = input.params || PARAMS;
    var today = input.todayLocalDate;
    var base = {
      model: "v2r3", status: "insufficient",
      estimatedTdee: null, estimatedTdeeDisplay: null,
      stability: null, evidenceLevel: "insufficient", evidenceFacts: null,
      flags: [], updates: [], horizons: [], regime: { state: "normal", since: null },
      units: units, calculatedAt: input.now || new Date().toISOString(),
    };
    if (!today) { base.flags.push("no_local_date"); return base; }

    var ctx = { units: units, wByDate: V1.dailyWeights(input.weights), cal: input.calorieDays || {} };
    var endMs = parseDate(today), earliestMs = null;
    Object.keys(ctx.cal).forEach(function (d) { var ms = parseDate(d); if (ms <= endMs && (earliestMs == null || ms < earliestMs)) earliestMs = ms; });
    Object.keys(ctx.wByDate).forEach(function (d) { var ms = parseDate(d); if (ms <= endMs && (earliestMs == null || ms < earliestMs)) earliestMs = ms; });
    if (earliestMs == null) { base.flags.push("no_history"); return base; }
    ctx.earliestMs = earliestMs;
    ctx.historyDaysAt = function (ms) { return Math.round((ms - earliestMs) / DAY_MS) + 1; };
    var calPerUnit = V1.CAL_PER_UNIT[units];
    var eps2 = Math.pow(prm.epsSd[units], 2);
    var phi = prm.phiU;

    /* ---- prefix-causal fold: x=[m,T,u], P 3x3 (m=0, T=1, u=2) ---- */
    var x = null, P = null;
    var runCount = 0, runMean = 0, runM2 = 0;        // running PAST-ONLY intake stats
    var regimeSince = null, cusumPos = 0, cusumNeg = 0;
    var trail = [], weighAssimilated = 0, lastWeighMs = null;
    var fluctCache = { at: null, val: null };

    for (var ms = earliestMs; ms <= endMs; ms += DAY_MS) {
      var iso = isoOf(ms);
      var entry = { date: iso };
      var c = ctx.cal[iso];
      var logged = !!(c && c.complete === true && isFinite(Number(c.calories)));
      var I = logged ? Number(c.calories) : null;
      var w = ctx.wByDate[iso];

      /* refresh the prefix-causal fluctuation scale weekly */
      if (fluctCache.at == null || ms - fluctCache.at >= 7 * DAY_MS) {
        fluctCache = { at: ms, val: fluctuationAt(ctx, ms, prm) };
      }
      var uSd = fluctCache.val.uSd;
      var uStat2 = uSd * uSd;
      var qU = uStat2 * (1 - phi * phi);

      var shift = intakeShift(ms, ctx, prm);
      var transitionActive = regimeSince != null && (ms - regimeSince) / DAY_MS < prm.transition.activeDays;
      if (shift && shift.triggered && !transitionActive) {
        regimeSince = ms; transitionActive = true;
        if (x != null) P[1][1] += prm.transition.tShock;
        entry.transitionTriggered = true; entry.intakeDelta = r2(shift.delta);
      }

      if (x == null) {
        if (w != null) {
          var t0 = input.formulaTdee != null ? Number(input.formulaTdee)
                 : (runCount >= 3 ? runMean : null);
          if (t0 != null) {
            x = [w, t0, 0];
            P = [[uStat2 + eps2, 0, 0], [0, Math.pow(prm.priorTsd, 2), 0], [0, 0, uStat2]];
            entry.init = { m: w, T: r2(t0), source: input.formulaTdee != null ? "formulaTdee" : "runningIntakeMean" };
            weighAssimilated++; lastWeighMs = ms;   // the init weigh-in IS assimilated
            entry.T = r2(x[1]); entry.Tsd = r2(Math.sqrt(P[1][1]));
          } else entry.awaitingPrior = true;
        }
        if (logged) { runCount++; var d0 = I - runMean; runMean += d0 / runCount; runM2 += d0 * (I - runMean); }
        trail.push(entry); continue;
      }

      /* --- predict. Ieff on an unlogged day is MODEL-BASED SUBSTITUTION:
         the running past-only intake mean, with substitution variance below. */
      var Ieff = I != null ? I : runMean;
      var rho = calPerUnit;
      var nm = x[0] + (Ieff - x[1]) / rho;
      var nu = phi * x[2];
      x = [nm, x[1], nu];
      var a = 1 / rho;
      var Pmm = P[0][0] - a * (P[1][0] + P[0][1]) + a * a * P[1][1];
      var PmT = P[0][1] - a * P[1][1];
      var Pmu = phi * (P[0][2] - a * P[1][2]);
      var PTT = P[1][1] + Math.pow(prm.sigmaT, 2);
      var PTu = phi * P[1][2];
      var Puu = phi * phi * P[2][2] + qU + (transitionActive ? Math.pow(prm.transition.uNoise[units], 2) : 0);
      if (I == null) {
        var runSd = runCount > 1 ? Math.sqrt(runM2 / (runCount - 1)) : 0;
        var subSd = Math.max(prm.missingIntakeFloorKcal, runSd);
        Pmm += Math.pow(subSd / rho, 2);
        entry.noIntake = true;
      }
      P = [[Pmm, PmT, Pmu], [PmT, PTT, PTu], [Pmu, PTu, Puu]];

      /* --- measure: scale = m + u + eps --- */
      if (w != null) {
        var innov = w - (x[0] + x[2]);
        var PHt = [P[0][0] + P[0][2], P[1][0] + P[1][2], P[2][0] + P[2][2]];
        var S = PHt[0] + PHt[2] + eps2;
        var K = [PHt[0] / S, PHt[1] / S, PHt[2] / S];
        x = [x[0] + K[0] * innov, x[1] + K[1] * innov, x[2] + K[2] * innov];
        var Pn = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
        for (var r = 0; r < 3; r++) for (var cc = 0; cc < 3; cc++)
          Pn[r][cc] = P[r][cc] - K[r] * PHt[cc];
        P = Pn;
        weighAssimilated++; lastWeighMs = ms;
        entry.weight = w; entry.innovation = r2(innov);
        entry.Kt = r2(K[1]); entry.adjustment = r2(K[1] * innov);
        var e = innov / Math.sqrt(S), cs = prm.cusum;
        cusumPos = Math.max(0, cusumPos + e - cs.k);
        cusumNeg = Math.max(0, cusumNeg - e - cs.k);
        if (cusumPos > cs.h || cusumNeg > cs.h) {
          P[1][1] += cs.tShock; entry.sustainedInnovationShock = true;
          cusumPos = 0; cusumNeg = 0;
        }
        entry.cusum = r2(Math.max(cusumPos, cusumNeg));
      } else entry.noWeighIn = true;
      entry.T = r2(x[1]); entry.m = r2(x[0]); entry.u = r2(x[2]);
      entry.Tsd = r2(Math.sqrt(Math.max(P[1][1], 0)));
      trail.push(entry);

      /* running intake stats AFTER the day is consumed — strictly past-only */
      if (logged) { runCount++; var d1 = I - runMean; runMean += d1 / runCount; runM2 += d1 * (I - runMean); }
    }

    /* ---- evidence facts from the RECORDS, independent of filter flow ---- */
    var completeDays14 = 0, weighDays14 = 0;
    for (var k14 = 0; k14 < 14; k14++) {
      var dIso = isoOf(endMs - k14 * DAY_MS);
      var cc14 = ctx.cal[dIso];
      if (cc14 && cc14.complete === true && isFinite(Number(cc14.calories))) completeDays14++;
      if (ctx.wByDate[dIso] != null) weighDays14++;
    }

    if (x == null || weighAssimilated < 8) { base.flags.push("insufficient_data"); base.updates = trail; return base; }

    var historyDays = ctx.historyDaysAt(endMs);
    var horizons = HORIZONS.map(function (H) { return fitHorizon(endMs, H, ctx); });
    var eligibleRaw = horizons.filter(function (h) { return h.eligible; }).map(function (h) { return h.rawEnergyBalanceTdee; });
    var discrepant = false;
    for (var a2 = 0; a2 < eligibleRaw.length; a2++)
      for (var b2 = a2 + 1; b2 < eligibleRaw.length; b2++)
        if (Math.abs(eligibleRaw[a2] - eligibleRaw[b2]) > prm.discrepancy) discrepant = true;

    var transitionNow = regimeSince != null && (endMs - regimeSince) / DAY_MS < prm.transition.activeDays;
    var T = x[1], Tsd = Math.sqrt(Math.max(P[1][1], 0));
    var fluctNow = fluctCache.val;

    var facts = {
      historyDays: historyDays, weighInsAssimilated: weighAssimilated,
      completeCalorieDaysLast14: completeDays14, weighDaysLast14: weighDays14,
      daysSinceLastWeighIn: lastWeighMs == null ? null : Math.round((endMs - lastWeighMs) / DAY_MS),
      intakeTransitionActive: transitionNow, windowsDisagree: discrepant,
      fluctuationSd: r2(fluctNow.uSd), fluctuationDefaulted: fluctNow.defaulted,
      residualLag1: fluctNow.rho1, residualLag1Pairs: fluctNow.rho1Pairs,
    };
    var level;
    if (historyDays < 14 || weighAssimilated < 10) level = "insufficient";
    else if (historyDays < 21 || completeDays14 < 10 || weighDays14 < 8) level = "early";
    else if (historyDays < 28 || transitionNow || discrepant) level = "developing";
    else if (historyDays < 42 || completeDays14 < 12 || weighDays14 < 10) level = "settling";
    else level = "established";
    if (level === "insufficient") { base.flags.push("insufficient_data"); base.updates = trail; base.evidenceFacts = facts; return base; }

    var flags = [];
    if (transitionNow) flags.push("intake_transition");
    if (discrepant) flags.push("window_discrepancy");
    if (facts.daysSinceLastWeighIn != null && facts.daysSinceLastWeighIn > 3) flags.push("stale_weigh_ins");
    if (fluctNow.uSd > (units === "kg" ? 0.68 : 1.5)) flags.push("high_weight_variability");

    return Object.assign({}, base, {
      status: "estimated",
      estimatedTdee: T,
      estimatedTdeeDisplay: Math.round(T / prm.displayStep) * prm.displayStep,
      stability: r2(Tsd),          // model-relative settledness; never an accuracy claim
      evidenceLevel: level,        // data-sufficiency label; the facts are authoritative
      evidenceFacts: facts,
      estimatedMass: r2(x[0]), estimatedFluctuation: r2(x[2]),
      historyDays: historyDays,
      regime: { state: transitionNow ? "intake_transition" : "normal",
                since: regimeSince == null ? null : isoOf(regimeSince) },
      horizons: horizons.map(function (hz) {
        return { horizon: hz.horizon, eligible: hz.eligible, reason: hz.reason || null,
          weeklyTrend: r2(hz.weeklyTrend), avgIntake: r2(hz.avgIntake),
          rawEnergyBalanceTdee: r2(hz.rawEnergyBalanceTdee),
          completeCalorieDays: hz.completeCalorieDays, acceptedWeightDays: hz.acceptedWeightDays,
          weightPointsUsed: hz.weightPointsUsed, excludedWeights: hz.excludedWeights || [] };
      }),
      updates: trail,
      flags: flags,
    });
  }

  return { calculate: calculate, PARAMS: PARAMS, HORIZONS: HORIZONS,
           fitHorizon: fitHorizon, fluctuationAt: fluctuationAt };
});
