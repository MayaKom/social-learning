/*
 * Grid-world core logic (no DOM). Shared by the experiment and by tools/validate_stimuli.js.
 */
(function (root) {
  'use strict';

  const C = 40, OX = 20, OY = 20, COLS = 16, ROWS = 8;

  // The four kinds of resources. Each has fixed artwork and colour, so appearance is
  // counterbalanced together with the object when values are rotated across versions.
  const ITEMS = ['grain', 'ore', 'wood', 'water'];
  const ITEM_NAMES = { grain: 'grain', ore: 'ore', wood: 'wood', water: 'water' };

  // Value roles: A = best (never collected), B = second (collected repeatedly), C = third, D = worst.
  const ROLES = ['A', 'B', 'C', 'D'];
  const ROLE_NAMES = { A: 'best', B: 'second', C: 'third', D: 'worst' };

  // Counterbalancing (Latin square): version cb in 0..3 assigns role i to item (i + cb) mod 4.
  const itemFor = (role, cb) => ITEMS[(ROLES.indexOf(role) + cb) % ITEMS.length];
  const itemName = item => ITEM_NAMES[item];

  const ctr = (c, r) => [OX + C * c + C / 2, OY + C * r + C / 2];
  const key = (c, r) => c + ',' + r;

  // Walls are cell rectangles [c0, r0, c1, r1], inclusive. Starting values may be fractional to
  // leave a narrow gap: [10, 0.5, 10, 2] starts the wall halfway down row 0. The gap lets the
  // demonstrator see through, but any cell the wall touches cannot be walked through.
  function buildWalls(stim) {
    const rects = [], set = new Set();
    for (const [c0, r0, c1, r1] of stim.walls) {
      rects.push({ x: OX + C * c0, y: OY + C * r0, w: C * (c1 - c0 + 1), h: C * (r1 - r0 + 1) });
      for (let c = Math.floor(c0); c <= Math.floor(c1); c++) for (let r = Math.floor(r0); r <= Math.floor(r1); r++) set.add(key(c, r));
    }
    return { rects, set };
  }

  // Liang-Barsky clipping: does the segment pass through the interior of any wall?
  function blockedBy(rects, x1, y1, x2, y2) {
    for (const w of rects) {
      let t0 = 0, t1 = 1, out = false;
      const dx = x2 - x1, dy = y2 - y1;
      const p = [-dx, dx, -dy, dy], q = [x1 - w.x, w.x + w.w - x1, y1 - w.y, w.y + w.h - y1];
      for (let i = 0; i < 4; i++) {
        if (p[i] === 0) { if (q[i] <= 0) { out = true; break; } }
        else {
          const t = q[i] / p[i];
          if (p[i] < 0) { if (t > t1) { out = true; break; } if (t > t0) t0 = t; }
          else { if (t < t0) { out = true; break; } if (t < t1) t1 = t; }
        }
      }
      if (!out && t1 - t0 > 1e-6) return true;
    }
    return false;
  }

  // A cell is visible if its centre or any inset corner is in line of sight (vision is 360 degrees).
  // With `heading` (degrees; 0 = right, -90 = up) and `fov` (field of view, degrees) the viewer only
  // sees within a cone around the direction they face; without them, vision is all-around.
  // The cell the viewer stands in is always visible.
  const angleGap = (a, b) => { let d = (b - a) % 360; if (d > 180) d -= 360; if (d < -180) d += 360; return Math.abs(d); };
  function cellVisibleFrom(rects, x, y, c, r, heading = null, fov = 360) {
    const [cx, cy] = ctr(c, r), d = 15;
    if (Math.hypot(cx - x, cy - y) < C * 0.5) return true;
    const cone = heading !== null && fov < 360;
    return [[cx, cy], [cx - d, cy - d], [cx + d, cy - d], [cx - d, cy + d], [cx + d, cy + d]]
      .some(([px, py]) => (!cone || angleGap(heading, Math.atan2(py - y, px - x) * 180 / Math.PI) <= fov / 2) &&
        !blockedBy(rects, x, y, px, py));
  }
  // Positions along a move from one cell to the next (the display updates the view every frame).
  function pathPoints(from, to, n = 8) {
    const [fx, fy] = ctr(...from), [tx, ty] = ctr(...to), out = [];
    for (let i = 1; i <= n; i++) out.push([fx + (tx - fx) * i / n, fy + (ty - fy) * i / n]);
    return out;
  }
  // Headings passed through when turning from one direction to another (used for sweeping the view).
  function sweepHeadings(from, to, stepDeg = 10) {
    let d = (to - from) % 360; if (d > 180) d -= 360; if (d < -180) d += 360;
    const n = Math.max(1, Math.ceil(Math.abs(d) / stepDeg)), out = [];
    for (let i = 1; i <= n; i++) out.push(from + d * i / n);
    return out;
  }

  // Expand waypoints (along rows/columns) into unit steps; {look:[c,r]} and {bump:[c,r]} actions
  // (try to step into a cell that turns out to be too narrow) pass through.
  function expand(stim) {
    const acts = [];
    let [c, r] = stim.start;
    for (const w of stim.path) {
      if (!Array.isArray(w)) { acts.push(w); continue; }
      const [tc, tr] = w;
      if (tc !== c && tr !== r) throw new Error(stim.id + ': waypoint ' + w + ' is not on the same row or column');
      while (c !== tc || r !== tr) { c += Math.sign(tc - c); r += Math.sign(tr - r); acts.push({ step: [c, r] }); }
    }
    return acts;
  }

  // Shortest path on the grid (4-neighbour). Returns null if the goal cannot be reached.
  function bfs(start, goal, wallSet) {
    const prev = new Map([[key(...start), null]]), q = [start];
    while (q.length) {
      const [c, r] = q.shift();
      if (c === goal[0] && r === goal[1]) break;
      for (const [dc, dr] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) {
        const nc = c + dc, nr = r + dr, k = key(nc, nr);
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS || wallSet.has(k) || prev.has(k)) continue;
        prev.set(k, [c, r]); q.push([nc, nr]);
      }
    }
    if (!prev.has(key(...goal))) return null;
    const path = [];
    let cur = goal;
    while (cur && !(cur[0] === start[0] && cur[1] === start[1])) { path.unshift(cur); cur = prev.get(key(...cur)); }
    return path;
  }

  // ---------- Route checks (used by tools/validate_stimuli.js and record.html) ----------
  // acts: [{step:[c,r]} | {bump:[c,r]} | {look:...}], as produced by expand() or recordingToActs().
  // Returns a log of what happens, a list of problems, the number of steps and the role collected.
  function analyzeRoute(d, acts, values, stepCost, fov = 360) {
    const W = buildWalls(d), log = [], problems = [];
    let cell = d.start, infoCell = d.start, stepIndex = -1, heading = -90;   // Alex starts facing up
    const seenCells = new Set(), seenItems = new Set();
    const decisionPoints = [{ cell: d.start, k: -1 }];
    const flag = msg => { log.push(msg); problems.push(msg); };
    const markDecision = () => { const last = decisionPoints[decisionPoints.length - 1]; if (last.k !== stepIndex) decisionPoints.push({ cell: cell.slice(), k: stepIndex }); };
    const lookAt = (h, pos = null) => {
      const [x, y] = pos || ctr(...cell);
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++)
        if (!W.set.has(key(c, r)) && cellVisibleFrom(W.rects, x, y, c, r, h, fov)) seenCells.add(key(c, r));
      for (const it of d.items) if (!seenItems.has(it.role) && cellVisibleFrom(W.rects, x, y, ...it.cell, h, fov)) {
        seenItems.add(it.role); infoCell = cell; markDecision(); log.push(`at ${cell} first sees item ${it.role}`);
      }
    };
    // Turning sweeps the view through every direction in between.
    const turnTo = h => { for (const hh of sweepHeadings(heading, h)) lookAt(hh); heading = h; };
    const look = () => lookAt(heading);
    const areaDone = ([c0, r0, c1, r1]) => {
      for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) if (!W.set.has(key(c, r)) && !seenCells.has(key(c, r))) return false;
      return true;
    };
    const doneAt = {};
    look();
    (d.explore || []).forEach((a, i) => { if (areaDone(a)) { doneAt[i] = 'start'; flag(`PROBLEM: area ${JSON.stringify(a)} is already fully visible at the start`); } });
    const steps = acts.filter(a => a.step);
    const bumpAt = new Map(), looksAt = new Map();   // step index -> bumps / looks made after that step
    { let k = -1; for (const a of acts) {
        if (a.step) k++;
        else if (a.bump) { if (!bumpAt.has(k)) bumpAt.set(k, []); bumpAt.get(k).push(a.bump); }
        else if (a.look !== undefined) { if (!looksAt.has(k)) looksAt.set(k, []); looksAt.get(k).push(a.look); }
    } }
    const doLooks = k => (looksAt.get(k) || []).forEach(t => {
      // a look is either a heading (recordings) or a cell to look towards (scripted paths)
      const [x, y] = ctr(...cell);
      const h = Array.isArray(t) ? Math.atan2(ctr(...t)[1] - y, ctr(...t)[0] - x) * 180 / Math.PI : t;
      turnTo(h);
    });
    const checkBumps = k => (bumpAt.get(k) || []).forEach(b => {
      const outside = b[0] < 0 || b[1] < 0 || b[0] >= COLS || b[1] >= ROWS;
      heading = Math.atan2(b[1] - cell[1], b[0] - cell[0]) * 180 / Math.PI; look();
      if (Math.abs(b[0] - cell[0]) + Math.abs(b[1] - cell[1]) !== 1) flag(`PROBLEM: bump at ${cell} toward ${b} is not into an adjacent cell`);
      else if (outside) log.push(`at ${cell} bumps into the edge of the grid`);
      else if (W.set.has(key(...b))) { infoCell = cell; markDecision(); log.push(`at ${cell} tries to move into ${b} and is blocked`); }
      else flag(`PROBLEM: bump at ${cell} toward ${b}, which is open`);
    });
    checkBumps(-1); doLooks(-1);
    const turnBacks = [];
    steps.forEach((a, k) => {
      const prev = cell;
      cell = a.step; stepIndex = k;
      const moveHeading = Math.atan2(cell[1] - prev[1], cell[0] - prev[0]) * 180 / Math.PI;
      // Turn on the spot to face the new cell, then look along the move (as the display does).
      cell = prev; stepIndex = k - 1;
      if (Math.abs(((moveHeading - heading) % 360 + 540) % 360 - 180) > 5) turnTo(moveHeading);
      heading = moveHeading;
      cell = a.step; stepIndex = k;
      for (const pt of pathPoints(prev, cell)) lookAt(heading, pt);
      if (W.set.has(key(...cell))) flag(`PROBLEM: step into a wall at ${cell}`);
      if (k < steps.length - 1 && d.items.some(it => it.cell[0] === cell[0] && it.cell[1] === cell[1])) flag(`PROBLEM: walks over an item at ${cell}`);
      if (k > 0 && k < steps.length - 1) {
        const p = steps[k - 1].step, n = steps[k + 1].step;
        if (p[0] === n[0] && p[1] === n[1]) turnBacks.push(cell.join(','));
      }
      checkBumps(k);
      doLooks(k);
      (d.explore || []).forEach((a2, i) => { if (!(i in doneAt) && areaDone(a2)) { doneAt[i] = cell.join(','); infoCell = cell; markDecision(); log.push(`at ${cell} area ${JSON.stringify(a2)} becomes fully visible`); } });
    });
    markDecision();
    for (let i = 1; i < decisionPoints.length; i++) {
      const from = decisionPoints[i - 1], to = decisionPoints[i];
      const walked = to.k - from.k, route = bfs(from.cell, to.cell, W.set), shortest = route ? route.length : Infinity;
      if (walked > shortest) flag(`PROBLEM: from ${from.cell} to ${to.cell} takes ${walked} steps, but the shortest route is ${shortest}`);
    }
    (d.explore || []).forEach((a, i) => {
      if (!(i in doneAt)) flag(`PROBLEM: area ${JSON.stringify(a)} is never fully seen`);
      else if (!turnBacks.includes(doneAt[i])) flag(`CHECK: area ${JSON.stringify(a)} becomes fully visible at ${doneAt[i]}, but the route does not turn back there (turns back at: ${turnBacks.join(' / ') || 'none'})`);
    });
    for (const r of d.neverSeen || []) if (seenItems.has(r)) flag(`PROBLEM: item ${r} should never be seen but is`);
    const end = d.items.find(it => it.cell[0] === cell[0] && it.cell[1] === cell[1]);
    if (end) {
      const route = it => bfs(infoCell, it.cell, W.set);
      const net = it => route(it) ? values[it.role] - stepCost * route(it).length : -Infinity;
      const seen = d.items.filter(it => seenItems.has(it.role));
      log.push(`final decision at ${infoCell}: points after walking ` + seen.map(it => route(it) ? `${it.role}=${net(it)}` : `${it.role}=unreachable`).join('  '));
      const best = seen.reduce((a, b) => net(b) > net(a) ? b : a);
      if (best.role !== end.role) flag(`PROBLEM: collects ${end.role}, but ${best.role} is worth more after walking`);
      if (net(end) <= 0) flag(`PROBLEM: collecting ${end.role} here loses points (${net(end)}); an expert would not make this trip`);
    } else flag('PROBLEM: the route does not end on a resource');
    return { log, problems, steps: steps.length, collected: end ? end.role : null, finalCell: cell, seenCells: [...seenCells].sort() };
  }

  // A recording made on record.html: {demo, events: [{t, type: 'move'|'turn'|'bump'|'collect', ...}]}
  function recordingToActs(rec) {   // turn events become looks in a heading (degrees)
    const acts = [];
    for (const e of rec.events) {
      if (e.type === 'move') acts.push({ step: e.to });
      else if (e.type === 'bump') acts.push({ bump: e.toward });
      else if (e.type === 'turn') acts.push({ look: e.heading });
    }
    return acts;
  }

  const api = { C, OX, OY, COLS, ROWS, ITEMS, ITEM_NAMES, ROLES, ROLE_NAMES,
    itemFor, itemName, ctr, key, buildWalls, blockedBy, cellVisibleFrom, sweepHeadings, pathPoints, expand, bfs, analyzeRoute, recordingToActs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GridCore = api;
})(this);
