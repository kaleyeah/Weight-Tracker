/* Consent Service (§9) — consent is granted per PURPOSE and never implied.
   Base purposes ride allowedPurposes; visualization/animation/coach sharing
   are explicit opt-ins that body-analysis consent does NOT confer. Animation
   is additionally blocked until the athlete has ACCEPTED a result (§32 c20:
   Luma is blocked before approval). */
import { err } from "./manifest-core.mjs";

export const BASE_PURPOSES = ["photo_quality_review", "body_composition_estimation", "assessment_explanation"];
export const OPTIONAL_PURPOSES = ["goal_visualization", "animation", "coachSharing"];

/* provider-execution purpose (§10) -> the consent purpose that authorizes it */
const EXECUTION_PURPOSE_MAP = {
  photo_quality_review: "photo_quality_review",
  visual_body_observation: "body_composition_estimation",
  assessment_explanation: "assessment_explanation",
  goal_visualization: "goal_visualization",
  animation: "animation",
};

export function grantConsent({ consentId, consentTextVersion, privacyPolicyVersion, optionalPurposes, grantedAt }) {
  return { consentId, granted: true, grantedAt,
    consentTextVersion, privacyPolicyVersion,
    allowedPurposes: BASE_PURPOSES.slice(),
    optionalPurposes: { goal_visualization: false, animation: false, coachSharing: false, ...(optionalPurposes || {}) } };
}

export function revokeConsent(consent, revokedAt) {
  return { ...consent, granted: false, revokedAt };
}

/* consentAllows(consent, executionPurpose, ctx) -> null | structured error.
   ctx.resultAccepted gates animation (Luma) behind an accepted result. */
export function consentAllows(consent, executionPurpose, ctx = {}) {
  if (!consent || consent.granted !== true)
    return err("CONSENT_REQUIRED", "Body-analysis consent has not been granted.", "consent", true);
  const need = EXECUTION_PURPOSE_MAP[executionPurpose];
  if (!need)
    return err("CONSENT_REQUIRED", "Unknown execution purpose: " + executionPurpose, "providerExecutions", true);
  if (BASE_PURPOSES.includes(need)) {
    if (!consent.allowedPurposes.includes(need))
      return err("CONSENT_REQUIRED", "Consent does not cover " + need + ".", "consent.allowedPurposes", true);
    return null;
  }
  if (!consent.optionalPurposes || consent.optionalPurposes[need] !== true)
    return err("CONSENT_REQUIRED", need + " requires its own explicit opt-in.", "consent.optionalPurposes." + need, true);
  if (need === "animation" && ctx.resultAccepted !== true)
    return err("CONSENT_REQUIRED", "Animation is blocked until the athlete accepts the assessment result.", "result.acceptedByAthlete", true);
  return null;
}
