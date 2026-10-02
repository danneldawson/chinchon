'use strict';

// Regression tests for Dannel's Oct 2, 2026 rulings (house-rules.md section H):
//   R37  runs wrap from 12 round to 1 (11-12-1, 12-1-2, ...)
//   R38  the wild (1 de Oros) scores 0 when left in hand
// R40 (60s pre-start countdown) is covered in test/countdown.test.js.

const assert = require('node:assert');
const { test } = require('node:test');

const { cardValue, isWild } = require('../src/cards');
const { isValidRun, isValidMeld, meldType, deadwoodValue } = require('../src/melds');
const { bestSplit, canClose, allCloseSplits, isChinchon, scoreHand } = require('../src/scoring');
const { canAttach } = require('../src/layoff');
const { improvesHand } = require('../src/bot');

const c = (rank, suit, deckId = 0) => ({ rank, suit, deckId, id: `${rank}-${suit}-${deckId}` });
const WILD = (deckId = 0) => c(1, 'Oros', deckId);

// ------------------------------------------------------------ R37: run wrap

test('R37: 11-12-1 of one suit is a valid run (natural 1 of a non-wild suit)', () => {
  const meld = [c(11, 'Bastos'), c(12, 'Bastos'), c(1, 'Bastos')];
  assert.ok(isValidRun(meld));
  assert.strictEqual(meldType(meld), 'run');
});

test('R37: 12-1-2 and 12-1-2-3 wrap across the end', () => {
  assert.ok(isValidRun([c(12, 'Copas'), c(1, 'Copas'), c(2, 'Copas')]));
  assert.ok(isValidRun([c(3, 'Espadas'), c(12, 'Espadas'), c(2, 'Espadas'), c(1, 'Espadas')]));
});

test('R37: a long wrap that also uses the 7->10 bridge is valid (6-7-10-11-12-1-2)', () => {
  const meld = ['6', '7', '10', '11', '12', '1', '2'].map((r) => c(Number(r), 'Copas'));
  assert.ok(isValidRun(meld));
});

test('R37: the wild can fill the 1 in a wrap (12-wild-2)', () => {
  assert.ok(isValidRun([c(12, 'Copas'), WILD(), c(2, 'Copas')]));
});

test('R37: the wild can extend a wrap at either end (wild-12-1, 12-1-wild)', () => {
  assert.ok(isValidRun([WILD(), c(12, 'Bastos'), c(1, 'Bastos')]));
  assert.ok(isValidRun([c(12, 'Bastos'), c(1, 'Bastos'), WILD()]));
  assert.ok(isValidRun([c(11, 'Espadas'), c(12, 'Espadas'), WILD()]));
});

test('R37: 12-1-2 de Oros is valid (the 1 de Oros sits in its own slot)', () => {
  assert.ok(isValidRun([c(12, 'Oros'), WILD(), c(2, 'Oros')]));
});

test('R37: a wrap with a real gap is rejected (11-12-2, 12-1-3, 10-12-1)', () => {
  assert.ok(!isValidRun([c(11, 'Copas'), c(12, 'Copas'), c(2, 'Copas')]));
  assert.ok(!isValidRun([c(12, 'Copas'), c(1, 'Copas'), c(3, 'Copas')]));
  assert.ok(!isValidRun([c(10, 'Copas'), c(12, 'Copas'), c(1, 'Copas')]));
});

test('R37: one wild cannot cover two gaps in a wrap (10-wild-1-3)', () => {
  assert.ok(!isValidRun([c(10, 'Copas'), WILD(), c(1, 'Copas'), c(3, 'Copas')]));
});

test('R37: two wilds in a wrapped run are still rejected', () => {
  assert.ok(!isValidMeld([c(12, 'Copas'), WILD(0), WILD(1), c(3, 'Copas')]));
});

test('R37: a wrap must stay in one suit', () => {
  assert.ok(!isValidRun([c(11, 'Copas'), c(12, 'Copas'), c(1, 'Espadas')]));
});

test('R37: duplicate ranks are rejected across the wrap (12-1-2 + second 12)', () => {
  assert.ok(!isValidRun([c(12, 'Copas', 0), c(1, 'Copas'), c(2, 'Copas'), c(12, 'Copas', 1)]));
});

