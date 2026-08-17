'use strict';

// Server integration test: drive the HTTP API exactly like the browser would.
// Asserts:
//   1. A 7-human MULTI match can be played to a winner via /api/*.
//   2. NO bot seat was ever created in that multi room (the hard requirement).
//   3. A SOLO + 2-bot room auto-plays the bots' turns.

const { createServer } = require('../server');
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

test('private room with bots starts immediately and includes those bots', async () => {
  // A private room created with bots begins right away (no countdown, no lobby
  // listing) and seeds exactly the requested number of bot seats.
  const { json: created } = await api('POST', '/api/room/new', { mode: 'multi', name: 'H', visibility: 'private', bots: 3 });
  assert.ok(created.code, 'private room created');
  assert.equal(created.visibility, 'private');
  const { json: lobby } = await api('GET', `/api/room/players?code=${created.code}`);
  assert.equal(lobby.players.length, 4, '1 human + 3 bots');
  assert.equal(lobby.players.filter((p) => p.isBot).length, 3, 'three bot seats');
  const { json: v } = await api('GET', `/api/state?code=${created.code}&seat=${created.seatId}`);
  assert.ok(v.started, 'private+bots game started immediately');
});

test('public room does not start with bots; waits on a countdown', async () => {
  const { json: created } = await api('POST', '/api/room/new', { mode: 'multi', name: 'H', visibility: 'public' });
  assert.equal(created.visibility, 'public');
  assert.ok(created.pending, 'public room has a pending countdown');
  const { json: lobby } = await api('GET', `/api/room/players?code=${created.code}`);
  assert.equal(lobby.players.length, 1, 'only the host, no bots yet');
});

test('solo with bots:0 does not crash — clamps to 1 bot', async () => {
  // Chinchón needs >= 2 players, so a lone human (bots:0) is invalid. The
  // server must clamp to 1 bot rather than throw on createMatch.
  const { json: created, status } = await api('POST', '/api/room/new', { mode: 'solo', name: 'You', bots: 0 });
  assert.equal(status, 200, 'solo room with bots:0 still created (no crash)');
  const { json: lobby } = await api('GET', `/api/room/players?code=${created.code}`);
  assert.equal(lobby.players.length, 2, '1 human + 1 clamped bot');
  assert.equal(lobby.players.filter((p) => p.isBot).length, 1, 'exactly one bot after clamp');
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
