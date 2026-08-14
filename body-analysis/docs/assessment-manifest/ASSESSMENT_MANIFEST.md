<!-- The approved canonical contract, verbatim from the Owner package
(02-ASSESSMENT-MANIFEST.md), placed at the path the handoff requires. The
machine-readable source of truth is ../../schemas/assessment-manifest.v1.schema.json;
this document is its narrative twin. Implementation deviations are recorded in
the sibling docs and the module header of ../../src/manifest-core.mjs. -->
# Compound Assessment Manifest
## Canonical Contract for Body Analysis Assessments

**Document status:** Approved foundation  
**Initial manifest version:** `1.0.0`  
**Applies to:** Compound Body Analysis Service, Phase 1  
**Primary owner:** Compound  
**Implementation owner:** Claude Code

## 1. Purpose

Define the authoritative structure, inputs, calculations, AI observations, outputs, provenance, privacy state, and version history for every body-composition assessment.

The manifest is the contract between:

- Compound app
- Body Analysis Service
- Photo-quality services
- Formula engine
- AI vision providers
- Reconciliation engine
- Confidence engine
- Visual Coach
- Coach-facing tools
- Visualization and animation providers

No component may invent an incompatible assessment format.

## 2. Principles

1. Compound owns the final estimate.
2. Structured data comes before narrative.
3. Real photos and generated images are distinct asset classes.
4. Completed assessments are immutable.
5. Precision must match evidence.
6. Missing, rejected, stale, or unused data must be explicit.

## 3. Versioning

Use semantic versioning:

```text
MAJOR.MINOR.PATCH
```

Every assessment stores:

```json
{"manifestVersion":"1.0.0"}
```

Major changes alter compatibility or meaning. Minor changes add backward-compatible fields or capability. Patch changes clarify or correct without changing meaning.

## 4. Assessment Identity

```json
{
  "assessmentId": "ast_01J...",
  "athleteId": "ath_01J...",
  "assessmentType": "baseline",
  "assessmentRevision": 1,
  "manifestVersion": "1.0.0",
  "createdAt": "2026-08-05T23:00:00Z",
  "completedAt": null,
  "status": "draft"
}
```

Allowed types:

```text
baseline
progress
goal_visualization_source
coach_requested
manual_reassessment
```

Allowed statuses:

```text
draft
awaiting_inputs
awaiting_consent
validating
quality_review
queued
processing
reconciliation
completed
completed_with_warnings
failed
cancelled
deleted
```

Create a new revision when photos or measurements change after analysis starts, a new provider/model is used, or reconciliation is rerun.

## 5. Athlete Context

```json
{
  "athleteContext": {
    "ageYears": 47,
    "estimationSex": "male",
    "height": {"value": 70, "unit": "in"},
    "weight": {
      "value": 203.2,
      "unit": "lb",
      "measuredAt": "2026-08-05T13:00:00Z",
      "source": "manual"
    },
    "waist": {
      "value": 36.5,
      "unit": "in",
      "measuredAt": "2026-08-05T13:05:00Z",
      "source": "manual",
      "measurementProtocol": "compound_standard_waist_v1"
    }
  }
}
```

Allowed estimation-sex values:

```text
male
female
unsupported
not_provided
```

Never infer this field from photos.

## 6. Measurements

Required Phase 1:

```text
height
weight
waist
age
estimationSex
```

Optional:

```text
neck
hip
chest
upperArm
thigh
smartScaleBodyFat
```

Each measurement includes:

```json
{
  "value": 36.5,
  "unit": "in",
  "measuredAt": "2026-08-05T13:05:00Z",
  "source": "manual",
  "protocol": "compound_standard_waist_v1",
  "quality": "confirmed"
}
```

Allowed sources:

```text
manual
healthkit
coach
smart_scale
device_import
previous_assessment
unknown
```

Quality:

```text
confirmed
unconfirmed
stale
suspect
rejected
```

Initial recency guidance:

- Weight: 3 days
- Waist: 7 days
- Other circumferences: 14 days

## 7. Photo Assets

