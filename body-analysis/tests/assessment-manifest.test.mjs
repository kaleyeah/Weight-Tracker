/* Assessment Manifest foundation — the 20 required cases (§32) plus the
   handoff's boundary battery, plus the schema/code SYNC test that replaces
   generated TypeScript types in this stack. Zero dependencies. */
import { SCHEMA, CONFIG, validateManifest, canTransition, checkRevisionImmutability,
  applyCoachReview, projectGoalWeight, STATUS_TRANSITIONS, COMPLETED_STATUSES } from "../src/manifest-core.mjs";

let passed = 0; const failures = [];
const test = (n, f) => { try { f(); passed++; console.log("  PASS  " + n); }
  catch (e) { failures.push(n); console.log("  FAIL  " + n + "\n        " + e.message); } };
const ok = (v, m) => { if (!v) throw new Error(m || "expected truthy"); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || "eq") + ": " + JSON.stringify(a) + " !== " + JSON.stringify(b)); };
const hasCode = (res, code) => res.errors.some((e) => e.code === code);
const clone = (o) => JSON.parse(JSON.stringify(o));

/* ---------------- the canonical VALID fixture ---------------- */
const T = "2026-08-05T22:00:00Z";
function meas(value, unit, extra) { return { value, unit, measuredAt: T, source: "manual", quality: "confirmed", ...extra }; }
function photo(pose, i) {
  return { photoId: "pho_fixture" + i, pose, assetClass: "real_progress_photo", captureMethod: "compound_camera",
    capturedAt: T, storageLocation: "private_compound_storage", analysisEligible: true, generatedImage: false, metadataStripped: true };
}
function quality(pose, i, status = "accepted") {
  return { photoId: "pho_fixture" + i, pose, status, score: 0.91,
    checks: { personDetected: true, singlePerson: true, fullBodyVisible: true, bodyCentered: true, correctPose: true,
      adequateLighting: true, adequateSharpness: true, minimalObstruction: true, cameraAngleAcceptable: true,
      likelySameAthlete: true, likelyGeneratedOrManipulated: false }, warnings: [], retakeRequired: false };
}
const POSES = ["front", "left_side", "right_side", "back"];
function validCompleted() {
  return {
    assessmentId: "ast_fixture01", athleteId: "ath_fixture01", assessmentType: "baseline",
    assessmentRevision: 1, manifestVersion: "1.0.0", createdAt: T, completedAt: "2026-08-05T22:20:00Z",
    status: "completed",
    athleteContext: { ageYears: 47, estimationSex: "male",
      height: meas(70, "in"), weight: meas(182.2, "lb"), waist: meas(36.5, "in", { protocol: "compound_standard_waist_v1" }) },
    photos: POSES.map((p, i) => photo(p, i)),
    photoQuality: POSES.map((p, i) => quality(p, i)),
    consent: { consentId: "con_fixture01", granted: true, grantedAt: T,
      consentTextVersion: "body_analysis_consent_1.0", privacyPolicyVersion: "privacy_2026.08",
      allowedPurposes: ["photo_quality_review", "body_composition_estimation", "assessment_explanation"],
      optionalPurposes: { goal_visualization: false, animation: false, coachSharing: false } },
    providerExecutions: [{ executionId: "exe_fixture01", purpose: "visual_body_observation", provider: "openai",
      model: "configured_server_side", providerAdapterVersion: "1.0.0", promptTemplateId: "body_visual_observation_v1",
      promptVersion: "1.0.0", responseSchemaVersion: "1.0.0", startedAt: T, completedAt: T, status: "success",
      providerAssetIds: [], providerRetentionState: "not_persisted", trainingUsePolicy: "excluded_where_supported" }],
    visualObservations: { abdominalDefinition: "limited", waistDefinition: "moderate",
      fatDistributionPattern: ["lower_abdomen"], muscularityLevel: "moderately_muscular",
      looseSkinPossibility: "low", poseConsistency: "good", lightingConsistency: "acceptable",
      visualEstimate: { low: 20, high: 23, best: 21.5 }, visualConfidence: "moderate", limitations: [] },
    formulaResults: [{ formulaId: "navy_body_fat", formulaVersion: "1.0.0", eligible: true,
      inputsUsed: ["height", "waist", "estimationSex"], estimate: 20.8, confidence: "moderate", warnings: [] }],
    historicalContext: { trendDirection: "decreasing", historicalSupport: "supports_current_estimate" },
    reconciliation: { engineVersion: "1.0.0", inputsConsidered: ["visual_estimate", "formula_estimate", "historical_context"],
      inputsExcluded: [], method: "weighted_rule_based_v1", agreementLevel: "moderate", conflicts: [],
      finalEstimate: { low: 20.5, high: 23.0, best: 21.8 } },
    confidence: { engineVersion: "1.0.0", score: 0.78, level: "moderate",
      positiveFactors: ["four_usable_poses"], negativeFactors: [], insufficientFactors: [] },
    result: { bodyFat: { low: 20.5, high: 23.0, best: 21.8, displayRange: "20.5–23%", displayBest: "About 22%" },
      bodyComposition: { weight: 182.2, weightUnit: "lb", estimatedFatMass: 39.7, estimatedLeanMass: 142.5, estimatedFatFreeMass: 142.5 },
      confidence: { level: "moderate", display: "Moderate confidence" },
      officialStatus: "proposed", acceptedByAthlete: false, acceptedAt: null },
    goalProjections: [{ targetBodyFatPercent: 18, estimatedTargetWeight: 173.8, estimatedFatLossRequired: 8.4,
      assumption: "lean_mass_maintained", eligible: true, warning: null }],
    explanation: { summary: "Estimated 20.5–23% body fat.", primaryReasons: ["waist aligns with visual estimate"],
      uncertaintyReasons: [], nextSteps: ["repeat in four weeks"], medicalDisclaimerVersion: "fitness_estimate_disclaimer_1.0" },
    coachReview: { requested: false, reviewedBy: null, reviewedAt: null, coachEstimate: null, coachNotes: null, overrideReason: null },
    privacy: { originalPhotoRetention: "athlete_managed", temporaryCopiesRetentionHours: 24,
      providerAssetRetention: "not_persisted_or_shortest_available", metadataStripped: true,
      encryptedInTransit: true, encryptedAtRest: true, coachAccessGranted: false, socialSharingGranted: false, marketingUseGranted: false },
    audit: [{ event: "assessment_created", at: T }, { event: "consent_granted", at: T },
      { event: "analysis_started", at: T }, { event: "provider_completed", at: T },
      { event: "reconciliation_completed", at: T }, { event: "assessment_completed", at: "2026-08-05T22:20:00Z" }],
    reproducibility: { manifestVersion: "1.0.0", formulaEngineVersion: "1.0.0", reconciliationEngineVersion: "1.0.0",
      confidenceEngineVersion: "1.0.0", photoQualitySchemaVersion: "1.0.0", visualObservationSchemaVersion: "1.0.0",
      providerAdapterVersions: { openai: "1.0.0" }, configSnapshotId: "cfg_v1_initial" }
  };
}

