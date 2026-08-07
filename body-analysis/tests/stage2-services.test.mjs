/* Stage 2 — services, engines, adapters, API scaffolding (§34 items 6–18,
   minus live providers). Deterministic: injected clock + id counter; the
   only async is the adapter boundary. Zero dependencies. */
import { CONFIG, validateManifest } from "../src/manifest-core.mjs";
import { runFormulas, firstEligible, toInches } from "../src/formula-engine.mjs";
import { reconcile } from "../src/reconciliation-engine.mjs";
import { scoreConfidence, deriveFactors, setFactorsClock } from "../src/confidence-engine.mjs";
import { grantConsent, revokeConsent, consentAllows } from "../src/consent-service.mjs";
import { classifyForAnalysis, poseCoverage, deriveQualityStatus, reviewPhoto } from "../src/photo-services.mjs";
import { makeAudit, record, makeRetention, registerTempCopy, expiredTempCopies,
  deleteTempCopy, requestProviderDeletion, confirmProviderDeletion } from "../src/audit-retention.mjs";
import { nullAdapter, runProvider, validateVisualObservations } from "../src/provider-adapters.mjs";
import { createAssessment, addMeasurements, addPhoto, giveConsent, withdrawConsent,
  runAnalysis, completeAssessment, acceptResult, submitCoachReview, createRevision } from "../src/assessment-api.mjs";

let passed = 0; const failures = [];
const test = (n, f) => { try { const r = f(); if (r && r.then) throw new Error("async test used sync runner");
  passed++; console.log("  PASS  " + n); } catch (e) { failures.push(n); console.log("  FAIL  " + n + "\n        " + e.message); } };
const atest = async (n, f) => { try { await f(); passed++; console.log("  PASS  " + n); }
  catch (e) { failures.push(n); console.log("  FAIL  " + n + "\n        " + e.message); } };
const ok = (v, m) => { if (!v) throw new Error(m || "expected truthy"); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || "eq") + ": " + JSON.stringify(a) + " !== " + JSON.stringify(b)); };
const near = (a, b, tol, m) => { if (Math.abs(a - b) > tol) throw new Error((m || "near") + ": " + a + " !~ " + b); };

/* deterministic deps */
const T0 = Date.parse("2026-08-06T22:00:00Z");
let tick = 0, idn = 0;
const deps = { now: () => new Date(T0 + (tick++) * 1000).toISOString(), id: (p) => p + "_t" + String(++idn).padStart(5, "0") };
setFactorsClock(() => new Date(T0).toISOString());

const meas = (value, unit, agoDays = 0) => ({ value, unit,
  measuredAt: new Date(T0 - agoDays * 86400000).toISOString(), source: "manual", quality: "confirmed" });
const GOODCHECKS = { personDetected: true, singlePerson: true, fullBodyVisible: true, bodyCentered: true,
  correctPose: true, adequateLighting: true, adequateSharpness: true, minimalObstruction: true,
  cameraAngleAcceptable: true, likelySameAthlete: true, likelyGeneratedOrManipulated: false };
const photo = (pose, i) => ({ photoId: "pho_stage2" + i, pose, assetClass: "real_progress_photo",
  captureMethod: "compound_camera", capturedAt: new Date(T0).toISOString(),
  storageLocation: "private_compound_storage", analysisEligible: true, generatedImage: false, metadataStripped: true });
const POSES = ["front", "left_side", "right_side", "back"];
const VISUAL = { abdominalDefinition: "limited", waistDefinition: "moderate", chestDefinition: "moderate",
  armDefinition: "moderate", shoulderSeparation: "moderate", backDefinition: "limited",
  lowerBackFatVisibility: "moderate", legDefinition: "moderate", vascularity: "minimal",
  fatDistributionPattern: ["lower_abdomen"], muscularityLevel: "moderately_muscular",
  looseSkinPossibility: "low", poseConsistency: "good", lightingConsistency: "acceptable",
  visualEstimate: { low: 20, high: 23, best: 21.5 }, visualConfidence: "moderate", limitations: [] };
const fakeVision = (resp) => ({ provider: "openai", adapterVersion: "1.0.0", call: () => Promise.resolve(resp) });

console.log("Stage 2 — formula engine");
test("navy male known value (34.5w/15n/70h in) lands ~18.5", () => {
  const r = runFormulas({ estimationSex: "male",
    measurements: { height: meas(70, "in"), waist: meas(34.5, "in"), neck: meas(15, "in") } });
  ok(r[0].eligible, "ineligible: " + r[0].skippedReason); near(r[0].estimate, 18.5, 0.2); });
