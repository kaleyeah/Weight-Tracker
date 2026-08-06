/* Compound Body Analysis — Assessment Manifest core (foundation stage).
   Runtime validation, status transitions, revision immutability, and the
   domain rules the schema alone cannot express.

   ONE SOURCE OF TRUTH: this module loads the canonical JSON Schema and
   validates against a deliberately supported subset of JSON Schema 2020-12
   (type, required, properties, additionalProperties, enum, pattern,
   minimum/maximum/exclusiveMinimum, minLength, items, oneOf-with-null, $ref
   into $defs). There is no second, hand-maintained field list to drift — the
   sync test in tests/ walks the schema and proves the validator enforces
   every enum and required list found there.

   DELIVERABLE DEVIATION (documented per the handoff): this repository is a
   zero-dependency classic-JS/node stack with no TypeScript toolchain, so
   /src/types/assessment-manifest.ts is NOT generated. The handoff's stated
   alternative is implemented instead: schema-driven runtime validation plus
   an automated schema/code synchronization test. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SCHEMA = JSON.parse(fs.readFileSync(path.join(HERE, "../schemas/assessment-manifest.v1.schema.json"), "utf8"));
export const CONFIG = JSON.parse(fs.readFileSync(path.join(HERE, "assessment-engine-config.v1.json"), "utf8"));

/* ---------------- structured errors (§25) ---------------- */
export function err(code, message, fieldPath, recoverable = true) {
  return { code, message, recoverable, affectedFields: fieldPath ? [fieldPath] : [], recommendedAction: null, internalDetails: null };
}

