'use strict';

// R23 (Dannel, Aug 16; reconfirmed Nov 12, 2026): "as long as one is as
// itself, chinchón can't do 2 wilds". A 7-card Oros run may contain both
// 1 de Oros cards when one occupies the natural 1 slot and only the other
// is a substitute wild. A Chinchon that needs two substitute wilds is
// rejected. The same assignment is used for shorter Oros runs, lay-off,
// and close judging, so bots and humans follow one rule.

const test = require('node:test');
const assert = require('node:assert');
const { isValidRun, isValidSet, isValidMeld, orderRun } = require('../src/melds');
const { canAttach } = require('../src/layoff');
const { isChinchon, canClose, allCloseSplits, bestSplit } = require('../src/scoring');

const c = (rank, suit, deckId = 0) => ({ rank, suit, deckId, id: `${rank}-${suit}-${deckId}` });
const WILD = (deckId = 0) => c(1, 'Oros', deckId);

// 1-2-3-4-5-6 de Oros plus the second 1 de Oros filling 7.
function orosNaturalPlusWildAsSeven() {
  return [
    WILD(0), c(2, 'Oros'), c(3, 'Oros'), c(4, 'Oros'),
    c(5, 'Oros'), c(6, 'Oros'), WILD(1),
  ];
}

// 6-7-10-11-12 de Oros plus both 1s: natural 1 at the top end, wild as 5.
function orosWrapNaturalPlusWild() {
  return [
    c(6, 'Oros'), c(7, 'Oros'), c(10, 'Oros'), c(11, 'Oros'),
    c(12, 'Oros'), WILD(0), WILD(1),
  ];
}

// 2-3-4-5-10 de Oros plus both 1s: the only 7-card window that holds the
// five naturals is 2-3-4-5-6-7-10, which needs two substitute wilds.
function orosNeedsTwoWilds() {
  return [
    c(2, 'Oros'), c(3, 'Oros'), c(4, 'Oros'), c(5, 'Oros'),
    c(10, 'Oros'), WILD(0), WILD(1),
  ];
}

test('R23: Oros Chinchon with natural 1 de Oros plus one wild is allowed', () => {
  const hand = orosNaturalPlusWildAsSeven();
  assert.ok(isValidRun(hand));
  assert.ok(isValidMeld(hand));
  assert.ok(isChinchon(hand));
  const close = canClose(hand);
  assert.ok(close.ok);
  assert.strictEqual(close.reason, 'chinchon');
  assert.strictEqual(close.score, 0);
  const splits = allCloseSplits(hand);
  assert.ok(splits.some((s) => s.kind === 'chinchon' && s.leftovers.length === 0));
  assert.strictEqual(bestSplit(hand).chinchon, true);
  assert.strictEqual(bestSplit(hand).deadwood, 0);
  const ordered = orderRun(hand).map((x) => x.rank);
  assert.deepStrictEqual(ordered, [1, 2, 3, 4, 5, 6, 1]);
});

test('R23: Oros Chinchon 5-6-7-10-11-12-1 with the second 1 as the 5 is allowed', () => {
  const hand = orosWrapNaturalPlusWild();
  assert.ok(isChinchon(hand));
  assert.strictEqual(canClose(hand).reason, 'chinchon');
  const ranks = orderRun(hand).map((x) => `${x.rank}-${x.suit}`);
  assert.deepStrictEqual(ranks, [
    '1-Oros', '6-Oros', '7-Oros', '10-Oros', '11-Oros', '12-Oros', '1-Oros',
  ]);
});

test('R23: a Chinchon that needs two substitute wilds is rejected', () => {
  const oros = orosNeedsTwoWilds();
  assert.ok(!isValidRun(oros));
  assert.ok(!isChinchon(oros));
  assert.strictEqual(canClose(oros).ok, false);

  // Copas run: neither 1 de Oros can be a natural 1 in this suit.
  const copas = [
    WILD(0), WILD(1), c(3, 'Copas'), c(4, 'Copas'),
    c(5, 'Copas'), c(6, 'Copas'), c(7, 'Copas'),
  ];
  assert.ok(!isValidRun(copas));
  assert.ok(!isChinchon(copas));
});

test('R23: a seven-card set still cannot use two wilds', () => {
  const hand = [
    c(7, 'Oros', 0), c(7, 'Oros', 1), c(7, 'Copas', 0), c(7, 'Copas', 1),
    c(7, 'Espadas', 0), WILD(0), WILD(1),
  ];
  assert.ok(!isValidSet(hand));
  assert.ok(!isChinchon(hand));
});

test('R23: Chinchon with natural 1 plus one wild stays legal on 100 (R46)', () => {
  const hand = orosNaturalPlusWildAsSeven();
  const close = canClose(hand, 100);
  assert.ok(close.ok);
  assert.strictEqual(close.reason, 'chinchon');
  assert.ok(allCloseSplits(hand, 100).some((s) => s.kind === 'chinchon'));
});

test('R38/R41/R46 still hold around a leftover wild or a low leftover', () => {
  // 3+3 plus the wild left over: the wild scores 0 (R38), and leaving it is
  // still legal on 100 (R46: 100 + 0 is not over 100). bestSplit prefers the
  // clean -10 that uses the wild, so we check the leftover option itself.
  const { cardValue } = require('../src/cards');
  assert.strictEqual(cardValue(WILD()), 0);
  const wildLeft = [
    c(4, 'Copas'), c(5, 'Copas'), c(6, 'Copas'),
    c(11, 'Bastos'), c(11, 'Espadas'), c(11, 'Oros'),
    WILD(),
  ];
  const onHundred = allCloseSplits(wildLeft, 100);
  const leftover = onHundred.find((s) => s.leftovers.length === 1 && s.leftovers[0].suit === 'Oros' && s.leftovers[0].rank === 1);
  assert.ok(leftover, 'wild-leftover close is still offered on 100');
  assert.strictEqual(leftover.score, 0);
  assert.strictEqual(leftover.kind, 'leftover');

  // R41/R46: 6-card run + leftover 2 is legal on 98, not on 99.
  const sixPlusTwo = [
    c(2, 'Copas'), c(3, 'Copas'), c(4, 'Copas'),
    c(5, 'Copas'), c(6, 'Copas'), c(7, 'Copas'), c(2, 'Bastos'),
  ];
  assert.strictEqual(canClose(sixPlusTwo, 98).ok, true);
  assert.strictEqual(canClose(sixPlusTwo, 98).reason, 'closed with leftover');
  const over = canClose(sixPlusTwo, 99);
  assert.strictEqual(over.ok, false);
  assert.match(over.reason, /over 100/);
});

test('R23: lay-off may attach a second 1 de Oros only as the natural 1, or as the lone wild', () => {
  // 2-3-4 de Oros already using one 1 de Oros as the 5: the other 1 may
  // attach as the natural 1.
  const withSubstitute = [c(2, 'Oros'), c(3, 'Oros'), c(4, 'Oros'), WILD(0)];
  assert.ok(canAttach(withSubstitute, WILD(1)));
  assert.deepStrictEqual(
    orderRun([...withSubstitute, WILD(1)]).map((x) => x.rank),
    [1, 2, 3, 4, 1],
  );

  // 1-2-3 de Oros (natural 1): the other 1 may attach as the 4.
  const withNatural = [WILD(0), c(2, 'Oros'), c(3, 'Oros')];
  assert.ok(canAttach(withNatural, WILD(1)));

  // A Copas run that already has a wild cannot take the second 1.
  const copas = [c(4, 'Copas'), WILD(0), c(6, 'Copas')];
  assert.ok(!canAttach(copas, WILD(1)));
});
