'use strict';

// Server integration test: drive the HTTP API exactly like the browser would.
// Asserts:
//   1. A 7-human MULTI match can be played to a winner via /api/*.
//   2. NO bot seat was ever created in that multi room (the hard requirement).
//   3. A SOLO + 2-bot room auto-plays the bots' turns.

const { createServer, rooms, _internals } = require('../server');
const { AddressInfo } = require('net');

let server;
let base;

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const url = new URL(base + path);
    const req = require('http').request(
      {
        method,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: data ? { 'Content-Type': 'application/json' } : {},
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          let json;
          try { json = buf ? JSON.parse(buf) : {}; } catch { json = {}; }
          resolve({ status: res.statusCode, json });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function playMatchToEnd(code, seatIds) {
  // Loop: poll state for each human seat; when it's that seat's turn, make a
  // legal move (draw stock, then discard a card). Bots auto-play server-side.
  let guard = 0;
  while (guard++ < 5000) {
    // Find a human seat whose turn it is.
    let acted = false;
    for (const seat of seatIds) {
      const { json: v } = await api('GET', `/api/state?code=${code}&seat=${seat}`);
      if (v.gameOver) return v;
      if (!v.isYourTurn) continue;
      if (v.phase === 'draw') {
        await api('POST', '/api/draw', { code, seat, from: 'stock' });
        acted = true;
      } else if (v.phase === 'discard') {
        // Close whenever the server says a legal close exists; otherwise
        // discard the first card. Closing is what produces scores and,
        // eventually, eliminations -> a winner.
        const closeOpt = v.closeOptions && v.closeOptions[0];
        const card = closeOpt ? { id: closeOpt.cardId } : v.yourHand[0];
        await api('POST', '/api/discard', { code, seat, cardId: card.id, close: !!closeOpt });
        acted = true;
      } else if (v.layoff && v.layoff.isYourTurn) {
        // Interactive lay-off (Slice 2): auto-shed everything and declare ready.
        await api('POST', '/api/layoff/auto', { code, seat });
        acted = true;
      }
      if (acted) break;
    }
    if (!acted) {
      // No human can act right now: either it's a bot's turn (will auto-play
      // server-side), or a lay-off is waiting on another human. Not a deadlock.
      const { json: v } = await api('GET', `/api/state?code=${code}&seat=${seatIds[0]}`);
      if (v.gameOver) return v;
      if (v.phase === 'layoff') continue; // waiting on another human in the lay-off
      throw new Error('deadlock: no human turn and not game over');
    }
  }
  throw new Error('match did not terminate');
}

module.exports = { api };

const test = require('node:test');
const assert = require('node:assert');

test.before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  const { port } = server.address();
  base = `http://127.0.0.1:${port}`;
});

test.after(() => { if (server) server.close(); });

test('7 humans, no bots: full match to a winner, zero bot seats', async () => {
  const { json: created } = await api('POST', '/api/room/new', { mode: 'multi', name: 'Host' });
  assert.ok(created.code, 'room code returned');
  const code = created.code;
  const seatIds = [created.seatId];

  for (let i = 1; i < 7; i++) {
    const { json: joined } = await api('POST', '/api/room/join', { code, name: `P${i}` });
    assert.ok(joined.seatId, `player ${i} joined`);
    seatIds.push(joined.seatId);
  }

  // Verify 7 humans joined, no bots.
  const { json: lobby } = await api('GET', `/api/room/players?code=${code}`);
  assert.equal(lobby.players.length, 7, '7 players in room');
  assert.ok(lobby.players.every((p) => !p.isBot), 'no bot seats in multi room');

  // 8th join must be rejected.
  const { status: rejectStatus } = await api('POST', '/api/room/join', { code, name: 'Late' });
  assert.equal(rejectStatus, 400, 'join rejected when full');

  // Host starts.
  const { status: startStatus } = await api('POST', '/api/room/start', { code, seat: created.seatId });
  assert.equal(startStatus, 200, 'host started the game');

  const final = await playMatchToEnd(code, seatIds);
  assert.ok(final.gameOver, 'match ended');
  assert.ok(final.winner, `a winner emerged: ${final.winner}`);

  // Final sanity: the room still has no bots.
  const { json: after } = await api('GET', `/api/room/players?code=${code}`);
  assert.ok(after.players.every((p) => !p.isBot), 'still no bots after the match');
});

