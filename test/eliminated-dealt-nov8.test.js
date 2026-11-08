'use strict';
// Nov 8, 2026: Dannel was OUT on 119 in a solo bot game yet was dealt the next
// round and given the turn. Elimination lives on match.players[i].out; the
// server read room.players[i].out (always undefined) when redealing.
const assert = require('node:assert');
const { test } = require('node:test');
const { rooms, _internals } = require('../server');
const { createRoom, maybeRedeal, serialize } = _internals;

function knockOut(room, seat, total = 119) {
  room.match.players[seat].total = total;
  room.match.players[seat].out = true;
  room.match.eliminatedOrder.push(seat);
  room.state.phase = 'over';
}
function cleanup(room) { rooms.delete(room.code); }

for (const prevDealer of [0, 1, 2]) {
  test(`solo: eliminated human gets no cards and no turn (prev dealer ${prevDealer})`, () => {
    const room = createRoom({ mode: 'solo', name: 'DAN' });
    knockOut(room, 0);
    room.state.dealer = prevDealer; // covers human as would-be dealer and first to play
    maybeRedeal(room);
    // bots may play on (even to the end); the human must never be dealt in
    assert.strictEqual(room.state.hands[0].length, 0);
    assert.notStrictEqual(room.state.dealer, 0);
    if (room.state.active) assert.ok(!room.state.active.includes(0));
    // bots play through; turn never lands on the human
    assert.notStrictEqual(room.state.turn, 0);
    const v = serialize(room, room.players[0].id);
    assert.ok(v);
    cleanup(room);
  });
}

test('multiplayer: eliminated human seat skipped as dealer and first player', () => {
  const room = createRoom({ mode: 'multi', name: 'A', countdownMs: 60000 });
  room.players.push({ id: 'b', name: 'B', seat: 1, isBot: false, connected: true, lastSeen: Date.now() });
  room.players.push({ id: 'c', name: 'C', seat: 2, isBot: false, connected: true, lastSeen: Date.now() });
  const matchMod = require('../src/match');
  const turn = require('../src/turn');
  room.match = matchMod.createMatch(['A', 'B', 'C']);
  room.state = turn.startRound(3, Math.random, 2);
  room.started = true; room.pending = null;
  knockOut(room, 0); // A would deal next is 0, first to play would be 1
  room.state.dealer = 2;
  maybeRedeal(room);
  assert.strictEqual(room.state.hands[0].length, 0);
  assert.strictEqual(room.state.dealer, 1);
  assert.strictEqual(room.state.turn, 2);
  assert.strictEqual(room.state.hands[1].length, 7);
  cleanup(room);
});

test('game ends when only one player remains (no redeal)', () => {
  const room = createRoom({ mode: 'solo', name: 'DAN' });
  room.state.phase = 'over';
  const matchMod = require('../src/match');
  room.match.players[0].total = 95; room.match.players[2].total = 99;
  matchMod.applyRound(room.match, { valid: true, chinchon: false, scores: [10, 0, 5] });
  maybeRedeal(room);
  assert.strictEqual(room.match.gameOver, true);
  assert.strictEqual(room.match.winner, 1);
  assert.strictEqual(room.state.phase, 'over');
  cleanup(room);
});
