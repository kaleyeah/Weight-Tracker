/* Photo Asset Service (§7) + Photo Quality Service (§8).
   Classification is the gate: generated or unsupported assets are refused as
   analysis inputs with structured errors, and quality status is DERIVED from
   the checks + score so no caller can hand-pick a friendlier status. */
import { CONFIG, err } from "./manifest-core.mjs";

export const ASSET_CLASSES = ["real_progress_photo", "temporary_analysis_copy", "generated_goal_visualization",
  "generated_animation_frame", "coach_reference_image", "unsupported_asset"];
export const REQUIRED_POSES = ["front", "left_side", "right_side", "back"];

/* classifyForAnalysis(photo) -> null | structured error (§7 rejections) */
export function classifyForAnalysis(photo) {
  if (!photo || !ASSET_CLASSES.includes(photo.assetClass))
    return err("MISSING_REQUIRED_INPUT", "Photo has no recognizable asset class.", "photos", true);
  if (photo.generatedImage === true || photo.assetClass === "generated_goal_visualization" ||
      photo.assetClass === "generated_animation_frame")
    return err("GENERATED_IMAGE_NOT_ALLOWED", "Generated images are never official assessment inputs.", "photos", false);
  if (photo.assetClass === "unsupported_asset")
    return err("PHOTO_QUALITY_INSUFFICIENT", "Unsupported asset.", "photos", true);
  if (photo.assetClass !== "real_progress_photo")
    return err("PHOTO_QUALITY_INSUFFICIENT", photo.assetClass + " is not an assessment input.", "photos", true);
  if (!REQUIRED_POSES.includes(photo.pose))
    return err("PHOTO_POSE_MISMATCH", "Unknown pose: " + photo.pose, "photos", true);
  if (photo.analysisEligible !== true)
    return err("PHOTO_QUALITY_INSUFFICIENT", "Photo is not analysis-eligible.", "photos", true);
  return null;
}

/* poseCoverage(photos) -> null | error for the first missing required pose */
export function poseCoverage(photos) {
  for (const p of REQUIRED_POSES)
    if (!(photos || []).some((x) => x.pose === p))
      return err("PHOTO_MISSING", "Missing required pose: " + p, "photos." + p, true);
  return null;
}

/* deriveQualityStatus(checks, score) -> {status, retakeRequired, warnings}
   Hard identity/person failures reject outright; the generated check rejects
   with its own §25 code at classify time and rejects here as belt+braces. */
export function deriveQualityStatus(checks, score, config = CONFIG) {
  const cfg = config.photoQuality;
  const warnings = [];
  if (checks[cfg.generatedCheck] === true)
    return { status: "rejected", retakeRequired: true, warnings: ["likely_generated_or_manipulated"] };
  for (const hard of cfg.hardFailChecks)
    if (checks[hard] === false)
      return { status: "rejected", retakeRequired: true, warnings: ["failed_" + hard] };
  for (const [k, v] of Object.entries(checks))
    if (v === false && !cfg.hardFailChecks.includes(k) && k !== cfg.generatedCheck)
      warnings.push("weak_" + k);          /* generatedCheck is GOOD when false */
  if (typeof score !== "number" || score < cfg.retakeMinScore)
    return { status: "rejected", retakeRequired: true, warnings };
  if (score < cfg.warnMinScore) return { status: "retake_recommended", retakeRequired: true, warnings };
  if (score < cfg.acceptMinScore || warnings.length) return { status: "accepted_with_warnings", retakeRequired: false, warnings };
  return { status: "accepted", retakeRequired: false, warnings };
}

/* reviewPhoto(photo, checks, score) -> photoQuality entry (§8 shape) */
export function reviewPhoto(photo, checks, score, config = CONFIG) {
  const d = deriveQualityStatus(checks, score, config);
  return { photoId: photo.photoId, pose: photo.pose, status: d.status, score,
    checks: { ...checks }, warnings: d.warnings, retakeRequired: d.retakeRequired };
}