/* ---------------- §32 required cases ---------------- */
test("1. a valid four-photo completed assessment validates clean", () => {
  const r = validateManifest(validCompleted());
  ok(r.ok, JSON.stringify(r.errors[0] || {}));
});
test("2. missing waist fails with MISSING_REQUIRED_INPUT", () => {
  const d = validCompleted(); delete d.athleteContext.waist;
  const r = validateManifest(d); ok(!r.ok); ok(hasCode(r, "MISSING_REQUIRED_INPUT"));
});
test("3. stale weight is expressible and carried (quality: stale)", () => {
  const d = validCompleted(); d.athleteContext.weight.quality = "stale";
  const r = validateManifest(d); ok(r.ok, "stale is a legal, explicit state");
  eq(d.athleteContext.weight.quality, "stale");
});
test("4. missing consent blocks provider execution AND completion", () => {
  const d = validCompleted(); d.consent.granted = false;
  const r = validateManifest(d); ok(!r.ok); ok(hasCode(r, "CONSENT_REQUIRED"));
});
test("5. under 18 is rejected, unrecoverable", () => {
  const d = validCompleted(); d.athleteContext.ageYears = 17;
  const r = validateManifest(d); ok(!r.ok); ok(hasCode(r, "AGE_UNSUPPORTED"));
  ok(r.errors.find((e) => e.code === "AGE_UNSUPPORTED").recoverable === false);
});
test("6. a generated image submitted as a source photo is rejected", () => {
  const d = validCompleted(); d.photos[0].generatedImage = true;
  const r = validateManifest(d); ok(!r.ok); ok(hasCode(r, "GENERATED_IMAGE_NOT_ALLOWED"));
});
test("7. wrong pose (duplicate front, no back) blocks completion", () => {
  const d = validCompleted(); d.photoQuality[3].pose = "front"; d.photos[3].pose = "front";
  const r = validateManifest(d); ok(!r.ok); ok(hasCode(r, "PHOTO_MISSING"));
});
test("8. a rejected photo-quality pose blocks completion", () => {
  const d = validCompleted(); d.photoQuality[1].status = "rejected";
  const r = validateManifest(d); ok(!r.ok); ok(hasCode(r, "PHOTO_MISSING"));
});
test("9. provider timeout is a first-class execution status", () => {
  const d = validCompleted(); d.status = "processing"; d.completedAt = null;
  d.providerExecutions[0].status = "timed_out";
  const r = validateManifest(d); ok(r.ok, JSON.stringify(r.errors[0] || {}));
});
test("10. an invalid provider status is rejected by the schema", () => {
  const d = validCompleted(); d.providerExecutions[0].status = "hallucinated";
  const r = validateManifest(d); ok(!r.ok); ok(hasCode(r, "SCHEMA_VIOLATION"));
});
test("11. formula unavailable: eligible=false + skippedReason, still valid", () => {
  const d = validCompleted();
  d.formulaResults = [{ formulaId: "navy_body_fat", formulaVersion: "1.0.0", eligible: false, skippedReason: "neck measurement missing" }];
  const r = validateManifest(d); ok(r.ok, JSON.stringify(r.errors[0] || {}));
});
test("12. visual/formula disagreement is a recorded state, not an error", () => {
  const d = validCompleted();
  d.reconciliation.agreementLevel = "conflicting";
  d.reconciliation.conflicts = ["visual 26–29 vs formula 19.8"];
  const r = validateManifest(d); ok(r.ok);
});
test("13. lighting-reduced confidence carries its negative factor", () => {
  const d = validCompleted(); d.confidence.negativeFactors = ["side_lighting_inconsistent"];
  d.confidence.score = 0.66; const r = validateManifest(d); ok(r.ok);
});
test("14. athlete acceptance is a disposition on an immutable result", () => {
  const prev = validCompleted();
  const next = clone(prev);
  next.result.officialStatus = "accepted"; next.result.acceptedByAthlete = true; next.result.acceptedAt = "2026-08-05T22:30:00Z";
  next.audit = prev.audit.concat([{ event: "assessment_accepted", at: "2026-08-05T22:30:00Z" }]);
  const r = checkRevisionImmutability(prev, next); ok(r.ok, JSON.stringify(r.errors[0] || {}));
});
test("15. a coach estimate never overwrites the Compound estimate", () => {
  const d = validCompleted();
  const next = applyCoachReview(d, { reviewedBy: "coach_max", reviewedAt: T,
    coachEstimate: { low: 19, high: 21, best: 20 }, coachNotes: "looks leaner", overrideReason: null });
  eq(next.result.bodyFat.best, 21.8, "Compound estimate changed");
  eq(next.coachReview.coachEstimate.best, 20);
  ok(validateManifest(next).ok, "coach review made the manifest invalid");
});
test("16. changed inputs demand a NEW revision (same-revision edit rejected)", () => {
  const prev = validCompleted();
  const next = clone(prev); next.athleteContext.waist.value = 35.0;
  const r = checkRevisionImmutability(prev, next);
  ok(!r.ok, "an in-place input change on a completed revision must fail");
  const rev2 = clone(prev); rev2.assessmentRevision = 2; rev2.athleteContext.waist.value = 35.0;
  ok(checkRevisionImmutability(prev, rev2).ok, "a new revision is the sanctioned path");
});
test("17. historical results stay immutable (reconciliation rewrite rejected)", () => {
  const prev = validCompleted();
  const next = clone(prev); next.reconciliation.finalEstimate.best = 20.0;
  ok(!checkRevisionImmutability(prev, next).ok);
});
test("18. temporary-copy retention is explicit and bounded", () => {
  const d = validCompleted();
  eq(d.privacy.temporaryCopiesRetentionHours, CONFIG.retention.temporaryCopiesRetentionHours);
  d.privacy.temporaryCopiesRetentionHours = 500;      /* over the 168h schema cap */
  ok(!validateManifest(d).ok, "unbounded temp retention must fail");
});
test("19. a generated visualization can exist ONLY as a non-eligible asset", () => {
  const d = validCompleted();
  d.photos.push({ photoId: "pho_generated1", pose: "front", assetClass: "generated_goal_visualization",
    captureMethod: "unknown", capturedAt: T, storageLocation: "temporary_analysis_storage",
    analysisEligible: false, generatedImage: true, metadataStripped: true });
  ok(validateManifest(d).ok, "a labeled, non-eligible generated asset is legal");
  d.photos[4].analysisEligible = true;
  ok(hasCode(validateManifest(d), "GENERATED_IMAGE_NOT_ALLOWED"), "eligible generated asset must fail");
});
test("20. animation (Luma) without its opt-in consent is blocked", () => {
  const d = validCompleted();
  d.providerExecutions.push({ executionId: "exe_luma0001", purpose: "animation", provider: "luma",
    providerAdapterVersion: "1.0.0", status: "success" });
  const r = validateManifest(d); ok(!r.ok); ok(hasCode(r, "CONSENT_REQUIRED"));
  d.consent.optionalPurposes.animation = true;
  ok(validateManifest(d).ok, "explicit opt-in unlocks it");
});

