/* Assessment API scaffolding (§30/§34 item 18) — the in-process orchestration
   layer. Every boundary validates; every state change walks STATUS_TRANSITIONS;
   every notable act lands in the audit trail. Provider adapters are INJECTED —
   the shipped defaults are Null adapters (no live provider calls without a new
   Owner decision). Deps {now, id} are injected for reproducible tests. */
import { CONFIG, validateManifest, canTransition, checkRevisionImmutability,
  applyCoachReview, projectGoalWeight, err } from "./manifest-core.mjs";
import { grantConsent, revokeConsent, consentAllows } from "./consent-service.mjs";
import { classifyForAnalysis, poseCoverage, reviewPhoto } from "./photo-services.mjs";
import { runFormulas, firstEligible } from "./formula-engine.mjs";
import { reconcile } from "./reconciliation-engine.mjs";
import { scoreConfidence, deriveFactors } from "./confidence-engine.mjs";
import { makeAudit, record, makeRetention } from "./audit-retention.mjs";
import { nullAdapter, runProvider } from "./provider-adapters.mjs";

const r1 = (x) => Math.round(x * 10) / 10;

function transition(a, to) {
  if (!canTransition(a.doc.status, to))
    throw Object.assign(new Error("illegal transition " + a.doc.status + " -> " + to), { code: "ILLEGAL_TRANSITION" });
  a.doc.status = to;
}

export function createAssessment({ athleteId, athleteContext }, deps) {
  const doc = { assessmentId: deps.id("ast"), athleteId, assessmentRevision: 1,
    assessmentType: "progress", manifestVersion: CONFIG.manifestVersion,
    createdAt: deps.now(), status: "draft",
    athleteContext: { ...athleteContext }, photos: [], photoQuality: [],
    providerExecutions: [], formulaResults: [], audit: [] };
  const a = { doc, deps, retention: makeRetention(CONFIG), _audit: makeAudit() };
  record(a._audit, "assessment_created", deps.now(), { assessmentId: doc.assessmentId });
  if ((athleteContext || {}).ageYears == null || athleteContext.ageYears < CONFIG.minimumAgeYears)
    return { assessment: a, error: err("AGE_UNSUPPORTED", "Assessments require age " + CONFIG.minimumAgeYears + "+.", "athleteContext.ageYears", false) };
  transition(a, "awaiting_inputs");
  return { assessment: a, error: null };
}

export function addMeasurements(a, measurements) {
  /* measurements live DIRECTLY on athleteContext (schema shape) */
  Object.assign(a.doc.athleteContext, measurements);
  record(a._audit, "input_added", a.deps.now(), { fields: Object.keys(measurements) });
  return null;
}
function ctxMeasurements(a) {
  const c = a.doc.athleteContext, out = {};
  for (const k of ["height", "weight", "waist", "neck", "hip", "chest", "upperArm", "thigh"])
    if (c[k]) out[k] = c[k];
  return out;
}

export function addPhoto(a, photo, checks, score) {
  const cls = classifyForAnalysis(photo);
  if (cls) { record(a._audit, "photo_rejected", a.deps.now(), { pose: photo && photo.pose, code: cls.code }); return cls; }
  const q = reviewPhoto(photo, checks, score);
  const existing = a.doc.photos.findIndex((p) => p.pose === photo.pose);
  if (existing >= 0) {
    a.doc.photos.splice(existing, 1, photo);
    const qi = a.doc.photoQuality.findIndex((x) => x.pose === photo.pose);
    if (qi >= 0) a.doc.photoQuality.splice(qi, 1, q); else a.doc.photoQuality.push(q);
    record(a._audit, "photo_replaced", a.deps.now(), { pose: photo.pose });
  } else { a.doc.photos.push(photo); a.doc.photoQuality.push(q);
    record(a._audit, "input_added", a.deps.now(), { pose: photo.pose }); }
  if (q.status === "rejected" || q.status === "retake_recommended") {
    record(a._audit, "photo_rejected", a.deps.now(), { pose: photo.pose, status: q.status });
    return err("PHOTO_QUALITY_INSUFFICIENT", "The " + photo.pose + " photo must be retaken.", "photos." + photo.pose, true);
  }
  return null;
}

export function giveConsent(a, args) {
  a.doc.consent = grantConsent({ ...args, grantedAt: a.deps.now(), consentId: a.deps.id("con") });
  record(a._audit, "consent_granted", a.deps.now(), { consentId: a.doc.consent.consentId });
  if (a.doc.status === "awaiting_inputs" || a.doc.status === "awaiting_consent") {
    if (a.doc.status === "awaiting_inputs") transition(a, "awaiting_consent");
    transition(a, "validating");
  }
  return null;
}

export function withdrawConsent(a) {
  a.doc.consent = revokeConsent(a.doc.consent, a.deps.now());
  record(a._audit, "consent_revoked", a.deps.now(), {});
  return null;
}

