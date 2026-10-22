/*
 * Stimuli. Edit layouts here; run `node tools/validate_stimuli.js` after every change.
 *
 * Coordinates are [column, row] on a 16 x 8 grid; [0, 0] is the top-left cell.
 * walls:    cell rectangles [c0, r0, c1, r1] (inclusive); a fractional start such as 0.5 leaves a
 *           narrow gap that the demonstrator can see through but not walk through
 * items:    value roles (A best, B second, C third, D worst) and cells; which resource plays each role
 *           comes from the counterbalancing version
 * path:     waypoints along rows or columns, plus {look:[c,r]} to look into an empty area and
 *           {bump:[c,r]} to try to step into a gap that turns out to be too narrow
 * explore:  hidden areas the demonstrator checks; the validator confirms the demonstrator turns
 *           back exactly where each area first becomes fully visible (no shortfall, no overshoot)
 * neverSeen: items the demonstrator must never see
 * Gaze at items is generated automatically and is identical across demonstrations: look at each
 * visible item at the start (nearest first), look toward startLook, and stop to look at any item
 * that comes into view.
 */
const STIMULI = {
  demos: [
    // Open area with only the worst resource: Alex looks around, sees nothing better, and goes
    // straight to it.
    { id: 'open_only_worst', walls: [], start: [2, 6],
      items: [{ role: 'D', cell: [7, 3] }],
      path: [{ look: [0, 0] }, { look: [15, 0] }, { look: [15, 7] }, [7, 6], [7, 3]] },
    // Second-best resource in view in the lower right. Alex goes up to look behind the wall,
    // sees the third-best resource in the upper right, turns back, and collects the second-best.
    { id: 'corner_check_returns', walls: [[4, 3, 15, 4]], start: [1, 6],
      items: [{ role: 'B', cell: [14, 6] }, { role: 'C', cell: [14, 1] }],
      startLook: [3, 1],
      explore: [[0, 0, 15, 2]],
      path: [[1, 2], [1, 6], [14, 6]] },
    // Second-best in view; Alex walks round, sees the third-best, checks the walled room (empty),
    // and returns to the second-best. A pillar seals off part of the room; it stays fogged.
    { id: 'pillar_room_empty', walls: [[6, 0, 6, 5], [7, 3, 12, 3], [10, 0, 10, 2]], start: [1, 1],
      items: [{ role: 'B', cell: [1, 6] }, { role: 'C', cell: [14, 6] }],
      startLook: [6, 7],
      explore: [[11, 0, 15, 2]],
      path: [[3, 1], [3, 6], [7, 6], [7, 5], [13, 5], [13, 2], { look: [12, 1] }, [13, 6], [1, 6]] },
    // Second-best close by; Alex checks both hidden corners (worst in one, nothing in the other)
    // and then returns to the second-best.
    { id: 'two_alcoves', walls: [[0, 3, 3, 3], [3, 1, 3, 2], [12, 3, 15, 3], [12, 1, 12, 2]], start: [7, 7],
      items: [{ role: 'B', cell: [11, 7] }, { role: 'D', cell: [1, 2] }],
      startLook: [3, 1],
      explore: [[0, 0, 2, 2], [13, 0, 15, 2]],
      path: [[7, 0], [2, 0], [13, 0], { look: [14, 2] }, [11, 0], [11, 7]] },
    // Alex passes the nearby worst resource to check behind the wall, finds the third-best, and
    // collects it even though it is farther away: third > worst.
    { id: 'third_over_worst', walls: [[0, 3, 11, 4]], start: [14, 6],
      items: [{ role: 'D', cell: [12, 6] }, { role: 'C', cell: [1, 2] }],
      startLook: [12, 1],
      path: [[14, 2], [1, 2]] },
    // Second-best close by; Alex walks round, sees the worst, checks the empty room, and walks
    // back to the second-best.
    { id: 'room_empty', walls: [[6, 0, 6, 5], [7, 3, 12, 3]], start: [1, 1],
      items: [{ role: 'B', cell: [1, 6] }, { role: 'D', cell: [14, 6] }],
      startLook: [6, 7],
      explore: [[7, 0, 15, 2]],
      path: [[3, 1], [3, 6], [7, 6], [7, 5], [13, 5], [13, 2], { look: [9, 1] }, [13, 6], [1, 6]] }
  ],

  // Test trials: open grid, three resources each. Near trials: second-best, third and worst
  // (copying Alex works). Far trials include the best and second-best at the same distance.
  tests: [
    { id: 'near1', kind: 'near', walls: [], start: [7, 7], items: [{ role: 'B', cell: [3, 2] }, { role: 'C', cell: [11, 2] }, { role: 'D', cell: [7, 1] }] },
    { id: 'near2', kind: 'near', walls: [], start: [7, 7], items: [{ role: 'D', cell: [3, 2] }, { role: 'B', cell: [11, 2] }, { role: 'C', cell: [7, 1] }] },
    { id: 'far1', kind: 'far', walls: [], start: [7, 7], items: [{ role: 'A', cell: [3, 2] }, { role: 'B', cell: [11, 2] }, { role: 'D', cell: [7, 1] }] },
    { id: 'far2', kind: 'far', walls: [], start: [7, 7], items: [{ role: 'B', cell: [3, 2] }, { role: 'A', cell: [11, 2] }, { role: 'C', cell: [7, 1] }] }
  ],

  // Belief probe after the test: a frozen frame from the pillar round. Alex has just passed under
  // the wall, has seen the third-best resource, and is heading to check the walled area, which is
  // still covered in fog. The best resource never appears in any round.
  probes: [
    { id: 'pillar_room_check', demo: 'pillar_room_empty', agentCell: [7, 5], heading: 0,
      prompt: 'In this round, {name} could see the {B} at the start but walked away from it, and saw the {C} on the way. ' +
        '{name} then went on to check the walled area at the top right. What do you think {name} was hoping to find there?' }
  ]
};

if (typeof module !== 'undefined' && module.exports) module.exports = { STIMULI };
