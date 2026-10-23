'use strict';

// Stale-room cleanup (Dannel, Oct 22, 2026): abandoned rooms, rooms created
// but never started, finished games and players who walked away from a room
// must be cleared instead of lingering in memory and in CHINCHON_STATE_FILE.
// The sweeper takes `now` and the timing constants as arguments, so these
// tests age rooms instead of sleeping.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { createServer, rooms, _internals } = require('../server');

const { CLEANUP, sweepRooms, runCleanup, activitySummary, loadRooms } = _internals;
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

function age(room, ms, filter = () => true) {
  room.players.forEach((p) => { if (!p.isBot && filter(p)) p.lastSeen = Date.now() - ms; });
}

async function heldMultiRoom(names) {
  const host = (await api('POST', '/api/room/new', { mode: 'multi', name: names[0], visibility: 'private', bots: 0 })).json;
  const guests = [];
  for (const n of names.slice(1)) guests.push((await api('POST', '/api/room/join', { code: host.code, name: n })).json);
  const room = rooms.get(host.code);
  room.pending.hold = true; // keep it waiting (no countdown start) for the test
  return { host, guests, room };
}

async function startedMultiRoom() {
  const host = (await api('POST', '/api/room/new', { mode: 'multi', name: 'HostM', visibility: 'private', bots: 0 })).json;
  const guest = (await api('POST', '/api/room/join', { code: host.code, name: 'GuestM' })).json;
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

test('timings are named constants', () => {
  assert.strictEqual(CLEANUP.SWEEP_INTERVAL_MS, 1 * MIN);
  assert.strictEqual(CLEANUP.WAITING_SEAT_IDLE_MS, 10 * MIN);
  assert.strictEqual(CLEANUP.ROOM_IDLE_MS, 15 * MIN);
  assert.strictEqual(CLEANUP.FINISHED_TTL_MS, 15 * MIN);
  assert.strictEqual(CLEANUP.GAME_IDLE_MS, 15 * MIN);
  assert.strictEqual(CLEANUP.SOLO_IDLE_MS, 30 * MIN);
  assert.strictEqual(CLEANUP.LOBBY_IDLE_MS, 30 * MIN);
});

test('waiting room: a player who walked away loses the seat; the others stay', async () => {
  const { host, guests, room } = await heldMultiRoom(['HostA', 'GoneA', 'StayA']);
  age(room, 11 * MIN, (p) => p.name === 'GoneA');
  const r = sweepRooms(Date.now());
  assert.strictEqual(r.seats, 1);
  assert.ok(rooms.has(host.code), 'room kept');
  assert.deepStrictEqual(room.players.map((p) => p.name), ['HostA', 'StayA']);
  assert.deepStrictEqual(room.players.map((p) => p.seat), [0, 1], 'seats renumbered');
  assert.strictEqual(room.hostId, host.seatId, 'host unchanged');
  assert.ok(!room.players.some((p) => p.id === guests[0].seatId));
});

test('waiting room: host who walked away hands the room to the next player', async () => {
  const { host, guests, room } = await heldMultiRoom(['HostB', 'NextB']);
  age(room, 11 * MIN, (p) => p.name === 'HostB');
  sweepRooms(Date.now());
  assert.ok(rooms.has(host.code));
  assert.strictEqual(room.hostId, guests[0].seatId, 'next player is host');
});

test('waiting room: a short absence (switching apps to share the link) keeps the seat', async () => {
  const { host, room } = await heldMultiRoom(['HostC', 'BriefC']);
  age(room, 9 * MIN, (p) => p.name === 'BriefC');
  const r = sweepRooms(Date.now());
  assert.strictEqual(r.seats, 0);
  assert.strictEqual(rooms.get(host.code).players.length, 2);
});

test('waiting room never started, everyone gone: the room is removed', async () => {
  const { host, room } = await heldMultiRoom(['HostD', 'GuestD']);
  age(room, 16 * MIN);
  const r = sweepRooms(Date.now());
  assert.ok(!rooms.has(host.code));
  assert.ok(r.rooms.includes(host.code));
});

test('finished game: kept while players read the scores, removed 15 min after game over', async () => {
  const { host, room } = await startedMultiRoom();
  room.match.gameOver = true;
  room.state.phase = 'over';
  // A poll stamps the game-over time.
  await api('GET', `/api/state?code=${host.code}&seat=${host.seatId}`);
  assert.ok(room.gameOverAt, 'game-over time stamped');
  sweepRooms(room.gameOverAt + 14 * MIN);
  assert.ok(rooms.has(host.code), 'kept within 15 min');
  // Tabs still open on the results screen do not keep it alive past the TTL.
  room.players.forEach((p) => { p.lastSeen = room.gameOverAt + 15 * MIN; });
  sweepRooms(room.gameOverAt + 15 * MIN);
  assert.ok(!rooms.has(host.code), 'removed at 15 min');
});

test('finished game with a rematch countdown running is kept while players are there', async () => {
  const { host, room } = await startedMultiRoom();
  room.match.gameOver = true;
  room.state.phase = 'over';
  const r = await api('POST', '/api/room/rematch', { code: host.code, seat: host.seatId });
  assert.strictEqual(r.status, 200);
  room.pending.hold = true;
  room.gameOverAt = Date.now() - 20 * MIN;
  sweepRooms(Date.now());
  assert.ok(rooms.has(host.code), 'rematch room with present players kept');
  age(room, 16 * MIN);
  sweepRooms(Date.now());
  assert.ok(!rooms.has(host.code), 'abandoned rematch room removed');
});

test('a new match clears the game-over time', async () => {
  const { host, room } = await startedMultiRoom();
  room.gameOverAt = Date.now() - 20 * MIN; // stale stamp, match is live
  sweepRooms(Date.now());
  assert.ok(rooms.has(host.code), 'live match never removed by the finished rule');
  assert.strictEqual(room.gameOverAt, null);
});

test('multiplayer game in progress: kept while anyone polls, removed after 15 min with nobody', async () => {
  const { host, room } = await startedMultiRoom();
  age(room, 16 * MIN, (p) => p.name === 'GuestM');
  sweepRooms(Date.now());
  assert.ok(rooms.has(host.code), 'one human present keeps the match');
  age(room, 14 * MIN);
  sweepRooms(Date.now());
  assert.ok(rooms.has(host.code), '14 min idle kept');
  age(room, 15 * MIN);
  sweepRooms(Date.now());
  assert.ok(!rooms.has(host.code), 'abandoned match removed');
});

test('solo and tutorial games: removed after 30 min idle, kept before', async () => {
  const solo = (await api('POST', '/api/room/new', { mode: 'solo', name: 'SoloE', bots: 2 })).json;
  const tut = (await api('POST', '/api/room/new', { mode: 'solo', name: 'TutE', bots: 2, tutorial: true })).json;
  assert.ok(rooms.get(tut.code).tutorial, 'tutorial room');
  for (const c of [solo.code, tut.code]) age(rooms.get(c), 29 * MIN);
  sweepRooms(Date.now());
  assert.ok(rooms.has(solo.code) && rooms.has(tut.code), 'kept at 29 min');
  for (const c of [solo.code, tut.code]) age(rooms.get(c), 31 * MIN);
  sweepRooms(Date.now());
  assert.ok(!rooms.has(solo.code) && !rooms.has(tut.code), 'removed at 31 min');
});

test('timings are injectable', async () => {
  const solo = (await api('POST', '/api/room/new', { mode: 'solo', name: 'SoloF', bots: 2 })).json;
  age(rooms.get(solo.code), 2 * MIN);
  sweepRooms(Date.now(), { SOLO_IDLE_MS: 1 * MIN });
  assert.ok(!rooms.has(solo.code));
});

test('a room a human is in right now is never removed', async () => {
  const solo = (await api('POST', '/api/room/new', { mode: 'solo', name: 'LiveG', bots: 2 })).json;
  const { host } = await startedMultiRoom();
  const held = await heldMultiRoom(['HostG', 'GuestG']);
  const r = sweepRooms(Date.now());
  for (const c of [solo.code, host.code, held.host.code]) assert.ok(rooms.has(c), `${c} kept`);
  assert.ok(!r.rooms.includes(solo.code));
  // The match still plays after a sweep.
  const v = await api('GET', `/api/state?code=${solo.code}&seat=${solo.seatId}`);
  assert.strictEqual(v.status, 200);
  assert.ok(Array.isArray(v.json.yourHand) && v.json.yourHand.length > 0);
});

test('cleanup writes the state file, so removed rooms do not come back after a restart', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chinchon-clean-')), 'rooms.json');
  rooms.clear();
  const stale = (await api('POST', '/api/room/new', { mode: 'solo', name: 'StaleH', bots: 2 })).json;
  const live = (await api('POST', '/api/room/new', { mode: 'solo', name: 'LiveH', bots: 2 })).json;
  _internals.saveRooms(file);
  assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).rooms.length, 2);
  age(rooms.get(stale.code), 31 * MIN);
  const r = runCleanup(Date.now(), {}, file);
  assert.deepStrictEqual(r.rooms, [stale.code]);
  assert.strictEqual(r.saved, true);
  const codes = JSON.parse(fs.readFileSync(file, 'utf8')).rooms.map((x) => x.code);
  assert.deepStrictEqual(codes, [live.code], 'file no longer has the stale room');
  // Restart: only the live room is restored.
  rooms.clear();
  assert.strictEqual(loadRooms(file), 1);
  assert.ok(rooms.has(live.code) && !rooms.has(stale.code));
});

