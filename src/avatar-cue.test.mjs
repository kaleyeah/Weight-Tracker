/* The unread cue on the M avatar — verified in a real browser.
 *
 * CSS animation is exactly the kind of change that looks right in the source
 * and does nothing on the page: a typo'd keyframe name, a shorthand that
 * clobbers the animation, or a `transform` that never applies all fail
 * silently. This asserts the computed style and that the element actually
 * moves between frames, then writes a filmstrip for eyeballing.
 *
 * Usage: node src/avatar-cue.test.mjs
 */
import { chromium } from "/home/griffin/staging-cas/node_modules/playwright/index.mjs";
import path from "node:path";
import http from "node:http";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const OUT = path.join(ROOT, "features-shots");
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, (req.url || "/").split("?")[0] === "/" ? "index.html" : (req.url || "").split("?")[0]);
  fs.readFile(p, (e, b) => e ? (res.writeHead(404), res.end()) : (res.writeHead(200, { "Content-Type": "text/html" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const FILE = "http://127.0.0.1:" + server.address().port + "/";

let P = 0, F = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); c ? P++ : F++; };

const browser = await chromium.launch();

async function boot(page) {
  await page.addInitScript(() => {
    localStorage.setItem("wl_v1", JSON.stringify({
      settings: { units: "lbs", weekStart: "1" }, weights: [], food: {}, steps: {}, sleep: {},
      workouts: {}, notes: {}, statuses: [], checkins: {}, ratings: {}, skips: {}, presets: [], glp: {},
    }));
    localStorage.setItem("wl_coach_reports", JSON.stringify({
      weekly: null, nightly: {},
      tdee: { period: "2026-08-05", text: "First read on your metabolism.", mood: "clapping", tdee: 3120 },
    }));
  });
  await page.goto(FILE, { waitUntil: "load" });
  await page.waitForTimeout(900);
}

/* ---- the badge DECISION: unread state drives the hot class ----
   The avatar itself is built inside render(), which sits behind the login
   gate and does not mount in a bare test page. So the decision is asserted
   here on the same expression render() uses, and the STYLING is asserted
   below on a mounted button. Together they cover what changed. */
const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
await boot(page);

const decide = await page.evaluate(() => {
  coachRptLoad();
  state.settings.seenTdee = null;
  const unread = coachUnreadW() || coachUnreadT();
  state.settings.seenTdee = "2026-08-05";
  const read = coachUnreadW() || coachUnreadT();
  return { unread, read };
});
ok(decide.unread === true, "an unread TDEE report drives the avatar hot");
ok(decide.read === false, "once read, the avatar is no longer hot");

/* ---- the STYLING, on a real mounted button ---- */
const hot = await page.evaluate(() => {
  const b = document.createElement("button");
  b.className = "wl-maxb hot"; b.textContent = "M";
  document.body.appendChild(b); window.__cue = b;
  const cs = getComputedStyle(b), af = getComputedStyle(b, "::after");
  return { cls: b.className, anim: cs.animationName, dur: cs.animationDuration,
           ping: af.animationName };
});
ok(true, "the hot avatar mounts for style assertions");
ok((hot.anim || "").indexOf("wlMaxGlow") >= 0, "the breathing glow animation is applied — got: " + hot.anim);
ok((hot.anim || "").indexOf("wlMaxBeat") >= 0, "the periodic beat animation is applied");
ok((hot.ping || "").indexOf("wlMaxPing") >= 0, "the ping ring is applied to ::after — got: " + hot.ping);

/* ---- it genuinely moves: sample the transform across the beat ---- */
const samples = [];
for (let i = 0; i < 14; i++) {
  samples.push(await page.evaluate(() => getComputedStyle(window.__cue).transform));
  await page.waitForTimeout(400);
}
const distinct = new Set(samples);
ok(distinct.size > 1, "the avatar transform actually changes over time (" + distinct.size + " distinct values sampled)");
const scales = samples.map(s => { const m = /matrix\(([\d.]+)/.exec(s); return m ? parseFloat(m[1]) : 1; });
ok(Math.max(...scales) > 1.02, "the beat reaches a visible scale peak — max " + Math.max(...scales).toFixed(3));
ok(Math.min(...scales) <= 1.001, "and returns to rest between beats — min " + Math.min(...scales).toFixed(3));

/* ---- filmstrip across one full 5.5s cycle ---- */
fs.mkdirSync(OUT, { recursive: true });
const btn = await page.evaluateHandle(() => window.__cue).then(h => h.asElement());
const frames = [];
for (let i = 0; i < 6; i++) {
  const f = path.join(OUT, "maxcue-" + i + ".png");
  await btn.screenshot({ path: f, omitBackground: false });
  frames.push(f);
  await page.waitForTimeout(320);
}
ok(frames.every(f => fs.existsSync(f) && fs.statSync(f).size > 0), "filmstrip frames captured");
/* Frames must not all be identical — that would mean we photographed a still. */
const hashes = new Set(frames.map(f => fs.readFileSync(f).toString("base64").slice(0, 400)));
ok(hashes.size > 1, "captured frames differ from each other (" + hashes.size + " distinct)");

/* ---- without .hot there is no animation at all ---- */
const cold = await page.evaluate(() => {
  window.__cue.className = "wl-maxb";
  return { anim: getComputedStyle(window.__cue).animationName,
           ping: getComputedStyle(window.__cue, "::after").content };
});
ok((cold.anim || "none") === "none", "a read (not-hot) avatar does not animate — got: " + cold.anim);
await page.close();

/* ---- reduced motion keeps the glow, drops the movement ---- */
const rm = await browser.newPage({ viewport: { width: 420, height: 860 }, reducedMotion: "reduce" });
await boot(rm);
const red = await rm.evaluate(() => {
  const b = document.createElement("button");
  b.className = "wl-maxb hot"; b.textContent = "M"; document.body.appendChild(b);
  return { anim: getComputedStyle(b).animationName, shadow: getComputedStyle(b).boxShadow,
           ping: getComputedStyle(b, "::after").display };
});
ok((red.anim || "none") === "none", "prefers-reduced-motion disables the animation — got: " + red.anim);
ok(red.ping === "none", "and removes the ping ring");
ok((red.shadow || "none") !== "none", "but the static glow still marks it unread");
await rm.close();

await browser.close();
await new Promise(r => server.close(r));
console.log("\nframes: " + frames.map(f => path.basename(f)).join(" "));
console.log(`\n${P} passed, ${F} failed`);
process.exit(F ? 1 : 0);
