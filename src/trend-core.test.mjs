/* Unit tests for trend-core.js — the pure W/M/6M measurement-trend math.
   Every expectation is independent arithmetic, not a re-run of the code. */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const T = require("./trend-core.js");

let passed = 0; const failures = [];
const test = (n, f) => { try { f(); passed++; console.log("  PASS  " + n); }
  catch (e) { failures.push(n); console.log("  FAIL  " + n + "\n        " + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || "eq") + ": " + JSON.stringify(a) + " !== " + JSON.stringify(b)); };
const near = (a, b, m) => { if (a == null || Math.abs(a - b) > 1e-9) throw new Error((m || "near") + ": " + a + " !== " + b); };
const ok = (v, m) => { if (!v) throw new Error(m || "expected truthy"); };

/* ---- periods ---- */
test("W: seven local dates ending on the end date, inclusive", () => {
  const p = T.tcPeriod("W", 0, "2026-08-05");
  eq(p.startISO, "2026-07-30"); eq(p.endISO, "2026-08-05");
  eq(p.prevStartISO, "2026-07-23"); eq(p.prevEndISO, "2026-07-29");
});
test("W offset 1 is the immediately preceding non-overlapping week", () => {
  const p = T.tcPeriod("W", 1, "2026-08-05");
  eq(p.startISO, "2026-07-23"); eq(p.endISO, "2026-07-29");
});
test("M: exactly 30 dates ending on the end date (Jul 7 – Aug 5)", () => {
  const p = T.tcPeriod("M", 0, "2026-08-05");
  eq(p.startISO, "2026-07-07"); eq(p.endISO, "2026-08-05");
  eq(p.prevStartISO, "2026-06-07"); eq(p.prevEndISO, "2026-07-06");
});
test("W across a year boundary", () => {
  const p = T.tcPeriod("W", 0, "2026-01-02");
  eq(p.startISO, "2025-12-27"); eq(p.endISO, "2026-01-02");
});
test("6M uses calendar months, not 180 days", () => {
  const p = T.tcPeriod("6M", 0, "2026-08-05");
  eq(p.startISO, "2026-02-06"); eq(p.endISO, "2026-08-05");
  eq(p.prevEndISO, "2026-02-05"); eq(p.prevStartISO, "2025-08-06");
});
test("calendar-month subtraction clamps Aug 31 to Feb's last day", () => {
  eq(T.tcAddMonths("2026-08-31", -6), "2026-02-28");
  eq(T.tcAddMonths("2024-08-31", -6), "2024-02-29"); /* leap */
});

/* ---- windows: no zero-fill, no interpolation ---- */
const OBS = [
  { date: "2026-08-01", value: 184.0 },
  { date: "2026-08-03", value: 182.0 },
  { date: "2026-08-05", value: 183.0 },
  { date: "2026-07-20", value: 188.0 },
];
test("window filters to range, sorts, averages only real observations", () => {
  const w = T.tcWindow(OBS, "2026-07-30", "2026-08-05");
  eq(w.count, 3); near(w.avg, (184 + 182 + 183) / 3);
  eq(w.points[0].date, "2026-08-01");
});
test("missing dates contribute nothing — 3 points over 7 days, never 7", () => {
  eq(T.tcWindow(OBS, "2026-07-30", "2026-08-05").points.length, 3);
});
test("empty window: avg null, count 0, no NaN", () => {
  const w = T.tcWindow(OBS, "2025-01-01", "2025-01-31");
  eq(w.count, 0); eq(w.avg, null);
});
test("non-finite values are excluded", () => {
  const w = T.tcWindow([{ date: "2026-08-01", value: NaN }, { date: "2026-08-02", value: 180 }], "2026-08-01", "2026-08-07");
  eq(w.count, 1); near(w.avg, 180);
});

