'use strict';
// Nov 8, 2026 (Dannel): "show the cards that we're gonna get counted".
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { test } = require('node:test');
const L = require('../src/layoff-interactive');
const { rooms, _internals } = require('../server');
const { createRoom, serialize, continueRound, finishLayoff } = _internals;
const c = (r, s) => ({ rank: r, suit: s, deckId: 0, id: `${r}-${s}-0` });
const closer = [c(1, 'Oros'), c(2, 'Oros'), c(3, 'Oros'), c(5, 'Copas'), c(5, 'Espadas'), c(5, 'Oros'), c(4, 'Bastos')];
const bot = [c(5, 'Bastos'), c(6, 'Bastos'), c(7, 'Bastos'), c(12, 'Copas'), c(12, 'Espadas'), c(12, 'Oros'), c(2, 'Copas')];
const bot2 = [c(10, 'Copas'), c(2, 'Espadas'), c(7, 'Oros'), c(10, 'Oros'), c(4, 'Copas'), c(11, 'Bastos'), c(3, 'Espadas')];

function setup() {
  const room = createRoom({ mode: 'solo', name: 'DAN' });
  const lo = L.beginLayoff([closer, bot, bot2], 0, [0, 1, 2]);
  L.openPastCloser(lo);
  room.layoff = lo; room.state.phase = 'layoff';
  return { room, lo };
}

test('counted cards are never served before the round ends', () => {
  const { room, lo } = setup();
  let v = serialize(room, room.players[0].id);
  assert.strictEqual(v.roundReveal, null, 'during the lay-off');
  assert.ok(!JSON.stringify(v).includes('11-Bastos-0'), 'a bot card never leaks');
  L.layMeld(lo, bot.slice(0, 3)); L.layMeld(lo, bot.slice(3, 6));
  L.declareReady(lo); L.declareReady(lo);
  finishLayoff(room);
  v = serialize(room, room.players[0].id);
  assert.ok(Array.isArray(v.roundReveal));
  assert.ok(continueRound(room));
  v = serialize(room, room.players[0].id);
  assert.strictEqual(v.roundReveal, null, 'gone once the next round is dealt');
  rooms.delete(room.code);
});

test('round end shows each seat\'s leftover cards and points', () => {
  const { room, lo } = setup();
  L.layMeld(lo, bot.slice(0, 3)); L.layMeld(lo, bot.slice(3, 6));
  L.declareReady(lo); L.declareReady(lo);
  finishLayoff(room);
  const r = serialize(room, room.players[0].id).roundReveal;
  assert.deepStrictEqual(r[0].cards, [], 'closer shed the 4 de Bastos');
  assert.strictEqual(r[0].points, 0);
  assert.deepStrictEqual(r[1].cards.map((x) => x.id), ['2-Copas-0']);
  assert.strictEqual(r[1].points, 2);
  assert.strictEqual(r[2].cards.length, 7);
  assert.strictEqual(r[2].points, 46);
  rooms.delete(room.code);
});

test('revealed at game over too', () => {
  const { room, lo } = setup();
  room.match.players[2].total = 90;
  room.match.players[1].total = 100;
  L.layMeld(lo, bot.slice(0, 3)); L.layMeld(lo, bot.slice(3, 6));
  L.declareReady(lo); L.declareReady(lo);
  finishLayoff(room);
  const v = serialize(room, room.players[0].id);
  assert.ok(v.gameOver);
  assert.strictEqual(v.roundReveal[2].points, 46);
  rooms.delete(room.code);
});

test('client renders the reveal in the round-over and game-over panels', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(app, /renderReveal\(\$\('re-board'\), v\.roundReveal\)/);
  assert.match(app, /renderReveal\(\$\('go-reveal'\), v\.roundReveal\)/);
  for (const id of ['round-end', 're-board', 'btn-next-round', 'go-reveal']) assert.ok(html.includes(`id="${id}"`), id);
});