```json
{
  "photoId": "pho_01J...",
  "pose": "front",
  "assetClass": "real_progress_photo",
  "captureMethod": "compound_camera",
  "capturedAt": "2026-08-05T22:00:00Z",
  "storageLocation": "private_compound_storage",
  "analysisEligible": true,
  "generatedImage": false,
  "metadataStripped": true
}
```

Required poses:

```text
front
left_side
right_side
back
```

Asset classes:

```text
real_progress_photo
temporary_analysis_copy
generated_goal_visualization
generated_animation_frame
coach_reference_image
unsupported_asset
```

Reject generated, heavily altered, obstructed, mismatched, low-quality, multi-person, corrupted, or unsupported-age images.

## 8. Photo Quality

```json
{
  "photoQuality": {
    "photoId": "pho_01J...",
    "pose": "front",
    "status": "accepted",
    "score": 0.91,
    "checks": {
      "personDetected": true,
      "singlePerson": true,
      "fullBodyVisible": true,
      "bodyCentered": true,
      "correctPose": true,
      "adequateLighting": true,
      "adequateSharpness": true,
      "minimalObstruction": true,
      "cameraAngleAcceptable": true,
      "likelySameAthlete": true,
      "likelyGeneratedOrManipulated": false
    },
    "warnings": [],
    "retakeRequired": false
  }
}
```

Statuses:

```text
accepted
accepted_with_warnings
retake_recommended
rejected
unreviewed
```

## 9. Consent

```json
{
  "consent": {
    "consentId": "con_01J...",
    "granted": true,
    "grantedAt": "2026-08-05T22:05:00Z",
    "consentTextVersion": "body_analysis_consent_1.0",
    "privacyPolicyVersion": "privacy_2026.08",
    "allowedPurposes": [
      "photo_quality_review",
      "body_composition_estimation",
      "assessment_explanation"
    ],
    "optionalPurposes": {
      "goal_visualization": false,
      "animation": false,
      "coachSharing": false
    }
  }
}
```

Body-analysis consent does not automatically authorize visualization, animation, coach sharing, social sharing, marketing, or training use.

## 10. Provider Execution

```json
{
  "providerExecution": {
    "executionId": "exe_01J...",
    "purpose": "visual_body_observation",
    "provider": "openai",
    "model": "configured_server_side",
    "providerAdapterVersion": "1.0.0",
    "promptTemplateId": "body_visual_observation_v1",
    "promptVersion": "1.0.0",
    "responseSchemaVersion": "1.0.0",
    "startedAt": "2026-08-05T22:07:00Z",
    "completedAt": "2026-08-05T22:07:15Z",
    "status": "success",
    "providerAssetIds": [],
    "providerRetentionState": "not_persisted",
    "trainingUsePolicy": "excluded_where_supported"
  }
}
```

Purposes:

```text
photo_quality_review
visual_body_observation
assessment_explanation
goal_visualization
animation
```

Statuses:

```text
queued
running
success
partial_success
failed
timed_out
cancelled
```

## 11. Visual Observations

```json
{
  "visualObservations": {
    "abdominalDefinition": "limited",
    "waistDefinition": "moderate",
    "chestDefinition": "moderate",
    "armDefinition": "moderate",
    "shoulderSeparation": "moderate",
    "backDefinition": "limited",
    "lowerBackFatVisibility": "moderate",
    "legDefinition": "moderate",
    "vascularity": "minimal",
    "fatDistributionPattern": [
      "lower_abdomen",
      "flanks",
      "lower_back"
    ],
    "muscularityLevel": "moderately_muscular",
    "looseSkinPossibility": "low",
    "poseConsistency": "good",
    "lightingConsistency": "acceptable",
    "visualEstimate": {
      "low": 20,
      "high": 23,
      "best": 21.5
    },
    "visualConfidence": "moderate",
    "limitations": []
  }
}
```

Controlled observation scale:

```text
none
minimal
limited
moderate
clear
high
unknown
```

## 12. Formula Engine

```json
{
  "formulaResults": [
    {
      "formulaId": "navy_body_fat",
      "formulaVersion": "1.0.0",
      "eligible": true,
      "inputsUsed": ["height","waist","neck","estimationSex"],
      "estimate": 20.8,
      "confidence": "moderate",
      "warnings": []
    }
  ]
}
```

