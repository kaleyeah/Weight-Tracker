/* Unit tests for photo-frame.js — Milestone 1's pure 3:4 transform core.
   Expectations are independent arithmetic. */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const F = require("./photo-frame.js");

let passed = 0; const failures = [];
const test = (n, f) => { try { f(); passed++; console.log("  PASS  " + n); }
  catch (e) { failures.push(n); console.log("  FAIL  " + n + "\n        " + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || "eq") + ": " + JSON.stringify(a) + " !== " + JSON.stringify(b)); };
const near = (a, b, tol, m) => { if (a == null || Math.abs(a - b) > (tol ?? 1e-9)) throw new Error((m || "near") + ": " + a + " !== " + b); };
const ok = (v, m) => { if (!v) throw new Error(m || "expected truthy"); };

/* ---- auto-suggestion geometry ---- */
test("portrait source taller than 3:4: full width, centered vertically", () => {
  /* 1200×2000 → 3:4 rect is 1200×1600 → height frac 0.8, y (1−0.8)/2 = 0.1 */
  const n = F.pfAutoSuggest(1200, 2000);
  near(n.crop.width, 1); near(n.crop.height, 0.8); near(n.crop.x, 0); near(n.crop.y, 0.1);
  eq(n.mode, "auto"); eq(n.aspectRatio, "3:4"); eq(n.algorithmVersion, F.PF_ALGO);
});
test("landscape source: full height, centered horizontally", () => {
  /* 2000×1000 → 3:4 rect is 750×1000 → width frac 0.375, x 0.3125 */
  const n = F.pfAutoSuggest(2000, 1000);
  near(n.crop.height, 1); near(n.crop.width, 0.375); near(n.crop.x, 0.3125);
});
test("exact 3:4 source: the full frame", () => {
  const n = F.pfAutoSuggest(1200, 1600);
  near(n.crop.x, 0); near(n.crop.y, 0); near(n.crop.width, 1); near(n.crop.height, 1);
});
test("the mock's 400×1024 processed shape gets a centered 3:4 window", () => {
  const n = F.pfAutoSuggest(400, 1024);
  near(n.crop.width, 1); near(n.crop.height, (400 / F.PF_MAX_ROT === 0 ? 0 : 400 * 4 / 3) / 1024, 1e-9, "h");
  near(n.crop.height, 533.3333333333334 / 1024, 1e-9);
});
test("degenerate dimensions refuse", () => {
  eq(F.pfAutoSuggest(0, 100), null); eq(F.pfAutoSuggest(100, -1), null);
});
test("every auto-suggestion validates against its own schema", () => {
  [[1200, 2000], [2000, 1000], [1, 1], [4032, 3024]].forEach(([w, h]) =>
    ok(F.pfValidNorm(F.pfAutoSuggest(w, h)), w + "×" + h));
});

/* ---- validation matrix ---- */
const GOOD = () => ({ schemaVersion: 1, algorithmVersion: "progress-frame-v1", aspectRatio: "3:4",
  crop: { x: 0.1, y: 0.1, width: 0.6, height: 0.8 }, rotationDegrees: 2, confidence: 0.9, mode: "manual" });
test("a well-formed normalization validates", () => ok(F.pfValidNorm(GOOD())));
test("rejects: wrong schemaVersion / missing algorithm / wrong aspect", () => {
  let n = GOOD(); n.schemaVersion = 2; ok(!F.pfValidNorm(n));
  n = GOOD(); delete n.algorithmVersion; ok(!F.pfValidNorm(n));
  n = GOOD(); n.aspectRatio = "1:1"; ok(!F.pfValidNorm(n));
});
test("rejects: crop out of bounds or degenerate", () => {
  let n = GOOD(); n.crop.x = -0.1; ok(!F.pfValidNorm(n));
  n = GOOD(); n.crop.width = 0.95; ok(!F.pfValidNorm(n), "x+width > 1");
  n = GOOD(); n.crop.width = 0.001; ok(!F.pfValidNorm(n), "degenerate");
});
test("rejects: rotation beyond the leveling bound (no perspective art)", () => {
  let n = GOOD(); n.rotationDegrees = F.PF_MAX_ROT + 1; ok(!F.pfValidNorm(n));
  n = GOOD(); n.rotationDegrees = -(F.PF_MAX_ROT + 0.5); ok(!F.pfValidNorm(n));
});
test("rejects: unknown mode; accepts legacy", () => {
  let n = GOOD(); n.mode = "ai-magic"; ok(!F.pfValidNorm(n));
  n = GOOD(); n.mode = "legacy"; ok(F.pfValidNorm(n));
});

