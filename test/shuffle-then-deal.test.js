'use strict';
// Dannel, Nov 27: the new hand showed first and the shuffle played over it,
// so it looked like dealing then shuffling. Hands now stay hidden while the
// deck is shuffled and are dealt in once it ends.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');

test('the shuffle hides the hands, then deals them in when it ends', () => {
  const fn = app.slice(app.indexOf('function playShuffle() {'));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  const add = body.indexOf("table.classList.add('dealing')");
  const gate = body.indexOf('state.shuffleGate.then(');
  assert.ok(add > 0 && gate > add, 'hides hands, then waits for the shuffle');
  const after = body.slice(gate);
  assert.ok(after.indexOf("classList.remove('dealing')") < after.indexOf("onceAnimate($('hand'), 'deal-anim')"));
});

test('the CSS hides cards while dealing and the deal-in targets the real hand', () => {
  assert.match(css, /#table\.dealing #hand \.card, #table\.dealing \.seat-fan \{ visibility: hidden; \}/);
  assert.match(css, /#hand\.deal-anim \.card \{ animation: dealIn/);
});

test('after the lay-off, a seat counts the cards it was left with, not the pre-close 7', () => {
  const { _internals: { seatHandCount } } = require('../server');
  const seven = Array.from({ length: 7 }, (_, k) => ({ id: 'c' + k }));
  const room = {
    layoff: null,
    state: { phase: 'roundEnd', hands: [seven, seven] },
    lastRound: [
      { seat: 0, playing: true, cards: [{ id: 'a' }] },
      { seat: 1, playing: true, cards: [{ id: 'b' }, { id: 'c' }, { id: 'd' }] },
    ],
  };
  assert.strictEqual(seatHandCount(room, 0), 1);
  assert.strictEqual(seatHandCount(room, 1), 3);
  room.state.phase = 'draw'; // the next round is dealt: back to the real hand
  assert.strictEqual(seatHandCount(room, 1), 7);
});
