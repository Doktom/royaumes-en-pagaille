'use strict';
// ---------------------------------------------------------------
// Rendu canvas 2D : terrain, territoire, bâtiments, unités, effets
// ---------------------------------------------------------------
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function rgba(h, a) { const c = hexRgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
function shade(h, k) { const c = hexRgb(h).map(v => Math.max(0, Math.min(255, Math.round(v * k)))); return `rgb(${c[0]},${c[1]},${c[2]})`; }
const RES_ICON = { food: '🌾', wood: '🪵', stone: '🪨' };

class Renderer {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.parts = []; this.bubbles = []; this.sim = null; this.T = 20; this.dpr = 1;
    this.clouds = [];
    for (let i = 0; i < 7; i++) this.clouds.push({ x: Math.random(), y: Math.random(), r: 0.08 + Math.random() * 0.09, v: 0.004 + Math.random() * 0.006 });
  }
  setSim(sim) { this.sim = sim; this.parts = []; this.bubbles = []; this.terrOff = null; this.ovVersion = -1; }
  resize(px) {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.size = Math.floor(px);
    this.T = this.size / MAP_W;
    this.cv.width = Math.floor(this.size * this.dpr); this.cv.height = Math.floor(this.size * this.dpr);
    this.cv.style.width = this.size + 'px'; this.cv.style.height = this.size + 'px';
    this.terrOff = null; this.ovVersion = -1;
  }
  tileAt(clientX, clientY) {
    const r = this.cv.getBoundingClientRect();
    const x = Math.floor((clientX - r.left) / r.width * MAP_W), y = Math.floor((clientY - r.top) / r.height * MAP_H);
    return (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) ? { x, y } : null;
  }

  // -------------------------------------------------------- Terrain statique
  makeLayer() {
    const c = document.createElement('canvas');
    c.width = this.cv.width; c.height = this.cv.height;
    const x = c.getContext('2d'); x.scale(this.dpr, this.dpr);
    return [c, x];
  }
  paintTerrain() {
    const sim = this.sim, T = this.T, [c, g] = this.makeLayer();
    this.terrOff = c;
    const W = sim.W, H = sim.H, ter = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? T_WATER : sim.terrain[y * W + x];
    this.shore = new Uint8Array(W * H);
    // sols
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = ter(x, y), h = hash2(x, y, 5);
      if (t === T_WATER) {
        let land = 0;
        for (const [dx, dy] of NEIGH8) if (ter(x + dx, y + dy) !== T_WATER) land++;
        this.shore[y * W + x] = land ? 1 : 0;
        g.fillStyle = land ? '#74cde6' : (h < 0.5 ? '#4fb0d8' : '#4aaad3');
      } else if (t === T_MOUNTAIN) g.fillStyle = h < 0.5 ? '#b9ae96' : '#b3a88f';
      else g.fillStyle = h < 0.33 ? '#a9d868' : h < 0.66 ? '#a2d262' : '#9ccc5c';
      g.fillRect(x * T, y * T, T + 0.5, T + 0.5);
    }
    // plages
    g.fillStyle = '#efe0a8';
    const sand = Math.max(2, T * 0.14);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (ter(x, y) === T_WATER) continue;
      if (ter(x, y - 1) === T_WATER) g.fillRect(x * T, y * T, T, sand);
      if (ter(x, y + 1) === T_WATER) g.fillRect(x * T, (y + 1) * T - sand, T, sand);
      if (ter(x - 1, y) === T_WATER) g.fillRect(x * T, y * T, sand, T);
      if (ter(x + 1, y) === T_WATER) g.fillRect((x + 1) * T - sand, y * T, sand, T);
    }
    // décors (ordre y pour la profondeur)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = ter(x, y), h1 = hash2(x, y, 11), h2 = hash2(x, y, 12), h3 = hash2(x, y, 13);
      const px = x * T, py = y * T;
      if (t === T_PLAIN) {
        g.strokeStyle = 'rgba(70,130,40,.55)'; g.lineWidth = Math.max(1, T * 0.05); g.lineCap = 'round';
        for (let k = 0; k < 3; k++) {
          const gx = px + T * (0.15 + hash2(x, y, 20 + k) * 0.7), gy = py + T * (0.25 + hash2(x, y, 30 + k) * 0.65);
          g.beginPath(); g.moveTo(gx - T * 0.06, gy); g.lineTo(gx, gy - T * 0.12); g.lineTo(gx + T * 0.06, gy); g.stroke();
        }
        if (h1 < 0.1) {
          g.fillStyle = h2 < 0.33 ? '#fff6ff' : h2 < 0.66 ? '#ffe36a' : '#ff9ec2';
          const fx = px + T * (0.2 + h3 * 0.6), fy = py + T * (0.2 + h2 * 0.6);
          g.beginPath(); g.arc(fx, fy, T * 0.05, 0, 7); g.fill();
        }
      } else if (t === T_FOREST) {
        const n = 3;
        const trees = [];
        for (let k = 0; k < n; k++) trees.push({ x: px + T * (0.2 + hash2(x, y, 40 + k) * 0.6), y: py + T * (0.42 + hash2(x, y, 50 + k) * 0.5), s: 0.85 + hash2(x, y, 60 + k) * 0.5, pine: hash2(x, y, 70 + k) < 0.4 });
        trees.sort((a, b) => a.y - b.y);
        for (const tr of trees) this.drawTree(g, tr.x, tr.y, T * 0.34 * tr.s, tr.pine);
      } else if (t === T_MOUNTAIN) {
        const peaks = [[0.32, 0.78, 0.5], [0.7, 0.88, 0.42]];
        if (h1 < 0.5) peaks.push([0.52, 0.55, 0.34]);
        peaks.sort((a, b) => a[1] - b[1]);
        for (const [fx, fy, fs] of peaks) this.drawPeak(g, px + T * fx, py + T * fy, T * fs * (0.9 + h2 * 0.25));
      }
    }
  }
  drawTree(g, x, y, r, pine) {
    g.fillStyle = 'rgba(0,0,0,.16)'; g.beginPath(); g.ellipse(x, y + r * 0.2, r * 0.9, r * 0.32, 0, 0, 7); g.fill();
    g.fillStyle = '#7a5230'; g.fillRect(x - r * 0.12, y - r * 0.5, r * 0.24, r * 0.7);
    if (pine) {
      for (let k = 0; k < 3; k++) {
        const yy = y - r * (0.35 + k * 0.5), ww = r * (0.95 - k * 0.22);
        g.fillStyle = k % 2 ? '#2f8a4a' : '#2a7d42';
        g.beginPath(); g.moveTo(x - ww, yy + r * 0.3); g.lineTo(x, yy - r * 0.55); g.lineTo(x + ww, yy + r * 0.3); g.closePath(); g.fill();
      }
    } else {
      g.fillStyle = '#2f8f4a'; g.beginPath(); g.arc(x - r * 0.35, y - r * 0.95, r * 0.7, 0, 7); g.arc(x + r * 0.35, y - r * 0.95, r * 0.7, 0, 7); g.arc(x, y - r * 1.45, r * 0.7, 0, 7); g.fill();
      g.fillStyle = '#4fb260'; g.beginPath(); g.arc(x - r * 0.15, y - r * 1.55, r * 0.38, 0, 7); g.fill();
    }
  }
  drawPeak(g, x, y, s) {
    g.fillStyle = 'rgba(0,0,0,.14)'; g.beginPath(); g.ellipse(x + s * 0.1, y, s * 1.0, s * 0.2, 0, 0, 7); g.fill();
    g.fillStyle = '#8c8f9a'; g.beginPath(); g.moveTo(x - s, y); g.lineTo(x, y - s * 1.35); g.lineTo(x + s, y); g.closePath(); g.fill();
    g.fillStyle = '#6f7380'; g.beginPath(); g.moveTo(x, y - s * 1.35); g.lineTo(x + s, y); g.lineTo(x + s * 0.1, y); g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(x, y - s * 1.35); g.lineTo(x - s * 0.34, y - s * 0.8); g.lineTo(x - s * 0.1, y - s * 0.9); g.lineTo(x + s * 0.06, y - s * 0.78); g.lineTo(x + s * 0.3, y - s * 0.85); g.closePath(); g.fill();
  }

  // -------------------------------------------------------- Territoire (cache)
  paintOverlay() {
    const sim = this.sim, T = this.T, [c, g] = this.makeLayer();
    this.ov = c; this.ovVersion = sim.terrVersion;
    const W = sim.W, H = sim.H;
    const o = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? -2 : (sim.terrain[y * W + x] === T_WATER ? -3 : sim.owner[y * W + x]);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const ow = sim.owner[y * W + x];
      if (ow < 0) continue;
      g.fillStyle = rgba(sim.civs[ow].color, 0.26);
      g.fillRect(x * T, y * T, T + 0.5, T + 0.5);
    }
    g.lineCap = 'round';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const ow = sim.owner[y * W + x];
      if (ow < 0) continue;
      const col = sim.civs[ow].color;
      const edges = [[0, -1, x * T, y * T, (x + 1) * T, y * T], [0, 1, x * T, (y + 1) * T, (x + 1) * T, (y + 1) * T], [-1, 0, x * T, y * T, x * T, (y + 1) * T], [1, 0, (x + 1) * T, y * T, (x + 1) * T, (y + 1) * T]];
      for (const [dx, dy, x1, y1, x2, y2] of edges) {
        const n = o(x + dx, y + dy);
        if (n === ow || n === -2 || n === -3) continue;
        g.strokeStyle = shade(col, 0.55); g.lineWidth = Math.max(3, T * 0.17);
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
        g.strokeStyle = col; g.lineWidth = Math.max(1.6, T * 0.09);
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      }
    }
  }

  // -------------------------------------------------------- Événements -> particules
  consume(events) {
    const T = this.T, P = this.parts;
    for (const e of events) {
      switch (e.type) {
        case 'build': for (let i = 0; i < 7; i++) this.puff(e.x * T, e.y * T + T * 0.2, '#e8dcc0', 0.8); break;
        case 'destroy': {
          const n = e.big ? 46 : 16;
          for (let i = 0; i < n; i++) this.puff(e.x * T + (Math.random() - 0.5) * T, e.y * T + (Math.random() - 0.5) * T * 0.6, i % 3 ? '#6b625a' : '#ff9a2e', e.big ? 2.2 : 1.3);
          for (let i = 0; i < n; i++) P.push({ k: 'spark', x: e.x * T, y: e.y * T, vx: (Math.random() - 0.5) * T * 5, vy: -Math.random() * T * 5, life: 0.8 + Math.random() * 0.5, max: 1.3, c: '#ffc23a', s: T * 0.07 });
          break;
        }
        case 'death': for (let i = 0; i < (e.big ? 12 : 5); i++) this.puff(e.x * T, e.y * T, '#f4f0e6', 0.7); P.push({ k: 'text', x: e.x * T, y: e.y * T - T * 0.2, vy: -T * 0.8, life: 0.9, max: 0.9, t: ['💫', '✖', 'Aïe', 'Oups'][Math.floor(Math.random() * 4)], c: '#fff' }); break;
        case 'hit': P.push({ k: 'spark', x: e.x * T, y: e.y * T, vx: (Math.random() - 0.5) * T * 3, vy: -Math.random() * T * 2, life: 0.25, max: 0.25, c: '#fff3a0', s: T * 0.06 }); break;
        case 'arrow': P.push({ k: 'arrow', x1: e.x1 * T, y1: e.y1 * T, x2: e.x2 * T, y2: e.y2 * T, life: 0.22, max: 0.22 }); break;
        case 'explosion': for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28, d = Math.random() * e.r * T * 0.9; this.puff(e.x * T + Math.cos(a) * d, e.y * T + Math.sin(a) * d, i % 2 ? '#ff7a1c' : '#ffd23a', 1.5); } P.push({ k: 'ring', x: e.x * T, y: e.y * T, r0: 0, r1: e.r * T, life: 0.6, max: 0.6, c: '#ffb13a' }); break;
        case 'mud': P.push({ k: 'mud', x: e.x * T, y: e.y * T, r: e.r * T, life: 30, max: 30 }); break;
        case 'float': P.push({ k: 'text', x: e.x * T, y: e.y * T, vy: -T * 0.9, life: 1.8, max: 1.8, t: `+${Math.round(e.amt)} ${RES_ICON[e.res]}`, c: '#fff', big: true }); break;
        case 'quip': this.bubbles = this.bubbles.filter(b => Math.hypot(b.x - e.x * T, b.y - e.y * T) > T * 2.5); if (this.bubbles.length < 7) this.bubbles.push({ x: e.x * T, y: e.y * T - T * 0.5, t: e.text, life: 3.6, max: 3.6 }); break;
        case 'attackOrder': P.push({ k: 'ring', x: e.x * T, y: e.y * T, r0: T * 2, r1: T * 0.3, life: 1.4, max: 1.4, c: '#ff5a4a' }); break;
        case 'cardPlayed': if (e.x >= 0) P.push({ k: 'ring', x: e.x * T, y: e.y * T, r0: 0, r1: T * 2.2, life: 0.9, max: 0.9, c: '#ffe27a' }); break;
        case 'claims': {
          const W = MAP_W, col = this.sim.civs[e.civ].color;
          if (P.length < 600) for (const i of e.tiles) P.push({ k: 'flash', x: (i % W) * T, y: Math.floor(i / W) * T, w: T, c: col, life: 0.9, max: 0.9 });
          break;
        }
        case 'quake':
          this.shake = { t: 0.8, mag: T * 0.28 };
          for (let i = 0; i < 26; i++) { const a = Math.random() * 6.28, d = Math.random() * e.r * T; this.puff(e.x * T + Math.cos(a) * d, e.y * T + Math.sin(a) * d, i % 2 ? '#9a8a70' : '#6b5d48', 1.6); }
          P.push({ k: 'ring', x: e.x * T, y: e.y * T, r0: 0, r1: e.r * T, life: 0.9, max: 0.9, c: '#b89b6a' });
          break;
        case 'rock': P.push({ k: 'rock', x1: e.x1 * T, y1: e.y1 * T, x2: e.x2 * T, y2: e.y2 * T, life: 0.55, max: 0.55 }); break;
        case 'fire': for (let i = 0; i < 3; i++) this.puff(e.x * T, e.y * T, i % 2 ? '#ff7a1c' : '#ffd23a', 1.3); break;
        case 'upgrade': P.push({ k: 'ring', x: e.x * T, y: e.y * T, r0: 0, r1: T * 1.1, life: 0.8, max: 0.8, c: '#ffd23a' }); P.push({ k: 'text', x: e.x * T, y: e.y * T - T * 0.3, vy: -T * 0.8, life: 1.2, max: 1.2, t: '⭐', c: '#fff', big: true }); break;
        case 'dragon': P.push({ k: 'ring', x: e.x * T, y: e.y * T, r0: T * 0.3, r1: T * 3, life: 1.0, max: 1.0, c: '#ff6a3a' }); P.push({ k: 'text', x: e.x * T, y: e.y * T - T * 0.5, vy: -T * 0.6, life: 1.6, max: 1.6, t: 'GRAOUUU !', c: '#ffb13a', big: true }); break;
        case 'spawn': P.push({ k: 'ring', x: e.x * T, y: e.y * T, r0: T * 0.1, r1: T * 0.5, life: 0.4, max: 0.4, c: '#ffffff' }); break;
      }
    }
    if (P.length > 900) P.splice(0, P.length - 900);
  }
  puff(x, y, c, k) {
    const T = this.T;
    this.parts.push({ k: 'puff', x, y, vx: (Math.random() - 0.5) * T * 0.8, vy: -T * (0.2 + Math.random() * 0.7), life: 0.6 + Math.random() * 0.8, max: 1.4, c, s: T * (0.1 + Math.random() * 0.14) * k });
  }
  updateParts(dt) {
    for (const p of this.parts) {
      p.life -= dt;
      if (p.vx != null) p.x += p.vx * dt;
      if (p.vy != null) { p.y += p.vy * dt; if (p.k === 'spark') p.vy += this.T * 9 * dt; }
    }
    this.parts = this.parts.filter(p => p.life > 0);
    for (const b of this.bubbles) b.life -= dt;
    this.bubbles = this.bubbles.filter(b => b.life > 0);
  }

  // -------------------------------------------------------- Rendu principal
  draw(now, dt, view) {
    const sim = this.sim, g = this.ctx, T = this.T;
    if (!this.terrOff) this.paintTerrain();
    if (this.ovVersion !== sim.terrVersion) this.paintOverlay();
    this.updateParts(dt);
    let sx = 0, sy = 0;
    if (this.shake && this.shake.t > 0) {
      this.shake.t -= dt;
      const k = Math.max(0, this.shake.t / 0.8) * this.shake.mag;
      sx = (Math.random() - 0.5) * 2 * k; sy = (Math.random() - 0.5) * 2 * k;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#4a3a28'; g.fillRect(0, 0, this.cv.width, this.cv.height);
    g.setTransform(1, 0, 0, 1, sx * this.dpr, sy * this.dpr);
    g.drawImage(this.terrOff, 0, 0);
    g.setTransform(this.dpr, 0, 0, this.dpr, sx * this.dpr, sy * this.dpr);
    this.drawWater(g, now);
    g.setTransform(1, 0, 0, 1, sx * this.dpr, sy * this.dpr);
    g.drawImage(this.ov, 0, 0);
    g.setTransform(this.dpr, 0, 0, this.dpr, sx * this.dpr, sy * this.dpr);
    // flashs de territoire
    for (const p of this.parts) if (p.k === 'flash') { g.globalAlpha = Math.max(0, p.life / p.max) * 0.65; g.fillStyle = p.c; g.fillRect(p.x, p.y, p.w, p.w); }
    g.globalAlpha = 1;
    // boue
    for (const p of this.parts) if (p.k === 'mud') {
      g.fillStyle = `rgba(110,72,40,${0.32 * Math.min(1, p.life / 3)})`;
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
    }
    // bâtiments triés par y
    const bl = sim.buildings.slice().sort((a, b) => a.y - b.y);
    for (const b of bl) this.drawBuilding(g, b, now, sim);
    for (const b of bl) if (BUILDINGS[b.type].prod) this.drawWorkers(g, b, now, sim);
    // unités
    const ul = sim.units.slice().sort((a, b) => a.y - b.y);
    for (const u of ul) if (u.type !== 'dragon') this.drawUnit(g, u, now, sim);
    for (const u of ul) if (u.type === 'dragon') this.drawDragon(g, u, now, sim);
    // particules
    this.drawParts(g);
    this.drawClouds(g, now, dt);
    if (view && view.targeting) this.drawTargeting(g, now, view, sim);
    this.drawLabels(g, sim);
    this.drawBubbles(g);
  }
  drawWater(g, now) {
    const sim = this.sim, T = this.T;
    g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = Math.max(1, T * 0.06); g.lineCap = 'round';
    for (let y = 0; y < sim.H; y++) for (let x = 0; x < sim.W; x++) {
      if (sim.terrain[y * sim.W + x] !== T_WATER) continue;
      const h = hash2(x, y, 99);
      const ph = now * 0.0012 + h * 6.28, a = (Math.sin(ph) + 1) / 2;
      if (a < 0.25) continue;
      g.globalAlpha = a;
      const wx = x * T + T * (0.2 + h * 0.4), wy = y * T + T * (0.35 + (1 - h) * 0.35);
      g.beginPath(); g.moveTo(wx, wy); g.quadraticCurveTo(wx + T * 0.15, wy - T * 0.1, wx + T * 0.3, wy); g.stroke();
    }
    g.globalAlpha = 1;
  }
  drawClouds(g, now, dt) {
    const S = this.size;
    for (const c of this.clouds) {
      c.x += c.v * dt * 0.5; if (c.x > 1.3) c.x = -0.3;
      const x = c.x * S, y = c.y * S, r = c.r * S;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(20,30,50,.12)'); gr.addColorStop(1, 'rgba(20,30,50,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r * 1.5, r, 0, 0, 7); g.fill();
    }
  }
  drawParts(g) {
    const T = this.T;
    for (const p of this.parts) {
      const f = Math.max(0, p.life / p.max);
      if (p.k === 'puff') { g.globalAlpha = f * 0.8; g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, p.s * (1.4 - f * 0.4), 0, 7); g.fill(); }
      else if (p.k === 'spark') { g.globalAlpha = f; g.fillStyle = p.c; g.fillRect(p.x, p.y, p.s, p.s); }
      else if (p.k === 'arrow') {
        const t = 1 - f, x = p.x1 + (p.x2 - p.x1) * t, y = p.y1 + (p.y2 - p.y1) * t - Math.sin(t * Math.PI) * T * 0.4;
        const px = p.x1 + (p.x2 - p.x1) * Math.max(0, t - 0.15), py = p.y1 + (p.y2 - p.y1) * Math.max(0, t - 0.15) - Math.sin(Math.max(0, t - 0.15) * Math.PI) * T * 0.4;
        g.globalAlpha = 1; g.strokeStyle = '#4a3a28'; g.lineWidth = Math.max(1.2, T * 0.05);
        g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke();
      } else if (p.k === 'rock') {
        const t = 1 - f, x = p.x1 + (p.x2 - p.x1) * t, y = p.y1 + (p.y2 - p.y1) * t - Math.sin(t * Math.PI) * T * 1.4;
        g.globalAlpha = 1; g.fillStyle = '#6f6a62'; g.strokeStyle = '#2f2a24'; g.lineWidth = 1.3;
        g.beginPath(); g.arc(x, y, T * 0.1, 0, 7); g.fill(); g.stroke();
      } else if (p.k === 'ring') { const t = 1 - f; g.globalAlpha = f; g.strokeStyle = p.c; g.lineWidth = Math.max(2, T * 0.12); g.beginPath(); g.arc(p.x, p.y, p.r0 + (p.r1 - p.r0) * t, 0, 7); g.stroke(); }
      else if (p.k === 'text') {
        g.globalAlpha = Math.min(1, f * 2); g.font = `${p.big ? 800 : 700} ${Math.round(T * (p.big ? 0.62 : 0.5))}px "Trebuchet MS",sans-serif`; g.textAlign = 'center';
        g.lineWidth = 3; g.strokeStyle = 'rgba(40,30,20,.8)'; g.strokeText(p.t, p.x, p.y); g.fillStyle = p.c; g.fillText(p.t, p.x, p.y);
      }
    }
    g.globalAlpha = 1;
  }
  drawBubbles(g) {
    const T = this.T, fs = Math.max(10, Math.round(T * 0.4));
    g.font = `600 ${fs}px "Trebuchet MS",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const b of this.bubbles) {
      const a = Math.min(1, b.life / 0.5, (b.max - b.life) / 0.2 + 0.0);
      const words = b.t.split(' '), lines = [''];
      for (const w of words) { const cur = lines[lines.length - 1]; if (g.measureText(cur + ' ' + w).width > T * 6.4 && cur) lines.push(w); else lines[lines.length - 1] = cur ? cur + ' ' + w : w; }
      let w = 0; for (const l of lines) w = Math.max(w, g.measureText(l).width);
      const bw = w + fs * 1.1, bh = lines.length * fs * 1.15 + fs * 0.7;
      let bx = Math.min(this.size - bw / 2 - 2, Math.max(bw / 2 + 2, b.x)), by = Math.max(bh + 4, b.y - b.max * 0 - (b.max - b.life) * T * 0.08);
      g.globalAlpha = Math.max(0, Math.min(1, a));
      g.fillStyle = '#fffdf4'; g.strokeStyle = '#4a3a28'; g.lineWidth = 1.6;
      g.beginPath(); g.roundRect(bx - bw / 2, by - bh, bw, bh, fs * 0.5); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(b.x - fs * 0.25, by - 1); g.lineTo(b.x, by + fs * 0.45); g.lineTo(b.x + fs * 0.25, by - 1); g.closePath(); g.fillStyle = '#fffdf4'; g.fill(); g.stroke();
      g.fillStyle = '#fffdf4'; g.fillRect(b.x - fs * 0.22, by - 3, fs * 0.44, 3);
      g.fillStyle = '#3a2d1e';
      lines.forEach((l, i) => g.fillText(l, bx, by - bh + fs * 0.35 + fs * 0.58 + i * fs * 1.15));
    }
    g.globalAlpha = 1; g.textBaseline = 'alphabetic';
  }
  drawLabels(g, sim) {
    const T = this.T;
    g.textAlign = 'center'; g.font = `800 ${Math.max(9, Math.round(T * 0.36))}px "Trebuchet MS",sans-serif`;
    for (const c of sim.civs) {
      if (!c.alive || !c.cap) continue;
      const x = (c.cap.x + 0.5) * T, y = (c.cap.y + 1.55) * T;
      const label = c.isPlayer ? '★ ' + c.id.toUpperCase() : c.id.toUpperCase();
      g.lineWidth = 3.5; g.strokeStyle = 'rgba(30,20,10,.85)'; g.strokeText(label, x, y);
      g.fillStyle = c.color; g.fillText(label, x, y);
    }
  }
  drawTargeting(g, now, view, sim) {
    const T = this.T, card = view.targeting, c = sim.civs[0];
    const pulse = 0.14 + 0.08 * Math.sin(now * 0.006);
    g.fillStyle = `rgba(255,248,170,${pulse})`;
    for (let y = 0; y < sim.H; y++) for (let x = 0; x < sim.W; x++) if (sim.validTarget(card, c, x, y)) g.fillRect(x * T, y * T, T, T);
    if (view.hover) {
      const ok = sim.validTarget(card, c, view.hover.x, view.hover.y);
      const hx = (view.hover.x + 0.5) * T, hy = (view.hover.y + 0.5) * T;
      g.strokeStyle = ok ? '#ffe45a' : '#ff6a5a'; g.lineWidth = 3;
      g.strokeRect(view.hover.x * T + 1, view.hover.y * T + 1, T - 2, T - 2);
      const rad = card.id === 'fire' ? 2.3 : card.id === 'mud' ? 3.6 : 0;
      if (rad) { g.beginPath(); g.arc(hx, hy, rad * T, 0, 7); g.setLineDash([6, 5]); g.stroke(); g.setLineDash([]); }
    }
  }

  // -------------------------------------------------------- Bâtiments
  flag(g, x, y, h, col, now, id) {
    const T = this.T;
    g.strokeStyle = '#4a3a28'; g.lineWidth = Math.max(1.2, T * 0.05);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - h); g.stroke();
    const w = h * 0.7, wave = Math.sin(now * 0.006 + id) * h * 0.08;
    g.fillStyle = col; g.beginPath(); g.moveTo(x, y - h); g.quadraticCurveTo(x + w * 0.5, y - h + wave - h * 0.06, x + w, y - h + h * 0.12 + wave); g.quadraticCurveTo(x + w * 0.5, y - h * 0.5 + wave, x, y - h * 0.5); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.stroke();
  }
  drawBuilding(g, b, now, sim) {
    const T = this.T, c = sim.civs[b.civ], cx = (b.x + 0.5) * T, cy = (b.y + 0.5) * T;
    const age = sim.time - b.born;
    const grow = (b.instant ? 1 : Math.min(1, 0.25 + age / 0.7 * 0.75)) * (1 + 0.07 * ((b.lvl || 1) - 1));
    const bounce = grow < 1 ? 1 + Math.sin(grow * Math.PI) * 0.15 : 1;
    g.save(); g.translate(cx, cy + T * 0.4); g.scale(grow * bounce, grow * bounce); g.translate(-cx, -(cy + T * 0.4));
    const col = c.color, dark = c.dark;
    g.lineJoin = 'round';
    const shadow = (w) => { g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.ellipse(cx, cy + T * 0.36, w, T * 0.12, 0, 0, 7); g.fill(); };
    const line = '#4a3a28';
    switch (b.type) {
      case 'capital': {
        const s = T * 1.7; shadow(s * 0.5);
        g.fillStyle = '#d3cdc0'; g.strokeStyle = line; g.lineWidth = 1.6;
        g.fillRect(cx - s * 0.32, cy - s * 0.1, s * 0.64, s * 0.42); g.strokeRect(cx - s * 0.32, cy - s * 0.1, s * 0.64, s * 0.42);
        for (const sx of [-1, 1]) {
          const tx = cx + sx * s * 0.34;
          g.fillStyle = '#c3bcae'; g.fillRect(tx - s * 0.1, cy - s * 0.28, s * 0.2, s * 0.6); g.strokeRect(tx - s * 0.1, cy - s * 0.28, s * 0.2, s * 0.6);
          g.fillStyle = col; g.beginPath(); g.moveTo(tx - s * 0.13, cy - s * 0.28); g.lineTo(tx, cy - s * 0.52); g.lineTo(tx + s * 0.13, cy - s * 0.28); g.closePath(); g.fill(); g.stroke();
        }
        g.fillStyle = '#d3cdc0'; g.fillRect(cx - s * 0.17, cy - s * 0.34, s * 0.34, s * 0.3); g.strokeRect(cx - s * 0.17, cy - s * 0.34, s * 0.34, s * 0.3);
        g.fillStyle = col; g.beginPath(); g.moveTo(cx - s * 0.21, cy - s * 0.34); g.lineTo(cx, cy - s * 0.66); g.lineTo(cx + s * 0.21, cy - s * 0.34); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = '#5a3d22'; g.beginPath(); g.moveTo(cx - s * 0.08, cy + s * 0.32); g.lineTo(cx - s * 0.08, cy + s * 0.14); g.arc(cx, cy + s * 0.14, s * 0.08, Math.PI, 0); g.lineTo(cx + s * 0.08, cy + s * 0.32); g.closePath(); g.fill();
        this.flag(g, cx, cy - s * 0.64, s * 0.42, col, now, b.id);
        break;
      }
      case 'village': {
        shadow(T * 0.4); g.strokeStyle = line; g.lineWidth = 1.4;
        g.fillStyle = '#f3e5c3'; g.fillRect(cx - T * 0.27, cy - T * 0.05, T * 0.54, T * 0.38); g.strokeRect(cx - T * 0.27, cy - T * 0.05, T * 0.54, T * 0.38);
        g.fillStyle = '#7a4d2a'; g.fillRect(cx - T * 0.06, cy + T * 0.13, T * 0.12, T * 0.2);
        g.fillStyle = '#9fd6ef'; g.fillRect(cx + T * 0.1, cy + T * 0.03, T * 0.1, T * 0.1);
        g.fillStyle = col; g.beginPath(); g.moveTo(cx - T * 0.36, cy - T * 0.03); g.lineTo(cx, cy - T * 0.4); g.lineTo(cx + T * 0.36, cy - T * 0.03); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = '#8c8174'; g.fillRect(cx + T * 0.14, cy - T * 0.34, T * 0.09, T * 0.2);
        if (Math.random() < 0.02) this.parts.push({ k: 'puff', x: cx + T * 0.18, y: cy - T * 0.36, vx: T * 0.1, vy: -T * 0.4, life: 1.5, max: 1.5, c: '#e8e8e8', s: T * 0.1 });
        break;
      }
      case 'farm': {
        g.fillStyle = '#9b6a3c'; g.strokeStyle = line; g.lineWidth = 1.2;
        g.fillRect(cx - T * 0.42, cy - T * 0.3, T * 0.84, T * 0.66); g.strokeRect(cx - T * 0.42, cy - T * 0.3, T * 0.84, T * 0.66);
        for (let i = 0; i < 4; i++) {
          g.fillStyle = i % 2 ? '#e7c24c' : '#8bc34a';
          g.fillRect(cx - T * 0.38 + i * T * 0.2, cy - T * 0.26, T * 0.11, T * 0.58);
        }
        g.strokeStyle = '#6b4a2a'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(cx + T * 0.3, cy + T * 0.3); g.lineTo(cx + T * 0.3, cy - T * 0.12); g.moveTo(cx + T * 0.2, cy - T * 0.04); g.lineTo(cx + T * 0.4, cy - T * 0.04); g.stroke();
        g.fillStyle = col; g.beginPath(); g.arc(cx + T * 0.3, cy - T * 0.16, T * 0.06, 0, 7); g.fill();
        break;
      }
      case 'sawmill': {
        shadow(T * 0.4); g.strokeStyle = line; g.lineWidth = 1.3;
        g.fillStyle = '#b4854f'; g.fillRect(cx - T * 0.3, cy - T * 0.08, T * 0.5, T * 0.4); g.strokeRect(cx - T * 0.3, cy - T * 0.08, T * 0.5, T * 0.4);
        g.fillStyle = col; g.beginPath(); g.moveTo(cx - T * 0.36, cy - T * 0.06); g.lineTo(cx - T * 0.05, cy - T * 0.34); g.lineTo(cx + T * 0.26, cy - T * 0.06); g.closePath(); g.fill(); g.stroke();
        for (let i = 0; i < 3; i++) { g.fillStyle = '#d9a566'; g.beginPath(); g.arc(cx + T * (0.28 + (i % 2) * 0.13), cy + T * (0.28 - Math.floor(i / 2) * 0.12 - (i == 1 ? 0 : 0)), T * 0.07, 0, 7); g.fill(); g.stroke(); }
        g.save(); g.translate(cx - T * 0.05, cy + T * 0.1); g.rotate(now * 0.01); g.strokeStyle = '#dfe6ea'; g.lineWidth = 2;
        g.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; g.moveTo(0, 0); g.lineTo(Math.cos(a) * T * 0.1, Math.sin(a) * T * 0.1); } g.stroke(); g.restore();
        break;
      }
      case 'quarry': {
        g.fillStyle = '#a99d85'; g.strokeStyle = line; g.lineWidth = 1.2;
        g.beginPath(); g.ellipse(cx, cy + T * 0.08, T * 0.42, T * 0.3, 0, 0, 7); g.fill(); g.stroke();
        for (const [ox, oy, r, k] of [[-0.18, -0.02, 0.17, '#8e9096'], [0.15, 0.1, 0.15, '#767a84'], [0.02, -0.14, 0.13, '#a0a4ac']]) {
          g.fillStyle = k; g.beginPath(); g.moveTo(cx + (ox - r) * T, cy + (oy + r * 0.6) * T); g.lineTo(cx + (ox - r * 0.6) * T, cy + (oy - r * 0.8) * T); g.lineTo(cx + (ox + r * 0.7) * T, cy + (oy - r * 0.6) * T); g.lineTo(cx + (ox + r) * T, cy + (oy + r * 0.6) * T); g.closePath(); g.fill(); g.stroke();
        }
        g.fillStyle = col; g.fillRect(cx + T * 0.22, cy - T * 0.3, T * 0.1, T * 0.1);
        break;
      }
      case 'tower': {
        shadow(T * 0.32); g.strokeStyle = line; g.lineWidth = 1.5;
        g.fillStyle = '#cfc8ba'; g.fillRect(cx - T * 0.2, cy - T * 0.28, T * 0.4, T * 0.62); g.strokeRect(cx - T * 0.2, cy - T * 0.28, T * 0.4, T * 0.62);
        g.fillStyle = '#b3ab9b'; g.fillRect(cx - T * 0.26, cy - T * 0.4, T * 0.52, T * 0.14); g.strokeRect(cx - T * 0.26, cy - T * 0.4, T * 0.52, T * 0.14);
        for (let i = 0; i < 3; i++) g.fillRect(cx - T * 0.26 + i * T * 0.2, cy - T * 0.5, T * 0.12, T * 0.1);
        g.fillStyle = col; g.fillRect(cx - T * 0.1, cy - T * 0.18, T * 0.2, T * 0.14);
        g.fillStyle = '#2a2018'; g.fillRect(cx - T * 0.03, cy + T * 0.04, T * 0.06, T * 0.14);
        this.flag(g, cx, cy - T * 0.48, T * 0.4, col, now, b.id);
        break;
      }
      case 'wall': {
        g.fillStyle = '#c9c1b2'; g.strokeStyle = line; g.lineWidth = 1.3;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nb = sim.inb(b.x + dx, b.y + dy) ? sim.bld[sim.idx(b.x + dx, b.y + dy)] : null;
          if (nb && nb.civ === b.civ && (nb.type === 'wall' || nb.type === 'tower' || nb.type === 'capital')) {
            const w = dx ? T * 0.5 : T * 0.3, h = dy ? T * 0.5 : T * 0.3;
            const rx = dx > 0 ? cx : dx < 0 ? cx - T * 0.5 : cx - T * 0.15, ry = dy > 0 ? cy : dy < 0 ? cy - T * 0.5 : cy - T * 0.15;
            g.fillRect(rx, ry - T * (dx ? 0.05 : 0), dx ? w : T * 0.3, dy ? h : T * 0.3); g.strokeRect(rx, ry - T * (dx ? 0.05 : 0), dx ? w : T * 0.3, dy ? h : T * 0.3);
          }
        }
        g.fillStyle = '#d7d0c2'; g.fillRect(cx - T * 0.2, cy - T * 0.22, T * 0.4, T * 0.5); g.strokeRect(cx - T * 0.2, cy - T * 0.22, T * 0.4, T * 0.5);
        g.fillStyle = col; g.fillRect(cx - T * 0.2, cy - T * 0.22, T * 0.4, T * 0.1);
        break;
      }
      case 'forge': {
        shadow(T * 0.4); g.strokeStyle = line; g.lineWidth = 1.4;
        g.fillStyle = '#8f8b84'; g.fillRect(cx - T * 0.34, cy - T * 0.1, T * 0.68, T * 0.42); g.strokeRect(cx - T * 0.34, cy - T * 0.1, T * 0.68, T * 0.42);
        g.fillStyle = shade(col, 0.8); g.beginPath(); g.moveTo(cx - T * 0.4, cy - T * 0.08); g.lineTo(cx - T * 0.2, cy - T * 0.34); g.lineTo(cx + T * 0.4, cy - T * 0.34); g.lineTo(cx + T * 0.4, cy - T * 0.08); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = '#6b6560'; g.fillRect(cx + T * 0.2, cy - T * 0.5, T * 0.12, T * 0.2); g.strokeRect(cx + T * 0.2, cy - T * 0.5, T * 0.12, T * 0.2);
        const glow = 0.55 + 0.35 * Math.sin(now * 0.012 + b.id);
        g.fillStyle = `rgba(255,150,40,${glow})`; g.beginPath(); g.arc(cx - T * 0.1, cy + T * 0.12, T * 0.11, 0, 7); g.fill();
        g.fillStyle = '#2f2c2a'; g.fillRect(cx + T * 0.04, cy + T * 0.16, T * 0.22, T * 0.07); g.fillRect(cx + T * 0.09, cy + T * 0.23, T * 0.12, T * 0.09);
        if (Math.random() < 0.05) this.parts.push({ k: 'spark', x: cx - T * 0.1, y: cy + T * 0.05, vx: (Math.random() - 0.5) * T * 1.5, vy: -T * 1.2, life: 0.5, max: 0.5, c: '#ffc23a', s: T * 0.05 });
        break;
      }
      case 'barracks': {
        shadow(T * 0.45); g.strokeStyle = line; g.lineWidth = 1.4;
        g.fillStyle = '#c99a63'; g.fillRect(cx - T * 0.38, cy - T * 0.06, T * 0.76, T * 0.38); g.strokeRect(cx - T * 0.38, cy - T * 0.06, T * 0.76, T * 0.38);
        g.fillStyle = col; g.beginPath(); g.moveTo(cx - T * 0.44, cy - T * 0.04); g.lineTo(cx - T * 0.28, cy - T * 0.32); g.lineTo(cx + T * 0.28, cy - T * 0.32); g.lineTo(cx + T * 0.44, cy - T * 0.04); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = shade(col, 0.75); g.fillRect(cx - T * 0.12, cy - T * 0.3, T * 0.1, T * 0.26); g.fillRect(cx + T * 0.1, cy - T * 0.3, T * 0.1, T * 0.26);
        g.fillStyle = '#3a2a1c'; g.fillRect(cx - T * 0.09, cy + T * 0.1, T * 0.18, T * 0.22);
        g.strokeStyle = '#e9edf2'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - T * 0.3, cy + T * 0.05); g.lineTo(cx - T * 0.16, cy + T * 0.25); g.moveTo(cx - T * 0.16, cy + T * 0.05); g.lineTo(cx - T * 0.3, cy + T * 0.25); g.stroke();
        this.flag(g, cx + T * 0.3, cy - T * 0.3, T * 0.34, col, now, b.id);
        break;
      }
    }
    g.restore();
    if (b.lvl > 1) {
      g.textAlign = 'center'; g.font = `800 ${Math.round(T * 0.3)}px "Trebuchet MS",sans-serif`;
      const stars = '★'.repeat(b.lvl - 1), yy = cy - T * (b.type === 'capital' ? 0.95 : 0.55);
      g.lineWidth = 3; g.strokeStyle = 'rgba(40,30,20,.85)'; g.strokeText(stars, cx, yy); g.fillStyle = '#ffd23a'; g.fillText(stars, cx, yy);
    }
    // santé / dégâts
    if (b.hp < b.maxhp) {
      const f = Math.max(0, b.hp / b.maxhp), w = T * (b.type === 'capital' ? 1.1 : 0.7), y = cy - T * (b.type === 'capital' ? 1.1 : 0.62);
      g.fillStyle = 'rgba(30,20,10,.75)'; g.fillRect(cx - w / 2 - 1, y - 1, w + 2, T * 0.12 + 2);
      g.fillStyle = f > 0.5 ? '#6cd04a' : f > 0.25 ? '#f0b53a' : '#e0483f'; g.fillRect(cx - w / 2, y, w * f, T * 0.12);
      if (f < 0.5 && Math.random() < 0.25) this.parts.push({ k: 'puff', x: cx + (Math.random() - 0.5) * T * 0.5, y: cy - T * 0.2, vx: 0, vy: -T * 0.8, life: 0.9, max: 0.9, c: Math.random() < 0.5 ? '#ff7a1c' : '#4a4540', s: T * 0.12 });
    }
  }
  drawWorkers(g, b, now, sim) {
    const T = this.T, c = sim.civs[b.civ];
    for (let k = 0; k < 2; k++) {
      const ph = hash2(b.id, k, 3) * 6.28, spd = 0.0016 + hash2(b.id, k, 4) * 0.0008;
      const t = (Math.sin(now * spd + ph) + 1) / 2, ang = hash2(b.id, k, 5) * 6.28 + k * 3.1;
      const x = (b.x + 0.5) * T + Math.cos(ang) * T * 0.34 * (0.2 + t * 0.8), y = (b.y + 0.5) * T + Math.sin(ang) * T * 0.28 * (0.2 + t * 0.8) + T * 0.1;
      const bob = Math.abs(Math.sin(now * 0.012 + ph)) * T * 0.03;
      g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(x, y + T * 0.07, T * 0.07, T * 0.03, 0, 0, 7); g.fill();
      g.fillStyle = '#7c5a3a'; g.fillRect(x - T * 0.035, y - T * 0.08 - bob, T * 0.07, T * 0.12);
      g.fillStyle = '#f0c9a0'; g.beginPath(); g.arc(x, y - T * 0.12 - bob, T * 0.04, 0, 7); g.fill();
      g.fillStyle = c.color; g.fillRect(x - T * 0.05, y - T * 0.17 - bob, T * 0.1, T * 0.04);
      g.strokeStyle = '#4a3a28'; g.lineWidth = 1.2; const sw = Math.sin(now * 0.012 + ph) * 0.6;
      g.beginPath(); g.moveTo(x, y - T * 0.06 - bob); g.lineTo(x + Math.cos(sw) * T * 0.1, y - T * 0.14 - bob + Math.sin(sw) * T * 0.07); g.stroke();
    }
  }

  // -------------------------------------------------------- Unités
  drawCatapult(g, u, now, sim) {
    const T = this.T, c = sim.civs[u.civ], x = u.x * T, y = u.y * T, f = u.face || 1;
    const moved = u._lx != null && Math.hypot(u.x - u._lx, u.y - u._ly) > 0.0008;
    u._lx = u.x; u._ly = u.y;
    g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.ellipse(x, y + T * 0.16, T * 0.3, T * 0.1, 0, 0, 7); g.fill();
    g.strokeStyle = '#3a2a1a'; g.lineWidth = 1.4;
    g.fillStyle = '#9b6b3a'; g.beginPath(); g.moveTo(x - T * 0.26, y + T * 0.06); g.lineTo(x + T * 0.26, y + T * 0.06); g.lineTo(x + T * 0.18, y - T * 0.08); g.lineTo(x - T * 0.18, y - T * 0.08); g.closePath(); g.fill(); g.stroke();
    for (const wx of [-0.17, 0.17]) { g.fillStyle = '#6b4a2a'; g.beginPath(); g.arc(x + wx * T, y + T * 0.12, T * 0.09, 0, 7); g.fill(); g.stroke(); }
    const fire = u.fighting > 0 ? Math.min(1, Math.max(0, (1.5 - u.cd) / 0.35)) : 0;
    const ang = -1.15 + fire * 1.6 + (moved ? Math.sin(now * 0.01) * 0.05 : 0);
    g.save(); g.translate(x, y - T * 0.04); g.scale(f, 1); g.rotate(ang);
    g.strokeStyle = '#6b4a2a'; g.lineWidth = Math.max(2.5, T * 0.09); g.lineCap = 'round';
    g.beginPath(); g.moveTo(-T * 0.1, 0); g.lineTo(T * 0.34, 0); g.stroke();
    g.fillStyle = '#4a3a28'; g.beginPath(); g.arc(T * 0.36, 0, T * 0.07, 0, 7); g.fill();
    if (!fire || fire < 0.4) { g.fillStyle = '#6f6a62'; g.beginPath(); g.arc(T * 0.36, -T * 0.06, T * 0.05, 0, 7); g.fill(); }
    g.restore();
    g.fillStyle = c.color; g.fillRect(x - f * T * 0.2, y - T * 0.2, T * 0.09, T * 0.14);
    if (u.hp < u.maxhp) { const w = T * 0.5, fr = u.hp / u.maxhp; g.fillStyle = 'rgba(30,20,10,.75)'; g.fillRect(x - w / 2 - 1, y - T * 0.34 - 1, w + 2, T * 0.07 + 2); g.fillStyle = fr > 0.5 ? '#6cd04a' : fr > 0.25 ? '#f0b53a' : '#e0483f'; g.fillRect(x - w / 2, y - T * 0.34, w * fr, T * 0.07); }
  }
  drawDragon(g, u, now, sim) {
    const T = this.T, c = sim.civs[u.civ], x = u.x * T, f = u.face || 1, flap = Math.sin(now * 0.016 + u.id);
    const y = u.y * T - T * 0.5 + Math.sin(now * 0.004 + u.id) * T * 0.05;
    g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.ellipse(u.x * T, u.y * T + T * 0.1, T * 0.4, T * 0.12, 0, 0, 7); g.fill();
    g.save(); g.translate(x, y); g.scale(f, 1);
    g.lineJoin = 'round'; g.strokeStyle = '#2a3d22'; g.lineWidth = 1.6;
    // ailes
    g.fillStyle = c.color;
    g.beginPath(); g.moveTo(-T * 0.05, -T * 0.06); g.lineTo(-T * 0.3, -T * (0.66 + 0.22 * flap)); g.lineTo(-T * 0.52, -T * (0.34 + 0.12 * flap)); g.lineTo(-T * 0.36, -T * 0.1); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = shade(c.color, 0.8);
    g.beginPath(); g.moveTo(T * 0.05, -T * 0.06); g.lineTo(-T * 0.12, -T * (0.5 + 0.2 * flap)); g.lineTo(-T * 0.3, -T * (0.26 + 0.1 * flap)); g.lineTo(-T * 0.2, -T * 0.08); g.closePath(); g.fill(); g.stroke();
    // queue
    g.strokeStyle = '#3f7d36'; g.lineWidth = T * 0.1; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-T * 0.22, T * 0.04); g.quadraticCurveTo(-T * 0.5, T * 0.2 + flap * T * 0.04, -T * 0.62, T * 0.02); g.stroke();
    // corps
    g.fillStyle = '#5fb04a'; g.strokeStyle = '#2a3d22'; g.lineWidth = 1.6;
    g.beginPath(); g.ellipse(0, 0, T * 0.3, T * 0.17, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#e8d46a'; g.beginPath(); g.ellipse(T * 0.02, T * 0.07, T * 0.22, T * 0.07, 0, 0, 7); g.fill();
    // tête
    g.fillStyle = '#5fb04a'; g.beginPath(); g.ellipse(T * 0.34, -T * 0.08, T * 0.17, T * 0.12, -0.2, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(T * 0.38, -T * 0.12, T * 0.04, 0, 7); g.fill(); g.fillStyle = '#c00'; g.beginPath(); g.arc(T * 0.39, -T * 0.12, T * 0.02, 0, 7); g.fill();
    g.fillStyle = '#e8d46a'; g.beginPath(); g.moveTo(T * 0.28, -T * 0.18); g.lineTo(T * 0.24, -T * 0.32); g.lineTo(T * 0.33, -T * 0.2); g.closePath(); g.fill();
    if (u.fighting > 0) {
      g.fillStyle = 'rgba(255,150,40,.85)'; g.beginPath(); g.moveTo(T * 0.5, -T * 0.06); g.lineTo(T * 0.95, -T * 0.2 + Math.random() * T * 0.1); g.lineTo(T * 0.95, T * 0.1 + Math.random() * T * 0.1); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,230,90,.9)'; g.beginPath(); g.moveTo(T * 0.5, -T * 0.04); g.lineTo(T * 0.8, -T * 0.08); g.lineTo(T * 0.8, T * 0.04); g.closePath(); g.fill();
    }
    g.restore();
    if (u.hp < u.maxhp) { const w = T * 0.8, fr = u.hp / u.maxhp; g.fillStyle = 'rgba(30,20,10,.75)'; g.fillRect(x - w / 2 - 1, y - T * 0.5 - 1, w + 2, T * 0.09 + 2); g.fillStyle = fr > 0.5 ? '#6cd04a' : fr > 0.25 ? '#f0b53a' : '#e0483f'; g.fillRect(x - w / 2, y - T * 0.5, w * fr, T * 0.09); }
  }
  drawUnit(g, u, now, sim) {
    if (u.type === 'catapult') { this.drawCatapult(g, u, now, sim); return; }
    const T = this.T, c = sim.civs[u.civ], k = u.type === 'knight' ? 1.55 : 1;
    const x = u.x * T, y = u.y * T;
    const moved = u._lx != null && Math.hypot(u.x - u._lx, u.y - u._ly) > 0.0008;
    u._lx = u.x; u._ly = u.y;
    const bob = (moved || u.fighting > 0) ? Math.abs(Math.sin(now * 0.014 + u.id)) * T * 0.05 : 0;
    const r = T * 0.16 * k;
    g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.ellipse(x, y + r * 0.9, r * 1.0, r * 0.4, 0, 0, 7); g.fill();
    const by = y - bob;
    // corps
    g.fillStyle = c.color; g.strokeStyle = shade(c.color, 0.45); g.lineWidth = 1.4;
    g.beginPath(); g.roundRect(x - r * 0.75, by - r * 0.7, r * 1.5, r * 1.6, r * 0.5); g.fill(); g.stroke();
    // tête + casque
    g.fillStyle = '#f2cda4'; g.beginPath(); g.arc(x, by - r * 1.05, r * 0.62, 0, 7); g.fill(); g.stroke();
    g.fillStyle = u.type === 'knight' ? '#c8ced6' : '#9aa1ab'; g.beginPath(); g.arc(x, by - r * 1.15, r * 0.66, Math.PI, 0); g.fill(); g.stroke();
    if (u.type === 'knight') { g.fillStyle = '#e0483f'; g.beginPath(); g.ellipse(x, by - r * 1.95, r * 0.2, r * 0.45, 0, 0, 7); g.fill(); }
    // arme
    const f = u.face || 1, swing = u.fighting > 0 ? Math.sin(now * 0.03 + u.id) * 0.9 : -0.35;
    g.save(); g.translate(x + f * r * 0.8, by - r * 0.1); g.rotate(f * (-0.9 + swing));
    g.strokeStyle = '#eef2f6'; g.lineWidth = Math.max(1.6, r * 0.28); g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -r * 1.7); g.stroke();
    g.strokeStyle = '#6b4a2a'; g.beginPath(); g.moveTo(-r * 0.3, -r * 0.1); g.lineTo(r * 0.3, -r * 0.1); g.stroke();
    g.restore();
    // bouclier
    g.fillStyle = shade(c.color, 0.7); g.beginPath(); g.arc(x - f * r * 0.85, by - r * 0.05, r * 0.5, 0, 7); g.fill(); g.stroke();
    if (u.hp < u.maxhp) {
      const w = r * 2.2, fr = u.hp / u.maxhp;
      g.fillStyle = 'rgba(30,20,10,.75)'; g.fillRect(x - w / 2 - 1, by - r * 2.7 - 1, w + 2, T * 0.07 + 2);
      g.fillStyle = fr > 0.5 ? '#6cd04a' : fr > 0.25 ? '#f0b53a' : '#e0483f'; g.fillRect(x - w / 2, by - r * 2.7, w * fr, T * 0.07);
    }
  }
}
