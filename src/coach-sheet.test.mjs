/* Coach sheet render test — the TDEE message surface, in a real browser.
 *
 * The coach can generate a perfect explanation and the member still never sees
 * it if the client drops the row, hides the badge, or throws while rendering.
 * That gap is invisible to any server-side test, so it is checked here against
 * the real index.html.
 *
 * Usage: node src/coach-sheet.test.mjs
 */
import { chromium } from "/home/griffin/staging-cas/node_modules/playwright/index.mjs";
import path from "node:path";
import http from "node:http";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, (req.url || "/").split("?")[0] === "/" ? "index.html" : (req.url || "").split("?")[0]);
  fs.readFile(p, (e, b) => e ? (res.writeHead(404), res.end()) : (res.writeHead(200, { "Content-Type": "text/html" }), res.end(b)));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const FILE = "http://127.0.0.1:" + server.address().port + "/";

let P = 0, F = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); c ? P++ : F++; };
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });

const TDEE_TEXT = "Your metabolism finally has enough data to measure properly.";
const WEEKLY_TEXT = "Solid week overall, and the trend is going the right way.";

await page.addInitScript(([tdeeText, weeklyText]) => {
  localStorage.setItem("wl_v1", JSON.stringify({
    settings: { units: "lbs", weekStart: "1", targetCalories: "2000" },
    weights: [], food: {}, steps: {}, sleep: {}, workouts: {}, notes: {},
    statuses: [], checkins: {}, ratings: {}, skips: {}, presets: [], glp: {},
  }));
  /* Seed the report cache exactly as fetchCoachReports writes it, so this
     tests the render path without needing a live PocketBase. */
  localStorage.setItem("wl_coach_reports", JSON.stringify({
    weekly: { week: "2026-08-03", text: weeklyText, mood: "thumbsup",
              generated: "2026-08-03T09:00:00.000Z" },
    nightly: {},
    tdee: { period: "2026-08-05", text: tdeeText, mood: "clapping",
            tdee: 3120, status: "provisional", windowDays: 14, reason: "first",
            generated: "2026-08-05T21:23:11.000Z" },
  }));
}, [TDEE_TEXT, WEEKLY_TEXT]);

await page.goto(FILE, { waitUntil: "load" });
await page.waitForTimeout(900);

/* 1. The cache round-trips and the accessor finds it. */
const acc = await page.evaluate(() => {
  try {
    coachRptLoad();
    const t = coachTdee();
    return { text: t && t.text, unread: coachUnreadT(), period: t && t.period };
  } catch (e) { return { threw: e.message }; }
});
ok(!acc.threw, "coachTdee/coachUnreadT do not throw" + (acc.threw ? " — " + acc.threw : ""));
ok(acc.text === TDEE_TEXT, "the TDEE report is read back from the cache");
ok(acc.unread === true, "an unseen report reads as unread");

/* 2. It renders, and leads while unread — that IS the push. */
const sheet = await page.evaluate(() => {
  try {
    coachRptLoad();
    state.settings.seenTdee = null;
    state.maxOpen = true;
    return { html: maxSheetHTML() };
  } catch (e) { return { threw: e.message }; }
});
ok(!sheet.threw, "maxSheetHTML does not throw with a TDEE report present" + (sheet.threw ? " — " + sheet.threw : ""));
const html = sheet.html || "";
ok(html.indexOf(TDEE_TEXT) >= 0, "the TDEE message body is rendered");
ok(html.indexOf(WEEKLY_TEXT) >= 0, "the weekly check-in is still rendered alongside it");
ok(html.indexOf("measured metabolism") >= 0, "the TDEE section has its own heading");
ok(html.indexOf("3120 cal/day") >= 0, "the headline number appears in the subheading");
ok(html.indexOf("wl-newpill") >= 0, "an unread TDEE report shows a New pill");
ok(html.indexOf(TDEE_TEXT) < html.indexOf(WEEKLY_TEXT), "the newer message (TDEE, Aug 5) leads the older weekly (Aug 3)");
/* Two max:close targets is correct: the backdrop (tap outside to dismiss)
   and the button. Assert on the BUTTON class, which is the one that could
   get duplicated by adding a section header. */
ok((html.match(/wl-maxx/g) || []).length === 1, "exactly one close button");
ok(html.indexOf("wl-maxsheet plain") < 0, "a sheet with messages does not get the empty-state styling");

