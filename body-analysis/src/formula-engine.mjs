/* Formula Engine (§12) — navy_body_fat v1.0.0. Deterministic, config-driven,
   zero dependencies. Never fabricates missing inputs, never blindly averages:
   ineligibility is RECORDED with a reason, not papered over. */
import { CONFIG, err } from "./manifest-core.mjs";

const IN_PER_CM = 1 / 2.54;

/* normalize a measurement object {value,unit} to inches; null if unusable */
export function toInches(m) {
  if (!m || typeof m.value !== "number" || !isFinite(m.value) || m.value <= 0) return null;
  if (m.unit === "in") return m.value;
  if (m.unit === "cm") return m.value * IN_PER_CM;
  return null;
}

const log10 = (x) => Math.log(x) / Math.LN10;
const r1 = (x) => Math.round(x * 10) / 10;

/* runFormulas({measurements, estimationSex}) -> formulaResults[] (§12 shape).
   measurements: {height,waist,neck,hip,...} each {value,unit,...}. */
export function runFormulas(inputs, config = CONFIG) {
  const spec = (config.formulas || {}).navy_body_fat;
  const out = [];
  const res = { formulaId: "navy_body_fat", formulaVersion: spec ? spec.formulaVersion : "1.0.0",
    eligible: false, inputsUsed: [], estimate: null, confidence: "moderate", warnings: [] };
  out.push(res);
  if (!spec) { res.warnings.push("formula_unconfigured"); res.skippedReason = "formula_unconfigured"; return out; }

  const sex = inputs.estimationSex;
  if (sex !== "male" && sex !== "female") { res.skippedReason = "estimation_sex_unavailable"; return out; }
  const needs = spec[sex].needs;
  const m = inputs.measurements || {};
  const norm = {};
  for (const k of needs) {
    const v = toInches(m[k]);
    if (v == null) { res.skippedReason = "missing_input:" + k; return out; }
    norm[k] = v;
  }
  res.inputsUsed = needs.concat(["estimationSex"]);
  res.normalizedInputs = Object.fromEntries(Object.entries(norm).map(([k, v]) => [k, r1(v)]));
  res.normalizedUnit = "in";

  let bf;
  if (sex === "male") {
    const girth = norm.waist - norm.neck;
    if (girth <= 0) { res.skippedReason = "implausible_inputs:waist_not_greater_than_neck"; return out; }
    bf = 86.010 * log10(girth) - 70.041 * log10(norm.height) + 36.76;
  } else {
    const girth = norm.waist + norm.hip - norm.neck;
    if (girth <= 0) { res.skippedReason = "implausible_inputs:girth_sum_not_positive"; return out; }
    bf = 163.205 * log10(girth) - 97.684 * log10(norm.height) - 78.387;
  }
  const bounds = config.bodyFatBounds || { min: 1, max: 75 };
  if (bf < bounds.min || bf > bounds.max) {
    res.warnings.push("out_of_physiological_range");
    bf = Math.min(bounds.max, Math.max(bounds.min, bf));
    res.confidence = "low";
  }
  res.eligible = true;
  res.estimate = r1(bf);
  return out;
}

/* the FORMULA_UNAVAILABLE arm the pipeline reports upward (§32 case 11) */
export function firstEligible(formulaResults) {
  return (formulaResults || []).find((f) => f.eligible && typeof f.estimate === "number") || null;
}
export { err };
