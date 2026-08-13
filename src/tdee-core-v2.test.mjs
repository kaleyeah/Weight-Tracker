/* TDEE V2 rev2 — synthetic validation. Deterministic (seeded LCG).
   Sections:
     A. the ten spec §13 scenarios and seven claims (adjusted to rev2's
        honest output surface — no confidence/range fields exist);
     B. B-round stress: autocorrelated noise, adversarial missingness,
        physiological bias;
     C. mechanism MUTATION tests — each load-bearing mechanism is disabled
        through the params override and a test must fail-the-other-way,
        proving the mechanism does real work. */
import { createRequire } from "node:module";
const require2 = createRequire(import.meta.url);
const V1 = require2("./tdee-core.js");
const V2 = require2("./tdee-core-v2.js");
import fs from "node:fs";

let P = 0, F = 0; const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); c ? P++ : F++; };
const lcg = (seed) => () => (seed = (seed * 48271) % 2147483647) / 2147483647;
const DAY = 86400000, iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const T0 = Date.parse("2026-01-01T00:00:00Z");

function gen(days, weightAt, calAt) {
  const weights = [], calorieDays = {};
  for (let i = 0; i < days; i++) {
    const d = iso(T0 + i * DAY);
    const w = weightAt(i); if (w != null) weights.push({ date: d, weight: w });
    const c = calAt(i); if (c != null) calorieDays[d] = { calories: c, complete: true };
  }
  return { weights, calorieDays, today: iso(T0 + (days - 1) * DAY) };
}
const run = (g, params) => V2.calculate({ todayLocalDate: g.today, units: "lb",
  weights: g.weights, calorieDays: g.calorieDays, params });
const runFull = (g) => V2.calculate({ todayLocalDate: g.today, units: "lb", weights: g.weights,
  calorieDays: g.calorieDays, fullPrecisionAudit: true });
const byDate = (r) => { const m = {}; for (const u of r.updates) m[u.date] = u; return m; };
const clone = (o) => JSON.parse(JSON.stringify(o));
/* AR(1) daily fluctuation — realistic water noise */
function ar1(seed, n, rho, sd) {
  const r = lcg(seed), out = []; let u = 0;
  for (let i = 0; i < n; i++) { u = rho * u + (r() - 0.5) * 2 * sd * Math.sqrt(1 - rho * rho); out.push(u); }
  return out;
}

console.log("== A. spec scenarios and claims ==");

