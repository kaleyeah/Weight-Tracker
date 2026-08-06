# Versioning policy

Semantic versioning (`MAJOR.MINOR.PATCH`) on every versioned surface:

- **Manifest**: `manifestVersion` on every assessment; the schema `$id` pins
  the same version; the sync test fails on drift.
- **Engines**: formula, reconciliation, confidence, photo-quality schema,
  visual-observation schema — each independently versioned and recorded in
  `reproducibility` on completion.
- **Providers**: adapter version + prompt template id + prompt version +
  response schema version recorded per execution.
- **Configuration**: every completed assessment records `configSnapshotId`;
  changing thresholds/weights/recency/targets means a NEW snapshot id, never
  an in-place edit of an existing one.

Rules: MAJOR = compatibility or meaning changes (new manifest file
`assessment-manifest.v2.schema.json`, migration notes required). MINOR =
backward-compatible additions. PATCH = clarifications. A completed assessment
is always interpretable under the manifest version it recorded — old versions
are never rewritten to new shapes.
