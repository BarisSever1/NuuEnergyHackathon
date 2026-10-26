// Runs the assessment engine on the 5 challenge buildings and checks the 3 development cases
// against nuuEnergy's reference values.  Usage:  node tests/check_buildings.js
const path = require('path');
const E = require(path.join(__dirname, '..', 'src', 'engine.js'));
const dev = require(path.join(__dirname, '..', 'data', 'buildings_dev.json'));
const evl = require(path.join(__dirname, '..', 'data', 'buildings_eval.json'));

let ok = true;
const rows = [];
for (const b of [...dev, ...evl]) {
  const f = E.readFreeText(b);
  const r = E.assessRange(b, { radiatorCount: f.radiatorCount });
  const lo = r.range.lo ?? r.load.lo, hi = r.range.hi ?? r.load.hi;
  const ref = b.reference_heating_load_kw;
  const verdictOk = b.expected_verdict ? b.expected_verdict === r.verdict : null;
  const loadOk = ref != null ? ref >= lo - 1e-9 && ref <= hi + 1e-9 : null;
  if (verdictOk === false || loadOk === false) ok = false;
  rows.push({
    building: b.building_id,
    verdict: r.verdict + (verdictOk === null ? '' : verdictOk ? ' ✓' : ` ✗ (expected ${b.expected_verdict})`),
    heating_load_kW: `${r.load.best.toFixed(1)} (${lo.toFixed(1)}–${hi.toFixed(1)})`,
    reference_kW: ref != null ? `${ref}${loadOk ? ' ✓ in range' : ' ✗ outside'}` : 'jury',
    open_points: r.findings.filter((x) => x.status === 'check' || x.status === 'blocker').map((x) => x.title.replace(/ —.*$/, '')).join('; ') || '–',
  });
}
console.table(rows);
console.log(ok ? 'All development cases match nuuEnergy\'s reference values.' : 'MISMATCH against the reference values.');
process.exit(ok ? 0 : 1);
