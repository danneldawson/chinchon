'use strict';

// R43 (Dannel, Nov 3, 2026), refining R37: "it recognises 12-1-2 as a valid
// meld, it goes 11-12-1 and no further". A run may go on from 12 to 1, and the
// 1 then ends it. The engine used a fully circular rank order, so 12-1-2 and
// 12-1-2-3 were accepted as runs (by the close check, the lay-off and the bots).

const test = require('node:test');
const assert = require('node:assert');
const { isValidRun, isValidMeld, orderRun } = require('../src/melds');
const { canAttach } = require('../src/layoff');
const { canClose, allCloseSplits } = require('../src/scoring');
const { chooseDraw } = require('../src/bot');

const c = (rank, suit, deckId = 0) => ({ rank, suit, deckId, id: `${rank}-${suit}-${deckId}` });
const run = (ranks, suit = 'Copas') => ranks.map((r) => c(r, suit));
const WILD = () => c(1, 'Oros');

test('R43: 11-12-1 and 10-11-12-1 are runs', () => {
  assert.ok(isValidRun(run([11, 12, 1])));
  assert.ok(isValidRun(run([10, 11, 12, 1])));
  assert.ok(isValidRun(run([1, 12, 11, 10], 'Bastos')), 'order in hand does not matter');
});

test('R43: 12-1-2 and 12-1-2-3 are not runs (nothing goes on past the 1)', () => {
  assert.ok(!isValidRun(run([12, 1, 2])));
  assert.ok(!isValidMeld(run([12, 1, 2])));
  assert.ok(!isValidRun(run([12, 1, 2, 3])));
  assert.ok(!isValidRun(run([11, 12, 1, 2])));
});

test('R43: low runs from the 1 are untouched (1-2-3)', () => {
  assert.ok(isValidRun(run([1, 2, 3])));
});

test('R43: a wild next to 12-1 plays as the 11, never as the 2', () => {
  const meld = [c(12, 'Espadas'), c(1, 'Espadas'), WILD()];
  assert.ok(isValidRun(meld));
  assert.deepStrictEqual(orderRun(meld).map((x) => x.id), ['1-Oros-0', '12-Espadas-0', '1-Espadas-0']);
  assert.ok(!isValidRun([c(1, 'Espadas'), c(2, 'Espadas'), WILD(), c(12, 'Espadas')]), 'wild cannot carry 12 into 1-2');
});

test('R43: lay-off onto a run that ends 12-1 stops at the 1', () => {
  assert.ok(canAttach(run([10, 11, 12]), c(1, 'Copas')));
  assert.ok(!canAttach(run([11, 12, 1]), c(2, 'Copas')), 'no 2 after the 1');
  assert.ok(canAttach(run([11, 12, 1]), c(10, 'Copas')), 'the low end can still grow');
  assert.ok(!canAttach(run([1, 2, 3]), c(12, 'Copas')), 'no 12 in front of 1-2-3');
});

test('R43: a hand that needs 12-1-2 cannot close on it', () => {
  // 12-1-2 de Copas + 5-5-5-5: only "closes" if 12-1-2 were a run.
  const hand = [...run([12, 1, 2]), c(5, 'Oros'), c(5, 'Espadas'), c(5, 'Bastos'), c(5, 'Copas')];
  assert.strictEqual(canClose(hand).ok, false);
  assert.strictEqual(allCloseSplits(hand).length, 0);
});

test('R43: the bot no longer treats a 2 as building toward a 12', () => {
  const hand = [c(12, 'Copas'), c(4, 'Bastos'), c(7, 'Espadas'), c(3, 'Oros'), c(10, 'Bastos'), c(6, 'Espadas'), c(11, 'Oros')];
  const state = { hands: [hand], turn: 0, discard: [c(2, 'Copas')] };
  assert.strictEqual(chooseDraw(state, 'aggressive'), 'stock');
  state.discard = [c(1, 'Copas')]; // the 1 does sit next to the 12
  assert.strictEqual(chooseDraw(state, 'aggressive'), 'discard');
});