/* ---- LBM pairing ---- */
test("LBM derives per paired same-date observation", () => {
  const lbm = T.tcLbmObs(
    [{ date: "2026-08-01", value: 200 }, { date: "2026-08-02", value: 199 }],
    [{ date: "2026-08-01", value: 25 }],  /* only Aug 1 has bf */
    []);
  eq(lbm.length, 1); near(lbm[0].value, 150); /* 200×0.75 — Aug 2 unpaired, excluded */
});
test("stored LBM wins over the derived value for its date", () => {
  const lbm = T.tcLbmObs(
    [{ date: "2026-08-01", value: 200 }],
    [{ date: "2026-08-01", value: 25 }],
    [{ date: "2026-08-01", value: 155.5 }]);
  eq(lbm.length, 1); near(lbm[0].value, 155.5);
});
test("avg(LBM) is average of per-observation LBM, not avgW×avgBF", () => {
  /* w=200,bf=20 → 160 ; w=180,bf=30 → 126 ; per-obs avg = 143
     avgW×(1−avgBF) = 190×0.75 = 142.5 — the WRONG number */
  const lbm = T.tcLbmObs(
    [{ date: "2026-08-01", value: 200 }, { date: "2026-08-02", value: 180 }],
    [{ date: "2026-08-01", value: 20 }, { date: "2026-08-02", value: 30 }], []);
  const w = T.tcWindow(lbm, "2026-08-01", "2026-08-07");
  near(w.avg, 143);
});

/* ---- month buckets ---- */
test("6M buckets group by calendar month; empty months get NO bucket", () => {
  const obs = [
    { date: "2026-03-10", value: 190 }, { date: "2026-03-20", value: 188 },
    { date: "2026-06-01", value: 185 },
  ];
  const b = T.tcMonthBuckets(obs, "2026-02-06", "2026-08-05");
  eq(b.length, 2);
  eq(b[0].key, "2026-03"); near(b[0].avg, 189); eq(b[0].count, 2);
  eq(b[1].key, "2026-06"); near(b[1].avg, 185);
});
test("buckets clip to the window (obs outside never counted)", () => {
  const b = T.tcMonthBuckets([{ date: "2026-02-01", value: 999 }, { date: "2026-02-10", value: 191 }], "2026-02-06", "2026-08-05");
  eq(b.length, 1); near(b[0].avg, 191);
});

/* ---- comparisons and copy ---- */
const cur3 = { count: 3, avg: 182.8 }, prev3 = { count: 3, avg: 186.2 };
test("comparison delta and pct", () => {
  const c = T.tcCompare(cur3, prev3, 3);
  eq(c.kind, "ok"); near(c.delta, -3.4000000000000057, "delta"); ok(c.pct < 0);
});
test("below-threshold counts yield 'insufficient', not a weak claim", () => {
  eq(T.tcCompare({ count: 2, avg: 180 }, prev3, 3).kind, "insufficient");
  eq(T.tcCompare(cur3, { count: 1, avg: 180 }, 3).kind, "insufficient");
});
test("no prior data: current average shown, comparison omitted", () => {
  eq(T.tcCompare(cur3, { count: 0, avg: null }, 3).kind, "no-prior");
});
test("empty current period", () => {
  eq(T.tcCompare({ count: 0, avg: null }, prev3, 3).kind, "empty");
});
test("zero prior average cannot divide", () => {
  const c = T.tcCompare({ count: 7, avg: 1 }, { count: 7, avg: 0 }, 3);
  eq(c.kind, "ok"); eq(c.pct, null);
});
const WCFG = { label: "Weight", labelLower: "weight", unit: "lb", dec: 1, pp: false };
const BFCFG = { label: "Body fat", labelLower: "body fat", unit: "%", dec: 1, pp: true };
test("week summary sentence matches the spec example shape", () => {
  const s = T.tcSummary(WCFG, "W", cur3, prev3, T.tcCompare(cur3, prev3, 3));
  eq(s, "Your average weight this week (182.8 lb) was below your previous 7-day average of 186.2 lb.");
});
test("insufficient copy", () => {
  const s = T.tcSummary(WCFG, "W", { count: 2, avg: 182.8 }, prev3, { kind: "insufficient" });
  eq(s, "Your average weight this week was 182.8 lb. Keep recording to unlock a reliable comparison.");
});
test("body fat uses percentage points, never 'a 4.5% loss'", () => {
  const cur = { count: 7, avg: 21 }, prev = { count: 7, avg: 22 };
  const s = T.tcSummary(BFCFG, "M", cur, prev, T.tcCompare(cur, prev, 7));
  ok(/1\.0 percentage point/.test(s), s);
  ok(!/4\.5/.test(s), s);
});
test("badge for body fat is in points, no percent", () => {
  const b = T.tcBadge(BFCFG, "M", T.tcCompare({ count: 7, avg: 21 }, { count: 7, avg: 22 }, 7));
  eq(b.text, "1.0 pt vs. prior month"); eq(b.dir, "down"); eq(b.arrow, "▼");
});
test("6M summary has no comparison claim", () => {
  const s = T.tcSummary(WCFG, "6M", { count: 40, avg: 185.9123 }, { count: 0, avg: null }, { kind: "no-prior" });
  eq(s, "Your average weight over this period was 185.9 lb. Monthly averages show how the trend changed over time.");
});

