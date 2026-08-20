'use strict';

// Simple bot policy. Draws sensibly, discards its worst card, closes when it can.
// Behavior is tuned by the bot's `skill`, passed in from the room (default 'balanced'):
//   - 'aggressive': closes on ANY legal close; grabs the discard pile whenever it
//                   builds toward a set/run (even if deadwood stays flat).
//   - 'balanced'  : closes on any legal close; draws discard only if it lowers deadwood.
//   - 'cautious'  : only closes on a chinchon or a clean -10; otherwise keeps playing.

const { cardValue, rankIndex, RANKS } = require('./cards');
const { bestSplit, canClose } = require('./scoring');
const { canAttach } = require('./layoff');
const { closeOptions, topOfDiscard } = require('./turn');

function normSkill(s) {
  return s === 'aggressive' || s === 'cautious' ? s : 'balanced';
}

// Would taking this card improve the hand (lower deadwood)?
function improvesHand(hand, card) {
  const before = bestSplit(hand).deadwood;
  const after = bestSplit([...hand, card]).deadwood;
  return after < before;
}

// Does this card build toward a set/run with the hand even if it doesn't drop
// deadwood? Set = same rank; run = adjacent rank (cyclic: 12 next to 1) same suit.
function buildsToward(hand, card) {
  const ri = rankIndex(card.rank);
  const len = RANKS.length;
  for (const h of hand) {
    if (h.rank === card.rank) return true;                 // potential set
    if (h.suit === card.suit) {
      const d = Math.abs(rankIndex(h.rank) - ri);
      const cycled = Math.min(d, len - d);                 // wrap 11-12-1
      if (cycled === 1 || cycled === 2) return true;       // run neighbor
    }
  }
  return false;
}

// Decide draw source.
function chooseDraw(state, skill) {
  skill = normSkill(skill);
  const top = topOfDiscard(state);
  if (!top) return 'stock';
  if (skill === 'aggressive') {
    return (improvesHand(state.hands[state.turn], top) || buildsToward(state.hands[state.turn], top))
      ? 'discard' : 'stock';
  }
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

// Should this bot close, given its skill?
function shouldClose(state, skill, opts) {
  skill = normSkill(skill);
  if (opts.length === 0) return null;
  const chinchon = opts.find((o) => o.reason === 'chinchon');
  const clean = opts.find((o) => o.score === -10);
  if (skill === 'cautious') {
    // Cautious: don't snipe a marginal leftover early, but still close on a
    // genuinely good hand. Takes a chinchon, a clean -10, or any leftover close
    // of 5 or fewer. And once the stock is nearly empty the round must end, so
    // any legal close is fine then.
    const stockLow = state.stock && state.stock.length <= 8;
    if (chinchon) return chinchon;
    if (clean) return clean;
    const good = opts.filter((o) => o.score <= 5).sort((a, b) => a.score - b.score)[0];
    if (good) return good;
    if (stockLow) return opts.reduce((a, b) => (a.score <= b.score ? a : b));
    return null;
  }
  // aggressive + balanced: close on anything, preferring chinchon then clean.
  if (chinchon) return chinchon;
  if (clean) return clean;
  return opts.reduce((a, b) => (a.score <= b.score ? a : b));
}

// Full turn decision. Returns { close: bool, card }.
function chooseTurn(state, skill) {
  skill = normSkill(skill);
  const opts = closeOptions(state);
  const pick = shouldClose(state, skill, opts);
  if (pick) return { close: true, card: pick.discard };
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
  shouldClose,
  planLayoff,
  findAttach,
};