test('a stale room already in the state file is removed at boot', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chinchon-boot-')), 'rooms.json');
  rooms.clear();
  const old = (await api('POST', '/api/room/new', { mode: 'solo', name: 'OldI', bots: 2 })).json;
  age(rooms.get(old.code), 40 * MIN);
  _internals.saveRooms(file);
  rooms.clear();
  assert.strictEqual(loadRooms(file), 1, 'restored from file');
  const r = runCleanup(Date.now(), {}, file); // what the server does right after loadRooms
  assert.ok(r.rooms.includes(old.code));
  assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).rooms.length, 0);
});

test('nothing to clean: the state file is not rewritten', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chinchon-noop-')), 'rooms.json');
  rooms.clear();
  _internals.lobbyRef.members.clear();
  await api('POST', '/api/room/new', { mode: 'solo', name: 'FreshJ', bots: 2 });
  const r = runCleanup(Date.now(), {}, file);
  assert.strictEqual(r.saved, false);
  assert.ok(!fs.existsSync(file));
});

test('activity stops listing a finished room once it is cleaned up', async () => {
  rooms.clear();
  const { host, room } = await startedMultiRoom();
  room.match.gameOver = true;
  room.state.phase = 'over';
  sweepRooms(Date.now());
  assert.strictEqual(activitySummary().activeRooms, 1, 'results screen still counts as active');
  sweepRooms(room.gameOverAt + CLEANUP.FINISHED_TTL_MS);
  assert.ok(!rooms.has(host.code));
  assert.strictEqual(activitySummary().activeRooms, 0);
});
