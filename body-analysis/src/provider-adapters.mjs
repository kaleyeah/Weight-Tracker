/* Provider Adapter interfaces (§10) — INTERFACES ONLY. Calling OpenAI or
   Luma for real is an Owner stop-condition decision that has NOT been made;
   the only shipped adapters are Null (structured PROVIDER_UNAVAILABLE) and
   the test harness injects fakes. runProvider() owns the §10 execution
   record, the timeout arm, and response-schema validation so every adapter
   — future or fake — meets the same contract. */
import { CONFIG, err } from "./manifest-core.mjs";

export const OBSERVATION_SCALE = ["none", "minimal", "limited", "moderate", "clear", "high", "unknown"];

/* validateVisualObservations(resp) -> null | structured error (§11 contract) */
export function validateVisualObservations(resp, config = CONFIG) {
  const bad = (m) => err("PROVIDER_RESPONSE_INVALID", m, "visualObservations", true);
  if (!resp || typeof resp !== "object") return bad("Response is not an object.");
  const scaleFields = ["abdominalDefinition", "waistDefinition", "chestDefinition", "armDefinition",
    "shoulderSeparation", "backDefinition", "lowerBackFatVisibility", "legDefinition", "vascularity"];
  for (const f of scaleFields)
    if (!OBSERVATION_SCALE.includes(resp[f])) return bad(f + " is not on the observation scale.");
  const ve = resp.visualEstimate;
  const b = config.bodyFatBounds;
  if (!ve || typeof ve.low !== "number" || typeof ve.high !== "number" || typeof ve.best !== "number" ||
      !(ve.low <= ve.best && ve.best <= ve.high) || ve.low < b.min || ve.high > b.max)
    return bad("visualEstimate range is missing or incoherent.");
  if (!Array.isArray(resp.fatDistributionPattern) || !Array.isArray(resp.limitations)) return bad("array fields missing.");
  return null;
}

/* the shipped default: structurally valid, deliberately unavailable */
export function nullAdapter(provider) {
  return { provider, adapterVersion: "1.0.0",
    call() { return Promise.reject(err("PROVIDER_UNAVAILABLE",
      provider + " adapter is interface-only — live calls are an Owner decision that has not been made.",
      "providerExecutions", true)); } };
}

/* runProvider(adapter, req, deps) -> {execution, response|null, error|null}
   deps: {now:()=>iso, timeoutMs, executionId} — injected for determinism. */
export async function runProvider(adapter, req, deps) {
  const cfg = CONFIG;
  const timeoutMs = deps.timeoutMs != null ? deps.timeoutMs : (cfg.providerTimeoutMs || 30000);
  const exe = { executionId: deps.executionId, purpose: req.purpose, provider: adapter.provider,
    model: "configured_server_side", providerAdapterVersion: adapter.adapterVersion,
    promptTemplateId: req.promptTemplateId, promptVersion: req.promptVersion || "1.0.0",
    responseSchemaVersion: req.responseSchemaVersion || "1.0.0",
    startedAt: deps.now(), completedAt: null, status: "running",
    providerAssetIds: [], providerRetentionState: "not_persisted",
    trainingUsePolicy: "excluded_where_supported" };
  let timer;
  try {
    const raced = await Promise.race([
      adapter.call(req),
      new Promise((_, rej) => { timer = setTimeout(() => rej({ __timeout: true }), timeoutMs); }),
    ]);
    clearTimeout(timer);
    exe.completedAt = deps.now();
    if (req.purpose === "visual_body_observation") {
      const verr = validateVisualObservations(raced);
      if (verr) { exe.status = "failed"; return { execution: exe, response: null, error: verr }; }
    }
    exe.status = "success";
    if (raced && Array.isArray(raced.providerAssetIds)) exe.providerAssetIds = raced.providerAssetIds.slice();
    if (raced && raced.providerRetentionState) exe.providerRetentionState = raced.providerRetentionState;
    return { execution: exe, response: raced, error: null };
  } catch (e) {
    clearTimeout(timer);
    exe.completedAt = deps.now();
    if (e && e.__timeout) { exe.status = "timed_out";
      return { execution: exe, response: null,
        error: err("PROVIDER_UNAVAILABLE", adapter.provider + " timed out after " + timeoutMs + "ms.", "providerExecutions", true) }; }
    exe.status = "failed";
    return { execution: exe, response: null,
      error: (e && e.code) ? e : err("PROVIDER_UNAVAILABLE", String((e && e.message) || e), "providerExecutions", true) };
  }
}
