'use strict';

const { isWild, rankIndex, cardValue, RANKS } = require('./cards');

// A meld is a valid combination of 3 or more cards.
//   SET  = same rank (duplicate suits allowed, since two decks are in play)
//   RUN  = same suit, consecutive by rank index (7 -> 10 -> 11 -> 12 counts,
//          and the order wraps 12 -> 1, so 11-12-1 is a run too)
// At most ONE wild (1 de Oros) may be used per meld. Never two.

const MAX_WILDS_PER_MELD = 1;

function countWilds(cards) {
  return cards.filter(isWild).length;
}

// Is this a valid set? Same rank, duplicates allowed, <=1 wild filling a gap.
function isValidSet(cards) {
  if (cards.length < 3) return false;

  const wilds = countWilds(cards);
  if (wilds > MAX_WILDS_PER_MELD) return false;

  const natural = cards.filter((c) => !isWild(c));
  if (natural.length === 0) return false;

  // Every natural card must share one rank.
  const rank = natural[0].rank;
  return natural.every((c) => c.rank === rank);
}

// Is this a valid run? Same suit, consecutive, <=1 wild filling a gap or
// extending an end.
//
// Rank order is circular (house rule R37, Oct 2, 2026): ... 7 -> 10 -> 11 ->
// 12 -> 1 -> 2 ..., so 11-12-1 and 12-1-2 are runs. A suit only has 10 ranks,
// so a run can never be longer than 10 cards and can never contain the same
// rank twice (which also rules out going "full circle" back past its start).
function isValidRun(cards) {
  if (cards.length < 3) return false;
  if (cards.length > RANKS.length) return false;

  const wilds = countWilds(cards);
  if (wilds > MAX_WILDS_PER_MELD) return false;

  const natural = cards.filter((c) => !isWild(c));
  if (natural.length === 0) return false;

  // All naturals share a suit.
  const suit = natural[0].suit;
  if (!natural.every((c) => c.suit === suit)) return false;

  // No duplicate ranks inside a run, even from the second deck.
  const idxs = natural.map((c) => rankIndex(c.rank));
  if (new Set(idxs).size !== idxs.length) return false;

  // The run occupies cards.length consecutive slots on the circular rank
  // order. It is valid if some window of that length, starting anywhere,
  // holds every natural; the wilds fill the remaining slots (inner gaps or
  // an end).
  const n = RANKS.length;
  for (let start = 0; start < n; start++) {
    if (idxs.every((i) => (i - start + n) % n < cards.length)) return true;
  }
  return false;
}

function isValidMeld(cards) {
  return isValidSet(cards) || isValidRun(cards);
}

function meldType(cards) {
  if (isValidRun(cards)) return 'run';
  if (isValidSet(cards)) return 'set';
  return null;
}

// Deadwood points for a collection of unmelded cards.
function deadwoodValue(cards) {
  return cards.reduce((sum, c) => sum + cardValue(c), 0);
}

module.exports = {
  MAX_WILDS_PER_MELD,
  countWilds,
  isValidSet,
  isValidRun,
  isValidMeld,
  meldType,
  deadwoodValue,
};
