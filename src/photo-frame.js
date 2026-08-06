/* ==================== PROGRESS-PHOTO FRAME CORE (Owner package 2026-08-06)
   Milestone 1 of the guided progress-photo plan: pure geometry + metadata
   logic for the standardized 3:4 presentation frame. NO DOM, NO canvas, NO
   storage — the browser derivative generator and the capture/review UI (later
   milestones) consume these.

   Non-negotiables encoded here:
   - the stored source blob is AUTHORITATIVE and is never touched; a
     normalization is metadata DESCRIBING a view of it;
   - the only permitted operations are crop, translate, uniform scale and a
     small global rotation — expressed as one normalized crop rect + degrees;
   - derivatives are deterministic: same source + same normalization ⇒ same
     derivative, and any change to either invalidates the cached derivative.

   UMD: classic-script globals in the app; module.exports for node tests. */

var PF_ALGO = "progress-frame-v1";
var PF_ASPECT = 3 / 4;                  /* width / height */
var PF_MAX_ROT = 7;                     /* degrees — camera leveling, not art */

/* ---- normalization metadata ---- */
function pfValidNorm(n) {
  if (!n || typeof n !== "object") return false;
  if (n.schemaVersion !== 1) return false;
  if (typeof n.algorithmVersion !== "string" || !n.algorithmVersion) return false;
  if (n.aspectRatio !== "3:4") return false;
  var c = n.crop;
  if (!c || typeof c !== "object") return false;
  var f = function (v) { return typeof v === "number" && isFinite(v); };
  if (!f(c.x) || !f(c.y) || !f(c.width) || !f(c.height)) return false;
  if (c.width <= 0.01 || c.height <= 0.01) return false;
  if (c.x < 0 || c.y < 0 || c.x + c.width > 1.0000001 || c.y + c.height > 1.0000001) return false;
  if (!f(n.rotationDegrees) || Math.abs(n.rotationDegrees) > PF_MAX_ROT) return false;
  if (n.confidence != null && (!f(n.confidence) || n.confidence < 0 || n.confidence > 1)) return false;
  if (["auto", "manual", "legacy"].indexOf(n.mode) < 0) return false;
  return true;
}

/* ---- deterministic auto-suggestion (Milestone 1: geometric) ----
   The centered, maximal 3:4 rect of the source. Landmark-driven placement is
   a later milestone; this suggestion is always valid, always deterministic,
   and is presented as a SUGGESTION (mode:"auto", modest confidence) that the
   review step lets the athlete adjust. */
function pfAutoSuggest(srcW, srcH) {
  if (!(srcW > 0 && srcH > 0)) return null;
  var srcRatio = srcW / srcH, crop;
  if (srcRatio > PF_ASPECT) {
    /* source is wider than 3:4 — full height, centered horizontally */
    var w = (srcH * PF_ASPECT) / srcW;
    crop = { x: (1 - w) / 2, y: 0, width: w, height: 1 };
  } else {
    /* source is taller (or exact) — full width, centered vertically */
    var h = (srcW / PF_ASPECT) / srcH;
    crop = { x: 0, y: (1 - h) / 2, width: 1, height: h };
  }
  return { schemaVersion: 1, algorithmVersion: PF_ALGO, aspectRatio: "3:4",
    crop: crop, rotationDegrees: 0, confidence: 0.4, mode: "auto" };
}

/* ---- normalized crop → source-pixel rect, clamped and 3:4-true ----
   Returns integer pixel {x,y,width,height} whose ratio is 3:4 to within one
   pixel of rounding, never exceeding the source bounds. */
function pfCropRect(crop, srcW, srcH) {
  if (!(srcW > 0 && srcH > 0)) return null;
  var x = Math.max(0, Math.min(1, crop.x)) * srcW;
  var y = Math.max(0, Math.min(1, crop.y)) * srcH;
  var w = Math.max(1, Math.min(crop.width * srcW, srcW - x));
  var h = Math.max(1, Math.min(crop.height * srcH, srcH - y));
  /* re-true the ratio inside the clamped box (shrink, never grow) */
  if (w / h > PF_ASPECT) w = h * PF_ASPECT; else h = w / PF_ASPECT;
  return { x: Math.round(x), y: Math.round(y), width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
}

/* ---- manual adjustment: pan/zoom around a center, kept in-bounds ----
   zoom > 1 tightens the crop; pan is in crop-widths. Pure, so the crop editor
   (Milestone 2) is arithmetic + redraw, nothing clever. */
function pfAdjust(crop, panX, panY, zoom) {
  var w = crop.width / (zoom || 1), h = crop.height / (zoom || 1);
  w = Math.min(1, Math.max(0.05, w)); h = Math.min(1, Math.max(0.05, h));
  /* preserve the 3:4 relation the crop already encodes: scale both equally */
  var cx = crop.x + crop.width / 2 + (panX || 0) * crop.width;
  var cy = crop.y + crop.height / 2 + (panY || 0) * crop.height;
  var x = cx - w / 2, y = cy - h / 2;
  x = Math.max(0, Math.min(1 - w, x)); y = Math.max(0, Math.min(1 - h, y));
  return { x: x, y: y, width: w, height: h };
}

/* ---- derivative identity ----
   The cache key binds photo id + algorithm + the exact transform. Any change
   to any component is a different key, so stale derivatives can never be
   served for an edited normalization (Milestone 1 invalidation rule). */
function pfDerivKey(photoId, n) {
  var c = n.crop;
  var r = function (v) { return Math.round(v * 1e5) / 1e5; };
  return [photoId, n.algorithmVersion, r(c.x), r(c.y), r(c.width), r(c.height),
    r(n.rotationDegrees || 0)].join("|");
}

/* ---- legacy status ---- */
function pfHasNorm(rec) { return !!(rec && pfValidNorm(rec.normalization)); }

if (typeof module !== "undefined" && module.exports) {
  module.exports = { pfValidNorm: pfValidNorm, pfAutoSuggest: pfAutoSuggest,
    pfCropRect: pfCropRect, pfAdjust: pfAdjust, pfDerivKey: pfDerivKey,
    pfHasNorm: pfHasNorm, PF_ALGO: PF_ALGO, PF_MAX_ROT: PF_MAX_ROT };
}
