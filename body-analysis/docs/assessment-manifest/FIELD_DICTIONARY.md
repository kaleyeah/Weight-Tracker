# Field dictionary (v1.0.0)

The exhaustive machine-readable definition of every field, type, bound, and
controlled vocabulary is the JSON Schema
(`schemas/assessment-manifest.v1.schema.json`) — kept deliberately as the ONE
source of truth. This dictionary records the semantics the schema cannot say:

| Field | Semantics beyond shape |
|---|---|
| `assessmentRevision` | increments when photos/measurements change after analysis starts, a new provider/model is used, or reconciliation reruns. Completed revisions are frozen. |
| `athleteContext.estimationSex` | used ONLY for body-composition formulas; never inferred from photos (§5). `unsupported`/`not_provided` block analysis phases. |
| `measurement.quality` | `stale` is an explicit, legal state (recency guidance: weight 3d, waist 7d, others 14d — configured, not hard-coded). |
| `photos[].assetClass` | real vs generated is a CLASS distinction, not a flag; generated classes can never be `analysisEligible` (validator-enforced). |
| `consent.allowedPurposes` | body-analysis consent covers quality review, estimation, explanation. Visualization, animation, and coach sharing each need their own `optionalPurposes` opt-in (validator-enforced per execution). |
| `providerExecutions[].providerRetentionState` | deletion is never overstated: `deletion_unverified` exists precisely for providers whose deletion cannot be confirmed (§23). |
| `visualObservations.*Definition` | the §11 controlled scale (`none…unknown`); prose never substitutes for these enums. |
| `formulaResults[]` | ineligible formulas record `skippedReason`; inputs are never fabricated; results are never blindly averaged (reconciliation owns combination). |
| `reconciliation.finalEstimate` | Compound's number. Provider observations and coach estimates live in their own sections and never overwrite it. |
| `confidence.score`/`level` | must agree with the configured bands (validator-enforced against the config snapshot). |
| `result.officialStatus` | athlete disposition (`proposed→accepted/rejected/superseded`) is the ONLY mutation a completed result permits. |
| `goalProjections[]` | `TargetWeight = LeanMass ÷ (1 − target%)`, assumption always recorded; historical projections immutable. |
| `audit[]` | append-only, event vocabulary fixed by schema. |
| `reproducibility.configSnapshotId` | every completed assessment pins the exact thresholds/weights/providers that produced it. |
