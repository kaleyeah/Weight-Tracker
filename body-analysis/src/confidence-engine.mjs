/* Confidence Engine (§15) — a config-weighted factor score mapped onto the
   §15 thresholds. Factors are STRINGS the pipeline asserts; unknown factor
   names are recorded but score zero, so a new pipeline stage can never
   silently inflate confidence. */
import { CONFIG } from "./manifest-core.mjs";

export function scoreConfidence(factors, config = CONFIG) {
  const cf = config.confidenceFactors || { base: 0.5, positive: {}, negative: {} };
  const pos = factors.positiveFactors || [], neg = factors.negativeFactors || [],
    insuf = factors.insufficientFactors || [];
  let s = cf.base;
  for (const f of pos) s += cf.positive[f] || 0;
  for (const f of neg) s -= cf.negative[f] || 0;
  s = Math.max(0, Math.min(1, s));
  const t = config.confidenceThresholds;
  let level = "insufficient_data";
  if (insuf.length === 0) {
    if (s >= t.high.min) level = "high";
    else if (s >= t.moderate.min) level = "moderate";
    else if (s >= t.low.min) level = "low";
  } else s = Math.min(s, t.insufficient_data.max);
  return { engineVersion: (config.engineVersions || {}).confidenceEngine || "1.0.0",
    score: Math.round(s * 100) / 100, level,
    positiveFactors: pos.slice(), negativeFactors: neg.slice(), insufficientFactors: insuf.slice() };
}

/* derive the standard factor set from pipeline evidence (§15's examples) */
export function deriveFactors({ photoQuality, measurements, reconciliation, historicalContext }, config = CONFIG) {
  const pos = [], neg = [], insuf = [];
  const accepted = (photoQuality || []).filter((q) => q.status === "accepted" || q.status === "accepted_with_warnings");
  if (accepted.length >= (config.requiredPoses || []).length) pos.push("four_usable_poses");
  const lightingBad = (photoQuality || []).some((q) => q.checks && q.checks.adequateLighting === false);
  if (lightingBad) neg.push("lighting_inconsistent");
  const poseBad = (photoQuality || []).some((q) => q.checks && q.checks.correctPose === false);
  if (poseBad) neg.push("pose_inconsistent");
  const waist = measurements && measurements.waist;
  if (waist && waist.measuredAt) {
    const ageDays = (Date.parse(factorsNow()) - Date.parse(waist.measuredAt)) / 86400000;
    if (ageDays <= (config.measurementRecencyDays || {}).waist) pos.push("recent_waist_measurement");
    else neg.push("stale_measurements");
  }
  if (reconciliation) {
    if (reconciliation.agreementLevel === "strong" || reconciliation.agreementLevel === "moderate") {
      pos.push("visual_formula_agreement");
      if (reconciliation.inputsConsidered.includes("formula_estimate")) pos.push("formula_corroboration");
    } else if (reconciliation.agreementLevel === "conflicting" || reconciliation.agreementLevel === "weak")
      neg.push("visual_formula_disagreement");
    else neg.push("no_formula_available");
    if (!reconciliation.finalEstimate) insuf.push("no_reconciled_estimate");
  }
  if (historicalContext && historicalContext.historicalSupport === "supports_current_estimate")
    pos.push("historical_trend_support");
  else if (!historicalContext) neg.push("no_historical_context");
  return { positiveFactors: pos, negativeFactors: neg, insufficientFactors: insuf };
}

/* injectable clock so tests are deterministic */
let _now = () => new Date().toISOString();
export function factorsNow() { return _now(); }
export function setFactorsClock(fn) { _now = fn; }