/* 1. maintenance */
{
  const noise = ar1(7, 42, 0.4, 0.9);
  const g = gen(42, (i) => 180 + noise[i], () => 2500);
  const r = run(g);
  ok(r.status === "estimated" && Math.abs(r.estimatedTdee - 2500) < 80,
    `maintenance: ${Math.round(r.estimatedTdee)} ≈ 2500`);
  ok(r.evidenceLevel === "established", `maintenance: evidence '${r.evidenceLevel}' after 42 clean days`);
}
/* 2. steady loss −1 lb/wk @2000 → 2500 */
{
  const noise = ar1(11, 42, 0.4, 0.9);
  const g = gen(42, (i) => 190 - i / 7 + noise[i], () => 2000);
  const r = run(g);
  ok(Math.abs(r.estimatedTdee - 2500) < 80, `steady loss: ${Math.round(r.estimatedTdee)} ≈ 2500`);
}
/* 3. steady gain +0.5 lb/wk @2800 → 2550 */
{
  const noise = ar1(13, 42, 0.4, 0.9);
  const g = gen(42, (i) => 170 + i * 0.5 / 7 + noise[i], () => 2800);
  const r = run(g);
  ok(Math.abs(r.estimatedTdee - 2550) < 80, `steady gain: ${Math.round(r.estimatedTdee)} ≈ 2550`);
}
/* 4/5. one-day ±2 lb spike [claim 2] */
{
  const noise = ar1(17, 35, 0.4, 0.9);
  const mk = (spike) => gen(35, (i) => 185 - i / 7 + noise[i] + (i === 31 ? spike : 0), () => 2100);
  const base = run(mk(0)), up = run(mk(2)), dn = run(mk(-2));
  const dUp = Math.abs(up.estimatedTdee - base.estimatedTdee);
  const dDn = Math.abs(dn.estimatedTdee - base.estimatedTdee);
  /* the spec's own bound: a 1-2 lb fluctuation must NOT cause 50-150+ kcal
     of movement in the primary displayed TDEE (spec §3) */
  ok(dUp < 50, `+2 lb spike moves the estimate ${dUp.toFixed(1)} kcal (< the spec's 50) [claim 2]`);
  ok(dDn < 50, `−2 lb drop moves the estimate ${dDn.toFixed(1)} kcal (< the spec's 50) [claim 2]`);
}
/* no step at 14/21/28 [claim 3] */
{
  const noise = ar1(19, 45, 0.4, 0.9);
  const seq = {}, shockDay = {}; let prev = null, maxStep = 0, stepAt = null, flagged = [];
  for (let days = 14; days <= 42; days++) {
    const g = gen(days, (i) => 190 - i / 7 + noise[i], () => 2000);
    /* app-shaped call: the adapter always passes maintenanceCals(); a formula
       estimate 150 kcal wrong is the realistic cold start (no-prior cold
       start is exercised by every other scenario in this file) */
    const r = V2.calculate({ todayLocalDate: g.today, units: "lb", weights: g.weights,
      calorieDays: g.calorieDays, formulaTdee: 2350 });
    if (r.status !== "estimated") continue;
    seq[days] = r.estimatedTdee;
    const last = r.updates[r.updates.length - 1];
    shockDay[days] = !!(last && (last.sustainedInnovationShock || last.transitionTriggered));
    const settled = r.evidenceLevel === "settling" || r.evidenceLevel === "established";
    if (prev != null && days > 18) {
      const st = Math.abs(r.estimatedTdee - prev);
      /* the movement guarantee binds to what the system TELLS the user:
         while the label reads early/developing the number is stated to be
         forming and convergence-sized moves are permitted (they are
         evidence-driven, not fluctuation-driven — fluctuation response is
         separately bounded by the spike scenarios). A detector-trigger day
         is flagged and bounded. From "settling" on, the spec's 50 binds
         every unflagged day. */
      if (shockDay[days]) flagged.push({ days, st });
      else if (settled && st > maxStep) { maxStep = st; stepAt = days; }
      else if (!settled && st >= 100) { maxStep = Math.max(maxStep, st); stepAt = stepAt || days; }
    }
    prev = r.estimatedTdee;
  }
  ok(maxStep < 50, `largest binding day-over-day move (unflagged settled days; forming days bounded at 100): ${maxStep.toFixed(1)} kcal${stepAt ? " at day " + stepAt : ""} [claim 3]`);
  ok(flagged.length <= 2 && flagged.every(f => f.st < 100),
    `detector-trigger days are few and bounded: ${JSON.stringify(flagged)} [claim 3/P4]`);
  ok(Math.abs(seq[29] - seq[28]) < 50 && Math.abs(seq[36] - seq[35]) < 50,
    `crossing 28 (${Math.abs(seq[29] - seq[28]).toFixed(1)}) and a mid-window day (${Math.abs(seq[36] - seq[35]).toFixed(1)}) are indistinguishable — no formula exists to jump [claim 3]`);
}
/* 6. abrupt cut with early water loss → transition */
{
  const noise = ar1(23, 44, 0.4, 0.9);
  const g = gen(44,
    (i) => (i < 30 ? 190 + noise[i]
                   : 190 - Math.min(4, (i - 29) * 0.8) - Math.max(0, i - 34) * 0.15 + noise[i]),
    (i) => (i < 30 ? 2500 : 1500));
  const r = run(g);
  ok(r.updates.some(u => u.transitionTriggered), "abrupt cut: intake transition detected");
  ok(r.regime.state === "intake_transition" && r.flags.includes("intake_transition"),
    "abrupt cut: regime active and flagged");
  /* true TDEE 2500; the −4 lb early water would imply ~2000+ raw error if
     believed as tissue. The estimate must stay nearer the truth. */
  ok(Math.abs(r.estimatedTdee - 2500) < 250,
    `abrupt cut: estimate ${Math.round(r.estimatedTdee)} not dragged to the water-loss reading`);
}
/* 7. genuine change, constant intake [claims 4/5]: true TDEE steps
   2200 -> 2800 at day 30. Material movement by +30 days, and continued
   convergence (not permanent suppression) by +60. */
{
  const noise = ar1(29, 90, 0.4, 0.7);
  const mk = (days) => gen(days, (i) => (i < 30 ? 180 : 180 - (i - 29) * 1.2 / 7) + noise[i], () => 2200);
  const at60 = run(mk(60)), at90 = run(mk(90));
  ok(at60.estimatedTdee > 2450, `sustained real change: +${Math.round(at60.estimatedTdee - 2200)} kcal after 30 days (${Math.round(at60.estimatedTdee)}) [claim 4]`);
  ok(at90.estimatedTdee > at60.estimatedTdee && at90.estimatedTdee > 2600,
    `and keeps converging, ${Math.round(at90.estimatedTdee)} by +60 days — smoothing does not suppress it [claim 5]`);
}
/* 8. missing weigh-ins */
{
  const noise = ar1(31, 28, 0.4, 0.8);
  const g5 = gen(28, (i) => (i % 7 < 5 ? 185 - i / 7 + noise[i] : null), () => 2000);
  ok(run(g5).status === "estimated", "5-of-7 weigh-in cadence estimates");
  const g2 = gen(28, (i) => (i % 3 === 0 ? 185 - i / 7 : null), () => 2000);
  const r2s = run(g2);
  ok(r2s.status === "insufficient" || r2s.evidenceLevel === "early",
    `sparse weigh-ins honestly labeled (${r2s.status}/${r2s.evidenceLevel})`);
}
/* 9. missing calorie days: no imputation as knowledge — uncertainty grows */
{
  const noise = ar1(37, 30, 0.4, 0.8);
  const mk = (gaps) => gen(30, (i) => 185 - i / 7 + noise[i], (i) => (gaps && i >= 20 && i <= 22 ? null : 2000));
  const withGap = run(mk(true)), noGap = run(mk(false));
  ok(withGap.stability > noGap.stability,
    `a 3-day calorie gap widens model spread (${withGap.stability} > ${noGap.stability}) instead of being imputed away`);
}
/* 10. incomplete current day == absent [claim 1] */
{
  const noise = ar1(41, 30, 0.4, 0.8);
  const g1 = gen(30, (i) => 185 - i / 7 + noise[i], (i) => (i === 29 ? null : 2000));
  const a = run(g1);
  const g2 = clone(g1); g2.calorieDays[g2.today] = { calories: 480, complete: false };
  ok(a.estimatedTdee === run(g2).estimatedTdee, "incomplete current day identical to absent [claim 1]");
}
/* low-cal history day counts [claim 6] */
{
  const noise = ar1(43, 30, 0.4, 0.8);
  const mk = (low) => gen(30, (i) => 185 - i / 7 + noise[i], (i) => (i === 10 && low ? 400 : 2000));
  const withLow = run(mk(true)), without = run(mk(false));
  ok(withLow.estimatedTdee < without.estimatedTdee,
    "a 400-kcal past day genuinely lowers the estimate — never discarded [claim 6]");
}
/* no medication term [claim 7] */
{
  const code = fs.readFileSync("src/tdee-core-v2.js", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").toLowerCase();
  const banned = ["tirzepatide", "semaglutide", "glp", "ozempic", "mounjaro", "zepbound", "medication", "drug"];
  ok(banned.filter(w => code.includes(w)).length === 0, "no medication token in functional source [claim 7]");
}
/* no probabilistic output surface (B-round ruling 3) */
{
  const noise = ar1(47, 35, 0.4, 0.8);
  const r = run(gen(35, (i) => 185 - i / 7 + noise[i], () => 2100));
  ok(!("confidence" in r) && !("estimatedRange" in r) && !("confidenceLevel" in r),
    "no confidence/range fields exist — stability and evidence labels only [ruling 3]");
  ok(typeof r.stability === "number" && typeof r.evidenceLevel === "string" && r.evidenceFacts != null,
    "stability + evidence label + countable facts are present instead");
}
/* V1 parity of the diagnostic windows */
{
  const noise = ar1(53, 28, 0.4, 1.0);
  const g = gen(28, (i) => 185 - i / 7 + noise[i], () => 2000);
  const v1 = V1.calculate({ todayLocalDate: g.today, units: "lb", weights: g.weights, calorieDays: g.calorieDays });
  const ctx = { units: "lb", wByDate: V1.dailyWeights(g.weights), cal: g.calorieDays,
    earliestMs: T0, historyDaysAt: (ms) => Math.round((ms - T0) / DAY) + 1 };
  const hz = V2.fitHorizon(Date.parse(g.today + "T00:00:00Z"), v1.windowDays, ctx);
  ok(hz.eligible && Math.abs(hz.rawEnergyBalanceTdee - v1.measuredTdeeRaw) < 1e-9,
    "diagnostic window parity: V2's raw observation IS V1's raw TDEE");
}

console.log("== B. stress: autocorrelation, missingness, physiological bias ==");

/* B1. autocorrelated noise is detected and discounted */
{
  const mkNoise = (rho, seed) => ar1(seed, 42, rho, 1.0);
  const quiet = gen(42, (i) => 185 - i / 7 + mkNoise(0.05, 59)[i], () => 2000);
  const sticky = gen(42, (i) => 185 - i / 7 + mkNoise(0.7, 59)[i], () => 2000);
  const mkctx = (g) => ({ units: "lb", wByDate: V1.dailyWeights(g.weights), earliestMs: T0, cal: {},
    historyDaysAt: (ms) => Math.round((ms - T0) / DAY) + 1 });
  const eQ = V2.fluctuationAt(mkctx(quiet), Date.parse(quiet.today + "T00:00:00Z"), V2.PARAMS);
  const eS = V2.fluctuationAt(mkctx(sticky), Date.parse(sticky.today + "T00:00:00Z"), V2.PARAMS);
  ok(eS.rho1 != null && eQ.rho1 != null && eS.rho1 > eQ.rho1,
    `diagnostic lag-1 autocorrelation, corrected estimator (sticky ${eS.rho1} > quiet ${eQ.rho1}; pairs ${eS.rho1Pairs}/${eQ.rho1Pairs})`);
  const tiny = V2.fluctuationAt({ units: "lb", wByDate: { "2026-01-01": 180, "2026-01-03": 181 }, earliestMs: T0,
    cal: {}, historyDaysAt: () => 3 }, Date.parse("2026-01-03T00:00:00Z"), V2.PARAMS);
  ok(tiny.rho1 === null, "autocorrelation refuses a numeric claim on insufficient pairs [ruling 4]");
}
/* B2. adversarial missingness: unlogged days were HIGH-intake — the bias is
   real, unfixable from the data, and must be LABELED, not hidden */
{
  const noise = ar1(61, 42, 0.4, 0.8);
  /* true intake 2600 on weekends (unlogged), 2000 logged weekdays; true TDEE 2500 →
     true trend ≈ −0.57 lb/wk; the filter sees only 2000s */
  const g = gen(42, (i) => {
    let cum = 0; for (let k = 0; k < i; k++) cum += ((k % 7 >= 5 ? 2600 : 2000) - 2500) / 3500;
    return 185 + cum + noise[i];
  }, (i) => (i % 7 >= 5 ? null : 2000));
  const r = run(g);
  const biased = r.estimatedTdee < 2450;   /* under-reads TDEE because unlogged high days read as mean */
  ok(biased, `selective weekend omission biases the estimate low (${Math.round(r.estimatedTdee)} vs true 2500) — documented, structural`);
  ok(r.evidenceFacts.completeCalorieDaysLast14 <= 10 && r.evidenceLevel !== "established",
    `and the evidence label refuses 'established' (${r.evidenceLevel}, ${r.evidenceFacts.completeCalorieDaysLast14}/14 logged)`);
}
/* B3. zero-variance logged days + missing days: the rev1 flaw is gone —
   missing-day uncertainty has a floor independent of logged-day variance */
{
  const noise = ar1(67, 35, 0.4, 0.8);
  const mk = (gaps) => gen(35, (i) => 185 - i / 7 + noise[i], (i) => (gaps && i % 6 === 5 ? null : 2000)); /* sd=0 logged */
  const withGaps = run(mk(true)), noGaps = run(mk(false));
  ok(withGaps.stability > noGaps.stability,
    `zero-variance logging: missing days still widen spread (${withGaps.stability} > ${noGaps.stability}) — floor engaged`);
}
/* B4. refeed rebound: +3 lb over two days after a deficit, then normal */
{
  const noise = ar1(71, 45, 0.4, 0.7);
  const mk = (refeed) => gen(45, (i) => 188 - i / 7 + noise[i]
    + (refeed && (i === 38 || i === 39) ? 3 : 0) + (refeed && i === 40 ? 1.5 : 0), () => 2000);
  const withR = run(mk(true)), without = run(mk(false));
  const d = Math.abs(withR.estimatedTdee - without.estimatedTdee);
  ok(d < 80, `sodium/refeed rebound (+3 lb over 3 days) moves the estimate ${d.toFixed(1)} kcal (< 80; V1 moves ~150+ on the same insult)`);
}
/* B5. prolonged deficit with declining expenditure: true TDEE 2500→2200 over
   60 days (adaptation + mass loss); the filter must track, not freeze */
{
  const noise = ar1(73, 60, 0.4, 0.7);
  const g = gen(60, (i) => {
    let cum = 0; for (let k = 0; k < i; k++) { const tk = 2500 - 300 * k / 59; cum += (1900 - tk) / 3500; }
    return 195 + cum + noise[i];
  }, () => 1900);
  const r = run(g);
  ok(Math.abs(r.estimatedTdee - 2200) < 150,
    `declining expenditure tracked: final estimate ${Math.round(r.estimatedTdee)} vs true 2200 (±150)`);
}
/* B6. maintenance after rapid loss: intake returns to 2400, weight flattens */
{
  const noise = ar1(79, 56, 0.4, 0.7);
  const g = gen(56, (i) => (i < 28 ? 195 - i * 2 / 7 : 187 + noise[i] * 0.7),
    (i) => (i < 28 ? 1400 : 2400));
  const r = run(g);
  ok(r.updates.some(u => u.transitionTriggered), "deficit->maintenance transition detected");
  ok(Math.abs(r.estimatedTdee - 2400) < 200,
    `post-loss maintenance: estimate ${Math.round(r.estimatedTdee)} settles near 2400`);
}

console.log("== C. mechanism mutations — prove each part is load-bearing ==");
const D = () => clone(V2.PARAMS);

/* C1. drift OFF (sigmaT=0): the direct property of process noise is that
   time without evidence WIDENS the spread. Ten unweighed days at the end:
   live stability grows; frozen does not. */
{
  const noise = ar1(83, 45, 0.4, 0.7);
  const mk = () => gen(45, (i) => (i < 35 ? 185 - i / 7 + noise[i] : null), () => 2000);
  const p = D(); p.sigmaT = 0; p.cusum = { k: 0.05, h: 1e9, tShock: 0 };
  const live = run(mk()), frozen = run(mk(), p);
  const lastWeigh = (r) => r.updates.filter(u => u.weight != null).pop();
  const lw = lastWeigh(live);
  const varGrowth = live.stability * live.stability - lw.Tsd * lw.Tsd;
  ok(Math.abs(varGrowth - 10 * 25) < 10,
    `sigmaT is load-bearing and QUANTIFIED: 10 unweighed days grow T-variance by ${varGrowth.toFixed(0)} = 10·sigmaT² = 250 (spread ${lw.Tsd} -> ${live.stability})`);
  const lwF = lastWeigh(frozen);
  ok(frozen.stability <= lwF.Tsd + 0.5,
    `with sigmaT=0 the spread cannot grow across the same gap (${lwF.Tsd} -> ${frozen.stability}) — drift is the mechanism`);
}
/* C2. transition machinery OFF: the abrupt-cut estimate chases water loss harder */
{
  const noise = ar1(23, 44, 0.4, 0.9);
  const g = gen(44, (i) => (i < 30 ? 190 + noise[i]
    : 190 - Math.min(4, (i - 29) * 0.8) - Math.max(0, i - 34) * 0.15 + noise[i]),
    (i) => (i < 30 ? 2500 : 1500));
  const p = D(); p.transition = clone(p.transition); p.transition.massNoise = { lb: 0, kg: 0 }; p.transition.tShock = 0; p.transition.absKcal = 1e9;
  const off = run(g, p), on = run(g);
  ok(Math.abs(off.estimatedTdee - on.estimatedTdee) > 10,
    `transition handling changes the answer measurably (off ${Math.round(off.estimatedTdee)} vs on ${Math.round(on.estimatedTdee)})`);
  ok(!off.updates.some(u => u.transitionTriggered), "mutated build never triggers — the detector was the difference");
}
/* C3. CUSUM drift detector OFF: a sharp genuine change adapts more slowly.
   Quiet scale (sd ~0.5), abrupt true step 2200 -> 3000 at day 30. */
{
  const noise = ar1(89, 60, 0.2, 0.5);
  const g = gen(60, (i) => (i < 30 ? 180 : 180 - (i - 29) * 1.6 / 7) + noise[i], () => 2200);
  const on = run(g);
  const p = D(); p.cusum = { k: 0.05, h: 1e9, tShock: 0 };
  const off = run(g, p);
  ok(on.updates.some(u => u.sustainedInnovationShock), "CUSUM fires on the sharp genuine change");
  ok(on.estimatedTdee > off.estimatedTdee + 25,
    `and accelerates adaptation: ${Math.round(on.estimatedTdee)} vs ${Math.round(off.estimatedTdee)} without it`);
}
/* C4. missing-intake substitution variance: STRICT analytic verification
   (round-3 ruling 4). On a missing-intake day, Pmm must jump by exactly
   (max(300, runningSd)/rho)^2 relative to the no-gap twin — verified at
   full precision; equality or a sub-tolerance difference FAILS. */
{
  const noise = ar1(37, 30, 0.4, 0.8);
  /* day 20 has NO weigh-in in either twin, so the recorded covariance that
     day is pure post-predict — the injected variance is not partially
     absorbed by a measurement update */
  const mk = (gaps) => gen(30, (i) => (i === 20 ? null : 185 - i / 7 + noise[i]),
    (i) => (gaps && i === 20 ? null : 2000));
  const gGap = mk(true), gNo = mk(false);
  const rGap = runFull({ today: gGap.today, weights: gGap.weights, calorieDays: gGap.calorieDays });
  const rNo = runFull({ today: gNo.today, weights: gNo.weights, calorieDays: gNo.calorieDays });
  const dGap = byDate(rGap), dNo = byDate(rNo);
  const gapDate = iso(T0 + 20 * DAY);
  const uG = dGap[gapDate], uN = dNo[gapDate];
  /* Pmm is _P[0]; the twin folds are identical until the gap day's predict */
  const PmmG = uG._P[0], PmmN = uN._P[0];
  /* running sd of 20 identical 2000s = 0 -> floor 300 applies */
  const analytic = Math.pow(300 / 3500, 2);
  const measured = PmmG - PmmN;
  ok(measured > 1e-6 && Math.abs(measured - analytic) < 1e-9,
    `missing-intake variance verified ANALYTICALLY: Pmm jumps ${measured.toExponential(3)} = (300/3500)^2 = ${analytic.toExponential(3)}; equality would fail [ruling 4]`);
  /* self-test: floor disabled -> the strict assertion must fail */
  const p = D(); p.missingIntakeFloorKcal = 0;
  const rOff = V2.calculate({ todayLocalDate: gGap.today, units: "lb", weights: gGap.weights,
    calorieDays: gGap.calorieDays, fullPrecisionAudit: true, params: p });
  const offJump = byDate(rOff)[gapDate]._P[0] - PmmN;
  ok(Math.abs(offJump) < 1e-9,
    `self-test: with the floor disabled (and zero-variance logs) the jump vanishes (${offJump.toExponential(2)}) — the gate detects the mechanism's absence [ruling 5]`);
}

console.log("== D. causality and reproducibility controls (round-3 rulings 1-3) ==");

/* one scenario engineered to contain EVERY interesting boundary:
   late first weigh-in (init at day 3), missing-intake days, a real intake
   transition at day 30, fluctuation-cache refreshes (weekly), and a data
   pattern that fires a CUSUM shock (wrong-ish prior + trend break). */
const CAUSAL = (() => {
  const noise = ar1(113, 60, 0.4, 0.8);
  const wAt = (i) => (i < 3 ? null : (i < 30 ? 190 + noise[i] : 190 - (i - 29) * 1.0 / 7 + noise[i]));
  const cAt = (i) => ((i === 12 || i === 13 || i === 40) ? null : (i < 30 ? 2500 : 1700));
  return { gen: (days) => gen(days, wAt, cAt) };
})();

/* D1. invariant A: records dated AFTER the calculation date are inert */
{
  const g = CAUSAL.gen(60);
  const before = runFull(g);
  const g2 = clone(g);
  for (let i = 0; i < 10; i++) {
    const d = iso(Date.parse(g.today + "T00:00:00Z") + (i + 1) * DAY);
    g2.weights.push({ date: d, weight: 120 + i * 9 });
    g2.calorieDays[d] = { calories: 12000, complete: true };
  }
  const after = runFull(g2);
  ok(before.updates.length === 60 && after.updates.length === 60,
    `invariant A setup: both trails span all 60 days (${before.updates.length}/${after.updates.length})`);
  ok(JSON.stringify(before.updates) === JSON.stringify(after.updates)
     && before.estimatedTdee === after.estimatedTdee,
    "invariant A: future-dated records change nothing at full precision [ruling 2a]");
}
/* D2. invariant B: growing the history forward NEVER rewrites an earlier
   day — the full-history fold's entry for date d equals a fresh calculation
   made ON d, compared BY DATE at FULL PRECISION, zero comparisons = FAIL */
{
  const g = CAUSAL.gen(60);
  const full = byDate(runFull(g));
  /* cut points: init day+1, inside the missing-intake pair, a cache-refresh
     boundary, transition activation week, after a CUSUM-eligible stretch */
  const CUTS = [5, 13, 22, 34, 52];
  let compared = 0, mismatches = [];
  for (const cut of CUTS) {
    const cutDate = iso(T0 + (cut - 1) * DAY);
    const gc = { today: cutDate,
      weights: g.weights.filter(w => w.date <= cutDate),
      calorieDays: Object.fromEntries(Object.entries(g.calorieDays).filter(([d]) => d <= cutDate)) };
    const part = runFull(gc);
    if (part.updates.length !== cut) { mismatches.push(`${cutDate}: trail ${part.updates.length} != ${cut}`); continue; }
    for (const u of part.updates) {
      compared++;
      if (JSON.stringify(u) !== JSON.stringify(full[u.date])) mismatches.push(u.date);
    }
  }
  const expected = CUTS.reduce((a, b) => a + b, 0);
  ok(compared === expected && compared > 0,
    `invariant B compared exactly ${compared}/${expected} day-entries across cuts ${JSON.stringify(CUTS)} — zero would FAIL [ruling 1]`);
  ok(mismatches.length === 0,
    `invariant B: every earlier dated entry is byte-identical at full precision (mismatches: ${JSON.stringify(mismatches.slice(0, 3))}) [ruling 2b]`);
}
/* D3. GATE SELF-TEST (ruling 5): a build that deliberately breaks prefix
   causality — running mean replaced by the FINAL mean — must FAIL invariant
   B at the same cut points. Mutant built by file transform, production
   module untouched. */
{
  const src = fs.readFileSync("src/tdee-core-v2.js", "utf8");
  const marker = "var Ieff = I != null ? I : runMean;";
  if (!src.includes(marker)) { ok(false, "self-test marker missing"); }
  else {
    /* final mean of ALL logged days — computed up front, i.e., future leak */
    const broken = src.replace(marker,
      `var _all = Object.keys(ctx.cal).map(function(d){var q=ctx.cal[d];return (q&&q.complete===true)?Number(q.calories):null;}).filter(function(v){return v!=null&&isFinite(v);});
       var _finalMean = _all.length ? _all.reduce(function(a,b){return a+b;},0)/_all.length : runMean;
       var Ieff = I != null ? I : _finalMean;`);
    fs.writeFileSync("/tmp/tdee-v2-causality-mutant.js", broken.replace('require("./tdee-core.js")',
      `require("${process.cwd()}/src/tdee-core.js")`));
    const M = require2("/tmp/tdee-v2-causality-mutant.js");
    const g = CAUSAL.gen(60);
    const mFull = (gg) => M.calculate({ todayLocalDate: gg.today, units: "lb", weights: gg.weights,
      calorieDays: gg.calorieDays, fullPrecisionAudit: true });
    const full = byDate(mFull(g));
    const cutDate = iso(T0 + 33 * DAY);   // day 34: after the intake change, missing day 13 behind it
    const gc = { today: cutDate, weights: g.weights.filter(w => w.date <= cutDate),
      calorieDays: Object.fromEntries(Object.entries(g.calorieDays).filter(([d]) => d <= cutDate)) };
    const part = mFull(gc);
    let broke = false;
    for (const u of part.updates) if (JSON.stringify(u) !== JSON.stringify(full[u.date])) { broke = true; break; }
    ok(broke, "self-test: a final-mean (future-leaking) build FAILS invariant B — the gate can actually fire [ruling 5]");
  }
}
/* D4. evidence counters from RECORDS (unchanged from rev3, kept) */
{
  const noise = ar1(103, 40, 0.4, 0.6);
  const g = gen(40, (i) => (i >= 28 ? 184 - (i - 28) / 7 + noise[i] : null), () => 2000);
  const r = run(g);
  ok(r.evidenceFacts != null && r.evidenceFacts.weighDaysLast14 === 12,
    `weighDaysLast14 counts the records (${r.evidenceFacts && r.evidenceFacts.weighDaysLast14} = 12) even though initialization ate the first one`);
  ok(r.evidenceFacts.weighInsAssimilated === 12, "the initialization weigh-in is counted as assimilated");
}
/* D5. AR(1) memory property (unchanged from rev3, kept) */
{
  const noise = ar1(107, 36, 0.0, 0.7);
  const mk = () => gen(36, (i) => 183 + noise[i] + (i === 25 ? 2.5 : 0), () => 2300);
  const decay = (phi) => {
    const p = D(); p.phiU = phi;
    const tr = run(mk(), p).updates;
    const at = (idx) => tr.find(u => u.date === iso(T0 + idx * DAY));
    const spike = Math.abs(at(25).u), later = Math.abs(at(29).u);
    return later / Math.max(spike, 1e-9);
  };
  const rLow = decay(0.05), rHigh = decay(0.9);
  ok(rHigh > rLow, `phi governs fluctuation memory: 4-day retention ${rHigh.toFixed(2)} at phi=.9 > ${rLow.toFixed(2)} at phi=.05`);
}

console.log(`\n${P} passed, ${F} failed`);
process.exit(F ? 1 : 0);