function requireRecentMeasurements(a) {
  const ms = ctxMeasurements(a);
  for (const need of CONFIG.requiredMeasurements)
    if (!ms[need]) return err("MISSING_REQUIRED_INPUT", "Missing measurement: " + need, "athleteContext.measurements." + need, true);
  for (const [k, days] of Object.entries(CONFIG.measurementRecencyDays)) {
    const m = ms[k];
    if (m && m.measuredAt && (Date.parse(a.deps.now()) - Date.parse(m.measuredAt)) / 86400000 > days)
      return err("STALE_MEASUREMENT", k + " is older than " + days + " days.", "athleteContext.measurements." + k, true);
  }
  return null;
}

/* runAnalysis(a, {visionAdapter}) — the §30 pipeline through reconciliation.
   Stops with a structured error at the FIRST unmet §27 requirement. */
export async function runAnalysis(a, adapters = {}) {
  const vision = adapters.visionAdapter || nullAdapter((CONFIG.providers.vision || {}).provider || "openai");
  const gate = consentAllows(a.doc.consent, "visual_body_observation");
  if (gate) return gate;
  const meas = requireRecentMeasurements(a); if (meas) return meas;
  const pc = poseCoverage(a.doc.photos); if (pc) return pc;
  const badQ = a.doc.photoQuality.find((q) => q.status === "rejected" || q.status === "retake_recommended");
  if (badQ) return err("PHOTO_QUALITY_INSUFFICIENT", "The " + badQ.pose + " photo must be retaken.", "photos." + badQ.pose, true);

  transition(a, "quality_review"); transition(a, "queued"); transition(a, "processing");
  record(a._audit, "analysis_started", a.deps.now(), {});
  record(a._audit, "provider_called", a.deps.now(), { purpose: "visual_body_observation", provider: vision.provider });
  const run = await runProvider(vision, { purpose: "visual_body_observation",
    promptTemplateId: "body_visual_observation_v1" },
    { now: a.deps.now, executionId: a.deps.id("exe"), timeoutMs: adapters.timeoutMs });
  a.doc.providerExecutions.push(run.execution);
  if (run.error) { record(a._audit, "provider_failed", a.deps.now(), { code: run.error.code, status: run.execution.status });
    transition(a, "failed"); return run.error; }
  record(a._audit, "provider_completed", a.deps.now(), { executionId: run.execution.executionId });
  a.doc.visualObservations = run.response;

  a.doc.formulaResults = runFormulas({ measurements: ctxMeasurements(a),
    estimationSex: a.doc.athleteContext.estimationSex });

  transition(a, "reconciliation");
  const rec = reconcile({ visualObservations: a.doc.visualObservations,
    formulaResults: a.doc.formulaResults, historicalContext: a.doc.historicalContext });
  a.doc.reconciliation = rec.reconciliation;
  record(a._audit, "reconciliation_completed", a.deps.now(), { agreementLevel: rec.reconciliation.agreementLevel });
  if (rec.error) { transition(a, "failed"); return rec.error; }

  const factors = deriveFactors({ photoQuality: a.doc.photoQuality,
    measurements: ctxMeasurements(a),
    reconciliation: a.doc.reconciliation, historicalContext: a.doc.historicalContext });
  a.doc.confidence = scoreConfidence(factors);
  if (a.doc.confidence.level === "insufficient_data")
    { transition(a, "failed"); return err("INSUFFICIENT_EVIDENCE", "Confidence is below the usable floor.", "confidence", true); }
  return null;
}

/* completeAssessment(a) — result assembly, projections, explanation,
   privacy + reproducibility, final validation, completion transition. */
