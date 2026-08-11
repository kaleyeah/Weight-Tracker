/* Compound Fitness — calorie and macro targets, deterministic core.
 *
 * Extracted verbatim from state-glp-calc.js so the SAME arithmetic can run in
 * three places that must never disagree: the phone, the coach report, and the
 * codex answering "what should my macros be?". The codex runs on a VPS with no
 * browser and no node, so its Python port is checked against golden vectors
 * generated from THIS file (src/macro-golden.mjs). If the two ever drift, that
 * test fails rather than an athlete getting two different numbers.
 *
 * Pure: explicit inputs, no `state`, no DOM, no storage. Every function returns
 * null when an input it needs is missing, and null propagates — a missing age
 * can never become a maintenance figure.
 *
 * WHOSE RULE IS WHOSE (Owner ruling R3). The 1 g per lb of TARGET bodyweight
 * anchor and the 20-30% fat band are Max's, attested by the Owner. The 40 g
 * fat FLOOR has no source in the corpus — it is Compound's own guardrail and
 * must be labelled as such wherever it changes an answer, never attributed to
 * him. FAT_FLOOR_G is exported so a caller can tell when it bound.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MacroCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* Conversion constants copied EXACTLY as the app has them. They are not
     exact reciprocals (1/0.45359237 = 2.2046226...), and "correcting" that
     would change shipped numbers and break parity with the app. */
  var LB_PER_KG = 2.20462;
  var KG_PER_LB = 0.45359237;

  /* Compound's, not Max's — see the header note. */
  var FAT_FLOOR_G = 40;
  /* The share of calories taken as fat. Max gives a 20-30% band and calls the
     position within it an athlete preference; the app has always used the low
     end, so that stays the default and the band is expressible. */
  var FAT_PCT_DEFAULT = 0.20;

  var ACTIVITY = {
    bmr: 1, sedentary: 1.2, light: 1.375, moderate: 1.4625,
    active: 1.55, intense: 1.725, physical: 1.9
  };

  function num(v) {
    if (v === null || v === undefined || v === "") return null;
    var n = typeof v === "number" ? v : parseFloat(String(v));
    return isFinite(n) ? n : null;
  }

  function toKg(weight, units) {
    var w = num(weight);
    if (w === null) return null;
    return units === "kg" ? w : w * KG_PER_LB;
  }

  function toLb(weight, units) {
    var w = num(weight);
    if (w === null) return null;
    return units === "kg" ? w * LB_PER_KG : w;
  }

  /* Mifflin-St Jeor. Returns null unless sex, age, height AND weight are all
     present — there is no default body. */
  function bmr(o) {
    o = o || {};
    if (o.sex !== "male" && o.sex !== "female") return null;
    var age = num(o.ageYears); if (age === null) return null;
    var ft = num(o.heightFt);
    var cm = num(o.heightCm);
    var H;
    if (cm !== null) H = cm;
    else if (ft !== null) H = (ft * 12 + (num(o.heightIn) || 0)) * 2.54;
    else return null;
    var wKg = o.weightKg !== undefined ? num(o.weightKg) : toKg(o.weight, o.units);
    if (wKg === null) return null;
    return Math.round(10 * wKg + 6.25 * H - 5 * age + (o.sex === "male" ? 5 : -161));
  }

  function activityMult(level) {
    return Object.prototype.hasOwnProperty.call(ACTIVITY, level) ? ACTIVITY[level] : null;
  }

  function maintenance(o) {
    o = o || {};
    var b = o.bmrValue !== undefined ? num(o.bmrValue) : bmr(o);
    var m = activityMult(o.activityLevel);
    return (b !== null && m !== null) ? Math.round(b * m) : null;
  }

  /* The daily calorie gap implied by a weekly rate. 500 cal/day per lb/week is
     the app's constant; it is an approximation of 3500 cal per pound and is
     kept exactly as shipped. */
  function dailyDeficit(o) {
    o = o || {};
    var tv = num(o.targetValue);
    if (tv === null || tv <= 0) return 0;
    var weekly;
    if (o.targetType === "percent_bw_per_week") {
      var cw = num(o.currentWeight);
      if (cw === null) return 0;
      weekly = (tv / 100) * cw;
    } else {
      weekly = tv;
    }
    var weeklyLbs = o.units === "kg" ? weekly * LB_PER_KG : weekly;
    return weeklyLbs * 500;
  }

  function dailyDelta(o) {
    o = o || {};
    var mode = o.strategy || "lose";
    if (mode === "maintain") return 0;
    var mag = dailyDeficit(o);
    return mode === "gain" ? mag : -mag;
  }

  function targetIntake(o) {
    o = o || {};
    var m = o.maintenanceValue !== undefined ? num(o.maintenanceValue) : maintenance(o);
    if (m === null) return null;
    return Math.round(m + dailyDelta(o));
  }

  /* One gram per pound of TARGET bodyweight. Needs nothing but the goal, which
     is why a bare "195 lbs, goal 175" can answer the protein half in full even
     with no profile on file. */
  function suggestedProteinG(o) {
    o = o || {};
    var lbs = toLb(o.goalWeight, o.units);
    if (lbs === null) return null;
    return Math.round(lbs);
  }

  /* Protein anchored, fat a share of calories with Compound's floor, carbs the
     remainder. `fatFloorApplied` is returned so the caller can name the floor
     as Compound's rather than passing it off as his. */
  function suggestedMacros(o) {
    o = o || {};
    var cal = num(o.calories);
    var pro = num(o.proteinG);
    if (cal === null || pro === null) return null;
    var pct = num(o.fatPct);
    if (pct === null) pct = FAT_PCT_DEFAULT;
    var fat = Math.round(cal * pct / 9);
    var floored = false;
    if (fat < FAT_FLOOR_G) { fat = FAT_FLOOR_G; floored = true; }
    var carb = Math.round(Math.max(0, cal - pro * 4 - fat * 9) / 4);
    return { protein: pro, carbs: carb, fat: fat, cal: cal, fatFloorApplied: floored };
  }

  return {
    LB_PER_KG: LB_PER_KG, KG_PER_LB: KG_PER_LB,
    FAT_FLOOR_G: FAT_FLOOR_G, FAT_PCT_DEFAULT: FAT_PCT_DEFAULT,
    ACTIVITY: ACTIVITY,
    toKg: toKg, toLb: toLb,
    bmr: bmr, activityMult: activityMult, maintenance: maintenance,
    dailyDeficit: dailyDeficit, dailyDelta: dailyDelta, targetIntake: targetIntake,
    suggestedProteinG: suggestedProteinG, suggestedMacros: suggestedMacros
  };
});
