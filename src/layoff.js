'use strict';

const { isWild, cardValue } = require('./cards');
const { isValidMeld, countWilds, MAX_WILDS_PER_MELD } = require('./melds');
const { bestSplit, canClose } = require('./scoring');

// Cards in `hand` not present in `subset` (by id).
function without(cards, subset) {
  const ids = new Set(subset.map((c) => c.id));
  return cards.filter((c) => !ids.has(c.id));
}
// LAY-OFF PHASE
//
// Triggered only when a player makes a VALID close. Sequence:
//   1. Closer reveals their combinations onto the table.
//   2. Going in turn order, starting with the player immediately AFTER the
//      closer, each remaining player:
//        a. lays their own valid combinations face-up onto the table, then
//        b. attaches any leftover cards onto ANY combination on the table.
//   3. The closer gets a final chance to shed their own leftover card if a
//      gap opened up while others were laying down.
//
// Laying off is optional in the code, but every unshed card is counted, so
// a rational player always sheds everything they can.

// Can this single card be attached to an existing table meld?
function canAttach(meld, card) {
  if (isWild(card) && countWilds(meld) >= MAX_WILDS_PER_MELD) return false;
  return isValidMeld([...meld, card]);
}

// Find the first table meld that accepts this card. Returns index or -1.
function findAttachTarget(table, card) {
  for (let i = 0; i < table.length; i++) {
    if (canAttach(table[i], card)) return i;
  }
  return -1;
}

// Greedily shed as many cards as possible onto the table.
// Mutates `table` (melds grow). Returns the cards that could not be placed.
function shedOnto(table, cards) {
  const remaining = [...cards];
  let progress = true;

  // Loop until no further card can be placed: attaching one card can open a
  // gap that lets another card land (e.g. 7 then 10 bridging into 11-12).
  while (progress) {
    progress = false;
    for (let i = 0; i < remaining.length; i++) {
      const idx = findAttachTarget(table, remaining[i]);
      if (idx !== -1) {
        table[idx] = [...table[idx], remaining[i]];
        remaining.splice(i, 1);
        progress = true;
        break;
      }
    }
  }

  return remaining;
}

// Turn order starting with the player immediately after the closer.
function layoffOrder(playerCount, closerIndex, active = null) {
  if (active === null) active = Array.from({ length: playerCount }, (_, i) => i);
  const order = [];
  for (let step = 1; step < playerCount; step++) {
    const seat = (closerIndex + step) % playerCount;
    if (active.includes(seat)) order.push(seat);
  }
  return order;
}

// Resolve a whole round.
//
//   hands       array of 7-card hands, indexed by player
//   closerIndex who declared the close
//   chosenMelds (optional) the closer's PICKED decomposition. When supplied (a
//               human chose which melds to reveal), we use exactly those melds
//               for the table instead of the engine's auto bestSplit. This is a
//               real strategic choice: opponents lay off onto the closer's
//               revealed melds, so hiding vs. exposing a card matters.
function resolveRound(hands, closerIndex, active = null, chosenMelds = null) {
  const closeCheck = canClose(hands[closerIndex]);

  // FALSE CLOSE: the closer does not actually have a game.
  // Nobody is scored. Their hand is exposed and play continues.
  if (!closeCheck.ok) {
    return {
      valid: false,
      reason: closeCheck.reason,
      revealedHand: hands[closerIndex],
      closerIndex,
    };
  }

  // CHINCHON: instant win of the entire game. No lay-off, no scoring.
  if (closeCheck.reason === 'chinchon') {
    return {
      valid: true,
      chinchon: true,
      winner: closerIndex,
      closerIndex,
      table: [hands[closerIndex]],
      scores: hands.map((_, i) => (i === closerIndex ? 0 : 0)),
      gameOver: true,
    };
  }

  // Closer's combinations go on the table. Use their explicit choice if given,
  // otherwise fall back to the engine's best split.
  const melds = chosenMelds && chosenMelds.length
    ? chosenMelds.map((m) => m.map((c) => ({ ...c })))
    : closeCheck.split.melds.map((m) => [...m]);
  const closerLeftovers = chosenMelds && chosenMelds.length
    ? without(hands[closerIndex], melds.flat())
    : [...closeCheck.split.leftovers];

  const table = melds.map((m) => [...m]);

  const scores = new Array(hands.length).fill(0);
  const laidOff = new Array(hands.length).fill(null);

  // Each other player, in order after the closer.
  for (const p of layoffOrder(hands.length, closerIndex, active)) {
    const split = bestSplit(hands[p]);

    // Their own combinations go face-up, becoming available to everyone after.
    for (const meld of split.melds) table.push([...meld]);

    // Then they shed whatever leftovers they can.
    const stuck = shedOnto(table, split.leftovers);

    laidOff[p] = {
      melds: split.melds,
      shed: split.leftovers.filter((c) => !stuck.some((s) => s.id === c.id)),
      stuck,
    };
    scores[p] = stuck.reduce((sum, c) => sum + cardValue(c), 0);
  }

  // Closer's final chance to dump their leftover into a gap someone opened.
  const closerStuck = shedOnto(table, closerLeftovers);

  if (closerLeftovers.length === 0) {
    scores[closerIndex] = -10; // clean close, all seven cards used
  } else if (closerStuck.length === 0) {
    scores[closerIndex] = 0; // leftover successfully shed during lay-off
  } else {
    scores[closerIndex] = closerStuck.reduce((sum, c) => sum + cardValue(c), 0);
  }

  laidOff[closerIndex] = {
    melds,
    shed: closerLeftovers.filter((c) => !closerStuck.some((s) => s.id === c.id)),
    stuck: closerStuck,
  };

  return {
    valid: true,
    chinchon: false,
    closerIndex,
    table,
    scores,
    laidOff,
    gameOver: false,
  };
}

module.exports = {
  canAttach,
  findAttachTarget,
  shedOnto,
  layoffOrder,
  resolveRound,
};
