/* Compound Fitness — CAS shared module (PocketBase v0.39.8).

   REQUIRED BY THE PRODUCT ARCHITECT (Round 2 review, decision 1):

     "Every value required at request execution time must be created or loaded
      inside the handler runtime. Do not rely on file lexical scope."

   PocketBase serializes routerAdd/hook handler functions and executes them in a
   SEPARATE goja runtime. A handler therefore cannot see the top-level scope of
   the file that registered it. In Round 2 this made the commit route throw
   `ReferenceError: CF_SUBSYSTEMS is not defined` on every single request — the
   route had never worked. See STAGING_RESULTS.md §3.

   This module holds ONLY deterministic, side-effect-free material: constants,
   pure helpers, and stable response shapes. It must never hold mutable request
   state — one module instance may be shared across requests. */

const MAX_PAYLOAD_BYTES   = 256 * 1024;                     // Architect ruling: 256 KiB
const REQUEST_LIMIT_BYTES = MAX_PAYLOAD_BYTES + 64 * 1024;  // 320 KiB whole-envelope
const MIN_CLIENT_BUILD    = "";                             // e.g. "2026-07-27.342" at lockdown
const MAX_KEY_LENGTH      = 96;

const SUBSYSTEMS = {
  core:     { field: "data",     rev: "coreRev" },
  training: { field: "training", rev: "trainingRev" },
};

/* UTF-8 byte length — JS .length counts UTF-16 code units, not bytes, so a
   multibyte payload would otherwise be undercounted against the cap. */
function utf8Bytes(s) {
  try { return unescape(encodeURIComponent(s)).length; } catch (e) { return String(s).length * 3; }
}

/* ---- validation -------------------------------------------------------
   Returns null when valid, or { status, body } ready to return. Every error
   body carries an exact `error` string: the Architect requires tests to assert
   on semantic content, and "a generic PocketBase framework error body is
   always a failure". */

function validateSubsystem(name) {
  if (!SUBSYSTEMS[name]) return { status: 400, body: { ok: false, error: "invalid subsystem" } };
  return null;
}

function validateExpectedRev(v) {
  if (typeof v !== "number" || v < 0 || Math.floor(v) !== v)
    return { status: 400, body: { ok: false, error: "expectedRev must be a non-negative integer" } };
  return null;
}

function validateKey(k) {
  if (!k || k.length > MAX_KEY_LENGTH)
    return { status: 400, body: { ok: false, error: "idempotencyKey required (max 96 chars)" } };
  return null;
}

function validatePayload(p) {
  if (typeof p !== "object" || p === null || Array.isArray(p))
    return { status: 400, body: { ok: false, error: "payload must be a JSON object" } };
  return null;
}

/* Cap is INCLUSIVE: exactly MAX_PAYLOAD_BYTES is accepted, one byte more is not. */
function validatePayloadSize(payloadStr) {
  if (utf8Bytes(payloadStr) > MAX_PAYLOAD_BYTES)
    return { status: 413, body: { ok: false, error: "payload too large", maxBytes: MAX_PAYLOAD_BYTES } };
  return null;
}

function validateClientBuild(build) {
  if (MIN_CLIENT_BUILD && build && build < MIN_CLIENT_BUILD)
    return { status: 426, body: { ok: false, error: "update-required", minBuild: MIN_CLIENT_BUILD } };
  return null;
}

/* ---- stable response shapes ------------------------------------------- */

function okCommit(subsystem, newRev)          { return { ok: true,  subsystem: subsystem, newRev: newRev }; }
function okReplay(subsystem, newRev, status)  { return { ok: status === 200, replay: true, subsystem: subsystem, newRev: newRev }; }
function conflict(subsystem, serverRev, payload) {
  return { ok: false, conflict: true, subsystem: subsystem, serverRev: serverRev, payload: payload };
}
function keyReused()  { return { ok: false, error: "idempotency key reused with a different request" }; }
function commitFailed(){ return { ok: false, error: "commit failed" }; }

module.exports = {
  MAX_PAYLOAD_BYTES, REQUEST_LIMIT_BYTES, MIN_CLIENT_BUILD, MAX_KEY_LENGTH, SUBSYSTEMS,
  utf8Bytes,
  validateSubsystem, validateExpectedRev, validateKey, validatePayload,
  validatePayloadSize, validateClientBuild,
  okCommit, okReplay, conflict, keyReused, commitFailed,
};
