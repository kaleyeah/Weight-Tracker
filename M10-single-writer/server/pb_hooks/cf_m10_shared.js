/* Compound Fitness — M10 single-writer shared module (PocketBase v0.39.8).

   Same runtime rule as cf_cas_shared.js: handlers execute in a separate goja
   runtime and cannot see file lexical scope — every handler requires this
   module itself. Deterministic, side-effect-free material only.

   Contract: M10 design v9 + matrix v5.1 (Architect-approved 2026-08-02,
   round 9) for LOCAL DISPOSABLE implementation. */

/* THE enforcement switch (design §7). Ships OFF. Flipped ON only by a
   separately Owner-authorized redeploy after both devices verify on the M10
   client build. Local disposable tests may exercise an ON variant ONLY inside
   the disposable instance (approval item 2) — see tests/README: the ON runs
   set CF_M10_ENFORCE_OVERRIDE=1 in the disposable environment, which is read
   here so the reviewed constant itself never ships as anything but false. */
const FENCING_ENFORCED_DEFAULT = false;
function fencingEnforced() {
  try { if ($os.getenv("CF_M10_ENFORCE_OVERRIDE") === "1") return true; } catch (_) {}
  return FENCING_ENFORCED_DEFAULT;
}

const LEASE_TTL_MS   = 24 * 3600 * 1000;   // design §4 (PROVISIONAL, client lifecycle evidence pending)
const FENCE_MAX      = 9007199254740990;   // 2^53 - 2: route hard-errors before exceeding (design §3)
const PHOTO_MAX_BYTES = 15728640;          // 15 MiB upload cap (design H4)
const PLATFORM_FIELDS = { nightlySummary: true, weeklySummary: true, nightlyLog: true, scriptVer: true }; // §2b
const MAILBOX_FIELDS  = { coachreq: true, health: true };  // §6
const CONTENT_FIELDS  = { data: true, training: true };    // §2
const REV_FIELDS      = { coreRev: true, trainingRev: true };

/* ---- lease helpers ---------------------------------------------------- */

/* renewedAt is an autodate; PB serializes "YYYY-MM-DD HH:MM:SS.sssZ". */
function parsePbDate(s) {
  if (!s) return 0;
  const t = Date.parse(String(s).replace(" ", "T"));
  return isNaN(t) ? 0 : t;
}
function leaseExpired(renewedAtMs, nowMs) { return nowMs - renewedAtMs > LEASE_TTL_MS; }

function leaseStatusBody(rec, nowMs) {
  if (!rec) return { ok: true, exists: false, fence: 0, holderDeviceId: null, deviceName: null,
                     active: false, renewedAt: null, serverNow: nowMs, ttlMs: LEASE_TTL_MS };
  return { ok: true, exists: true,
           fence: rec.getInt("fence"),
           holderDeviceId: rec.getString("holderDeviceId") || null,
           deviceName: rec.getString("deviceName") || null,
           active: !!rec.getBool("active"),
           renewedAt: rec.getString("renewedAt") || null,
           serverNow: nowMs, ttlMs: LEASE_TTL_MS };
}

/* ---- shared error/response shapes ------------------------------------- */

function fenceStale(currentFence) {
  return { ok: false, fenceStale: true, fence: currentFence };
}
function leaseStale(currentFence) {
  return { ok: false, stale: true, fence: currentFence };
}
function badRequest(msg) { return { status: 400, body: { ok: false, error: msg } }; }

/* Canonical JSON — same algorithm as cf_cas_shared.canonicalJson; duplicated
   here so the M10 modules stay loadable even if the CAS kit revs separately.
   Keys sorted recursively; array order preserved (meaningful data). */
function canonicalJson(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return "[" + v.map(canonicalJson).join(",") + "]";
  const keys = Object.keys(v).sort();
  const parts = [];
  for (let i = 0; i < keys.length; i++) {
    if (v[keys[i]] === undefined) continue;
    parts.push(JSON.stringify(keys[i]) + ":" + canonicalJson(v[keys[i]]));
  }
  return "{" + parts.join(",") + "}";
}

/* ---- photo metadata canonicalization (design §5b/H2) -------------------
   The canonical metadata that participates in the upload request identity.
   Only these keys, always in this order, absent → "". */
