'use strict';

// Nov 3, 2026 (Dannel):
//   - In close mode the 8th card sits in line with the hand (no arrow, no gap,
//     no dashed slot) and is selectable like the rest.
//   - Selected cards are noticeably bigger and lifted, with a clearer outline.
//   - Game over shows the winner and final scores as a panel OVER the table;
//     the last round's melds stay on the felt, the chat stays usable, and each
//     player picks Play again or Leave.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const APP = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const { createServer, rooms } = require('../server');

test('game-over panel sits inside the table, no full-screen backdrop, with labelled buttons', () => {
  assert.match(APP, /tableEl\.appendChild\(go\)/);
  assert.match(CSS, /#table > #gameover \{[^}]*position: absolute; inset: 0;[^}]*background: none;[^}]*pointer-events: none;/);
  assert.match(CSS, /#table > #gameover \.go-card \{[^}]*pointer-events: auto;/);
  // Chat bubble and panel stay above it (z-index 60 > 40).
  assert.match(CSS, /#chat \{ position: fixed; z-index: 60;/);
  // The buttons were blank since Sep (labels removed in 9929e29).
  assert.match(HTML, /id="btn-rematch" class="primary" data-i18n="playAgain">Play again</);
  assert.match(HTML, /id="btn-tolobby" class="small" data-i18n="leave">Leave</);
  assert.match(APP, /playAgain: 'Jugar otra vez'/);
  assert.match(APP, /\$\('btn-rematch'\)\.textContent = t\('playAgain'\);/);
  assert.match(APP, /\$\('btn-tolobby'\)\.textContent = t\('leave'\);/);
});

let server; let base;
const api = (method, p, body) => fetch(base + p, {
  method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
}).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
const state = (code, seat) => api('GET', `/api/state?code=${code}&seat=${seat}`).then((r) => r.json);
test.before(async () => {
  process.env.CHINCHON_TEST_HOOKS = '1';
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { delete process.env.CHINCHON_TEST_HOOKS; if (server) server.close(); });

test('HTTP: at game over the last round\'s melds come back as finalTable', async () => {
  const { json: a } = await api('POST', '/api/room/new', { mode: 'multi', name: 'Dan' });
  const { json: b } = await api('POST', '/api/room/join', { code: a.code, name: 'Ana' });
  await api('POST', '/api/room/start', { code: a.code, seat: a.seatId });
  const code = a.code;
  let me; let other;
  for (const s of [a.seatId, b.seatId]) {
    const v = await state(code, s);
    if (v.isYourTurn && v.phase === 'draw') { me = s; other = s === a.seatId ? b.seatId : a.seatId; }
  }
  await api('POST', '/api/draw', { code, seat: me, from: 'stock' });
  const room = rooms.get(code);
  const otherSeat = room.players.find((p) => p.id === other).seat;
  room.match.players[otherSeat].total = 99; // any points knock Ana out
  const hand = ['5-Copas-0', '6-Copas-0', '7-Copas-0', '11-Oros-0', '11-Espadas-0', '11-Bastos-0', '2-Bastos-0', '12-Espadas-0'];
  await api('POST', '/api/test/rig', { code, seat: me, cardIds: hand });
  await api('POST', '/api/test/rig', { code, seat: other, cardIds: ['10-Oros-0', '12-Bastos-0', '10-Copas-0', '3-Espadas-0', '7-Bastos-0', '2-Oros-0', '5-Espadas-0'] });
  const melds = [['5-Copas-0', '6-Copas-0', '7-Copas-0'], ['11-Oros-0', '11-Espadas-0', '11-Bastos-0']];
  assert.strictEqual((await api('POST', '/api/discard', { code, seat: me, cardId: '12-Espadas-0', close: true, melds })).status, 200);
  const done = await api('POST', '/api/layoff/ready', { code, seat: other });
  assert.strictEqual(done.status, 200);
  const v = await state(code, other);
  assert.strictEqual(v.gameOver, true);
  assert.ok(v.finalTable, 'finalTable present');
  assert.deepStrictEqual(v.finalTable.table.map((m) => m.map((c) => c.id).sort()), melds.map((m) => m.slice().sort()));
  assert.ok(Array.isArray(v.yourHand) && v.yourHand.length > 0, 'the last hand stays');
});
