'use strict';

// Nov 3, 2026 (Dannel): "'room code' as a concept shouldn't travel past the
// waiting room, after that just leave as room name for the sake of giving the
// room a tag". The lobby, join box and waiting room still say "Room code";
// the in-game tag says "Room: XXXX" / "Sala: XXXX".

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const APP = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('in-game room tag uses the room-name label in both languages', () => {
  assert.match(APP, /roomNameLabel: 'Room:'/);
  assert.match(APP, /roomNameLabel: 'Sala:'/);
  assert.match(APP, /\$\('room-code-tag'\)\.textContent = v\.code \? `\$\{t\('roomNameLabel'\)\} \$\{v\.code\}`/);
  assert.doesNotMatch(APP, /roomCodeLabel/, 'the old in-game "Room code" label is gone');
});

test('the in-game, round-end and game-over markup never says room code', () => {
  const game = HTML.slice(HTML.indexOf('id="room-code-tag"') - 200);
  assert.doesNotMatch(game, /room code|c[oó]digo de sala/i);
});

test('the waiting room and join box still say room code (join unchanged)', () => {
  assert.match(APP, /roomCode: 'Room code:'/);
  // Stays "Codigo": the UI carries no accented o by Dannel's standing request
  // (encoding safety, test/server.test.js). It only shows in the waiting room.
  assert.match(APP, /roomCode: 'Codigo de sala:'/);
  assert.match(HTML, /<label>Room code/);
});

// Nov 3, 2026: Dannel's iPad (Spanish) still showed "Codigo de sala WAKE" in
// the game header on the live build. In game the Spanish tag is "Sala: WAKE".
test('Spanish in-game header reads "Sala: <code>", never "Código de sala"', () => {
  assert.match(APP, /roomNameLabel: 'Sala:'/);
  assert.match(APP, /\$\('room-code-tag'\)\.textContent = v\.code \? `\$\{t\('roomNameLabel'\)\} \$\{v\.code\}`/);
});
