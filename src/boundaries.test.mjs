/* Dependency-boundary gate — ALL modules classified (review round-4 ruling 8).
 *
 * Every authoritative source module is assigned its permission set, derived
 * from its actual usage at the freeze and pinned as the TIGHTEST class that
 * passes. The gate fails when:
 *   - a module uses an API class outside its pinned set (boundary regression);
 *   - a src/*.js file exists that is not classified here;
 *   - a classified module is missing from src/ or from build.mjs MODULES;
 * so the manifest, the directory, and the build can never disagree.
 *
 * Probes are DIRECT API usage (document.x, fetch(, localStorage/indexedDB).
 * Transitive calls through app functions are by design not flagged — the gate
 * pins architectural direction, not call graphs.
 *
 *   node src/boundaries.test.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let P = 0, F = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); c ? P++ : F++; };

const strip = (s) => s.replace(/\/\*[^]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const probes = {
  dom: /\bdocument\.[a-z_$]|\bwindow\.document\b/,
  net: /\bfetch\s*\(|XMLHttpRequest|WebSocket\b/,
  storage: /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/,
};

/* The authoritative manifest: module -> allowed API classes (tightest at freeze). */
const MANIFEST = {
  "app-core.js":              [],
  "icons.js":                 [],
  "lifting-model.js":         [],
  "macro-core.js":            [],
  "mp-calc.js":               [],
  "photo-frame.js":           [],
  "report-srview.js":         [],
  "tdee-core.js":             [],
  "tdee-proposal.js":         [],
  "trend-core.js":            [],
  "report-progress.js":       ["dom"],
  "views-weight-summary.js":  ["dom"],
  "lightbox-boot.js":         ["dom", "storage"],
  "m10-displaced.js":         ["dom", "storage"],
  "m10-gate-wiring.js":       ["dom", "storage"],
  "render-events.js":         ["dom", "storage"],
  "sr-photos.js":             ["dom", "storage"],
  "state-glp-calc.js":        ["dom", "storage"],
  "pb-adapter.js":            ["net", "storage"],
  "m10-photoq.js":            ["dom", "net"],
  "m10-lease-core.js":        ["dom", "net", "storage"],
  "m8-sync.js":               ["dom", "net", "storage"],
  "pb-health-login.js":       ["dom", "net", "storage"],
  "photos-workout.js":        ["dom", "net", "storage"],
  "ratings-checkin-coach.js": ["dom", "net", "storage"],
  "recovery-update.js":       ["dom", "net", "storage"],
};

/* 1. manifest == directory listing */
const onDisk = fs.readdirSync(HERE).filter((f) => f.endsWith(".js"));
const unclassified = onDisk.filter((f) => !(f in MANIFEST));
const missing = Object.keys(MANIFEST).filter((f) => !onDisk.includes(f));
ok(unclassified.length === 0, "every src/*.js is classified" + (unclassified.length ? " — unclassified: " + unclassified : ""));
ok(missing.length === 0, "every classified module exists" + (missing.length ? " — missing: " + missing : ""));

/* 2. manifest == build.mjs MODULES (generated modules excepted by name) */
const build = fs.readFileSync(path.join(HERE, "..", "build.mjs"), "utf8");
const declared = [...build.matchAll(/\{ name: "([^"]+)"/g)].map((m) => m[1]);
const generated = ["max-avatars.js"];
const buildOnly = declared.filter((n) => !generated.includes(n) && !(n in MANIFEST));
const manifestOnly = Object.keys(MANIFEST).filter((n) => !declared.includes(n));
ok(buildOnly.length === 0, "every built module is classified" + (buildOnly.length ? " — " + buildOnly : ""));
ok(manifestOnly.length === 0, "every classified module is built" + (manifestOnly.length ? " — " + manifestOnly : ""));

/* 3. no module exceeds its pinned set */
for (const [file, allowed] of Object.entries(MANIFEST)) {
  const src = strip(fs.readFileSync(path.join(HERE, file), "utf8"));
  for (const cls of Object.keys(probes)) {
    if (allowed.includes(cls)) continue;
    const m = probes[cls].exec(src);
    ok(!m, `${file} stays out of ${cls}` + (m ? ` — found "${m[0]}"` : ""));
  }
}

console.log(`\n${P} passed, ${F} failed`);
process.exit(F ? 1 : 0);
