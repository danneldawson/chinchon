'use strict';

const assert = require('node:assert');
const { test } = require('node:test');

const {
  beginLayoff, currentPlayer, layMeld, attachCard, declareReady, suggest,
} = require('../src/layoff-interactive');

const c = (rank, suit, deckId = 0) => ({
  rank, suit, deckId, id: `${rank}-${suit}-${deckId}`,
});
const WILD = (deckId = 0) => c(1, 'Oros', deckId);

const closingHand = () => [
  c(4, 'Copas'), c(5, 'Copas'), c(6, 'Copas'), c(7, 'Copas'),
  c(11, 'Oros'), c(11, 'Espadas'), c(11, 'Bastos'),
];

// Find the table index of the meld containing a given rank+suit.
const findMeld = (state, rank, suit) =>
  state.table.findIndex((m) => m.some((x) => x.rank === rank && x.suit === suit));

// ------------------------------------------------- closer goes FIRST

test('the closer acts first in the lay-off', () => {
  const state = beginLayoff([closingHand(), closingHand()], 0);
  assert.strictEqual(currentPlayer(state), 0, 'closer is the current player');
});

// Helper: advance past the closer so the next player can act.
function skipCloser(state) {
  assert.strictEqual(currentPlayer(state), state.closerIndex, 'closer is current');
  declareReady(state);
}

// ------------------------------------------------- validation of OTHER players

test('another player CANNOT lay down an invalid combination', () => {
  const cheater = [
    c(2, 'Copas'), c(7, 'Espadas'), c(12, 'Bastos'),
    c(10, 'Oros'), c(4, 'Copas'), c(11, 'Bastos'), c(3, 'Espadas'),
  ];
  const state = beginLayoff([closingHand(), cheater], 0);
  skipCloser(state);
  assert.strictEqual(currentPlayer(state), 1, 'opponent is next after closer');

  // Three random cards are not a game.
  const res = layMeld(state, [c(2, 'Copas'), c(7, 'Espadas'), c(12, 'Bastos')]);
  assert.strictEqual(res.ok, false);
  assert.match(res.reason, /not a valid combination/);
});

test('a player cannot lay cards they do not hold', () => {
  const opponent = [
    c(2, 'Copas'), c(7, 'Espadas'), c(12, 'Bastos'),
    c(10, 'Oros'), c(4, 'Copas'), c(11, 'Bastos'), c(3, 'Espadas'),
  ];
  const state = beginLayoff([closingHand(), opponent], 0);
  skipCloser(state);
  const res = layMeld(state, [c(9, 'Copas'), c(10, 'Copas'), c(11, 'Copas')]);
  assert.strictEqual(res.ok, false);
  assert.match(res.reason, /do not hold/);
});

test('a valid combination from another player IS accepted', () => {
  const opponent = [
    c(2, 'Bastos'), c(3, 'Bastos'), c(4, 'Bastos'),
    c(10, 'Oros'), c(12, 'Copas'), c(11, 'Copas'), c(7, 'Espadas'),
  ];
  const state = beginLayoff([closingHand(), opponent], 0);
  skipCloser(state);
  const res = layMeld(state, [c(2, 'Bastos'), c(3, 'Bastos'), c(4, 'Bastos')]);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(state.table.length, 3); // 2 from closer + 1 new
});

test('an attach that does not fit is rejected', () => {
  const opponent = [
    c(12, 'Bastos'), c(2, 'Espadas'), c(10, 'Oros'),
    c(11, 'Copas'), c(7, 'Espadas'), c(2, 'Bastos'), c(10, 'Copas'),
  ];
  const state = beginLayoff([closingHand(), opponent], 0);
  skipCloser(state);
  // The run 4-5-6-7 Copas will not take a 12 de Bastos.
  const res = attachCard(state, c(12, 'Bastos'), findMeld(state, 4, 'Copas'));
  assert.strictEqual(res.ok, false);
  assert.match(res.reason, /does not fit/);
});

test('an attach that fits is accepted and shrinks the hand', () => {
  const opponent = [
    c(3, 'Copas'), c(12, 'Bastos'), c(2, 'Espadas'),
    c(10, 'Oros'), c(11, 'Copas'), c(7, 'Espadas'), c(2, 'Bastos'),
  ];
  const state = beginLayoff([closingHand(), opponent], 0);
  skipCloser(state);
  const runIdx = findMeld(state, 4, 'Copas');
  const res = attachCard(state, c(3, 'Copas'), runIdx); // extends 4-5-6-7 Copas
  assert.strictEqual(res.ok, true);
  assert.strictEqual(state.table[runIdx].length, 5);
});

test('a wild cannot be attached to a meld that already has one', () => {
  const closer = [
    c(4, 'Copas'), WILD(0), c(6, 'Copas'), c(7, 'Copas'),
    c(11, 'Oros'), c(11, 'Espadas'), c(11, 'Bastos'),
  ];
  const opponent = [
    WILD(1), c(12, 'Bastos'), c(2, 'Espadas'),
    c(10, 'Oros'), c(11, 'Copas'), c(7, 'Espadas'), c(2, 'Bastos'),
  ];
  const state = beginLayoff([closer, opponent], 0);
  skipCloser(state);
  const res = attachCard(state, WILD(1), findMeld(state, 4, 'Copas'));
  assert.strictEqual(res.ok, false);
});

