/*
 * Checks every demonstration in js/stimuli.js:
 *  - no steps into walls or over items other than the one collected
 *  - when each item first comes into view
 *  - each `explore` area is first fully visible exactly where the demonstrator turns back
 *  - `neverSeen` items are never visible to the demonstrator
 *  - each bump is into an adjacent cell that cannot be walked through
 *  - the item Alex collects is the best choice (value minus remaining steps) at the moment Alex
 *    last learned something new, given the values and step cost in js/config.js, and that the
 *    trip does not lose points
 *  - every stretch of walking between decision points (the start, each moment Alex sees something
 *    new, and the end) is a shortest route, so Alex never takes steps that waste points
 *  - test trials: walking distance to each item
 * Run with:  node tools/validate_stimuli.js
 */
const path = require('path');
const G = require(path.join(__dirname, '../js/gridworld-core.js'));
const { STIMULI } = require(path.join(__dirname, '../js/stimuli.js'));
const { CONFIG } = require(path.join(__dirname, '../js/config.js'));

let problems = 0;
for (const d of STIMULI.demos) {
  const W = G.buildWalls(d), acts = G.expand(d), log = [];
  let cell = d.start;
  const seenCells = new Set(), seenItems = new Set();
  const look = () => {
    const [x, y] = G.ctr(...cell);
    for (let r = 0; r < G.ROWS; r++) for (let c = 0; c < G.COLS; c++)
      if (!W.set.has(G.key(c, r)) && G.cellVisibleFrom(W.rects, x, y, c, r)) seenCells.add(G.key(c, r));
    for (const it of d.items) if (!seenItems.has(it.role) && G.cellVisibleFrom(W.rects, x, y, ...it.cell)) {
      seenItems.add(it.role); infoCell = cell; markDecision(); log.push(`at ${cell} first sees item ${it.role}`);
    }
  };
  let stepIndex = -1;
  const markDecision = () => { const last = decisionPoints[decisionPoints.length - 1]; if (last.k !== stepIndex) decisionPoints.push({ cell: cell.slice(), k: stepIndex }); };
  const areaDone = ([c0, r0, c1, r1]) => {
    for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) if (!W.set.has(G.key(c, r)) && !seenCells.has(G.key(c, r))) return false;
    return true;
  };
  const doneAt = {};
  let infoCell = d.start;
  const decisionPoints = [{ cell: d.start, k: -1 }];
  look();
  (d.explore || []).forEach((a, i) => { if (areaDone(a)) { doneAt[i] = 'start'; log.push(`PROBLEM: area ${JSON.stringify(a)} is already fully visible at the start`); problems++; } });
  const steps = acts.filter(a => a.step);
  // Bumps (trying a gap that is too narrow) are decision points: Alex learns the gap is impassable.
  const bumpAt = new Map(); // step index -> bump target
  { let k = -1; for (const a of acts) { if (a.step) k++; else if (a.bump) bumpAt.set(k, a.bump); } }
  const turnBacks = [];
  steps.forEach((a, k) => {
    cell = a.step; stepIndex = k;
    if (W.set.has(G.key(...cell))) { log.push(`PROBLEM: step into a wall at ${cell}`); problems++; }
    if (k < steps.length - 1 && d.items.some(it => it.cell[0] === cell[0] && it.cell[1] === cell[1])) { log.push(`PROBLEM: walks over an item at ${cell}`); problems++; }
    if (k > 0 && k < steps.length - 1) {
      const p = steps[k - 1].step, n = steps[k + 1].step;
      if (p[0] === n[0] && p[1] === n[1]) turnBacks.push(cell.join(','));
    }
    look();
    if (bumpAt.has(k)) {
      const b = bumpAt.get(k);
      if (Math.abs(b[0] - cell[0]) + Math.abs(b[1] - cell[1]) !== 1 || !W.set.has(G.key(...b))) { log.push(`PROBLEM: bump at ${cell} toward ${b} is not into an adjacent blocked cell`); problems++; }
      else { infoCell = cell; markDecision(); log.push(`at ${cell} tries the gap at ${b} and finds it too narrow`); }
    }
    (d.explore || []).forEach((a2, i) => { if (!(i in doneAt) && areaDone(a2)) { doneAt[i] = cell.join(','); infoCell = cell; markDecision(); log.push(`at ${cell} area ${JSON.stringify(a2)} becomes fully visible`); } });
  });
  markDecision();
  for (let i = 1; i < decisionPoints.length; i++) {
    const from = decisionPoints[i - 1], to = decisionPoints[i];
    const walked = to.k - from.k, shortest = G.bfs(from.cell, to.cell, W.set).length;
    if (walked > shortest) { log.push(`PROBLEM: from ${from.cell} to ${to.cell} Alex takes ${walked} steps, but the shortest route is ${shortest}`); problems++; }
  }
  (d.explore || []).forEach((a, i) => {
    if (!(i in doneAt)) { log.push(`PROBLEM: area ${JSON.stringify(a)} is never fully seen`); problems++; }
    else if (!turnBacks.includes(doneAt[i])) { log.push(`CHECK: area ${JSON.stringify(a)} becomes fully visible at ${doneAt[i]}, but the demonstrator does not turn back there (turns back at: ${turnBacks.join(' / ') || 'none'})`); problems++; }
  });
  for (const r of d.neverSeen || []) if (seenItems.has(r)) { log.push(`PROBLEM: item ${r} should never be seen but is`); problems++; }
  const end = d.items.find(it => it.cell[0] === cell[0] && it.cell[1] === cell[1]);
  if (end) {
    const route = it => G.bfs(infoCell, it.cell, W.set);
    const net = it => route(it) ? CONFIG.values[it.role] - CONFIG.stepCost * route(it).length : -Infinity;
    const options = d.items.filter(it => seenItems.has(it.role)).map(it => route(it) ? `${it.role}=${net(it)}` : `${it.role}=unreachable`).join('  ');
    const best = d.items.filter(it => seenItems.has(it.role)).reduce((a, b) => net(b) > net(a) ? b : a);
    log.push(`final decision at ${infoCell}: points after walking ${options}`);
    if (best.role !== end.role) { log.push(`PROBLEM: Alex collects ${end.role}, but ${best.role} is worth more after walking`); problems++; }
    if (net(end) <= 0) { log.push(`PROBLEM: collecting ${end.role} here loses points (${net(end)}); an expert would not make this trip`); problems++; }
  }
  console.log(`${d.id}: ${steps.length} steps, collects ${end ? end.role : 'nothing'}`);
  log.forEach(l => console.log('   ' + l));
}
console.log('\nTest trials (walking distance to each item):');
for (const t of STIMULI.tests) console.log(`   ${t.id} (${t.kind}): ` + t.items.map(it => `${it.role}=${G.bfs(t.start, it.cell, G.buildWalls(t).set).length}`).join('  '));
console.log(problems ? `\n${problems} problem(s) found` : '\nNo problems found');
process.exitCode = problems ? 1 : 0;
