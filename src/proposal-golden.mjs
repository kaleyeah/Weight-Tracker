/* Golden master for tdeeAnalysis() — the Progress tab's recommendation.
 *
 * Run BEFORE extracting the proposal logic into a shared module, then again
 * after. The outputs must be identical. This is the guard against a repeat of
 * the TDEE refactor that silently killed the Progress tab: a pure-refactor
 * claim is only worth anything if something actually compared the before and
 * after.
 *
 *   node src/proposal-golden.mjs --write    capture the golden file
 *   node src/proposal-golden.mjs            compare against it
 */
import { chromium } from "/home/griffin/staging-cas/node_modules/playwright/index.mjs";
import path from "node:path";
import http from "node:http";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const GOLDEN = path.join(HERE, "fixtures", "proposal-golden.json");
const WRITE = process.argv.includes("--write");

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, (req.url || "/").split("?")[0] === "/" ? "index.html" : (req.url || "").split("?")[0]);
  fs.readFile(p, (e, b) => e ? (res.writeHead(404), res.end()) : (res.writeHead(200, { "Content-Type": "text/html" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const FILE = "http://127.0.0.1:" + server.address().port + "/";

/* Scenarios chosen to land on EVERY branch of tdeeAnalysis: gathering, ok,
   comply, cooldown, toofast, propose, and the maintain variants — plus the
   protein/floor clamps inside tdeeBuildProp. */
const BASE = { units: "lbs", sex: "male", heightIn: 70, age: 40, activity: "1.5",
               weekStart: "1", targetProtein: "175", stepsGoal: "8000", cardioMinGoal: "60" };
const SCEN = [
  ["lose-pct-target",   { strategy: "lose", targetCalories: "2150", targetType: "percent_bw_per_week", targetValue: ".85" }, -0.34, 1815],
  ["lose-on-pace",      { strategy: "lose", targetCalories: "2000", targetType: "lbs_per_week", targetValue: "1" }, -0.1429, 1900],
  ["lose-too-fast",     { strategy: "lose", targetCalories: "2000", targetType: "lbs_per_week", targetValue: "1" }, -0.4286, 1700],
  ["lose-too-slow",     { strategy: "lose", targetCalories: "2000", targetType: "lbs_per_week", targetValue: "1" }, -0.0286, 1950],
  ["lose-noncompliant", { strategy: "lose", targetCalories: "1800", targetType: "lbs_per_week", targetValue: "1" }, -0.0286, 2300],
  ["lose-no-target",    { strategy: "lose", targetCalories: "", targetType: "lbs_per_week", targetValue: "1" }, -0.2, 1900],
  ["lose-no-rate",      { strategy: "lose", targetCalories: "2000", targetType: "lbs_per_week", targetValue: "" }, -0.2, 1900],
  ["lose-floor-clamp",  { strategy: "lose", targetCalories: "1850", targetType: "lbs_per_week", targetValue: "2.5" }, -0.05, 1800],
  ["lose-cooldown",     { strategy: "lose", targetCalories: "2000", targetType: "lbs_per_week", targetValue: "1", tdeeApplied: "TODAY" }, -0.4286, 1700],
  ["lose-snoozed",      { strategy: "lose", targetCalories: "2000", targetType: "lbs_per_week", targetValue: "1", tdeeSnooze: "TODAY" }, -0.4286, 1700],
  ["lose-no-steps",     { strategy: "lose", targetCalories: "2000", targetType: "lbs_per_week", targetValue: "1", stepsGoal: "", cardioMinGoal: "" }, -0.0286, 1950],
  ["maintain-ok",       { strategy: "maintain", targetCalories: "2400", targetType: "lbs_per_week", targetValue: "1" }, -0.0143, 2400],
  ["maintain-drifting", { strategy: "maintain", targetCalories: "2400", targetType: "lbs_per_week", targetValue: "1" }, -0.1429, 2300],
  ["maintain-gaining",  { strategy: "maintain", targetCalories: "2400", targetType: "lbs_per_week", targetValue: "1" }, 0.1429, 2600],
  ["gain-on-pace",      { strategy: "gain", targetCalories: "2900", targetType: "lbs_per_week", targetValue: "0.5" }, 0.0714, 2900],
  ["gain-too-fast",     { strategy: "gain", targetCalories: "2900", targetType: "lbs_per_week", targetValue: "0.5" }, 0.2143, 3100],
  ["gain-too-slow",     { strategy: "gain", targetCalories: "2900", targetType: "lbs_per_week", targetValue: "0.5" }, 0.0143, 2850],
  ["gain-undereating",  { strategy: "gain", targetCalories: "3000", targetType: "lbs_per_week", targetValue: "0.5" }, 0.0143, 2600],
  ["kg-lose-too-fast",  { strategy: "lose", units: "kg", targetCalories: "2000", targetType: "kg_per_week", targetValue: "0.5" }, -0.2, 1700],
  ["pct-bw-too-slow",   { strategy: "lose", targetCalories: "2200", targetType: "percent_bw_per_week", targetValue: "1.0" }, -0.0286, 2150],
  ["gathering-nodata",  { strategy: "lose", targetCalories: "2000", targetType: "lbs_per_week", targetValue: "1" }, -0.2, 1900, 5],
];

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", e => errors.push(e.message));
await page.goto(FILE, { waitUntil: "load" });
await page.waitForTimeout(900);

const results = {};
for (const [name, over, slopePerDay, cals, days] of SCEN) {
  const out = await page.evaluate(([name, over, slopePerDay, cals, days, BASE]) => {
    const n = days || 30;
    const pad = x => String(x).padStart(2, "0");
    const iso = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    const today = new Date();
    const weights = [], food = {};
    /* Perfectly linear weights => the OLS slope is exactly slopePerDay, so a
       scenario's rate is what it claims rather than approximately so. */
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      weights.push({ date: iso(d), weight: +(190 + slopePerDay * (n - 1 - i)).toFixed(4) });
      food[iso(d)] = { calories: cals, protein: 175 };
    }
    const s = Object.assign({}, BASE, over);
    for (const k of ["tdeeApplied", "tdeeSnooze"]) if (s[k] === "TODAY") s[k] = iso(today);
    state.settings = s;
    state.weights = weights; state.food = food;
    state.statuses = []; state.skips = {};
    try {
      const a = tdeeAnalysis();
      /* `win` carries the whole core result and a lot of incidental detail;
         the golden compares the DECISION surface, which is what tdeeAnalysis
         itself contributes on top of the core. */
      return { state: a.state, targetRate: a.targetRate, gapDay: a.gapDay, over: a.over,
               rate: a.rate, tdee: a.tdee, intake: a.intake, status: a.status,
               prop: a.prop || null };
    } catch (e) { return { THREW: e.message }; }
  }, [name, over, slopePerDay, cals, days, BASE]);
  results[name] = out;
}

await browser.close();
await new Promise(r => server.close(r));

if (errors.length) { console.error("uncaught page errors:\n  " + [...new Set(errors)].join("\n  ")); process.exit(1); }
const threw = Object.entries(results).filter(([, v]) => v.THREW);
if (threw.length) { console.error("scenarios threw:"); threw.forEach(([k, v]) => console.error("  " + k + ": " + v.THREW)); process.exit(1); }

if (WRITE) {
  fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
  fs.writeFileSync(GOLDEN, JSON.stringify(results, null, 1));
  console.log("wrote golden: " + Object.keys(results).length + " scenarios");
  const states = {};
  for (const [k, v] of Object.entries(results)) (states[v.state] = states[v.state] || []).push(k);
  console.log("branch coverage:");
  for (const [st, ks] of Object.entries(states)) console.log("  " + st + ": " + ks.length + "  (" + ks.join(", ") + ")");
  process.exit(0);
}

const want = JSON.parse(fs.readFileSync(GOLDEN, "utf8"));
let P = 0, F = 0;
for (const k of Object.keys(want)) {
  const a = JSON.stringify(want[k]), b = JSON.stringify(results[k]);
  if (a === b) { P++; }
  else { F++; console.log("  DIFF  " + k + "\n    was: " + a + "\n    now: " + b); }
}
for (const k of Object.keys(results)) if (!(k in want)) { F++; console.log("  NEW   " + k + " not in golden"); }
console.log(`\n${P} identical, ${F} changed`);
process.exit(F ? 1 : 0);