test("navy female known value (30w/38hip/13n/65h) lands ~28.6", () => {
  const r = runFormulas({ estimationSex: "female",
    measurements: { height: meas(65, "in"), waist: meas(30, "in"), neck: meas(13, "in"), hip: meas(38, "in") } });
  ok(r[0].eligible); near(r[0].estimate, 28.6, 0.2); });
test("cm inputs normalize to the same estimate as inches", () => {
  const a = runFormulas({ estimationSex: "male",
    measurements: { height: meas(70, "in"), waist: meas(34.5, "in"), neck: meas(15, "in") } });
  const b = runFormulas({ estimationSex: "male",
    measurements: { height: meas(177.8, "cm"), waist: meas(87.63, "cm"), neck: meas(38.1, "cm") } });
  near(a[0].estimate, b[0].estimate, 0.1); near(toInches(meas(2.54, "cm")), 1, 1e-9); });
test("missing neck is RECORDED, never fabricated (§32 c11 formula unavailable)", () => {
  const r = runFormulas({ estimationSex: "male",
    measurements: { height: meas(70, "in"), waist: meas(34.5, "in") } });
  eq(r[0].eligible, false); eq(r[0].skippedReason, "missing_input:neck"); eq(firstEligible(r), null); });
test("waist not greater than neck is implausible, not an estimate", () => {
  const r = runFormulas({ estimationSex: "male",
    measurements: { height: meas(70, "in"), waist: meas(14, "in"), neck: meas(15, "in") } });
  eq(r[0].eligible, false); ok(/implausible/.test(r[0].skippedReason)); });
test("out-of-bounds result clamps WITH a warning and low confidence", () => {
  const r = runFormulas({ estimationSex: "male",       /* girth 0.5in -> deeply negative */
    measurements: { height: meas(70, "in"), waist: meas(12.5, "in"), neck: meas(12, "in") } });
  ok(r[0].eligible); ok(r[0].warnings.includes("out_of_physiological_range"), r[0].warnings.join(","));
  eq(r[0].estimate, CONFIG.bodyFatBounds.min); eq(r[0].confidence, "low"); });

console.log("Stage 2 — reconciliation engine");
const F_OK = [{ formulaId: "navy_body_fat", formulaVersion: "1.0.0", eligible: true, inputsUsed: [], estimate: 20.8, confidence: "moderate", warnings: [] }];
test("agreement: close visual+formula reconcile as strong, range covers both", () => {
  const { reconciliation: r, error } = reconcile({ visualObservations: VISUAL, formulaResults: F_OK });
  eq(error, null); eq(r.agreementLevel, "strong");
  eq(r.finalEstimate.low, 20); eq(r.finalEstimate.high, 23);
  near(r.finalEstimate.best, 21.2, 0.05); });
test("§32 c12: conflicting formula WIDENS the range and records the conflict", () => {
  const far = [{ ...F_OK[0], estimate: 30 }];
  const { reconciliation: r } = reconcile({ visualObservations: VISUAL, formulaResults: far });
  eq(r.agreementLevel, "conflicting"); eq(r.finalEstimate.high, 30); eq(r.finalEstimate.low, 20);
  eq(r.conflicts.length, 1); });
test("no formula: visual passes through, agreement insufficient, exclusion recorded", () => {
  const skipped = [{ ...F_OK[0], eligible: false, estimate: null, skippedReason: "missing_input:neck" }];
  const { reconciliation: r } = reconcile({ visualObservations: VISUAL, formulaResults: skipped });
  eq(r.agreementLevel, "insufficient"); eq(r.finalEstimate.best, 21.5);
  eq(r.inputsExcluded[0].reason, "missing_input:neck"); });
test("no valid visual estimate = INSUFFICIENT_EVIDENCE, no invented number", () => {
  const { error } = reconcile({ visualObservations: null, formulaResults: F_OK });
  eq(error.code, "INSUFFICIENT_EVIDENCE"); });
test("a suspiciously tight range is widened to the config floor", () => {
  const tight = { ...VISUAL, visualEstimate: { low: 21.4, high: 21.6, best: 21.5 } };
  const { reconciliation: r } = reconcile({ visualObservations: tight, formulaResults: [{ ...F_OK[0], estimate: 21.5 }] });
  ok(r.finalEstimate.high - r.finalEstimate.low >= CONFIG.reconciliation.minRangeWidthPct - 0.01,
    "width " + (r.finalEstimate.high - r.finalEstimate.low)); });

