'use strict';

// GET /api/activity: the deploy-safety signal. Counts every room whose game has
// started or whose countdown is running and that has a human seen in the last
// 60s, whatever its visibility (public, private, solo). Anonymous by design.

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { createServer, rooms, _internals } = require('../server');

let server;
let base;
function api(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const url = new URL(base + p);
    const req = http.request({ method, hostname: url.hostname, port: url.port, path: url.pathname,
      headers: data ? { 'Content-Type': 'application/json' } : {} }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve({ status: res.statusCode, json: buf ? JSON.parse(buf) : {}, raw: buf }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
test.before(async () => { server = createServer(); await new Promise((r) => server.listen(0, r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => new Promise((r) => server.close(r)));

test('idle server reports nothing active', async () => {
  rooms.clear();
  const a = await api('GET', '/api/activity');
  assert.strictEqual(a.status, 200);
  assert.strictEqual(a.json.activeRooms, 0);
  assert.strictEqual(a.json.activeHumans, 0);
  assert.deepStrictEqual(a.json.rooms, []);
});

test('solo, private (countdown and started) and public rooms all count, without leaking secrets', async () => {
  rooms.clear();
  const solo = await api('POST', '/api/room/new', { mode: 'solo', name: 'Solo' });
  const privPend = await api('POST', '/api/room/new', { mode: 'multi', name: 'PrivHost', visibility: 'private', bots: 0 });
  const privLive = await api('POST', '/api/room/new', { mode: 'multi', name: 'PrivLive', visibility: 'private', bots: 0 });
  await api('POST', '/api/room/join', { code: privLive.json.code, name: 'Guest' });
  await api('POST', '/api/room/start', { code: privLive.json.code, seat: privLive.json.seatId });
  const pub = await api('POST', '/api/room/new', { mode: 'multi', name: 'PubHost', visibility: 'public', bots: 0 });

  // /api/lobby/state `matches` hides private rooms in countdown: that gap is why this endpoint exists.
  const lob = await api('GET', '/api/lobby/state');
  assert.ok(!lob.json.matches.some((m) => m.code === privPend.json.code));

  const a = await api('GET', '/api/activity');
  assert.strictEqual(a.json.activeRooms, 4);
  assert.strictEqual(a.json.activeHumans, 5); // solo 1 + private pending 1 + private live 2 + public 1
  const phases = a.json.rooms.map((r) => `${r.mode}/${r.visibility}/${r.phase}`).sort();
  assert.deepStrictEqual(phases, ['multi/private/countdown', 'multi/private/draw', 'multi/public/countdown', 'solo/private/draw'].sort());
  // Public room codes are already public; private codes, seat ids, tokens, names and cards never appear.
  assert.ok(a.json.rooms.some((r) => r.code === pub.json.code));
  for (const secret of [solo.json.code, privPend.json.code, privLive.json.code, solo.json.seatId, privLive.json.seatId, 'Guest', 'PrivHost', 'sessionToken', 'hand']) {
    assert.ok(!a.raw.includes(secret), `activity leaks ${secret}`);
  }
});

test('rooms whose humans have gone quiet (>60s) or finished-and-abandoned are not active', async () => {
  rooms.clear();
  const solo = await api('POST', '/api/room/new', { mode: 'solo', name: 'Gone' });
  const room = rooms.get(solo.json.code);
  room.players.forEach((p) => { if (!p.isBot) p.lastSeen = Date.now() - 61000; });
  assert.strictEqual(_internals.activitySummary().activeRooms, 0);
  // Back again: active.
  room.players.forEach((p) => { if (!p.isBot) p.lastSeen = Date.now(); });
  assert.strictEqual(_internals.activitySummary().activeRooms, 1);
  // Read-only: asking does not touch anyone's lastSeen.
  room.players.forEach((p) => { if (!p.isBot) p.lastSeen = 12345; });
  await api('GET', '/api/activity');
  assert.ok(room.players.filter((p) => !p.isBot).every((p) => p.lastSeen === 12345));
});