test('R37: all 10 ranks of a suit form a run, but the circle cannot close on itself', () => {
  const all = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12].map((r) => c(r, 'Bastos'));
  assert.ok(isValidRun(all), 'one of every rank is a run');
  // An 11th card would have to repeat a rank: a wild cannot stand in for it.
  assert.ok(!isValidRun([...all, WILD()]), '10 naturals + wild is 11 cards: rejected');
  // 9 naturals + wild = 10 cards, the wild takes the missing rank.
  const nine = all.filter((x) => x.rank !== 5);
  assert.ok(isValidRun([...nine, WILD()]));
});

test('R37: lay-off can attach a 1 after 12 and a 12 before 1', () => {
  assert.ok(canAttach([c(10, 'Copas'), c(11, 'Copas'), c(12, 'Copas')], c(1, 'Copas')));
  assert.ok(canAttach([c(1, 'Espadas'), c(2, 'Espadas'), c(3, 'Espadas')], c(12, 'Espadas')));
  assert.ok(!canAttach([c(10, 'Copas'), c(11, 'Copas'), c(12, 'Copas')], c(2, 'Copas')));
});

test('R37: a hand that only melds via the wrap can close clean', () => {
  const hand = [
    c(11, 'Bastos'), c(12, 'Bastos'), c(1, 'Bastos'), c(2, 'Bastos'),
    c(5, 'Copas'), c(5, 'Espadas'), c(5, 'Oros'),
  ];
  const r = canClose(hand);
  assert.ok(r.ok);
  assert.strictEqual(r.score, -10);
  assert.ok(allCloseSplits(hand).some((s) => s.kind === 'clean'));
});

test('R37: a 7-card wrapped run is a chinchón', () => {
  const hand = [10, 11, 12, 1, 2, 3, 4].map((r) => c(r, 'Espadas'));
  assert.ok(isChinchon(hand));
  assert.strictEqual(canClose(hand).reason, 'chinchon');
});

test('R37: the bot sees a wrap card as improving its hand', () => {
  const hand = [c(11, 'Copas'), c(12, 'Copas'), c(4, 'Bastos'), c(7, 'Espadas'), c(3, 'Oros'), c(6, 'Copas'), c(2, 'Espadas')];
  assert.ok(improvesHand(hand, c(1, 'Copas')));
});

// ------------------------------------------------------------ R38: wild = 0

test('R38: the wild (1 de Oros, both decks) scores 0', () => {
  assert.strictEqual(cardValue(WILD(0)), 0);
  assert.strictEqual(cardValue(WILD(1)), 0);
  assert.ok(isWild(WILD(1)));
});

test('R38: natural 1s of the other suits still score 1', () => {
  for (const s of ['Copas', 'Espadas', 'Bastos']) assert.strictEqual(cardValue(c(1, s)), 1);
});

test('R38: a stranded wild adds nothing to deadwood', () => {
  assert.strictEqual(deadwoodValue([WILD(), c(3, 'Copas')]), 3);
  const junk = [WILD(), c(2, 'Copas'), c(5, 'Espadas'), c(7, 'Bastos'), c(10, 'Oros'), c(12, 'Copas'), c(4, 'Espadas')];
  // Every non-wild card is stranded; whatever the wild does it costs 0.
  assert.ok(scoreHand(junk) <= 2 + 5 + 7 + 10 + 10 + 4);
});

test('R38: 3+3 with the wild as the leftover closes for 0 points', () => {
  const hand = [
    c(4, 'Copas'), c(5, 'Copas'), c(6, 'Copas'),
    c(11, 'Bastos'), c(11, 'Espadas'), c(11, 'Oros'),
    WILD(),
  ];
  const opts = allCloseSplits(hand);
  const wildLeft = opts.find((o) => o.leftovers.length === 1 && isWild(o.leftovers[0]));
  assert.ok(wildLeft, 'the wild-leftover split is offered');
  assert.strictEqual(wildLeft.score, 0);
});

test('R38: a 4+3 that uses the wild is still a clean -10 (not "3+3 + wild leftover")', () => {
  const hand = [
    c(4, 'Copas'), c(5, 'Copas'), c(6, 'Copas'), WILD(),
    c(10, 'Bastos'), c(11, 'Bastos'), c(12, 'Bastos'),
  ];
  const r = canClose(hand);
  assert.ok(r.ok);
  assert.strictEqual(r.reason, 'closed clean');
  assert.strictEqual(r.score, -10);
  assert.strictEqual(bestSplit(hand).leftovers.length, 0);
});