export function completeAssessment(a) {
  const fe = a.doc.reconciliation.finalEstimate;
  const weight = a.doc.athleteContext.weight;
  const bfFrac = fe.best / 100;
  const fat = r1(weight.value * bfFrac), lean = r1(weight.value - fat);
  const warnings = a.doc.photoQuality.some((q) => q.status === "accepted_with_warnings");
  a.doc.result = {
    bodyFat: { ...fe, displayRange: fe.low + "–" + fe.high + "%", displayBest: "About " + Math.round(fe.best) + "%" },
    bodyComposition: { weight: weight.value, weightUnit: weight.unit,
      estimatedFatMass: fat, estimatedLeanMass: lean, estimatedFatFreeMass: lean },
    confidence: { level: a.doc.confidence.level,
      display: a.doc.confidence.level === "high" ? "High confidence"
        : a.doc.confidence.level === "moderate" ? "Moderate confidence" : "Low confidence" },
    officialStatus: "proposed", acceptedByAthlete: false, acceptedAt: null };
  a.doc.goalProjections = (CONFIG.goalProjectionTargets || []).map((t) => {
    const w = projectGoalWeight(lean, t);          /* number | null */
    return { targetBodyFatPercent: t,
      estimatedTargetWeight: w == null ? null : r1(w),
      estimatedFatLossRequired: w == null ? null : r1(weight.value - w),
      assumption: CONFIG.goalProjectionAssumption,
      eligible: w != null, warning: w == null ? "projection_ineligible" : null };
  });
  a.doc.explanation = buildExplanation(a);
  a.doc.privacy = { originalPhotoRetention: CONFIG.retention.originalPhotoRetention,
    temporaryCopiesRetentionHours: CONFIG.retention.temporaryCopiesRetentionHours,
    providerAssetRetention: CONFIG.retention.providerAssetRetention,
    metadataStripped: true, encryptedInTransit: true, encryptedAtRest: true,
    coachAccessGranted: a.doc.consent.optionalPurposes.coachSharing === true,
    socialSharingGranted: false, marketingUseGranted: false };
  a.doc.reproducibility = { manifestVersion: CONFIG.manifestVersion,
    formulaEngineVersion: CONFIG.engineVersions.formulaEngine,
    reconciliationEngineVersion: CONFIG.engineVersions.reconciliationEngine,
    confidenceEngineVersion: CONFIG.engineVersions.confidenceEngine,
    photoQualitySchemaVersion: CONFIG.engineVersions.photoQualitySchema,
    visualObservationSchemaVersion: CONFIG.engineVersions.visualObservationSchema,
    providerAdapterVersions: Object.fromEntries(Object.entries(CONFIG.providers)
      .map(([k, v]) => [k, v.adapterVersion])),
    configSnapshotId: CONFIG.configSnapshotId };
  a.doc.completedAt = a.deps.now();
  a.doc.audit = a._audit.map((e) => ({ event: e.type, at: e.at }));
  transition(a, warnings ? "completed_with_warnings" : "completed");
  a.doc.audit.push({ event: "assessment_completed", at: a.deps.now() });
  const v = validateManifest(a.doc);
  if (!v.ok) return { doc: a.doc, errors: v.errors };
  return { doc: a.doc, errors: [] };
}

function buildExplanation(a) {
  const fe = a.doc.reconciliation.finalEstimate;
  const primary = [], uncertainty = [], next = [];
  if (a.doc.reconciliation.agreementLevel === "strong" || a.doc.reconciliation.agreementLevel === "moderate")
    primary.push("Your measurements align with the visual estimate.");
  if (a.doc.photoQuality.every((q) => q.status === "accepted"))
    primary.push("All four poses passed quality review cleanly.");
  if ((a.doc.historicalContext || {}).historicalSupport === "supports_current_estimate")
    primary.push("Your recent trend supports this estimate.");
  for (const q of a.doc.photoQuality)
    for (const w of q.warnings) uncertainty.push("The " + q.pose.replace("_", " ") + " photo: " + w.replace(/_/g, " ") + ".");
  if (a.doc.reconciliation.conflicts.length)
    uncertainty.push("The visual and formula estimates disagree; the range was widened to cover both.");
  if (uncertainty.length) next.push("Use consistent lighting and poses for the next assessment.");
  next.push("Repeat the assessment in approximately four weeks.");
  return { summary: "Your estimate is approximately " + fe.low + "–" + fe.high +
      "% body fat, with a best estimate near " + Math.round(fe.best) + "%.",
    primaryReasons: primary, uncertaintyReasons: uncertainty, nextSteps: next,
    medicalDisclaimerVersion: CONFIG.medicalDisclaimerVersion };
}

export function acceptResult(a) {
  a.doc.result.officialStatus = "accepted";
  a.doc.result.acceptedByAthlete = true;
  a.doc.result.acceptedAt = a.deps.now();
  a.doc.audit.push({ event: "assessment_accepted", at: a.deps.now() });
  return null;
}

export function requestCoachReview(a) {
  a.doc.result.officialStatus = "coach_review_requested";
  a.doc.audit.push({ event: "coach_review_requested", at: a.deps.now() });
  return null;
}

export function submitCoachReview(a, review) { return applyCoachReview(a.doc, review); }

/* createRevision(a) -> a NEW draft assessment seeded from this one; the
   completed original is immutable and merely SUPERSEDED. */
export function createRevision(a, deps) {
  const prev = a.doc;
  const seeded = createAssessment({ athleteId: prev.athleteId,
    athleteContext: JSON.parse(JSON.stringify(prev.athleteContext)) }, deps);
  if (!seeded.error) {
    seeded.assessment.doc.assessmentRevision = prev.assessmentRevision + 1;
    seeded.assessment.doc.historicalContext = {
      priorAssessmentId: prev.assessmentId, priorAssessmentDate: prev.completedAt,
      priorBodyFatBest: prev.result ? prev.result.bodyFat.best : null };
    const imm = checkRevisionImmutability(prev, seeded.assessment.doc);
    if (imm && imm.length) return { assessment: null, error: imm[0] };
  }
  return seeded;
}
export { consentAllows, nullAdapter };
