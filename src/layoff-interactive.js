'use strict';

const { cardValue } = require('./cards');
const { isValidMeld, orderRun } = require('./melds');
const { canClose, bestSplit, validateDeclaredClose, CLOSE_BONUS } = require('./scoring');
const { canAttach, layoffOrder } = require('./layoff');

// INTERACTIVE LAY-OFF
//
// Same rules as the automatic resolver, but each player acts explicitly and
// must declare themselves ready before they are scored. Nothing a player
// claims is trusted: every meld is re-validated, every attach is re-checked,
// and cards are verified to actually be in that player's hand.
//
// Flow:
//   beginLayoff(hands, closerIndex, active, declared) -> state, or a rejection
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

// `declared` is the closer's own declaration (Oct 8, 2026: the closer lays their
// groups face up). It is either the verdict of scoring.validateDeclaredClose()
// ({ ok, kind, melds, leftovers }) or a plain array of melds. Its melds go on the
// table exactly as declared and the closer's leftover is whatever they did NOT
// declare -- never the engine's own split. Without a declaration (bots) the
// engine's best split is used.
function beginLayoff(hands, closerIndex, active = null, declared = null) {
  const closerHand = hands[closerIndex];
  let verdict = null;
  if (Array.isArray(declared) && declared.length) {
    verdict = validateDeclaredClose(closerHand, declared);
  } else if (declared && Array.isArray(declared.melds)) {
    verdict = declared.ok === false ? declared : validateDeclaredClose(closerHand, declared.melds);
  }

  let melds;
  let leftovers;
  let chinchon;
  if (verdict) {
    if (!verdict.ok) {
      return { valid: false, reason: verdict.reason, revealedHand: closerHand, closerIndex };
    }
    chinchon = verdict.kind === 'chinchon';
    melds = verdict.melds.map((m) => orderRun(m.map((c) => ({ ...c }))));
    leftovers = [...verdict.leftovers];
  } else {
    const check = canClose(closerHand);
    if (!check.ok) {
      return {
        valid: false,
        reason: check.reason,
        revealedHand: closerHand,
        closerIndex,
      };
    }
    chinchon = check.reason === 'chinchon';
    melds = chinchon ? [closerHand] : check.split.melds.map((m) => [...m]);
    leftovers = chinchon ? [] : [...check.split.leftovers];
  }

  if (chinchon) {
    return {
      valid: true,
      phase: 'done',
      chinchon: true,
      winner: closerIndex,
      closerIndex,
      table: [closerHand],
      owners: [closerIndex],
      scores: hands.map(() => 0),
      gameOver: true,
    };
  }

  return {
    valid: true,
    phase: 'layoff',
    chinchon: false,
    closerIndex,
    table: melds,
    // Seat that laid each table meld (parallel to `table`), for the felt view.
    owners: melds.map(() => closerIndex),
    hands: hands.map((h) => [...h]),
    // Cards still in each hand. The closer's melds are already on the table,
    // so they hold only what they did not declare.
    remaining: hands.map((h, i) => (i === closerIndex ? [...leftovers] : [...h])),
    // The closer's leftover is fixed by what they declared (or the engine split
    // for bots); none at all means a clean close (-10).
    closerLeftovers: leftovers,
    // Closer already placed their melds on the table; their leftover waits.
    placed: hands.map((_, i) => (i === closerIndex ? melds.length : 0)),
    // The rotation STARTS at the closer (their game is already face up) and goes
    // round the table, WRAPPING, until every active player has declared ready.
    // The wrap is the closer's last word: the leftover that did not fit when
    // they laid their game may fit once the others have laid theirs — and a card
    // they shed can open the way for a player later in the order.
    order: [closerIndex, ...layoffOrder(hands.length, closerIndex, active)],
    turnPointer: 0,
    ready: hands.map(() => false),
    scores: hands.map(() => null),
    gameOver: false,
    declared: !!verdict,
  };
}

function currentPlayer(state) {
  if (state.phase !== 'layoff') return null;
  const seat = state.order[state.turnPointer];
  return seat === undefined ? null : seat;
}

// Move on to the next player who has NOT declared ready, wrapping around the
// table. The lay-off only ends when every active player is ready, so the order
// keeps returning to anyone holding their turn open (see passTurn).
function advance(state) {
  const n = state.order.length;
  for (let step = 1; step <= n; step++) {
    const i = (state.turnPointer + step) % n;
    if (!state.ready[state.order[i]]) {
      state.turnPointer = i;
      return state.order[i];
    }
  }
  state.phase = 'done';
  return null;
}

// The closer's leftover as fixed at the close. (A lay-off restored from a save
// made before Oct 8, 2026 has no closerLeftovers; fall back to the engine split.)
function closerLeftoversOf(state) {
  if (Array.isArray(state.closerLeftovers)) return state.closerLeftovers;
  return canClose(state.hands[state.closerIndex]).split.leftovers;
}

// Initialise a player's working set the first time they act.
function ensureWorking(state, p) {
  if (p === state.closerIndex && state.placed[p] > 0 && state.remaining[p].length === 7) {
    // Closer: their declared melds are already on the table; only the cards
    // they did not declare remain (never re-derived from the engine's split).
    state.remaining[p] = [...closerLeftoversOf(state)];
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

  state.table.push(orderRun(cards));
  if (Array.isArray(state.owners)) state.owners.push(p);
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

  state.table[meldIndex] = orderRun([...meld, card]);
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
    if (closerLeftoversOf(state).length === 0) {
      state.scores[p] = CLOSE_BONUS; // clean close: nothing left over
    } else {
      state.scores[p] = stuck.reduce((s, c) => s + cardValue(c), 0);
    }
  } else {
    state.scores[p] = stuck.reduce((s, c) => s + cardValue(c), 0);
  }

  advance(state);

  return { ok: true, scoredPlayer: p, score: state.scores[p], phase: state.phase };
}

// End your turn WITHOUT being counted. You stay in the rotation, so a card that
// does not fit yet may still fit once someone else lays theirs down.
function passTurn(state) {
  const p = currentPlayer(state);
  if (p === null) return { ok: false, reason: 'lay-off is over' };
  advance(state);
  return { ok: true, passed: p, phase: state.phase };
}

// Engine helper for the terminal client (play.js): the best play for a player.
// The browser game does NOT use it -- the Suggest button and its /api route
// were removed on Oct 8, 2026 (no hints).
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
  advance,
  layMeld,
  attachCard,
  declareReady,
  passTurn,
  suggest,
  hasCards,
};
