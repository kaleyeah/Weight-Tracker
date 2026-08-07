/* Audit Service (§24) + Retention/Deletion Service (§23).
   The audit trail is append-only and only speaks the 21 required event
   types. Deletion state is explicit and NEVER overstated: a provider-side
   deletion that cannot be verified stays "requested_unverified". */
import { err } from "./manifest-core.mjs";

export const AUDIT_EVENTS = ["assessment_created", "input_added", "input_changed", "photo_rejected",
  "photo_replaced", "consent_granted", "consent_revoked", "analysis_started", "provider_called",
  "provider_completed", "provider_failed", "reconciliation_completed", "assessment_completed",
  "assessment_accepted", "assessment_rejected", "coach_review_requested", "coach_review_completed",
  "visualization_generated", "animation_generated", "deletion_requested", "deletion_completed"];

export function makeAudit() { return []; }

export function record(audit, type, at, data) {
  if (!AUDIT_EVENTS.includes(type)) throw new Error("unknown audit event: " + type);
  audit.push(Object.freeze({ type, at, ...(data ? { data } : {}) }));
  return audit;
}

/* ---- retention ---- */
export function makeRetention(config) {
  return { temporaryCopies: [], deletions: [],
    temporaryCopiesRetentionHours: config.retention.temporaryCopiesRetentionHours };
}

export function registerTempCopy(ret, { assetId, createdAt }) {
  ret.temporaryCopies.push({ assetId, createdAt, deleted: false });
}

export function expiredTempCopies(ret, nowIso) {
  const ttlMs = ret.temporaryCopiesRetentionHours * 3600000;
  return ret.temporaryCopies.filter((c) => !c.deleted && (Date.parse(nowIso) - Date.parse(c.createdAt)) >= ttlMs);
}

export function deleteTempCopy(ret, assetId, at) {
  const c = ret.temporaryCopies.find((x) => x.assetId === assetId && !x.deleted);
  if (!c) return err("ASSET_DELETION_FAILED", "No such live temporary copy: " + assetId, "privacy", true);
  c.deleted = true; c.deletedAt = at;
  return null;
}

/* provider-side deletion: verified only when the adapter PROVES it */
export function requestProviderDeletion(ret, { providerAssetId, at }) {
  const d = { providerAssetId, state: "requested_unverified", requestedAt: at };
  ret.deletions.push(d);
  return d;
}
export function confirmProviderDeletion(ret, providerAssetId, at, verified) {
  const d = ret.deletions.find((x) => x.providerAssetId === providerAssetId);
  if (!d) return err("ASSET_DELETION_FAILED", "No deletion request for " + providerAssetId, "privacy", true);
  d.state = verified === true ? "verified_deleted" : "requested_unverified";
  d.respondedAt = at;
  return null;
}