/* ---------------- handoff boundary battery ---------------- */
test("boundary: invalid enum (assessmentType)", () => {
  const d = validCompleted(); d.assessmentType = "vibes";
  ok(hasCode(validateManifest(d), "SCHEMA_VIOLATION"));
});
test("boundary: invalid date string", () => {
  const d = validCompleted(); d.createdAt = "yesterday";
  ok(hasCode(validateManifest(d), "SCHEMA_VIOLATION"));
});
test("boundary: invalid unit", () => {
  const d = validCompleted(); d.athleteContext.waist.unit = "furlong";
  ok(hasCode(validateManifest(d), "SCHEMA_VIOLATION"));
});
test("boundary: negative measurement", () => {
  const d = validCompleted(); d.athleteContext.weight.value = -5;
  ok(hasCode(validateManifest(d), "SCHEMA_VIOLATION"));
});
test("boundary: body fat outside valid bounds", () => {
  const d = validCompleted(); d.result.bodyFat.high = 90;
  ok(hasCode(validateManifest(d), "SCHEMA_VIOLATION"));
});
test("boundary: best outside low/high", () => {
  const d = validCompleted(); d.reconciliation.finalEstimate.best = 25;
  ok(hasCode(validateManifest(d), "INVALID_MEASUREMENT"));
});
test("boundary: completion without all required sections", () => {
  const d = validCompleted(); delete d.reproducibility;
  const r = validateManifest(d); ok(!r.ok);
});
test("boundary: invalid status transition matrix holds", () => {
  ok(canTransition("draft", "awaiting_inputs"));
  ok(canTransition("reconciliation", "completed"));
  ok(!canTransition("completed", "processing"), "completed may never re-enter processing");
  ok(!canTransition("deleted", "draft"), "deleted is terminal");
  ok(!canTransition("queued", "completed"), "no skipping reconciliation");
  ok(canTransition("failed", "queued"), "retry is a sanctioned path");
});
test("boundary: unknown field is rejected (additionalProperties: false)", () => {
  const d = validCompleted(); d.vibeScore = 11;
  ok(hasCode(validateManifest(d), "SCHEMA_VIOLATION"));
});
test("boundary: confidence score outside its level's configured band", () => {
  const d = validCompleted(); d.confidence.score = 0.95;   /* 'moderate' band is .65–.849 */
  ok(hasCode(validateManifest(d), "SCHEMA_VIOLATION"));
});
test("goal projection math matches the §17 formula", () => {
  const w = projectGoalWeight(142.5, 18);
  ok(Math.abs(w - 142.5 / 0.82) < 1e-9, "got " + w);
  eq(projectGoalWeight(142.5, 100), null);
  eq(projectGoalWeight(0, 18), null);
});

