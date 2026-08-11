/* Golden vectors for the macro core.
 *
 * WHY THIS FILE EXISTS. The codex answers "what should my macros be?" from a
 * Python port running on a VPS with no node and no checkout of this repo. Two
 * implementations of the same arithmetic will drift, and the failure is silent:
 * the app says 175 g and the codex says 172 g, and nobody notices until an
 * athlete does. So this file is the contract. It sweeps a grid through the JS —
 * which is the source of truth — and writes every input/output pair. The Python
 * port must reproduce all of them exactly, or its test fails.
 *
 * The sweep deliberately includes values that land on a .5 boundary, because
 * JS Math.round and Python round() disagree there: JS rounds half toward +∞,
 * Python 3 uses banker's rounding, so round(2.5) is 3 in JS and 2 in Python.
 * That single difference would corrupt calorie and macro figures quietly.
 *
 *   node src/macro-golden.mjs           verify (must be a clean no-op)
 *   node src/macro-golden.mjs --write   regenerate after an intended change
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const M = require("./macro-core.js");
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "fixtures", "macro-golden.json");
const WRITE = process.argv.includes("--write");

const SEX = ["male", "female"];
const AGES = [19, 40];
const HEIGHTS = [[5, 4], [6, 2]];
const ACTIVITY = ["sedentary", "moderate", "intense"];
const STRATEGY = ["lose", "maintain", "gain"];
const FAT_PCT = [0.20, 0.25, 0.30];

/* The grid is deliberately SMALL and spread rather than exhaustive: this file
   is committed, and a five-megabyte fixture is a burden nobody will maintain.
   What catches a porting bug is coverage of the EDGES — both unit systems, the
   fat floor, a null rate, the .5 rounding boundary and the missing-input cases
   below — not another age between 19 and 40.
   Weights include both units, the Owner's own case (195 → 175), a very heavy
   athlete, and small intakes where the fat floor binds. */
const BODIES = [
  { weight: 195, goalWeight: 175, units: "lbs" },   // the Owner's question
  { weight: 250, goalWeight: 200, units: "lbs" },
  { weight: 145, goalWeight: 140, units: "lbs" },
  { weight: 88.5, goalWeight: 79, units: "kg" },
  { weight: 120, goalWeight: 95, units: "kg" },
];

const RATES = [
  { targetType: "percent_bw_per_week", targetValue: 0.5 },
  { targetType: "percent_bw_per_week", targetValue: 1 },
  { targetType: "lbs_per_week", targetValue: 1 },
  { targetType: "lbs_per_week", targetValue: 0.5 },
  { targetType: "lbs_per_week", targetValue: null },   // no rate given
];

/* Cases engineered so BMR and fat land exactly on .5 before rounding. If the
   Python port used round() instead of floor(x+0.5) these are what catch it. */
const HALFWAY = [
  { sex: "male", ageYears: 30, heightCm: 180, weight: 82.05, units: "kg" },
  { sex: "female", ageYears: 25, heightCm: 165, weight: 61.15, units: "kg" },
  { sex: "male", ageYears: 45, heightCm: 175, weight: 90.25, units: "kg" },
];

const cases = [];

for (const sex of SEX)
  for (const ageYears of AGES)
    for (const [heightFt, heightIn] of HEIGHTS)
      for (const body of BODIES)
        for (const activityLevel of ACTIVITY)
          for (const strategy of STRATEGY)
            for (const rate of RATES) {
              const inputs = {
                sex, ageYears, heightFt, heightIn,
                weight: body.weight, goalWeight: body.goalWeight, units: body.units,
                activityLevel, strategy,
                targetType: rate.targetType, targetValue: rate.targetValue,
                fatPct: null,
              };
              cases.push({ inputs, outputs: compute(inputs) });
            }

/* the fat band, swept on one representative body only — it multiplies out fast
   and the band is orthogonal to everything above */
for (const fatPct of FAT_PCT)
  for (const calories of [1400, 1900, 2500, 3200]) {
    const inputs = {
      sex: "male", ageYears: 40, heightFt: 5, heightIn: 10,
      weight: 195, goalWeight: 175, units: "lbs",
      activityLevel: "moderate", strategy: "lose",
      targetType: "percent_bw_per_week", targetValue: 0.75,
      fatPct, caloriesOverride: calories,
    };
    cases.push({ inputs, outputs: compute(inputs) });
  }