// ------------------------------------------------- ready / being counted

test('a player is only scored once they declare ready', () => {
  const opponent = [
    c(12, 'Bastos'), c(12, 'Copas'), c(2, 'Espadas'),
    c(10, 'Oros'), c(11, 'Copas'), c(7, 'Espadas'), c(2, 'Bastos'),
  ];
  const state = beginLayoff([closingHand(), opponent], 0);
  assert.strictEqual(state.scores[0], null, 'closer not scored before declaring');
  skipCloser(state);
  assert.strictEqual(state.scores[1], null, 'opponent not scored before declaring');
  declareReady(state);
  assert.notStrictEqual(state.scores[1], null, 'opponent scored after declaring');
});

test('declaring ready passes the turn to the next player (closer first, then others)', () => {
  const junk = () => [
    c(12, 'Bastos'), c(2, 'Espadas'), c(10, 'Oros'),
    c(11, 'Copas'), c(7, 'Espadas'), c(2, 'Bastos'), c(10, 'Copas'),
  ];
  const state = beginLayoff([closingHand(), junk(), junk()], 0);
  assert.strictEqual(currentPlayer(state), 0, 'closer goes first');
  declareReady(state); // closer
  assert.strictEqual(currentPlayer(state), 1, 'then player 1');
  declareReady(state);
  assert.strictEqual(currentPlayer(state), 2, 'then player 2');
  declareReady(state);
  assert.strictEqual(state.phase, 'done', 'lay-off ends after the last player');
});

test('the closer acts first and the phase ends after everyone', () => {
  const junk = () => [
    c(12, 'Bastos'), c(2, 'Espadas'), c(10, 'Oros'),
    c(11, 'Copas'), c(7, 'Espadas'), c(2, 'Bastos'), c(10, 'Copas'),
  ];
  const state = beginLayoff([closingHand(), junk()], 0);
  declareReady(state); // closer
  declareReady(state); // player 1
  assert.strictEqual(state.phase, 'done');
  assert.strictEqual(state.scores[0], -10);
});

test('cards still in hand at ready time are counted against you', () => {
  const opponent = [
    c(12, 'Bastos'), c(12, 'Copas'), c(2, 'Espadas'),
    c(10, 'Oros'), c(11, 'Copas'), c(7, 'Espadas'), c(2, 'Bastos'),
  ];
  const state = beginLayoff([closingHand(), opponent], 0);
  skipCloser(state);
  declareReady(state);
  // Player did nothing, so every card counts: 10+10+2+10+10+7+2 = 51.
  // Nothing is shed automatically — you must act before declaring ready.
  assert.strictEqual(state.scores[1], 51);
});

test('shedding before declaring ready lowers your score', () => {
  const opponent = [
    c(3, 'Copas'), c(12, 'Bastos'), c(12, 'Copas'),
    c(10, 'Oros'), c(11, 'Copas'), c(7, 'Espadas'), c(2, 'Bastos'),
  ];
  const a = beginLayoff([closingHand(), opponent], 0);
  skipCloser(a);
  declareReady(a);
  const withoutShedding = a.scores[1];

  const b = beginLayoff([closingHand(), opponent], 0);
  skipCloser(b);
  attachCard(b, c(3, 'Copas'), findMeld(b, 4, 'Copas'));
  attachCard(b, c(11, 'Copas'), findMeld(b, 11, 'Oros'));
  declareReady(b);

  assert.ok(b.scores[1] < withoutShedding);
});

test('you cannot act after the lay-off is finished', () => {
  const junk = () => [
    c(12, 'Bastos'), c(2, 'Espadas'), c(10, 'Oros'),
    c(11, 'Copas'), c(7, 'Espadas'), c(2, 'Bastos'), c(10, 'Copas'),
  ];
  const state = beginLayoff([closingHand(), junk()], 0);
  declareReady(state); // closer
  declareReady(state); // player 1
  const res = attachCard(state, c(2, 'Espadas'), 0);
  assert.strictEqual(res.ok, false);
  assert.match(res.reason, /over/);
});

// ------------------------------------------------- false close

test('a false close never starts a lay-off at all', () => {
  const junk = [
    c(12, 'Bastos'), c(2, 'Espadas'), c(10, 'Oros'),
    c(11, 'Copas'), c(7, 'Espadas'), c(2, 'Bastos'), c(10, 'Copas'),
  ];
  const state = beginLayoff([junk, closingHand()], 0);
  assert.strictEqual(state.valid, false);
  assert.ok(state.revealedHand);
  assert.strictEqual(state.phase, undefined);
});

// ------------------------------------------------- helper

test('suggest offers valid melds and real attach targets', () => {
  const opponent = [
    c(3, 'Copas'), c(2, 'Bastos'), c(3, 'Bastos'),
    c(4, 'Bastos'), c(11, 'Copas'), c(7, 'Espadas'), c(12, 'Oros'),
  ];
  const state = beginLayoff([closingHand(), opponent], 0);
  skipCloser(state);
  const advice = suggest(state, 1);
  assert.ok(advice.melds.length >= 1, 'should spot the 2-3-4 Bastos run');
  const ranks = advice.attachable.map((a) => a.card.rank);
  assert.ok(ranks.includes(3) || ranks.includes(11));
});
