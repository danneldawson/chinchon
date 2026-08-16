'use strict';

const { buildDeck, shuffle } = require('./cards');
const { canClose } = require('./scoring');

// TURN ENGINE
//
// One round of Chinchon. Each turn is strictly two actions:
//   1. DRAW  — take the top of the stock, or the top of the discard pile
//   2. DISCARD — put one card down, which may also declare a close
//
// You hold 7 cards. After drawing you hold 8. You must discard back to 7.
// Closing is checked on the 7 cards you keep, not the 8 you held.

const HAND_SIZE = 7;

// Return the next seat clockwise (starting one step after `from`) that is in
// `active`. Falls back to `from` if no other active seat exists.
function nextActiveFrom(active, from, n) {
  for (let step = 1; step <= n; step++) {
    const seat = (from + step) % n;
    if (active.includes(seat)) return seat;
  }
  return from;
}

// Next seat that still takes a turn after `state.turn`.
function nextActiveTurn(state) {
  return nextActiveFrom(state.active, state.turn, state.hands.length);
}

// Start a fresh round. `active` is the list of seat indices still in the game;
// eliminated seats get an empty hand and are skipped by the deal and the turns.
function startRound(playerCount, rng = Math.random, dealer = null, active = null) {
  if (playerCount < 2 || playerCount > 7) {
    throw new Error('Chinchon takes 2 to 7 players');
  }

  if (active === null) {
    active = Array.from({ length: playerCount }, (_, i) => i);
  }
  if (!active.length) {
    throw new Error('a round needs at least one active player');
  }

  const deck = shuffle(buildDeck(), rng);

  // The dealer deals to their left first and plays LAST.
  // Default dealer is the last seat, so player 0 leads the first round.
  // Dealer and first-to-play both skip any eliminated seat.
  let dealerIndex = dealer === null ? playerCount - 1 : dealer % playerCount;
  if (!active.includes(dealerIndex)) {
    dealerIndex = nextActiveFrom(active, dealerIndex, playerCount);
  }
  const firstToPlay = nextActiveFrom(active, dealerIndex, playerCount);

  const hands = new Array(playerCount);
  for (let seat = 0; seat < playerCount; seat++) {
    hands[seat] = active.includes(seat) ? deck.splice(0, HAND_SIZE) : [];
  }

  // One card is turned face up beside the stock. Anyone may take it.
  const discard = [deck.pop()];

  return {
    hands,
    stock: deck,
    discard,
    dealer: dealerIndex,
    turn: firstToPlay,
    active,
    phase: 'draw',    // 'draw' | 'discard' | 'closed' | 'over'
    closerIndex: null,
    lastDrawn: null,
  };
}

// The deal passes to the left after every round, skipping eliminated players.
function nextDealer(state) {
  return nextActiveFrom(state.active, state.dealer, state.hands.length);
}

function topOfDiscard(state) {
  return state.discard[state.discard.length - 1] || null;
}

// If the stock runs dry, turn the discard pile back over and reshuffle,
// keeping the visible top card in place.
function replenishStock(state, rng = Math.random) {
  if (state.stock.length > 0) return false;
  if (state.discard.length <= 1) return false;

  const top = state.discard.pop();
  state.stock = shuffle(state.discard, rng);
  state.discard = [top];
  return true;
}

function drawFromStock(state, rng = Math.random) {
  if (state.phase !== 'draw') return { ok: false, reason: 'not the draw phase' };

  const reshuffled = replenishStock(state, rng);
  if (state.stock.length === 0) {
    // Truly out of cards: the round ends with nobody closing.
    state.phase = 'over';
    return { ok: false, reason: 'stock exhausted', roundOver: true };
  }

  const card = state.stock.pop();
  state.hands[state.turn].push(card);
  state.lastDrawn = card;
  state.phase = 'discard';
  return { ok: true, card, reshuffled };
}

function drawFromDiscard(state) {
  if (state.phase !== 'draw') return { ok: false, reason: 'not the draw phase' };

  const card = state.discard.pop();
  if (!card) return { ok: false, reason: 'discard pile is empty' };

  state.hands[state.turn].push(card);
  state.lastDrawn = card;
  state.phase = 'discard';
  return { ok: true, card };
}

// Discard one card. Set declareClose to attempt to end the round.
function discardCard(state, card, declareClose = false) {
  if (state.phase !== 'discard') return { ok: false, reason: 'not the discard phase' };

  const hand = state.hands[state.turn];
  const idx = hand.findIndex((x) => x.id === card.id);
  if (idx === -1) return { ok: false, reason: 'you do not hold that card' };

  // Any card may be discarded, including one just taken from the pile.
  // The 7 cards kept are what count for closing.
  const kept = [...hand.slice(0, idx), ...hand.slice(idx + 1)];

  if (declareClose) {
    const check = canClose(kept);
    if (!check.ok) {
      // FALSE CLOSE: hand is exposed, nobody scores, play continues.
      const closer = state.turn;
      state.hands[closer] = kept;
      state.discard.push(card);
      state.lastDrawn = null;
      state.phase = 'draw';
      state.turn = nextActiveTurn(state);
      return {
        ok: true,
        falseClose: true,
        reason: check.reason,
        revealedHand: kept,
        revealedBy: closer,
      };
    }

    state.hands[state.turn] = kept;
    state.discard.push(card);
    state.closerIndex = state.turn;
    state.phase = 'closed';
    return { ok: true, closed: true, closerIndex: state.turn, check };
  }

  state.hands[state.turn] = kept;
  state.discard.push(card);
  state.lastDrawn = null;
  state.phase = 'draw';
  state.turn = nextActiveTurn(state);
  return { ok: true, nextPlayer: state.turn };
}

// Could the current player close if they discarded this card?
function closeOptions(state) {
  const hand = state.hands[state.turn];
  if (state.phase !== 'discard') return [];

  const options = [];
  for (let i = 0; i < hand.length; i++) {
    const kept = [...hand.slice(0, i), ...hand.slice(i + 1)];
    const check = canClose(kept);
    if (check.ok) options.push({ discard: hand[i], reason: check.reason, score: check.score });
  }
  return options;
}

module.exports = {
  HAND_SIZE,
  startRound,
  topOfDiscard,
  replenishStock,
  nextDealer,
  drawFromStock,
  drawFromDiscard,
  discardCard,
  closeOptions,
};
