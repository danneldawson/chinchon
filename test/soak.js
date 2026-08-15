'use strict';

// Soak test: play many complete matches with random-but-legal decisions and
// assert that nothing ever crashes, no cards are lost, and every match ends.

const {
  startRound, drawFromStock, drawFromDiscard, discardCard, closeOptions,
} = require('../src/turn');
const { resolveRound } = require('../src/layoff');
const { createMatch, applyRound } = require('../src/match');

function mulberry32(seed) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cardTotal(state) {
  return state.stock.length + state.discard.length + state.hands.flat().length;
}

function playRound(playerCount, rng) {
  const state = startRound(playerCount, rng);
  let guard = 0;

  while (state.phase !== 'closed' && state.phase !== 'over' && guard < 2000) {
    guard += 1;

    if (cardTotal(state) !== 80) {
      throw new Error(`card leak: ${cardTotal(state)} cards in play`);
    }

    // Draw: sometimes from the discard pile.
    if (rng() < 0.3) {
      const res = drawFromDiscard(state);
      if (!res.ok) drawFromStock(state, rng);
    } else {
      drawFromStock(state, rng);
    }

    if (state.phase !== 'discard') break;

    const opts = closeOptions(state);
    if (opts.length > 0 && rng() < 0.7) {
      discardCard(state, opts[0].discard, true);
      continue;
    }

    // Occasionally attempt an illegal close to exercise the false-close path.
    const hand = state.hands[state.turn];
    const pick = hand[Math.floor(rng() * hand.length)];
    const bluff = rng() < 0.05;
    const res = discardCard(state, pick, bluff);
    if (!res.ok) throw new Error(`stuck turn: ${res.reason}`);
  }

  if (guard >= 2000) throw new Error('round did not terminate');
  return state;
}

function playMatch(playerCount, rng) {
  const names = Array.from({ length: playerCount }, (_, i) => `P${i}`);
  const match = createMatch(names);
  let rounds = 0;

  while (!match.gameOver && rounds < 300) {
    rounds += 1;
    const state = playRound(playerCount, rng);

    if (state.phase !== 'closed') continue; // stock ran out, redeal

    const result = resolveRound(state.hands, state.closerIndex);
    if (!result.valid) continue;
    applyRound(match, result);
  }

  if (rounds >= 300) throw new Error('match did not terminate');
  return { match, rounds };
}

// ---------------------------------------------------------------- run

const GAMES = 500;
let totalRounds = 0;
let chinchones = 0;
const winners = new Map();

for (let i = 0; i < GAMES; i++) {
  const rng = mulberry32(i + 1);
  const playerCount = 2 + (i % 6); // cycles 2..7
  const { match, rounds } = playMatch(playerCount, rng);

  if (match.winner === null) throw new Error(`game ${i} ended with no winner`);
  totalRounds += rounds;
  winners.set(playerCount, (winners.get(playerCount) || 0) + 1);
}

console.log(`✔ ${GAMES} complete matches played, 2-7 players`);
console.log(`✔ ${totalRounds} rounds total, avg ${(totalRounds / GAMES).toFixed(1)} per match`);
console.log('✔ no crashes, no card leaks, no infinite rounds');
console.log('✔ every match produced exactly one winner');
console.log(`✔ matches by player count: ${[...winners.entries()].sort().map(([k, v]) => `${k}p:${v}`).join('  ')}`);