Record normalized inputs, conversions, eligibility, skipped reasons, and formula versions. Never fabricate missing inputs or blindly average formulas.

## 13. Historical Context

```json
{
  "historicalContext": {
    "priorAssessmentId": "ast_previous",
    "priorAssessmentDate": "2026-07-20T12:00:00Z",
    "priorBodyFatBest": 23.0,
    "weightChange": -5.4,
    "weightChangeUnit": "lb",
    "waistChange": -1.0,
    "waistChangeUnit": "in",
    "daysBetweenAssessments": 16,
    "photoComparability": "good",
    "trendDirection": "decreasing",
    "historicalSupport": "supports_current_estimate"
  }
}
```

History should mainly influence confidence.

## 14. Reconciliation

```json
{
  "reconciliation": {
    "engineVersion": "1.0.0",
    "inputsConsidered": [
      "visual_estimate",
      "formula_estimate",
      "historical_context"
    ],
    "inputsExcluded": [],
    "method": "weighted_rule_based_v1",
    "agreementLevel": "moderate",
    "conflicts": [],
    "finalEstimate": {
      "low": 20.5,
      "high": 23.0,
      "best": 21.8
    }
  }
}
```

Agreement levels:

```text
strong
moderate
weak
conflicting
insufficient
```

The engine must evaluate validity, compare evidence, expand ranges under disagreement, reduce confidence, reject insufficient evidence, and record exclusions.

## 15. Confidence

```json
{
  "confidence": {
    "engineVersion": "1.0.0",
    "score": 0.78,
    "level": "moderate",
    "positiveFactors": [
      "four_usable_poses",
      "recent_waist_measurement",
      "visual_formula_agreement",
      "historical_trend_support"
    ],
    "negativeFactors": [
      "side_lighting_inconsistent"
    ],
    "insufficientFactors": []
  }
}
```

Levels:

```text
high
moderate
low
insufficient_data
```

Initial configurable thresholds:

```text
High: 0.85–1.00
Moderate: 0.65–0.849
Low: 0.40–0.649
Insufficient: below 0.40
```

## 16. Final Result

```json
{
  "result": {
    "bodyFat": {
      "low": 20.5,
      "high": 23.0,
      "best": 21.8,
      "displayRange": "20.5–23%",
      "displayBest": "About 22%"
    },
    "bodyComposition": {
      "weight": 203.2,
      "weightUnit": "lb",
      "estimatedFatMass": 39.7,
      "estimatedLeanMass": 142.5,
      "estimatedFatFreeMass": 142.5
    },
    "confidence": {
      "level": "moderate",
      "display": "Moderate confidence"
    },
    "officialStatus": "proposed",
    "acceptedByAthlete": false,
    "acceptedAt": null
  }
}
```

Official statuses:

```text
proposed
accepted
rejected
superseded
coach_review_requested
```

## 17. Goal Projections

```json
{
  "goalProjections": [
    {
      "targetBodyFatPercent": 18,
      "estimatedTargetWeight": 173.8,
      "estimatedFatLossRequired": 8.4,
      "assumption": "lean_mass_maintained",
      "eligible": true,
      "warning": null
    }
  ]
}
```

Formula:

```text
Target Weight = Estimated Lean Mass ÷ (1 - target body-fat fraction)
```

Historical projections remain immutable.

## 18. Explanation

```json
{
  "explanation": {
    "summary": "Your estimate is approximately 20.5–23% body fat, with a best estimate near 22%.",
    "primaryReasons": [
      "Your current waist measurement aligns with the visual estimate.",
      "All four poses show a consistent fat-distribution pattern.",
      "Your recent weight and waist trend support a reduction from the previous assessment."
    ],
    "uncertaintyReasons": [
      "Lighting differs between the two side photographs."
    ],
    "nextSteps": [
      "Use similar lighting for the next assessment.",
      "Repeat the assessment in approximately four weeks."
    ],
    "medicalDisclaimerVersion": "fitness_estimate_disclaimer_1.0"
  }
}
```

Narrative may not introduce unsupported claims.

## 19. Coach Review

Store coach values separately from provider and Compound values.