/* ---- pixel rects ---- */
test("crop rect lands on integer pixels at true 3:4", () => {
  const r = F.pfCropRect({ x: 0, y: 0.1, width: 1, height: 0.8 }, 1200, 2000);
  eq(r.x, 0); eq(r.y, 200); eq(r.width, 1200); eq(r.height, 1600);
  near(r.width / r.height, 3 / 4, 0.002);
});
test("out-of-bounds crop clamps into the source and re-trues the ratio", () => {
  const r = F.pfCropRect({ x: 0.5, y: 0.5, width: 0.9, height: 0.9 }, 1000, 1000);
  ok(r.x + r.width <= 1000 && r.y + r.height <= 1000, "escaped source bounds");
  near(r.width / r.height, 3 / 4, 0.01);
});
test("tiny sources still produce a usable ≥1px rect", () => {
  const r = F.pfCropRect({ x: 0, y: 0, width: 1, height: 1 }, 3, 4);
  ok(r.width >= 1 && r.height >= 1);
});

/* ---- manual adjust ---- */
test("zoom tightens around the center", () => {
  const c = F.pfAdjust({ x: 0, y: 0.1, width: 1, height: 0.8 }, 0, 0, 2);
  near(c.width, 0.5); near(c.height, 0.4);
  near(c.x + c.width / 2, 0.5); near(c.y + c.height / 2, 0.5);
});
test("pan slides the window and clamps at the edges", () => {
  const c = F.pfAdjust({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, 10, 10, 1);
  near(c.x, 0.5); near(c.y, 0.5); /* clamped to 1−width */
});
test("adjust output stays inside [0,1] for hostile inputs", () => {
  const c = F.pfAdjust({ x: 0.9, y: 0.9, width: 0.4, height: 0.4 }, -99, 99, 0.1);
  ok(c.x >= 0 && c.y >= 0 && c.x + c.width <= 1.0001 && c.y + c.height <= 1.0001, JSON.stringify(c));
});

/* ---- derivative identity ---- */
test("same photo + same normalization ⇒ same key (deterministic)", () => {
  eq(F.pfDerivKey("p1", GOOD()), F.pfDerivKey("p1", GOOD()));
});
test("any transform change invalidates the key", () => {
  const base = F.pfDerivKey("p1", GOOD());
  let n = GOOD(); n.crop.x = 0.11; ok(F.pfDerivKey("p1", n) !== base, "crop.x");
  n = GOOD(); n.rotationDegrees = 3; ok(F.pfDerivKey("p1", n) !== base, "rotation");
  n = GOOD(); n.algorithmVersion = "progress-frame-v2"; ok(F.pfDerivKey("p1", n) !== base, "algorithm");
  ok(F.pfDerivKey("p2", GOOD()) !== base, "photo id");
});
test("confidence and mode do NOT invalidate (they describe, not transform)", () => {
  const base = F.pfDerivKey("p1", GOOD());
  let n = GOOD(); n.confidence = 0.1; n.mode = "auto";
  eq(F.pfDerivKey("p1", n), base);
});

/* ---- record helper ---- */
test("pfHasNorm: legacy records (no metadata) are legacy, not errors", () => {
  eq(F.pfHasNorm({ id: "x", blob: {} }), false);
  eq(F.pfHasNorm(null), false);
  eq(F.pfHasNorm({ normalization: GOOD() }), true);
  eq(F.pfHasNorm({ normalization: { schemaVersion: 99 } }), false);
});

console.log(failures.length ? `\n${passed} passed, ${failures.length} failed` : `\n${passed} passed, 0 failed`);
process.exit(failures.length ? 1 : 0);
