'use strict';

// R42 (Dannel, Nov 3, 2026): "when you close for the -10 play, those two melds
// when layed on the table no one should be able to lay cards on those". After a
// clean close (all 7 cards in melds, nothing left over) the closer's melds are
// locked for the whole lay-off. Before, anyone could attach to them.

const test = require('node:test');
const assert = require('node:assert');
const lo = require('../src/layoff-interactive');
const { resolveRound } = require('../src/layoff');
const { findAttach } = require('../src/bot');

const c = (rank, suit, deckId = 0) => ({ rank, suit, deckId, id: `${rank}-${suit}-${deckId}` });

// Closer: 2-3-4-5 de Copas + 7-7-7 (clean, -10).
const cleanCloser = [c(2, 'Copas'), c(3, 'Copas'), c(4, 'Copas'), c(5, 'Copas'), c(7, 'Oros'), c(7, 'Espadas'), c(7, 'Bastos')];
// Player 1 holds a 6 de Copas and a 7 de Copas that would extend the closer's melds,
// plus their own 10-10-10 set.
const p1 = [c(6, 'Copas'), c(7, 'Copas'), c(10, 'Oros'), c(10, 'Espadas'), c(10, 'Bastos'), c(2, 'Bastos'), c(3, 'Oros')];

test('R42: after a -10 close nobody may attach to the closer\'s melds', () => {
  const st = lo.beginLayoff([cleanCloser, p1], 0, [0, 1], [cleanCloser.slice(0, 4), cleanCloser.slice(4)]);
  assert.ok(st.valid);
  assert.deepStrictEqual(st.locked, [true, true]);
  assert.ok(lo.declareReady(st).ok); // closer has nothing left: -10
  assert.strictEqual(st.scores[0], -10);
  const runAttach = lo.attachCard(st, c(6, 'Copas'), 0);
  assert.strictEqual(runAttach.ok, false);
  assert.match(runAttach.reason, /-10/);
  assert.strictEqual(lo.attachCard(st, c(7, 'Copas'), 1).ok, false);
  // Their own meld goes down, and stays open to attach to.
  assert.ok(lo.layMeld(st, [c(10, 'Oros'), c(10, 'Espadas'), c(10, 'Bastos')]).ok);
  assert.deepStrictEqual(st.locked, [true, true, false]);
  assert.strictEqual(st.table[0].length, 4);
  assert.strictEqual(st.table[1].length, 3);
});

test('R42: a close with a leftover keeps the closer\'s melds open (unchanged)', () => {
  const closer = [c(2, 'Copas'), c(3, 'Copas'), c(4, 'Copas'), c(7, 'Oros'), c(7, 'Espadas'), c(7, 'Bastos'), c(1, 'Bastos')];
  const st = lo.beginLayoff([closer, p1], 0, [0, 1], [closer.slice(0, 3), closer.slice(3, 6)]);
  assert.deepStrictEqual(st.locked, [false, false]);
  lo.passTurn(st);
  assert.ok(lo.attachCard(st, c(7, 'Copas'), 1).ok);
});

test('R42: bots and the automatic resolver skip locked melds', () => {
  assert.strictEqual(findAttach([cleanCloser.slice(0, 4)], c(6, 'Copas'), [true]), -1);
  assert.strictEqual(findAttach([cleanCloser.slice(0, 4)], c(6, 'Copas'), [false]), 0);
  const r = resolveRound([cleanCloser, p1], 0, [0, 1]);
  assert.ok(r.valid);
  assert.strictEqual(r.scores[0], -10);
  // 6 and 7 de Copas could only go on the closer's locked melds: they stay in hand.
  assert.ok(r.laidOff[1].stuck.some((x) => x.id === '6-Copas-0'));
  assert.ok(r.laidOff[1].stuck.some((x) => x.id === '7-Copas-0'));
});
