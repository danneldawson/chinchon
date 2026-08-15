'use strict';

const { isWild, rankIndex, cardValue } = require('./cards');

// A meld is a valid combination of 3 or more cards.
//   SET  = same rank (duplicate suits allowed, since two decks are in play)
//   RUN  = same suit, consecutive by rank index (7 -> 10 -> 11 -> 12 counts)
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

// Is this a valid run? Same suit, consecutive, <=1 wild filling exactly one gap.
function isValidRun(cards) {
  if (cards.length < 3) return false;

  const wilds = countWilds(cards);
  if (wilds > MAX_WILDS_PER_MELD) return false;

  const natural = cards.filter((c) => !isWild(c));
  if (natural.length === 0) return false;

  // All naturals share a suit.
  const suit = natural[0].suit;
  if (!natural.every((c) => c.suit === suit)) return false;

  // No duplicate ranks inside a run, even from the second deck.
  const idxs = natural.map((c) => rankIndex(c.rank)).sort((a, b) => a - b);
  if (new Set(idxs).size !== idxs.length) return false;

  // Total span must fit the card count, and gaps must be coverable by wilds.
  const span = idxs[idxs.length - 1] - idxs[0] + 1;
  if (span > cards.length) return false;

  const gaps = span - natural.length;
  // Leftover wilds may extend the run at either end, which is fine.
  return gaps <= wilds;
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
