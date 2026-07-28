/* Compound Fitness — INDEPENDENT quarantine-manifest reader.

   Required by the Product Architect (client staging ruling, 2026-07-27):

     "Testing the manifest using the same implementation that produces it
      weakens the evidence. An independent manifest reader provides a second
      implementation that validates the contract rather than the code."

   INDEPENDENCE IS THE POINT AND IS ENFORCED BY TEST.
   This file must not require, import, copy or paraphrase:
     - anything from index.html (including cfManifestValid / cfSameStringSet),
     - the production canonicalization (cfCanon), which the pre-coding review
       explicitly named as off-limits here too.
   It is written from the CONTRACT as stated in MANUAL_CHECKLIST_COMMIT1.md and
   the Commit 1g decision, not from the shipping code. Where the two disagree,
   that disagreement is the finding — it must not be reconciled by copying.

   Input is a plain storage snapshot: { key: stringValue }, exactly as a
   localStorage dump captured by the browser harness. No DOM, no browser API.
*/

'use strict';

/* The contract: a complete set-aside carries exactly these three components. */
const REQUIRED = ['core', 'training', 'workout'];

const KEY = {
  manifest: (stamp) => `cf:quarantine:${stamp}:manifest`,
  component: (stamp, name) => `cf:quarantine:${stamp}:${name}`,
};

/* Every stamp that has at least one artifact key, whether or not it is whole. */
function listStamps(store) {
  const seen = new Set();
  for (const k of Object.keys(store)) {
    const m = /^cf:quarantine:(\d+):/.exec(k);
    if (m) seen.add(m[1]);
  }
  return [...seen].sort();
}

function parseManifest(store, stamp) {
  const raw = store[KEY.manifest(stamp)];
  if (raw === undefined || raw === null) return { present: false, manifest: null, error: 'absent' };
  if (typeof raw !== 'string') return { present: true, manifest: null, error: 'not-a-string' };
  try {
    const m = JSON.parse(raw);
    if (!m || typeof m !== 'object' || Array.isArray(m)) {
      return { present: true, manifest: null, error: 'not-an-object' };
    }
    return { present: true, manifest: m, error: null };
  } catch (e) {
    return { present: true, manifest: null, error: 'unparseable' };
  }
}

/* Independent set comparison — deliberately not the app's helper.
   Exact set: same members, no duplicates, nothing missing, nothing extra. */
function isExactSet(actual, required) {
  if (!Array.isArray(actual)) return false;
  if (actual.length !== required.length) return false;          /* catches duplicates and subsets */
  const seen = new Set();
  for (const a of actual) {
    if (typeof a !== 'string') return false;
    if (seen.has(a)) return false;                              /* duplicate */
    if (!required.includes(a)) return false;                    /* unknown */
    seen.add(a);
  }
  return required.every((r) => seen.has(r));                    /* nothing missing */
}

function isValidSize(n) {
  return typeof n === 'number' && Number.isFinite(n) && Number.isInteger(n) && n >= 0;
}

/* UTF-8 BYTE length, computed here rather than borrowed.

   Required correction C10-P1-03: this reader previously compared
   String.length, which counts UTF-16 code units. The contract says bytes, and
   a payload containing accented text or emoji measures differently under the
   two. Repeating the app's mistake independently would have hidden it rather
   than caught it — which is the whole point of a second implementation.

   Deliberately NOT Buffer.byteLength and NOT the app's helper: this stays a
   second implementation derived from the UTF-8 encoding rules themselves. */
function utf8Bytes(s) {
  const str = String(s === undefined || s === null ? '' : s);
  let n = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      const d = i + 1 < str.length ? str.charCodeAt(i + 1) : 0;
      if (d >= 0xdc00 && d <= 0xdfff) { n += 4; i++; }   /* surrogate pair */
      else n += 3;                                        /* lone surrogate */
    } else n += 3;
  }
  return n;
}

/**
 * Validate one set-aside artifact against the contract.
 * Returns { stamp, complete, exportable, problems[] }.
 * `complete` means every contract rule holds. `exportable` is the product
 * rule: an incomplete or altered set must refuse export.
 */
function inspect(store, stamp) {
  const problems = [];
  const { present, manifest, error } = parseManifest(store, stamp);

  const componentsPresent = REQUIRED.filter((n) => typeof store[KEY.component(stamp, n)] === 'string');
  const anyComponent = componentsPresent.length > 0;

  if (!present) {
    /* Components without a manifest is the DURING-WRITE state, not corruption:
       the contract says the manifest is written last. It is incomplete, and it
       must not be exportable. */
    if (anyComponent) problems.push('manifest absent while components exist (incomplete write)');
    else problems.push('nothing stored for this stamp');
    return { stamp, complete: false, exportable: false, problems };
  }
  if (!manifest) {
    problems.push(`manifest ${error}`);
    return { stamp, complete: false, exportable: false, problems };
  }

  if (String(manifest.stamp) !== String(stamp)) {
    problems.push(`manifest stamp ${JSON.stringify(manifest.stamp)} does not match its key ${stamp}`);
  }

  if (!isExactSet(manifest.keys, REQUIRED)) {
    problems.push(`declared keys ${JSON.stringify(manifest.keys)} are not exactly ${JSON.stringify(REQUIRED)}`);
  }

  const sizes = manifest.sizes;
  if (!sizes || typeof sizes !== 'object' || Array.isArray(sizes)) {
    problems.push('sizes missing or not an object');
  } else {
    const sizeKeys = Object.keys(sizes);
    if (!isExactSet(sizeKeys, REQUIRED)) {
      problems.push(`sizes cover ${JSON.stringify(sizeKeys)}, not exactly ${JSON.stringify(REQUIRED)}`);
    }
    for (const name of REQUIRED) {
      if (!(name in sizes)) continue;
      if (!isValidSize(sizes[name])) {
        problems.push(`size for "${name}" is not a non-negative integer: ${JSON.stringify(sizes[name])}`);
      }
    }
  }

  /* Every declared component must exist, and its stored bytes must match the
     declared length. This is the byte-for-byte check H3 asks for. */
  for (const name of REQUIRED) {
    const stored = store[KEY.component(stamp, name)];
    if (typeof stored !== 'string') {
      problems.push(`component "${name}" is missing from storage`);
      continue;
    }
    const declared = sizes && sizes[name];
    const actualBytes = utf8Bytes(stored);
    if (isValidSize(declared) && actualBytes !== declared) {
      problems.push(`component "${name}" is ${actualBytes} UTF-8 bytes but the manifest declares ${declared}`);
    }
  }

  /* Anything stored under this stamp that the contract does not name. */
  for (const k of Object.keys(store)) {
    const m = new RegExp(`^cf:quarantine:${stamp}:(.+)$`).exec(k);
    if (m && m[1] !== 'manifest' && !REQUIRED.includes(m[1])) {
      problems.push(`unknown component "${m[1]}" stored under this stamp`);
    }
  }

  const complete = problems.length === 0;
  return { stamp, complete, exportable: complete, problems };
}

/** Inspect every stamp found in the snapshot. */
function inspectAll(store) {
  return listStamps(store).map((s) => inspect(store, s));
}

/** The product rule, stated separately so tests can assert it by name. */
function mayExport(store, stamp) {
  return inspect(store, stamp).exportable;
}

module.exports = { REQUIRED, KEY, listStamps, inspect, inspectAll, mayExport, isExactSet, utf8Bytes };
