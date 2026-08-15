'use strict';

const { isWild, cardValue } = require('./cards');
const { isValidMeld, deadwoodValue } = require('./melds');

// Chinchón close-scoring: bestSplit (auto) plus allCloseSplits (player choice).
// A "split" = { melds: [...], leftovers: [...], score, kind } where kind is one
// of 'chinchon' | 'clean' | 'leftover'. All returned splits are LEGAL closes.

const HAND_SIZE = 7;
const MAX_LEFTOVER_TO_CLOSE = 5;
const CLOSE_BONUS = -10;

// Enumerate every way to split a hand into melds + leftovers.
// Hands are 7 cards, so brute force over subsets is cheap and exact.

function combinations(cards, size) {
  const out = [];
  const pick = (start, acc) => {
    if (acc.length === size) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < cards.length; i++) {
      acc.push(cards[i]);
      pick(i + 1, acc);
      acc.pop();
    }
  };
  pick(0, []);
  return out;
}

function without(cards, subset) {
  const ids = new Set(subset.map((c) => c.id));
  return cards.filter((c) => !ids.has(c.id));
}

// All melds of length 3..n that can be formed from these cards.
function allMelds(cards) {
  const melds = [];
  for (let size = 3; size <= cards.length; size++) {
    for (const combo of combinations(cards, size)) {
      if (isValidMeld(combo)) melds.push(combo);
    }
  }
  return melds;
}

// A chinchón is all 7 cards in ONE single meld. Wins the entire game outright.
// Only one wild may be used, which the meld validator already enforces.
function isChinchon(hand) {
  return hand.length === HAND_SIZE && isValidMeld(hand);
}

// Best way to organise a hand: maximise melded cards, minimise deadwood.
// Returns { melds, leftovers, deadwood, chinchon }.
function bestSplit(hand) {
  if (isChinchon(hand)) {
    return { melds: [hand], leftovers: [], deadwood: 0, chinchon: true };
  }

  let best = { melds: [], leftovers: [...hand], deadwood: deadwoodValue(hand), chinchon: false };

  const melds = allMelds(hand);

  // Try one meld alone, then every compatible pair of melds.
  for (let i = 0; i < melds.length; i++) {
    const restAfterFirst = without(hand, melds[i]);
    const single = {
      melds: [melds[i]],
      leftovers: restAfterFirst,
      deadwood: deadwoodValue(restAfterFirst),
      chinchon: false,
    };
    if (single.deadwood < best.deadwood) best = single;

    for (const second of allMelds(restAfterFirst)) {
      const leftovers = without(restAfterFirst, second);
      const pair = {
        melds: [melds[i], second],
        leftovers,
        deadwood: deadwoodValue(leftovers),
        chinchon: false,
      };
      if (pair.deadwood < best.deadwood) best = pair;
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// PLAYER-CHOICE CLOSE ENUMERATION
//
// bestSplit picks ONE decomposition (the one with least deadwood). But many
// hands have SEVERAL legal closes that tie on score yet reveal different melds
// to the table — and since opponents lay off onto the closer's revealed melds,
// which set you pick is a real strategic decision. allCloseSplits returns every
// legal close decomposition so the UI can let the player choose.

// Canonical key for a split: sorted card ids across all melds, so identical
// meld sets found via different enumeration orders dedupe to one option.
function splitKey(melds) {
  return melds
    .map((m) => m.map((c) => c.id).sort().join(','))
    .sort()
    .join('|');
}

// Every legal way to close this hand: returns an array of
//   { melds: [[card...],[card...]], leftovers: [card...], score, kind }
// where kind ∈ 'chinchon' | 'clean' | 'leftover'. Empty if the hand cannot close.
function allCloseSplits(hand) {
  if (hand.length !== HAND_SIZE) return [];

  if (isChinchon(hand)) {
    return [{ melds: [hand], leftovers: [], score: 0, kind: 'chinchon' }];
  }

  const seen = new Set();
  const out = [];
  const melds = allMelds(hand);

  const consider = (meldsList) => {
    const leftovers = without(hand, meldsList.flat());
    if (leftovers.length === 0) {
      pushSplit(meldsList, leftovers, CLOSE_BONUS, 'clean');
    } else if (leftovers.length === 1) {
      const value = cardValue(leftovers[0]);
      if (value <= MAX_LEFTOVER_TO_CLOSE) pushSplit(meldsList, leftovers, value, 'leftover');
    }
  };

  const pushSplit = (meldsList, leftovers, score, kind) => {
    const key = splitKey(meldsList);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ melds: meldsList.map((m) => [...m]), leftovers: [...leftovers], score, kind });
  };

  // One meld (3..5) + the rest is leftover — only closes if exactly 1 leftover ≤5
  // or (impossible with one meld of ≤5 from 7) — handled generally below.
  // Two melds of 3+3, 3+4, 4+3, or 4+4 covering 6 or 7 cards.
  for (let i = 0; i < melds.length; i++) {
    const restAfterFirst = without(hand, melds[i]);
    // single meld closing only possible when it leaves 1 card ≤5 (i.e. 6-card meld)
    consider([melds[i]]);
    for (const second of allMelds(restAfterFirst)) {
      consider([melds[i], second]);
    }
  }

  // De-dupe identical (score,key) noise; sort best-first (lowest score wins).
  out.sort((a, b) => a.score - b.score);
  return out;
}

// Can this hand legally close the round?
//   - Two combinations covering all 7 cards, nothing left over  -> -10
//   - Two combinations of 3 + 3, one leftover card of value <= 5 -> leftover counts
//   - A chinchon (all 7 in one meld) -> wins the whole game
function canClose(hand) {
  const split = bestSplit(hand);

  if (split.chinchon) {
    return { ok: true, reason: 'chinchon', score: 0, split };
  }

  if (split.melds.length < 2) {
    return { ok: false, reason: 'needs two combinations', split };
  }

  if (split.leftovers.length === 0) {
    return { ok: true, reason: 'closed clean', score: CLOSE_BONUS, split };
  }

  if (split.leftovers.length === 1) {
    const leftover = split.leftovers[0];
    const value = cardValue(leftover);
    if (value <= MAX_LEFTOVER_TO_CLOSE) {
      return { ok: true, reason: 'closed with leftover', score: value, split };
    }
    return {
      ok: false,
      reason: `leftover ${value} exceeds ${MAX_LEFTOVER_TO_CLOSE}`,
      split,
    };
  }

  return { ok: false, reason: 'too many leftover cards', split };
}

// Score a non-closing player at the end of a round: their unmelded deadwood.
function scoreHand(hand) {
  return bestSplit(hand).deadwood;
}

module.exports = {
  HAND_SIZE,
  MAX_LEFTOVER_TO_CLOSE,
  CLOSE_BONUS,
  combinations,
  allMelds,
  isChinchon,
  bestSplit,
  allCloseSplits,
  canClose,
  scoreHand,
  splitKey,
};
