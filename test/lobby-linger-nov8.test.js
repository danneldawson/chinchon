'use strict';
// Nov 8, 2026 (Dannel): old lobby names lingered for days despite the 30-min
// idle sweep. Causes: (1) the idle-removed list was not persisted, so after a
// restart an old tab polling with its removed token self-healed back in as a
// fresh member; (2) a seat in a still-"live" room shielded a lobby name
// forever even with no input at that table.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { rooms, _internals } = require('../server');
const { sweepLobby, runCleanup, lobbyRef, saveRooms, loadRooms } = _internals;
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

function reset() { rooms.clear(); lobbyRef.members.clear(); lobbyRef.idleRemoved.clear(); lobbyRef.chat = []; }
function member(token, name, at) { lobbyRef.members.set(token, { token, name, at, lastSeen: at, lastActive: at, lobbyCode: '123' }); }

test('idle-removed tokens survive a restart, so an old tab is still told "removed"', () => {
  reset();
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'linger-')), 's.json');
  const now = Date.now();
  member('old', 'Dann', now - 2 * DAY);
  assert.strictEqual(sweepLobby(now), 1);
  saveRooms(file);
  reset();
  loadRooms(file, now + 5 * MIN);
  assert.ok(lobbyRef.idleRemoved.has('old'), 'removed token restored');
  assert.ok(!lobbyRef.members.has('old'));
});

test('a seat in a running room with no input for 30 min no longer shields the lobby name', () => {
  reset();
  const now = Date.now();
  member('tok', 'Lorena2', now - 3 * DAY);
  rooms.set('LINE', { code: 'LINE', mode: 'solo', started: true, match: { gameOver: false, round: 0, players: [] },
    players: [{ id: 's', isBot: false, lobbyToken: 'tok', lastSeen: now - 10 * 1000, lastActive: now - 3 * DAY }] });
  assert.strictEqual(sweepLobby(now), 1, 'polling-only seat with stale input does not protect');
});

test('a genuinely playing seat (recent input) still protects the lobby name', () => {
  reset();
  const now = Date.now();
  member('tok', 'Player', now - 2 * 60 * MIN);
  rooms.set('PLAY', { code: 'PLAY', mode: 'solo', started: true, match: { gameOver: false, round: 1, players: [] },
    players: [{ id: 's', isBot: false, lobbyToken: 'tok', lastSeen: now, lastActive: now - 2 * MIN }] });
  assert.strictEqual(sweepLobby(now), 0);
});

test('days idle across restarts: boot cleanup clears stuck solo room and names', () => {
  reset();
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'linger-')), 's.json');
  const t0 = Date.now() - 3 * DAY;
  member('a', 'Dann', t0);
  rooms.set('LINE', { code: 'LINE', mode: 'solo', started: true, startedAt: t0, match: { gameOver: false, round: 0, players: [] },
    players: [{ id: 's', isBot: false, lobbyToken: 'a', lastSeen: t0, lastActive: t0 }, { id: 'b', isBot: true }] });
  fs.writeFileSync(file, JSON.stringify({ version: 1, savedAt: Date.now() - 10 * 1000, rooms: [...rooms.values()], lobby: { members: [...lobbyRef.members.values()], chat: [] } }));
  reset();
  loadRooms(file, Date.now());
  const r = runCleanup(Date.now(), {}, null);
  assert.deepStrictEqual(r.rooms, ['LINE']);
  assert.strictEqual(lobbyRef.members.size, 0);
});