```json
{
  "coachReview": {
    "requested": false,
    "reviewedBy": null,
    "reviewedAt": null,
    "coachEstimate": null,
    "coachNotes": null,
    "overrideReason": null
  }
}
```

## 20. Visual Coach Context

```json
{
  "visualCoachContext": {
    "assessmentId": "ast_01J...",
    "acceptedEstimate": {
      "low": 20.5,
      "high": 23,
      "best": 21.8
    },
    "confidenceLevel": "moderate",
    "leanMass": 142.5,
    "goalProjections": [
      {
        "targetBodyFatPercent": 15,
        "estimatedTargetWeight": 167.6
      }
    ],
    "explanationFactors": [
      "waist_alignment",
      "four_pose_consistency",
      "historical_support"
    ],
    "allowedActions": [
      "explain_assessment",
      "compare_assessments",
      "calculate_goal_weight",
      "request_goal_visualization"
    ]
  }
}
```

Raw photos are not automatically passed to chat.

## 21. Goal Visualization

```json
{
  "goalVisualization": {
    "visualizationId": "viz_01J...",
    "sourceAssessmentId": "ast_01J...",
    "targetBodyFatPercent": 15,
    "provider": "openai",
    "providerModel": "configured_server_side",
    "generationPromptVersion": "goal_visualization_v1",
    "status": "generated",
    "assetClass": "generated_goal_visualization",
    "approvedByAthlete": false,
    "labelRequired": true,
    "labelText": "AI-generated illustrative projection"
  }
}
```

Generated images can never become official assessment inputs.

## 22. Luma Animation

```json
{
  "animation": {
    "animationId": "ani_01J...",
    "sourceVisualizationIds": [
      "viz_current",
      "viz_target"
    ],
    "provider": "luma",
    "providerAdapterVersion": "1.0.0",
    "purpose": "progress_transformation",
    "status": "queued",
    "athleteConsentGranted": true,
    "assetClass": "generated_animation",
    "labelRequired": true
  }
}
```

Luma is downstream media generation, not the estimator.

## 23. Privacy and Retention

```json
{
  "privacy": {
    "originalPhotoRetention": "athlete_managed",
    "temporaryCopiesRetentionHours": 24,
    "providerAssetRetention": "not_persisted_or_shortest_available",
    "metadataStripped": true,
    "encryptedInTransit": true,
    "encryptedAtRest": true,
    "coachAccessGranted": false,
    "socialSharingGranted": false,
    "marketingUseGranted": false
  }
}
```

Deletion must be explicitly tracked and never overstated when provider deletion cannot be verified.

## 24. Audit Events

Required events:

```text
assessment_created
input_added
input_changed
photo_rejected
photo_replaced
consent_granted
consent_revoked
analysis_started
provider_called
provider_completed
provider_failed
reconciliation_completed
assessment_completed
assessment_accepted
assessment_rejected
coach_review_requested
coach_review_completed
visualization_generated
animation_generated
deletion_requested
deletion_completed
```

## 25. Error Contract

```json
{
  "error": {
    "code": "PHOTO_QUALITY_INSUFFICIENT",
    "message": "The left-side photo must be retaken.",
    "recoverable": true,
    "affectedFields": ["photos.left_side"],
    "recommendedAction": "retake_left_side_photo",
    "internalDetails": null
  }
}
```

Initial codes:

```text
CONSENT_REQUIRED
AGE_UNSUPPORTED
MISSING_REQUIRED_INPUT
INVALID_MEASUREMENT
STALE_MEASUREMENT
PHOTO_MISSING
PHOTO_QUALITY_INSUFFICIENT
PHOTO_POSE_MISMATCH
PHOTO_IDENTITY_MISMATCH
GENERATED_IMAGE_NOT_ALLOWED
PROVIDER_UNAVAILABLE
PROVIDER_RESPONSE_INVALID
RECONCILIATION_FAILED
INSUFFICIENT_EVIDENCE
UNAUTHORIZED_ACCESS
ASSET_DELETION_FAILED
```

## 26. Reproducibility

Every completed assessment records:

