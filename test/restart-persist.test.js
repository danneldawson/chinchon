'use strict';

// Bug (Oct 4, 2026): "I start a match and it immediately finishes and sends me
// back to the lobby." Rooms live only in server memory. Every push to main
// redeploys Railway, which restarts the process and wipes every room; the
// client's next /api/state poll gets 404 "no such room" and poll() calls
// goToLobby(). Solo and multiplayer are hit the same way.
//
// The fix snapshots live rooms (and lobby members) on shutdown and restores
// them on boot, so a redeploy no longer kills a match in progress.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { createServer, rooms, _internals } = require('../server');

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

// Simulate a process restart: everything held in memory is gone.
function wipeMemory() {
  rooms.clear();
  _internals.lobbyRef.members.clear();
}

test.before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise((r) => server.close(r)));

test('a server restart without a snapshot loses the room (the reported bounce)', async () => {
  const solo = await api('POST', '/api/room/new', { mode: 'solo', name: 'ForgeBug' });
  const before = await api('GET', `/api/state?code=${solo.json.code}&seat=${solo.json.seatId}`);
  assert.strictEqual(before.status, 200);
  wipeMemory();
  const after = await api('GET', `/api/state?code=${solo.json.code}&seat=${solo.json.seatId}`);
  // This 404 is exactly what makes public/app.js poll() call goToLobby().
  assert.strictEqual(after.status, 404);
  assert.strictEqual(after.json.error, 'no such room');
});

test('solo and multiplayer matches survive a restart via saveRooms/loadRooms', async () => {
  assert.strictEqual(typeof _internals.saveRooms, 'function', 'server must export saveRooms');
  assert.strictEqual(typeof _internals.loadRooms, 'function', 'server must export loadRooms');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chinchon-')), 'rooms.json');

  // Solo vs bots.
  const solo = await api('POST', '/api/room/new', { mode: 'solo', name: 'ForgeBug' });
  const soloQ = `/api/state?code=${solo.json.code}&seat=${solo.json.seatId}`;
  const soloBefore = (await api('GET', soloQ)).json;

  // Multiplayer: host + 1 human, started by the host.
  const host = await api('POST', '/api/room/new', { mode: 'multi', name: 'ForgeBug', visibility: 'private', bots: 0 });
  const guest = await api('POST', '/api/room/join', { code: host.json.code, name: 'ForgeBug2' });
  assert.strictEqual((await api('POST', '/api/room/start', { code: host.json.code, seat: host.json.seatId })).status, 200);
  const multiQ = `/api/state?code=${host.json.code}&seat=${guest.json.seatId}`;
  const multiBefore = (await api('GET', multiQ)).json;

  // A pending (not yet started) multi room keeps its countdown.
  const pend = await api('POST', '/api/room/new', { mode: 'multi', name: 'ForgeBug', visibility: 'private', bots: 0 });

  // Lobby membership survives too (otherwise the client re-enters under a new token).
  const member = await api('POST', '/api/lobby/enter', { name: 'ForgeLob' });

  assert.ok(_internals.saveRooms(file));
  wipeMemory();
  assert.strictEqual(_internals.loadRooms(file), 3);

  const soloAfter = await api('GET', soloQ);
  assert.strictEqual(soloAfter.status, 200);
  assert.strictEqual(soloAfter.json.gameOver, false);
  assert.strictEqual(soloAfter.json.phase, soloBefore.phase);
  assert.deepStrictEqual(soloAfter.json.yourHand, soloBefore.yourHand);

  const multiAfter = await api('GET', multiQ);
  assert.strictEqual(multiAfter.status, 200);
  assert.strictEqual(multiAfter.json.gameOver, false);
  assert.strictEqual(multiAfter.json.started, true);
  assert.deepStrictEqual(multiAfter.json.yourHand, multiBefore.yourHand);
  // And play continues: the host can still draw.
  const draw = await api('POST', '/api/draw', { code: host.json.code, seat: host.json.seatId, from: 'stock' });
  assert.ok(!draw.json.error, `draw after restore failed: ${draw.json.error}`);

  const pendAfter = await api('GET', `/api/state?code=${pend.json.code}&seat=${pend.json.seatId}`);
  assert.strictEqual(pendAfter.status, 200);
  assert.strictEqual(pendAfter.json.started, false);
  assert.ok(pendAfter.json.pending && pendAfter.json.pending.secondsLeft > 0);

  const lob = await api('GET', `/api/lobby/state?token=${member.json.token}`);
  assert.ok(lob.json.members.some((m) => m.name === 'ForgeLob'));
});