console.log("Stage 2 — confidence engine");
test("a full positive factor set scores high", () => {
  const c = scoreConfidence({ positiveFactors: ["four_usable_poses", "recent_waist_measurement",
    "visual_formula_agreement", "historical_trend_support"], negativeFactors: [], insufficientFactors: [] });
  eq(c.level, "high"); ok(c.score >= 0.85); });
test("§32 c13: inconsistent lighting reduces the score", () => {
  const base = scoreConfidence({ positiveFactors: ["four_usable_poses", "visual_formula_agreement"], negativeFactors: [], insufficientFactors: [] });
  const lit = scoreConfidence({ positiveFactors: ["four_usable_poses", "visual_formula_agreement"], negativeFactors: ["lighting_inconsistent"], insufficientFactors: [] });
  ok(lit.score < base.score); });
test("any insufficient factor forces insufficient_data regardless of score", () => {
  const c = scoreConfidence({ positiveFactors: ["four_usable_poses", "recent_waist_measurement",
    "visual_formula_agreement", "historical_trend_support"], negativeFactors: [], insufficientFactors: ["no_reconciled_estimate"] });
  eq(c.level, "insufficient_data"); });
test("unknown factor names never inflate the score", () => {
  const c = scoreConfidence({ positiveFactors: ["totally_made_up"], negativeFactors: [], insufficientFactors: [] });
  near(c.score, CONFIG.confidenceFactors.base, 0.001); });
test("deriveFactors reads the evidence (lighting, recency, agreement)", () => {
  const q = POSES.map((p, i) => reviewPhoto(photo(p, i), { ...GOODCHECKS, adequateLighting: p !== "left_side" }, 0.9));
  const f = deriveFactors({ photoQuality: q, measurements: { waist: meas(34.5, "in", 1) },
    reconciliation: { agreementLevel: "strong", inputsConsidered: ["visual_estimate", "formula_estimate"], finalEstimate: { low: 20, high: 23, best: 21.5 } },
    historicalContext: null });
  ok(f.positiveFactors.includes("four_usable_poses")); ok(f.positiveFactors.includes("recent_waist_measurement"));
  ok(f.negativeFactors.includes("lighting_inconsistent")); ok(f.negativeFactors.includes("no_historical_context")); });

console.log("Stage 2 — photo services");
test("hard person/identity failures reject outright", () => {
  eq(deriveQualityStatus({ ...GOODCHECKS, personDetected: false }, 0.95).status, "rejected");
  eq(deriveQualityStatus({ ...GOODCHECKS, likelySameAthlete: false }, 0.95).status, "rejected"); });
test("a likely-generated capture rejects at quality even past classification", () => {
  eq(deriveQualityStatus({ ...GOODCHECKS, likelyGeneratedOrManipulated: true }, 0.99).status, "rejected"); });
test("score bands: accept / warn / retake / reject", () => {
  eq(deriveQualityStatus(GOODCHECKS, 0.91).status, "accepted");
  eq(deriveQualityStatus(GOODCHECKS, 0.80).status, "accepted_with_warnings");
  eq(deriveQualityStatus(GOODCHECKS, 0.60).status, "retake_recommended");
  eq(deriveQualityStatus(GOODCHECKS, 0.40).status, "rejected"); });
test("soft check failures surface as warnings on an accepted photo", () => {
  const d = deriveQualityStatus({ ...GOODCHECKS, adequateLighting: false }, 0.92);
  eq(d.status, "accepted_with_warnings"); ok(d.warnings.includes("weak_adequateLighting")); });
test("§32 c6: a generated image is refused as an analysis input", () => {
  const e = classifyForAnalysis({ ...photo("front", 99), generatedImage: true });
  eq(e.code, "GENERATED_IMAGE_NOT_ALLOWED"); eq(e.recoverable, false); });
test("pose coverage names the first missing pose", () => {
  const e = poseCoverage([photo("front", 1), photo("back", 2)]);
  eq(e.code, "PHOTO_MISSING"); ok(/left_side/.test(e.message)); });

console.log("Stage 2 — consent service");
const CONS = () => grantConsent({ consentTextVersion: "body_analysis_consent_1.0",
  privacyPolicyVersion: "privacy_2026.08", grantedAt: deps.now(), consentId: deps.id("con") });
test("base purposes ride body-analysis consent", () => {
  eq(consentAllows(CONS(), "visual_body_observation"), null);
  eq(consentAllows(CONS(), "photo_quality_review"), null); });
test("visualization is NOT conferred by base consent", () => {
  eq(consentAllows(CONS(), "goal_visualization").code, "CONSENT_REQUIRED"); });
