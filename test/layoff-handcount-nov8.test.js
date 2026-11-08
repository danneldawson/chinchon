'use strict';
// Nov 8, 2026 (Dannel): once a player closes and lays melds down, their seat
// must show only the cards still in hand, not 7.
const assert = require('node:assert');
const { test } = require('node:test');
const { rooms, _internals } = require('../server');
const { createRoom, serialize, seatHandCount } = _internals;

test('seat hand count follows lay-off remaining, not the pre-close hand', () => {
  const room = createRoom({ mode: 'solo', name: 'DAN' });
  const hands = room.state.hands;
  room.state.phase = 'layoff';
  const c = (rank, suit) => ({ rank, suit, deckId: 0, id: `${rank}-${suit}-0` });
  hands[1] = [c(4, 'Copas'), c(5, 'Copas'), c(6, 'Copas'), c(7, 'Copas'), c(11, 'Oros'), c(11, 'Espadas'), c(11, 'Bastos')];
  const lo = require('../src/layoff-interactive').beginLayoff(hands, 1, [0, 1, 2], null);
  assert.ok(lo.valid);
  lo.remaining[1] = [hands[1][0]]; // closer kept one card back
  lo.remaining[2] = lo.remaining[2].slice(0, 5);
  room.layoff = lo;
  assert.strictEqual(seatHandCount(room, 1), 1);
  assert.strictEqual(seatHandCount(room, 2), 5);
  assert.strictEqual(seatHandCount(room, 0), hands[0].length);
  const v = serialize(room, room.players[0].id);
  const byseat = Object.fromEntries(v.opponents.map((o) => [o.seat, o.handCount]));
  assert.strictEqual(byseat[1], 1);
  assert.strictEqual(byseat[2], 5);
  rooms.delete(room.code);
});

test('outside the lay-off the count is the live hand', () => {
  const room = createRoom({ mode: 'solo', name: 'DAN' });
  room.layoff = null;
  assert.strictEqual(seatHandCount(room, 1), room.state.hands[1].length);
  rooms.delete(room.code);
});
