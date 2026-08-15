'use strict';

const assert = require('node:assert');
const { test } = require('node:test');

const { buildDeck, isWild, cardValue, RANKS } = require('../src/cards');
const { isValidSet, isValidRun, isValidMeld } = require('../src/melds');
const { bestSplit, canClose, isChinchon, scoreHand } = require('../src/scoring');

// Test helper: c(rank, suit, deckId)
const c = (rank, suit, deckId = 0) => ({
  rank,
  suit,
  deckId,
  id: `${rank}-${suit}-${deckId}`,
});

const WILD = (deckId = 0) => c(1, 'Oros', deckId);

// ---------------------------------------------------------------- deck

test('deck has exactly 80 cards', () => {
  assert.strictEqual(buildDeck().length, 80);
});

test('every card appears exactly twice', () => {
  const counts = new Map();
  for (const card of buildDeck()) {
    const key = `${card.rank}-${card.suit}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  assert.strictEqual(counts.size, 40);
  for (const n of counts.values()) assert.strictEqual(n, 2);
});

test('deck contains no 8s and no 9s', () => {
  assert.ok(!buildDeck().some((card) => card.rank === 8 || card.rank === 9));
  assert.ok(!RANKS.includes(8));
  assert.ok(!RANKS.includes(9));
});

test('there are exactly 2 wild cards, both 1 de Oros', () => {
  const wilds = buildDeck().filter(isWild);
  assert.strictEqual(wilds.length, 2);
  assert.ok(wilds.every((w) => w.rank === 1 && w.suit === 'Oros'));
});

// ---------------------------------------------------------------- values

test('cards 1-7 are worth face value', () => {
  for (const r of [1, 2, 3, 4, 5, 6, 7]) {
    assert.strictEqual(cardValue(c(r, 'Copas')), r);
  }
});

test('10, 11 and 12 are worth 10 points each', () => {
  for (const r of [10, 11, 12]) {
    assert.strictEqual(cardValue(c(r, 'Bastos')), 10);
  }
});

// ---------------------------------------------------------------- sets

test('three of a kind in different suits is a valid set', () => {
  assert.ok(isValidSet([c(5, 'Copas'), c(5, 'Espadas'), c(5, 'Bastos')]));
});

test('set with two IDENTICAL cards is valid (two decks in play)', () => {
  // 5 de Copas from deck 0, 5 de Copas from deck 1, 5 de Espadas
  assert.ok(isValidSet([c(5, 'Copas', 0), c(5, 'Copas', 1), c(5, 'Espadas', 0)]));
});

test('three identical cards is NOT possible but three same-rank always valid', () => {
  assert.ok(isValidSet([c(12, 'Oros', 0), c(12, 'Oros', 1), c(12, 'Copas', 0)]));
});

test('mixed ranks are not a set', () => {
  assert.ok(!isValidSet([c(5, 'Copas'), c(6, 'Espadas'), c(5, 'Bastos')]));
});

test('two cards are never a meld', () => {
  assert.ok(!isValidMeld([c(5, 'Copas'), c(5, 'Espadas')]));
});

// ---------------------------------------------------------------- runs

test('simple run in one suit is valid', () => {
  assert.ok(isValidRun([c(4, 'Copas'), c(5, 'Copas'), c(6, 'Copas')]));
});

test('run bridges the 8/9 gap: 7 -> 10 -> 11 is consecutive', () => {
  assert.ok(isValidRun([c(7, 'Espadas'), c(10, 'Espadas'), c(11, 'Espadas')]));
});

test('run 10-11-12 is valid', () => {
  assert.ok(isValidRun([c(10, 'Oros'), c(11, 'Oros'), c(12, 'Oros')]));
});

test('run across different suits is invalid', () => {
  assert.ok(!isValidRun([c(4, 'Copas'), c(5, 'Espadas'), c(6, 'Copas')]));
});

test('run with a duplicate rank is invalid', () => {
  assert.ok(!isValidRun([c(4, 'Copas', 0), c(4, 'Copas', 1), c(5, 'Copas', 0)]));
});

test('non-consecutive cards are not a run', () => {
  assert.ok(!isValidRun([c(4, 'Copas'), c(6, 'Copas'), c(12, 'Copas')]));
});

// ---------------------------------------------------------------- wilds

test('one wild can fill a gap in a run', () => {
  // 4 - [wild as 5] - 6 de Copas
  assert.ok(isValidRun([c(4, 'Copas'), WILD(), c(6, 'Copas')]));
});

test('one wild can complete a set', () => {
  assert.ok(isValidSet([c(7, 'Copas'), c(7, 'Espadas'), WILD()]));
});

test('TWO wilds in a single meld is illegal', () => {
  assert.ok(!isValidRun([c(4, 'Copas'), WILD(0), WILD(1), c(7, 'Copas')]));
  assert.ok(!isValidSet([c(7, 'Copas'), WILD(0), WILD(1)]));
});

test('wild can bridge the 8/9 gap too', () => {
  // 6 - 7 - [wild as 10] de Bastos
  assert.ok(isValidRun([c(6, 'Bastos'), c(7, 'Bastos'), WILD()]));
});

// ---------------------------------------------------------------- chinchon

test('seven-card run in one suit is a chinchon', () => {
  const hand = [
    c(1, 'Copas'), c(2, 'Copas'), c(3, 'Copas'), c(4, 'Copas'),
    c(5, 'Copas'), c(6, 'Copas'), c(7, 'Copas'),
  ];
  assert.ok(isChinchon(hand));
  assert.strictEqual(canClose(hand).reason, 'chinchon');
});

test('seven of the same rank is a chinchon', () => {
  const hand = [
    c(7, 'Oros', 0), c(7, 'Oros', 1), c(7, 'Copas', 0), c(7, 'Copas', 1),
    c(7, 'Espadas', 0), c(7, 'Espadas', 1), c(7, 'Bastos', 0),
  ];
  assert.ok(isChinchon(hand));
});

test('chinchon with ONE wild is allowed', () => {
  const hand = [
    WILD(), c(2, 'Copas'), c(3, 'Copas'), c(4, 'Copas'),
    c(5, 'Copas'), c(6, 'Copas'), c(7, 'Copas'),
  ];
  assert.ok(isChinchon(hand));
});

test('chinchon with TWO wilds is NOT allowed', () => {
  const hand = [
    WILD(0), WILD(1), c(3, 'Copas'), c(4, 'Copas'),
    c(5, 'Copas'), c(6, 'Copas'), c(7, 'Copas'),
  ];
  assert.ok(!isChinchon(hand));
});

// ---------------------------------------------------------------- closing

test('4 + 3 covering all seven cards closes for -10', () => {
  const hand = [
    c(4, 'Copas'), c(5, 'Copas'), c(6, 'Copas'), c(7, 'Copas'), // run of 4
    c(11, 'Oros'), c(11, 'Espadas'), c(11, 'Bastos'),           // set of 3
  ];
  const res = canClose(hand);
  assert.ok(res.ok);
  assert.strictEqual(res.score, -10);
  assert.strictEqual(res.reason, 'closed clean');
});

test('3 + 3 with a leftover of 5 or less can close', () => {
  const hand = [
    c(4, 'Copas'), c(5, 'Copas'), c(6, 'Copas'),
    c(11, 'Oros'), c(11, 'Espadas'), c(11, 'Bastos'),
    c(3, 'Bastos'), // leftover worth 3
  ];
  const res = canClose(hand);
  assert.ok(res.ok);
  assert.strictEqual(res.score, 3);
});

test('leftover above 5 blocks closing', () => {
  const hand = [
    c(4, 'Copas'), c(5, 'Copas'), c(6, 'Copas'),
    c(11, 'Oros'), c(11, 'Espadas'), c(11, 'Bastos'),
    c(12, 'Bastos'), // leftover worth 10
  ];
  const res = canClose(hand);
  assert.ok(!res.ok);
});

test('a leftover of exactly 5 is allowed', () => {
  const hand = [
    c(4, 'Copas'), c(5, 'Copas'), c(6, 'Copas'),
    c(11, 'Oros'), c(11, 'Espadas'), c(11, 'Bastos'),
    c(5, 'Bastos'),
  ];
  assert.ok(canClose(hand).ok);
});

test('a leftover of 6 is rejected', () => {
  const hand = [
    c(4, 'Copas'), c(5, 'Copas'), c(6, 'Copas'),
    c(11, 'Oros'), c(11, 'Espadas'), c(11, 'Bastos'),
    c(6, 'Bastos'),
  ];
  assert.ok(!canClose(hand).ok);
});

test('only one combination is not enough to close', () => {
  const hand = [
    c(4, 'Copas'), c(5, 'Copas'), c(6, 'Copas'),
    c(12, 'Bastos'), c(2, 'Espadas'), c(10, 'Oros'), c(3, 'Copas'),
  ];
  assert.ok(!canClose(hand).ok);
});

test('two wilds may be used across two SEPARATE melds', () => {
  const hand = [
    c(4, 'Copas'), WILD(0), c(6, 'Copas'),        // run using wild #1
    c(11, 'Espadas'), c(11, 'Bastos'), WILD(1),   // set using wild #2
    c(2, 'Bastos'),                                // leftover worth 2
  ];
  const res = canClose(hand);
  assert.ok(res.ok);
  assert.strictEqual(res.score, 2);
});

// ---------------------------------------------------------------- scoring

test('a hand with no melds scores full deadwood', () => {
  const hand = [
    c(2, 'Copas'), c(5, 'Espadas'), c(7, 'Bastos'),
    c(10, 'Oros'), c(12, 'Copas'), c(11, 'Bastos'), c(4, 'Espadas'),
  ];
  // 2 + 5 + 7 + 10 + 10 + 10 + 4 = 48
  assert.strictEqual(scoreHand(hand), 48);
});

test('scoring keeps the best split, not the first one found', () => {
  const hand = [
    c(4, 'Copas'), c(5, 'Copas'), c(6, 'Copas'), // run, removes 15
    c(12, 'Oros'), c(12, 'Copas'), c(12, 'Bastos'), // set, removes 30
    c(2, 'Espadas'),
  ];
  assert.strictEqual(scoreHand(hand), 2);
});

test('bestSplit finds two melds when they exist', () => {
  const hand = [
    c(4, 'Copas'), c(5, 'Copas'), c(6, 'Copas'),
    c(12, 'Oros'), c(12, 'Copas'), c(12, 'Bastos'),
    c(2, 'Espadas'),
  ];
  const split = bestSplit(hand);
  assert.strictEqual(split.melds.length, 2);
  assert.strictEqual(split.leftovers.length, 1);
});