test("§32 c20: animation stays blocked before an accepted result, even opted in", () => {
  const c = CONS(); c.optionalPurposes.animation = true;
  eq(consentAllows(c, "animation", { resultAccepted: false }).code, "CONSENT_REQUIRED");
  eq(consentAllows(c, "animation", { resultAccepted: true }), null); });
test("revocation closes every purpose", () => {
  const c = revokeConsent(CONS(), deps.now());
  eq(consentAllows(c, "visual_body_observation").code, "CONSENT_REQUIRED"); });

console.log("Stage 2 — audit + retention");
test("the audit trail only speaks the 21 required events", () => {
  const a = makeAudit(); record(a, "assessment_created", deps.now(), {});
  let threw = false; try { record(a, "vibes_logged", deps.now(), {}); } catch (e) { threw = true; }
  ok(threw, "unknown event accepted"); eq(a.length, 1); });
test("§32 c18: temporary copies expire at the configured TTL and delete explicitly", () => {
  const ret = makeRetention(CONFIG);
  registerTempCopy(ret, { assetId: "tmp1", createdAt: new Date(T0).toISOString() });
  eq(expiredTempCopies(ret, new Date(T0 + 23 * 3600000).toISOString()).length, 0);
  eq(expiredTempCopies(ret, new Date(T0 + 25 * 3600000).toISOString()).length, 1);
  eq(deleteTempCopy(ret, "tmp1", deps.now()), null);
  eq(expiredTempCopies(ret, new Date(T0 + 25 * 3600000).toISOString()).length, 0);
  eq(deleteTempCopy(ret, "tmp1", deps.now()).code, "ASSET_DELETION_FAILED"); });
test("provider deletion is never overstated", () => {
  const ret = makeRetention(CONFIG);
  const d = requestProviderDeletion(ret, { providerAssetId: "pa1", at: deps.now() });
  eq(d.state, "requested_unverified");
  confirmProviderDeletion(ret, "pa1", deps.now(), false); eq(d.state, "requested_unverified");
  confirmProviderDeletion(ret, "pa1", deps.now(), true); eq(d.state, "verified_deleted"); });