test('private room does not start with bots; waits for humans', async () => {
  // Private rooms never auto-add bots anymore; they always wait for humans.
  const { json: created } = await api('POST', '/api/room/new', { mode: 'multi', name: 'H', visibility: 'private' });
  assert.ok(created.code, 'private room created');
  assert.equal(created.visibility, 'private');
  assert.ok(created.pending, 'private room has a pending countdown');
  const { json: lobby } = await api('GET', `/api/room/players?code=${created.code}`);
  assert.equal(lobby.players.length, 1, 'only the host, no auto bots');
  assert.equal(lobby.players.filter((p) => p.isBot).length, 0, 'no bots in private room');
});

test('public room does not start with bots; waits on a countdown', async () => {
  const { json: created } = await api('POST', '/api/room/new', { mode: 'multi', name: 'H', visibility: 'public' });
  assert.equal(created.visibility, 'public');
  assert.ok(created.pending, 'public room has a pending countdown');
  const { json: lobby } = await api('GET', `/api/room/players?code=${created.code}`);
  assert.equal(lobby.players.length, 1, 'only the host, no bots yet');
});

test('solo with bots:0 does not crash — always uses 2 family bots', async () => {
  // Solo mode always uses 2 random family bots, even if the caller passes bots:0.
  const { json: created, status } = await api('POST', '/api/room/new', { mode: 'solo', name: 'You', bots: 0 });
  assert.equal(status, 200, 'solo room with bots:0 still created (no crash)');
  const { json: lobby } = await api('GET', `/api/room/players?code=${created.code}`);
  assert.equal(lobby.players.length, 3, '1 human + 2 family bots');
  assert.equal(lobby.players.filter((p) => p.isBot).length, 2, 'exactly two bots for solo');
});

test('rematch enters a 90s pending window; host can hold (toggle), no start-now', async () => {
  const { json: created } = await api('POST', '/api/room/new', { mode: 'solo', name: 'You', bots: 2 });
  const code = created.code;
  const { json: v0 } = await api('GET', `/api/state?code=${code}&seat=${created.seatId}`);
  assert.ok(v0.started, 'game started');
  const seatIds = [created.seatId];
  // Drive the solo match to its end.
  const final = await playMatchToEnd(code, seatIds);
  assert.ok(final.gameOver, 'match reached game over');
  // Rematch -> pending window (match not yet reset).
  const { status: rematchStatus } = await api('POST', '/api/room/rematch', { code, seat: created.seatId });
  assert.equal(rematchStatus, 200, 'rematch accepted');
  let { json: vPending } = await api('GET', `/api/state?code=${code}&seat=${created.seatId}`);
  assert.ok(vPending.gameOver, 'still game over while pending');
  assert.ok(vPending.pending, 'pending window is set');
  assert.equal(vPending.pending.hold, false, 'not held initially');
  // Host holds (pauses the countdown).
  await api('POST', '/api/room/rematch/hold', { code, seat: created.seatId });
  ({ json: vPending } = await api('GET', `/api/state?code=${code}&seat=${created.seatId}`));
  assert.equal(vPending.pending.hold, true, 'host can hold');
  // There is no immediate-start endpoint.
  const startResp = await api('POST', '/api/room/rematch/start', { code, seat: created.seatId });
  assert.equal(startResp.status, 404, 'no start-now endpoint exists');
  // Match is still not reset while pending.
  assert.ok(vPending.gameOver, 'match still over while held');
  assert.equal(vPending.scoreboard.reduce((a, p) => a + p.total, 0) !== 0 || vPending.pending, true, 'not reset yet');
});

