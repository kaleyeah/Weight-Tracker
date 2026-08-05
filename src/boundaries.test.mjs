/* Dependency-boundary scan (Architect module map, dependency rules).
 *
 * domain/ modules must not touch DOM, network, or storage. Today's domain
 * set: tdee-core.js, tdee-proposal.js, mp-calc.js. Data modules (icons,
 * generated avatars) must stay data. Report generators may touch the DOM
 * boundary they own (document generation) but not network or storage.
 *
 *   node src/boundaries.test.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let P = 0, F = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); c ? P++ : F++; };

/* Word-boundary probes. Comments are stripped first so prose mentioning a
   forbidden word does not fail the scan; strings are kept, because building a
   fetch URL in a string is exactly what the rule exists to catch. */
const strip = (s) => s.replace(/\/\*[^]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const probes = {
  /* document must be followed immediately by a lowercase property (real DOM
     APIs are all lowercase-start) — prose like "in this document. Each" inside
     a data string is not a violation. */
  dom: /\bdocument\.[a-z_$]|\bwindow\.document\b/,
  network: /\bfetch\s*\(|XMLHttpRequest|WebSocket\b/,
  storage: /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/,
};

const RULES = [
  ["tdee-core.js",       ["dom", "network", "storage"]],
  ["tdee-proposal.js",   ["dom", "network", "storage"]],
  ["mp-calc.js",         ["dom", "network", "storage"]],
  ["icons.js",           ["dom", "network", "storage"]],
  ["report-progress.js", ["network", "storage"]],
  ["report-srview.js",   ["network", "storage"]],
];

for (const [file, banned] of RULES) {
  const src = strip(fs.readFileSync(path.join(HERE, file), "utf8"));
  for (const b of banned) {
    const m = probes[b].exec(src);
    ok(!m, `${file} avoids ${b}` + (m ? ` — found "${m[0]}" at offset ${m.index}` : ""));
  }
}

console.log(`\n${P} passed, ${F} failed`);
process.exit(F ? 1 : 0);
