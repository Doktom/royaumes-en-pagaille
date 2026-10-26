'use strict';
// ---------------------------------------------------------------
// Simulation : carte, territoire, économie, unités, IA, cartes, événements
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
const TECH_KEYS = ['armes', 'armures', 'forts'];

class Sim {
  constructor(o) {
    this.seed = o.seed != null ? o.seed : Math.floor(Math.random() * 1e9);
    this.rng = mulberry32(this.seed);
    this.W = MAP_W; this.H = MAP_H;
    this.duration = o.duration || 600;
    this.spectator = !!o.spectator;
    this.time = 0; this.over = false; this.result = null;
    this.events = []; this.nextId = 1;
    this.buildings = []; this.units = []; this.mudZones = []; this.pacts = [];
    this.fields = new Map(); this.fieldClear = 0;
    this.terrT = 0; this.terrVersion = 0; this.quipT = 4;
    this.hand = []; this.cardTimer = 8; this.cardsPlayed = 0; this.pinned = null; this.lastPlayed = null;
    this.eventT = 105 + this.rng() * 25; this.captureAcc = {}; this.captureT = 6; this.histT = 0;
    this.history = []; this.chron = [];
    this.genMap();
    this.setupCivs(o.playerPreset || 0, o.rivals == null ? 2 : o.rivals);
    this.recomputeTerritory();
    this.history.push({ t: 0, tiles: this.civs.map(c => c.tiles) });
  }

  rand(a, b) { return a + this.rng() * (b - a); }
  emit(e) { if (this.events.length < 700) this.events.push(e); }
  drain() { const e = this.events; this.events = []; return e; }
  // imp : 0 = ignoré, 1 = chronique, 2 = grande nouvelle (bandeau + résumé de fin)
  log(text, civ, icon, imp) {
    imp = imp == null ? 1 : imp;
    if (imp >= 2) this.chron.push({ t: this.time, text, icon: icon || '•', civ: civ == null ? -1 : civ });
    this.emit({ type: 'log', text, civ: civ == null ? -1 : civ, icon: icon || '•', imp, t: this.time });
  }
  news(text, civ, icon) { this.log(text, civ, icon, 2); this.emit({ type: 'news', icon: icon || '📜' }); }
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
    this.slots = [[5, 5], [26, 26], [26, 5], [5, 26]];
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
        personality: pr.personality, pers: PERSONALITIES[pr.personality], isPlayer: i === 0 && !this.spectator, alive: true,
        res: Object.assign({}, START_RES), doctrine: null,
        buffs: { prodMult: 1, prodUntil: 0, atkUntil: 0, speedUntil: 0 },
        tech: { armes: 0, armures: 0, forts: 0 }, types: {},
        aiT: this.rand(0.5, 2), attackCd: 0, sabT: this.rand(30, 50), unitCount: 0, tiles: 0, bcount: {},
        stats: { kills: 0, lost: 0, built: 0, razed: 0 }, peak: 0,
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
  addRes(c, r) { for (const k in r) { c.res[k] += r[k]; if (c.isPlayer) { const cp = this.capitalOf(c); this.emit({ type: 'float', res: k, amt: r[k], x: cp.x + 0.5, y: cp.y }); } } }
  canAfford(c, cost, extra) { for (const k in cost) if (c.res[k] < cost[k] + (extra ? (extra[k] || 0) : 0)) return false; return true; }
  pay(c, cost) { for (const k in cost) c.res[k] -= cost[k]; }
  setDoctrine(c, d) { c.doctrine = d; this.log(`${c.leader} adopte la ${DOCTRINES[d].label}.`, c.idx, '📜', 1); }

  weights(c) {
    const p = c.pers;
    const w = { eco: p.eco, expand: p.expand, defense: p.defense, military: p.military, attackAt: p.attackAt, guard: p.guard, weakest: p.weakest, firstAttack: p.firstAttack };
    if (c.doctrine) {
      const d = DOCTRINES[c.doctrine];
      for (const k in d.mult) w[k] *= d.mult[k];
      w.attackAt = d.attackAt;
    }
    return w;
  }

  hostile(a, b) {
    if (a === b) return false;
    for (const p of this.pacts) if ((p.a === a && p.b === b) || (p.a === b && p.b === a)) return false;
    return true;
  }
  makePact(c) {
    const rivals = this.civs.filter(o => o !== c && o.alive && this.hostile(c.idx, o.idx));
    if (!rivals.length) return;
    rivals.sort((a, b) => (b.unitCount + b.tiles * 0.2) - (a.unitCount + a.tiles * 0.2));
    const o = rivals[0];
    this.pacts.push({ a: c.idx, b: o.idx, until: this.time + 60 });
    this.news(`${c.leader} et ${o.leader} signent un pacte de non-agression (60 s). Chacun croise les doigts.`, c.idx, '🤝');
  }
  breakPacts(c) {
    const n = this.pacts.length;
    this.pacts = this.pacts.filter(p => p.a !== c.idx && p.b !== c.idx);
    if (this.pacts.length < n) this.news(`${c.leader} rompt ses pactes d'un coup de poignard. Quelle élégance.`, c.idx, '🔪');
  }

