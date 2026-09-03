'use strict';

const { cardValue } = require('./cards');
const { isValidMeld } = require('./melds');
const { canClose, bestSplit } = require('./scoring');
const { canAttach, layoffOrder } = require('./layoff');

// INTERACTIVE LAY-OFF
//
// Same rules as the automatic resolver, but each player acts explicitly and
// must declare themselves ready before they are scored. Nothing a player
// claims is trusted: every meld is re-validated, every attach is re-checked,
// and cards are verified to actually be in that player's hand.
//
// Flow:
//   beginLayoff(hands, closerIndex)  -> state, or a rejection on a false close
//   layMeld(state, cards)            -> current player puts a combination down
//   attachCard(state, card, meldIdx) -> current player sheds one card
//   declareReady(state)              -> "count me", advances to the next player
//   state.phase === 'done'           -> state.scores is final

function hasCards(hand, cards) {
  const pool = new Map();
  for (const c of hand) pool.set(c.id, (pool.get(c.id) || 0) + 1);
  for (const c of cards) {
    const n = pool.get(c.id) || 0;
    if (n === 0) return false;
    pool.set(c.id, n - 1);
  }
  return true;
}

function removeCards(hand, cards) {
  const out = [...hand];
  for (const c of cards) {
    const i = out.findIndex((x) => x.id === c.id);
    if (i !== -1) out.splice(i, 1);
  }
  return out;
}

function beginLayoff(hands, closerIndex, active = null, chosenMelds = null) {
  const check = canClose(hands[closerIndex]);

  if (!check.ok) {
    return {
      valid: false,
      reason: check.reason,
      revealedHand: hands[closerIndex],
      closerIndex,
    };
  }

  if (check.reason === 'chinchon') {
    return {
      valid: true,
      phase: 'done',
      chinchon: true,
      winner: closerIndex,
      closerIndex,
      table: [hands[closerIndex]],
      scores: hands.map(() => 0),
      gameOver: true,
    };
  }

  // The closer's own game goes down first, validated. Use their explicit choice
  // if they picked one (from the close UI), otherwise the engine's best split.
  const melds = chosenMelds && chosenMelds.length
    ? chosenMelds.map((m) => m.map((c) => ({ ...c })))
    : check.split.melds.map((m) => [...m]);

  return {
    valid: true,
    phase: 'layoff',
    chinchon: false,
    closerIndex,
    table: melds,
    hands: hands.map((h) => [...h]),
    remaining: hands.map((h) => [...h]),
    // Closer already placed their melds on the table; their leftover waits.
    placed: hands.map((_, i) => (i === closerIndex ? melds.length : 0)),
    // Closer goes FIRST in the lay-off (they reveal their game, then everyone
    // else lays off in turn). Closer already placed their melds; their leftover
    // waits for their turn in the order.
    order: [closerIndex, ...layoffOrder(hands.length, closerIndex, active)],
    turnPointer: 0,
    ready: hands.map(() => false),
    scores: hands.map(() => null),
    gameOver: false,
    chosenMelds: chosenMelds && chosenMelds.length ? true : false,
  };
}

function currentPlayer(state) {
  if (state.phase !== 'layoff') return null;
  return state.order[state.turnPointer];
}

// Initialise a player's working set the first time they act.
function ensureWorking(state, p) {
  if (p === state.closerIndex && state.placed[p] > 0 && state.remaining[p].length === 7) {
    // Closer: their melds are already on the table, only leftovers remain.
    const check = canClose(state.hands[p]);
    state.remaining[p] = [...check.split.leftovers];
  }
}

// A player lays one of their own combinations onto the table.
function layMeld(state, cards) {
  const p = currentPlayer(state);
  if (p === null) return { ok: false, reason: 'lay-off is over' };

  ensureWorking(state, p);

  if (!hasCards(state.remaining[p], cards)) {
    return { ok: false, reason: 'you do not hold those cards' };
  }
  if (!isValidMeld(cards)) {
    return { ok: false, reason: 'that is not a valid combination' };
  }

  state.table.push([...cards]);
  state.remaining[p] = removeCards(state.remaining[p], cards);
  state.placed[p] += 1;
  return { ok: true, table: state.table };
}

// A player attaches one leftover card onto an existing table combination.
function attachCard(state, card, meldIndex) {
  const p = currentPlayer(state);
  if (p === null) return { ok: false, reason: 'lay-off is over' };

  ensureWorking(state, p);

  if (!hasCards(state.remaining[p], [card])) {
    return { ok: false, reason: 'you do not hold that card' };
  }
  const meld = state.table[meldIndex];
  if (!meld) return { ok: false, reason: 'no such combination on the table' };
  if (!canAttach(meld, card)) {
    return { ok: false, reason: 'that card does not fit that combination' };
  }

  state.table[meldIndex] = [...meld, card];
  state.remaining[p] = removeCards(state.remaining[p], [card]);
  return { ok: true, table: state.table };
}

// "I am ready to be counted." Locks the player's score and passes the turn.
function declareReady(state) {
  const p = currentPlayer(state);
  if (p === null) return { ok: false, reason: 'lay-off is over' };

  ensureWorking(state, p);

  const stuck = state.remaining[p];
  state.ready[p] = true;

  if (p === state.closerIndex) {
    const check = canClose(state.hands[p]);
    if (check.split.leftovers.length === 0) {
      state.scores[p] = -10; // clean 4+3 close
    } else {
      state.scores[p] = stuck.reduce((s, c) => s + cardValue(c), 0);
    }
  } else {
    state.scores[p] = stuck.reduce((s, c) => s + cardValue(c), 0);
  }

  state.turnPointer += 1;
  if (state.turnPointer >= state.order.length) {
    state.phase = 'done';
  }

  return { ok: true, scoredPlayer: p, score: state.scores[p], phase: state.phase };
}

// Suggest the best play for a player who does not want to sort it themselves.
// Returns the melds they should lay and the cards they can shed.
function suggest(state, p) {
  const split = bestSplit(state.remaining[p]);
  const attachable = [];
  for (const card of split.leftovers) {
    for (let i = 0; i < state.table.length; i++) {
      if (canAttach(state.table[i], card)) {
        attachable.push({ card, meldIndex: i });
        break;
      }
    }
  }
  return { melds: split.melds, attachable };
}

module.exports = {
  beginLayoff,
  currentPlayer,
  layMeld,
  attachCard,
  declareReady,
  suggest,
  hasCards,
};
