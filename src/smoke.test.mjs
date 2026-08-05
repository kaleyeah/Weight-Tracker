/* Render smoke test — loads the REAL index.html in a real browser and walks
 * every tab, failing on any uncaught error.
 *
 * WHY. Moving the TDEE maths into src/tdee-core.js deleted a `var cpu = ...`
 * whose remaining uses sat further down the same function. The file parsed
 * fine and shipped; the ReferenceError fired only at render time and killed
 * the entire Progress tab. `node --check` cannot see that class of bug, and a
 * hand-rolled identifier linter was too noisy to trust. Actually rendering it
 * catches it in one line.
 *
 * Usage: node src/smoke.test.mjs
 */
import { chromium } from "/home/griffin/staging-cas/node_modules/playwright/index.mjs";
import path from "node:path";
import http from "node:http";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
/* served over HTTP, not file:// — the app fetches its own URL to check for
   updates, and the file: scheme rejects that with an error that masks real
   ones. Serve it the way it actually ships. */
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, (req.url || "/").split("?")[0] === "/" ? "index.html" : (req.url || "").split("?")[0]);
  fs.readFile(p, (e, b) => e ? (res.writeHead(404), res.end()) : (res.writeHead(200, { "Content-Type": "text/html" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const FILE = "http://127.0.0.1:" + server.address().port + "/";

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });

/* Seed enough state that the metabolism card actually renders — it returns
   early unless a calorie target or maintenance estimate exists. */
await page.addInitScript(() => {
  const days = [], today = new Date();
  const iso = d => d.toISOString().slice(0, 10);
  const food = {}, weights = [];
  for (let i = 20; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    food[iso(d)] = { calories: 2000, protein: 150 };
    weights.push({ date: iso(d), weight: 190 - i * 0.1 });
  }
  localStorage.setItem("wl_v1", JSON.stringify({
    settings: { units: "lbs", sex: "male", heightIn: 70, age: 40, activity: "1.5",
                targetCalories: "2000", goalWeight: "175", weekStart: "1", strategy: "lose",
                targetType: "lbs_per_week", targetValue: "1" },
    weights, food, steps: {}, sleep: {}, workouts: {}, notes: {}, statuses: [],
    checkins: {}, ratings: {}, skips: {}, presets: [], glp: {},
  }));
});

await page.goto(FILE, { waitUntil: "load" });
await page.waitForTimeout(900);

/* The render functions ARE the tab bodies; calling them directly is more
   reliable than hunting nav selectors, and it is where the failure lives. */
const views = ["view_overview", "view_weight", "view_summary", "view_train", "view_settings"];
const visited = [];
for (const v of views) {
  const r = await page.evaluate((name) => {
    try { const f = window[name]; if (typeof f !== "function") return "absent";
          const out = f(); return "ok " + String(out == null ? 0 : out.length) + " chars"; }
    catch (e) { return "THREW: " + e.message; }
  }, v);
  visited.push(`${v}: ${r}`);
  if (String(r).startsWith("THREW")) errors.push(`${v} ${r}`);
}

/* The specific regression: metabolismCardHTML() threw "cpu is not defined"
   after the TDEE refactor, killing the Progress tab. Verified this assertion
   fails with the bug reinstated and passes with the fix. */
const metab = await page.evaluate(() => {
  try { return typeof metabolismCardHTML === "function" ? metabolismCardHTML().length : -1; }
  catch (e) { return "THREW: " + e.message; }
});
if (typeof metab === "number" && metab < 200) errors.push("metabolismCardHTML rendered only " + metab + " chars — expected the full card");

await browser.close();
await new Promise(r => server.close(r));

console.log("tab walk:");
visited.forEach(v => console.log("  " + v));
console.log("metabolismCardHTML(): " + metab);
if (typeof metab === "string" && metab.startsWith("THREW")) errors.push("metabolismCardHTML " + metab);
if (errors.length) {
  console.log("\nERRORS:");
  [...new Set(errors)].forEach(e => console.log("  " + e));
  console.log(`\n${errors.length} error(s)`);
  process.exit(1);
}
console.log("\nno uncaught errors");
