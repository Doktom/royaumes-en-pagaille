'use strict';
// ---------------------------------------------------------------
// Interface, boucle de jeu, écrans
// ---------------------------------------------------------------
(function () {
  const $ = id => document.getElementById(id);
  const STEP = 0.05;
  const canvas = $('map'), renderer = new Renderer(canvas);
  let sim = null, speed = 1, acc = 0, last = 0, targeting = -1, hover = null, handShown = null, uiT = 0, logLines = [];
  let settings = { preset: 0, rivals: 2 };

  // ------------------------------------------------ Menu
  const pick = $('civPick');
  CIV_PRESETS.forEach((p, i) => {
    const d = document.createElement('div');
    d.className = 'civ' + (i === settings.preset ? ' on' : '');
    d.innerHTML = `<div class="flagc" style="background:${p.color}"></div><b>${p.name}</b><small>${p.leader}</small><em>${PERSONALITIES[p.personality].label}</em><small>« ${p.motto} »</small>`;
    d.onclick = () => { settings.preset = i; [...pick.children].forEach((c, k) => c.classList.toggle('on', k === i)); };
    pick.appendChild(d);
  });
  $('rivalPick').onclick = e => {
    const n = e.target.dataset && e.target.dataset.n; if (!n) return;
    settings.rivals = +n; [...$('rivalPick').children].forEach(b => b.classList.toggle('on', b.dataset.n === n));
  };
  $('bStart').onclick = () => startGame();
  $('bAgain').onclick = () => startGame();
  $('bMenu').onclick = () => { $('end').classList.add('hidden'); $('menu').classList.remove('hidden'); };

  function startGame() {
    sim = new Sim({ playerPreset: settings.preset, rivals: settings.rivals, duration: 600 });
    renderer.setSim(sim);
    logLines = []; handShown = null; targeting = -1; acc = 0; setSpeed(1);
    $('menu').classList.add('hidden'); $('end').classList.add('hidden');
    layout(); uiT = 0;
    sim.log(`${sim.civs[0].leader} prend la tête de ${sim.civs[0].name}. « ${sim.civs[0].motto} »`, 0);
  }

  // ------------------------------------------------ Mise en page
  function layout() {
    const wide = innerWidth >= 980;
    const availW = wide ? innerWidth - 360 - 14 - 32 : innerWidth - 24;
    const availH = wide ? innerHeight - 28 : Math.min(innerHeight * 0.7, innerWidth);
    renderer.resize(Math.max(280, Math.min(availW, availH)));
  }
  addEventListener('resize', layout);
  layout();

  // ------------------------------------------------ Vitesse
  function setSpeed(s) {
    speed = s;
    $('bPause').classList.toggle('on', s === 0);
    $('b1').classList.toggle('on', s === 1);
    $('b2').classList.toggle('on', s === 2);
    $('pausetag').classList.toggle('hidden', s !== 0);
  }
  $('bPause').onclick = () => setSpeed(speed === 0 ? 1 : 0);
  $('b1').onclick = () => setSpeed(1);
  $('b2').onclick = () => setSpeed(2);

  // ------------------------------------------------ Cartes
  function showBanner(t) { const b = $('banner'); if (t) { b.textContent = t; b.classList.remove('hidden'); } else b.classList.add('hidden'); }
  let toastT = 0;
  function toast(t) { const el = $('toast'); el.textContent = t; el.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.add('hidden'), 1800); }
  function cancelTarget() { targeting = -1; $('stage').classList.remove('targeting'); showBanner(''); for (const c of $('hand').querySelectorAll('.card')) c.classList.remove('sel'); }
  function chooseCard(i) {
    if (!sim || sim.over || !sim.hand[i]) return;
    if (speed === 0) setSpeed(1);
    const card = sim.hand[i];
    if (!card.target) { sim.playCard(i); cancelTarget(); handShown = null; return; }
    if (targeting === i) { cancelTarget(); return; }
    targeting = i; $('stage').classList.add('targeting');
    showBanner(`« ${card.name} » : cliquez sur la carte du monde (Échap pour annuler)`);
    [...$('hand').querySelectorAll('.card')].forEach((c, k) => c.classList.toggle('sel', k === i));
  }
  canvas.addEventListener('mousemove', e => { hover = renderer.tileAt(e.clientX, e.clientY); tileInfo(); });
  canvas.addEventListener('mouseleave', () => { hover = null; });
  canvas.addEventListener('click', e => {
    if (targeting < 0 || !sim) return;
    const t = renderer.tileAt(e.clientX, e.clientY); if (!t) return;
    const card = sim.hand[targeting];
    if (!card) { cancelTarget(); return; }
    if (sim.validTarget(card, sim.civs[0], t.x, t.y)) { sim.playCard(targeting, t.x, t.y); cancelTarget(); handShown = null; }
    else toast(card.target === 'own' ? 'Il faut une case libre de votre territoire !' : 'Case impossible (un lac, peut-être ?)');
  });
  canvas.addEventListener('contextmenu', e => { e.preventDefault(); cancelTarget(); });
  addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.key === 'Escape') cancelTarget();
    else if (e.key === ' ') { e.preventDefault(); if (sim && !sim.over) setSpeed(speed === 0 ? 1 : 0); }
    else if (e.key === 'f' || e.key === 'F') setSpeed(speed === 2 ? 1 : 2);
    else if (e.key >= '1' && e.key <= '3') chooseCard(+e.key - 1);
  });

  function tileInfo() {
    if (!sim || !hover) return;
    const i = sim.idx(hover.x, hover.y), o = sim.owner[i], b = sim.bld[i];
    $('tileinfo').textContent = `${TERRAIN_NAMES[sim.terrain[i]]}` + (b ? ` · ${BUILDINGS[b.type].name} (${Math.ceil(b.hp)} PV)` : '') + (o >= 0 ? ` · ${sim.civs[o].name}` : (sim.terrain[i] === T_WATER ? '' : ' · Terre sans maître'));
  }

  // ------------------------------------------------ HUD
  const mmss = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  function updateHud() {
    $('time').textContent = mmss(sim.duration - sim.time);
    const me = sim.civs[0];
    $('doctrine').textContent = me.doctrine ? DOCTRINES[me.doctrine].label : 'Aucune doctrine';
    // scoreboard
    let land = 0; for (let i = 0; i < sim.terrain.length; i++) if (sim.terrain[i] !== T_WATER) land++;
    $('board').innerHTML = sim.ranking().map(c => `<div class="row-civ ${c.alive ? '' : 'dead'} ${c.isPlayer ? 'me' : ''}">
      <div class="dot" style="background:${c.color}"></div>
      <div class="nm">${c.isPlayer ? '★ ' : ''}${c.name}<div class="bar"><i style="width:${Math.round(c.tiles / land * 100)}%;background:${c.color}"></i></div></div>
      <div class="st">${Math.round(c.tiles / land * 100)}%<br>⚔ ${c.unitCount}</div></div>`).join('');
    $('res').innerHTML = `<span>🌾 ${Math.floor(me.res.food)}</span><span>🪵 ${Math.floor(me.res.wood)}</span><span>🪨 ${Math.floor(me.res.stone)}</span>`;
    // cartes
    const h = $('hand');
    if (sim.hand.length) {
      if (handShown !== sim.hand) {
        handShown = sim.hand;
        h.innerHTML = `<h4><span>Choisissez une carte</span><button id="bSkip">Ne rien faire (+30 🌾)</button></h4>`;
        sim.hand.forEach((c, i) => {
          const d = document.createElement('div');
          d.className = 'card k-' + c.kind;
          d.innerHTML = `<span class="tg">${CARD_KINDS[c.kind]}</span><div class="ic">${c.icon}</div><div><div class="nm">${c.name}</div><div class="ds">${c.desc}</div></div><span class="key">${c.target ? '🎯 ' : ''}[${i + 1}]</span>`;
          d.onclick = () => chooseCard(i);
          h.appendChild(d);
        });
        $('bSkip').onclick = () => { sim.skipCard(); cancelTarget(); handShown = null; };
      }
    } else if (handShown !== 'wait') {
      handShown = 'wait';
      h.innerHTML = `<div class="wait">Les conseillers se disputent...<div class="meter"><i id="meter"></i></div><span id="waitT"></span></div>`;
    }
    if (handShown === 'wait') {
      const m = $('meter'), t = $('waitT');
      if (m) m.style.width = Math.round(Math.max(0, Math.min(1, 1 - sim.cardTimer / 40)) * 100) + '%';
      if (t) t.textContent = 'Prochaine pioche dans ' + Math.max(0, Math.ceil(sim.cardTimer)) + ' s';
    }
    // journal
    $('log').innerHTML = logLines.map((l, i) => `<div style="opacity:${1 - i * 0.11}"><i style="background:${l.color}"></i><span>${l.text}</span></div>`).join('');
  }
  function addLog(e) {
    const color = e.civ >= 0 && sim.civs[e.civ] ? sim.civs[e.civ].color : '#999';
    logLines.unshift({ text: e.text, color }); if (logLines.length > 7) logLines.pop();
  }

  // ------------------------------------------------ Fin de partie
  function showEnd() {
    const r = sim.result, me = sim.civs[0];
    const win = r.winner === me;
    $('endTitle').textContent = win ? '🏆 Victoire !' : (!me.alive ? '💀 Défaite...' : 'Fin de partie');
    $('endSub').textContent = win ? `${me.leader} trône fièrement sur ${me.tiles} cases. Les cartes avaient du bon.`
      : !me.alive ? `${me.leader} s'est enfui en pantoufles. Le fromage sera pour une autre fois.`
      : `${r.winner.leader} remporte la partie. Vous finissez ${r.playerRank}ᵉ, avec les honneurs (et quelques regrets).`;
    $('endRank').innerHTML = r.rank.map((c, i) => `<div class="rk ${c.isPlayer ? 'me' : ''}"><span class="n">${i + 1}</span><span class="dot" style="background:${c.color}"></span><span>${c.name}<br><small>${c.leader} · ${c.alive ? c.tiles + ' cases' : 'éliminé'}</small></span><span><small>⚔ ${c.stats.kills} victoires</small></span></div>`).join('');
    $('end').classList.remove('hidden');
  }

  // ------------------------------------------------ Boucle
  function frame(ts) {
    const dt = Math.min(0.1, (ts - last) / 1000 || 0); last = ts;
    if (sim) {
      if (!sim.over && speed > 0) {
        acc += dt * speed; let n = 0;
        while (acc >= STEP && n < 14) { sim.step(STEP); acc -= STEP; n++; }
        if (n >= 14) acc = 0;
      }
      const ev = sim.drain();
      let over = false;
      for (const e of ev) { if (e.type === 'log') addLog(e); else if (e.type === 'over') over = true; else if (e.type === 'hand') { if (speed === 2) { /* garder la vitesse */ } } }
      renderer.consume(ev.filter(e => e.type !== 'log'));
      renderer.draw(ts, speed > 0 ? dt * speed : 0, { targeting: targeting >= 0 ? sim.hand[targeting] : null, hover });
      uiT -= dt;
      if (uiT <= 0) { uiT = 0.2; updateHud(); }
      if (targeting >= 0 && !sim.hand[targeting]) cancelTarget();
      if (over) { updateHud(); showEnd(); }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // pour les tests
  window.__game = { get sim() { return sim; }, startGame, settings, setSpeed, renderer };
})();
