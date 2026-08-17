'use strict';

const { resolveRound } = require('./layoff');

const ELIMINATION_SCORE = 101;
const MIN_SCORE = -50; // totals can dip negative via clean closes, but never below this
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 7;

// A player is out at 101 or more. Exactly 100 survives. No buyback.
function isEliminated(total) {
  return total >= ELIMINATION_SCORE;
}

function createMatch(playerNames) {
  if (playerNames.length < MIN_PLAYERS || playerNames.length > MAX_PLAYERS) {
    throw new Error(`Chinchon takes ${MIN_PLAYERS} to ${MAX_PLAYERS} players`);
  }
  return {
    players: playerNames.map((name) => ({ name, total: 0, out: false })),
    round: 0,
    winner: null,
    gameOver: false,
  };
}

function activePlayers(match) {
  return match.players.filter((p) => !p.out);
}

// Apply one resolved round's scores to the match totals.
function applyRound(match, roundResult) {
  match.round += 1;

  // Chinchon ends the match outright, whatever the scores are.
  if (roundResult.chinchon) {
    match.winner = roundResult.winner;
    match.gameOver = true;
    return match;
  }

  roundResult.scores.forEach((score, i) => {
    if (match.players[i].out) return;
    match.players[i].total = Math.max(MIN_SCORE, match.players[i].total + score);
    // (Scores can go negative via -10 clean closes; floor at MIN_SCORE = -50.)
    if (isEliminated(match.players[i].total)) {
      match.players[i].out = true;
    }
  });

  const remaining = activePlayers(match);
  if (remaining.length === 1) {
    match.winner = match.players.indexOf(remaining[0]);
    match.gameOver = true;
  } else if (remaining.length === 0) {
    // Everyone busted in the same round: lowest total wins.
    const best = match.players.reduce((a, b) => (a.total <= b.total ? a : b));
    match.winner = match.players.indexOf(best);
    match.gameOver = true;
  }

  return match;
}

// Convenience: resolve a round from hands and immediately apply it.
function playRound(match, hands, closerIndex) {
  const active = match.players.map((p, i) => i).filter((i) => !match.players[i].out);
  const result = resolveRound(hands, closerIndex, active);
  if (!result.valid) return { match, result }; // false close, nothing applied
  applyRound(match, result);
  return { match, result };
}

module.exports = {
  ELIMINATION_SCORE,
  MIN_PLAYERS,
  MAX_PLAYERS,
  isEliminated,
  createMatch,
  activePlayers,
  applyRound,
  playRound,
};
