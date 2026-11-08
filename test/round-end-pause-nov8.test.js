'use strict';
// Nov 8, 2026 (Dannel): closing vs bots, the round ended the instant he laid
// his melds. Now: bots lay their melds, the closer's leftover is shed onto
// any open meld that fits (R44/R29), and the round pauses until Next round.
const assert = require('node:assert');
const { test } = require('node:test');
const L = require('../src/layoff-interactive');
const { rooms, _internals } = require('../server');
const { createRoom, serialize, continueRound, finishLayoff } = _internals;
const c = (r, s) => ({ rank: r, suit: s, deckId: 0, id: `${r}-${s}-0` });
const closer = [c(1, 'Oros'), c(2, 'Oros'), c(3, 'Oros'), c(5, 'Copas'), c(5, 'Espadas'), c(5, 'Oros'), c(4, 'Bastos')];
const bot = [c(5, 'Bastos'), c(6, 'Bastos'), c(7, 'Bastos'), c(12, 'Copas'), c(12, 'Espadas'), c(12, 'Oros'), c(2, 'Copas')];
const bot2 = [c(10, 'Copas'), c(2, 'Espadas'), c(7, 'Oros'), c(10, 'Oros'), c(4, 'Copas'), c(11, 'Bastos'), c(3, 'Espadas')];

function closedRound() {
  const lo = L.beginLayoff([closer, bot, bot2], 0, [0, 1, 2]);
  L.openPastCloser(lo);
  L.layMeld(lo, bot.slice(0, 3)); L.layMeld(lo, bot.slice(3, 6));
  L.declareReady(lo); L.declareReady(lo);
  return lo;
}

test('engine: closer leftover attaches to a meld a bot laid after the close', () => {
  const lo = closedRound();
  assert.strictEqual(lo.phase, 'done');
  assert.strictEqual(lo.scores[0], 0, 'the 4 de Bastos went onto the bot 5-6-7');
  assert.strictEqual(lo.closerAuto.shed[0].card.id, '4-Bastos-0');
});

test('server: finished round pauses on roundEnd with the melds shown; Next round deals', () => {
  const room = createRoom({ mode: 'solo', name: 'DAN' });
  room.layoff = closedRound();
  room.state.phase = 'layoff';
  const before = room.match.round;
  finishLayoff(room);
  assert.strictEqual(room.state.phase, 'roundEnd');
  assert.strictEqual(room.match.round, before + 1);
  const v = serialize(room, room.players[0].id);
  assert.strictEqual(v.roundEnd, true);
  assert.strictEqual(v.canContinueRound, true);
  assert.ok(v.finalTable && v.finalTable.table.length === 4, 'closer 2 + bot 2 melds on the felt');
  assert.strictEqual(v.isYourTurn, false);
  assert.ok(continueRound(room));
  assert.notStrictEqual(room.state.phase, 'roundEnd');
  assert.strictEqual(continueRound(room), false, 'double tap is harmless');
  rooms.delete(room.code);
});

test('server: no pause when no human is still in (eliminated solo human)', () => {
  const room = createRoom({ mode: 'solo', name: 'DAN' });
  room.match.players[0].out = true; room.match.players[0].total = 110;
  const lo = L.beginLayoff([[], bot, bot2], 1, [1, 2]);
  room.layoff = lo; room.state.phase = 'layoff';
  if (lo.valid && lo.phase === 'layoff') { L.openPastCloser(lo); while (lo.phase === 'layoff') L.declareReady(lo); }
  if (lo.phase === 'done') {
    finishLayoff(room);
    assert.notStrictEqual(room.state.phase, 'roundEnd');
  }
  rooms.delete(room.code);
});