await (async () => {
console.log("Stage 2 — provider adapters");
await atest("the shipped adapter is interface-only: PROVIDER_UNAVAILABLE", async () => {
  const r = await runProvider(nullAdapter("openai"), { purpose: "visual_body_observation", promptTemplateId: "x" },
    { now: deps.now, executionId: deps.id("exe") });
  eq(r.error.code, "PROVIDER_UNAVAILABLE"); eq(r.execution.status, "failed"); });
await atest("§32 c9: a hung provider times out with a structured error", async () => {
  const hung = { provider: "openai", adapterVersion: "1.0.0", call: () => new Promise(() => {}) };
  const r = await runProvider(hung, { purpose: "visual_body_observation", promptTemplateId: "x" },
    { now: deps.now, executionId: deps.id("exe"), timeoutMs: 40 });
  eq(r.execution.status, "timed_out"); eq(r.error.code, "PROVIDER_UNAVAILABLE"); });
await atest("§32 c10: an off-schema observation response is refused", async () => {
  const bad = fakeVision({ ...VISUAL, abdominalDefinition: "extremely_shredded" });
  const r = await runProvider(bad, { purpose: "visual_body_observation", promptTemplateId: "x" },
    { now: deps.now, executionId: deps.id("exe") });
  eq(r.error.code, "PROVIDER_RESPONSE_INVALID"); eq(r.execution.status, "failed");
  ok(validateVisualObservations(VISUAL) === null); });

console.log("Stage 2 — assessment API pipeline");
function readyAssessment() {
  const { assessment: a } = createAssessment({ athleteId: "ath_athlete1",
    athleteContext: { ageYears: 44, estimationSex: "male" } }, deps);
  addMeasurements(a, { height: meas(70, "in"), weight: meas(182.2, "lb", 1),
    waist: meas(34.5, "in", 1), neck: meas(15, "in", 2) });
  POSES.forEach((p, i) => addPhoto(a, photo(p, i), GOODCHECKS, 0.91));
  giveConsent(a, { consentTextVersion: "body_analysis_consent_1.0", privacyPolicyVersion: "privacy_2026.08" });
  return a;
}
await atest("the full pipeline completes a VALID manifest end to end", async () => {
  const a = readyAssessment();
  eq(await runAnalysis(a, { visionAdapter: fakeVision({ ...VISUAL }) }), null);
  const { doc, errors } = completeAssessment(a);
  eq(errors.length, 0, JSON.stringify(errors[0] || null));
  eq(doc.status, "completed");
  near(doc.result.bodyComposition.estimatedFatMass + doc.result.bodyComposition.estimatedLeanMass, 182.2, 0.11);
  const p18 = doc.goalProjections.find((g) => g.targetBodyFatPercent === 18);
  near(p18.estimatedTargetWeight, doc.result.bodyComposition.estimatedLeanMass / 0.82, 0.11);
  ok(doc.reproducibility.configSnapshotId === CONFIG.configSnapshotId);
  ok(doc.audit.some((e) => e.event === "assessment_completed")); });
await atest("§32 c4: analysis refuses to run without consent", async () => {
  const { assessment: a } = createAssessment({ athleteId: "ath_athlete1",
    athleteContext: { ageYears: 44, estimationSex: "male" } }, deps);
  addMeasurements(a, { height: meas(70, "in"), weight: meas(182, "lb", 1), waist: meas(34.5, "in", 1) });
  POSES.forEach((p, i) => addPhoto(a, photo(p, i), GOODCHECKS, 0.91));
  eq((await runAnalysis(a, { visionAdapter: fakeVision(VISUAL) })).code, "CONSENT_REQUIRED"); });
test("§32 c5: under 18 is refused at creation, unrecoverable", () => {
  const { error } = createAssessment({ athleteId: "ath_kiddo1", athleteContext: { ageYears: 17 } }, deps);
  eq(error.code, "AGE_UNSUPPORTED"); eq(error.recoverable, false); });
await atest("§32 c3: a stale weight blocks analysis by name", async () => {
  const a = readyAssessment();
  a.doc.athleteContext.weight = meas(182.2, "lb", 5);
  const e = await runAnalysis(a, { visionAdapter: fakeVision(VISUAL) });
  eq(e.code, "STALE_MEASUREMENT"); ok(/weight/.test(e.message)); });
await atest("§32 c2: a missing waist blocks analysis by name", async () => {
  const a = readyAssessment();
  delete a.doc.athleteContext.waist;
  eq((await runAnalysis(a, { visionAdapter: fakeVision(VISUAL) })).code, "MISSING_REQUIRED_INPUT"); });
await atest("a rejected pose blocks analysis until replaced (§32 c8)", async () => {
  const a = readyAssessment();
  addPhoto(a, photo("left_side", 91), { ...GOODCHECKS, personDetected: false }, 0.9);
  eq((await runAnalysis(a, { visionAdapter: fakeVision(VISUAL) })).code, "PHOTO_QUALITY_INSUFFICIENT");
  addPhoto(a, photo("left_side", 92), GOODCHECKS, 0.91);
  eq(await runAnalysis(a, { visionAdapter: fakeVision({ ...VISUAL }) }), null); });
await atest("§32 c14/c15: acceptance is recorded; a coach estimate never overwrites", async () => {
  const a = readyAssessment();
  await runAnalysis(a, { visionAdapter: fakeVision({ ...VISUAL }) });
  const { doc } = completeAssessment(a);
  acceptResult(a);
  eq(doc.result.officialStatus, "accepted"); eq(doc.result.acceptedByAthlete, true);
  const before = JSON.stringify(doc.result);
  const reviewed = submitCoachReview(a, { coachEstimate: { low: 18, high: 20, best: 19 }, note: "leaner than the app thinks" });
  eq(JSON.stringify(reviewed.result), before); });
await atest("§32 c16/c17: a revision is a NEW draft; the completed prior is untouched", async () => {
  const a = readyAssessment();
  await runAnalysis(a, { visionAdapter: fakeVision({ ...VISUAL }) });
  completeAssessment(a); acceptResult(a);
  const frozen = JSON.stringify(a.doc);
  const { assessment: b, error } = createRevision(a, deps);
  eq(error, null); eq(b.doc.assessmentRevision, 2); eq(b.doc.status, "awaiting_inputs");
  eq(b.doc.historicalContext.priorAssessmentId, a.doc.assessmentId);
  eq(JSON.stringify(a.doc), frozen, "prior mutated"); });
await atest("provider failure lands the assessment in failed, retryable by design", async () => {
  const a = readyAssessment();
  const e = await runAnalysis(a, {});          /* default = null adapter */
  eq(e.code, "PROVIDER_UNAVAILABLE"); eq(a.doc.status, "failed");
  ok(a.doc.providerExecutions.length === 1); });
})();

console.log("");
console.log(failures.length ? passed + " passed, " + failures.length + " failed" : passed + " passed, 0 failed");
process.exit(failures.length ? 1 : 0);
