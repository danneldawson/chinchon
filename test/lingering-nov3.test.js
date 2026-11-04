'use strict';

// Nov 3, 2026 (Dannel): "past games and abandoned tables and users stay
// lingering". Why: "idle" meant "no poll", and an open tab polls forever, so a
// table left open on a phone (or a results screen with a held rematch) was
// never cleared; and the lobby chat kept "Room ARMY started." lines for weeks.
// Now rooms also go after INPUT_IDLE_MS / ROOM_IDLE_MS with no real input
// (tap, key or seat action), and stale lobby system lines are pruned.

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { createServer, rooms, _internals } = require('../server');

const { CLEANUP, sweepRooms, sweepLobbyChat, runCleanup, lobbyRef } = _internals;
const MIN = 60 * 1000;
let server;
let base;

function api(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const url = new URL(base + p);
    const req = http.request({ method, hostname: url.hostname, port: url.port, path: url.pathname + url.search,
      headers: data ? { 'Content-Type': 'application/json' } : {} }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => { let json = {}; try { json = buf ? JSON.parse(buf) : {}; } catch { /* ignore */ } resolve({ status: res.statusCode, json }); });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// Tab still open (polled just now) but nobody has touched it for `ms`.
function openButUntouched(room, ms) {
  const now = Date.now();
  room.players.forEach((p) => { if (!p.isBot) { p.lastSeen = now; p.lastActive = now - ms; } });
}

async function startedMultiRoom() {
  const host = (await api('POST', '/api/room/new', { mode: 'multi', name: 'HostL', visibility: 'private', bots: 0 })).json;
  const guest = (await api('POST', '/api/room/join', { code: host.code, name: 'GuestL' })).json;
  assert.strictEqual((await api('POST', '/api/room/start', { code: host.code, seat: host.seatId })).status, 200);
  return { host, guest, room: rooms.get(host.code) };
}

test.before(async () => {
  rooms.clear();
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise((r) => server.close(r)));

test('an abandoned table left open in a tab is cleared after 30 min with no input', async () => {
  assert.strictEqual(CLEANUP.INPUT_IDLE_MS, 30 * MIN);
  const solo = (await api('POST', '/api/room/new', { mode: 'solo', name: 'OpenTab', bots: 2 })).json;
  const { host, room } = await startedMultiRoom();
  openButUntouched(rooms.get(solo.code), 29 * MIN);
  openButUntouched(room, 29 * MIN);
  sweepRooms(Date.now());
  assert.ok(rooms.has(solo.code) && rooms.has(host.code), 'kept at 29 min');
  openButUntouched(rooms.get(solo.code), 31 * MIN);
  openButUntouched(room, 31 * MIN);
  sweepRooms(Date.now());
  assert.ok(!rooms.has(solo.code), 'solo table removed although its tab still polls');
  assert.ok(!rooms.has(host.code), 'multiplayer table removed although tabs still poll');
});

test('a poll with act=1 or a seat action counts as input and keeps the table', async () => {
  const { host, guest, room } = await startedMultiRoom();
  openButUntouched(room, 31 * MIN);
  await api('GET', `/api/state?code=${host.code}&seat=${host.seatId}&act=1`);
  sweepRooms(Date.now());
  assert.ok(rooms.has(host.code), 'a tap reported with the poll keeps it');
  openButUntouched(room, 31 * MIN);
  await api('GET', `/api/state?code=${host.code}&seat=${host.seatId}`);
  assert.ok(Date.now() - room.players[0].lastActive > 30 * MIN, 'a plain poll is not input');
  await api('POST', '/api/room/chat', { code: host.code, seat: guest.seatId, text: 'hola' });
  assert.ok(Date.now() - room.players[1].lastActive < MIN, 'a seat action is input');
  sweepRooms(Date.now());
  assert.ok(rooms.has(host.code));
});

test('a finished room with a held rematch no longer lingers while a results tab is open', async () => {
  const { host, room } = await startedMultiRoom();
  room.match.gameOver = true;
  room.state.phase = 'over';
  assert.strictEqual((await api('POST', '/api/room/rematch', { code: host.code, seat: host.seatId })).status, 200);
  room.pending.hold = true;
  room.gameOverAt = Date.now() - 60 * MIN;
  openButUntouched(room, 10 * MIN);
  sweepRooms(Date.now());
  assert.ok(rooms.has(host.code), 'recent input keeps the rematch');
  openButUntouched(room, CLEANUP.ROOM_IDLE_MS + MIN);
  sweepRooms(Date.now());
  assert.ok(!rooms.has(host.code), 'held rematch nobody touches is removed');
});

test('lobby chat: lines about rooms that are gone, and old lines, are pruned', () => {
  const now = Date.now();
  rooms.clear();
  rooms.set('LIVE', { code: 'LIVE', players: [] });
  lobbyRef.chat = [
    { name: 'CHINCHON', text: 'Room ARMY started.', at: now - 29 * 24 * 60 * MIN, system: true },
    { name: 'CHINCHON', text: 'Room GONE started.', at: now - 5 * MIN, system: true, room: 'GONE' },
    { name: 'CHINCHON', text: 'Room LIVE started.', at: now - 5 * MIN, system: true, room: 'LIVE' },
    { name: 'CHINCHON', text: 'untagged old system line', at: now - 3 * 60 * MIN, system: true },
    { name: 'Ana', text: 'hola', at: now - 3 * 60 * MIN, system: false },
    { name: 'Ana', text: 'very old', at: now - 25 * 60 * MIN, system: false },
  ];
  assert.strictEqual(sweepLobbyChat(now), 4);
  assert.deepStrictEqual(lobbyRef.chat.map((m) => m.text), ['Room LIVE started.', 'hola']);
  rooms.delete('LIVE');
  const r = runCleanup(now, {}, null);
  assert.strictEqual(r.chat, 1);
  assert.deepStrictEqual(lobbyRef.chat.map((m) => m.text), ['hola']);
});

test('the client reports real input with its polls', () => {
  const APP = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(APP, /\$\{sinceQ\}\$\{actQ\('game'\)\}/);
  assert.match(APP, /\['pointerdown', 'keydown', 'touchstart'\]/);
});
