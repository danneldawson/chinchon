'use strict';

// The lobby idle clock is lastActive only. A poll refreshes lastSeen and
// nothing else. A missing lastActive is idle. A live table shields a name
// only for the seat that actually played, and an idle-removed token cannot
// mint a new lobby member.

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
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

function reset() { rooms.clear(); lobbyRef.members.clear(); lobbyRef.idleRemoved.clear(); lobbyRef.chat = []; }

test.before(async () => {
  reset();
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise((r) => server.close(r)));

test('a seat is born with lastActive, and the first poll does not move it', async () => {
  reset();
  const host = (await api('POST', '/api/room/new', { mode: 'multi', name: 'Born', visibility: 'private', bots: 0 })).json;
  const room = rooms.get(host.code);
  const p = room.players[0];
  assert.strictEqual(typeof p.lastActive, 'number');
  const stamped = p.lastActive;
  await new Promise((r) => setTimeout(r, 5));
  await api('GET', `/api/state?code=${host.code}&seat=${host.seatId}`);
  assert.strictEqual(p.lastActive, stamped, 'a poll without act=1 is not input');
  assert.ok(p.lastSeen > stamped, 'the poll still counts as a connection');
  const guest = (await api('POST', '/api/room/join', { code: host.code, name: 'BornG' })).json;
  const g = room.players.find((pl) => pl.id === guest.seatId);
  assert.strictEqual(typeof g.lastActive, 'number');
});

test('a missing lastActive is idle even when the tab is polling', () => {
  reset();
  const now = Date.now();
  lobbyRef.members.set('bare', { token: 'bare', name: 'Bare', at: now, lastSeen: now, lobbyCode: '111' });
  assert.strictEqual(sweepLobby(now), 1);
  assert.ok(lobbyRef.idleRemoved.has('bare'));
  assert.ok(!lobbyRef.members.has('bare'));
});

test('an idle player at a live table is removed; the player who is playing stays', () => {
  reset();
  const now = Date.now();
  lobbyRef.members.set('play', { token: 'play', name: 'Playing', at: now - 2 * 60 * MIN, lastSeen: now, lastActive: now - 2 * 60 * MIN, lobbyCode: '1' });
  lobbyRef.members.set('idle', { token: 'idle', name: 'Idle', at: now - 2 * 60 * MIN, lastSeen: now, lastActive: now - 2 * 60 * MIN, lobbyCode: '2' });
  rooms.set('TBL', {
    code: 'TBL', mode: 'multi', started: true, gone: false,
    match: { gameOver: false, round: 1, players: [] },
    players: [
      { id: 'p', isBot: false, lobbyToken: 'play', lastSeen: now, lastActive: now - 2 * MIN },
      { id: 'i', isBot: false, lobbyToken: 'idle', lastSeen: now, lastActive: now - 40 * MIN },
    ],
  });
  assert.strictEqual(sweepLobby(now), 1);
  assert.ok(lobbyRef.members.has('play'), 'the active seat stays listed');
  assert.ok(!lobbyRef.members.has('idle'), 'the idle seat is dropped from the lobby');
  assert.ok(lobbyRef.idleRemoved.has('idle'));
  rooms.delete('TBL');
});

test('enter refuses a token that was idle-removed and does not mint a member', async () => {
  reset();
  const now = Date.now();
  lobbyRef.members.set('old', { token: 'old', name: 'OldTab', at: now - 40 * MIN, lastSeen: now, lastActive: now - 40 * MIN, lobbyCode: '9' });
  assert.strictEqual(sweepLobby(now), 1);
  const before = lobbyRef.members.size;
  const again = await api('POST', '/api/lobby/enter', { name: 'OldTab', token: 'old' });
  assert.strictEqual(again.status, 403);
  assert.strictEqual(again.json.removed, 'idle');
  assert.strictEqual(lobbyRef.members.size, before);
  assert.ok(![...lobbyRef.members.values()].some((m) => m.name === 'OldTab'));
  const fresh = await api('POST', '/api/lobby/enter', { name: 'OldTab' });
  assert.strictEqual(fresh.status, 200, 'typing the name again, with no removed token, still enters');
  assert.ok(fresh.json.token && fresh.json.token !== 'old');
});

test('the self-heal posts the old token, and the idle-removed list is documented as persisted', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(app, /\/api\/lobby\/enter', \{ name: state\.lobbyName, token: state\.lobbyToken \}/);
  assert.match(app, /if \(r2 && r2\.removed === 'idle'\)/);
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const comment = src.slice(src.indexOf('idleRemoved: new Map()') - 400, src.indexOf('idleRemoved: new Map()'));
  assert.match(comment, /Persisted with the lobby/);
  assert.ok(!/not persisted/.test(comment));
});