test('loadRooms tolerates a missing or corrupt snapshot', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chinchon-'));
  assert.strictEqual(_internals.loadRooms(path.join(dir, 'nope.json')), 0);
  fs.writeFileSync(path.join(dir, 'bad.json'), '{not json');
  assert.strictEqual(_internals.loadRooms(path.join(dir, 'bad.json')), 0);
});

// ---- Round-trip fidelity: every value a room holds must be plain JSON. ----
// A Map, Set, Date, function, class instance, undefined or NaN would be lost or
// mangled by JSON.stringify, so a restored room would silently differ.
function assertPlain(v, where) {
  if (v === null) return;
  const t = typeof v;
  if (t === 'string' || t === 'boolean') return;
  if (t === 'number') { assert.ok(Number.isFinite(v), `${where} is ${v}`); return; }
  assert.ok(t === 'object', `${where} is a ${t}`);
  const proto = Object.getPrototypeOf(v);
  assert.ok(proto === Object.prototype || proto === Array.prototype, `${where} is a ${v.constructor && v.constructor.name}`);
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) { assert.ok(i in v, `${where}[${i}] is a hole`); assertPlain(v[i], `${where}[${i}]`); }
    return;
  }
  for (const [k, x] of Object.entries(v)) {
    assert.notStrictEqual(x, undefined, `${where}.${k} is undefined`);
    assertPlain(x, `${where}.${k}`);
  }
}

test('every live room (pending, started, mid-play, lobby) is plain JSON and round-trips exactly', async () => {
  rooms.clear();
  const solo = await api('POST', '/api/room/new', { mode: 'solo', name: 'Plain' });
  // Play a few turns so state has discards, lastDrawn, bot moves, chat, etc.
  for (let i = 0; i < 6; i++) {
    const q = `/api/state?code=${solo.json.code}&seat=${solo.json.seatId}`;
    const v = (await api('GET', q)).json;
    if (v.gameOver || v.phase !== 'draw' || !v.isYourTurn) break;
    await api('POST', '/api/draw', { code: solo.json.code, seat: solo.json.seatId, from: i % 2 ? 'discard' : 'stock' });
    const v2 = (await api('GET', q)).json;
    await api('POST', '/api/discard', { code: solo.json.code, seat: solo.json.seatId, cardId: v2.yourHand[0].id });
  }
  await api('POST', '/api/room/chat', { code: solo.json.code, seat: solo.json.seatId, text: 'hola' });
  const host = await api('POST', '/api/room/new', { mode: 'multi', name: 'PlainHost', visibility: 'private', bots: 0 });
  await api('POST', '/api/room/start', { code: host.json.code, seat: host.json.seatId }); // host alone: bots fill in
  await api('POST', '/api/room/new', { mode: 'multi', name: 'PlainPend', visibility: 'public', bots: 0 });
  const m = await api('POST', '/api/lobby/enter', { name: 'PlainLob' });
  await api('POST', '/api/lobby/chat', { token: m.json.token, text: 'hi all' });

  const snap = _internals.snapshot();
  assert.ok(snap.rooms.length >= 3);
  snap.rooms.forEach((r, i) => assertPlain(r, `rooms[${i}](${r.code})`));
  assertPlain(snap.lobby, 'lobby');
  // Exact round trip, field for field (this is what loadRooms will see).
  assert.deepStrictEqual(JSON.parse(JSON.stringify(snap)), snap);

  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chinchon-')), 'rooms.json');
  const originals = snap.rooms.map((r) => JSON.parse(JSON.stringify(r)));
  const lobbyChat = JSON.parse(JSON.stringify(_internals.lobbyRef.chat));
  assert.ok(_internals.saveRooms(file));
  wipeMemory();
  _internals.lobbyRef.chat = [];
  // Load with no downtime (now === savedAt) so the rooms must come back identical.
  const savedAt = JSON.parse(fs.readFileSync(file, 'utf8')).savedAt;
  assert.strictEqual(_internals.loadRooms(file, savedAt), originals.length);
  for (const o of originals) assert.deepStrictEqual(rooms.get(o.code), o, `room ${o.code} differs after restore`);
  assert.deepStrictEqual(_internals.lobbyRef.chat, lobbyChat);
  assert.ok([..._internals.lobbyRef.members.values()].some((x) => x.name === 'PlainLob'));
});