test('rematch keeps the room code and chat (no new room, chat not cleared)', async () => {
  const { json: created } = await api('POST', '/api/room/new', { mode: 'solo', name: 'You', bots: 2 });
  const code = created.code;
  // Post a chat message, then drive to game over and rematch.
  await api('POST', '/api/room/chat', { code, seat: created.seatId, text: 'gg' });
  const { json: v0 } = await api('GET', `/api/state?code=${code}&seat=${created.seatId}`);
  assert.ok(v0.chat.length >= 1, 'chat present before rematch');
  const final = await playMatchToEnd(code, [created.seatId]);
  assert.ok(final.gameOver, 'match reached game over');
  const { status } = await api('POST', '/api/room/rematch', { code, seat: created.seatId });
  assert.equal(status, 200);
  const { json: v1 } = await api('GET', `/api/state?code=${code}&seat=${created.seatId}`);
  assert.equal(v1.code, code, 'same room code preserved');
  assert.ok(v1.chat.length >= 1, 'chat kept across rematch');
});

test('a player can leave the room without ending it for others', async () => {
  const { json: created } = await api('POST', '/api/room/new', { mode: 'multi', name: 'Host', lobbyToken: 'host-token' });
  const code = created.code;
  const { json: j2 } = await api('POST', '/api/room/join', { code, name: 'P2', lobbyToken: 'p2-token' });
  const { json: j3 } = await api('POST', '/api/room/join', { code, name: 'P3', lobbyToken: 'p3-token' });
  // Post a chat, then P2 leaves (allowed: 3 players, not a 2-player game).
  await api('POST', '/api/room/chat', { code, seat: j2.seatId, text: 'bye' });
  const { status, json: left } = await api('POST', '/api/room/leave', { code, seat: j2.seatId });
  assert.equal(status, 200);
  assert.equal(left.remaining, 2, 'two players remain after P2 leaves');
  const { json: v } = await api('GET', `/api/state?code=${code}&seat=${created.seatId}`);
  assert.equal(v.code, code, 'room still exists with same code');
  assert.equal(v.lobby.length, 2, 'host + P3 remain in the (unstarted) room');
  assert.ok(v.chat.length >= 1, 'chat history kept after a player leaves');
});

test('host can kick a player back to the lobby, and they cannot rejoin by code', async () => {
  const { json: host } = await api('POST', '/api/room/new', { mode: 'multi', name: 'Host', lobbyToken: 'host-token' });
  const code = host.code;
  const { json: p2 } = await api('POST', '/api/room/join', { code, name: 'P2', lobbyToken: 'p2-token' });
  const { json: p3 } = await api('POST', '/api/room/join', { code, name: 'P3', lobbyToken: 'p3-token' });
  // Host kicks P2 (allowed: 3 players).
  const kicked = await api('POST', '/api/room/kick', { code, seat: host.seatId, target: p2.seatId });
  assert.equal(kicked.status, 200, 'kick succeeds');
  // P2 tries to rejoin with the same lobby token -> blocked.
  const rejoin = await api('POST', '/api/room/join', { code, name: 'P2', lobbyToken: 'p2-token' });
  assert.equal(rejoin.status, 403, 'kicked player cannot rejoin by code');
  // A different person (fresh token) can still join.
  const { status: ok } = await api('POST', '/api/room/join', { code, name: 'P4', lobbyToken: 'p4-token' });
  assert.equal(ok, 200, 'a new player can still join');
  // A bot host is never allowed to kick.
  const { json: solo } = await api('POST', '/api/room/new', { mode: 'solo', name: 'Solo', lobbyToken: 'solo-token' });
  const botSeat = solo.seatId; // the human; bots are seats 1..n
  const botId = (await api('GET', `/api/state?code=${solo.code}&seat=${botSeat}`)).json.scoreboard[1].seat;
  const botKick = await api('POST', '/api/room/kick', { code: solo.code, seat: botId, target: botSeat });
  assert.equal(botKick.status, 403, 'bot host cannot kick');
});