function photoMetaCanonical(m) {
  return canonicalJson({
    kind: String(m.kind || ""), date: String(m.date || "").slice(0, 10),
    week: String(m.week || "").slice(0, 10), pose: String(m.pose || "").slice(0, 20),
    meal: String(m.meal || "").slice(0, 20), ts: String(m.ts || ""),
  });
}

/* Mailbox-only test on a PARSED body (design §6): present-key set must be a
   nonempty subset of exactly one mailbox family; null-valued CONTENT keys
   count as present (reject); unknown keys reject; revision fields reject. */
function mailboxOnly(body) {
  const keys = Object.keys(body || {});
  if (!keys.length) return false;
  let fam = null;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (!MAILBOX_FIELDS[k]) return false;         // content, revision, unknown → not mailbox
    if (fam === null) fam = k;
    else if (fam !== k) return false;             // mixing coachreq+health rejects (subset of ONE family)
  }
  return true;
}

/* ---- photo-route helpers (called via require from handler runtimes;
   globals like $security/Record are runtime globals, visible here). ---- */

function photoLeaseCheck(m10, txApp, uid, rawDeviceId, reqFence) {
  let leaseRec = null;
  try { leaseRec = txApp.findFirstRecordByFilter("writer_lease", "user = {:u}", { u: uid }); } catch (_) {}
  if (m10.fencingEnforced()) {
    const lf = leaseRec ? leaseRec.getInt("fence") : 0;
    const ok = leaseRec && leaseRec.getBool("active") &&
               leaseRec.getString("holderDeviceId") === rawDeviceId &&
               reqFence !== null && reqFence === lf;
    if (!ok) return { reject: { status: 409, body: m10.fenceStale(lf) }, holderHash: "" };
  }
  const holderHash = (leaseRec && leaseRec.getString("holderDeviceId"))
    ? $security.sha256(leaseRec.getString("holderDeviceId")).slice(0, 64) : "";
  return { reject: null, holderHash: holderHash };
}

function photoLedgerLookup(txApp, uid, key) {
  try {
    return txApp.findFirstRecordByFilter("cf_commit_log",
      "user = {:u} && subsystem = 'photos' && key = {:k}", { u: uid, k: key });
  } catch (_) { return null; }
}

function writePhotoLedger(txApp, uid, key, requestHash, op, resultRecordId, resultIdentity,
                          fileSha256, fileByteLength, reqFence, holderHash, clientBuild, deviceHash) {
  const logCol = txApp.findCollectionByNameOrId("cf_commit_log");
  const log = new Record(logCol);
  log.set("user", uid); log.set("subsystem", "photos"); log.set("key", key);
  log.set("requestHash", requestHash); log.set("responseStatus", 200);
  log.set("op", op); log.set("resultRecordId", resultRecordId);
  log.set("resultIdentity", resultIdentity);
  if (fileSha256) log.set("fileSha256", fileSha256);
  if (fileByteLength !== null) log.set("fileByteLength", fileByteLength);
  if (reqFence !== null) log.set("writerFence", reqFence);
  if (holderHash) log.set("holderDeviceHash", holderHash);
  log.set("clientBuild", clientBuild); log.set("deviceHash", deviceHash);
  txApp.save(log);
}


/* DISPOSABLE-ONLY fault injection (round-10 item 4): honored ONLY when the
   instance environment sets CF_M10_TEST_ENABLE=1 (setup-instance.sh does;
   no real deployment does). Ships inert. */
function testFault(e, stage) {
  try {
    if ($os.getenv("CF_M10_TEST_ENABLE") !== "1") return false;
    return e.request.header.get("x-cf-test-fault") === stage;
  } catch (_) { return false; }
}

module.exports = {
  testFault,
  FENCING_ENFORCED_DEFAULT, fencingEnforced,
  LEASE_TTL_MS, FENCE_MAX, PHOTO_MAX_BYTES,
  PLATFORM_FIELDS, MAILBOX_FIELDS, CONTENT_FIELDS, REV_FIELDS,
  parsePbDate, leaseExpired, leaseStatusBody,
  fenceStale, leaseStale, badRequest,
  canonicalJson, photoMetaCanonical, mailboxOnly,
  photoLeaseCheck, photoLedgerLookup, writePhotoLedger,
};
