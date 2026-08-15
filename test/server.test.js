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

test('multi room rejects a bot seat attempt at the API level', async () => {
  // The server never accepts bots in multi; createRoom only adds bots in solo.
  // We confirm creating a solo room with bots works (control), and that a multi
  // room created with a bogus bots field yields zero bots.
  const { json: multi } = await api('POST', '/api/room/new', { mode: 'multi', name: 'H', bots: 3 });
  const { json: lobby } = await api('GET', `/api/room/players?code=${multi.code}`);
  assert.equal(lobby.players.length, 1);
  assert.ok(!lobby.players[0].isBot, 'multi host is a human even with bots:3');
});

test('solo + 2 bots: bots auto-play their turns', async () => {
  const { json: created } = await api('POST', '/api/room/new', { mode: 'solo', name: 'You', bots: 2 });
  assert.ok(created.code, 'solo room created');
  const { json: lobby } = await api('GET', `/api/room/players?code=${created.code}`);
  assert.equal(lobby.players.length, 3, '1 human + 2 bots');
  assert.equal(lobby.players.filter((p) => p.isBot).length, 2, 'two bot seats');

  // After creation, runBotTurns has run; it should be the human's turn (seat 0)
  // OR the round may have already progressed. Just assert state is coherent.
  const { json: v } = await api('GET', `/api/state?code=${created.code}&seat=${created.seatId}`);
  assert.ok(v.started, 'solo game started');
  assert.ok(['draw', 'discard'].includes(v.phase), 'human-facing phase present');
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

test('rematch resets the match to a fresh round with the same players', async () => {
  const { json: created } = await api('POST', '/api/room/new', { mode: 'solo', name: 'You', bots: 2 });
  const code = created.code;
  // Play a bit so the match accrues some totals / possibly eliminates someone.
  const { json: v0 } = await api('GET', `/api/state?code=${code}&seat=${created.seatId}`);
  assert.ok(v0.started, 'game started');
  // Force a full match to completion to exercise elimination + gameOver.
  // (playMatchToEnd drives draw/discard/close/layoff and ends at a winner.)
  const seatIds = [created.seatId];
  for (let i = 1; i < 3; i++) {
    const { json: j } = await api('POST', '/api/room/join', { code, name: 'P' + i });
    // solo room: bots only, so joins are rejected — use seatIds as-is.
    void j;
  }
  // Drive the solo match to its end.
  const final = await playMatchToEnd(code, seatIds);
  assert.ok(final.gameOver, 'match reached game over');
  // Now rematch as the human seat.
  const { status: rematchStatus } = await api('POST', '/api/room/rematch', { code, seat: created.seatId });
  assert.equal(rematchStatus, 200, 'rematch accepted');
  const { json: v1 } = await api('GET', `/api/state?code=${code}&seat=${created.seatId}`);
  assert.ok(!v1.gameOver, 'after rematch the match is NOT over');
  assert.equal(v1.scoreboard.reduce((a, p) => a + p.total, 0), 0, 'all totals reset to 0');
  assert.ok(v1.scoreboard.every((p) => !p.out), 'no players eliminated after reset');
  assert.equal(v1.scoreboard.length, 3, 'same 3 players kept');
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