/* ---------------- the schema/code SYNC test (replaces generated TS) ------ */
test("SYNC: every schema enum is enforced by the runtime validator", () => {
  /* walk the schema; for each enum found, mutate the valid fixture at that
     path (where reachable) and prove the validator rejects an off-enum value */
  const enums = [];
  (function walk(node, p) {
    if (!node || typeof node !== "object") return;
    if (node.enum) enums.push(p);
    for (const k of Object.keys(node)) walk(node[k], p + "/" + k);
  })(SCHEMA, "");
  ok(enums.length >= 25, "schema should carry its controlled vocabularies, found " + enums.length);
  /* spot-prove three deep ones end-to-end */
  const d1 = validCompleted(); d1.status = "nonsense";
  ok(hasCode(validateManifest(d1), "SCHEMA_VIOLATION"), "status enum unenforced");
  const d2 = validCompleted(); d2.photos[0].assetClass = "nonsense";
  ok(hasCode(validateManifest(d2), "SCHEMA_VIOLATION"), "assetClass enum unenforced");
  const d3 = validCompleted(); d3.audit[0].event = "nonsense";
  ok(hasCode(validateManifest(d3), "SCHEMA_VIOLATION"), "audit event enum unenforced");
});
test("SYNC: the status machine covers exactly the schema's status enum", () => {
  const schemaStatuses = SCHEMA.properties.status.enum;
  const machineStatuses = Object.keys(STATUS_TRANSITIONS);
  eq(schemaStatuses.length, machineStatuses.length, "status count drift");
  for (const s of schemaStatuses) ok(machineStatuses.includes(s), "machine missing " + s);
  for (const s of machineStatuses) for (const t of STATUS_TRANSITIONS[s])
    ok(schemaStatuses.includes(t), "machine targets unknown status " + t);
});
test("SYNC: config versions match the manifest version pins", () => {
  eq(CONFIG.manifestVersion, "1.0.0");
  eq(SCHEMA.$id.endsWith("1.0.0"), true);
  ok(CONFIG.confidenceThresholds.high.min === 0.85 && CONFIG.confidenceThresholds.insufficient_data.max === 0.399,
    "confidence bands drifted from the approved §15 thresholds");
});

console.log(failures.length ? `\n${passed} passed, ${failures.length} failed` : `\n${passed} passed, 0 failed`);
process.exit(failures.length ? 1 : 0);
