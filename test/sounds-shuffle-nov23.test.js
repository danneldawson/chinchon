'use strict';

// Card sounds and the between-round shuffle (Nov 23, 2026, Dannel): one
// distinct sound per action, each fired once per watched-turn step, for your
// own moves and everyone else's; a shuffle on every new deal, never on a
// fresh tab or reconnect. Sounds are synthesised (no audio files).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../public/sound');
const { pushStep, recordDiscard, stepsFor } = require('../src/steps');

const PUB = path.join(__dirname, '..', 'public');
const APP = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const card = (id) => ({ id, suit: 'Copas', rank: 4, deckId: 0 });

test('each action maps to its own sound; the three pick-up/drop sounds differ', () => {
  assert.strictEqual(S.soundForStep({ type: 'draw', from: 'stock' }), 'swish');
  assert.strictEqual(S.soundForStep({ type: 'draw', from: 'discard' }), 'flick');
  assert.strictEqual(S.soundForStep({ type: 'discard' }), 'land');
  assert.strictEqual(S.soundForStep({ type: 'lay' }), 'meld');
  assert.strictEqual(S.soundForStep({ type: 'attach' }), 'tap');
  assert.strictEqual(S.soundForStep({ type: 'close' }), 'spread');
  for (const quiet of ['ready', 'pass', 'falseClose', 'nope']) assert.strictEqual(S.soundForStep({ type: quiet }), null);
  assert.strictEqual(S.soundForStep(null), null);
  const three = new Set(['swish', 'flick', 'land']);
  assert.strictEqual(three.size, 3);
  for (const n of ['swish', 'flick', 'land', 'meld', 'tap', 'spread', 'shuffle']) assert.ok(S.NAMES.includes(n), n);
});

test('a real step log sounds exactly once per action, a hidden stock draw included', () => {
  const room = { players: [{}, {}], steps: [] };
  pushStep(room, { type: 'draw', seat: 1, from: 'stock', card: card('a') });
  recordDiscard(room, 1, card('b'), { closed: true, check: { melds: [[card('c'), card('d'), card('e')]] } });
  pushStep(room, { type: 'lay', seat: 0, cards: [card('f'), card('g'), card('h')] });
  pushStep(room, { type: 'attach', seat: 0, card: card('i'), meldIndex: 0 });
  pushStep(room, { type: 'ready', seat: 0, nextSeat: null });
  const seen = stepsFor(room, 0, 0); // seat 0 watches seat 1: the stock card is hidden
  assert.strictEqual(seen.steps[0].card, null);
  const sounds = seen.steps.map(S.soundForStep).filter(Boolean);
  assert.deepStrictEqual(sounds, ['swish', 'land', 'spread', 'meld', 'tap']);
  // Caught up (a re-render or the next poll): nothing new to sound.
  assert.deepStrictEqual(stepsFor(room, room.stepSeq, 0).steps, []);
  // A fresh tab / reconnect snaps: no replayed burst of old sounds.
  const fresh = stepsFor(room, undefined, 0);
  assert.strictEqual(fresh.snap, true);
  assert.deepStrictEqual(fresh.steps, []);
});

test('shuffle plays on a new deal only, never on a first view or a refresh', () => {
  const v = (o) => ({ started: true, code: 'LUNA', phase: 'draw', roundEnd: false, gameOver: false, ...o });
  assert.strictEqual(S.shouldShuffle(v({ phase: 'roundEnd', roundEnd: true }), v({})), true, 'next round dealt');
  assert.strictEqual(S.shouldShuffle(v({ phase: 'roundEnd', roundEnd: true }), v({ phase: 'discard' })), true, 'a bot already drew');
  assert.strictEqual(S.shouldShuffle(v({ gameOver: true }), v({})), true, 'rematch deal');
  assert.strictEqual(S.shouldShuffle(null, v({})), false, 'fresh tab / reconnect');
  assert.strictEqual(S.shouldShuffle(v({}), v({})), false, 'same round re-poll');
  assert.strictEqual(S.shouldShuffle(v({ phase: 'discard' }), v({})), false, 'ordinary turn change');
  assert.strictEqual(S.shouldShuffle(v({ phase: 'layoff' }), v({ phase: 'roundEnd', roundEnd: true })), false, 'lay-off ends: pause, no deal yet');
  assert.strictEqual(S.shouldShuffle(v({ roundEnd: true }), v({ roundEnd: true })), false, 'still paused');
  assert.strictEqual(S.shouldShuffle(v({ started: false }), v({})), false, 'match start (the deal-in covers it)');
  assert.strictEqual(S.shouldShuffle(v({ code: 'SOL', roundEnd: true }), v({})), false, 'a different room');
  assert.strictEqual(S.shouldShuffle(v({ roundEnd: true }), v({ gameOver: true })), false, 'game over');
});

test('every recipe renders into a Web Audio graph (fake context) with a sane length', () => {
  const node = () => ({ connect() {}, start() {}, stop() {}, Q: { value: 0 }, gain: param(), frequency: param(), type: '' });
  function param() { return { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }; }
  const ctx = {
    sampleRate: 8000, currentTime: 0,
    createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }),
    createBufferSource: node, createBiquadFilter: node, createGain: node, createOscillator: node,
  };
  for (const n of S.NAMES) {
    const len = S.schedule(ctx, node(), n, 0);
    assert.ok(len > 0 && len <= 1.6, `${n}: ${len}s`);
  }
  assert.strictEqual(S.schedule(ctx, node(), 'nope', 0), 0);
  assert.ok(S.schedule(ctx, node(), 'shuffle', 0) >= 1.2, 'shuffle spans the 1.5 s animation');
});

test('mute is remembered, and play stays silent without a gesture-created context', () => {
  assert.strictEqual(S.play('swish'), false, 'no AudioContext before the first tap');
  const store = {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
  try {
    S.setMuted(true);
    assert.strictEqual(store[S.MUTE_KEY], '1');
    assert.strictEqual(S.isMuted(), true);
    S.setMuted(false);
    assert.strictEqual(store[S.MUTE_KEY], '0');
  } finally { delete globalThis.localStorage; }
});

test('client wiring: steps sound once in playWatch, shuffle is gated, non-interactive, and reduced-motion aware', () => {
  assert.ok(HTML.includes('id="btn-sound"'), 'mute toggle in the header');
  assert.ok(HTML.indexOf('/sound.js') < HTML.indexOf('/app.js'), 'sound.js loads before app.js');
  const pw = APP.slice(APP.indexOf('async function playWatch'), APP.indexOf('function ingestSteps'));
  assert.ok(/soundForStep\(step\)/.test(pw), 'sound picked per dequeued step');
  assert.ok(/await state\.shuffleGate/.test(pw), 'replay waits for the shuffle');
  assert.ok(/shouldShuffle\(prevView, res\)/.test(APP), 'shuffle edge-triggered from the previous view');
  const ps = APP.slice(APP.indexOf('function playShuffle'), APP.indexOf('function renderSoundToggle'));
  assert.ok(/reducedMotion\(\)/.test(ps), 'reduced motion skips the animation');
  assert.ok(/SHUFFLE_MS/.test(ps) && /\.animate\(/.test(ps), 'Web Animations, fixed length');
  const css = fs.readFileSync(path.join(PUB, 'style.css'), 'utf8');
  assert.match(css, /\.shuffle-fx \{[^}]*pointer-events: none/);
  // No audio files shipped.
  const audio = fs.readdirSync(PUB, { recursive: true }).filter((f) => /\.(mp3|wav|ogg|m4a|aac)$/i.test(f));
  assert.deepStrictEqual(audio, []);
});
