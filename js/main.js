'use strict';
// ---------------------------------------------------------------
// Interface, boucle de jeu, écrans
// ---------------------------------------------------------------
(function () {
  const $ = id => document.getElementById(id);
  const STEP = 0.05;
  const canvas = $('map'), renderer = new Renderer(canvas);
  let sim = null, speed = 1, acc = 0, last = 0, targeting = -1, hover = null, handShown = null, uiT = 0, chron = [];
  let newsT = 0, tension = 0, battleAcc = 0, toastT = 0;
  const settings = { preset: 0, rivals: 2, mode: 'play', seed: null };

  // ------------------------------------------------ Lien partageable (#s=graine&c=civ&r=rivaux&m=play|spec)
  function readHash() {
    try {
      const p = new URLSearchParams(location.hash.slice(1));
      if (p.get('s') && /^\d+$/.test(p.get('s'))) settings.seed = +p.get('s');
      if (p.get('c') && +p.get('c') >= 0 && +p.get('c') < 4) settings.preset = +p.get('c');
      if (p.get('r') && +p.get('r') >= 1 && +p.get('r') <= 3) settings.rivals = +p.get('r');
      if (p.get('m') === 'spec' || p.get('m') === 'play') settings.mode = p.get('m');
    } catch (e) { /* lien invalide : on ignore */ }
  }
  function shareURL() {
    const base = location.href.split('#')[0];
    return `${base}#s=${sim.seed}&c=${settings.preset}&r=${settings.rivals}&m=${settings.mode}`;
  }
  function copyLink(btn) {
    const url = shareURL(), done = () => { const t = btn.textContent; btn.textContent = 'Lien copié !'; setTimeout(() => btn.textContent = t, 1600); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => prompt('Copiez ce lien :', url));
    else prompt('Copiez ce lien :', url);
  }

  // ------------------------------------------------ Menu
  const pick = $('civPick');
  CIV_PRESETS.forEach((p, i) => {
    const d = document.createElement('div');
    d.className = 'civ';
    d.innerHTML = `<div class="flagc" style="background:${p.color}"></div><b>${p.name}</b><small>${p.leader}</small><em>${PERSONALITIES[p.personality].label}</em><small>${PERSONALITIES[p.personality].trait}</small>`;
    d.onclick = () => { settings.preset = i; refreshMenu(); };
    pick.appendChild(d);
  });
  function refreshMenu() {
    [...pick.children].forEach((c, k) => c.classList.toggle('on', k === settings.preset));
    [...$('rivalPick').children].forEach(b => b.classList.toggle('on', +b.dataset.n === settings.rivals));
    [...$('modePick').children].forEach(b => b.classList.toggle('on', b.dataset.m === settings.mode));
    $('seedIn').value = settings.seed == null ? '' : settings.seed;
    $('pickTitle').textContent = settings.mode === 'spec' ? 'Première civilisation (en spectateur, toutes sont pilotées par l\'IA)' : 'Choisissez votre civilisation';
  }
  $('rivalPick').onclick = e => { const n = e.target.dataset && e.target.dataset.n; if (n) { settings.rivals = +n; refreshMenu(); } };
  $('modePick').onclick = e => { const m = e.target.dataset && e.target.dataset.m; if (m) { settings.mode = m; refreshMenu(); } };
  $('seedIn').oninput = () => { const v = $('seedIn').value.trim(); settings.seed = /^\d+$/.test(v) ? +v : null; };
  $('seedRnd').onclick = () => { settings.seed = Math.floor(Math.random() * 1e6); refreshMenu(); };
  $('bStart').onclick = () => { Sound.init(); startGame(settings.seed); };
  $('bAgain').onclick = () => { Sound.init(); startGame(sim.seed); };
  $('bNew').onclick = () => { Sound.init(); startGame(null); };
  $('bMenu').onclick = () => { $('end').classList.add('hidden'); $('menu').classList.remove('hidden'); settings.seed = null; refreshMenu(); };
  $('bCopyEnd').onclick = e => copyLink(e.target);
  $('bCopy').onclick = e => copyLink(e.target);

  function startGame(seed) {
    sim = new Sim({ playerPreset: settings.preset, rivals: settings.rivals, duration: 600, spectator: settings.mode === 'spec', seed: seed == null ? Math.floor(Math.random() * 1e6) : seed });
    renderer.setSim(sim);
    chron = []; handShown = null; targeting = -1; acc = 0; tension = 0; battleAcc = 0;
    document.body.classList.toggle('spectator', sim.spectator);
    $('b4').classList.toggle('hidden', !sim.spectator);
    setSpeed(1);
    $('menu').classList.add('hidden'); $('end').classList.add('hidden'); $('news').classList.add('hidden');
    $('seedTxt').textContent = 'Graine ' + sim.seed;
    try { history.replaceState(null, '', '#s=' + sim.seed + '&c=' + settings.preset + '&r=' + settings.rivals + '&m=' + settings.mode); } catch (e) { /* ignoré */ }
    layout(); uiT = 0;
    const me = sim.civs[0];
    sim.log(sim.spectator ? 'Le spectacle commence : les civilisations se débrouillent seules.' : `${me.leader} prend la tête de ${me.name}. « ${me.motto} »`, 0, '🏰', 1);
    Sound.startMusic();
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

  // ------------------------------------------------ Vitesse et son
  function setSpeed(s) {
    speed = s;
    $('bPause').classList.toggle('on', s === 0);
    $('b1').classList.toggle('on', s === 1);
    $('b2').classList.toggle('on', s === 2);
    $('b4').classList.toggle('on', s === 4);
    $('pausetag').classList.toggle('hidden', s !== 0);
    Sound.pause(s === 0);
  }
  $('bPause').onclick = () => setSpeed(speed === 0 ? 1 : 0);
  $('b1').onclick = () => setSpeed(1);
  $('b2').onclick = () => setSpeed(2);
  $('b4').onclick = () => setSpeed(4);
  function paintMute() { $('bMute').textContent = Sound.isMuted() ? '🔇' : '🔊'; }
  $('bMute').onclick = () => { Sound.init(); Sound.setMuted(!Sound.isMuted()); paintMute(); };
  paintMute();

  // ------------------------------------------------ Cartes
  function showBanner(t) { const b = $('banner'); if (t) { b.textContent = t; b.classList.remove('hidden'); } else b.classList.add('hidden'); }
  function toast(t) { const el = $('toast'); el.textContent = t; el.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.add('hidden'), 1800); }
  function cancelTarget() { targeting = -1; $('stage').classList.remove('targeting'); showBanner(''); for (const c of $('hand').querySelectorAll('.card')) c.classList.remove('sel'); }
  function chooseCard(i) {
    if (!sim || sim.over || sim.spectator || !sim.hand[i]) return;
    if (speed === 0) setSpeed(1);
    const card = sim.hand[i];
    Sound.play('select');
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
    else if (e.key === 'm' || e.key === 'M') $('bMute').click();
    else if (e.key >= '1' && e.key <= '4') chooseCard(+e.key - 1);
  });

  function tileInfo() {
    if (!sim || !hover) return;
    const i = sim.idx(hover.x, hover.y), o = sim.owner[i], b = sim.bld[i];
    $('tileinfo').textContent = `${TERRAIN_NAMES[sim.terrain[i]]}` + (b ? ` · ${BUILDINGS[b.type].name}${b.lvl > 1 ? ' niv.' + b.lvl : ''} (${Math.ceil(b.hp)} PV)` : '') + (o >= 0 ? ` · ${sim.civs[o].name}` : (sim.terrain[i] === T_WATER ? '' : ' · Terre sans maître'));
  }

  // ------------------------------------------------ HUD
  const mmss = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  function pactText() {
    const me = sim.civs[0], p = sim.pacts.find(p => p.a === me.idx || p.b === me.idx);
    if (!p) return '';
    const o = sim.civs[p.a === me.idx ? p.b : p.a];
    return `🤝 ${o.id} (${Math.ceil(p.until - sim.time)} s)`;
  }
  function updateHud() {
    $('time').textContent = mmss(sim.duration - sim.time);
    const me = sim.civs[0];
    $('doctrine').textContent = sim.spectator ? '👁 Spectateur' : [me.doctrine ? DOCTRINES[me.doctrine].label : 'Aucune doctrine', pactText()].filter(Boolean).join(' · ');
    let land = 0; for (let i = 0; i < sim.terrain.length; i++) if (sim.terrain[i] !== T_WATER) land++;
    $('board').innerHTML = sim.ranking().map(c => {
      const tk = c.tech.armes + c.tech.armures + c.tech.forts;
      return `<div class="row-civ ${c.alive ? '' : 'dead'} ${c.isPlayer ? 'me' : ''}">
      <div class="dot" style="background:${c.color}"></div>
      <div class="nm">${c.isPlayer ? '★ ' : ''}${c.name}${tk ? ` <small>⚒${tk}</small>` : ''}<div class="bar"><i style="width:${Math.round(c.tiles / land * 100)}%;background:${c.color}"></i></div></div>
      <div class="st">${Math.round(c.tiles / land * 100)}%<br>⚔ ${c.unitCount}</div></div>`;
    }).join('');
    $('res').innerHTML = `<span>🌾 ${Math.floor(me.res.food)}</span><span>🪵 ${Math.floor(me.res.wood)}</span><span>🪨 ${Math.floor(me.res.stone)}</span>`;
    updateHand();
    $('log').innerHTML = chron.map((l, i) => `<div style="opacity:${1 - i * 0.09};border-color:${l.color}"><time>${mmss(l.t)}</time><b>${l.icon}</b><span>${l.text}</span></div>`).join('');
  }
  function updateHand() {
    if (sim.spectator) return;
    const h = $('hand');
    if (sim.hand.length) {
      if (handShown !== sim.hand) {
        handShown = sim.hand;
        h.innerHTML = `<h4><span>Choisissez une carte</span><button id="bSkip">Ne rien faire (+30 🌾)</button></h4>`;
        sim.hand.forEach((c, i) => {
          const cb = sim.comboFor(c);
          const d = document.createElement('div');
          d.className = 'card k-' + c.kind + (c.rarity === 'rare' ? ' rare' : '') + (cb ? ' combo' : '') + (sim.pinned === c.id ? ' pinned' : '');
          d.dataset.id = c.id;
          d.innerHTML = `<span class="tg">${CARD_KINDS[c.kind]}${c.rarity === 'rare' ? ' · rare' : ''}</span><div class="ic">${c.icon}</div><div><div class="nm">${c.name}</div><div class="ds">${c.desc}</div>${cb ? `<div class="cb">⚡ Combo : ${cb.name} (${cb.desc})</div>` : ''}</div><button class="pin" title="Garder cette carte pour le prochain tirage">📌</button><span class="key">${c.target ? '🎯 ' : ''}[${i + 1}]</span>`;
          d.onclick = () => chooseCard(i);
          d.querySelector('.pin').onclick = ev => {
            ev.stopPropagation(); sim.togglePin(i); Sound.play('select');
            for (const el of h.querySelectorAll('.card')) el.classList.toggle('pinned', el.dataset.id === sim.pinned);
          };
          h.appendChild(d);
        });
        $('bSkip').onclick = () => { sim.skipCard(); cancelTarget(); handShown = null; };
      }
    } else if (handShown !== 'wait') {
      handShown = 'wait';
      h.innerHTML = `<div class="wait">Les conseillers se disputent...<div class="meter"><i id="meter"></i></div><span id="waitT"></span><div id="pinTxt"></div></div>`;
    }
    if (handShown === 'wait') {
      const m = $('meter'), t = $('waitT'), pt = $('pinTxt');
      if (m) m.style.width = Math.round(Math.max(0, Math.min(1, 1 - sim.cardTimer / 40)) * 100) + '%';
      if (t) t.textContent = 'Prochaine pioche dans ' + Math.max(0, Math.ceil(sim.cardTimer)) + ' s';
      if (pt) { const pc = sim.pinned && CARDS.find(c => c.id === sim.pinned); pt.textContent = pc ? `📌 Gardée : ${pc.icon} ${pc.name}` : ''; }
    }
  }

  // ------------------------------------------------ Événements du jeu : chronique, bandeau, sons
  function showNews(text, icon) {
    const el = $('news'); el.innerHTML = `<b>${icon || '📜'}</b> ${text}`; el.classList.remove('hidden');
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(newsT); newsT = setTimeout(() => el.classList.add('hidden'), 6000);
  }
  function handleEvents(ev) {
    let over = false;
    for (const e of ev) {
      switch (e.type) {
        case 'log':
          if (e.imp >= 1) {
            const color = e.civ >= 0 && sim.civs[e.civ] ? sim.civs[e.civ].color : '#999';
            chron.unshift({ text: e.text, color, icon: e.icon, t: e.t }); if (chron.length > 8) chron.pop();
            if (e.imp >= 2) showNews(e.text, e.icon);
          }
          break;
        case 'news': Sound.play('news'); break;
        case 'over': over = true; break;
        case 'hand': Sound.play('chime'); break;
        case 'cardPlayed': Sound.play('play'); break;
        case 'combo': Sound.play('combo'); break;
        case 'build': Sound.play('build'); break;
        case 'hit': Sound.play('hit'); battleAcc += 1; break;
        case 'arrow': Sound.play('arrow'); battleAcc += 1; break;
        case 'rock': Sound.play('rock'); battleAcc += 2; break;
        case 'death': Sound.play('death'); battleAcc += 2; break;
        case 'destroy': Sound.play('destroy'); battleAcc += 4; break;
        case 'explosion': Sound.play('explosion'); battleAcc += 4; break;
        case 'quake': Sound.play('quake'); break;
        case 'dragon': Sound.play('dragon'); battleAcc += 8; break;
        case 'upgrade': Sound.play('upgrade'); break;
        case 'attackOrder': Sound.play('horn'); break;
        case 'eliminated': Sound.play('eliminated'); break;
        case 'claims': if (e.tiles.length >= 4) Sound.play('claim'); break;
      }
    }
    return over;
  }

  // ------------------------------------------------ Fin de partie
  function drawChart() {
    const cv = $('endChart'), g = cv.getContext('2d'), W = cv.width, H = cv.height, hs = sim.history;
    g.clearRect(0, 0, W, H);
    let max = 1; for (const h of hs) for (const v of h.tiles) max = Math.max(max, v);
    const tEnd = Math.max(1, hs[hs.length - 1].t);
    g.strokeStyle = 'rgba(90,60,30,.18)'; g.lineWidth = 1;
    for (let k = 1; k < 4; k++) { const y = H - 14 - (H - 24) * k / 4; g.beginPath(); g.moveTo(30, y); g.lineTo(W - 6, y); g.stroke(); }
    g.fillStyle = '#7a6a52'; g.font = '11px "Trebuchet MS",sans-serif'; g.textAlign = 'right';
    g.fillText(String(max), 26, 14); g.fillText('0', 26, H - 10);
    g.textAlign = 'center'; for (let m = 0; m * 60 <= tEnd - 25; m += 2) g.fillText(m + ' min', 30 + (W - 36) * (m * 60) / tEnd, H - 1);
    sim.civs.forEach((c, i) => {
      g.strokeStyle = c.color; g.lineWidth = c.isPlayer ? 4 : 2.6; g.lineJoin = 'round'; g.beginPath();
      hs.forEach((h, k) => { const x = 30 + (W - 36) * h.t / tEnd, y = H - 14 - (H - 24) * h.tiles[i] / max; if (k) g.lineTo(x, y); else g.moveTo(x, y); });
      g.stroke();
    });
  }
  function showEnd() {
    const r = sim.result, me = sim.civs[0], win = r.winner === me && !sim.spectator;
    if (sim.spectator) {
      $('endTitle').textContent = '🎭 Fin du spectacle';
      $('endSub').textContent = `${r.winner.leader} remporte la partie avec ${r.winner.tiles} cases.`;
    } else {
      $('endTitle').textContent = win ? '🏆 Victoire !' : (!me.alive ? '💀 Défaite...' : 'Fin de partie');
      $('endSub').textContent = win ? `${me.leader} trône fièrement sur ${me.tiles} cases. Les cartes avaient du bon.`
        : !me.alive ? `${me.leader} s'est enfui en pantoufles. Le fromage sera pour une autre fois.`
        : `${r.winner.leader} remporte la partie. Vous finissez ${r.playerRank}ᵉ, avec les honneurs (et quelques regrets).`;
    }
    $('endRank').innerHTML = r.rank.map((c, i) => `<div class="rk ${c.isPlayer ? 'me' : ''}"><span class="n">${i + 1}</span><span class="dot" style="background:${c.color}"></span><span>${c.name}<br><small>${c.leader} · ${c.alive ? c.tiles + ' cases' : 'éliminé'} (record ${c.peak})</small></span><span class="sm"><small>⚔ ${c.stats.kills} victoires<br>💥 ${c.stats.razed} bâtiments rasés<br>🔨 ${c.stats.built} construits</small></span></div>`).join('');
    drawChart();
    const keys = sim.chron.filter(c => c.icon === '💀' || c.icon === '⚡' || c.icon === '🐉' || c.icon === '🌋' || c.icon === '🤝' || c.icon === '🔪' || c.icon === '🚩');
    const pickd = keys.length > 7 ? keys.filter((_, i) => i % Math.ceil(keys.length / 7) === 0).slice(0, 7) : keys;
    $('endChron').innerHTML = pickd.length ? '<h4>Moments marquants</h4>' + pickd.map(c => `<div><time>${mmss(c.t)}</time><b>${c.icon}</b><span>${c.text}</span></div>`).join('') : '';
    $('endSeed').textContent = 'Graine ' + sim.seed;
    $('end').classList.remove('hidden');
    Sound.play(win ? 'win' : (!me.alive && !sim.spectator ? 'lose' : 'news'));
    Sound.setTension(0);
  }

  // ------------------------------------------------ Boucle
  function frame(ts) {
    const dt = Math.min(0.1, (ts - last) / 1000 || 0); last = ts;
    if (sim) {
      if (!sim.over && speed > 0) {
        acc += dt * speed; let n = 0;
        const cap = 14 + (speed > 2 ? 12 : 0);
        while (acc >= STEP && n < cap) { sim.step(STEP); acc -= STEP; n++; }
        if (n >= cap) acc = 0;
      }
      const ev = sim.drain();
      const over = handleEvents(ev);
      renderer.consume(ev.filter(e => e.type !== 'log'));
      renderer.draw(ts, speed > 0 ? dt * Math.min(speed, 2) : 0, { targeting: targeting >= 0 ? sim.hand[targeting] : null, hover });
      // tension musicale : intensité des combats récents
      battleAcc *= Math.pow(0.55, dt);
      tension += (Math.min(1, battleAcc / 40) - tension) * Math.min(1, dt * 1.5);
      Sound.setTension(tension);
      uiT -= dt;
      if (uiT <= 0) { uiT = 0.2; updateHud(); }
      if (targeting >= 0 && !sim.hand[targeting]) cancelTarget();
      if (over) { updateHud(); showEnd(); }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  readHash(); refreshMenu();
  // pour les tests
  window.__game = { get sim() { return sim; }, startGame, settings, setSpeed, renderer, Sound };
})();