/* ---- SVG ---- */
const COLORS = { axis: "#8b8fa3", grid: "#2a2d3a", line: "#F5B944", accent: "#F5B944", fill: "rgba(245,185,68,0.10)" };
test("W chart labels every point's value", () => {
  const p = T.tcPeriod("W", 0, "2026-08-05");
  const w = T.tcWindow(OBS, p.startISO, p.endISO);
  const svg = T.tcChartSVG({ mode: "W", startISO: p.startISO, endISO: p.endISO, points: w.points, avg: w.avg, dec: 1, unit: "lb", colors: COLORS, ariaLabel: "x" });
  ok(svg.indexOf(">184.0<") >= 0 && svg.indexOf(">182.0<") >= 0 && svg.indexOf(">183.0<") >= 0, "value labels");
  ok(svg.indexOf("AVG") < 0, "no AVG line in W");
});
test("M chart draws the dashed AVG line and labels the latest point", () => {
  const p = T.tcPeriod("M", 0, "2026-08-05");
  const w = T.tcWindow(OBS, p.startISO, p.endISO);
  const svg = T.tcChartSVG({ mode: "M", startISO: p.startISO, endISO: p.endISO, points: w.points, avg: w.avg, dec: 1, unit: "lb", colors: COLORS, ariaLabel: "x" });
  ok(svg.indexOf("AVG") >= 0, "AVG label");
  ok(svg.indexOf('stroke-dasharray="4 4"') >= 0, "dashed avg line");
  ok(svg.indexOf(">183.0<") >= 0, "latest label");
});
test("6M chart: month segments, deltas, NO full-period average line", () => {
  const obs = [{ date: "2026-03-10", value: 190 }, { date: "2026-03-20", value: 188 }, { date: "2026-06-01", value: 185 }];
  const p = T.tcPeriod("6M", 0, "2026-08-05");
  const w = T.tcWindow(obs, p.startISO, p.endISO);
  const b = T.tcMonthBuckets(obs, p.startISO, p.endISO);
  const svg = T.tcChartSVG({ mode: "6M", startISO: p.startISO, endISO: p.endISO, points: w.points, monthBuckets: b, avg: null, dec: 1, unit: "lb", colors: COLORS, ariaLabel: "x" });
  ok(svg.indexOf(">189.0<") >= 0 && svg.indexOf(">185.0<") >= 0, "segment labels");
  ok(svg.indexOf("−4.0<") >= 0, "adjacent-month delta 189→185");
  ok(svg.indexOf("AVG") < 0, "no full-period average line in 6M");
});
test("empty points yield an empty string, not a broken chart", () => {
  eq(T.tcChartSVG({ mode: "W", startISO: "2026-08-01", endISO: "2026-08-07", points: [], avg: null, dec: 1, unit: "lb", colors: COLORS, ariaLabel: "x" }), "");
});
test("single observation renders without NaN coordinates", () => {
  const svg = T.tcChartSVG({ mode: "M", startISO: "2026-07-07", endISO: "2026-08-05", points: [{ date: "2026-08-01", value: 180 }], avg: 180, dec: 1, unit: "lb", colors: COLORS, ariaLabel: "x" });
  ok(svg.indexOf("NaN") < 0, "no NaN");
});
test("no NaN/Infinity ever appears in any generated chart", () => {
  const p = T.tcPeriod("6M", 0, "2026-08-05");
  const w = T.tcWindow(OBS, p.startISO, p.endISO);
  const svg = T.tcChartSVG({ mode: "6M", startISO: p.startISO, endISO: p.endISO, points: w.points, monthBuckets: T.tcMonthBuckets(OBS, p.startISO, p.endISO), avg: null, dec: 1, unit: "lb", colors: COLORS, ariaLabel: "x" });
  ok(svg.indexOf("NaN") < 0 && svg.indexOf("Infinity") < 0);
});

console.log(failures.length ? `\n${passed} passed, ${failures.length} failed` : `\n${passed} passed, 0 failed`);
process.exit(failures.length ? 1 : 0);
