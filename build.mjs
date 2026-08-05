/* Inline src/ modules into index.html between markers.
 *
 * WHY A BUILD STEP AND NOT <script src>. This app has no service worker —
 * the manifest is an inline data URI — so a second file would be a second
 * HTTP cache entry that can skew against index.html. A device could end up
 * running new markup with an old module. This project has already had a
 * device serve stale bytes badly enough to need deleting and re-adding, and
 * the sync protocol assumes the app is one consistent artifact. Concatenating
 * keeps the deploy atomic: you get the whole new app or the whole old one.
 * (Architect ruling 2026-08-05: separate deployed assets begin only in
 * Phase 2, together with the service worker.)
 *
 * The point is that SOURCE is split and testable, not that the shipped file
 * is smaller. Runtime behaviour is byte-identical to hand-pasting.
 *
 * ORDER IS SEMANTICS. The whole app is one classic <script>; later function
 * declarations deliberately shadow earlier ones and assignment wrappers run
 * in textual order (docs/DUPLICATE-DECLARATIONS.md). Modules are therefore
 * inlined IN PLACE at their marker position — nothing is ever reordered.
 * Each ==BUILD:name== marker pair stays exactly where the code originally
 * lived in the file.
 *
 * Two module kinds:
 *   file      src/<name> pasted verbatim (the default)
 *   generate  content produced from other sources at build time — used for
 *             asset-backed modules (e.g. the Coach Max avatars, whose source
 *             of truth is real .jpg files in assets/max/, base64-encoded here
 *             so the shipped artifact stays self-contained)
 *
 *   node build.mjs           inline and write index.html
 *   node build.mjs --check   verify index.html matches src/ (exit 1 if not)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INDEX = path.join(HERE, "index.html");

/* The Coach Max mood avatars. Source of truth: assets/max/<mood>.jpg.
   The generated module recreates the original MAXFACE object byte-for-byte
   (same moods, same encoding), so extraction changes nothing at runtime. */
const MAX_MOODS = ["ecstatic", "clapping", "proud", "happy", "thumbsup",
  "encouraging", "surprised", "thinking", "focused", "determined", "calm",
  "disappointed", "worried"];
function generateMaxAvatars() {
  const lines = MAX_MOODS.map((mood) => {
    const f = path.join(HERE, "assets", "max", mood + ".jpg");
    const b64 = fs.readFileSync(f).toString("base64");
    return mood + ':"data:image/jpeg;base64,' + b64 + '"';
  });
  /* EXACT original formatting: entries joined by ",\n", closing "}; " on the
     last entry line — regenerating must be byte-identical to the block it
     replaced, or the first build after extraction would churn the artifact. */
  return "var MAXFACE={\n" + lines.join(",\n") + "};";
}

/* Inlined IN PLACE — list order here is documentation; position of the
   markers in index.html is what actually governs. */
const MODULES = [
  { name: "tdee-core.js" },
  { name: "tdee-proposal.js" },
  { name: "max-avatars.js", generate: generateMaxAvatars },
  { name: "mp-calc.js" },
  { name: "report-progress.js" },
  { name: "report-srview.js" },
];

const begin = (n) => `/* ==BUILD:${n}== */`;
const end = (n) => `/* ==BUILD-END:${n}== */`;

let html = fs.readFileSync(INDEX, "utf8");
let changed = false;

for (const mod of MODULES) {
  const src = (mod.generate
    ? mod.generate()
    : fs.readFileSync(path.join(HERE, "src", mod.name), "utf8")).trimEnd();
  const b = begin(mod.name), e = end(mod.name);
  const bi = html.indexOf(b), ei = html.indexOf(e);
  if (bi < 0 || ei < 0) { console.error(`missing markers for ${mod.name} in index.html`); process.exit(2); }
  if (ei < bi) { console.error(`markers out of order for ${mod.name}`); process.exit(2); }
  const block = `${b}\n${src}\n${e}`;
  const current = html.slice(bi, ei + e.length);
  if (current !== block) { html = html.slice(0, bi) + block + html.slice(ei + e.length); changed = true; }
}

if (process.argv.includes("--check")) {
  if (changed) { console.error("index.html is STALE — run: node build.mjs"); process.exit(1); }
  console.log("index.html matches src/");
  process.exit(0);
}
if (changed) { fs.writeFileSync(INDEX, html); console.log("index.html updated from src/"); }
else console.log("index.html already current");
