'use strict';

// End-to-end checks for the six request types that had no test before the
// Oct 29 cleanup (lobby leave/rejoin, room by-seat, join-rematch, room rejoin,
// tutorial ack), so later refactors of the server routes are safe. These pin
// TODAY's answers, including the quirks (rejoin answers 200 {success:false}).

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { createServer, rooms, _internals } = require('../server');

let server;
let port;

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ method, hostname: '127.0.0.1', port, path, headers: data ? { 'Content-Type': 'application/json' } : {} }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => { let json = {}; try { json = JSON.parse(buf); } catch { /* keep {} */ } resolve({ status: res.statusCode, json }); });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
const post = (p, b) => api('POST', p, b);

test.before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  port = server.address().port;
});
test.after(() => { if (server) server.close(); });

test('POST /api/lobby/leave drops the member, and leaving twice is still ok', async () => {
  const e = await post('/api/lobby/enter', { name: 'Leaver' });
  assert.strictEqual(e.status, 200);
  assert.ok(_internals.lobbyRef.members.has(e.json.token));
  const l = await post('/api/lobby/leave', { token: e.json.token });
  assert.deepStrictEqual([l.status, l.json], [200, { ok: true }]);
  assert.ok(!_internals.lobbyRef.members.has(e.json.token), 'member removed');
  const again = await post('/api/lobby/leave', { token: e.json.token });
  assert.deepStrictEqual([again.status, again.json], [200, { ok: true }]);
});

// Note: no client calls this today, and /api/lobby/enter does not hand out the
// lobbyCode, so the test reads it from the server's lobby map.
const lobbyCodeOf = (token) => _internals.lobbyRef.members.get(token).lobbyCode;

test('POST /api/lobby/rejoin finds the active game for a lobby SeatID', async () => {
  const e = await post('/api/lobby/enter', { name: 'Rejoiner' });
  e.json.lobbyCode = lobbyCodeOf(e.json.token);
  const r = await post('/api/room/new', { mode: 'solo', name: 'Rejoiner', bots: 1, lobbyToken: e.json.token });
  assert.strictEqual(r.status, 200);
  const ok = await post('/api/lobby/rejoin', { lobbyCode: e.json.lobbyCode });
  assert.strictEqual(ok.status, 200);
  assert.deepStrictEqual(ok.json, { code: r.json.code, seatId: r.json.seatId, name: e.json.name, rejoined: true });
  const missing = await post('/api/lobby/rejoin', {});
  assert.deepStrictEqual([missing.status, missing.json.error], [400, 'SeatID required']);
  const unknown = await post('/api/lobby/rejoin', { lobbyCode: 'nope' });
  assert.deepStrictEqual([unknown.status, unknown.json.error], [404, 'no such SeatID']);
});

test('GET /api/room/by-seat finds a human seat, 404 for unknown, 400 for missing', async () => {
  const r = await post('/api/room/new', { mode: 'solo', name: 'Seeker', bots: 1 });
  const found = await api('GET', `/api/room/by-seat?seat=${r.json.seatId}`);
  assert.strictEqual(found.status, 200);
  assert.deepStrictEqual(found.json, { code: r.json.code, seatId: r.json.seatId, name: 'Seeker', started: true });
  const bot = rooms.get(r.json.code).players.find((p) => p.isBot);
  assert.strictEqual((await api('GET', `/api/room/by-seat?seat=${bot.id}`)).status, 404, 'bot seats are never handed out');
  assert.strictEqual((await api('GET', '/api/room/by-seat?seat=nope')).status, 404);
  assert.strictEqual((await api('GET', '/api/room/by-seat')).status, 400);
});

test('POST /api/room/join-rematch adds a seat only while a rematch is pending', async () => {
  const r = await post('/api/room/new', { mode: 'solo', name: 'Host', bots: 1 });
  const code = r.json.code;
  assert.strictEqual((await post('/api/room/join-rematch', { code: 'ZZZZ', name: 'Lena' })).status, 404);
  const early = await post('/api/room/join-rematch', { code, name: 'Lena' });
  assert.deepStrictEqual([early.status, early.json.error], [403, 'no rematch pending']);
  rooms.get(code).match.gameOver = true; // end the match so a rematch can be called
  const rm = await post('/api/room/rematch', { code, seat: r.json.seatId });
  assert.strictEqual(rm.status, 200);
  const before = rooms.get(code).players.length;
  const j = await post('/api/room/join-rematch', { code, name: 'Lena' });
  assert.strictEqual(j.status, 200);
  assert.strictEqual(j.json.code, code);
  assert.ok(j.json.seatId && j.json.sessionToken);
  const room = rooms.get(code);
  assert.strictEqual(room.players.length, before + 1);
  const seat = room.players.find((p) => p.id === j.json.seatId);
  assert.deepStrictEqual([seat.name, seat.isBot], ['Lena', false]);
});

test('POST /api/room/rejoin rotates the seat token, and answers success:false otherwise', async () => {
  const r = await post('/api/room/new', { mode: 'solo', name: 'Phone', bots: 1 });
  const room = rooms.get(r.json.code);
  const seat = room.players.find((p) => p.id === r.json.seatId);
  const oldToken = seat.sessionToken;
  const ok = await post('/api/room/rejoin', { code: r.json.code.toLowerCase(), seatId: r.json.seatId });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.json.success, true);
  assert.ok(ok.json.token && ok.json.token !== oldToken, 'a fresh token, so the old device is displaced');
  assert.strictEqual(seat.sessionToken, ok.json.token);
  const bot = room.players.find((p) => p.isBot);
  for (const body of [{}, { code: 'ZZZZ', seatId: r.json.seatId }, { code: r.json.code, seatId: 'nope' }, { code: r.json.code, seatId: bot.id }]) {
    const no = await post('/api/room/rejoin', body);
    assert.deepStrictEqual([no.status, no.json], [200, { success: false }], JSON.stringify(body));
  }
});

test('POST /api/tutorial/ack advances the rule queue in a tutorial room only', async () => {
  const t = await post('/api/room/new', { mode: 'solo', name: 'Learner', bots: 1, learning: true, tutorial: true });
  const room = rooms.get(t.json.code);
  const start = room.tutorialRuleIndex;
  const ack = await post('/api/tutorial/ack', { code: t.json.code, seat: t.json.seatId });
  assert.deepStrictEqual([ack.status, ack.json], [200, { tutorialRuleIndex: start + 1 }]);
  assert.strictEqual(room.tutorialPaused, false);
  const bot = room.players.find((p) => p.isBot);
  assert.strictEqual((await post('/api/tutorial/ack', { code: t.json.code, seat: bot.id })).status, 403);
  assert.strictEqual((await post('/api/tutorial/ack', { code: 'ZZZZ', seat: t.json.seatId })).status, 404);
  const plain = await post('/api/room/new', { mode: 'solo', name: 'Plain', bots: 1 });
  const notTut = await post('/api/tutorial/ack', { code: plain.json.code, seat: plain.json.seatId });
  assert.deepStrictEqual([notTut.status, notTut.json.error], [400, 'not a tutorial room']);
});