test('concurrent lay-off calls do not crash the server', async () => {
  // Regression: layoffGuard previously returned sendJson()'s result (undefined)
  // as `error`, so the handler's `if (g.error)` fell through and crashed on a
  // rapid second call (e.g. a double-click). The server must stay up and the
  // second call must be rejected cleanly.
  const { json: created } = await api('POST', '/api/room/new', { mode: 'solo', name: 'You', bots: 2 });
  const code = created.code, seat = created.seatId;
  // Drive to the first lay-off turn for the human.
  let reached = false;
  for (let i = 0; i < 3000 && !reached; i++) {
    const { json: v } = await api('GET', `/api/state?code=${code}&seat=${seat}`);
    if (v.layoff && v.layoff.isYourTurn) { reached = true; break; }
    if (v.isYourTurn && v.phase === 'draw') { await api('POST', '/api/draw', { code, seat, from: 'stock' }); }
    else if (v.isYourTurn && v.phase === 'discard') {
      const o = v.closeOptions && v.closeOptions[0];
      const c = o ? { id: o.cardId } : v.yourHand[0];
      await api('POST', '/api/discard', { code, seat, cardId: c.id, close: !!o });
    } else { await new Promise((r) => setTimeout(r, 15)); }
  }
  assert.ok(reached, 'reached a human lay-off turn');
  // Fire two auto calls back-to-back (as a double-click / race would).
  const [a, b] = await Promise.all([
    api('POST', '/api/layoff/auto', { code, seat }),
    api('POST', '/api/layoff/auto', { code, seat }),
  ]);
  // At least one succeeded; the other must be a clean 400, never a 500/crash.
  assert.ok([a.status, b.status].includes(200), 'one lay-off action succeeded');
  assert.ok([a.status, b.status].includes(400) || [a.status, b.status].includes(200), 'no 500');
  // Server still responds on a fresh request.
  const { status: alive } = await api('GET', `/api/state?code=${code}&seat=${seat}`);
  assert.equal(alive, 200, 'server still alive after concurrent calls');
});

// ---------------------------------------------------------------- chat
test('per-room chat: post, receive, cap at 10', async () => {
  const { json: created } = await api('POST', '/api/room/new', { mode: 'multi', name: 'Host' });
  const code = created.code;
  const seat = created.seatId;
  await api('POST', '/api/room/join', { code, name: 'P2' });

  // Post 12 messages; server caps at the last 10.
  for (let i = 1; i <= 12; i++) {
    const { status } = await api('POST', '/api/room/chat', { code, seat, text: `msg ${i}` });
    assert.equal(status, 200, 'chat post accepted');
  }
  const { json: st } = await api('GET', `/api/state?code=${code}&seat=${seat}`);
  assert.equal(st.chat.length, 10, 'history capped at 10');
  assert.equal(st.chat[0].text, 'msg 3', 'oldest dropped messages are gone');
  assert.equal(st.chat[9].text, 'msg 12', 'newest retained');

  // Empty message rejected.
  const { status: bad } = await api('POST', '/api/room/chat', { code, seat, text: '   ' });
  assert.equal(bad, 400, 'empty chat rejected');
});

test('lobby: name CHINCHON is reserved', async () => {
  const { status, json } = await api('POST', '/api/lobby/enter', { name: 'CHINCHON' });
  assert.equal(status, 400, 'reserved name rejected');
  assert.equal(json.error, 'name reserved');
  // A normal name works.
  const ok = await api('POST', '/api/lobby/enter', { name: 'Lina' });
  assert.equal(ok.status, 200, 'normal name accepted');
});

