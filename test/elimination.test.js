'use strict';

const assert = require('node:assert');
const { test } = require('node:test');

const {
  startRound, drawFromStock, discardCard, nextDealer,
} = require('../src/turn');
const { resolveRound, layoffOrder } = require('../src/layoff');
const { beginLayoff } = require('../src/layoff-interactive');
const { createMatch, applyRound, activePlayers } = require('../src/match');

const c = (rank, suit, deckId = 0) => ({
  rank, suit, deckId, id: `${rank}-${suit}-${deckId}`,
});
const closingHand = () => [
  c(4, 'Copas'), c(5, 'Copas'), c(6, 'Copas'), c(7, 'Copas'),
  c(11, 'Oros'), c(11, 'Espadas'), c(11, 'Bastos'),
];
const junkHand = () => [
  c(2, 'Copas'), c(5, 'Espadas'), c(7, 'Bastos'),
  c(10, 'Oros'), c(12, 'Copas'), c(11, 'Bastos'), c(4, 'Espadas'),
];
const fixedRng = () => 0.5;
const activeOf = (match) =>
  match.players.map((p, i) => i).filter((i) => !match.players[i].out);

// ---------------------------------------------------------------- dealing

test('an eliminated player is dealt no cards in the next round', () => {
  const match = createMatch(['Ana', 'Beto', 'Cami']);
  match.players[1].total = 102;
  applyRound(match, { valid: true, chinchon: false, scores: [10, 0, 5] });
  assert.ok(match.players[1].out);

  const state = startRound(3, fixedRng, null, activeOf(match));
  assert.strictEqual(state.hands[1].length, 0, 'Beto sits out the deal');
  assert.strictEqual(state.hands[0].length, 7);
  assert.strictEqual(state.hands[2].length, 7);

  // Card conservation must still hold with one empty seat.
  const total = state.stock.length + state.discard.length + state.hands.flat().length;
  assert.strictEqual(total, 80, 'no cards are created or lost');
  assert.ok(!state.active.includes(1));
});

test('the deal and turn order skip eliminated seats', () => {
  const match = createMatch(['Ana', 'Beto', 'Cami']);
  match.players[1].total = 102;
  applyRound(match, { valid: true, chinchon: false, scores: [10, 0, 5] });

  // Dealer is Cami (seat 2); first to play should wrap to Ana (seat 0),
  // skipping the eliminated Beto (seat 1).
  const state = startRound(3, fixedRng, 2, activeOf(match));
  assert.strictEqual(state.turn, 0);
  assert.strictEqual(nextDealer(state), 0, 'dealer rotates Cami -> Ana, skipping Beto');
});

test('the turn advances past an eliminated seat', () => {
  const match = createMatch(['Ana', 'Beto', 'Cami', 'Dani']);
  match.players[1].total = 102;
  applyRound(match, { valid: true, chinchon: false, scores: [10, 0, 5, 5] });

  const state = startRound(4, fixedRng, 0, activeOf(match)); // turn -> seat 2
  assert.strictEqual(state.turn, 2);

  drawFromStock(state);
  discardCard(state, state.hands[state.turn][0]);
  assert.strictEqual(state.turn, 3, 'passed to Dani, not the eliminated Beto');
});

// ---------------------------------------------------------------- lay-off

test('lay-off skips and does not score eliminated players', () => {
  const hands = [closingHand(), [], junkHand()]; // seat 1 eliminated, empty hand
  const result = resolveRound(hands, 0, [0, 2]);

  assert.ok(result.valid);
  assert.strictEqual(result.scores[0], -10, 'closer scores normally');
  assert.strictEqual(result.scores[1], 0, 'eliminated seat scores nothing');
  assert.ok(result.scores[2] > 0, 'active opponent still pays deadwood');
  assert.deepStrictEqual(layoffOrder(3, 0, [0, 2]), [2]);
});

test('the interactive lay-off never asks an eliminated player to act', () => {
  const hands = [closingHand(), [], junkHand()];
  const state = beginLayoff(hands, 0, [0, 2]);
  // order = lay-off order (seat 2) followed by the closer (seat 0)
  assert.deepStrictEqual(state.order, [2, 0]);
});

// ---------------------------------------------------------------- match end

test('a match ends correctly once only one player remains', () => {
  const match = createMatch(['Ana', 'Beto', 'Cami']);
  match.players[2].total = 102; // Cami already out
  applyRound(match, { valid: true, chinchon: false, scores: [10, 0, 0] });
  assert.ok(match.players[2].out);

  match.players[1].total = 95; // Beto sits at 95
  applyRound(match, { valid: true, chinchon: false, scores: [0, 30, 0] }); // +30 -> 125, out
  assert.ok(match.players[1].out);
  assert.ok(match.gameOver);
  assert.strictEqual(match.winner, 0);
  assert.strictEqual(activePlayers(match).length, 1);
});
