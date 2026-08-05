/* Inline src/ modules into index.html between markers.
 *
 * WHY A BUILD STEP AND NOT <script src>. This app has no service worker —
 * the manifest is an inline data URI — so a second file would be a second
 * HTTP cache entry that can skew against index.html. A device could end up
 * running new markup with an old module. This project has already had a
 * device serve stale bytes badly enough to need deleting and re-adding, and
 * the sync protocol assumes the app is one consistent artifact. Concatenating
 * keeps the deploy atomic: you get the whole new app or the whole old one.
 *
 * The point is that SOURCE is split and testable, not that the shipped file
 * is smaller. Runtime behaviour is byte-identical to hand-pasting.
 *
 *   node build.mjs           inline and write index.html
 *   node build.mjs --check   verify index.html matches src/ (exit 1 if not)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INDEX = path.join(HERE, "index.html");
const MODULES = ["tdee-core.js"];

const begin = (n) => `/* ==BUILD:${n}== */`;
const end = (n) => `/* ==BUILD-END:${n}== */`;

let html = fs.readFileSync(INDEX, "utf8");
let changed = false;

for (const name of MODULES) {
  const src = fs.readFileSync(path.join(HERE, "src", name), "utf8").trimEnd();
  const b = begin(name), e = end(name);
  const bi = html.indexOf(b), ei = html.indexOf(e);
  if (bi < 0 || ei < 0) { console.error(`missing markers for ${name} in index.html`); process.exit(2); }
  if (ei < bi) { console.error(`markers out of order for ${name}`); process.exit(2); }
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