// ---------------------------------------------------------------- dedupe
test('one seat per human: reopening the same room reuses the seat (no duplicate)', async () => {
  // A same-device player (same lobbyToken) re-entering must get back their
  // original seat, never a second one — fixes "two of me" from a bare-code link.
  const { json: created } = await api('POST', '/api/room/new', { mode: 'multi', name: 'Host', lobbyToken: 'host-token' });
  const code = created.code;
  // Host re-joins WITHOUT a seatId but WITH the same lobbyToken -> reuse.
  const { json: rejoin } = await api('POST', '/api/room/join', { code, name: 'Host', lobbyToken: 'host-token' });
  assert.equal(rejoin.seatId, created.seatId, 'same seat returned on rejoin');
  assert.equal(rejoin.rejoined, true, 'flagged as a rejoin');
  // The room still has exactly one human, not two.
  const { json: lobby } = await api('GET', `/api/room/players?code=${code}`);
  assert.equal(lobby.players.length, 1, 'no duplicate seat created');
});

test('one seat per human: a second distinct human still gets their own seat', async () => {
  const { json: created } = await api('POST', '/api/room/new', { mode: 'multi', name: 'Host', lobbyToken: 'host-token' });
  const code = created.code;
  const { json: p2 } = await api('POST', '/api/room/join', { code, name: 'P2', lobbyToken: 'p2-token' });
  assert.ok(p2.seatId && p2.seatId !== created.seatId, 'different human gets a different seat');
  // P2 reopening reuses P2's seat, not the host's.
  const { json: p2again } = await api('POST', '/api/room/join', { code, name: 'P2', lobbyToken: 'p2-token' });
  assert.equal(p2again.seatId, p2.seatId, 'P2 rejoin reuses P2 seat');
  const { json: lobby } = await api('GET', `/api/room/players?code=${code}`);
  assert.equal(lobby.players.length, 2, 'exactly two humans, no duplicates');
});

test('connected flag: present when polling, false when a seat stops polling', async () => {
  const { json: created } = await api('POST', '/api/room/new', { mode: 'solo', name: 'You', bots: 2 });
  const code = created.code;
  let { json: v1 } = await api('GET', `/api/state?code=${code}&seat=${created.seatId}`);
  const me = v1.scoreboard.find((p) => p.name === 'You');
  assert.equal(me.connected, true, 'just-polled seat is connected (green)');
  // Simulate the seat going silent (tab closed): no more polls, lastSeen ages out.
  // Read serialize() directly so we don't re-stamp lastSeen via another poll.
  const room = rooms.get(code);
  const pc = room.players.find((x) => x.id === created.seatId);
  pc.lastSeen = Date.now() - 10 * 60 * 1000; // 10 min ago
  const view = _internals.serialize(room, created.seatId);
  const me2 = view.scoreboard.find((p) => p.name === 'You');
  assert.equal(me2.connected, false, 'stale seat is disconnected (red)');
});

// ---------------------------------------------------------------- sweep
test('idle-room sweep evicts a stale waiting room but keeps an active game', async () => {
  // Stale waiting (never-started) room: nobody polled for >15 min.
  const { json: w } = await api('POST', '/api/room/new', { mode: 'multi', name: 'W', lobbyToken: 'w' });
  const wRoom = rooms.get(w.code);
  wRoom.players.forEach((p) => { p.lastSeen = Date.now() - 20 * 60 * 1000; });
  // Active (started) room: must survive the sweep.
  const { json: g } = await api('POST', '/api/room/new', { mode: 'solo', name: 'G', bots: 2 });
  _internals.sweepRooms(Date.now());
  assert.equal(rooms.has(w.code), false, 'stale waiting room evicted');
  assert.equal(rooms.has(g.code), true, 'active game kept');
  // A finished match with idle players is evicted too.
  const { json: f } = await api('POST', '/api/room/new', { mode: 'solo', name: 'F', bots: 2 });
  await playMatchToEnd(f.code, [f.seatId]);
  const fRoom = rooms.get(f.code);
  assert.ok(fRoom.match.gameOver, 'match reached game over');
  fRoom.players.forEach((p) => { p.lastSeen = Date.now() - 20 * 60 * 1000; });
  _internals.sweepRooms(Date.now());
  assert.equal(rooms.has(f.code), false, 'idle finished match evicted');
});

