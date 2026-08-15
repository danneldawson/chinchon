'use strict';

// Simple bot policy. Draws sensibly, discards its worst card, closes when it can.

const { cardValue } = require('./cards');
const { bestSplit, canClose } = require('./scoring');
const { canAttach } = require('./layoff');
const { closeOptions, topOfDiscard } = require('./turn');

// Would taking this card improve the hand?
function improvesHand(hand, card) {
  const before = bestSplit(hand).deadwood;
  const after = bestSplit([...hand, card]).deadwood;
  return after < before;
}

// Decide draw source: 'discard' if the visible card helps, else 'stock'.
function chooseDraw(state) {
  const top = topOfDiscard(state);
  if (!top) return 'stock';
  return improvesHand(state.hands[state.turn], top) ? 'discard' : 'stock';
}

// Pick the card to throw away: the one leaving the lowest deadwood.
// Ties are broken by dumping the highest-value card.
function chooseDiscard(state) {
  const hand = state.hands[state.turn];
  let best = null;

  for (let i = 0; i < hand.length; i++) {
    const kept = [...hand.slice(0, i), ...hand.slice(i + 1)];
    const deadwood = bestSplit(kept).deadwood;
    const value = cardValue(hand[i]);

    if (
      best === null ||
      deadwood < best.deadwood ||
      (deadwood === best.deadwood && value > best.value)
    ) {
      best = { card: hand[i], deadwood, value };
    }
  }

  return best ? best.card : hand[0];
}

// Full turn decision. Returns { close: bool, card }.
function chooseTurn(state) {
  const opts = closeOptions(state);
  if (opts.length > 0) {
    // Prefer a chinchon, then a clean -10, then the cheapest leftover.
    const chinchon = opts.find((o) => o.reason === 'chinchon');
    if (chinchon) return { close: true, card: chinchon.discard };

    const clean = opts.find((o) => o.score === -10);
    if (clean) return { close: true, card: clean.discard };

    const cheapest = opts.reduce((a, b) => (a.score <= b.score ? a : b));
    return { close: true, card: cheapest.discard };
  }
  return { close: false, card: chooseDiscard(state) };
}

// During lay-off: which melds to lay, which cards to attach where.
function planLayoff(state, playerIndex) {
  const hand = state.remaining[playerIndex];
  const split = bestSplit(hand);
  return { melds: split.melds, leftovers: split.leftovers };
}

// Find any table meld that accepts this card.
function findAttach(table, card) {
  for (let i = 0; i < table.length; i++) {
    if (canAttach(table[i], card)) return i;
  }
  return -1;
}

module.exports = {
  improvesHand,
  chooseDraw,
  chooseDiscard,
  chooseTurn,
  planLayoff,
  findAttach,
};
