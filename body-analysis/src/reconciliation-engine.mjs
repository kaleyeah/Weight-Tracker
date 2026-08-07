/* Reconciliation Engine (§14) — weighted_rule_based_v1. Evaluates validity,
   compares evidence, EXPANDS ranges under disagreement, records exclusions,
   and rejects insufficient evidence rather than inventing a number.
   History influences confidence, not the estimate (§13). */
import { CONFIG, err } from "./manifest-core.mjs";
import { firstEligible } from "./formula-engine.mjs";

const r1 = (x) => Math.round(x * 10) / 10;

function validVisual(v, bounds) {
  return !!(v && v.visualEstimate &&
    typeof v.visualEstimate.low === "number" && typeof v.visualEstimate.high === "number" &&
    typeof v.visualEstimate.best === "number" &&
    v.visualEstimate.low <= v.visualEstimate.best && v.visualEstimate.best <= v.visualEstimate.high &&
    v.visualEstimate.low >= bounds.min && v.visualEstimate.high <= bounds.max);
}

/* reconcile({visualObservations, formulaResults, historicalContext})
   -> {reconciliation, error?}  (§14 shape; error is the structured §25 form) */
export function reconcile(inp, config = CONFIG) {
  const cfg = config.reconciliation || { weights: { visual: 0.6, formula: 0.4 },
    agreementBandsPct: { strong: 2, moderate: 4, weak: 6 }, minRangeWidthPct: 1.5 };
  const bounds = config.bodyFatBounds || { min: 1, max: 75 };
  const rec = { engineVersion: (config.engineVersions || {}).reconciliationEngine || "1.0.0",
    inputsConsidered: [], inputsExcluded: [], method: cfg.method || "weighted_rule_based_v1",
    agreementLevel: "insufficient", conflicts: [], finalEstimate: null };

  const vis = validVisual(inp.visualObservations, bounds) ? inp.visualObservations.visualEstimate : null;
  if (vis) rec.inputsConsidered.push("visual_estimate");
  else if (inp.visualObservations) rec.inputsExcluded.push({ input: "visual_estimate", reason: "invalid_or_out_of_bounds" });

  const f = firstEligible(inp.formulaResults);
  if (f) rec.inputsConsidered.push("formula_estimate");
  else if (inp.formulaResults && inp.formulaResults.length)
    rec.inputsExcluded.push({ input: "formula_estimate", reason: (inp.formulaResults[0].skippedReason || "ineligible") });

  if (inp.historicalContext) rec.inputsConsidered.push("historical_context");

  if (!vis) {
    /* the visual estimate is the required primary evidence (§27) */
    return { reconciliation: rec,
      error: err("INSUFFICIENT_EVIDENCE", "No valid visual estimate to reconcile.", "visualObservations", true) };
  }

  if (!f) {
    rec.agreementLevel = "insufficient";
    rec.finalEstimate = { low: r1(vis.low), high: r1(vis.high), best: r1(vis.best) };
  } else {
    const diff = Math.abs(vis.best - f.estimate);
    const b = cfg.agreementBandsPct;
    rec.agreementLevel = diff <= b.strong ? "strong" : diff <= b.moderate ? "moderate"
      : diff <= b.weak ? "weak" : "conflicting";
    const w = cfg.weights;
    const best = r1((vis.best * w.visual + f.estimate * w.formula) / (w.visual + w.formula));
    /* the final range always COVERS both pieces of evidence — disagreement
       widens the range, it never disappears into the average */
    const low = r1(Math.min(vis.low, f.estimate));
    const high = r1(Math.max(vis.high, f.estimate));
    rec.finalEstimate = { low, high, best: Math.min(high, Math.max(low, best)) };
    if (rec.agreementLevel === "conflicting")
      rec.conflicts.push({ between: ["visual_estimate", "formula_estimate"],
        detail: "visual best " + vis.best + " vs formula " + f.estimate, magnitudePct: r1(diff) });
  }

  const minW = cfg.minRangeWidthPct || 0;
  if (rec.finalEstimate && (rec.finalEstimate.high - rec.finalEstimate.low) < minW) {
    const mid = rec.finalEstimate.best;
    rec.finalEstimate.low = r1(Math.max(bounds.min, mid - minW / 2));
    rec.finalEstimate.high = r1(Math.min(bounds.max, mid + minW / 2));
  }
  return { reconciliation: rec, error: null };
}