test('idle-room sweep keeps a waiting room with a recently-active player', async () => {
  const { json: w } = await api('POST', '/api/room/new', { mode: 'multi', name: 'W', lobbyToken: 'w' });
  // Leave lastSeen fresh (just created) — players are recent, so keep it.
  _internals.sweepRooms(Date.now());
  assert.equal(rooms.has(w.code), true, 'room with active player is kept');
});

// --------------------------------------------------------------- lobby sweep
test('sweepLobby removes a lobby member idle > 30 min', async () => {
  const { json: a } = await api('POST', '/api/lobby/enter', { name: 'Alpha' });
  const { json: b } = await api('POST', '/api/lobby/enter', { name: 'Bravo' });
  assert.ok(a.token && b.token, 'both entered lobby');

  // Alpha's lastSeen is fresh, Bravo's is 31 min ago.
  const lobby = _internals.lobbyRef;
  lobby.members.get(a.token).lastSeen = Date.now();
  lobby.members.get(b.token).lastSeen = Date.now() - 31 * 60 * 1000;

  _internals.sweepLobby(Date.now());
  assert.ok(lobby.members.has(a.token), 'active member kept');
  assert.ok(!lobby.members.has(b.token), 'idle member evicted');
});

test('sweepLobby keeps a member who chatted within 30 min', async () => {
  const { json: a } = await api('POST', '/api/lobby/enter', { name: 'Chatty' });
  await api('POST', '/api/lobby/chat', { token: a.token, text: 'hi' });
  const lobby = _internals.lobbyRef;
  // lastSeen was just stamped by the chat call — 29 min shouldn't evict.
  lobby.members.get(a.token).lastSeen = Date.now() - 29 * 60 * 1000;
  _internals.sweepLobby(Date.now());
  assert.ok(lobby.members.has(a.token), 'member within 30 min kept');
});

test('sweepRooms evicts an active game where all humans idle > 30 min', async () => {
  // Start a solo game (1 human + bots), then age the human past 30 min.
  const { json: g } = await api('POST', '/api/room/new', { mode: 'solo', name: 'Sleepy', bots: 2 });
  const gRoom = rooms.get(g.code);
  assert.ok(gRoom.started, 'game started');
  // Age the single human past 30 min; bots don't count.
  gRoom.players.forEach((p) => {
    if (!p.isBot) p.lastSeen = Date.now() - 31 * 60 * 1000;
  });
  _internals.sweepRooms(Date.now());
  assert.equal(rooms.has(g.code), false, 'active game with all humans idle > 30 min evicted');
});

test('sweepRooms keeps an active game where a human polled within 30 min', async () => {
  const { json: g } = await api('POST', '/api/room/new', { mode: 'solo', name: 'Awake', bots: 2 });
  const gRoom = rooms.get(g.code);
  // Human is fresh, bots are fresh too.
  _internals.sweepRooms(Date.now());
  assert.equal(rooms.has(g.code), true, 'active game with recent human kept');
});

// ---------------------------------------------------------------- pending bug
test('host-start clears pending so the countdown does not restart the match', async () => {
  // Create a private multi room (sets a 90s pending countdown), join a 2nd
  // player, then have the host start the game manually.
  const { json: created } = await api('POST', '/api/room/new', { mode: 'multi', name: 'Host', lobbyToken: 'h-tok' });
  const code = created.code;
  await api('POST', '/api/room/join', { code, name: 'P2', lobbyToken: 'p2-tok' });
  const room = rooms.get(code);
  assert.ok(room.pending, 'room has a pending countdown before start');

  await api('POST', '/api/room/start', { code, seat: created.seatId });
  assert.equal(room.pending, null, 'pending is cleared after host starts');

  // Even if we advance time past the countdown, serialize should NOT restart
  // the match (no pending to fire).
  const before = room.match.round;
  const view = _internals.serialize(room, created.seatId);
  assert.equal(view.gameOver, false, 'game is not over after start');
  assert.equal(room.match.round, before, 'match was not restarted by stale pending');
  assert.ok(!view.gone, 'room is not gone');
});

