# Stage 2 — services, engines, adapters, API scaffolding

§34 items 6–18, built on the committed foundation (schema v1, validator,
status machine, immutability, config snapshot). **No live provider calls** —
OpenAI/Luma remain an Owner stop-condition decision; the shipped adapters are
interface-only.

## Modules (src/)

| Module | §§ | Owns |
|---|---|---|
| `consent-service.mjs` | 9 | grant/revoke; per-purpose gating; optional purposes are explicit opt-ins; animation additionally blocked until the athlete ACCEPTS a result (§32 c20) |
| `photo-services.mjs` | 7–8 | asset classification (generated/unsupported refused with §25 codes), pose coverage, quality status DERIVED from checks + score — callers cannot hand-pick a status |
| `formula-engine.mjs` | 12 | navy_body_fat 1.0.0, in/cm normalization recorded, eligibility + skippedReason, out-of-bounds clamps with warning; missing inputs are never fabricated |
| `reconciliation-engine.mjs` | 13–14 | weighted_rule_based_v1: agreement bands, ranges EXPAND under disagreement, exclusions recorded, INSUFFICIENT_EVIDENCE instead of invented numbers; history influences confidence only |
| `confidence-engine.mjs` | 15 | config-weighted factor score → §15 thresholds; unknown factors score zero; any insufficient factor forces insufficient_data |
| `audit-retention.mjs` | 23–24 | append-only audit speaking only the 21 required events; temp-copy TTL; provider deletion stays `requested_unverified` unless proven |
| `provider-adapters.mjs` | 10–11 | runProvider(): §10 execution record, timeout arm, §11 response validation; Null adapters return structured PROVIDER_UNAVAILABLE |
| `assessment-api.mjs` | 27–30 | create → inputs → consent → runAnalysis → completeAssessment → accept/coach-review/revision; every transition walks STATUS_TRANSITIONS; completion validates the full manifest |

## Deviations, documented

- **Schema (additive):** `formulaResults[].normalizedInputs/normalizedUnit/skippedReason`
  added — §12 requires them recorded; the v1 schema had `skippedReason` only.
- **Config:** snapshot bumped to `cfg_v1_1` / `1.1.0` with additive keys
  (photoQuality thresholds, reconciliation weights/bands, confidence factor
  weights, navy formula spec, provider timeout, disclaimer version).
  Completed foundation-era fixtures referencing `cfg_v1_initial` stay valid.
- **No TypeScript** (same ruling as the foundation): the schema/code SYNC
  tests are the substitute.
- **Determinism:** clock and id generation are injected (`deps`), and the
  confidence factor clock is settable — tests never read the wall clock.

## Tests

`tests/stage2-services.test.mjs` — 41 cases: navy known-values (both sexes,
cm/in parity), every refusal path by §25 code, reconciliation
agreement/expansion/insufficiency, confidence factor math, quality
derivation bands, consent gating incl. the pre-acceptance animation block,
adapter timeout/invalid-response/unavailable, retention TTL + unverified
deletion, and the full pipeline producing a manifest that passes
`validateManifest` clean, plus acceptance, coach-review non-override, and
revision immutability.