test('restore shifts countdowns and idle timers by the downtime', async () => {
  rooms.clear();
  const pend = await api('POST', '/api/room/new', { mode: 'multi', name: 'Shift', visibility: 'private', bots: 0 });
  const room = rooms.get(pend.json.code);
  const until = room.pending.until;
  const seen = room.players[0].lastSeen;
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chinchon-')), 'rooms.json');
  _internals.saveRooms(file);
  const savedAt = JSON.parse(fs.readFileSync(file, 'utf8')).savedAt;
  wipeMemory();
  _internals.loadRooms(file, savedAt + 120000); // two minutes of downtime
  const back = rooms.get(pend.json.code);
  assert.strictEqual(back.pending.until, until + 120000);
  assert.strictEqual(back.players[0].lastSeen, seen + 120000);
});

test('saveRooms writes atomically and leaves no temp file behind', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chinchon-'));
  const file = path.join(dir, 'sub', 'rooms.json'); // missing parent dir is created
  assert.ok(_internals.saveRooms(file));
  assert.deepStrictEqual(fs.readdirSync(path.dirname(file)), ['rooms.json']);
  assert.ok(Array.isArray(JSON.parse(fs.readFileSync(file, 'utf8')).rooms));
  assert.strictEqual(_internals.saveRooms(null), false); // no file configured: no-op
});

// ---- The real process: periodic/debounced save survives SIGKILL; SIGTERM saves. ----
const { spawn } = require('child_process');
const SERVER = path.join(__dirname, '..', 'server.js');

function bootServer(file, port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER], { env: { ...process.env, PORT: String(port), CHINCHON_STATE_FILE: file }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const onData = (d) => { out += d; if (out.includes('Chinchon server on')) resolve(child); };
    child.stdout.on('data', onData);
    child.stderr.on('data', (d) => { out += d; });
    child.on('exit', (code) => reject(new Error(`server exited ${code}: ${out}`)));
    setTimeout(() => reject(new Error('server did not start: ' + out)), 8000);
  });
}
function exited(child) { return new Promise((r) => child.once('exit', r)); }
function freePort() {
  return new Promise((r) => { const s = http.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
}
async function apiAt(port, method, p, body) {
  const saved = base; base = `http://127.0.0.1:${port}`;
  try { return await api(method, p, body); } finally { base = saved; }
}

test('real server: a match survives SIGKILL (debounced save) and SIGTERM (shutdown save)', { timeout: 30000 }, async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chinchon-')), 'rooms.json');
  const port = await freePort();

  let child = await bootServer(file, port);
  const solo = await apiAt(port, 'POST', '/api/room/new', { mode: 'solo', name: 'KillMe' });
  const q = `/api/state?code=${solo.json.code}&seat=${solo.json.seatId}`;
  const hand = (await apiAt(port, 'GET', q)).json.yourHand;
  await new Promise((r) => setTimeout(r, 2600)); // debounce window (2s) has passed
  const gone = exited(child); child.kill('SIGKILL'); await gone; // crash: no shutdown handler runs

  child = await bootServer(file, port);
  const back = await apiAt(port, 'GET', q);
  assert.strictEqual(back.status, 200, 'room lost after SIGKILL');
  assert.deepStrictEqual(back.json.yourHand, hand);

  // A room created right before a graceful stop is saved by the SIGTERM handler.
  const late = await apiAt(port, 'POST', '/api/room/new', { mode: 'solo', name: 'TermMe' });
  const done = exited(child); child.kill('SIGTERM'); await done;

  child = await bootServer(file, port);
  try {
    assert.strictEqual((await apiAt(port, 'GET', `/api/state?code=${late.json.code}&seat=${late.json.seatId}`)).status, 200, 'room lost after SIGTERM');
    assert.strictEqual((await apiAt(port, 'GET', q)).status, 200);
  } finally {
    const end = exited(child); child.kill('SIGTERM'); await end;
  }
});
