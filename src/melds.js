'use strict';

const { isWild, rankIndex, cardValue, RANKS } = require('./cards');

// A meld is a valid combination of 3 or more cards.
//   SET  = same rank (duplicate suits allowed, since two decks are in play)
//   RUN  = same suit, consecutive by rank index (7 -> 10 -> 11 -> 12 counts,
//          and a run may go on from 12 to 1, so 11-12-1 is a run too -- but the
//          1 is then the end: 12-1-2 is NOT a run (R37 as refined by R43))
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
// Runs may go on from 12 to 1 (house rule R37, Oct 2, 2026), but no further
// (R43, Dannel, Nov 3, 2026: "it goes 11-12-1 and no further"). So 11-12-1 and
// 10-11-12-1 are runs; 12-1-2 and 12-1-2-3 are not. Low runs that start at the
// 1 (1-2-3) are runs as always. A suit only has 10 ranks, so a run can never be
// longer than 10 cards and can never contain the same rank twice.
// Starting slots (indexes into RANKS) of the windows a run of `len` cards may
// occupy: any straight window 1..12, plus the one window that ends on the 1
// just after the 12 (e.g. 11-12-1 for len 3). Nothing continues past that 1.
function runWindowStarts(len) {
  const n = RANKS.length;
  const starts = [];
  for (let start = 0; start + len <= n; start++) starts.push(start);
  if (len >= 2 && len <= n) starts.push(n - len + 1); // ...-12-1, the 1 ends it
  return starts;
}

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

  // Positions are indexes into RANKS (not face values), so the missing 8 and 9
  // never count as a gap: 6-7-10 is three consecutive slots.
  //
  // The run occupies cards.length consecutive slots. It is valid if one of
  // the allowed windows of that length (runWindowStarts) holds every natural;
  // the wilds fill the remaining slots (inner gaps or an end). With at most
  // one wild, a window can hold at most one empty slot.
  // Example: 5, 7 + wild -> window 5-6-7 (the wild is the 6). Example: 11, 1 +
  // wild -> window 11-12-1, going on past 12 to the 1. Example: 12, 1 + wild
  // -> 11-12-1 (the wild is the 11), never 12-1-2.
  const n = RANKS.length;
  return runWindowStarts(cards.length)
    .some((start) => idxs.every((i) => (i - start + n) % n < cards.length));
}

function isValidMeld(cards) {
  return isValidSet(cards) || isValidRun(cards);
}

function meldType(cards) {
  if (isValidRun(cards)) return 'run';
  if (isValidSet(cards)) return 'set';
  return null;
}

// Display order for a meld on the table: a run is laid out in rank order
// (including 12 -> 1 at the top end), with the wild in the slot it fills.
// Sets, and anything that is not a valid run, come back unchanged.
function orderRun(cards) {
  if (!isValidRun(cards)) return [...cards];
  const n = RANKS.length;
  const natural = cards.filter((c) => !isWild(c));
  const wilds = cards.filter(isWild);
  const idxs = natural.map((c) => rankIndex(c.rank));
  for (const start of runWindowStarts(cards.length)) {
    if (!idxs.every((i) => (i - start + n) % n < cards.length)) continue;
    const slots = new Array(cards.length).fill(null);
    natural.forEach((c, k) => { slots[(idxs[k] - start + n) % n] = c; });
    return slots.map((c) => c || wilds.shift());
  }
  return [...cards];
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
  orderRun,
  deadwoodValue,
};
