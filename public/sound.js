'use strict';
// Card sounds and the between-round shuffle (Nov 23, 2026, Dannel).
// Every sound is synthesised with the Web Audio API from one shared noise
// buffer: filtered noise bursts with short envelopes, plus a soft sine thump
// for the heavier ones. No audio files. The AudioContext is created on the
// first tap (iOS Safari needs a gesture) and suspended when idle (battery).
// Pure helpers (soundForStep, shouldShuffle) are exported for the tests.
(function (root) {
  // ---- which sound for which watched-turn step (src/steps.js) ----
  // One step is one action, and the client dequeues each step once, so one
  // step can never sound twice (re-render, poll, reconnect snap: none replay).
  function soundForStep(step) {
    if (!step || typeof step !== 'object') return null;
    switch (step.type) {
      case 'draw': return step.from === 'discard' ? 'flick' : 'swish';
      case 'discard': return 'land';
      case 'close': return 'spread';
      case 'lay': return 'meld';
      case 'attach': return 'tap';
      default: return null; // ready, pass, falseClose: no card hits the felt
    }
  }

  // A new deal in the same room: the round-over pause (roundEnd) gave way to
  // a live round, or a rematch dealt after a game over. Never on the first
  // view (a fresh tab or a reconnect), so joining late or refreshing does not
  // replay a shuffle; never on an ordinary poll of the same round.
  function shouldShuffle(prev, next) {
    if (!prev || !next || !prev.started || !next.started) return false;
    if (prev.code !== next.code || next.gameOver || next.roundEnd) return false;
    if (next.phase !== 'draw' && next.phase !== 'discard') return false;
    return !!prev.roundEnd || !!prev.gameOver;
  }

  // ---- synthesis (works on any BaseAudioContext, offline included) ----
  const noiseCache = new WeakMap();
  function noise(ctx) {
    let buf = noiseCache.get(ctx);
    if (!buf) {
      const n = Math.floor(ctx.sampleRate * 1);
      buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let seed = 0x2545f491;
      for (let i = 0; i < n; i++) { // xorshift: same buffer every time
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        d[i] = ((seed >>> 0) / 4294967296) * 2 - 1;
      }
      noiseCache.set(ctx, buf);
    }
    return buf;
  }
  // A burst of filtered noise. f1 sweeps the filter (a swish), attack/dur
  // shape the envelope. All times in seconds.
  function burst(ctx, out, t, o) {
    const src = ctx.createBufferSource();
    src.buffer = noise(ctx);
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.Q.value = o.q == null ? 1 : o.q;
    f.frequency.setValueAtTime(o.f0, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
    const g = ctx.createGain();
    const a = o.attack || 0.002;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t, (o.offset || 0) % 0.9, o.dur + 0.02);
  }
  // A soft low knock: the card's weight on the felt.
  function thump(ctx, out, t, o) {
    const s = ctx.createOscillator();
    s.type = 'sine';
    s.frequency.setValueAtTime(o.f0, t);
    s.frequency.exponentialRampToValueAtTime(o.f1 || o.f0 * 0.6, t + o.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    s.connect(g); g.connect(out);
    s.start(t); s.stop(t + o.dur + 0.02);
  }
  // Small seeded jitter so repeated sounds are not machine-identical.
  function jitter(seed) {
    let x = seed >>> 0 || 1;
    return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
  }

  // Each recipe schedules its sound at time t and returns its length (s).
  const RECIPES = {
    // Drawing from the face-down stock: a soft, airy "shh" as the card slides off.
    swish(ctx, out, t) {
      burst(ctx, out, t, { f0: 700, f1: 2600, q: 0.7, dur: 0.22, attack: 0.07, gain: 0.95 });
      return 0.24;
    },
    // Taking the face-up discard: a sharp, bright flick (snap + short whip).
    flick(ctx, out, t) {
      burst(ctx, out, t, { type: 'highpass', f0: 3200, q: 0.7, dur: 0.03, gain: 0.55 });
      burst(ctx, out, t + 0.012, { f0: 5200, f1: 2400, q: 1.6, dur: 0.09, attack: 0.004, gain: 0.3, offset: 0.3 });
      return 0.11;
    },
    // Throwing a card on the table: a short papery slap with a little weight.
    land(ctx, out, t) {
      burst(ctx, out, t, { type: 'lowpass', f0: 2400, q: 0.5, dur: 0.08, attack: 0.002, gain: 0.6, offset: 0.5 });
      thump(ctx, out, t, { f0: 150, f1: 80, dur: 0.07, gain: 0.35 });
      return 0.1;
    },
    // Laying a meld down: three cards slapped down together, firmer than a discard.
    meld(ctx, out, t) {
      [0, 0.055, 0.1].forEach((d, i) => {
        burst(ctx, out, t + d, { type: 'lowpass', f0: 2000 + i * 300, q: 0.6, dur: 0.075, gain: 0.55 + i * 0.1, offset: 0.1 + i * 0.2 });
        thump(ctx, out, t + d, { f0: 120 - i * 8, f1: 70, dur: 0.08, gain: 0.25 + i * 0.12 });
      });
      return 0.2;
    },
    // Adding a card to a meld on the table: a light, short tap.
    tap(ctx, out, t) {
      burst(ctx, out, t, { f0: 2600, q: 2.2, dur: 0.035, gain: 1.1, offset: 0.7 });
      thump(ctx, out, t, { f0: 420, f1: 300, dur: 0.03, gain: 0.15 });
      return 0.05;
    },
    // A close: the hand fanned out across the felt, a quick cascade of
    // card ticks sliding down in pitch, finished by a soft landing.
    spread(ctx, out, t) {
      const r = jitter(7);
      let d = 0;
      for (let i = 0; i < 7; i++) {
        burst(ctx, out, t + d, { f0: 4200 - i * 330, q: 1.4, dur: 0.05, gain: 0.7 + r() * 0.2, offset: r() * 0.8 });
        d += 0.045 + i * 0.004;
      }
      burst(ctx, out, t, { f0: 1800, f1: 900, q: 0.6, dur: d + 0.05, attack: 0.03, gain: 0.18, offset: 0.2 });
      thump(ctx, out, t + d, { f0: 130, f1: 75, dur: 0.08, gain: 0.3 });
      return d + 0.12;
    },
    // Between rounds, timed to the 1.5 s animation: gather, a cut (tap),
    // the riffle (a fast run of card flaps over a soft bed), the bridge
    // (a falling cascade as the cards spring together), then the deal.
    shuffle(ctx, out, t) {
      const r = jitter(11);
      burst(ctx, out, t + 0.02, { f0: 600, f1: 1800, q: 0.7, dur: 0.24, attack: 0.08, gain: 0.432 });
      burst(ctx, out, t + 0.33, { type: 'lowpass', f0: 2200, q: 0.5, dur: 0.05, gain: 0.96, offset: 0.4 });
      // Riffle: ~38 flaps, 0.45 → 0.93 s, quick at first then easing out.
      const rs = t + 0.45; const rl = 0.48; const n = 38;
      burst(ctx, out, rs, { f0: 3000, f1: 2200, q: 0.6, dur: rl, attack: 0.04, gain: 0.24, offset: 0.1 });
      for (let i = 0; i < n; i++) {
        const p = i / n;
        const at = rs + rl * (p + 0.25 * p * p) / 1.25;
        burst(ctx, out, at, { f0: 2800 + r() * 2600, q: 1.2 + r(), dur: 0.007 + r() * 0.006, gain: (0.48 + r() * 0.53) * (1 - 0.35 * p), offset: r() * 0.85 });
      }
      // Bridge: the cards spring together, a dense falling "frrrp".
      const bs = t + 0.97;
      for (let i = 0; i < 22; i++) {
        burst(ctx, out, bs + i * 0.0075, { f0: 4600 - i * 120, q: 1.4, dur: 0.008, gain: 0.43 + r() * 0.29, offset: r() * 0.85 });
      }
      burst(ctx, out, bs, { f0: 3600, f1: 1400, q: 0.8, dur: 0.18, attack: 0.01, gain: 0.288, offset: 0.6 });
      burst(ctx, out, bs + 0.17, { type: 'lowpass', f0: 1800, q: 0.5, dur: 0.06, gain: 0.84, offset: 0.33 });
      // Deal: four quick soft flicks.
      [1.2, 1.27, 1.34, 1.41].forEach((d, i) => {
        burst(ctx, out, t + d, { f0: 1800 + i * 200, f1: 3400, q: 0.9, dur: 0.06, attack: 0.012, gain: 0.384, offset: 0.2 * i });
      });
      return 1.5;
    },
  };
  const NAMES = Object.keys(RECIPES);

  // Schedule one sound on any context; returns its length in seconds.
  function schedule(ctx, out, name, t) {
    const fn = RECIPES[name];
    if (!fn) return 0;
    return fn(ctx, out, t == null ? ctx.currentTime : t);
  }

  // ---- runtime: one lazy context, a master gain, mute, idle suspend ----
  const MUTE_KEY = 'chinchon-sound-muted';
  let ctx = null;
  let master = null;
  let idleTimer = null;
  let muted = false;
  try { muted = root.localStorage && root.localStorage.getItem(MUTE_KEY) === '1'; } catch (_) { /* private mode */ }

  function unlock() {
    if (ctx || muted) { if (ctx && ctx.state === 'suspended' && !muted) ctx.resume().catch(() => {}); return; }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(ctx.destination);
      // A silent blip inside the gesture fully unlocks iOS Safari.
      const b = ctx.createBufferSource();
      b.buffer = ctx.createBuffer(1, 1, 22050);
      b.connect(master); b.start(0);
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      armIdle(1);
    } catch (_) { ctx = null; }
  }
  function armIdle(len) {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); }, 4000 + len * 1000);
  }
  function play(name) {
    if (muted || !ctx || !RECIPES[name]) return false;
    if (root.document && root.document.hidden) return false;
    try {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const len = schedule(ctx, master, name, ctx.currentTime + 0.01);
      armIdle(len);
      return true;
    } catch (_) { return false; }
  }
  function isMuted() { return muted; }
  function setMuted(m) {
    muted = !!m;
    try { root.localStorage && root.localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (_) { /* private mode */ }
    if (muted && ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
    if (!muted) unlock();
    return muted;
  }
  if (root.addEventListener) {
    for (const ev of ['pointerdown', 'touchend', 'keydown']) {
      root.addEventListener(ev, unlock, { passive: true, capture: true });
    }
  }

  const api = { soundForStep, shouldShuffle, schedule, play, isMuted, setMuted, unlock, NAMES, MUTE_KEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ChinchonSound = api;
})(typeof window !== 'undefined' ? window : globalThis);