- Manifest version
- Formula engine version
- Reconciliation engine version
- Confidence engine version
- Photo-quality schema version
- Visual-observation schema version
- Provider adapter versions
- Configuration snapshot ID

The configuration snapshot identifies thresholds, recency rules, weights, formulas, providers, targets, and retention settings.

## 27. Minimum Valid Assessment

Completion requires:

- Athlete at least 18
- Consent granted
- Height, weight, waist, age, estimation sex
- Four accepted poses
- Successful visual estimate
- Successful reconciliation
- Confidence above insufficient-data

## 28. Completion Requirements

A completed assessment includes:

- Identity
- Manifest version
- Input snapshot
- Consent
- Photo quality
- Provider metadata
- Visual observations
- Formula results
- Reconciliation
- Confidence
- Final body composition
- Goal projections
- Explanation
- Privacy state
- Reproducibility record
- Audit trail

## 29. Storage Boundaries

Separate:

- Assessment metadata
- Original private photos
- Temporary analysis copies
- Provider records
- Generated visualizations
- Audit records

Do not store image binaries in assessment JSON.

## 30. Service Boundaries

```text
Assessment API
    ├── Assessment Manifest Validator
    ├── Consent Service
    ├── Measurement Service
    ├── Photo Asset Service
    ├── Photo Quality Service
    ├── Formula Engine
    ├── Vision Provider Adapter
    ├── Reconciliation Engine
    ├── Confidence Engine
    ├── Explanation Generator
    ├── Goal Projection Service
    ├── Visualization Provider Adapter
    ├── Retention and Deletion Service
    └── Audit Service
```

## 31. Validation

Create:

- Canonical JSON Schema
- Generated/synchronized TypeScript types
- Runtime validation
- Status-transition validation
- Generated-image input prohibition
- Revision immutability

Compile-time types alone are insufficient.

## 32. Required Tests

1. Valid four-photo assessment
2. Missing waist
3. Stale weight
4. Missing consent
5. Under 18
6. Generated image submitted
7. Wrong pose
8. Photo-quality rejection
9. Provider timeout
10. Invalid provider response
11. Formula unavailable
12. Visual/formula disagreement
13. Confidence reduced by lighting
14. Athlete acceptance
15. Coach estimate does not overwrite
16. Revision creation
17. Historical immutability
18. Temporary deletion
19. Visualization labeling
20. Luma blocked before approval

## 33. First Deliverables

```text
/docs/assessment-manifest/ASSESSMENT_MANIFEST.md
/schemas/assessment-manifest.v1.schema.json
/src/types/assessment-manifest.ts
/src/validation/assessment-manifest-validator.ts
/src/config/assessment-engine-config.v1.json
/tests/assessment-manifest/
```

Also create:

```text
/docs/assessment-manifest/FIELD_DICTIONARY.md
/docs/assessment-manifest/STATUS_TRANSITIONS.md
/docs/assessment-manifest/PRIVACY_AND_RETENTION.md
/docs/assessment-manifest/VERSIONING_POLICY.md
```

## 34. Implementation Order

1. JSON Schema
2. Generated TypeScript types
3. Runtime validator
4. Status transitions
5. Configuration snapshot
6. Audit model
7. Consent model
8. Photo classifications
9. Photo-quality schema
10. Formula schema
11. Visual-observation schema
12. Reconciliation schema
13. Confidence schema
14. Final result schema
15. Privacy/deletion schema
16. Fixtures
17. Validation tests
18. API scaffolding

Do not integrate providers until manifest validation and core tests pass.

## 35. Definition of Done

- One canonical machine-readable schema
- Synchronized types
- Runtime validation
- Version stored on every assessment
- Completed assessments immutable
- Generated images rejected as source photos
- Status transitions enforced
- Consent required
- Provider details auditable
- Formula, vision, reconciliation, confidence separated
- Coach estimates cannot overwrite Compound estimates
- Retention explicit
- Historical results remain interpretable
- Tests pass
- Providers can be added without changing the contract

## 36. Architectural Ruling

The Assessment Manifest is the first implementation artifact.

Do not begin with prompts, provider APIs, formulas, UI, goal-image generation, or Luma integration.

First establish the canonical contract, validation, versioning, state transitions, auditability, and tests.