for (const h of HALFWAY) {
  const inputs = {
    sex: h.sex, ageYears: h.ageYears, heightCm: h.heightCm,
    weight: h.weight, goalWeight: h.weight - 5, units: h.units,
    activityLevel: "moderate", strategy: "lose",
    targetType: "lbs_per_week", targetValue: 1, fatPct: null,
  };
  cases.push({ inputs, outputs: compute(inputs) });
}

/* deliberately incomplete inputs — the port must return null in the same
   places, because "no maintenance figure" is a load-bearing answer */
for (const drop of ["sex", "ageYears", "heightFt", "weight", "goalWeight", "activityLevel"]) {
  const inputs = {
    sex: "male", ageYears: 40, heightFt: 5, heightIn: 10,
    weight: 195, goalWeight: 175, units: "lbs",
    activityLevel: "moderate", strategy: "lose",
    targetType: "percent_bw_per_week", targetValue: 0.75, fatPct: null,
  };
  delete inputs[drop];
  inputs._dropped = drop;
  cases.push({ inputs, outputs: compute(inputs) });
}

function compute(i) {
  const bmrValue = M.bmr({
    sex: i.sex, ageYears: i.ageYears,
    heightFt: i.heightFt, heightIn: i.heightIn, heightCm: i.heightCm,
    weight: i.weight, units: i.units,
  });
  const maintenanceValue = M.maintenance({ bmrValue, activityLevel: i.activityLevel });
  const rate = {
    strategy: i.strategy, targetType: i.targetType, targetValue: i.targetValue,
    units: i.units, currentWeight: i.weight,
  };
  const deficit = M.dailyDeficit(rate);
  const delta = M.dailyDelta(rate);
  const target = M.targetIntake(Object.assign({ maintenanceValue }, rate));
  const proteinG = M.suggestedProteinG({ goalWeight: i.goalWeight, units: i.units });
  const calories = i.caloriesOverride !== undefined ? i.caloriesOverride : target;
  const macros = M.suggestedMacros({
    calories, proteinG,
    fatPct: i.fatPct === null || i.fatPct === undefined ? undefined : i.fatPct,
  });
  return { bmr: bmrValue, maintenance: maintenanceValue, dailyDeficit: deficit,
    dailyDelta: delta, targetIntake: target, proteinG, macros };
}

const src = readFileSync(join(HERE, "macro-core.js"));
const payload = {
  generated_from: "src/macro-core.js",
  source_sha256: createHash("sha256").update(src).digest("hex"),
  note: "Regenerate with: node src/macro-golden.mjs --write. The Python port in "
      + "knowledge-ingestion/app/codex/macros.py must reproduce every case exactly.",
  case_count: cases.length,
  cases,
};
const text = JSON.stringify(payload, null, 1) + "\n";

if (WRITE) {
  mkdirSync(join(HERE, "fixtures"), { recursive: true });
  writeFileSync(OUT, text);
  console.log("wrote " + OUT + " (" + cases.length + " cases)");
  process.exit(0);
}

if (!existsSync(OUT)) {
  console.log("MISSING " + OUT + " — run with --write");
  process.exit(1);
}
const prev = readFileSync(OUT, "utf8");
if (prev === text) {
  console.log("golden vectors match (" + cases.length + " cases)");
  process.exit(0);
}
/* Report WHICH case moved — "the file differs" is not a useful failure. */
let prevCases = [];
try { prevCases = JSON.parse(prev).cases || []; } catch (e) { /* fall through */ }
let shown = 0;
for (let i = 0; i < Math.max(prevCases.length, cases.length) && shown < 5; i++) {
  const a = JSON.stringify(prevCases[i]), b = JSON.stringify(cases[i]);
  if (a !== b) { console.log("case " + i + ":\n  was " + a + "\n  now " + b); shown++; }
}
console.log("\nGOLDEN VECTORS CHANGED. If that was intended, re-run with --write "
  + "and update the Python port to match.");
process.exit(1);