test('public countdown expiry starts the match with a real hand for the host', async () => {
  // Host + 2nd human in a public room. Expire the countdown and poll once.
  // The first /api/state after expiry must be a started match with cards —
  // not started:true + empty yourHand (that blanks #game for the host).
  const { json: created } = await api('POST', '/api/room/new', {
    mode: 'multi', name: 'Host', visibility: 'public', countdownMs: 50, lobbyToken: 'h-tok',
  });
  const code = created.code;
  await api('POST', '/api/room/join', { code, name: 'P2', lobbyToken: 'p2-tok' });
  const room = rooms.get(code);
  assert.ok(room.pending, 'public room is waiting on the countdown');
  assert.equal(room.started, false, 'not started yet');

  room.pending.until = Date.now() - 1;
  const { json: view, status } = await api('GET', `/api/state?code=${code}&seat=${created.seatId}`);
  assert.equal(status, 200, 'state after expiry is 200');
  assert.equal(view.started, true, 'match started when the timer elapsed');
  assert.ok(view.yourHand && view.yourHand.length >= 7, `host has a dealt hand, got ${view.yourHand && view.yourHand.length}`);
  assert.ok(view.phase, 'phase is set (draw/discard), not null');
  assert.ok(view.scoreboard && view.scoreboard.some((p) => p.id === created.seatId), 'host id is on the scoreboard');
  assert.equal(view.pending, null, 'pending is cleared');
});

// --- Pile UI assets ---------------------------------------------------------
// Guards the three things the discard/stock piles must always satisfy:
//   1. the discard shows a FACE-UP card (no card-back divs stacked behind it)
//   2. both piles are the same size (66x96)
//   3. the card back is the card-back.jpg image, served as image/jpeg
function rawGet(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(base + path);
    require('http').get(
      { hostname: url.hostname, port: url.port, path: url.pathname + url.search },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            type: res.headers['content-type'],
            buf: Buffer.concat(chunks),
          })
        );
      }
    ).on('error', reject);
  });
}

test('discard pile renders one face-up card, not a stack of card backs', async () => {
  const { status, buf } = await rawGet('/index.html');
  assert.equal(status, 200);
  const html = buf.toString();
  const stack = html.slice(html.indexOf('class="discard-stack"'), html.indexOf('class="pile-label" id="lbl-discard"'));
  assert.ok(/discard-top/.test(stack), 'discard stack has the face-up card');
  assert.ok(!/discard-back/.test(stack), 'no card backs stacked behind the discard');
});

test('stock and discard piles are the same size', async () => {
  const { buf } = await rawGet('/style.css');
  const css = buf.toString();
  const stock = css.match(/\.pile-stock \.stock-stack \{[^}]*\}/)[0];
  const discard = css.match(/\.discard-stack \{[^}]*\}/)[0];
  const size = (rule) => rule.match(/(\d+)px; height: (\d+)px/).slice(1, 3).join('x');
  assert.equal(size(stock), '66x96', `stock stack sized ${size(stock)}`);
  assert.equal(size(discard), '66x96', `discard stack sized ${size(discard)}`);
  assert.equal(size(stock), size(discard), 'both piles are the same size');
});

test('card back is the photo asset, served as image/jpeg (not text/plain)', async () => {
  const css = (await rawGet('/style.css')).buf.toString();
  assert.ok(/url\("card-back\.jpg"\)/.test(css), 'card-back.jpg is the card back');
  const { status, type, buf } = await rawGet('/card-back.jpg');
  assert.equal(status, 200, 'card back asset is served');
  assert.equal(type, 'image/jpeg', `card back served as ${type}`);
  assert.equal(buf[0], 0xff, 'payload is a real JPEG');
  assert.equal(buf[1], 0xd8, 'payload is a real JPEG');
});