/* ---------------- schema-subset validator ---------------- */
function deref(node) {
  if (node && node.$ref) {
    const p = node.$ref.replace(/^#\//, "").split("/");
    let cur = SCHEMA;
    for (const k of p) cur = cur[k];
    return cur;
  }
  return node;
}

function typeOk(v, t) {
  if (t === "object") return v !== null && typeof v === "object" && !Array.isArray(v);
  if (t === "array") return Array.isArray(v);
  if (t === "string") return typeof v === "string";
  if (t === "number") return typeof v === "number" && Number.isFinite(v);
  if (t === "integer") return typeof v === "number" && Number.isInteger(v);
  if (t === "boolean") return typeof v === "boolean";
  if (t === "null") return v === null;
  return true;
}

export function validateAgainst(node, value, at, out) {
  if(node===undefined){throw new Error('UNDEFINED SCHEMA NODE at '+at);}
  node = deref(node);
  if(node===undefined){throw new Error('DEREF FAILED at '+at);}
  if (node.oneOf) {
    const errsPer = node.oneOf.map((alt) => { const e = []; validateAgainst(alt, value, at, e); return e; });
    if (!errsPer.some((e) => e.length === 0)) out.push(err("SCHEMA_VIOLATION", at + ": matches no allowed alternative", at));
    return;
  }
  if (node.enum) {
    if (!node.enum.includes(value)) out.push(err("SCHEMA_VIOLATION", at + ": '" + String(value) + "' is not one of [" + node.enum.join(", ") + "]", at));
    return;
  }
  if (node.type && !typeOk(value, node.type)) {
    out.push(err("SCHEMA_VIOLATION", at + ": expected " + node.type, at));
    return;
  }
  if (typeof value === "string") {
    if (node.pattern && !(new RegExp(node.pattern)).test(value)) out.push(err("SCHEMA_VIOLATION", at + ": does not match required format", at));
    if (node.minLength != null && value.length < node.minLength) out.push(err("SCHEMA_VIOLATION", at + ": shorter than " + node.minLength, at));
  }
  if (typeof value === "number") {
    if (node.minimum != null && value < node.minimum) out.push(err("SCHEMA_VIOLATION", at + ": below minimum " + node.minimum, at));
    if (node.maximum != null && value > node.maximum) out.push(err("SCHEMA_VIOLATION", at + ": above maximum " + node.maximum, at));
    if (node.exclusiveMinimum != null && value <= node.exclusiveMinimum) out.push(err("SCHEMA_VIOLATION", at + ": must exceed " + node.exclusiveMinimum, at));
  }
  if (Array.isArray(value) && node.items) {
    value.forEach((v, i) => validateAgainst(node.items, v, at + "[" + i + "]", out));
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const props = node.properties || {};
    for (const req of node.required || []) {
      if (!(req in value)) out.push(err("MISSING_REQUIRED_INPUT", at + "." + req + " is required", at + "." + req));
    }
    for (const k of Object.keys(value)) {
      if (props[k]) validateAgainst(props[k], value[k], at + "." + k, out);
      else if (node.additionalProperties === false) out.push(err("SCHEMA_VIOLATION", at + "." + k + " is not a manifest field", at + "." + k));
    }
  }
}

/* ---------------- status machine (§4, STATUS_TRANSITIONS.md) ---------------- */
export const STATUS_TRANSITIONS = {
  draft: ["awaiting_inputs", "awaiting_consent", "cancelled", "deleted"],
  awaiting_inputs: ["awaiting_consent", "validating", "cancelled", "deleted"],
  awaiting_consent: ["validating", "cancelled", "deleted"],
  validating: ["quality_review", "failed", "cancelled", "deleted"],
  quality_review: ["queued", "awaiting_inputs", "failed", "cancelled", "deleted"],
  queued: ["processing", "cancelled", "deleted"],
  processing: ["reconciliation", "failed", "cancelled", "deleted"],
  reconciliation: ["completed", "completed_with_warnings", "failed", "deleted"],
  completed: ["deleted"],
  completed_with_warnings: ["deleted"],
  failed: ["queued", "cancelled", "deleted"],
  cancelled: ["deleted"],
  deleted: []
};
export function canTransition(from, to) {
  return !!(STATUS_TRANSITIONS[from] && STATUS_TRANSITIONS[from].includes(to));
}

export const COMPLETED_STATUSES = ["completed", "completed_with_warnings"];

/* ---------------- domain rules the schema cannot express ---------------- */
function rangeSane(r, at, out) {
  if (!r) return;
  if (r.low > r.high) out.push(err("INVALID_MEASUREMENT", at + ": low exceeds high", at));
  if (r.best < r.low || r.best > r.high) out.push(err("INVALID_MEASUREMENT", at + ": best must lie within [low, high]", at));
}

export function validateManifest(doc) {
  const out = [];
  validateAgainst(SCHEMA, doc, "manifest", out);
  /* specific error codes for fields whose meaning the error contract names:
     the schema's 18+ floor IS the adult-only rule — surface it as such */
  for (const e of out) {
    if ((e.affectedFields || [])[0] === "manifest.athleteContext.ageYears") {
      e.code = "AGE_UNSUPPORTED"; e.recoverable = false;
      e.message = "assessments are adult-only (18+)";
    }
  }
  if (out.length) return { ok: false, errors: out };  /* shape first; domain rules assume shape */

  /* adult-only (§8 scope) */
  if (doc.athleteContext && doc.athleteContext.ageYears < CONFIG.minimumAgeYears)
    out.push(err("AGE_UNSUPPORTED", "assessments are adult-only (18+)", "manifest.athleteContext.ageYears", false));

  /* estimation sex must be usable for estimation phases */
  if (doc.athleteContext && !CONFIG.supportedEstimationSex.includes(doc.athleteContext.estimationSex)
      && ["validating", "quality_review", "queued", "processing", "reconciliation", ...COMPLETED_STATUSES].includes(doc.status))
    out.push(err("MISSING_REQUIRED_INPUT", "estimationSex must be provided before analysis", "manifest.athleteContext.estimationSex"));

  /* ranges: best within [low, high] everywhere a range appears */
  if (doc.visualObservations) rangeSane(doc.visualObservations.visualEstimate, "manifest.visualObservations.visualEstimate", out);
  if (doc.reconciliation) rangeSane(doc.reconciliation.finalEstimate, "manifest.reconciliation.finalEstimate", out);
  if (doc.result) rangeSane(doc.result.bodyFat, "manifest.result.bodyFat", out);
  if (doc.coachReview && doc.coachReview.coachEstimate) rangeSane(doc.coachReview.coachEstimate, "manifest.coachReview.coachEstimate", out);

  /* GENERATED IMAGES ARE NEVER ANALYSIS INPUTS (§7, §21) */
  for (const [i, p] of (doc.photos || []).entries()) {
    const generatedClass = p.assetClass === "generated_goal_visualization" || p.assetClass === "generated_animation_frame";
    if ((p.generatedImage || generatedClass) && p.analysisEligible)
      out.push(err("GENERATED_IMAGE_NOT_ALLOWED", "a generated image can never be an official assessment input", "manifest.photos[" + i + "]", false));
    if (p.generatedImage !== generatedClass && (p.assetClass === "real_progress_photo" && p.generatedImage))
      out.push(err("GENERATED_IMAGE_NOT_ALLOWED", "generatedImage flag conflicts with real_progress_photo class", "manifest.photos[" + i + "]", false));
  }

  /* CONSENT gates provider execution (§9, §10) */
  const consented = !!(doc.consent && doc.consent.granted && !doc.consent.revokedAt);
  for (const [i, ex] of (doc.providerExecutions || []).entries()) {
    if (["running", "success", "partial_success"].includes(ex.status) && !consented)
      out.push(err("CONSENT_REQUIRED", "provider execution without granted consent", "manifest.providerExecutions[" + i + "]", false));
    if (ex.purpose === "goal_visualization" && !(doc.consent && doc.consent.optionalPurposes && doc.consent.optionalPurposes.goal_visualization))
      out.push(err("CONSENT_REQUIRED", "goal visualization needs its own opt-in", "manifest.providerExecutions[" + i + "]", false));
    if (ex.purpose === "animation" && !(doc.consent && doc.consent.optionalPurposes && doc.consent.optionalPurposes.animation))
      out.push(err("CONSENT_REQUIRED", "animation needs its own opt-in", "manifest.providerExecutions[" + i + "]", false));
  }

  /* completion requirements (§27/§28) */
  if (COMPLETED_STATUSES.includes(doc.status)) {
    const need = (cond, code, msg, p) => { if (!cond) out.push(err(code, msg, p, false)); };
    need(!!doc.completedAt, "MISSING_REQUIRED_INPUT", "completedAt required on a completed assessment", "manifest.completedAt");
    need(consented, "CONSENT_REQUIRED", "completion requires granted consent", "manifest.consent");
    need(!!doc.athleteContext, "MISSING_REQUIRED_INPUT", "completion requires athlete context", "manifest.athleteContext");
    const accepted = new Set((doc.photoQuality || [])
      .filter((q) => q.status === "accepted" || q.status === "accepted_with_warnings")
      .map((q) => q.pose));
    for (const pose of CONFIG.requiredPoses)
      need(accepted.has(pose), "PHOTO_MISSING", "completion requires an accepted " + pose + " pose", "manifest.photoQuality");
    need(!!doc.visualObservations, "INSUFFICIENT_EVIDENCE", "completion requires visual observations", "manifest.visualObservations");
    need(!!doc.reconciliation, "RECONCILIATION_FAILED", "completion requires reconciliation", "manifest.reconciliation");
    need(!!doc.result, "MISSING_REQUIRED_INPUT", "completion requires a final result", "manifest.result");
    need(!!doc.explanation, "MISSING_REQUIRED_INPUT", "completion requires an explanation", "manifest.explanation");
    need(!!doc.privacy, "MISSING_REQUIRED_INPUT", "completion requires an explicit privacy state", "manifest.privacy");
    need(!!doc.reproducibility, "MISSING_REQUIRED_INPUT", "completion requires the reproducibility record", "manifest.reproducibility");
    need(!!(doc.audit && doc.audit.length), "MISSING_REQUIRED_INPUT", "completion requires an audit trail", "manifest.audit");
    if (doc.confidence) need(doc.confidence.level !== "insufficient_data", "INSUFFICIENT_EVIDENCE", "completion requires confidence above insufficient-data", "manifest.confidence.level");
    else need(false, "INSUFFICIENT_EVIDENCE", "completion requires a confidence record", "manifest.confidence");
  }

  /* confidence score/level must agree with configured bands (§15) */
  if (doc.confidence && typeof doc.confidence.score === "number" && doc.confidence.level) {
    const band = CONFIG.confidenceThresholds[doc.confidence.level];
    if (band && !(doc.confidence.score >= band.min && doc.confidence.score <= band.max))
      out.push(err("SCHEMA_VIOLATION", "confidence score " + doc.confidence.score + " is outside the configured '" + doc.confidence.level + "' band", "manifest.confidence"));
  }

  return { ok: out.length === 0, errors: out };
}

/* ---------------- revision immutability (§2.4, §4) ----------------
   A completed revision may never change. The ONLY tolerated differences on
   the same (assessmentId, assessmentRevision) after completion are:
   - status → deleted (with audit deletion events appended)
   - audit APPEND-ONLY growth
   - result.officialStatus proposed→accepted/rejected/superseded (+acceptedAt,
     acceptedByAthlete) — athlete disposition of an immutable result
   - coachReview fields (stored separately BY DESIGN, never overwriting)
   Anything else must be a NEW revision. */
export function checkRevisionImmutability(prev, next) {
  const out = [];
  if (!COMPLETED_STATUSES.includes(prev.status)) return { ok: true, errors: [] };
  if (prev.assessmentId !== next.assessmentId || prev.assessmentRevision !== next.assessmentRevision)
    return { ok: true, errors: [] };                     /* a different revision is the correct path */
  const frozen = ["athleteContext", "photos", "photoQuality", "consent", "providerExecutions",
    "visualObservations", "formulaResults", "historicalContext", "reconciliation",
    "confidence", "goalProjections", "explanation", "privacy", "reproducibility",
    "assessmentType", "manifestVersion", "createdAt", "completedAt"];
  for (const k of frozen) {
    if (JSON.stringify(prev[k]) !== JSON.stringify(next[k]))
      out.push(err("SCHEMA_VIOLATION", "completed revision is immutable: '" + k + "' changed — create a new revision", "manifest." + k, false));
  }
  if (next.status !== prev.status && next.status !== "deleted")
    out.push(err("SCHEMA_VIOLATION", "a completed assessment may only transition to deleted", "manifest.status", false));
  const pa = JSON.stringify(prev.audit || []);
  if (!JSON.stringify(next.audit || []).startsWith(pa.slice(0, -1)))
    out.push(err("SCHEMA_VIOLATION", "audit trail is append-only", "manifest.audit", false));
  if (prev.result && next.result) {
    const pr = { ...prev.result, officialStatus: 0, acceptedByAthlete: 0, acceptedAt: 0 };
    const nr = { ...next.result, officialStatus: 0, acceptedByAthlete: 0, acceptedAt: 0 };
    if (JSON.stringify(pr) !== JSON.stringify(nr))
      out.push(err("SCHEMA_VIOLATION", "completed result values are immutable (only athlete disposition may change)", "manifest.result", false));
  }
  return { ok: out.length === 0, errors: out };
}

/* Coach estimates live beside, never instead of (§19) */
export function applyCoachReview(doc, review) {
  const next = JSON.parse(JSON.stringify(doc));
  next.coachReview = { requested: true, ...review };
  /* the Compound estimate is untouched by construction — prove it */
  if (JSON.stringify(next.result) !== JSON.stringify(doc.result))
    throw new Error("coach review must never modify the Compound result");
  return next;
}

/* Goal projection math (§17): Target Weight = Lean Mass ÷ (1 − target%) */
export function projectGoalWeight(leanMass, targetBodyFatPercent) {
  if (!(leanMass > 0) || !(targetBodyFatPercent > 0) || targetBodyFatPercent >= 100) return null;
  return leanMass / (1 - targetBodyFatPercent / 100);
}
