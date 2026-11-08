'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('node:assert');
const { test } = require('node:test');
const { rooms, _internals } = require('../server');
const { createRoom, serialize, roomChatEnabled } = _internals;

test('solo vs bots: chat flag is off', () => {
  const room = createRoom({ mode: 'solo', name: 'DAN' });
  assert.strictEqual(roomChatEnabled(room), false);
  assert.strictEqual(serialize(room, room.players[0].id).chatEnabled, false);
  rooms.delete(room.code);
});

test('tutorial vs bots: chat flag is off', () => {
  const room = createRoom({ mode: 'solo', name: 'DAN', tutorial: true });
  assert.strictEqual(serialize(room, room.players[0].id).chatEnabled, false);
  rooms.delete(room.code);
});

test('another human seated: chat on; joining mid-game turns it on', () => {
  const room = createRoom({ mode: 'multi', name: 'A', countdownMs: 60000 });
  assert.strictEqual(roomChatEnabled(room), false);
  room.players.push({ id: 'b', name: 'B', seat: 1, isBot: false, connected: true, lastSeen: Date.now() });
  assert.strictEqual(roomChatEnabled(room), true);
  assert.strictEqual(serialize(room, room.players[0].id).chatEnabled, true);
  rooms.delete(room.code);
});

test('client hides bubble and badge when chatEnabled is false', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const fn = app.slice(app.indexOf('function renderChat(v)'), app.indexOf("box.classList.remove('hidden')", app.indexOf('function renderChat(v)')));
  assert.match(fn, /v\.chatEnabled === false/);
  assert.match(fn, /bubble\.classList\.add\('hidden'\)/);
  assert.match(fn, /chat-badge'\)\.classList\.add\('hidden'\)/);
});