/* 3. Once seen, it stops shouting and drops below the weekly. */
const seen = await page.evaluate(() => {
  coachRptLoad();
  /* Mark BOTH seen. The unified renderer now flags any unread message, so
     leaving the weekly unread would leave a pill on the sheet and mask what
     this case is actually asserting about the TDEE one. */
  state.settings.seenTdee = "2026-08-05";
  state.settings.seenWeekly = "2026-08-03";
  state.maxOpen = true;
  return { html: maxSheetHTML(), unread: coachUnreadT() };
});
ok(seen.unread === false, "marking the period seen clears unread");
ok(seen.html.indexOf("wl-newpill") < 0, "a read report shows no New pill");
ok(seen.html.indexOf(TDEE_TEXT) < seen.html.indexOf(WEEKLY_TEXT), "order is by recency, NOT by unread — reading it does not demote it");
ok(seen.html.indexOf(TDEE_TEXT) >= 0, "a read report is still readable, not hidden");

/* 3b. A weekly written LATER must outrank an older TDEE. Sorting on the
   week-start date instead of `generated` would get this backwards. */
const wkNewer = await page.evaluate(() => {
  localStorage.setItem("wl_coach_reports", JSON.stringify({
    weekly: { week: "2026-08-03", text: "WEEKLY-NEWER", mood: "thumbsup", generated: "2026-08-08T09:00:00.000Z" },
    nightly: {},
    tdee: { period: "2026-08-05", text: "TDEE-OLDER", mood: "clapping", tdee: 3120, generated: "2026-08-05T21:00:00.000Z" },
  }));
  coachRptLoad(); state.maxOpen = true; return maxSheetHTML();
});
ok(wkNewer.indexOf("WEEKLY-NEWER") < wkNewer.indexOf("TDEE-OLDER"),
   "a weekly generated after the TDEE report leads it, despite an earlier week-start date");

/* 4. A NEWER calculation must re-flag as unread. */
const renew = await page.evaluate(() => {
  const c = JSON.parse(localStorage.getItem("wl_coach_reports"));
  c.tdee = { period: "2026-08-12", text: "Updated read on your metabolism.", mood: "thumbsup", tdee: 3010, status: "reliable" };
  localStorage.setItem("wl_coach_reports", JSON.stringify(c));
  coachRptLoad();
  state.settings.seenTdee = "2026-08-05";
  return coachUnreadT();
});
ok(renew === true, "a newer calculation re-flags as unread even after the old one was read");

/* 4b. TDEE-only, before any weekly exists — must still look like a message. */
const tdeeOnly = await page.evaluate(() => {
  localStorage.setItem("wl_coach_reports", JSON.stringify({ weekly: null, nightly: {},
    tdee: { period: "2026-08-05", text: "First read on your metabolism.", mood: "clapping", tdee: 3120 } }));
  coachRptLoad(); state.settings.seenTdee = null; state.maxOpen = true;
  return maxSheetHTML();
});
ok(tdeeOnly.indexOf("First read on your metabolism.") >= 0, "a TDEE-only sheet renders the message");
ok(tdeeOnly.indexOf("wl-maxsheet plain") < 0, "a TDEE-only sheet is not styled as empty");
ok(tdeeOnly.indexOf("No messages yet") < 0, "a TDEE-only sheet does not claim there are no messages");

/* 5. Absence must be safe — the common case before the first calculation. */
const none = await page.evaluate(() => {
  try {
    localStorage.setItem("wl_coach_reports", JSON.stringify({ weekly: null, nightly: {} }));
    coachRptLoad();
    state.maxOpen = true;
    return { html: maxSheetHTML(), unread: coachUnreadT(), t: coachTdee() };
  } catch (e) { return { threw: e.message }; }
});
ok(!none.threw, "a cache with no tdee key at all does not throw" + (none.threw ? " — " + none.threw : ""));
ok(none.t === null, "coachTdee returns null when absent");
ok(none.unread === false, "absence is not unread");
ok(typeof none.html === "string" && none.html.length > 0, "the sheet still renders its empty state");

await browser.close();
await new Promise(r => server.close(r));

if (errors.length) { console.log("\nUNCAUGHT:"); [...new Set(errors)].forEach(e => console.log("  " + e)); F += errors.length; }
console.log(`\n${P} passed, ${F} failed`);
process.exit(F ? 1 : 0);
