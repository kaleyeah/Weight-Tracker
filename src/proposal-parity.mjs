/* Parity: the COACH's inputs must reproduce the BROWSER's numbers.
 *
 * Two things can silently diverge and change the recommendation without any
 * test noticing: the shared proposal module drifting between the two copies,
 * and the coach's currentWeightAvg() differing from the app's (it drives the
 * percent-of-bodyweight target rate, which is what the owner actually uses).
 * Both are pinned here against the real page.
 *
 * Usage: node src/proposal-parity.mjs
 */
import { chromium } from "/home/griffin/staging-cas/node_modules/playwright/index.mjs";
import path from "node:path";
import http from "node:http";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const COACH = "/home/griffin/projects/compound/tools";
let P = 0, F = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); c ? P++ : F++; };

/* 1. the shared module must be byte-identical on both sides */
const h = f => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
ok(h(path.join(HERE, "tdee-proposal.js")) === h(path.join(COACH, "tdee-proposal.cjs")),
   "coach's tdee-proposal is byte-identical to the app's");
ok(h(path.join(HERE, "tdee-core.js")) === h(path.join(COACH, "tdee-core.cjs")),
   "coach's tdee-core is byte-identical to the app's");

/* 2. the coach's currentWeightAvg must equal the browser's */
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, (req.url || "/").split("?")[0] === "/" ? "index.html" : (req.url || "").split("?")[0]);
  fs.readFile(p, (e, b) => e ? (res.writeHead(404), res.end()) : (res.writeHead(200, { "Content-Type": "text/html" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://127.0.0.1:" + server.address().port + "/", { waitUntil: "load" });
await page.waitForTimeout(900);

/* the coach's implementation, copied from tdee-checkin.mjs */
function coachCWA(weights) {
  const sw = (weights || []).filter(w => w && w.date && isFinite(Number(w.weight)))
    .slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (!sw.length) return null;
  const ts = d => Date.parse(d + "T00:00:00Z");
  const last = ts(sw[sw.length - 1].date), lo = last - 6 * 86400000;
  const win = sw.filter(w => ts(w.date) >= lo && ts(w.date) <= last);
  if (!win.length) return Number(sw[sw.length - 1].weight);
  return win.reduce((a, w) => a + Number(w.weight), 0) / win.length;
}

const CASES = {
  "dense 30d": (() => { const w = []; for (let i = 29; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i);
      w.push({ date: d.toISOString().slice(0, 10), weight: +(190 - i * 0.1).toFixed(2) }); } return w; })(),
  "sparse, gaps": (() => { const w = []; for (const off of [30, 24, 17, 9, 5, 4, 1, 0]) { const d = new Date(); d.setDate(d.getDate() - off);
      w.push({ date: d.toISOString().slice(0, 10), weight: +(188 + (off % 3) * 0.4).toFixed(2) }); } return w; })(),
  "single reading": (() => { const d = new Date(); return [{ date: d.toISOString().slice(0, 10), weight: 186.4 }]; })(),
  "one old reading": (() => { const d = new Date(); d.setDate(d.getDate() - 40); return [{ date: d.toISOString().slice(0, 10), weight: 195 }]; })(),
};

for (const [name, weights] of Object.entries(CASES)) {
  const browserVal = await page.evaluate((w) => {
    state.weights = w; return currentWeightAvg();
  }, weights);
  const coachVal = coachCWA(weights);
  const same = Math.abs((browserVal ?? 0) - (coachVal ?? 0)) < 1e-9;
  ok(same, `currentWeightAvg parity — ${name}: browser ${browserVal} vs coach ${coachVal}`);
}

await browser.close();
await new Promise(r => server.close(r));
console.log(`\n${P} passed, ${F} failed`);
process.exit(F ? 1 : 0);
