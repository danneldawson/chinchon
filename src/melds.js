'use strict';

const { isWild, rankIndex, cardValue, RANKS } = require('./cards');

// A meld is a valid combination of 3 or more cards.
//   SET  = same rank (duplicate suits allowed, since two decks are in play)
//   RUN  = same suit, consecutive by rank index (7 -> 10 -> 11 -> 12 counts,
//          and a run may go on from 12 to 1, so 11-12-1 is a run too -- but the
//          1 is then the end: 12-1-2 is NOT a run (R37 as refined by R43))
// At most ONE substitute wild (a 1 de Oros standing in for another card) may
// be used per meld. A 1 de Oros played as itself in an Oros run is not a wild
// for that cap, so both 1 de Oros may appear in the same run only when one of
// them occupies the natural 1 slot (R23).

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

// Is this a valid run? Same suit, consecutive, at most one *substitute* wild
// filling a gap or extending an end.
//
// A 1 de Oros may be played as itself, the natural 1 in an Oros run (R4). In
// that case it is not a wild, so a second 1 de Oros may still fill one gap
// (R23). Two 1 de Oros used as two substitutes are never a run.
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

// Try to place `naturals` in a legal window of `len` slots, with `wilds`
// filling the empty ones. At most one substitute wild. Returns { start,
// naturals, wilds } on success, or null.
function assignRun(len, naturals, wilds) {
  if (wilds.length > MAX_WILDS_PER_MELD) return null;
  if (naturals.length === 0) return null;
  const suit = naturals[0].suit;
  if (!naturals.every((c) => c.suit === suit)) return null;
  const idxs = naturals.map((c) => rankIndex(c.rank));
  if (new Set(idxs).size !== idxs.length) return null;
  const n = RANKS.length;
  for (const start of runWindowStarts(len)) {
    if (idxs.every((i) => (i - start + n) % n < len)) {
      return { start, naturals, wilds };
    }
  }
  return null;
}

// How this group of cards can form a run, if it can. Prefers treating one
// 1 de Oros as the natural 1 when that yields a valid Oros run (R4, R23);
// otherwise every 1 de Oros is a substitute wild.
function runAssignment(cards) {
  if (cards.length < 3) return null;
  if (cards.length > RANKS.length) return null;
  const ones = cards.filter(isWild);
  const others = cards.filter((c) => !isWild(c));
  if (ones.length >= 1) {
    const asNatural = assignRun(cards.length, [ones[0], ...others], ones.slice(1));
    if (asNatural) return asNatural;
  }
  return assignRun(cards.length, others, ones);
}

function isValidRun(cards) {
  return runAssignment(cards) != null;
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
  const assigned = runAssignment(cards);
  if (!assigned) return [...cards];
  const n = RANKS.length;
  const { start, naturals, wilds } = assigned;
  const leftoverWilds = [...wilds];
  const slots = new Array(cards.length).fill(null);
  naturals.forEach((c) => { slots[(rankIndex(c.rank) - start + n) % n] = c; });
  return slots.map((c) => c || leftoverWilds.shift());
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
