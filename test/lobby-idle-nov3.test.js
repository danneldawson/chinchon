'use strict';

// Nov 3, 2026 (Dannel): "an idle user in the lobby for more than 30 min can be
// removed". Idle = no input (enter, chat, or a tap/key reported with the lobby
// poll as act=1), even with the lobby tab still open. A player seated in a
// running match is never removed. A removed tab is told so and goes back to
// the start screen rather than silently re-entering.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { createServer, rooms, _internals } = require('../server');

const { sweepLobby, lobbyRef } = _internals;
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
const enter = async (name) => (await api('POST', '/api/lobby/enter', { name })).json;
const untouched = (token, ms) => { const m = lobbyRef.members.get(token); m.lastSeen = Date.now(); m.lastActive = Date.now() - ms; };

test.before(async () => {
  rooms.clear();
  lobbyRef.members.clear();
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise((r) => server.close(r)));

test('a lobby user with no input for 30 min is removed even with the tab open', async () => {
  const a = await enter('IdleAna');
  untouched(a.token, 29 * MIN);
  await api('GET', `/api/lobby/state?token=${a.token}`); // plain poll: not input
  assert.strictEqual(sweepLobby(Date.now()), 0, 'kept at 29 min');
  untouched(a.token, 31 * MIN);
  assert.strictEqual(sweepLobby(Date.now()), 1, 'removed after 30 min');
  const st = (await api('GET', `/api/lobby/state?token=${a.token}`)).json;
  assert.strictEqual(st.removed, 'idle', 'that tab is told it was removed');
  assert.ok(!st.members.some((m) => m.name === 'IdleAna'));
});

test('a tap (act=1) or a chat line keeps a lobby user', async () => {
  const b = await enter('BusyBea');
  untouched(b.token, 31 * MIN);
  await api('GET', `/api/lobby/state?token=${b.token}&act=1`);
  assert.strictEqual(sweepLobby(Date.now()), 0);
  untouched(b.token, 31 * MIN);
  await api('POST', '/api/lobby/chat', { token: b.token, text: 'hola' });
  assert.strictEqual(sweepLobby(Date.now()), 0);
  lobbyRef.members.delete(b.token);
});

test('a player seated in a running match is never removed from the lobby', async () => {
  const h = await enter('SeatHost');
  const g = await enter('SeatGuest');
  const host = (await api('POST', '/api/room/new', { mode: 'multi', name: h.name, visibility: 'private', bots: 0, lobbyToken: h.token })).json;
  await api('POST', '/api/room/join', { code: host.code, name: g.name, lobbyToken: g.token });
  assert.strictEqual((await api('POST', '/api/room/start', { code: host.code, seat: host.seatId })).status, 200);
  const room = rooms.get(host.code);
  assert.ok(room.players.some((p) => p.lobbyToken === g.token), 'seat carries the lobby token');
  // Two hours into the match, the lobby has not heard from either of them.
  untouched(h.token, 120 * MIN);
  untouched(g.token, 120 * MIN);
  room.players.forEach((p) => { p.lastActive = Date.now() - 20 * MIN; });
  assert.strictEqual(sweepLobby(Date.now()), 0, 'nobody in a running match is kicked');
  // Nov 8, 2026: an abandoned running table (no input from anyone for 30+
  // min) no longer shields the names forever.
  // Once the match is over, recent input at the table still counts.
  room.match.gameOver = true;
  room.players.forEach((p) => { p.lastActive = Date.now() - 5 * MIN; });
  assert.strictEqual(sweepLobby(Date.now()), 0);
  room.players.forEach((p) => { p.lastActive = Date.now() - 31 * MIN; });
  assert.strictEqual(sweepLobby(Date.now()), 2, 'idle again after the match: removed');
});

test('re-entering clears the idle flag; the client goes back to the start screen', async () => {
  const c = await enter('BackCarl');
  untouched(c.token, 31 * MIN);
  sweepLobby(Date.now());
  assert.ok(lobbyRef.idleRemoved.has(c.token));
  const APP = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(APP, /if \(res\.removed === 'idle'\) \{ backToLanding\(t\('idleRemoved'\)\); return; \}/);
  assert.match(APP, /lobby\/state\?token=\$\{state\.lobbyToken\}\$\{actQ\('lobby'\)\}/);
  const selfHeal = APP.indexOf('// Self-heal:');
  assert.ok(APP.indexOf("res.removed === 'idle'") < selfHeal, 'checked before the self-heal re-enter');
});
