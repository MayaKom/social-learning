/*
 * Grid-world rendering, animation, and custom jsPsych plugins:
 *   jsPsychGridDemo    - plays one demonstration, then shows a question (with or without an answer box)
 *   jsPsychGridChoice  - participant clicks an item and walks to collect it
 *   jsPsychItemRanking - participant orders the four items from most to least valuable
 *   jsPsychGridProbe   - frozen frame from a demonstration with a multiple-choice belief question
 * Requires gridworld-core.js and jsPsych 8.
 */
(function () {
  'use strict';
  const G = window.GridCore;
  const P = jsPsychModule.ParameterType;
  const svgNS = 'http://www.w3.org/2000/svg';

  // ---------- Artwork (drawn in a 50 x 50 box centred on 0,0) ----------
  // Grain: bright straw yellow, so it is clearly distinct from the dark brown wood.
  const stalk = (rot) => `<g transform="rotate(${rot} 0 16)">
      <line x1="0" y1="18" x2="0" y2="-6" stroke="#B59A1E" stroke-width="1.8" stroke-linecap="round"/>
      <ellipse cx="-3.2" cy="-6" rx="2.4" ry="4.2" transform="rotate(-28 -3.2 -6)" fill="#F2CF2C" stroke="#8F7612" stroke-width="0.6"/>
      <ellipse cx="3.2" cy="-9" rx="2.4" ry="4.2" transform="rotate(28 3.2 -9)" fill="#FBE47A" stroke="#8F7612" stroke-width="0.6"/>
      <ellipse cx="-3.2" cy="-12" rx="2.4" ry="4.2" transform="rotate(-28 -3.2 -12)" fill="#F2CF2C" stroke="#8F7612" stroke-width="0.6"/>
      <ellipse cx="3.2" cy="-15" rx="2.4" ry="4.2" transform="rotate(28 3.2 -15)" fill="#FBE47A" stroke="#8F7612" stroke-width="0.6"/>
      <ellipse cx="0" cy="-19.5" rx="2.2" ry="4" fill="#F2CF2C" stroke="#8F7612" stroke-width="0.6"/>
    </g>`;
  // Wood: dark bark with reddish-brown cut ends.
  const log = (cx, cy) => `<g>
      <circle cx="${cx}" cy="${cy}" r="8.6" fill="#4E2E17" stroke="#2C190B" stroke-width="0.9"/>
      <circle cx="${cx}" cy="${cy}" r="6.4" fill="#A8693D"/>
      <circle cx="${cx}" cy="${cy}" r="4" fill="none" stroke="#6E3F1E" stroke-width="0.9"/>
      <circle cx="${cx}" cy="${cy}" r="1.6" fill="#6E3F1E"/>
    </g>`;
  const ITEM_ART = {
    grain: `${stalk(-22)}${stalk(22)}${stalk(0)}<rect x="-5" y="6" width="10" height="4" rx="1" fill="#8F7612"/>`,
    // Ore: a faceted grey rock with rust-coloured and metallic flecks.
    ore: `<polygon points="-17,8 -14,-6 -5,-14 7,-12 16,-3 17,9 6,16 -9,15" fill="#6B7280" stroke="#2F3540" stroke-width="0.9" stroke-linejoin="round"/>
      <polygon points="-14,-6 -5,-14 -2,-4 -10,0" fill="#A3A9B4"/>
      <polygon points="-5,-14 7,-12 6,2 -2,-4" fill="#8B929E"/>
      <polygon points="7,-12 16,-3 6,2" fill="#7A818D"/>
      <polygon points="-17,8 -10,0 -2,-4 6,2 17,9 6,16 -9,15" fill="#555B66"/>
      <polygon points="-7,3 -4,1 -2,4 -5,6" fill="#B4532A"/><polygon points="3,7 6,5 8,8 5,10" fill="#B4532A"/>
      <polygon points="8,-5 10,-7 12,-4 10,-2" fill="#E3E7ED"/><polygon points="-9,-6 -7,-8 -5,-6 -7,-4" fill="#E3E7ED"/><circle cx="-1" cy="10" r="1.3" fill="#E3E7ED"/>`,
    wood: `${log(-8.5, 9)}${log(8.5, 9)}${log(0, -6)}`,
    water: `<path d="M0,-21 C6,-12 15,-2 15,7 C15,15.5 8,21 0,21 C-8,21 -15,15.5 -15,7 C-15,-2 -6,-12 0,-21 Z" fill="#378ADD" stroke="#0C447C" stroke-width="0.9"/>
      <path d="M0,-12 C4,-6 9,0 9,7 C9,12 5,15.5 0,15.5" fill="none" stroke="#185FA5" stroke-width="2" opacity="0.6"/>
      <path d="M-7,4 C-7,-1 -4,-5 -2,-8" fill="none" stroke="#B5D4F4" stroke-width="2.4" stroke-linecap="round"/>`
  };

  function ensureDefs() {
    if (document.getElementById('gw-item-defs')) return;
    const s = document.createElementNS(svgNS, 'svg');
    s.setAttribute('width', '0'); s.setAttribute('height', '0'); s.setAttribute('aria-hidden', 'true');
    s.style.position = 'absolute'; s.style.overflow = 'hidden';
    s.innerHTML = '<defs id="gw-item-defs">' + G.ITEMS.map(i => `<g id="gw-${i}">${ITEM_ART[i]}</g>`).join('') + '</defs>';
    document.body.appendChild(s);
  }
  const itemIcon = (item, size = 40, label = true) =>
    `<svg class="gw-icon" width="${size}" height="${size}" viewBox="-25 -25 50 50" ${label ? `role="img" aria-label="${G.itemName(item)}"` : 'aria-hidden="true"'}><use href="#gw-${item}"/></svg>`;
  // Avatar colours for the demonstrator: three the participant chooses between, plus a neutral one
  // used in the AI and control conditions. The participant's own avatar in the test is grey.
  const AVATARS = {
    blue: { label: 'Blue', fill: '#8DBCEB', stroke: '#185FA5' },
    burgundy: { label: 'Burgundy', fill: '#B4506A', stroke: '#5E1428' },
    green: { label: 'Green', fill: '#9CCB76', stroke: '#3B6D11' },
    neutral: { label: 'Neutral', fill: '#F5C4B3', stroke: '#993C1D' },
    player: { label: 'Player', fill: '#D3D1C7', stroke: '#5F5E5A' }
  };
  const agentIcon = (size = 40, avatar = 'neutral', label = '') =>
    `<svg class="gw-icon" width="${size}" height="${size}" viewBox="-20 -20 40 40" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}><g transform="rotate(-90)">${agentArt(avatar)}</g></svg>`;
  // Portraits for the introduction screen: a solid black head-and-shoulders silhouette for a human
  // demonstrator, seen from behind (no frame or grey placeholder look), and a black robot
  // silhouette for the AI.
  const portrait = (kind, size = 72) => {
    const fill = '#1D2129';
    const inner = kind === 'ai'
      ? `<line x1="32" y1="5" x2="32" y2="12" stroke="${fill}" stroke-width="2.5" stroke-linecap="round"/><circle cx="32" cy="4.5" r="3" fill="${fill}"/>
         <rect x="16" y="12" width="32" height="27" rx="7" fill="${fill}"/>
         <circle cx="25" cy="25.5" r="3.6" fill="#FFFFFF"/><circle cx="39" cy="25.5" r="3.6" fill="#FFFFFF"/>
         <rect x="27" y="39" width="10" height="6" fill="${fill}"/>
         <path d="M6,72 C8,56 18,46 32,46 C46,46 56,56 58,72 Z" fill="${fill}"/>`
      : `<ellipse cx="32" cy="27" rx="13" ry="15.5" fill="${fill}"/>
         <path d="M4,72 C5,55 16,44 32,44 C48,44 59,55 60,72 Z" fill="${fill}"/>`;
    return `<svg class="gw-icon" width="${size}" height="${Math.round(size * 72 / 64)}" viewBox="0 0 64 72" aria-hidden="true">${inner}</svg>`;
  };
  function agentArt(avatar) {
    const { fill, stroke } = AVATARS[avatar] || AVATARS.neutral;
    let s = `<circle r="16" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>`;
    for (const k of [-1, 1]) s += `<circle cx="6" cy="${6.5 * k}" r="5" fill="#FFFFFF" stroke="${stroke}" stroke-width="0.6"/><circle cx="8.5" cy="${6.5 * k}" r="2.6" fill="#2C2C2A"/>`;
    return s;
  }

  // ---------- Grid world ----------
  const DEFAULT_TIMING = { start: 600, look: 800, turn: 260, step: 240, collect: 400 };
  const ease = k => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  const angDiff = (a, b) => { let d = b - a; while (d > 180) d -= 360; while (d < -180) d += 360; return d; };

  class GridWorld {
    constructor(container, { cb = 0, speed = 1, timing = {}, label = 'Grid', avatar = 'neutral' } = {}) {
      ensureDefs();
      this.avatar = avatar;
      this.cb = cb; this.speed = speed; this.T = Object.assign({}, DEFAULT_TIMING, timing); this.alive = true;
      container.innerHTML = `<svg class="gw-board" viewBox="0 0 680 360" role="img" aria-label="${label}">
        <defs>
          <pattern id="gw-brick" width="20" height="20" patternUnits="userSpaceOnUse" x="${G.OX}" y="${G.OY}">
            <rect width="20" height="20" fill="#A0533A"/>
            <path d="M0,0.5 H20 M0,10.5 H20 M0.5,0 V10 M10.5,10 V20" stroke="#E8DCCD" stroke-width="1.4" fill="none"/>
            <path d="M2,2.5 H8 M13,12.5 H18" stroke="#B9684C" stroke-width="1.2"/>
          </pattern>
          <pattern id="gw-fog" width="10" height="10" patternUnits="userSpaceOnUse">
            <rect width="10" height="10" fill="#D5D9E0"/><circle cx="2.5" cy="2.5" r="0.9" fill="#C3C8D1"/><circle cx="7.5" cy="7.5" r="0.9" fill="#C3C8D1"/>
          </pattern>
        </defs>
        <g class="L-grid"></g>
        <rect x="${G.OX}" y="${G.OY}" width="${G.C * G.COLS}" height="${G.C * G.ROWS}" fill="none" stroke="#D6D9DF" stroke-width="1.5"/>
        <g class="L-items"></g><g class="L-fog"></g><g class="L-walls"></g><g class="L-agent"></g></svg>`;
      this.svg = container.querySelector('svg');
      this.L = {};
      for (const k of ['grid', 'items', 'fog', 'walls', 'agent']) this.L[k] = this.svg.querySelector('.L-' + k);
    }
    destroy() { this.alive = false; }
    el(tag, attrs, parent) {
      const e = document.createElementNS(svgNS, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      if (parent) parent.appendChild(e);
      return e;
    }
    setup(stim, kind) {
      const { C, OX, OY, COLS, ROWS } = G;
      for (const k in this.L) this.L[k].innerHTML = '';
      for (let k = 1; k < COLS; k++) this.el('line', { x1: OX + C * k, x2: OX + C * k, y1: OY, y2: OY + C * ROWS, stroke: '#E7E9ED' }, this.L.grid);
      for (let k = 1; k < ROWS; k++) this.el('line', { y1: OY + C * k, y2: OY + C * k, x1: OX, x2: OX + C * COLS, stroke: '#E7E9ED' }, this.L.grid);
      this.W = G.buildWalls(stim);
      for (const w of this.W.rects) this.el('rect', { x: w.x, y: w.y, width: w.w, height: w.h, fill: 'url(#gw-brick)', stroke: '#6E3524', 'stroke-width': 1.2 }, this.L.walls);
      // Fog: during demonstrations, cells the demonstrator has not yet seen stay covered (for the
      // participant too) and are uncovered for good once seen. Walls are always visible.
      this.fog = [];
      if (kind === 'demo') {
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          if (this.W.set.has(G.key(c, r))) continue;
          this.fog.push({ c, r, seen: false, el: this.el('rect', { x: OX + C * c, y: OY + C * r, width: C + 0.5, height: C + 0.5, fill: 'url(#gw-fog)' }, this.L.fog) });
        }
        // The open strip of a narrow gap (a wall that starts partway into a cell) is fogged too,
        // until the demonstrator can see into that cell.
        for (const [c0, r0, c1] of stim.walls) {
          if (r0 === Math.floor(r0)) continue;
          const top = Math.floor(r0);
          for (let c = Math.floor(c0); c <= Math.floor(c1); c++) {
            this.fog.push({ c, r: top, seen: false, el: this.el('rect', { x: OX + C * c, y: OY + C * top, width: C + 0.5, height: C * (r0 - top) + 0.5, fill: 'url(#gw-fog)' }, this.L.fog) });
          }
        }
      }
      this.items = stim.items.map(g => {
        const item = G.itemFor(g.role, this.cb), [cx, cy] = G.ctr(...g.cell);
        const grp = this.el('g', { 'data-role': g.role }, this.L.items);
        this.el('rect', { x: cx - 19, y: cy - 19, width: 38, height: 38, rx: 6, class: 'gw-ring' }, grp);
        this.el('use', { href: '#gw-' + item, transform: `translate(${cx},${cy}) scale(0.78)` }, grp);
        this.el('rect', { x: cx - 20, y: cy - 20, width: 40, height: 40, fill: 'transparent' }, grp);
        return Object.assign({}, g, { item, el: grp });
      });
      this.ag = this.el('g', {}, this.L.agent);
      this.ag.innerHTML = agentArt(kind === 'demo' ? this.avatar : 'player');
      [this.x, this.y] = G.ctr(...stim.start);
      this.h = -90; this.cell = stim.start.slice(); this.steps = 0;
      this.render();
    }
    reveal(x, y) {
      for (const f of this.fog) if (!f.seen && G.cellVisibleFrom(this.W.rects, x, y, f.c, f.r)) { f.seen = true; f.el.setAttribute('visibility', 'hidden'); }
    }
    render() {
      this.ag.setAttribute('transform', `translate(${this.x.toFixed(1)},${this.y.toFixed(1)}) rotate(${this.h.toFixed(1)})`);
      this.reveal(this.x, this.y);
    }
    tween(ms, fn) {
      return new Promise(res => {
        if (!this.alive) return res(false);
        const t0 = performance.now(), d = ms / this.speed;
        const f = now => {
          if (!this.alive) return res(false);
          const k = Math.min(1, (now - t0) / d);
          fn(k); this.render();
          if (k < 1) requestAnimationFrame(f); else res(true);
        };
        requestAnimationFrame(f);
      });
    }
    wait(ms) { return this.tween(ms, () => {}); }
    turnTo(deg, ms = this.T.turn) {
      const from = this.h, d = angDiff(from, deg);
      if (Math.abs(d) < 1) return Promise.resolve(this.alive);
      return this.tween(ms, k => { this.h = from + d * ease(k); });
    }
    lookAt([c, r]) { const [tx, ty] = G.ctr(c, r); return this.turnTo(Math.atan2(ty - this.y, tx - this.x) * 180 / Math.PI); }
    async stepTo(c, r) {
      const [tx, ty] = G.ctr(c, r), fx = this.x, fy = this.y;
      const hd = Math.atan2(ty - fy, tx - fx) * 180 / Math.PI;
      if (Math.abs(angDiff(this.h, hd)) > 5 && !(await this.turnTo(hd, 220))) return false;
      const ok = await this.tween(this.T.step, k => { this.x = fx + (tx - fx) * k; this.y = fy + (ty - fy) * k; });
      if (ok) { this.cell = [c, r]; this.steps++; }
      return ok;
    }
    async bump([c, r]) {
      const [tx, ty] = G.ctr(c, r), fx = this.x, fy = this.y;
      const hd = Math.atan2(ty - fy, tx - fx) * 180 / Math.PI;
      if (!(await this.turnTo(hd, 220))) return false;
      const d = 0.32; // how far into the gap Alex gets before stopping (fraction of a cell)
      if (!(await this.tween(this.T.step * 0.8, k => { const e = ease(k); this.x = fx + (tx - fx) * d * e; this.y = fy + (ty - fy) * d * e; }))) return false;
      if (!(await this.wait(this.T.look * 0.4))) return false;
      if (!(await this.tween(this.T.step * 0.8, k => { const e = ease(k); this.x = fx + (tx - fx) * d * (1 - e); this.y = fy + (ty - fy) * d * (1 - e); }))) return false;
      this.x = fx; this.y = fy;
      return this.wait(this.T.look * 0.6);
    }
    collect(it) { return this.tween(this.T.collect, k => it.el.setAttribute('opacity', (1 - k).toFixed(2))); }
    visible(it) { return G.cellVisibleFrom(this.W.rects, this.x, this.y, ...it.cell); }
    dist(it) { return Math.abs(it.cell[0] - this.cell[0]) + Math.abs(it.cell[1] - this.cell[1]); }

    // Gaze rule, identical in every demonstration: look at each visible item at the start (nearest
    // first), look toward the area to explore, and stop to look at any item when it first comes into view.
    async playDemo(stim) {
      this.setup(stim, 'demo');
      const seen = new Set();
      if (!(await this.wait(this.T.start))) return false;
      for (const it of this.items.filter(i => this.visible(i)).sort((a, b) => this.dist(a) - this.dist(b))) {
        seen.add(it); await this.lookAt(it.cell); if (!(await this.wait(this.T.look))) return false;
      }
      if (stim.startLook) { await this.lookAt(stim.startLook); await this.wait(this.T.look * 0.6); }
      for (const a of G.expand(stim)) {
        if (a.look) { await this.lookAt(a.look); await this.wait(this.T.look); }
        else if (a.bump) { await this.bump(a.bump); }
        else {
          await this.stepTo(...a.step);
          for (const it of this.items) if (!seen.has(it) && this.visible(it)) { seen.add(it); await this.lookAt(it.cell); await this.wait(this.T.look); }
        }
        if (!this.alive) return false;
      }
      const it = this.items.find(i => i.cell[0] === this.cell[0] && i.cell[1] === this.cell[1]);
      if (it) await this.collect(it);
      return this.alive;
    }

    // Participant chooses an item; resolves after walking to it and collecting it.
    choose(stim, onChosen) {
      this.setup(stim, 'player');
      return new Promise(resolve => {
        const t0 = performance.now();
        let done = false;
        for (const it of this.items) {
          it.el.classList.add('gw-clickable');
          it.el.setAttribute('tabindex', '0'); it.el.setAttribute('role', 'button');
          it.el.setAttribute('aria-label', 'Collect the ' + G.itemName(it.item));
          const pick = async () => {
            if (done) return; done = true;
            const rt = Math.round(performance.now() - t0);
            for (const x of this.items) { x.el.classList.remove('gw-clickable'); x.el.removeAttribute('tabindex'); }
            if (onChosen) onChosen();
            for (const p of G.bfs(stim.start, it.cell, this.W.set)) { if (!(await this.stepTo(...p))) return; }
            await this.collect(it);
            resolve({ it, rt });
          };
          it.el.addEventListener('click', pick);
          it.el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
        }
      });
    }

    snapshot(stim, cell, heading) {
      this.setup(stim, 'demo');
      for (const a of G.expand(stim)) {
        if (!a.step) continue;
        this.reveal(...G.ctr(...a.step));
        if (a.step[0] === cell[0] && a.step[1] === cell[1]) break;
      }
      [this.x, this.y] = G.ctr(...cell); this.cell = cell.slice(); this.h = heading;
      this.render();
    }
  }

  // ---------- Plugins ----------
  const citations = {};

  class GridDemoPlugin {
    constructor(jsPsych) { this.jsPsych = jsPsych; }
    trial(display_element, trial) {
      display_element.innerHTML = `<div class="gw-screen">${trial.header_html}
        <div class="gw-board-wrap"></div><div class="gw-below"></div>
        <div class="gw-row"><span class="gw-status"></span><button type="button" class="jspsych-btn gw-next" hidden>${trial.button_label}</button></div></div>`;
      const q = s => display_element.querySelector(s);
      const world = new GridWorld(q('.gw-board-wrap'), { cb: trial.counterbalance, speed: trial.speed, timing: trial.timing, label: 'Demonstration', avatar: trial.avatar });
      const t0 = performance.now();
      world.playDemo(trial.stimulus).then(ok => {
        if (!ok) return;
        const watch_ms = Math.round(performance.now() - t0);
        const next = q('.gw-next');
        const below = q('.gw-below');
        if (trial.prompt) {
          below.innerHTML = trial.prompt_response
            ? `<label class="gw-q" for="gw-ans">${trial.prompt}</label><textarea id="gw-ans" rows="3"></textarea><div class="gw-err" role="alert"></div>`
            : `<p class="gw-question">${trial.prompt}</p>`;
          if (trial.prompt_response) {
            q('#gw-ans').addEventListener('input', () => { q('.gw-err').textContent = ''; });
            q('#gw-ans').focus({ preventScroll: true });
          }
        }
        const tq = performance.now();
        const show = () => { next.hidden = false; };
        if (trial.prompt && trial.prompt_min_ms > 0) setTimeout(show, trial.prompt_min_ms); else show();
        next.addEventListener('click', () => {
          let response = null;
          if (trial.prompt && trial.prompt_response) {
            response = q('#gw-ans').value.trim();
            if (!response) { q('.gw-err').textContent = 'Please write a short answer to continue.'; return; }
          }
          world.destroy();
          this.jsPsych.finishTrial({ demo_id: trial.stimulus.id, watch_ms, prompt: trial.prompt, response,
            prompt_view_ms: Math.round(performance.now() - tq) });
        });
      });
    }
  }
  GridDemoPlugin.info = {
    name: 'grid-demo', version: '1.0.0',
    parameters: {
      stimulus: { type: P.COMPLEX, default: undefined },
      counterbalance: { type: P.INT, default: 0 },
      avatar: { type: P.STRING, default: 'neutral' },
      speed: { type: P.FLOAT, default: 1 },
      timing: { type: P.COMPLEX, default: {} },
      header_html: { type: P.HTML_STRING, default: '' },
      prompt: { type: P.HTML_STRING, default: null },
      prompt_response: { type: P.BOOL, default: false },
      prompt_min_ms: { type: P.INT, default: 0 },
      button_label: { type: P.STRING, default: 'Continue' }
    },
    data: {
      demo_id: { type: P.STRING }, watch_ms: { type: P.INT }, prompt: { type: P.STRING },
      response: { type: P.STRING }, prompt_view_ms: { type: P.INT }
    },
    citations
  };

  class GridChoicePlugin {
    constructor(jsPsych) { this.jsPsych = jsPsych; }
    trial(display_element, trial) {
      display_element.innerHTML = `<div class="gw-screen">${trial.header_html}
        <div class="gw-board-wrap"></div>
        <div class="gw-row"><span class="gw-status">${trial.instruction}</span><button type="button" class="jspsych-btn gw-next" hidden>${trial.button_label}</button></div></div>`;
      const q = s => display_element.querySelector(s);
      const world = new GridWorld(q('.gw-board-wrap'), { cb: trial.counterbalance, speed: trial.speed, timing: trial.timing, label: 'Your turn' });
      const stim = trial.stimulus;
      world.choose(stim, () => { q('.gw-status').textContent = ''; }).then(({ it, rt }) => {
        const data = {
          test_id: stim.id, test_kind: stim.kind,
          options: stim.items.map(i => i.role).join(''),
          choice_role: it.role, choice_rank: G.ROLE_NAMES[it.role], choice_item: G.itemName(it.item),
          chose_best_available: it.role === stim.items.map(i => i.role).sort()[0],
          steps: world.steps, points: trial.values[it.role] - trial.step_cost * world.steps, rt
        };
        const next = q('.gw-next');
        next.hidden = false;
        next.addEventListener('click', () => { world.destroy(); this.jsPsych.finishTrial(data); });
      });
    }
  }
  GridChoicePlugin.info = {
    name: 'grid-choice', version: '1.0.0',
    parameters: {
      stimulus: { type: P.COMPLEX, default: undefined },
      counterbalance: { type: P.INT, default: 0 },
      speed: { type: P.FLOAT, default: 1 },
      timing: { type: P.COMPLEX, default: {} },
      values: { type: P.COMPLEX, default: undefined },
      step_cost: { type: P.FLOAT, default: 1 },
      header_html: { type: P.HTML_STRING, default: '' },
      instruction: { type: P.HTML_STRING, default: 'Click the item you want to collect.' },
      button_label: { type: P.STRING, default: 'Continue' }
    },
    data: {
      test_id: { type: P.STRING }, test_kind: { type: P.STRING }, options: { type: P.STRING },
      choice_role: { type: P.STRING }, choice_rank: { type: P.STRING }, choice_item: { type: P.STRING },
      chose_best_available: { type: P.BOOL }, steps: { type: P.INT }, points: { type: P.FLOAT }, rt: { type: P.INT }
    },
    citations
  };

  class ItemRankingPlugin {
    constructor(jsPsych) { this.jsPsych = jsPsych; }
    trial(display_element, trial) {
      ensureDefs();
      // Random order, but never the correct (most to least valuable) order.
      let order;
      do { order = this.jsPsych.randomization.shuffle(G.ROLES.slice()); } while (order.join('') === G.ROLES.join(''));
      display_element.innerHTML = `<div class="gw-screen gw-text">${trial.preamble}
        <div class="gw-rank-pool">${order.map(r => { const it = G.itemFor(r, trial.counterbalance);
          return `<button type="button" class="gw-item-btn" data-role="${r}">${itemIcon(it, 48, false)}<span>${G.itemName(it)}</span></button>`; }).join('')}</div>
        <ol class="gw-rank-list">${G.ROLES.map((_, i) => `<li><span class="gw-rank-label">${trial.labels[i]}</span><span class="gw-rank-slot" data-i="${i}"></span></li>`).join('')}</ol>
        <div class="gw-err" role="alert"></div>
        <div class="gw-row"><button type="button" class="jspsych-btn gw-secondary gw-reset">Start over</button><button type="button" class="jspsych-btn gw-next">${trial.button_label}</button></div></div>`;
      const q = s => display_element.querySelector(s);
      const t0 = performance.now();
      let ranking = [];
      const draw = () => {
        display_element.querySelectorAll('.gw-rank-slot').forEach((slot, i) => {
          const r = ranking[i];
          slot.innerHTML = r ? (() => { const it = G.itemFor(r, trial.counterbalance); return itemIcon(it, 32, false) + `<span>${G.itemName(it)}</span>`; })() : '';
        });
        display_element.querySelectorAll('.gw-item-btn').forEach(b => { b.disabled = ranking.includes(b.dataset.role); });
      };
      display_element.querySelectorAll('.gw-item-btn').forEach(b => b.addEventListener('click', () => {
        if (!ranking.includes(b.dataset.role)) { ranking.push(b.dataset.role); q('.gw-err').textContent = ''; draw(); }
      }));
      q('.gw-reset').addEventListener('click', () => { ranking = []; draw(); });
      q('.gw-next').addEventListener('click', () => {
        if (ranking.length < G.ROLES.length) { q('.gw-err').textContent = 'Please place all the resources in order to continue.'; return; }
        const pos = Object.fromEntries(ranking.map((r, i) => [r, i + 1]));
        this.jsPsych.finishTrial({
          display_order: order.map(r => G.itemName(G.itemFor(r, trial.counterbalance))).join(','),
          ranking_roles: ranking.join(''), ranking_items: ranking.map(r => G.itemName(G.itemFor(r, trial.counterbalance))).join('>'),
          rank_of_best: pos.A, rank_of_second: pos.B, rank_of_third: pos.C, rank_of_worst: pos.D,
          ranking_correct: ranking.join('') === G.ROLES.join(''), best_above_second: pos.A < pos.B,
          rt: Math.round(performance.now() - t0)
        });
      });
      draw();
    }
  }
  ItemRankingPlugin.info = {
    name: 'item-ranking', version: '1.0.0',
    parameters: {
      counterbalance: { type: P.INT, default: 0 },
      preamble: { type: P.HTML_STRING, default: '' },
      labels: { type: P.COMPLEX, default: ['Most valuable', 'Second', 'Third', 'Least valuable'] },
      button_label: { type: P.STRING, default: 'Continue' }
    },
    data: {
      display_order: { type: P.STRING }, ranking_roles: { type: P.STRING }, ranking_items: { type: P.STRING },
      rank_of_best: { type: P.INT }, rank_of_second: { type: P.INT }, rank_of_third: { type: P.INT }, rank_of_worst: { type: P.INT },
      ranking_correct: { type: P.BOOL }, best_above_second: { type: P.BOOL }, rt: { type: P.INT }
    },
    citations
  };

  class GridProbePlugin {
    constructor(jsPsych) { this.jsPsych = jsPsych; }
    trial(display_element, trial) {
      ensureDefs();
      const roles = this.jsPsych.randomization.shuffle(G.ROLES.slice());
      const opts = roles.map(r => { const it = G.itemFor(r, trial.counterbalance);
        return `<button type="button" class="gw-item-btn gw-opt" data-choice="${r}" aria-pressed="false">${itemIcon(it, 40, false)}<span>${G.itemName(it)}</span></button>`; });
      opts.push(`<button type="button" class="gw-item-btn gw-opt" data-choice="none" aria-pressed="false"><span>${trial.none_label}</span></button>`);
      display_element.innerHTML = `<div class="gw-screen">${trial.header_html}<div class="gw-board-wrap"></div>
        <p class="gw-q">${trial.prompt}</p><div class="gw-rank-pool">${opts.join('')}</div>
        ${trial.ask_confidence ? `<label class="gw-q" for="gw-conf">How confident are you?</label>
          <input id="gw-conf" type="range" min="0" max="100" value="50" class="gw-slider">
          <div class="gw-scale-ends"><span>Just guessing</span><span>Completely sure</span></div>` : ''}
        <div class="gw-err" role="alert"></div>
        <div class="gw-row"><span></span><button type="button" class="jspsych-btn gw-next">${trial.button_label}</button></div></div>`;
      const q = s => display_element.querySelector(s);
      const world = new GridWorld(q('.gw-board-wrap'), { cb: trial.counterbalance, label: 'Moment from a demonstration', avatar: trial.avatar });
      world.snapshot(trial.stimulus, trial.agent_cell, trial.heading);
      const t0 = performance.now();
      let choice = null, choiceRt = null, moved = false;
      display_element.querySelectorAll('.gw-opt').forEach(b => b.addEventListener('click', () => {
        choice = b.dataset.choice; choiceRt = Math.round(performance.now() - t0); q('.gw-err').textContent = '';
        display_element.querySelectorAll('.gw-opt').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      }));
      if (trial.ask_confidence) q('#gw-conf').addEventListener('input', () => { moved = true; q('.gw-err').textContent = ''; });
      q('.gw-next').addEventListener('click', () => {
        if (!choice) { q('.gw-err').textContent = 'Please choose an answer.'; return; }
        if (trial.ask_confidence && !moved) { q('.gw-err').textContent = 'Please move the slider to show how confident you are.'; return; }
        world.destroy();
        this.jsPsych.finishTrial({
          probe_id: trial.probe_id, probe_choice: choice,
          probe_choice_item: choice === 'none' ? 'none' : G.itemName(G.itemFor(choice, trial.counterbalance)),
          probe_correct: choice === trial.correct, probe_rt: choiceRt,
          confidence: trial.ask_confidence ? Number(q('#gw-conf').value) : null
        });
      });
    }
  }
  GridProbePlugin.info = {
    name: 'grid-probe', version: '1.0.0',
    parameters: {
      probe_id: { type: P.STRING, default: '' },
      stimulus: { type: P.COMPLEX, default: undefined },
      agent_cell: { type: P.COMPLEX, default: undefined },
      avatar: { type: P.STRING, default: 'neutral' },
      heading: { type: P.FLOAT, default: 0 },
      counterbalance: { type: P.INT, default: 0 },
      header_html: { type: P.HTML_STRING, default: '' },
      prompt: { type: P.HTML_STRING, default: '' },
      none_label: { type: P.STRING, default: 'Nothing in particular' },
      correct: { type: P.STRING, default: 'A' },
      ask_confidence: { type: P.BOOL, default: true },
      button_label: { type: P.STRING, default: 'Continue' }
    },
    data: {
      probe_id: { type: P.STRING }, probe_choice: { type: P.STRING }, probe_choice_item: { type: P.STRING },
      probe_correct: { type: P.BOOL }, probe_rt: { type: P.INT }, confidence: { type: P.INT }
    },
    citations
  };

  window.GridWorld = GridWorld;
  window.GridArt = { itemIcon, agentIcon, portrait, ensureDefs, AVATARS };
  window.jsPsychGridDemo = GridDemoPlugin;
  window.jsPsychGridChoice = GridChoicePlugin;
  window.jsPsychItemRanking = ItemRankingPlugin;
  window.jsPsychGridProbe = GridProbePlugin;
})();
