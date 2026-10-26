'use strict';
// ---------------------------------------------------------------
// Sons et musique synthétisés (WebAudio) : aucun fichier audio à charger.
// ---------------------------------------------------------------
const Sound = (() => {
  let ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
  let muted = false, musicOn = false, timer = null, nextT = 0, beat = 0, tension = 0, note = 4;
  const last = {};
  try { muted = localStorage.getItem('rp_muted') === '1'; } catch (e) { /* stockage indisponible */ }

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.6; sfxBus.connect(master);
      musicBus = ctx.createGain(); musicBus.gain.value = 0.32; musicBus.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; }
  }

  function tone(o) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.delay || 0), dur = o.dur || 0.15, vol = o.vol == null ? 0.2 : o.vol;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + (o.attack || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = osc;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); node = f; }
    node.connect(g); g.connect(o.bus || sfxBus);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }
  function noise(o) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.delay || 0), dur = o.dur || 0.2, vol = o.vol == null ? 0.2 : o.vol;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = o.kind || 'lowpass'; f.frequency.setValueAtTime(o.f || 800, t0);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t0 + dur);
    f.Q.value = o.q || 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.05);
  }

  const SFX = {
    chime() { tone({ f: 988, dur: 0.35, vol: 0.14, type: 'triangle' }); tone({ f: 1318, dur: 0.45, vol: 0.12, type: 'triangle', delay: 0.09 }); tone({ f: 1760, dur: 0.5, vol: 0.08, type: 'sine', delay: 0.18 }); },
    select() { tone({ f: 520, f2: 780, dur: 0.1, vol: 0.12, type: 'triangle' }); },
    play() { noise({ dur: 0.25, vol: 0.14, f: 500, f2: 4000, kind: 'bandpass', q: 1.2 }); tone({ f: 440, f2: 880, dur: 0.25, vol: 0.12, type: 'triangle' }); tone({ f: 1175, dur: 0.4, vol: 0.09, delay: 0.12 }); },
    combo() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ f, dur: 0.35, vol: 0.12, type: 'triangle', delay: i * 0.07 })); },
    build() { noise({ dur: 0.1, vol: 0.18, f: 700, q: 0.8 }); tone({ f: 160, f2: 90, dur: 0.12, vol: 0.18 }); tone({ f: 1400, dur: 0.05, vol: 0.05, delay: 0.1, type: 'square' }); },
    hit() { tone({ f: 420, f2: 170, dur: 0.07, vol: 0.07, type: 'square', lp: 2600 }); noise({ dur: 0.05, vol: 0.06, f: 3000, kind: 'highpass' }); },
    arrow() { tone({ f: 1100, f2: 320, dur: 0.1, vol: 0.05, type: 'sawtooth', lp: 3000 }); },
    rock() { tone({ f: 260, f2: 70, dur: 0.28, vol: 0.12, type: 'triangle' }); noise({ dur: 0.18, vol: 0.06, f: 500 }); },
    destroy() { noise({ dur: 0.55, vol: 0.32, f: 1200, f2: 120, q: 0.6 }); tone({ f: 110, f2: 38, dur: 0.55, vol: 0.28 }); },
    death() { tone({ f: 380, f2: 110, dur: 0.18, vol: 0.08, type: 'triangle' }); },
    explosion() { noise({ dur: 0.75, vol: 0.4, f: 1800, f2: 90, q: 0.5 }); tone({ f: 80, f2: 30, dur: 0.7, vol: 0.32 }); },
    quake() { noise({ dur: 1.2, vol: 0.5, f: 220, f2: 60, q: 0.4 }); tone({ f: 48, f2: 28, dur: 1.2, vol: 0.34 }); },
    horn() { tone({ f: 196, dur: 0.45, vol: 0.12, type: 'sawtooth', lp: 900, attack: 0.05 }); tone({ f: 262, dur: 0.6, vol: 0.12, type: 'sawtooth', lp: 900, delay: 0.3, attack: 0.05 }); },
    dragon() { tone({ f: 170, f2: 60, dur: 1.0, vol: 0.24, type: 'sawtooth', lp: 700, attack: 0.08 }); noise({ dur: 0.9, vol: 0.2, f: 900, f2: 200, kind: 'bandpass', q: 0.8 }); },
    news() { tone({ f: 220, dur: 1.3, vol: 0.14, type: 'sine', attack: 0.01 }); tone({ f: 330, dur: 1.0, vol: 0.08, delay: 0.02 }); tone({ f: 441, dur: 0.8, vol: 0.05, delay: 0.02 }); },
    upgrade() { tone({ f: 660, dur: 0.2, vol: 0.11, type: 'triangle' }); tone({ f: 990, dur: 0.3, vol: 0.1, type: 'triangle', delay: 0.1 }); },
    claim() { tone({ f: 120, f2: 70, dur: 0.14, vol: 0.1 }); },
    eliminated() { [392, 330, 262, 196].forEach((f, i) => tone({ f, dur: 0.4, vol: 0.14, type: 'triangle', delay: i * 0.22 })); },
    win() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone({ f, dur: 0.45, vol: 0.14, type: 'triangle', delay: i * 0.14 })); },
    lose() { [330, 311, 294, 262].forEach((f, i) => tone({ f, dur: 0.6, vol: 0.14, type: 'triangle', delay: i * 0.3 })); },
  };
  const MIN_GAP = { hit: 0.09, arrow: 0.07, death: 0.08, rock: 0.1, claim: 0.5, build: 0.1, destroy: 0.12, explosion: 0.15 };

  function play(name, vol) {
    if (!ctx || muted || !SFX[name]) return;
    const now = ctx.currentTime;
    if (last[name] && now - last[name] < (MIN_GAP[name] || 0.03)) return;
    last[name] = now;
    SFX[name](vol);
  }

  // ---- musique : une petite mélodie pincée, lente, en ré dorien
  const SCALE = [0, 2, 3, 5, 7, 9, 10, 12, 14];
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  function pluck(m, t, dur, vol, type) {
    const osc = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    osc.type = type || 'triangle'; osc.frequency.value = mtof(m);
    f.type = 'lowpass'; f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(500, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(f); f.connect(g); g.connect(musicBus);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  function drum(t, vol) {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.frequency.setValueAtTime(110, t); osc.frequency.exponentialRampToValueAtTime(42, t + 0.16);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(g); g.connect(musicBus); osc.start(t); osc.stop(t + 0.25);
  }
  function schedule() {
    if (!ctx || !musicOn) return;
    const spb = 0.7 - 0.12 * tension;
    while (nextT < ctx.currentTime + 0.5) {
      const b = beat % 8, root = 50;
      if (b === 0 || b === 4) pluck(root - 12, nextT, 1.6, 0.34, 'sine');
      if (b === 2 || b === 6) pluck(root - 5, nextT, 1.2, 0.22, 'sine');
      if (Math.random() < 0.5 || b % 4 === 0) {
        note = Math.max(0, Math.min(SCALE.length - 1, note + [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)]));
        pluck(root + 12 + SCALE[note], nextT, 0.9, 0.2);
        if (Math.random() < 0.18) pluck(root + 12 + SCALE[Math.max(0, note - 2)], nextT + spb / 2, 0.7, 0.13);
      }
      if (tension > 0.45 && b % 2 === 0) drum(nextT, 0.28 * tension);
      if (tension > 0.7 && b % 2 === 1) drum(nextT, 0.14);
      nextT += spb; beat++;
    }
  }
  function startMusic() {
    if (!ctx || musicOn) return;
    musicOn = true; nextT = ctx.currentTime + 0.2; beat = 0;
    timer = setInterval(schedule, 120);
  }
  function stopMusic() { musicOn = false; clearInterval(timer); timer = null; }

  return {
    init, play, startMusic, stopMusic,
    isMuted: () => muted,
    setMuted(m) { muted = !!m; try { localStorage.setItem('rp_muted', muted ? '1' : '0'); } catch (e) { /* ignoré */ } if (master) master.gain.value = muted ? 0 : 0.8; },
    setTension(t) { tension = Math.max(0, Math.min(1, t)); },
    pause(on) { if (!ctx) return; if (on) ctx.suspend(); else ctx.resume(); },
  };
})();
