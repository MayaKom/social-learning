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
  function cellVisibleFrom(rects, x, y, c, r) {
    const [cx, cy] = ctr(c, r), d = 15;
    return [[cx, cy], [cx - d, cy - d], [cx + d, cy - d], [cx - d, cy + d], [cx + d, cy + d]]
      .some(([px, py]) => !blockedBy(rects, x, y, px, py));
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

  const api = { C, OX, OY, COLS, ROWS, ITEMS, ITEM_NAMES, ROLES, ROLE_NAMES,
    itemFor, itemName, ctr, key, buildWalls, blockedBy, cellVisibleFrom, expand, bfs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GridCore = api;
})(this);
