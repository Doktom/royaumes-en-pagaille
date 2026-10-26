'use strict';
// ---------------------------------------------------------------
// Simulation : carte, territoire, économie, unités, IA, cartes
// Aucune dépendance au DOM (testable en headless).
// ---------------------------------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hash2(x, y, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function valueNoise(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}

const NEIGH8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

class Sim {
  constructor(o) {
    this.seed = o.seed != null ? o.seed : Math.floor(Math.random() * 1e9);
    this.rng = mulberry32(this.seed);
    this.W = MAP_W; this.H = MAP_H;
    this.duration = o.duration || 600;
    this.time = 0; this.over = false; this.result = null;
    this.events = []; this.nextId = 1;
    this.buildings = []; this.units = []; this.mudZones = [];
    this.fields = new Map(); this.fieldClear = 0;
    this.terrT = 0; this.terrVersion = 0; this.quipT = 4;
    this.hand = []; this.cardTimer = 8; this.cardsPlayed = 0;
    this.genMap();
    this.setupCivs(o.playerPreset || 0, o.rivals == null ? 2 : o.rivals);
    this.recomputeTerritory();
  }

  rand(a, b) { return a + this.rng() * (b - a); }
  emit(e) { if (this.events.length < 600) this.events.push(e); }
  drain() { const e = this.events; this.events = []; return e; }
  log(text, civ) { this.emit({ type: 'log', text, civ: civ == null ? -1 : civ }); }
  idx(x, y) { return y * this.W + x; }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H; }

  // ------------------------------------------------------------ Carte
  genMap() {
    const { W, H } = this, s = this.seed % 9973;
    this.terrain = new Uint8Array(W * H);
    this.owner = new Int8Array(W * H).fill(-1);
    this.bld = new Array(W * H).fill(null);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const e = valueNoise(x / 7, y / 7, s) * 0.6 + valueNoise(x / 3.5, y / 3.5, s + 1) * 0.3 + valueNoise(x / 1.8, y / 1.8, s + 2) * 0.1;
      const m = valueNoise(x / 5, y / 5, s + 7) * 0.7 + valueNoise(x / 2.2, y / 2.2, s + 8) * 0.3;
      let t = T_PLAIN;
      if (e < 0.31) t = T_WATER;
      else if (e > 0.69) t = T_MOUNTAIN;
      else if (m > 0.56) t = T_FOREST;
      this.terrain[this.idx(x, y)] = t;
    }
    const slots = [[5, 5], [26, 26], [26, 5], [5, 26]];
    this.slots = slots.slice();
  }

  blob(cx, cy, r, t) {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      if (!this.inb(x, y)) continue;
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) this.terrain[this.idx(x, y)] = t;
    }
  }

  setupCivs(playerPreset, rivals) {
    const ids = [0, 1, 2, 3].filter(i => i !== playerPreset);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const order = [playerPreset].concat(ids.slice(0, rivals));
    const slotIdx = [0, 1, 2, 3].slice(0, order.length);
    for (let i = slotIdx.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [slotIdx[i], slotIdx[j]] = [slotIdx[j], slotIdx[i]]; }
    this.civs = order.map((p, i) => {
      const pr = CIV_PRESETS[p];
      return {
        idx: i, preset: p, id: pr.id, name: pr.name, leader: pr.leader, color: pr.color, dark: pr.dark, motto: pr.motto,
        personality: pr.personality, isPlayer: i === 0, alive: true,
        res: Object.assign({}, START_RES), doctrine: null,
        buffs: { prodMult: 1, prodUntil: 0, atkUntil: 0, speedUntil: 0 },
        aiT: this.rand(0.5, 2), attackCd: 0, unitCount: 0, tiles: 0, bcount: {}, stats: { kills: 0, lost: 0 },
        cap: null, slot: this.slots[slotIdx[i]],
      };
    });
    const cx = this.W / 2, cy = this.H / 2;
    for (const c of this.civs) {
      const [px, py] = c.slot, dx = Math.sign(cx - px) || 1, dy = Math.sign(cy - py) || 1;
      this.blob(px + 0.5, py + 0.5, 3.0, T_PLAIN);
      this.blob(px + 0.5 + dx * 4.6, py + 0.5 + dy * 1.4, 1.5, T_FOREST);
      this.blob(px + 0.5 + dx * 1.2, py + 0.5 + dy * 4.8, 1.4, T_MOUNTAIN);
      this.blob(px + 0.5 - dx * 0.6, py + 0.5 + dy * 3.0, 1.0, T_FOREST);
    }
    // ponts : aucun lac ne doit couper la carte entre deux capitales
    for (let a = 0; a < this.civs.length; a++) for (let b = a + 1; b < this.civs.length; b++) {
      const [x1, y1] = this.civs[a].slot, [x2, y2] = this.civs[b].slot;
      for (let k = 0; k <= 64; k++) {
        const x = Math.round(x1 + (x2 - x1) * k / 64), y = Math.round(y1 + (y2 - y1) * k / 64);
        for (const [ox, oy] of [[0, 0], [1, 0], [0, 1]]) { const xx = x + ox, yy = y + oy; if (this.inb(xx, yy) && this.terrain[this.idx(xx, yy)] === T_WATER) this.terrain[this.idx(xx, yy)] = T_PLAIN; }
      }
    }
    for (const c of this.civs) {
      const [px, py] = c.slot;
      c.cap = this.addBuilding(c, 'capital', px, py, true);
      this.spawnUnit(c, 'soldier', px + 0.5, py + 0.5, true);
      this.spawnUnit(c, 'soldier', px + 0.5, py + 0.5, true);
    }
  }

  // ------------------------------------------------------------ Aides
  capitalOf(c) { return c.cap && c.cap.hp > 0 ? c.cap : { x: c.slot[0], y: c.slot[1] }; }
  addRes(c, r) { for (const k in r) { c.res[k] += r[k]; if (c.isPlayer) this.emit({ type: 'float', res: k, amt: r[k], x: this.capitalOf(c).x + 0.5, y: this.capitalOf(c).y }); } }
  canAfford(c, cost) { for (const k in cost) if (c.res[k] < cost[k]) return false; return true; }
  pay(c, cost) { for (const k in cost) c.res[k] -= cost[k]; }
  setDoctrine(c, d) { c.doctrine = d; this.log(`${c.leader} adopte la ${DOCTRINES[d].label}.`, c.idx); }

  weights(c) {
    const p = PERSONALITIES[c.personality];
    const w = { eco: p.eco, expand: p.expand, defense: p.defense, military: p.military, attackAt: p.attackAt, guard: p.guard, weakest: p.weakest };
    if (c.doctrine) {
      const d = DOCTRINES[c.doctrine];
      for (const k in d.mult) w[k] *= d.mult[k];
      w.attackAt = d.attackAt;
    }
    return w;
  }

  // ------------------------------------------------------------ Bâtiments
  tileFree(x, y) { return this.inb(x, y) && this.terrain[this.idx(x, y)] !== T_WATER && !this.bld[this.idx(x, y)]; }
  canBuild(c, type, x, y) {
    if (!this.tileFree(x, y)) return false;
    const i = this.idx(x, y), d = BUILDINGS[type];
    if (this.owner[i] !== c.idx) return false;
    if (d.terrain && d.terrain.indexOf(this.terrain[i]) < 0) return false;
    return true;
  }
  addBuilding(c, type, x, y, instant) {
    const d = BUILDINGS[type];
    const b = { id: this.nextId++, type, civ: c.idx, x, y, hp: d.hp, maxhp: d.hp, spawnT: this.rand(0, 4), cd: 0, born: this.time, instant: !!instant };
    this.buildings.push(b);
    this.bld[this.idx(x, y)] = b;
    this.owner[this.idx(x, y)] = c.idx;
    c.bcount[type] = (c.bcount[type] || 0) + 1;
    this.terrT = 0;
    this.emit({ type: 'build', x: x + 0.5, y: y + 0.5, civ: c.idx });
    return b;
  }
  buildFree(c, type, x, y) {
    if (!this.canBuild(c, type, x, y)) return null;
    return this.addBuilding(c, type, x, y);
  }
  tryBuild(c, type, x, y) {
    if (!this.canBuild(c, type, x, y) || !this.canAfford(c, BUILDINGS[type].cost)) return null;
    this.pay(c, BUILDINGS[type].cost);
    const b = this.addBuilding(c, type, x, y);
    if (this.rng() < 0.18) this.log(`${c.name} construit : ${BUILDINGS[type].name.toLowerCase()} (les ouvriers râlent).`, c.idx);
    return b;
  }
  removeBuilding(b, silent) {
    const k = this.buildings.indexOf(b);
    if (k >= 0) this.buildings.splice(k, 1);
    if (this.bld[this.idx(b.x, b.y)] === b) this.bld[this.idx(b.x, b.y)] = null;
    const c = this.civs[b.civ];
    c.bcount[b.type]--;
    b.hp = 0;
    if (!silent) this.emit({ type: 'destroy', x: b.x + 0.5, y: b.y + 0.5, civ: b.civ, big: b.type === 'capital' });
    this.terrT = 0;
  }
  damageBuilding(b, dmg, attackerCiv) {
    if (b.hp <= 0) return;
    b.hp -= dmg;
    if (b.hp > 0) return;
    const c = this.civs[b.civ];
    if (b.type === 'capital') { this.eliminate(c, attackerCiv); return; }
    c.stats.lost++;
    this.removeBuilding(b);
    if (this.rng() < 0.5) this.log(`${c.name} perd : ${BUILDINGS[b.type].name.toLowerCase()} (oups).`, b.civ);
  }
  explode(c, x, y, r, bdmg, udmg) {
    this.emit({ type: 'explosion', x, y, r });
    for (const b of this.buildings.slice()) if (b.civ !== c.idx && Math.hypot(b.x + 0.5 - x, b.y + 0.5 - y) <= r) this.damageBuilding(b, bdmg, c.idx);
    for (const u of this.units) if (u.civ !== c.idx && Math.hypot(u.x - x, u.y - y) <= r) { u.hp -= udmg; u.lastHit = c.idx; }
  }

  eliminate(c, byCiv) {
    if (!c.alive) return;
    c.alive = false;
    for (const b of this.buildings.slice()) if (b.civ === c.idx) this.removeBuilding(b);
    for (const u of this.units) if (u.civ === c.idx) { u.hp = 0; u.lastHit = -2; }
    this.cleanUnits();
    for (let i = 0; i < this.owner.length; i++) if (this.owner[i] === c.idx) this.owner[i] = -1;
    this.terrVersion++;
    if (byCiv != null && byCiv >= 0 && this.civs[byCiv].alive) this.addRes(this.civs[byCiv], { food: 100, wood: 100, stone: 100 });
    this.log(`${c.leader} a perdu son château et s'enfuit en pantoufles. ${c.name} n'est plus.`, c.idx);
    this.emit({ type: 'eliminated', civ: c.idx });
  }

  // ------------------------------------------------------------ Unités
  spawnUnit(c, type, x, y, free) {
    const d = UNITS[type];
    if (!free) { if (!this.canAfford(c, d.cost)) return null; this.pay(c, d.cost); }
    const u = { id: this.nextId++, type, civ: c.idx, x: x + this.rand(-0.3, 0.3), y: y + this.rand(-0.3, 0.3), hp: d.hp, maxhp: d.hp, tx: -1, ty: -1,
      ox: this.rand(-0.28, 0.28), oy: this.rand(-0.28, 0.28), fighting: 0, lastHit: -1, face: 1 };
    this.units.push(u);
    c.unitCount++;
    this.emit({ type: 'spawn', x: u.x, y: u.y, civ: c.idx });
    return u;
  }
  armyCap(c) { return Math.min(34, 6 + 3 * (c.bcount.village || 0) + 4 * (c.bcount.barracks || 0)); }
  orderAll(c, tx, ty, units) {
    let n = 0;
    for (const u of (units || this.units)) if (u.civ === c.idx) { u.tx = tx; u.ty = ty; n++; }
    return n;
  }

  getField(tx, ty) {
    const key = ty * this.W + tx;
    let f = this.fields.get(key);
    if (f) return f;
    const { W, H } = this;
    f = new Int16Array(W * H).fill(-1);
    if (this.terrain[key] === T_WATER) { this.fields.set(key, f); return f; }
    const q = [key]; f[key] = 0;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % W, y = (i - x) / W;
      for (const [dx, dy] of NEIGH8) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (f[ni] >= 0 || this.terrain[ni] === T_WATER) continue;
        f[ni] = f[i] + 1; q.push(ni);
      }
    }
    this.fields.set(key, f);
    return f;
  }

  cleanUnits() {
    let any = false;
    for (const u of this.units) if (u.hp <= 0) { any = true; break; }
    if (!any) return;
    const keep = [];
    for (const u of this.units) {
      if (u.hp > 0) { keep.push(u); continue; }
      const c = this.civs[u.civ];
      c.unitCount--;
      if (u.lastHit >= 0) { this.civs[u.lastHit].stats.kills++; c.stats.lost++; }
      this.emit({ type: 'death', x: u.x, y: u.y, civ: u.civ, big: u.type === 'knight' });
    }
    this.units = keep;
  }

  speedMult(u, c) {
    let m = 1;
    if (this.time < c.buffs.speedUntil) m *= 1.5;
    for (const z of this.mudZones) if (z.owner !== u.civ && Math.hypot(u.x - z.x, u.y - z.y) <= z.r) { m *= 0.5; break; }
    return m;
  }

  updateUnits(dt) {
    const units = this.units, N = units.length;
    for (let a = 0; a < N; a++) {
      const u = units[a];
      if (u.hp <= 0) continue;
      const c = this.civs[u.civ], def = UNITS[u.type];
      const atk = def.dps * (this.time < c.buffs.atkUntil ? 1.5 : 1);
      // ennemi au contact ?
      let near = null, nd = 1e9;
      for (let b = 0; b < N; b++) {
        const v = units[b];
        if (v.civ === u.civ || v.hp <= 0) continue;
        const d = Math.abs(v.x - u.x) + Math.abs(v.y - u.y);
        if (d < nd) { nd = d; near = v; }
      }
      const dist = near ? Math.hypot(near.x - u.x, near.y - u.y) : 1e9;
      if (near && dist <= 1.15) {
        near.hp -= atk * dt; near.lastHit = u.civ;
        u.fighting = 0.25; u.face = near.x >= u.x ? 1 : -1;
        if (this.rng() < dt * 4) this.emit({ type: 'hit', x: (u.x + near.x) / 2, y: (u.y + near.y) / 2 });
        continue;
      }
      u.fighting = Math.max(0, u.fighting - dt);
      const sp = def.speed * this.speedMult(u, c);
      const ci = this.idx(Math.floor(u.x), Math.floor(u.y));
      // siège du bâtiment présent sur la case (au cas où)
      const here = this.bld[ci];
      if (here && here.civ !== u.civ) { this.damageBuilding(here, SIEGE_DPS * (this.time < c.buffs.atkUntil ? 1.5 : 1) * (u.type === 'knight' ? 3 : 1) * dt, u.civ); u.fighting = 0.25; continue; }
      if (u.tx >= 0) {
        const f = this.getField(u.tx, u.ty);
        const cx = Math.floor(u.x), cy = Math.floor(u.y), cur = f[ci];
        if (cur < 0) { u.tx = -1; continue; }
        if (cur === 0) {
          const bb = this.bld[ci];
          if (!bb || bb.civ === u.civ) u.tx = -1;
          continue;
        }
        let best = -1, bd = cur, bx = 0, by = 0;
        for (const [dx, dy] of NEIGH8) {
          const nx = cx + dx, ny = cy + dy;
          if (!this.inb(nx, ny)) continue;
          const v = f[ny * this.W + nx];
          if (v >= 0 && v < bd) { bd = v; best = ny * this.W + nx; bx = nx; by = ny; }
        }
        if (best < 0) { u.tx = -1; continue; }
        const nb = this.bld[best];
        if (nb && nb.civ !== u.civ) {
          this.damageBuilding(nb, SIEGE_DPS * (this.time < c.buffs.atkUntil ? 1.5 : 1) * (u.type === 'knight' ? 3 : 1) * dt, u.civ);
          u.fighting = 0.25; u.face = bx + 0.5 >= u.x ? 1 : -1;
          if (this.rng() < dt * 3) this.emit({ type: 'hit', x: bx + 0.5, y: by + 0.5 });
          continue;
        }
        this.moveToward(u, bx + 0.5 + u.ox, by + 0.5 + u.oy, sp * dt);
      } else {
        // inactif : défend son territoire
        if (near && dist <= 4.8) { this.moveToward(u, near.x, near.y, sp * dt, true); continue; }
        // bâtiment ennemi adjacent ?
        let sieged = false;
        const cx = Math.floor(u.x), cy = Math.floor(u.y);
        for (const [dx, dy] of NEIGH8) {
          const bb = this.inb(cx + dx, cy + dy) ? this.bld[this.idx(cx + dx, cy + dy)] : null;
          if (bb && bb.civ !== u.civ) { this.damageBuilding(bb, SIEGE_DPS * dt, u.civ); u.fighting = 0.25; sieged = true; break; }
        }
        if (!sieged && this.owner[ci] === u.civ && u.hp < u.maxhp) u.hp = Math.min(u.maxhp, u.hp + 1.5 * dt);
      }
    }
    this.cleanUnits();
  }

  moveToward(u, x, y, step, safe) {
    const dx = x - u.x, dy = y - u.y, d = Math.hypot(dx, dy);
    if (d < 1e-4) return;
    const k = Math.min(1, step / d);
    const nx = u.x + dx * k, ny = u.y + dy * k;
    if (!this.inb(Math.floor(nx), Math.floor(ny)) || this.terrain[this.idx(Math.floor(nx), Math.floor(ny))] === T_WATER) return;
    if (safe) { const nb = this.bld[this.idx(Math.floor(nx), Math.floor(ny))]; if (nb && nb.civ !== u.civ) return; }
    if (Math.abs(dx) > 0.05) u.face = dx > 0 ? 1 : -1;
    u.x = nx; u.y = ny;
  }

  // ------------------------------------------------------------ Bâtiments : prod, spawn, tirs
  updateBuildings(dt) {
    for (const c of this.civs) {
      if (!c.alive) continue;
      const mult = this.time < c.buffs.prodUntil ? c.buffs.prodMult : 1;
      for (const k in BASE_INCOME) c.res[k] += BASE_INCOME[k] * dt * mult;
      c.res.food += (c.bcount.village || 0) * 0.2 * dt * mult;
    }
    for (const b of this.buildings) {
      const c = this.civs[b.civ], d = BUILDINGS[b.type];
      if (d.prod) {
        const mult = this.time < c.buffs.prodUntil ? c.buffs.prodMult : 1;
        for (const k in d.prod) c.res[k] += d.prod[k] * dt * mult;
      }
      if (b.type === 'barracks' || b.type === 'capital') {
        b.spawnT += dt;
        const interval = b.type === 'capital' ? 18 : 9;
        if (b.spawnT >= interval) {
          if (c.unitCount < this.armyCap(c) && this.canAfford(c, UNITS.soldier.cost)) { this.spawnUnit(c, 'soldier', b.x + 0.5, b.y + 0.5); b.spawnT = 0; }
          else b.spawnT = interval - 1.5;
        }
      }
      if (d.shoot) {
        b.cd -= dt;
        let tgt = null, bd = d.shoot.range;
        for (const u of this.units) {
          if (u.civ === b.civ || u.hp <= 0) continue;
          const dd = Math.hypot(u.x - b.x - 0.5, u.y - b.y - 0.5);
          if (dd < bd) { bd = dd; tgt = u; }
        }
        if (tgt) {
          tgt.hp -= d.shoot.dps * dt; tgt.lastHit = b.civ;
          if (b.cd <= 0) { b.cd = 0.5; this.emit({ type: 'arrow', x1: b.x + 0.5, y1: b.y + 0.3, x2: tgt.x, y2: tgt.y, civ: b.civ }); }
        }
      }
    }
    for (let i = this.mudZones.length - 1; i >= 0; i--) if (this.mudZones[i].until < this.time) this.mudZones.splice(i, 1);
  }

  // ------------------------------------------------------------ Territoire
  recomputeTerritory() {
    const { W, H } = this, N = this.civs.length, n = W * H;
    const infl = new Float32Array(n * N);
    const add = (cx, cy, r, s, ci) => {
      const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
      const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d < r) infl[(y * W + x) * N + ci] += s * (1 - d / r);
      }
    };
    for (const b of this.buildings) {
      const d = BUILDINGS[b.type];
      add(b.x + 0.5, b.y + 0.5, d.r, d.s * (0.6 + 0.4 * b.hp / b.maxhp), b.civ);
    }
    for (const u of this.units) add(u.x, u.y, 1.9, 0.5, u.civ);
    let changed = false;
    for (let i = 0; i < n; i++) {
      if (this.terrain[i] === T_WATER) continue;
      const b = this.bld[i];
      if (b) { if (this.owner[i] !== b.civ) { this.owner[i] = b.civ; changed = true; } continue; }
      let best = -1, bv = 0;
      for (let ci = 0; ci < N; ci++) { const v = infl[i * N + ci]; if (v > bv) { bv = v; best = ci; } }
      const cur = this.owner[i], curV = cur >= 0 ? infl[i * N + cur] : 0;
      let nw = cur;
      if (best >= 0 && best !== cur && bv > 0.55 && bv > curV * 1.25 + 0.15) nw = best;
      else if (cur >= 0 && curV < 0.2) nw = -1;
      if (nw !== cur) { this.owner[i] = nw; changed = true; }
    }
    for (const c of this.civs) c.tiles = 0;
    for (let i = 0; i < n; i++) if (this.owner[i] >= 0) this.civs[this.owner[i]].tiles++;
    if (changed) this.terrVersion++;
  }

  // ------------------------------------------------------------ IA
  frontierInfo(c) {
    // listes de cases utiles pour l'IA
    const { W, H } = this, out = { empty: [], front: [] };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (this.owner[i] !== c.idx || this.terrain[i] === T_WATER || this.bld[i]) continue;
      out.empty.push(i);
    }
    return out;
  }
  countAround(x, y, r, pred) {
    let n = 0;
    for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) {
      if (!this.inb(xx, yy) || Math.hypot(xx - x, yy - y) > r) continue;
      if (pred(this.idx(xx, yy))) n++;
    }
    return n;
  }
  nearestOwn(c, x, y, types) {
    let bd = 1e9;
    for (const b of this.buildings) if (b.civ === c.idx && (!types || types.indexOf(b.type) >= 0)) { const d = Math.hypot(b.x - x, b.y - y); if (d < bd) bd = d; }
    return bd;
  }

  aiThink(c) {
    const w = this.weights(c), B = c.bcount, W = this.W;
    const info = this.frontierInfo(c), cap = this.capitalOf(c);
    const empty = info.empty, tiles = c.tiles;
    const mine = i => this.owner[i] === c.idx;
    const enemyI = i => this.owner[i] >= 0 && this.owner[i] !== c.idx;
    const neutralI = i => this.owner[i] === -1 && this.terrain[i] !== T_WATER;
    const options = [];
    const consider = (type, score, chooser) => { if (score > 0) options.push({ type, score: score * (0.85 + this.rng() * 0.3), chooser }); };
    const pickBy = (filter, scoreFn) => {
      let best = null, bs = -1e9;
      for (const i of empty) {
        const x = i % W, y = (i - x) / W;
        if (!filter(x, y, i)) continue;
        const s = scoreFn(x, y, i);
        if (s > bs) { bs = s; best = { x, y }; }
      }
      return best;
    };
    const distCap = (x, y) => Math.hypot(x - cap.x, y - cap.y);

    // production
    const eco = w.eco;
    const prodDefs = [['farm', T_PLAIN, 2 + tiles / 45, c.res.food < 90 ? 1.5 : 1], ['sawmill', T_FOREST, 1.5 + tiles / 55, c.res.wood < 80 ? 1.6 : 1], ['quarry', T_MOUNTAIN, 1 + tiles / 80, c.res.stone < 60 ? 1.6 : 1]];
    for (const [type, terr, want0, scar] of prodDefs) {
      const have = B[type] || 0, want = want0 * (0.6 + 0.4 * eco);
      if (have < want) consider(type, (want - have) * 0.5 * eco * scar + 0.3, () => pickBy((x, y, i) => this.terrain[i] === terr, (x, y) => -distCap(x, y) - this.countAround(x, y, 3, enemyI) * 3));
    }
    // expansion
    const vil = B.village || 0;
    if (vil < 9) {
      consider('village', w.expand * (vil < 2 ? 1.8 : 1.1) * (vil < 4 + tiles / 12 ? 1 : 0.4), () => pickBy(
        (x, y, i) => this.terrain[i] === T_PLAIN && this.nearestOwn(c, x, y, ['village', 'capital']) >= 3.2,
        (x, y) => this.countAround(x, y, 4, neutralI) * 1.0 + this.countAround(x, y, 4, enemyI) * 0.4 - distCap(x, y) * 0.08 - (this.countAround(x, y, 3, enemyI) > 4 ? 6 : 0)));
    }
    // défense
    const frontScore = (x, y) => this.countAround(x, y, 4, enemyI);
    const towers = B.tower || 0, walls = B.wall || 0;
    const threat = this.units.some(u => u.civ !== c.idx && this.owner[this.idx(Math.floor(u.x), Math.floor(u.y))] === c.idx) ? 1.8 : 1;
    if (towers < 1 + tiles / 20 * w.defense) {
      consider('tower', w.defense * 1.15 * threat, () => {
        const t = pickBy((x, y, i) => frontScore(x, y) > 0 && this.nearestOwn(c, x, y, ['tower']) >= 2.6, (x, y) => frontScore(x, y) - distCap(x, y) * 0.05);
        return t;
      });
    }
    if (walls < 2 + towers * 1.5 && c.res.stone >= 20) {
      consider('wall', w.defense * 0.7 * threat, () => pickBy(
        (x, y, i) => this.countAround(x, y, 1.5, enemyI) > 0 || (this.countAround(x, y, 1.5, neutralI) > 0 && this.countAround(x, y, 5, enemyI) > 0),
        (x, y) => this.countAround(x, y, 2.5, enemyI) + (this.nearestOwn(c, x, y, ['tower', 'village']) <= 2.5 ? 2 : 0)));
    }
    // armée
    const rax = B.barracks || 0;
    if (rax < 1 + Math.floor(tiles / 55 * w.military)) {
      consider('barracks', rax === 0 ? 2.3 : w.military * 1.0, () => pickBy((x, y, i) => this.terrain[i] === T_PLAIN && distCap(x, y) <= 8, (x, y) => -Math.abs(distCap(x, y) - 3) + this.countAround(x, y, 4, enemyI) * 0.2));
    }

    options.sort((a, b) => b.score - a.score);
    let built = 0;
    for (let k = 0; k < options.length && built < 2; k++) {
      const o = options[k];
      const cost = BUILDINGS[o.type].cost;
      if (!this.canAfford(c, cost)) { if (k === 0 && o.score > 1.4) break; continue; }
      const t = o.chooser();
      if (!t) continue;
      if (this.tryBuild(c, o.type, t.x, t.y)) built++;
    }
    this.aiMilitary(c, w);
  }

  biggestNearbyArmy(c) {
    // plus grosse armée rivale : on évite de foncer dans un mur d'épées
    let m = 0;
    for (const o of this.civs) if (o !== c && o.alive) m = Math.max(m, o.unitCount * 0.6);
    return m;
  }

  aiMilitary(c, w) {
    const idle = [];
    for (const u of this.units) if (u.civ === c.idx && u.tx < 0 && u.type === 'soldier') idle.push(u);
    const knights = this.units.filter(u => u.civ === c.idx && u.type === 'knight' && u.tx < 0);
    c.attackCd -= 2.5;
    const sendable = idle.concat(knights);
    const home = Math.min(w.guard, idle.length);
    if (this.time > 60 && sendable.length - home >= w.attackAt && c.attackCd <= 0 && (sendable.length - home) * 1.15 > this.biggestNearbyArmy(c)) {
      // choisir une cible
      const rivals = this.civs.filter(o => o !== c && o.alive);
      if (rivals.length) {
        const cap = this.capitalOf(c);
        let target = null;
        if (w.weakest) {
          rivals.sort((a, b) => (a.unitCount + (a.bcount.tower || 0) * 3) - (b.unitCount + (b.bcount.tower || 0) * 3));
          target = rivals[0];
        } else {
          rivals.sort((a, b) => Math.hypot(a.slot[0] - cap.x, a.slot[1] - cap.y) - Math.hypot(b.slot[0] - cap.x, b.slot[1] - cap.y));
          target = rivals[0];
        }
        let best = null, bs = 1e9;
        const strongEnough = sendable.length > target.unitCount * 0.9 + 2;
        for (const b of this.buildings) {
          if (b.civ !== target.idx) continue;
          let s = this.nearestOwn(c, b.x, b.y);
          if (b.type === 'wall') s += 3; else if (b.type === 'tower') s += 2; else if (b.type === 'capital') s += this.time < 200 ? 40 : strongEnough ? (PERSONALITIES[c.personality].weakest || c.personality === 'belliqueux' ? -9 : 1) : 14;
          else if (b.type === 'farm' || b.type === 'sawmill' || b.type === 'quarry') s -= 1;
          if (s < bs) { bs = s; best = b; }
        }
        if (best) {
          const group = sendable.slice(home);
          this.orderAll(c, best.x, best.y, group);
          c.attackCd = 24;
          this.log(`${c.leader} lance ${group.length} braves vers ${target.name} (« ${QUIPS.soldier[Math.floor(this.rng() * QUIPS.soldier.length)]} »).`, c.idx);
          this.emit({ type: 'attackOrder', civ: c.idx, x: best.x + 0.5, y: best.y + 0.5 });
          return;
        }
      }
    }
    // rappel des égarés
    const base = this.capitalOf(c);
    for (const u of idle) {
      const o = this.owner[this.idx(Math.floor(u.x), Math.floor(u.y))];
      if (o !== c.idx) {
        let enemyNear = false;
        for (const v of this.units) if (v.civ !== c.idx && Math.hypot(v.x - u.x, v.y - u.y) < 5) { enemyNear = true; break; }
        if (!enemyNear && this.rng() < 0.4) { u.tx = base.x; u.ty = base.y; }
      }
    }
  }

  // ------------------------------------------------------------ Cartes du joueur
  validTarget(card, c, x, y) {
    if (!card.target) return true;
    if (!this.inb(x, y) || this.terrain[this.idx(x, y)] === T_WATER) return false;
    if (card.target === 'any') return true;
    const i = this.idx(x, y);
    if (this.owner[i] !== c.idx || this.bld[i]) return false;
    if (card.id === 'tower' || card.id === 'colony') return this.canBuild(c, card.id === 'tower' ? 'tower' : 'village', x, y);
    return true;
  }
  drawHand() {
    const pool = CARDS.slice(), hand = [];
    let doc = 0;
    while (hand.length < 3 && pool.length) {
      const k = Math.floor(this.rng() * pool.length), card = pool.splice(k, 1)[0];
      if (card.kind === 'doc' && doc >= 1) continue;
      if (card.kind === 'doc') doc++;
      hand.push(card);
    }
    this.hand = hand;
    this.emit({ type: 'hand' });
  }
  playCard(i, x, y) {
    const card = this.hand[i], c = this.civs[0];
    if (!card || !c.alive) return false;
    if (card.target && !this.validTarget(card, c, x, y)) return false;
    card.apply(this, c, { x, y });
    this.log(`Vous jouez « ${card.name} ».`, 0);
    this.emit({ type: 'cardPlayed', card: card.id, x: x == null ? -1 : x + 0.5, y: y == null ? -1 : y + 0.5 });
    this.hand = []; this.cardTimer = this.rand(30, 45); this.cardsPlayed++;
    this.terrT = 0;
    return true;
  }
  skipCard() {
    if (!this.hand.length) return;
    this.hand = []; this.cardTimer = this.rand(30, 45);
    this.addRes(this.civs[0], { food: 30 });
    this.log('Vous ne faites rien. Le royaume apprécie (+30 nourriture).', 0);
  }

  // ------------------------------------------------------------ Boucle
  step(dt) {
    if (this.over) return;
    this.time += dt;
    this.updateBuildings(dt);
    this.updateUnits(dt);
    this.terrT -= dt;
    if (this.terrT <= 0) { this.recomputeTerritory(); this.terrT = 0.5; }
    for (const c of this.civs) {
      if (!c.alive) continue;
      c.aiT -= dt;
      if (c.aiT <= 0) { c.aiT = this.rand(2, 3.4); this.aiThink(c); }
    }
    this.fieldClear -= dt;
    if (this.fieldClear <= 0) { this.fields.clear(); this.fieldClear = 8; }
    // cartes
    if (!this.hand.length && this.civs[0].alive) { this.cardTimer -= dt; if (this.cardTimer <= 0) this.drawHand(); }
    // répliques
    this.quipT -= dt;
    if (this.quipT <= 0) { this.quipT = this.rand(2.2, 4.5); this.randomQuip(); }
    // fin de partie
    const alive = this.civs.filter(c => c.alive);
    if (this.time >= this.duration || alive.length <= 1 || !this.civs[0].alive) this.finish(alive.length <= 1 ? 'domination' : (!this.civs[0].alive ? 'defeat' : 'time'));
  }
  randomQuip() {
    const c = this.civs[Math.floor(this.rng() * this.civs.length)];
    if (!c.alive) return;
    const r = this.rng();
    if (r < 0.45) {
      const bs = this.buildings.filter(b => b.civ === c.idx && BUILDINGS[b.type].prod);
      if (bs.length) { const b = bs[Math.floor(this.rng() * bs.length)]; this.emit({ type: 'quip', x: b.x + 0.5, y: b.y + 0.2, text: QUIPS.worker[Math.floor(this.rng() * QUIPS.worker.length)] }); }
    } else if (r < 0.85) {
      const us = this.units.filter(u => u.civ === c.idx);
      if (us.length) { const u = us[Math.floor(this.rng() * us.length)]; this.emit({ type: 'quip', x: u.x, y: u.y - 0.2, text: QUIPS.soldier[Math.floor(this.rng() * QUIPS.soldier.length)] }); }
    } else {
      const k = this.capitalOf(c);
      this.emit({ type: 'quip', x: k.x + 0.5, y: k.y - 0.4, text: QUIPS.leader[Math.floor(this.rng() * QUIPS.leader.length)] });
    }
  }
  score(c) { return c.tiles + (c.bcount.village || 0) * 0.5 + (c.bcount.tower || 0) * 0.3; }
  ranking() {
    return this.civs.slice().sort((a, b) => (b.alive - a.alive) || (this.score(b) - this.score(a)));
  }
  finish(reason) {
    this.over = true;
    this.recomputeTerritory();
    const rank = this.ranking();
    this.result = { reason, rank, winner: rank[0], playerRank: rank.indexOf(this.civs[0]) + 1 };
    this.emit({ type: 'over' });
  }
}
