'use strict';

// Nov 3, 2026 (Dannel): "the starting hand should shift to the next player
// once a round is closed". R12 says the deal moves one seat to the left after
// every round, so the first player moves on too. The server used to re-deal
// with the SAME dealer, so the same seat started every round.

const test = require('node:test');
const assert = require('node:assert');
const turn = require('../src/turn');
const { rooms, _internals } = require('../server');

test('startNextRound passes the deal (and the first turn) one seat to the left', () => {
  let r = turn.startRound(4, Math.random);
  assert.strictEqual(r.dealer, 3);
  assert.strictEqual(r.turn, 0);
  const firsts = [r.turn];
  for (let i = 0; i < 4; i++) {
    r = turn.startNextRound(r, 4, Math.random, [0, 1, 2, 3]);
    firsts.push(r.turn);
  }
  assert.deepStrictEqual(firsts, [0, 1, 2, 3, 0]);
});

test('startNextRound skips eliminated seats for both dealer and first player', () => {
  const r0 = turn.startRound(4, Math.random, 0); // dealer 0, seat 1 starts
  const r1 = turn.startNextRound(r0, 4, Math.random, [0, 2, 3]); // seat 1 is out
  assert.strictEqual(r1.dealer, 2);
  assert.strictEqual(r1.turn, 3);
  assert.deepStrictEqual(r1.hands[1], []);
});

test('the server deals the next round with the next dealer', () => {
  rooms.clear();
  const room = _internals.createRoom({ mode: 'solo', name: 'Dannel' });
  assert.strictEqual(room.state.dealer, 2);
  assert.strictEqual(room.state.turn, 0);
  room.state.phase = 'over';
  _internals.maybeRedeal(room);
  assert.strictEqual(room.state.dealer, 0, 'deal moved one seat to the left');
  rooms.clear();
});