  // ------------------------------------------------------------ Bâtiments et niveaux
  bR(b) { return BUILDINGS[b.type].r * (1 + LVL.r * (b.lvl - 1)) * (this.civs[b.civ].pers.rMul || 1); }
  bS(b) { return BUILDINGS[b.type].s * (1 + LVL.s * (b.lvl - 1)); }
  bMaxHp(b) { return Math.round(BUILDINGS[b.type].hp * (1 + LVL.hp * (b.lvl - 1))); }
  upgradeCost(b) { const base = UPGRADE_COST[b.type]; if (!base || b.lvl >= MAX_LVL) return null; const o = {}; for (const k in base) o[k] = base[k] * b.lvl; return o; }
  upgradeBuilding(b) {
    if (b.lvl >= MAX_LVL) return;
    b.lvl++;
    const old = b.maxhp; b.maxhp = this.bMaxHp(b); b.hp += b.maxhp - old;
    this.terrT = 0;
    this.emit({ type: 'upgrade', x: b.x + 0.5, y: b.y + 0.5, civ: b.civ, lvl: b.lvl });
    const c = this.civs[b.civ];
    this.log(`${c.name} améliore : ${BUILDINGS[b.type].name.toLowerCase()} (niveau ${b.lvl}).`, b.civ, '🔨', b.type === 'capital' ? 1 : 0);
  }
  techCap(c) { const f = c.bcount.forge || 0; return f ? Math.min(3, f + 1) : 0; }
  techCost(c, k) { const l = c.tech[k] + 1; return { food: 120 * l, wood: 60 * l, stone: 60 * l }; }
  freeTech(c, key) {
    const keys = key ? [key] : TECH_KEYS.filter(k => c.tech[k] < 3);
    if (!keys.length) { this.addRes(c, { food: 100, wood: 100, stone: 100 }); return; }
    const k = keys[Math.floor(this.rng() * keys.length)];
    if (c.tech[k] >= 3) return;
    c.tech[k]++;
    this.log(`${c.name} : ${TECHS[k].label} niveau ${c.tech[k]} (${TECHS[k].desc}).`, c.idx, '⚒️', c.isPlayer ? 1 : 0);
    this.emit({ type: 'tech', civ: c.idx });
  }

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
    const b = { id: this.nextId++, type, civ: c.idx, x, y, lvl: 1, hp: d.hp, maxhp: d.hp, spawnT: this.rand(0, 4), cd: 0, born: this.time, instant: !!instant };
    this.buildings.push(b);
    this.bld[this.idx(x, y)] = b;
    this.owner[this.idx(x, y)] = c.idx;
    c.bcount[type] = (c.bcount[type] || 0) + 1;
    if (!instant) c.stats.built++;
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
    return this.addBuilding(c, type, x, y);
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
    const c = this.civs[b.civ];
    b.hp -= dmg / ((1 + TECHS.forts.per * c.tech.forts) * (c.pers.hpDiv || 1));
    if (b.hp > 0) return;
    if (attackerCiv >= 0 && this.civs[attackerCiv]) this.civs[attackerCiv].stats.razed++;
    if (b.type === 'capital') { this.eliminate(c, attackerCiv); return; }
    c.stats.lost++;
    this.removeBuilding(b);
    if (b.type === 'village' || b.type === 'barracks' || b.type === 'tower' || b.type === 'forge') {
      const by = attackerCiv >= 0 && this.civs[attackerCiv] ? ` par ${this.civs[attackerCiv].name}` : '';
      this.log(`${c.name} perd : ${BUILDINGS[b.type].name.toLowerCase()}${by}.`, b.civ, '💥', 1);
    }
  }
  explode(c, x, y, r, bdmg, udmg) {
    this.emit({ type: 'explosion', x, y, r });
    for (const b of this.buildings.slice()) if (this.hostile(c.idx, b.civ) && Math.hypot(b.x + 0.5 - x, b.y + 0.5 - y) <= r) this.damageBuilding(b, bdmg, c.idx);
    for (const u of this.units) if (this.hostile(c.idx, u.civ) && Math.hypot(u.x - x, u.y - y) <= r) this.hurtUnit(u, udmg, c.idx);
  }
  quake(c, x, y, r) {
    this.emit({ type: 'quake', x, y, r });
    for (const b of this.buildings.slice()) {
      if (c && !this.hostile(c.idx, b.civ)) continue;
      if (Math.hypot(b.x + 0.5 - x, b.y + 0.5 - y) > r) continue;
      this.damageBuilding(b, b.type === 'wall' || b.type === 'tower' ? 320 : 110, c ? c.idx : -1);
    }
    for (const u of this.units) if ((!c || this.hostile(c.idx, u.civ)) && Math.hypot(u.x - x, u.y - y) <= r) this.hurtUnit(u, 22, c ? c.idx : -1);
  }

  eliminate(c, byCiv) {
    if (!c.alive) return;
    c.alive = false;
    for (const b of this.buildings.slice()) if (b.civ === c.idx) this.removeBuilding(b);
    for (const u of this.units) if (u.civ === c.idx) { u.hp = 0; u.lastHit = -2; }
    this.cleanUnits();
    for (let i = 0; i < this.owner.length; i++) if (this.owner[i] === c.idx) this.owner[i] = -1;
    this.pacts = this.pacts.filter(p => p.a !== c.idx && p.b !== c.idx);
    this.terrVersion++;
    if (byCiv != null && byCiv >= 0 && this.civs[byCiv].alive) this.addRes(this.civs[byCiv], { food: 100, wood: 100, stone: 100 });
    this.news(`${c.leader} a perdu son château et s'enfuit en pantoufles. ${c.name} n'est plus.`, c.idx, '💀');
    this.emit({ type: 'eliminated', civ: c.idx });
  }

  // ------------------------------------------------------------ Unités
  spawnUnit(c, type, x, y, free) {
    const d = UNITS[type];
    if (!free) { if (!this.canAfford(c, d.cost)) return null; this.pay(c, d.cost); }
    const u = { id: this.nextId++, type, civ: c.idx, x: x + this.rand(-0.3, 0.3), y: y + this.rand(-0.3, 0.3), hp: d.hp, maxhp: d.hp, tx: -1, ty: -1,
      ox: this.rand(-0.28, 0.28), oy: this.rand(-0.28, 0.28), fighting: 0, lastHit: -1, face: 1, cd: 0 };
    this.units.push(u);
    c.unitCount++; c.types[type] = (c.types[type] || 0) + 1;
    this.emit({ type: 'spawn', x: u.x, y: u.y, civ: c.idx });
    return u;
  }
  spawnDragon(c, x, y) {
    const k = this.capitalOf(c);
    const u = this.spawnUnit(c, 'dragon', k.x + 0.5, k.y + 0.5, true);
    u.life = 40; u.fx = x; u.fy = y;
    this.emit({ type: 'dragon', x: u.x, y: u.y });
    return u;
  }
  armyCap(c) { return Math.min(48, 6 + 3 * (c.bcount.village || 0) + 4 * (c.bcount.barracks || 0) + 2 * Math.floor(this.time / 80)); }
  orderAll(c, tx, ty, units) {
    let n = 0;
    for (const u of (units || this.units)) if (u.civ === c.idx && u.type !== 'dragon') { u.tx = tx; u.ty = ty; n++; }
    return n;
  }
  hurtUnit(v, dmg, byCiv) {
    const c = this.civs[v.civ];
    v.hp -= dmg / (1 + TECHS.armures.per * c.tech.armures);
    v.lastHit = byCiv;
  }
  atkMul(c) { return (this.time < c.buffs.atkUntil ? 1.5 : 1) * (1 + TECHS.armes.per * c.tech.armes) * (c.pers.atkMul || 1); }

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
      c.unitCount--; c.types[u.type]--;
      if (u.lastHit >= 0) { this.civs[u.lastHit].stats.kills++; c.stats.lost++; }
      this.emit({ type: 'death', x: u.x, y: u.y, civ: u.civ, big: u.type === 'knight' || u.type === 'dragon' });
    }
    this.units = keep;
  }

  speedMult(u, c) {
    let m = c.pers.speedMul || 1;
    if (this.time < c.buffs.speedUntil) m *= 1.5;
    for (const z of this.mudZones) if (z.owner !== u.civ && Math.hypot(u.x - z.x, u.y - z.y) <= z.r) { m *= 0.5; break; }
    return m;
  }

  siege(u, b, atkM, dt) {
    this.damageBuilding(b, SIEGE_DPS * atkM * (u.type === 'knight' ? 3 : 1) * dt, u.civ);
    u.fighting = 0.25; u.face = b.x + 0.5 >= u.x ? 1 : -1;
    if (this.rng() < dt * 3) this.emit({ type: 'hit', x: b.x + 0.5, y: b.y + 0.5 });
  }

  updateUnits(dt) {
    const units = this.units, N = units.length;
    for (let a = 0; a < N; a++) {
      const u = units[a];
      if (u.hp <= 0) continue;
      const c = this.civs[u.civ], def = UNITS[u.type];
      if (u.type === 'dragon') { this.updateDragon(u, c, dt); continue; }
      const atkM = this.atkMul(c);
      // ennemi au contact ?
      let near = null, nd = 1e9;
      for (let b = 0; b < N; b++) {
        const v = units[b];
        if (v.civ === u.civ || v.hp <= 0 || !this.hostile(u.civ, v.civ)) continue;
        const d = Math.abs(v.x - u.x) + Math.abs(v.y - u.y);
        if (d < nd) { nd = d; near = v; }
      }
      const dist = near ? Math.hypot(near.x - u.x, near.y - u.y) : 1e9;
      const sp = def.speed * this.speedMult(u, c);
      if (u.type === 'catapult') {
        if (this.updateCatapult(u, c, atkM, dt)) continue;
        u.fighting = Math.max(0, u.fighting - dt);
        if (u.tx >= 0) this.advance(u, c, sp, dt, atkM, false);
        continue;
      }
      if (near && dist <= 1.15) {
        this.hurtUnit(near, def.dps * atkM * dt, u.civ);
        u.fighting = 0.25; u.face = near.x >= u.x ? 1 : -1;
        if (this.rng() < dt * 4) this.emit({ type: 'hit', x: (u.x + near.x) / 2, y: (u.y + near.y) / 2 });
        continue;
      }
      u.fighting = Math.max(0, u.fighting - dt);
      const ci = this.idx(Math.floor(u.x), Math.floor(u.y));
      // siège du bâtiment présent sur la case (au cas où)
      const here = this.bld[ci];
      if (here && this.hostile(u.civ, here.civ)) { this.siege(u, here, atkM, dt); continue; }
      if (u.tx >= 0) this.advance(u, c, sp, dt, atkM, true);
      else {
        // inactif : défend son territoire
        if (near && dist <= 4.8) { this.moveToward(u, near.x, near.y, sp * dt, true); continue; }
        let sieged = false;
        const cx = Math.floor(u.x), cy = Math.floor(u.y);
        for (const [dx, dy] of NEIGH8) {
          const bb = this.inb(cx + dx, cy + dy) ? this.bld[this.idx(cx + dx, cy + dy)] : null;
          if (bb && this.hostile(u.civ, bb.civ)) { this.siege(u, bb, atkM, dt); sieged = true; break; }
        }
        if (!sieged && this.owner[ci] === u.civ && u.hp < u.maxhp) u.hp = Math.min(u.maxhp, u.hp + 1.5 * dt);
      }
    }
    this.cleanUnits();
  }

  // suit le champ de distance vers (tx, ty)
  advance(u, c, sp, dt, atkM, canSiege) {
    const ci = this.idx(Math.floor(u.x), Math.floor(u.y));
    const f = this.getField(u.tx, u.ty);
    const cx = Math.floor(u.x), cy = Math.floor(u.y), cur = f[ci];
    if (cur < 0) { u.tx = -1; return; }
    if (cur === 0) { const bb = this.bld[ci]; if (!bb || !this.hostile(u.civ, bb.civ)) u.tx = -1; return; }
    let best = -1, bd = cur, bx = 0, by = 0;
    for (const [dx, dy] of NEIGH8) {
      const nx = cx + dx, ny = cy + dy;
      if (!this.inb(nx, ny)) continue;
      const v = f[ny * this.W + nx];
      if (v >= 0 && v < bd) { bd = v; best = ny * this.W + nx; bx = nx; by = ny; }
    }
    if (best < 0) { u.tx = -1; return; }
    const nb = this.bld[best];
    if (nb && this.hostile(u.civ, nb.civ)) { if (canSiege) this.siege(u, nb, atkM, dt); return; }
    this.moveToward(u, bx + 0.5 + u.ox, by + 0.5 + u.oy, sp * dt);
  }

  // catapulte : bombarde le bâtiment ennemi le plus proche à portée ; renvoie true si elle tire
  updateCatapult(u, c, atkM, dt) {
    const R = UNITS.catapult.range, cx = Math.floor(u.x), cy = Math.floor(u.y);
    let tb = null, bs = 1e9;
    for (let y = cy - 5; y <= cy + 5; y++) for (let x = cx - 5; x <= cx + 5; x++) {
      if (!this.inb(x, y)) continue;
      const b = this.bld[this.idx(x, y)];
      if (!b || !this.hostile(u.civ, b.civ)) continue;
      const d = Math.hypot(b.x + 0.5 - u.x, b.y + 0.5 - u.y);
      if (d > R) continue;
      const s = d + (b.type === 'wall' ? 2 : 0);
      if (s < bs) { bs = s; tb = b; }
    }
    if (!tb) return false;
    u.cd -= dt; u.fighting = 0.3; u.face = tb.x + 0.5 >= u.x ? 1 : -1;
    if (u.cd <= 0) {
      u.cd = 1.5;
      this.emit({ type: 'rock', x1: u.x, y1: u.y, x2: tb.x + 0.5, y2: tb.y + 0.5 });
      this.damageBuilding(tb, UNITS.catapult.siege * atkM, u.civ);
    }
    return true;
  }

  updateDragon(u, c, dt) {
    u.life -= dt;
    if (u.life <= 0 || !c.alive) { u.hp = 0; u.lastHit = -1; return; }
    const atkM = this.atkMul(c), sp = UNITS.dragon.speed * this.speedMult(u, c);
    u.fighting = Math.max(0, u.fighting - dt);
    let tx = null, ty = null, tgt = null;
    if (u.fx != null) {
      tx = u.fx; ty = u.fy;
      if (Math.hypot(tx - u.x, ty - u.y) < 0.8) u.fx = null;
    }
    if (tx == null || u.fx == null) {
      let bs = 1e9;
      for (const b of this.buildings) {
        if (!this.hostile(u.civ, b.civ)) continue;
        const d = Math.hypot(b.x + 0.5 - u.x, b.y + 0.5 - u.y) + (b.type === 'wall' ? 5 : 0);
        if (d < bs) { bs = d; tgt = b; }
      }
      if (tgt) { tx = tgt.x + 0.5; ty = tgt.y + 0.5; }
      else {
        let ub = 1e9;
        for (const v of this.units) if (this.hostile(u.civ, v.civ)) { const d = Math.hypot(v.x - u.x, v.y - u.y); if (d < ub) { ub = d; tx = v.x; ty = v.y; } }
      }
    }
    if (tx == null) return;
    const d = Math.hypot(tx - u.x, ty - u.y);
    if (d > 1.15) {
      const k = Math.min(1, sp * dt / d);
      if (Math.abs(tx - u.x) > 0.05) u.face = tx > u.x ? 1 : -1;
      u.x += (tx - u.x) * k; u.y += (ty - u.y) * k;
    } else if (tgt || u.fx == null) {
      u.fighting = 0.3;
      if (tgt) this.damageBuilding(tgt, 15 * atkM * dt, u.civ);
      for (const v of this.units) if (this.hostile(u.civ, v.civ) && Math.hypot(v.x - u.x, v.y - u.y) < 1.8) this.hurtUnit(v, UNITS.dragon.dps * atkM * dt, u.civ);
      if (this.rng() < dt * 8) this.emit({ type: 'fire', x: u.x + u.face * 0.6, y: u.y + 0.2 });
    }
  }

  moveToward(u, x, y, step, safe) {
    const dx = x - u.x, dy = y - u.y, d = Math.hypot(dx, dy);
    if (d < 1e-4) return;
    const k = Math.min(1, step / d);
    const nx = u.x + dx * k, ny = u.y + dy * k;
    if (!this.inb(Math.floor(nx), Math.floor(ny)) || this.terrain[this.idx(Math.floor(nx), Math.floor(ny))] === T_WATER) return;
    if (safe) { const nb = this.bld[this.idx(Math.floor(nx), Math.floor(ny))]; if (nb && this.hostile(u.civ, nb.civ)) return; }
    if (Math.abs(dx) > 0.05) u.face = dx > 0 ? 1 : -1;
    u.x = nx; u.y = ny;
  }

  // rattrapage : jusqu'à +25% de revenus pour les royaumes très en retard sur le leader
  catchup(c) {
    if (this.civCatchT !== Math.floor(this.time / 5)) {
      this.civCatchT = Math.floor(this.time / 5);
      let max = 1; for (const o of this.civs) if (o.alive && o.tiles > max) max = o.tiles;
      for (const o of this.civs) { const r = o.tiles / max; o.catch = r < 0.55 ? 1.25 : r < 0.75 ? 1.12 : 1; }
    }
    return c.catch || 1;
  }

  // ------------------------------------------------------------ Bâtiments : prod, spawn, tirs
  updateBuildings(dt) {
    for (const c of this.civs) {
      if (!c.alive) continue;
      const mult = (this.time < c.buffs.prodUntil ? c.buffs.prodMult : 1) * (c.pers.incomeMul || 1) * this.catchup(c);
      for (const k in BASE_INCOME) c.res[k] += BASE_INCOME[k] * dt * mult;
      c.res.food += (c.bcount.village || 0) * 0.2 * dt * mult;
    }
    for (const b of this.buildings) {
      const c = this.civs[b.civ], d = BUILDINGS[b.type];
      if (d.prod) {
        const mult = (this.time < c.buffs.prodUntil ? c.buffs.prodMult : 1) * (c.pers.incomeMul || 1) * this.catchup(c) * (1 + LVL.prod * (b.lvl - 1));
        for (const k in d.prod) c.res[k] += d.prod[k] * dt * mult;
      }
      if (b.type === 'barracks' || b.type === 'capital') {
        b.spawnT += dt;
        const interval = (b.type === 'capital' ? (c.pers.capSpawn || 18) : 9 / (1 + 0.25 * (b.lvl - 1)));
        if (b.spawnT >= interval) {
          const rich = c.res.food > 350 && c.res.wood > 120 && c.res.stone > 70 && (c.types.knight || 0) < 3 + (c.bcount.forge || 0) * 2 && c.unitCount < this.armyCap(c) + 6;
          if (b.type === 'barracks' && rich && this.rng() < 0.5 && this.spawnUnit(c, 'knight', b.x + 0.5, b.y + 0.5)) b.spawnT = 0;
          else if (c.unitCount < this.armyCap(c)) {
            const wantCat = b.type === 'barracks' && c.bcount.forge > 0 && (c.types.catapult || 0) < 3 && c.unitCount >= 5 && this.rng() < 0.4 && this.canAfford(c, UNITS.catapult.cost, { wood: 40 });
            if (wantCat) { this.spawnUnit(c, 'catapult', b.x + 0.5, b.y + 0.5); b.spawnT = 0; }
            else if (this.canAfford(c, UNITS.soldier.cost)) { this.spawnUnit(c, 'soldier', b.x + 0.5, b.y + 0.5); b.spawnT = 0; }
            else b.spawnT = interval - 1.5;
          } else b.spawnT = interval - 1.5;
        }
      }
      if (d.shoot) {
        b.cd -= dt;
        const range = d.shoot.range;
        let tgt = null, bd = range;
        for (const u of this.units) {
          if (u.civ === b.civ || u.hp <= 0 || !this.hostile(b.civ, u.civ)) continue;
          const dd = Math.hypot(u.x - b.x - 0.5, u.y - b.y - 0.5);
          if (dd < bd) { bd = dd; tgt = u; }
        }
        if (tgt) {
          this.hurtUnit(tgt, d.shoot.dps * (1 + LVL.dps * (b.lvl - 1)) * dt, b.civ);
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
    for (const b of this.buildings) add(b.x + 0.5, b.y + 0.5, this.bR(b), this.bS(b) * (0.6 + 0.4 * b.hp / b.maxhp), b.civ);
    for (const u of this.units) if (u.type !== 'dragon' && u.type !== 'catapult') add(u.x, u.y, 1.9, 0.5, u.civ);
    let changed = false;
    const claims = {};
    for (let i = 0; i < n; i++) {
      if (this.terrain[i] === T_WATER) continue;
      const b = this.bld[i];
      if (b) { if (this.owner[i] !== b.civ) { this.owner[i] = b.civ; changed = true; (claims[b.civ] = claims[b.civ] || []).push(i); } continue; }
      let best = -1, bv = 0;
      for (let ci = 0; ci < N; ci++) { const v = infl[i * N + ci]; if (v > bv) { bv = v; best = ci; } }
      const cur = this.owner[i], curV = cur >= 0 ? infl[i * N + cur] : 0;
      let nw = cur;
      if (best >= 0 && best !== cur && bv > 0.55 && bv > curV * 1.25 + 0.15) nw = best;
      else if (cur >= 0 && curV < 0.2) nw = -1;
      if (nw !== cur) {
        this.owner[i] = nw; changed = true;
        if (nw >= 0) (claims[nw] = claims[nw] || []).push(i);
        if (cur >= 0 && nw >= 0) { const k = cur + '>' + nw; this.captureAcc[k] = (this.captureAcc[k] || 0) + 1; }
      }
    }
    for (const c of this.civs) c.tiles = 0;
    for (let i = 0; i < n; i++) if (this.owner[i] >= 0) this.civs[this.owner[i]].tiles++;
    for (const c of this.civs) if (c.tiles > c.peak) c.peak = c.tiles;
    if (changed) {
      this.terrVersion++;
      for (const k in claims) if (this.time > 1) this.emit({ type: 'claims', civ: +k, tiles: claims[k].slice(0, 40) });
    }
  }

  // ------------------------------------------------------------ IA
  frontierInfo(c) {
    const { W, H } = this, out = { empty: [] };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (this.owner[i] !== c.idx || this.terrain[i] === T_WATER || this.bld[i]) continue;
      out.empty.push(i);
    }
    return out;
  }
  countAround(x, y, r, pred) {
    let n = 0;
    for (let yy = Math.floor(y - r); yy <= Math.ceil(y + r); yy++) for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++) {
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
    const prodDefs = [['farm', T_PLAIN, 2 + tiles / 45, c.res.food < 90 ? 1.5 : 1], ['sawmill', T_FOREST, 1.5 + tiles / 55, c.res.wood < 80 ? 1.6 : 1], ['quarry', T_MOUNTAIN, 1.5 + tiles / 45, c.res.stone < 60 ? 1.6 : 1]];
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
    const threat = this.units.some(u => this.hostile(c.idx, u.civ) && this.owner[this.idx(Math.floor(u.x), Math.floor(u.y))] === c.idx) ? 1.8 : 1;
    if (towers < 1 + tiles / 20 * w.defense) {
      consider('tower', w.defense * 1.15 * threat, () => pickBy((x, y, i) => frontScore(x, y) > 0 && this.nearestOwn(c, x, y, ['tower']) >= 2.6, (x, y) => frontScore(x, y) - distCap(x, y) * 0.05));
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
    // forge (déblocage des améliorations et des catapultes)
    const forges = B.forge || 0;
    if (forges < 1 + (tiles > 200 ? 1 : 0) && rax >= 1 && this.time > 80) {
      consider('forge', (forges === 0 ? 1.6 : 0.7) * (0.6 + 0.4 * w.military), () => pickBy((x, y, i) => this.terrain[i] === T_PLAIN && distCap(x, y) <= 9, (x, y) => -Math.abs(distCap(x, y) - 4)));
    }

    options.sort((a, b) => b.score - a.score);
    let built = 0;
    for (let k = 0; k < options.length && built < 2; k++) {
      const o = options[k];
      if (!this.canAfford(c, BUILDINGS[o.type].cost)) { if (k === 0 && o.score > 1.4) break; continue; }
      const t = o.chooser();
      if (!t) continue;
      if (this.tryBuild(c, o.type, t.x, t.y)) built++;
    }
    this.aiSpend(c, w);
    this.aiMilitary(c, w);
  }

  // dépenses « de luxe » : améliorations et recherches de la forge
  aiSpend(c, w) {
    // le marché : l'excédent de nourriture ou de bois est échangé contre de la pierre (3 pour 1)
    for (const k of ['food', 'wood']) if (c.res[k] > 350 && c.res.stone < 130) { c.res[k] -= 150; c.res.stone += 50; }
    const reserve = { food: 70, wood: 70, stone: 50 };
    const opts = [];
    const tcap = this.techCap(c);
    for (const k of TECH_KEYS) {
      if (c.tech[k] >= tcap) continue;
      const cost = this.techCost(c, k);
      const sc = k === 'armes' ? w.military * 1.2 : k === 'armures' ? w.military * 0.7 + w.defense * 0.4 : w.defense * 1.2;
      opts.push({ sc: sc * (0.85 + this.rng() * 0.3), cost, run: () => { c.tech[k]++; this.log(`${c.name} : ${TECHS[k].label} niveau ${c.tech[k]} (${TECHS[k].desc}).`, c.idx, '⚒️', 0); this.emit({ type: 'tech', civ: c.idx }); } });
    }
    for (const b of this.buildings) {
      if (b.civ !== c.idx) continue;
      const cost = this.upgradeCost(b);
      if (!cost) continue;
      const sc = b.type === 'capital' ? 1.2 : b.type === 'village' ? 0.9 * w.expand : b.type === 'tower' ? 0.8 * w.defense : b.type === 'barracks' ? 0.8 * w.military : 0.6 * w.eco;
      opts.push({ sc: sc * (0.85 + this.rng() * 0.3) / b.lvl, cost, run: () => this.upgradeBuilding(b) });
    }
    opts.sort((a, b) => b.sc - a.sc);
    let done = 0;
    for (const o of opts) {
      if (done >= 2) break;
      if (!this.canAfford(c, o.cost, reserve)) continue;
      this.pay(c, o.cost); o.run(); done++;
    }
  }

  biggestNearbyArmy(c) {
    // plus grosse armée rivale : on évite de foncer dans un mur d'épées
    let m = 0;
    for (const o of this.civs) if (o !== c && o.alive && this.hostile(c.idx, o.idx)) m = Math.max(m, o.unitCount * 0.6);
    return m;
  }

  aiMilitary(c, w) {
    const idle = [];
    for (const u of this.units) if (u.civ === c.idx && u.tx < 0 && (u.type === 'soldier' || u.type === 'catapult')) idle.push(u);
    const knights = this.units.filter(u => u.civ === c.idx && u.type === 'knight' && u.tx < 0);
    c.attackCd -= 2.5;
    const sendable = idle.concat(knights);
    const home = Math.min(w.guard, idle.length);
    const attackAt = Math.max(4, w.attackAt - Math.floor(this.time / 100));
    if (this.time > w.firstAttack && sendable.length - home >= attackAt && c.attackCd <= 0 && (sendable.length - home) * 1.15 > this.biggestNearbyArmy(c)) {
      const rivals = this.civs.filter(o => o !== c && o.alive && this.hostile(c.idx, o.idx));
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
          if (b.type === 'wall') s += 3; else if (b.type === 'tower') s += 2;
          else if (b.type === 'capital') s += this.time < 200 ? 40 : strongEnough ? (c.pers.weakest || c.personality === 'belliqueux' ? -9 : 1) : 14;
          else if (b.type === 'farm' || b.type === 'sawmill' || b.type === 'quarry') s -= 1;
          if (s < bs) { bs = s; best = b; }
        }
        if (best) {
          const group = sendable.slice(home);
          this.orderAll(c, best.x, best.y, group);
          c.attackCd = Math.max(12, 24 - this.time / 50);
          this.log(`${c.leader} lance ${group.length} braves vers ${target.name} (« ${QUIPS.soldier[Math.floor(this.rng() * QUIPS.soldier.length)]} »).`, c.idx, '⚔️', 1);
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
        for (const v of this.units) if (this.hostile(c.idx, v.civ) && Math.hypot(v.x - u.x, v.y - u.y) < 5) { enemyNear = true; break; }
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
  comboFor(card) {
    const lp = this.lastPlayed;
    if (!lp || this.time - lp.t > COMBO_WINDOW) return null;
    for (const cb of COMBOS) if (cb.a.indexOf(lp.id) >= 0 && cb.b.indexOf(card.id) >= 0) return cb;
    return null;
  }
  isBehind() {
    const alive = this.civs.filter(c => c.alive), me = this.civs[0];
    if (alive.length < 3) return me.tiles < alive.reduce((a, c) => a + c.tiles, 0) / alive.length * 0.8;
    const sorted = alive.slice().sort((a, b) => b.tiles - a.tiles);
    return sorted.indexOf(me) >= 2;
  }
  drawHand() {
    const pinned = this.pinned ? CARDS.find(c => c.id === this.pinned) : null;
    const behind = this.isBehind();
    const hand = pinned ? [pinned] : [];
    const pool = CARDS.filter(c => c !== pinned);
    const weight = c => (c.rarity === 'rare' ? (behind ? 1.1 : 0.35) : 1);
    let doc = hand.filter(c => c.kind === 'doc').length;
    let tries = 0;
    while (hand.length < (pinned ? 4 : 3) && pool.length && tries++ < 200) {
      let tot = 0; for (const c of pool) tot += weight(c);
      let r = this.rng() * tot, k = 0;
      for (; k < pool.length - 1; k++) { r -= weight(pool[k]); if (r <= 0) break; }
      const card = pool[k];
      if (card.kind === 'doc' && doc >= 1) continue;
      if (card.kind === 'doc') doc++;
      hand.push(card); pool.splice(k, 1);
    }
    // coup de pouce : un retardataire reçoit presque toujours une carte rare
    if (behind && !hand.some(c => c.rarity === 'rare') && this.rng() < 0.8) {
      const rares = pool.filter(c => c.rarity === 'rare');
      if (rares.length) hand[hand.length - 1] = rares[Math.floor(this.rng() * rares.length)];
    }
    this.hand = hand;
    this.emit({ type: 'hand', behind });
  }
  togglePin(i) {
    const card = this.hand[i];
    if (!card) return;
    this.pinned = this.pinned === card.id ? null : card.id;
  }
  playCard(i, x, y) {
    const card = this.hand[i], c = this.civs[0];
    if (!card || !c.alive || this.spectator) return false;
    if (card.target && !this.validTarget(card, c, x, y)) return false;
    const combo = this.comboFor(card);
    card.apply(this, c, { x, y });
    this.log(`Vous jouez « ${card.name} ».`, 0, '✨', 1);
    if (combo) {
      combo.apply(this, c, { x, y });
      this.news(`COMBO « ${combo.name} » : ${combo.desc} !`, 0, '⚡');
      this.emit({ type: 'combo' });
    }
    this.emit({ type: 'cardPlayed', card: card.id, x: x == null ? -1 : x + 0.5, y: y == null ? -1 : y + 0.5 });
    if (this.pinned === card.id) this.pinned = null;
    this.lastPlayed = { id: card.id, t: this.time };
    this.hand = []; this.cardTimer = this.rand(30, 45); this.cardsPlayed++;
    this.terrT = 0;
    return true;
  }
  skipCard() {
    if (!this.hand.length || this.spectator) return;
    this.hand = []; this.cardTimer = this.rand(30, 45);
    this.addRes(this.civs[0], { food: 30 });
    this.log('Vous ne faites rien. Le royaume apprécie (+30 nourriture).', 0, '😴', 1);
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
      if (c.pers.sabotage) { c.sabT -= dt; if (c.sabT <= 0) { c.sabT = this.rand(35, 55); this.sabotage(c); } }
    }
    for (let i = this.pacts.length - 1; i >= 0; i--) {
      const p = this.pacts[i];
      if (p.until < this.time) { this.pacts.splice(i, 1); this.log(`Le pacte entre ${this.civs[p.a].name} et ${this.civs[p.b].name} expire.`, p.a, '🤝', 1); }
    }
    this.fieldClear -= dt;
    if (this.fieldClear <= 0) { this.fields.clear(); this.fieldClear = 8; }
    // cartes
    if (!this.spectator && !this.hand.length && this.civs[0].alive) { this.cardTimer -= dt; if (this.cardTimer <= 0) this.drawHand(); }
    // événements aléatoires
    this.eventT -= dt;
    if (this.eventT <= 0) { this.eventT = this.rand(60, 100); this.randomEvent(); }
    // captures de territoire
    this.captureT -= dt;
    if (this.captureT <= 0) { this.captureT = 6; this.flushCaptures(); }
    // historique
    this.histT -= dt;
    if (this.histT <= 0) { this.histT = 10; this.history.push({ t: this.time, tiles: this.civs.map(c => c.alive ? c.tiles : 0) }); }
    // répliques
    this.quipT -= dt;
    if (this.quipT <= 0) { this.quipT = this.rand(2.2, 4.5); this.randomQuip(); }
    // fin de partie
    const alive = this.civs.filter(c => c.alive);
    if (this.time >= this.duration || alive.length <= 1 || (!this.spectator && !this.civs[0].alive)) this.finish(alive.length <= 1 ? 'domination' : (!this.spectator && !this.civs[0].alive ? 'defeat' : 'time'));
  }
  flushCaptures() {
    for (const k in this.captureAcc) {
      const n = this.captureAcc[k];
      if (n >= 7) {
        const [a, b] = k.split('>').map(Number);
        this.log(`${this.civs[b].name} grignote ${n} cases à ${this.civs[a].name}.`, b, '🚩', n >= 16 ? 2 : 1);
      }
    }
    this.captureAcc = {};
  }
  sabotage(c) {
    const targets = this.buildings.filter(b => b.civ !== c.idx && b.type !== 'capital' && this.hostile(c.idx, b.civ));
    if (!targets.length) return;
    const b = targets[Math.floor(this.rng() * targets.length)];
    this.emit({ type: 'explosion', x: b.x + 0.5, y: b.y + 0.5, r: 0.9 });
    this.log(`Un canard a « accidentellement » renversé une lanterne sur ${BUILDINGS[b.type].name.toLowerCase()} de ${this.civs[b.civ].name}.`, c.idx, '🕵️', 1);
    this.damageBuilding(b, 70, c.idx);
  }
  randomEvent() {
    if (this.time < 100) return;
    let tot = 0; for (const e of EVENTS) tot += e.w;
    let r = this.rng() * tot, ev = EVENTS[0];
    for (const e of EVENTS) { r -= e.w; if (r <= 0) { ev = e; break; } }
    ev.run(this);
    this.emit({ type: 'event', id: ev.id });
  }
  randomQuip() {
    const c = this.civs[Math.floor(this.rng() * this.civs.length)];
    if (!c.alive) return;
    const r = this.rng();
    if (r < 0.45) {
      const bs = this.buildings.filter(b => b.civ === c.idx && BUILDINGS[b.type].prod);
      if (bs.length) { const b = bs[Math.floor(this.rng() * bs.length)]; this.emit({ type: 'quip', x: b.x + 0.5, y: b.y + 0.2, text: QUIPS.worker[Math.floor(this.rng() * QUIPS.worker.length)] }); }
    } else if (r < 0.85) {
      const us = this.units.filter(u => u.civ === c.idx && u.type !== 'dragon');
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
    this.history.push({ t: this.time, tiles: this.civs.map(c => c.alive ? c.tiles : 0) });
    const rank = this.ranking();
    this.result = { reason, rank, winner: rank[0], playerRank: rank.indexOf(this.civs[0]) + 1 };
    this.emit({ type: 'over' });
  }
}
