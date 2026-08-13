/* Compound Fitness — TDEE estimator V2, revision 2. NOT production primary.
 *
 * REVISION 2 (Architect review 2026-08-13). Revision 1 assimilated a rolling
 * multi-day window every day as if each day brought independent evidence —
 * the windows overlapped almost completely, so the filter's variance shrank
 * illegitimately and its "confidence" numbers claimed a precision the model
 * had not earned. This revision:
 *   - filters over GENUINELY INCREMENTAL daily observations (each weigh-in
 *     and each logged day enters the estimator exactly once);
 *   - keeps the multi-day windows as DIAGNOSTIC raw observations only
 *     (reported for audit and the detail view, never assimilated);
 *   - makes no calibrated-uncertainty claim: outputs are model-relative
 *     stability and evidence-quality labels, not probabilities or ranges.
 *
 * The model (src/TDEE-V2-MATH.md, revision 2, written before this code):
 *   state      x = [ m  true body mass (weight units)
 *                    T  expenditure consistent with LOGGED intake (kcal/day) ]
 *   dynamics   m += (I − T)/ρ per day   (ρ = 3,500 kcal/lb · 7,700/kg — the
 *              audit convention; its dynamic bias is documented, not hidden)
 *              T += drift               (random walk, σ_T = 5 kcal/day/day)
 *   measure    scale weight = m + fluctuation noise (water/glycogen/gut),
 *              variance and lag-1 autocorrelation ESTIMATED from the user's
 *              own residuals, autocorrelation handled by the standard
 *              effective-information inflation (1+ρ₁)/(1−ρ₁).
 *
 * T estimates "expenditure consistent with your logs": systematic intake
 * under-recording lowers T one-for-one. That is stated, not corrected —
 * and it is the operationally right quantity for setting logged-calorie
 * targets, which is what the app does with it.
 *
 * Pure function, UMD, V1's discipline: no UI, no AI, no storage, and no
 * medication awareness of any kind — nothing here reads or infers it.
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

  /* ---- tuning parameters (MATH rev2 §5) — every one an explicit knob,
     none calibrated, all swept in the sensitivity table ---- */
  var PARAMS = {
    sigmaT: 5,                 // kcal/day/day — TDEE random-walk drift
    priorTsd: 400,             // kcal — width of the initial TDEE prior
    fluctFloor: { lb: 0.7, kg: 0.32 },  // daily scale-noise sd floor
    missingIntakeSdMult: 1.0,  // unlogged day: intake sd × this feeds mass noise
    transition: {
      recentDays: 7, priorDays: 14, minRecent: 5, minPrior: 10,
      absKcal: 300, relFrac: 0.15, activeDays: 14,
      tShock: 75 * 75,         // one-time T-variance bump at trigger
      massNoise: { lb: 0.3, kg: 0.14 }, // extra non-energy mass sd/day while active
    },
    /* drift detection: Page's CUSUM on standardized innovations. The
       allowance follows the textbook k = delta/2 rule, but delta here is the
       signal the MODEL's own geometry produces: a persistent TDEE error dT
       biases each one-day-ahead innovation by only (dT/rho)/sqrt(S) — for
       dT=300 kcal and typical S that is ~0.1 sigma, so k=0.05. h=2 trades
       detection delay (~2 weeks on a 600-kcal step) against occasional
       false triggers on quiet data; a false trigger only widens T-variance
       briefly and self-heals. Both knobs are in the sensitivity sweep. */
    cusum: { k: 0.05, h: 2, tShock: 75 * 75 },
    discrepancy: 250,          // kcal — heuristic window-disagreement flag (no σ claim)
    displayStep: 10,
  };
  var HORIZONS = [42, 28, 21, 14];        // diagnostic windows only
  var CAL_RATIO = 6 / 7, WEIGH_RATIO = 5 / 7;

  var DAY_MS = 86400000;
  function parseDate(iso) { var p = String(iso).split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function isoOf(ms) {
    var d = new Date(ms), z = function (n) { return String(n).padStart(2, "0"); };
    return d.getUTCFullYear() + "-" + z(d.getUTCMonth() + 1) + "-" + z(d.getUTCDate());
  }
  function r2(x) { return x == null ? null : Math.round(x * 100) / 100; }

  /* ---- diagnostic window fit — V1's pipeline reused literally; the raw
     energy-balance observation per horizon, for audit only ---- */
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

  /* ---- per-user scale-noise estimation (MATH rev2 §3): robust residuals
     against a repeated-median fit over ALL accepted daily weights, their
     MAD-based sd, and lag-1 autocorrelation on date-adjacent residuals.
     Estimated from the data — a measurement, not a tuning knob. ---- */
  function estimateFluctuation(ctx, endMs) {
    var pts = [];
    Object.keys(ctx.wByDate).forEach(function (d) {
      var ms = parseDate(d);
      if (ms <= endMs) pts.push({ x: Math.round((ms - ctx.earliestMs) / DAY_MS), y: ctx.wByDate[d], date: d });
    });
    pts.sort(function (a, b) { return a.x - b.x; });
    var floor = PARAMS.fluctFloor[ctx.units];
    if (pts.length < 8) return { sd: floor, rho1: 0.3, n: pts.length, defaulted: true };
    var det = V1.detectWeightOutliers(pts, ctx.units, pts.length); // reuse for its robust fit
    if (!det.applicable || det.robustSlopePerDay == null)
      return { sd: floor, rho1: 0.3, n: pts.length, defaulted: true };
    var m = det.robustSlopePerDay, b = det.robustIntercept;
    var res = pts.map(function (p) { return { x: p.x, r: p.y - (m * p.x + b) }; });
    var sd = Math.max(floor, 1.4826 * medianAbs(res.map(function (o) { return o.r; })));
    var num = 0, den = 0, count = 0;
    for (var i = 1; i < res.length; i++) {
      if (res[i].x - res[i - 1].x === 1) { num += res[i].r * res[i - 1].r; count++; }
      den += res[i - 1].r * res[i - 1].r;
    }
    var rho1 = (count >= 5 && den > 0) ? Math.max(0, Math.min(0.8, num / den)) : 0.3;
    return { sd: sd, rho1: rho1, n: pts.length, defaulted: false };
  }
  function medianAbs(a) {
    var s = a.map(Math.abs).sort(function (x, y) { return x - y; }), n = s.length;
    return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0;
  }

  function intakeShift(endMs, ctx, prm) {
    var recent = [], prior = [], ms = endMs, T = (prm || PARAMS).transition;
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
   * Same input shape as V1.calculate. `params` may override PARAMS members —
   * used ONLY by the sensitivity harness; the app never passes it.
   */
  function calculate(input) {
    input = input || {};
    var units = input.units === "kg" ? "kg" : "lb";
    var prm = input.params || PARAMS;
    var today = input.todayLocalDate;
    var base = {
      model: "v2r2", status: "insufficient",
      estimatedTdee: null, estimatedTdeeDisplay: null,
      /* NO probabilistic claims: stability is MODEL-RELATIVE (how settled the
         filter is under its own assumptions), evidence is a label built from
         countable facts. Neither is a confidence interval. */
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

    var fluct = estimateFluctuation(ctx, endMs);
    var calPerUnit = V1.CAL_PER_UNIT[units];
    /* effective measurement variance: autocorrelated fluctuation carries less
       information per reading than iid noise — standard inflation */
    var Rw = Math.pow(fluct.sd, 2) * (1 + fluct.rho1) / (1 - fluct.rho1);

    /* intake stats for missing-day handling */
    var intakes = [];
    Object.keys(ctx.cal).forEach(function (d) {
      var c = ctx.cal[d];
      if (parseDate(d) <= endMs && c && c.complete === true && isFinite(Number(c.calories))) intakes.push(Number(c.calories));
    });
    var intakeMean = intakes.length ? intakes.reduce(function (a, b) { return a + b; }, 0) / intakes.length : null;
    var intakeSd = 0;
    if (intakes.length > 1) {
      var sv = 0; intakes.forEach(function (c) { var dc = c - intakeMean; sv += dc * dc; });
      intakeSd = Math.sqrt(sv / (intakes.length - 1));
    }

    /* ---- the daily two-state filter (MATH rev2 §2) ----
       x=[m,T]; P is its 2x2 covariance [[Pmm,PmT],[PmT,PTT]] */
    var m = null, T = null, Pmm = 0, PmT = 0, PTT = 0;
    var regimeSince = null, cusumPos = 0, cusumNeg = 0;
    var completeDays14 = 0, weighDays14 = 0;
    var trail = [], obsCount = 0, lastWeighMs = null;

    for (var ms = earliestMs; ms <= endMs; ms += DAY_MS) {
      var iso = isoOf(ms);
      var entry = { date: iso };
      var c = ctx.cal[iso];
      var logged = !!(c && c.complete === true && isFinite(Number(c.calories)));
      var I = logged ? Number(c.calories) : null;
      var w = ctx.wByDate[iso];

      /* transition detection */
      var shift = intakeShift(ms, ctx, prm);
      var transitionActive = regimeSince != null && (ms - regimeSince) / DAY_MS < prm.transition.activeDays;
      if (shift && shift.triggered && !transitionActive) {
        regimeSince = ms; transitionActive = true;
        if (T != null) PTT += prm.transition.tShock;
        entry.transitionTriggered = true; entry.intakeDelta = r2(shift.delta);
      }

      if (m == null) {
        /* initialize on the first weigh-in; T's prior = formulaTdee if the
           app supplies it (already user-visible as "formula estimate"),
           else the running intake mean, else nothing yet */
        if (w != null) {
          m = w; Pmm = Rw; PmT = 0;
          var t0 = input.formulaTdee != null ? Number(input.formulaTdee) : intakeMean;
          if (t0 != null) { T = t0; PTT = Math.pow(prm.priorTsd, 2); entry.init = { m: w, T: r2(T), source: input.formulaTdee != null ? "formulaTdee" : "intakeMean" }; }
        }
        trail.push(entry); continue;
      }
      if (T == null) {
        var t1 = input.formulaTdee != null ? Number(input.formulaTdee) : intakeMean;
        if (t1 != null) { T = t1; PTT = Math.pow(prm.priorTsd, 2); entry.init = { T: r2(T) }; }
        else { trail.push(entry); continue; }
      }

      /* predict: m += (I−T)/ρ ; T unchanged. F = [[1,−1/ρ],[0,1]] */
      var rho = calPerUnit;
      var Ieff = I != null ? I : intakeMean;           // best available; extra noise below
      m = m + (Ieff - T) / rho;
      var Pmm2 = Pmm - 2 * PmT / rho + PTT / (rho * rho);
      var PmT2 = PmT - PTT / rho;
      Pmm = Pmm2; PmT = PmT2;
      PTT = PTT + Math.pow(prm.sigmaT, 2);
      /* process noise on mass: unlogged intake and non-energy mass change */
      if (I == null) Pmm += Math.pow((intakeSd || 300) * prm.missingIntakeSdMult / rho, 2) + Math.pow(300 / rho, 2);
      if (transitionActive) Pmm += Math.pow(prm.transition.massNoise[units], 2);

      /* measure: scale weight (if any) — each weigh-in enters exactly once */
      if (w != null) {
        var innov = w - m;
        var S = Pmm + Rw;
        var Km = Pmm / S, Kt = PmT / S;
        m = m + Km * innov;
        T = T + Kt * innov;
        var Pmm3 = (1 - Km) * Pmm, PmT3 = (1 - Km) * PmT;
        PTT = PTT - Kt * PmT; PmT = PmT3; Pmm = Pmm3;
        obsCount++; lastWeighMs = ms;
        entry.weight = w; entry.innovation = r2(innov);
        entry.Kt = r2(Kt); entry.adjustment = r2(Kt * innov);
        /* CUSUM drift detection on the standardized innovation */
        var e = innov / Math.sqrt(S), cs = prm.cusum || PARAMS.cusum;
        cusumPos = Math.max(0, cusumPos + e - cs.k);
        cusumNeg = Math.max(0, cusumNeg - e - cs.k);
        if (cusumPos > cs.h || cusumNeg > cs.h) {
          PTT += cs.tShock; entry.sustainedInnovationShock = true;
          cusumPos = 0; cusumNeg = 0;
        }
        entry.cusum = r2(Math.max(cusumPos, cusumNeg));
      } else entry.noWeighIn = true;
      if (I == null) entry.noIntake = true;
      entry.T = r2(T); entry.m = r2(m); entry.Tsd = r2(Math.sqrt(Math.max(PTT, 0)));
      trail.push(entry);

      /* rolling 14-day evidence counters for the label */
      if (endMs - ms < 14 * DAY_MS) { if (logged) completeDays14++; if (w != null) weighDays14++; }
    }

    if (T == null || obsCount < 8) { base.flags.push("insufficient_data"); base.updates = trail; return base; }

    var historyDays = ctx.historyDaysAt(endMs);
    /* diagnostic windows + heuristic discrepancy flag (no σ claim) */
    var horizons = HORIZONS.map(function (H) { return fitHorizon(endMs, H, ctx); });
    var eligibleRaw = horizons.filter(function (h) { return h.eligible; }).map(function (h) { return h.rawEnergyBalanceTdee; });
    var discrepant = false;
    for (var a = 0; a < eligibleRaw.length; a++)
      for (var b2 = a + 1; b2 < eligibleRaw.length; b2++)
        if (Math.abs(eligibleRaw[a] - eligibleRaw[b2]) > prm.discrepancy) discrepant = true;

    var transitionNow = regimeSince != null && (endMs - regimeSince) / DAY_MS < prm.transition.activeDays;
    var Tsd = Math.sqrt(Math.max(PTT, 0));

    /* evidence label from COUNTABLE FACTS (MATH rev2 §6) — heuristic, stated */
    var facts = {
      historyDays: historyDays, weighInsAssimilated: obsCount,
      completeCalorieDaysLast14: completeDays14, weighDaysLast14: weighDays14,
      daysSinceLastWeighIn: lastWeighMs == null ? null : Math.round((endMs - lastWeighMs) / DAY_MS),
      intakeTransitionActive: transitionNow, windowsDisagree: discrepant,
      scaleNoiseSd: r2(fluct.sd), scaleNoiseLag1: r2(fluct.rho1), scaleNoiseDefaulted: fluct.defaulted,
    };
    var level;
    if (historyDays < 14 || obsCount < 10) level = "insufficient";
    else if (historyDays < 21 || completeDays14 < 10 || weighDays14 < 8) level = "early";
    else if (historyDays < 28 || transitionNow || discrepant) level = "developing";
    else if (historyDays < 42 || completeDays14 < 12 || weighDays14 < 10) level = "settling";
    else level = "established";   /* 42+ days AND current coverage 12/14 cal, 10/14 weigh */
    if (level === "insufficient") { base.flags.push("insufficient_data"); base.updates = trail; base.evidenceFacts = facts; return base; }

    var flags = [];
    if (transitionNow) flags.push("intake_transition");
    if (discrepant) flags.push("window_discrepancy");
    if (facts.daysSinceLastWeighIn != null && facts.daysSinceLastWeighIn > 3) flags.push("stale_weigh_ins");
    if (fluct.sd > (units === "kg" ? 0.68 : 1.5)) flags.push("high_weight_variability");

    return Object.assign({}, base, {
      status: "estimated",
      estimatedTdee: T,
      estimatedTdeeDisplay: Math.round(T / prm.displayStep) * prm.displayStep,
      /* model-relative settledness of the filter under its own assumptions;
         NOT a calibrated uncertainty. Exposed for audit and trend, not UI. */
      stability: r2(Tsd),
      evidenceLevel: level,
      evidenceFacts: facts,
      estimatedMass: r2(m),
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

  return { calculate: calculate, PARAMS: PARAMS, HORIZONS: HORIZONS, fitHorizon: fitHorizon,
           estimateFluctuation: estimateFluctuation };
});
